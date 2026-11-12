import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.dirname(site);
const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
const output = path.join(root, "release", "okbot-site-html-" + version);
const screenshots = path.join(root, "test-results", "okbot-site");
fs.mkdirSync(screenshots, { recursive: true });
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".avif": "image/avif", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };
const server = http.createServer((req, res) => {
  const file = path.resolve(output, "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname));
  if (file !== output && !file.startsWith(output + path.sep)) { res.writeHead(403).end(); return; }
  const target = [file, path.join(file, "index.html"), file + ".html"].find(p => fs.existsSync(p) && fs.statSync(p).isFile());
  if (!target) { res.writeHead(404).end(); return; }
  res.writeHead(200, { "Content-Type": types[path.extname(target)] || "application/octet-stream" });
  fs.createReadStream(target).pipe(res);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : process.platform === "win32" ? { channel: "msedge" } : {}) });
const problems = [];
let checked = 0;
try {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("pageerror", error => problems.push(error.message));
  page.on("response", response => { if (response.url().startsWith(origin) && response.status() >= 400) problems.push(response.status() + " " + response.url()); });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    for (const lang of ["", "en", "ja", "ko", "ru"]) {
      for (const view of ["", "download", "pricing", "privacy", "partners"]) {
        const pathname = "/" + [lang, view].filter(Boolean).join("/");
        const response = await page.goto(origin + pathname, { waitUntil: "networkidle" });
        assert.equal(response.status(), 200);
        await page.evaluate(() => document.fonts.ready);
        assert((await page.title()).includes("okbot"), pathname + " title");
        const dimensions = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
        assert(dimensions.content <= dimensions.viewport + 1, pathname + " overflow at " + width + ": " + JSON.stringify(dimensions));
        const text = await page.locator("body").innerText();
        assert(!/Modelflare|modelflare\.dev|anymodel\.bot/.test(text), pathname + " upstream branding");
        if (!view || view === "pricing") assert(text.includes("okinto"), pathname + " AI provider");
        if (view === "download") {
          const urls = await page.locator("a[data-dl-platform]").evaluateAll(links => links.map(link => link.href));
          assert(urls.length >= 4);
          assert(urls.every(url => url.startsWith("https://github.com/wmn1525/AnyModelBot/releases/download/") && url.includes("/okbot-")));
        }
        if (!lang && !view) {
          await page.screenshot({ path: path.join(screenshots, "home-" + width + ".png"), fullPage: width === 1440 });
          await page.locator('[data-open-dialog="demo-tour"]').click();
          assert(await page.locator("#demo-tour").evaluate(dialog => dialog.open));
          assert((await page.locator("#tour-title").innerText()).includes("okbot"));
          await page.locator('#demo-tour [data-close-dialog]').click();
          if (width === 1440) {
            await page.locator('.nav .theme-toggle').click();
            await page.locator('.nav [data-theme-set="light"]').click();
            assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
            await page.screenshot({ path: path.join(screenshots, "home-light.png") });
            await page.locator('.nav .theme-toggle').click();
            await page.locator('.nav [data-theme-set="dark"]').click();
          }
        }
        if (!lang && view === "pricing") {
          const calc = page.locator("#calc"); await calc.scrollIntoViewIfNeeded();
          await page.waitForFunction(() => !document.querySelector("#calc astro-island[ssr]"));
          const inputs = page.locator('input[type="range"]');
          assert(await inputs.count() >= 3, "Calculator did not hydrate");
          const before = await page.locator('.calc').innerText();
          await inputs.first().fill("100"); await inputs.first().dispatchEvent("input");
          await page.waitForFunction(before => document.querySelector(".calc").innerText !== before, before);
          const after = await page.locator('.calc').innerText();
          assert.notEqual(before, after, "Calculator did not react to usage change");
          await page.screenshot({ path: path.join(screenshots, "pricing-" + width + ".png") });
        }
        checked++;
      }
    }
  }
  assert.deepEqual(problems, []);
  console.log(JSON.stringify({ checked, widths: [1440, 390], errors: problems, screenshots }, null, 2));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
