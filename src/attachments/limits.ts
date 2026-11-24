/**
 * 消息附件（粘贴图片、拖入图片、文本文件和 ZIP 压缩包）的硬上限与格式表。界面经 GET …/attachments/state 读到同一份数字，
 * 前后端按它核算；服务端的核算是准的（绕开界面也过不去）。
 */

/** 附件协议版本：界面和服务端对不上时提示更新，不降级成只发文字或文件名 */
export const ATTACHMENT_PROTOCOL = 1;
/** 发送结构版本（POST …/chat/send 的请求形状） */
export const SEND_VERSION = 1;

export const MIB = 1024 * 1024;

export const LIMITS = {
  /** 每条消息最多几个附件、其中几张图片 */
  maxItems: 8,
  maxImages: 4,
  /** 图片 / 文本单份 10 MiB、ZIP 单份 50 MiB（压缩件的原字节）、原始附件合计 50 MiB */
  maxFileBytes: 10 * MIB,
  maxZipBytes: 50 * MIB,
  maxTotalBytes: 50 * MIB,
  /** 原图：最长边、总像素 */
  maxImageEdge: 12_000,
  maxImagePixels: 40_000_000,
  /** 规范化后最长边 */
  normEdge: 4096,
  /** 文本：单份、单条累计的 Unicode 码点 */
  maxTextChars: 100_000,
  maxTextCharsTotal: 200_000,
  /** 没有可信的上下文长度资料时的保守预算（tokens） */
  fallbackContextTokens: 8192,
  /** 没发出的副本最长保留、已发的受管副本保留 */
  draftTtlMs: 24 * 3600_000,
  sentTtlMs: 30 * 24 * 3600_000,
} as const;

/** 文本类：扩展名 → 给模型看的类型名 */
export const TEXT_TYPES: Readonly<Record<string, string>> = {
  md: "markdown", markdown: "markdown",
  html: "html", htm: "html",
  txt: "text", csv: "csv", json: "json", log: "log", yaml: "yaml", yml: "yaml", xml: "xml",
  css: "css", js: "javascript", ts: "typescript", py: "python", sh: "shell", ps1: "powershell", bat: "batch", cmd: "batch",
};
/** 直接接收的图片（jfif / jpe 是 JPEG 的另外两种扩展名，Windows 上的浏览器另存图片时常见） */
export const IMAGE_TYPES: Readonly<Record<string, string>> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", jfif: "image/jpeg", jpe: "image/jpeg" };
/** 要先转成 PNG / JPG 的图片 */
const IMAGE_CONVERT = new Set(["heic", "heif", "avif", "bmp", "tif", "tiff", "svg", "svgz", "ico", "apng", "jxl", "psd"]);
/** ZIP 只认扩展名 .zip（大小写不限）；.docx / .xlsx / .jar 这类内部也是 ZIP 的照原规则不收 */
export const ZIP_EXT = "zip";
/** 别的压缩格式：提示「压缩包仅支持 ZIP」，不当 ZIP 收 */
const OTHER_ARCHIVES = new Set(["rar", "7z", "tar", "gz", "tgz", "bz2", "tbz", "tbz2", "xz", "txz", "zst", "lz", "lzma", "cab", "arj", "z", "001"]);

export type { AttachmentKind } from "../domain/attachments.js";
import type { AttachmentKind } from "../domain/attachments.js";
/**
 * 拒绝原因（界面按它选一句提示）：format 不支持的格式 · imageConvert 请转成 PNG/JPG · archive 别的压缩格式（仅支持 ZIP）·
 * empty 空文件 · size 单份或合计超限 · count 数量超限 · unreadable 读不了 · encoding 编码认不出 · content 文字太多 ·
 * context 超出模型上下文 · expired 过期 · agentOff 代理模式关着（ZIP 要靠代理的文件工具处理）· storage 保存空间不足
 */
export type RejectCode = "format" | "imageConvert" | "archive" | "empty" | "size" | "count" | "unreadable" | "encoding" | "content" | "context" | "expired" | "agentOff" | "storage";

export const extOf = (name: string): string => {
  const base = String(name ?? "").replace(/\\/g, "/").split("/").pop() ?? "";
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(i + 1).toLowerCase() : "";
};

/**
 * 按文件名和 MIME 先分一次类（读内容之前的硬条件；真实内容之后由 sniff.ts 再核对）。
 * 剪贴板图片没有可信的名字：MIME 是直接接收的图片类型就算图片。文本允许空 MIME。
 * 是图片但收不了的一律回 imageConvert（提示转成 PNG / JPG），不回 format——那一句只列了文本格式，会让人以为图片都不支持。
 */
export function classify(name: string, mime: string): { kind: AttachmentKind; ext: string } | { reject: RejectCode } {
  const ext = extOf(name);
  const type = String(mime ?? "").toLowerCase().split(";")[0].trim();
  if (ext === ZIP_EXT) return { kind: "zip", ext };
  if (OTHER_ARCHIVES.has(ext) || /\.tar\.[a-z0-9]+$/i.test(String(name ?? ""))) return { reject: "archive" };
  if (ext in IMAGE_TYPES) return type && !type.startsWith("image/") ? { reject: "format" } : { kind: "image", ext };
  if (IMAGE_CONVERT.has(ext)) return { reject: "imageConvert" };
  if (ext in TEXT_TYPES) return /^(image|audio|video)\//.test(type) ? { reject: "format" } : { kind: "text", ext };
  if (!ext && type.startsWith("image/")) {
    const hit = Object.entries(IMAGE_TYPES).find(([, m]) => m === type);
    return hit ? { kind: "image", ext: hit[0] } : { reject: "imageConvert" };
  }
  // 扩展名不在表里、但系统说它是图片（.jp2、相机原片…）
  if (type.startsWith("image/")) return { reject: "imageConvert" };
  return { reject: "format" };
}

export interface BatchItem { name: string; mime: string; size: number; }
export interface Usage { items: number; images: number; bytes: number; }

/** 这一类附件单份最多多少字节：ZIP 50 MiB，其余 10 MiB */
export const maxBytesOf = (kind: AttachmentKind): number => (kind === "zip" ? LIMITS.maxZipBytes : LIMITS.maxFileBytes);

/**
 * 一个批次逐项核对（拖入、粘贴都一样）：按原顺序核算剩余的数量、图片数和合计字节，合格的依次加入、占掉名额；
 * 不合格的（类型、空文件、单份大小、数量、合计、代理模式关着时的 ZIP）各自给出原因，不影响它后面还放得下的合格项。
 * 已有的待发项不动。zipOk = false：代理模式关着，ZIP 处理不了，不收。
 */
export function planBatch(batch: BatchItem[], used: Usage, opts: { zipOk?: boolean } = {}): Array<{ ok: true; kind: AttachmentKind; ext: string } | { ok: false; code: RejectCode }> {
  let { items, images, bytes } = used;
  return batch.map((f) => {
    const c = classify(f.name, f.mime);
    if ("reject" in c) return { ok: false as const, code: c.reject };
    if (c.kind === "zip" && opts.zipOk === false) return { ok: false as const, code: "agentOff" as const };
    if (!Number.isFinite(f.size) || f.size <= 0) return { ok: false as const, code: "empty" as const };
    if (f.size > maxBytesOf(c.kind)) return { ok: false as const, code: "size" as const };
    const image = c.kind === "image" ? 1 : 0;
    if (items + 1 > LIMITS.maxItems || images + image > LIMITS.maxImages) return { ok: false as const, code: "count" as const };
    if (bytes + f.size > LIMITS.maxTotalBytes) return { ok: false as const, code: "size" as const };
    items++;
    images += image;
    bytes += f.size;
    return { ok: true as const, kind: c.kind, ext: c.ext };
  });
}

/** 规范化后的尺寸：最长边超过 4096 时等比缩到 4096，小图不放大 */
export function normalizedSize(width: number, height: number): { width: number; height: number } {
  const edge = Math.max(width, height);
  if (edge <= LIMITS.normEdge) return { width, height };
  const k = LIMITS.normEdge / edge;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

/** 粗略估算 tokens（标明是估算）：ASCII 约 4 个字符一个，其余（中日韩等）一个字一个 */
export function estimateTextTokens(text: string): number {
  let ascii = 0;
  let wide = 0;
  for (const ch of text) (ch.codePointAt(0)! < 0x80 ? ascii++ : wide++);
  return Math.ceil(ascii / 4) + wide;
}
/** 一张图占多少 tokens 的估算（按 512 的格子，和常见视觉模型的算法同一量级） */
export function estimateImageTokens(width: number, height: number): number {
  return 85 + 170 * Math.ceil(Math.max(1, width) / 512) * Math.ceil(Math.max(1, height) / 512);
}
