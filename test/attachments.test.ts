/**
 * 消息附件（网页对话）：能力协商、批次原子预约、真实字节的核对、图片规范化的核对、带附件的消息原子受理与防重复、
 * 图片与文本真实到达模型、归属与上限绕不开、移除后不复活、到期回收。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { App } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { mockOpenAI } from "./helpers.js";
import { LIMITS, classify, normalizedSize, planBatch } from "../src/attachments/limits.js";
import { cleanRendition, decodeText, sniffImage } from "../src/attachments/sniff.js";

let app: App, llm: Awaited<ReturnType<typeof mockOpenAI>>, root: string, base: string;
const id = () => crypto.randomBytes(9).toString("base64url");

/** 一张真的 PNG（RGBA，纯色），可带额外的块（文字、动画标记） */
function png(width: number, height: number, extra: Array<[string, Buffer]> = []): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(height * (1 + width * 4), 0x80);
  for (let y = 0; y < height; y++) raw[y * (1 + width * 4)] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), ...extra.map(([t, d]) => chunk(t, d)), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** 一张结构完整的最小 JPEG（SOI、JFIF、SOF0、SOS、几个字节的扫描数据、EOI）：只给文件头核对用，不保证能解码 */
function jpeg(width: number, height: number): Buffer {
  const seg = (marker: number, data: Buffer) => {
    const head = Buffer.from([0xff, marker, 0, 0]);
    head.writeUInt16BE(data.length + 2, 2);
    return Buffer.concat([head, data]);
  };
  const sof = Buffer.from([8, 0, 0, 0, 0, 1, 1, 0x11, 0]);
  sof.writeUInt16BE(height, 1);
  sof.writeUInt16BE(width, 3);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), seg(0xe0, Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "latin1")), seg(0xc0, sof), seg(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])), Buffer.from([0x12, 0x34, 0x56]), Buffer.from([0xff, 0xd9])]);
}

const api = async (p: string, init: RequestInit = {}) => {
  const res = await fetch(`${base}/amb/api${p}`, { ...init, headers: { ...(init.body && !(init.body instanceof Uint8Array) ? { "content-type": "application/json" } : {}), ...(init.headers ?? {}) } });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
};
const state = (bot: string) => api(`/bots/${bot}/attachments/state`).then((r) => r.body);
const reserve = async (bot: string, items: Array<{ name: string; mime: string; size: number }>) => {
  const s = await state(bot);
  return api(`/bots/${bot}/attachments/batches`, { method: "POST", body: JSON.stringify({ protocol: 1, segment: s.segment, batch: id(), items: items.map((i) => ({ clientId: id(), ...i })) }) });
};
const put = (bot: string, att: string, what: "content" | "rendition", data: Buffer) =>
  api(`/bots/${bot}/attachments/${att}/${what}`, { method: "PUT", body: new Uint8Array(data), headers: { "content-type": "application/octet-stream" } });
/** 加一份文本文件到就绪 */
const addText = async (bot: string, name: string, text: string | Buffer) => {
  const data = typeof text === "string" ? Buffer.from(text, "utf8") : text;
  const r = await reserve(bot, [{ name, mime: "", size: data.length }]);
  expect(r.status).toBe(200);
  return (await put(bot, r.body.items[0].id, "content", data)).body.item;
};
/** 加一张图片到就绪（原图 + 界面规范化后的那一份） */
const addImage = async (bot: string, w = 8, h = 6) => {
  const data = png(w, h);
  const r = await reserve(bot, [{ name: "image.png", mime: "image/png", size: data.length }]);
  expect(r.status).toBe(200);
  const first = await put(bot, r.body.items[0].id, "content", data);
  expect(first.body.item.status).toBe("rendition");
  const n = normalizedSize(w, h);
  return (await put(bot, r.body.items[0].id, "rendition", png(n.width, n.height))).body.item;
};
const sendMsg = async (bot: string, text: string, over: Record<string, unknown> = {}) => {
  const s = await state(bot);
  return api(`/bots/${bot}/chat/send`, { method: "POST", body: JSON.stringify({ version: 1, clientMessageId: id(), text, segment: s.segment, revision: s.revision, modelRevision: s.model.revision, attachments: s.items.map((a: any) => ({ id: a.id, version: a.version })), ...over }) });
};
const settled = async (bot: string) => {
  for (let i = 0; i < 200; i++) {
    if (!(await state(bot)).busy) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("turn did not finish");
};

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "amb-attachments-"));
  llm = await mockOpenAI({ models: ["gpt-4o-mock", "plain-text-model"], reply: () => "好的" });
  app = new App(loadConfig({ dataDir: root, env: { AMB_MAGPIE_BASE_URL: llm.url + "/v1", AMB_MAGPIE_API_KEY: "test-key", AMB_UI_PORT: "0", AMB_AGENT: "off", AMB_WEIXIN_API_BASE: "http://127.0.0.1:9", AMB_DEFAULT_MODEL: "gpt-4o-mock" } }), { printQrToTerminal: false });
  await app.start();
  for (const b of ["a", "b", "c", "d", "e", "f", "g", "h"]) app.store.createBot({ id: b, name: b, defaultModel: "gpt-4o-mock" });
  base = app.web!.url.replace(/\/$/, "");
});
afterAll(async () => { await app?.stop(); await llm?.close(); fs.rmSync(root, { recursive: true, force: true }); });

describe("附件的格式与上限（纯函数）", () => {
  it("按扩展名和 MIME 分类：文本、图片、要转换的图片、不收的格式", () => {
    expect(classify("需求说明.md", "")).toEqual({ kind: "text", ext: "md" });
    expect(classify("a.HTML", "text/html")).toEqual({ kind: "text", ext: "html" });
    expect(classify("run.ps1", "")).toEqual({ kind: "text", ext: "ps1" });
    expect(classify("image.png", "image/png")).toEqual({ kind: "image", ext: "png" });
    expect(classify("", "image/jpeg")).toEqual({ kind: "image", ext: "jpg" });
    // JPEG 的另外两种扩展名（Windows 上的浏览器另存图片时常见）
    expect(classify("下载.jfif", "image/jpeg")).toEqual({ kind: "image", ext: "jfif" });
    expect(classify("photo.JPE", "")).toEqual({ kind: "image", ext: "jpe" });
    for (const n of ["a.heic", "a.avif", "a.bmp", "a.tiff", "a.svg"]) expect(classify(n, "")).toEqual({ reject: "imageConvert" });
    // 扩展名不在表里、但系统说它是图片：给图片那一句提示，不说成"请用 Markdown"
    expect(classify("a.jp2", "image/jp2")).toEqual({ reject: "imageConvert" });
    expect(classify("raw.dng", "image/x-adobe-dng")).toEqual({ reject: "imageConvert" });
    // 内部也是 ZIP 结构的 .docx / .xlsx / .jar / .epub 照原规则不收（只有扩展名是 .zip 才走 ZIP）
    for (const n of ["a.pdf", "a.docx", "a.xlsx", "a.pptx", "a.odt", "a.jar", "a.apk", "a.epub", "a.exe", "a.msi", "a.dmg", "a.dll", "a.so", "a.lnk", "a.mp4", "a.mp3", "noext"]) expect(classify(n, "")).toEqual({ reject: "format" });
    // ZIP：只认 .zip（大小写不限），不看 MIME；别的压缩格式提示「仅支持 ZIP」
    expect(classify("资料.zip", "")).toEqual({ kind: "zip", ext: "zip" });
    expect(classify("A.ZIP", "application/x-zip-compressed")).toEqual({ kind: "zip", ext: "zip" });
    for (const n of ["a.rar", "a.7z", "a.tar", "a.gz", "a.tgz", "a.tar.gz", "a.tar.xz", "a.bz2", "a.xz"]) expect(classify(n, "")).toEqual({ reject: "archive" });
  });

  it("批次逐项核算（PRD R4）：按原顺序占名额，不合格的各给原因，后面还放得下的合格项照收", () => {
    const f = (name: string, size = 10) => ({ name, mime: "", size });
    const MIB = 1024 * 1024;
    const ok = (kind: string) => expect.objectContaining({ ok: true, kind });
    expect(planBatch([f("a.md"), f("b.md"), f("c.md")], { items: 6, images: 0, bytes: 0 })).toEqual([ok("text"), ok("text"), { ok: false, code: "count" }]);
    expect(planBatch([f("a.png"), f("b.png")], { items: 3, images: 3, bytes: 0 })).toEqual([ok("image"), { ok: false, code: "count" }]);
    // 合计超限的那一项不加，后面更小的还放得下就加
    expect(planBatch([f("a.md", 8 * MIB), f("b.md", 8 * MIB), f("c.md", 1 * MIB)], { items: 0, images: 0, bytes: 40 * MIB })).toEqual([ok("text"), { ok: false, code: "size" }, ok("text")]);
    expect(planBatch([f("a.md", LIMITS.maxFileBytes)], { items: 0, images: 0, bytes: 0 })).toEqual([ok("text")]);
    expect(planBatch([f("a.md", LIMITS.maxFileBytes + 1)], { items: 0, images: 0, bytes: 0 })).toEqual([{ ok: false, code: "size" }]);
    expect(planBatch([f("a.md"), f("b.md", 0)], { items: 0, images: 0, bytes: 0 })).toEqual([ok("text"), { ok: false, code: "empty" }]);
    expect(planBatch([f("a.md"), f("b.pdf"), f("c.rar")], { items: 0, images: 0, bytes: 0 })).toEqual([ok("text"), { ok: false, code: "format" }, { ok: false, code: "archive" }]);
    // ZIP：单份 50 MiB（等于上限可以、多 1 字节不行），算 1 个附件、0 张图；和图片、文本共用总量 50 MiB
    expect(planBatch([f("a.zip", 50 * MIB)], { items: 0, images: 0, bytes: 0 })).toEqual([ok("zip")]);
    expect(planBatch([f("a.zip", 50 * MIB + 1)], { items: 0, images: 0, bytes: 0 })).toEqual([{ ok: false, code: "size" }]);
    expect(planBatch([f("a.zip", 50 * MIB), f("b.md", 1)], { items: 0, images: 0, bytes: 0 })).toEqual([ok("zip"), { ok: false, code: "size" }]);
    expect(planBatch([{ name: "a.png", mime: "image/png", size: 10 * MIB }, f("b.zip", 40 * MIB)], { items: 0, images: 0, bytes: 0 })).toEqual([ok("image"), ok("zip")]);
    expect(planBatch(Array.from({ length: 9 }, (_, i) => f(`${i}.zip`, MIB)), { items: 0, images: 0, bytes: 0 }).map((r) => r.ok)).toEqual([true, true, true, true, true, true, true, true, false]);
    expect(planBatch([...Array.from({ length: 4 }, (_, i) => ({ name: `${i}.png`, mime: "image/png", size: 10 })), ...Array.from({ length: 4 }, (_, i) => f(`${i}.zip`)), { name: "5.png", mime: "image/png", size: 10 }], { items: 0, images: 0, bytes: 0 }).map((r) => r.ok)).toEqual([true, true, true, true, true, true, true, true, false]);
    // 代理模式关着：ZIP 不收，图片照常
    expect(planBatch([f("a.zip"), { name: "a.png", mime: "image/png", size: 10 }], { items: 0, images: 0, bytes: 0 }, { zipOk: false })).toEqual([{ ok: false, code: "agentOff" }, ok("image")]);
  });

  it("图片按文件头认：尺寸、动画；规范化的那一份去掉元信息；超过 4096 等比缩小、小图不放大", () => {
    expect(sniffImage(png(8, 6))).toMatchObject({ format: "png", width: 8, height: 6, animated: false });
    expect(sniffImage(png(8, 6, [["acTL", Buffer.alloc(8)]]))?.animated).toBe(true);
    expect(sniffImage(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeUndefined();
    expect(sniffImage(png(8, 6).subarray(0, 40))).toBeUndefined();
    const gif = Buffer.from("47494638396101000100800000000000ffffff2c00000000010001000002024401003b", "hex");
    expect(sniffImage(gif)).toMatchObject({ format: "gif", width: 1, height: 1, animated: false });
    const twoFrames = Buffer.concat([gif.subarray(0, gif.length - 1), gif.subarray(19)]);
    expect(sniffImage(twoFrames)?.animated).toBe(true);
    // JPEG 的 EOI 后面还拖着数据（手机相机的尾部元数据、动态照片里的视频、补零）照样认；图像数据被截断的不认
    const jpg = jpeg(32, 20);
    expect(sniffImage(jpg)).toMatchObject({ format: "jpeg", width: 32, height: 20 });
    for (const tail of [Buffer.concat([Buffer.from("SEFH"), Buffer.alloc(300, 0x41), Buffer.from("SEFT")]), Buffer.concat([Buffer.from("\0\0\0\x18ftypmp42"), Buffer.alloc(50_000, 0x42)]), Buffer.alloc(512)])
      expect(sniffImage(Buffer.concat([jpg, tail]))).toMatchObject({ format: "jpeg", width: 32, height: 20 });
    expect(sniffImage(jpg.subarray(0, jpg.length - 2))).toBeUndefined();
    // 规范化的那一份是界面刚编码的：后面拖着数据的不收
    expect(cleanRendition(jpg)).toMatchObject({ mime: "image/jpeg", width: 32, height: 20 });
    expect(cleanRendition(Buffer.concat([jpg, Buffer.alloc(512)]))).toBeUndefined();
    const withText = png(8, 6, [["tEXt", Buffer.from("Author\0someone")], ["eXIf", Buffer.alloc(12)]]);
    const clean = cleanRendition(withText)!;
    expect(clean.mime).toBe("image/png");
    expect(clean.data.includes(Buffer.from("tEXt"))).toBe(false);
    expect(clean.data.includes(Buffer.from("eXIf"))).toBe(false);
    expect(sniffImage(clean.data)).toMatchObject({ width: 8, height: 6 });
    expect(normalizedSize(8192, 2048)).toEqual({ width: 4096, height: 1024 });
    expect(normalizedSize(4096, 4096)).toEqual({ width: 4096, height: 4096 });
    expect(normalizedSize(300, 200)).toEqual({ width: 300, height: 200 });
  });

  it("文本只认 UTF-8 和带 BOM 的 UTF-16；二进制伪装、认不出的编码都拒绝，不出乱码", () => {
    expect(decodeText(Buffer.from("你好 hi"))).toMatchObject({ ok: true, text: "你好 hi", chars: 5 });
    expect(decodeText(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("a")]))).toMatchObject({ ok: true, text: "a" });
    expect(decodeText(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("你好", "utf16le")]))).toMatchObject({ ok: true, text: "你好", encoding: "utf-16le" });
    expect(decodeText(Buffer.from("hello world, plain", "utf16le"))).toEqual({ ok: false, code: "encoding" });
    expect(decodeText(Buffer.from([0xc4, 0xe3, 0xba, 0xc3]))).toEqual({ ok: false, code: "encoding" });
    expect(decodeText(Buffer.from("%PDF-1.7 ..."))).toEqual({ ok: false, code: "format" });
    expect(decodeText(Buffer.from("PK\x03\x04rest"))).toEqual({ ok: false, code: "format" });
    expect(decodeText(Buffer.from('{"a": 1,,}'))).toMatchObject({ ok: true });
  });
});

describe("GitHub 链接分享封面素材（R10）", () => {
  it("中文、英文两版都是 1280×640 的 JPG，小于 1MB，字节数与交付的一致", () => {
    const brand = path.join(import.meta.dirname, "..", "docs", "assets", "brand");
    for (const [name, bytes] of [["github-social-preview-zh.jpg", 205_199], ["github-social-preview-en.jpg", 218_208]] as const) {
      const data = fs.readFileSync(path.join(brand, name));
      expect(data.length).toBe(bytes);
      expect(data.length).toBeLessThan(1024 * 1024);
      expect(sniffImage(data)).toMatchObject({ format: "jpeg", width: 1280, height: 640 });
    }
  });
});

describe("附件接口", () => {
  it("能力协商：协议版本、真实上限、格式、看图三态、上下文预算、存储位置", async () => {
    const s = await state("a");
    expect(s).toMatchObject({ protocol: 1, sendVersion: 1, textReading: true, storage: "bot-device", items: [], busy: false });
    expect(s.limits).toMatchObject({ maxItems: 8, maxImages: 4, maxFileBytes: 10485760, maxTotalBytes: 52428800, maxTextChars: 100000, maxTextCharsTotal: 200000 });
    expect(s.formats.text).toEqual(expect.arrayContaining(["md", "html", "txt", "csv", "json", "ps1"]));
    expect(s.model).toMatchObject({ id: "gpt-4o-mock", vision: "supported", channel: "open", context: { tokens: 8192, estimated: true } });
    expect((await api("/bots/a/attachments/batches", { method: "POST", body: JSON.stringify({ protocol: 99, segment: s.segment, batch: id(), items: [] }) })).body.code).toBe("protocol");
  });

  it("批次逐项预约：不合格的各带原因、合格的照收；并发争最后一个图片名额只有一批拿到", async () => {
    for (let i = 0; i < 3; i++) await addImage("b");
    const s = await state("b");
    const one = () => api("/bots/b/attachments/batches", { method: "POST", body: JSON.stringify({ protocol: 1, segment: s.segment, batch: id(), items: [{ clientId: id(), name: "image.png", mime: "image/png", size: 100 }] }) });
    const both = await Promise.all([one(), one()]);
    expect(both.map((r) => r.status)).toEqual([200, 200]);
    expect(both.map((r) => r.body.items.length).sort()).toEqual([0, 1]);
    expect(both.find((r) => !r.body.items.length)!.body.rejected).toEqual([{ clientId: expect.any(String), code: "count" }]);
    // 4 图之后再加图明确超限；已有内容不动
    expect((await one()).body.rejected[0].code).toBe("count");
    expect((await state("b")).items).toHaveLength(4);
    // 混合批次：合格的加进去，不支持的、别的压缩格式各自给原因
    const mixed = await reserve("b", [{ name: "a.md", mime: "", size: 10 }, { name: "b.pdf", mime: "application/pdf", size: 10 }, { name: "c.rar", mime: "", size: 10 }]);
    expect(mixed.status).toBe(200);
    expect(mixed.body.items.map((a: any) => a.name)).toEqual(["a.md"]);
    expect(mixed.body.rejected.map((r: any) => r.code)).toEqual(["format", "archive"]);
    expect((await state("b")).items).toHaveLength(5);
  });

  it("真实内容核对：伪装成文本的二进制、伪装成图片的文本、动画、编码、超长文本只让这一项失败", async () => {
    const r = await reserve("c", [{ name: "a.txt", mime: "", size: 20 }, { name: "ok.md", mime: "", size: 6 }, { name: "image.png", mime: "image/png", size: 30 }, { name: "anim.png", mime: "image/png", size: 30 }, { name: "gbk.txt", mime: "", size: 4 }, { name: "big.txt", mime: "", size: 100 }]);
    const [bin, ok, fake, anim, gbk, big] = r.body.items;
    expect((await put("c", bin.id, "content", Buffer.from("%PDF-1.7 fake"))).body.item).toMatchObject({ status: "failed", error: "format" });
    expect((await put("c", ok.id, "content", Buffer.from("# 标题"))).body.item).toMatchObject({ status: "ready", textChars: 4 });
    expect((await put("c", fake.id, "content", Buffer.from("not an image at all"))).body.item).toMatchObject({ status: "failed", error: "imageConvert" });
    expect((await put("c", anim.id, "content", png(4, 4, [["acTL", Buffer.alloc(8)]]))).body.item).toMatchObject({ status: "failed", error: "imageConvert" });
    expect((await put("c", gbk.id, "content", Buffer.from([0xc4, 0xe3, 0xba, 0xc3]))).body.item).toMatchObject({ status: "failed", error: "encoding" });
    expect((await put("c", big.id, "content", Buffer.from("字".repeat(100_001)))).body.item).toMatchObject({ status: "failed", error: "content" });
    const s = await state("c");
    expect(s.items.map((a: any) => a.status)).toEqual(["failed", "ready", "failed", "failed", "failed", "failed"]);
    // 有失败项时发不出去（不发残缺内容）
    expect((await sendMsg("c", "看看")).body.code).toBe("changed");
    // 接口不暴露存储名和路径；图片不给名字
    expect(JSON.stringify(s)).not.toMatch(/[0-9a-f]{36}/);
    expect(JSON.stringify(s)).not.toContain(root);
  });

  it("图片：规范化的那一份必须是合法的 PNG/JPEG 且与原图成比例；预览给的就是它（元信息已去掉）", async () => {
    const data = png(8192, 16);
    const r = await reserve("d", [{ name: "image.png", mime: "image/png", size: data.length }, { name: "image.png", mime: "image/png", size: 100 }]);
    const [wide, other] = r.body.items;
    expect((await put("d", wide.id, "content", data)).body.item).toMatchObject({ status: "rendition", origWidth: 8192, origHeight: 16, want: { width: 4096, height: 8 } });
    // 拉伸过的不收
    expect((await put("d", wide.id, "rendition", png(4096, 100))).body.item).toMatchObject({ status: "failed", error: "imageConvert" });
    await put("d", other.id, "content", png(10, 10));
    const done = (await put("d", other.id, "rendition", png(10, 10, [["tEXt", Buffer.from("Comment\0secret-meta")]]))).body.item;
    expect(done).toMatchObject({ status: "ready", width: 10, height: 10, name: "" });
    const res = await fetch(`${base}/amb/api/bots/d/attachments/${other.id}/content`);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const served = Buffer.from(await res.arrayBuffer());
    expect(served.includes(Buffer.from("secret-meta"))).toBe(false);
    // 别的机器人拿不到，跨站的请求不收
    expect((await fetch(`${base}/amb/api/bots/a/attachments/${other.id}/content`)).status).toBe(404);
    expect((await fetch(`${base}/amb/api/bots/d/attachments/${other.id}/content`, { headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
    expect((await fetch(`${base}/amb/api/bots/d/attachments/state`, { headers: { origin: "https://evil.example" } })).status).toBe(403);
  });

  it("图片扩展名和真实内容对不上、JPEG 后面带数据、.jfif 都照收：按文件头认格式并告诉界面", async () => {
    app.store.createBot({ id: "x", name: "x", defaultModel: "gpt-4o-mock" });
    const realPng = png(8, 6);
    const realJpeg = Buffer.concat([jpeg(8, 6), Buffer.from("SEFH"), Buffer.alloc(300, 0x41), Buffer.from("SEFT")]);
    const r = await reserve("x", [
      { name: "其实是PNG.jpg", mime: "image/jpeg", size: realPng.length },
      { name: "其实是JPEG.png", mime: "image/png", size: realJpeg.length },
      { name: "下载.jfif", mime: "image/jpeg", size: realJpeg.length },
    ]);
    expect(r.status).toBe(200);
    const [a, b, c] = r.body.items;
    expect((await put("x", a.id, "content", realPng)).body.item).toMatchObject({ status: "rendition", want: { width: 8, height: 6, format: "png" } });
    expect((await put("x", b.id, "content", realJpeg)).body.item).toMatchObject({ status: "rendition", want: { width: 8, height: 6, format: "jpg" } });
    expect((await put("x", c.id, "content", realJpeg)).body.item).toMatchObject({ status: "rendition", want: { width: 8, height: 6, format: "jpg" } });
    // 交上规范化的那一份就就绪，和扩展名写对的图片一样
    expect((await put("x", a.id, "rendition", png(8, 6))).body.item).toMatchObject({ status: "ready", width: 8, height: 6 });
    expect((await put("x", b.id, "rendition", jpeg(8, 6))).body.item).toMatchObject({ status: "ready", width: 8, height: 6 });
  });

  it("ZIP：代理模式关着时不收；按签名认，内容不是 ZIP 的按格式拒绝；只交一行引用给模型，不交包里的内容", async () => {
    // 这个测试的 App 关着代理：状态里说不收 ZIP，拖进来的 ZIP 逐项拒绝（图片照收）
    const s = await state("g");
    expect(s.zip).toBe(false);
    expect(s.limits.maxZipBytes).toBe(50 * 1024 * 1024);
    const r = await reserve("g", [{ name: "资料.zip", mime: "application/zip", size: 100 }, { name: "image.png", mime: "image/png", size: 100 }]);
    expect(r.body.rejected.map((x: any) => x.code)).toEqual(["agentOff"]);
    expect(r.body.items.map((x: any) => x.kind)).toEqual(["image"]);
    await api(`/bots/g/attachments/${r.body.items[0].id}`, { method: "DELETE" });
    // 服务层（代理开着时）：真 ZIP 原样存下、就绪；伪装成 .zip 的文本按格式失败
    const svc = app.attachments;
    const conv = "g:web:console";
    const seg = svc.segmentOf(conv);
    const zipBytes = Buffer.from("504b0506000000000000000000000000000000000000", "hex");
    const res = svc.reserve("g", conv, { segment: seg, batch: id(), items: [{ clientId: id(), name: "空包.zip", mime: "", size: zipBytes.length }, { clientId: id(), name: "fake.zip", mime: "", size: 12 }] }, { zipOk: true });
    expect(res.rejected).toEqual([]);
    const [real, fake] = res.items;
    expect(svc.receive("g", real.id, zipBytes)).toMatchObject({ status: "ready", kind: "zip", mime: "application/zip" });
    expect(svc.receive("g", fake.id, Buffer.from("not a zip!!!"))).toMatchObject({ status: "failed", error: "format" });
    const ref = { id: real.id, kind: "zip" as const, name: "空包.zip", size: zipBytes.length, version: svc.get("g", real.id)!.version };
    const composed = svc.compose([ref], "g", "", { images: true });
    expect(composed.text).toContain("空包.zip");
    expect(composed.text).toContain(real.id);
    expect(composed.text).toContain("zip_extract");
    // 只发 ZIP、没说要做什么：让模型先问
    expect(composed.text).toMatch(/想让我怎么处理这个 ZIP|How would you like me to work on this ZIP/);
    expect(svc.compose([ref], "g", "解压看看", { images: true }).text).not.toMatch(/想让我怎么处理这个 ZIP/);
    svc.remove("g", real.id);
    svc.remove("g", fake.id);
  });

  it("移除立即释放名额、幂等，迟到的内容不让它复活", async () => {
    const r = await reserve("e", [{ name: "a.md", mime: "", size: 3 }]);
    const att = r.body.items[0].id;
    expect((await api(`/bots/e/attachments/${att}`, { method: "DELETE" })).status).toBe(200);
    expect((await api(`/bots/e/attachments/${att}`, { method: "DELETE" })).status).toBe(200);
    expect((await state("e")).items).toEqual([]);
    expect((await put("e", att, "content", Buffer.from("abc"))).body.code).toBe("changed");
    expect((await state("e")).items).toEqual([]);
  });

  it("带附件的消息：图片是真实的图像内容块、文本是带来源标记的全文，按加入顺序；消息只建一条，输入清空", async () => {
    await addImage("f");
    await addText("f", "需求说明.md", "# 需求\n第一条：<script>alert(1)</script> ![x](https://example.com/a.png)");
    await addText("f", "页面.html", "<html><body>页面正文</body></html>");
    const before = llm.calls.length;
    const s = await state("f");
    const body = { version: 1, clientMessageId: id(), text: "请结合截图和说明整理", segment: s.segment, revision: s.revision, modelRevision: s.model.revision, attachments: s.items.map((a: any) => ({ id: a.id, version: a.version })) };
    const post = () => api("/bots/f/chat/send", { method: "POST", body: JSON.stringify(body) });
    const first = await post();
    expect(first).toMatchObject({ status: 200, body: { status: "accepted", conversationId: "f:web:console" } });
    // 连点 / 断线重发同一个请求：返回原回执，不建第二条消息
    const again = await post();
    expect(again.body).toMatchObject({ status: "accepted", messageId: first.body.messageId, duplicate: true });
    // 同一个 id 换了文字：冲突
    expect((await api("/bots/f/chat/send", { method: "POST", body: JSON.stringify({ ...body, text: "换一句" }) })).body.code).toBe("conflict");
    expect((await api(`/bots/f/chat/send/${body.clientMessageId}`)).body).toMatchObject({ status: "accepted", messageId: first.body.messageId });
    await settled("f");
    expect(llm.calls.length).toBe(before + 1);
    const content = llm.calls.at(-1)!.messages.at(-1).content as any[];
    expect(content.filter((p) => p.type === "image_url")).toHaveLength(1);
    expect(content.find((p) => p.type === "image_url").image_url.url).toMatch(/^data:image\/png;base64,/);
    const text = content.find((p) => p.type === "text").text as string;
    expect(text).toContain("# 需求\n第一条：<script>alert(1)</script> ![x](https://example.com/a.png)");
    expect(text).toContain("<html><body>页面正文</body></html>");
    expect(text).toMatch(/<<<FILE 2 [0-9a-f]{10} name="需求说明\.md" type=markdown/);
    expect(text.indexOf("[图片 1")).toBeLessThan(text.indexOf("<<<FILE 2"));
    expect(text.indexOf("<<<FILE 2")).toBeLessThan(text.indexOf("<<<FILE 3"));
    expect(text.trimEnd().endsWith("请结合截图和说明整理")).toBe(true);
    const chat = (await api("/bots/f/chat")).body;
    const users = chat.messages.filter((m: any) => m.role === "user");
    expect(users).toHaveLength(1);
    expect(users[0].content).toBe("请结合截图和说明整理");
    expect(users[0].attachments.map((a: any) => [a.kind, a.name])).toEqual([["image", ""], ["text", "需求说明.md"], ["text", "页面.html"]]);
    expect((await state("f")).items).toEqual([]);
    // 之后的纯文字回合：历史里的附件按原版本重读（图片仍是图像块）
    await api("/bots/f/chat", { method: "POST", body: JSON.stringify({ text: "继续" }) });
    const history = llm.calls.at(-1)!.messages;
    const old = history.find((m: any) => Array.isArray(m.content));
    expect(old.content.some((p: any) => p.type === "image_url")).toBe(true);
    expect(old.content[0].text).toContain("页面正文");
  });

  it("只有附件也能发；确认未受理的请求之后不再被受理；别的机器人、别的版本的附件用不了", async () => {
    const item = await addText("g", "看我们成长.md", "正文");
    const s = await state("g");
    const body = { version: 1, clientMessageId: id(), text: "", segment: s.segment, revision: s.revision, modelRevision: s.model.revision, attachments: [{ id: item.id, version: item.version }] };
    // 断线后先查：确认未受理 → 迟到的原请求不再受理
    expect((await api(`/bots/g/chat/send/${body.clientMessageId}`)).body).toEqual({ status: "none" });
    expect((await api("/bots/g/chat/send", { method: "POST", body: JSON.stringify(body) })).body.code).toBe("rejected");
    // 别的机器人拿这个附件发：不行
    const other = await state("a");
    expect((await api("/bots/a/chat/send", { method: "POST", body: JSON.stringify({ ...body, clientMessageId: id(), segment: other.segment, revision: other.revision, modelRevision: other.model.revision }) })).body.code).toBe("changed");
    // 版本对不上、修订对不上：不行
    expect((await api("/bots/g/chat/send", { method: "POST", body: JSON.stringify({ ...body, clientMessageId: id(), attachments: [{ id: item.id, version: "0".repeat(24) }] }) })).body.code).toBe("changed");
    expect((await api("/bots/g/chat/send", { method: "POST", body: JSON.stringify({ ...body, clientMessageId: id(), revision: "stale" }) })).body.code).toBe("changed");
    const ok = await api("/bots/g/chat/send", { method: "POST", body: JSON.stringify({ ...body, clientMessageId: id() }) });
    expect(ok.body.status).toBe("accepted");
    await settled("g");
    const users = (await api("/bots/g/chat")).body.messages.filter((m: any) => m.role === "user");
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ content: "", attachments: [{ kind: "text", name: "看我们成长.md" }] });
    expect(String(llm.calls.at(-1)!.messages.at(-1).content)).toContain("正文");
  });

  it("模型不看图 / 无法确认时拦下含图发送，不丢内容、不换模型；纯文本附件不受影响；上下文真超限时拦下", async () => {
    await api("/bots/h/chat/model", { method: "PUT", body: JSON.stringify({ model: "plain-text-model" }) });
    expect((await state("h")).model).toMatchObject({ id: "plain-text-model", vision: "unknown" });
    await addImage("h");
    expect((await sendMsg("h", "看图")).body.code).toBe("vision_unknown");
    expect((await state("h")).items).toHaveLength(1);
    expect((await api("/bots/h/chat/model")).body.model).toBe("plain-text-model");
    // 条件变了（换了模型）而界面带的还是旧的模型修订：拦下
    const stale = await state("h");
    await api("/bots/h/chat/model", { method: "PUT", body: JSON.stringify({ model: "gpt-4o-mock" }) });
    expect((await sendMsg("h", "看图", { modelRevision: stale.model.revision })).body.code).toBe("changed");
    await api("/bots/h/chat/model", { method: "PUT", body: JSON.stringify({ model: "plain-text-model" }) });
    // 去掉图片，换成文本文件：非视觉模型照常收到全文
    await api(`/bots/h/attachments/${(await state("h")).items[0].id}`, { method: "DELETE" });
    await addText("h", "notes.txt", "plain notes");
    expect((await sendMsg("h", "读一下")).body.status).toBe("accepted");
    await settled("h");
    expect(String(llm.calls.at(-1)!.messages.at(-1).content)).toContain("plain notes");
    // 没有可信的上下文资料时按 8192 tokens 保守核算：两万个汉字超出，保留输入、不截断
    await addText("h", "long.txt", "字".repeat(20_000));
    expect((await sendMsg("h", "总结")).body.code).toBe("context");
    expect((await state("h")).items).toHaveLength(1);
  });

  it("到期回收：没发出的 24 小时后副本删除并标成过期，发送被拦下；开新对话不带旧附件", async () => {
    const item = await addText("a", "a.md", "内容");
    const stored = () => String((app.store.db.prepare("SELECT storage FROM attachments WHERE id = ?").get(item.id) as any).storage);
    const file = path.join(root, "attachments", stored());
    expect(fs.readFileSync(file, "utf8")).toBe("内容");
    // 已随消息发出的副本这时还在（30 天）
    const sent = app.store.db.prepare("SELECT storage FROM attachments WHERE message_id > 0 AND storage != ''").all() as any[];
    expect(sent.length).toBeGreaterThan(0);
    (app.attachments as any).now = () => Date.now() + LIMITS.draftTtlMs + 1000;
    app.attachments.sweep();
    (app.attachments as any).now = Date.now;
    expect(fs.existsSync(file)).toBe(false);
    expect(stored()).toBe("");
    for (const r of sent) expect(fs.existsSync(path.join(root, "attachments", String(r.storage)))).toBe(true);
    expect((await state("a")).items[0]).toMatchObject({ id: item.id, status: "expired" });
    expect((await sendMsg("a", "发")).body.code).toBe("expired");
    await api(`/bots/a/attachments/${item.id}`, { method: "DELETE" });
    await addText("a", "b.md", "内容");
    app.attachments.dropDraft("a", "a:web:console");
    expect((await state("a")).items).toEqual([]);
  });
});
