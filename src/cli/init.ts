import { spawn } from "node:child_process";
/**
 * 首次设置向导（终端版；界面里也能完成同样的设置）：
 * 1. 连接 OKINTO New API：粘贴 API Key
 *    （先校验 GET /v1/models，再写入内置网关的隔离配置；key 不进命令行参数）
 * 2. 飞书 App ID / App Secret → 写入本程序数据库
 */
import readline from "node:readline";
import { stdin, stdout } from "node:process";
import { loadConfig } from "../config.js";
import { App } from "../app.js";
import { normalizeLine } from "../providers/modelflare.js";
import { OFFICIAL_PROVIDERS } from "../providers/official.js";
import { t as tr } from "../i18n/index.js";

/** 行队列：兼容交互终端与管道输入（管道时所有行会一次性到达） */
function lineReader() {
  const tty = !!stdin.isTTY;
  const rl = readline.createInterface({ input: stdin, output: stdout, terminal: tty });
  const lines: string[] = [];
  const waiters: Array<(l: string | undefined) => void> = [];
  let closed = false;
  let muted = false;
  const r = rl as unknown as { _writeToOutput?: (s: string) => void };
  const orig = r._writeToOutput?.bind(rl);
  r._writeToOutput = (str: string) => {
    if (!muted) return orig?.(str);
    if (str.includes("\n") || str.includes("\r")) stdout.write("\n");
    else if (!str.startsWith("\x1b")) stdout.write("*".repeat([...str].length));
  };
  rl.on("line", (l) => (waiters.length ? waiters.shift()!(l) : lines.push(l)));
  rl.on("close", () => {
    closed = true;
    while (waiters.length) waiters.shift()!(undefined);
  });
  const next = () => (lines.length ? Promise.resolve(lines.shift()) : closed ? Promise.resolve(undefined) : new Promise<string | undefined>((res) => waiters.push(res)));
  return {
    async ask(q: string, secret = false): Promise<string> {
      stdout.write(q);
      muted = secret && tty;
      const l = await next();
      muted = false;
      if (!tty) stdout.write(secret ? tr("cli.entered") + "\n" : `${l ?? ""}\n`);
      return (l ?? "").trim();
    },
    close: () => rl.close(),
  };
}

async function main(): Promise<void> {
  const config = loadConfig();
  const app = new App(config, { noWeb: true });
  const rl = lineReader();
  try {
    await setup(app, rl, config.dataDir);
  } finally {
    rl.close();
    await app.magpie?.stop();
    app.store.close();
  }
  console.log("\n" + tr("cli.done"));
}

async function setup(app: App, rl: ReturnType<typeof lineReader>, dataDir: string): Promise<void> {
  console.log(tr("cli.title", { dir: dataDir }) + "\n");
  if (app.magpie) {
    if (!app.magpie.binPath) {
      throw new Error(tr("cli.noMagpie"));
    }
    await app.magpie.start();
    const account = app.ensureAccount();
    await app.retirePastedKey();
    const status = app.modelflareStatus();
    if (status.official && !status.connected) {
      console.log(tr("cli.alreadyOfficial"));
    } else if (status.connected) {
      console.log(tr("cli.alreadyConnected", { tail: status.keyTail, account: account.signedIn ? tr("cli.accountSuffix", { name: account.status().name || tr("cli.signedIn") }) : "" }));
    } else {
      const how = (await rl.ask(tr("cli.askHow"))).toLowerCase();
      if (how === "key") {
        await officialKey(app, rl);
      } else if (how !== "skip") {
        const key = await rl.ask("OKINTO New API Key：", true);
        const r = await app.connectModelflare(key, "auto");
        if (!r.ok) throw new Error(r.message);
        console.log(tr("cli.connected", { count: r.models.length }));
      }
    }
  }
  const appId = (await rl.ask(tr("cli.askFeishuId"))).trim();
  if (appId) {
    const secret = await rl.ask(tr("cli.askFeishuSecret"), true);
    let bot = app.store.listBots()[0];
    if (!bot) bot = app.store.createBot({ id: "default", name: tr("app.default_bot_name"), weixinEnabled: true });
    app.store.updateBot(bot.id, { feishuAppId: appId, feishuAppSecret: secret });
    console.log(tr("cli.savedToBot", { name: bot.name }));
  }
}

/** 用自己的官方 API Key：选一家、填 Key；校验不过直接报错退出，什么都不保存 */
async function officialKey(app: App, rl: ReturnType<typeof lineReader>): Promise<void> {
  const label = (p: (typeof OFFICIAL_PROVIDERS)[number]) => (p.region ? `${p.name} (${tr(p.region === "cn" ? "cli.regionCn" : "cli.regionGlobal")})` : p.name);
  OFFICIAL_PROVIDERS.forEach((p, i) => console.log(`  ${i + 1}. ${label(p)}`));
  const p = OFFICIAL_PROVIDERS[Number(await rl.ask(tr("cli.askOfficial"))) - 1];
  if (!p) return;
  const r = await app.connectOfficial(p.id, await rl.ask(tr("cli.askOfficialKey", { name: label(p), url: p.keysUrl }), true));
  if (!r.ok) throw new Error(r.message);
  console.log(tr("cli.officialConnected", { name: label(p), count: r.models.length }));
}

/** 浏览器登录：回调落在本机 127.0.0.1。remote：浏览器在别的设备上（SSH 远程），回调到不了这里，把登录后的链接贴回来 */
async function loginInBrowser(app: App, rl: ReturnType<typeof lineReader>, remote: boolean): Promise<void> {
  const account = app.ensureAccount();
  const url = await account.startLogin();
  console.log(`\n${tr("cli.openLink")}\n${url}\n`);
  if (remote && "completeLoginFromLink" in account) account.completeLoginFromLink(await rl.ask(tr("cli.askLoginLink")));
  else openInBrowser(url);
  for (;;) {
    await new Promise((r) => setTimeout(r, 500));
    const s = account.status();
    if (s.state === "signed_in") {
      const models = await app.runtime.listModels(true).catch(() => []);
      console.log(tr("cli.signedInConnected", { name: s.name || "OKINTO", count: models.length }));
      return;
    }
    if (s.state !== "signing_in") throw new Error(s.error || tr("cli.loginIncomplete"));
  }
}

/** 尽力打开系统浏览器；打不开也没关系，链接已经打印出来了。参数直接传给程序，不经过 shell */
function openInBrowser(url: string): void {
  const [cmd, args] =
    process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["rundll32", ["url.dll,FileProtocolHandler", url]] : ["xdg-open", [url]];
  try {
    const child = spawn(cmd, args as string[], { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  } catch {
    /* 没有可用的打开方式 */
  }
}

main().catch((e) => {
  console.error(tr("cli.setupFailed"), (e as Error).message);
  process.exit(1);
});
