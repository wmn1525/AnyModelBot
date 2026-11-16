// 右侧预览用到的纯函数（不碰 DOM，test/preview-types.unit.test.ts 直接测）：
// 文件类型和标签图标、代码语言、文件名中间省略、CSV 解析与排序、JSON 格式化成可折叠的行、
// 把 highlight.js 的着色结果按行切开、Markdown 标题所在的行、交付时间的写法。

/** highlight.js 的语言（和 scripts/vendor-hljs.mjs 的 HLJS_LANGS 一致）→ 信息行里显示的名字 */
export const LANGS = {
  bash: "Shell", c: "C", cpp: "C++", csharp: "C#", css: "CSS", dart: "Dart", dockerfile: "Dockerfile", go: "Go", gradle: "Gradle",
  ini: "INI", java: "Java", javascript: "JavaScript", json: "JSON", kotlin: "Kotlin", less: "Less", lua: "Lua", makefile: "Makefile",
  markdown: "Markdown", php: "PHP", plaintext: "", properties: "Properties", python: "Python", r: "R", ruby: "Ruby", rust: "Rust",
  scss: "SCSS", sql: "SQL", swift: "Swift", typescript: "TypeScript", xml: "XML", yaml: "YAML",
};
const EXT_LANG = {
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
  py: "python", sh: "bash", bash: "bash", zsh: "bash", sql: "sql", css: "css", scss: "scss", less: "less",
  json: "json", jsonl: "json", ndjson: "json", yaml: "yaml", yml: "yaml", xml: "xml", html: "xml", htm: "xml", svg: "xml", vue: "xml", svelte: "xml",
  toml: "ini", ini: "ini", cfg: "ini", conf: "ini", env: "bash", properties: "properties", gradle: "gradle",
  go: "go", rs: "rust", java: "java", kt: "kotlin", swift: "swift", c: "c", h: "c", cpp: "cpp", hpp: "cpp", cs: "csharp",
  rb: "ruby", php: "php", lua: "lua", r: "r", dart: "dart", md: "markdown", markdown: "markdown",
};
/** 信息行里的语言名：借用别的语言着色的扩展名，名字按文件本身写（.toml 用 INI 着色，但显示 TOML） */
const EXT_NAME = { toml: "TOML", vue: "Vue", svelte: "Svelte", jsx: "JSX", tsx: "TSX", env: "ENV", conf: "Config", cfg: "Config", jsonl: "JSON Lines", ndjson: "JSON Lines" };
export const langLabel = (name) => EXT_NAME[extOf(name)] || LANGS[langOf(name)] || "";
/** 纯文本：没有语言、信息行只显示行数，默认自动换行 */
const PLAIN = new Set(["txt", "log", "srt", "vtt", "csv", "tsv"]);
const IMAGE = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"]);

export function extOf(name) {
  const base = String(name || "").split(/[\\/]/).pop();
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(i + 1).toLowerCase() : "";
}

/**
 * 预览按哪种方式显示：markdown / json / jsonl / csv / tsv / html / image / pdf / code / text / other。
 * 没有扩展名的（LICENSE、.gitignore）先当 text，服务端认出是二进制时回 unsupported。
 */
export function previewType(name) {
  const base = String(name || "").split(/[\\/]/).pop().toLowerCase();
  if (base === "dockerfile" || base === "makefile") return "code";
  const ext = extOf(base);
  if (!ext) return "text";
  if (ext === "md" || ext === "markdown") return "markdown";
  if (ext === "json") return "json";
  if (ext === "jsonl" || ext === "ndjson") return "jsonl";
  if (ext === "csv") return "csv";
  if (ext === "tsv") return "tsv";
  if (ext === "html" || ext === "htm") return "html";
  if (IMAGE.has(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (PLAIN.has(ext)) return "text";
  if (EXT_LANG[ext]) return "code";
  return "other";
}

/** 代码视图的语言（highlight.js 的名字）；认不出的按纯文本（plaintext） */
export function langOf(name) {
  const base = String(name || "").split(/[\\/]/).pop().toLowerCase();
  if (base === "dockerfile") return "dockerfile";
  if (base === "makefile") return "makefile";
  return EXT_LANG[extOf(base)] || "plaintext";
}

/** 标签和列表的类型图标：文档 / 代码 / 表格 / 地球 / 图片 / PDF / 普通文件 */
export function typeIcon(type) {
  return { markdown: "file", text: "file", code: "code", json: "code", jsonl: "code", csv: "table", tsv: "table", html: "globe", website: "globe", image: "photo", webimage: "photo", pdf: "pdf" }[type] || "doc";
}

/** 自动换行的默认值：.txt、.log 和 Markdown 原文默认开，代码默认关 */
export const wrapDefault = (name) => ["txt", "log", "md", "markdown", "srt", "vtt"].includes(extOf(name)) || !extOf(name);

/** 文件名中间省略：头部可以被省略号截断，尾部（扩展名和它前面几个字）总是留着 */
export function splitName(name) {
  const s = String(name || "");
  const dot = s.lastIndexOf(".");
  const keep = dot > 0 && s.length - dot <= 12 ? s.length - dot + 4 : 6;
  if (s.length <= keep + 4) return { head: s, tail: "" };
  return { head: s.slice(0, s.length - keep), tail: s.slice(s.length - keep) };
}

/** 一行一行地数：最后一行没有换行符也算 */
export function countLines(text) {
  if (!text) return 0;
  let n = 1;
  for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) n++;
  return text.endsWith("\n") ? n - 1 : n;
}

// —— CSV / TSV ——

/** 逗号、分号还是制表符：看前几行哪个出现得最多且每行数量一致（引号里的不算） */
export function detectDelimiter(text) {
  const sample = String(text || "").slice(0, 64 * 1024);
  let best = ",";
  let bestScore = -1;
  for (const d of [",", ";", "\t"]) {
    const counts = [];
    let n = 0;
    let quoted = false;
    for (let i = 0; i < sample.length && counts.length < 20; i++) {
      const c = sample[i];
      if (c === '"') quoted = !quoted;
      else if (!quoted && c === d) n++;
      else if (!quoted && c === "\n") { counts.push(n); n = 0; }
    }
    if (n) counts.push(n);
    const lines = counts.filter((x) => x > 0);
    if (!lines.length) continue;
    const same = lines.filter((x) => x === lines[0]).length / counts.length;
    const score = same * 1000 + lines[0];
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

/**
 * RFC 4180 风格：带引号的字段里可以有分隔符、换行和 "" 转义。返回 rows（字符串数组）和 lines（每条记录在原文件里从第几行开始，1 起）。
 * 引号不成对时 error = "quote"（界面切到原文）。maxRows 之后不再存（只数 total）。
 */
export function parseCsv(text, delimiter = ",", maxRows = Infinity) {
  const s = String(text || "");
  const rows = [];
  const lines = [];
  let total = 0;
  let row = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let start = 1;
  let i = s.charCodeAt(0) === 0xfeff ? 1 : 0;
  const push = () => {
    row.push(field);
    field = "";
  };
  const end = () => {
    push();
    if (!(row.length === 1 && row[0] === "")) {
      total++;
      if (rows.length < maxRows) { rows.push(row); lines.push(start); }
    }
    row = [];
  };
  for (; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else {
        if (c === "\n") line++;
        field += c;
      }
      continue;
    }
    if (c === '"' && field === "") quoted = true;
    else if (c === delimiter) push();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      end();
      line++;
      start = line;
    } else field += c;
  }
  if (quoted) return { rows, lines, total, error: "quote" };
  if (field !== "" || row.length) end();
  return { rows, lines, total };
}

/** 数字：允许千分位逗号、负号、小数点、百分号；不是数字时 NaN */
export function numValue(v) {
  const s = String(v ?? "").trim();
  if (!/^[-+]?(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?%?$/.test(s) || !/\d/.test(s)) return NaN;
  return Number(s.replace(/[,%]/g, ""));
}

/** 非空单元格九成以上是数字的列：右对齐、按数值排 */
export function numericColumns(rows, columns) {
  const out = [];
  for (let c = 0; c < columns; c++) {
    let filled = 0;
    let nums = 0;
    for (const r of rows) {
      const v = r[c];
      if (v == null || String(v).trim() === "") continue;
      filled++;
      if (!Number.isNaN(numValue(v))) nums++;
    }
    out.push(filled > 0 && nums / filled >= 0.9);
  }
  return out;
}

/** 当前显示的行（排序、搜索之后）写回 CSV：带表头，含逗号、引号、换行的字段加引号 */
export function toCsv(rows) {
  const cell = (v) => {
    const s = String(v ?? "");
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\n");
}

// —— JSON ——

/** JSON 从哪个位置开始不对（严格按 JSON 语法走一遍，只记位置不建值）；合法时 -1 */
export function jsonErrorPos(text) {
  const s = String(text);
  let i = 0;
  const ws = () => { while (i < s.length && " \t\n\r".includes(s[i])) i++; };
  const fail = () => { throw i; };
  const lit = (w) => { if (s.startsWith(w, i)) i += w.length; else fail(); };
  const str = () => {
    i++;
    while (i < s.length && s[i] !== '"') {
      if (s[i] === "\\") { i++; if (s[i] === "u") { if (!/^[0-9a-fA-F]{4}$/.test(s.slice(i + 1, i + 5))) fail(); i += 4; } else if (!'"\\/bfnrt'.includes(s[i] ?? "x")) fail(); }
      else if (s.charCodeAt(i) < 0x20) fail();
      i++;
    }
    if (s[i] !== '"') fail();
    i++;
  };
  const num = () => {
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(s.slice(i, i + 400));
    if (!m) fail();
    i += m[0].length;
  };
  const value = (depth) => {
    if (depth > 4000) fail();
    ws();
    const c = s[i];
    if (c === "{") {
      i++; ws();
      if (s[i] === "}") { i++; return; }
      for (;;) {
        ws(); if (s[i] !== '"') fail(); str(); ws(); if (s[i] !== ":") fail(); i++; value(depth + 1); ws();
        if (s[i] === ",") { i++; continue; }
        if (s[i] === "}") { i++; return; }
        fail();
      }
    }
    if (c === "[") {
      i++; ws();
      if (s[i] === "]") { i++; return; }
      for (;;) {
        value(depth + 1); ws();
        if (s[i] === ",") { i++; continue; }
        if (s[i] === "]") { i++; return; }
        fail();
      }
    }
    if (c === '"') return str();
    if (c === "t") return lit("true");
    if (c === "f") return lit("false");
    if (c === "n") return lit("null");
    return num();
  };
  try {
    value(0);
    ws();
    return i < s.length ? i : -1;
  } catch (at) {
    return typeof at === "number" ? at : 0;
  }
}

/** 「第 {行} 行附近有格式错误」：引擎报了行号或位置就用，否则自己找出错的位置 */
export function jsonErrorLine(text, error) {
  const msg = String(error?.message || "");
  const ln = /line (\d+)/i.exec(msg);
  if (ln) return Number(ln[1]);
  const pos = /position (\d+)/i.exec(msg);
  const at = pos ? Number(pos[1]) : jsonErrorPos(text);
  return String(text).slice(0, Math.max(0, at)).split("\n").length;
}

/**
 * 格式化后的行（两格缩进）：每个对象 / 数组记一个节点（id、子项数、开始行和结束行），折叠时把中间的行藏起来。
 * 行：{ depth, key?, open?: id, close?: id, value?: [type, text], comma, n }
 */
export function jsonLines(value) {
  const lines = [];
  const nodes = [];
  const walk = (v, depth, key, comma) => {
    const box = v && typeof v === "object";
    if (!box) {
      const type = v === null ? "null" : typeof v;
      lines.push({ depth, key, value: [type, type === "string" ? JSON.stringify(v) : String(v)], comma });
      return;
    }
    const arr = Array.isArray(v);
    const entries = arr ? v.map((x, i) => [undefined, x, i]) : Object.entries(v).map(([k, x], i) => [k, x, i]);
    if (!entries.length) {
      lines.push({ depth, key, value: ["punct", arr ? "[]" : "{}"], comma });
      return;
    }
    const id = nodes.length;
    const node = { id, depth, count: entries.length, arr, start: lines.length, end: -1 };
    nodes.push(node);
    lines.push({ depth, key, open: id, bracket: arr ? "[" : "{", comma: false });
    for (const [k, x, i] of entries) walk(x, depth + 1, k, i < entries.length - 1);
    node.end = lines.length;
    lines.push({ depth, close: id, bracket: arr ? "]" : "}", comma });
  };
  walk(value, 0, undefined, false);
  lines.forEach((l, i) => (l.n = i + 1));
  return { lines, nodes };
}

/** 超过 5000 行时默认只展开前两层：深度 ≥ 2 的节点先折起来 */
export function defaultCollapsed({ lines, nodes }) {
  return new Set(lines.length > 5000 ? nodes.filter((n) => n.depth >= 2).map((n) => n.id) : []);
}

// —— 着色 ——

/**
 * highlight.js 的结果按行切开：跨行的 <span> 在行尾关上、下一行开头重新打开，每行都是完整的 HTML。
 * 输入里的文字已经由 highlight.js 转义过，这里只处理它自己生成的 <span class="…"> 和 </span>。
 */
export function splitHighlighted(html) {
  const out = [];
  const open = [];
  let cur = "";
  const re = /<span class="[^"]*">|<\/span>|\n/g;
  let last = 0;
  for (let m; (m = re.exec(html)); ) {
    cur += html.slice(last, m.index);
    last = re.lastIndex;
    if (m[0] === "\n") {
      out.push(cur + "</span>".repeat(open.length));
      cur = open.join("");
    } else if (m[0] === "</span>") {
      open.pop();
      cur += m[0];
    } else {
      open.push(m[0]);
      cur += m[0];
    }
  }
  out.push(cur + html.slice(last));
  return out;
}

export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// —— Markdown ——

/** 标题在原文的第几行（1 起，跳过代码块）：预览和原文之间切换时按标题对齐位置，大纲也用它 */
export function headingLines(src) {
  const out = [];
  let fence = "";
  String(src || "").replace(/\r\n?/g, "\n").split("\n").forEach((l, i) => {
    const f = /^ {0,3}(`{3,}|~{3,})/.exec(l);
    if (f) {
      if (!fence) fence = f[1][0].repeat(f[1].length);
      else if (l.trim().startsWith(fence)) fence = "";
      return;
    }
    if (fence) return;
    const h = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l);
    if (h && h[2]) out.push({ level: h[1].length, text: h[2].replace(/[*_`~]|\[([^\]]*)\]\([^)]*\)/g, "$1"), line: i + 1 });
  });
  return out;
}

// —— 时间 ——

/** 「+」菜单里交付的时间：今天「12:40」、昨天、更早的日期；返回 [种类, 值] 由界面套文案 */
export function deliveredWhen(at, now = Date.now()) {
  const d = new Date(at);
  const today = new Date(now);
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(today) - day(d)) / 86_400_000);
  if (diff <= 0) return ["time", `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`];
  if (diff === 1) return ["yesterday", ""];
  return ["date", ""];
}
