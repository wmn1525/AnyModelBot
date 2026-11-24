/**
 * 工作文件夹（PRD R1–R3）：输入框上方选择的目录，只记位置引用，不读、不传、不复制里面的内容。
 *
 * - 选择属于「机器人 + 对话 + 对话分段」：开始新对话（新分段）后就不算了；清空上下文不换分段，选择保留。
 * - 最近文件夹：这台机器、这个运行实例最多 10 个，按系统认出的同一个真实目录（设备号 + inode，取不到时按真实路径）去重；
 *   重新选择移到最前，超出的移除最早的（只删记录，不碰目录）。
 * - 选的时候只核对目录本身：真实路径、是不是目录、能不能打开（不列内容）；不可选的位置（数据目录、磁盘根、主目录本身）拒绝。
 * - 每条消息发送时固定当时的选择（bind）；回合开始时再核对一次（resolve）：原位置不在了、被换成别的同名目录、没有权限，
 *   就按不可用处理（不改用默认工作区、不去别处找同名目录）。
 * - 只有桌面版能弹系统的目录选择器（desktop.pickFolder），网页里只能看到已有的选择，不能新选或更换。
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Store } from "../store/db.js";
import { logger } from "../log.js";

const log = logger("folders");

export const MAX_RECENT = 10;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS work_folders (
  conversation_id TEXT PRIMARY KEY, bot_id TEXT NOT NULL, segment TEXT NOT NULL, folder_id TEXT NOT NULL,
  path TEXT NOT NULL, name TEXT NOT NULL, identity TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS recent_folders (
  id TEXT PRIMARY KEY, path TEXT NOT NULL, name TEXT NOT NULL, identity TEXT NOT NULL, picked_at INTEGER NOT NULL);
`;

/** 一个已核对过的目录：真实路径、显示名、身份（设备号:inode，换成同名的新目录就对不上） */
export interface FolderRef {
  id: string;
  path: string;
  name: string;
  identity: string;
}

/** 发送时固定到消息上的那一份（存在消息上，回合开始时按它核对） */
export type FolderBinding = FolderRef;

/**
 * 不能用的原因：notAllowed 位置不可选（数据目录、磁盘根、主目录本身）· unavailable 不在了 / 不是目录 / 换成了别的目录 ·
 * system 系统不允许访问（macOS 的文件夹权限、Windows 的访问控制）· desktopOnly 只能在桌面版选 · changed 发送时的选择和现在的对不上
 */
export type FolderErrorCode = "notAllowed" | "unavailable" | "system" | "desktopOnly" | "changed";

export class FolderError extends Error {
  constructor(readonly code: FolderErrorCode, readonly status = 409) {
    super(code);
  }
}

type Row = Record<string, unknown>;

const newId = () => crypto.randomBytes(12).toString("base64url");

/** 目录的身份：设备号 + inode，再加创建时间（删掉再建的同名目录可能拿到同一个 inode，创建时间不同）；取不到创建时间的系统上只看前两个 */
function identityOf(st: fs.BigIntStats): string {
  return `${st.dev}:${st.ino}${st.birthtimeNs > 0n ? `:${st.birthtimeNs}` : ""}`;
}

/** 显示名：根目录名；Windows 的盘符根之类没有名字时用整条路径 */
const nameOf = (p: string) => path.basename(p) || p;

export interface FolderServiceOptions {
  store: Store;
  dataDir: string;
  /** 对话现在的分段（和待发附件同一个：attachments/service.ts 的 segmentOf） */
  segmentOf: (conversationId: string) => string;
  /** 系统目录选择器（桌面版外壳，启动后才接上）；它返回选中的路径，取消返回 undefined。命令行 / Docker 没有 */
  picker?: () => (() => Promise<string | undefined>) | undefined;
  home?: string;
  platform?: NodeJS.Platform;
}

export class FolderService {
  private readonly home: string;
  private readonly platform: NodeJS.Platform;

  constructor(private o: FolderServiceOptions) {
    o.store.db.exec(SCHEMA);
    this.home = o.home ?? os.homedir();
    this.platform = o.platform ?? process.platform;
  }

  /** 桌面版才有系统目录选择器 */
  get canPick(): boolean {
    return !!this.o.picker?.();
  }

  // ---------- 核对一个目录 ----------

  private inside(p: string, root: string): boolean {
    const rel = path.relative(root, p);
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  }
  private same(a: string, b: string): boolean {
    return this.platform === "linux" ? a === b : a.toLowerCase() === b.toLowerCase();
  }
  private real(p: string): string | undefined {
    try {
      return fs.realpathSync.native(p);
    } catch {
      return undefined;
    }
  }

  /**
   * 选中的目录能不能用：按真实路径（链接、快捷方式指过去的一样算）核对不可选的位置、是不是目录、能不能打开。
   * 打开目录只为确认有访问权限（macOS 的「文件和文件夹」权限会在这一步拒绝），不读里面的条目。
   */
  check(input: string): FolderRef {
    if (!input || typeof input !== "string" || input.includes("\0") || !path.isAbsolute(input)) throw new FolderError("unavailable");
    const real = this.real(input);
    if (!real) throw new FolderError("unavailable");
    const data = this.real(this.o.dataDir) ?? path.resolve(this.o.dataDir);
    const home = this.real(this.home) ?? this.home;
    // 数据目录（含默认工作区、附件存储、解压空间）和它的任何上层（选了上层，数据目录就落进可写范围里）、
    // 磁盘 / 卷的根、主目录本身：范围不对，不是体积问题
    if (this.inside(real, data) || this.inside(data, real) || path.parse(real).root === real || this.same(real, home)) throw new FolderError("notAllowed");
    let st: fs.BigIntStats;
    try {
      st = fs.statSync(real, { bigint: true });
    } catch {
      throw new FolderError("unavailable");
    }
    if (!st.isDirectory()) throw new FolderError("unavailable");
    try {
      fs.opendirSync(real).closeSync();
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      throw new FolderError(code === "EPERM" || code === "EACCES" ? "system" : "unavailable");
    }
    return { id: "", path: real, name: nameOf(real), identity: identityOf(st) };
  }

  /** 原来选的那个目录还在不在：同一个真实路径、同一个身份、能打开。不是就是不可用（不改指别的目录） */
  verify(ref: { path: string; identity: string }): FolderErrorCode | undefined {
    try {
      const cur = this.check(ref.path);
      if (!this.same(cur.path, ref.path) || cur.identity !== ref.identity) return "unavailable";
      return undefined;
    } catch (e) {
      return e instanceof FolderError ? e.code : "unavailable";
    }
  }

  // ---------- 当前选择与最近文件夹 ----------

  /** 这个对话当前分段的选择；没有选、或是上一段的（开过新对话）都返回 undefined */
  current(conversationId: string): FolderRef | undefined {
    const r = this.o.store.db.prepare("SELECT * FROM work_folders WHERE conversation_id = ?").get(conversationId) as Row | undefined;
    if (!r || String(r.segment) !== this.o.segmentOf(conversationId)) return undefined;
    return { id: String(r.folder_id), path: String(r.path), name: String(r.name), identity: String(r.identity) };
  }

  recent(): FolderRef[] {
    return (this.o.store.db.prepare("SELECT * FROM recent_folders ORDER BY picked_at DESC LIMIT ?").all(MAX_RECENT) as Row[]).map((r) => ({
      id: String(r.id), path: String(r.path), name: String(r.name), identity: String(r.identity),
    }));
  }

  /** 记进最近文件夹（同一个真实目录只留一条、移到最前），返回它的 id；超出 10 个移除最早的 */
  private remember(ref: FolderRef): string {
    const db = this.o.store.db;
    // 严格递增：同一毫秒里连着选也分得出先后（超出 10 个时移除的是最早的那个）
    const last = Number((db.prepare("SELECT MAX(picked_at) AS m FROM recent_folders").get() as Row)?.m ?? 0);
    const now = Math.max(Date.now(), last + 1);
    const same = (db.prepare("SELECT * FROM recent_folders").all() as Row[]).find((r) => String(r.identity) === ref.identity || this.same(String(r.path), ref.path));
    const id = same ? String(same.id) : newId();
    if (same) db.prepare("UPDATE recent_folders SET path = ?, name = ?, identity = ?, picked_at = ? WHERE id = ?").run(ref.path, ref.name, ref.identity, now, id);
    else db.prepare("INSERT INTO recent_folders(id, path, name, identity, picked_at) VALUES(?, ?, ?, ?, ?)").run(id, ref.path, ref.name, ref.identity, now);
    const extra = db.prepare("SELECT id FROM recent_folders ORDER BY picked_at DESC LIMIT -1 OFFSET ?").all(MAX_RECENT) as Row[];
    for (const r of extra) db.prepare("DELETE FROM recent_folders WHERE id = ?").run(String(r.id));
    return id;
  }

  private setCurrent(botId: string, conversationId: string, ref: FolderRef): FolderRef {
    this.o.store.db
      .prepare("INSERT INTO work_folders(conversation_id, bot_id, segment, folder_id, path, name, identity, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(conversation_id) DO UPDATE SET bot_id = excluded.bot_id, segment = excluded.segment, folder_id = excluded.folder_id, path = excluded.path, name = excluded.name, identity = excluded.identity, updated_at = excluded.updated_at")
      .run(conversationId, botId, this.o.segmentOf(conversationId), ref.id, ref.path, ref.name, ref.identity, Date.now());
    log.info("work folder chosen", { bot: botId, conversationId });
    return ref;
  }

  /** 弹系统目录选择器：取消返回 undefined（原选择不变）；选了不能用的位置抛错（原选择也不变） */
  async pick(botId: string, conversationId: string): Promise<FolderRef | undefined> {
    const pick = this.o.picker?.();
    if (!pick) throw new FolderError("desktopOnly", 400);
    const chosen = await pick();
    if (!chosen) return undefined;
    const ref = this.check(chosen);
    ref.id = this.remember(ref);
    return this.setCurrent(botId, conversationId, ref);
  }

  /** 选一个最近文件夹：只核对目录本身；不在了、换成了别的目录就提示重选，原选择不变 */
  select(botId: string, conversationId: string, id: string): FolderRef {
    if (!this.canPick) throw new FolderError("desktopOnly", 400);
    const r = this.recent().find((x) => x.id === id);
    if (!r) throw new FolderError("unavailable", 404);
    const bad = this.verify(r);
    if (bad) throw new FolderError(bad);
    this.remember(r);
    return this.setCurrent(botId, conversationId, r);
  }

  /** 不使用文件夹：之后的消息回到默认工作区；不删任何文件，不停已经发出的任务 */
  clear(conversationId: string): void {
    this.o.store.db.prepare("DELETE FROM work_folders WHERE conversation_id = ?").run(conversationId);
  }

  /** 删除对话、删除机器人：只删引用，不碰目录 */
  dropConversation(conversationId: string): void {
    this.clear(conversationId);
  }
  dropBot(botId: string): void {
    this.o.store.db.prepare("DELETE FROM work_folders WHERE bot_id = ?").run(botId);
  }

  // ---------- 发送与回合 ----------

  /**
   * 点发送那一刻的选择：界面带来的 id 必须和服务端现在的选择一致（"" = 没选）；对不上说明条件变了，不受理、不改用别的目录。
   * 返回要固定到这条消息上的引用（没选返回 null）。
   */
  bind(conversationId: string, folderId: unknown): FolderBinding | null {
    const want = typeof folderId === "string" ? folderId : "";
    const cur = this.current(conversationId);
    if ((cur?.id ?? "") !== want) throw new FolderError("changed");
    return cur ? { ...cur } : null;
  }

  /** 回合开始前核对固定在消息上的目录：能用返回真实路径；不能用返回原因（这一轮按不可用处理） */
  resolve(b: FolderBinding): { root: string } | { error: FolderErrorCode } {
    const bad = this.verify(b);
    return bad ? { error: bad } : { root: b.path };
  }
}

/** 界面要的一项：id、名字、完整路径、父路径（同名时区分）、能不能用（只看目录本身） */
export function publicFolder(f: FolderRef, available?: boolean) {
  return { id: f.id, name: f.name, path: f.path, parent: path.dirname(f.path), ...(available === undefined ? {} : { available }) };
}
