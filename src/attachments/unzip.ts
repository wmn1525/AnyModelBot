/**
 * ZIP 附件的安全查看与解压（PRD R6）。只在用户发出处理指令后、由宿主替代理执行（attachments/zip-tools.ts）；
 * 代理拿不到原始 ZIP，不能改用 unzip 之类的不受限命令绕过这里的规则。
 *
 * 规则（任何一条不满足都整次拒绝，不猜名字、不改名、不覆盖、不合并）：
 * - 只处理 Stored / Deflate（含受同样限制的 Zip64）；加密、分卷、其他压缩算法明确拒绝，不索要密码。
 * - 结构或 CRC 校验失败、文件名编码不能可靠识别（没有 UTF-8 标记、也不是合法 UTF-8 的非 ASCII 名字）拒绝。
 * - 实际展开累计最多 200 MiB、2,000 个条目（含目录）、目录深度最多 20 层（根层为 0）；按实际解码的字节计量，
 *   不只信声明的大小；逐个文件流式写盘，不把整包展开到内存；单次最多 60 秒。
 * - 绝对路径、上级跳转、盘符、UNC、空字符、反斜杠变体、. 和空段一律拒绝；归一化后的重复路径、目标系统上的大小写 /
 *   Unicode 等价碰撞、文件与目录同名、保留设备名和目标系统不接受的名字 / 路径长度拒绝。
 * - 符号链接、硬链接、设备等特殊条目拒绝；只建普通文件和目录，不恢复权限位，不给执行权限。
 * - 保留合法的相对层级、中文 / Unicode 名字和 ZIP 里明确记录的空目录；包里的压缩包只当普通文件，不递归展开。
 * - 每次都新建一个不重名的解压目录（已有同名的就换一个名字）；失败、超限、磁盘不足、取消时删掉这次建的整个目录，
 *   不碰目标位置原有的任何文件。
 */
import fs from "node:fs";
import path from "node:path";
import { crc32 } from "node:zlib";
import { open as openZip, type Entry, type ZipFile } from "yauzl";

const MIB = 1024 * 1024;
export const UNZIP_LIMITS = { maxBytes: 200 * MIB, maxEntries: 2000, maxDepth: 20, timeoutMs: 60_000 };

/**
 * 失败原因（工具按它给一句说明，界面文案见 PRD R6）：damaged 损坏 · encrypted 加密 · split 分卷 · unsupported 不支持的算法 ·
 * encoding 名字编码认不出 · unsafe 不安全或冲突的路径 / 特殊条目 · tooLarge 展开超限 · timeout 超时 · storage 空间不足 ·
 * cancelled 取消 · unavailable 读不了原 ZIP
 */
export type UnzipErrorCode = "damaged" | "encrypted" | "split" | "unsupported" | "encoding" | "unsafe" | "tooLarge" | "timeout" | "storage" | "cancelled" | "unavailable";

export class UnzipError extends Error {
  constructor(readonly code: UnzipErrorCode, readonly detail = "") {
    super(detail ? `${code}: ${detail}` : code);
  }
}

export interface ZipItem {
  /** 包里的相对路径（/ 分隔，已核对安全） */
  path: string;
  dir: boolean;
  /** 声明的展开大小 */
  size: number;
}

export interface ZipListing {
  items: ZipItem[];
  files: number;
  dirs: number;
  /** 声明的展开总大小 */
  bytes: number;
}

export interface ExtractResult {
  /** 新建的解压目录 */
  dir: string;
  files: number;
  dirs: number;
  /** 实际写出的字节 */
  bytes: number;
}

type Platform = NodeJS.Platform;

const UTF8 = new TextDecoder("utf-8", { fatal: true });

/** 条目名：UTF-8 标记 → Info-ZIP Unicode Path（CRC 对得上）→ 纯 ASCII → 合法 UTF-8；都不是就认不出（不猜 GBK / CP437） */
export function decodeName(raw: Buffer, flags: number, extra: Array<{ id: number; data: Buffer }>): string {
  for (const f of extra) {
    if (f.id !== 0x7075 || f.data.length < 6 || f.data[0] !== 1) continue;
    if (f.data.readUInt32LE(1) !== crc32(raw)) continue;
    try {
      return UTF8.decode(f.data.subarray(5));
    } catch {
      throw new UnzipError("encoding");
    }
  }
  if (flags & 0x800 || raw.every((b) => b < 0x80)) {
    try {
      return UTF8.decode(raw);
    } catch {
      throw new UnzipError("encoding");
    }
  }
  try {
    return UTF8.decode(raw);
  } catch {
    throw new UnzipError("encoding");
  }
}

const WIN_RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³]|conin\$|conout\$)(\.|$)/i;

/**
 * 一个条目名归一化成安全的相对路径段：拒绝绝对路径、盘符、UNC、反斜杠变体、空字符和控制字符、. / .. / 空段；
 * Windows 上再拒绝保留设备名、非法字符和末尾的点 / 空格。返回路径段和是不是目录。
 */
export function safeEntryPath(name: string, platform: Platform = process.platform): { parts: string[]; dir: boolean } {
  if (!name || /[\x00-\x1f\x7f]/.test(name)) throw new UnzipError("unsafe", "control character");
  // 反斜杠：有的 Windows 工具拿它当分隔符；当分隔符处理之后再按同一套规则查（..\\x、\\\\server 都过不去）
  const n = name.replace(/\\/g, "/");
  if (n.startsWith("/") || /^[a-zA-Z]:/.test(n)) throw new UnzipError("unsafe", "absolute path");
  const dir = n.endsWith("/");
  const parts = (dir ? n.slice(0, -1) : n).split("/");
  for (const p of parts) {
    if (!p || p === "." || p === "..") throw new UnzipError("unsafe", "relative segment");
    if (Buffer.byteLength(p) > 255) throw new UnzipError("unsafe", "name too long");
    if (platform === "win32" && (/[<>:"|?*]/.test(p) || /[. ]$/.test(p) || WIN_RESERVED.test(p))) throw new UnzipError("unsafe", "name not allowed on this system");
    // macOS / Linux：冒号在 Finder 里是分隔符的别名，单独的保留名没有；其余字符照收
  }
  return { parts, dir };
}

/** 目标系统上同一个文件的写法：macOS、Windows 不分大小写，并按 Unicode 等价比较 */
const collisionKey = (p: string, platform: Platform) => (platform === "linux" ? p : p.normalize("NFC").toLowerCase());

/** 条目的类型：普通文件、目录；符号链接、设备、管道等其他类型拒绝 */
function entryType(e: Entry, named: { dir: boolean }): "file" | "dir" {
  const madeBy = e.versionMadeBy >> 8;
  const mode = (e.externalFileAttributes >>> 16) & 0o170000;
  // Unix 系（3）、macOS（19）的权限位：只认普通文件和目录
  if ((madeBy === 3 || madeBy === 19) && mode) {
    if (mode === 0o040000) return "dir";
    if (mode !== 0o100000) throw new UnzipError("unsafe", "special entry");
  }
  // MS-DOS 属性：0x400 是重解析点（链接）
  if (e.externalFileAttributes & 0x400) throw new UnzipError("unsafe", "link entry");
  if (named.dir || e.externalFileAttributes & 0x10) {
    if (!named.dir && e.uncompressedSize > 0) throw new UnzipError("unsafe", "directory with data");
    return "dir";
  }
  return "file";
}

function mapOpenError(e: unknown): UnzipError {
  if (e instanceof UnzipError) return e;
  const m = String((e as Error)?.message ?? e);
  if (/multi-disk/i.test(m)) return new UnzipError("split");
  if (/encrypt/i.test(m)) return new UnzipError("encrypted");
  if (/compression method/i.test(m)) return new UnzipError("unsupported");
  if ((e as NodeJS.ErrnoException)?.code === "ENOENT" || (e as NodeJS.ErrnoException)?.code === "EACCES") return new UnzipError("unavailable");
  return new UnzipError("damaged", m.slice(0, 200));
}

function openFile(file: string): Promise<ZipFile> {
  return new Promise((resolve, reject) =>
    openZip(file, { lazyEntries: true, autoClose: false, decodeStrings: false, validateEntrySizes: true }, (err, zip) => (err || !zip ? reject(mapOpenError(err)) : resolve(zip))),
  );
}

/** 读完中央目录：逐条核对类型、名字、深度、数量、算法、加密和声明大小；任何一条有问题整包拒绝 */
async function readCatalog(zip: ZipFile, platform: Platform): Promise<{ entries: Array<{ entry: Entry; path: string; dir: boolean }>; listing: ZipListing }> {
  if (zip.entryCount > UNZIP_LIMITS.maxEntries) throw new UnzipError("tooLarge", "entries");
  const out: Array<{ entry: Entry; path: string; dir: boolean }> = [];
  const seen = new Map<string, boolean>();
  let declared = 0;
  await new Promise<void>((resolve, reject) => {
    const fail = (e: unknown) => reject(mapOpenError(e));
    zip.on("error", fail);
    zip.on("end", () => resolve());
    zip.on("entry", (entry: Entry) => {
      try {
        if (out.length >= UNZIP_LIMITS.maxEntries) throw new UnzipError("tooLarge", "entries");
        // 第 0 位：加密；第 6 位：强加密
        if (entry.generalPurposeBitFlag & 0x41) throw new UnzipError("encrypted");
        if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) throw new UnzipError("unsupported");
        const raw = entry.fileName as unknown as Buffer;
        const name = decodeName(Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw)), entry.generalPurposeBitFlag, entry.extraFields ?? []);
        const { parts, dir: namedDir } = safeEntryPath(name, platform);
        const type = entryType(entry, { dir: namedDir });
        if (parts.length - 1 > UNZIP_LIMITS.maxDepth) throw new UnzipError("tooLarge", "depth");
        const rel = parts.join("/");
        const key = collisionKey(rel, platform);
        const isDir = type === "dir";
        const prior = seen.get(key);
        // 同一个目录写了两次无妨；文件重复、文件和目录同名都算冲突
        if (prior !== undefined && !(prior && isDir)) throw new UnzipError("unsafe", "duplicate path");
        for (let i = 1; i < parts.length; i++) {
          const parent = collisionKey(parts.slice(0, i).join("/"), platform);
          if (seen.get(parent) === false) throw new UnzipError("unsafe", "file used as a folder");
          if (!seen.has(parent)) seen.set(parent, true);
        }
        if (!isDir && [...seen.keys()].some((k) => k.startsWith(key + "/"))) throw new UnzipError("unsafe", "folder used as a file");
        seen.set(key, isDir);
        declared += isDir ? 0 : entry.uncompressedSize;
        if (declared > UNZIP_LIMITS.maxBytes) throw new UnzipError("tooLarge", "bytes");
        out.push({ entry, path: rel, dir: isDir });
        zip.readEntry();
      } catch (e) {
        reject(mapOpenError(e));
      }
    });
    zip.readEntry();
  });
  const files = out.filter((e) => !e.dir).length;
  return { entries: out, listing: { items: out.map((e) => ({ path: e.path, dir: e.dir, size: e.dir ? 0 : e.entry.uncompressedSize })), files, dirs: out.length - files, bytes: declared } };
}

/** 只看 ZIP 里有什么（不写盘）：同一套安全核对，有问题的包在查看时就说明 */
export async function inspectZip(file: string, platform: Platform = process.platform): Promise<ZipListing> {
  const zip = await openFile(file);
  try {
    return (await readCatalog(zip, platform)).listing;
  } finally {
    zip.close();
  }
}

/** 在 parent 里新建一个不重名的目录：name、name-2、name-3…（已有的不碰，不合并） */
export function freshDir(parent: string, name: string): string {
  fs.mkdirSync(parent, { recursive: true });
  const base = name.replace(/[<>:"|?*\\/\x00-\x1f]/g, "_").replace(/[. ]+$/, "").slice(0, 120) || "zip";
  for (let i = 1; i < 10_000; i++) {
    const p = path.join(parent, i === 1 ? base : `${base}-${i}`);
    try {
      fs.mkdirSync(p);
      return p;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
  }
  throw new UnzipError("storage", "no free name");
}

/** ZIP 文件名去掉 .zip，当解压目录的名字 */
export const stemOf = (name: string) => path.basename(String(name || "zip").replace(/\\/g, "/")).replace(/\.zip$/i, "") || "zip";

/**
 * 解压到 parent 下新建的不重名目录 name（-2、-3…）。parent 必须是已经核对过可以写的位置。
 * 成功返回新目录；任何失败都删掉这次新建的整个目录再抛 UnzipError。signal：取消（停止任务、到期回收）。
 */
export async function extractZip(file: string, parent: string, name: string, opts: { signal?: AbortSignal; platform?: Platform; timeoutMs?: number } = {}): Promise<ExtractResult> {
  const platform = opts.platform ?? process.platform;
  const zip = await openFile(file);
  let dest = "";
  const ac = new AbortController();
  const limit = opts.timeoutMs ?? UNZIP_LIMITS.timeoutMs;
  const deadline = Date.now() + limit;
  const timer = setTimeout(() => ac.abort(new UnzipError("timeout")), limit);
  /** 到点了没有：定时器之外每个检查点也按截止时间看一次（小包可能在定时器触发之前就做完了一大半） */
  const overdue = () => {
    if (!ac.signal.aborted && Date.now() >= deadline) ac.abort(new UnzipError("timeout"));
    return ac.signal.aborted;
  };
  const onCancel = () => ac.abort(new UnzipError("cancelled"));
  if (opts.signal?.aborted) onCancel();
  else opts.signal?.addEventListener("abort", onCancel, { once: true });
  const stopped = () => (ac.signal.reason instanceof UnzipError ? ac.signal.reason : new UnzipError("cancelled"));
  try {
    const { entries } = await readCatalog(zip, platform);
    if (overdue()) throw stopped();
    try {
      dest = freshDir(parent, name);
    } catch (e) {
      throw (e as NodeJS.ErrnoException).code === "ENOSPC" ? new UnzipError("storage") : e instanceof UnzipError ? e : new UnzipError("storage", String((e as Error).message).slice(0, 200));
    }
    const root = fs.realpathSync(dest);
    const pathLimit = platform === "win32" ? 259 : 4095;
    let bytes = 0;
    let files = 0;
    let dirs = 0;
    const made = new Set<string>();
    /** 逐层建目录（都是这次新建的，不跟已有的链接）；最终路径必须还在解压根里 */
    const ensureDir = (rel: string[]) => {
      let cur = root;
      for (const part of rel) {
        cur = path.join(cur, part);
        if (made.has(cur)) continue;
        try {
          fs.mkdirSync(cur, { mode: 0o755 });
          dirs++;
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
          if (!fs.lstatSync(cur).isDirectory()) throw new UnzipError("unsafe", "path conflict");
        }
        made.add(cur);
      }
      return cur;
    };
    for (const it of entries) {
      if (overdue()) throw stopped();
      const parts = it.path.split("/");
      const target = path.join(root, ...parts);
      if (target.length > pathLimit) throw new UnzipError("unsafe", "path too long");
      const rel = path.relative(root, target);
      if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) throw new UnzipError("unsafe", "outside the folder");
      if (it.dir) {
        ensureDir(parts);
        continue;
      }
      const folder = ensureDir(parts.slice(0, -1));
      if (path.relative(root, fs.realpathSync(folder)).startsWith("..")) throw new UnzipError("unsafe", "outside the folder");
      const stream = await new Promise<NodeJS.ReadableStream>((resolve, reject) => zip.openReadStream(it.entry, (err, s) => (err || !s ? reject(mapOpenError(err)) : resolve(s))));
      if (overdue()) {
        (stream as any).destroy?.();
        throw stopped();
      }
      const out = fs.createWriteStream(target, { flags: "wx", mode: 0o644 });
      let sum = 0;
      let written = 0;
      await new Promise<void>((resolve, reject) => {
        let done = false;
        const finish = (e?: unknown) => {
          if (done) return;
          done = true;
          ac.signal.removeEventListener("abort", abort);
          if (e) {
            (stream as any).destroy?.();
            out.destroy();
            reject(e);
          } else resolve();
        };
        const abort = () => finish(stopped());
        ac.signal.addEventListener("abort", abort, { once: true });
        stream.on("data", (c: Buffer) => {
          if (overdue()) return finish(stopped());
          sum = crc32(c, sum);
          written += c.length;
          bytes += c.length;
          if (bytes > UNZIP_LIMITS.maxBytes || written > it.entry.uncompressedSize) return finish(new UnzipError("tooLarge", "bytes"));
          if (!out.write(c)) {
            stream.pause();
            out.once("drain", () => stream.resume());
          }
        });
        stream.on("error", (e) => finish(mapOpenError(e)));
        out.on("error", (e: NodeJS.ErrnoException) => finish(e.code === "ENOSPC" || e.code === "EDQUOT" ? new UnzipError("storage") : new UnzipError("storage", e.message.slice(0, 200))));
        stream.on("end", () => {
          if (written !== it.entry.uncompressedSize || sum >>> 0 !== it.entry.crc32 >>> 0) return finish(new UnzipError("damaged", "crc"));
          out.end(() => finish());
        });
      });
      files++;
    }
    return { dir: dest, files, dirs, bytes };
  } catch (e) {
    if (dest) fs.rmSync(dest, { recursive: true, force: true, maxRetries: 3 });
    throw e instanceof UnzipError ? e : mapOpenError(e);
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onCancel);
    zip.close();
  }
}

/**
 * 原 ZIP 文件看上去是不是 ZIP（收文件时用，只看签名和结尾记录，不读条目）：开头是本地文件头 PK\x03\x04、
 * 空包的结尾记录 PK\x05\x06，或分卷标记 PK\x07\x08；最后 64 KiB + 22 字节里要找得到结尾记录。
 */
export function looksLikeZip(buf: Buffer): boolean {
  if (buf.length < 22 || buf[0] !== 0x50 || buf[1] !== 0x4b) return false;
  const sig = (buf[2] << 8) | buf[3];
  if (sig !== 0x0304 && sig !== 0x0506 && sig !== 0x0708) return false;
  const from = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= from; i--) if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) return true;
  return false;
}
