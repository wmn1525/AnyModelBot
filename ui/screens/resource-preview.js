// 右侧面板的「预览」页签（PRD 2026-11-15 右侧预览面板）：从上到下是文件标签行 → 文件信息行 → 内容区。
// 标签由 main.js 按范围记（每个机器人一套，群聊、历史消息搜索结果各一套；重启后清空），这里只管显示和操作：
// - 标签行：类型图标 + 文件名，最多 12 个；「+」列出本对话在预览中打开过的文件；右键菜单；双击空白处放大。
// - 信息行：文件名（中间省略）、在访达中显示、辅助信息、类型专属控件、视图切换、「⋯」（宽度不够时专属控件先收进「⋯」）。
// - 内容区：Markdown、代码 / 纯文本、JSON、CSV / TSV、HTML、图片、PDF、网址，以及加载中、失败、不在了、不支持、空文件、过大这些状态。
// - 自动刷新：订阅已打开文件的变化（/preview-watch），当前标签保持位置重新读取，后台标签切过去时再读；选中文字时先不刷新。
// 每个标签读到的内容、滚动位置、排序 / 折叠 / 缩放等放在模块级的 entries 里，换标签、切到别的页签再回来都还在。
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { html, Button, Icon, IconButton, Menu, Popover, Seg, Skeleton } from "../components/ui.js";
import { Markdown } from "../components/markdown.js";
import { CodeView, JsonView, scrollToLine, topLine } from "../components/code-view.js";
import { CsvView, tableModel, visibleRows, MAX_ROWS } from "../components/csv-view.js";
import { ImageView } from "../components/image-view.js";
import { api, watchPreview } from "../lib/api.js";
import { createStore, useStore } from "../lib/store.js";
import { fmtSize, fmtDay } from "../lib/format.js";
import { fmtNum, t } from "../lib/i18n.js";
import {
  activeResource, appFileResource, closeOtherResources, emptyResources, fileResource, openResource, removeResource,
  resourceFileAction, resourceFileUrl, resourcePreviewPath, websiteResource,
} from "../lib/resource-preview.js";
import {
  countLines, defaultCollapsed, deliveredWhen, detectDelimiter, extOf, headingLines, jsonErrorLine, jsonLines, langLabel, langOf,
  parseCsv, previewType, splitName, toCsv, typeIcon, wrapDefault,
} from "../lib/preview-types.js";
import { previewPrefs, setView, setWrap, setZoom, viewOf, viewsOf, wrapOf, zoomOf, ZOOMABLE, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from "../lib/preview-prefs.js";

const isMac = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform || "");
const isWin = /Win/.test(globalThis.navigator?.platform || "");
const mod = (e) => (isMac ? e.metaKey : e.ctrlKey);
const revealLabel = () => t(isMac ? "info.preview.revealMac" : isWin ? "info.preview.revealWin" : "chat.file.reveal");
const TEXT_LIMIT = 2 * 1024 * 1024;
const BIG_CODE = 500 * 1024;
const SKELETON_AFTER = 300;
const SLOW_AFTER = 12_000;
const REFRESH_GAP = 2000;
const TOAST_GAP = 30_000;
const JUST_UPDATED = 60_000;

// —— 面板底部的轻提示（PRD：已更新到最新内容约 2 秒、首次放大约 3 秒；复制、另存为、下载的结果也在这里） ——
const pvToasts = createStore([]);
let toastSeq = 0;
export function previewToast(text, kind = "ok", ms = 2500) {
  const id = ++toastSeq;
  pvToasts.set((list) => [...list.filter((x) => x.text !== text).slice(-2), { id, text, kind }]);
  setTimeout(() => pvToasts.set((list) => list.filter((x) => x.id !== id)), kind === "err" ? Math.max(ms, 4000) : ms);
}
function PanelToasts() {
  const list = useStore(pvToasts);
  return html`<div class="toasts pv-toasts" role="status" aria-live="polite">${list.map((it) => html`<div key=${it.id} class=${`toast ${it.kind}`}><span>${it.text}</span></div>`)}</div>`;
}

// —— 焦点在不在预览面板（⌘W / Ctrl+W 只在这时关标签）——
// 点在预览的正文、表格上焦点不会动（document.activeElement 还是 body），所以记下最后一次按下鼠标、焦点移动落在哪；
// 从面板里打开的菜单挂在 <body> 下，在菜单里点、焦点进菜单不改这个记录
let lastInPreview = false;
const inPopLayer = (el) => !!el?.closest?.(".pop");
function markWhere(e) {
  if (inPopLayer(e.target)) return;
  lastInPreview = !!e.target?.closest?.(".preview-pane");
}
if (typeof document !== "undefined") {
  document.addEventListener("pointerdown", markWhere, true);
  document.addEventListener("focusin", markWhere, true);
}
/** 焦点在预览面板里：有明确焦点的元素时看它在不在面板里（面板里的 iframe 也算），否则看最后一次点在哪 */
export function previewFocused() {
  const pane = document.querySelector(".preview-pane");
  if (!pane) return false;
  const a = document.activeElement;
  if (a && a !== document.body && a !== document.documentElement && !inPopLayer(a)) return pane.contains(a);
  return lastInPreview;
}

// —— 每个标签的运行状态 ——
const entries = new Map();
/** 已经记过「在预览里打开过」的标签：id → rev（重新打开时 rev + 1，再记一次） */
const noted = new Map();
const bus = createStore(0);
const touch = () => bus.set((n) => n + 1);
export function entryOf(id) {
  let e = entries.get(id);
  if (!e) {
    e = { id, view: {}, status: "idle", seq: 0 };
    entries.set(id, e);
    if (entries.size > 60) for (const [k, v] of entries) if (v !== e && !v.pinned) { entries.delete(k); if (entries.size <= 48) break; }
  }
  return e;
}

/** 读一次。silent：已经有内容时不显示加载中（自动刷新、重新加载），失败时保留旧内容 */
async function load(item, { silent = false } = {}) {
  const e = entryOf(item.id);
  const seq = ++e.seq;
  if (!silent || !e.data) {
    e.status = "loading";
    e.since = Date.now();
  }
  e.stale = false;
  e.pending = false;
  touch();
  try {
    const data = item.type === "website" ? { kind: "website", url: item.url }
      : item.type === "webimage" ? { kind: "image", url: item.url }
      : await api(resourcePreviewPath(item, e.encoding || ""));
    if (e.seq !== seq) return false;
    e.data = data;
    e.status = "ready";
    e.gone = false;
    e.failed = false;
    e.error = "";
    e.loadedAt = Date.now();
    return true;
  } catch (err) {
    if (e.seq !== seq) return false;
    if (err.status === 404) {
      e.gone = true;
      e.status = "gone";
    } else if (silent && e.data) {
      e.failed = true;
      e.status = "ready";
    } else {
      e.status = "error";
      e.error = err.message;
    }
    return false;
  } finally {
    if (e.seq === seq) touch();
  }
}

/** 选中的文字在这一块里（自动刷新先不打断） */
function selecting(root) {
  const sel = globalThis.getSelection?.();
  return !!(sel && !sel.isCollapsed && root && sel.anchorNode && root.contains(sel.anchorNode));
}

// —— 复制、打开、另存为 ——
async function writeText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    if (!ok) throw new Error("copy");
  }
}
const copyText = (text, done = "info.preview.copied") => writeText(text).then(() => previewToast(t(done)), () => previewToast(t("info.preview.copyFailed"), "err"));
export const canCopyImage = () => typeof ClipboardItem !== "undefined" && !!navigator.clipboard?.write && globalThis.isSecureContext !== false;
async function copyImage(url) {
  try {
    const blob = await fetch(url).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))));
    let png = blob;
    if (blob.type !== "image/png") {
      const img = new Image();
      const src = URL.createObjectURL(blob);
      img.src = src;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || 1;
      canvas.height = img.naturalHeight || 1;
      canvas.getContext("2d").drawImage(img, 0, 0);
      URL.revokeObjectURL(src);
      png = await new Promise((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error("png"))), "image/png"));
    }
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    previewToast(t("info.preview.copied"));
  } catch {
    previewToast(t("info.preview.copyFailed"), "err");
  }
}
function desktopAction(item, action) {
  const req = resourceFileAction(item, action);
  return api(req.path, { method: "POST", body: req.body });
}
const openSystem = (item) => desktopAction(item, "open").then((r) => r?.revealed && previewToast(t(isMac ? "info.preview.scriptRevealedMac" : isWin ? "info.preview.scriptRevealedWin" : "info.preview.scriptRevealed"), "ok", 4000), (e) => previewToast(e.message, "err"));
const openBrowser = (item) => desktopAction(item, "browser").catch((e) => previewToast(e.message, "err"));
const reveal = (item) => desktopAction(item, "reveal").catch((e) => previewToast(e.message, "err"));
const saveAs = (item) => desktopAction(item, "save").then((r) => !r?.canceled && previewToast(t("info.preview.savedTo", { folder: r.folder })), () => previewToast(t("info.preview.saveFailed"), "err"));
function download(item) {
  const a = document.createElement("a");
  a.href = `${resourceFileUrl(item)}&download=1`;
  a.download = item.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  previewToast(t("info.preview.downloading", { name: item.name }));
}
const openUrl = (url) => window.open(url, "_blank", "noopener,noreferrer");
/** 带数量的文案：count 选单复数，n 是按语言分组的数字 */
const countText = (key, count) => t(key, { count, n: fmtNum(count) });

// —— 小件 ——
function useTick(ms, on = true) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!on) return;
    const timer = setTimeout(() => set((n) => n + 1), ms);
    return () => clearTimeout(timer);
  });
}

/** 文件名：过长时中间省略，保留扩展名 */
function FileName({ name, title, off }) {
  const { head, tail } = splitName(name);
  return html`<span class=${`pv-name${off ? " off" : ""}`} title=${title}><span class="pv-name-head">${head}</span>${tail && html`<span class="pv-name-tail">${tail}</span>`}</span>`;
}

function WebsiteForm() {
  const [url, setUrl] = useState("");
  const [invalid, setInvalid] = useState(false);
  return html`<form class="preview-address" noValidate onSubmit=${(e) => {
    e.preventDefault();
    const resource = websiteResource(url);
    setInvalid(!resource);
    if (resource) { openResource(resource); setUrl(""); }
  }}>
    <label for="preview-address">${t("info.preview.address")}</label>
    <div class="preview-address-row"><input id="preview-address" class="field" type="url" inputMode="url" autoCapitalize="none" spellCheck=${false} required placeholder="https://" value=${url} aria-invalid=${invalid || undefined} aria-describedby=${invalid ? "preview-address-error" : undefined}
      onInput=${(e) => { setUrl(e.currentTarget.value); setInvalid(false); }} /><${Button} type="submit">${t("common.open")}<//></div>
    ${invalid && html`<p id="preview-address-error" class="preview-address-error" role="alert">${t("info.preview.invalidUrl")}</p>`}
  </form>`;
}

const whenLabel = (at) => {
  const [kind, value] = deliveredWhen(at);
  return kind === "time" ? value : kind === "yesterday" ? t("info.preview.yesterday") : fmtDay(at);
};
const tabType = (item) => (item.type === "website" ? "website" : item.type === "webimage" ? "webimage" : previewType(item.name));
const fileId = (f) => JSON.stringify([f.conv, f.path]);

/** 「+」菜单 / 「查看全部」：本对话在预览中打开过的全部文件，最近的在上；底部固定「关闭其他标签页」「关闭全部」 */
function FilesMenu({ anchor, files, state, desktop, onClose, onSelect, onCloseOthers, onCloseAll }) {
  const list = files || [];
  const openIds = new Set(state.items.map((x) => x.id));
  const pick = (f) => {
    onClose();
    if (openIds.has(fileId(f))) onSelect(fileId(f));
    else openResource(fileResource(f, f.conv, desktop));
  };
  const [sel, setSel] = useState(-1);
  const usable = list.map((f, i) => (f.gone ? -1 : i)).filter((i) => i >= 0);
  const onKey = (e) => {
    const k = usable.indexOf(sel);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setSel(usable[(k + (e.key === "ArrowDown" ? 1 : -1) + usable.length) % usable.length] ?? -1);
    } else if (e.key === "Enter" && sel >= 0) {
      e.preventDefault();
      pick(list[sel]);
    }
  };
  return html`<${Popover} class="menu-pop pv-files" anchor=${anchor} onClose=${onClose} width=${300} align="right" maxHeight=${440} label=${t("info.preview.files.title")}>
    <div class="pv-files-title t-label">${t("info.preview.files.title")}</div>
    <ul role="menu" tabindex="-1" data-autofocus onKeyDown=${onKey} style="outline:none">
      ${!files && html`<li class="pv-files-empty"><${Skeleton} w="60%" /></li>`}
      ${files && !list.length && html`<li class="pv-files-empty">${t("info.preview.files.empty")}</li>`}
      ${list.map((f, i) => {
        const open = openIds.has(fileId(f));
        return html`<li key=${fileId(f)} role="menuitem" aria-disabled=${!!f.gone} class=${[sel === i ? "sel" : "", f.gone ? "disabled gone" : ""].join(" ")}
          title=${f.gone ? t("info.preview.files.gone") : f.name} onPointerMove=${() => !f.gone && setSel(i)} onClick=${() => !f.gone && pick(f)}>
          <span class="lead" aria-hidden="true"><${Icon} name=${typeIcon(previewType(f.name))} size="sm" /></span>
          <span class="v">${f.name}</span>
          <span class="pv-files-aside">${open ? html`<${Icon} name="check" size="sm" />` : f.gone ? t("info.preview.files.gone") : whenLabel(f.at)}</span>
        </li>`;
      })}
    </ul>
    <div class="pv-files-foot">
      <button type="button" disabled=${state.items.length < 2} onClick=${() => { onClose(); onCloseOthers(); }}><${Icon} name="close" size="sm" />${t("info.preview.closeOthers")}</button>
      <button type="button" disabled=${!state.items.length} onClick=${() => { onClose(); onCloseAll(); }}><${Icon} name="close" size="sm" />${t("info.preview.closeAll")}</button>
    </div>
  <//>`;
}

/** 没有标签时：一句说明、本对话最近在预览中打开过的 3 个文件（右侧是打开时间）、「网站地址」 */
function EmptyState({ files, state, desktop, onSelect }) {
  const [all, setAll] = useState(null);
  const recent = (files || []).filter((f) => !f.gone).slice(0, 3);
  return html`<div class="preview-empty" tabindex="-1">
    <p>${t("info.preview.empty")}</p>
    ${recent.length > 0 && html`<section class="pv-recent" aria-label=${t("info.preview.files.title")}>
      <h3 class="t-label">${t("info.preview.files.title")}</h3>
      ${recent.map((f) => html`<button type="button" key=${fileId(f)} class="pv-recent-row" onClick=${() => openResource(fileResource(f, f.conv, desktop))}>
        <${Icon} name=${typeIcon(previewType(f.name))} size="sm" /><span class="v">${f.name}</span><span class="hint num">${whenLabel(f.at)}</span>
      </button>`)}
      ${files.length > 3 && html`<button type="button" class="text pv-recent-all" onClick=${(e) => setAll(e.currentTarget)}>${countText("info.preview.files.viewAll", files.length)}</button>`}
    </section>`}
    <${WebsiteForm} />
    ${all && html`<${FilesMenu} anchor=${all} files=${files} state=${state} desktop=${desktop} onClose=${() => setAll(null)} onSelect=${onSelect} onCloseOthers=${() => {}} onCloseAll=${() => {}} />`}
  </div>`;
}

/** 标签行：滑动、右端渐隐、「+」固定在最右；切到看不见的标签时滚到能看见 */
function TabRow({ state, files, desktop, onSelect, onCloseTab, onCloseOthers, onCloseAll, onToggleExpand }) {
  const strip = useRef(null);
  const [fade, setFade] = useState("");
  const [plus, setPlus] = useState(null);
  const [ctx, setCtx] = useState(null);
  useStore(bus);
  const measure = () => {
    const el = strip.current;
    if (!el) return;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    const left = el.scrollLeft > 1;
    setFade(`${left ? " fade-l" : ""}${right ? " fade-r" : ""}`);
  };
  useLayoutEffect(() => {
    strip.current?.querySelector(".pv-tab.on")?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    measure();
  }, [state.active, state.items.length]);
  useLayoutEffect(() => {
    const el = strip.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const cur = activeResource(state);
  const onKey = (e) => {
    const i = state.items.findIndex((x) => x.id === cur?.id);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: state.items.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const it = state.items[(next + state.items.length) % state.items.length];
    onSelect(it.id);
    requestAnimationFrame(() => strip.current?.querySelector(`[data-tab="${CSS.escape(it.id)}"]`)?.focus());
  };
  const ctxItems = (it) => {
    const web = it.type === "website" || it.type === "webimage";
    return [
      { label: t("info.preview.close"), icon: "close", onSelect: () => onCloseTab(it.id) },
      { label: t("info.preview.closeOthers"), icon: "close", disabled: state.items.length < 2, onSelect: () => onCloseOthers(it.id) },
      ...(desktop ? [
        { label: t(it.type === "website" ? "info.preview.copyUrl" : it.type === "webimage" ? "info.preview.copyImageUrl" : "info.preview.copyPath"), icon: "link",
          onSelect: () => (web ? copyText(it.url) : copyText(entryOf(it.id).data?.path || it.path, "info.preview.pathCopied")) },
        ...(web ? [] : [{ label: revealLabel(), icon: "folder", onSelect: () => reveal(it) }]),
      ] : []),
    ];
  };
  // 双击标签行空白处（标签之间、「+」右边）放大 / 退出
  return html`<div class="pv-tabs" onDblClick=${(e) => (e.target === e.currentTarget || e.target === strip.current) && onToggleExpand?.()}>
    <div class=${`pv-tab-strip${fade}`} ref=${strip} role="tablist" aria-label=${t("info.preview.tabsLabel")} onScroll=${measure} onKeyDown=${onKey}>
      ${state.items.map((it) => {
        const on = it.id === cur?.id;
        const gone = entryOf(it.id).gone;
        return html`<div key=${it.id} class=${`pv-tab${on ? " on" : ""}${gone ? " gone" : ""}`} title=${it.type === "file" ? it.path : it.url}
          onContextMenu=${(e) => { e.preventDefault(); setCtx({ it, at: { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY } }); }}
          onAuxClick=${(e) => e.button === 1 && onCloseTab(it.id)}>
          <button type="button" role="tab" class="pv-tab-main" data-tab=${it.id} aria-selected=${on} tabindex=${on ? 0 : -1} onClick=${() => onSelect(it.id)}>
            <${Icon} name=${typeIcon(tabType(it))} size="sm" /><span class="pv-tab-name">${it.name}</span>
          </button>
          <button type="button" class="pv-tab-x" tabindex="-1" title=${t("info.preview.closeTab")} aria-label=${t("info.preview.closeNamed", { name: it.name })} onClick=${() => onCloseTab(it.id)}><${Icon} name="close" size="xs" /></button>
        </div>`;
      })}
    </div>
    <${IconButton} icon="plus" class="pv-plus" label=${t("info.preview.files.open")} aria-haspopup="menu" aria-expanded=${!!plus} onClick=${(e) => setPlus(plus ? null : e.currentTarget)} />
    ${plus && html`<${FilesMenu} anchor=${plus} files=${files} state=${state} desktop=${desktop} onClose=${() => setPlus(null)} onSelect=${onSelect}
      onCloseOthers=${() => cur && onCloseOthers(cur.id)} onCloseAll=${onCloseAll} />`}
    ${ctx && html`<${Menu} anchor=${ctx.at} width=${240} label=${ctx.it.name} items=${ctxItems(ctx.it)} onClose=${() => setCtx(null)} />`}
  </div>`;
}

/** 内容区中间的状态：图标、标题、说明、按钮（第一个是主按钮） */
function State({ icon, title, desc, actions = [] }) {
  return html`<div class="pv-state" role="status">
    ${icon && html`<${Icon} name=${icon} size="xl" />`}
    <h3>${title}</h3>
    ${desc && html`<p>${desc}</p>`}
    ${actions.length > 0 && html`<div class="pv-state-actions">${actions.map((a, i) => html`<${Button} size="sm" variant=${i === 0 ? "primary" : undefined} onClick=${a.run}>${a.label}<//>`)}</div>`}
  </div>`;
}

function Loading({ since, onReload }) {
  const elapsed = Date.now() - (since || Date.now());
  useTick(elapsed < SKELETON_AFTER ? SKELETON_AFTER - elapsed : SLOW_AFTER - elapsed, elapsed < SLOW_AFTER);
  if (elapsed < SKELETON_AFTER) return html`<div class="pv-loading" aria-busy="true"></div>`;
  return html`<div class="pv-loading" aria-busy="true" role="status" aria-label=${t("common.loading")}>
    <div class="pv-skel">${["40%", "86%", "74%", "80%", "30%", "", "62%", "78%", "54%"].map((w) => (w ? html`<${Skeleton} w=${w} />` : html`<span class="pv-skel-gap"></span>`))}</div>
    ${elapsed >= SLOW_AFTER && html`<div class="pv-slow"><span>${t("info.preview.slow")}</span><${Button} size="sm" onClick=${onReload}>${t("info.preview.reload")}<//></div>`}
  </div>`;
}

/** 记住每个视图的滚动位置（换标签、切视图再回来），挂上时恢复 */
function useScrollMemory(ref, e, key) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const saved = e.view.scroll?.[key];
    const anchor = e.view.anchor;
    if (anchor && anchor.view === key) {
      e.view.anchor = null;
      requestAnimationFrame(() => anchor.apply(ref.current));
    } else if (saved) {
      el.scrollTop = saved.top;
      el.scrollLeft = saved.left;
      requestAnimationFrame(() => { if (ref.current) { ref.current.scrollTop = saved.top; ref.current.scrollLeft = saved.left; } });
    }
    const save = () => { e.view.scroll = { ...e.view.scroll, [key]: { top: el.scrollTop, left: el.scrollLeft } }; };
    el.addEventListener("scroll", save, { passive: true });
    return () => { save(); el.removeEventListener("scroll", save); };
  }, [key]);
}

/** Markdown 预览：正文 + 大纲（3 个及以上标题；正文区宽于 560 时右侧一列短横线，窄时由信息行的「大纲」按钮打开） */
function MarkdownDoc({ item, e, text }) {
  const ref = useRef(null);
  const [heads, setHeads] = useState([]);
  const [cur, setCur] = useState(0);
  const [wide, setWide] = useState(true);
  useScrollMemory(ref, e, "preview");
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setHeads([...el.querySelectorAll(".md-doc > [data-h]")].map((h) => ({ level: Number(h.tagName[1]), text: h.textContent, el: h })));
  }, [text]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth > 560;
      setWide(w);
      if (e.view.narrow !== !w) { e.view.narrow = !w; touch(); }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const outline = heads.filter((h) => h.level <= 4);
  const jump = (i) => {
    const h = heads[i];
    if (h && ref.current) ref.current.scrollTo({ top: h.el.offsetTop - 12, behavior: "smooth" });
  };
  e.api = { heads: outline.map((h) => ({ level: h.level, text: h.text, i: heads.indexOf(h) })), jump, cur: () => cur };
  const onScroll = () => {
    const el = ref.current;
    let k = 0;
    heads.forEach((h, i) => { if (h.el.offsetTop - 24 <= el.scrollTop) k = i; });
    if (k !== cur) setCur(k);
    e.view.headIndex = k;
  };
  const show = wide && heads.length >= 3;
  return html`<div class="pv-doc" ref=${ref} onScroll=${onScroll}>
    <div class=${`pv-doc-grid${show ? " with-outline" : ""}`}>
      <article class="preview-document selectable"><${Markdown} document text=${text} conv=${item.conv} botId=${item.botId} filePath=${item.path} canOpen=${item.canOpen} /></article>
      ${show && html`<nav class="pv-outline" aria-label=${t("info.preview.outline")}>
        <div class="pv-outline-rail" aria-hidden="true">${outline.map((h) => html`<span class=${`l${h.level}${heads.indexOf(h) === cur ? " on" : ""}`}></span>`)}</div>
        <ul class="pv-outline-list">${outline.map((h) => html`<li><button type="button" class=${`l${h.level}${heads.indexOf(h) === cur ? " on" : ""}`} onClick=${() => jump(heads.indexOf(h))}>${h.text}</button></li>`)}</ul>
      </nav>`}
    </div>
  </div>`;
}

/** 代码视图包一层：记住滚动位置 */
function Code({ e, viewKey, text, lang, plain, wrap, label }) {
  const ref = useRef(null);
  useScrollMemory(ref, e, viewKey);
  e.api = { ...e.api, codeEl: () => ref.current };
  return html`<${CodeView} text=${text} lang=${lang} plain=${plain} wrap=${wrap} scrollRef=${ref} label=${label} />`;
}

/** HTML：常驻安全说明 + 沙箱里的页面；链接由页面里的小脚本报上来（同目录的网页新开标签、外部链接用系统浏览器 / 新标签页） */
function HtmlFrame({ item, data, desktop }) {
  const frame = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [since] = useState(Date.now);
  useEffect(() => {
    const onMessage = (ev) => {
      if (ev.source !== frame.current?.contentWindow || ev.data?.amb !== "preview-link") return;
      let u;
      try { u = new URL(String(ev.data.href)); } catch { return; }
      if (u.origin === location.origin && u.pathname.startsWith("/amb/file-preview/")) {
        let rel;
        try { rel = u.pathname.split("/").slice(4).map(decodeURIComponent).join("/"); } catch { return; }
        const path = item.path.replace(/[^\\/]+$/, "") + rel;
        openResource(item.botId ? appFileResource(path, item.botId, desktop) : fileResource({ path }, item.conv, desktop));
      } else if (/^https?:$/.test(u.protocol)) openUrl(u.href);
    };
    window.addEventListener("message", onMessage);
    // 页面读同目录资源的授权一小时到期：开着就续
    const renew = setInterval(() => api("/preview-grants/renew", { method: "POST", body: { url: data.url } }).catch(() => {}), 15 * 60_000);
    return () => { window.removeEventListener("message", onMessage); clearInterval(renew); };
  }, [data.url]);
  return html`<p class="pv-note"><${Icon} name="shield" size="sm" /><span>${t("info.preview.htmlSafe")}</span></p>
    <div class="pv-frame-wrap">
      ${!loaded && html`<${Loading} since=${since} onReload=${() => { if (frame.current) frame.current.src = data.url; }} />`}
      <iframe class=${`preview-frame${loaded ? "" : " pending"}`} ref=${frame} title=${item.name} src=${data.url} sandbox="allow-scripts allow-forms" referrerpolicy="no-referrer" onLoad=${() => setLoaded(true)}></iframe>
    </div>`;
}

function Frame({ title, src, sandbox, children }) {
  const [loaded, setLoaded] = useState(false);
  const [since] = useState(Date.now);
  const ref = useRef(null);
  return html`${children}<div class="pv-frame-wrap">
    ${!loaded && html`<${Loading} since=${since} onReload=${() => { if (ref.current) ref.current.src = src; }} />`}
    <iframe class=${`preview-frame${loaded ? "" : " pending"}`} ref=${ref} title=${title} src=${src} sandbox=${sandbox} referrerpolicy="no-referrer" onLoad=${() => setLoaded(true)}></iframe>
  </div>`;
}

/** 超过 2 MB 的文本只取了前 2 MB（截到整行）；CSV 原文也只显示前 2 MB */
function headText(text) {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= TEXT_LIMIT) return { text, cut: false };
  const head = bytes.subarray(0, TEXT_LIMIT);
  const nl = head.lastIndexOf(10);
  return { text: new TextDecoder().decode(nl >= 0 ? head.subarray(0, nl + 1) : head), cut: true };
}

function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setV(value), ms);
    return () => clearTimeout(timer);
  }, [value]);
  return v;
}

/** 一个标签：信息行 + 内容区 */
function PreviewTab({ item, desktop, onCloseTab }) {
  useStore(bus);
  useStore(previewPrefs);
  const e = entryOf(item.id);
  e.pinned = true;
  useEffect(() => () => { e.pinned = false; }, [item.id]);
  const rev = useRef(item.rev);
  useEffect(() => {
    const reopened = rev.current !== item.rev;
    rev.current = item.rev;
    if (!e.data || e.stale || e.status === "error" || reopened) load(item, { silent: !!e.data });
  }, [item.id, item.rev]);
  const data = e.data;
  const kind = data?.kind;
  const type = item.type === "website" ? "website" : item.type === "webimage" ? "image" : previewType(item.name);
  const ext = extOf(item.name);
  const text = kind === "text" || kind === "html" ? data.text || "" : "";
  const isCsv = (type === "csv" || type === "tsv") && kind === "text";
  const parsed = useMemo(() => (isCsv ? parseCsv(text, type === "tsv" ? "\t" : detectDelimiter(text)) : null), [isCsv, text]);
  const header = e.view.header ?? true;
  const model = useMemo(() => (parsed && !parsed.error ? tableModel(parsed, header) : null), [parsed, header]);
  const json = useMemo(() => {
    if (type !== "json" || kind !== "text") return null;
    if (data.truncated) return { truncated: true };
    try {
      return { model: jsonLines(JSON.parse(text)) };
    } catch (err) {
      return { error: jsonErrorLine(text, err) };
    }
  }, [type, kind, text]);
  // 折叠：结构没变（节点数和深度一样）时自动刷新后照旧
  if (json?.model) {
    const sig = json.model.nodes.map((n) => `${n.depth}:${n.count}`).join(",");
    if (e.view.jsonSig !== sig) { e.view.jsonSig = sig; e.view.collapsed = defaultCollapsed(json.model); }
  }
  const lines = useMemo(() => (text ? countLines(text) : 0), [text]);
  const query = useDebounced(e.view.query || "", 200);
  const [count, setCount] = useState(0);
  // 视图
  const views = viewsOf(type);
  let view = views ? viewOf(type) : null;
  let viewLocked = false;
  if (type === "json" && (!json || !json.model)) { view = "source"; viewLocked = "hide"; }
  if (isCsv && parsed?.error) { view = "source"; viewLocked = "disable"; }
  const problem = e.status === "gone" || e.status === "error" || ["unsupported", "tooLarge", "empty"].includes(kind);
  const ready = e.status === "ready" && !problem;
  const codeShown = ready && (["code", "text", "jsonl"].includes(type) || (type === "markdown" && view === "source") || (type === "html" && view === "source") || (type === "json" && view === "source") || (isCsv && view === "source"));
  const wrapKey = type === "markdown" ? "md" : ext;
  const wrap = wrapOf(wrapKey, type === "markdown" ? true : wrapDefault(item.name));
  const zoomable = ZOOMABLE.has(type) && ready;
  const zoom = zoomable ? zoomOf(type) : 100;
  const bodyRef = useRef(null);
  const setViewKeepingPlace = (next) => {
    if (type === "markdown") {
      const heads = headingLines(text);
      if (view === "preview") {
        const k = e.view.headIndex ?? -1;
        const el = bodyRef.current?.querySelector(".pv-doc");
        const ratio = el ? el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight) : 0;
        e.view.anchor = { view: "source", apply: (code) => (heads[k] ? scrollToLine(code, heads[k].line) : code && (code.scrollTop = ratio * (code.scrollHeight - code.clientHeight))) };
      } else {
        const code = e.api?.codeEl?.();
        const top = topLine(code);
        let k = -1;
        heads.forEach((h, i) => { if (h.line <= top) k = i; });
        const ratio = code ? code.scrollTop / Math.max(1, code.scrollHeight - code.clientHeight) : 0;
        e.view.anchor = { view: "preview", apply: (doc) => {
          const h = doc?.querySelector(`.md-doc > [data-h="${k}"]`);
          if (h) doc.scrollTop = h.offsetTop - 12;
          else if (doc) doc.scrollTop = ratio * (doc.scrollHeight - doc.clientHeight);
        } };
      }
    }
    setView(type, next);
  };
  // 名字、辅助信息
  const off = e.gone;
  const local = item.type === "file";
  const nameTitle = desktop && local ? data?.path || item.path : item.name;
  const size = data?.size != null ? fmtSize(data.size) : "";
  const meta = [];
  const enc = (kind === "text" && (isCsv || data.encoding === "gbk" || e.encoding)) ? data.encoding : "";
  if (ready) {
    if (type === "website") meta.push(t("info.preview.webPage"));
    else if (type === "markdown" || type === "json" || type === "other") size && meta.push(size);
    else if (type === "code") meta.push(langLabel(item.name), countText("info.preview.lines", data.totalLines || lines));
    else if (type === "text" || type === "jsonl") meta.push(countText("info.preview.lines", data.totalLines || lines));
    else if (isCsv) model ? meta.push(countText("info.preview.csv.rows", model.total), countText("info.preview.csv.columns", model.columns)) : meta.push(countText("info.preview.lines", lines));
    else if (type === "html") meta.push(t("info.preview.webPage"), size);
    else if (type === "image") meta.push(e.view.image?.nw ? `${e.view.image.nw}×${e.view.image.nh}` : "", item.type === "file" ? size : "");
    else if (type === "pdf") meta.push(data.pages ? countText("info.preview.pages", data.pages) : "", size);
    if (kind === "text" && data.truncated && !isCsv) meta.push(t("info.preview.firstPart"));
    if (codeShown && text.length > BIG_CODE && !["text", "csv", "tsv"].includes(type) && langOf(item.name) !== "plaintext") meta.push(t("info.preview.noColor"));
  } else if (kind === "unsupported" || kind === "tooLarge" || kind === "empty") meta.push(size || (kind === "empty" ? fmtSize(0) : ""));
  const justUpdated = e.updatedAt && Date.now() - e.updatedAt < JUST_UPDATED;
  useTick(justUpdated ? JUST_UPDATED - (Date.now() - e.updatedAt) + 50 : 0, !!justUpdated);
  if (justUpdated && ready) meta.push(t("info.preview.justUpdated"));
  const shownMeta = meta.filter(Boolean);
  // 编码菜单
  const [encMenu, setEncMenu] = useState(null);
  const setEncoding = (value) => { e.encoding = value; load(item, { silent: true }); };
  const encName = (v) => ({ "utf-8": "UTF-8", "utf-8-bom": "UTF-8 BOM", gbk: "GBK" })[v] || v;
  // 类型专属控件
  const controls = [];
  const [outlineAt, setOutlineAt] = useState(null);
  if (codeShown) controls.push({ id: "wrap", inline: html`<button type="button" class=${`pv-chip${wrap ? " on" : ""}`} aria-pressed=${wrap} onClick=${() => setWrap(wrapKey, !wrap)}><${Icon} name="wrap" size="sm" />${t("info.preview.wrap")}</button>`,
    menu: { label: t("info.preview.wrap"), icon: "wrap", cur: wrap, onSelect: () => setWrap(wrapKey, !wrap) } });
  if (ready && model && view === "table") {
    const search = (autoFocus) => html`<label class="pv-search"><${Icon} name="search" size="sm" /><input type="search" placeholder=${t("info.preview.csv.search")} aria-label=${t("info.preview.csv.search")} value=${e.view.query || ""}
      autoFocus=${autoFocus} onInput=${(ev) => { e.view.query = ev.currentTarget.value; touch(); }} onKeyDown=${(ev) => ev.stopPropagation()} />
      ${String(query).trim() && html`<span class="pv-search-count num">${t("info.preview.csv.matches", { hits: fmtNum(count), total: fmtNum(model.rows.length) })}</span>`}</label>`;
    controls.push({ id: "search", inline: search(false), menu: { custom: search(true) } });
    controls.push({ id: "header", inline: html`<button type="button" class=${`pv-chip${header ? " on" : ""}`} aria-pressed=${header} onClick=${() => { e.view.header = !header; e.view.widths = null; touch(); }}>${header && html`<${Icon} name="check" size="sm" />`}${t("info.preview.csv.header")}</button>`,
      menu: { label: t("info.preview.csv.header"), icon: "table", cur: header, onSelect: () => { e.view.header = !header; e.view.widths = null; touch(); } } });
  }
  if (ready && type === "markdown" && view === "preview" && e.view.narrow && (e.api?.heads?.length || 0) >= 3) {
    controls.push({ id: "outline", inline: html`<${IconButton} icon="outline" label=${t("info.preview.outline")} aria-haspopup="menu" onClick=${(ev) => setOutlineAt(ev.currentTarget)} />`,
      menu: { label: t("info.preview.outline"), icon: "outline", onSelect: () => setOutlineAt(moreRef.current) } });
  }
  // 宽度不够：专属控件先收进「⋯」，再缩短文件名
  const row = useRef(null);
  const nameRef = useRef(null);
  const moreRef = useRef(null);
  const [collapsed, setCollapsed] = useState(false);
  const threshold = useRef(0);
  const ids = controls.map((c) => c.id).join();
  useLayoutEffect(() => {
    const el = row.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const check = () => {
      const name = nameRef.current?.querySelector(".pv-name");
      const head = name?.querySelector(".pv-name-head");
      const natural = head ? head.scrollWidth + (name.querySelector(".pv-name-tail")?.offsetWidth || 0) : 0;
      if (!collapsedRef.current) {
        if (name && controls.length && name.clientWidth + 1 < Math.min(natural, 140)) {
          threshold.current = el.clientWidth;
          setCollapsed(true);
        }
      } else if (el.clientWidth > threshold.current + 24) setCollapsed(false);
    };
    const ro = new ResizeObserver(check);
    ro.observe(el);
    check();
    return () => ro.disconnect();
  }, [ids, collapsed]);
  const collapsedRef = useRef(collapsed);
  collapsedRef.current = collapsed;
  // 「⋯」
  const copyLabel = { markdown: "copyMarkdown", code: "copyAll", text: "copyAll", jsonl: "copyAll", json: "copyJson", csv: "copyCsv", tsv: "copyCsv", html: "copySource" }[type];
  // 只显示了一部分时复制显示的那部分：文本前 2 MB、CSV 原文前 2 MB、表格前 5 万行
  const csvTable = isCsv && model && view === "table";
  const csvRaw = useMemo(() => (isCsv && !csvTable ? headText(text) : null), [isCsv, csvTable, text]);
  const partial = (kind === "text" || kind === "html") && data.truncated || (csvTable && model.total > model.rows.length) || !!csvRaw?.cut;
  const copyContent = () => {
    if (csvTable) {
      const idx = visibleRows(model, e.view.csv?.sort, query);
      return copyText(toCsv([...(header ? [model.names] : []), ...idx.map((i) => model.rows[i])]));
    }
    return copyText(csvRaw ? csvRaw.text : text);
  };
  const zoomRow = html`<div class="pv-zoom-row">
    <span class="lead" aria-hidden="true"><${Icon} name="zoomIn" size="sm" /></span><span class="grow">${t("info.preview.zoom")}</span>
    <span class="pv-zoom-ctl">
      <button type="button" aria-label=${t("info.preview.zoomOut")} title=${t("info.preview.zoomOut")} disabled=${zoom <= ZOOM_MIN} onClick=${() => setZoom(type, zoom - ZOOM_STEP)}><${Icon} name="minus" size="sm" /></button>
      <span class="num" aria-live="polite">${zoom}%</span>
      <button type="button" aria-label=${t("info.preview.zoomIn")} title=${t("info.preview.zoomIn")} disabled=${zoom >= ZOOM_MAX} onClick=${() => setZoom(type, zoom + ZOOM_STEP)}><${Icon} name="plus" size="sm" /></button>
    </span>
    <${IconButton} icon="refresh" label=${t("info.preview.zoomReset")} disabled=${zoom === 100} onClick=${() => setZoom(type, 100)} />
  </div>`;
  const reload = () => load(item, { silent: !!e.data });
  const moreItems = () => {
    const out = [];
    const sep = () => out.length && !out.at(-1).sep && out.push({ sep: true });
    if (collapsed && controls.length) { controls.forEach((c) => out.push(c.menu)); sep(); }
    if (item.type === "website" || item.type === "webimage") {
      if (!/^data:/i.test(item.url)) out.push({ label: t("info.preview.openBrowserExt"), icon: "ext", onSelect: () => openUrl(item.url) });
      out.push({ label: t(item.type === "website" ? "info.preview.copyUrl" : "info.preview.copyImageUrl"), icon: "link", onSelect: () => copyText(item.url) });
      sep();
      out.push({ label: t("info.preview.reload"), icon: "refresh", onSelect: reload }, { label: t("info.preview.closeTab"), icon: "close", onSelect: () => onCloseTab(item.id) });
      return out;
    }
    if (off) {
      if (desktop) out.push({ label: t("info.preview.copyPath"), icon: "link", onSelect: () => copyText(data?.path || item.path, "info.preview.pathCopied") });
      out.push({ label: t("info.preview.closeTab"), icon: "close", kbd: desktop ? (isMac ? "⌘W" : "Ctrl+W") : undefined, onSelect: () => onCloseTab(item.id) });
      return out;
    }
    if (desktop) {
      if (type === "html") out.push({ label: t("info.preview.openBrowser"), icon: "globe", onSelect: () => openBrowser(item) });
      out.push({ label: t("info.preview.openSystem"), icon: "ext", onSelect: () => openSystem(item) }, { label: revealLabel(), icon: "folder", onSelect: () => reveal(item) }, { label: t("info.preview.saveAs"), icon: "download", onSelect: () => saveAs(item) });
    } else {
      out.push({ label: t("info.preview.openNewTab"), icon: "ext", onSelect: () => openUrl(kind === "html" && data.url ? data.url : resourceFileUrl(item)) }, { label: t("info.preview.download"), icon: "download", onSelect: () => download(item) });
    }
    sep();
    if (ready && copyLabel) out.push({ label: t(`info.preview.${copyLabel}`) + (partial ? t("info.preview.shownPart") : ""), icon: "copy", onSelect: copyContent });
    if (ready && type === "image" && canCopyImage()) out.push({ label: t("info.preview.copyImage"), icon: "copy", onSelect: () => copyImage(resourceFileUrl(item)) });
    if (desktop) out.push({ label: t("info.preview.copyPath"), icon: "link", onSelect: () => copyText(data?.path || item.path, "info.preview.pathCopied") });
    sep();
    if (zoomable) { out.push({ custom: zoomRow }); sep(); }
    out.push({ label: t("info.preview.reload"), icon: "refresh", onSelect: reload }, { label: t("info.preview.closeTab"), icon: "close", kbd: desktop ? (isMac ? "⌘W" : "Ctrl+W") : undefined, onSelect: () => onCloseTab(item.id) });
    return out;
  };
  const [moreOpen, setMoreOpen] = useState(false);
  // 内容缩放的快捷键：焦点在内容区时 ⌘ / Ctrl 加减号、⌘0 / Ctrl+0
  const zoomKey = (key) => {
    if (!zoomable) return false;
    if (key === "=" || key === "+") setZoom(type, zoom + ZOOM_STEP);
    else if (key === "-" || key === "_") setZoom(type, zoom - ZOOM_STEP);
    else if (key === "0") setZoom(type, 100);
    else return false;
    return true;
  };
  e.zoomKey = (key) => (bodyRef.current?.contains(document.activeElement) ? zoomKey(key) : false);
  const onBodyKey = (ev) => {
    if (!mod(ev) || ev.altKey || ev.isComposing) return;
    if (zoomKey(ev.key)) ev.preventDefault();
  };
  // 内容
  const truncNote = (cut, total) => html`<p class="pv-note"><span>${t("info.preview.truncated", { size: fmtSize(total) })}</span>
    ${desktop ? html`<button type="button" class="link" onClick=${() => openSystem(item)}>${t("info.preview.openSystem")}</button>` : html`<button type="button" class="link" onClick=${() => download(item)}>${t("info.preview.downloadFull")}</button>`}</p>`;
  let body;
  if (e.status === "loading" && !data) body = html`<${Loading} since=${e.since} onReload=${reload} />`;
  else if (e.status === "gone") body = html`<${State} icon="trash" title=${t("info.preview.gone", { name: item.name })} desc=${t("info.preview.goneDesc")} actions=${[{ label: t("info.preview.closeTab"), run: () => onCloseTab(item.id) }]} />`;
  else if (e.status === "error") body = html`<${State} icon="alert" title=${t("info.preview.failed")} desc=${t("info.preview.failedDesc")}
    actions=${[{ label: t("info.preview.reload"), run: reload }, ...(item.type !== "file" ? [] : desktop ? [{ label: t("info.preview.openSystem"), run: () => openSystem(item) }] : [{ label: t("info.preview.download"), run: () => download(item) }])]} />`;
  else if (kind === "unsupported") body = html`<${State} icon="doc" title=${t("info.preview.unsupported")} desc=${t("info.preview.unsupportedDesc")}
    actions=${desktop ? [{ label: t("info.preview.openSystem"), run: () => openSystem(item) }, { label: revealLabel(), run: () => reveal(item) }] : [{ label: t("info.preview.download"), run: () => download(item) }, { label: t("info.preview.openNewTab"), run: () => openUrl(resourceFileUrl(item)) }]} />`;
  else if (kind === "empty") body = html`<${State} icon="doc" title=${t("info.preview.emptyFile")} desc=${t("info.preview.emptyFileDesc")} />`;
  else if (kind === "tooLarge") body = html`<${State} icon="doc" title=${t("info.preview.tooLarge")} desc=${t("info.preview.tooLargeDesc", { name: item.name, size: fmtSize(data.size) })}
    actions=${desktop ? [{ label: t("info.preview.openBrowser"), run: () => openBrowser(item) }, { label: revealLabel(), run: () => reveal(item) }] : [{ label: t("info.preview.download"), run: () => download(item) }]} />`;
  else if (kind === "image") {
    const src = item.type === "file" ? `${resourceFileUrl(item)}&v=${Math.floor(data.mtimeMs || e.loadedAt || 0)}` : data.url;
    e.view.image ||= { scale: null };
    body = html`<${ImageView} key=${item.id} src=${src} alt=${item.name} view=${e.view.image} onSize=${() => touch()} onError=${() => { e.status = "error"; touch(); }} />`;
  } else if (kind === "pdf") body = html`<${Frame} key=${data.mtimeMs} title=${item.name} src=${`${resourceFileUrl(item)}&v=${Math.floor(data.mtimeMs || 0)}`} />`;
  else if (kind === "website") body = html`<${Frame} title=${item.name} src=${data.url} sandbox="allow-scripts allow-forms"><p class="pv-note">${t("info.preview.websiteHint")}</p><//>`;
  else if (kind === "html" && view === "preview") body = html`<${HtmlFrame} key=${data.url} item=${item} data=${data} desktop=${desktop} />`;
  else if (kind === "html") body = html`${data.truncated && truncNote(true, data.size)}<${Code} e=${e} viewKey="source" text=${text} lang="xml" plain=${text.length > BIG_CODE} wrap=${wrap} label=${item.name} />`;
  else if (kind === "text") {
    const trunc = data.truncated && !isCsv ? truncNote(true, data.size) : null;
    if (type === "markdown" && view === "preview") body = html`${trunc}<${MarkdownDoc} item=${item} e=${e} text=${text} />`;
    else if (type === "json" && view === "formatted" && json?.model) {
      const collapsedSet = e.view.collapsed || new Set();
      body = html`<div class="pv-json-bar"><button type="button" class="pv-chip" onClick=${() => { e.view.collapsed = new Set(); touch(); }}>${t("info.preview.json.expandAll")}</button>
          <button type="button" class="pv-chip" onClick=${() => { const deep = json.model.nodes.filter((n) => n.depth >= 1); e.view.collapsed = new Set((deep.length ? deep : json.model.nodes).map((n) => n.id)); touch(); }}>${t("info.preview.json.collapseAll")}</button></div>
        <${JsonBody} e=${e} model=${json.model} collapsed=${collapsedSet} label=${item.name} />`;
    } else if (isCsv && view === "table" && model) {
      const over = parsed.total - (header ? 1 : 0) > MAX_ROWS;
      const footer = data.truncated
        ? t(desktop ? "info.preview.csv.over10mb" : "info.preview.csv.over10mbWeb", { n: fmtNum(model.rows.length) })
        : over ? t(desktop ? "info.preview.csv.overRows" : "info.preview.csv.overRowsWeb", { total: fmtNum(model.total) }) : "";
      body = html`<${CsvView} model=${model} view=${(e.view.csv ||= {})} query=${query} footer=${footer} onCount=${setCount} />`;
    } else {
      const raw = csvRaw || { text, cut: false };
      const lang = type === "jsonl" || type === "json" ? "json" : type === "markdown" ? "markdown" : isCsv ? "plaintext" : type === "text" ? "plaintext" : langOf(item.name);
      body = html`${type === "json" && json?.error && html`<p class="pv-note warn"><${Icon} name="alert" size="sm" /><span>${t("info.preview.json.invalid", { line: json.error })}</span></p>`}
        ${isCsv && parsed?.error && html`<p class="pv-note warn"><${Icon} name="alert" size="sm" /><span>${t("info.preview.csv.parseFailed")}</span></p>`}
        ${trunc}${raw.cut && truncNote(true, data.size)}
        <${Code} e=${e} viewKey=${view || "source"} text=${raw.text} lang=${lang} plain=${raw.text.length > BIG_CODE} wrap=${wrap} label=${item.name} />`;
    }
  }
  const showSeg = !!views && viewLocked !== "hide" && !problem;
  const segOptions = views ? views.map((v) => [v, t(`info.preview.view.${type === "tsv" ? "csv" : type}.${v}`)]) : [];
  const shownControls = collapsed ? [] : controls;
  return html`<div class="pv-info" ref=${row}>
      <div class="pv-info-name" ref=${nameRef}>
        <${FileName} name=${item.name} title=${nameTitle} off=${off} />
        ${desktop && local && html`<button type="button" class="icon-btn pv-reveal" title=${revealLabel()} aria-label=${revealLabel()} disabled=${off} onClick=${() => reveal(item)}><${Icon} name="folder" size="sm" /></button>`}
        <span class="pv-meta">${shownMeta.join(" · ")}${enc && html`${shownMeta.length ? " · " : ""}<button type="button" class="pv-enc" aria-haspopup="menu" aria-expanded=${!!encMenu} onClick=${(ev) => setEncMenu(ev.currentTarget)}>${encName(enc)}<${Icon} name="chevDown" size="xs" /></button>`}</span>
      </div>
      ${e.pending && html`<button type="button" class="pv-chip warn" onClick=${() => { e.pending = false; load(item, { silent: true }).then((ok) => ok && (e.updatedAt = Date.now(), touch())); }}>${t("info.preview.newChanges")}</button>`}
      ${e.failed && html`<button type="button" class="pv-chip warn" onClick=${reload}>${t("info.preview.updateFailed")}</button>`}
      ${shownControls.map((c) => c.inline)}
      ${showSeg && html`<${Seg} label=${t("info.preview.viewLabel")} value=${view} options=${segOptions} disabled=${e.status === "loading" || viewLocked === "disable"} onChange=${setViewKeepingPlace} />`}
      <button type="button" class="icon-btn more-btn pv-more" ref=${moreRef} title=${t("info.preview.more")} aria-label=${t("info.preview.more")} aria-haspopup="menu" aria-expanded=${moreOpen} onClick=${() => setMoreOpen((v) => !v)}><${Icon} name="more" size="sm" /></button>
    </div>
    ${moreOpen && html`<${Menu} anchor=${moreRef.current} align="right" width=${280} label=${t("info.preview.more")} items=${moreItems()} onClose=${() => setMoreOpen(false)} />`}
    ${encMenu && html`<${Menu} anchor=${encMenu} width=${220} label=${t("info.preview.encoding")} onClose=${() => setEncMenu(null)} items=${[
      { group: t("info.preview.encoding") },
      { label: t("info.preview.encodingAuto", { encoding: encName(data.detected || data.encoding) }), cur: !e.encoding, onSelect: () => setEncoding("") },
      { label: "UTF-8", cur: e.encoding === "utf-8", onSelect: () => setEncoding("utf-8") },
      { label: "GBK", cur: e.encoding === "gbk", onSelect: () => setEncoding("gbk") },
    ]} />`}
    ${outlineAt && html`<${Menu} anchor=${outlineAt} align="right" width=${280} label=${t("info.preview.outline")} onClose=${() => setOutlineAt(null)}
      items=${(e.api?.heads || []).map((h) => ({ label: html`<span class=${`pv-ol-item l${h.level}`}>${h.text}</span>`, cur: h.i === e.view.headIndex, onSelect: () => e.api.jump(h.i) }))} />`}
    <div class=${`pv-body${zoom !== 100 ? " zoomed" : ""}`} ref=${bodyRef} style=${zoom !== 100 ? { zoom: zoom / 100 } : undefined} onKeyDown=${onBodyKey}>${body}</div>`;
}

function JsonBody({ e, model, collapsed, label }) {
  const ref = useRef(null);
  useScrollMemory(ref, e, "formatted");
  return html`<${JsonView} model=${model} collapsed=${collapsed} scrollRef=${ref} label=${label} onToggle=${(id) => {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    e.view.collapsed = next;
    touch();
  }} />`;
}

const b64url = (s) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/**
 * state：{ items, active }（main.js 按范围记）；onState(fn)：改这一套标签；convs：本对话的会话（「+」菜单和空状态列在这些会话里打开过的文件）；
 * desktop：桌面版（用系统程序打开、在访达中显示、另存为…）；onToggleExpand：双击标签行空白处放大 / 退出。
 */
export function ResourcePreview({ state = emptyResources(), onState, convs = [], desktop = false, onToggleExpand }) {
  useStore(bus);
  const root = useRef(null);
  const item = activeResource(state);
  const itemsRef = useRef(state.items);
  itemsRef.current = state.items;
  const activeRef = useRef(item?.id);
  activeRef.current = item?.id;
  // 本对话在预览中打开过的文件（「+」菜单、空状态；GET /preview-files，最近打开的在前）
  const [files, setFiles] = useState(null);
  const convKey = convs.join("\n");
  const loadFiles = useCallback(() => {
    if (!convs.length) return setFiles([]);
    api(`/preview-files?${convs.map((c) => `conv=${encodeURIComponent(c)}`).join("&")}`).then((d) => setFiles(d.files || []), () => setFiles((f) => f || []));
  }, [convKey]);
  useEffect(() => { loadFiles(); }, [loadFiles, state.items.length]);
  // 新开的文件标签、重新打开的（rev 变了）记一笔「在预览里打开过」，记好再刷新列表；网址、专业 Bot 的 app/ 文件不算本对话的文件
  const revKey = state.items.map((x) => `${x.id}#${x.rev || 0}`).join("\n");
  useEffect(() => {
    const todo = state.items.filter((x) => x.type === "file" && x.conv && noted.get(x.id) !== (x.rev || 0));
    if (!todo.length) return;
    for (const x of todo) noted.set(x.id, x.rev || 0);
    Promise.all(todo.map((x) => api(`/conversations/${encodeURIComponent(x.conv)}/file/opened`, { method: "POST", body: { path: x.path } }).catch(() => {}))).then(loadFiles);
  }, [revKey, loadFiles]);
  // 关掉的标签：读到的内容、手动选的编码、排序等一起丢掉（编码只在标签关闭前记住）
  const prevIds = useRef(state.items.map((x) => x.id));
  useEffect(() => {
    const now = new Set(state.items.map((x) => x.id));
    for (const id of prevIds.current) if (!now.has(id)) { entries.delete(id); noted.delete(id); }
    prevIds.current = [...now];
  }, [state.items.map((x) => x.id).join("\n")]);
  const select = (id) => onState((s) => ({ ...s, active: id }));
  const closeTab = (id) => onState((s) => removeResource(s, id));
  const closeOthers = (id) => onState((s) => closeOtherResources(s, id));
  const closeAll = () => onState(() => emptyResources());
  // 自动刷新
  const timers = useRef(new Map());
  const refreshNow = async (id) => {
    const it = itemsRef.current.find((x) => x.id === id);
    if (!it) return;
    const e = entryOf(id);
    e.lastRefresh = Date.now();
    if (await load(it, { silent: true })) {
      e.updatedAt = Date.now();
      if (!e.toastAt || Date.now() - e.toastAt > TOAST_GAP) {
        e.toastAt = Date.now();
        previewToast(t("info.preview.updated"), "ok", 2000);
      }
      touch();
    }
  };
  const schedule = (id) => {
    const e = entryOf(id);
    if (selecting(root.current)) {
      e.pending = true;
      touch();
      return;
    }
    clearTimeout(timers.current.get(id));
    timers.current.set(id, setTimeout(() => refreshNow(id), Math.max(0, (e.lastRefresh || 0) + REFRESH_GAP - Date.now())));
  };
  const watchKey = state.items.filter((x) => x.type === "file").map((x) => x.id).join("\n");
  useEffect(() => {
    const list = itemsRef.current.filter((x) => x.type === "file").map((x) => (x.botId ? { k: x.id, bot: x.botId, path: x.path } : { k: x.id, conv: x.conv, path: x.path }));
    if (!list.length) return;
    const ac = new AbortController();
    let retry;
    const onChange = ({ key }) => {
      const it = itemsRef.current.find((x) => x.id === key);
      if (!it) return;
      const e = entryOf(key);
      if (e.gone) load(it);
      else if (key === activeRef.current) schedule(key);
      else { e.stale = true; touch(); }
    };
    const onGone = ({ key }) => {
      const e = entryOf(key);
      e.gone = true;
      e.status = "gone";
      touch();
    };
    const run = () => watchPreview(b64url(JSON.stringify(list)), { change: onChange, gone: onGone }, ac.signal)
      .catch(() => {})
      .finally(() => { if (!ac.signal.aborted) retry = setTimeout(run, 3000); });
    run();
    return () => { ac.abort(); clearTimeout(retry); };
  }, [watchKey]);
  // 选中文字时先不刷新：取消选中后刷新
  useEffect(() => {
    const onSel = () => {
      const id = activeRef.current;
      if (id && entryOf(id).pending && !selecting(root.current)) {
        entryOf(id).pending = false;
        refreshNow(id);
      }
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  // 桌面版的 ⌘W / Ctrl+W、内容缩放快捷键由主进程转过来（electron/main.ts）：焦点在预览面板时才接。
  // 关掉的是最后一个：焦点留在空状态上（面板还在），再按一次也不会关窗口
  useEffect(() => {
    const close = () => {
      if (!previewFocused()) return false;
      const id = activeRef.current;
      if (!id) return true;
      closeTab(id);
      requestAnimationFrame(() => {
        const pane = document.querySelector(".preview-pane");
        const next = pane?.querySelector(".pv-tab.on .pv-tab-main") || pane?.querySelector(".preview-empty");
        next?.focus({ preventScroll: true });
        lastInPreview = !!next;
      });
      return true;
    };
    const key = (k) => !!(activeRef.current && entryOf(activeRef.current).zoomKey?.(k));
    window.__ambPreviewCloseTab = close;
    window.__ambPreviewKey = key;
    return () => {
      if (window.__ambPreviewCloseTab === close) delete window.__ambPreviewCloseTab;
      if (window.__ambPreviewKey === key) delete window.__ambPreviewKey;
    };
  });
  // 换到一个有更新的后台标签：重新读取（PreviewTab 挂上时看 stale）
  if (!state.items.length) return html`<${EmptyState} files=${files} state=${state} desktop=${desktop} onSelect=${select} /><${PanelToasts} />`;
  return html`<div class="resource-preview" ref=${root}>
    <${PanelToasts} />
    <${TabRow} state=${state} files=${files} desktop=${desktop} onSelect=${select} onCloseTab=${closeTab} onCloseOthers=${closeOthers} onCloseAll=${closeAll} onToggleExpand=${onToggleExpand} />
    ${item && html`<${PreviewTab} key=${item.id} item=${item} desktop=${item.canOpen ?? desktop} onCloseTab=${closeTab} />`}
  </div>`;
}
