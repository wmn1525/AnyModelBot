import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { App } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { resolveMagpieBinary } from "../src/magpie/supervisor.js";
import { NewApiAccountManager } from "../src/account/newapi.js";
import { playgroundModel, parsePlaygroundModel } from "../src/providers/newapi.js";
import { listen, readJson, until } from "./helpers.js";

const suite = resolveMagpieBinary() ? describe : describe.skip;
suite("New API login + groups through real magpie", () => {
  let app: App, upstream: Awaited<ReturnType<typeof listen>>, base: string;
  let approve!: () => void;
  const calls: Array<{ path: string; body?: any }> = [];
  const groups = { "OpenAi-Pro": { desc: "Pro", ratio: 2.5 }, "国模": { desc: "国内模型", ratio: 1 } };
  const models = Array.from({ length: 32 }, (_, i) => i === 30 ? "gpt-image-2.5" : `chat-${i}`);
  let imageTokenName = "";
  beforeAll(async () => {
    upstream = await listen(async (req, res) => {
      const url = new URL(req.url!, "http://mock");
      const json = (body: unknown, status = 200) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
      calls.push({ path: url.pathname });
      if (url.pathname === "/api/status") return json({ data: { quota_per_unit: 500000 } });
      if (url.pathname === "/api/pricing") return json({ data: [{ model_name: "gpt-image-2.5", quota_type: 1, model_price: 0.2, supported_endpoint_types: ["image-generation"] }, { model_name: "chat-0", quota_type: 0, model_ratio: 1, completion_ratio: 2, enable_groups: Object.keys(groups) }] });
      if (url.pathname === "/api/user/auth/refresh") return json({ success: true, data: { access_token: "jwt-test-private", access_expires_at: Math.floor(Date.now() / 1000) + 900, user: { id: 8, username: "tester" }, session: { sid: "sid-private" } } });
      if (url.pathname === "/api/user/auth/logout") return json({ success: true });
      if (url.pathname === "/v1/images/generations") {
        expect(req.headers.authorization).toBe("Bearer sk-image-test-private");
        const body = await readJson(req); calls.at(-1)!.body = body;
        expect(body).toMatchObject({ model: "gpt-image-2.5", prompt: "cat" });
        return json({ data: [{ b64_json: "aW1hZ2U=" }] });
      }
      if (req.headers.authorization !== "Bearer jwt-test-private") return json({ success: false }, 401);
      if (url.pathname === "/api/token/" && req.method === "POST") { const body = await readJson(req); imageTokenName = body.name; calls.at(-1)!.body = body; return json({ success: true }); }
      if (url.pathname === "/api/token/search") return json({ success: true, data: { items: [{ id: 99, name: imageTokenName }] } });
      if (url.pathname === "/api/token/99/key") return json({ success: true, data: { key: "image-test-private" } });
      if (url.pathname === "/api/token/99" && req.method === "DELETE") return json({ success: true });
      if (url.pathname === "/api/user/self") return json({ success: true, data: { id: 8, username: "tester", display_name: "Group Tester", quota: 2500000, used_quota: 500000 } });
      if (url.pathname === "/api/user/self/groups") return json({ success: true, data: groups });
      if (url.pathname === "/api/user/models") return json({ success: true, data: models });
      if (url.pathname === "/pg/chat/completions") {
        const body = await readJson(req); calls.at(-1)!.body = body;
        expect(body).toMatchObject({ model: "chat-31", group: "国模" });
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "group routing works" } }] })}\n\n`);
        return res.end("data: [DONE]\n\n");
      }
      return json({ error: { message: "not found" } }, 404);
    });
    process.env.AMB_NEWAPI_BASE_URL = upstream.url;
    app = new App(loadConfig({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), "amb-pg-int-")), env: { AMB_UI_PORT: "0", AMB_AGENT: "off" } }), { printQrToTerminal: false });
    app.desktop = { newapi: { fetch, login: () => ({ result: new Promise<void>((resolve) => { approve = resolve; }), cancel: () => {} }), clear: async () => {} } } as any;
    await app.start();
    base = app.web!.url.replace(/\/$/, "") + "/amb/api";
  });
  afterAll(async () => { await app?.stop(); await upstream?.close(); delete process.env.AMB_NEWAPI_BASE_URL; });
  const api = async (route: string, method = "GET") => {
    const response = await fetch(base + route, { method, headers: { "content-type": "application/json" }, body: method === "POST" ? "{}" : undefined });
    return { status: response.status, data: await response.json() as any };
  };
  it("starts desktop login, exposes every group/model pair, and streams to the chosen playground group", async () => {
    expect((await api("/account")).data.loginAvailable).toBe(true);
    expect((await api("/account/login", "POST")).data).toMatchObject({ state: "signing_in", opened: true });
    approve(); await until(() => app.account.signedIn, 20000, 50);
    expect(app.account).toBeInstanceOf(NewApiAccountManager);
    const account = (await api("/account")).data;
    expect(account).toMatchObject({ source: "account", balanceUsd: 5, usedUsd: 1, loginMethod: "newapi-playground" });
    expect(JSON.stringify(account)).not.toMatch(/jwt-test-private|sid-private/);
    expect((await api("/account/groups")).data.groups).toHaveLength(2);
    const list = (await api("/models")).data.models as string[];
    expect(list).toHaveLength(64);
    expect(list).toContain(playgroundModel("国模", "chat-31"));
    expect(list.some((model) => model.toLowerCase().includes("modelflare") || model.includes("newapi/"))).toBe(false);
    const metadata = (await api("/models/info")).data.models;
    expect(metadata[playgroundModel("OpenAi-Pro", "chat-0")].price.input).toBe(5);
    expect(metadata[playgroundModel("国模", "chat-0")].price.input).toBe(2);
    expect(metadata[playgroundModel("国模", "chat-0")].endpoints).toEqual(["openai"]);
    const output = await app.models.streamChat({ model: app.routeModel("default", playgroundModel("国模", "chat-31")), messages: [{ role: "user", content: "hello" }] }, () => {});
    expect(output).toBe("group routing works");
    expect(calls.some((c) => c.path.startsWith("/api/token"))).toBe(false);
    const mediaModels = (await api("/media/models")).data;
    expect(mediaModels.image).toHaveLength(2);
    expect(mediaModels.video).toEqual([]);
    expect(mediaModels.recommended.image).toContain("gpt-image-2.5");
    const image = mediaModels.image.find((id: string) => parsePlaygroundModel(id)?.group === "\u56fd\u6a21");
    expect(image).toBeTruthy();
    const result = await app.agent.media!.run("default", "image", { model: image, prompt: "cat" });
    const file = result.match(/media\/image-[\w-]+\.png/)![0];
    expect(fs.readFileSync(path.join(app.config.dataDir, "workspaces", "default", file), "utf8")).toBe("image");
    expect(calls.find((c) => c.path === "/api/token/")?.body.group).toBe("\u56fd\u6a21");
    expect(calls.some((c) => c.path === "/api/token/99")).toBe(true);
    expect(JSON.stringify((await api("/account")).data)).not.toContain("image-test-private");
    expect((await api("/account/logout", "POST")).data.state).toBe("signed_out");
    expect((await api("/modelflare")).data.connected).toBe(false);
  });
});
