import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store, groupPeer } from "../src/store/db.js";
import { ChatSearchInputError } from "../src/store/chat-search.js";

describe("local chat search", () => {
  let dir: string, store: Store, conv: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "amb-chat-search-"));
    store = new Store(path.join(dir, "history.db"));
    store.createBot({ id: "film", name: "Film Studio" });
    store.createBot({ id: "research", name: "Research" });
    conv = store.ensureConversation("film", "web", "console").id;
  });
  afterEach(() => { store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const search = (query: string, rest: Record<string, any> = {}) => store.chatSearch.search({ query, ...rest });

  it("finds old CJK messages and interim speech beyond the loaded chat window", () => {
    const old = store.addMessage(conv, "user", "请检查分镜与角色的一致性");
    for (let i = 0; i < 550; i++) store.addMessage(conv, "assistant", `Unrelated reply ${i}`);
    const interim = store.addMessage(conv, "assistant", "Done", [], { interim: ["分镜已经检查完了"] });
    expect(store.listMessages(conv, 200).map((m) => m.id)).not.toContain(old);
    expect(search("分镜").results.map((r) => r.id)).toEqual([interim, old]);
    expect(search("镜").total).toBe(2);
    expect(search("分镜与角色").results[0].id).toBe(old);
    const context = store.chatSearch.context(old)!;
    expect(context.messages[0].id).toBe(old);
    expect(context.hasAfter).toBe(true);
    expect(context.hasBefore).toBe(false);
  });

  it("matches Unicode case and punctuation literally without SQL/FTS operators", () => {
    const a = store.addMessage(conv, "assistant", 'ПрИвЕт Мир / HELLO / 100%_done / [draft] "quotes"');
    for (const q of ["привет", "МИ", "hello", "%_", "100%_done", "[draft]", '"quotes"']) expect(search(q).results.map((r) => r.id), q).toEqual([a]);
    expect(search("%missing%").total).toBe(0);
    expect(search('" OR 1=1 --').total).toBe(0);
    const ja = store.addMessage(conv, "user", "テスト映像を確認します");
    const ko = store.addMessage(conv, "user", "스토리보드 확인");
    expect(search("テスト").results[0].id).toBe(ja);
    expect(search("스토리").results[0].id).toBe(ko);
  });

  it("filters bot, channel, conversation and date, and pages equal timestamps without duplicates", () => {
    const other = store.ensureConversation("research", "feishu", "peer-a", "Project team").id;
    const ids = Array.from({ length: 9 }, () => store.addMessage(conv, "user", "needle"));
    store.db.prepare("UPDATE messages SET created_at = 1000").run();
    store.addMessage(other, "assistant", "needle external");
    store.addMessage(conv, "system", "needle system prompt");
    expect(search("needle", { botId: "research" }).results[0]).toMatchObject({ channel: "feishu", title: "Project team" });
    expect(search("needle", { channel: "feishu" }).total).toBe(1);
    expect(search("needle", { conversationId: conv }).total).toBe(9);
    const found: number[] = []; let cursor: string | undefined;
    do {
      const page = search("needle", { from: 1000, to: 1001, limit: 3, cursor });
      expect(page.total).toBe(9); found.push(...page.results.map((r) => r.id)); cursor = page.nextCursor || undefined;
    } while (cursor);
    expect(found).toEqual(ids.reverse());
    expect(search("needle", { from: 1001, channel: "web" }).total).toBe(0);
  });

  it("indexes the visible group timeline once, including the user's standalone group messages", () => {
    const group = store.createGroup("Film discussion", ["film", "research"]);
    const peer = groupPeer(group.id);
    const a = store.ensureConversation("film", "web", peer, "", "group").id;
    const b = store.ensureConversation("research", "web", peer, "", "group").id;
    const user = store.addMessage(peer, "user", "分镜共享讨论");
    store.addMessage(a, "user", "分镜共享讨论 copied input");
    store.addMessage(b, "user", "分镜共享讨论 copied input");
    const reply = store.addMessage(a, "assistant", "分镜共享回复");
    expect(search("分镜共享").results.map((r) => r.id)).toEqual([reply, user]);
    expect(search("分镜共享", { groupId: group.id }).total).toBe(2);
    expect(search("分镜共享", { groupId: "missing" }).total).toBe(0);
    const context = store.chatSearch.context(user)!;
    expect(context.target).toMatchObject({ groupId: group.id, title: "Film discussion", channel: "web" });
    expect(context.messages.map((m) => m.id)).toEqual([user, reply]);
    store.deleteGroup(group.id);
    expect(search("分镜共享").total).toBe(0);
    expect(store.chatSearch.context(user)).toBeUndefined();
  });

  it("updates the index on edits/deletion and backfills an existing database without changing messages", () => {
    const id = store.addMessage(conv, "user", "original phrase");
    store.db.prepare("UPDATE messages SET content = ? WHERE id = ?").run("replacement phrase", id);
    expect(search("original").total).toBe(0);
    expect(search("replacement").results[0].id).toBe(id);
    store.db.exec("DROP TRIGGER message_search_insert; DROP TRIGGER message_search_update; DROP TRIGGER message_search_delete; DROP TABLE message_search");
    const before = store.listMessages(conv);
    store.close(); store = new Store(path.join(dir, "history.db"));
    expect(store.listMessages(conv)).toEqual(before);
    expect(search("replacement").results[0].id).toBe(id);
    store.db.prepare("DELETE FROM messages WHERE id = ?").run(id);
    expect(search("replacement").total).toBe(0);
    store.close(); store = new Store(path.join(dir, "history.db"));
    expect(search("replacement").total).toBe(0);
  });

  it("pages context in both directions without leaking a neighboring conversation", () => {
    const ids = Array.from({ length: 150 }, (_, i) => store.addMessage(conv, "user", `message ${i}`));
    const other = store.ensureConversation("research", "web", "console").id;
    store.addMessage(other, "user", "private neighbor");
    const center = store.chatSearch.context(ids[75], 2, 3)!;
    expect(center.messages.map((m) => m.id)).toEqual(ids.slice(73, 79));
    expect(center.hasBefore && center.hasAfter).toBe(true);
    const next = store.chatSearch.context(center.messages.at(-1)!.id, 0, 100)!;
    expect(next.messages.every((m) => m.conversationId === conv)).toBe(true);
    expect(next.hasAfter).toBe(false);
  });

  it("rejects invalid ranges and cursors reused with a different query", () => {
    store.addMessage(conv, "user", "test needle"); store.addMessage(conv, "user", "test needle");
    const cursor = search("test", { limit: 1 }).nextCursor!;
    for (const rest of [{ limit: 101 }, { limit: -1 }, { from: NaN }, { from: 2, to: 1 }, { cursor: "bad" }, { cursor }]) {
      expect(() => search("needle", rest)).toThrow(ChatSearchInputError);
    }
    expect(() => search("x".repeat(201))).toThrow(ChatSearchInputError);
    expect(() => store.chatSearch.context(-1)).toThrow(ChatSearchInputError);
  });

  it("keeps pagination stable when a new matching message arrives", () => {
    const first = store.addMessage(conv, "user", "snapshot needle");
    store.addMessage(conv, "assistant", "snapshot needle");
    const page = search("snapshot", { limit: 1 });
    store.addMessage(conv, "assistant", "snapshot new message");
    const next = search("snapshot", { limit: 1, cursor: page.nextCursor });
    expect(next.total).toBe(2);
    expect(next.results.map((r) => r.id)).toEqual([first]);
    expect(next.nextCursor).toBeNull();
    expect(search("snapshot").total).toBe(3);
  });
});
