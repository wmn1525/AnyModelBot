// 报告里的第一张数字表画成两张小图：金额一类画柱（从 0 开始），百分比画线（只看走势，不从 0 开始）。
// 两种单位不放进同一张图（不做双纵轴）；每张图最多两组数据，颜色是两级中性墨色，图例就是读数：
// 平时显示最后一期，鼠标移到哪一期就显示哪一期（整列都是感应区，不用对准细小的点）。表格本身仍在报告里。
import { html, useEffect, useRef, useState } from "/amb/botapp/kit/kit.js";

const NUM = /^[-+(]?\s*[$€¥£]?\s*\d[\d,]*(\.\d+)?\s*(%|pp|个百分点)?\s*\)?$/i;
const MAX_ROWS = 12;
const MAX_SERIES = 2;

function parseCell(raw) {
  const s = String(raw ?? "").replace(/\*\*/g, "").trim();
  if (!NUM.test(s)) return null;
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-");
  const n = Number(s.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return null;
  return { value: neg ? -n : n, pct: /%$/.test(s), text: s.replace(/^\(|\)$/g, "") };
}

/** 第一张能画的表：至少两行，第一列是期间或名称，至少一列大部分是数字 */
export function chartsFrom(blocks) {
  for (const b of blocks) {
    if (b.type !== "table" || b.rows.length < 2 || b.rows.length > MAX_ROWS || b.head.length < 2) continue;
    const cats = b.rows.map((r) => String(r[0] ?? "").replace(/\*\*/g, ""));
    const cols = [];
    for (let c = 1; c < b.head.length; c++) {
      const cells = b.rows.map((r) => parseCell(r[c]));
      const ok = cells.filter(Boolean);
      if (ok.length < Math.max(2, Math.ceil(cells.length * 0.7))) continue;
      cols.push({ name: String(b.head[c]).replace(/\*\*/g, ""), cells, pct: ok.filter((x) => x.pct).length > ok.length / 2 });
    }
    if (!cols.length) continue;
    const bars = cols.filter((c) => !c.pct).slice(0, MAX_SERIES);
    const lines = cols.filter((c) => c.pct).slice(0, MAX_SERIES);
    return { cats, bars, lines };
  }
  return null;
}

/** 宽度跟着容器走（每张图按实际像素画，字不会跟着缩放） */
function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    // 下一帧再更新（在回调里直接改尺寸会触发 ResizeObserver 的循环警告）；界面被藏起来时宽度是 0，不跟着变
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const width = Math.floor(el.clientWidth);
        if (width > 0) setW(width);
      });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, []);
  return [ref, w];
}

const H = 132;
const AXIS = 22;
const TOP = 8;
const BAR_MAX = 24;
const R = 4;

/** 上端 4px 圆角、贴着基线那端是直角的柱 */
function barPath(x, y, w, h) {
  const r = Math.min(R, w / 2, Math.abs(h));
  if (h <= 0) return "";
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function Legend({ series, at, cats }) {
  return html`<div class="ch-legend">
    ${series.map((s, i) => html`<span class="ch-key" key=${s.name}>
      ${series.length > 1 && html`<i class=${`ch-swatch s${i}`} aria-hidden="true"></i>`}
      <span class="ch-name">${s.name}</span><strong class="ch-value">${s.cells[at]?.text ?? "—"}</strong>
    </span>`)}
    <span class="ch-cat">${cats[at]}</span>
  </div>`;
}

function Axis({ cats, x, band, at }) {
  const every = band < 44 ? 2 : 1;
  return cats.map((c, i) => (i % every && i !== cats.length - 1 ? null : html`<text key=${i} class=${`ch-axis${i === at ? " on" : ""}`} x=${x(i) + band / 2} y=${H - 6} text-anchor="middle">${c}</text>`));
}

function Bars({ cats, series, w, at, setAt }) {
  const plot = H - AXIS - TOP;
  const band = w / cats.length;
  const k = series.length;
  const thick = Math.max(4, Math.min(BAR_MAX, (band * 0.56) / k));
  const max = Math.max(0, ...series.flatMap((s) => s.cells.map((c) => c?.value ?? 0)));
  const y = (v) => TOP + plot - (max > 0 ? (Math.max(0, v) / max) * plot : 0);
  const x = (i) => i * band;
  return html`<svg class="ch-svg" width=${w} height=${H} role="img" aria-label=${series.map((s) => s.name).join(" / ")}>
    ${cats.map((_, i) => html`<g key=${i} class=${at === i ? "ch-col on" : "ch-col"}>
      ${series.map((s, j) => {
        const v = s.cells[i]?.value;
        if (v == null) return null;
        const bx = x(i) + band / 2 - (k * thick + (k - 1) * 2) / 2 + j * (thick + 2);
        return html`<path key=${j} class=${`ch-bar s${j}`} d=${barPath(bx, y(v), thick, TOP + plot - y(v))} />`;
      })}
    </g>`)}
    <line class="ch-base" x1="0" x2=${w} y1=${TOP + plot + 0.5} y2=${TOP + plot + 0.5} />
    <${Axis} cats=${cats} x=${x} band=${band} at=${at} />
    ${cats.map((_, i) => html`<rect key=${`hit${i}`} class="ch-hit" x=${x(i)} y="0" width=${band} height=${H} onPointerEnter=${() => setAt(i)} />`)}
  </svg>`;
}

function Lines({ cats, series, w, at, setAt }) {
  const plot = H - AXIS - TOP - 6;
  const band = w / cats.length;
  const vals = series.flatMap((s) => s.cells.filter(Boolean).map((c) => c.value));
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  const pad = (hi - lo) * 0.18 || Math.abs(hi) * 0.1 || 1;
  lo -= pad;
  hi += pad;
  const x = (i) => i * band;
  const cx = (i) => x(i) + band / 2;
  const y = (v) => TOP + 4 + plot - ((v - lo) / (hi - lo)) * plot;
  return html`<svg class="ch-svg" width=${w} height=${H} role="img" aria-label=${series.map((s) => s.name).join(" / ")}>
    <line class="ch-cross" x1=${cx(at) + 0.5} x2=${cx(at) + 0.5} y1=${TOP} y2=${H - AXIS} />
    ${series.map((s, j) => {
      const pts = s.cells.map((c, i) => (c ? [cx(i), y(c.value)] : null)).filter(Boolean);
      return html`<g key=${j}>
        <polyline class=${`ch-line s${j}`} points=${pts.map((p) => p.join(",")).join(" ")} />
        ${s.cells.map((c, i) => c && html`<circle key=${i} class=${`ch-dot s${j}${i === at ? " on" : ""}`} cx=${cx(i)} cy=${y(c.value)} r=${i === at ? 5 : 4} />`)}
      </g>`;
    })}
    <${Axis} cats=${cats} x=${x} band=${band} at=${at} />
    ${cats.map((_, i) => html`<rect key=${`hit${i}`} class="ch-hit" x=${x(i)} y="0" width=${band} height=${H} onPointerEnter=${() => setAt(i)} />`)}
  </svg>`;
}

function Chart({ kind, cats, series }) {
  const last = cats.length - 1;
  const [at, setAt] = useState(last);
  const [ref, w] = useWidth();
  const Plot = kind === "bars" ? Bars : Lines;
  return html`<figure class="ch" onPointerLeave=${() => setAt(last)}>
    <${Legend} series=${series} at=${at} cats=${cats} />
    <div class="ch-plot" ref=${ref}>${w > 0 && html`<${Plot} cats=${cats} series=${series} w=${w} at=${at} setAt=${setAt} />`}</div>
  </figure>`;
}

export function Charts({ data }) {
  if (!data) return null;
  return html`<div class="ch-row">
    ${data.bars.length > 0 && html`<${Chart} kind="bars" cats=${data.cats} series=${data.bars} />`}
    ${data.lines.length > 0 && html`<${Chart} kind="lines" cats=${data.cats} series=${data.lines} />`}
  </div>`;
}

/**
 * 关键数字：每组数据一张卡——最后一期的值，和第一期比变了多少（金额算百分比，比率算百分点）。
 * 给只想看结论的人一眼读懂，懂行的人也能直接拿去核对表格。
 */
export function Kpis({ data, t }) {
  if (!data) return null;
  const tiles = [...data.bars, ...data.lines].map((s) => {
    const idx = s.cells.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
    if (idx.length < 2) return null;
    const a = s.cells[idx[0]], b = s.cells[idx[idx.length - 1]];
    const diff = s.pct ? b.value - a.value : a.value ? ((b.value - a.value) / Math.abs(a.value)) * 100 : null;
    if (diff == null || !Number.isFinite(diff)) return null;
    const sign = diff > 0 ? "+" : diff < 0 ? "−" : "±";
    const n = Math.abs(diff).toFixed(s.pct ? 2 : 1);
    return { name: s.name, value: b.text, delta: s.pct ? t("kpi.pp", { v: `${sign}${n}` }) : `${sign}${n}%`, up: diff > 0, down: diff < 0, from: data.cats[idx[0]], to: data.cats[idx[idx.length - 1]] };
  }).filter(Boolean);
  if (!tiles.length) return null;
  return html`<div class="kpis" role="list" aria-label=${t("kpi.title")}>
    ${tiles.map((k) => html`<div class="kpi" role="listitem" key=${k.name}>
      <span class="kpi-name">${k.name}<span class="kpi-at">${k.to}</span></span>
      <strong class="kpi-value">${k.value}</strong>
      <span class="kpi-delta"><span aria-hidden="true">${k.up ? "▲" : k.down ? "▼" : "■"}</span> ${k.delta} <span class="kpi-at">${t("kpi.vs", { cat: k.from })}</span></span>
    </div>`)}
  </div>`;
}
