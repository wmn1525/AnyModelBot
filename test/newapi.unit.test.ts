import { describe, expect, it } from "vitest";
import { fetchKeyBalance, modelflareBaseUrl, modelflareIssuer, verifyModelflareKey } from "../src/providers/modelflare.js";
import { MediaService } from "../src/tools/media/index.js";

const base = "https://api.okinto.com/v1";
function mock(routes: Record<string, unknown>, calls: Array<{ path: string; auth: string | null }> = []) {
  return (async (url: string | URL | Request, options?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    calls.push({ path, auth: new Headers(options?.headers).get("authorization") });
    const body = routes[path];
    return new Response(JSON.stringify(body ?? { error: { message: "not found" } }), { status: body === undefined ? 404 : 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

describe("OKINTO New API gateway", () => {
  it("normalizes the gateway root and derives the matching account/pricing origin", () => {
    expect(modelflareBaseUrl("auto", {})).toBe(base);
    expect(modelflareBaseUrl("cn", {})).toBe(base);
    expect(modelflareBaseUrl("auto", { AMB_NEWAPI_BASE_URL: "https://gateway.example/" })).toBe("https://gateway.example/v1");
    expect(modelflareIssuer({ AMB_NEWAPI_BASE_URL: "https://gateway.example/v1" })).toBe("https://gateway.example");
  });

  it("converts billing usage from cents and keeps API keys out of public status requests", async () => {
    const calls: Array<{ path: string; auth: string | null }> = [];
    const f = mock({
      "/v1/dashboard/billing/subscription": { hard_limit_usd: 50 },
      "/v1/dashboard/billing/usage": { total_usage: 1234 },
      "/api/status": { data: { quota_per_unit: 500000, quota_display_type: "USD" } },
    }, calls);
    expect(await fetchKeyBalance(base, "sk-test", f)).toEqual({ available: 37.66, used: 12.34, unit: "USD", scope: "billing", unlimited: false });
    expect(calls.find((c) => c.path === "/api/status")?.auth).toBeNull();
    expect(calls.find((c) => c.path.endsWith("/usage"))?.auth).toBe("Bearer sk-test");
  });

  it("falls back to raw token quota using the site's actual conversion rate", async () => {
    const f = mock({
      "/api/status": { data: { quota_per_unit: 1000000 } },
      "/api/usage/token": { code: true, data: { total_available: 3000000, total_used: 750000, unlimited_quota: false } },
    });
    expect(await fetchKeyBalance(base, "sk-test", f)).toEqual({ available: 3, used: 0.75, unit: "USD", scope: "token", unlimited: false });
  });

  it("uses the wallet when the token grants access to user_quota", async () => {
    const f = mock({
      "/api/status": { data: { quota_per_unit: 500000 } },
      "/api/usage/token": { data: { total_available: 0, total_used: 0, unlimited_quota: true, user_quota: { total_available: 2000000, total_used: 500000 } } },
    });
    expect(await fetchKeyBalance(base, "sk-test", f)).toMatchObject({ available: 4, used: 1, unlimited: false, scope: "account" });
  });

  it("represents unlimited quota without a fabricated cash balance", async () => {
    for (const routes of [
      { "/v1/dashboard/billing/subscription": { hard_limit_usd: 100000000 }, "/v1/dashboard/billing/usage": { total_usage: 125 } },
      { "/api/usage/token": { data: { total_available: 0, total_used: 625000, unlimited_quota: true } } },
    ]) {
      const f = mock({ "/api/status": { data: { quota_per_unit: 500000 } }, ...routes });
      expect(await fetchKeyBalance(base, "sk-test", f)).toMatchObject({ available: null, used: 1.25, unlimited: true });
    }
  });

  it("rejects a malformed response rather than displaying an incorrect zero balance", async () => {
    const f = mock({ "/api/status": { data: { quota_per_unit: 0 } }, "/api/usage/token": { data: { total_available: "invalid" } } });
    await expect(fetchKeyBalance(base, "sk-test", f)).rejects.toThrow();
  });

  it("uses authorized models and catalog endpoint types to exclude media-only models from chat", async () => {
    const f = mock({
      "/v1/models": { data: [{ id: "chat-model" }, { id: "image-model" }] },
      "/api/pricing": { data: [{ model_name: "image-model", supported_endpoint_types: ["image-generation"] }] },
    });
    expect(await verifyModelflareKey(base, "sk-test", { fetchImpl: f })).toEqual({ ok: true, models: ["chat-model", "image-model"], chatModels: ["chat-model"] });
    const media = new MediaService({ baseUrl: () => base, keyFor: () => "sk-test", headers: () => ({}), workspace: () => ".", pricingUrl: () => "https://api.okinto.com/api/pricing", fetchImpl: f });
    expect((await media.available("sk-test", "image")).map((m) => m.id)).toEqual(["image-model"]);
    expect(await media.available("sk-test", "video")).toEqual([]);
    expect(await media.docs("image-model")).toContain("/v1/images/generations");
  });

  it("prepares image generation with gpt-image-2.5 automatically when no image model is specified", async () => {
    const f = mock({
      "/v1/models": { data: [{ id: "other-image" }, { id: "gpt-image-2.5" }] },
      "/api/pricing": { data: [
        { model_name: "other-image", supported_endpoint_types: ["image-generation"], display_priority: 0 },
        { model_name: "gpt-image-2.5", supported_endpoint_types: ["image-generation"], display_priority: 10 },
      ] },
    });
    const media = new MediaService({ baseUrl: () => base, keyFor: () => "sk-test", headers: () => ({}), workspace: () => ".", pricingUrl: () => "https://api.okinto.com/api/pricing", fetchImpl: f });
    expect((await media.prepare("bot", "image", { prompt: "a tree" })).model.id).toBe("gpt-image-2.5");
    expect((await media.prepare("bot", "image", { prompt: "a tree", model: "other-image" })).model.id).toBe("other-image");
  });
});
