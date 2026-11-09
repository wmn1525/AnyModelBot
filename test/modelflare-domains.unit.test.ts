import { afterEach, describe, expect, it, vi } from "vitest";
import { testModelflareDomains } from "../src/providers/modelflare-domains.js";
import { modelflareBaseUrl, normalizeLine, verifyModelflareKey } from "../src/providers/modelflare.js";

afterEach(() => vi.useRealTimers());

const bases = { global: "https://main.test/v1", cn: "https://origin.test/v1", cf: "https://cf.test/v1" };

describe("Modelflare domain measurement", () => {
  it("preserves historical domain choices and accepts cf and origin", () => {
    expect(modelflareBaseUrl(normalizeLine("auto"), {})).toBe("https://api.okinto.com/v1");
    expect(modelflareBaseUrl(normalizeLine("global"), {})).toBe("https://api.okinto.com/v1");
    expect(modelflareBaseUrl(normalizeLine("cn"), {})).toBe("https://api.okinto.com/v1");
    expect(modelflareBaseUrl(normalizeLine("origin"), {})).toBe("https://api.okinto.com/v1");
    expect(modelflareBaseUrl(normalizeLine("cf"), {})).toBe("https://api.okinto.com/v1");
    expect(normalizeLine("https://other.invalid")).toBe("auto");
  });

  it("probes all three fixed domains equally without credentials, redirects or model calls", async () => {
    const request = vi.fn(async () => new Response("{}", { status: 401 }));
    const results = await testModelflareDomains({ bases, fetchImpl: request });
    expect(results.map((r) => r.domain)).toEqual(["main.test", "origin.test", "cf.test"]);
    expect(request).toHaveBeenCalledTimes(9);
    for (const domain of results) {
      expect(domain.samples).toHaveLength(3);
      expect(domain.samples.every((s) => s.status === 401 && s.latencyMs !== null)).toBe(true);
    }
    for (const [url, init] of request.mock.calls as unknown as [string, RequestInit][]) {
      expect(["https://main.test/v1/models", "https://origin.test/v1/models", "https://cf.test/v1/models"]).toContain(url);
      expect(init).toMatchObject({ method: "GET", redirect: "manual", credentials: "omit", cache: "no-store" });
      expect(new Headers(init.headers).has("authorization")).toBe(false);
      expect(init.body).toBeUndefined();
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("reports medians independently, so one slow sample does not dominate", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const delays = { main: [30, 100, 50], origin: [80, 20, 40], cf: [20, 10, 30] };
    const request: typeof fetch = async (url) => {
      const delay = delays[String(url).includes("origin.") ? "origin" : String(url).includes("cf.") ? "cf" : "main"].shift()!;
      await new Promise((resolve) => setTimeout(resolve, delay));
      return new Response("{}", { status: 401 });
    };
    const pending = testModelflareDomains({ bases, fetchImpl: request });
    await vi.runAllTimersAsync();
    const results = await pending;
    expect(results.map((r) => r.latencyMs)).toEqual([50, 40, 20]);
  });

  it.each([302, 403, 429, 502])("does not turn HTTP %s into a healthy low latency", async (status) => {
    const results = await testModelflareDomains({ bases, fetchImpl: async () => new Response(null, { status }) });
    expect(results.every((r) => r.latencyMs === null && r.samples.every((s) => s.status === status && s.latencyMs === null))).toBe(true);
  });

  it("preserves partial failure counts and allows the other domain to complete", async () => {
    let calls = 0;
    const results = await testModelflareDomains({ bases, fetchImpl: async (url) => {
      if (String(url).includes("origin.") || (!String(url).includes("cf.") && calls++ === 1)) throw new TypeError("fetch failed");
      return new Response("{}", { status: 200 });
    } });
    expect(results[0]!.samples.filter((s) => s.latencyMs !== null)).toHaveLength(2);
    expect(results[0]!.latencyMs).not.toBeNull();
    expect(results[1]!.latencyMs).toBeNull();
    expect(results[1]!.samples.every((s) => s.error === "network")).toBe(true);
    expect(results[2]!.samples.every((s) => s.latencyMs !== null)).toBe(true);
  });

  it("aborts stalled probes and reports timeouts", async () => {
    const results = await testModelflareDomains({ bases, timeoutMs: 5, fetchImpl: async (_url, init) =>
      new Promise((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true })) });
    expect(results.every((r) => r.latencyMs === null && r.samples.every((s) => s.error === "timeout"))).toBe(true);
  });

  it.each(["auto", "global", "cn", "cf"] as const)("does not recommend a domain when %s cannot connect", async (line) => {
    const result = await verifyModelflareKey("http://test.invalid/v1", "test-key", {
      line, fetchImpl: async () => { throw new TypeError("fetch failed"); },
    });
    expect(result).toMatchObject({ ok: false, code: "network" });
    expect(result).not.toHaveProperty("suggestLine");
  });
});
