// 右侧预览的 CSV / TSV 表格（PRD R11）：表头固定、左边行号列固定（原文件的行号，排序后跟着走）、
// 列宽按前 200 行估算（60–320，可拖、双击列边自动调整）、数字列右对齐并按数值排序、点表头 升序 → 降序 → 原顺序、
// 搜索过滤并高亮。只渲染看得见的行（固定行高），5 万行也能流畅滚动。
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { html, Icon, tokenPx } from "./ui.js";
import { numValue, numericColumns } from "../lib/preview-types.js";
import { fmtNum, t } from "../lib/i18n.js";
import { fold } from "../lib/text-fold.js";

export const MAX_ROWS = 50_000;
const MIN_W = 60;
const MAX_W = 320;
const FIT_MAX = 800;
const OVERSCAN = 12;
let collator;
const collate = () => (collator ||= new Intl.Collator("zh-u-co-pinyin", { numeric: true, sensitivity: "base" }));

/** 表格要显示的东西：表头（关掉「首行是表头」时是 列 1、列 2……）、数据行、每行的原始行号、列数 */
export function tableModel(parsed, header) {
  const all = parsed.rows;
  const rows = header ? all.slice(1) : all;
  const lines = header ? parsed.lines.slice(1) : parsed.lines;
  const shown = rows.slice(0, MAX_ROWS);
  let columns = header && all[0] ? all[0].length : 0;
  for (const r of shown) if (r.length > columns) columns = r.length;
  const names = Array.from({ length: columns }, (_, c) => (header && all[0] && String(all[0][c] ?? "").trim()) || t("info.preview.csv.column", { n: c + 1 }));
  return { names, rows: shown, lines: lines.slice(0, MAX_ROWS), columns, total: Math.max(0, parsed.total - (header ? 1 : 0)), numeric: numericColumns(shown.slice(0, 5000), columns) };
}

/** 排序、搜索之后的行（下标） */
export function visibleRows(model, sort, query) {
  let idx = model.rows.map((_, i) => i);
  const q = fold(String(query || "").trim());
  if (q) idx = idx.filter((i) => model.rows[i].some((v) => fold(v).includes(q)));
  if (sort && sort.dir) {
    const c = sort.col;
    const sign = sort.dir === "desc" ? -1 : 1;
    if (model.numeric[c]) {
      const key = (i) => numValue(model.rows[i][c]);
      idx.sort((a, b) => {
        const x = key(a), y = key(b);
        if (Number.isNaN(x)) return Number.isNaN(y) ? a - b : 1;
        if (Number.isNaN(y)) return -1;
        return (x - y) * sign || a - b;
      });
    } else {
      const cmp = collate().compare;
      idx.sort((a, b) => cmp(String(model.rows[a][c] ?? ""), String(model.rows[b][c] ?? "")) * sign || a - b);
    }
  }
  return idx;
}

function measureWidths(el, model, rows) {
  const ctx = document.createElement("canvas").getContext("2d");
  const cs = getComputedStyle(el);
  ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const pad = tokenPx("--space-3", 12) * 2 + 2;
  return model.names.map((name, c) => {
    let w = ctx.measureText(name).width + pad + 20;
    for (const r of rows) w = Math.max(w, ctx.measureText(String(r[c] ?? "")).width + pad);
    return w;
  });
}

function marked(text, q) {
  if (!q) return text;
  const s = String(text);
  const low = fold(s);
  const needle = fold(q);
  const out = [];
  let from = 0;
  if (low.length !== s.length) return text;
  for (let i = low.indexOf(needle); i !== -1 && out.length < 40; i = low.indexOf(needle, i + needle.length)) {
    out.push(s.slice(from, i), html`<mark class="hit">${s.slice(i, i + needle.length)}</mark>`);
    from = i + needle.length;
  }
  out.push(s.slice(from));
  return out;
}

/**
 * model：tableModel()；view：这个标签记住的状态（排序、滚动位置、列宽），换标签再回来、自动刷新后都还在；
 * query：搜索词（已经防抖）；footer：底部说明（超过 5 万行、超过 10 MB）。
 */
export function CsvView({ model, view, query, footer, onCount }) {
  const scroll = useRef(null);
  const [, redraw] = useState(0);
  const [top, setTop] = useState(0);
  const [height, setHeight] = useState(600);
  const rowH = tokenPx("--ctl-lg", 36);
  const sort = view.sort || null;
  const q = String(query || "").trim().toLowerCase();
  const idx = useMemo(() => visibleRows(model, sort, q), [model, sort?.col, sort?.dir, q]);
  useEffect(() => onCount?.(idx.length), [idx.length]);
  // 列宽：第一次按前 200 行估，之后用拖过的；列数变了重新估
  if (!view.widths || view.widths.length !== model.columns) view.widths = null;
  useLayoutEffect(() => {
    if (view.widths || !scroll.current) return;
    view.widths = measureWidths(scroll.current, model, model.rows.slice(0, 200)).map((w) => Math.round(Math.max(MIN_W, Math.min(MAX_W, w))));
    redraw((n) => n + 1);
  }, [model]);
  useLayoutEffect(() => {
    const el = scroll.current;
    if (!el) return;
    el.scrollTop = view.scrollTop || 0;
    el.scrollLeft = view.scrollLeft || 0;
    setTop(el.scrollTop);
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const onScroll = (e) => {
    view.scrollTop = e.currentTarget.scrollTop;
    view.scrollLeft = e.currentTarget.scrollLeft;
    setTop(e.currentTarget.scrollTop);
  };
  const widths = view.widths || model.names.map(() => 120);
  const digits = String(model.lines.at(-1) || model.rows.length || 1).length;
  const rnW = Math.max(40, digits * 9 + 24);
  const total = widths.reduce((a, b) => a + b, rnW);
  const first = Math.max(0, Math.floor(top / rowH) - OVERSCAN);
  const last = Math.min(idx.length, Math.ceil((top + height) / rowH) + OVERSCAN);
  const cycle = (c) => {
    const dir = sort?.col === c ? (sort.dir === "asc" ? "desc" : sort.dir === "desc" ? "" : "asc") : "asc";
    view.sort = dir ? { col: c, dir } : null;
    redraw((n) => n + 1);
  };
  const resize = (c, e) => {
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const w0 = widths[c];
    const move = (ev) => {
      view.widths = widths.map((w, i) => (i === c ? Math.round(Math.max(MIN_W, Math.min(FIT_MAX, w0 + ev.clientX - x0))) : w));
      redraw((n) => n + 1);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.documentElement.removeAttribute("data-resizing");
    };
    document.documentElement.setAttribute("data-resizing", "");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const fit = (c, e) => {
    e.preventDefault();
    e.stopPropagation();
    const sample = idx.slice(0, 2000).map((i) => model.rows[i]);
    const w = measureWidths(scroll.current, { names: [model.names[c]] }, sample.map((r) => [r[c]]))[0];
    view.widths = widths.map((x, i) => (i === c ? Math.round(Math.max(MIN_W, Math.min(FIT_MAX, w))) : x));
    redraw((n) => n + 1);
  };
  const cols = `${rnW}px ${widths.map((w) => `${w}px`).join(" ")}`;
  return html`<div class="csv">
    <div class="csv-scroll" ref=${scroll} onScroll=${onScroll} role="table" aria-rowcount=${idx.length + 1} aria-colcount=${model.columns + 1}>
      <div class="csv-inner" style=${{ width: `${total}px`, height: `${(idx.length + 1) * rowH}px`, "--csv-cols": cols, "--csv-row": `${rowH}px` }}>
        <div class="csv-row csv-head" role="row">
          <div class="csv-rn" role="columnheader">#</div>
          ${model.names.map((name, c) => {
            const on = sort?.col === c && sort.dir;
            return html`<div key=${c} class=${`csv-th${model.numeric[c] ? " num" : ""}${on ? " sorted" : ""}`} role="columnheader" aria-sort=${on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
              <button type="button" class="csv-sort" title=${name} onClick=${() => cycle(c)}><span class="v">${name}</span>${on && html`<${Icon} name=${sort.dir === "asc" ? "up" : "down"} size="xs" />`}</button>
              <span class="csv-grip" aria-hidden="true" onPointerDown=${(e) => resize(c, e)} onDblClick=${(e) => fit(c, e)}></span>
            </div>`;
          })}
        </div>
        <div style=${{ height: `${first * rowH}px` }}></div>
        ${idx.slice(first, last).map((i) => {
          const r = model.rows[i];
          return html`<div key=${i} class="csv-row" role="row">
            <div class="csv-rn num" role="rowheader">${model.lines[i]}</div>
            ${widths.map((_, c) => {
              const v = r[c] ?? "";
              return html`<div class=${`csv-td${model.numeric[c] ? " num" : ""}`} role="cell" title=${String(v).length > 12 ? v : undefined}>${marked(v, q)}</div>`;
            })}
          </div>`;
        })}
      </div>
      ${!model.rows.length && html`<p class="csv-empty">${t("info.preview.csv.headerOnly")}</p>`}
      ${model.rows.length > 0 && !idx.length && html`<p class="csv-empty">${t("info.preview.csv.noResults", { query: String(query).trim() })}</p>`}
    </div>
    ${footer && html`<p class="csv-foot">${footer}</p>`}
  </div>`;
}

export const fmtRows = (n) => fmtNum(n);
