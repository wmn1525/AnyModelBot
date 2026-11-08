/** 本地 ZIP 技能包。先验证并读完，确认安装时才写入文件系统。 */
import crypto from "node:crypto";
import { crc32 } from "node:zlib";
import { fromBufferPromise } from "yauzl";
import { parse } from "yaml";
import { safeRelPath, type BundleFile } from "../botkit/bundle.js";
import { RESERVED_SKILLS } from "../botkit/format.js";

export const SKILL_LIMITS = { zip: 20 * 1024 * 1024, unpacked: 64 * 1024 * 1024, files: 2000, markdown: 256 * 1024, installed: 100 };
export type SkillErrorCode = "invalid_zip" | "too_large" | "unsafe_path" | "missing_skill" | "multiple_skills" | "invalid_skill" | "reserved_name" | "conflict" | "not_found" | "too_many";
export class SkillError extends Error {
  constructor(readonly code: SkillErrorCode, readonly status = 400) { super(code); }
}

// Windows 的设备名、ADS、末尾点/空格也拒绝，保证同一个包在三个平台上有相同含义。
export function skillPath(p: string): boolean {
  return safeRelPath(p) && p.split("/").every((s) => !/[<>:"|?*\x00-\x1f]/.test(s) && !/[. ]$/.test(s) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s));
}
export const skillName = (s: unknown): s is string => typeof s === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length <= 64 && skillPath(s);
export const reservedSkill = (name: string) => (RESERVED_SKILLS as readonly string[]).includes(name);

export interface SkillPackage {
  name: string;
  description: string;
  digest: string;
  bytes: number;
  files: BundleFile[];
  instructions: string;
}

export async function readSkillZip(buffer: Buffer): Promise<SkillPackage> {
  if (buffer.length > SKILL_LIMITS.zip) throw new SkillError("too_large", 413);
  const files: BundleFile[] = [];
  const seen = new Map<string, boolean>();
  let total = 0;
  try {
    const zip = await fromBufferPromise(buffer, { strictFileNames: true });
    try {
      if (zip.entryCount > SKILL_LIMITS.files) throw new SkillError("too_large", 413);
      for await (const entry of zip.eachEntry()) {
        const dir = entry.fileName.endsWith("/");
        const name = dir ? entry.fileName.slice(0, -1) : entry.fileName;
        const type = (entry.externalFileAttributes >>> 16) & 0o170000;
        if (!skillPath(name) || (type && type !== (dir ? 0o040000 : 0o100000))) throw new SkillError("unsafe_path");
        const key = name.normalize("NFC").toLowerCase();
        if (seen.has(key)) throw new SkillError("unsafe_path");
        seen.set(key, dir);
        // 包括目录/文件重名以及大小写、Unicode 规范化冲突。
        for (let p = key; p.includes("/");) {
          p = p.slice(0, p.lastIndexOf("/"));
          if (seen.get(p) === false) throw new SkillError("unsafe_path");
        }
        if (!dir && [...seen.keys()].some((p) => p.startsWith(key + "/"))) throw new SkillError("unsafe_path");
        total += entry.uncompressedSize;
        if (total > SKILL_LIMITS.unpacked) throw new SkillError("too_large", 413);
        if (entry.isEncrypted() || ![0, 8].includes(entry.compressionMethod)) throw new SkillError("invalid_zip");
        if (dir) continue;
        const stream = await zip.openReadStreamPromise(entry);
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of stream) {
          size += chunk.length;
          if (size > entry.uncompressedSize || size > SKILL_LIMITS.unpacked) throw new SkillError("too_large", 413);
          chunks.push(chunk);
        }
        const data = Buffer.concat(chunks);
        if (data.length !== entry.uncompressedSize || crc32(data) !== entry.crc32) throw new SkillError("invalid_zip");
        // Finder 添加的资源分支不属于技能内容，但仍受以上解包限制约束。
        if (name.split("/").some((part) => part === "__MACOSX" || part === ".DS_Store" || part.startsWith("._"))) continue;
        files.push({ path: name, data });
      }
    } finally { zip.close(); }
  } catch (e) {
    if (e instanceof SkillError) throw e;
    throw new SkillError("invalid_zip");
  }
  const roots = files.filter((f) => f.path === "SKILL.md" || f.path.endsWith("/SKILL.md"));
  if (!roots.length) throw new SkillError("missing_skill");
  if (roots.length !== 1) throw new SkillError("multiple_skills");
  const root = roots[0];
  if (root.data.length > SKILL_LIMITS.markdown) throw new SkillError("too_large", 413);
  const instructions = root.data.toString("utf8").replace(/^\uFEFF/, "");
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(instructions);
  if (!match) throw new SkillError("invalid_skill");
  let metadata: any;
  try { metadata = parse(match[1], { maxAliasCount: 0 }); } catch { throw new SkillError("invalid_skill"); }
  if (!skillName(metadata?.name) || typeof metadata?.description !== "string" || !metadata.description.trim() || metadata.description.length > 1024 || !instructions.slice(match[0].length).trim()) throw new SkillError("invalid_skill");
  // 与当前 DSH 的调用策略解析保持一致，避免导入成功后被运行时悄悄忽略。
  if (["disableModelInvocation", "modelInvocable", "userInvocable"].some((key) => Object.hasOwn(metadata, key))) throw new SkillError("invalid_skill");
  for (const key of ["disable-model-invocation", "user-invocable"]) {
    if (Object.hasOwn(metadata, key) && ![true, false, 0, 1].includes(metadata[key]) && !(typeof metadata[key] === "string" && /^(true|false|yes|no|on|off|0|1)$/i.test(metadata[key]))) throw new SkillError("invalid_skill");
  }
  if (reservedSkill(metadata.name)) throw new SkillError("reserved_name");
  const prefix = root.path.slice(0, -"SKILL.md".length);
  const selected = files.filter((f) => f.path.startsWith(prefix)).map((f) => ({ ...f, path: f.path.slice(prefix.length) }));
  // DSH 的 frontmatter 解析器不接受 BOM；其他内容原样保留。
  selected.find((f) => f.path === "SKILL.md")!.data = Buffer.from(instructions);
  return { name: metadata.name, description: metadata.description.trim(), digest: crypto.createHash("sha256").update(buffer).digest("hex"), bytes: selected.reduce((n, f) => n + f.data.length, 0), files: selected, instructions };
}
