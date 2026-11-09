/**
 * 集成测试：真实内置 magpie + mock 厂商。官方 API 的 Key 走自己的路：不经 Modelflare、不碰 Modelflare 的账户和价格目录。
 * 需要先 npm run build:magpie；没有二进制时跳过。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { App } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { resolveMagpieBinary } from "../src/magpie/supervisor.js";
import { officialProviderId } from "../src/providers/official.js";
import { FakeFeishu, listen, mockOpenAI, readJson } from "./helpers.js";

const bin = resolveMagpieBinary();
const d = bin ? describe : describe.skip;

const OPENAI_KEY = "sk-official-openai-9f8e";
const ANTHROPIC_KEY = "sk-ant-official-7a6b";

d("官方 API（真实网关）", () => {
  let vendor: Awaited<ReturnType<typeof listen>>;
  let modelflare: Awaited<ReturnType<typeof mockOpenAI>>;
  let mfSite: Awaited<ReturnType<typeof listen>>;
  let app: App;
  let base: string;
  let dataDir: string;
  const seen: Array<{ url: string; auth?: string; xKey?: string; skill?: string; body?: any }> = [];
  let mfSiteHits = 0;

  beforeAll(async () => {
    // 一个 mock 同时当 OpenAI（Bearer）和 Anthropic（x-api-key）：模型列表按各家的鉴权方式校验
    vendor = await listen(async (req, res) => {
      const url = req.url ?? "";
      const auth = req.headers.authorization;
      const xKey = req.headers["x-api-key"] as string | undefined;
      const body = req.method === "POST" ? await readJson(req) : undefined;
      seen.push({ url, auth, xKey, skill: req.headers["x-modelflare-skill"] as string | undefined, body });
      const json = (status: number, v: unknown) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(v));
      // 网关问模型列表时两个头都带，所以按 Key 的值认是哪一家
      const isAnthropic = xKey === ANTHROPIC_KEY;
      if (auth !== `Bearer ${OPENAI_KEY}` && !isAnthropic) return json(401, { error: { message: "Incorrect API key provided" } });
      if (url.endsWith("/models")) {
        return json(200, { data: (isAnthropic ? ["claude-opus-5-5"] : ["gpt-5.6-sol", "gpt-5.6-sol-2026-01-01", "gpt-image-1", "gpt-4o-mini-tts", "text-embedding-3-small"]).map((id) => ({ id })) });
      }
      if (url.endsWith("/v1/messages")) {
        const events: Array<[string, unknown]> = [
          ["message_start", { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: body.model, content: [], stop_reason: null, usage: { input_tokens: 1, output_tokens: 0 } } }],
          ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
          ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "你好，来自 Anthropic" } }],
          ["content_block_stop", { type: "content_block_stop", index: 0 }],
          ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } }],
          ["message_stop", { type: "message_stop" }],
        ];
        res.writeHead(200, { "content-type": "text/event-stream" });
        return res.end(events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join(""));
      }
      if (url.endsWith("/chat/completions")) {
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "你好，来自 OpenAI" } }] })}\n\n`);
        return res.end("data: [DONE]\n\n");
      }
      return json(404, { error: { message: "no route" } });
    });
    modelflare = await mockOpenAI({ key: "mf-key-1234", models: ["gpt-5.6-sol", "mf-only-model"] });
    mfSite = await listen((_req, res) => {
      mfSiteHits++;
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ data: [] }));
    });
    process.env.AMB_OFFICIAL_BASE_URL = vendor.url + "/v1";
    process.env.AMB_MODELFLARE_BASE_URL = modelflare.url + "/v1";
    process.env.AMB_MODELFLARE_ISSUER = mfSite.url;
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "amb-official-"));
    app = new App(loadConfig({ dataDir, env: { AMB_UI_PORT: "0", AMB_WEIXIN_API_BASE: "http://127.0.0.1:9", AMB_AGENT: "off" } }), {
      feishuTransport: () => new FakeFeishu(),
      printQrToTerminal: false,
    });
    await app.start();
    base = app.web!.url.replace(/\/$/, "");
    mfSiteHits = 0;
  }, 60_000);

  afterAll(async () => {
    delete process.env.AMB_OFFICIAL_BASE_URL;
    delete process.env.AMB_MODELFLARE_BASE_URL;
    delete process.env.AMB_MODELFLARE_ISSUER;
    await app?.stop();
    await vendor?.close();
    await modelflare?.close();
    await mfSite?.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  const api = async (p: string, method = "GET", body?: unknown) => {
    const r = await fetch(base + "/amb/api" + p, { method, headers: body !== undefined ? { "content-type": "application/json" } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
    return { status: r.status, text: await r.clone().text(), json: (await r.json().catch(() => ({}))) as any };
  };
  const row = async (id: string) => (await api("/official")).json.providers.find((p: any) => p.id === id);
  const say = (botId: string, model: string) => {
    let out = "";
    return app.models.streamChat({ model: app.routeModel(botId, model), messages: [{ role: "user", content: "hi" }], signal: AbortSignal.timeout(20_000) }, (x) => (out += x)).then(() => out);
  };

  it("一开始什么都没连；接口上只列得出表里的厂商，也给不了地址", async () => {
    expect((await api("/modelflare")).json).toMatchObject({ mode: "managed", connected: false, official: false });
    const list = (await api("/official")).json.providers;
    expect(list.map((p: any) => p.id)).toEqual(expect.arrayContaining(["openai", "anthropic", "google", "deepseek"]));
    expect(list.every((p: any) => !p.connected && !p.keyTail)).toBe(true);
    expect((await api("/official/evil", "PUT", { key: "x" })).status).toBe(404);
    expect((await api("/official/openai", "PUT", { key: "has space" })).status).toBe(400);
    expect((await api("/official/openai", "PUT", {})).status).toBe(400);
  });

  it("Key 不对：说清楚原因，什么都不保存，回复里没有 Key", async () => {
    const r = await api("/official/openai", "PUT", { key: "sk-wrong-key" });
    expect(r.status).toBe(400);
    expect(r.json.error).toContain("OpenAI");
    expect(r.text).not.toContain("sk-wrong-key");
    expect(app.magpie!.listProviders()).toEqual([]);
    expect((await api("/modelflare")).json.official).toBe(false);
  });

  it("Key 对：接上；只把能对话的模型放进选择器；接口只给尾号", async () => {
    const r = await api("/official/openai", "PUT", { key: OPENAI_KEY });
    expect(r.status).toBe(200);
    expect(r.text).not.toContain(OPENAI_KEY);
    // 图片、语音、向量、带日期的快照都不进选择器
    expect(r.json.models).toEqual(["gpt-5.6-sol"]);
    expect(await row("openai")).toMatchObject({ connected: true, keyTail: "9f8e", models: 1 });
    expect((await api("/modelflare")).json).toMatchObject({ connected: false, official: true });
    expect((await api("/models")).json.models).toContain("official-openai/gpt-5.6-sol");
    const file = path.join(dataDir, "magpie", "config", "magpie", "providers.json");
    expect(fs.statSync(file).mode & 0o077).toBe(0);
  });

  it("模型请求带用户的 Key 直达厂商，不带 Modelflare 的请求头", async () => {
    seen.length = 0;
    expect(await say("default", "official-openai/gpt-5.6-sol")).toBe("你好，来自 OpenAI");
    const call = seen.find((s) => s.url.endsWith("/chat/completions"))!;
    expect(call.auth).toBe(`Bearer ${OPENAI_KEY}`);
    expect(call.body.model).toBe("gpt-5.6-sol");
    expect(call.skill).toBeUndefined();
    expect(modelflare.calls).toEqual([]);
  });

  it("只有官方 Key 时，存着的不带来源的模型名会找到有这个模型的厂商", async () => {
    expect(app.routeModel("default", "gpt-5.6-sol")).toBe("official-openai/gpt-5.6-sol");
    expect(await say("default", "gpt-5.6-sol")).toBe("你好，来自 OpenAI");
  });

  it("Anthropic：Key 走 x-api-key，走自己的 Messages 接口", async () => {
    const r = await api("/official/anthropic", "PUT", { key: ANTHROPIC_KEY });
    expect(r.status).toBe(200);
    seen.length = 0;
    expect(await say("default", "official-anthropic/claude-opus-5-5")).toBe("你好，来自 Anthropic");
    const call = seen.find((s) => s.url.endsWith("/v1/messages"))!;
    expect(call.xKey).toBe(ANTHROPIC_KEY);
    expect(call.body.model).toBe("claude-opus-5-5");
    expect(call.skill).toBeUndefined();
  });

  it("模型资料来自网关，按厂商定接口；只有官方 Key 时不去读 Modelflare 的任何东西", async () => {
    const info = (await api("/models/info?refresh=1")).json.models;
    expect(info["official-openai/gpt-5.6-sol"]).toMatchObject({ endpoints: ["openai-response"], factors: { balanced: 1 } });
    expect(info["official-anthropic/claude-opus-5-5"]).toMatchObject({ endpoints: ["anthropic"] });
    expect(mfSiteHits).toBe(0);
    expect(modelflare.calls).toEqual([]);
    expect((await api("/media/models")).json).toMatchObject({ image: [], video: [] });
  });

  it("再连 Modelflare：各走各的；退出 Modelflare 不影响官方 Key", async () => {
    expect((await app.connectModelflare("mf-key-1234", "auto")).ok).toBe(true);
    await app.retirePastedKey().catch(() => undefined);
    // retirePastedKey 只删 Modelflare 的 Key
    expect(app.magpie!.hasProvider(officialProviderId("openai"))).toBe(true);
    expect((await app.connectModelflare("mf-key-1234", "auto")).ok).toBe(true);
    expect(app.routeModel("default", "mf-only-model")).toBe("modelflare/mf-only-model");
    expect(app.routeModel("default", "official-openai/gpt-5.6-sol")).toBe("official-openai/gpt-5.6-sol");
    seen.length = 0;
    expect(await say("default", "official-openai/gpt-5.6-sol")).toBe("你好，来自 OpenAI");
    expect(seen.find((s) => s.url.endsWith("/chat/completions"))!.skill).toBeUndefined();
    expect(modelflare.calls).toEqual([]);
    await say("default", "gpt-5.6-sol");
    expect(modelflare.calls.at(-1)).toMatchObject({ auth: "Bearer mf-key-1234", model: "gpt-5.6-sol" });
    expect(modelflare.calls.at(-1)!.skill).toMatch(/^\d+\.\d+\.\d+$/);
    await app.disconnectModelflare();
    expect((await api("/modelflare")).json).toMatchObject({ connected: false, official: true });
    expect(await row("openai")).toMatchObject({ connected: true });
  });

  it("换 Key 只改那一家；移除后默认模型不再指着它，最后一把移除后回到未连接", async () => {
    app.setDefaultModel("official-openai/gpt-5.6-sol");
    expect((await api("/official/openai", "PUT", { key: OPENAI_KEY })).status).toBe(200);
    expect(app.magpie!.listProviders().filter((p) => p.id === "official-openai")).toHaveLength(1);
    expect((await api("/official/openai", "DELETE")).status).toBe(200);
    expect(app.config.llm.defaultModel).toBe("");
    expect(await row("openai")).toMatchObject({ connected: false, keyTail: "" });
    expect((await api("/models")).json.models.some((m: string) => m.startsWith("official-openai/"))).toBe(false);
    // Key 移除后不换来源：就算连着 Modelflare 也不能悄悄改走它（另一份账单、另一条数据路径）；网关报错，用户自己选
    expect((await app.connectModelflare("mf-key-1234", "auto")).ok).toBe(true);
    expect(app.routeModel("default", "official-openai/gpt-5.6-sol")).toBe("official-openai/gpt-5.6-sol");
    modelflare.calls.length = 0;
    await expect(say("default", "official-openai/gpt-5.6-sol")).rejects.toThrow();
    expect(modelflare.calls).toEqual([]);
    await app.disconnectModelflare();
    expect((await api("/official/anthropic", "DELETE")).status).toBe(200);
    expect((await api("/modelflare")).json).toMatchObject({ connected: false, official: false });
  });

  it("日志里没有 Key", () => {
    const log = fs.readFileSync(path.join(dataDir, "logs", "app.log"), "utf8");
    for (const k of [OPENAI_KEY, ANTHROPIC_KEY, "sk-wrong-key"]) expect(log).not.toContain(k);
  });
});
