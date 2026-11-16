/**
 * 装好的技能、连上的应用在对话里怎么用（2026-11-15 需求）：
 * 技能的显示名 / 简介 / 示例和生效状态、过程区标出用了哪个技能或应用、历史消息的「已使用」摘要、界面里往输入框填一句话。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityLog, type ActivityStep } from "../src/agent/activity.js";
import { appFailure, stepUse, usedSummary } from "../src/domain/activity.js";
import { libraryId, setSkillUiDir, skillDisplay, skillState } from "../src/skills/display.js";
import { readSkillZip } from "../src/skills/archive.js";
import { UserSkills } from "../src/skills/service.js";
import { Store } from "../src/store/db.js";
import { skillZip } from "./skill-fixture.js";

const md = (name: string, extra = "") => `---\nname: ${name}\ndescription: Use when the user wants Xiaohongshu titles. Writes five.\n${extra}---\nWrite titles.\n`;

describe("技能的显示名、简介和「试试这样说」", () => {
  let ui: string;
  beforeAll(() => {
    ui = fs.mkdtempSync(path.join(os.tmpdir(), "amb-skill-ui-"));
    fs.mkdirSync(path.join(ui, "data"), { recursive: true });
    fs.writeFileSync(path.join(ui, "data", "skill-library.json"), JSON.stringify({ skills: [{ id: "xhs-title", repo: "Owner/Repo", path: "skills/xhs-title" }, { id: "whole-repo", repo: "a/b", path: "" }] }));
    for (const [lang, title, summary, tryIt] of [["zh-CN", "小红书爆款标题", "给笔记起小红书标题", "帮我给这篇笔记起几个小红书标题"], ["en", "Xiaohongshu titles", "Titles for notes", "Write titles for this note"]]) {
      fs.mkdirSync(path.join(ui, "locales", lang), { recursive: true });
      fs.writeFileSync(path.join(ui, "locales", lang, "skillItems.json"), JSON.stringify({ "xhs-title": { title, summary, try: tryIt } }));
    }
    setSkillUiDir(ui);
  });
  afterAll(() => {
    setSkillUiDir(undefined);
    fs.rmSync(ui, { recursive: true, force: true });
  });
  const github = (repo: string, dir: string) => ({ type: "github" as const, owner: repo.split("/")[0], repo: repo.split("/")[1], path: dir, ref: "main", commit: "c", url: "u", installedAt: 1 });

  it("按 GitHub 仓库和目录对上技能库（仓库名不分大小写）；ZIP 导入的对不上", () => {
    expect(libraryId(github("owner/repo", "skills/xhs-title"))).toBe("xhs-title");
    expect(libraryId(github("a/b", ""))).toBe("whole-repo");
    expect(libraryId(github("owner/repo", "skills/other"))).toBeUndefined();
    expect(libraryId({ type: "zip", installedAt: 1 })).toBeUndefined();
    expect(libraryId(undefined)).toBeUndefined();
  });

  it("库里有的用库里当前语言的标题、简介和触发方式；没有这种语言时先用英文", () => {
    const skill = { name: "xhs-title", description: "Use when…", source: github("Owner/Repo", "skills/xhs-title") };
    expect(skillDisplay(skill, "zh-CN")).toEqual({ title: "小红书爆款标题", summary: "给笔记起小红书标题", example: "帮我给这篇笔记起几个小红书标题", library: "xhs-title" });
    expect(skillDisplay(skill, "ja")).toMatchObject({ title: "Xiaohongshu titles", example: "Write titles for this note" });
  });

  it("库外和 ZIP 导入的：技能名、SKILL.md 的描述，示例统一是「用{名称}帮我……」（不拿描述当示例）", () => {
    const skill = { name: "weekly-report", description: "Use when the user asks for a weekly report." };
    expect(skillDisplay(skill, "zh-CN")).toEqual({ title: "weekly-report", summary: "Use when the user asks for a weekly report.", example: "用weekly-report帮我……" });
    expect(skillDisplay(skill, "en").example).toBe("Use weekly-report to help me…");
  });
});

describe("技能现在能不能用（skillState）", () => {
  const skill = { name: "a", digest: "d1", enabled: true };
  const applied = new Map([["a", "d1"]]);
  it("关掉的不标；进程没起过、没在跑时算已生效（下一条消息启动时带上）", () => {
    expect(skillState({ ...skill, enabled: false }, undefined)).toBe("off");
    expect(skillState(skill, undefined)).toBe("active");
    expect(skillState(skill, { running: false, starting: false, busy: false })).toBe("active");
  });
  it("启动或为换技能重启时一律是加载中（加载完成前不说已经可用）", () => {
    expect(skillState(skill, { running: true, starting: true, busy: false, applied })).toBe("loading");
  });
  it("进程里已经是这一版：已生效；不是（新装、换了版本）：忙时等当前任务结束，闲时马上换（加载中）", () => {
    expect(skillState(skill, { running: true, starting: false, busy: true, applied })).toBe("active");
    expect(skillState({ ...skill, digest: "d2" }, { running: true, starting: false, busy: true, applied })).toBe("waiting");
    expect(skillState({ ...skill, name: "b" }, { running: true, starting: false, busy: false, applied })).toBe("loading");
  });
});

describe("UserSkills：模型能不能自己用、部署进进程的是哪一版", () => {
  let dir: string;
  let store: Store;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "amb-user-skills-"));
    store = new Store(":memory:");
    store.createBot({ id: "b", name: "小蓝" });
  });
  afterEach(() => {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("disable-model-invocation 为真（含 yes / on 写法）的技能，模型不能自己用", async () => {
    const skills = new UserSkills(dir, store);
    const plain = skills.install("b", await readSkillZip(skillZip([{ path: "SKILL.md", text: md("plain") }])), null);
    const manual = skills.install("b", await readSkillZip(skillZip([{ path: "SKILL.md", text: md("manual", "disable-model-invocation: yes\n") }])), null);
    const off = skills.install("b", await readSkillZip(skillZip([{ path: "SKILL.md", text: md("auto", "disable-model-invocation: false\n") }])), null);
    expect(skills.modelInvocable("b", plain)).toBe(true);
    expect(skills.modelInvocable("b", manual)).toBe(false);
    expect(skills.modelInvocable("b", off)).toBe(true);
  });

  it("sync 记下部署进进程的技能（名字 → 包的摘要），关掉的不算", async () => {
    const skills = new UserSkills(dir, store);
    expect(skills.applied("b")).toBeUndefined();
    const a = skills.install("b", await readSkillZip(skillZip([{ path: "SKILL.md", text: md("aaa") }])), null);
    skills.install("b", await readSkillZip(skillZip([{ path: "SKILL.md", text: md("bbb") }])), null);
    skills.setEnabled("b", "bbb", false);
    skills.sync("b");
    expect([...skills.applied("b")!]).toEqual([["aaa", a.digest]]);
  });
});

describe("过程区：这一步用到了哪个技能、哪个应用", () => {
  it("从工具名和参数认：skill 的 name、app_call 的 app 和 tool、升级前 Notion / 飞书的工具；截断的参数也认", () => {
    expect(stepUse("skill", '{"name":"xhs-title"}')).toEqual({ kind: "skill", name: "xhs-title" });
    expect(stepUse("app_call", '{"app":"notion","tool":"notion-search","arguments":{"query":"周报"}}')).toEqual({ kind: "app", app: "notion", tool: "notion-search" });
    expect(stepUse("app_call", '{\n  "app": "飞书",\n  "tool": "search-doc",\n  "arguments": {\n    "query": "很长很长…')).toEqual({ kind: "app", app: "飞书", tool: "search-doc" });
    expect(stepUse("notion_search", "{}")).toEqual({ kind: "app", app: "notion", tool: "notion_search" });
    expect(stepUse("feishu_read_chat", "{}")).toEqual({ kind: "app", app: "feishu", tool: "feishu_read_chat" });
    for (const tool of ["bash", "app_tools", "app_tool_schema", "connected_accounts", "app_connect"]) expect(stepUse(tool, '{"app":"notion"}')).toBeUndefined();
  });

  it("应用没用成的原因按宿主写的结果认：连接 / 用户没允许 / 只读 / 其他", () => {
    expect(appFailure("Notion needs the user to sign in again.")).toBe("connection");
    expect(appFailure("Feishu rejected the saved key. The user needs to update it.")).toBe("connection");
    expect(appFailure("Linear could not be reached right now. Try again later, or tell the user.")).toBe("connection");
    expect(appFailure("The user denied this call. Do not retry it unless the user asks.")).toBe("denied");
    expect(appFailure("This bot is read-only, so it can't change anything in connected apps.")).toBe("readonly");
    expect(appFailure("validation error: query is required")).toBe("failed");
  });

  it("ActivityLog 给步骤标上 use：应用名换成 key；技能没用成时只在「装了还没生效」时说明，其余不显示", () => {
    const log = new ActivityLog(undefined, "m", { chat: true, uses: { appKey: (s) => (s === "Notion" ? "notion" : undefined), toolTitle: (app, tool) => (app === "notion" && tool === "fetch" ? "读取页面" : undefined), skillPending: (n) => n === "new-skill" } });
    const call = (id: string, name: string, args: string, isError = false, text = "ok") => {
      log.apply("tool/call", { callId: id, name, arguments: args });
      log.apply("tool/result", { message: { toolCallId: id, isError, content: [{ type: "text", text }] } });
    };
    call("1", "skill", '{"name":"xhs-title"}');
    call("2", "app_call", '{"app":"Notion","tool":"search"}', true, "The user denied this call. Do not retry it unless the user asks.");
    call("3", "skill", '{"name":"new-skill"}', true, "Error: unknown skill");
    call("4", "skill", '{"name":"made-up"}', true, "Error: unknown skill");
    call("5", "bash", '{"command":"ls"}');
    call("6", "app_call", '{"app":"Notion","tool":"fetch"}');
    expect(log.steps.map((s) => s.use)).toEqual([{ kind: "skill", name: "xhs-title" }, { kind: "app", app: "notion", tool: "search", reason: "denied" }, { kind: "skill", name: "new-skill", reason: "loading" }, undefined, undefined, { kind: "app", app: "notion", tool: "fetch", toolTitle: "读取页面" }]);
  });

  it("不是网页聊天的活动记录（任务、规则）不标", () => {
    const log = new ActivityLog(undefined, "m");
    log.apply("tool/call", { callId: "1", name: "skill", arguments: '{"name":"a"}' });
    expect(log.steps[0].use).toBeUndefined();
  });

  it("「已使用」：按第一次出现的顺序；技能同一项只算一次，应用按「应用 + 工具」算；用成过一次就算用上；旧消息没有 use 时现认，没用成的技能不显示", () => {
    const step = (o: Partial<ActivityStep>): ActivityStep => ({ id: Math.random().toString(), kind: "tool", title: "x", status: "ok", at: 0, ...o });
    const steps = [
      step({ title: "app_call", status: "error", use: { kind: "app", app: "notion", tool: "search", toolTitle: "搜索页面", reason: "failed" } }),
      step({ title: "skill", use: { kind: "skill", name: "xhs-title" } }),
      step({ title: "app_call", use: { kind: "app", app: "notion", tool: "search", toolTitle: "搜索页面" } }),
      step({ title: "app_call", use: { kind: "app", app: "notion", tool: "fetch" } }),
      step({ title: "app_call", use: { kind: "app", app: "notion", tool: "fetch" } }),
      step({ title: "app_call", status: "error", use: { kind: "app", app: "linear", tool: "x", reason: "connection" } }),
      step({ title: "skill", input: '{\n  "name": "old"\n}' }),
      step({ title: "skill", status: "error", input: '{"name":"ghost"}' }),
      step({ kind: "model", title: "skill" }),
    ];
    expect(usedSummary(steps)).toEqual([
      { kind: "app", name: "notion", tool: "search", toolTitle: "搜索页面", status: "ok" },
      { kind: "skill", name: "xhs-title", status: "ok" },
      { kind: "app", name: "notion", tool: "fetch", status: "ok" },
      { kind: "app", name: "linear", tool: "x", status: "error", reason: "connection" },
      { kind: "skill", name: "old", status: "ok" },
    ]);
  });

  it("历史消息带上「已使用」摘要（从存下的活动记录算，不把整份记录读出来）", () => {
    const store = new Store(":memory:");
    try {
      store.createBot({ id: "b", name: "小蓝" });
      const conv = store.ensureConversation("b", "web", "console");
      store.addMessage(conv.id, "user", "起标题");
      store.addMessage(conv.id, "assistant", "好了", [
        { id: "m1", kind: "model", title: "gpt", status: "ok", at: 1 },
        { id: "c1", kind: "tool", title: "skill", input: '{"name":"xhs-title"}', status: "ok", at: 2, use: { kind: "skill", name: "xhs-title" } },
        { id: "c2", kind: "tool", title: "bash", input: '{"command":"ls"}', status: "ok", at: 3 },
        { id: "c3", kind: "tool", title: "notion_search", input: "{}", status: "ok", at: 4 },
      ]);
      store.addMessage(conv.id, "assistant", "没用工具", [{ id: "m2", kind: "model", title: "gpt", status: "ok", at: 5 }]);
      const [, used, plain] = store.listMessages(conv.id);
      expect(used.used).toEqual([{ kind: "skill", name: "xhs-title", status: "ok" }, { kind: "app", name: "notion", tool: "notion_search", status: "ok" }]);
      expect(used.steps).toBe(4);
      expect(plain.used).toBeUndefined();
      expect(store.getMessage(used.id)?.used).toEqual(used.used);
    } finally {
      store.close();
    }
  });
});

describe("界面：过程区的名字和往输入框里填一句话（ui/lib/usage.js）", () => {
  let usage: any;
  let i18n: any;
  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }), addEventListener() {}, dispatchEvent() {} });
    vi.stubGlobal("localStorage", { getItem: () => null, setItem() {}, removeItem() {} });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ apps: [], catalog: [] }) })));
    // @ts-expect-error Unbundled browser module.
    i18n = await import("../ui/lib/i18n.js");
    // @ts-expect-error Unbundled browser module.
    usage = await import("../ui/lib/usage.js");
  });
  afterEach(() => vi.unstubAllGlobals());

  it("加号菜单填「用{名称}帮我……」，选中末尾的省略号（接着打字就替换它）", () => {
    i18n.changeLang("zh-CN");
    const p = usage.prefillOf("小红书爆款标题");
    expect(p.text).toBe("用小红书爆款标题帮我……");
    expect(p.text.slice(p.start, p.end)).toBe("……");
    expect(p.text.slice(0, p.start)).toBe("用小红书爆款标题帮我");
  });

  it("填进输入框不丢草稿：空的整句填进去；有草稿时插在光标处，前面不是空白就隔一个空格", () => {
    expect(usage.insertPhrase("", null, "用A帮我……", { start: 4, end: 6 })).toEqual({ text: "用A帮我……", start: 4, end: 6 });
    const el = { selectionStart: 2, selectionEnd: 2 };
    expect(usage.insertPhrase("草稿内容", el, "示例")).toEqual({ text: "草稿 示例内容", start: 5, end: 5 });
    expect(usage.insertPhrase("草稿 ", { selectionStart: 3, selectionEnd: 3 }, "示例")).toEqual({ text: "草稿 示例", start: 5, end: 5 });
  });

  it("进行中按步骤上的 use 汇总，和服务端同一套规则；结束后一行写已使用 / 没能使用", async () => {
    i18n.changeLang("zh-CN");
    const items = usage.usedFromSteps([
      { kind: "tool", status: "error", use: { kind: "app", app: "notion", reason: "denied" } },
      { kind: "tool", status: "ok", use: { kind: "skill", name: "xhs-title" } },
      { kind: "tool", status: "running", use: { kind: "app", app: "notion" } },
      { kind: "tool", status: "error", use: { kind: "app", app: "linear", reason: "connection" } },
    ]);
    expect(items).toEqual([{ kind: "app", name: "notion", status: "running" }, { kind: "skill", name: "xhs-title", status: "ok" }, { kind: "app", name: "linear", status: "error", reason: "connection" }]);
    // 同一应用的不同工具各一行，同一工具多次调用只算一行；有显示名称时带上
    expect(usage.usedFromSteps([
      { kind: "tool", status: "ok", use: { kind: "app", app: "notion", tool: "notion-search", toolTitle: "搜索页面" } },
      { kind: "tool", status: "ok", use: { kind: "app", app: "notion", tool: "notion-search", toolTitle: "搜索页面" } },
      { kind: "tool", status: "running", use: { kind: "app", app: "notion", tool: "notion-fetch" } },
    ])).toEqual([{ kind: "app", name: "notion", tool: "notion-search", toolTitle: "搜索页面", status: "ok" }, { kind: "app", name: "notion", tool: "notion-fetch", status: "running" }]);
    // 应用名来自应用目录（测试里没读到目录时就是 key 原文）
    // @ts-expect-error Unbundled browser module.
    const apps = await import("../ui/lib/apps.js");
    apps.appsStore.set((v: any) => ({ ...v, loaded: true, catalog: [{ id: "notion", name: { zh: "Notion", en: "Notion" } }] }));
    expect(usage.usedName({ kind: "app", name: "notion", tool: "notion-search", toolTitle: "搜索页面" })).toBe("Notion · 搜索页面");
    expect(usage.usedName({ kind: "app", name: "notion", tool: "notion-fetch" })).toBe("Notion · notion-fetch");
    expect(usage.usedName({ kind: "app", name: "notion" })).toBe("Notion");
    expect(usage.usedLine({ kind: "app", name: "notion", status: "running" }, "Notion · 搜索页面")).toBe("正在使用 Notion · 搜索页面");
    expect(usage.usedLine({ kind: "app", name: "notion", status: "error", reason: "connection" }, "Notion · 搜索页面")).toBe("没能使用 Notion · 搜索页面。请检查「Notion」的连接。");
    expect(usage.usedSummaryText([{ status: "ok", label: "Notion · 搜索页面" }, { status: "ok", label: "Notion · 读取页面" }])).toBe("已使用：Notion · 搜索页面、Notion · 读取页面");
    i18n.changeLang("en");
    expect(usage.usedLine({ kind: "app", name: "notion", status: "running" }, "Notion · Search")).toBe("Using Notion · Search");
    expect(usage.usedSummaryText([{ status: "ok", label: "Notion · Search" }, { status: "ok", label: "Notion · Fetch" }])).toBe("Used: Notion · Search, Notion · Fetch");
    i18n.changeLang("zh-CN");
    const skills = [{ name: "xhs-title", title: "小红书爆款标题" }];
    expect(usage.skillLabel("xhs-title", skills)).toBe("小红书爆款标题");
    expect(usage.skillLabel("amb-app", skills)).toBe("");
    expect(usage.skillLabel("media", skills)).toBe("生图 / 生视频");
    expect(usage.usedLine({ kind: "skill", status: "ok" }, "小红书爆款标题")).toBe("正在使用技能 · 小红书爆款标题");
    expect(usage.usedLine({ kind: "app", status: "error", reason: "connection" }, "Linear")).toBe("没能使用 Linear。请检查「Linear」的连接。");
    expect(usage.usedSummaryText([{ status: "ok", label: "小红书爆款标题" }, { status: "ok", label: "Notion" }])).toBe("已使用：小红书爆款标题、Notion");
    expect(usage.usedSummaryText([{ status: "error", label: "Linear" }])).toBe("没能使用：Linear");
  });
});
