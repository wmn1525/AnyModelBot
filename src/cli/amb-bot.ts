/**
 * amb-bot：开发和发布目录 Bot 的工具（docs/bot-framework.md）。npm run bot -- <命令>。
 *
 *   new <id> [--dir <目录>]      从模板起一个 Bot 包
 *   check <目录> [--full]        约束检查。--full 再跑渲染和真实模型（要有运行中的 App）
 *   dev <目录>                   把本机目录登记到运行中的 App，边改边看
 *   hash <技能目录>              算引入技能的 sha256，写进 bot.json
 *   keygen                       生成目录签名的密钥对
 *   pack --root <仓库> --out <目录>     打包并签名（私钥在 AMB_CATALOG_PRIVATE_KEY）
 *   takedown <id> --root <仓库> --reason <原因> [--security]   下架，之后要重新 pack 发布
 *   who-uses <技能> --root <仓库>       查某个技能牵连的全部 Bot
 *
 * 连接 App：--app <地址>（默认 http://127.0.0.1:<配置的端口>），有令牌时设 AMB_UI_TOKEN。
 */
import fs from "node:fs";
import path from "node:path";
import { BOT_AVATARS } from "../agent/settings.js";
import { appVersion } from "../version.js";
import { dirHash } from "../botkit/bundle.js";
import { checkStatic } from "../botkit/check.js";
import { COMPLETION_MIN, runEvals } from "../botkit/evals.js";
import { BOT_ID, type Issue } from "../botkit/format.js";
import { packCatalog, readCatalogConfig, whoUsesSkill } from "../botkit/pack.js";
import { renderCheck } from "../botkit/render.js";
import { generateCatalogKeys } from "../botkit/sign.js";
import { loadConfig } from "../config.js";
import { findAppRoot } from "../magpie/supervisor.js";
import { createRequire } from "node:module";

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(`--${n}`);
const opt = (n: string): string | undefined => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const positional = (i: number): string | undefined => {
  const out: string[] = [];
  for (let k = 1; k < argv.length; k++) {
    if (argv[k].startsWith("--")) {
      if (!["--full", "--security"].includes(argv[k])) k++;
      continue;
    }
    out.push(argv[k]);
  }
  return out[i];
};
const die = (msg: string): never => {
  console.error(msg);
  process.exit(1);
};

function printIssues(issues: Issue[]): void {
  for (const i of issues) console.log(`  ✗ [${i.rule}] ${i.message}${i.file ? `  (${i.file})` : ""}`);
}

const appUrl = () => (opt("app") || `http://127.0.0.1:${loadConfig().ui.port}`).replace(/\/$/, "");
const token = () => process.env.AMB_UI_TOKEN || loadConfig().ui.token || undefined;

function vendorFiles(): Record<string, string> {
  const require = createRequire(import.meta.url);
  const preact = path.dirname(path.dirname(require.resolve("preact")));
  return { "preact.mjs": path.join(preact, "dist", "preact.mjs"), "hooks.mjs": path.join(preact, "hooks", "dist", "hooks.mjs"), "htm.mjs": path.join(path.dirname(require.resolve("htm")), "htm.mjs") };
}

function cmdNew(): void {
  const id = positional(0) ?? die("用法：amb-bot new <id> [--dir <目录>]");
  if (!BOT_ID.test(id)) die("id 只能用小写字母、数字和连字符，2–48 个字符");
  const dest = path.resolve(opt("dir") || path.join("bots", id));
  if (fs.existsSync(dest)) die(`目录已存在：${dest}`);
  fs.cpSync(path.join(findAppRoot(), "assets", "bot-template"), dest, { recursive: true });
  // 头像按 id 稳定地挑一个；上新里撞了可以手动换
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const f = path.join(dest, "bot.json");
  fs.writeFileSync(f, fs.readFileSync(f, "utf8").replaceAll("__ID__", id).replaceAll("__APP_VERSION__", appVersion()).replaceAll("__AVATAR__", BOT_AVATARS[h % BOT_AVATARS.length]));
  console.log(`已创建 ${dest}\n把里面的 TODO 都填完，再运行 amb-bot check ${path.relative(process.cwd(), dest)}`);
}

async function cmdCheck(): Promise<void> {
  const dir = path.resolve(positional(0) ?? die("用法：amb-bot check <目录> [--full]"));
  const { manifest, issues } = checkStatic(dir);
  if (issues.length || !manifest) {
    console.log(`静态检查没过（${issues.length} 条）：`);
    printIssues(issues);
    process.exit(1);
  }
  console.log("静态检查通过");
  if (!flag("full")) return;
  const rendered = await renderCheck(dir, manifest, path.join(findAppRoot(), "ui"), vendorFiles());
  if (rendered.length) {
    console.log(`渲染检查没过（${rendered.length} 条）：`);
    printIssues(rendered);
    process.exit(1);
  }
  console.log("渲染检查通过，截图在 .check/");
  const report = await runEvals({ dir, manifest, app: appUrl(), token: token(), onProgress: (l) => console.log(`  … ${l}`) });
  for (const r of report.results) console.log(`  ${r.ok ? "✓" : "✗"} ${r.kind} ${r.id}${r.note ? `：${r.note}` : ""}`);
  console.log(`评测任务完成率 ${Math.round(report.completion * 100)}%（门槛 ${COMPLETION_MIN * 100}%）`);
  if (report.issues.length) {
    printIssues(report.issues);
    process.exit(1);
  }
  console.log("全部通过");
}

async function cmdDev(): Promise<void> {
  const dir = path.resolve(positional(0) ?? die("用法：amb-bot dev <目录>"));
  const { manifest, issues } = checkStatic(dir);
  if (!manifest) {
    printIssues(issues);
    process.exit(1);
  }
  if (issues.length) {
    console.log("还有没过的检查，不影响预览：");
    printIssues(issues);
  }
  const res = await fetch(`${appUrl()}/amb/api/catalog/dev`, { method: "POST", headers: { "content-type": "application/json", ...(token() ? { "x-amb-token": token()! } : {}) }, body: JSON.stringify({ dir }) }).catch((e) => die(`连不上 App（${appUrl()}）：${e.message}`));
  if (!(res as Response).ok) die(`登记失败：${await (res as Response).text()}`);
  console.log(`已加载，打开 ${appUrl()}/#/preview/${manifest.id}\n界面文件改完刷新就能看到；技能和人设改了，在界面里发消息前先移除实例再试。`);
}

function cmdPack(): void {
  const root = path.resolve(opt("root") || ".");
  const outDir = path.resolve(opt("out") ?? die("用法：amb-bot pack --root <仓库> --out <目录>"));
  const privateKey = process.env.AMB_CATALOG_PRIVATE_KEY ?? die("需要环境变量 AMB_CATALOG_PRIVATE_KEY（amb-bot keygen 生成）");
  const { index, failures } = packCatalog({ root, outDir, privateKey });
  if (failures.length) {
    for (const f of failures) {
      console.log(`${path.relative(root, f.dir)}：`);
      printIssues(f.issues);
    }
    die("有 Bot 没过检查，什么都没发布");
  }
  console.log(`已打包 ${index.bots.length} 个 Bot 到 ${outDir}`);
}

function cmdTakedown(): void {
  const id = positional(0) ?? die("用法：amb-bot takedown <id> --root <仓库> --reason <原因> [--security]");
  const root = path.resolve(opt("root") || ".");
  const reason = opt("reason") ?? die("要写 --reason：下架的原因");
  const cfg = readCatalogConfig(root);
  cfg.removed = { ...(cfg.removed ?? {}), [id]: { reason, ...(flag("security") ? { security: true } : {}), at: Date.now() } };
  cfg.featured = cfg.featured?.filter((x) => x !== id);
  fs.writeFileSync(path.join(root, "catalog.json"), `${JSON.stringify(cfg, null, 2)}\n`);
  console.log(`已标记下架：${id}。重新 pack 并发布后，24 小时内客户端生效（客户端每 6 小时同步一次）。`);
}

async function main(): Promise<void> {
  switch (argv[0]) {
    case "new":
      return cmdNew();
    case "check":
      return cmdCheck();
    case "dev":
      return cmdDev();
    case "hash":
      return void console.log(dirHash(path.resolve(positional(0) ?? die("用法：amb-bot hash <技能目录>"))));
    case "keygen": {
      const k = generateCatalogKeys();
      console.log(`公钥（填到 src/botkit/config.ts 的 CATALOG_PUBLIC_KEY）：\n${k.publicKey}\n\n私钥（只放发布环境的 AMB_CATALOG_PRIVATE_KEY，不要提交）：\n${k.privateKey}`);
      return;
    }
    case "pack":
      return cmdPack();
    case "takedown":
      return cmdTakedown();
    case "who-uses": {
      const skill = positional(0) ?? die("用法：amb-bot who-uses <技能> --root <仓库>");
      const ids = whoUsesSkill(path.resolve(opt("root") || "."), skill);
      console.log(ids.length ? ids.join("\n") : "没有 Bot 用到它");
      return;
    }
    default:
      console.log(fs.readFileSync(new URL(import.meta.url), "utf8").split("*/")[0].replace(/^\/\*\*?/, "").replace(/^ \* ?/gm, ""));
  }
}

void main().catch((e) => die(String(e?.stack || e)));
