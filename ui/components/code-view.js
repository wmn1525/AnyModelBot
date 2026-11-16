// 右侧预览的代码视图：代码和纯文本、Markdown 原文、HTML 源码、JSON 原文、CSV 原文共用（PRD R9）。
// 左边行号（伪元素，选中复制时不带行号），按语言着色（超过 500 KB 只留行号），自动换行开关由外面给。
// 行一次性拼成 HTML 写进去，每 200 行一块，块用 content-visibility 跳过看不见的部分，几万行也能滚动。
// JsonView：格式化后的 JSON（两格缩进、行号、着色，对象和数组可以折叠，折起显示「N 项」）。
import { useLayoutEffect, useMemo, useRef } from "preact/hooks";
import { html } from "./ui.js";
import { escapeHtml } from "../lib/preview-types.js";
import { highlightLines, normalizeLang } from "../lib/highlight.js";
import { fmtNum, t } from "../lib/i18n.js";

const CHUNK = 200;

/** 每行一段已转义的 HTML → 带行号的块；from：第一行的行号 */
export function codeHtml(lines, from = 1) {
  let out = "";
  for (let i = 0; i < lines.length; i += CHUNK) {
    const end = Math.min(lines.length, i + CHUNK);
    out += `<div class="cv-chunk" style="--cv-rows:${end - i}">`;
    // 空行放一个 <br>：选中多行复制时空行才会留下来（空的 div 在选区文字里不占一行）
    for (let j = i; j < end; j++) out += `<div class="cv-l" data-n="${from + j}">${lines[j] || "<br>"}</div>`;
    out += "</div>";
  }
  return out;
}

export const splitLines = (text) => String(text || "").replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");

/**
 * text：全文；lang：highlight.js 的语言或扩展名推出来的；plain：不着色（文件太大）；wrap：自动换行。
 * scrollRef：外面拿到滚动的那个元素（保持位置、按行跳转用）。
 */
export function CodeView({ text, lang, plain, wrap, scrollRef, label }) {
  const ref = useRef(null);
  const lines = useMemo(() => splitLines(text), [text]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const put = (htmlLines) => {
      const { scrollTop, scrollLeft } = el;
      el.firstChild.innerHTML = codeHtml(htmlLines);
      el.scrollTop = scrollTop;
      el.scrollLeft = scrollLeft;
    };
    el.style.setProperty("--cv-digits", String(String(lines.length).length));
    put(lines.map(escapeHtml));
    if (plain || normalizeLang(lang) === "plaintext") return;
    let live = true;
    highlightLines(lines.join("\n"), lang).then((h) => live && ref.current && put(h));
    return () => { live = false; };
  }, [lines, lang, plain]);
  const setRef = (el) => {
    ref.current = el;
    if (scrollRef) scrollRef.current = el;
  };
  return html`<div class=${`cv selectable${wrap ? " wrap" : ""}`} ref=${setRef} tabindex="0" role="region" aria-label=${label}><div class="cv-code"></div></div>`;
}

/** 滚到第 n 行（顶上留一点） */
export function scrollToLine(el, n) {
  const line = el?.querySelector(`[data-n="${n}"]`);
  if (line) el.scrollTop = Math.max(0, line.offsetTop - 8);
}

/** 现在最上面看到的是第几行（按行号） */
export function topLine(el) {
  if (!el) return 1;
  const top = el.getBoundingClientRect().top + 1;
  for (const chunk of el.querySelectorAll(".cv-chunk")) {
    const r = chunk.getBoundingClientRect();
    if (r.bottom < top) continue;
    for (const line of chunk.children) if (line.getBoundingClientRect().bottom > top) return Number(line.dataset.n) || 1;
  }
  return 1;
}

const JSON_CLASS = { string: "j-s", number: "j-n", boolean: "j-b", null: "j-b", punct: "j-p" };

/** 格式化的 JSON：lines / nodes 来自 jsonLines()；collapsed 是折起来的节点 id；onToggle(id) / 外面的全部展开、全部折叠改 collapsed */
export function JsonView({ model, collapsed, onToggle, scrollRef, label }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { lines, nodes } = model;
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const pad = "  ".repeat(l.depth);
      const key = l.key !== undefined ? `<span class="j-k">${escapeHtml(JSON.stringify(l.key))}</span>: ` : "";
      if (l.open !== undefined) {
        const node = nodes[l.open];
        const shut = collapsed.has(l.open);
        const fold = `<span class="jf" role="button" tabindex="-1" data-fold="${l.open}" aria-expanded="${!shut}" aria-label="${escapeHtml(t(shut ? "info.preview.json.expand" : "info.preview.json.collapse"))}"></span>`;
        if (shut) {
          const close = lines[node.end];
          out.push(`<div class="cv-l jl" data-n="${l.n}">${fold}${pad}${key}<span class="j-p">${l.bracket}</span> <span class="j-fold" data-fold="${l.open}">${escapeHtml(t("info.preview.json.items", { count: node.count, n: fmtNum(node.count) }))}</span> <span class="j-p">${close.bracket}</span>${close.comma ? "," : ""}</div>`);
          i = node.end;
          continue;
        }
        out.push(`<div class="cv-l jl" data-n="${l.n}">${fold}${pad}${key}<span class="j-p">${l.bracket}</span></div>`);
        continue;
      }
      if (l.close !== undefined) {
        out.push(`<div class="cv-l jl" data-n="${l.n}">${pad}<span class="j-p">${l.bracket}</span>${l.comma ? "," : ""}</div>`);
        continue;
      }
      const [type, text] = l.value;
      out.push(`<div class="cv-l jl" data-n="${l.n}">${pad}${key}<span class="${JSON_CLASS[type] || ""}">${escapeHtml(text)}</span>${l.comma ? "," : ""}</div>`);
    }
    const { scrollTop, scrollLeft } = el;
    el.style.setProperty("--cv-digits", String(String(lines.length).length));
    let body = "";
    for (let i = 0; i < out.length; i += CHUNK) body += `<div class="cv-chunk" style="--cv-rows:${Math.min(CHUNK, out.length - i)}">${out.slice(i, i + CHUNK).join("")}</div>`;
    el.firstChild.innerHTML = body;
    el.scrollTop = scrollTop;
    el.scrollLeft = scrollLeft;
  }, [model, collapsed]);
  const onClick = (e) => {
    const f = e.target.closest?.("[data-fold]");
    if (f) onToggle(Number(f.dataset.fold));
  };
  const setRef = (el) => {
    ref.current = el;
    if (scrollRef) scrollRef.current = el;
  };
  return html`<div class="cv json selectable" ref=${setRef} tabindex="0" role="region" aria-label=${label} onClick=${onClick}><div class="cv-code"></div></div>`;
}
