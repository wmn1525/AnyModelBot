import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Message } from "./db.js";

type Row = Record<string, any>;
export class ChatSearchInputError extends Error {}
export interface ChatSearchQuery {
  query: string;
  botId?: string;
  groupId?: string;
  conversationId?: string;
  channel?: string;
  from?: number;
  to?: number;
  cursor?: string;
  limit?: number;
}
export interface ChatSearchHit {
  id: number;
  conversationId: string;
  botId: string;
  botName: string;
  groupId: string;
  groupName: string;
  channel: string;
  title: string;
  role: "user" | "assistant";
  createdAt: number;
  snippet: string;
}

// Only user-visible speech is indexed. Tool activity and system prompts stay out.
const documentSql = (row: string) => `COALESCE((SELECT group_concat(value, char(10)) FROM json_each(CASE WHEN json_valid(${row}.interim) THEN ${row}.interim ELSE '[]' END) WHERE type = 'text'), '') || char(10) || ${row}.content`;
const FROM = `FROM messages m
  LEFT JOIN conversations c ON c.id = m.conversation_id
  LEFT JOIN bots b ON b.id = c.bot_id
  LEFT JOIN bot_groups g ON (m.conversation_id = 'group:' || g.id OR (c.channel = 'web' AND c.peer_id = 'group:' || g.id))`;
// A group stores the user's message once and also copies it into member inputs.
// Search the visible timeline, not those copied agent inputs or orphaned records.
const VISIBLE = `m.role IN ('user', 'assistant') AND (
  (g.id IS NOT NULL AND (m.conversation_id = 'group:' || g.id OR m.role = 'assistant')) OR
  (g.id IS NULL AND b.id IS NOT NULL AND NOT (c.channel = 'web' AND substr(c.peer_id, 1, 6) = 'group:'))
)`;
const META = `COALESCE(c.bot_id, '') AS botId, COALESCE(b.name, '') AS botName,
  COALESCE(g.id, '') AS groupId, COALESCE(g.name, '') AS groupName,
  CASE WHEN g.id IS NOT NULL THEN 'web' ELSE c.channel END AS channel,
  COALESCE(g.name, NULLIF(c.title, ''), b.name, '') AS title`;

function boundedInteger(value: unknown, fallback: number, max: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > max) throw new ChatSearchInputError("Invalid range");
  return value;
}

function excerpt(text: string, query: string): string {
  const at = query ? text.toLowerCase().indexOf(query.toLowerCase()) : 0;
  let start = Math.max(0, at - 70);
  if (start && /[\uDC00-\uDFFF]/.test(text[start])) start--;
  const end = Math.min(text.length, start + Math.max(240, query.length + 140));
  const preview = text.slice(start, end).split(/\r?\n/).join(" ").trim();
  return `${start ? "…" : ""}${preview}${end < text.length ? "…" : ""}`;
}

function hit(row: Row, query: string): ChatSearchHit {
  return { id: Number(row.id), conversationId: String(row.conversation_id), botId: String(row.botId), botName: String(row.botName),
    groupId: String(row.groupId), groupName: String(row.groupName), channel: String(row.channel), title: String(row.title),
    role: row.role, createdAt: Number(row.created_at), snippet: excerpt(String(row.document ?? row.content), query) };
}

/** Local literal substring search. Trigrams accelerate longer queries, including CJK.
 * One/two-character queries use the same Unicode-insensitive substring semantics.
 * A plain-table fallback keeps chat available on SQLite builds without FTS5.
 */
export class ChatSearch {
  private indexed = false;
  constructor(private db: DatabaseSync, private toMessage: (row: Row) => Message) {
    db.function("amb_search_contains", { deterministic: true }, (body, query) => String(body ?? "").toLowerCase().includes(String(query ?? "").toLowerCase()) ? 1 : 0);
    const existing = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'message_search'").get() as Row | undefined;
    if (!existing) {
      db.exec("BEGIN IMMEDIATE");
      try {
        try {
          db.exec("CREATE VIRTUAL TABLE message_search USING fts5(text, tokenize='trigram')");
          this.indexed = true;
        } catch (e) {
          if (!/no such (module|tokenizer)/i.test(String(e))) throw e;
          db.exec("CREATE TABLE message_search(rowid INTEGER PRIMARY KEY, text TEXT NOT NULL)");
        }
        this.installTriggers();
        db.exec(`INSERT INTO message_search(rowid, text) SELECT m.id, ${documentSql("m")} FROM messages m WHERE m.role IN ('user', 'assistant')`);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    } else {
      this.indexed = /USING\s+fts5/i.test(String(existing.sql));
      this.installTriggers();
    }
  }

  private installTriggers(): void {
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS message_search_insert AFTER INSERT ON messages WHEN new.role IN ('user', 'assistant') BEGIN
        INSERT INTO message_search(rowid, text) VALUES (new.id, ${documentSql("new")});
      END;
      CREATE TRIGGER IF NOT EXISTS message_search_update AFTER UPDATE OF content, interim, role ON messages BEGIN
        DELETE FROM message_search WHERE rowid = old.id;
        INSERT INTO message_search(rowid, text) SELECT new.id, ${documentSql("new")} WHERE new.role IN ('user', 'assistant');
      END;
      CREATE TRIGGER IF NOT EXISTS message_search_delete AFTER DELETE ON messages BEGIN
        DELETE FROM message_search WHERE rowid = old.id;
      END;
    `);
  }

  conversations(): Array<{ id: string; botId: string; botName: string; channel: string; title: string; lastMessageId: number }> {
    const rows = this.db.prepare(`SELECT c.id, c.bot_id AS botId, b.name AS botName, c.channel,
      COALESCE(NULLIF(c.title, ''), c.peer_id) AS title,
      (SELECT MAX(m.id) FROM messages m WHERE m.conversation_id = c.id AND m.role IN ('user','assistant')) AS lastMessageId
      FROM conversations c JOIN bots b ON b.id = c.bot_id
      WHERE c.channel != 'web' AND lastMessageId IS NOT NULL ORDER BY c.updated_at DESC, c.id`).all() as Row[];
    return rows.map((r) => ({ id: String(r.id), botId: String(r.botId), botName: String(r.botName), channel: String(r.channel), title: String(r.title), lastMessageId: Number(r.lastMessageId) }));
  }

  /**
   * 最近的对话（搜索弹窗没输入时列出来）：每条时间线（群聊算一条，其余一个会话一条）最新那条能看到的消息，新的在前。
   * 先按会话取最大 id（走 msg_conv 索引，不扫全表），再按时间线合并：群里成员的回复存在各自的会话里。
   */
  recent(limit = 50): ChatSearchHit[] {
    limit = boundedInteger(limit, 50, 200);
    const rows = this.db.prepare(`SELECT m.id, m.conversation_id, m.role, m.created_at, ${documentSql("m")} AS document, ${META}
      ${FROM} WHERE m.id IN (SELECT MAX(x.id) FROM messages x WHERE x.role IN ('user', 'assistant') GROUP BY x.conversation_id) AND ${VISIBLE}
      ORDER BY m.created_at DESC, m.id DESC`).all() as Row[];
    const seen = new Set<string>();
    const out: ChatSearchHit[] = [];
    for (const r of rows) {
      const line = r.groupId ? `group:${r.groupId}` : String(r.conversation_id);
      if (seen.has(line)) continue;
      seen.add(line);
      out.push(hit(r, ""));
      if (out.length >= limit) break;
    }
    return out;
  }

  search(input: ChatSearchQuery): { query: string; results: ChatSearchHit[]; total: number; nextCursor: string | null } {
    if (typeof input.query !== "string" || input.query.length > 200 || input.query.includes("\0")) throw new ChatSearchInputError("Invalid query");
    const query = input.query.trim();
    const limit = boundedInteger(input.limit, 40, 100);
    if (!limit) throw new ChatSearchInputError("Invalid limit");
    const from = boundedInteger(input.from, 0, Number.MAX_SAFE_INTEGER);
    const to = boundedInteger(input.to, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
    if (to <= from) throw new ChatSearchInputError("Invalid dates");
    for (const value of [input.botId, input.groupId, input.conversationId, input.channel]) if (value !== undefined && (typeof value !== "string" || value.length > 500 || value.includes("\0"))) throw new ChatSearchInputError("Invalid scope");
    if (!query) return { query, results: [], total: 0, nextCursor: null };
    const conditions = [VISIBLE, "amb_search_contains(message_search.text, ?) = 1", "m.created_at >= ?", "m.created_at < ?"];
    const values: Array<string | number> = [query, from, to];
    if (this.indexed && Array.from(query).length >= 3) {
      conditions.push("message_search MATCH ?");
      values.push('"' + query.replaceAll('"', '""') + '"');
    }
    for (const [column, value] of [["c.bot_id", input.botId], ["g.id", input.groupId], ["m.conversation_id", input.conversationId], ["CASE WHEN g.id IS NOT NULL THEN 'web' ELSE c.channel END", input.channel]]) {
      if (value) { conditions.push(`${column} = ?`); values.push(value); }
    }
    const fingerprint = createHash("sha256").update(JSON.stringify([query, input.botId || "", input.groupId || "", input.conversationId || "", input.channel || "", from, to])).digest("hex").slice(0, 24);
    const join = `${FROM} JOIN message_search ON message_search.rowid = m.id`;
    let point: { at: number; id: number; max: number } | undefined;
    if (input.cursor) {
      try {
        if (input.cursor.length > 500) throw new Error();
        const c = JSON.parse(Buffer.from(input.cursor, "base64url").toString());
        if (c.key !== fingerprint || !Number.isSafeInteger(c.id) || c.id < 1 || !Number.isSafeInteger(c.at) || c.at < 0 || !Number.isSafeInteger(c.max) || c.max < c.id) throw new Error();
        point = c;
      } catch { throw new ChatSearchInputError("Invalid cursor"); }
    }
    const max = point?.max ?? Number((this.db.prepare("SELECT COALESCE(MAX(id), 0) AS n FROM messages").get() as Row).n);
    conditions.push("m.id <= ?"); values.push(max);
    const total = Number((this.db.prepare(`SELECT count(*) AS n ${join} WHERE ${conditions.join(" AND ")}`).get(...values) as Row).n);
    if (point) {
      conditions.push("(m.created_at < ? OR (m.created_at = ? AND m.id < ?))");
      values.push(point.at, point.at, point.id);
    }
    const rows = this.db.prepare(`SELECT m.id, m.conversation_id, m.role, m.created_at, message_search.text AS document, ${META}
      ${join} WHERE ${conditions.join(" AND ")} ORDER BY m.created_at DESC, m.id DESC LIMIT ?`).all(...values, limit + 1) as Row[];
    const more = rows.length > limit;
    const results = rows.slice(0, limit).map((r) => hit(r, query));
    const last = results.at(-1);
    return { query, results, total, nextCursor: more && last ? Buffer.from(JSON.stringify({ key: fingerprint, at: last.createdAt, id: last.id, max })).toString("base64url") : null };
  }

  context(messageId: number, before = 30, after = 30): { target: ChatSearchHit; messages: Array<Message & { botId: string }>; hasBefore: boolean; hasAfter: boolean } | undefined {
    boundedInteger(messageId, 0, Number.MAX_SAFE_INTEGER);
    before = boundedInteger(before, 30, 100);
    after = boundedInteger(after, 30, 100);
    const target = this.db.prepare(`SELECT m.*, ${META} ${FROM} WHERE ${VISIBLE} AND m.id = ?`).get(messageId) as Row | undefined;
    if (!target) return undefined;
    const scope = target.groupId ? "g.id = ?" : "m.conversation_id = ?";
    const value = String(target.groupId || target.conversation_id);
    const columns = `m.*, CASE WHEN json_valid(m.activity) THEN json_array_length(m.activity) ELSE 0 END AS steps, ${META}`;
    const earlier = this.db.prepare(`SELECT ${columns} ${FROM} WHERE ${VISIBLE} AND ${scope} AND m.id < ? ORDER BY m.id DESC LIMIT ?`).all(value, messageId, before + 1) as Row[];
    const later = this.db.prepare(`SELECT ${columns} ${FROM} WHERE ${VISIBLE} AND ${scope} AND m.id > ? ORDER BY m.id LIMIT ?`).all(value, messageId, after + 1) as Row[];
    const center = this.db.prepare(`SELECT ${columns} ${FROM} WHERE m.id = ?`).get(messageId) as Row;
    return { target: hit(target, ""), messages: [...earlier.slice(0, before).reverse(), center, ...later.slice(0, after)].map((r) => ({ ...this.toMessage(r), botId: String(r.botId) })), hasBefore: earlier.length > before, hasAfter: later.length > after };
  }
}
