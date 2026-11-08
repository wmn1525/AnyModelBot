import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterAll, beforeAll, expect, it } from "vitest";
import { App } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { skillMd, skillZip } from "./skill-fixture.js";
import { mockOpenAI } from "./helpers.js";

const require = createRequire(import.meta.url);
let chromium: any;
try { ({ chromium } = require("playwright")); }
catch { try { ({ chromium } = require(require.resolve("playwright-core", { paths: [path.join(import.meta.dirname, "../site")] }))); } catch { /* optional browser dependency */ } }
const chrome = process.env.AMB_TEST_CHROME || chromium?.executablePath();
const browserAvailable = chromium && chrome && fs.existsSync(chrome);

let app: App;
let dir: string;
let base: string;
let llm: Awaited<ReturnType<typeof mockOpenAI>>;
const request = async (p = "", method = "GET", body?: unknown) => {
  const binary = Buffer.isBuffer(body);
  const res = await fetch(base + p, { method, headers: body === undefined ? {} : { "content-type": binary ? "application/zip" : "application/json" }, body: body === undefined ? undefined : binary ? new Uint8Array(body) : JSON.stringify(body) });
  return { status: res.status, ...(await res.json()) as any };
};
beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "amb-skills-api-"));
  llm = await mockOpenAI();
  app = new App(loadConfig({ dataDir: dir, env: { AMB_MAGPIE_BASE_URL: llm.url + "/v1", AMB_MAGPIE_API_KEY: "local-test", AMB_UI_PORT: "0", AMB_WEIXIN_API_BASE: "http://127.0.0.1:9", AMB_AGENT: "off" } }), { printQrToTerminal: false });
  await app.start();
  base = app.web!.url.replace(/\/$/, "") + "/amb/api/bots/default/skills";
});
afterAll(async () => { await app?.stop(); await llm?.close(); fs.rmSync(dir, { recursive: true, force: true }); });

it("真实 HTTP：预览、导入、查看、停用、重新导入替换、启用、删除", async () => {
  const zip = skillZip([{ path: "wrapper/SKILL.md", text: skillMd() }, { path: "wrapper/references/template.txt", text: "template" }]);
  const preview = await request("/preview", "POST", zip);
  expect(preview).toMatchObject({ status: 200, skill: { name: "weekly-report", files: 2, replaces: null } });
  expect((await request()).skills).toEqual([]);
  const first = await request("", "POST", zip);
  expect(first).toMatchObject({ status: 200, skills: [{ name: "weekly-report", enabled: true }] });
  expect((await request("/weekly-report")).skill.instructions).toContain("Write the report");
  expect((await request("/weekly-report", "PUT", { enabled: false })).skills[0].enabled).toBe(false);
  const updated = skillZip([{ path: "SKILL.md", text: skillMd("weekly-report", "Updated instructions") }]);
  expect(await request("", "POST", updated)).toMatchObject({ status: 409, code: "conflict" });
  const digest = (await request("/preview", "POST", updated)).skill.replaces;
  expect((await request(`?replaces=${digest}`, "POST", updated)).skills[0].enabled).toBe(false);
  expect((await request("/weekly-report")).skill.instructions).toContain("Updated instructions");
  expect((await request("/weekly-report", "PUT", { enabled: true })).skills[0].enabled).toBe(true);
  expect((await request("/weekly-report", "DELETE")).skills).toEqual([]);
  expect((await request("/weekly-report")).status).toBe(404);
});
it("错误 ZIP、缺失说明、错误开关、保留名称和不存在机器人给明确错误", async () => {
  expect(await request("/preview", "POST", Buffer.from("bad"))).toMatchObject({ status: 400, code: "invalid_zip" });
  expect(await request("/preview", "POST", skillZip([{ path: "README.md" }]))).toMatchObject({ status: 400, code: "missing_skill" });
  expect(await request("/preview", "POST", skillZip([{ path: "SKILL.md", text: skillMd("computer-use") }]))).toMatchObject({ status: 400, code: "reserved_name" });
  expect((await request("/weekly-report", "PUT", { enabled: "yes" })).status).toBe(400);
  expect((await fetch(base.replace("/default/", "/missing/"))).status).toBe(404);
  expect((await fetch(base, { method: "POST", headers: { "origin": "https://evil.example", "content-type": "text/plain" }, body: "bad" })).status).toBe(415);
  const preflight = await fetch(base, { method: "OPTIONS", headers: { origin: "https://evil.example", "access-control-request-method": "POST", "access-control-request-headers": "content-type" } });
  expect(preflight.headers.get("access-control-allow-origin")).toBeNull();
});
it.skipIf(!browserAvailable)("浏览器：导入预览、取消、添加、查看、停用、替换、删除及窄屏布局", async () => {
  const browser = await chromium.launch({ executablePath: chrome, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 }, locale: "zh-CN" });
  const errors: string[] = [];
  page.on("pageerror", (e: Error) => errors.push(e.message));
  page.setDefaultTimeout(8000);
  try {
    await page.route("**/amb/api/settings", async (route: any) => {
      if (route.request().method() !== "GET") return route.continue();
      const response = await route.fetch();
      await route.fulfill({ json: { ...await response.json(), lang: "zh-CN" } });
    });
    await page.goto(app.web!.url + "#/bot/default/settings/skills");
    const list = page.locator(".skill-list");
    await list.waitFor();
    const choose = (body: string) => list.locator('input[type="file"]').setInputFiles({ name: "skill.zip", mimeType: "application/zip", buffer: skillZip([{ path: "wrapped/SKILL.md", text: skillMd("browser-skill", body) }]) });
    await choose("initial instructions");
    await page.getByRole("dialog").getByRole("button", { name: "取消", exact: true }).click();
    expect((await request()).skills).toEqual([]);
    await choose("initial instructions");
    await page.getByRole("dialog").getByRole("button", { name: "添加技能", exact: true }).click();
    const row = list.locator(".row").filter({ has: page.locator(".name", { hasText: "browser-skill" }) });
    await row.waitFor();
    await row.getByRole("button", { name: "查看", exact: true }).click();
    await page.getByRole("dialog").locator("summary").click();
    expect(await page.getByRole("dialog").locator("pre").textContent()).toContain("initial instructions");
    await page.getByRole("dialog").getByRole("button", { name: "关闭", exact: true }).last().click();
    await row.getByRole("switch").click();
    await page.waitForFunction(() => document.querySelector('.skill-list [role="switch"]')?.getAttribute("aria-checked") === "false");
    await choose("replacement instructions");
    await page.getByRole("dialog").getByRole("button", { name: "替换技能", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    expect((await request()).skills[0].enabled).toBe(false);
    expect((await request("/browser-skill")).skill.instructions).toContain("replacement instructions");
    await page.setViewportSize({ width: 390, height: 844 });
    await row.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await row.getByRole("switch").isVisible()).toBe(true);
    await row.getByRole("button", { name: "删除", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "删除", exact: true }).click();
    await row.waitFor({ state: "hidden" });
    expect((await request()).skills).toEqual([]);
    await list.locator('input[type="file"]').setInputFiles({ name: "bad.zip", mimeType: "application/zip", buffer: skillZip([{ path: "README.md", text: "no skill" }]) });
    await page.getByText("没有找到 SKILL.md，请选择包含技能说明的 ZIP。", { exact: true }).waitFor();
    expect(errors).toEqual([]);
  } finally { await browser.close(); }
}, 60_000);

it("删除机器人清理导入技能", async () => {
  const zip = skillZip([{ path: "SKILL.md", text: skillMd() }]);
  await request("", "POST", zip);
  app.userSkills.sync("default");
  await app.deleteBot("default");
  expect(fs.existsSync(path.join(dir, "skills", "default"))).toBe(false);
  expect(fs.existsSync(path.join(dir, "dsh", "default", "skills", "weekly-report"))).toBe(false);
});
