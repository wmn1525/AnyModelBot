/** 用户导入的技能独立保存；DSH 空闲重启时才将启用项部署到 skills/。 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Store } from "../store/db.js";
import { SkillError, SKILL_LIMITS, reservedSkill, skillName, type SkillPackage } from "./archive.js";

export interface UserSkill {
  name: string;
  description: string;
  digest: string;
  enabled: boolean;
  files: number;
  bytes: number;
}
interface Index { revision: string; skills: UserSkill[] }

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
  constructor(private dataDir: string, private store: Store) {}
  private root(botId: string): string {
    if (!this.store.getBot(botId)) throw new SkillError("not_found", 404);
    return path.join(this.dataDir, "skills", botId);
  }
  private index(botId: string): Index { return readJson(path.join(this.root(botId), "index.json"), { revision: "", skills: [] }); }
  revision(botId: string): string { return this.store.getBot(botId) ? this.index(botId).revision : ""; }
  list(botId: string): UserSkill[] { return this.index(botId).skills; }
  detail(botId: string, name: string): UserSkill & { instructions: string } {
    const skill = this.list(botId).find((s) => s.name === name);
    if (!skill) throw new SkillError("not_found", 404);
    return { ...skill, instructions: fs.readFileSync(path.join(this.root(botId), "packages", skill.digest, "SKILL.md"), "utf8") };
  }
  private assertAvailable(botId: string, name: string): void {
    if (!skillName(name) || reservedSkill(name)) throw new SkillError("reserved_name");
    if (this.store.getBot(botId)?.app?.skills.includes(name)) throw new SkillError("reserved_name");
    const applied = readJson<string[]>(path.join(this.root(botId), "applied.json"), []);
    if (fs.existsSync(path.join(this.dataDir, "dsh", botId, "skills", name)) && !applied.includes(name)) throw new SkillError("reserved_name");
  }
  preview(botId: string, pkg: SkillPackage) {
    this.assertAvailable(botId, pkg.name);
    return { name: pkg.name, description: pkg.description, files: pkg.files.length, bytes: pkg.bytes, instructions: pkg.instructions, replaces: this.list(botId).find((s) => s.name === pkg.name)?.digest ?? null };
  }
  install(botId: string, pkg: SkillPackage, replaces: string | null): UserSkill {
    this.assertAvailable(botId, pkg.name);
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
          fs.writeFileSync(target, f.data, { mode: /\.(sh|py|js|mjs)$/.test(f.path) ? 0o700 : 0o600 });
        }
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.renameSync(tmp, dest);
      } finally { fs.rmSync(tmp, { force: true, recursive: true }); }
    }
    const skill = { name: pkg.name, description: pkg.description, digest: pkg.digest, enabled: old?.enabled ?? true, files: pkg.files.length, bytes: pkg.bytes };
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
    if (!index.skills.length && !previous.length) return index.revision;
    const dest = path.join(this.dataDir, "dsh", botId, "skills");
    const catalog = this.store.getBot(botId)?.app?.skills ?? [];
    const enabled = index.skills.filter((s) => s.enabled);
    for (const skill of enabled) this.assertAvailable(botId, skill.name);
    fs.mkdirSync(dest, { recursive: true });
    // 先记录所有本服务可能写入的名字，进程意外退出后也能清理半成品。
    const owned = [...new Set([...previous, ...enabled.map((s) => s.name)])].filter((name) => skillName(name) && !reservedSkill(name) && !catalog.includes(name));
    writeJson(state, owned);
    for (const name of owned) fs.rmSync(path.join(dest, name), { recursive: true, force: true });
    for (const skill of enabled) fs.cpSync(path.join(root, "packages", skill.digest), path.join(dest, skill.name), { recursive: true });
    writeJson(state, enabled.map((s) => s.name));
    return index.revision;
  }
  cleanup(botId: string): void {
    // App.deleteBot 在删数据库记录前调用。
    const previous = readJson<string[]>(path.join(this.root(botId), "applied.json"), []);
    const catalog = this.store.getBot(botId)?.app?.skills ?? [];
    for (const name of previous) if (skillName(name) && !reservedSkill(name) && !catalog.includes(name)) fs.rmSync(path.join(this.dataDir, "dsh", botId, "skills", name), { recursive: true, force: true });
    fs.rmSync(this.root(botId), { recursive: true, force: true });
  }
}
