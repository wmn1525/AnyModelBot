/**
 * 宿主直接构建的生图请求（PRD 2026-11-23 R4）：右下角选的那个精确型号、按后台能力接口给的编码，不先调用聊天模型、
 * 不让另一个型号识图或编请求体。
 *
 * - 参考图：images_json → POST /images/edits（JSON，images[].image_url 是 data URL）；
 *   images_multipart → POST /images/edits（multipart，image[] 按顺序）；gemini_native → POST /models/{id}:generateContent（inline_data 内容块）。
 * - 纯文字：images → POST /images/generations；gemini → generateContent 只带文字。
 * 提示词就是这条消息的文字；图片只来自这条消息显式引用的受管副本（按显示顺序），不拼聊天记录、不读工作目录。
 */
import type { GenerationEndpoint, ReferenceEncoding } from "./capabilities.js";

export interface DirectImage {
  data: Buffer;
  /** image/png 或 image/jpeg（规范化后的那一份） */
  mime: string;
}

export interface DirectJob {
  /** 精确型号 id（不带内置网关前缀） */
  model: string;
  /** 线路（能力接口给的；只用于记录和指纹） */
  line: string;
  mode: "reference" | "text";
  /** reference 时是参考图编码，text 时是文生图接口 */
  encoding: ReferenceEncoding | GenerationEndpoint;
  prompt: string;
  images: DirectImage[];
}

export type DirectRequest = { path: string; json: Record<string, unknown> } | { path: string; form: FormData };

const ext = (mime: string) => (mime === "image/jpeg" ? "jpg" : "png");

/** 按编码构建一次请求；编码不认识时抛错（调用方先核对过适配） */
export function buildDirectRequest(job: DirectJob): DirectRequest {
  const gemini = (parts: unknown[]) => ({ path: `/models/${encodeURIComponent(job.model)}:generateContent`, json: { contents: [{ role: "user", parts }] } });
  if (job.mode === "text") {
    if (job.encoding === "images") return { path: "/images/generations", json: { model: job.model, prompt: job.prompt } };
    if (job.encoding === "gemini") return gemini([{ text: job.prompt }]);
    throw new Error(`unsupported generation endpoint ${job.encoding}`);
  }
  if (!job.images.length) throw new Error("reference request without images");
  if (job.encoding === "images_json") {
    return { path: "/images/edits", json: { model: job.model, prompt: job.prompt, images: job.images.map((i) => ({ image_url: `data:${i.mime};base64,${i.data.toString("base64")}` })) } };
  }
  if (job.encoding === "images_multipart") {
    const form = new FormData();
    form.set("model", job.model);
    form.set("prompt", job.prompt);
    job.images.forEach((i, n) => form.append("image[]", new Blob([new Uint8Array(i.data)], { type: i.mime }), `reference-${n + 1}.${ext(i.mime)}`));
    return { path: "/images/edits", form };
  }
  if (job.encoding === "gemini_native") {
    return gemini([{ text: job.prompt }, ...job.images.map((i) => ({ inline_data: { mime_type: i.mime, data: i.data.toString("base64") } }))]);
  }
  throw new Error(`unsupported reference encoding ${job.encoding}`);
}

/** 响应里的一项图片结果：Base64 或下载地址 */
export interface ReturnedImage {
  b64?: string;
  url?: string;
  mime?: string;
}

/** 从响应里取出图片和文字（Images API 的 data[]，或 generateContent 的 candidates[].content.parts[]） */
export function parseDirectResponse(json: unknown): { images: ReturnedImage[]; text: string } {
  const o = (json && typeof json === "object" ? json : {}) as Record<string, any>;
  const images: ReturnedImage[] = [];
  const texts: string[] = [];
  if (Array.isArray(o.data)) {
    for (const item of o.data) {
      if (item && typeof item.b64_json === "string") images.push({ b64: item.b64_json });
      else if (item && typeof item.url === "string") images.push({ url: item.url });
      else images.push({});
    }
  }
  if (Array.isArray(o.candidates)) {
    for (const c of o.candidates) {
      for (const p of c?.content?.parts ?? []) {
        const inline = p?.inlineData ?? p?.inline_data;
        if (inline && typeof inline.data === "string") images.push({ b64: inline.data, mime: inline.mimeType ?? inline.mime_type });
        else if (typeof p?.text === "string" && p.text.trim() && !p.thought) texts.push(p.text.trim());
      }
    }
  }
  return { images, text: texts.join("\n\n") };
}
