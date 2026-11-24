/**
 * 附件真实内容的核对：只看文件头和结构，不执行、不渲染、不联网。
 * - 图片：按签名认格式（PNG / JPEG / WebP / GIF），从文件头读尺寸，认出动画（多帧 GIF、APNG、动画 WebP）。
 * - 规范化后的图片：只接受 PNG / JPEG，去掉元信息块（EXIF、文字、时间、ICC 之外的应用段）。
 * - 文本：UTF-8（可带 BOM）或带 BOM 的 UTF-16，不猜别的编码；二进制伪装成文本的拒绝。
 */

export interface ImageInfo {
  format: "png" | "jpeg" | "webp" | "gif";
  width: number;
  height: number;
  animated: boolean;
  /** JPEG 的 EXIF 方向（5–8 时显示出来宽高互换） */
  orientation: number;
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_EOI = Buffer.from([0xff, 0xd9]);

export function sniffImage(buf: Buffer): ImageInfo | undefined {
  try {
    if (buf.length >= 24 && buf.subarray(0, 8).equals(PNG_SIG)) return png(buf);
    if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return jpeg(buf);
    if (buf.length >= 13 && (buf.toString("latin1", 0, 6) === "GIF87a" || buf.toString("latin1", 0, 6) === "GIF89a")) return gif(buf);
    if (buf.length >= 30 && buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return webp(buf);
  } catch {
    /* 结构不完整：当作不是图片 */
  }
  return undefined;
}

function png(buf: Buffer): ImageInfo | undefined {
  if (buf.toString("latin1", 12, 16) !== "IHDR") return undefined;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  let animated = false;
  let end = false;
  let data = false;
  for (let p = 8; p + 12 <= buf.length; ) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString("latin1", p + 4, p + 8);
    if (type === "acTL") animated = true;
    if (type === "IDAT") data = true;
    if (type === "IEND") { end = true; break; }
    p += 12 + len;
  }
  if (!width || !height || !data || !end) return undefined;
  return { format: "png", width, height, animated, orientation: 1 };
}

function jpeg(buf: Buffer): ImageInfo | undefined {
  let orientation = 1;
  for (let p = 2; p + 4 <= buf.length; ) {
    if (buf[p] !== 0xff) return undefined;
    const marker = buf[p + 1];
    if (marker === 0xff) { p++; continue; }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { p += 2; continue; }
    const len = buf.readUInt16BE(p + 2);
    if (len < 2) return undefined;
    if (marker === 0xe1 && buf.toString("latin1", p + 4, p + 10) === "Exif\0\0") orientation = exifOrientation(buf.subarray(p + 10, p + 2 + len)) ?? orientation;
    // SOF0–SOF15（不含 DHT C4、JPG C8、DAC CC）
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = buf.readUInt16BE(p + 5);
      const width = buf.readUInt16BE(p + 7);
      if (!width || !height) return undefined;
      // 图像数据后面要有 EOI（截断的文件不收）。不要求它在文件最末尾：手机相机常在 EOI 后追加厂商元数据，
      // 动态照片后面还拼着一段视频，有的工具会补零对齐——这些都是正常的 JPEG
      if (buf.indexOf(JPEG_EOI, p + 2 + len) < 0) return undefined;
      return { format: "jpeg", width, height, animated: false, orientation };
    }
    if (marker === 0xda) return undefined;
    p += 2 + len;
  }
  return undefined;
}

function exifOrientation(tiff: Buffer): number | undefined {
  if (tiff.length < 14) return undefined;
  const le = tiff.toString("latin1", 0, 2) === "II";
  const u16 = (o: number) => (le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o));
  const u32 = (o: number) => (le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o));
  const ifd = u32(4);
  if (ifd + 2 > tiff.length) return undefined;
  const n = u16(ifd);
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > tiff.length) return undefined;
    if (u16(e) === 0x0112) {
      const v = u16(e + 8);
      return v >= 1 && v <= 8 ? v : undefined;
    }
  }
  return undefined;
}

function gif(buf: Buffer): ImageInfo | undefined {
  const width = buf.readUInt16LE(6);
  const height = buf.readUInt16LE(8);
  if (!width || !height) return undefined;
  let p = 13;
  const flags = buf[10];
  if (flags & 0x80) p += 3 * (1 << ((flags & 7) + 1));
  let frames = 0;
  let trailer = false;
  const skipBlocks = () => {
    while (p < buf.length) {
      const n = buf[p++];
      if (!n) return;
      p += n;
    }
  };
  while (p < buf.length) {
    const b = buf[p++];
    if (b === 0x3b) { trailer = true; break; }
    if (b === 0x21) { p++; skipBlocks(); continue; }
    if (b === 0x2c) {
      frames++;
      if (p + 9 > buf.length) return undefined;
      const lf = buf[p + 8];
      p += 9;
      if (lf & 0x80) p += 3 * (1 << ((lf & 7) + 1));
      p++; // LZW 最小码长
      skipBlocks();
      continue;
    }
    return undefined;
  }
  if (!frames || !trailer) return undefined;
  return { format: "gif", width, height, animated: frames > 1, orientation: 1 };
}

function webp(buf: Buffer): ImageInfo | undefined {
  const tag = buf.toString("latin1", 12, 16);
  if (buf.readUInt32LE(4) + 8 > buf.length + 1) return undefined;
  if (tag === "VP8X") {
    const flags = buf[20];
    const width = 1 + buf.readUIntLE(24, 3);
    const height = 1 + buf.readUIntLE(27, 3);
    return { format: "webp", width, height, animated: !!(flags & 0x02), orientation: 1 };
  }
  if (tag === "VP8 ") {
    if (buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) return undefined;
    const width = buf.readUInt16LE(26) & 0x3fff;
    const height = buf.readUInt16LE(28) & 0x3fff;
    return width && height ? { format: "webp", width, height, animated: false, orientation: 1 } : undefined;
  }
  if (tag === "VP8L") {
    if (buf[20] !== 0x2f) return undefined;
    const bits = buf.readUInt32LE(21);
    return { format: "webp", width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff), animated: false, orientation: 1 };
  }
  return undefined;
}

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer, start: number, end: number): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** PNG 里留下的块：图像本身和决定颜色怎么显示的；文字、时间、EXIF、动画块都去掉 */
const PNG_KEEP = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "iCCP", "sBIT", "bKGD", "pHYs"]);

/**
 * 规范化后的图片（界面解码、纠正方向、缩放后重新编码的那一份）：只接受 PNG / JPEG，校验结构，去掉元信息。
 * 返回干净的字节和尺寸；不是合法的 PNG / JPEG 返回 undefined。
 */
export function cleanRendition(buf: Buffer): { data: Buffer; mime: "image/png" | "image/jpeg"; width: number; height: number } | undefined {
  const info = sniffImage(buf);
  if (!info || info.animated) return undefined;
  try {
    if (info.format === "png") {
      const parts: Buffer[] = [PNG_SIG];
      for (let p = 8; p + 12 <= buf.length; ) {
        const len = buf.readUInt32BE(p);
        const end = p + 12 + len;
        if (end > buf.length) return undefined;
        const type = buf.toString("latin1", p + 4, p + 8);
        if (crc32(buf, p + 4, p + 8 + len) !== buf.readUInt32BE(p + 8 + len)) return undefined;
        if (PNG_KEEP.has(type)) parts.push(buf.subarray(p, end));
        if (type === "IEND") break;
        p = end;
      }
      return { data: Buffer.concat(parts), mime: "image/png", width: info.width, height: info.height };
    }
    if (info.format === "jpeg") {
      // 这一份是界面刚编码出来的，EOI 就在末尾：后面不该再拖着别的数据（原图可以，见 jpeg()）
      if (buf.subarray(Math.max(0, buf.length - 64)).lastIndexOf(JPEG_EOI) < 0) return undefined;
      const parts: Buffer[] = [buf.subarray(0, 2)];
      for (let p = 2; p + 4 <= buf.length; ) {
        if (buf[p] !== 0xff) return undefined;
        const marker = buf[p + 1];
        if (marker === 0xff) { p++; continue; }
        if (marker === 0xda) { parts.push(buf.subarray(p)); break; }
        const len = buf.readUInt16BE(p + 2);
        if (len < 2 || p + 2 + len > buf.length) return undefined;
        // 留 JFIF（APP0）、ICC（APP2）、Adobe 颜色（APP14）；EXIF / XMP（APP1）、其余应用段和注释去掉
        const app = marker >= 0xe0 && marker <= 0xef;
        const keep = !app && marker !== 0xfe ? true : marker === 0xe0 || marker === 0xee || (marker === 0xe2 && buf.toString("latin1", p + 4, p + 15) === "ICC_PROFILE");
        if (keep) parts.push(buf.subarray(p, p + 2 + len));
        p += 2 + len;
      }
      return { data: Buffer.concat(parts), mime: "image/jpeg", width: info.width, height: info.height };
    }
  } catch {
    /* 结构坏了 */
  }
  return undefined;
}

/** 常见二进制文件的签名：扩展名写成文本也不收 */
const BINARY_SIGS: Array<[number[], number?]> = [
  [[0x25, 0x50, 0x44, 0x46]], // %PDF
  [[0x50, 0x4b, 0x03, 0x04]], [[0x50, 0x4b, 0x05, 0x06]], // ZIP / Office
  [[0x4d, 0x5a]], // EXE / DLL
  [[0x7f, 0x45, 0x4c, 0x46]], // ELF
  [[0xcf, 0xfa, 0xed, 0xfe]], [[0xfe, 0xed, 0xfa, 0xcf]], [[0xca, 0xfe, 0xba, 0xbe]], // Mach-O
  [[0x52, 0x61, 0x72, 0x21]], [[0x37, 0x7a, 0xbc, 0xaf]], [[0x1f, 0x8b]], // RAR / 7z / gzip
  [[0xd0, 0xcf, 0x11, 0xe0]], // 旧版 Office
  [[0x89, 0x50, 0x4e, 0x47]], [[0xff, 0xd8, 0xff]], [[0x47, 0x49, 0x46, 0x38]], // 图片
  [[0x75, 0x73, 0x74, 0x61, 0x72], 257], // tar
];

export type TextResult = { ok: true; text: string; chars: number; encoding: "utf-8" | "utf-16le" | "utf-16be" } | { ok: false; code: "format" | "encoding" };

/**
 * 完整解码一份文本附件。UTF-8（可带 BOM）、带 BOM 的 UTF-16；认不出就是 encoding，不猜、不出乱码。
 * 二进制（签名、NUL 字节、大量控制字符）是 format。
 */
export function decodeText(buf: Buffer): TextResult {
  for (const [sig, at = 0] of BINARY_SIGS) if (buf.length >= at + sig.length && sig.every((b, i) => buf[at + i] === b)) return { ok: false, code: "format" };
  let text: string;
  let encoding: "utf-8" | "utf-16le" | "utf-16be" = "utf-8";
  try {
    if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
      encoding = "utf-16le";
      text = new TextDecoder("utf-16le", { fatal: true }).decode(buf.subarray(2));
    } else if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
      encoding = "utf-16be";
      text = new TextDecoder("utf-16be", { fatal: true }).decode(buf.subarray(2));
    } else {
      if (buf.includes(0)) return { ok: false, code: looksUtf16(buf) ? "encoding" : "format" };
      text = new TextDecoder("utf-8", { fatal: true }).decode(buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf ? buf.subarray(3) : buf);
    }
  } catch {
    return { ok: false, code: "encoding" };
  }
  let chars = 0;
  let control = 0;
  for (const ch of text) {
    chars++;
    const c = ch.codePointAt(0)!;
    if (c === 0 || (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d && c !== 0x0c && c !== 0x1b)) control++;
  }
  if (text.includes("\0") || (chars > 0 && control / chars > 0.02)) return { ok: false, code: "format" };
  return { ok: true, text, chars, encoding };
}

/** 没有 BOM 的 UTF-16（隔一个字节一个 0）：属于认不出的编码，提示另存为 UTF-8 */
function looksUtf16(buf: Buffer): boolean {
  const n = Math.min(buf.length, 4096) & ~1;
  if (n < 4) return false;
  let even = 0;
  let odd = 0;
  for (let i = 0; i < n; i += 2) {
    if (buf[i] === 0) even++;
    if (buf[i + 1] === 0) odd++;
  }
  const half = n / 2;
  return (odd > half * 0.6 && even < half * 0.1) || (even > half * 0.6 && odd < half * 0.1);
}
