/**
 * 机器人之间发消息（PRD 2026-11-15 R5–R12）：CollabService 对着真的 TaskService（假的代理宿主）。
 * 使用条件（登录、两边的模型）、你明确说了才发、一次一个、不重复发、每天上限；B 在后台做完回消息、A 核对（没达标让 B 重做，
 * 那一轮的话不给用户看）；同一个机器人最多接 3 件、排队 24 小时作废；花满停下后 A 问要不要继续；退出登录停下；只发一层。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Store } from "../src/store/db.js";
import { TaskService, type TaskHost, type TaskNotification } from "../src/tasks/service.js";
import { ApprovalCenter } from "../src/agent/approvals.js";
import { DEFAULT_SETTINGS } from "../src/agent/settings.js";
import { CollabService, QUEUE_MS, redact } from "../src/collab/service.js";
import { pairKeyOf } from "../src/store/collab.js";
import { botTeam, checkInput, handoffBrief } from "../src/agent/prompts/index.js";

const flush = async (n = 6) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r));
};

class FakeHost implements TaskHost {
  available = true;
  prompts: Array<{ botId: string; sessionId: string; text: string; id: string }> = [];
  private n = 0;
  constructor(readonly ws: string) {}
  workspace(botId: string) {
    return path.join(this.ws, botId);
  }
  settings() {
    return { ...DEFAULT_SETTINGS, taskSlots: 5 };
  }
  memoryPrefix() {
    return "## 关于我\n- 称呼用户为 Melody";
  }
  async prompt(botId: string, o: { sessionId: string; text: string }) {
    const id = `msg-${++this.n}`;
    this.prompts.push({ botId, sessionId: o.sessionId, text: o.text, id });
    return id;
  }
  async steer() {
    return false;
  }
  async stop() {}
  async cancel() {}
  async quiet() {
    return { quiet: true };
  }
}

describe("机器人之间发消息", () => {
  let store: Store;
  let host: FakeHost;
  let tasks: TaskService;
  let collab: CollabService;
  let ws: string;
  let signedIn: boolean;
  let models: Record<string, string>;
  /** 测试里的时钟：真实时间加上偏移（消息的时间用真实时间） */
  let offset: number;
  /** A 被叫醒的那几轮：输入；during 在那一轮里做点什么（比如让 B 重做） */
  let turns: Array<{ botId: string; input: string }>;
  let during: ((input: string) => Promise<void>) | undefined;
  const A = "a";
  const B = "b";
  const CONV = `${A}:web:console`;

  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "amb-collab-"));
    store = new Store(":memory:");
    store.createBot({ id: A, name: "产品研究员" });
    store.createBot({ id: B, name: "产品助理" });
    store.createBot({ id: "c", name: "日程秘书" });
    store.ensureConversation(A, "web", "console", "控制台");
    store.ensureConversation(B, "web", "console", "控制台");
    for (const id of [A, B, "c"]) fs.mkdirSync(path.join(ws, id), { recursive: true });
    host = new FakeHost(ws);
    signedIn = true;
    models = {};
    offset = 0;
    turns = [];
    during = undefined;
    const approvals = new ApprovalCenter(store);
    tasks = new TaskService({
      store,
      host,
      approvals,
      defaultModel: () => "deepseek-v4",
      maxBackground: 8,
      now: () => Date.now() + offset,
      handoffs: {
        canStart: (t, r) => collab.hooks.canStart(t, r),
        started: (t, r) => collab.hooks.started(t, r),
        ended: (...a) => collab.hooks.ended(...a),
        approval: (t, e) => collab.hooks.approval(t, e),
      },
    });
    collab = new CollabService({
      store,
      tasks,
      signedIn: () => signedIn,
      modelflareModel: (m) => !!m && !m.startsWith("official-"),
      defaultModel: () => "deepseek-v4",
      workspace: (id) => path.join(ws, id),
      settings: () => ({ ...DEFAULT_SETTINGS }),
      slots: () => 2,
      now: () => Date.now() + offset,
      timeZone: () => "Asia/Shanghai",
      turn: async (botId, conv, input, keep) => {
        turns.push({ botId, input });
        await during?.(input);
        if (!keep()) return { text: "（没给用户看）" };
        return { messageId: store.addMessage(conv, "assistant", `汇总：${input.slice(0, 20)}`), text: "汇总" };
      },
    });
    for (const [id, m] of Object.entries(models)) store.updateBot(id, { defaultModel: m });
    tasks.start();
  });
  afterEach(() => {
    tasks.stop();
    collab.stop();
    store.close();
    fs.rmSync(ws, { recursive: true, force: true });
  });

  const say = (text: string) => store.addMessage(CONV, "user", text);
  const send = (args: Record<string, unknown> = {}) =>
    collab.send(A, CONV, true, { bot: "产品助理", title: "重画第三节作者浮层", task: "请按新数据重画第三节作者浮层，只放头像和简介。", points: "技能共 231 个\n附件 catalog.csv", done_when: "有空状态和长简介两种", ...args });
  const ev = (sessionId: string, type: string, data: any = {}): TaskNotification => ({ method: "session.event", params: { sessionId, event: { type, data, time: Date.now() } } });
  const status = (sessionId: string, s: "running" | "idle"): TaskNotification => ({ method: "session.status", params: { sessionId, status: s } });
  /** B 的任务会话跑一轮（during 里报结果） */
  const turn = async (sessionId: string, during?: () => void) => {
    const p = host.prompts.filter((x) => x.sessionId === sessionId).at(-1)!;
    tasks.onEvent(B, sessionId, status(sessionId, "running"));
    tasks.onEvent(B, sessionId, ev(sessionId, "turn/start", { turn: 1 }));
    tasks.onEvent(B, sessionId, ev(sessionId, "user/message", { id: p.id, role: "user", content: [{ type: "text", text: p.text }] }));
    during?.();
    tasks.onEvent(B, sessionId, ev(sessionId, "turn/end", { turn: 1, reason: { kind: "completed" } }));
    tasks.onEvent(B, sessionId, status(sessionId, "idle"));
    await flush();
  };
  const handoffs = () => store.collab.list({ conversationId: CONV });

  it("未登录：不发，A 的回复下面出「去登录」；设置改不了", () => {
    signedIn = false;
    say("交给产品助理吧。");
    const r = send();
    expect(r.text).toMatch(/signs in to Okinto/);
    expect(handoffs()).toEqual([]);
    expect(collab.notices(CONV).map((n) => n.kind)).toEqual(["signin"]);
    expect(collab.setSettings({ daily: 50 }).error).toBe("signin");
  });

  it("模型不符：说清是哪一边，出「去换模型」（打开那个机器人的模型选择）", () => {
    store.updateBot(B, { defaultModel: "official-openai/gpt-x" });
    say("交给产品助理吧。");
    expect(send().text).toMatch(/产品助理 is using a model from the user's own API key/);
    expect(collab.notices(CONV).at(-1)).toMatchObject({ kind: "model", bots: [B] });
    store.updateBot(A, { defaultModel: "official-openai/gpt-x" });
    expect(send().text).toMatch(/both you and 产品助理/);
    expect(handoffs()).toEqual([]);
  });

  it("你明确说了才发：用户没点名、只是机器人觉得合适时不发；建议后用户说「好」就发", () => {
    say("第三节的作者浮层，按新数据重画一版线稿。");
    expect(send().error).toMatch(/Only message 产品助理 when the user explicitly asks/);
    store.addMessage(CONV, "assistant", "这类线稿产品助理一直在画，交给它更合适，要我发消息让它来做吗？也可以我自己来。");
    say("好");
    expect(send().text).toMatch(/^Sent to 产品助理/);
  });

  it("找不到机器人：问是不是最接近的那个；不能发给自己", () => {
    say("交给产品助手");
    expect(collab.send(A, CONV, true, { bot: "产品助手", task: "x" }).text).toMatch(/Ask the user in one sentence whether they mean 产品助理/);
    say("交给产品研究员");
    expect(collab.send(A, CONV, true, { bot: "产品研究员", task: "x" }).error).toMatch(/cannot message yourself/);
  });

  it("发出：B 名下一个后台任务（B 的模型、权限），消息里有要做什么、要点、做完的标准，不含令牌；两人对话记下；只发一层", async () => {
    say("交给产品助理吧。");
    const r = send({ points: "技能共 231 个\nAPI key 是 sk-abcdefghijklmnopqrstuv123" });
    expect(r.text).toMatch(/^Sent to 产品助理 \(h_/);
    const h = handoffs()[0];
    expect(h).toMatchObject({ fromBot: A, toBot: B, kind: "do", redoLimit: 2, budgetUsd: 1, capMs: 4 * 3600_000 });
    expect(["queued", "working"]).toContain(h.state);
    expect(h.message).toContain("请按新数据重画第三节作者浮层");
    expect(h.message).toContain("- 技能共 231 个");
    expect(h.message).toContain("做完的标准：有空状态和长简介两种");
    expect(h.message).not.toContain("sk-abcdef");
    const task = store.getTask(h.taskId)!;
    expect(task).toMatchObject({ botId: B, conversationId: CONV, handoffId: h.id, capMs: 4 * 3600_000, budgetUsd: 1 });
    // 用户看到的任务列表里没有它（A 的对话里不出任务胶囊）
    expect(tasks.list({ conversationId: CONV })).toEqual([]);
    await flush();
    const brief = host.prompts.find((p) => p.sessionId === task.sessionId)!.text;
    expect(brief).toContain("[产品研究员发来的消息]");
    expect(brief).toContain("你不能再把它交给别的机器人，也不能发回给产品研究员");
    expect(brief).toContain("称呼用户为 Melody");
    expect(store.collab.messages(pairKeyOf(A, B)).filter((m) => m.kind === "message")).toHaveLength(1);
    // B 的任务会话（或任何不是聊天的会话）里发：不行
    expect(collab.send(B, CONV, false, { bot: "日程秘书", task: "x" }).error).toMatch(/cannot pass it on/);
  });

  it("一次一个、不重复发、每天上限（本机时区 00:00 恢复）", () => {
    say("让产品助理和日程秘书一起弄。");
    expect(send().text).toMatch(/^Sent/);
    expect(send({ bot: "日程秘书" }).text).toMatch(/only one request, to one bot/);
    say("让产品助理把第三节线稿画了。");
    expect(send().text).toMatch(/already working on this/);
    expect(collab.setSettings({ daily: 10 }).settings?.daily).toBe(10);
    expect(collab.setSettings({ daily: 7 }).error).toBe("choice");
    const jobs = ["订周三的会议室", "整理本周日程", "提醒我交报销", "约牙医", "查下周天气", "订去杭州的票", "安排一对一", "备份照片", "续费域名"];
    for (const job of jobs) {
      say(`交给日程秘书：${job}`);
      expect(collab.send(A, CONV, true, { bot: "日程秘书", task: job }).text).toMatch(/^Sent/);
    }
    say("交给日程秘书：第 11 件");
    expect(collab.send(A, CONV, true, { bot: "日程秘书", task: "第十一件" }).text).toMatch(/limit of 10 requests between bots is used up; it resets at 00:00/);
    offset += 24 * 3600_000;
    say("交给日程秘书：第二天");
    expect(collab.send(A, CONV, true, { bot: "日程秘书", task: "第二天的事" }).text).toMatch(/^Sent/);
  });

  it("B 做完回消息 → A 核对后回复你；「收到 B 的消息」挂在 A 的汇总上", async () => {
    say("交给产品助理吧。");
    send();
    await flush();
    const h = handoffs()[0];
    const task = store.getTask(h.taskId)!;
    expect(store.collab.get(h.id)!.state).toBe("working");
    fs.mkdirSync(path.join(ws, B, task.folder), { recursive: true });
    fs.writeFileSync(path.join(ws, B, task.folder, "author-popover-r3.png"), "png");
    await turn(task.sessionId, () => void tasks.report({ sessionId: task.sessionId, state: "done", summary: "画好了，两种状态各一张。", files: ["author-popover-r3.png"] }));
    await flush();
    const done = store.collab.get(h.id)!;
    expect(done.state).toBe("done");
    expect(done.replyFiles).toEqual([`inbox/from-${B}/${h.id}/author-popover-r3.png`]);
    expect(fs.existsSync(path.join(ws, A, done.replyFiles[0]))).toBe(true);
    expect(turns[0].input).toContain("[收到产品助理的消息");
    expect(turns[0].input).toContain("做完的标准：有空状态和长简介两种");
    expect(store.listMessages(CONV).find((m) => m.id === done.doneMessageId)?.content).toMatch(/^汇总/);
    expect(collab.chatView(CONV).sent[0]).toMatchObject({ state: "done", doneMessageId: done.doneMessageId });
    // B 的主对话里两行：收到 A 的消息、已回消息给 A
    expect(collab.chatView(`${B}:web:console`).inbox[0]).toMatchObject({ from: A, state: "done" });
    expect(collab.chatView(`${B}:web:console`).inbox[0].repliedAt).toBeGreaterThan(0);
  });

  it("没达标：A 直接让 B 重做（写明第几次），那一轮的话不给用户看；重做用完后如实说", async () => {
    say("交给产品助理吧。");
    send();
    await flush();
    const h = handoffs()[0];
    const task = store.getTask(h.taskId)!;
    during = async (input) => {
      if (input.includes("已让它重做 0 次")) expect((await collab.request(A, CONV, { id: h.id, action: "redo", text: "长简介超过 3 行没有折行" })).text).toMatch(/redo 1\/2/);
    };
    const before = store.listMessages(CONV).length;
    await turn(task.sessionId, () => void tasks.report({ sessionId: task.sessionId, state: "done", summary: "画好了" }));
    await flush();
    expect(store.collab.get(h.id)).toMatchObject({ state: "working", redos: 1 });
    expect(store.listMessages(CONV)).toHaveLength(before);
    expect(host.prompts.at(-1)!.text).toContain("[产品研究员让你重做（1/2）]");
    expect(store.collab.messages(h.pairKey).some((m) => m.text === "长简介超过 3 行没有折行，请改一下。（重做 1/2）")).toBe(true);
    await turn(task.sessionId, () => void tasks.report({ sessionId: task.sessionId, state: "done", summary: "改好了" }));
    await flush();
    expect(store.collab.get(h.id)!.state).toBe("done");
    expect(turns.at(-1)!.input).toContain("已让它重做 1 次，最多 2 次");
    expect(checkInput({ id: "h", bot: "B", ask: false, title: "x", criteria: "", reply: "", files: [], redos: 2, redoLimit: 2, additions: [] })).toContain("重做次数已经用完，如实告诉用户还差什么");
  });

  it("只问不做：B 的任务只读；A 把答案转述给你", async () => {
    say("问问产品助理，第二节封面为什么用深色？");
    send({ ask: true, task: "第二节封面为什么用深色？" });
    await flush();
    const h = handoffs()[0];
    expect(h.kind).toBe("ask");
    expect(h.message).toContain("不用动手，只回答就行。");
    expect(store.getTask(h.taskId)!.permission).toBe("readonly");
    const task = store.getTask(h.taskId)!;
    await turn(task.sessionId, () => void tasks.report({ sessionId: task.sessionId, state: "done", summary: "和首页一致，是 Melody 11-13 定的。" }));
    await flush();
    expect(turns[0].input).toContain("把答案转述给用户");
  });

  it("同一个机器人最多同时接 3 件，其余排队；排队超过 24 小时没开始的作废，A 告诉你", async () => {
    const topics = ["整理竞品的定价表", "给首页写三句标语", "检查第五页的字号", "把会议纪要译成英文"];
    for (const topic of topics) {
      say(`交给产品助理：${topic}`);
      expect(collab.send(A, CONV, true, { bot: "产品助理", task: topic }).text).toMatch(/^Sent/);
      await flush();
    }
    const list = handoffs().sort((x, y) => x.createdAt - y.createdAt);
    expect(list.filter((h) => h.state === "working")).toHaveLength(3);
    expect(list[3].state).toBe("queued");
    expect(store.collab.messages(list[3].pairKey).some((m) => m.kind === "note" && JSON.parse(m.text).code === "queued")).toBe(true);
    offset += QUEUE_MS;
    collab.sweep(Date.now() + offset);
    expect(store.collab.get(list[3].id)).toMatchObject({ state: "dropped", stopReason: "expired" });
    expect(store.listMessages(CONV).at(-1)!.content).toBe("产品助理排队超过 24 小时还没开始，这件事作废了。");
  });

  it("排着的这件开始前再查一次：B 换成了自己 API Key 的模型就作废，A 说明原因", async () => {
    const topics = ["整理竞品的定价表", "给首页写三句标语", "检查第五页的字号", "把会议纪要译成英文"];
    for (const topic of topics) {
      say(`交给产品助理：${topic}`);
      collab.send(A, CONV, true, { bot: "产品助理", task: topic });
      await flush();
    }
    const queued = handoffs().find((h) => h.state === "queued")!;
    store.updateBot(B, { defaultModel: "official-openai/gpt-x" });
    // 空出一个名额：第一件停下
    const first = handoffs().find((h) => h.state === "working")!;
    await collab.request(A, CONV, { id: first.id, action: "stop" });
    await flush(10);
    expect(store.collab.get(queued.id)).toMatchObject({ state: "dropped", stopReason: "model" });
    expect(store.listMessages(CONV).at(-1)!.content).toContain("换成了你自己的 API Key 模型");
  });

  it("花满停下：两人对话记灰字，A 告诉你做到哪并问要不要继续；说「继续」再给一份额度，不算新的一件", async () => {
    say("交给产品助理吧。");
    send();
    await flush();
    const h = handoffs()[0];
    const task = store.getTask(h.taskId)!;
    await turn(task.sessionId, () => void tasks.report({ sessionId: task.sessionId, state: "done", summary: "画好了空状态那张" }));
    await flush();
    expect(store.collab.get(h.id)!.state).toBe("done");
    // 补充要求（不算新的一件）：接着做，但这件事已经花满了
    store.updateTask(task.id, { spentUsd: 1.2 });
    say("让产品助理再加一张长简介的。");
    expect((await collab.request(A, CONV, { id: h.id, action: "add", text: "再加一张长简介的" })).text).toMatch(/Passed the addition/);
    await flush(10);
    const stopped = store.collab.get(h.id)!;
    expect(stopped).toMatchObject({ state: "stopped", stopReason: "budget" });
    expect(store.collab.messages(h.pairKey).some((m) => m.kind === "note" && JSON.parse(m.text).code === "budget")).toBe(true);
    expect(turns.at(-1)!.input).toContain("问用户要不要继续");
    const used = collab.usedToday();
    expect((await collab.request(A, CONV, { id: h.id, action: "continue" })).text).toMatch(/continues/);
    expect(store.getTask(task.id)!.budgetUsd).toBeCloseTo(2.2);
    expect(collab.usedToday()).toBe(used);
  });

  it("退出登录：进行中的停下，两人对话里记一行；重新登录后不自动继续", async () => {
    say("交给产品助理吧。");
    send();
    await flush();
    const h = handoffs()[0];
    collab.signedOut();
    expect(store.collab.get(h.id)).toMatchObject({ state: "stopped", stopReason: "signout" });
    expect(store.getTask(h.taskId)!.endReason).toBe("stopped");
    signedIn = true;
    tasks.pump();
    await flush();
    expect(store.collab.get(h.id)!.state).toBe("stopped");
  });

  it("删除机器人：B 被删时这件停下、A 告诉你；两人对话一起删除", async () => {
    say("交给产品助理吧。");
    send();
    await flush();
    collab.botDeleted(B);
    expect(store.listMessages(CONV).at(-1)!.content).toBe("产品助理已被删除，这件事停下了。");
    expect(store.collab.messages(pairKeyOf(A, B))).toEqual([]);
    expect(handoffs()).toEqual([]);
  });

  it("提示词：只有其他机器人时才写协作规则；登录且开着时才建议", () => {
    expect(botTeam([], true)).toBe("");
    expect(botTeam([{ name: "产品助理", persona: "" }], true)).toContain("只在用户明确说了才发");
    expect(botTeam([{ name: "产品助理", persona: "" }], false)).toContain("不要主动建议");
    expect(botTeam([{ name: "产品助理", persona: "" }])).not.toContain("message_bot");
    expect(handoffBrief({ from: "A", ask: true, message: "m", recent: [], files: [], folder: "f" })).toContain("不用动手，只回答就行");
    expect(redact("登录密码是 hunter2\n要点一")).not.toContain("hunter2");
  });
});
