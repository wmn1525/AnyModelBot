/**
 * 应用内群聊的接口：真实 App / Web 服务 + mock 模型（外部模型端点模式，走纯对话）。
 * 建群 → 发消息 → 接着事件流看每一轮 → 时间线 → 改名、改成员 → 删除。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { App } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { mockOpenAI, until } from "./helpers.js";

let llm: Awaited<ReturnType<typeof mockOpenAI>>;
let app: App;
let base: string;
let dataDir: string;

async function api(p: string, init: { method?: string; body?: unknown } = {}) {
  const res = await fetch(base + "/amb/api" + p, {
    method: init.method ?? "GET",
    headers: init.body !== undefined ? { "content-type": "application/json" } : {},
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as any };
}
const bot = async (name: string) => (await api("/bots", { method: "POST", body: { name } })).json.bot.id as string;

beforeAll(async () => {
  llm = await mockOpenAI({ key: "gw-key", reply: () => "收到" });
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "amb-groups-e2e-"));
  const config = loadConfig({ dataDir, env: { AMB_MAGPIE_BASE_URL: llm.url + "/v1", AMB_MAGPIE_API_KEY: "gw-key", AMB_UI_PORT: "0", AMB_AGENT: "off" } });
  app = new App(config, { printQrToTerminal: false });
  await app.start();
  base = app.web!.url.replace(/\/$/, "");
});
afterAll(async () => {
  await app?.stop();
  await llm?.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("群聊接口", () => {
  it("至少两个机器人才能建群", async () => {
    const a = await bot("一号");
    expect((await api("/groups", { method: "POST", body: { members: [a] } })).status).toBe(400);
    expect((await api("/groups", { method: "POST", body: { members: [a, "不存在"] } })).status).toBe(400);
  });

  it("建群、@ 两个机器人、事件流、时间线、单聊不受影响", async () => {
    const red = await bot("小红");
    const blue = await bot("小蓝");
    const created = await api("/groups", { method: "POST", body: { members: [red, blue] } });
    expect(created.json.group.name).toBe("小红、小蓝");
    const id = created.json.group.id;

    expect((await api(`/groups/${id}/messages`, { method: "POST", body: { text: "" } })).status).toBe(400);
    expect((await api(`/groups/${id}/messages`, { method: "POST", body: { text: "@小红 @小蓝 你们好" } })).status).toBe(200);

    const res = await fetch(`${base}/amb/api/groups/${id}/live`);
    const stream = await res.text();
    expect(stream).toContain("event: done");

    await until(async () => !(await api(`/groups/${id}`)).json.group.running);
    const d = (await api(`/groups/${id}`)).json;
    expect(d.messages.map((m: any) => [m.role, m.botId])).toEqual([
      ["user", ""],
      ["assistant", red],
      ["assistant", blue],
    ]);
    expect(d.messages[1].content).toBe("收到");
    expect(d.live).toBeNull();
    expect(d.group.last.botId).toBe(blue);
    expect(d.group.lastBot).toBe(blue);

    // 模型收到的是带群聊说明的那段话
    expect(JSON.stringify(llm.calls.at(-1)!.messages)).toContain("群聊「小红、小蓝」");
    // 单聊的会话里没有群里的话
    expect((await api(`/bots/${red}/chat`)).json.messages).toEqual([]);

    // 没 @：上一个回答的接着答
    await api(`/groups/${id}/messages`, { method: "POST", body: { text: "继续" } });
    await until(async () => !(await api(`/groups/${id}`)).json.group.running);
    expect((await api(`/groups/${id}`)).json.messages.at(-1).botId).toBe(blue);

    // 改名、改成员
    const third = await bot("小绿");
    const put = await api(`/groups/${id}`, { method: "PUT", body: { name: "新名字", members: [red, third] } });
    expect(put.json.group.name).toBe("新名字");
    expect(put.json.group.members).toEqual([red, third]);
    expect((await api(`/groups/${id}`, { method: "PUT", body: { members: [red] } })).status).toBe(400);
    expect((await api("/groups")).json.groups.map((g: any) => g.id)).toContain(id);

    // 删除：成员在这个群的记忆跟着删
    const scope = { kind: "group" as const, id: `${red}:web:group:${id}` };
    app.agent.memory.remember(scope, "这个群在写周报", { source: "test", by: "test" });
    expect(app.agent.memory.entries(scope)).toHaveLength(1);
    expect((await api(`/groups/${id}`, { method: "DELETE" })).status).toBe(200);
    expect(app.agent.memory.entries(scope)).toEqual([]);
    expect((await api(`/groups/${id}`)).status).toBe(404);
    expect(app.store.getConversation(`${red}:web:group:${id}`)).toBeUndefined();
  });

  it("没在答的时候接事件流，马上结束", async () => {
    const a = await bot("甲");
    const b = await bot("乙");
    const id = (await api("/groups", { method: "POST", body: { members: [a, b] } })).json.group.id;
    const stream = await (await fetch(`${base}/amb/api/groups/${id}/live`)).text();
    expect(stream).toContain("event: done");
  });

  it("失败轮次记录来源；切换模型和确认重试只影响出错成员", async () => {
    const a = await bot("失败成员");
    const b = await bot("其他成员");
    const id = (await api("/groups", { method: "POST", body: { members: [a, b] } })).json.group.id;
    const conv = app.store.ensureConversation(a, "web", `group:${id}`, "", "group");
    const messageId = app.store.addMessage(conv.id, "assistant", "⚠️ 402 quota request_id: original", [{ tool: "write_file" }], {
      errorContext: { model: "official-deepseek/old", groupId: id, input: "只回答原始请求" },
    });
    const messages = (await api(`/groups/${id}`)).json.messages;
    expect(messages[0].errorContext).toEqual({ model: "official-deepseek/old", groupId: id });
    expect(JSON.stringify(messages)).not.toContain("只回答原始请求");
    expect((await api(`/groups/${id}/model/${a}`, { method: "PUT", body: { model: "test-model" } })).status).toBe(200);
    expect(app.store.getConversation(conv.id)?.model).toBe("test-model");
    expect((await api(`/bots/${a}/chat/model`)).json.model).toBe("");
    expect(app.store.getBot(b)?.defaultModel).toBe("");
    expect((await api(`/groups/${id}/retry`, { method: "POST", body: { messageId } })).json.code).toBe("confirm");
    expect((await api(`/groups/${id}/retry`, { method: "POST", body: { messageId, allowRepeatedActions: true } })).status).toBe(200);
    await until(async () => !(await api(`/groups/${id}`)).json.group.running);
    const after = (await api(`/groups/${id}`)).json.messages;
    expect(after.at(-1)).toMatchObject({ botId: a, content: "收到" });
    expect(after.some((m: any) => m.botId === b)).toBe(false);
  });
});
