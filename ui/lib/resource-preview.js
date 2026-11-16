// Shared entry point for chat, history, groups and Bot workbenches. A synchronous,
// cancelable event preserves normal link navigation when no panel is mounted.
export const PREVIEW_EVENT = "amb-open-preview";
export const fileUrl = (conv, path) => `/amb/api/conversations/${encodeURIComponent(conv)}/file?path=${encodeURIComponent(path)}`;

export function websiteResource(value, name = "", origin = globalThis.location?.origin) {
  try {
    if (typeof value !== "string" || !/^https?:\/\//i.test(value.trim())) return null;
    const url = new URL(value.trim());
    if (url.username || url.password || url.origin === origin || url.href.length > 2048) return null;
    return { id: `web:${url.href}`, type: "website", url: url.href, name: name || url.hostname };
  } catch { return null; }
}

/** 网络图片（Markdown 里的 https 图片、data 内嵌图片）：标签显示域名，没有文件夹图标 */
export function webImageResource(url, alt = "") {
  if (typeof url !== "string" || !/^(https:\/\/|data:image\/(png|jpe?g|gif|webp);)/i.test(url) || url.length > 8 * 1024 * 1024) return null;
  let name = alt;
  try { if (/^https:/i.test(url)) name = new URL(url).hostname; } catch { return null; }
  return { id: `img:${url}`, type: "webimage", url, name: name || "image" };
}

export function fileResource(file, conv, canOpen = false) {
  if (!conv || !file?.path || file.gone) return null;
  return { id: JSON.stringify([conv, file.path]), type: "file", conv, path: file.path, name: file.name || file.path.split(/[\\/]/).pop(), canOpen };
}

export function appFileResource(path, botId, canOpen = false) {
  if (typeof path !== "string" || !path.startsWith("app/") || !localFilePath(path)) return null;
  return { id: JSON.stringify(["app", botId, path]), type: "file", botId, path, name: path.split("/").pop(), canOpen };
}
export const resourceFileUrl = (item) => item.botId ? `/amb/api/bots/${encodeURIComponent(item.botId)}/app/download?path=${encodeURIComponent(item.path)}` : fileUrl(item.conv, item.path);
export const resourcePreviewPath = (item, encoding = "") => (item.botId ? `/bots/${encodeURIComponent(item.botId)}/app/preview?path=${encodeURIComponent(item.path)}` : `/conversations/${encodeURIComponent(item.conv)}/file/preview?path=${encodeURIComponent(item.path)}`) + (encoding ? `&encoding=${encodeURIComponent(encoding)}` : "");
/** action：open 用系统程序打开（会运行的只在文件夹中显示，回 revealed）、reveal 在文件夹中显示、save 另存为、browser 用默认浏览器打开网页（桌面版） */
export const resourceFileAction = (item, action) => item.botId
  ? { path: `/bots/${encodeURIComponent(item.botId)}/app/${action === "save" ? "save" : "open"}`, body: { path: item.path, reveal: action === "reveal", browser: action === "browser" } }
  : { path: `/conversations/${encodeURIComponent(item.conv)}/file/${action}`, body: { path: item.path } };

export const plainClick = (event) => !event.defaultPrevented && (event.button == null || event.button === 0) && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
export function openResource(resource) {
  return !!resource && !window.dispatchEvent(new CustomEvent(PREVIEW_EVENT, { detail: resource, cancelable: true }));
}
export function previewWebsite(event) {
  if (!plainClick(event)) return;
  const link = event.currentTarget;
  if (openResource(websiteResource(link.href, link.textContent))) event.preventDefault();
}

export const MAX_TABS = 12;
export const emptyResources = () => ({ items: [], active: "" });
/**
 * 打开：新的加在最右并切过去；已经开着的只切过去，rev + 1 让它重新读取一次（位置不变）。
 * 超过 12 个时关掉最早打开、又不是刚才在看的那个（不提示）。
 */
export function addResource(state = emptyResources(), item) {
  const had = state.items.find((x) => x.id === item.id);
  if (had) return { items: state.items.map((x) => (x.id === item.id ? { ...x, ...item, rev: (x.rev || 0) + 1 } : x)), active: item.id };
  let items = [...state.items, { ...item, rev: 0 }];
  while (items.length > MAX_TABS) {
    const drop = items.find((x) => x.id !== state.active && x.id !== item.id) || items[0];
    items = items.filter((x) => x !== drop);
  }
  return { items, active: item.id };
}
/** 关掉一个：关的是当前的就切到右边那个，没有就左边那个；关掉最后一个回到空状态 */
export function removeResource(state, id) {
  const index = state.items.findIndex((x) => x.id === id);
  const items = state.items.filter((x) => x.id !== id);
  return { items, active: state.active === id ? (items[Math.min(index, items.length - 1)]?.id || "") : state.active };
}
export const closeOtherResources = (state, id) => ({ items: state.items.filter((x) => x.id === id), active: state.items.some((x) => x.id === id) ? id : "" });
export const activeResource = (state) => state.items.find((x) => x.id === state.active) || state.items.at(-1) || null;

/** Local Markdown links only; authorization still belongs to the file API. */
export function localFilePath(value) {
  let p = String(value || "").trim();
  if (!p || /[\u0000-\u001f\u007f]/.test(p) || p.startsWith("#") || p.startsWith("//")) return null;
  if (/^sandbox:\//i.test(p)) p = p.slice("sandbox:".length);
  else if (/^file:\/\//i.test(p)) {
    try { const u = new URL(p); if (u.hostname && u.hostname !== "localhost") return null; p = u.pathname.replace(/^\/([A-Za-z]:\/)/, "$1"); } catch { return null; }
  } else if (/^[a-z][a-z\d+.-]*:/i.test(p) && !/^[A-Za-z]:[\\/]/.test(p)) return null;
  try { p = decodeURIComponent(p); } catch { return null; }
  if (!p || /[\u0000-\u001f\u007f]/.test(p) || p.split(/[\\/]/).includes("..")) return null;
  return p;
}
