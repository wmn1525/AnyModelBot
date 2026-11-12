# yuque-mcp（随安装包分发的语雀官方 MCP）

- 来源：npm 包 [yuque-mcp](https://www.npmjs.com/package/yuque-mcp) 1.0.0（MIT，https://github.com/yuque/yuque-mcp-server）
- `yuque-mcp.mjs`：这个包和它的依赖打成的单个文件（esbuild）。唯一的改动：运行时读 `../package.json` 取版本号的地方换成了常量。由 `node scripts/vendor-yuque-mcp.mjs` 生成，不要手改。
- `THIRD_PARTY_LICENSES.txt`：打进去的每个依赖的许可。
- 用法：`连接应用 › 语雀` 用应用自带的 Node 运行它（stdio），个人 Token 经环境变量 `YUQUE_PERSONAL_TOKEN` 传入（`src/tools/apps/service.ts`）。
- 升级：`node scripts/vendor-yuque-mcp.mjs <版本>`，把脚本里的 `VERSION` 一起改掉，跑 `npm test`，并更新 `THIRD_PARTY_NOTICES*.md` 里的版本号。
