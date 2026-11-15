/**
 * 真 DSH + 本地脚本模型：做完一件事后 /skill → 机器人调 save_skill → 草稿卡（密钥去掉、个人信息标出）→ 点「保存」→
 * 「我的技能」只在这个机器人上打开 → 空闲后部署，下一条消息起机器人能用 skill 工具加载它。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { App } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { locateDshRuntime } from "../src/agent/host.js";
import { findAppRoot } from "../src/magpie/supervisor.js";
import { listen } from "./helpers.js";

describe.skipIf(!locateDshRuntime(findAppRoot()))("存成技能（真 DSH）", () => {
  let app: App, dir: string, base: string, api: string, llm: Awaited<ReturnType<typeof listen>>;
  const calls: any[] = [];
  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "amb-my-skill-runtime-"));
    llm = await listen(async (req, res) => {
      if (req.method !== "POST") return void res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ data: [{ id: "mock-agent" }] }));
      let raw = "";
      for await (const c of req) raw += c;
      const b = JSON.parse(raw);
      calls.push(b);
      const start = b.messages.findLastIndex((m: any) => m.role === "user" && /WORK_TASK|存成技能|USE_MY_SKILL/.test(JSON.stringify(m.content)));
      const text = JSON.stringify(b.messages[start]?.content ?? "");
      const outputs = b.messages.slice(start + 1).filter((m: any) => m.role === "tool");
      let step: { name: string; arguments: string } | undefined;
      if (b.tools && text.includes("WORK_TASK") && outputs.length === 0) step = { name: "read", arguments: JSON.stringify({ file_path: path.join(dir, "workspaces/default/notes.txt") }) };
      if (b.tools && text.includes("存成技能") && outputs.length === 0) {
        step = {
          name: "save_skill",
          arguments: JSON.stringify({
            title: "整理笔记",
            name: "notes-digest",
            description: "用户要把笔记整理成摘要时用",
            steps: ["读取 notes.txt", "用 sk-FAKE0000example0000 调接口生成摘要", "把摘要发给 test@example.com"],
            corrections: [{ quote: "别写成表格", rule: "摘要写成段落" }],
            example: "用整理笔记帮我整理今天的笔记",
          }),
        };
      }
      if (b.tools && text.includes("USE_MY_SKILL") && outputs.length === 0) step = { name: "skill", arguments: JSON.stringify({ name: "my-notes-digest" }) };
      const content = outputs.length ? outputs.map((m: any) => JSON.stringify(m.content)).join("\n") : "ok";
      res.writeHead(200, { "content-type": "text/event-stream" });
      const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);
      send({ id: "chat-my-skill", object: "chat.completion.chunk", choices: [{ index: 0, delta: step ? { role: "assistant", tool_calls: [{ index: 0, id: `call-${outputs.length}`, type: "function", function: step }] } : { role: "assistant", content } }] });
      send({ choices: [{ index: 0, delta: {}, finish_reason: step ? "tool_calls" : "stop" }] });
      res.end("data: [DONE]\n\n");
    });
    app = new App(loadConfig({ dataDir: dir, env: { AMB_MAGPIE_BASE_URL: llm.url + "/v1", AMB_MAGPIE_API_KEY: "local-test", AMB_UI_PORT: "0", AMB_DEFAULT_MODEL: "mock-agent", AMB_WEIXIN_API_BASE: "http://127.0.0.1:9", AMB_LANG: "zh-CN" } }), { printQrToTerminal: false });
    await app.start();
    app.store.updateBot("default", { settings: { ...app.store.getBot("default")!.settings, computerUse: { enabled: false, backend: "cua", approval: "auto" }, memory: { enabled: false, review: false, teamWrite: false }, steward: { enabled: false } } });
    fs.mkdirSync(path.join(dir, "workspaces/default"), { recursive: true });
    fs.writeFileSync(path.join(dir, "workspaces/default/notes.txt"), "今天的笔记：三件事");
    api = app.web!.url.replace(/\/$/, "") + "/amb/api";
    base = api + "/bots/default";
  });
  afterAll(async () => {
    await app?.stop();
    await llm?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const post = async (url: string, body: unknown, method = "POST") => {
    const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    expect(res.status).toBe(200);
    return (await res.json()) as any;
  };

  it("只聊天时 /skill 只回「没有可存的事」", async () => {
    const r = await post(base + "/chat", { text: "/skill" });
    expect(r.reply).toBe("这段对话里还没有做成的事可以存。先让我做一件事，做完再存。");
    expect(r.prompts).toEqual([]);
  }, 60_000);

  it("做完一件事后 /skill 出草稿卡，保存后下一条消息起可用", async () => {
    expect((await post(base + "/chat", { text: "WORK_TASK 读一下笔记" })).reply).toContain("今天的笔记");
    const r = await post(base + "/chat", { text: "/skill" });
    const prompt = r.prompts.find((p: any) => p.kind === "skill_draft");
    expect(prompt).toBeTruthy();
    // 机器人看到的是「把刚才做的事存成技能」，系统提示词里有 save_skill
    const req = calls.findLast((b) => JSON.stringify(b.messages).includes("把刚才做的事存成技能"));
    expect(JSON.stringify(req.tools)).toContain("save_skill");
    const card = (await (await fetch(`${api}/skill-drafts/${prompt.requestId}`)).json()) as any;
    expect(card.draft).toMatchObject({ state: "pending", botName: expect.any(String) });
    expect(card.draft.draft.secrets).toBe(1);
    expect(JSON.stringify(card.draft.draft)).not.toContain("sk-FAKE");
    expect(card.draft.draft.personal.map((p: any) => [p.kind, p.keep])).toEqual([["email", false]]);
    expect(card.draft.check.ok).toBe(true);
    // 用到的工具记下来了：read 算做了事，没有定时运行做不了的步骤
    expect(card.draft.draft.blocked).toEqual([]);
    const saved = await post(`${api}/skill-drafts/${prompt.requestId}/save`, {});
    expect(saved.draft.state).toBe("saved");
    const list = (await (await fetch(base + "/skills")).json()) as any;
    const mine = list.skills.find((s: any) => s.name === "my-notes-digest");
    expect(mine).toMatchObject({ enabled: true, title: "整理笔记", source: { type: "mine" } });
    // 下一条消息：空闲时换了进程，技能部署进来，模型能加载它；技能里没有原来的邮箱和密钥
    const use = await post(base + "/chat", { text: "USE_MY_SKILL 整理笔记" });
    expect(use.reply).toContain("摘要写成段落");
    expect(use.reply).not.toContain("test@example.com");
    expect(use.reply).not.toContain("sk-FAKE");
    expect(fs.existsSync(path.join(dir, "dsh/default/skills/my-notes-digest/SKILL.md"))).toBe(true);
    // 导出 ZIP：格式和导入一样
    const zip = await fetch(`${api}/my-skills/my-notes-digest/export`);
    expect(zip.status).toBe(200);
    expect(zip.headers.get("content-disposition")).toContain("my-notes-digest.zip");
    // 删除：所有机器人都不能再用
    expect((await fetch(`${api}/my-skills/my-notes-digest`, { method: "DELETE" })).status).toBe(200);
    expect(((await (await fetch(base + "/skills")).json()) as any).skills.some((s: any) => s.name === "my-notes-digest")).toBe(false);
  }, 120_000);
});
