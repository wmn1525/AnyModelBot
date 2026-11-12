/** Readiness report and release gate. No network calls, generated translations or fallback merging. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error Native JS validator shared with browser-catalog tests.
import { inspectLocale } from "./lib/locale-check.mjs";
// @ts-expect-error Browser catalogs are plain JS.
import { loadDicts, TARGET_LANGS } from "./i18n-check.mjs";
import manifest from "../ui/locales/manifest.json" with { type: "json" };
import { catalogs } from "../src/i18n/messages/index.js";
import { translations, type TranslatedLang } from "../src/i18n/index.js";
import sourceExceptions from "../site/src/i18n/source-exceptions.json" with { type: "json" };
import { RAW_DICTS } from "../site/src/i18n/catalogs.js";
import { CHANNELS } from "../site/src/data/channels.js";
import { ANNOUNCEMENTS } from "../site/src/data/announcements.js";
import { LOCALES } from "../site/src/i18n/locales.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const statusOnly = process.argv.includes("--status");
const ui = await loadDicts(TARGET_LANGS);
const server = Object.fromEntries(Object.entries(catalogs).map(([ns, c]) => [ns, c.en]));
const report = [];
let blocked = false;
for (const locale of manifest.locales.filter((l) => !["zh-CN", "en"].includes(l.code))) {
  const lang = locale.code as TranslatedLang;
  const surfaces = {
    app: inspectLocale(ui.en, ui[lang], lang),
    server: inspectLocale(server, translations[lang], lang),
    website: inspectLocale(RAW_DICTS.en, RAW_DICTS[lang], lang, { unchanged: sourceExceptions }),
    channels: inspectLocale(CHANNELS.en, CHANNELS[lang], lang),
    announcements: inspectLocale(ANNOUNCEMENTS.map((a) => a.en), ANNOUNCEMENTS.map((a) => a[lang]), lang),
  };
  const missingDocs = ["README", "CHANGELOG", "CONTRIBUTING", "SECURITY", "THIRD_PARTY_NOTICES", "docs/development", "docs/privacy", "docs/skills"]
    .map((name) => `${name}_${lang}.md`).filter((file) => !fs.existsSync(path.join(root, file)) || !fs.readFileSync(path.join(root, file), "utf8").trim());
  if (RAW_DICTS[lang].meta?.lang !== LOCALES[locale.siteCode as keyof typeof LOCALES].tag) surfaces.website.errors.push({ key: "meta.lang", reason: "wrong HTML language tag" });
  const image = RAW_DICTS[lang].meta?.ogImage;
  if (!image || !fs.existsSync(path.join(root, "site/public", image))) missingDocs.push(`site/public${image || "/og/<missing>"}`);
  const ready = Object.values(surfaces).every((s) => !s.errors.length) && !missingDocs.length;
  if (!ready) blocked = true;
  report.push({ lang, ready, surfaces, missingDocs });
}
if (fs.readFileSync(path.join(root, "ui/locales/manifest.json"), "utf8") !== fs.readFileSync(path.join(root, "site/src/i18n/manifest.json"), "utf8")) {
  blocked = true;
  console.error("The app and website language manifests differ.");
}
if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
else for (const { lang, ready, surfaces, missingDocs } of report) {
  console.log(`${lang}: ${ready ? "ready" : "not ready"}`);
  for (const [name, s] of Object.entries(surfaces)) {
    console.log(`  ${name}: ${s.completed}/${s.total}`);
    for (const e of s.errors.slice(0, 3)) console.log(`    ${e.key}: ${e.reason}`);
  }
  if (missingDocs.length) console.log(`  missing documents: ${missingDocs.join(", ")}`);
}
if (blocked && !statusOnly) {
  console.error("Release blocked: every target language must be complete in the raw catalogs and documents.");
  process.exitCode = 1;
}
