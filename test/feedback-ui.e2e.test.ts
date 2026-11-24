/**
 * 需求与反馈的界面（真实浏览器）：发现页的企业分区、同一弹窗里的三个分类、角色不代选、留联默认不同意、
 * 预览里的机器标签、日志默认不勾、窄窗不横向滚动，以及草稿只落在本机受保护的文件里、不含联系许可。
 * 这里用外部网关启动（不能在应用内建单），发送和回执由 test/account.test.ts 对着假的 Modelflare 覆盖。
 * 没有浏览器的最小 CI 镜像上跳过。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { App } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { listen, signIn } from "./helpers.js";

const require = createRequire(import.meta.url);
let chromium: any;
try { ({ chromium } = require("playwright")); }
catch { try { ({ chromium } = require(require.resolve("playwright-core", { paths: [path.join(import.meta.dirname, "../site")] }))); } catch { /* Browser QA is optional on minimal CI images. */ } }
const chrome = process.env.AMB_TEST_CHROME || chromium?.executablePath();
const browserAvailable = !!chromium && chrome && fs.existsSync(chrome);
let app: App, llm: Awaited<ReturnType<typeof listen>>, root: string, base: string, browser: any;

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "amb-feedback-e2e-"));
  llm = await listen(async (_req, res) => void res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ data: [{ id: "mock-model", object: "model" }] })));
  app = new App(loadConfig({ dataDir: root, env: { AMB_MAGPIE_BASE_URL: llm.url + "/v1", AMB_MAGPIE_API_KEY: "test-key", AMB_UI_PORT: "0", AMB_AGENT: "off", AMB_WEIXIN_API_BASE: "http://127.0.0.1:9" } }), { printQrToTerminal: false });
  await app.start();
  app.store.createBot({ id: "film", name: "Film Studio" });
  base = app.web!.url.replace(/\/$/, "");
  if (browserAvailable) browser = await chromium.launch({ executablePath: chrome, args: ["--no-sandbox"] });
});
afterAll(async () => { await browser?.close(); await app?.stop(); await llm?.close(); fs.rmSync(root, { recursive: true, force: true }); });

describe.skipIf(!browserAvailable)("需求与反馈界面", () => {
  it("发现页的企业咨询、三个分类、留联和预览按规格工作，草稿不含联系许可", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: "zh-CN" });
    await signIn(page, base);
    const errors: string[] = [];
    page.on("pageerror", (e: Error) => errors.push(e.message));
    await page.addInitScript(() => { try { localStorage.setItem("amb-lang", "zh-CN"); } catch { /* 私密窗口 */ } });
    try {
      await page.goto(`${base}/#/discover`);
      await page.waitForSelector(".discover-biz", { timeout: 15_000 });
      expect(await page.locator(".discover-biz-card").count()).toBe(6);

      // 区域主动作：只打开企业分类，不带场景、角色或联系方式
      await page.click(".discover-biz-action");
      await page.waitForSelector(".fb-sheet");
      expect(await page.locator(".fb-tab.on").innerText()).toBe("企业与合作");
      expect(await page.locator(".fb-scenario").count()).toBe(0);
      expect(await page.locator(".fb-role input:checked").count()).toBe(0);
      expect(await page.locator(".fb-biz-link").getAttribute("href")).toBe("https://modelflare.dev/business-contact");
      await page.keyboard.press("Escape");
      await page.waitForSelector(".fb-sheet", { state: "detached" });

      // 场景卡片：可编辑模板 + 可移除的场景上下文，角色仍不代选；没选角色就预览会报错
      await page.locator(".discover-biz-card").first().click();
      await page.waitForSelector(".fb-scenario");
      expect((await page.inputValue("#fb-desc-enterprise")).split("\n")).toEqual(["我想了解客户跟进、商机整理和合同查询。", "目前使用的应用：[请补充]", "希望先解决的问题：[请补充]"]);
      await page.click(".fb-review-row .fb-link");
      expect(await page.locator(".fb-roles [role=alert]").innerText()).toBe("请选择角色。");

      // 切到使用场景：奖励提示只在这里；展开留联不等于同意；外部网关没有发送主按钮
      await page.locator(".fb-tab").first().click();
      expect(await page.locator(".fb-reward").count()).toBe(1);
      await page.fill("#fb-desc-use_case", "我每周都要把多个表格整理成销售周报");
      await page.locator(".fb-fold", { hasText: "联系方式" }).click();
      expect(await page.locator(".fb-contact input[type=checkbox]").isChecked()).toBe(false);
      await page.locator(".fb-contact input[type=checkbox]").check();
      expect(await page.locator(".fb-radio.off input").isDisabled()).toBe(true);
      await page.locator(".fb-radio").nth(1).locator("input").check();
      await page.selectOption(".fb-contact-kind", "wechat");
      await page.fill(".fb-contact-row input", "wx_sales_01");
      expect(await page.locator(".sheet-footer .btn.primary").count()).toBe(0);

      // 预览：同一窗口、没有可编辑的分类，正文带许可和渠道标签，联系值完整
      await page.click(".fb-review-row .fb-link");
      await page.waitForSelector(".fb-body");
      const body = await page.locator(".fb-body").innerText();
      expect(body).toContain("[contact_consent:true]");
      expect(body).toContain("[contact_method:wechat] wx_sales_01");
      expect(await page.locator(".fb-tabs").count()).toBe(0);
      await page.locator(".sheet-footer .btn", { hasText: "返回修改" }).click();
      expect(await page.locator(".fb-tab.on").innerText()).toBe("使用场景与建议");

      // 遇到问题：日志默认不勾；窄窗不横向滚动
      await page.locator(".fb-tab").nth(1).click();
      await page.click(".fb-diag-head");
      expect(await page.locator(".fb-diag-body input[type=checkbox]").last().isChecked()).toBe(false);
      await page.setViewportSize({ width: 420, height: 800 });
      expect(await page.evaluate(() => { const s = document.querySelector(".fb-sheet .sheet-body") as HTMLElement; return s.scrollWidth - s.clientWidth; })).toBeLessThanOrEqual(1);
      await page.waitForTimeout(900); // 草稿编辑后稍等一下才存
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
    const dir = path.join(root, "feedback-drafts");
    const files = fs.readdirSync(dir).filter((f) => /^[0-9a-f]{32}\.json$/.test(f));
    expect(files).toHaveLength(1);
    const text = fs.readFileSync(path.join(dir, files[0]), "utf8");
    expect(text).toContain("我每周都要把多个表格整理成销售周报");
    expect(text).not.toMatch(/consent/);
    if (process.platform !== "win32") expect(fs.statSync(path.join(dir, files[0])).mode & 0o777).toBe(0o600);
  }, 60_000);
});
