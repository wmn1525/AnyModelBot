import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import type { AddressInfo } from "node:net";
import { serveBotAppStatic } from "../src/web/botapp.js";
import type { BotCatalog } from "../src/botkit/catalog.js";

const require = createRequire(import.meta.url);
let chromium: any;
try { ({ chromium } = require("playwright")); } catch { /* Optional browser checks. */ }
const available = !!chromium && fs.existsSync(chromium.executablePath());
const root = path.join(import.meta.dirname, "..");
const bot = path.join(root, "bots/printfilm");

describe.skipIf(!available)("PRINTFILM sandbox UI", () => {
  let server: http.Server, browser: any, url: string, tmp: string, video: string;
  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "amb-film-ui-"));
    const file = path.join(tmp, "preview.mp4");
    const made = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=64x64:d=0.4", "-c:v", "libx264", file]);
    video = made.status === 0 ? fs.readFileSync(file).toString("base64") : "";
    const preact = path.dirname(path.dirname(require.resolve("preact")));
    const vendor = { "preact.mjs": path.join(preact, "dist/preact.mjs"), "hooks.mjs": path.join(preact, "hooks/dist/hooks.mjs"), "htm.mjs": path.join(path.dirname(require.resolve("htm")), "htm.mjs") };
    const catalog = { get: () => ({ dev: bot }), uiDirIfPresent: () => undefined } as unknown as BotCatalog;
    server = http.createServer((req, res) => {
      const u = new URL(req.url || "/", "http://localhost");
      if (serveBotAppStatic(req, res, u, { uiDir: path.join(root, "ui"), vendor, catalog })) return;
      const lang = ["zh-CN", "en", "ja", "ko", "ru"].includes(u.searchParams.get("lang") || "") ? u.searchParams.get("lang")! : "en";
      const sample = JSON.parse(fs.readFileSync(path.join(bot, `sample.${lang}.json`), "utf8"));
      const messages = JSON.parse(fs.readFileSync(path.join(bot, `ui/locales/${lang}.json`), "utf8"));
      const p = sample.sampleProject, ep = sample.sampleEpisode;
      const live = u.searchParams.has("live");
      if (live) {
        sample.sample = false;
        sample.projects[0].path = "app/project.json";
        p.episodes[0].path = "app/episode.json";
        p.exports.push({ id: "rendered", kind: "video", path: "app/preview.mp4", at: "2026-11-06" });
      }
      res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><html><body style="margin:0"><iframe id="f" sandbox="allow-scripts allow-forms" src="/amb/botapp/d/printfilm/index.html" style="border:0;width:100%;height:100vh"></iframe><script>
        const state=${JSON.stringify(sample)}, project=${JSON.stringify(p)}, episode=${JSON.stringify(ep)};
        window.errors=[];window.actions=[];window.released=0;
        addEventListener('message',e=>{if(e.source!==document.querySelector('iframe').contentWindow||!e.data?.amb)return;
          const m=e.data;let result=true;
          if(m.method==='init') result={lang:${JSON.stringify(lang)},theme:'light',sample:${!live},text:'md',motion:'off',messages:${JSON.stringify(messages)}};
          if(m.method==='readFile')result={json:m.params.path==='app/project.json'?project:m.params.path==='app/episode.json'?episode:state};
          if(m.method==='readMedia')result={blob:new Blob([Uint8Array.from(atob(${JSON.stringify(video)}),x=>x.charCodeAt(0))],{type:'video/mp4'}),handle:'one',size:1000};
          if(m.method==='releaseMedia')window.released++;
          if(m.method==='send')window.actions.push(m.params);
          if(m.method==='reportError')window.errors.push(m.params.message);
          if(m.method==='readImage')result={url:'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMCIgaGVpZ2h0PSIxMCIvPg=='};
          e.source.postMessage({amb:1,id:m.id,result},'*');
        });</script></body></html>`);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    browser = await chromium.launch();
  }, 30_000);
  afterAll(async () => { await browser?.close(); server?.closeAllConnections(); server?.close(); if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); });

  it.each(["zh-CN", "en", "ja", "ko", "ru"])("renders every %s tab at phone width without errors or overflow", async (lang) => {
    const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
    const errors: string[] = [];
    page.on("pageerror", (e: Error) => errors.push(e.message));
    await page.goto(url + "/?lang=" + lang);
    const frame = page.frameLocator("iframe");
    await frame.getByRole("tab").first().waitFor();
    for (let i = 0; i < 7; i++) {
      await frame.getByRole("tab").nth(i).click();
      const overflow = await frame.locator("body").evaluate((body: HTMLElement) => {
        const w = body.ownerDocument.defaultView!.innerWidth;
        return body.ownerDocument.documentElement.scrollWidth <= w + 1 ? [] : [...body.querySelectorAll("*")].filter((e) => e.getBoundingClientRect().right > w + 1 && !e.closest(".pf-canvas-scroll")).map((e) => e.tagName + "." + e.className).slice(0, 12);
      });
      expect(overflow, `${lang} tab ${i}`).toEqual([]);
      expect(await frame.getByRole("tabpanel").innerText()).not.toBe("");
    }
    expect(errors).toEqual([]);
    expect(await page.evaluate("window.errors")).toEqual([]);
    await page.close();
  });

  it("plays structured-cloned video inside the opaque sandbox and releases it", async () => {
    if (!video) return;
    const page = await browser.newPage();
    await page.goto(url + "/?lang=en&live=1");
    const frame = page.frameLocator("iframe");
    await frame.getByRole("tab", { name: "Films & exports", exact: true }).click();
    await frame.getByRole("button", { name: "Preview", exact: true }).click();
    await frame.locator("video").waitFor();
    await page.waitForFunction(() => true);
    const actualFrame = page.frames().find((f: any) => f !== page.mainFrame());
    await actualFrame.waitForFunction("document.querySelector('video')?.readyState > 0");
    expect(await frame.locator("video").evaluate((v: HTMLVideoElement) => v.duration)).toBeGreaterThan(0);
    await frame.getByRole("button", { name: "Close preview", exact: true }).click();
    await page.waitForFunction("window.released === 1");
    await page.close();
  });

  it("sends an actual editable project payload through the bridge", async () => {
    const page = await browser.newPage();
    await page.goto(url + "/?lang=en&live=1");
    const frame = page.frameLocator("iframe");
    await frame.getByRole("tab", { name: "Production settings", exact: true }).click();
    await frame.getByLabel("Target episode count", { exact: true }).fill("12");
    await frame.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.waitForFunction("window.actions.length === 1");
    expect(await page.evaluate("window.actions[0].action")).toMatchObject({ type: "apply", data: { settings: { episodeCount: 12 } } });
    await page.close();
  });
});
