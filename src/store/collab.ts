/**
 * 机器人之间发消息（PRD 2026-11-15 R5–R12）的存储：件（handoffs）和两人对话（pair_messages）。只由 CollabService 写（collab/service.ts）。
 * B 干活本身是 B 名下的一个后台任务（tasks.handoff_id 指回这件），名额、预算、时间上限、审批、重启恢复都走任务那一套。
 */
import type { DatabaseSync } from "node:sqlite";

type Row = Record<string, unknown>;

/** 排队 → 处理中 → 等你 → 已回消息 →（A 核对）完成；另有停下、作废 */
export type HandoffState = "queued" | "working" | "waiting" | "replied" | "done" | "stopped" | "dropped";
/** 停下 / 作废的原因 */
export type HandoffStop = "" | "timeout" | "budget" | "error" | "user" | "signout" | "deleted" | "expired" | "model" | "off";

export interface HandoffRow {
  id: string;
  /** A：发消息的机器人；B：收到、去干活的 */
  fromBot: string;
  toBot: string;
  pairKey: string;
  /** 你和 A 的主对话（应用里的单聊） */
  conversationId: string;
  /** B 名下的后台任务 */
  taskId: string;
  /** do：去做；ask：只问不做 */
  kind: "do" | "ask";
  title: string;
  /** A 发给 B 的全文（要做什么、要点、文件、做完的标准） */
  message: string;
  criteria: string;
  state: HandoffState;
  stopReason: HandoffStop;
  /** 出错时的原因（给两人对话里那行灰字） */
  error: string;
  redos: number;
  redoLimit: number;
  /** 这件事的花费、时长上限（发起时的设置；说「继续」再给一份） */
  budgetUsd: number;
  capMs: number;
  /** B 最近一次回的消息（结果说明）和文件（已复制进 A 的工作区，相对 A 的工作区） */
  replyText: string;
  replyFiles: string[];
  /** A 核对汇总后回复你的那条消息（「收到 {B} 的消息」挂在它上面） */
  doneMessageId: number;
  /** 这件事的花费（B 的任务估算的） */
  spentUsd: number;
  /** 发起那天（本机时区，每天上限按它算） */
  day: string;
  createdAt: number;
  startedAt: number;
  repliedAt: number;
  endedAt: number;
  updatedAt: number;
}

export interface PairMessage {
  id: number;
  pairKey: string;
  handoffId: string;
  /** 谁说的（机器人 id）；灰字是空 */
  from: string;
  /** message：A 或 B 的消息；note：居中的一行灰字（text 是 JSON：{ code, params }）；steps：B 的处理过程（摘要 + run） */
  kind: "message" | "note" | "steps";
  text: string;
  files: string[];
  runId: string;
  at: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS handoffs (
  id TEXT PRIMARY KEY, from_bot TEXT NOT NULL, to_bot TEXT NOT NULL, pair_key TEXT NOT NULL,
  conversation_id TEXT NOT NULL, task_id TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'do',
  title TEXT NOT NULL, message TEXT NOT NULL, criteria TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL, stop_reason TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '',
  redos INTEGER NOT NULL DEFAULT 0, redo_limit INTEGER NOT NULL DEFAULT 2,
  budget_usd REAL NOT NULL DEFAULT 1, cap_ms INTEGER NOT NULL DEFAULT 14400000,
  reply_text TEXT NOT NULL DEFAULT '', reply_files TEXT NOT NULL DEFAULT '[]', done_message_id INTEGER NOT NULL DEFAULT 0,
  spent_usd REAL NOT NULL DEFAULT 0, day TEXT NOT NULL,
  created_at INTEGER NOT NULL, started_at INTEGER NOT NULL DEFAULT 0, replied_at INTEGER NOT NULL DEFAULT 0,
  ended_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS handoffs_conv ON handoffs(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS handoffs_pair ON handoffs(pair_key, created_at);
CREATE INDEX IF NOT EXISTS handoffs_to ON handoffs(to_bot, state);
CREATE INDEX IF NOT EXISTS handoffs_day ON handoffs(day);
CREATE TABLE IF NOT EXISTS pair_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, pair_key TEXT NOT NULL, handoff_id TEXT NOT NULL DEFAULT '',
  from_bot TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL, text TEXT NOT NULL, files TEXT NOT NULL DEFAULT '[]',
  run_id TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS pair_messages_pair ON pair_messages(pair_key, id);
`;

const COLS: Record<string, string> = {
  taskId: "task_id",
  title: "title",
  message: "message",
  state: "state",
  stopReason: "stop_reason",
  error: "error",
  redos: "redos",
  redoLimit: "redo_limit",
  budgetUsd: "budget_usd",
  capMs: "cap_ms",
  replyText: "reply_text",
  replyFiles: "reply_files",
  doneMessageId: "done_message_id",
  spentUsd: "spent_usd",
  startedAt: "started_at",
  repliedAt: "replied_at",
  endedAt: "ended_at",
  updatedAt: "updated_at",
};

/** 一对机器人的键：两个 id 排好序（谁发给谁都是同一个两人对话） */
export const pairKeyOf = (a: string, b: string) => [a, b].sort().join("|");

const strings = (v: unknown): string[] => {
  try {
    const x = JSON.parse(String(v ?? "[]"));
    return Array.isArray(x) ? x.map(String) : [];
  } catch {
    return [];
  }
};

export class CollabStore {
  constructor(private db: DatabaseSync) {
    db.exec(SCHEMA);
  }

  private toHandoff(r: Row): HandoffRow {
    return {
      id: String(r.id),
      fromBot: String(r.from_bot),
      toBot: String(r.to_bot),
      pairKey: String(r.pair_key),
      conversationId: String(r.conversation_id),
      taskId: String(r.task_id),
      kind: String(r.kind) === "ask" ? "ask" : "do",
      title: String(r.title),
      message: String(r.message),
      criteria: String(r.criteria),
      state: String(r.state) as HandoffState,
      stopReason: String(r.stop_reason) as HandoffStop,
      error: String(r.error),
      redos: Number(r.redos),
      redoLimit: Number(r.redo_limit),
      budgetUsd: Number(r.budget_usd),
      capMs: Number(r.cap_ms),
      replyText: String(r.reply_text),
      replyFiles: strings(r.reply_files),
      doneMessageId: Number(r.done_message_id),
      spentUsd: Number(r.spent_usd),
      day: String(r.day),
      createdAt: Number(r.created_at),
      startedAt: Number(r.started_at),
      repliedAt: Number(r.replied_at),
      endedAt: Number(r.ended_at),
      updatedAt: Number(r.updated_at),
    };
  }

  insert(h: Pick<HandoffRow, "id" | "fromBot" | "toBot" | "conversationId" | "kind" | "title" | "message" | "criteria" | "redoLimit" | "budgetUsd" | "capMs" | "day" | "createdAt">): HandoffRow {
    this.db
      .prepare(
        `INSERT INTO handoffs(id, from_bot, to_bot, pair_key, conversation_id, kind, title, message, criteria, state, redo_limit, budget_usd, cap_ms, day, created_at, updated_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?)`,
      )
      .run(h.id, h.fromBot, h.toBot, pairKeyOf(h.fromBot, h.toBot), h.conversationId, h.kind, h.title, h.message, h.criteria, h.redoLimit, h.budgetUsd, h.capMs, h.day, h.createdAt, h.createdAt);
    return this.get(h.id)!;
  }

  get(id: string): HandoffRow | undefined {
    const r = this.db.prepare("SELECT * FROM handoffs WHERE id = ?").get(id) as Row | undefined;
    return r ? this.toHandoff(r) : undefined;
  }

  byTask(taskId: string): HandoffRow | undefined {
    if (!taskId) return undefined;
    const r = this.db.prepare("SELECT * FROM handoffs WHERE task_id = ?").get(taskId) as Row | undefined;
    return r ? this.toHandoff(r) : undefined;
  }

  update(id: string, patch: Partial<Omit<HandoffRow, "id" | "fromBot" | "toBot" | "pairKey" | "conversationId" | "kind" | "day" | "createdAt" | "criteria">>): void {
    const keys = Object.keys(patch).filter((k) => COLS[k]);
    if (!keys.length) return;
    const vals = keys.map((k) => {
      const v = (patch as Record<string, unknown>)[k];
      return Array.isArray(v) ? JSON.stringify(v) : (v as string | number);
    });
    this.db.prepare(`UPDATE handoffs SET ${keys.map((k) => `${COLS[k]} = ?`).join(", ")} WHERE id = ?`).run(...vals, id);
  }

  list(o: { conversationId?: string; fromBot?: string; toBot?: string; pairKey?: string; states?: HandoffState[]; day?: string; limit?: number } = {}): HandoffRow[] {
    const where: string[] = [];
    const args: Array<string | number> = [];
    if (o.conversationId) (where.push("conversation_id = ?"), args.push(o.conversationId));
    if (o.fromBot) (where.push("from_bot = ?"), args.push(o.fromBot));
    if (o.toBot) (where.push("to_bot = ?"), args.push(o.toBot));
    if (o.pairKey) (where.push("pair_key = ?"), args.push(o.pairKey));
    if (o.day) (where.push("day = ?"), args.push(o.day));
    if (o.states?.length) (where.push(`state IN (${o.states.map(() => "?").join(",")})`), args.push(...o.states));
    const sql = `SELECT * FROM handoffs ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC LIMIT ${Math.max(1, Math.min(1000, o.limit ?? 200))}`;
    return (this.db.prepare(sql).all(...args) as Row[]).map((r) => this.toHandoff(r));
  }

  /** 某天（本机时区）发起了几件 */
  countDay(day: string): number {
    return Number((this.db.prepare("SELECT COUNT(*) AS n FROM handoffs WHERE day = ?").get(day) as Row).n);
  }

  // ---------- 两人对话 ----------

  addMessage(m: Omit<PairMessage, "id" | "files" | "runId"> & { files?: string[]; runId?: string }): number {
    const r = this.db
      .prepare("INSERT INTO pair_messages(pair_key, handoff_id, from_bot, kind, text, files, run_id, at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)")
      .run(m.pairKey, m.handoffId, m.from, m.kind, m.text, JSON.stringify(m.files ?? []), m.runId ?? "", m.at);
    return Number(r.lastInsertRowid);
  }

  messages(pairKey: string, limit = 500): PairMessage[] {
    const rows = this.db.prepare("SELECT * FROM (SELECT * FROM pair_messages WHERE pair_key = ? ORDER BY id DESC LIMIT ?) ORDER BY id").all(pairKey, limit) as Row[];
    return rows.map((r) => ({
      id: Number(r.id),
      pairKey: String(r.pair_key),
      handoffId: String(r.handoff_id),
      from: String(r.from_bot),
      kind: String(r.kind) as PairMessage["kind"],
      text: String(r.text),
      files: strings(r.files),
      runId: String(r.run_id),
      at: Number(r.at),
    }));
  }

  /** 每对机器人：最近一条消息和累计花费（设置 › 机器人协作的列表） */
  pairs(): Array<{ pairKey: string; lastAt: number; spentUsd: number; open: number }> {
    const rows = this.db
      .prepare(
        `SELECT p.pair_key AS pair_key, MAX(p.at) AS last_at,
          (SELECT COALESCE(SUM(spent_usd), 0) FROM handoffs h WHERE h.pair_key = p.pair_key) AS spent,
          (SELECT COUNT(*) FROM handoffs h WHERE h.pair_key = p.pair_key AND h.state IN ('queued','working','waiting','replied')) AS open
         FROM pair_messages p GROUP BY p.pair_key ORDER BY last_at DESC`,
      )
      .all() as Row[];
    return rows.map((r) => ({ pairKey: String(r.pair_key), lastAt: Number(r.last_at), spentUsd: Number(r.spent), open: Number(r.open) }));
  }

  lastMessage(pairKey: string): PairMessage | undefined {
    return this.messages(pairKey, 1).at(-1);
  }

  /** 删除机器人时，和它有关的两人对话一起删除 */
  dropBot(botId: string): void {
    const keys = (this.db.prepare("SELECT DISTINCT pair_key FROM pair_messages").all() as Row[]).map((r) => String(r.pair_key)).filter((k) => k.split("|").includes(botId));
    for (const k of keys) this.db.prepare("DELETE FROM pair_messages WHERE pair_key = ?").run(k);
    this.db.prepare("DELETE FROM handoffs WHERE from_bot = ? OR to_bot = ?").run(botId, botId);
  }
}
