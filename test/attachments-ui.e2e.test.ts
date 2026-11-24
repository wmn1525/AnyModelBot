/**
 * 消息附件的界面（真实浏览器）：粘贴图片进待发区且文字和光标不动、真实文件拖入与整批拒绝、移除与键盘、
 * 放大预览（待发和已发共用、Esc 关闭后焦点回缩略图）、只发附件、已发消息的附件组，以及模型不看图时只给一句提示。
 * 没有浏览器的最小 CI 镜像上跳过。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { App } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { mockOpenAI, signIn } from "./helpers.js";

const require = createRequire(import.meta.url);
let chromium: any;
try { ({ chromium } = require("playwright")); }
catch { try { ({ chromium } = require(require.resolve("playwright-core", { paths: [path.join(import.meta.dirname, "../site")] }))); } catch { /* Browser QA is optional on minimal CI images. */ } }
const chrome = process.env.AMB_TEST_CHROME || chromium?.executablePath();
const browserAvailable = !!chromium && chrome && fs.existsSync(chrome);
let app: App, llm: Awaited<ReturnType<typeof mockOpenAI>>, root: string, base: string, browser: any;

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "amb-attach-e2e-"));
  llm = await mockOpenAI({ models: ["gpt-4o-mock", "plain-text-model"], reply: () => "收到，我看过了。" });
  app = new App(loadConfig({ dataDir: root, env: { AMB_MAGPIE_BASE_URL: llm.url + "/v1", AMB_MAGPIE_API_KEY: "test-key", AMB_UI_PORT: "0", AMB_AGENT: "off", AMB_WEIXIN_API_BASE: "http://127.0.0.1:9", AMB_DEFAULT_MODEL: "gpt-4o-mock" } }), { printQrToTerminal: false });
  await app.start();
  app.store.createBot({ id: "ming", name: "小明", defaultModel: "gpt-4o-mock" });
  app.store.createBot({ id: "lan", name: "小蓝", defaultModel: "plain-text-model" });
  base = app.web!.url.replace(/\/$/, "");
  if (browserAvailable) browser = await chromium.launch({ executablePath: chrome, args: ["--no-sandbox"] });
});
afterAll(async () => { await browser?.close(); await app?.stop(); await llm?.close(); fs.rmSync(root, { recursive: true, force: true }); });

/** 在页面里造一张真的 PNG，当成剪贴板图片粘贴进输入框；text 给了就同时带普通文字 */
const pasteImage = (page: any, opts: { w?: number; h?: number; text?: string; fileName?: string } = {}) =>
  page.evaluate(async ({ w, h, text, fileName }: any) => {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d")!;
    g.fillStyle = "#888"; g.fillRect(0, 0, w, h); g.fillStyle = "#222"; g.fillRect(4, 4, w / 2, h / 2);
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/png"));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], fileName, { type: "image/png" }));
    if (text) dt.setData("text/plain", text);
    const ta = document.querySelector(".composer textarea") as HTMLTextAreaElement;
    return ta.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, { w: opts.w ?? 320, h: opts.h ?? 200, text: opts.text ?? "", fileName: opts.fileName ?? "image.png" });

/** 把几份文件当成系统文件拖进对话主区（phase：只进入不松开 / 松开） */
const dragFiles = (page: any, files: Array<{ name: string; type?: string; text?: string; bytes?: number }>, phase: "enter" | "drop" | "leave" = "drop", target = "section.chat") =>
  page.evaluate(({ files, phase, target }: any) => {
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(new File([f.bytes ? new Uint8Array(f.bytes) : f.text ?? "x"], f.name, { type: f.type ?? "" }));
    const el = document.querySelector(target)!;
    const fire = (type: string, extra: any = {}) => el.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true, ...extra }));
    fire("dragenter");
    const over = fire("dragover");
    if (phase === "drop") fire("drop");
    if (phase === "leave") fire("dragleave", { relatedTarget: null });
    return { overPrevented: !over };
  }, { files, phase, target });

describe.skipIf(!browserAvailable)("消息附件界面", () => {
  it("粘贴、拖入、移除、放大、发送和已发样式按规格工作", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, locale: "zh-CN" });
    await signIn(page, base);
    const errors: string[] = [];
    page.on("pageerror", (e: Error) => errors.push(e.message));
    await page.addInitScript(() => { try { localStorage.setItem("amb-lang", "zh-CN"); } catch { /* 私密窗口 */ } });
    try {
      await page.goto(`${base}/#/chat/ming`);
      await page.waitForSelector(".composer textarea", { timeout: 15_000 });
      const ta = page.locator(".composer textarea");

      // —— 粘贴图片：进文字上方的待发区；原有文字、选区和光标不动，不把文件名贴进去 ——
      await ta.fill("请比较这几张页面截图。");
      await page.evaluate(() => (document.querySelector(".composer textarea") as HTMLTextAreaElement).setSelectionRange(3, 5));
      expect(await pasteImage(page)).toBe(false); // 默认行为被拦下（没有真正的文字要贴）
      await page.waitForSelector(".att-tray .att-image.ready img");
      expect(await ta.inputValue()).toBe("请比较这几张页面截图。");
      expect(await page.evaluate(() => { const t = document.querySelector(".composer textarea") as HTMLTextAreaElement; return [t.selectionStart, t.selectionEnd]; })).toEqual([3, 5]);
      expect(await page.locator(".att-count").innerText()).toBe("1 张图片 · 1/8 个附件");
      expect(await page.locator(".att-count").getAttribute("title")).toBe("附件将保存到运行机器人的设备");
      // 图片只有缩略图：没有名字、大小
      expect((await page.locator(".att-tray .att-image").innerText()).trim()).toBe("");
      expect(await page.locator(".att-tray .att-image .att-open").getAttribute("aria-label")).toBe("图片1，点击放大");
      // 图片 + 真正的普通文字：文字照常粘贴（不拦默认行为），图片另外加入；同一内容再贴一次仍是新附件
      expect(await pasteImage(page, { text: "补充说明" })).toBe(true);
      await page.waitForFunction(() => document.querySelectorAll(".att-tray .att-image.ready").length === 2);
      // 普通文件的复制对象不当附件
      await page.evaluate(() => {
        const dt = new DataTransfer();
        dt.items.add(new File(["x"], "报告.pdf", { type: "application/pdf" }));
        dt.setData("text/plain", "报告.pdf");
        document.querySelector(".composer textarea")!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
      });
      expect(await page.locator(".composer-note").innerText()).toBe("暂不支持粘贴文件，请直接拖入文件");
      expect(await page.locator(".att-tray .att").count()).toBe(2);
      expect(await ta.inputValue()).toBe("请比较这几张页面截图。");

      // —— 连续粘到 4 张；第 5 张明确超限，已有输入不动 ——
      await pasteImage(page); await pasteImage(page);
      await page.waitForFunction(() => document.querySelectorAll(".att-tray .att-image.ready").length === 4);
      await pasteImage(page);
      await page.waitForFunction(() => document.querySelector(".composer-note")?.textContent === "最多8个附件，其中图片最多4张");
      expect(await page.locator(".att-tray .att").count()).toBe(4);

      // —— 拖入：进入时出遮罩、输入框高亮；拖出取消；Esc 取消后这次拖动不再唤起 ——
      const entered = await dragFiles(page, [{ name: "需求说明.md", text: "# 需求" }], "enter");
      expect(entered.overPrevented).toBe(true);
      await page.waitForSelector(".att-drop");
      expect(await page.locator(".att-drop b").innerText()).toBe("松开以添加到当前对话");
      expect(await page.locator(".att-drop").innerText()).toContain("拖出取消，不会自动发送");
      expect(await page.locator(".composer.drag").count()).toBe(1);
      await page.keyboard.press("Escape");
      await page.waitForSelector(".att-drop", { state: "detached" });
      await dragFiles(page, [{ name: "需求说明.md", text: "# 需求" }], "enter");
      expect(await page.locator(".att-drop").count()).toBe(0);
      await dragFiles(page, [{ name: "需求说明.md", text: "# 需求" }], "drop"); // 取消过的这次拖动松开也不加
      expect(await page.locator(".att-tray .att").count()).toBe(4);
      await page.waitForTimeout(1600);
      // 侧栏不接收：默认行为被拦（不会打开文件），也不出遮罩、不加附件
      const side = await dragFiles(page, [{ name: "a.md", text: "x" }], "drop", "nav, aside, .sidebar");
      expect(side.overPrevented).toBe(true);
      expect(await page.locator(".att-tray .att").count()).toBe(4);
      // 输入框里拖动文字（不带文件）不出遮罩
      await page.evaluate(() => { const dt = new DataTransfer(); dt.setData("text/plain", "abc"); document.querySelector("section.chat")!.dispatchEvent(new DragEvent("dragenter", { dataTransfer: dt, bubbles: true })); });
      expect(await page.locator(".att-drop").count()).toBe(0);
      // 逐项核对（PRD R4）：只有一份不支持的，给它的完整原因；几份都不支持的，汇总名字和原因；文件夹提示用上方的选择文件夹
      await dragFiles(page, [{ name: "b.pdf", type: "application/pdf", text: "%PDF" }]);
      await page.waitForFunction(() => document.querySelector(".composer-note")?.textContent === "暂不支持此文件格式，请使用 Markdown、HTML、TXT 或 ZIP");
      await dragFiles(page, [{ name: "b.pdf", type: "application/pdf", text: "%PDF" }, { name: "c.rar", text: "Rar!" }]);
      await page.waitForFunction(() => document.querySelector(".composer-note")?.textContent === "未添加：b.pdf（格式不支持）、c.rar（压缩包仅支持 ZIP）");
      expect(await page.locator(".att-tray .att").count()).toBe(4);
      // 两份文本文件：按顺序加入，文件卡是类型方块 + 文件名 + 类型和大小 + ×
      await dragFiles(page, [{ name: "需求说明.md", text: "# 需求\n正文" }, { name: "页面说明.html", text: "<html><script>window.__ran = 1</script><body>页面</body></html>" }]);
      await page.waitForFunction(() => document.querySelectorAll(".att-tray .att-file.ready").length === 2);
      expect(await page.locator(".att-tray .att-file .att-name").allTextContents()).toEqual(["需求说明.md", "页面说明.html"]);
      expect(await page.locator(".att-tray .att-file").first().locator(".att-meta").innerText()).toMatch(/^MD · \d+ B$/);
      expect(await page.locator(".att-tray .att-file .att-type").allInnerTexts()).toEqual(["MD", "HTML"]);
      expect(await page.evaluate(() => (window as any).__ran)).toBeUndefined(); // HTML 只当文字，不执行
      expect(await page.locator(".att-count").innerText()).toBe("4 张图片 · 6/8 个附件");
      // 待发区最多两行，再多在区内滚动；输入框没有被挤出窗口
      const tray = await page.evaluate(() => { const el = document.querySelector(".att-tray")!; return { h: el.clientHeight, overflow: getComputedStyle(el).overflowY }; });
      expect(tray.overflow).toBe("auto");
      expect(tray.h).toBeLessThanOrEqual(190);

      // —— 放大预览：窗口内的居中遮罩，只有关闭 ×；Esc 关闭后焦点回到点的那张缩略图 ——
      const thumb = page.locator(".att-tray .att-image .att-open").first();
      await thumb.click();
      await page.waitForSelector(".att-lightbox");
      const box = await page.evaluate(() => { const p = document.querySelector(".att-lightbox-panel")!.getBoundingClientRect(); const i = document.querySelector(".att-lightbox-stage img")!.getBoundingClientRect(); return { pw: p.width, ph: p.height, iw: i.width, ih: i.height, vw: innerWidth, vh: innerHeight, focus: document.activeElement?.tagName }; });
      expect(box.pw).toBeLessThanOrEqual(box.vw * 0.9 + 1);
      expect(box.ph).toBeLessThanOrEqual(box.vh * 0.9 + 1);
      expect([Math.round(box.iw), Math.round(box.ih)]).toEqual([320, 200]); // 小图按自然大小，不放大
      expect(box.focus).toBe("IMG");
      expect((await page.locator(".att-lightbox").innerText()).trim()).toBe(""); // 没有文件名、大小、百分比
      expect(await page.locator(".att-lightbox button").count()).toBe(1);
      expect(await page.locator(".att-lightbox-close").getAttribute("aria-label")).toBe("关闭图片预览");
      // Delete / Backspace 不删底下的文字和附件；点图片本身不关闭
      await page.keyboard.press("Backspace"); await page.keyboard.press("Delete");
      await page.locator(".att-lightbox-stage img").click();
      expect(await page.locator(".att-lightbox").count()).toBe(1);
      expect(await page.locator(".att-tray .att").count()).toBe(6);
      await page.keyboard.press("Enter"); // 适应 ↔ 100%
      await page.waitForSelector(".att-lightbox-panel.zoom");
      await page.keyboard.press("Enter");
      await page.waitForSelector(".att-lightbox-panel:not(.zoom)");
      await page.keyboard.press("Escape");
      await page.waitForSelector(".att-lightbox", { state: "detached" });
      expect(await page.evaluate(() => document.activeElement?.classList.contains("att-open"))).toBe(true);
      expect(await ta.inputValue()).toBe("请比较这几张页面截图。");
      // 完整点一下遮罩关闭
      await thumb.click();
      await page.waitForSelector(".att-lightbox");
      await page.mouse.click(8, 8);
      await page.waitForSelector(".att-lightbox", { state: "detached" });

      // —— 移除：点 × 立即消失、释放名额，没有「已移除」提示和撤销 ——
      await page.locator(".att-tray .att-image .att-x").first().click();
      expect(await page.locator(".att-tray .att").count()).toBe(5);
      expect(await page.locator(".att-count").innerText()).toBe("3 张图片 · 5/8 个附件");
      expect(await page.locator(".toast").count()).toBe(0);
      // 文字非空时 Backspace 只改文字
      await ta.focus();
      await page.keyboard.press("End"); await page.keyboard.press("Backspace");
      expect(await ta.inputValue()).toBe("请比较这几张页面截图");
      expect(await page.locator(".att-tray .att").count()).toBe(5);
      // 空输入框：第一下 Backspace 只聚焦最后一个附件，第二下移除；Ctrl+A 只选文字
      await ta.fill("");
      await page.keyboard.press("Backspace");
      expect(await page.locator(".att-tray .att").count()).toBe(5);
      expect(await page.evaluate(() => document.activeElement?.getAttribute("title"))).toBe("页面说明.html");
      await page.keyboard.press("Backspace");
      expect(await page.locator(".att-tray .att-file .att-name").allTextContents()).toEqual(["需求说明.md"]);
      expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("TEXTAREA");

      // —— 发送：原来的发送按钮；只有受理后出现一条消息、清掉这次输入 ——
      await ta.fill("请对比截图，并结合说明整理建议。");
      const before = llm.calls.length;
      await page.locator(".composer .send").click();
      await page.waitForSelector(".msg-row.user .msg-atts");
      await page.waitForFunction(() => !document.querySelector(".att-tray"));
      expect(await ta.inputValue()).toBe("");
      await page.waitForFunction(() => [...document.querySelectorAll(".msg-row.assistant .msg")].some((m) => m.textContent?.includes("收到，我看过了")));
      expect(llm.calls.length).toBe(before + 1);
      const sent = llm.calls.at(-1)!.messages.at(-1).content as any[];
      expect(sent.filter((p) => p.type === "image_url")).toHaveLength(3);
      expect(sent[0].text).toContain("# 需求\n正文");
      // 已发：附件组在正文气泡上方、右对齐，图片只有缩略图，文件卡没有 ×
      const layout = await page.evaluate(() => {
        const row = document.querySelector(".msg-row.user")!;
        const atts = row.querySelector(".msg-atts")!.getBoundingClientRect();
        const msg = row.querySelector(".msg")!.getBoundingClientRect();
        return { above: atts.bottom <= msg.top + 1, right: Math.abs(atts.right - msg.right) <= 1, images: row.querySelectorAll(".msg-atts .att-image img").length, files: [...row.querySelectorAll(".msg-atts .att-file .att-name")].map((e) => e.textContent), x: row.querySelectorAll(".att-x").length, users: document.querySelectorAll(".msg-row.user").length };
      });
      expect(layout).toEqual({ above: true, right: true, images: 3, files: ["需求说明.md"], x: 0, users: 1 });
      // 已发图片点击放大用的是同一个遮罩
      await page.locator(".msg-atts .att-image .att-open").first().click();
      await page.waitForSelector(".att-lightbox");
      await page.locator(".att-lightbox-close").click();
      await page.waitForSelector(".att-lightbox", { state: "detached" });

      // —— 只有附件也能发：单文件无正文独立成一条右对齐消息，不补造文字气泡 ——
      await dragFiles(page, [{ name: "看我们成长.md", text: "成长记录" }]);
      await page.waitForSelector(".att-tray .att-file.ready");
      expect(await ta.getAttribute("placeholder")).toBe("输入消息，或直接发送");
      expect(await page.locator(".composer .send").isDisabled()).toBe(false);
      await ta.press("Enter");
      await page.waitForFunction(() => document.querySelectorAll(".msg-row.user").length === 2);
      const only = await page.evaluate(() => { const row = [...document.querySelectorAll(".msg-row.user")].at(-1)!; return { bubble: row.querySelectorAll(".msg").length, name: row.querySelector(".att-name")?.textContent }; });
      expect(only).toEqual({ bubble: 0, name: "看我们成长.md" });
      expect(errors).toEqual([]);

      // —— 模型不能确认看图：只给一句提示、发送钮不可用，没有快捷按钮；文字和缩略图都在，原选模控件照常 ——
      await page.goto(`${base}/#/chat/lan`);
      await page.waitForSelector(".composer textarea");
      await page.locator(".composer textarea").fill("请分析这张截图");
      await pasteImage(page);
      await page.waitForSelector(".att-tray .att-image.ready");
      await page.waitForFunction(() => document.querySelector(".composer-note")?.textContent === "暂时无法确认这个模型是否支持图片，请稍后再试。");
      expect(await page.locator(".composer .send").isDisabled()).toBe(true);
      expect(await page.locator(".composer-note button, .composer-note a").count()).toBe(0);
      expect(await page.locator(".composer textarea").inputValue()).toBe("请分析这张截图");
      // 换成纯文本文件：非视觉模型不拦
      await page.locator(".att-tray .att-x").click();
      await dragFiles(page, [{ name: "notes.txt", text: "plain notes" }]);
      await page.waitForSelector(".att-tray .att-file.ready");
      await page.waitForFunction(() => !(document.querySelector(".composer .send") as HTMLButtonElement).disabled);
      // 切到别的机器人再回来：没发出的内容还在，别的机器人看不到
      await page.goto(`${base}/#/chat/ming`);
      await page.waitForSelector(".composer textarea");
      expect(await page.locator(".att-tray").count()).toBe(0);
      await page.goto(`${base}/#/chat/lan`);
      await page.waitForSelector(".att-tray .att-file");
      expect(await page.locator(".att-tray .att-name").textContent()).toBe("notes.txt");

      // —— 断线、受理结果不明：输入原样保留并提示，只查原请求；确认未受理后才放开原发送按钮，再点只建一条消息 ——
      await page.locator(".composer textarea").fill("读一下这份笔记");
      let sends = 0;
      await page.route("**/amb/api/bots/lan/chat/send", (route: any) => (++sends === 1 ? route.abort("connectionreset") : route.continue()));
      // 查询也先连不上：一直提示「暂时无法确认」，不假装已经失败
      let queries = 0;
      await page.route("**/amb/api/bots/lan/chat/send/*", (route: any) => (++queries <= 1 ? route.abort("connectionreset") : route.continue()));
      await page.locator(".composer .send").click();
      await page.waitForFunction(() => document.querySelector(".composer-note")?.textContent === "暂时无法确认发送结果，请稍候");
      expect(await page.locator(".composer .send").isDisabled()).toBe(true);
      expect(await page.locator(".composer textarea").inputValue()).toBe("读一下这份笔记");
      expect(await page.locator(".att-tray .att-file").count()).toBe(1);
      expect(await page.locator(".msg-row.user").count()).toBe(0);
      // 查到了：确认未受理 → 提示网络失败，发送按钮放开，没有重试按钮、恢复面板，也没有自动重发
      await page.waitForFunction(() => document.querySelector(".composer-note")?.textContent === "网络连接失败，请稍后再试", null, { timeout: 15_000 });
      await page.waitForFunction(() => !(document.querySelector(".composer .send") as HTMLButtonElement).disabled);
      expect(sends).toBe(1);
      expect(await page.locator(".composer-note button").count()).toBe(0);
      await page.locator(".composer .send").click();
      await page.waitForSelector(".msg-row.user .msg-atts");
      await page.waitForFunction(() => !document.querySelector(".att-tray"));
      expect(sends).toBe(2);
      expect(await page.locator(".msg-row.user").count()).toBe(1);
      expect(await page.locator(".composer textarea").inputValue()).toBe("");
      expect(String(llm.calls.at(-1)!.messages.at(-1).content)).toContain("plain notes");
      expect(errors).toEqual([]);
    } finally {
      await page.screenshot({ path: path.join(os.tmpdir(), "amb-attach-e2e.png") }).catch(() => {});
      await page.close();
    }
  }, 120_000);

  it("扩展名写错、带尾部数据、.jfif 的图片照常加入；收不了的图片给图片那一句提示，不说成只支持文本", async () => {
    app.store.createBot({ id: "pic", name: "小图", defaultModel: "gpt-4o-mock" });
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, locale: "zh-CN" });
    await signIn(page, base);
    const errors: string[] = [];
    page.on("pageerror", (e: Error) => errors.push(e.message));
    await page.addInitScript(() => { try { localStorage.setItem("amb-lang", "zh-CN"); } catch { /* 私密窗口 */ } });
    /** 在页面里画一张真的图（左上角透明），编码成 type，再按 name / mime 当成系统文件拖进来；tail 是拼在文件后面的字节数 */
    const dragImage = (o: { name: string; mime: string; type: "image/png" | "image/jpeg"; tail?: number }) =>
      page.evaluate(async ({ name, mime, type, tail }: any) => {
        const c = document.createElement("canvas");
        c.width = 64; c.height = 40;
        const g = c.getContext("2d")!;
        g.fillStyle = "#c33"; g.fillRect(16, 10, 48, 30);
        const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), type, 0.9));
        const dt = new DataTransfer();
        dt.items.add(new File(tail ? [blob, new Uint8Array(tail).fill(0x41)] : [blob], name, { type: mime }));
        const el = document.querySelector("section.chat")!;
        for (const t of ["dragenter", "dragover", "drop"]) el.dispatchEvent(new DragEvent(t, { dataTransfer: dt, bubbles: true, cancelable: true }));
      }, { tail: 0, ...o });
    try {
      await page.goto(`${base}/#/chat/pic`);
      await page.waitForSelector(".composer textarea", { timeout: 15_000 });
      const ready = (n: number) => page.waitForFunction((n: number) => document.querySelectorAll(".att-tray .att-image.ready img").length === n, n);
      // 内容是 PNG、扩展名写成 .jpg：照收，按真实格式规范化（存下的还是 PNG，透明没有丢）
      await dragImage({ name: "网页另存.jpg", mime: "image/jpeg", type: "image/png" });
      await ready(1);
      const first = (await (await fetch(`${base}/amb/api/bots/pic/attachments/state`)).json()).items[0];
      const stored = await fetch(`${base}/amb/api/bots/pic/attachments/${first.id}/content`);
      expect(stored.headers.get("content-type")).toBe("image/png");
      // 内容是 JPEG、扩展名写成 .png
      await dragImage({ name: "聊天导出.png", mime: "image/png", type: "image/jpeg" });
      await ready(2);
      // 手机照片：JPEG 结束标记后面还拖着几百字节
      await dragImage({ name: "IMG_0001.jpg", mime: "image/jpeg", type: "image/jpeg", tail: 600 });
      await ready(3);
      // Windows 上浏览器另存出来的 .jfif
      await dragImage({ name: "下载.jfif", mime: "image/jpeg", type: "image/jpeg" });
      await ready(4);
      expect(await page.locator(".att-tray .att.failed").count()).toBe(0);
      for (let left = 4; left > 0; left--) {
        await page.locator(".att-tray .att-x").first().click();
        await page.waitForFunction((n: number) => document.querySelectorAll(".att-tray .att").length === n, left - 1);
      }

      // 系统认作图片、但不在直接接收之列：整批不加，提示转成 PNG / JPG
      const note = (text: string) => page.waitForFunction((text: string) => document.querySelector(".composer-note")?.textContent === text, text);
      await dragFiles(page, [{ name: "扫描件.jp2", type: "image/jp2", text: "jp2" }]);
      await note("暂不支持此图片格式，请转为PNG或JPG后再添加");
      expect(await page.locator(".att-tray .att").count()).toBe(0);
      // 扩展名是图片、内容不是：这一项标成失败，说的也是图片那一句
      await dragFiles(page, [{ name: "坏掉的图.png", type: "image/png", text: "not an image at all" }]);
      await page.waitForSelector(".att-tray .att.failed");
      await note("暂不支持此图片格式，请转为PNG或JPG后再添加");
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);
});
