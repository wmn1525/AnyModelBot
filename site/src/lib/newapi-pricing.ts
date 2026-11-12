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
  const m = /^len\s*(<=|>=|<|>)\s*(\d+)\s*\?\s*(tier\([^?]+\))\s*:\s*(tier\([^?]+\))$/.exec(expression.trim());
  if (!m) {
    const calendar = /^(.*?)\?\s*(tier\([^?]+\))\s*:\s*(tier\([^?]+\))$/.exec(expression.trim());
    if (!calendar) return [linearTier(expression)];
    // Validate both branches even when the current time chooses only one.
    const yes = linearTier(calendar[2]), no = linearTier(calendar[3]);
    return [calendarPredicate(calendar[1], now) ? yes : no];
  }
  const first = linearTier(m[3]), second = linearTier(m[4]);
  const [short, long] = m[1].startsWith("<") ? [first, second] : [second, first];
  const threshold = Number(m[2]) - (m[1] === "<" || m[1] === ">=" ? 1 : 0);
  short.conditions = [{ metric: "input_context_tokens", operator: "<=", value: threshold }];
  return [short, long];
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
