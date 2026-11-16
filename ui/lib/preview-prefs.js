// 右侧预览的本机偏好（和 lib/prefs.js 一样存在 localStorage，每个浏览器 / 桌面窗口一份，重启后还在）：
// 视图切换按文件类型记（Markdown 预览 / 原文……）、内容缩放按文件类型记（50%–200%）、自动换行按扩展名记。
// 面板宽度在 lib/prefs.js 的 workW（和工作台共用）；标签本身不存，重启后清空。
import { createStore } from "./store.js";

const KEY = "amb-preview";
const VIEWS = { markdown: ["preview", "source"], html: ["preview", "source"], csv: ["table", "source"], tsv: ["table", "source"], json: ["formatted", "source"] };
export const ZOOM_MIN = 50;
export const ZOOM_MAX = 200;
export const ZOOM_STEP = 10;

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    return raw && typeof raw === "object" ? { view: { ...raw.view }, zoom: { ...raw.zoom }, wrap: { ...raw.wrap } } : { view: {}, zoom: {}, wrap: {} };
  } catch {
    return { view: {}, zoom: {}, wrap: {} };
  }
}

export const previewPrefs = createStore(read());

function save(next) {
  previewPrefs.set(next);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 隐私模式：只在本次生效 */
  }
}

/** 这种类型的视图有哪些；第一个是默认 */
export const viewsOf = (type) => VIEWS[type] || null;
export function viewOf(type) {
  const list = VIEWS[type];
  if (!list) return null;
  const v = previewPrefs.get().view[type === "tsv" ? "csv" : type];
  return list.includes(v) ? v : list[0];
}
export function setView(type, view) {
  const p = previewPrefs.get();
  save({ ...p, view: { ...p.view, [type === "tsv" ? "csv" : type]: view } });
}

/** 内容缩放（百分比）；只有 Markdown、代码 / 纯文本、JSON、CSV、HTML 有 */
export const ZOOMABLE = new Set(["markdown", "code", "text", "json", "jsonl", "csv", "tsv", "html"]);
const zoomKey = (type) => (type === "tsv" ? "csv" : type === "jsonl" ? "json" : type === "text" ? "code" : type);
export function zoomOf(type) {
  const z = Number(previewPrefs.get().zoom[zoomKey(type)]);
  return Number.isFinite(z) && z >= ZOOM_MIN && z <= ZOOM_MAX ? z : 100;
}
export function setZoom(type, zoom) {
  const p = previewPrefs.get();
  const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(zoom / ZOOM_STEP) * ZOOM_STEP));
  save({ ...p, zoom: { ...p.zoom, [zoomKey(type)]: z } });
}

/** 自动换行：按扩展名记（Markdown 原文记在 "md"）；没记过时用 fallback */
export function wrapOf(ext, fallback) {
  const v = previewPrefs.get().wrap[ext || "(none)"];
  return typeof v === "boolean" ? v : fallback;
}
export function setWrap(ext, on) {
  const p = previewPrefs.get();
  save({ ...p, wrap: { ...p.wrap, [ext || "(none)"]: !!on } });
}

window.addEventListener?.("storage", (e) => {
  if (e.key === KEY || e.key === null) previewPrefs.set(read());
});
