#!/usr/bin/env node
/**
 * 生成 vendor/yuque-mcp/：语雀官方 MCP（npm 包 yuque-mcp，MIT）的一个固定版本，打成单个文件，随安装包分发。
 *
 * 为什么不在用户电脑上 `npx yuque-mcp`：那样要用户先装 Node，第一次还要现下载（国内网络常常十几秒以上），
 * 每次拉到的也可能是不同的版本。打成一个文件之后，用应用自带的 Node 运行（tools/apps/service.ts），
 * 用户只需要粘贴 Token。
 *
 *   node scripts/vendor-yuque-mcp.mjs            用下面写死的版本重新生成
 *   node scripts/vendor-yuque-mcp.mjs 1.0.1      换一个版本（改完请把 VERSION 也改掉，并跑一遍测试）
 *
 * 产物（都要入库）：
 *   yuque-mcp.mjs              打好的单文件（esbuild，ESM，Node 22）
 *   LICENSE                    yuque-mcp 自己的许可
 *   THIRD_PARTY_LICENSES.txt   打进去的每个依赖的名字、版本、许可原文
 *   README.md                  来源、版本、怎么重新生成
 *
 * 需要联网（从 npm 下载这个包和它的依赖）。esbuild 用仓库里现成的（tsx 的依赖）。
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "1.0.0";
/** 这个版本在 npm 上的校验值（npm view yuque-mcp@1.0.0 dist.integrity）：装下来的不是它就停，不把来历不明的包打进安装包 */
const INTEGRITY = { "1.0.0": "sha512-zfa66is9NAkoLjPeKAgBGdAK7IGrrXFkOScX5Wbugx5EMBSTLV1o9YwXYgqNzZiGh6a6wa65zdRc9enO4crq7g==" };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = process.argv[2] || VERSION;
const out = path.join(root, "vendor", "yuque-mcp");
const work = fs.mkdtempSync(path.join(os.tmpdir(), "amb-yuque-mcp-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

try {
  fs.writeFileSync(path.join(work, "package.json"), JSON.stringify({ name: "amb-yuque-vendor", private: true, type: "module" }));
  execFileSync(npm, ["install", "--ignore-scripts", "--no-audit", "--no-fund", `yuque-mcp@${version}`], { cwd: work, stdio: "inherit", shell: process.platform === "win32" });
  const installed = JSON.parse(fs.readFileSync(path.join(work, "node_modules", ".package-lock.json"), "utf8")).packages?.["node_modules/yuque-mcp"]?.integrity;
  if (!INTEGRITY[version]) console.warn(`vendor-yuque-mcp: no pinned integrity for ${version}; got ${installed}. Add it to INTEGRITY after checking the release.`);
  else if (installed !== INTEGRITY[version]) throw new Error(`yuque-mcp@${version} integrity mismatch: expected ${INTEGRITY[version]}, got ${installed}`);
  const pkgDir = path.join(work, "node_modules", "yuque-mcp");
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8"));
  const entry = path.join(pkgDir, pkg.bin["yuque-mcp"]);

  const esbuild = await import(path.join(root, "node_modules", "esbuild", "lib", "main.js"));
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    outfile: path.join(work, "yuque-mcp.mjs"),
    metafile: true,
    legalComments: "none",
    logLevel: "warning",
    // 打进来的 CommonJS 依赖要用 require
    banner: { js: "import { createRequire as __ambCreateRequire } from 'node:module'; const require = __ambCreateRequire(import.meta.url);" },
  });

  // 打进去了哪些包：从 metafile 的输入路径里找 node_modules/<包名>
  const packages = new Map();
  for (const input of Object.keys(result.metafile.inputs)) {
    const m = /node_modules\/((?:@[^/]+\/)?[^/]+)\//g;
    let last;
    for (let x; (x = m.exec(input)); ) last = x;
    if (!last) continue;
    const dir = path.join(work, input.slice(0, last.index + last[0].length));
    if (!packages.has(dir) && fs.existsSync(path.join(dir, "package.json"))) packages.set(dir, JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")));
  }
  const licenseOf = (dir) => {
    const name = fs.readdirSync(dir).find((f) => /^(licen[sc]e|copying)(\.(md|txt))?$/i.test(f));
    return name ? fs.readFileSync(path.join(dir, name), "utf8").trim() : "";
  };
  const deps = [...packages.entries()].filter(([, p]) => p.name !== "yuque-mcp").sort((a, b) => a[1].name.localeCompare(b[1].name));
  const notices = deps
    .map(([dir, p]) => {
      const text = licenseOf(dir);
      const license = typeof p.license === "string" ? p.license : (p.license?.type ?? "see package");
      return `${"=".repeat(78)}\n${p.name} ${p.version} — ${license}\n${p.homepage || p.repository?.url || ""}\n${"=".repeat(78)}\n\n${text || `(no license file in the package; license: ${license})`}\n`;
    })
    .join("\n");

  // 包在运行时用 require("../package.json") 读自己的版本号：单文件旁边没有这个文件，换成常量（只此一处改动）
  let code = fs.readFileSync(path.join(work, "yuque-mcp.mjs"), "utf8");
  code = code.replace(/\brequire\d*\(\s*["']\.\.\/package\.json["']\s*\)/g, `(${JSON.stringify({ name: pkg.name, version: pkg.version })})`);
  if (/["']\.\.\/package\.json["']/.test(code)) throw new Error("the bundle still reads ../package.json at run time");

  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "yuque-mcp.mjs"), code);
  fs.writeFileSync(path.join(out, "LICENSE"), licenseOf(pkgDir) + "\n");
  fs.writeFileSync(path.join(out, "THIRD_PARTY_LICENSES.txt"), `Packages bundled into yuque-mcp.mjs (yuque-mcp ${pkg.version}).\n\n${notices}`);
  fs.writeFileSync(
    path.join(out, "README.md"),
    [
      "# yuque-mcp（随安装包分发的语雀官方 MCP）",
      "",
      `- 来源：npm 包 [yuque-mcp](https://www.npmjs.com/package/yuque-mcp) ${pkg.version}（MIT，https://github.com/yuque/yuque-mcp-server）`,
      "- `yuque-mcp.mjs`：这个包和它的依赖打成的单个文件（esbuild）。唯一的改动：运行时读 `../package.json` 取版本号的地方换成了常量。由 `node scripts/vendor-yuque-mcp.mjs` 生成，不要手改。",
      "- `THIRD_PARTY_LICENSES.txt`：打进去的每个依赖的许可。",
      "- 用法：`连接应用 › 语雀` 用应用自带的 Node 运行它（stdio），个人 Token 经环境变量 `YUQUE_PERSONAL_TOKEN` 传入（`src/tools/apps/service.ts`）。",
      "- 升级：`node scripts/vendor-yuque-mcp.mjs <版本>`，把脚本里的 `VERSION` 一起改掉，跑 `npm test`，并更新 `THIRD_PARTY_NOTICES*.md` 里的版本号。",
      "",
    ].join("\n"),
  );
  const size = fs.statSync(path.join(out, "yuque-mcp.mjs")).size;
  console.log(`vendor/yuque-mcp: yuque-mcp ${pkg.version}, ${(size / 1024).toFixed(0)} KB, ${deps.length} bundled packages`);
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
