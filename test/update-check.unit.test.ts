import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App, type DesktopHooks } from "../src/app.js";
import { appVersion } from "../src/version.js";
import { loadConfig } from "../src/config.js";
import { UpdateChecker, installerSuffix, isNewer } from "../src/updates/check.js";

const BASE = "https://github.com/wmn1525/AnyModelBot/releases";
const ALL_ASSETS = ["win-x64.exe", "win-arm64.exe", "mac-x64.dmg", "mac-arm64.dmg", "linux-x86_64.AppImage", "linux-arm64.AppImage"].map((s) => ({
  name: `anymodel-bot-0.2.0-${s}`,
  browser_download_url: `${BASE}/download/v0.2.0/anymodel-bot-0.2.0-${s}`,
}));
const release = (over: Record<string, unknown> = {}) => ({ tag_name: "v0.2.0", html_url: `${BASE}/tag/v0.2.0`, assets: ALL_ASSETS, ...over });
const reply = (json: unknown, status = 200) => async () => new Response(JSON.stringify(json), { status }) as Response;
const checker = (send: unknown, platform = "win32", arch = "x64") =>
  new UpdateChecker({ current: "0.1.16", fetch: () => send as typeof fetch, platform, arch });

describe("版本比较", () => {
  it("按数字比，不按字符串比", () => {
    expect(isNewer("0.1.17", "0.1.16")).toBe(true);
    expect(isNewer("0.1.100", "0.1.99")).toBe(true);
    expect(isNewer("v0.2.0", "0.1.99")).toBe(true);
    expect(isNewer("1.0.0", "0.9.9")).toBe(true);
  });

  it("相同、更旧、预发布和写法不对的都不提示", () => {
    expect(isNewer("0.1.16", "0.1.16")).toBe(false);
    expect(isNewer("0.1.15", "0.1.16")).toBe(false);
    expect(isNewer("0.2.0-beta.1", "0.1.16")).toBe(false);
    expect(isNewer("", "0.1.16")).toBe(false);
    expect(isNewer("latest", "0.1.16")).toBe(false);
    expect(isNewer("0.2.0", "")).toBe(false);
  });
});

describe("安装包选择", () => {
  it("和发布的文件名对得上", () => {
    expect(installerSuffix("win32", "x64")).toBe("-win-x64.exe");
    expect(installerSuffix("win32", "arm64")).toBe("-win-arm64.exe");
    expect(installerSuffix("darwin", "x64")).toBe("-mac-x64.dmg");
    expect(installerSuffix("darwin", "arm64")).toBe("-mac-arm64.dmg");
    expect(installerSuffix("linux", "x64")).toBe("-linux-x86_64.AppImage");
    expect(installerSuffix("linux", "arm64")).toBe("-linux-arm64.AppImage");
  });

  it("没有对应安装包的系统和架构回 null", () => {
    expect(installerSuffix("freebsd", "x64")).toBeNull();
    expect(installerSuffix("win32", "ia32")).toBeNull();
  });
});

describe("检查新版本", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("查之前什么都不提示", () => {
    expect(checker(reply(release())).status()).toEqual({ current: "0.1.16", latest: "", available: false, downloadUrl: "", releaseUrl: "" });
  });

  it("有新版本：给这台机器对应的安装包和发布页", async () => {
    const c = checker(reply(release()), "darwin", "arm64");
    expect(await c.check()).toBe(true);
    expect(c.status()).toEqual({
      current: "0.1.16",
      latest: "0.2.0",
      available: true,
      downloadUrl: `${BASE}/download/v0.2.0/anymodel-bot-0.2.0-mac-arm64.dmg`,
      releaseUrl: `${BASE}/tag/v0.2.0`,
    });
  });

  it("请求里只有版本号，不带别的身份信息", async () => {
    const send = vi.fn(reply(release()));
    await checker(send).check();
    const [url, init] = send.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/wmn1525/AnyModelBot/releases/latest");
    expect(init.headers).toEqual({ Accept: "application/vnd.github+json", "User-Agent": "anymodel-bot/0.1.16" });
    expect(init.body).toBeUndefined();
  });

  it("已经是最新：记下版本号，不提示", async () => {
    const c = checker(reply(release({ tag_name: "v0.1.16" })));
    await c.check();
    expect(c.status()).toMatchObject({ latest: "0.1.16", available: false });
  });

  it("找不到这台机器的安装包：退回发布页", async () => {
    const c = checker(reply(release({ assets: ALL_ASSETS.filter((a) => !a.name.endsWith("win-x64.exe")) })));
    await c.check();
    expect(c.status()).toMatchObject({ available: true, downloadUrl: `${BASE}/tag/v0.2.0` });
    const noAssets = checker(reply(release({ assets: "oops" })));
    await noAssets.check();
    expect(noAssets.status().downloadUrl).toBe(`${BASE}/tag/v0.2.0`);
  });

  it("不是本仓库发布页的地址不会交给浏览器", async () => {
    const c = checker(
      reply(release({ html_url: "https://evil.example/x", assets: [{ name: "anymodel-bot-0.2.0-win-x64.exe", browser_download_url: "https://evil.example/x.exe" }] })),
    );
    await c.check();
    expect(c.status()).toMatchObject({ available: true, downloadUrl: `${BASE}/latest`, releaseUrl: `${BASE}/latest` });
  });

  it("失败（断网、限流、格式不对）：回 false，保留上次的结果", async () => {
    const send = vi.fn(reply(release()));
    const c = checker(send);
    await c.check();
    const before = c.status();
    send.mockImplementationOnce(async () => {
      throw new Error("offline");
    });
    expect(await c.check()).toBe(false);
    send.mockImplementationOnce(reply({ message: "rate limited" }, 403));
    expect(await c.check()).toBe(false);
    send.mockImplementationOnce(reply({ tag_name: "nightly" }));
    expect(await c.check()).toBe(false);
    expect(c.status()).toEqual(before);
  });

  it("启动后过一会儿才查；成功后 6 小时再查，失败后 30 分钟重试；stop 后不再查", async () => {
    vi.useFakeTimers();
    const send = vi.fn(reply(release()));
    const c = checker(send);
    c.start();
    c.start(); // 重复调用不会多开一个定时器
    expect(send).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(send).toHaveBeenCalledTimes(1);

    send.mockImplementationOnce(async () => {
      throw new Error("offline");
    });
    await vi.advanceTimersByTimeAsync(6 * 3600_000);
    expect(send).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(send).toHaveBeenCalledTimes(3);

    c.stop();
    await vi.advanceTimersByTimeAsync(24 * 3600_000);
    expect(send).toHaveBeenCalledTimes(3);
  });
});

describe("接到应用上", () => {
  const TOKEN = "update-test-token";
  const boot = async (desktop?: Partial<DesktopHooks>) => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "amb-update-"));
    const env = { AMB_MAGPIE_BASE_URL: "http://127.0.0.1:9/v1", AMB_UI_PORT: "0", AMB_UI_TOKEN: TOKEN, AMB_AGENT: "off", AMB_UI_HOST: "127.0.0.1" };
    const app = new App(loadConfig({ dataDir, env }), { printQrToTerminal: false });
    if (desktop) app.desktop = desktop as DesktopHooks;
    const start = vi.spyOn(app.updates, "start").mockImplementation(() => {});
    await app.start();
    return { app, start };
  };

  it("Docker 和命令行不查；接口回当前版本，不提示", async () => {
    const { app, start } = await boot();
    try {
      expect(start).not.toHaveBeenCalled();
      const res = await fetch(`${app.web!.url.replace(/\/$/, "")}/amb/api/update`, { headers: { "x-amb-token": TOKEN } });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ current: appVersion(), latest: "", available: false, downloadUrl: "", releaseUrl: "" });
    } finally {
      await app.stop();
    }
  });

  it("桌面版启动时开始查，查询走桌面的网络栈", async () => {
    const send = vi.fn(reply(release({ tag_name: "v999.0.0" })));
    const { app, start } = await boot({ fetch: send as unknown as typeof fetch });
    try {
      expect(start).toHaveBeenCalledTimes(1);
      await app.updates.check();
      expect(send).toHaveBeenCalledTimes(1);
      expect(app.updates.status()).toMatchObject({ latest: "999.0.0", available: true });
    } finally {
      await app.stop();
    }
  });

  it("接口要访问令牌", async () => {
    const { app } = await boot();
    try {
      const res = await fetch(`${app.web!.url.replace(/\/$/, "")}/amb/api/update`);
      expect(res.status).toBe(401);
    } finally {
      await app.stop();
    }
  });

  it("自动下载默认开启，关闭后保存到配置；更新操作需要令牌且忙时不能重启", async () => {
    const updates = {
      start: vi.fn(), stop: vi.fn(), check: vi.fn(async () => {}), download: vi.fn(), install: vi.fn(), setAutoDownload: vi.fn(),
      status: () => ({ current: appVersion(), latest: "999.0.0", available: true, supported: true, phase: "ready" as const, downloadUrl: "", releaseUrl: "" }),
    };
    const { app, start } = await boot({ updates, autostart: () => ({ supported: false, on: false }) });
    const base = app.web!.url.replace(/\/$/, "") + "/amb/api";
    const headers = { "x-amb-token": TOKEN, "content-type": "application/json" };
    try {
      expect(start).not.toHaveBeenCalled();
      expect(updates.start).toHaveBeenCalledOnce();
      expect((await (await fetch(base + "/settings", { headers })).json()).autoDownloadUpdates).toBe(true);
      const saved = await fetch(base + "/settings", { method: "PUT", headers, body: JSON.stringify({ autoDownloadUpdates: false }) });
      expect(saved.status).toBe(200);
      expect(updates.setAutoDownload).toHaveBeenCalledWith(false);
      expect(loadConfig({ dataDir: app.config.dataDir, env: {} }).ui.autoDownloadUpdates).toBe(false);
      const unauth = await fetch(base + "/update/install", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      expect(unauth.status).toBe(401);
      expect(updates.install).not.toHaveBeenCalled();
      await fetch(base + "/update/download", { method: "POST", headers, body: "{}" });
      expect(updates.download).toHaveBeenCalledOnce();
      const busy = vi.spyOn(app.runtime, "busyBots").mockReturnValue(["default"]);
      const blocked = await fetch(base + "/update/install", { method: "POST", headers, body: "{}" });
      expect(blocked.status).toBe(409);
      expect(await blocked.json()).toMatchObject({ code: "busy" });
      expect(updates.install).not.toHaveBeenCalled();
      busy.mockRestore();
      const groupBusy = vi.spyOn(app.web!, "busy").mockReturnValue(true);
      expect((await fetch(base + "/update/install", { method: "POST", headers, body: "{}" })).status).toBe(409);
      expect(updates.install).not.toHaveBeenCalled();
      groupBusy.mockRestore();
      expect((await fetch(base + "/update/install", { method: "POST", headers, body: "{}" })).status).toBe(200);
      expect(updates.install).toHaveBeenCalledOnce();
    } finally { await app.stop(); }
    expect(updates.stop).toHaveBeenCalledOnce();
  });

  it("CLI 和 Docker 不提供安装更新的操作", async () => {
    const { app } = await boot();
    try {
      const res = await fetch(`${app.web!.url.replace(/\/$/, "")}/amb/api/update/install`, { method: "POST", headers: { "x-amb-token": TOKEN, "content-type": "application/json" }, body: "{}" });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ code: "unsupported" });
    } finally { await app.stop(); }
  });
});
