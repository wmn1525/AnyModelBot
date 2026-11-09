/** 终端扫码登录微信 iLink：二维码打印到终端并保存为 PNG。用法：npm run weixin:login [botId] */
import path from "node:path";
import readline from "node:readline/promises";
import { loadConfig } from "../config.js";
import { Store } from "../store/db.js";
import { WeixinLogin } from "../channels/weixin/login.js";
import { t as tr } from "../i18n/index.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const store = new Store(path.join(config.dataDir, "anymodel.db"));
  const botId = process.argv[2] || store.listBots()[0]?.id || "default";
  if (!store.getBot(botId)) store.createBot({ id: botId, name: tr("app.default_bot_name"), weixinEnabled: true });
  const login = new WeixinLogin({
    apiBaseUrl: config.weixin.apiBaseUrl,
    pngPath: path.join(config.dataDir, "weixin", `${botId}-login-qr.png`),
    printTerminal: true,
  });
  // 手机上出现数字时在终端里输入（输错了会再问一次）
  let asking = false;
  login.subscribe((s) => {
    if (s.message) console.log(`[${s.state}] ${s.message}`);
    if (s.state !== "need_verifycode" || s.verifying || asking) return;
    asking = true;
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    void rl.question("> ").then((code) => {
      rl.close();
      asking = false;
      login.submitVerifyCode(code);
    });
  });
  const res = await login.run();
  if (!res) process.exit(1);
  store.saveWeixinAccount({ botId, botToken: res.botToken, ilinkBotId: res.ilinkBotId, baseUrl: res.baseUrl, ownerUserId: res.userId });
  store.updateBot(botId, { weixinEnabled: true });
  store.close();
  console.log(tr("cli.weixinConnected"));
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
