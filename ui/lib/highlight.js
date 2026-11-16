// 代码着色：按需加载 ui/vendor/hljs 里的 highlight.js 核心和语言（scripts/vendor-hljs.mjs 复制进来的约 30 种），
// 一个语言只加载一次。认不出的语言、加载失败都按纯文本（不着色）。
import { escapeHtml, splitHighlighted, LANGS } from "./preview-types.js";

/** 代码块写的语言名 → 打包了的 highlight.js 语言 */
const ALIASES = {
  py: "python", python3: "python", js: "javascript", jsx: "javascript", node: "javascript", mjs: "javascript", cjs: "javascript", ts: "typescript", tsx: "typescript",
  sh: "bash", shell: "bash", zsh: "bash", console: "bash", shellsession: "bash", html: "xml", htm: "xml", svg: "xml", vue: "xml", svelte: "xml", xhtml: "xml",
  yml: "yaml", toml: "ini", conf: "ini", cfg: "ini", env: "bash", rs: "rust", kt: "kotlin", kts: "kotlin", cs: "csharp", "c#": "csharp", "c++": "cpp", cc: "cpp", cxx: "cpp", hpp: "cpp",
  h: "c", rb: "ruby", md: "markdown", docker: "dockerfile", make: "makefile", mk: "makefile", golang: "go", jsonc: "json", json5: "json", jsonl: "json", ndjson: "json",
  text: "plaintext", txt: "plaintext", plain: "plaintext", log: "plaintext", groovy: "gradle", postgres: "sql", postgresql: "sql", mysql: "sql", sqlite: "sql",
};

export function normalizeLang(lang) {
  const l = String(lang || "").trim().toLowerCase();
  const name = ALIASES[l] || l;
  return Object.hasOwn(LANGS, name) ? name : "plaintext";
}

let core = null;
const loading = new Map();

async function hljsFor(lang) {
  core ||= import(new URL("../vendor/hljs/core.js", import.meta.url).href).then((m) => m.default);
  const hljs = await core;
  if (lang !== "plaintext" && !hljs.getLanguage(lang)) {
    if (!loading.has(lang)) loading.set(lang, import(new URL(`../vendor/hljs/languages/${lang}.js`, import.meta.url).href).then((m) => hljs.registerLanguage(lang, m.default)));
    await loading.get(lang);
  }
  return hljs;
}

/** 每行一段 HTML（已转义）；plaintext 或加载失败时只转义不着色 */
export async function highlightLines(text, lang) {
  const name = normalizeLang(lang);
  if (name === "plaintext") return String(text).split("\n").map(escapeHtml);
  try {
    const hljs = await hljsFor(name);
    return splitHighlighted(hljs.highlight(String(text), { language: name, ignoreIllegals: true }).value);
  } catch {
    return String(text).split("\n").map(escapeHtml);
  }
}
