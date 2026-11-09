#!/usr/bin/env node
// Developer package for the current platform: same as `npm run dist`, but with developer tools enabled
// (electron/main.ts reads ambDebugBuild from the packaged package.json) and "-debug-" in every file name,
// so it can't be mistaken for a release. Never published: --publish never. The release workflow refuses
// to ship a package whose flavour doesn't match (scripts/check-build-flavor.mjs).
import { spawnSync } from "node:child_process";

const args = ["run", "dist", "--", "-c.extraMetadata.ambDebugBuild=true", "-c.artifactName=anymodel-bot-${version}-debug-${os}-${arch}.${ext}", "--publish", "never", ...process.argv.slice(2)];
// 用 npm 自己的入口脚本（npm 运行脚本时给出 npm_execpath），跨平台都不经 shell；Windows 上直接拉起 npm.cmd
// 在新版 Node 里会被拒绝（CVE-2024-27980）。直接 node scripts/dist-debug.mjs 时退回 shell 里的 npm
const npmCli = process.env.npm_execpath;
const r = npmCli && /\.c?js$/.test(npmCli)
  ? spawnSync(process.execPath, [npmCli, ...args], { stdio: "inherit" })
  : spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", args, { stdio: "inherit", shell: process.platform === "win32" });
process.exit(r.status ?? 1);
