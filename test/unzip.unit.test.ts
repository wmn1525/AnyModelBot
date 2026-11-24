import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { crc32, deflateRawSync } from "node:zlib";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { UNZIP_LIMITS, UnzipError, extractZip, inspectZip, looksLikeZip, safeEntryPath } from "../src/attachments/unzip.js";

/**
 * PRD R6 的安全解压规则：用一个最小的 ZIP 写出器做出各种包（正常的、越界的、重复的、链接、超限、坏 CRC、加密、分卷、
 * 编码认不出的），断言该成功的成功、该拒绝的拒绝，并且拒绝时解压根之外没有新文件、这次建的目录已经删掉。
 */
interface E {
  name: string | Buffer;
  data?: Buffer | string;
  method?: 0 | 8 | 12;
  flags?: number;
  /** 外部属性（高 16 位是 Unix 权限位） */
  attrs?: number;
  /** 0 = MS-DOS，3 = Unix */
  madeBy?: number;
  crc?: number;
  /** 声明的展开大小（默认实际大小） */
  size?: number;
  extra?: Buffer;
}

function zip(entries: E[], opts: { disk?: number } = {}): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.isBuffer(e.name) ? e.name : Buffer.from(e.name, "utf8");
    const raw = e.data === undefined ? Buffer.alloc(0) : Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data, "utf8");
    const method = e.method ?? 0;
    // 加密的条目前面有 12 字节的加密头（真实的 ZipCrypto 包也这样，压缩后大小比原大小多 12）
    const plain = method === 8 ? deflateRawSync(raw) : raw;
    const body = (e.flags ?? 0) & 1 ? Buffer.concat([Buffer.alloc(12, 7), plain]) : plain;
    const crc = e.crc ?? crc32(raw);
    const size = e.size ?? raw.length;
    const flags = e.flags ?? (Buffer.isBuffer(e.name) ? 0 : 0x800);
    const extra = e.extra ?? Buffer.alloc(0);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(flags, 6);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc >>> 0, 14);
    lh.writeUInt32LE(body.length, 18);
    lh.writeUInt32LE(size, 22);
    lh.writeUInt16LE(name.length, 26);
    lh.writeUInt16LE(extra.length, 28);
    const local = Buffer.concat([lh, name, extra, body]);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(((e.madeBy ?? 0) << 8) | 20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(flags, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc >>> 0, 16);
    ch.writeUInt32LE(body.length, 20);
    ch.writeUInt32LE(size, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt16LE(extra.length, 30);
    ch.writeUInt32LE((e.attrs ?? 0) >>> 0, 38);
    ch.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([ch, name, extra]));
    locals.push(local);
    offset += local.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(opts.disk ?? 0, 4);
  eocd.writeUInt16LE(opts.disk ?? 0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

let root = "";
let n = 0;
/** 每个用例一个干净的目标父目录，外面放一个「原有文件」，用来证明没有越界、没有改动 */
function setup(entries: E[] | Buffer, opts: { disk?: number } = {}) {
  const dir = path.join(root, `case-${++n}`);
  const parent = path.join(dir, "target");
  fs.mkdirSync(parent, { recursive: true });
  fs.writeFileSync(path.join(dir, "outside.txt"), "original");
  fs.writeFileSync(path.join(parent, "existing.txt"), "keep me");
  const file = path.join(dir, "in.zip");
  fs.writeFileSync(file, Buffer.isBuffer(entries) ? entries : zip(entries, opts));
  return { dir, parent, file };
}
/** 拒绝之后：目标父目录里只剩原有文件，外面也没多东西 */
function untouched(c: { dir: string; parent: string }) {
  expect(fs.readdirSync(c.parent).sort()).toEqual(["existing.txt"]);
  expect(fs.readFileSync(path.join(c.parent, "existing.txt"), "utf8")).toBe("keep me");
  expect(fs.readdirSync(c.dir).sort()).toEqual(["in.zip", "outside.txt", "target"]);
  expect(fs.readFileSync(path.join(c.dir, "outside.txt"), "utf8")).toBe("original");
}
async function refused(entries: E[] | Buffer, code: string, opts: { disk?: number; platform?: NodeJS.Platform; timeoutMs?: number; signal?: AbortSignal } = {}) {
  const c = setup(entries, opts);
  const err = await extractZip(c.file, c.parent, "pkg", opts).then(() => undefined, (e) => e);
  expect(err).toBeInstanceOf(UnzipError);
  expect((err as UnzipError).code).toBe(code);
  untouched(c);
  return c;
}

const saved = { ...UNZIP_LIMITS };
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "amb-unzip-"));
});
afterEach(() => Object.assign(UNZIP_LIMITS, saved));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe("安全解压（PRD R6）", () => {
  it("正常包：保留层级、中文名和 ZIP 记录的空目录；包里的压缩包只当文件；新建不重名目录，不碰已有的", async () => {
    const inner = zip([{ name: "deep.txt", data: "x" }]);
    const c = setup([
      { name: "说明.md", data: "# 你好", method: 8 },
      { name: "src/", attrs: 0x10 },
      { name: "src/main.py", data: "print(1)\n", method: 8 },
      { name: "empty/" },
      { name: "nested.zip", data: inner },
      { name: "a/b/c/d.txt", data: "deep" },
    ]);
    fs.mkdirSync(path.join(c.parent, "pkg"));
    fs.writeFileSync(path.join(c.parent, "pkg", "old.txt"), "old");
    const r = await extractZip(c.file, c.parent, "pkg");
    expect(r.dir).toBe(path.join(c.parent, "pkg-2"));
    expect(r.files).toBe(4);
    expect(fs.readFileSync(path.join(r.dir, "说明.md"), "utf8")).toBe("# 你好");
    expect(fs.readFileSync(path.join(r.dir, "src", "main.py"), "utf8")).toBe("print(1)\n");
    expect(fs.statSync(path.join(r.dir, "empty")).isDirectory()).toBe(true);
    expect(fs.readdirSync(path.join(r.dir, "empty"))).toEqual([]);
    expect(fs.readFileSync(path.join(r.dir, "nested.zip")).equals(inner)).toBe(true);
    expect(fs.existsSync(path.join(r.dir, "deep.txt"))).toBe(false);
    expect(fs.readFileSync(path.join(r.dir, "a", "b", "c", "d.txt"), "utf8")).toBe("deep");
    // 已有的同名目录原样不动
    expect(fs.readdirSync(path.join(c.parent, "pkg"))).toEqual(["old.txt"]);
    // 不给执行权限
    if (process.platform !== "win32") expect(fs.statSync(path.join(r.dir, "src", "main.py")).mode & 0o111).toBe(0);
  });

  it("查看只读中央目录：给出路径、大小，不写盘", async () => {
    const c = setup([{ name: "a.txt", data: "hello" }, { name: "dir/" }, { name: "dir/b.txt", data: "world!" }]);
    const l = await inspectZip(c.file);
    expect(l).toMatchObject({ files: 2, dirs: 1, bytes: 11 });
    expect(l.items.map((i) => i.path)).toEqual(["a.txt", "dir", "dir/b.txt"]);
    untouched(c);
  });

  it("越界路径：../、绝对路径、盘符、UNC、反斜杠变体、. 和空段都拒绝，什么都不留", async () => {
    for (const name of ["../x.txt", "/etc/passwd", "C:/Windows/x.txt", "c:x.txt", "//server/share/x", "\\\\server\\share\\x", "a\\..\\..\\x.txt", "..\\x.txt", "a/./b.txt", "a//b.txt", "a/../../x.txt"]) {
      await refused([{ name: "ok.txt", data: "1" }, { name, data: "evil" }], "unsafe");
    }
    expect(() => safeEntryPath("a\0b")).toThrow(UnzipError);
    expect(() => safeEntryPath("a\u0007b")).toThrow(UnzipError);
  });

  it("重复与冲突：同一路径两次、文件和目录同名拒绝；大小写 / Unicode 等价按目标系统判断", async () => {
    await refused([{ name: "a.txt", data: "1" }, { name: "a.txt", data: "2" }], "unsafe");
    await refused([{ name: "a", data: "file" }, { name: "a/b.txt", data: "2" }], "unsafe");
    await refused([{ name: "a/b.txt", data: "2" }, { name: "a", data: "file" }], "unsafe");
    // macOS / Windows 不分大小写、按 Unicode 等价比较
    await refused([{ name: "Readme.md", data: "1" }, { name: "README.md", data: "2" }], "unsafe", { platform: "darwin" });
    await refused([{ name: "caf\u00e9.txt", data: "1" }, { name: "cafe\u0301.txt", data: "2" }], "unsafe", { platform: "win32" });
    if (process.platform === "linux") {
      const c = setup([{ name: "Readme.md", data: "1" }, { name: "README.md", data: "2" }]);
      expect((await extractZip(c.file, c.parent, "pkg", { platform: "linux" })).files).toBe(2);
    }
    // 同一个目录写了两次无妨
    const d = setup([{ name: "d/" }, { name: "d/" }, { name: "d/x.txt", data: "x" }]);
    expect((await extractZip(d.file, d.parent, "pkg")).files).toBe(1);
  });

  it("Windows 上不接受的名字：保留设备名、非法字符、末尾的点和空格", async () => {
    for (const name of ["con.txt", "dir/NUL", "aux", "a:b.txt", "a<b.txt", "trailing.", "space "]) await refused([{ name, data: "x" }], "unsafe", { platform: "win32" });
    expect(safeEntryPath("con.txt", "linux").parts).toEqual(["con.txt"]);
  });

  it("符号链接、设备等特殊条目拒绝", async () => {
    await refused([{ name: "link", data: "/etc/passwd", madeBy: 3, attrs: (0o120777 << 16) >>> 0 }], "unsafe");
    await refused([{ name: "dev", madeBy: 3, attrs: (0o020644 << 16) >>> 0 }], "unsafe");
    await refused([{ name: "fifo", madeBy: 3, attrs: (0o010644 << 16) >>> 0 }], "unsafe");
    await refused([{ name: "reparse", data: "x", attrs: 0x400 }], "unsafe");
    // 普通文件、目录的 Unix 权限位照收（只是不恢复执行权限）
    const c = setup([{ name: "run.sh", data: "echo hi", madeBy: 3, attrs: (0o100755 << 16) >>> 0 }, { name: "d/", madeBy: 3, attrs: (0o040755 << 16) >>> 0 }]);
    const r = await extractZip(c.file, c.parent, "pkg");
    if (process.platform !== "win32") expect(fs.statSync(path.join(r.dir, "run.sh")).mode & 0o111).toBe(0);
  });

  it("展开超限：实际字节（不只信声明大小）、条目数、目录深度", async () => {
    UNZIP_LIMITS.maxBytes = 1000;
    await refused([{ name: "a.bin", data: Buffer.alloc(600), method: 8 }, { name: "b.bin", data: Buffer.alloc(600), method: 8 }], "tooLarge");
    // 声明 10 字节、实际 5000 字节：按实际解码的字节停下
    const c = setup([{ name: "bomb.bin", data: Buffer.alloc(5000), method: 8, size: 10 }]);
    const err = await extractZip(c.file, c.parent, "pkg").then(() => undefined, (e) => e);
    expect(err).toBeInstanceOf(UnzipError);
    untouched(c);
    Object.assign(UNZIP_LIMITS, saved);
    UNZIP_LIMITS.maxEntries = 5;
    await refused(Array.from({ length: 6 }, (_, i) => ({ name: `f${i}.txt`, data: "x" })), "tooLarge");
    const ok = setup(Array.from({ length: 5 }, (_, i) => ({ name: `f${i}.txt`, data: "x" })));
    expect((await extractZip(ok.file, ok.parent, "pkg")).files).toBe(5);
    Object.assign(UNZIP_LIMITS, saved);
    // 根层为 0：第 20 层可以，第 21 层不行
    const level = (k: number) => Array.from({ length: k }, (_, i) => `d${i}`).join("/") + "/f.txt";
    const deep = setup([{ name: level(20), data: "x" }]);
    expect((await extractZip(deep.file, deep.parent, "pkg")).files).toBe(1);
    await refused([{ name: level(21), data: "x" }], "tooLarge");
  });

  it("CRC 不对、加密、分卷、不支持的算法明确拒绝", async () => {
    await refused([{ name: "a.txt", data: "hello", crc: 12345 }], "damaged");
    await refused([{ name: "a.txt", data: "hello", flags: 0x801 }], "encrypted");
    await refused([{ name: "a.txt", data: "hello", method: 12 }], "unsupported");
    await refused([{ name: "a.txt", data: "hello" }], "split", { disk: 1 });
    await refused(Buffer.from("PK\u0003\u0004 this is not really a zip"), "damaged");
  });

  it("名字编码：UTF-8 标记、合法 UTF-8 照收；认不出的（GBK 之类）拒绝，不猜", async () => {
    const c = setup([{ name: Buffer.from("资料/表格.csv", "utf8"), data: "a,b" }]);
    expect((await extractZip(c.file, c.parent, "pkg")).files).toBe(1);
    expect(fs.existsSync(path.join(c.parent, "pkg", "资料", "表格.csv"))).toBe(true);
    await refused([{ name: Buffer.from([0xd7, 0xca, 0xc1, 0xcf, 0x2e, 0x74, 0x78, 0x74]), data: "gbk" }], "encoding");
  });

  it("合法的空 ZIP：可以查看和解压，说明里没有文件", async () => {
    const c = setup([]);
    expect(await inspectZip(c.file)).toMatchObject({ files: 0, dirs: 0, bytes: 0 });
    expect((await extractZip(c.file, c.parent, "pkg")).files).toBe(0);
    expect(looksLikeZip(zip([]))).toBe(true);
  });

  it("超时和取消：停下并清理这次的半成品", async () => {
    await refused([{ name: "a.txt", data: "hello" }], "timeout", { timeoutMs: 0 });
    const ac = new AbortController();
    ac.abort();
    await refused([{ name: "a.txt", data: "hello" }], "cancelled", { signal: ac.signal });
  });

  it("收文件时只看签名和结尾记录", () => {
    expect(looksLikeZip(zip([{ name: "a.txt", data: "x" }]))).toBe(true);
    expect(looksLikeZip(Buffer.from("not a zip at all, just some text that is long enough"))).toBe(false);
    expect(looksLikeZip(Buffer.from("PK\u0003\u0004" + "x".repeat(40)))).toBe(false);
    expect(looksLikeZip(Buffer.alloc(0))).toBe(false);
  });
});
