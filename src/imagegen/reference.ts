/**
 * 「用作生图参考」的发送条件（PRD 2026-11-23 R1–R5）：同一套判断给输入框外的校验条（经 …/attachments/state）、
 * 受理时（…/chat/send）和真正提交上游前各用一次，界面置灰之外服务端照样拦。
 *
 * 一次只给最优先的一个原因，顺序：附件失效 / 上传失败（附件服务自己管）→ 未授权 / 型号失效 → 能力加载失败或未知 →
 * 不支持生图 / 参考（含适配未就绪）→ 数量 / 格式 / 大小 / 其他附件不兼容 → 缺文字要求。
 */
import { LIMITS } from "../attachments/limits.js";
import { REFERENCE_ENCODINGS, type CapsSnapshot, type Limit, type ModelCaps, type ReferenceEncoding } from "../tools/media/capabilities.js";

export type RefCode =
  | "ref_unauthorized"
  | "ref_loading"
  | "ref_caps_failed"
  | "ref_caps_stale"
  | "ref_caps_unknown"
  | "ref_limits_unknown"
  | "ref_no_generation"
  | "ref_no_reference"
  | "ref_adapter"
  | "ref_other_files"
  | "ref_count"
  | "ref_local_count"
  | "ref_format"
  | "ref_limit"
  | "ref_no_text";

/** {limit} 的种类（界面和服务端各按自己的语言写成一句） */
export interface LimitParam {
  kind: "edge" | "aspect" | "bytes" | "request";
  min?: number;
  max?: number;
}

export interface RefVerdict {
  code: RefCode | "";
  count?: number;
  limit?: LimitParam;
}

/** 参与核对的一项附件（只用规范化后真正会交出去的那一份的数字） */
export interface RefItem {
  kind: "image" | "text" | "zip";
  /** 规范化后的类型：image/png 或 image/jpeg */
  mime: string;
  width: number;
  height: number;
  /** 规范化后存下的字节（真正会发给上游的） */
  storedBytes: number;
}

const formatOf = (mime: string) => (mime === "image/jpeg" ? "jpeg" : mime === "image/png" ? "png" : mime.replace(/^image\//, ""));

/**
 * 按编码估一次请求有多大（字节）：Base64 膨胀（4/3）、data URL 前缀、JSON 包装、multipart 分段头都算上，
 * 提示词按 JSON 转义后的 UTF-8 算。只是上限核对用，宁可估大。
 */
export function requestBytes(encoding: string, items: Array<Pick<RefItem, "mime" | "storedBytes">>, prompt: string, model: string): number {
  const b64 = (n: number) => Math.ceil(n / 3) * 4;
  const text = Buffer.byteLength(JSON.stringify(prompt), "utf8") + Buffer.byteLength(JSON.stringify(model), "utf8");
  if (encoding === "images_multipart") return items.reduce((n, a) => n + a.storedBytes + 320, 0) + text + 1024;
  if (encoding === "gemini_native") return items.reduce((n, a) => n + b64(a.storedBytes) + 96, 0) + text + 512;
  // images_json 与其他：data URL 嵌在 JSON 里
  return items.reduce((n, a) => n + b64(a.storedBytes) + `data:${a.mime};base64,`.length + 32, 0) + text + 512;
}

/** 型号这一侧的条件（授权、能力、适配、限制是否完整）；只看型号，不看附件 */
export function modelVerdict(snap: CapsSnapshot, m: ModelCaps | undefined): RefVerdict {
  if (snap.status === "ok") {
    if (!m || m.authorized === false || m.available === false) return { code: "ref_unauthorized" };
  }
  if (snap.status === "loading") return { code: "ref_loading" };
  if (snap.status === "failed") return { code: "ref_caps_failed" };
  if (snap.status === "stale") return { code: "ref_caps_stale" };
  if (snap.status !== "ok" || !m || m.authorized === undefined || m.available === undefined) return { code: "ref_caps_unknown" };
  if (m.generation === "unsupported") return { code: "ref_no_generation" };
  if (m.generation === "unknown") return { code: "ref_caps_unknown" };
  if (m.reference === "unsupported") return { code: "ref_no_reference" };
  if (m.reference === "unknown") return { code: "ref_caps_unknown" };
  const spec = m.referenceSpec;
  if (!spec) return { code: "ref_limits_unknown" };
  if (!(REFERENCE_ENCODINGS as readonly string[]).includes(spec.encoding)) return { code: "ref_adapter" };
  if (!spec.maxImages || !spec.formats || !spec.maxImageBytes || !spec.maxRequestBytes || !spec.dimensions) return { code: "ref_limits_unknown" };
  return { code: "" };
}

/** 本条最多能带几张参考图：型号的真实上限和本机 4 张取小的；"none" = 只受本机额度 */
export function referenceCap(limit: Limit): number {
  if (limit === "none") return LIMITS.maxImages;
  return limit ? Math.min(limit.value, LIMITS.maxImages) : 0;
}

/**
 * 完整的核对：型号条件 → 附件（其他文件、数量、格式、每张的尺寸 / 宽高比 / 字节、整次请求的字节）→ 文字。
 * items 按当前显示顺序（已就绪的）；pending 是还在处理的图片 / 其他文件的数量。附件本身的状态（处理中、失败、过期）由调用方先核对。
 */
export function referenceVerdict(snap: CapsSnapshot, m: ModelCaps | undefined, items: RefItem[], text: string, pending: { images: number; other: number } = { images: 0, other: 0 }): RefVerdict {
  const base = modelVerdict(snap, m);
  if (base.code) return base;
  const spec = m!.referenceSpec!;
  if (pending.other > 0 || items.some((a) => a.kind !== "image")) return { code: "ref_other_files" };
  const images = items.filter((a) => a.kind === "image");
  // 数量算上还在处理的图片（它们已经占了名额）；格式、尺寸、大小只核对已经就绪的那几张
  const count = images.length + pending.images;
  if (count > LIMITS.maxImages) return { code: "ref_local_count", count: LIMITS.maxImages };
  if (spec.maxImages !== "none" && count > spec.maxImages!.value) return { code: "ref_count", count: spec.maxImages!.value };
  if (images.some((a) => !spec.formats!.includes(formatOf(a.mime)))) return { code: "ref_format" };
  const dims = spec.dimensions;
  if (dims && dims !== "none") {
    const edge = images.find((a) => (dims.minEdge && Math.min(a.width, a.height) < dims.minEdge) || (dims.maxEdge && Math.max(a.width, a.height) > dims.maxEdge));
    if (edge) return { code: "ref_limit", limit: { kind: "edge", min: dims.minEdge, max: dims.maxEdge } };
    const ratio = images.find((a) => {
      const r = a.width / Math.max(1, a.height);
      return (dims.minAspect && r < dims.minAspect) || (dims.maxAspect && r > dims.maxAspect);
    });
    if (ratio) return { code: "ref_limit", limit: { kind: "aspect", min: dims.minAspect, max: dims.maxAspect } };
  }
  if (spec.maxImageBytes !== "none" && images.some((a) => a.storedBytes > (spec.maxImageBytes as { value: number }).value)) return { code: "ref_limit", limit: { kind: "bytes", max: (spec.maxImageBytes as { value: number }).value } };
  if (spec.maxRequestBytes !== "none" && requestBytes(spec.encoding, images, text, m!.id) > (spec.maxRequestBytes as { value: number }).value) {
    return { code: "ref_limit", limit: { kind: "request", max: (spec.maxRequestBytes as { value: number }).value } };
  }
  if (!text.trim()) return { code: "ref_no_text" };
  return { code: "" };
}

export const isReferenceEncoding = (e: string): e is ReferenceEncoding => (REFERENCE_ENCODINGS as readonly string[]).includes(e);

/** 宽高比写成 1:8 这种（0.125 → 1:8，8 → 8:1，1.5 → 3:2） */
export function ratioText(r: number): string {
  if (r >= 1) return `${+r.toFixed(2)}:1`;
  return `1:${+(1 / r).toFixed(2)}`;
}

/** 字节写成 MB（十进制、最多一位小数），和后台的数字对得上 */
export function mbText(n: number): string {
  return `${+(n / 1_000_000).toFixed(1)} MB`;
}
