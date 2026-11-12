import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : process.platform === "win32" ? { channel: "msedge" } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent('<style>html,body{margin:0;width:1200px;height:630px;overflow:hidden}</style>' + fs.readFileSync(path.join(site, "public/og/okbot.svg"), "utf8"));
  await page.screenshot({ path: path.join(site, "public/og/okbot.png") });
} finally { await browser.close(); }
console.log("Generated okbot sharing card (1200 x 630 PNG)");
