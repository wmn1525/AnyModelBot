// 消息附件的界面：输入框里的待发区（图片只有缩略图、文件是浅白圆角卡，右上角各一个移除 ×）、已发消息里的附件组、
// 拖入文件时的遮罩，以及待发和已发图片共用的窗口内放大预览。沿用现有的灰色组件，不新增配色。
// 文件卡（待发和已发同一个样子）：左边一块灰底的类型方块（ZIP、MD、CSV…；上传中转圈、失败是警示图标），右边两行——
// 文件名（太长时中间省略，扩展名一直看得见）、类型和大小（失败时是原因）。已发的 ZIP 点一下保存原文件到这台电脑。
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { html, Icon, Spinner } from "./ui.js";
import { createStore, toast, useStore } from "../lib/store.js";
import { fmtSize } from "../lib/format.js";
import { api, ApiError } from "../lib/api.js";
import { reasonText, removeItem, sentImageUrl } from "../lib/attachments.js";
import { t } from "../lib/i18n.js";

// —— 图片放大预览：当前窗口里的一个居中遮罩，一次只看点的那一张 ——
const lightbox = createStore(null);

/**
 * 打开放大预览。先确认图片读得出来：过期或不可用时只给一句短说明，不开一个空白的大窗。
 * from：点的那个缩略图（关闭后焦点回到它）；fallback：它已经不在时焦点回到的地方（输入框）。
 */
export function openImage(src, from, fallback) {
  if (!src) return toast(t("attach.unavailable"), "err");
  const probe = new Image();
  probe.onload = () => lightbox.set({ src, from, fallback, nw: probe.naturalWidth, nh: probe.naturalHeight });
  probe.onerror = () => toast(t("attach.unavailable"), "err");
  probe.src = src;
}

export function ImageLightbox() {
  const v = useStore(lightbox);
  const [zoom, setZoom] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [, relayout] = useState(0);
  const dialog = useRef(null);
  const stage = useRef(null);
  const img = useRef(null);
  const closeBtn = useRef(null);
  const drag = useRef(null);
  const down = useRef(null);

  const close = () => {
    const cur = lightbox.get();
    if (!cur) return;
    lightbox.set(null);
    const back = cur.from && document.contains(cur.from) ? cur.from : cur.fallback;
    back?.focus?.({ preventScroll: true });
  };
  // 每次打开都回到「适应」
  useLayoutEffect(() => {
    setZoom(false);
    setPos({ x: 0, y: 0 });
    // 焦点进到这一层（图片上）：回车切换大小，Esc 关闭
    if (v) img.current?.focus({ preventScroll: true });
  }, [v && v.src]);
  // 窗口大小变了：重新约束（适应模式由样式完成，100% 模式下把平移收回边界内）
  useEffect(() => {
    if (!v) return;
    const on = () => relayout((n) => n + 1);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [!!v]);
  // 键盘只在这一层里起作用：Esc 关闭（不停止任务），Delete / Backspace 不碰底下的文字和附件，Tab 留在层里
  useEffect(() => {
    if (!v) return;
    const key = (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        return close();
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        return e.stopImmediatePropagation();
      }
      if (e.key === "Tab") {
        e.preventDefault();
        e.stopImmediatePropagation();
        (document.activeElement === img.current ? closeBtn.current : img.current)?.focus();
        return;
      }
      if (e.key === "Enter" && document.activeElement === img.current) {
        e.preventDefault();
        e.stopImmediatePropagation();
        toggle();
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [!!v, zoom]);

  // 100% 时能平移多远：图片超出舞台的那一半
  const bounds = () => {
    const s = stage.current;
    if (!s || !v) return { x: 0, y: 0 };
    return { x: Math.max(0, (v.nw - s.clientWidth) / 2), y: Math.max(0, (v.nh - s.clientHeight) / 2) };
  };
  const clampPos = (p) => {
    const b = bounds();
    return { x: Math.max(-b.x, Math.min(b.x, p.x)), y: Math.max(-b.y, Math.min(b.y, p.y)) };
  };
  useLayoutEffect(() => {
    if (!zoom) return;
    const c = clampPos(pos);
    if (c.x !== pos.x || c.y !== pos.y) setPos(c);
  });
  const toggle = () => {
    setPos({ x: 0, y: 0 });
    setZoom((z) => !z);
  };
  if (!v) return null;

  const onPointerDown = (e) => {
    if (!zoom || e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, at: pos };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (d) setPos(clampPos({ x: d.at.x + e.clientX - d.x, y: d.at.y + e.clientY - d.y }));
  };
  const onPointerUp = () => (drag.current = null);
  // 只有按下和松开都在遮罩上才算点了遮罩：在图片里按下、拖到遮罩松开不关闭
  const backdropDown = (e) => (down.current = e.target === e.currentTarget ? e.currentTarget : null);
  const backdropUp = (e) => {
    if (down.current && e.target === e.currentTarget) close();
    down.current = null;
  };
  return html`<div class="att-lightbox" ref=${dialog} role="dialog" aria-modal="true" aria-label=${t("attach.previewLabel")} onPointerDown=${backdropDown} onClick=${backdropUp}>
    <div class=${`att-lightbox-panel${zoom ? " zoom" : ""}`}>
      <button type="button" class="att-lightbox-close" ref=${closeBtn} aria-label=${t("attach.closePreview")} onClick=${close}><${Icon} name="close" size="md" /></button>
      <div class="att-lightbox-stage" ref=${stage}>
        <img ref=${img} src=${v.src} alt="" tabindex="0" draggable=${false} width=${zoom ? v.nw : undefined} height=${zoom ? v.nh : undefined}
          style=${zoom ? `transform: translate(${pos.x}px, ${pos.y}px)` : undefined}
          onDblClick=${toggle} onPointerDown=${onPointerDown} onPointerMove=${onPointerMove} onPointerUp=${onPointerUp} onPointerCancel=${onPointerUp} />
      </div>
    </div>
  </div>`;
}

// —— 待发区 ——

/** 同名的普通文件加一个辅助序号（不覆盖、不合并）：第二份起显示成「名字 (2)」 */
function withSerial(items) {
  const seen = new Map();
  return items.map((a) => {
    if (a.kind === "image") return a;
    const n = (seen.get(a.name) || 0) + 1;
    seen.set(a.name, n);
    return n > 1 ? { ...a, label: `${a.name} (${n})`, serial: n } : { ...a, label: a.name };
  });
}

/** 文件名拆成「前面一段 + 扩展名」：太长时只省略前面那段，扩展名一直看得见 */
function splitName(name) {
  const i = name.lastIndexOf(".");
  return i > 0 && name.length - i <= 9 ? [name.slice(0, i), name.slice(i)] : [name, ""];
}
/** 类型方块上的字：扩展名大写，最多 4 个字母 */
const typeTag = (a) => (a.kind === "zip" ? "ZIP" : (a.name.split(".").pop() || "").slice(0, 4).toUpperCase() || "TXT");
/** 第二行：类型和大小（ZIP 写明是压缩包） */
const typeLine = (a) => (a.kind === "zip" ? t("attach.typeZip", { size: fmtSize(a.size) }) : t("attach.typeFile", { type: typeTag(a), size: fmtSize(a.size) }));

/** 一张文件卡（待发和已发共用）：status 是 ready / processing / failed / expired */
function FileFace({ a, label, why, status, save }) {
  const [stem, ext] = splitName(label);
  return html`<span class="att-type" data-kind=${a.kind} aria-hidden="true">
      ${status === "processing" ? html`<${Spinner} />` : status === "failed" || status === "expired" ? html`<${Icon} name="warning" size="sm" />` : html`<span class="tag">${typeTag(a)}</span>`}
      ${save && status === "ready" && html`<${Icon} name="download" size="sm" class="att-save-ic" />`}
    </span>
    <span class="att-text">
      <span class="att-name"><span class="stem">${stem}</span>${ext && html`<span class="ext">${ext}</span>`}</span>
      <span class="att-meta">${why || (status === "processing" ? t("attach.uploading") : typeLine(a))}</span>
    </span>`;
}

/**
 * 输入框里文字上方的待发区。按加入顺序排，窄了换行，最多两行、再多在区内滚动。
 * 键盘：Tab 能到每个附件和它的移除钮；附件聚焦时 Delete / Backspace 移除这一个（长按不连删），焦点回到输入框。
 */
export function AttachmentTray({ botId, items, taRef, refs = false }) {
  if (!items.length) return null;
  let image = 0;
  const cardKey = (a) => (e) => {
    if (e.isComposing || e.keyCode === 229 || e.repeat) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      removeItem(botId, a.cid);
      taRef.current?.focus();
    } else if ((e.key === "Enter" || e.key === " ") && a.kind === "image") {
      e.preventDefault();
      open(a, e.currentTarget);
    }
  };
  const open = (a, el) => {
    if (a.status !== "ready") return toast(a.status === "processing" ? t("attach.processing") : t("attach.unavailable"), a.status === "processing" ? "ok" : "err");
    openImage(a.url, el, taRef.current);
  };
  const remove = (a) => (e) => {
    e.stopPropagation();
    removeItem(botId, a.cid);
    taRef.current?.focus();
  };
  return html`<div class="att-tray" role="list" aria-label=${t("attach.trayLabel")}>
    ${withSerial(items).map((a) => {
      const bad = a.status === "failed" || a.status === "expired";
      const why = bad ? reasonText(a.status === "expired" ? "expired" : a.error || "unreadable") : "";
      const x = html`<button type="button" class="att-x" aria-label=${t("attach.remove")} onClick=${remove(a)}><${Icon} name="close" size="xs" /></button>`;
      if (a.kind === "image") {
        const n = ++image;
        // 用作生图参考且通过校验：按当前显示顺序标「参考1／参考2」（删掉一张后重新编号）
        const tag = refs && a.status === "ready" ? t("attach.refLabel", { n }) : "";
        return html`<div class=${`att att-image ${a.status}`} role="listitem" key=${a.cid}>
          <div class="att-open" role="button" tabindex="0" data-att=${a.cid} aria-disabled=${a.status !== "ready"} title=${why || undefined}
            aria-label=${a.status === "ready" ? (tag ? `${tag}, ${t("attach.imageName", { n })}` : t("attach.imageName", { n })) : why || t("attach.processing")} onClick=${(e) => open(a, e.currentTarget)} onKeyDown=${cardKey(a)}>
            ${a.status === "ready" ? html`<img src=${a.url} alt="" draggable=${false} />` : bad ? html`<${Icon} name="warning" size="md" />` : html`<${Spinner} />`}
            ${tag && html`<span class="att-ref" aria-hidden="true">${tag}</span>`}
          </div>
          ${x}
        </div>`;
      }
      return html`<div class=${`att att-file ${a.status}`} role="listitem" key=${a.cid} data-kind=${a.kind}>
        <div class="att-card" tabindex="0" data-att=${a.cid} title=${why ? `${a.label}\n${why}` : a.label} aria-label=${`${a.label}, ${why || (a.status === "ready" ? typeLine(a) : t("attach.uploading"))}`} onKeyDown=${cardKey(a)}>
          <${FileFace} a=${a} label=${a.label} why=${why} status=${a.status} />
        </div>
        ${x}
      </div>`;
    })}
  </div>`;
}

/** 空输入框里第一下 Backspace：只把焦点移到最后一个附件（第二下才移除） */
export function focusLastAttachment(root) {
  const cards = root?.querySelectorAll("[data-att]");
  const last = cards?.[cards.length - 1];
  last?.focus();
  last?.scrollIntoView?.({ block: "nearest" });
  return !!last;
}

// —— 已发消息里的附件 ——

/**
 * 已发消息的附件组：整组右对齐，按添加顺序从左到右、再换行；图片只有缩略图（点击放大，和待发的是同一个遮罩），
 * 文件是浅白圆角卡（文档图标、文件名、大小）。没有 ×、状态字和下载按钮。
 */
export function SentAttachments({ botId, list, fallback, onLoad, canSave }) {
  if (!list?.length) return null;
  let image = 0;
  return html`<div class="msg-atts" role="group" aria-label=${t("attach.sentLabel")}>
    ${withSerial(list).map((a) => (a.kind === "image"
      ? html`<${SentImage} key=${a.id} src=${sentImageUrl(botId, a)} n=${++image} refN=${a.ref} fallback=${fallback} onLoad=${onLoad} w=${a.width} h=${a.height} />`
      : a.kind === "zip"
        ? html`<${SentZip} key=${a.id} botId=${botId} a=${a} canSave=${canSave} />`
        : html`<div class="att att-file sent" key=${a.id} title=${a.label} data-kind=${a.kind}><div class="att-card"><${FileFace} a=${a} label=${a.label} status="ready" /></div></div>`))}
  </div>`;
}

/**
 * 已发的 ZIP：点一下保存原文件到当前操作的这台电脑（桌面版弹系统「另存为」，网页里下载）；不解压、不执行、不打开资料面板。
 * 到期了、没有权限只给一句短提示，卡片变成「已过期」。
 */
function SentZip({ botId, a, canSave }) {
  const [gone, setGone] = useState(false);
  const url = `/amb/api/bots/${encodeURIComponent(botId)}/attachments/${encodeURIComponent(a.id)}`;
  const save = async () => {
    try {
      if (canSave) {
        const r = await api(`/bots/${encodeURIComponent(botId)}/attachments/${encodeURIComponent(a.id)}/save`, { method: "POST", body: {} });
        if (!r?.canceled && r?.folder) toast(t("attach.savedTo", { folder: r.folder }));
        return;
      }
      // 网页：先取到内容再交给浏览器保存（到期、无权时给一句提示，不下载一个错误页）
      const res = await fetch(`${url}/download`);
      if (!res.ok) throw new ApiError("", res.status, await res.json().catch(() => ({})));
      const href = URL.createObjectURL(await res.blob());
      const link = Object.assign(document.createElement("a"), { href, download: a.name });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 30_000);
    } catch (e) {
      const expired = e instanceof ApiError && (e.status === 410 || e.data?.code === "expired");
      if (expired) setGone(true);
      toast(expired ? t("attach.zipExpired") : t("attach.zipNoAccess"), "err");
    }
  };
  const status = gone ? "expired" : "ready";
  return html`<div class=${`att att-file sent ${status}`} data-kind="zip">
    <button type="button" class="att-card att-save" title=${`${a.label}\n${canSave ? t("attach.saveZip") : t("attach.downloadZip")}`}
      aria-label=${`${a.label}, ${canSave ? t("attach.saveZip") : t("attach.downloadZip")}`} onClick=${save}>
      <${FileFace} a=${a} label=${a.label} why=${gone ? t("attach.zipExpired") : ""} status=${status} save />
    </button>
  </div>`;
}

function SentImage({ src, n, refN, fallback, onLoad, w, h }) {
  const [gone, setGone] = useState(false);
  // 发出时用作生图参考的：序号随消息存下，之后换选择器、改草稿都不变
  const tag = refN ? t("attach.refLabel", { n: refN }) : "";
  if (gone) return html`<div class="att att-image sent expired" role="img" aria-label=${tag ? `${tag}, ${t("attach.unavailable")}` : t("attach.unavailable")} title=${t("attach.unavailable")}><div class="att-open"><${Icon} name="photo" size="md" />${tag && html`<span class="att-ref" aria-hidden="true">${tag}</span>`}</div></div>`;
  return html`<div class="att att-image sent ready">
    <button type="button" class="att-open" aria-label=${tag ? `${tag}, ${t("attach.imageName", { n })}` : t("attach.imageName", { n })} onClick=${(e) => openImage(src, e.currentTarget, fallback?.current)}>
      <img src=${src} alt="" loading="lazy" draggable=${false} style=${w && h ? `aspect-ratio: ${w} / ${h}` : undefined} onLoad=${onLoad} onError=${() => setGone(true)} />
      ${tag && html`<span class="att-ref" aria-hidden="true">${tag}</span>`}
    </button>
  </div>`;
}

/** 生图消息下面一行小字：当时实际用的型号和用途（不随当前选择器变化） */
export function GenerationNote({ generation }) {
  if (!generation?.model) return null;
  return html`<div class="msg-gen">${t(generation.mode === "reference" ? "attach.refSentVia" : "attach.genSentVia", { model: generation.model })}</div>`;
}

// —— 拖入遮罩 ——

/** 真实文件拖进对话主区时的一层遮罩：只说松开添加、拖出取消；输入框同时高亮成落点 */
export function DropOverlay({ limits }) {
  return html`<div class="att-drop" aria-hidden="true">
    <div class="att-drop-box">
      <span class="att-drop-badge">${t("attach.dropBadge")}</span>
      <b>${t("attach.dropTitle")}</b>
      <span class="att-drop-sub">${t("attach.dropCancel")}</span>
      <span class="att-drop-sub">${t("attach.limitCount", { max: limits?.maxItems ?? 8, images: limits?.maxImages ?? 4 })}</span>
      <span class="att-drop-sub">${t("attach.limitSize")}</span>
    </div>
  </div>`;
}
