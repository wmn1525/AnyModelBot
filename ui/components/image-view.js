// 右侧预览的图片（PRD R13）：默认「适应」（整张放进内容区，比内容区小的按原始大小居中），底部浮着缩放条
// −、百分比、+、适应、1:1；⌘ / Ctrl 加滚轮、触控板捏合以指针为中心缩放（10%–800%，每次约 1.25 倍）；
// 比内容区大时按住拖动，双击在「适应」和 100% 之间切换。透明图片下面是浅灰棋盘格，GIF 照常播放，SVG 当图片显示（不运行脚本）。
// 缩放和位置记在标签的 view 里：换标签再回来不变；自动刷新后像素尺寸变了才回到「适应」。
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { html, IconButton } from "./ui.js";
import { t } from "../lib/i18n.js";

const MIN = 0.1;
const MAX = 8;
const STEP = 1.25;
const clamp = (v) => Math.max(MIN, Math.min(MAX, v));

/** src：图片地址；view：{ scale, x, y, nw, nh }（scale 为 null 时是「适应」）；onSize(w, h)：读到像素尺寸；onError：解码失败 */
export function ImageView({ src, alt, view, onSize, onError }) {
  const box = useRef(null);
  const [, redraw] = useState(0);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [loaded, setLoaded] = useState(false);
  const drag = useRef(null);
  const update = () => redraw((n) => n + 1);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const nw = view.nw || 0;
  const nh = view.nh || 0;
  const fitScale = nw && nh && size.w && size.h ? Math.min(1, size.w / nw, size.h / nh) : 1;
  const fitting = view.scale == null;
  const scale = fitting ? fitScale : view.scale;
  const w = nw * scale;
  const h = nh * scale;
  // 平移量限制在图片能盖住的范围内；比内容区小的方向居中
  const bound = (x, y) => ({
    x: w <= size.w ? 0 : Math.max((size.w - w) / 2, Math.min((w - size.w) / 2, x)),
    y: h <= size.h ? 0 : Math.max((size.h - h) / 2, Math.min((h - size.h) / 2, y)),
  });
  const pos = fitting ? { x: 0, y: 0 } : bound(view.x || 0, view.y || 0);
  /** 以内容区里的一点（相对中心）为中心缩放到 next */
  const zoomTo = (next, cx = 0, cy = 0) => {
    const s = clamp(next);
    const k = s / scale;
    view.scale = s;
    const p = { x: cx - (cx - pos.x) * k, y: cy - (cy - pos.y) * k };
    const nwid = nw * s, nhei = nh * s;
    view.x = nwid <= size.w ? 0 : Math.max((size.w - nwid) / 2, Math.min((nwid - size.w) / 2, p.x));
    view.y = nhei <= size.h ? 0 : Math.max((size.h - nhei) / 2, Math.min((nhei - size.h) / 2, p.y));
    update();
  };
  const fit = () => {
    view.scale = null;
    view.x = view.y = 0;
    update();
  };
  const at = (e) => {
    const r = box.current.getBoundingClientRect();
    return [e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2];
  };
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const wheel = (e) => {
      if (!(e.ctrlKey || e.metaKey) || !nw) return;
      e.preventDefault();
      const [cx, cy] = at(e);
      zoomTo(scale * Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025)), cx, cy);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  });
  const draggable = w > size.w + 0.5 || h > size.h + 0.5;
  const down = (e) => {
    if (!draggable || e.button !== 0) return;
    e.preventDefault();
    drag.current = { x: e.clientX, y: e.clientY, ox: pos.x, oy: pos.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    if (fitting) view.scale = scale;
    const p = bound(d.ox + e.clientX - d.x, d.oy + e.clientY - d.y);
    view.x = p.x;
    view.y = p.y;
    update();
  };
  const up = () => (drag.current = null);
  const dbl = (e) => {
    if (fitting || Math.abs(scale - fitScale) < 0.001) {
      const [cx, cy] = at(e);
      zoomTo(1, cx, cy);
    } else fit();
  };
  const pct = Math.round(scale * 100);
  return html`<div class=${`iv${draggable ? " pan" : ""}${drag.current ? " grabbing" : ""}`} ref=${box} onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up} onDblClick=${dbl}
      aria-label=${draggable ? t("info.preview.image.pan") : undefined}>
    <img class=${`iv-img${loaded ? " on" : ""}`} src=${src} alt=${alt} draggable=${false} decoding="async" referrerpolicy="no-referrer"
      style=${{ width: nw ? `${w}px` : undefined, height: nh ? `${h}px` : undefined, transform: `translate(${pos.x}px, ${pos.y}px)` }}
      onLoad=${(e) => {
        const img = e.currentTarget;
        const changed = view.nw && (view.nw !== img.naturalWidth || view.nh !== img.naturalHeight);
        view.nw = img.naturalWidth || img.width || 1;
        view.nh = img.naturalHeight || img.height || 1;
        if (changed) fit();
        setLoaded(true);
        onSize?.(view.nw, view.nh);
      }}
      onError=${onError} />
    ${loaded && html`<div class="iv-bar" role="toolbar" aria-label=${alt} onPointerDown=${(e) => e.stopPropagation()} onDblClick=${(e) => e.stopPropagation()}>
      <${IconButton} icon="minus" label=${t("info.preview.image.zoomOut")} disabled=${scale <= MIN + 1e-6} onClick=${() => zoomTo(scale / STEP)} />
      <span class="iv-pct num" aria-live="polite">${pct}%</span>
      <${IconButton} icon="plus" label=${t("info.preview.image.zoomIn")} disabled=${scale >= MAX - 1e-6} onClick=${() => zoomTo(scale * STEP)} />
      <span class="iv-sep" aria-hidden="true"></span>
      <button type="button" class=${`iv-btn${fitting ? " on" : ""}`} aria-pressed=${fitting} onClick=${fit}>${t("info.preview.image.fit")}</button>
      <button type="button" class=${`iv-btn${!fitting && Math.abs(scale - 1) < 0.001 ? " on" : ""}`} onClick=${() => zoomTo(1)}>1:1</button>
    </div>`}
  </div>`;
}
