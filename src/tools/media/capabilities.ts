/**
 * ModelFlare 账户的型号能力（消息图片用作生图参考，PRD 2026-11-23 R1）。
 *
 * 来源只有一个：登录账户的 connected-app 接口 GET {issuer}/api/connected-app/model-capabilities?line=<线路>
 * （账户令牌，按当前账户和线路返回）。公开价格目录、型号名、静态名单、历史成功都不算数。
 *
 * 期待的响应（可以包在 { success, data } 信封里）：
 *   {
 *     "schema_version": 1, "line": "global", "expires_in": 300,
 *     "models": [{
 *       "id": "gpt-image-2", "line": "global", "authorized": true, "available": true,
 *       "capabilities": { "chat": "unsupported", "vision": "unsupported", "image_generation": "supported", "reference_images": "supported" },
 *       "image_generation": { "endpoint": "images" },                         // images | gemini
 *       "reference_images": {
 *         "encoding": "images_json",                                         // images_json | images_multipart | gemini_native
 *         "max_images": 16, "formats": ["png", "jpeg", "webp"],              // 数字 ≥ 1，或 "none" = 后台不另设上限
 *         "max_image_bytes": 52428800, "max_request_bytes": 67108864,        // 同上
 *         "dimensions": { "min_edge": 240, "max_edge": 8000, "min_aspect_ratio": 0.125, "max_aspect_ratio": 8 }  // 或 "none"
 *       }
 *     }]
 *   }
 *
 * 解析规则：支持 / 不支持 / 未知三态分开（"supported" / "unsupported" / "unknown"，布尔值按支持与否）；缺字段、值看不懂、
 * 0 或负数这类说不清的数字都按未知处理，不当成 0 张或无限。线路对不上、过期的整份不用。
 */
import crypto from "node:crypto";
import { logger } from "../../log.js";

const log = logger("media.caps");

export type Tri = "supported" | "unsupported" | "unknown";
/** 一项限制：{ value } 具体数字 · "none" 后台明确不另设（仍受本机额度约束）· undefined 未知（不能当无限） */
export type Limit = { value: number } | "none" | undefined;

/** 宿主已经接好的参考图请求编码；后台给了别的编码就是「适配未就绪」 */
export const REFERENCE_ENCODINGS = ["images_json", "images_multipart", "gemini_native"] as const;
export type ReferenceEncoding = (typeof REFERENCE_ENCODINGS)[number];
/** 宿主已经接好的文生图接口 */
export const GENERATION_ENDPOINTS = ["images", "gemini"] as const;
export type GenerationEndpoint = (typeof GENERATION_ENDPOINTS)[number];

export interface Dimensions {
  minEdge?: number;
  maxEdge?: number;
  minAspect?: number;
  maxAspect?: number;
}

export interface ReferenceSpec {
  /** 后台说的编码（原样）；不在 REFERENCE_ENCODINGS 里 = 适配未就绪 */
  encoding: string;
  maxImages: Limit;
  /** 小写的格式名（png、jpeg、webp…）；undefined = 未知 */
  formats: string[] | undefined;
  maxImageBytes: Limit;
  maxRequestBytes: Limit;
  /** "none" = 不另设；undefined = 未知 */
  dimensions: Dimensions | "none" | undefined;
}

export interface ModelCaps {
  id: string;
  line: string;
  /** undefined = 后台没说 */
  authorized: boolean | undefined;
  available: boolean | undefined;
  chat: Tri;
  vision: Tri;
  generation: Tri;
  reference: Tri;
  /** 文生图走哪个接口；undefined = 后台没说或宿主不认识（适配未就绪） */
  generationEndpoint: GenerationEndpoint | undefined;
  /** 参考图的编码与限制；undefined = 后台没给 */
  referenceSpec: ReferenceSpec | undefined;
}

/**
 * 一份能力快照的状态：ok 可用 · loading 第一次还在取 · failed 取不到（断网、5xx、不是 JSON）·
 * stale 有过一份但已过期、重新取又失败 · unknown 后台没有这个接口（404）或返回的版本 / 线路对不上
 */
export type CapsStatus = "ok" | "loading" | "failed" | "stale" | "unknown";

export interface CapsSnapshot {
  status: CapsStatus;
  /** 这份是哪个账户、哪条线路的（只用摘要，不存原标识） */
  account: string;
  line: string;
  fetchedAt: number;
  expiresAt: number;
  models: Map<string, ModelCaps>;
  /** 内容摘要：账户、线路、型号能力有变化它就变（发送时绑定，受理前对不上就不受理） */
  revision: string;
  /** 读取失败 / 后台没有接口时：这之前不再联网重试（用户在原选择器里重新打开时照样重试） */
  retryAt?: number;
}

const tri = (v: unknown): Tri => (v === "supported" || v === true ? "supported" : v === "unsupported" || v === false ? "unsupported" : "unknown");
const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);
const positive = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined);

/** 数量 / 字节上限：正整数或 "none"；0、负数、小数、字符串数字都算未知 */
function limitOf(v: unknown, integer = true): Limit {
  if (v === "none") return "none";
  const n = positive(v);
  if (n === undefined || (integer && !Number.isInteger(n))) return undefined;
  return { value: n };
}

function dimensionsOf(v: unknown): ReferenceSpec["dimensions"] {
  if (v === "none") return "none";
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  const out: Dimensions = {};
  // 写了这一项但值看不懂：整组算未知（不当成不限制）
  for (const [k, key] of [["min_edge", "minEdge"], ["max_edge", "maxEdge"], ["min_aspect_ratio", "minAspect"], ["max_aspect_ratio", "maxAspect"]] as const) {
    if (!(k in o)) continue;
    const n = positive(o[k]);
    if (n === undefined) return undefined;
    out[key] = n;
  }
  if (out.minEdge && out.maxEdge && out.minEdge > out.maxEdge) return undefined;
  if (out.minAspect && out.maxAspect && out.minAspect > out.maxAspect) return undefined;
  return out;
}

function referenceSpecOf(v: unknown): ReferenceSpec | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  const encoding = typeof o.encoding === "string" ? o.encoding.trim() : "";
  if (!encoding) return undefined;
  const formats = Array.isArray(o.formats) && o.formats.length && o.formats.every((f) => typeof f === "string" && f.trim())
    ? [...new Set(o.formats.map((f) => String(f).trim().toLowerCase().replace(/^image\//, "").replace(/^jpg$/, "jpeg")))]
    : undefined;
  return {
    encoding,
    maxImages: limitOf(o.max_images),
    formats,
    maxImageBytes: limitOf(o.max_image_bytes),
    maxRequestBytes: limitOf(o.max_request_bytes),
    dimensions: dimensionsOf(o.dimensions),
  };
}

function modelOf(v: unknown, line: string): ModelCaps | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  if (!id) return undefined;
  const caps = (o.capabilities && typeof o.capabilities === "object" ? o.capabilities : {}) as Record<string, unknown>;
  const gen = (o.image_generation && typeof o.image_generation === "object" ? o.image_generation : {}) as Record<string, unknown>;
  const endpoint = typeof gen.endpoint === "string" && (GENERATION_ENDPOINTS as readonly string[]).includes(gen.endpoint) ? (gen.endpoint as GenerationEndpoint) : undefined;
  return {
    id,
    line: typeof o.line === "string" && o.line ? o.line : line,
    authorized: bool(o.authorized),
    available: bool(o.available),
    chat: tri(caps.chat),
    vision: tri(caps.vision),
    generation: tri(caps.image_generation),
    reference: tri(caps.reference_images),
    generationEndpoint: endpoint,
    referenceSpec: referenceSpecOf(o.reference_images),
  };
}

/** 读取失败后多久再试；后台明确没有这个接口（404）时隔得更久 */
const FAILED_RETRY_MS = 30_000;
const UNKNOWN_RETRY_MS = 300_000;
const MIN_TTL_S = 30;
const MAX_TTL_S = 3600;
const DEFAULT_TTL_S = 300;

/**
 * 解析一次响应。版本不是 1、线路对不上、没有 models 数组：返回 undefined（调用方按未知处理）。
 * 同一 id 出现两次的只认第一个。
 */
export function parseCapabilities(json: unknown, o: { line: string; account: string; now: number }): CapsSnapshot | undefined {
  let body = json as Record<string, unknown> | undefined;
  if (body && typeof body === "object" && body.data && typeof body.data === "object" && !Array.isArray(body.data) && body.success !== false) body = body.data as Record<string, unknown>;
  if (!body || typeof body !== "object" || Array.isArray(body)) return undefined;
  if (body.schema_version !== 1 || !Array.isArray(body.models)) return undefined;
  if (typeof body.line === "string" && body.line && body.line !== o.line) return undefined;
  const ttl = positive(body.expires_in);
  const seconds = Math.min(MAX_TTL_S, Math.max(MIN_TTL_S, ttl ?? DEFAULT_TTL_S));
  const models = new Map<string, ModelCaps>();
  for (const raw of body.models) {
    const m = modelOf(raw, o.line);
    // 别的线路的条目不用（请求和核验都绑定精确型号和线路）
    if (m && m.line === o.line && !models.has(m.id)) models.set(m.id, m);
  }
  const revision = crypto.createHash("sha256").update(JSON.stringify([o.account, o.line, [...models.values()]])).digest("hex").slice(0, 16);
  return { status: "ok", account: o.account, line: o.line, fetchedAt: o.now, expiresAt: o.now + seconds * 1000, models, revision };
}

/** 一次读取的结果：ok + json，或者为什么没有（unsupported = 404 这类「后台没有这个接口」） */
export type CapsFetch = { ok: true; json: unknown } | { ok: false; reason: "unsupported" | "failed" };

export interface CapabilityOptions {
  /** 当前账户的稳定摘要；没登录时为空 */
  account: () => string;
  line: () => string;
  /** 读一次接口（只读，不发图、不收费） */
  fetch: (line: string) => Promise<CapsFetch>;
  now?: () => number;
}

/**
 * 能力快照的缓存：按账户 + 线路一份。过期了下次读取时重新取；取不到时有旧的标 stale、没有的标 failed / unknown。
 * 同一时刻只取一次；force = 用户在原选择器里重新打开（只读重试）。
 */
export class ModelCapabilities {
  private snap: CapsSnapshot | undefined;
  private inflight: Promise<CapsSnapshot> | undefined;
  private inflightKey = "";

  constructor(private o: CapabilityOptions) {}

  private now(): number {
    return (this.o.now ?? Date.now)();
  }

  private empty(status: CapsStatus, account: string, line: string): CapsSnapshot {
    const now = this.now();
    return { status, account, line, fetchedAt: now, expiresAt: now, models: new Map(), revision: `${status}:${account}:${line}` };
  }

  /** 现在手上的（不联网）：账户、线路对不上或已过期的不算 ok */
  peek(): CapsSnapshot {
    const account = this.o.account();
    const line = this.o.line();
    if (!account) return this.empty("unknown", "", line);
    const s = this.snap;
    // 还没取过（或正在取）这一账户线路的：先算 loading，不说成不支持
    if (!s || s.account !== account || s.line !== line) return this.empty("loading", account, line);
    if (s.status === "ok" && s.expiresAt <= this.now()) return { ...s, status: "stale" };
    return s;
  }

  /** 取一份可用的：没有、过期、换了账户或线路时联网读；force 时总是读一次 */
  async get(force = false): Promise<CapsSnapshot> {
    const account = this.o.account();
    const line = this.o.line();
    if (!account) return this.empty("unknown", "", line);
    const key = `${account}|${line}`;
    const cur = this.snap;
    if (!force && cur && cur.account === account && cur.line === line && cur.status === "ok" && cur.expiresAt > this.now()) return cur;
    // 刚失败过 / 后台没有这个接口：短时间内不反复请求（输入框每次刷新都会问到这里）
    if (!force && cur && cur.account === account && cur.line === line && cur.status !== "ok" && (cur.retryAt ?? 0) > this.now()) return cur;
    if (this.inflight && this.inflightKey === key) return this.inflight;
    this.inflightKey = key;
    this.inflight = (async () => {
      let next: CapsSnapshot;
      try {
        const r = await this.o.fetch(line);
        if (r.ok) next = parseCapabilities(r.json, { line, account, now: this.now() }) ?? this.empty("unknown", account, line);
        else next = this.empty(r.reason === "unsupported" ? "unknown" : "failed", account, line);
      } catch (e) {
        log.warn("model capabilities unavailable", { message: (e as Error).message.slice(0, 200) });
        next = this.empty("failed", account, line);
      }
      // 取失败了、手上有同一账户线路的旧快照：标成过期（不能当成还有效，也不说成从来没有）
      if (next.status === "failed" && cur && cur.account === account && cur.line === line && (cur.status === "ok" || cur.status === "stale")) next = { ...cur, status: "stale" };
      if (next.status !== "ok") next = { ...next, retryAt: this.now() + (next.status === "unknown" ? UNKNOWN_RETRY_MS : FAILED_RETRY_MS) };
      // 读的过程中换了账户或线路：这份作废，不写进缓存
      if (this.o.account() === account && this.o.line() === line) this.snap = next;
      return next;
    })().finally(() => {
      if (this.inflightKey === key) this.inflight = undefined;
    });
    return this.inflight;
  }

  /** 等一会儿：短时间内取不到就先回 loading（界面不闪「不支持」），后台接着取 */
  async within(ms: number, force = false): Promise<CapsSnapshot> {
    const p = this.get(force);
    let timer: NodeJS.Timeout | undefined;
    const late = new Promise<CapsSnapshot>((r) => {
      timer = setTimeout(() => r(this.peek()), ms);
      timer.unref?.();
    });
    try {
      return await Promise.race([p, late]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** 退出登录、换账户：旧的不再用 */
  clear(): void {
    this.snap = undefined;
  }
}

/** 一个型号在这份快照里的能力；型号 id 去掉内置网关的前缀后按精确 id 找，不做模糊匹配 */
export function capsFor(snap: CapsSnapshot, bareId: string): ModelCaps | undefined {
  return snap.models.get(bareId);
}

/** 纯图片生成型号：明确能生图、明确不能对话 */
export function pureImageModel(m: ModelCaps | undefined): boolean {
  return !!m && m.generation === "supported" && m.chat === "unsupported";
}
