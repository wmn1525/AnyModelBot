/**
 * 桌面版：Modelflare 账户登录的请求走 Chromium 的网络栈（系统代理）。
 * 用户的浏览器靠系统代理完成了授权，应用进程用 Node 的 fetch 直连却连不上（没开 TUN），登录以 fetch failed 结束。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mockModelflare, approveInBrowser, until } from "./helpers.js";
import { App, type DesktopHooks } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { discover } from "../src/account/oauth.js";
import { fetchFailureReason, verifyModelflareKey } from "../src/providers/modelflare.js";

describe("账户登录走系统代理", () => {
  let mf: Awaited<ReturnType<typeof mockModelflare>>;
  let app: App;
  let dataDir: string;
  let seen: string[];
  const desktopFetch = ((input: string | URL | Request, init?: RequestInit) => {
    seen.push(new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url).pathname);
    return fetch(input, init);
  }) as typeof fetch;
  const login = async () => {
    const account = app.ensureAccount();
    const url = await account.startLogin();
    await approveInBrowser(mf, url);
    // 没有内置网关：接网关那一步失败，登录回到未登录；之前的账户请求都已发出
    await until(() => account.status().state !== "signing_in");
  };

  beforeEach(async () => {
    mf = await mockModelflare();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "amb-acct-proxy-"));
    process.env.AMB_MODELFLARE_ISSUER = mf.url;
    seen = [];
    app = new App(loadConfig({ dataDir, env: { AMB_MAGPIE_BASE_URL: "http://127.0.0.1:9/v1", AMB_MAGPIE_API_KEY: "local-test", AMB_UI_PORT: "0", AMB_WEIXIN_API_BASE: "http://127.0.0.1:9" } }), { printQrToTerminal: false });
  });
  afterEach(async () => {
    delete process.env.AMB_MODELFLARE_ISSUER;
    app.ensureAccount().cancelLogin();
    await app.stop().catch(() => {});
    await mf.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("桌面版：发现文档、换令牌、读账户、签发 Key 都经过 desktop.fetch", async () => {
    app.desktop = { fetch: desktopFetch } as DesktopHooks;
    await login();
    expect(seen).toEqual(expect.arrayContaining(["/.well-known/openid-configuration", "/oauth/token", "/api/connected-app/account", "/api/connected-app/api-keys"]));
  });

  it("命令行 / Docker（没有 desktop）：用 Node 的 fetch，登录照常发出请求", async () => {
    await login();
    expect(seen).toEqual([]);
    expect(mf.s.tokenForms.length).toBe(1);
  });
});

describe("连不上时的说明", () => {
  const down = (async () => {
    throw new TypeError("fetch failed", { cause: { code: "ECONNRESET" } });
  }) as unknown as typeof fetch;

  it("原因取自 cause（fetch failed 本身什么都没说）；超时说超时；net::ERR_… 原样", () => {
    expect(fetchFailureReason(new TypeError("fetch failed", { cause: { code: "ECONNRESET" } }))).toBe("fetch failed (ECONNRESET)");
    expect(fetchFailureReason(new TypeError("fetch failed"))).toBe("fetch failed");
    expect(fetchFailureReason(Object.assign(new Error("aborted"), { name: "TimeoutError" }))).toBe("超时");
    expect(fetchFailureReason(new Error("net::ERR_PROXY_CONNECTION_FAILED"))).toBe("net::ERR_PROXY_CONNECTION_FAILED");
  });

  it("登录和校验 Key 连不上时提示检查网络、开启系统代理或 TUN 模式", async () => {
    await expect(discover("https://modelflare.dev", down)).rejects.toThrow("连不上 modelflare.dev（fetch failed (ECONNRESET)）。请检查网络；如果在用代理或 VPN，请开启系统代理或 TUN 模式后重试");
    const r = await verifyModelflareKey("https://origin.modelflare.dev/v1", "k", { fetchImpl: down });
    expect(r).toMatchObject({ ok: false, code: "network", message: expect.stringContaining("开启系统代理或 TUN 模式") });
  });
});
