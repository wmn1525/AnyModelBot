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
    const part = /^(p|c|cr|cc)\s*\*\s*(\d+(?:\.\d+)?|\.\d+)$/.exec(term.trim());
    if (!part || part[1] in coefficients) throw new Error("Unsupported OKINTO token term: " + term);
    coefficients[part[1]] = Number(part[2]);
  }
  if (!("p" in coefficients) || !("c" in coefficients)) throw new Error("Missing input/output token prices");
  return { label: m[1], conditions: null, unit_prices: { input: coefficients.p, output: coefficients.c } };
}

export function expressionTiers(expression: string): Tier[] {
  const m = /^len\s*(<=|>=|<|>)\s*(\d+)\s*\?\s*(tier\([^?]+\))\s*:\s*(tier\([^?]+\))$/.exec(expression.trim());
  if (!m) return [linearTier(expression)];
  const first = linearTier(m[3]), second = linearTier(m[4]);
  const [short, long] = m[1].startsWith("<") ? [first, second] : [second, first];
  const threshold = Number(m[2]) - (m[1] === "<" || m[1] === ">=" ? 1 : 0);
  short.conditions = [{ metric: "input_context_tokens", operator: "<=", value: threshold }];
  return [short, long];
}

export function normalizeNewApi(input: unknown): RawPricing {
  const raw = Response.parse(input);
  return {
    pricing_version: raw.pricing_version,
    group_ratio: raw.group_ratio,
    group_definitions: Object.entries(raw.group_ratio).map(([id, ratio]) => ({ id, ratio, default: id === "default", kind: "other" })),
    vendors: raw.vendors,
    data: raw.data.map((entry) => {
      if (entry.quota_type !== 0) return { ...entry, billing_unit: "request" };
      if (entry.billing_mode && entry.billing_mode !== "tiered_expr") throw new Error("Unsupported billing mode for " + entry.model_name);
      const tiers = entry.billing_mode === "tiered_expr" ? expressionTiers(entry.billing_expr ?? "") : undefined;
      return {
        ...entry,
        input_price: entry.input_price ?? entry.model_ratio * 2,
        ...(tiers ? { pricing_rules: { tiers } } : {}),
      };
    }),
  };
}
