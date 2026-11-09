/** 应用版本号（package.json 的 version）：界面、诊断报告、amb-bot 工具和更新检查都用它。 */
import fs from "node:fs";
import path from "node:path";
import { findAppRoot } from "./magpie/supervisor.js";

let cachedVersion = "";
export function appVersion(): string {
  if (!cachedVersion) {
    try {
      cachedVersion = String(JSON.parse(fs.readFileSync(path.join(findAppRoot(), "package.json"), "utf8")).version || "");
    } catch {
      cachedVersion = "";
    }
  }
  return cachedVersion;
}
