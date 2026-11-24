/**
 * 消息图片用作生图参考的界面（真实浏览器，PRD 2026-11-23）：有图才出现、默认关闭的开关；输入框外上方的校验条（只说最优先的一句，
 * 「切换模型」只打开原右下角选择器）；快捷键发送被拦时只重新播报；通过后缩略图标参考序号；纯图片型号的占位；已发消息保留序号和型号。
 * 账号登录与 ModelFlare 能力接口由替身给。没有浏览器的最小 CI 镜像上跳过。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { App } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { mockOpenAI, signIn } from "./helpers.js";
import { parseCapabilities, type CapsSnapshot } from "../src/tools/media/capabilities.js";
import type { GenerationPlan } from "../src/imagegen/generate.js";

const require = createRequire(import.meta.url);
let chromium: any;
try { ({ chromium } = require("playwright")); }
catch { try { ({ chromium } = require(require.resolve("playwright-core", { paths: [path.join(import.meta.dirname, "../site")] }))); } catch { /* Browser QA is optional on minimal CI images. */ } }
const chrome = process.env.AMB_TEST_CHROME || chromium?.executablePath();
const browserAvailable = !!chromium && chrome && fs.existsSync(chrome);
let app: App, llm: Awaited<ReturnType<typeof mockOpenAI>>, root: string, base: string, browser: any;
const ran: GenerationPlan[] = [];
let snap: CapsSnapshot;

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "amb-imgref-e2e-"));
  llm = await mockOpenAI({ models: ["gpt-4o-mock"], reply: () => "好的" });
  app = new App(loadConfig({ dataDir: root, env: { AMB_MAGPIE_BASE_URL: llm.url + "/v1", AMB_MAGPIE_API_KEY: "test-key", AMB_UI_PORT: "0", AMB_AGENT: "off", AMB_WEIXIN_API_BASE: "http://127.0.0.1:9", AMB_DEFAULT_MODEL: "gpt-4o-mock" } }), { printQrToTerminal: false });
  await app.start();
  app.store.createBot({ id: "hua", name: "小画", defaultModel: "gpt-image-2" });
  snap = parseCapabilities({ schema_version: 1, line: "global", expires_in: 600, models: [
    { id: "gpt-image-2", authorized: true, available: true, capabilities: { chat: "unsupported", vision: "unsupported", image_generation: "supported", reference_images: "supported" }, image_generation: { endpoint: "images" },
      reference_images: { encoding: "images_json", max_images: 4, formats: ["png", "jpeg"], max_image_bytes: 20_000_000, max_request_bytes: 64_000_000, dimensions: "none" } },
    { id: "flux-text", authorized: true, available: true, capabilities: { chat: "unsupported", image_generation: "supported", reference_images: "unsupported" }, image_generation: { endpoint: "images" } },
  ] }, { line: "global", account: "acct-1", now: Date.now() })!;
  (app as any).referenceContext = async (_botId: string, conv: string) => {
    const model = app.store.getConversation(conv)?.model || "gpt-image-2";
    return { model, bare: model, accountLogin: true, account: "acct-1", snap, caps: snap.models.get(model) };
  };
  (app.runtime as any).opts.imageGen = {
    plan: async () => undefined,
    run: async (p: GenerationPlan, out: any) => {
      ran.push(p);
      const text = "已取得图片；本次仅返回图片，未执行额外文字或文件任务。";
      app.store.addMessage(p.conversationId, "assistant", text);
      await out.apply({ type: "text", text });
    },
  };
  base = app.web!.url.replace(/\/$/, "");
  if (browserAvailable) browser = await chromium.launch({ executablePath: chrome, args: ["--no-sandbox"] });
});
afterAll(async () => { await browser?.close(); await app?.stop(); await llm?.close(); fs.rmSync(root, { recursive: true, force: true }); });

const pasteImage = (page: any) =>
  page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 320; c.height = 200;
    const g = c.getContext("2d")!;
    g.fillStyle = "#888"; g.fillRect(0, 0, 320, 200);
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/png"));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], "image.png", { type: "image/png" }));
    const ta = document.querySelector(".composer textarea") as HTMLTextAreaElement;
    return ta.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });

describe.skipIf(!browserAvailable)("用作生图参考的界面", () => {
  it("开关、校验条、快捷键、切换模型、参考序号和已发消息按规格工作", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, locale: "zh-CN" });
    page.setDefaultTimeout(8000);
    await signIn(page, base);
    const errors: string[] = [];
    page.on("pageerror", (e: Error) => errors.push(e.message));
    await page.addInitScript(() => { try { localStorage.setItem("amb-lang", "zh-CN"); } catch { /* 私密窗口 */ } });
    try {
      await page.goto(`${base}/#/chat/hua`);
      await page.waitForSelector(".composer textarea", { timeout: 15_000 });
      const ta = page.locator(".composer textarea");
      // 纯图片生成型号：占位改成描述要生成的图片；没有图片时没有开关
      await page.waitForFunction(() => (document.querySelector(".composer textarea") as HTMLTextAreaElement).placeholder === "描述你想生成的图片…");
      expect(await page.locator(".ref-toggle").count()).toBe(0);

      // 加一张图：开关出现在附件统计旁、默认关；纯图片型号带普通图片 → 输入框外一句原因，发送不可用
      await pasteImage(page);
      await page.waitForSelector(".att-tray .att-image.ready img");
      await page.waitForSelector(".ref-toggle .switch");
      expect(await page.locator(".ref-toggle .switch").getAttribute("aria-checked")).toBe("false");
      expect(await page.locator(".ref-toggle label").innerText()).toBe("用作生图参考");
      await page.waitForFunction(() => document.querySelector(".ref-check")?.textContent === "当前模型用于生图，请开启参考图，或切换可处理图片的模型。");
      expect(await page.locator(".composer .send").isDisabled()).toBe(true);
      // 校验条在圆角输入框外、紧贴它的上边缘（是输入框的前一个兄弟，不在输入框里面），不盖住输入框
      const geo = await page.evaluate(() => {
        const bar = document.querySelector(".ref-check")!.getBoundingClientRect();
        const box = document.querySelector(".composer")!.getBoundingClientRect();
        return { inside: !!document.querySelector(".composer .ref-check"), next: document.querySelector(".ref-check")!.nextElementSibling?.classList.contains("composer"), gap: box.top - bar.bottom };
      });
      expect(geo).toMatchObject({ inside: false, next: true });
      expect(geo.gap).toBeGreaterThanOrEqual(0);
      expect(geo.gap).toBeLessThan(16);

      // 打开开关：只设用途（不发消息）；没写文字时先不说，按回车试着发送才在同一位置说「请补充…」，不提交
      await page.locator(".ref-toggle .switch").click();
      await page.waitForFunction(() => document.querySelector(".ref-toggle .switch")?.getAttribute("aria-checked") === "true");
      await page.waitForFunction(() => document.querySelector(".att-tray .att-ref")?.textContent === "参考1");
      expect(await page.locator(".ref-check").count()).toBe(0);
      await ta.focus();
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => document.querySelector(".ref-check")?.textContent === "请补充你想如何生成图片。");
      expect(ran).toHaveLength(0);
      expect(await page.locator(".toast").count()).toBe(0);

      // 换成不接受参考的型号：开关保持开着，原因换成「不支持参考图生图」；「切换模型」只打开原选择器，Esc 关上焦点回到输入框
      await page.evaluate(() => fetch("/amb/api/bots/hua/chat/model", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "flux-text" }) }));
      await ta.fill("换成水彩");
      await page.locator(".composer .model-chip:not(.perm)").click();
      await page.waitForSelector(".model-picker");
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => !document.querySelector(".model-picker"));
      await page.waitForFunction(() => document.querySelector(".ref-check")?.textContent === "当前模型不支持参考图生图，请切换模型。");
      expect(await page.locator(".ref-toggle .switch").getAttribute("aria-checked")).toBe("true");
      if (process.env.AMB_TEST_SHOT_BAR) await page.screenshot({ path: process.env.AMB_TEST_SHOT_BAR });
      await page.locator(".ref-check .ref-switch").click();
      await page.waitForSelector(".model-picker");
      expect(await page.locator(".model-picker").count()).toBe(1);
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => !document.querySelector(".model-picker"));
      await page.waitForFunction(() => document.activeElement === document.querySelector(".composer textarea"));
      expect(await ta.inputValue()).toBe("换成水彩");

      // 换回能参考的型号后发送：一条消息，缩略图带参考序号，下面一行是当时的型号和用途；输入清空、开关随之重置
      await page.evaluate(() => fetch("/amb/api/bots/hua/chat/model", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "gpt-image-2" }) }));
      await page.locator(".composer .model-chip:not(.perm)").click();
      await page.waitForSelector(".model-picker");
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => !document.querySelector(".model-picker"));
      await page.waitForFunction(() => !document.querySelector(".ref-check") && !(document.querySelector(".composer .send") as HTMLButtonElement)?.disabled);
      await ta.focus();
      await page.keyboard.press("Enter");
      await page.waitForSelector(".msg-atts .att-ref");
      expect(await page.locator(".msg-atts .att-ref").innerText()).toBe("参考1");
      await page.waitForSelector(".msg-gen");
      expect(await page.locator(".msg-gen").innerText()).toBe("用作生图参考 · gpt-image-2");
      expect(ran).toHaveLength(1);
      expect(ran[0]).toMatchObject({ mode: "reference", model: "gpt-image-2", prompt: "换成水彩" });
      expect(await ta.inputValue()).toBe("");
      expect(await page.locator(".ref-toggle").count()).toBe(0);
      if (process.env.AMB_TEST_SHOT) await page.screenshot({ path: process.env.AMB_TEST_SHOT });
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  });
});
