import { MODELFLARE_LINES } from "./modelflare.js";

interface DomainSample {
  latencyMs: number | null;
  status?: number;
  error?: "timeout" | "network";
}

/** Fixed public endpoints only; no credentials, model calls, redirects or config changes. */
export async function testModelflareDomains(opts: { fetchImpl?: typeof fetch; timeoutMs?: number; now?: () => number; bases?: typeof MODELFLARE_LINES } = {}) {
  const request = opts.fetchImpl ?? fetch;
  const now = opts.now ?? (() => performance.now());
  return Promise.all(Object.entries(opts.bases ?? MODELFLARE_LINES).map(async ([line, baseUrl]) => {
    const samples: DomainSample[] = [];
    for (let i = 0; i < 3; i++) {
      const signal = AbortSignal.timeout(opts.timeoutMs ?? 5_000);
      const start = now();
      try {
        const res = await request(`${baseUrl}/models`, {
          method: "GET", headers: { Accept: "application/json" },
          credentials: "omit", redirect: "manual", cache: "no-store", signal,
        });
        // 401 is the expected API response without a key. Other errors/redirects
        // must not appear as a fast, healthy endpoint. Measure response headers only.
        const latencyMs = res.ok || res.status === 401 ? Math.max(0, Math.round(now() - start)) : null;
        samples.push({ latencyMs, status: res.status });
        await res.body?.cancel().catch(() => {});
      } catch (error) {
        samples.push({ latencyMs: null, error: signal.aborted || (error as Error).name === "TimeoutError" ? "timeout" : "network" });
      }
    }
    const timings = samples.flatMap((s) => s.latencyMs === null ? [] : [s.latencyMs]).sort((a, b) => a - b);
    const middle = Math.floor(timings.length / 2);
    const latencyMs = timings.length ? Math.round((timings[middle]! + timings[Math.floor((timings.length - 1) / 2)]!) / 2) : null;
    return { line, domain: new URL(baseUrl).hostname, latencyMs, samples };
  }));
}
