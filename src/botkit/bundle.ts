/**
 * 内容寻址的包：gzip 过的 JSON（文件路径 + base64）。不用 tar：解包只有一条路，没有符号链接、设备文件这些东西，
 * 路径穿越和压缩炸弹在这里一次挡住。解包先写临时目录再原子改名，半截的包不会被当成装好了。
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { safeRelPath } from "../domain/paths.js";
import { LIMITS } from "./format.js";

export interface BundleFile {
  /** 用 / 分隔的相对路径 */
  path: string;
  data: Buffer;
}

export const sha256 = (data: Buffer | string): string => crypto.createHash("sha256").update(data).digest("hex");

/** 打包结果只取决于文件内容和路径：同样的内容哈希不变 */
export function packFiles(files: BundleFile[]): Buffer {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const json = JSON.stringify({ v: 1, files: sorted.map((f) => ({ p: f.path, b: f.data.toString("base64") })) });
  return zlib.gzipSync(json, { level: 9 });
}


export function readBundle(buf: Buffer): BundleFile[] {
  const json = zlib.gunzipSync(buf, { maxOutputLength: LIMITS.unpackedBytes * 2 }).toString("utf8");
  const parsed = JSON.parse(json) as { v?: number; files?: Array<{ p?: unknown; b?: unknown }> };
  if (parsed.v !== 1 || !Array.isArray(parsed.files)) throw new Error("bad bundle format");
  if (parsed.files.length > LIMITS.files) throw new Error("bundle has too many files");
  let total = 0;
  return parsed.files.map((f) => {
    if (!safeRelPath(f.p) || typeof f.b !== "string") throw new Error(`bad path in bundle: ${String(f.p)}`);
    const data = Buffer.from(f.b, "base64");
    total += data.length;
    if (total > LIMITS.unpackedBytes) throw new Error("bundle is too large");
    return { path: f.p, data };
  });
}

/** 写到 dest（已存在就不动）。先写临时目录，再原子改名 */
export function unpackTo(buf: Buffer, dest: string): void {
  if (fs.existsSync(dest)) return;
  const files = readBundle(buf);
  const tmp = `${dest}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  fs.mkdirSync(tmp, { recursive: true });
  try {
    for (const f of files) {
      const out = path.join(tmp, ...f.path.split("/"));
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, f.data);
    }
    try {
      fs.renameSync(tmp, dest);
    } catch (e) {
      // 另一个并发的解包抢先了：内容一样，用它的
      if (!fs.existsSync(dest)) throw e;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw e;
  }
}

/** 列出目录下的文件（相对路径用 /）。符号链接一律报错：不跟着走出目录 */
export function walk(dir: string, prefix = ""): BundleFile[] {
  const out: BundleFile[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isSymbolicLink()) throw new Error(`symlink not allowed: ${rel}`);
    if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), rel));
    else if (e.isFile()) out.push({ path: rel, data: fs.readFileSync(path.join(dir, e.name)) });
    else throw new Error(`not a regular file: ${rel}`);
  }
  return out;
}

/** 目录的内容哈希（技能锁定用）：只取决于相对路径和内容 */
export function dirHash(dir: string): string {
  const h = crypto.createHash("sha256");
  for (const f of walk(dir)) {
    h.update(f.path);
    h.update("\0");
    h.update(sha256(f.data));
    h.update("\n");
  }
  return h.digest("hex");
}
