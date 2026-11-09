import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MediaService, pickDefault } from "../src/tools/media/index.js";
import { Store } from "../src/store/db.js";
import { NewApiAccountManager } from "../src/account/newapi.js";
import { playgroundModel, parsePlaygroundModel, type NewApiDesktop } from "../src/providers/newapi.js";
import type { AccountHooks } from "../src/account/manager.js";
import { until } from "./helpers.js";
// @ts-expect-error Native browser module
import { groupModels, sameModel, shortModel } from "../ui/lib/models.js";

const origin = "https://api.okinto.com";
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanups.splice(0)) await close(); vi.useRealTimers(); vi.restoreAllMocks(); });
function fixture(options: { failGroup?: string; keyMode?: boolean; delayedImage?: boolean; images?: boolean; imageStatus?: number; failTokenKey?: boolean } = {}) {
  const store = new Store(":memory:");
  const groups: Record<string, { desc: string; ratio: number; models: string[] }> = {
    "OpenAi-Pro": { desc: "Pro models", ratio: 2.5, models: Array.from({ length: 31 }, (_, i) => `chat-${i}`) },
    "国模": { desc: "国内模型", ratio: 1, models: ["chat-0", "deepseek-v4"] },
    "带/斜杠 分组": { desc: "Unicode group", ratio: 0.8, models: ["vendor/model"] },
  };
  if (options.images) {
    groups["OpenAi-Pro"].models.push("gpt-image-2.5");
    groups["\u56fd\u6a21"].models.push("gpt-image-2.5", "gemini-3.1-flash-image-preview", "gemini-3-pro-image-native");
  }
  let tokenName = ""; let imageTokenRevoked = false;
  const requests: Array<{ path: string; body?: any; auth: string | null; signal?: AbortSignal | null; init?: RequestInit }> = [];
  let rotations = 0, refreshStatus = 200, expiresAt = Math.floor(Date.now() / 1000) + 900;
  let failNextChat = false;
  let allowLogin!: () => void;
  let rejectLogin!: (error: Error) => void;
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const headers = new Headers(init?.headers);
    requests.push({ path: url.pathname + url.search, body, auth: headers.get("authorization"), signal: init?.signal, init });
    if (url.origin !== origin) throw new Error("Unexpected destination");
    if (url.pathname === "/api/user/auth/refresh") {
      rotations++;
      return refreshStatus === 200 ? Response.json({ success: true, data: { access_token: `jwt-secret-${rotations}`, access_expires_at: expiresAt, user: { id: 7, username: "tester" }, session: { sid: "session-7" } } }) : Response.json({ success: false, message: "Session expired" }, { status: refreshStatus });
    }
    if (url.pathname === "/api/user/auth/logout") return Response.json({ success: true });
    if (url.pathname === "/api/status") return Response.json({ data: { quota_per_unit: 500000 } });
    if (url.pathname === "/api/pricing") return Response.json({ data: [
      ...(options.images ? [
        { model_name: "gpt-image-2.5", quota_type: 1, model_price: 0.2, supported_endpoint_types: ["image-generation"], enable_groups: Object.keys(groups) },
        { model_name: "gemini-3.1-flash-image-preview", supported_endpoint_types: ["openai"] },
        { model_name: "gemini-3-pro-image-native", supported_endpoint_types: ["gemini"] },
      ] : []),{ model_name: "chat-0", quota_type: 0, model_ratio: 1, completion_ratio: 2, enable_groups: Object.keys(groups), supported_endpoint_types: ["openai"] }] });
    if (url.pathname === "/v1/images/generations" || url.pathname === "/v1beta/models/gemini-3-pro-image-native:generateContent") {
      expect(headers.get("authorization")).toBe("Bearer sk-private-image-token");
      if (options.imageStatus) return Response.json({ error: { message: "image upstream failed" } }, { status: options.imageStatus });
      if (url.pathname.startsWith("/v1beta")) { expect(body).not.toHaveProperty("model"); expect(body).not.toHaveProperty("group"); return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "aW1hZ2U=" } }] } }] }); }
      if (options.delayedImage) return new Response(new ReadableStream({ start(controller) { setTimeout(() => {
        if (imageTokenRevoked) controller.error(new Error("terminated: token revoked before image body completed"));
        else { controller.enqueue(new TextEncoder().encode(JSON.stringify({ data: [{ b64_json: "aW1hZ2U=" }] }))); controller.close(); }
      }, 30); } }), { headers: { "content-type": "application/json" } });
      return Response.json({ data: [{ b64_json: "aW1hZ2U=" }] });
    }
    if (headers.get("authorization") !== `Bearer jwt-secret-${rotations}`) return Response.json({ success: false }, { status: 401 });
    if (url.pathname === "/api/token/" && init?.method === "POST") { tokenName = body.name; return Response.json({ success: true }); }
    if (url.pathname === "/api/token/search") return Response.json({ success: true, data: { items: [{ id: 42, name: tokenName }] } });
    if (url.pathname === "/api/token/42/key") return options.failTokenKey ? Response.json({ success: false, message: "key denied" }, { status: 403 }) : Response.json({ success: true, data: { key: "private-image-token" } });
    if (url.pathname === "/api/token/42" && init?.method === "DELETE") { imageTokenRevoked = true; return Response.json({ success: true }); }
    if (url.pathname === "/api/user/self") return Response.json({ success: true, data: { id: 7, username: "tester", display_name: "Test Account", quota: 2000000, used_quota: 500000 } });
    if (url.pathname === "/api/user/self/groups") return Response.json({ success: true, data: Object.fromEntries(Object.entries(groups).map(([id, g]) => [id, { desc: g.desc, ratio: g.ratio }])) });
    if (url.pathname === "/api/user/models") {
      const group = url.searchParams.get("group")!;
      return group === options.failGroup ? Response.json({ success: false, message: "Group unavailable" }, { status: 503 }) : Response.json({ success: true, data: groups[group].models });
    }
    if (url.pathname === "/pg/chat/completions") {
      if (body.model === "gemini-3.1-flash-image-preview") return Response.json({ choices: [{ message: { content: [{ type: "image_url", image_url: { url: "data:image/png;base64,aW1hZ2U=" } }] } }] });
      if (failNextChat) { failNextChat = false; return Response.json({ error: { message: "expired" } }, { status: 401 }); }
      return new Response('data: {"choices":[{"delta":{"content":"connected"}}]}\n\ndata: [DONE]\n\n', { headers: { "content-type": "text/event-stream", "set-cookie": "must-not-leak=1" } });
    }
    if (url.pathname === "/api/log/self") return Response.json({ success: true, data: { total: 1, items: [{ model_name: "chat-0", created_at: Math.floor(Date.now() / 1000), quota: 500000 }] } });
    throw new Error(`Unexpected request ${url.pathname}`);
  }) as unknown as typeof fetch;
  const desktop: NewApiDesktop = {
    fetch: fetchImpl,
    login: () => ({ result: new Promise<void>((resolve, reject) => { allowLogin = resolve; rejectLogin = reject; }), cancel: () => rejectLogin(new Error("cancelled")) }),
    clear: vi.fn(async () => {}),
  };
  const hooks: AccountHooks = { connectKey: vi.fn(async () => {}), disconnect: vi.fn(async () => {}), setBotKey: vi.fn(async () => {}), removeBotKey: vi.fn(async () => {}), keyBalance: vi.fn(async () => options.keyMode ? { available: 2, used: 1, unit: "USD" } : undefined), sharedKeyTail: () => "", sharedKeyRejected: async () => false, alert: vi.fn() };
  let relay!: { baseUrl: string; apiKey: string }, models: string[] = [];
  const connectRelay = vi.fn(async (endpoint: typeof relay, list: string[]) => { relay = endpoint; models = list; });
  const account = new NewApiAccountManager({ origin, desktop, store, hooks, alerts: () => ({ lowBalanceUsd: 1, push: false }), connectRelay });
  account.init();
  cleanups.push(async () => { await account.close(); store.close(); });
  return { account, store, desktop, hooks, groups, requests, connectRelay, fetchImpl,
    get relay() { return relay; }, get models() { return models; }, get rotations() { return rotations; },
    set refreshStatus(v: number) { refreshStatus = v; }, set expiresAt(v: number) { expiresAt = v; },
    failChat: () => { failNextChat = true; },
    async signIn() { await account.startLogin(); allowLogin(); await until(() => account.signedIn, 3000, 10); },
  };
}

describe("New API playground account", () => {
  it("reports the OKINTO wallet without upstream credit offers and scopes first-use progress by account", async () => {
    const f = fixture();
    expect(f.account.ownerKey).toBe("local");
    await f.signIn();
    expect(f.account.ownerKey).toMatch(/^[a-f0-9]{64}$/);
    expect(f.account.knownBalanceUsd()).toBe(4);
    expect(f.account.status()).toMatchObject({ bot: null, topupUrl: origin + "/console/topup", balanceUnit: "USD" });
    const owner = f.account.ownerKey;
    await f.account.refresh();
    expect(f.account.ownerKey).toBe(owner);
    await f.account.logout();
    expect(f.account.ownerKey).toBe("local");
  });
  it("keeps the scoped image token until the complete response body is received", async () => {
    const f = fixture({ images: true, delayedImage: true }); await f.signIn();
    const response = await fetch(f.relay.baseUrl + "/images/generations", { method: "POST", headers: { authorization: `Bearer ${f.relay.apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ model: playgroundModel("国模", "gpt-image-2.5"), prompt: "cat" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [{ b64_json: "aW1hZ2U=" }] });
    expect(f.requests.some((r) => r.path === "/api/token/42" && r.init?.method === "DELETE")).toBe(true);
  });
  it("keeps every group/model pair, including 31+ models and Unicode/slash names", async () => {
    const f = fixture(); await f.signIn();
    expect(f.account.status()).toMatchObject({ state: "signed_in", source: "account", name: "Test Account", balanceUsd: 4, usedUsd: 1 });
    expect(f.models).toHaveLength(34);
    expect(f.models).toContain(playgroundModel("国模", "chat-0"));
    expect(f.models).toContain(playgroundModel("OpenAi-Pro", "chat-30"));
    expect(parsePlaygroundModel(playgroundModel("带/斜杠 分组", "vendor/model"))).toEqual({ group: "带/斜杠 分组", model: "vendor/model" });
    expect(f.requests.filter((r) => r.path.startsWith("/api/user/models")).map((r) => new URL(r.path, origin).searchParams.get("group")).sort()).toEqual(Object.keys(f.groups).sort());
    expect(JSON.stringify(f.account.status())).not.toMatch(/jwt-secret|session-7/);
    expect(JSON.stringify(f.store.listKV("newapi."))).not.toMatch(/jwt-secret|session-7/);
    expect(f.requests.some((r) => r.path.startsWith("/api/token"))).toBe(false);
  });
  it("preserves selected group, tool calling, images and all OpenAI request fields", async () => {
    const f = fixture(); await f.signIn();
    const body = { model: playgroundModel("国模", "chat-0"), stream: true, messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "data:image/png;base64,eA==" } }] }], tools: [{ type: "function", function: { name: "run", parameters: { type: "object" } } }], tool_choice: "auto", thinking: { type: "enabled" } };
    const res = await fetch(f.relay.baseUrl + "/chat/completions", { method: "POST", headers: { authorization: `Bearer ${f.relay.apiKey}`, "content-type": "application/json" }, body: JSON.stringify(body) });
    expect(res.status).toBe(200); expect(await res.text()).toContain("connected"); expect(res.headers.has("set-cookie")).toBe(false);
    expect(f.requests.find((r) => r.path === "/pg/chat/completions")?.body).toEqual({ ...body, group: "国模", model: "chat-0" });
    expect(f.requests.find((r) => r.path === "/pg/chat/completions")?.init?.redirect).toBe("error");
  });
  it("protects the loopback bridge and rejects unauthorized group/model pairs without contacting the site", async () => {
    const f = fixture(); await f.signIn();
    expect((await fetch(f.relay.baseUrl + "/models")).status).toBe(401);
    const res = await fetch(f.relay.baseUrl + "/chat/completions", { method: "POST", headers: { authorization: `Bearer ${f.relay.apiKey}` }, body: JSON.stringify({ model: playgroundModel("forbidden", "chat-0") }) });
    expect(res.status).toBe(400); expect(f.requests.some((r) => r.path === "/pg/chat/completions")).toBe(false);
  });
  it("lists authorized image models with each group's real cost and the automatic default", async () => {
    const f = fixture({ images: true }); await f.signIn();
    const models = await f.account.mediaModels("image");
    expect(models).toHaveLength(4);
    expect(models.find((m) => m.id === playgroundModel("OpenAi-Pro", "gpt-image-2.5"))?.cost?.usd).toBe(0.5);
    expect(models.find((m) => m.id === playgroundModel("\u56fd\u6a21", "gpt-image-2.5"))?.cost?.usd).toBe(0.2);
    expect(pickDefault(models, "")?.id).toContain("gpt-image-2.5");
    expect(models.filter((m) => m.route === "chat")).toHaveLength(1);
    expect(await f.account.mediaModels("video")).toEqual([]);
    expect(f.account.status().capabilities?.media).toBe(true);
    expect(f.requests.some((r) => r.path.startsWith("/api/token"))).toBe(false);
  });
  it.each(["gpt-image-2.5", "gemini-3.1-flash-image-preview", "gemini-3-pro-image-native"])("generates and saves %s via the authenticated relay", async (id) => {
    const f = fixture({ images: true }); await f.signIn();
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "amb-newapi-image-"));
    cleanups.push(async () => { fs.rmSync(workspace, { recursive: true, force: true }); });
    const media = new MediaService({ baseUrl: () => f.account.baseUrl, geminiBaseUrl: () => f.account.baseUrl.replace(/\/v1$/, "/v1beta"), keyFor: () => f.account.mediaKey, headers: () => ({}), workspace: () => workspace,
      available: (kind) => f.account.mediaModels(kind), pricingUrl: () => origin + "/api/pricing", fetchImpl: ((url: string | URL | Request, init?: RequestInit) => String(url).startsWith(origin) ? f.fetchImpl(url, init) : fetch(url, init)) as typeof fetch });
    const model = playgroundModel("\u56fd\u6a21", id);
    const result = await media.run("bot", "image", { model, prompt: "draw a cat" });
    const files = fs.readdirSync(path.join(workspace, "media"));
    expect(files).toHaveLength(1);
    expect(fs.readFileSync(path.join(workspace, "media", files[0]), "utf8")).toBe("image");
    expect(result).toContain(files[0]);
    expect(await media.docs(model)).toContain("New API image");
    expect(JSON.stringify(f.account.status())).not.toContain("private-image-token");
    expect(JSON.stringify(f.store.listKV("newapi."))).not.toContain("private-image-token");
    if (id === "gemini-3.1-flash-image-preview") {
      expect(f.requests.some((r) => r.path.startsWith("/api/token"))).toBe(false);
      expect(f.requests.find((r) => r.path === "/pg/chat/completions")?.body).toMatchObject({ model: id, group: "\u56fd\u6a21", stream: false });
    } else {
      expect(f.requests.find((r) => r.path === "/api/token/")?.body).toMatchObject({ group: "\u56fd\u6a21", model_limits: id, model_limits_enabled: true, cross_group_retry: false });
      expect(f.requests.find((r) => r.path === "/api/token/42")?.init?.method).toBe("DELETE");
    }
  });
  it.each([{ imageStatus: 429 }, { failTokenKey: true }])("revokes the temporary token when image generation fails: %j", async (options) => {
    const f = fixture({ images: true, ...options }); await f.signIn();
    const res = await fetch(f.relay.baseUrl + "/images/generations", { method: "POST", headers: { authorization: `Bearer ${f.account.mediaKey}` }, body: JSON.stringify({ model: playgroundModel("\u56fd\u6a21", "gpt-image-2.5"), prompt: "cat" }) });
    expect(res.status).toBe(options.imageStatus ?? 403);
    expect(await res.text()).not.toContain("private-image-token");
    expect(f.requests.some((r) => r.path === "/api/token/42" && r.init?.method === "DELETE")).toBe(true);
  });
  it("rejects invalid bodies and non-image models before creating a token", async () => {
    const f = fixture({ images: true }); await f.signIn();
    for (const body of [null, [], { model: playgroundModel("\u56fd\u6a21", "chat-0") }, { model: playgroundModel("forbidden", "gpt-image-2.5") }]) {
      const res = await fetch(f.relay.baseUrl + "/images/generations", { method: "POST", headers: { authorization: `Bearer ${f.account.mediaKey}` }, body: JSON.stringify(body) });
      expect(res.status).toBe(400);
    }
    expect(f.requests.some((r) => r.path.startsWith("/api/token"))).toBe(false);
  });
  it("calculates different prices for the same model in different groups", async () => {
    const f = fixture(); await f.signIn(); const info = await f.account.modelInfo();
    expect(info[playgroundModel("国模", "chat-0")]).toMatchObject({ price: { input: 2, output: 4 }, endpoints: ["openai"] });
    expect(info[playgroundModel("OpenAi-Pro", "chat-0")]).toMatchObject({ price: { input: 5, output: 10 } });
  });
  it("refreshes short-lived access tokens once for concurrent account requests", async () => {
    const f = fixture(); await f.signIn();
    const realNow = Date.now(); vi.spyOn(Date, "now").mockReturnValue(realNow + 880000); f.expiresAt = Math.floor(realNow / 1000) + 1800;
    await Promise.all([f.account.usage(7), f.account.usage(7), f.account.refresh()]);
    expect(f.rotations).toBe(2);
    const refresh = f.requests.filter((r) => r.path.endsWith("/auth/refresh"))[1];
    expect(new Headers(refresh.init?.headers).get("X-Auth-Session")).toBe("session-7");
  });
  it("refreshes once after a 401 and retries without dropping the chosen group", async () => {
    const f = fixture(); await f.signIn(); f.failChat();
    const res = await fetch(f.relay.baseUrl + "/chat/completions", { method: "POST", headers: { authorization: `Bearer ${f.relay.apiKey}` }, body: JSON.stringify({ model: playgroundModel("OpenAi-Pro", "chat-0"), stream: true }) });
    expect(res.status).toBe(200); await res.text(); expect(f.rotations).toBe(2);
    expect(f.requests.filter((r) => r.path === "/pg/chat/completions").every((r) => r.body.group === "OpenAi-Pro")).toBe(true);
  });
  it("retains working groups when another group cannot be read and exposes its error", async () => {
    const f = fixture({ failGroup: "国模" }); await f.signIn();
    expect((await f.account.groupList()).find((g) => g.id === "国模")).toMatchObject({ models: [], error: "Group unavailable" });
    expect(f.models).toHaveLength(32);
  });
  it("cancels login without attaching providers or leaving a polling attempt", async () => {
    const f = fixture(); await f.account.startLogin(); f.account.cancelLogin(); await Promise.resolve();
    expect(f.account.status().state).toBe("signed_out"); expect(f.connectRelay).not.toHaveBeenCalled();
    expect(f.requests).toHaveLength(0);
  });
  it("logs out only this session, clears browser credentials and disconnects", async () => {
    const f = fixture(); await f.signIn();
    expect(await f.account.logout()).toEqual({ revoked: true });
    expect(f.account.status()).toMatchObject({ state: "signed_out", source: "none", balanceUsd: null });
    expect(f.desktop.clear).toHaveBeenCalled(); expect(f.hooks.disconnect).toHaveBeenCalled();
    expect(f.store.getKV("newapi.session")).toBeUndefined();
    const logout = new Headers(f.requests.find((r) => r.path.endsWith("/auth/logout"))?.init?.headers);
    expect(logout.get("X-Auth-Session")).toBe("session-7");
    expect(logout.get("Authorization")).toBe("Bearer jwt-secret-1");
    expect(f.account.baseUrl).toBe("");
    expect(await fetch(f.relay.baseUrl + "/models").catch(() => undefined)).toBeUndefined();
  });
  it("marks an expired session signed out and clears stale models rather than showing a zero wallet", async () => {
    const f = fixture(); await f.signIn();
    const realNow = Date.now(); vi.spyOn(Date, "now").mockReturnValue(realNow + 880000); f.refreshStatus = 401;
    await f.account.refresh();
    expect(f.account.status()).toMatchObject({ state: "signed_out", balanceUsd: null, error: expect.stringContaining("登录已失效") });
    expect(f.hooks.disconnect).toHaveBeenCalled(); expect(f.desktop.clear).toHaveBeenCalled();
    expect(f.account.baseUrl).toBe("");
  });
  it("keeps manual API key balance mode available", async () => {
    const f = fixture({ keyMode: true }); await f.account.refresh();
    expect(f.account.status()).toMatchObject({ state: "signed_out", source: "key", balanceUsd: 2, usedUsd: 1 });
    expect(f.requests).toHaveLength(0);
  });
  it("never collapses identical model IDs from different groups in the picker", () => {
    const pro = playgroundModel("OpenAi-Pro", "chat-0"), other = playgroundModel("国模", "chat-0");
    expect(pro).toBe("Okinto/OpenAi-Pro/chat-0");
    expect(parsePlaygroundModel("modelflare/newapi/OpenAi-Pro/chat-0")).toEqual({ group: "OpenAi-Pro", model: "chat-0" });
    expect(sameModel(pro, other)).toBe(false);
    expect(groupModels([pro, other]).map((g: any) => g[0]).sort()).toEqual(["OpenAi-Pro", "国模"].sort());
    expect(shortModel(pro)).toBe("chat-0 · OpenAi-Pro");
    expect(groupModels([pro, other], "国模")).toHaveLength(1);
  });
});
