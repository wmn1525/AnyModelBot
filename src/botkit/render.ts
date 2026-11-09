/**
 * 约束检查的渲染部分：用示例数据把界面真实渲染出来，看浅色、深色、390px 宽度有没有报错、空白、溢出和对比度问题。
 * 截图留在 <目录>/.check/，打包时用作发现页缩略图。用 Playwright，不是 App 的依赖，CI 和本机按需安装。
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { serveBotAppStatic } from "./static.js";
import type { BotCatalog } from "./catalog.js";
import { samplePath, type BotManifest, type Issue } from "./format.js";

/** 模拟父页面：用示例数据回应桥接请求 */
const harness = (src: string, sample: string, messages: string) => `<!doctype html><meta charset="utf-8"><style>html,body,iframe{margin:0;width:100%;height:100%;border:0}</style>
<iframe id="f" sandbox="allow-scripts allow-forms" src="${src}"></iframe><script>
const f=document.getElementById('f');const q=new URLSearchParams(location.search);window.__errors=[];window.__rendered=false;
const env={lang:q.get('lang')||'zh-CN',theme:q.get('theme')||'light',text:'md',motion:'off',sample:true,messages:${messages},bot:{id:null,name:'',avatar:''}};
const sample=${sample};
addEventListener('message',(e)=>{if(e.source!==f.contentWindow||!e.data||e.data.amb!==1)return;const m=e.data;const r=(x)=>e.source.postMessage({amb:1,id:m.id,result:x},'*');
if(m.method==='init')r(env);else if(m.method==='readFile')r({path:m.params.path,json:sample,issues:[]});else if(m.method==='reportError'){window.__errors.push(m.params.message);r(true)}else if(m.method==='rendered'){window.__rendered=true;r(true)}else r(true)});
</script>`;

/** 在 iframe 里跑：没有内容、横向溢出、文字对比度不够 */
const INSPECT = `(() => {
  const issues = [];
  const body = document.body;
  if (!(body.innerText || '').trim() && !document.querySelector('img,svg,canvas')) issues.push('blank');
  if (document.documentElement.scrollWidth > window.innerWidth + 1) issues.push('overflow');
  const parse = (c) => { const m = /rgba?\\(([^)]+)\\)/.exec(c); if (!m) return null; const p = m[1].split(/[ ,/]+/).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] }; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const pageBg = document.documentElement.getAttribute('data-theme') === 'dark' ? { r: 26, g: 26, b: 26, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a >= 0.9) return c; } return pageBg; };
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  let low = 0;
  while (walker.nextNode()) {
    const el = walker.currentNode.parentElement;
    if (!walker.currentNode.textContent.trim() || !el || !el.offsetParent) continue;
    const fg = parse(getComputedStyle(el).color);
    if (!fg) continue;
    const a = lum(fg), b = lum(bgOf(el));
    if ((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) < 3) low++;
  }
  if (low) issues.push('contrast:' + low);
  return issues;
})()`;

export async function renderCheck(dir: string, manifest: BotManifest, uiRoot: string, vendor: Record<string, string>): Promise<Issue[]> {
  let chromium: any;
  try {
    // 可选依赖：npm i --no-save playwright && npx playwright install chromium
    ({ chromium } = await (Function('return import("playwright")')() as Promise<any>));
  } catch {
    return [{ rule: "render.playwright", message: "渲染检查需要 Playwright：npm i --no-save playwright && npx playwright install chromium" }];
  }
  const catalog = { get: (id: string) => (id === manifest.id ? { dev: path.resolve(dir) } : undefined), uiDirIfPresent: () => undefined, thumb: async () => undefined } as unknown as BotCatalog;
  const src = `/amb/botapp/d/${manifest.id}/index.html`;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    if (serveBotAppStatic(req, res, url, { uiDir: uiRoot, vendor, catalog })) return;
    const lang = url.searchParams.get("lang") || "zh-CN";
    const messages = fs.readFileSync(path.join(dir, "ui", "locales", `${lang}.json`), "utf8");
    const sample = fs.readFileSync(samplePath(dir, lang), "utf8");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(harness(src, sample, messages));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as AddressInfo).port;
  const issues: Issue[] = [];
  const out = path.join(dir, ".check");
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const [name, theme, width, height, lang] of [["light", "light", 1200, 750, "zh-CN"], ["dark", "dark", 1200, 750, "zh-CN"], ["mobile", "light", 390, 780, "zh-CN"], ["mobile-en", "light", 390, 780, "en"]] as const) {
      const page = await browser.newPage({ viewport: { width, height } });
      const errors: string[] = [];
      page.on("pageerror", (e: Error) => errors.push(e.message));
      page.on("console", (m: any) => m.type() === "error" && errors.push(m.text()));
      await page.goto(`http://127.0.0.1:${port}/?theme=${theme}&lang=${lang}`);
      await page.waitForFunction("window.__rendered === true", undefined, { timeout: 10_000 }).catch(() => errors.push("界面没有调用 mount"));
      await page.waitForTimeout(300);
      const frame = page.frames().find((f: any) => f !== page.mainFrame());
      const found: string[] = frame ? await frame.evaluate(INSPECT) : ["blank"];
      const reported: string[] = await page.evaluate("window.__errors");
      for (const e of [...errors, ...reported]) issues.push({ rule: "render.error", message: `${name}：${e}`, file: "ui" });
      for (const f of found) issues.push({ rule: `render.${f.split(":")[0]}`, message: f.startsWith("contrast") ? `${name}：有 ${f.split(":")[1]} 处文字对比度不够` : f === "overflow" ? `${name}：内容横向溢出` : `${name}：界面是空白的`, file: "ui" });
      await page.screenshot({ path: path.join(out, `${name}.png`) });
      await page.close();
    }
  } finally {
    await browser.close();
    server.closeAllConnections();
    server.close();
  }
  return issues;
}
