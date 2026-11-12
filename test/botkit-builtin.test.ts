import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BotCatalog } from "../src/botkit/catalog.js";
import { catalogConfig } from "../src/botkit/config.js";
import { BotInstaller } from "../src/botkit/installer.js";
import { packBuiltinCatalog } from "../src/botkit/pack.js";
import { BOT_LANGS } from "../src/botkit/format.js";
import { Store } from "../src/store/db.js";

const root = path.join(import.meta.dirname, "..");
const ids = ["company-research", "ppt-master", "printfilm", "us-stock-research"];
let appRoot: string;
let bundledDir: string;
let dataDir: string;
let store: Store;
let catalog: BotCatalog;
let installer: BotInstaller;
const network = vi.fn<typeof fetch>();

beforeAll(() => {
  appRoot = fs.mkdtempSync(path.join(os.tmpdir(), "amb-builtin-app-"));
  bundledDir = path.join(appRoot, "dist", "catalog");
  expect(packBuiltinCatalog({ root, outDir: bundledDir }).failures).toEqual([]);
});
afterAll(() => fs.rmSync(appRoot, { recursive: true, force: true }));
beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "amb-builtin-data-"));
  network.mockReset().mockRejectedValue(new Error("No network available"));
  catalog = new BotCatalog({ dataDir, appVersion: "9.9.9", ...catalogConfig({}, appRoot), fetch: () => network });
  store = new Store(path.join(dataDir, "anymodel.db"));
  installer = new BotInstaller({ dataDir, store, catalog, stopAgent: async () => {}, busy: () => false, startBot: async () => {} });
});
afterEach(() => {
  catalog.stop();
  store.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("官方 Bot 随应用内置", () => {
  it("新安装在断网时就有完整目录，启动和同步都不发网络请求", async () => {
    expect(catalog.enabled).toBe(true);
    expect(catalog.remoteEnabled).toBe(false);
    expect(catalog.list().map((b) => b.id).sort()).toEqual(ids);
    const changed = vi.fn();
    catalog.on("changed", changed);
    catalog.start();
    expect(changed).toHaveBeenCalledOnce();
    expect(await catalog.sync()).toBe(false);
    expect(network).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(bundledDir, "index.json.sig"))).toBe(false);
  });

  it("四个 Bot 的界面、各语言示例、技能和缩略图全部能离线加载", async () => {
    for (const entry of catalog.list()) {
      const uiDir = await catalog.ensureUi(entry);
      expect(fs.existsSync(path.join(uiDir, "ui/index.html"))).toBe(true);
      expect(catalog.uiDirIfPresent(entry.ui.sha256)).toBe(uiDir);
      for (const lang of BOT_LANGS) {
        expect(fs.existsSync(path.join(uiDir, `ui/locales/${lang}.json`))).toBe(true);
        expect((await installer.previewFile(entry, "app/state.json", lang))!.json).toBeTruthy();
      }
      for (const hash of Object.values(entry.thumbs ?? {})) expect(fs.existsSync((await catalog.thumb(hash))!)).toBe(true);
      const bot = await installer.install(entry.id, "zh-CN");
      expect(bot.origin).toBe("catalog");
      expect(bot.systemPrompt).toBeTruthy();
      for (const skill of bot.app!.skills) expect(fs.existsSync(path.join(dataDir, "dsh", bot.id, "skills", skill, "SKILL.md"))).toBe(true);
      expect((await installer.readFile(bot, "app/state.json"))!.json).toBeTruthy();
    }
    expect(network).not.toHaveBeenCalled();
  });

  it("内置文件损坏时校验失败，不尝试从网络补下载，也不创建实例", async () => {
    const broken = path.join(dataDir, "broken-catalog");
    fs.cpSync(bundledDir, broken, { recursive: true });
    const entry = catalog.get("ppt-master")!;
    fs.writeFileSync(path.join(broken, "bundles", `${entry.runtime.sha256}.ambot`), "corrupt");
    const local = new BotCatalog({ dataDir, appVersion: "9.9.9", bundledDir: broken, url: "https://anymodel.bot/catalog/index.json", publicKey: "ignored", fetch: () => network });
    expect(local.remoteEnabled).toBe(false);
    await expect(local.ensureRuntime(entry)).rejects.toThrow("sha256 mismatch");
    const brokenInstaller = new BotInstaller({ ...installer.o, catalog: local });
    await expect(brokenInstaller.install(entry.id, "zh-CN")).rejects.toMatchObject({ code: "catalog_download_failed" });
    expect(store.getBot(`cat-${entry.id}`)).toBeUndefined();
    expect(fs.existsSync(local.bundleDir(entry.runtime.sha256))).toBe(false);
    fs.rmSync(path.join(broken, "bundles", `${entry.runtime.sha256}.ambot`));
    await expect(local.ensureRuntime(entry)).rejects.toThrow();
    expect(network).not.toHaveBeenCalled();
  });

  it("旧线上索引不会覆盖内置目录；已有缓存和用户数据继续保留", async () => {
    const entry = catalog.get("ppt-master")!;
    const uiDir = await catalog.ensureUi(entry);
    fs.writeFileSync(path.join(dataDir, "catalog/index.json"), JSON.stringify({ version: 1, publishedAt: Date.now(), bots: [] }));
    fs.writeFileSync(path.join(dataDir, "catalog/index.json.sig"), "old signature");
    const restarted = new BotCatalog({ dataDir, appVersion: "9.9.9", ...catalogConfig({}, appRoot), fetch: () => network });
    expect(restarted.list().map((b) => b.id).sort()).toEqual(ids);
    expect(await restarted.ensureUi(entry)).toBe(uiDir);
    expect(network).not.toHaveBeenCalled();
  });
});
