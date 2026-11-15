/**
 * 应用内群聊（core/groups.ts）：谁回答、@ 怎么认、每轮发给机器人什么、接力上限；时间线怎么合并（Store.listGroupMessages）。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Store, groupPeer } from "../src/store/db.js";
import { GroupChats, MAX_INPUT_CHARS, MAX_RELAYS, chooseTargets, groupInput, mentionsIn } from "../src/core/groups.js";

const A = { id: "a", name: "小红" };
const B = { id: "b", name: "小红帽" };
const C = { id: "c", name: "Bob" };
const all = [A, B, C];

describe("mentionsIn", () => {
  it("名字可以紧跟中文，长的名字优先", () => {
    expect(mentionsIn("@小红你好", all).ids).toEqual(["a"]);
    expect(mentionsIn("@小红帽你好", all).ids).toEqual(["b"]);
  });
  it("按出现的顺序，不重复", () => {
    expect(mentionsIn("@Bob 和 @小红，还有 @Bob", all).ids).toEqual(["c", "a"]);
  });
  it("英文名不区分大小写，后面不能紧跟字母", () => {
    expect(mentionsIn("@bob 看看", all).ids).toEqual(["c"]);
    expect(mentionsIn("@Bobby 看看", all).ids).toEqual([]);
  });
  it("邮箱和代码里的 @ 不算", () => {
    expect(mentionsIn("写信给 me@Bob.com", all).ids).toEqual([]);
    expect(mentionsIn("装 `npm i @Bob/x`\n```\n@小红\n```", all).ids).toEqual([]);
  });
  it("认得 @所有人", () => {
    expect(mentionsIn("@所有人 看一下", all).all).toBe(true);
    expect(mentionsIn("@everyone look", all).all).toBe(true);
    expect(mentionsIn("所有人看一下", all).all).toBe(false);
  });
});

describe("chooseTargets", () => {
  it("@ 谁谁答", () => expect(chooseTargets("@Bob 看看", all, "a")).toEqual(["c"]));
  it("@所有人是全员", () => expect(chooseTargets("@所有人 看看", all, "a")).toEqual(["a", "b", "c"]));
  it("没 @ 时上一个回答的接着答", () => expect(chooseTargets("继续", all, "b")).toEqual(["b"]));
  it("还没人答过时是第一个成员", () => expect(chooseTargets("你好", all)).toEqual(["a"]));
  it("上一个回答的退群了也是第一个成员", () => expect(chooseTargets("你好", all, "gone")).toEqual(["a"]));
});

describe("groupInput", () => {
  const base = { group: "周报", me: "小红", others: ["Bob"] };
  it("新消息在最前面，说明里有群名、自己和其他成员", () => {
    const s = groupInput({ ...base, lines: [{ who: "用户", text: "写周报" }, { who: "Bob", text: "好" }] });
    expect(s.startsWith("用户：写周报\n\nBob：好")).toBe(true);
    expect(s).toContain("群聊「周报」");
    expect(s).toContain("你是 小红");
    expect(s).toContain("群里还有：Bob");
  });
  it("太长时只留最近的，并说明省略了", () => {
    const long = "字".repeat(MAX_INPUT_CHARS / 2);
    const s = groupInput({ ...base, lines: [{ who: "用户", text: "最早的话" }, { who: "Bob", text: long }, { who: "Bob", text: long }, { who: "Bob", text: long }, { who: "用户", text: "最新的话" }] });
    expect(s.startsWith("（更早的消息省略了）")).toBe(true);
    expect(s).not.toContain("最早的话");
    expect(s).toContain("最新的话");
  });
});

describe("界面", () => {
  const load = async () => {
    // 界面模块在浏览器里跑：只补上它们加载时要的那一点
    (globalThis as any).window ??= { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), addEventListener() {}, removeEventListener() {} };
    (globalThis as any).document ??= { documentElement: { dataset: {}, style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {} }, addEventListener() {}, removeEventListener() {} };
    (globalThis as any).localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
    // @ts-expect-error 界面代码是不经构建的 JS
    return import("../ui/screens/group.js");
  };
  it("光标前面正在输入的 @", async () => {
    const { mentionAt } = await load();
    expect(mentionAt("@", 1)).toEqual({ start: 0, query: "" });
    expect(mentionAt("你好@小", 4)).toEqual({ start: 2, query: "小" });
    expect(mentionAt("@小红 你好", 6)).toBeNull();
    expect(mentionAt("me@x", 4)).toBeNull();
    expect(mentionAt("@小红 @", 5)).toEqual({ start: 4, query: "" });
    // 光标在 @ 前面
    expect(mentionAt("你好@小", 1)).toBeNull();
  });
  it("头像：侧栏里最多两个，其余地方最多四个", async () => {
    const { GroupAvatars } = await load();
    const bots = ["a", "b", "c", "d", "e"].map((id) => ({ id, name: id }));
    expect((GroupAvatars({ bots, size: 38, pile: true }) as any).props.children).toHaveLength(2);
    expect((GroupAvatars({ bots, size: 22 }) as any).props.children).toHaveLength(4);
  });
});

describe("GroupChats", () => {
  let dir: string;
  let store: Store;
  let a: string, b: string, c: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "amb-groups-"));
    store = new Store(path.join(dir, "t.db"));
    a = store.createBot({ name: "小红" }).id;
    b = store.createBot({ name: "小蓝" }).id;
    c = store.createBot({ name: "小绿" }).id;
  });
  afterEach(() => {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /** 假的一轮：回复写进成员会话（和真实回合一样），记下谁、收到了什么 */
  function chats(reply: (botId: string, input: string) => string = () => "好的") {
    const turns: Array<{ botId: string; input: string }> = [];
    const service = new GroupChats({
      store,
      runTurn: async (botId, groupId, input) => {
        turns.push({ botId, input });
        const conv = store.ensureConversation(botId, "web", groupPeer(groupId), "", "group");
        store.addMessage(conv.id, "user", input);
        const text = reply(botId, input);
        store.addMessage(conv.id, "assistant", text);
        return text;
      },
    });
    const idle = (id: string) => new Promise<void>((r) => (service.isRunning(id) ? service.subscribe(id, (e) => e === "idle" && r()) : r()));
    return { service, turns, idle };
  }

  it("时间线：用户的话和各成员的回复按顺序合并，成员收到的输入不算", async () => {
    const g = store.createGroup("群", [a, b]);
    const { service, idle } = chats();
    service.send(g.id, "@小红 @小蓝 你们好");
    await idle(g.id);
    const list = store.listGroupMessages(g.id);
    expect(list.map((m) => [m.role, m.botId, m.content])).toEqual([
      ["user", "", "@小红 @小蓝 你们好"],
      ["assistant", a, "好的"],
      ["assistant", b, "好的"],
    ]);
  });

  it("重试绑定失败成员和原始轮次，不按点名接力，错误来源在重载后保留", async () => {
    const group = store.createGroup("群", [a, b]);
    const conv = store.ensureConversation(a, "web", groupPeer(group.id), "", "group");
    store.addMessage(conv.id, "user", "原始问题");
    const failed = store.addMessage(conv.id, "assistant", "⚠️ 402 low balance");
    store.setMessageErrorContext(failed, { groupId: group.id, model: "official-deepseek/model", input: "原始问题" });
    store.addMessage(conv.id, "user", "之后的新问题");
    const { service, turns, idle } = chats(() => "@小蓝 请接着做");
    expect(service.retry(group.id, failed)).toBe("started");
    expect(service.retry(group.id, failed)).toBe("busy");
    await idle(group.id);
    expect(turns).toEqual([{ botId: a, input: "原始问题" }]);
    expect(store.listGroupMessages(group.id).find((m) => m.id === failed)?.errorContext?.model).toBe("official-deepseek/model");
    const other = store.createGroup("另一个群", [a, b]);
    expect(service.retry(other.id, failed)).toBe("missing");
  });

  it("重试有副作用的失败轮次先要求确认，旧消息可从原会话取回请求", async () => {
    const group = store.createGroup("群", [a, b]);
    const conv = store.ensureConversation(b, "web", groupPeer(group.id), "", "group");
    store.addMessage(conv.id, "user", "原始请求");
    const failed = store.addMessage(conv.id, "assistant", "⚠️ 402", [{ tool: "write_file" }]);
    const { service, turns, idle } = chats();
    expect(service.retry(group.id, failed)).toBe("confirm");
    expect(turns).toEqual([]);
    expect(service.retry(group.id, failed, true)).toBe("started");
    await idle(group.id);
    expect(turns).toEqual([{ botId: b, input: "原始请求" }]);
  });

  it("后面的机器人能看到前面的回复，每轮只收到新消息", async () => {
    const g = store.createGroup("群", [a, b]);
    const { service, turns, idle } = chats((id) => (id === a ? "红的回答" : "蓝的回答"));
    service.send(g.id, "@小红 @小蓝 第一问");
    await idle(g.id);
    expect(turns[0].input).toContain("第一问");
    expect(turns[1].input).toContain("小红：红的回答");

    service.send(g.id, "@小红 第二问");
    await idle(g.id);
    expect(turns[2].botId).toBe(a);
    expect(turns[2].input).toContain("小蓝：蓝的回答");
    expect(turns[2].input).toContain("用户：@小红 第二问");
    expect(turns[2].input).not.toContain("第一问");
    expect(turns[2].input).not.toContain("小红：红的回答");
  });

  it("没 @ 时由上一个回答的接着答", async () => {
    const g = store.createGroup("群", [a, b]);
    const { service, turns, idle } = chats();
    service.send(g.id, "@小蓝 你来");
    await idle(g.id);
    service.send(g.id, "继续");
    await idle(g.id);
    expect(turns.map((x) => x.botId)).toEqual([b, b]);
  });

  it("机器人 @ 别的成员就接力，不 @ 自己", async () => {
    const g = store.createGroup("群", [a, b, c]);
    const { service, turns, idle } = chats((id) => (id === a ? "@小蓝 你看看，@小红 我再想想" : "看过了"));
    service.send(g.id, "@小红 开始");
    await idle(g.id);
    expect(turns.map((x) => x.botId)).toEqual([a, b]);
  });

  it("接力有上限，到了就停并留一句话", async () => {
    const g = store.createGroup("群", [a, b]);
    const { service, turns, idle } = chats((id) => (id === a ? "@小蓝 该你了" : "@小红 该你了"));
    service.send(g.id, "@小红 开始");
    await idle(g.id);
    expect(turns).toHaveLength(MAX_RELAYS + 1);
    const last = store.listGroupMessages(g.id).findLast((m) => m.role === "system");
    expect(last?.content).toBeTruthy();
    // 再发一句，额度重新算
    service.send(g.id, "@小红 再来");
    await idle(g.id);
    expect(turns).toHaveLength(2 * (MAX_RELAYS + 1));
  });

  it("系统提示不发给机器人", async () => {
    const g = store.createGroup("群", [a, b]);
    store.addMessage(groupPeer(g.id), "system", "系统的话");
    const { service, turns, idle } = chats();
    service.send(g.id, "你好");
    await idle(g.id);
    expect(turns[0].input).not.toContain("系统的话");
  });

  it("失败的回复（⚠️）不发给别的机器人", async () => {
    const g = store.createGroup("群", [a, b]);
    const { service, turns, idle } = chats((id) => (id === a ? "⚠️ 模型出错了" : "收到"));
    service.send(g.id, "@小红 @小蓝 开始");
    await idle(g.id);
    expect(turns[1].input).not.toContain("模型出错了");
  });

  it("停止：后面排着的不再回答", async () => {
    const g = store.createGroup("群", [a, b]);
    const { service, turns, idle } = chats();
    service.send(g.id, "@小红 @小蓝 开始");
    service.stop(g.id);
    await idle(g.id);
    expect(turns.length).toBeLessThanOrEqual(1);
  });

  it("删除机器人：从群里移除；删除群：会话和消息都清掉", async () => {
    const g = store.createGroup("群", [a, b, c]);
    const { service, idle } = chats();
    service.send(g.id, "@小红 你好");
    await idle(g.id);
    store.deleteBot(c);
    expect(store.getGroup(g.id)!.members).toEqual([a, b]);
    store.deleteGroup(g.id);
    expect(store.getGroup(g.id)).toBeUndefined();
    expect(store.listGroupMessages(g.id)).toEqual([]);
    expect(store.getConversation(`${a}:web:${groupPeer(g.id)}`)).toBeUndefined();
  });

  it("上一个回答的退群后，没 @ 时回到第一个成员", async () => {
    const g = store.createGroup("群", [a, b, c]);
    const { service, turns, idle } = chats();
    service.send(g.id, "@小绿 你好");
    await idle(g.id);
    store.updateGroup(g.id, { members: [a, b] });
    expect(store.getGroup(g.id)!.lastBot).toBe("");
    service.send(g.id, "继续");
    await idle(g.id);
    expect(turns.at(-1)!.botId).toBe(a);
    // 退群的成员说过的话还在时间线里
    expect(store.listGroupMessages(g.id).some((m) => m.botId === c)).toBe(true);
  });
});
