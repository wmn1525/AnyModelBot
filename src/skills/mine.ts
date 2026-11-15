/**
 * 「我的技能」：在对话里把做成的事存下来的技能。全局一份、只存在本机（<数据目录>/my-skills/），默认只在保存它的机器人上打开，
 * 其他机器人在设置里一键打开；最多 100 个，和各机器人导入的技能分开算。
 *
 * - index.json：每个技能的名字（文件名，带 my- 前缀）、标题、描述、「试试这样说」、在哪些机器人上打开、未验证、
 *   定时运行做不了的步骤、运行时再问的占位、保留的个人信息处数、用到的应用和技能，以及上一版（只留一版，可以对调恢复）。
 * - packages/<摘要>/SKILL.md：技能文件。当前版和上一版各一份，被换下去的旧包在下一次保存时删掉。
 * - 部署：和导入的技能一起由 UserSkills.sync 在机器人空闲时拷进 DSH 的 skills/（skills/service.ts），
 *   所以各项改动都是「机器人空闲后重新加载，下一条消息起可用」。
 * - 写入只有应用里的这一个实例（App.userSkills.mine）；代理宿主里的实例只读。onChange 让定时规则跟着暂停（tasks/service.ts）。
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { SkillError, skillName } from "./archive.js";
import { zipFiles } from "./zip.js";

export const MY_SKILLS_MAX = 100;
export const MY_PREFIX = "my-";

/** 定时运行做不了的步骤：电脑操作、生图生视频、开后台任务（tasks/rules.ts RULE_DENY 里的那几类） */
export type BlockedStep = "computer" | "media" | "background";

/** 用到的技能：只记名字和来源，不抄正文 */
export interface MySkillUse {
  name: string;
  title: string;
  source: { type: "github"; owner: string; repo: string; url: string } | { type: "zip" } | { type: "mine" };
}

/** 用到的应用：按连接别名引用（不存账号和凭证）；sends 有对外发送的步骤 */
export interface MySkillApp {
  key: string;
  name: string;
  alias?: string;
  sends: boolean;
}

/** 一个版本：当前版和上一版各一份 */
export interface MySkillVersion {
  digest: string;
  title: string;
  description: string;
  example: string;
  savedAt: number;
  /** 任务没做完时存下的；用到它的任务正常结束一次后去掉 */
  unverified: boolean;
  blocked: BlockedStep[];
  /** 「运行时再问」的占位（用技能时先问用户） */
  asks: string[];
  /** 选了「保留」的个人信息有几处（导出前提醒） */
  kept: number;
  apps: MySkillApp[];
  uses: MySkillUse[];
}

export interface MySkill extends MySkillVersion {
  name: string;
  createdAt: number;
  /** 保存它的机器人（被删了也留着名字） */
  savedBy: string;
  savedByName: string;
  /** 在哪些机器人上打开 */
  bots: string[];
  prev?: MySkillVersion;
}

export type MySkillEvent =
  | { type: "created"; skill: MySkill; botId: string }
  | { type: "updated" | "restored"; skill: MySkill; before: MySkillVersion }
  | { type: "deleted"; skill: MySkill }
  | { type: "enabled" | "disabled"; skill: MySkill; botId: string };

interface Index {
  revision: string;
  skills: MySkill[];
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw e;
  }
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 });
    fs.renameSync(tmp, file);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

const digestOf = (text: string) => crypto.createHash("sha256").update(text).digest("hex");

/** 文件名（frontmatter 的 name）：小写字母、数字、单个连字符，带 my- 前缀不超过 64 个字符 */
export function validMyName(name: string): boolean {
  return skillName(name) && name.startsWith(MY_PREFIX) && name.length > MY_PREFIX.length;
}

/** 模型或用户写的名字 → 合规的文件名：去掉不合规的字符，缺 my- 时补上，超长截断 */
export function normalizeMyName(raw: string): string {
  const slug = String(raw ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^my-+/, "");
  const body = (slug || "skill").slice(0, 64 - MY_PREFIX.length).replace(/-+$/, "");
  return MY_PREFIX + (body || "skill");
}

/** 名字加序号直到不和 taken 里的冲突：my-x → my-x-2 → my-x-3 */
export function uniqueName(base: string, taken: (name: string) => boolean): string {
  if (!taken(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const tail = `-${i}`;
    const name = base.slice(0, 64 - tail.length).replace(/-+$/, "") + tail;
    if (!taken(name)) return name;
  }
  return `${MY_PREFIX}${crypto.randomUUID().slice(0, 8)}`;
}

/** SKILL.md 的 frontmatter（name、description、metadata.title / example）；读不出时返回 undefined */
export function readFrontmatter(text: string): { name?: unknown; description?: unknown; title?: string; example?: string; body: string } | undefined {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!m) return undefined;
  let data: any;
  try {
    data = parse(m[1], { maxAliasCount: 0 });
  } catch {
    return undefined;
  }
  if (!data || typeof data !== "object") return undefined;
  const meta = data.metadata && typeof data.metadata === "object" ? data.metadata : {};
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  return { name: data.name, description: data.description, title: str(meta.title), example: str(meta.example), body: text.slice(m[0].length) };
}

export class MySkills {
  /** 改动之后（应用里那个实例才会写）：定时规则跟着检查、空闲的代理进程换新的 */
  onChange: ((e: MySkillEvent) => void) | undefined;

  constructor(private dataDir: string) {}

  private get root(): string {
    return path.join(this.dataDir, "my-skills");
  }
  private index(): Index {
    return readJson<Index>(path.join(this.root, "index.json"), { revision: "", skills: [] });
  }
  private save(skills: MySkill[]): void {
    writeJson(path.join(this.root, "index.json"), { revision: crypto.randomUUID(), skills });
  }
  private emit(e: MySkillEvent): void {
    try {
      this.onChange?.(e);
    } catch {
      /* 监听方自己记日志 */
    }
  }

  list(): MySkill[] {
    return this.index().skills;
  }
  get(name: string): MySkill | undefined {
    return this.list().find((s) => s.name === name);
  }
  /** 中文标题（界面显示的名字）相同的那一个 */
  byTitle(title: string): MySkill | undefined {
    const t = title.trim().toLowerCase();
    return t ? this.list().find((s) => s.title.trim().toLowerCase() === t) : undefined;
  }
  /** 在这个机器人上打开的 */
  forBot(botId: string): MySkill[] {
    return this.list().filter((s) => s.bots.includes(botId));
  }
  /** 这个机器人该部署的「我的技能」的指纹：打开的技能和它们的版本变了才变（别的机器人上的改动不让它重启） */
  botRevision(botId: string): string {
    const on = this.forBot(botId).map((s) => `${s.name}:${s.digest}`).sort();
    return on.length ? digestOf(on.join("\n")).slice(0, 16) : "";
  }
  packageDir(digest: string): string {
    return path.join(this.root, "packages", digest);
  }
  /** 当前版（或上一版）的 SKILL.md */
  text(name: string, which: "current" | "prev" = "current"): string {
    const s = this.get(name);
    const v = which === "prev" ? s?.prev : s;
    if (!v) throw new SkillError("not_found", 404);
    return fs.readFileSync(path.join(this.packageDir(v.digest), "SKILL.md"), "utf8");
  }

  private writePackage(text: string): string {
    const digest = digestOf(text);
    const dest = this.packageDir(digest);
    if (fs.existsSync(path.join(dest, "SKILL.md"))) return digest;
    const tmp = path.join(this.root, `.save-${crypto.randomUUID()}`);
    try {
      fs.mkdirSync(tmp, { recursive: true });
      fs.writeFileSync(path.join(tmp, "SKILL.md"), text, { mode: 0o600 });
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.rmSync(dest, { recursive: true, force: true });
      fs.renameSync(tmp, dest);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    return digest;
  }
  /** 没有任何版本再用到的包删掉 */
  private gc(skills: MySkill[]): void {
    const keep = new Set(skills.flatMap((s) => [s.digest, s.prev?.digest].filter(Boolean) as string[]));
    let dirs: string[] = [];
    try {
      dirs = fs.readdirSync(path.join(this.root, "packages"));
    } catch {
      return;
    }
    for (const d of dirs) if (!keep.has(d)) fs.rmSync(path.join(this.root, "packages", d), { recursive: true, force: true });
  }

  /** 新存一个：只在保存它的机器人上打开。满 100 个、名字被占用时报错（调用方先挑好不重名的名字） */
  create(o: { name: string; text: string; meta: Omit<MySkillVersion, "digest" | "savedAt">; botId: string; botName: string; now?: number }): MySkill {
    const skills = this.list();
    if (skills.length >= MY_SKILLS_MAX) throw new SkillError("mine_full", 409);
    if (!validMyName(o.name)) throw new SkillError("invalid_skill");
    if (skills.some((s) => s.name === o.name)) throw new SkillError("conflict", 409);
    const at = o.now ?? Date.now();
    const skill: MySkill = { ...o.meta, name: o.name, digest: this.writePackage(o.text), savedAt: at, createdAt: at, savedBy: o.botId, savedByName: o.botName, bots: [o.botId] };
    this.save([...skills, skill]);
    this.emit({ type: "created", skill, botId: o.botId });
    return skill;
  }

  /** 更新：当前版变成上一版（旧的上一版丢掉），名字和打开的机器人不变 */
  update(name: string, o: { text: string; meta: Omit<MySkillVersion, "digest" | "savedAt">; now?: number }): MySkill {
    const skills = this.list();
    const cur = skills.find((s) => s.name === name);
    if (!cur) throw new SkillError("not_found", 404);
    const before = versionOf(cur);
    const next: MySkill = { ...cur, ...o.meta, digest: this.writePackage(o.text), savedAt: o.now ?? Date.now(), prev: before };
    const list = skills.map((s) => (s.name === name ? next : s));
    this.save(list);
    this.gc(list);
    this.emit({ type: "updated", skill: next, before });
    return next;
  }

  /** 恢复上一版：当前版和上一版对调，可以再换回来 */
  restore(name: string): MySkill {
    const skills = this.list();
    const cur = skills.find((s) => s.name === name);
    if (!cur) throw new SkillError("not_found", 404);
    if (!cur.prev) throw new SkillError("not_found", 404);
    const before = versionOf(cur);
    const next: MySkill = { ...cur, ...cur.prev, prev: before };
    this.save(skills.map((s) => (s.name === name ? next : s)));
    this.emit({ type: "restored", skill: next, before });
    return next;
  }

  /** 删掉：所有机器人都不能再用（进行中的任务结束后生效：部署在机器人空闲时更新） */
  remove(name: string): MySkill {
    const skills = this.list();
    const cur = skills.find((s) => s.name === name);
    if (!cur) throw new SkillError("not_found", 404);
    const list = skills.filter((s) => s.name !== name);
    this.save(list);
    this.gc(list);
    this.emit({ type: "deleted", skill: cur });
    return cur;
  }

  /** 在一个机器人上打开或关上（只影响这个机器人）。能不能打开（重名）由调用方先查 */
  setEnabled(name: string, botId: string, on: boolean): MySkill {
    const skills = this.list();
    const cur = skills.find((s) => s.name === name);
    if (!cur) throw new SkillError("not_found", 404);
    if (cur.bots.includes(botId) === on) return cur;
    const next = { ...cur, bots: on ? [...cur.bots, botId] : cur.bots.filter((b) => b !== botId) };
    this.save(skills.map((s) => (s.name === name ? next : s)));
    this.emit({ type: on ? "enabled" : "disabled", skill: next, botId });
    return next;
  }

  /** 机器人被删：从各技能的打开名单里去掉（技能本身保留） */
  dropBot(botId: string): void {
    const skills = this.list();
    if (!skills.some((s) => s.bots.includes(botId))) return;
    this.save(skills.map((s) => (s.bots.includes(botId) ? { ...s, bots: s.bots.filter((b) => b !== botId) } : s)));
  }

  /** 用到它的任务正常结束：去掉「未验证」（只认当前版） */
  markVerified(name: string): MySkill | undefined {
    const skills = this.list();
    const cur = skills.find((s) => s.name === name);
    if (!cur?.unverified) return cur;
    const next = { ...cur, unverified: false };
    this.save(skills.map((s) => (s.name === name ? next : s)));
    return next;
  }

  /** 导出 ZIP：格式和导入一样（<文件名>/SKILL.md），只含这个技能自己的文件 */
  exportZip(name: string): Buffer {
    const s = this.get(name);
    if (!s) throw new SkillError("not_found", 404);
    const dir = this.packageDir(s.digest);
    const files: Array<{ path: string; data: Buffer }> = [];
    const walk = (rel: string) => {
      for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
        const p = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) walk(p);
        else if (e.isFile()) files.push({ path: `${s.name}/${p}`, data: fs.readFileSync(path.join(dir, p)) });
      }
    };
    walk("");
    return zipFiles(files);
  }
}

export function versionOf(s: MySkillVersion): MySkillVersion {
  return {
    digest: s.digest,
    title: s.title,
    description: s.description,
    example: s.example,
    savedAt: s.savedAt,
    unverified: s.unverified,
    blocked: [...s.blocked],
    asks: [...s.asks],
    kept: s.kept,
    apps: s.apps.map((a) => ({ ...a })),
    uses: s.uses.map((u) => ({ ...u })),
  };
}
