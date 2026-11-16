#!/usr/bin/env node
// 右侧预览的代码着色（ui/components/code-view.js）用 highlight.js 的官方 ES 模块构建（@highlightjs/cdn-assets，开发依赖）。
// 只把核心和常用的约 30 种语言复制进 ui/vendor/hljs/（随界面打包、不进多语言检查），其余语言不进安装包。
// 升级：改 package.json 里 @highlightjs/cdn-assets 的版本，npm install 后运行 node scripts/vendor-hljs.mjs，提交 ui/vendor/hljs。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "node_modules/@highlightjs/cdn-assets");
const OUT = path.join(ROOT, "ui/vendor/hljs");
/** 和 ui/lib/preview-types.js 的 LANGS 一致（那边按扩展名选语言） */
export const HLJS_LANGS = [
  "bash", "c", "cpp", "csharp", "css", "dart", "dockerfile", "go", "gradle", "ini", "java", "javascript", "json", "kotlin", "less",
  "lua", "makefile", "markdown", "php", "plaintext", "properties", "python", "r", "ruby", "rust", "scss", "sql", "swift", "typescript", "xml", "yaml",
];

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const version = JSON.parse(fs.readFileSync(path.join(SRC, "package.json"), "utf8")).version;
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, "languages"), { recursive: true });
  fs.copyFileSync(path.join(SRC, "es/core.min.js"), path.join(OUT, "core.js"));
  for (const lang of HLJS_LANGS) fs.copyFileSync(path.join(SRC, `es/languages/${lang}.min.js`), path.join(OUT, `languages/${lang}.js`));
  fs.copyFileSync(path.join(SRC, "LICENSE"), path.join(OUT, "LICENSE"));
  fs.writeFileSync(path.join(OUT, "VERSION"), `highlight.js ${version} (@highlightjs/cdn-assets, BSD-3-Clause)\n${HLJS_LANGS.join(" ")}\n`);
  console.log(`highlight.js ${version}: core + ${HLJS_LANGS.length} languages → ${path.relative(ROOT, OUT)}`);
}
