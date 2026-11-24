// OKINTO / New API pricing. Parse only the documented linear token terms; never evaluate billing expressions.
import { z } from "zod";
import type { RawPricing } from "./pricing";

const Entry = z.object({
  model_name: z.string(), vendor_id: z.number().optional(), quota_type: z.number(),
  model_ratio: z.number().nonnegative(), completion_ratio: z.number().nonnegative(),
  model_price: z.number().optional(), input_price: z.number().nullish(),
  enable_groups: z.array(z.string()), billing_mode: z.string().optional(), billing_expr: z.string().optional(),
}).passthrough();
const Response = z.object({
  success: z.literal(true), pricing_version: z.string(), data: z.array(Entry),
  group_ratio: z.record(z.number().nonnegative()),
  vendors: z.array(z.object({ id: z.number(), name: z.string() }).passthrough()),
}).passthrough();
type Tier = NonNullable<NonNullable<RawPricing["data"][number]["pricing_rules"]>["tiers"]>[number];

function linearTier(value: string): Tier {
  const m = /^tier\(\s*"([^"\n]+)"\s*,\s*([^()]*)\s*\)$/.exec(value.trim());
  if (!m) throw new Error("Unsupported OKINTO pricing tier: " + value);
  const coefficients: Record<string, number> = {};
  for (const term of m[2].split("+")) {
    const part = /^(p|c|cr|cc|cc1h)\s*\*\s*(\d+(?:\.\d+)?|\.\d+)$/.exec(term.trim());
    if (!part || part[1] in coefficients) throw new Error("Unsupported OKINTO token term: " + term);
    coefficients[part[1]] = Number(part[2]);
  }
  if (!("p" in coefficients) || !("c" in coefficients)) throw new Error("Missing input/output token prices");
  return { label: m[1], conditions: null, unit_prices: { input: coefficients.p, output: coefficients.c } };
}

/** Parse a restricted UTC calendar predicate without eval or executing billing code. */
function calendarPredicate(expression: string, now: Date): boolean {
  const tokens: string[] = [];
  const scanner = /\s*(weekday|hour|"UTC"|&&|\|\||>=|<=|==|!=|>|<|\d+|[()])/y;
  let offset = 0;
  while (offset < expression.trimEnd().length) {
    scanner.lastIndex = offset;
    const match = scanner.exec(expression);
    if (!match) throw new Error("Unsupported OKINTO calendar predicate: " + expression);
    tokens.push(match[1]); offset = scanner.lastIndex;
  }
  let i = 0;
  const take = (token: string) => { if (tokens[i++] !== token) throw new Error("Invalid OKINTO calendar predicate"); };
  const atom = (): boolean => {
    if (tokens[i] === "(") { take("("); const value = or(); take(")"); return value; }
    const fn = tokens[i++];
    if (fn !== "weekday" && fn !== "hour") throw new Error("Unsupported OKINTO calendar function");
    take("("); take('"UTC"'); take(")");
    const op = tokens[i++], number = tokens[i++];
    if (!/^\d+$/.test(number ?? "")) throw new Error("Invalid OKINTO calendar comparison");
    const actual = fn === "hour" ? now.getUTCHours() : now.getUTCDay(), expected = Number(number);
    switch (op) {
      case ">=": return actual >= expected; case "<=": return actual <= expected;
      case ">": return actual > expected; case "<": return actual < expected;
      case "==": return actual === expected; case "!=": return actual !== expected;
      default: throw new Error("Unsupported OKINTO calendar operator");
    }
  };
  const and = (): boolean => { let value = atom(); while (tokens[i] === "&&") { take("&&"); const rhs = atom(); value = value && rhs; } return value; };
  const or = (): boolean => { let value = and(); while (tokens[i] === "||") { take("||"); const rhs = and(); value = value || rhs; } return value; };
  const result = or();
  if (i !== tokens.length || !Number.isFinite(now.getTime())) throw new Error("Invalid OKINTO calendar predicate");
  return result;
}

export function expressionTiers(expression: string, now = new Date()): Tier[] {
  const split = (value: string): { predicate: string; yes: string; no: string } | undefined => {
    let depth = 0, quote = false, escaped = false, question = -1, nested = 0;
    for (let i = 0; i < value.length; i++) {
      const ch = value[i];
      if (quote) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') quote = false;
        continue;
      }
      if (ch === '"') { quote = true; continue; }
      if (ch === "(") { depth++; continue; }
      if (ch === ")") { depth--; if (depth < 0) throw new Error("Invalid OKINTO pricing expression"); continue; }
      if (depth !== 0) continue;
      if (ch === "?") {
        if (question < 0) question = i;
        else nested++;
      } else if (ch === ":" && question >= 0) {
        if (nested) nested--;
        else return { predicate: value.slice(0, question).trim(), yes: value.slice(question + 1, i).trim(), no: value.slice(i + 1).trim() };
      }
    }
    if (depth !== 0 || quote || question >= 0) throw new Error("Invalid OKINTO pricing expression");
    return undefined;
  };
  const cap = (tiers: Tier[], maximum: number): Tier[] => {
    if (!tiers.length) throw new Error("Empty OKINTO pricing tier");
    const last = tiers[tiers.length - 1];
    const prior = last.conditions?.find((c) => c.metric === "input_context_tokens" && (c.operator === "<=" || c.operator === "<"))?.value;
    last.conditions = [{ metric: "input_context_tokens", operator: "<=", value: prior == null ? maximum : Math.min(prior, maximum) }];
    return tiers;
  };
  const parse = (value: string): Tier[] => {
    const conditional = split(value);
    if (!conditional) return [linearTier(value)];
    const length = /^len\s*(<=|>=|<|>)\s*(\d+)$/.exec(conditional.predicate);
    if (length) {
      const operator = length[1];
      const boundary = Number(length[2]) - (operator === "<" || operator === ">=" ? 1 : 0);
      const yes = parse(conditional.yes), no = parse(conditional.no);
      if (operator.startsWith("<")) return [...cap(yes, boundary), ...no];
      return [...cap(no, boundary), ...yes];
    }
    // Validate both branches even when the current time chooses only one.
    const yes = parse(conditional.yes), no = parse(conditional.no);
    if (yes.length !== 1 || no.length !== 1) throw new Error("Unsupported OKINTO conditional pricing branches");
    return [calendarPredicate(conditional.predicate, now) ? yes[0] : no[0]];
  };
  return parse(expression.trim());
}

export function normalizeNewApi(input: unknown, now = new Date()): RawPricing {
  const raw = Response.parse(input);
  return {
    pricing_version: raw.pricing_version,
    group_ratio: raw.group_ratio,
    group_definitions: Object.entries(raw.group_ratio).map(([id, ratio]) => ({ id, ratio, default: id === "default", kind: "other" })),
    vendors: raw.vendors,
    data: raw.data.map((entry) => {
      if (entry.quota_type !== 0) return { ...entry, billing_unit: "request" };
      if (entry.billing_mode && entry.billing_mode !== "tiered_expr") throw new Error("Unsupported billing mode for " + entry.model_name);
      const tiers = entry.billing_mode === "tiered_expr" ? expressionTiers(entry.billing_expr ?? "", now) : undefined;
      return {
        ...entry,
        input_price: entry.input_price ?? entry.model_ratio * 2,
        ...(tiers ? { pricing_rules: { tiers } } : {}),
      };
    }),
  };
}
