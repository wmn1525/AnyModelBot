/**
 * 一条命令启动全部：内置 magpie（受管）+ 机器人运行时 + 渠道 + 管理界面。
 *   npm start            （数据目录默认 ./data，可用 AMB_DATA_DIR 指定）
 */
import { loadConfig } from "./config.js";
import { App } from "./app.js";
import { logger } from "./log.js";

const log = logger("main");

export async function runCli(): Promise<App> {
  const config = loadConfig();
  const app = new App(config);
  await app.start();
  log.info(`数据目录：${config.dataDir}`);
  if (app.web) log.info(`管理界面：${app.web.url}`);
  // 管理界面要带令牌才能打开。令牌不进日志（log 会抹掉它，日志还会写进文件）；
  // 有人在终端前时把带令牌的地址直接写到终端，浏览器打开一次就记住了。重定向到文件、交给服务管理器跑的时候不写
  if (app.web && process.stdout.isTTY) process.stdout.write(`首次打开请用这个地址（Open this URL the first time）：${app.web.url}?token=${encodeURIComponent(app.web.token)}\n`);
  let stopping = false;
  const shutdown = async (sig: string) => {
    if (stopping) return;
    stopping = true;
    log.info(`收到 ${sig}，正在退出…`);
    const t = setTimeout(() => process.exit(1), 10_000);
    await app.stop().catch(() => {});
    clearTimeout(t);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  return app;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop()!);
if (isMain) {
  runCli().catch((e) => {
    log.error((e as Error).stack || String(e));
    process.exit(1);
  });
}
