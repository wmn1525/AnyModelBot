/** 用户导入的技能独立保存；DSH 空闲重启时才将启用项部署到 skills/。 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import type { Store } from "../store/db.js";
import { SCRIPT_FILE, SkillError, SKILL_LIMITS, reservedSkill, skillName, type SkillPackage } from "./archive.js";
import { MySkills } from "./mine.js";

/** 技能从哪来：本地 ZIP，或按 GitHub 链接安装（仓库、路径、分支、安装时的提交号）。0.1.35 及以前导入的没有记录，按本地 ZIP 显示 */
export type SkillSource =
  | { type: "zip"; installedAt: number }
  | { type: "github"; owner: string; repo: string; path: string; ref: string; commit: string; url: string; installedAt: number };

export interface UserSkill {
  name: string;
  description: string;
  digest: string;
  enabled: boolean;
  files: number;
  bytes: number;
  source?: SkillSource;
  /** SKILL.md frontmatter metadata 里的标题和「试试这样说」（导出的「我的技能」带着；技能库外的 ZIP 技能用它显示名字） */
  title?: string;
  example?: string;
}
interface Index { revision: string; skills: UserSkill[] }

/** 和 DSH 一样读 frontmatter 的布尔值（dsh-skill-filesystem frontmatterBoolean） */
const truthy = (v: unknown) => v === true || v === 1 || (typeof v === "string" && /^(true|yes|on|1)$/i.test(v.trim()));
/** 包的摘要 → 模型能不能自己用它（SKILL.md 写了 disable-model-invocation: true 的只能由用户在消息里写 /技能名 调用）。包内容不变，按摘要缓存 */
const invocable = new Map<string, boolean>();

function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return fallback; throw e; }
}
function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${crypto.randomUUID()}.tmp`;
  try { fs.writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 }); fs.renameSync(tmp, file); }
  finally { fs.rmSync(tmp, { force: true }); }
}

export class UserSkills {
  /** 「我的技能」：全局一份，和这里按机器人存的技能一起部署（skills/mine.ts） */
  readonly mine: MySkills;
  constructor(private dataDir: string, private store: Store) { this.mine = new MySkills(dataDir); }
  private root(botId: string): string {
    if (!this.store.getBot(botId)) throw new SkillError("not_found", 404);
    return path.join(this.dataDir, "skills", botId);
  }
  private index(botId: string): Index { return readJson(path.join(this.root(botId), "index.json"), { revision: "", skills: [] }); }
  /** 这个机器人要部署的技能的版本：导入的技能变了，或在它上面打开的「我的技能」变了 */
  revision(botId: string): string {
    if (!this.store.getBot(botId)) return "";
    const mine = this.mine.botRevision(botId);
    return mine ? `${this.index(botId).revision}|${mine}` : this.index(botId).revision;
  }
  list(botId: string): UserSkill[] { return this.index(botId).skills; }
  /** 模型能不能自己用这个技能：SKILL.md 里 disable-model-invocation 为真时不能（DSH 不把它放进模型的技能目录） */
  modelInvocable(botId: string, skill: Pick<UserSkill, "digest">): boolean {
    let ok = invocable.get(skill.digest);
    if (ok === undefined) {
      ok = true;
      try {
        const text = fs.readFileSync(path.join(this.root(botId), "packages", skill.digest, "SKILL.md"), "utf8");
        const front = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
        ok = !truthy(front ? parse(front[1], { maxAliasCount: 0 })?.["disable-model-invocation"] : undefined);
      } catch { /* 读不到按默认（模型可以用） */ }
      invocable.set(skill.digest, ok);
    }
    return ok;
  }
  /** 上次部署（sync）到机器人进程里的技能：名字 → 包的摘要。还没部署过时没有 */
  applied(botId: string): ReadonlyMap<string, string> | undefined { return this.deployed.get(botId); }
  private deployed = new Map<string, Map<string, string>>();
  detail(botId: string, name: string): UserSkill & { instructions: string } {
    const skill = this.list(botId).find((s) => s.name === name);
    if (!skill) throw new SkillError("not_found", 404);
    return { ...skill, instructions: fs.readFileSync(path.join(this.root(botId), "packages", skill.digest, "SKILL.md"), "utf8") };
  }
  private assertAvailable(botId: string, name: string): void {
    if (!skillName(name) || reservedSkill(name)) throw new SkillError("reserved_name", 400, { name });
    if (this.store.getBot(botId)?.app?.skills.includes(name)) throw new SkillError("reserved_name", 400, { name });
    const applied = readJson<string[]>(path.join(this.root(botId), "applied.json"), []);
    if (fs.existsSync(path.join(this.dataDir, "dsh", botId, "skills", name)) && !applied.includes(name)) throw new SkillError("reserved_name", 400, { name });
  }
  /** 「我的技能」占用的名字不能再装（不管它在不在这个机器人上打开） */
  private assertNotMine(name: string): void {
    const mine = this.mine.get(name);
    if (mine) throw new SkillError("mine_name", 400, { name, title: mine.title });
  }
  /**
   * 「我的技能」能不能在这个机器人上打开：名字不能和保留名、自带技能、这个机器人已装的技能（开着关着都算），
   * 以及 skills/ 里不归这里管的目录重名
   */
  mineAvailable(botId: string, name: string): boolean {
    if (!skillName(name) || reservedSkill(name)) return false;
    if (this.store.getBot(botId)?.app?.skills.includes(name)) return false;
    if (this.list(botId).some((s) => s.name === name)) return false;
    const applied = readJson<string[]>(path.join(this.root(botId), "applied.json"), []);
    return !(fs.existsSync(path.join(this.dataDir, "dsh", botId, "skills", name)) && !applied.includes(name));
  }
  preview(botId: string, pkg: SkillPackage) {
    this.assertAvailable(botId, pkg.name);
    this.assertNotMine(pkg.name);
    const skills = this.list(botId);
    const old = skills.find((s) => s.name === pkg.name);
    // 装不下的在确认之前就说（替换同名的不占新名额）
    if (!old && skills.length >= SKILL_LIMITS.installed) throw new SkillError("too_many");
    return { name: pkg.name, description: pkg.description, files: pkg.files.length, bytes: pkg.bytes, scripts: pkg.files.filter((f) => SCRIPT_FILE.test(f.path)).length, instructions: pkg.instructions, replaces: old?.digest ?? null, replacesSource: old ? (old.source ?? { type: "zip" as const, installedAt: 0 }) : null };
  }
  install(botId: string, pkg: SkillPackage, replaces: string | null, source: SkillSource = { type: "zip", installedAt: Date.now() }): UserSkill {
    this.assertAvailable(botId, pkg.name);
    this.assertNotMine(pkg.name);
    const index = this.index(botId);
    const old = index.skills.find((s) => s.name === pkg.name);
    if ((old?.digest ?? null) !== replaces) throw new SkillError("conflict", 409);
    if (!old && index.skills.length >= SKILL_LIMITS.installed) throw new SkillError("too_many");
    const root = this.root(botId);
    const dest = path.join(root, "packages", pkg.digest);
    if (!fs.existsSync(dest)) {
      const tmp = path.join(root, `.import-${crypto.randomUUID()}`);
      try {
        fs.mkdirSync(tmp, { recursive: true });
        for (const f of pkg.files) {
          const target = path.join(tmp, f.path);
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.writeFileSync(target, f.data, { mode: SCRIPT_FILE.test(f.path) ? 0o700 : 0o600 });
        }
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.renameSync(tmp, dest);
      } finally { fs.rmSync(tmp, { force: true, recursive: true }); }
    }
    const skill: UserSkill = { name: pkg.name, description: pkg.description, digest: pkg.digest, enabled: old?.enabled ?? true, files: pkg.files.length, bytes: pkg.bytes, source, ...(pkg.title ? { title: pkg.title } : {}), ...(pkg.example ? { example: pkg.example } : {}) };
    this.save(botId, [...index.skills.filter((s) => s.name !== pkg.name), skill]);
    if (old && old.digest !== pkg.digest) fs.rmSync(path.join(root, "packages", old.digest), { recursive: true, force: true });
    return skill;
  }
  setEnabled(botId: string, name: string, enabled: boolean): void {
    const skills = this.list(botId);
    const skill = skills.find((s) => s.name === name);
    if (!skill) throw new SkillError("not_found", 404);
    if (enabled) this.assertAvailable(botId, name);
    if (skill.enabled === enabled) return;
    skill.enabled = enabled;
    this.save(botId, skills);
  }
  remove(botId: string, name: string): void {
    const skills = this.list(botId);
    const skill = skills.find((s) => s.name === name);
    if (!skill) throw new SkillError("not_found", 404);
    this.save(botId, skills.filter((s) => s !== skill));
    fs.rmSync(path.join(this.root(botId), "packages", skill.digest), { recursive: true, force: true });
  }
  private save(botId: string, skills: UserSkill[]): void {
    writeJson(path.join(this.root(botId), "index.json"), { revision: crypto.randomUUID(), skills: skills.sort((a, b) => a.name.localeCompare(b.name)) });
  }
  /** 只在代理未运行时调用。仅清理曾由本服务部署的目录，不触碰内置或目录 Bot 技能。 */
  sync(botId: string): string {
    const index = this.index(botId);
    const root = this.root(botId);
    const state = path.join(root, "applied.json");
    const previous = readJson<string[]>(state, []);
    const revision = this.revision(botId);
    // 在这个机器人上打开的「我的技能」：和已装的技能、自带技能重名的不部署（打开时已经拦过，这里兜底）
    const mine = this.mine.forBot(botId).filter((s) => !index.skills.some((x) => x.name === s.name) && this.mineAvailable(botId, s.name));
    const deployed = new Map([...index.skills.filter((s) => s.enabled), ...mine].map((s) => [s.name, s.digest]));
    if (!index.skills.length && !mine.length && !previous.length) { this.deployed.set(botId, deployed); return revision; }
    const dest = path.join(this.dataDir, "dsh", botId, "skills");
    const catalog = this.store.getBot(botId)?.app?.skills ?? [];
    const enabled = index.skills.filter((s) => s.enabled);
    for (const skill of enabled) this.assertAvailable(botId, skill.name);
    fs.mkdirSync(dest, { recursive: true });
    // 先记录所有本服务可能写入的名字，进程意外退出后也能清理半成品。
    const owned = [...new Set([...previous, ...enabled.map((s) => s.name), ...mine.map((s) => s.name)])].filter((name) => skillName(name) && !reservedSkill(name) && !catalog.includes(name));
    writeJson(state, owned);
    for (const name of owned) fs.rmSync(path.join(dest, name), { recursive: true, force: true });
    for (const skill of enabled) fs.cpSync(path.join(root, "packages", skill.digest), path.join(dest, skill.name), { recursive: true });
    for (const skill of mine) fs.cpSync(this.mine.packageDir(skill.digest), path.join(dest, skill.name), { recursive: true });
    writeJson(state, [...enabled.map((s) => s.name), ...mine.map((s) => s.name)]);
    this.deployed.set(botId, deployed);
    return revision;
  }
  cleanup(botId: string): void {
    // App.deleteBot 在删数据库记录前调用。
    const previous = readJson<string[]>(path.join(this.root(botId), "applied.json"), []);
    const catalog = this.store.getBot(botId)?.app?.skills ?? [];
    for (const name of previous) if (skillName(name) && !reservedSkill(name) && !catalog.includes(name)) fs.rmSync(path.join(this.dataDir, "dsh", botId, "skills", name), { recursive: true, force: true });
    fs.rmSync(this.root(botId), { recursive: true, force: true });
  }
}
