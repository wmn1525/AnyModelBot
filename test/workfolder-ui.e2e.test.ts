/**
 * 工作文件夹与 ZIP 的界面（真实浏览器，PRD R1、R3、R4、R5）：输入框上方的选择位和下拉、网页端（没有系统选择器）置灰并说明、
 * 拖入 ZIP 的文件卡、逐项拒绝的汇总提示、已发 ZIP 点一下下载原文件。没有浏览器的最小 CI 镜像上跳过。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { crc32 } from "node:zlib";
import { App } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { locateDshRuntime } from "../src/agent/host.js";
import { findAppRoot } from "../src/magpie/supervisor.js";
import { mockOpenAI, signIn } from "./helpers.js";

const require = createRequire(import.meta.url);
let chromium: any;
try { ({ chromium } = require("playwright")); }
catch { try { ({ chromium } = require(require.resolve("playwright-core", { paths: [path.join(import.meta.dirname, "../site")] }))); } catch { /* Browser QA is optional on minimal CI images. */ } }
const chrome = process.env.AMB_TEST_CHROME || chromium?.executablePath();
const browserAvailable = !!chromium && chrome && fs.existsSync(chrome) && !!locateDshRuntime(findAppRoot());

function zip(name: string, content: string): number[] {
  const n = Buffer.from(name), d = Buffer.from(content);
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x800, 6); lh.writeUInt32LE(crc32(d) >>> 0, 14); lh.writeUInt32LE(d.length, 18); lh.writeUInt32LE(d.length, 22); lh.writeUInt16LE(n.length, 26);
  const local = Buffer.concat([lh, n, d]);
  const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x800, 8); ch.writeUInt32LE(crc32(d) >>> 0, 16); ch.writeUInt32LE(d.length, 20); ch.writeUInt32LE(d.length, 24); ch.writeUInt16LE(n.length, 28);
  const cd = Buffer.concat([ch, n]);
  const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(1, 8); e.writeUInt16LE(1, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(local.length, 16);
  return [...Buffer.concat([local, cd, e])];
}

let app: App, llm: Awaited<ReturnType<typeof mockOpenAI>>, root: string, user: string, base: string, browser: any;
let picked = "";

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "amb-folder-e2e-"));
  fs.mkdirSync(path.join(findAppRoot(), "test-results"), { recursive: true });
  user = fs.mkdtempSync(path.join(findAppRoot(), "test-results", "amb-folder-e2e-"));
  llm = await mockOpenAI({ models: ["gpt-4o-mock"], reply: () => "好的，我先看看这个压缩包。" });
  app = new App(loadConfig({ dataDir: root, env: { AMB_MAGPIE_BASE_URL: llm.url + "/v1", AMB_MAGPIE_API_KEY: "test-key", AMB_UI_PORT: "0", AMB_WEIXIN_API_BASE: "http://127.0.0.1:9", AMB_DEFAULT_MODEL: "gpt-4o-mock" } }), { printQrToTerminal: false });
  await app.start();
  base = app.web!.url.replace(/\/$/, "");
  if (browserAvailable) browser = await chromium.launch({ executablePath: chrome, args: ["--no-sandbox"] });
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await app?.stop();
  await llm?.close();
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(user, { recursive: true, force: true });
});

describe.skipIf(!browserAvailable)("工作文件夹与 ZIP 界面", () => {
  it("网页端：选择位置灰并说明要在桌面端选；桌面端：选择、打勾、说明、不使用文件夹", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, locale: "zh-CN" });
    await signIn(page, base);
    await page.addInitScript(() => { try { localStorage.setItem("amb-lang", "zh-CN"); } catch { /* 私密窗口 */ } });
    try {
      // 没有系统目录选择器（命令行 / Docker 打开的网页）
      await page.goto(`${base}/#/chat/default`);
      const chip = page.locator("[data-folder-chip]");
      await chip.waitFor({ timeout: 15_000 });
      expect(await chip.isDisabled()).toBe(true);
      expect(await chip.getAttribute("title")).toBe("请在运行机器人的桌面端选择文件夹");
      expect(await chip.innerText()).toBe("选择文件夹");
      // 桌面版：有系统选择器
      const project = path.join(user, "landing-page");
      fs.mkdirSync(project);
      picked = project;
      (app as any).desktop = { ...(app.desktop ?? {}), pickFolder: async () => picked || undefined };
      await page.reload();
      await chip.waitFor();
      expect(await chip.isDisabled()).toBe(false);
      await chip.click();
      const menu = page.locator(".menu-pop");
      await menu.waitFor();
      expect(await menu.innerText()).toContain("选择时不读取文件；发出指令后，机器人会按指令在这里读写");
      expect(await menu.locator("li", { hasText: "不使用文件夹" }).count()).toBe(0); // 还没选时不显示
      await menu.locator("li", { hasText: "选择文件夹…" }).click();
      await page.waitForFunction(() => document.querySelector("[data-folder-chip]")?.textContent?.includes("landing-page"));
      expect(await chip.getAttribute("title")).toBe(fs.realpathSync(project));
      // 最近文件夹里有它、打勾
      await chip.click();
      await menu.waitFor();
      expect(await menu.locator("li.group").innerText()).toBe("最近文件夹");
      expect(await menu.locator("li.cur").innerText()).toContain("landing-page");
      // 不可选的位置：短提示，原选择不变
      await page.keyboard.press("Escape");
      picked = root;
      await chip.click();
      await menu.locator("li", { hasText: "选择文件夹…" }).click();
      await page.waitForSelector(".toast", { timeout: 5000 });
      expect(await page.locator(".toast").last().innerText()).toContain("不能选择这个位置");
      expect(await chip.innerText()).toContain("landing-page");
      // 不使用文件夹
      await chip.click();
      await menu.locator("li", { hasText: "不使用文件夹" }).click();
      await page.waitForFunction(() => document.querySelector("[data-folder-chip]")?.textContent === "选择文件夹");
    } finally {
      await page.close();
    }
  }, 90_000);

  it("拖入 ZIP：文件卡显示类型和大小；逐项拒绝汇总成一句；已发 ZIP 点一下下载原文件", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, locale: "zh-CN", acceptDownloads: true });
    await signIn(page, base);
    await page.addInitScript(() => { try { localStorage.setItem("amb-lang", "zh-CN"); } catch { /* 私密窗口 */ } });
    const errors: string[] = [];
    page.on("pageerror", (e: Error) => errors.push(e.message));
    try {
      await page.goto(`${base}/#/chat/default`);
      await page.waitForSelector(".composer textarea", { timeout: 15_000 });
      const bytes = zip("报告/数据.csv", "a,b\n1,2\n");
      await page.evaluate(({ bytes }: any) => {
        const dt = new DataTransfer();
        dt.items.add(new File([new Uint8Array(bytes)], "季度资料.zip", { type: "application/zip" }));
        dt.items.add(new File(["%PDF"], "合同.pdf", { type: "application/pdf" }));
        dt.items.add(new File(["Rar!"], "旧版.7z", { type: "" }));
        const el = document.querySelector("section.chat")!;
        for (const t of ["dragenter", "dragover", "drop"]) el.dispatchEvent(new DragEvent(t, { dataTransfer: dt, bubbles: true, cancelable: true }));
      }, { bytes });
      await page.waitForFunction(() => document.querySelector(".composer-note")?.textContent === "部分文件未添加：合同.pdf（格式不支持）、旧版.7z（压缩包仅支持 ZIP）");
      await page.waitForSelector(".att-tray .att-file.ready[data-kind='zip']");
      const card = page.locator(".att-tray .att-file[data-kind='zip']");
      expect(await card.locator(".att-type").innerText()).toBe("ZIP");
      expect(await card.locator(".att-name").textContent()).toBe("季度资料.zip");
      expect(await card.locator(".att-meta").innerText()).toMatch(/^ZIP 压缩包 · \d+ B$/);
      // 只发 ZIP（没有文字）也能发
      await page.locator(".composer .send").click();
      await page.waitForSelector(".msg-row.user .msg-atts .att-save", { timeout: 20_000 });
      const sent = page.locator(".msg-row.user .msg-atts .att-save").last();
      expect(await sent.getAttribute("aria-label")).toBe("季度资料.zip, 下载原文件");
      const [download] = await Promise.all([page.waitForEvent("download"), sent.click()]);
      expect(download.suggestedFilename()).toBe("季度资料.zip");
      expect([...fs.readFileSync(await download.path())]).toEqual(bytes);
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  }, 120_000);
});
