// 官方 Bot 随 App 发布：产物位于 dist/catalog，Electron 和 Docker 都随 dist 一起打包。
import fs from "node:fs";
import path from "node:path";
import { packBuiltinCatalog } from "../src/botkit/pack.js";

const root = path.resolve(import.meta.dirname, "..");
const { index, failures } = packBuiltinCatalog({ root, outDir: path.join(root, "dist", "catalog") });
if (failures.length) {
  for (const { dir, issues } of failures) for (const issue of issues) console.error(`${path.relative(root, dir)}: ${issue.rule}: ${issue.message}`);
  process.exit(1);
}
if (!index.bots.length) throw new Error("No official bots found; refusing to build an empty bundled catalog");
const files = fs.readdirSync(path.join(root, "dist", "catalog", "bundles"));
const bytes = files.reduce((n, f) => n + fs.statSync(path.join(root, "dist", "catalog", "bundles", f)).size, 0);
console.log(`Bundled ${index.bots.length} official bots (${(bytes / 1024 / 1024).toFixed(2)} MiB): ${index.bots.map((b) => b.id).join(", ")}`);
