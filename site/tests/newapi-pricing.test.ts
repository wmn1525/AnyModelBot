import { describe, expect, it } from "vitest";
import { expressionTiers, normalizeNewApi } from "../src/lib/newapi-pricing";
import { buildSnapshot } from "../src/lib/snapshot";
import { estimate } from "../src/lib/calc";

const raw = {
  success: true, pricing_version: "okinto-test", group_ratio: { default: 1, vip: 0.9 }, vendors: [{ id: 1, name: "OpenAI" }],
  data: [
    { model_name: "gpt-test", vendor_id: 1, quota_type: 0, model_ratio: 37.5, completion_ratio: 6, enable_groups: ["vip", "default"], billing_mode: "tiered_expr", billing_expr: 'len > 272000 ? tier("long", p*10 + c*45 + cr*1 + cc*12.5) : tier("standard", p*5 + c*30 + cr*0.5 + cc*6.25)' },
    { model_name: "flat-test", vendor_id: 1, quota_type: 0, model_ratio: 1, completion_ratio: 5, enable_groups: ["default"] },
    { model_name: "image-test", vendor_id: 1, quota_type: 1, model_ratio: 0, completion_ratio: 0, model_price: 0.1, enable_groups: ["default"] },
  ],
};

describe("OKINTO pricing", () => {
  it("uses expression rates instead of the placeholder ratio and prefers the default group", () => {
    const snap = buildSnapshot(raw, { featuredModels: ["gpt-test"], sampleModel: "gpt-test", sampleUsage: { days: 30, msgs: 50, inTok: 3000, outTok: 600 } }, new Date("2026-11-05T00:00:00Z"));
    expect(snap.source).toBe("https://api.okinto.com/api/pricing");
    expect(snap.counts).toEqual({ models: 3, text: 2, media: 1, vendors: 1 });
    const row = snap.rows[0];
    expect([row.input, row.output, row.defaultGroup]).toEqual([5, 30, "default"]);
    expect(snap.rows[1].input).toBe(2);
    const usage = { group: "default", msgs: 1, inTok: 272000, outTok: 1000 };
    expect(estimate(row, usage, 1).monthly).toBeCloseTo(1.39);
    expect(estimate(row, { ...usage, inTok: 272001 }, 1).monthly).toBeCloseTo(2.76501);
  });
  it.each([[">=", 199999], [">", 200000], ["<=", 200000], ["<", 199999]])("handles the %s boundary", (operator, max) => {
    const short = 'tier("short", p*2 + cr*0.1 + c*6)', long = 'tier("long", p*4 + c*12)';
    const parts = operator.toString().startsWith("<") ? [short, long] : [long, short];
    expect(expressionTiers('len ' + operator + ' 200000 ? ' + parts[0] + ' : ' + parts[1])[0].conditions?.[0].value).toBe(max);
  });
  it("refuses unknown expressions and failed API responses instead of displaying a guessed price", () => {
    expect(() => expressionTiers('tier("x", p*5 + c*30 + unknown*4)')).toThrow();
    expect(() => expressionTiers('globalThis.process.exit()')).toThrow();
    expect(() => normalizeNewApi({ ...raw, success: false })).toThrow();
  });
});
