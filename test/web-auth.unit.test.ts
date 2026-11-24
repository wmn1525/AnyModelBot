import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { App } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { uiToken } from "./helpers.js";

/**
 * 管理接口在回环地址上也要访问令牌（src/web/server.ts）。代理沙箱里的命令、本机其他账号都连得到 127.0.0.1，
 * 不带令牌就能改机器人权限、批准审批，所以命令行方式默认也生成令牌，没有令牌一律拒绝。
 * 这里的请求用 node:http 直接发：test/setup.ts 会给 fetch 自动带上令牌，验证不了「不带会被拒绝」。
 */
function request(url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: init.method ?? "GET", headers: init.headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c as Buffer));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end(init.body);
  });
}

const env = { AMB_MAGPIE_BASE_URL: "http://127.0.0.1:9/v1", AMB_MAGPIE_API_KEY: "x", AMB_UI_PORT: "0", AMB_AGENT: "off" };

describe("管理接口：回环地址上没配令牌", () => {
  let app: App;
  let base: string;
  let dataDir: string;
  let token: string;
  beforeAll(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "amb-web-auth-"));
    app = new App(loadConfig({ dataDir, env }), { printQrToTerminal: false });
    await app.start();
    base = app.web!.url.replace(/\/$/, "");
    token = fs.readFileSync(path.join(dataDir, "ui-token"), "utf8").trim();
  });
  afterAll(async () => {
    await app?.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("启动时生成令牌，写在数据目录里，只有自己能读", () => {
    expect(app.config.ui.host).toBe("127.0.0.1");
    expect(token.length).toBeGreaterThanOrEqual(20);
    expect(app.web!.token).toBe(token);
    expect(uiToken(base)).toBe(token);
    if (process.platform !== "win32") expect(fs.statSync(path.join(dataDir, "ui-token")).mode & 0o777).toBe(0o600);
  });

  it("不带令牌：读状态、改机器人权限、列审批、批准审批都是 401，权限没被改", async () => {
    const before = app.store.getBot("default")!.settings.permission;
    expect(before).not.toBe("full");
    expect((await request(`${base}/amb/api/status`)).status).toBe(401);
    const put = await request(`${base}/amb/api/bots/default/settings`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ permission: "full" }) });
    expect(put.status).toBe(401);
    expect((await request(`${base}/amb/api/approvals`)).status).toBe(401);
    expect((await request(`${base}/amb/api/approvals/anything/approve`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status).toBe(401);
    expect((await request(`${base}/`)).status).toBe(401);
    expect(app.store.getBot("default")!.settings.permission).toBe(before);
  });

  it("令牌不对一样是 401", async () => {
    expect((await request(`${base}/amb/api/status`, { headers: { "x-amb-token": token + "x" } })).status).toBe(401);
    expect((await request(`${base}/amb/api/status`, { headers: { cookie: "amb_token=" } })).status).toBe(401);
    expect((await request(`${base}/amb/api/status?token=`)).status).toBe(401);
  });

  it("带上令牌（请求头或 Cookie）才放行；/?token= 换成 Cookie 并去掉地址里的令牌", async () => {
    expect((await request(`${base}/amb/api/status`, { headers: { "x-amb-token": token } })).status).toBe(200);
    expect((await request(`${base}/amb/api/status`, { headers: { cookie: `amb_token=${token}` } })).status).toBe(200);
    const open = await request(`${base}/?token=${encodeURIComponent(token)}`);
    expect(open.status).toBe(302);
    expect(open.headers.location).toBe("/");
    expect(String(open.headers["set-cookie"])).toContain(`amb_token=${token}`);
    expect(String(open.headers["set-cookie"])).toContain("HttpOnly");
  });
});

describe("管理接口：数据目录里的令牌文件", () => {
  const boot = async (dataDir: string) => {
    const app = new App(loadConfig({ dataDir, env }), { printQrToTerminal: false });
    await app.start();
    return app;
  };

  it("重启后沿用同一个令牌（浏览器里记住的那个还能用）", async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "amb-web-auth-"));
    try {
      const first = await boot(dataDir);
      const token = first.web!.token;
      await first.stop();
      const second = await boot(dataDir);
      try {
        expect(second.web!.token).toBe(token);
        expect((await request(`${second.web!.url}amb/api/status`, { headers: { "x-amb-token": token } })).status).toBe(200);
      } finally {
        await second.stop();
      }
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("令牌文件是空的：重新生成，而不是当成不需要令牌", async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "amb-web-auth-"));
    fs.writeFileSync(path.join(dataDir, "ui-token"), "\n", { mode: 0o644 });
    const app = await boot(dataDir);
    try {
      const token = fs.readFileSync(path.join(dataDir, "ui-token"), "utf8").trim();
      expect(token.length).toBeGreaterThanOrEqual(20);
      expect(app.web!.token).toBe(token);
      if (process.platform !== "win32") expect(fs.statSync(path.join(dataDir, "ui-token")).mode & 0o777).toBe(0o600);
      expect((await request(`${app.web!.url}amb/api/status`)).status).toBe(401);
      expect((await request(`${app.web!.url}amb/api/status`, { headers: { "x-amb-token": "" } })).status).toBe(401);
    } finally {
      await app.stop();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
