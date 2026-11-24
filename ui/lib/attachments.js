// 消息附件的当前输入（粘贴图片、拖入图片、文本文件和 ZIP）：每个机器人的对话一份，换页回来还在，不同机器人互不相干。
// 流程：逐项硬校验（合格的加入、不合格的汇总成一句）→ 本地同步占位 → 服务端逐项预约 → 传真实字节 → 图片在这里解码规范化后再传一份 → 就绪。
// 加入不等于发送，就绪不等于模型已读；发送由对话页走原来的发送按钮（screens/chat.js）。
// 这里只在内存里记状态和预览用的 Blob 地址：刷新页面后从服务端取回还在的那些，不承诺重启后一定能恢复。
import { api, ApiError } from "./api.js";
import { createStore, useStore } from "./store.js";
import { getLang, t } from "./i18n.js";

export const ATTACH_PROTOCOL = 1;
const MIB = 1024 * 1024;
/** 服务端的数字读到之前先用这一份（和 src/attachments/limits.ts 一致，读到后以服务端为准） */
const DEFAULTS = { maxItems: 8, maxImages: 4, maxFileBytes: 10 * MIB, maxZipBytes: 50 * MIB, maxTotalBytes: 50 * MIB, maxTextChars: 100000, maxTextCharsTotal: 200000 };
const TEXT_EXT = ["md", "markdown", "html", "htm", "txt", "csv", "json", "log", "yaml", "yml", "xml", "css", "js", "ts", "py", "sh", "ps1", "bat", "cmd"];
const IMAGE_EXT = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", jfif: "image/jpeg", jpe: "image/jpeg" };
const IMAGE_CONVERT = ["heic", "heif", "avif", "bmp", "tif", "tiff", "svg", "svgz", "ico", "apng", "jxl", "psd"];
/** 别的压缩格式：提示「压缩包仅支持 ZIP」（和 src/attachments/limits.ts 一致） */
const OTHER_ARCHIVES = ["rar", "7z", "tar", "gz", "tgz", "bz2", "tbz", "tbz2", "xz", "txz", "zst", "lz", "lzma", "cab", "arj", "z", "001"];

const newId = () => {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
export const newMessageId = newId;

const extOf = (name) => {
  const base = String(name || "").replace(/\\/g, "/").split("/").pop() || "";
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(i + 1).toLowerCase() : "";
};

/**
 * 和服务端同一套分类（名字 + MIME）：{ kind } 或 { reject }。
 * 是图片但收不了的回 imageConvert，不回 format——那一句只列了文本格式，会让人以为图片都不支持。
 */
export function classifyFile(name, mime, formats) {
  const ext = extOf(name);
  const type = String(mime || "").toLowerCase().split(";")[0].trim();
  const text = formats?.text || TEXT_EXT;
  // ZIP 只认扩展名 .zip；.docx / .jar 这类内部也是 ZIP 的照原规则不收
  if (ext === "zip") return { kind: "zip" };
  if (OTHER_ARCHIVES.includes(ext) || /\.tar\.[a-z0-9]+$/i.test(String(name || ""))) return { reject: "archive" };
  if (ext in IMAGE_EXT) return type && !type.startsWith("image/") ? { reject: "format" } : { kind: "image" };
  if (IMAGE_CONVERT.includes(ext)) return { reject: "imageConvert" };
  if (text.includes(ext)) return /^(image|audio|video)\//.test(type) ? { reject: "format" } : { kind: "text" };
  if (!ext && type.startsWith("image/")) return Object.values(IMAGE_EXT).includes(type) ? { kind: "image" } : { reject: "imageConvert" };
  // 扩展名不在表里、但系统说它是图片（.jp2、相机原片…）
  if (type.startsWith("image/")) return { reject: "imageConvert" };
  return { reject: "format" };
}

/** 这一类单份最多多少字节：ZIP 50 MiB，其余 10 MiB */
const maxBytesOf = (kind, limits) => (kind === "zip" ? limits.maxZipBytes ?? DEFAULTS.maxZipBytes : limits.maxFileBytes);

/**
 * 一批文件逐项核对（PRD R4）：按原顺序核算剩余的数量、图片数和合计字节，合格的依次占名额，不合格的各给原因，
 * 后面还放得下的合格项照收；已有的待发项不动。zipOk = false：代理模式关着，ZIP 不收。和服务端同一套（服务端最终核对）。
 */
export function planBatch(files, items, limits = DEFAULTS, formats, zipOk = true) {
  let count = items.length;
  let images = items.filter((a) => a.kind === "image").length;
  let bytes = items.reduce((n, a) => n + a.size, 0);
  return files.map((f) => {
    const c = classifyFile(f.name, f.type, formats);
    if (c.reject) return { ok: false, code: c.reject };
    if (c.kind === "zip" && !zipOk) return { ok: false, code: "agentOff" };
    if (!(f.size > 0)) return { ok: false, code: "empty" };
    if (f.size > maxBytesOf(c.kind, limits)) return { ok: false, code: "size" };
    const image = c.kind === "image" ? 1 : 0;
    if (count + 1 > limits.maxItems || images + image > limits.maxImages) return { ok: false, code: "count" };
    if (bytes + f.size > limits.maxTotalBytes) return { ok: false, code: "size" };
    count++;
    images += image;
    bytes += f.size;
    return { ok: true, kind: c.kind };
  });
}

/** 一项没加进去的短原因（汇总在「部分文件未添加：名字（原因）、…」里） */
export function whyText(code) {
  const map = { format: "attach.whyFormat", archive: "attach.whyArchive", empty: "attach.whyEmpty", size: "attach.whySize", count: "attach.whyCount", agentOff: "attach.whyAgentOff", dir: "attach.whyDir", imageConvert: "attach.whyImageConvert", storage: "attach.whyStorage" };
  return t(map[code] || "attach.whyUnreadable");
}

/** 没加进去的那几项汇总成一句：只有一项时就用那一项的完整提示 */
export function rejectedText(list, allRejected) {
  if (list.length === 1 && allRejected) return reasonText(list[0].code);
  const names = list.map((r) => t("attach.fileWhy", { name: r.name, why: whyText(r.code) })).join(t("attach.listSep"));
  return t(allRejected ? "attach.noneAdded" : "attach.someAdded", { files: names });
}

// —— 用作生图参考（PRD 2026-11-23）：原因码 → 文案。带「切换模型」文字操作的那几句由输入框换成按钮（refParts） ——
const REF_TEXT = {
  ref_unauthorized: "attach.refUnauthorized", ref_loading: "attach.refLoading", ref_caps_failed: "attach.refCapsFailed", ref_caps_stale: "attach.refCapsStale",
  ref_caps_unknown: "attach.refCapsUnknown", ref_limits_unknown: "attach.refLimitsUnknown", ref_no_generation: "attach.refNoGeneration", ref_no_reference: "attach.refNoReference",
  ref_adapter: "attach.refAdapter", ref_other_files: "attach.refOtherFiles", ref_count: "attach.refCount", ref_local_count: "attach.refLocalCount", ref_format: "attach.refFormat",
  ref_limit: "attach.refLimit", ref_no_text: "attach.refNoText", ref_custom_key: "attach.refCustomKey", ref_account: "attach.refAccount",
  img_model_images: "attach.imgModelImages", img_model_files: "attach.imgModelFiles", gen_adapter: "attach.genAdapter",
};
export const isRefCode = (code) => code in REF_TEXT;

/** {limit}：每边 240–8000px、宽高比 1:8–8:1、单张不超过 50 MB、整次请求不超过 64 MB */
export function limitText(l) {
  if (!l) return "";
  const range = (f) => (l.min && l.max ? `${f(l.min)}–${f(l.max)}` : l.max ? `≤${f(l.max)}` : l.min ? `≥${f(l.min)}` : "");
  const mb = (n) => `${+(n / 1e6).toFixed(1)} MB`;
  const ratio = (r) => (r >= 1 ? `${+r.toFixed(2)}:1` : `1:${+(1 / r).toFixed(2)}`);
  if (l.kind === "edge") return t("attach.refLimitEdge", { range: range(String) });
  if (l.kind === "aspect") return t("attach.refLimitAspect", { range: range(ratio) });
  if (l.kind === "bytes") return t("attach.refLimitBytes", { max: mb(l.max || 0) });
  return t("attach.refLimitRequest", { max: mb(l.max || 0) });
}

/**
 * 参考相关的一句；sw 给了就是「切换模型」那段的替代（输入框里是一个打开原选择器的文字按钮），不给就是纯文字。
 * switch 用在句首、switchInline 用在句中（有的语言大小写不同），switchImages 是「切换可处理图片的模型」。
 */
export function refText(code, params = {}, sw) {
  const key = REF_TEXT[code];
  if (!key) return "";
  const label = (k) => (sw ? sw(t(k)) : t(k));
  return t(key, { count: params.count ?? 0, limit: limitText(params.limit), switch: label("attach.refSwitch"), switchInline: label("attach.refSwitchInline"), switchImages: label("attach.refSwitchImages") });
}

/** 原因码 → 一句短提示（同一个位置只显示最相关的一句） */
export function reasonText(code, params) {
  if (isRefCode(code)) return refText(code, params);
  const map = {
    count: "attach.limitCount", size: "attach.limitSize", format: "attach.format", imageConvert: "attach.imageConvert", empty: "attach.empty",
    archive: "attach.archive", agentOff: "attach.agentOff", storage: "attach.storageFull", dir: "attach.dropDir", folderChanged: "attach.sendChanged",
    uploadFailed: "attach.uploadFailed", sourceChanged: "attach.sourceChanged",
    unreadable: "attach.unreadable", encoding: "attach.encoding", content: "attach.content", context: "attach.context", expired: "attach.expired",
    busy: "attach.busy", changed: "attach.changed", vision_unsupported: "attach.visionUnsupported", vision_unknown: "attach.visionUnknown",
    vision_closed: "attach.visionClosed", conflict: "attach.changed", rejected: "attach.network", not_found: "attach.expired", rate: "attach.batchRejected",
    protocol: "attach.protocol", network: "attach.network", unknown: "attach.unknownResult", processing: "attach.processing", batch: "attach.batchRejected",
    clipboard: "attach.clipboardFailed", filePaste: "attach.filePaste", noBot: "attach.noBot", historyWindow: "attach.historyWindow", historyNoVision: "attach.historyNoVision",
  };
  return t(map[code] || "attach.batchRejected");
}

// —— 每个机器人的当前输入 ——
const drafts = new Map();
/** 不进渲染状态的东西：取消令牌、预览用的 Blob 地址 */
const side = new Map();
const blank = () => ({ items: [], server: null, unsupported: false, offline: false, notice: null, sending: false, unknown: null });
export function draftStore(botId) {
  if (!drafts.has(botId)) {
    drafts.set(botId, createStore(blank()));
    side.set(botId, { aborts: new Map(), urls: new Map(), noticeTimer: 0, refreshing: null });
  }
  return drafts.get(botId);
}
export const useDraft = (botId) => useStore(draftStore(botId));
const patch = (botId, fn) => draftStore(botId).set((s) => ({ ...s, ...fn(s) }));
const patchItem = (botId, cid, change) => patch(botId, (s) => ({ items: s.items.map((a) => (a.cid === cid ? { ...a, ...change } : a)) }));

/** 一句会自己消失的提示（没加进去的文件、粘贴不了…）；不抢正在挡发送的那句。text 给了就显示它（汇总了文件名的那种） */
export function notify(botId, code, text, params) {
  const x = side.get(botId) || (draftStore(botId), side.get(botId));
  clearTimeout(x.noticeTimer);
  patch(botId, () => ({ notice: { code, text, params, at: Date.now() } }));
  x.noticeTimer = setTimeout(() => patch(botId, () => ({ notice: null })), text ? 9000 : 6000);
}

const contentUrl = (botId, a) => `/amb/api/bots/${encodeURIComponent(botId)}/attachments/${encodeURIComponent(a.id)}/content?v=${encodeURIComponent(a.version || "")}`;
/** 已发消息里的图片地址（和待发的预览、交给模型的是同一个内容版本） */
export const sentImageUrl = contentUrl;

function fromServer(botId, r, local) {
  const status = r.status === "ready" ? "ready" : r.status === "failed" ? "failed" : r.status === "expired" ? "expired" : local?.status || "processing";
  return {
    cid: r.clientId, id: r.id, batch: r.batch, order: r.order, kind: r.kind, name: local?.name || r.name, size: r.size, status, messageId: r.messageId,
    error: r.status === "expired" ? "expired" : r.error || "", version: r.version, width: r.width, height: r.height, textChars: r.textChars || 0,
    url: r.kind === "image" && r.status === "ready" ? local?.url || contentUrl(botId, r) : "",
  };
}

/**
 * 读一次服务端的能力和当前输入：上限、格式、模型看图三态、通路、上下文预算、修订。
 * 本地还没拿到 id 的占位留着；服务端已经没有的（过期被清）标成过期。旧服务没有这个接口时标成不支持。
 */
export function refresh(botId, { force = false } = {}) {
  const x = side.get(botId) || (draftStore(botId), side.get(botId));
  if (x.refreshing && !force) return x.refreshing;
  x.refreshing = (async () => {
    try {
      // force：从原选择器重新打开时只读地重新取一次型号能力（不发图、不生成）
      const d = await api(`/bots/${encodeURIComponent(botId)}/attachments/state${force ? "?refresh=1" : ""}`);
      if (d.protocol !== ATTACH_PROTOCOL) return patch(botId, () => ({ unsupported: true, offline: false }));
      patch(botId, (s) => {
        const mine = new Map(s.items.map((a) => [a.cid, a]));
        // 没人在传的半截预约（刷新页面时传到一半的）：超过两分钟就让服务端释放，不留一个永远在处理的占位
        const orphan = (r) => !mine.has(r.clientId) && (r.status === "reserved" || r.status === "rendition") && Date.now() - (r.expiresAt - d.limits.draftTtlMs) > 120000;
        const rows = d.items.filter((r) => {
          if (!orphan(r)) return true;
          api(`/bots/${encodeURIComponent(botId)}/attachments/${encodeURIComponent(r.id)}`, { method: "DELETE" }).catch(() => {});
          return false;
        });
        const known = new Map(rows.map((r) => [r.clientId, r]));
        const items = [
          ...rows.map((r) => fromServer(botId, r, mine.get(r.clientId))),
          // 还在预约 / 读取的本地占位（服务端还不认识）
          ...s.items.filter((a) => !a.id && !known.has(a.cid)),
        ].sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9));
        return { server: d, items, unsupported: false, offline: false };
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) patch(botId, () => ({ unsupported: true, offline: false }));
      else if (!(e instanceof ApiError)) patch(botId, () => ({ offline: true }));
    } finally {
      x.refreshing = null;
    }
    return draftStore(botId).get();
  })();
  return x.refreshing;
}

const PUT = async (botId, id, what, body, signal) => {
  const res = await fetch(`/amb/api/bots/${encodeURIComponent(botId)}/attachments/${encodeURIComponent(id)}/${what}`, {
    method: "PUT", headers: { "content-type": "application/octet-stream", "x-amb-lang": getLang() }, body, signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `HTTP ${res.status}`, res.status, data);
  return data.item;
};

/**
 * 图片规范化：按 EXIF 纠正方向、不裁剪不拉伸、最长边超过 4096 时等比缩小（小图不放大），重新编码后元信息就没了。
 * JPEG 出 JPEG，其余出 PNG（保留透明）；PNG 超过单份上限而图片又没有透明区域时改出 JPEG。
 * want：服务端按原图文件头算好的目标尺寸（已经考虑了方向）和真实格式（扩展名可能写错，以它为准）。
 */
async function normalizeImage(file, want, maxBytes) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // 解不开的图片：回图片那一句提示（转成 PNG / JPG 再加）
    throw Object.assign(new Error("decode"), { code: "imageConvert" });
  }
  try {
    const w = want?.width || bitmap.width;
    const h = want?.height || bitmap.height;
    /** @type {any} */
    const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
    const g = canvas.getContext("2d");
    g.imageSmoothingQuality = "high";
    g.drawImage(bitmap, 0, 0, w, h);
    const encode = (type, quality) => (canvas.convertToBlob ? canvas.convertToBlob({ type, quality }) : new Promise((r) => canvas.toBlob(r, type, quality)));
    const jpeg = want?.format ? /^jpe?g$/.test(want.format) : /jpe?g$/i.test(file.type) || /\.(jpe?g|jpe|jfif)$/i.test(file.name || "");
    let out = await encode(jpeg ? "image/jpeg" : "image/png", 0.92);
    if (out && !jpeg && out.size > maxBytes) {
      const data = g.getImageData(0, 0, w, h).data;
      let opaque = true;
      for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) { opaque = false; break; }
      if (opaque) out = await encode("image/jpeg", 0.9);
    }
    if (!out) throw Object.assign(new Error("encode"), { code: "imageConvert" });
    if (out.size > maxBytes) throw Object.assign(new Error("size"), { code: "size" });
    return out;
  } finally {
    bitmap.close?.();
  }
}

async function upload(botId, item, file) {
  const x = side.get(botId);
  const ac = new AbortController();
  x.aborts.set(item.cid, ac);
  const limits = draftStore(botId).get().server?.limits || DEFAULTS;
  try {
    let bytes;
    try {
      bytes = await file.arrayBuffer();
    } catch {
      // 读不了（没有权限、云端占位还没下载、读的时候文件没了）
      throw Object.assign(new Error("read"), { code: "unreadable" });
    }
    if (ac.signal.aborted) return;
    // 读的时候文件变了（大小对不上）：这一项失败，不交半份
    if (bytes.byteLength !== file.size) throw Object.assign(new Error("changed"), { code: "sourceChanged" });
    let r = await PUT(botId, item.id, "content", bytes, ac.signal);
    if (r.status === "rendition") {
      const blob = await normalizeImage(file, r.want, limits.maxFileBytes);
      if (ac.signal.aborted) return;
      r = await PUT(botId, item.id, "rendition", blob, ac.signal);
      if (r.status === "ready") {
        // 预览用的就是刚交上去的这一份规范化字节
        const url = URL.createObjectURL(blob);
        x.urls.set(item.cid, url);
        if (ac.signal.aborted) return void URL.revokeObjectURL(url);
        patchItem(botId, item.cid, { ...fromServer(botId, r), url });
        return;
      }
    }
    if (ac.signal.aborted) return;
    patchItem(botId, item.cid, fromServer(botId, r, { name: item.name }));
  } catch (e) {
    if (ac.signal.aborted || e?.name === "AbortError") return;
    // 断网、连接中断：上传失败，移除后重新拖入（不在后台续传）
    const code = e?.code || (e instanceof ApiError ? e.data?.code || "unreadable" : "uploadFailed");
    patchItem(botId, item.cid, { status: "failed", error: code });
  } finally {
    x.aborts.delete(item.cid);
  }
}

/**
 * 加一批文件（一次粘贴或一次投放）。逐项核对：合格的加入（同步占位，处理中的也占名额），不合格的汇总成一句提示，
 * 已有输入不动；再向服务端逐项预约（服务端按真实名额最终核对，它拒绝的也并进提示）；之后各项各自读取，某一项出问题只标这一项。
 * dirs：投放里的文件夹名（不加入、不展开，提示用上方的选择文件夹）。返回有没有加进去任何一项。
 */
export async function addFiles(botId, files, dirs = []) {
  const store = draftStore(botId);
  if (!store.get().server && !store.get().unsupported) await refresh(botId);
  let s = store.get();
  if (s.unsupported) return notify(botId, "protocol"), false;
  if (s.sending || s.unknown) return notify(botId, s.unknown ? "unknown" : "processing"), false;
  if (!s.server) return notify(botId, "network"), false;
  if (!files.length && !dirs.length) return notify(botId, "unreadable"), false;
  const plan = planBatch(files, s.items, s.server.limits, s.server.formats, s.server.zip !== false);
  const rejected = [...dirs.map((name) => ({ name, code: "dir" })), ...plan.map((r, i) => (r.ok ? null : { name: files[i].name || "image", code: r.code })).filter(Boolean)];
  const take = files.map((f, i) => ({ f, kind: plan[i].kind })).filter((_, i) => plan[i].ok);
  const tell = (extra = []) => {
    const all = [...rejected, ...extra];
    if (!all.length) return;
    // 只有文件夹：直接说用上方的选择文件夹
    if (all.every((r) => r.code === "dir") && !take.length) return notify(botId, "dir");
    notify(botId, "partial", rejectedText(all, !take.length || take.length === extra.length));
  };
  if (!take.length) return tell(), false;
  const batch = newId();
  const base = Math.max(0, ...s.items.map((a) => a.order || 0));
  const placed = take.map(({ f, kind }, i) => ({
    cid: newId(), id: "", batch, order: base + 1 + i, kind, name: f.name || "", size: f.size,
    status: "processing", error: "", version: "", url: "", width: 0, height: 0, textChars: 0,
  }));
  // 同步占位：紧接着再来的一批按占了位的数量核算
  patch(botId, (cur) => ({ items: [...cur.items, ...placed], notice: null }));
  const dropBatch = () => patch(botId, (cur) => ({ items: cur.items.filter((a) => a.batch !== batch) }));
  let reserved;
  try {
    reserved = await api(`/bots/${encodeURIComponent(botId)}/attachments/batches`, {
      method: "POST",
      body: { protocol: ATTACH_PROTOCOL, segment: s.server.segment, batch, items: placed.map((a, i) => ({ clientId: a.cid, name: a.name || `image.${(take[i].f.type.split("/")[1] || "png").replace("jpeg", "jpg")}`, mime: take[i].f.type || "", size: a.size })) },
    });
  } catch (e) {
    dropBatch();
    const code = e instanceof ApiError ? e.data?.code || "batch" : "network";
    // 分段或条件变了（比如别的窗口开了新对话）：重新读一次再说
    if (code === "changed") void refresh(botId);
    notify(botId, code === "changed" ? "batch" : code);
    return false;
  }
  const byCid = new Map(reserved.items.map((r) => [r.clientId, r]));
  // 服务端按真实名额拒绝的（别的窗口刚占了名额）：拿掉占位，并进提示
  const late = (reserved.rejected || []).map((r) => ({ cid: r.clientId, code: r.code }));
  if (late.length) {
    const gone = new Set(late.map((r) => r.cid));
    patch(botId, (cur) => ({ items: cur.items.filter((a) => !gone.has(a.cid)) }));
  }
  tell(late.map((r) => ({ name: placed.find((a) => a.cid === r.cid)?.name || "image", code: r.code })));
  // 预约期间被移除的那几项：告诉服务端释放
  const alive = new Set(store.get().items.filter((a) => a.batch === batch).map((a) => a.cid));
  const jobs = [];
  placed.forEach((a, i) => {
    const r = byCid.get(a.cid);
    if (!r) return;
    if (!alive.has(a.cid)) return void api(`/bots/${encodeURIComponent(botId)}/attachments/${encodeURIComponent(r.id)}`, { method: "DELETE" }).catch(() => {});
    patchItem(botId, a.cid, { id: r.id, order: r.order });
    jobs.push(() => upload(botId, { ...a, id: r.id }, take[i].f));
  });
  // 同时最多传 3 项（服务端每个机器人同时收 4 个）
  const worker = async () => {
    for (let job; (job = jobs.shift()); ) await job();
  };
  await Promise.all([worker(), worker(), worker()]);
  void refresh(botId);
  return byCid.size > 0;
}

/** 移除一项待发的附件：立刻消失、释放名额，取消还在进行的读取和上传（迟到的结果不会让它回来）；原文件不动 */
export function removeItem(botId, cid) {
  const x = side.get(botId);
  const item = draftStore(botId).get().items.find((a) => a.cid === cid);
  if (!item) return;
  x?.aborts.get(cid)?.abort();
  const url = x?.urls.get(cid);
  if (url) (URL.revokeObjectURL(url), x.urls.delete(cid));
  patch(botId, (s) => ({ items: s.items.filter((a) => a.cid !== cid) }));
  if (item.id) api(`/bots/${encodeURIComponent(botId)}/attachments/${encodeURIComponent(item.id)}`, { method: "DELETE" }).then(() => refresh(botId)).catch(() => {});
}

/**
 * 「用作生图参考」开关：只设这条草稿里图片的用途（不发消息、不生成、不换型号），服务端记着（刷新后恢复）。
 * 先显示再保存；服务端拒绝（比如换成了自定义 Key）时按它的状态回退，并给一句原因。
 */
export async function setReference(botId, on) {
  const s = draftStore(botId).get();
  if (!s.server) return;
  // 等服务端核对的这一下：发送先不可用，但校验条不闪一句「正在确认」（pending）
  patch(botId, (cur) => ({ server: cur.server && { ...cur.server, reference: { ...cur.server.reference, on, notice: "", verdict: on ? { code: "ref_loading", pending: true } : { code: "" } } } }));
  try {
    const d = await api(`/bots/${encodeURIComponent(botId)}/attachments/reference`, { method: "PUT", body: { on, segment: s.server.segment } });
    patch(botId, (cur) => ({ server: cur.server && { ...cur.server, reference: d.reference } }));
  } catch (e) {
    const code = e instanceof ApiError ? e.data?.code : "network";
    if (code && code !== "changed") notify(botId, code, undefined, e?.data);
  }
  void refresh(botId);
}

/** 开始新对话：上一段没发出的附件不带过来（服务端同时清掉） */
export function clearDraft(botId) {
  const x = side.get(botId);
  if (!x) return;
  for (const ac of x.aborts.values()) ac.abort();
  for (const url of x.urls.values()) URL.revokeObjectURL(url);
  x.urls.clear();
  patch(botId, () => ({ items: [], notice: null }));
  void refresh(botId);
}

/** 发出去并受理了的那几项从当前输入里拿掉（消息里的缩略图改用服务端地址） */
export function settleSent(botId, cids) {
  const x = side.get(botId);
  const set = new Set(cids);
  for (const cid of set) {
    const url = x?.urls.get(cid);
    // 放大预览可能还开着这张图：晚一点再回收
    if (url) (setTimeout(() => URL.revokeObjectURL(url), 30000), x.urls.delete(cid));
  }
  patch(botId, (s) => ({ items: s.items.filter((a) => !set.has(a.cid)), sending: false, unknown: null }));
  void refresh(botId);
}

export const setSending = (botId, sending) => patch(botId, () => ({ sending }));
export const setUnknown = (botId, unknown) => patch(botId, () => ({ unknown }));

/** 粗略估算文字占多少 tokens（和服务端同一个算法，只是估算） */
function textTokens(text) {
  let ascii = 0;
  let wide = 0;
  for (const ch of text) (ch.codePointAt(0) < 0x80 ? ascii++ : wide++);
  return Math.ceil(ascii / 4) + wide;
}

/**
 * 带附件时原发送按钮能不能用：{ blocked: 原因码 | "" , hint: 不挡发送的轻提示码 | "" }。
 * 条件：全部附件就绪、没有失败 / 过期项、容量和字数在限额内、含图时模型确实能看图且通路开着、上下文放得下、
 * 服务连得上、没有结果不明的上一次发送、机器人不在回复中。
 */
export function sendCheck(s, { text = "", generating = false } = {}) {
  const items = s.items;
  if (s.unsupported) return { blocked: items.length ? "protocol" : "", hint: "" };
  if (s.unknown) return { blocked: "unknown", hint: "" };
  if (!items.length) {
    const sv = s.server;
    // 没有待发附件：只说明历史图片这一轮看不看得见（不挡发送）
    // 纯图片生成型号不读聊天记录（生图只用这条消息），这句说明对它不成立
    if (sv?.history?.images > 0 && sv.model?.vision !== "supported" && !sv.reference?.model?.pure) return { blocked: "", hint: "historyNoVision" };
    return { blocked: "", hint: "" };
  }
  if (s.offline || !s.server) return { blocked: "network", hint: "" };
  const bad = items.find((a) => a.status === "failed" || a.status === "expired");
  if (bad) return { blocked: bad.status === "expired" ? "expired" : bad.error || "unreadable", hint: "" };
  if (s.sending || items.some((a) => a.status !== "ready")) return { blocked: "processing", hint: "" };
  if (generating || s.server.busy) return { blocked: "busy", hint: "" };
  const { limits, model, usage, history } = s.server;
  const images = items.filter((a) => a.kind === "image").length;
  // 用作生图参考：服务端按当前型号的真实能力和限制核对过（未知不当成支持）；文字是否为空在这里看
  const ref = s.server.reference;
  if (ref?.available && ref.on && images) {
    if (ref.verdict?.code) return { blocked: ref.verdict.code, hint: "", params: ref.verdict };
    if (!text.trim()) return { blocked: "ref_no_text", hint: "" };
    return { blocked: "", hint: "" };
  }
  // 选的是纯图片生成型号：普通图片不会被忽略（开参考或换型号），别的文件开参考也绕不过
  if (ref?.available && ref.model?.pure) return { blocked: items.some((a) => a.kind !== "image") ? "img_model_files" : "img_model_images", hint: "" };
  if (images) {
    if (model.channel === "closed") return { blocked: "vision_closed", hint: "" };
    if (model.vision === "unsupported") return { blocked: "vision_unsupported", hint: "" };
    if (model.vision !== "supported") return { blocked: "vision_unknown", hint: "" };
  }
  if (items.reduce((n, a) => n + (a.textChars || 0), 0) > limits.maxTextCharsTotal) return { blocked: "content", hint: "" };
  if ((usage?.tokens || 0) + textTokens(text) > model.context.tokens) return { blocked: "context", hint: "" };
  if (history?.windowed && history.images + images > limits.maxImages) return { blocked: "", hint: "historyWindow" };
  if (!images && history?.images > 0 && model.vision !== "supported") return { blocked: "", hint: "historyNoVision" };
  return { blocked: "", hint: "" };
}

/**
 * 发送带附件的消息：冻结这一刻的文字和有序的内容版本，交给服务端原子受理。
 * 返回 { ok, receipt } | { ok: false, code } | { unknown: true }（断线，结果不明：之后只查原请求，不发第二次）。
 */
export async function submit(botId, text, clientMessageId, folder = "", retried = false) {
  const fresh = await refresh(botId);
  const s = fresh || draftStore(botId).get();
  if (s.offline || !s.server) return { ok: false, code: "network" };
  const check = sendCheck({ ...s, sending: false }, { text });
  if (check.blocked) return { ok: false, code: check.blocked };
  const items = s.items;
  let res;
  try {
    res = await fetch(`/amb/api/bots/${encodeURIComponent(botId)}/chat/send`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-amb-lang": getLang() },
      // folder：点发送那一刻输入框上方选的工作文件夹（"" = 没选）；和服务端的对不上就不受理
      // reference：点发送那一刻的参考用途和能力修订（服务端对不上就不受理，不按普通附件悄悄发出去）
      body: JSON.stringify({ version: s.server.sendVersion, clientMessageId, text, segment: s.server.segment, revision: s.server.revision, modelRevision: s.server.model.revision, attachments: items.map((a) => ({ id: a.id, version: a.version })), folder,
        ...(s.server.reference?.available && s.server.reference.on ? { reference: { on: true, revision: s.server.reference.revision } } : {}) }),
    });
  } catch {
    return { unknown: true, cids: items.map((a) => a.cid) };
  }
  const data = await res.json().catch(() => null);
  if (res.ok && data?.status === "accepted") return { ok: true, receipt: data, cids: items.map((a) => a.cid) };
  // 网关超时、连接中断的应答：受理与否不明
  if (res.status >= 500 || !data) return { unknown: true, cids: items.map((a) => a.cid) };
  // 修订刚好在这一刻变了（没有受理）：重新读一次当前输入，核对后用同一个消息 id 再交一次
  if (data.code === "changed" && !retried) return submit(botId, text, clientMessageId, folder, true);
  if (data.code === "changed" || data.code === "expired" || isRefCode(data.code)) void refresh(botId);
  return { ok: false, code: data.code || "changed", params: { count: data.count, limit: data.limit } };
}

/** 查原请求有没有被受理：accepted（带回执）/ pending / none（确认未受理）/ offline（还是连不上） */
export async function querySend(botId, clientMessageId) {
  try {
    const d = await api(`/bots/${encodeURIComponent(botId)}/chat/send/${encodeURIComponent(clientMessageId)}`);
    return d.status === "accepted" ? { status: "accepted", receipt: d } : { status: d.status === "pending" ? "pending" : "none" };
  } catch {
    return { status: "offline" };
  }
}

// —— 剪贴板与拖放里有什么 ——

/** 真实的系统文件拖动：带 Files，且不是从网页里拖出来的图片 / 链接（那种带 text/html 或网址） */
export function isFileDrag(dt) {
  const types = [...(dt?.types || [])];
  return types.includes("Files") && !types.includes("text/html");
}

/** 投放里的文件和文件夹：文件夹不加入、不展开（只记名字，提示用上方的选择文件夹） */
export function droppedFiles(dt) {
  const items = [...(dt?.items || [])].filter((i) => i.kind === "file");
  const all = [...(dt?.files || [])];
  const dirs = [];
  const files = [];
  all.forEach((f, i) => {
    let dir = false;
    try {
      dir = !!(items[i]?.webkitGetAsEntry?.() || items[i]?.getAsEntry?.())?.isDirectory;
    } catch {
      dir = false;
    }
    if (dir) dirs.push(f.name);
    else files.push(f);
  });
  return { files, dirs, hasDir: dirs.length > 0 };
}

/**
 * 一次粘贴里有什么：images 是剪贴板实际给出的图片字节；otherFiles 是普通文件的复制对象（不支持粘贴）；
 * realText 表示剪贴板里另有真正的普通文字（不是文件名、文件路径或文件 URI）——这时文字照常粘贴，图片另外加入。
 */
export function readPaste(cd) {
  const files = [...(cd?.files || [])];
  const images = files.filter((f) => /^image\//i.test(f.type));
  const otherFiles = files.filter((f) => !/^image\//i.test(f.type));
  const types = [...(cd?.types || [])];
  const plain = (cd?.getData?.("text/plain") || "").trim();
  const uris = (cd?.getData?.("text/uri-list") || "").trim();
  const lines = plain.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const fileish = !plain || plain === uris || lines.every((l) => /^file:\/\//i.test(l) || files.some((f) => f.name && (l === f.name || l.endsWith("/" + f.name) || l.endsWith("\\" + f.name))));
  // 剪贴板说有图片或文件，却一个字节也没给（没有权限、系统没交出来）
  const promised = types.includes("Files") || types.some((x) => /^image\//i.test(x));
  return { images, otherFiles, realText: !fileish, failed: promised && !files.length && fileish, hasFiles: files.length > 0 };
}

/**
 * 整个窗口对带文件的拖动都拦掉浏览器的默认行为（打开文件、离开当前页面）：在侧栏、设置页、没有对话的地方松开也不会打开文件、
 * 不切机器人。只有标了 data-drop-zone 的对话主区接收；别处显示成不可放。输入框里拖动选中的文字不带文件，不受影响。
 */
export function installDropGuard() {
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
  window.addEventListener("dragover", (e) => {
    if (!hasFiles(e)) return;
    const zone = e.target instanceof Element && e.target.closest("[data-drop-zone]");
    const handled = e.defaultPrevented;
    if (!handled) e.preventDefault();
    // 对话主区自己定了能不能放；别处一律不可放
    if (!zone || !handled) e.dataTransfer.dropEffect = "none";
  });
  window.addEventListener("drop", (e) => {
    if (hasFiles(e)) e.preventDefault();
  });
}
