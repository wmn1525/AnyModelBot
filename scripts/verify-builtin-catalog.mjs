#!/usr/bin/env node
// Verify app.asar with the packaged Electron, including offline installation of every bot.
// For a source build: node scripts/verify-builtin-catalog.mjs --app-root .
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

if (process.argv[2] !== "--app-root") {
  if (!process.argv[2]) throw new Error("Pass the packaged executable or --app-root <build root>");
  const exe = path.resolve(process.argv[2]);
  const resources = process.platform === "darwin" ? path.join(path.dirname(exe), "..", "Resources") : path.join(path.dirname(exe), "resources");
  const result = spawnSync(exe, [fileURLToPath(import.meta.url), "--app-root", path.join(resources, "app.asar")], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, stdio: "inherit", timeout: 60_000, windowsHide: true,
  });
  if (result.error) console.error(result.error);
  process.exit(result.status ?? 1);
}

const root = path.resolve(process.argv[3]);
const load = (name) => import(pathToFileURL(path.join(root, "dist", "src", name)).href);
const [{ BotCatalog }, { catalogConfig }, { BotInstaller }, { Store }, { BOT_LANGS }] = await Promise.all([
  load("botkit/catalog.js"), load("botkit/config.js"), load("botkit/installer.js"), load("store/db.js"), load("botkit/format.js"),
]);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "amb-builtin-check-"));
let networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error("Catalog verification is offline"); };
const store = new Store(path.join(dataDir, "anymodel.db"));
const catalog = new BotCatalog({ dataDir, appVersion: JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version, ...catalogConfig({}, root) });
const installer = new BotInstaller({ dataDir, store, catalog, stopAgent: async () => {}, busy: () => false, startBot: async () => {} });
try {
  assert(catalog.enabled && !catalog.remoteEnabled);
  const entries = catalog.list();
  assert(entries.length > 0, "Packaged app has no compatible official bots");
  catalog.start();
  await catalog.sync();
  for (const entry of entries) {
    const ui = await catalog.ensureUi(entry);
    assert(fs.existsSync(path.join(ui, "ui", "index.html")));
    for (const lang of BOT_LANGS) {
      assert(fs.existsSync(path.join(ui, "ui", "locales", `${lang}.json`)));
      assert((await installer.previewFile(entry, "app/state.json", lang))?.json);
    }
    for (const hash of Object.values(entry.thumbs ?? {})) assert(fs.existsSync(await catalog.thumb(hash)));
    const bot = await installer.install(entry.id, "en");
    assert(bot.systemPrompt);
    for (const skill of bot.app.skills) assert(fs.existsSync(path.join(dataDir, "dsh", bot.id, "skills", skill, "SKILL.md")));
    assert((await installer.readFile(bot, "app/state.json"))?.json);
    console.log(`ok   bundled bot ${entry.id}: UI, samples, skills, offline install`);
  }
  assert.equal(networkCalls, 0);
} finally {
  catalog.stop();
  store.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
