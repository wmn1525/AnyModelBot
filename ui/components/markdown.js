// AST → Preact 节点。文本始终作为文本节点渲染；链接已在解析时经 safeHref 过滤。
// 图片（PRD R7、R8）：https 直接加载（不带来源信息）、data 内嵌的 png / jpg / gif / webp 直接显示、本地图片走文件接口
// （预览里相对路径按 Markdown 文件所在的文件夹，对话里按工作区）；其他地址不加载，说明文字显示成普通链接。
// 点图片在右侧「预览」新开图片标签（没有面板的页面在浏览器里打开），图片外面有链接时走链接。
import { h } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { parseMarkdown, linkify, safeHref } from "../lib/markdown.js";
import { html, CopyButton, Icon } from "./ui.js";
import { appFileResource, fileResource, localFilePath, resourceFileUrl, openResource, plainClick, previewWebsite, webImageResource } from "../lib/resource-preview.js";
import { highlightLines } from "../lib/highlight.js";
import { t } from "../lib/i18n.js";

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;

/** 图片地址 → { kind: "web" | "data" | "local", url, resource, label } 或 { kind: "link", href? } */
export function imageSource(src, ctx = {}) {
  const raw = String(src || "").trim();
  if (/^https:\/\//i.test(raw)) {
    const resource = webImageResource(raw);
    if (!resource) return { kind: "link", href: safeHref(raw) };
    let label = raw;
    try {
      const u = new URL(raw);
      label = u.hostname + (u.pathname.split("/").filter(Boolean).length ? `/${u.pathname.split("/").filter(Boolean).pop()}` : "");
    } catch { /* 原样显示 */ }
    return { kind: "web", url: raw, resource, label };
  }
  if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(raw)) return { kind: "data", url: raw, resource: webImageResource(raw), label: "data:image" };
  if (/^[a-z][a-z\d+.-]*:/i.test(raw) && !/^(file|sandbox):/i.test(raw) && !/^[A-Za-z]:[\\/]/.test(raw)) return { kind: "link", href: safeHref(raw) };
  let path = localFilePath(raw);
  if (!path || !(ctx.conv || ctx.botId)) return { kind: "link", href: null };
  if (ctx.filePath && !/^(?:[A-Za-z]:[\\/]|\/)/.test(path)) path = ctx.filePath.replace(/[^\\/]+$/, "") + path;
  const resource = ctx.botId ? appFileResource(path, ctx.botId, ctx.canOpen) : fileResource({ path }, ctx.conv, ctx.canOpen);
  if (!resource) return { kind: "link", href: null };
  // 不是图片的本地文件：和文件链接一样，点了在右侧预览打开
  if (!IMAGE_EXT.test(path)) return { kind: "link", href: resourceFileUrl(resource), resource };
  return { kind: "local", url: resourceFileUrl(resource), resource, label: raw };
}

/** 一张图片：加载中是一块浅灰（预览 160 高、对话 120 高），失败是虚线占位 + 地址 + 「重试」 */
function MdImage({ node, ctx }) {
  const src = imageSource(node.src, ctx);
  const [state, setState] = useState("loading");
  const [attempt, setAttempt] = useState(0);
  if (src.kind === "link") {
    const text = node.alt || node.src;
    if (src.resource) return h("a", { href: src.href, target: "_blank", rel: "noopener noreferrer", onClick: (e) => plainClick(e) && openResource(src.resource) && e.preventDefault() }, text);
    return src.href ? h("a", { href: src.href, target: "_blank", rel: "noopener noreferrer", onClick: previewWebsite }, text) : text;
  }
  const open = (e) => {
    if (ctx.inLink || !plainClick(e)) return;
    e.preventDefault();
    if (!openResource(src.resource) && src.kind !== "data") window.open(src.url, "_blank", "noopener,noreferrer");
  };
  const url = src.kind === "local" && attempt ? `${src.url}&r=${attempt}` : src.url;
  if (state === "error") {
    return html`<span class=${`md-img-fail${ctx.doc ? " doc" : ""}`} role="img" aria-label=${node.alt ? `${node.alt} · ${t("markdown.imageFailed")}` : t("markdown.imageFailed")}>
      <${Icon} name="photo" size="lg" />
      ${node.alt && html`<span class="md-img-alt">${node.alt}</span>`}
      <span>${t("markdown.imageFailed")}</span>
      <span class="md-img-src"><span class="v">${src.label}</span> · <button type="button" class="link" onClick=${(e) => { e.preventDefault(); e.stopPropagation(); setState("loading"); setAttempt((n) => n + 1); }}>${t("common.retry")}</button></span>
    </span>`;
  }
  const img = h("img", {
    key: attempt, src: url, alt: node.alt, title: node.title || undefined, referrerpolicy: "no-referrer", loading: "lazy", decoding: "async",
    onLoad: () => setState("ok"), onError: () => setState("error"),
  });
  const cls = `md-img${ctx.doc ? " doc" : ""}${state === "loading" ? " loading" : ""}`;
  if (ctx.inLink) return h("span", { class: cls }, img);
  return h("a", { class: cls, href: src.kind === "data" ? undefined : src.url, target: "_blank", rel: "noopener noreferrer", title: node.title || node.alt || undefined, onClick: open }, img);
}

function inline(nodes, ctx) {
  return nodes.map((n, i) => {
    if (typeof n === "string") return n;
    switch (n.t) {
      case "br":
        return h("br", { key: i });
      case "code":
        return h("code", { key: i }, n.text);
      case "b":
        return h("strong", { key: i }, inline(n.c, ctx));
      case "i":
        return h("em", { key: i }, inline(n.c, ctx));
      case "s":
        return h("del", { key: i }, inline(n.c, ctx));
      case "a":
        return h("a", { key: i, href: n.href, target: "_blank", rel: "noopener noreferrer", onClick: previewWebsite }, inline(n.c, { ...ctx, inLink: true }));
      case "img":
        return h(MdImage, { key: `${i}:${n.src}`, node: n, ctx });
      case "file": {
        let path = n.path;
        if (ctx?.filePath && !/^(?:[A-Za-z]:[\\/]|\/)/.test(path)) path = ctx.filePath.replace(/[^\\/]+$/, "") + path;
        if (!path || !(ctx?.conv || ctx?.botId)) return inline(n.c, ctx);
        const resource = ctx.botId ? appFileResource(path, ctx.botId, ctx.canOpen) : fileResource({ path }, ctx.conv, ctx.canOpen);
        if (!resource) return inline(n.c, ctx);
        return h("a", { key: i, href: resourceFileUrl(resource), target: "_blank", rel: "noopener noreferrer", onClick: (e) => {
          if (plainClick(e) && openResource(resource)) e.preventDefault();
        } }, inline(n.c, { ...ctx, inLink: true }));
      }
      default:
        return null;
    }
  });
}

/** 代码块：语言名 + 复制；预览面板里（color）按语言着色（同代码视图，components/code-view.js） */
function CodeBlock({ lang, text, color }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (!color || !ref.current) return;
    let live = true;
    const el = ref.current;
    el.textContent = text;
    highlightLines(text, lang).then((lines) => {
      if (live) el.innerHTML = lines.join("\n");
    });
    return () => { live = false; };
  }, [text, lang, color]);
  return html`<div class="codeblock">
    <div class="bar"><span class="lang">${lang || t("markdown.code")}</span><${CopyButton} text=${text} label=${t("markdown.copyCode")} /></div>
    <pre><code ref=${ref}>${color ? null : text}</code></pre>
  </div>`;
}

function blocks(list, ctx) {
  return list.map((b, i) => {
    switch (b.t) {
      case "p":
        return h("p", { key: i }, inline(b.c, ctx));
      case "h":
        return h("h" + b.level, { key: i, "data-h": ctx.top ? ctx.heads.n++ : undefined }, inline(b.c, ctx));
      case "hr":
        return h("hr", { key: i });
      case "code":
        return h(CodeBlock, { key: i, lang: b.lang, text: b.text, color: !!ctx.doc && !b.open });
      case "quote":
        return h("blockquote", { key: i }, blocks(b.c, { ...ctx, top: false }));
      case "ul":
      case "ol":
        return h(b.t, { key: i, start: b.t === "ol" && b.start !== 1 ? b.start : undefined, class: b.items.some((it) => it.task !== undefined) ? "tasks" : undefined }, b.items.map((it, k) =>
          h("li", { key: k, class: it.task !== undefined ? "task" : undefined },
            it.task !== undefined ? h("input", { type: "checkbox", checked: it.task, disabled: true, tabIndex: -1, "aria-label": t(it.task ? "markdown.taskDone" : "markdown.taskTodo") }) : null,
            inline(it.c, ctx), it.sub.length ? blocks(it.sub, { ...ctx, top: false }) : null)));
      case "table":
        return h(
          "div",
          { key: i, class: "table-wrap" },
          h("table", null, h("thead", null, h("tr", null, b.head.map((c, k) => h("th", { key: k, style: b.align[k] ? { textAlign: b.align[k] } : undefined }, inline(c, ctx))))), h("tbody", null, b.rows.map((r, k) => h("tr", { key: k }, r.map((c, j) => h("td", { key: j, style: b.align[j] ? { textAlign: b.align[j] } : undefined }, inline(c, ctx))))))),
        );
      default:
        return null;
    }
  });
}

/** document：右侧预览里的整篇文档（图片放大一些、代码块着色、顶层标题带 data-h 序号给大纲用）；默认是对话里的消息 */
export function Markdown({ text, conv, botId, filePath, canOpen, document: doc = false }) {
  return h("div", { class: `md${doc ? " md-doc" : ""}` }, blocks(parseMarkdown(text, !!(conv || botId)), { conv, botId, filePath, canOpen, doc, top: doc, heads: { n: 0 } }));
}

export function Linkified({ text }) {
  return inline(linkify(text));
}
