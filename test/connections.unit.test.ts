import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ACCOUNTS_KV, AccountStore, ConnectionError, type ConnectedAccount } from "../src/tools/accounts/index.js";
import { ConnectionService } from "../src/tools/accounts/connections.js";
import { FeishuAccounts, messageText } from "../src/tools/accounts/feishu.js";
import { locateDshRuntime } from "../src/agent/host.js";
import { AgentManager } from "../src/agent/manager.js";
import { NOTION_VERSION, NotionService, mcpProperties, notionId, propertyText, restProperties } from "../src/tools/accounts/notion.js";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/agent/settings.js";
import { AppService } from "../src/tools/apps/service.js";
import { MemorySecrets } from "../src/tools/apps/secrets.js";
import { appConnectOf, appToolOf, promptButtons, promptText } from "../src/agent/approvals.js";
import { findAppRoot } from "../src/magpie/supervisor.js";
import { RULE_DENY } from "../src/tasks/rules.js";
import { Store } from "../src/store/db.js";
import { t } from "../src/i18n/index.js";

const TOKEN = "ntn_secret_token_1234";
const PAGE = "11111111-1111-1111-1111-111111111111";
const SOURCE = "22222222-2222-2222-2222-222222222222";
const DATABASE = "33333333-3333-3333-3333-333333333333";

type Reply = { status?: number; json?: unknown; text?: string; headers?: Record<string, string> } | Error;
interface Call {
  method: string;
  url: string;
  path: string;
  headers: Record<string, string>;
  body: any;
  form?: URLSearchParams;
}

/** 假的 fetch：按顺序回复，记下每次请求 */
function fakeFetch(replies: Reply[]) {
  const calls: Call[] = [];
  const send = (async (url: string, init: RequestInit = {}) => {
    const u = new URL(url);
    const raw = init.body ? String(init.body) : "";
    const isJson = raw.startsWith("{");
    calls.push({
      method: String(init.method ?? "GET"),
      url,
      path: u.pathname + u.search,
      headers: (init.headers ?? {}) as Record<string, string>,
      body: isJson ? JSON.parse(raw) : undefined,
      form: raw && !isJson ? new URLSearchParams(raw) : undefined,
    });
    const r = replies.shift();
    if (!r) throw new Error(`unexpected request ${url}`);
    if (r instanceof Error) throw r;
    return new Response(r.text ?? JSON.stringify(r.json ?? {}), { status: r.status ?? 200, headers: r.headers });
  }) as unknown as typeof fetch;
  return { send, calls, replies };
}

function memoryKv() {
  const m = new Map<string, string>();
  return { getKV: (k: string) => m.get(k), setKV: (k: string, v: string) => void m.set(k, v), m };
}

function notionWith(replies: Reply[]) {
  const kv = memoryKv();
  const accounts = new AccountStore(kv);
  const { send, calls } = fakeFetch(replies);
  const notion = new NotionService({ accounts, kv, fetch: () => send });
  const account = accounts.upsert({ service: "notion", label: "Acme", identity: "token:me", auth: { kind: "notion-token", token: TOKEN } });
  return { notion, accounts, account, calls, kv };
}

function oauthWith(replies: Reply[], over: { expiresAt?: number } = {}) {
  const kv = memoryKv();
  const accounts = new AccountStore(kv);
  const { send, calls } = fakeFetch(replies);
  const notion = new NotionService({ accounts, kv, fetch: () => send });
  const account = accounts.upsert({
    service: "notion",
    label: "Acme",
    identity: "oauth:w:u",
    auth: { kind: "notion-oauth", clientId: "client", accessToken: "access-1", refreshToken: "refresh-1", expiresAt: over.expiresAt ?? Date.now() + 3600_000 },
  });
  return { notion, accounts, account, calls, kv };
}

const META = { json: { authorization_endpoint: "https://mcp.notion.com/authorize", token_endpoint: "https://mcp.notion.com/token", registration_endpoint: "https://mcp.notion.com/register" } };
const pageJson = (title: string, extra: Record<string, unknown> = {}) => ({
  object: "page",
  id: PAGE,
  url: "https://www.notion.so/page",
  properties: { Name: { type: "title", title: [{ plain_text: title }] }, ...extra },
});
const sourceJson = {
  object: "data_source",
  id: SOURCE,
  url: "https://www.notion.so/db",
  title: [{ plain_text: "Tasks" }],
  properties: { Name: { type: "title", title: {} }, Status: { type: "status", status: { options: [{ name: "Todo" }, { name: "Done" }] } } },
};
const rpc = (result: unknown) => ({ json: { jsonrpc: "2.0", id: 1, result } });
const toolText = (text: string) => rpc({ content: [{ type: "text", text }] });

describe("已授权账号：全局列表", () => {
  const add = (accounts: AccountStore, service: "feishu" | "notion", label: string, identity = label) =>
    accounts.upsert({ service, label, identity, auth: { kind: "notion-token", token: `t-${identity}` } });

  it("同一个服务可以加多个账号，按添加顺序编号，存进 KV 后读回来一样", () => {
    const kv = memoryKv();
    const accounts = new AccountStore(kv);
    add(accounts, "feishu", "工作");
    add(accounts, "notion", "Acme");
    add(accounts, "feishu", "个人");
    expect(accounts.view().map((a) => `${a.service} ${a.number} ${a.label}`)).toEqual(["feishu 1 工作", "notion 1 Acme", "feishu 2 个人"]);
    expect(new AccountStore(kv).view()).toEqual(accounts.view());
  });

  it("接口看到的没有令牌", () => {
    const accounts = new AccountStore(memoryKv());
    add(accounts, "notion", "Acme");
    expect(JSON.stringify(accounts.view())).not.toContain("t-Acme");
  });

  it("「第一个」「第二个」和名字都能选到账号", () => {
    const accounts = new AccountStore(memoryKv());
    add(accounts, "feishu", "工作");
    add(accounts, "feishu", "个人");
    expect(accounts.resolve("feishu", 1).label).toBe("工作");
    expect(accounts.resolve("feishu", "2").label).toBe("个人");
    expect(accounts.resolve("feishu", "个人").label).toBe("个人");
  });

  it("有几个账号又没说哪个：报错并列出来，模型再选或问用户", () => {
    const accounts = new AccountStore(memoryKv());
    add(accounts, "feishu", "工作");
    add(accounts, "feishu", "个人");
    expect(() => accounts.resolve("feishu", undefined)).toThrow(/Several Feishu accounts[\s\S]*1\. 工作[\s\S]*2\. 个人/);
    expect(() => accounts.resolve("feishu", "3")).toThrow(/no Feishu account "3"/);
  });

  it("只有一个账号可以不说；没有账号时提示去设置里加", () => {
    const accounts = new AccountStore(memoryKv());
    expect(() => accounts.resolve("notion", undefined)).toThrow(/Connect apps/);
    add(accounts, "notion", "Acme");
    expect(accounts.resolve("notion", undefined).label).toBe("Acme");
  });

  it("重新授权同一个账号：换令牌，保留名字和序号，清掉失效标记", () => {
    const accounts = new AccountStore(memoryKv());
    const a = add(accounts, "feishu", "工作", "same");
    accounts.rename(a.id, "我的飞书");
    accounts.update(a.id, { needsReauth: true });
    const b = accounts.upsert({ service: "feishu", label: "张三", identity: "same", auth: { kind: "notion-token", token: "new" } });
    expect(b.id).toBe(a.id);
    expect(accounts.list()).toHaveLength(1);
    expect(b.label).toBe("我的飞书");
    expect(b.needsReauth).toBe(false);
  });

  it("别名：同一个服务里不能重复（不分大小写），不能为空或全是数字；不同服务可以同名；改回自己的名字没问题", () => {
    const accounts = new AccountStore(memoryKv());
    const a = add(accounts, "feishu", "Work", "a");
    const b = add(accounts, "feishu", "Home", "b");
    const n = add(accounts, "notion", "Acme", "n");
    expect(accounts.rename(b.id, "work")).toBe("taken");
    expect(accounts.get(b.id)!.label).toBe("Home");
    expect(accounts.rename(b.id, "  ")).toBe("invalid");
    expect(accounts.rename(b.id, "2")).toBe("invalid");
    expect(accounts.rename(n.id, "Work")).toBe("ok");
    expect(accounts.rename(a.id, "WORK")).toBe("ok");
    expect(accounts.rename(b.id, "个人飞书")).toBe("ok");
    expect(accounts.resolve("feishu", "个人飞书").id).toBe(b.id);
  });

  it("默认名字撞车：自动加序号，账号总能按名字选到；全是数字时带上服务名", () => {
    const accounts = new AccountStore(memoryKv());
    add(accounts, "feishu", "张三", "a");
    add(accounts, "feishu", "张三", "b");
    add(accounts, "feishu", "张三", "c");
    add(accounts, "feishu", "123", "d");
    expect(accounts.view().map((v) => v.label)).toEqual(["张三", "张三 2", "张三 3", "Feishu 123"]);
    expect(accounts.resolve("feishu", "张三 2").identity).toBe("b");
  });

  it("名字对不上唯一一个账号：不猜，报错并列出来", () => {
    const kv = memoryKv();
    const auth = { kind: "notion-token", token: "t" };
    kv.setKV(ACCOUNTS_KV, JSON.stringify([{ id: "a", service: "feishu", identity: "a", label: "工作", auth }, { id: "b", service: "feishu", identity: "b", label: "工作", auth }]));
    const accounts = new AccountStore(kv);
    expect(() => accounts.resolve("feishu", "工作")).toThrow(/Several Feishu accounts match/);
    const other = new AccountStore(memoryKv());
    add(other, "feishu", "工作一组", "x");
    add(other, "feishu", "工作二组", "y");
    expect(() => other.resolve("feishu", "工作")).toThrow(/Several Feishu accounts match/);
    expect(other.resolve("feishu", "二组").identity).toBe("y");
  });

  it("坏数据不会让程序起不来，只跳过坏的那条", () => {
    const kv = memoryKv();
    kv.setKV(ACCOUNTS_KV, JSON.stringify([{ id: "x", service: "notion", identity: "i", auth: { kind: "notion-token" } }, { id: "y", service: "notion", identity: "j", label: "Ok", auth: { kind: "notion-token", token: "t" } }, "junk"]));
    expect(new AccountStore(kv).list().map((a) => a.label)).toEqual(["Ok"]);
    kv.setKV(ACCOUNTS_KV, "{broken");
    expect(new AccountStore(kv).list()).toEqual([]);
  });

  it("有账号的服务才给工具；账号清单按服务编号", async () => {
    const svc = new ConnectionService({ kv: memoryKv() });
    expect(svc.available()).toEqual({});
    expect(await svc.run("accounts", "list", {})).toMatch(/No accounts/);
    add(svc.accounts, "feishu", "工作");
    add(svc.accounts, "feishu", "个人");
    expect(svc.available()).toEqual({ feishu: true });
    expect(await svc.run("accounts", "list", {})).toContain("Feishu:\n1. 工作\n2. 个人");
    expect(svc.isWrite("notion", "update")).toBe(true);
    expect(svc.isWrite("feishu", "read")).toBe(false);
  });
});

describe("Notion：工具函数", () => {
  it("notionId 认 UUID（带不带横线）和链接；不是 ID 就报错", () => {
    expect(notionId(PAGE.replaceAll("-", ""))).toBe(PAGE);
    expect(notionId(`https://www.notion.so/acme/My-Page-${PAGE.replaceAll("-", "")}?pvs=4`)).toBe(PAGE);
    expect(notionId(`https://www.notion.so/${DATABASE.replaceAll("-", "")}?v=${PAGE.replaceAll("-", "")}`)).toBe(DATABASE);
    expect(() => notionId("../../v1/users")).toThrow(ConnectionError);
  });

  it("propertyText 常见类型读成纯文字", () => {
    expect(propertyText({ type: "status", status: { name: "Done" } })).toBe("Done");
    expect(propertyText({ type: "date", date: { start: "2026-11-01", end: "2026-11-02" } })).toBe("2026-11-01 → 2026-11-02");
    expect(propertyText({ type: "number", number: 0 })).toBe("0");
    expect(propertyText({ type: "something_new", something_new: {} })).toBe("");
  });

  it("简单写法转成 REST 的结构，按列的类型来；已是 Notion 结构的原样用；没有的列报错", () => {
    const schema = { S: { type: "status" }, D: { type: "date" }, T: { type: "multi_select" }, C: { type: "checkbox" }, N: { type: "number" }, X: { type: "rich_text" } };
    expect(restProperties(schema, { S: "Done", D: "2026-11-02", T: ["a", "b"], C: true, N: "3", X: "hi" })).toEqual({
      S: { status: { name: "Done" } },
      D: { date: { start: "2026-11-02" } },
      T: { multi_select: [{ name: "a" }, { name: "b" }] },
      C: { checkbox: true },
      N: { number: 3 },
      X: { rich_text: [{ text: { content: "hi" } }] },
    });
    expect(restProperties(schema, { S: { status: { name: "x" } } })).toEqual({ S: { status: { name: "x" } } });
    expect(() => restProperties(schema, { Nope: 1 })).toThrow(/no column "Nope"/);
  });

  it("简单写法转成远程 MCP 的结构", () => {
    expect(mcpProperties({ S: "Done", C: true, F: false, T: ["a"], D: { start: "2026-11-02", end: "2026-11-03" }, N: 3 })).toEqual({
      S: "Done",
      C: "__YES__",
      F: "__NO__",
      T: '["a"]',
      "date:D:start": "2026-11-02",
      "date:D:end": "2026-11-03",
      N: 3,
    });
  });
});

describe("Notion：令牌账号走 REST", () => {
  it("搜索：带版本和令牌，database 映射成 data_source", async () => {
    const { notion, account, calls } = notionWith([{ json: { results: [pageJson("Plan"), sourceJson] } }]);
    const text = await notion.run(account, "search", { query: "plan", type: "database", limit: 500 });
    expect(calls[0].path).toBe("/v1/search");
    expect(calls[0].headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(calls[0].headers["notion-version"]).toBe(NOTION_VERSION);
    expect(calls[0].body).toEqual({ query: "plan", page_size: 50, filter: { property: "object", value: "data_source" } });
    expect(text).toContain(`[page] Plan | id: ${PAGE}`);
    expect(text).toContain(`[database] Tasks | id: ${SOURCE}`);
  });

  it("读页面：Markdown v2，带属性；被截断时说明", async () => {
    const { notion, account, calls } = notionWith([{ json: pageJson("Plan", { Status: { type: "status", status: { name: "Done" } } }) }, { json: { markdown: "hello", truncated: true } }]);
    const text = await notion.run(account, "read", { page: PAGE });
    expect(calls.map((c) => c.path)).toEqual([`/v1/pages/${PAGE}`, `/v1/pages/${PAGE}/markdown?markdown_version=v2`]);
    expect(text).toContain("# Plan");
    expect(text).toContain("Properties: Status: Done");
    expect(text).toMatch(/cut this page off/);
  });

  it("查数据库：给的是数据库 ID 时换成它的数据源；列出列、选项、行和下一页", async () => {
    const { notion, account, calls } = notionWith([
      { status: 404, json: {} },
      { json: { data_sources: [{ id: SOURCE }] } },
      { json: sourceJson },
      { json: { results: [pageJson("One", { Status: { type: "status", status: { name: "Todo" } } })], has_more: true, next_cursor: "abc" } },
    ]);
    const text = await notion.run(account, "query", { database: DATABASE, cursor: "c1", limit: 5 });
    expect(calls.map((c) => c.path)).toEqual([`/v1/data_sources/${DATABASE}`, `/v1/databases/${DATABASE}`, `/v1/data_sources/${SOURCE}`, `/v1/data_sources/${SOURCE}/query`]);
    expect(calls[3].body).toEqual({ page_size: 5, start_cursor: "c1" });
    expect(text).toContain("Columns: Name (title); Status (status: Todo, Done)");
    expect(text).toContain('cursor "abc"');
  });

  it("新建：页面下用 title，数据库用标题列；没内容时不带 markdown_version（Notion 会拒绝）", async () => {
    const page = notionWith([{ json: pageJson("New") }]);
    await page.notion.run(page.account, "create", { parent: PAGE, title: "New", content: "# hi" });
    expect(page.calls[0].body).toEqual({ parent: { page_id: PAGE }, properties: { title: { title: [{ text: { content: "New" } }] } }, markdown: "# hi", markdown_version: "v2" });

    const row = notionWith([{ json: sourceJson }, { json: pageJson("Row") }]);
    await row.notion.run(row.account, "create", { parent: SOURCE, parent_type: "database", title: "Row", properties: { Status: "Done" } });
    expect(row.calls[1].body).toEqual({ parent: { data_source_id: SOURCE }, properties: { Status: { status: { name: "Done" } }, Name: { title: [{ text: { content: "Row" } }] } } });
  });

  it("修改：属性按页面上的类型转换，替换、追加依次发；不允许删子页面；转告提醒", async () => {
    const { notion, account, calls } = notionWith([{ json: pageJson("P", { Status: { type: "status", status: { name: "Todo" } } }) }, { json: {} }, { json: { warnings: [{ message: "old text not found" }] } }, { json: {} }]);
    const text = await notion.run(account, "update", { page: PAGE, properties: { Status: "Done" }, edits: [{ old: "a", new: "b" }], append: "tail" });
    expect(calls[1].body).toEqual({ properties: { Status: { status: { name: "Done" } } } });
    expect(calls[2].body).toEqual({ type: "update_content", update_content: { content_updates: [{ old_str: "a", new_str: "b" }] }, markdown_version: "v2" });
    expect(calls[3].body).toEqual({ type: "insert_content", insert_content: { content: "tail" }, markdown_version: "v2" });
    expect(JSON.stringify(calls)).not.toContain("allow_deleting_content");
    expect(text).toContain("Notion warning: old text not found");
  });

  it("修改中途失败：告诉模型前面已经做了什么；什么都不改不发请求", async () => {
    const a = notionWith([{ json: pageJson("P", { S: { type: "status" } }) }, { json: {} }, { status: 400, json: { message: "no match" } }]);
    await expect(a.notion.run(a.account, "update", { page: PAGE, properties: { S: "x" }, edits: [{ old: "a", new: "b" }] })).rejects.toThrow(/Already done: updated properties.*no match/);
    const b = notionWith([]);
    await expect(b.notion.run(b.account, "update", { page: PAGE })).rejects.toThrow(/Nothing to change/);
    expect(b.calls).toEqual([]);
  });

  it("令牌被拒：账号标记要重新授权，给模型的话里没有令牌；之后成功就清掉", async () => {
    const { notion, account, accounts } = notionWith([{ status: 401, json: { message: `bad ${TOKEN}` } }, { json: { results: [] } }]);
    const err: Error = await notion.run(account, "search", {}).catch((e) => e);
    expect(err.message).toMatch(/Connect apps/);
    expect(err.message).not.toContain(TOKEN);
    expect(accounts.get(account.id)!.needsReauth).toBe(true);
    await notion.run(account, "search", {});
    expect(accounts.get(account.id)!.needsReauth).toBe(false);
  });

  it("其他错误：找不到提示没共享，参数错转告说明，连不上只说暂时不行", async () => {
    const a = notionWith([{ status: 404, json: {} }]);
    await expect(a.notion.run(a.account, "read", { page: PAGE })).rejects.toThrow(/isn't shared/);
    const b = notionWith([{ status: 400, json: { message: "body.parent should be defined" } }]);
    await expect(b.notion.run(b.account, "create", { parent: PAGE, title: "x" })).rejects.toThrow("Notion refused the request: body.parent should be defined");
    const c = notionWith([new Error("ECONNRESET")]);
    await expect(c.notion.run(c.account, "search", {})).rejects.toThrow(/Could not reach Notion/);
  });

  it("限流：等得不久就重试，等太久让模型晚点再试", async () => {
    const short = notionWith([{ status: 429, headers: { "retry-after": "0.01" } }, { json: { results: [] } }]);
    await short.notion.run(short.account, "search", {});
    expect(short.calls).toHaveLength(2);
    const long = notionWith([{ status: 429, headers: { "retry-after": "60" } }]);
    await expect(long.notion.run(long.account, "search", {})).rejects.toThrow(/about 60 seconds/);
    expect(long.calls).toHaveLength(1);
  });

  it("保存前试令牌：只有明确被拒才算无效；连不上不算", async () => {
    expect(await notionWith([{ json: { id: "u1", bot: { workspace_name: "Acme" } } }]).notion.verifyToken("t")).toEqual({ rejected: false, label: "Acme", identity: "token:u1" });
    expect((await notionWith([{ status: 401 }]).notion.verifyToken("t")).rejected).toBe(true);
    const offline = await notionWith([new Error("offline")]).notion.verifyToken("t");
    expect(offline.rejected).toBe(false);
    expect(offline.identity).toMatch(/^token:/);
  });
});

describe("Notion：一键授权", () => {
  const redirect = "http://127.0.0.1:3600/oauth/notion/callback";

  it("开始授权：注册免密钥客户端，授权地址带 PKCE 和回调；同一回调地址只注册一次", async () => {
    const { notion, calls } = notionWith([META, { json: { client_id: "client-1" } }]);
    const url = new URL(await notion.startAuthorization(redirect));
    const reg = calls.find((c) => c.path === "/register")!;
    expect(reg.body).toMatchObject({ client_name: "okbot", redirect_uris: [redirect], token_endpoint_auth_method: "none" });
    expect(url.origin + url.pathname).toBe("https://mcp.notion.com/authorize");
    expect(url.searchParams.get("client_id")).toBe("client-1");
    expect(url.searchParams.get("redirect_uri")).toBe(redirect);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBeTruthy();
    await notion.startAuthorization(redirect);
    expect(calls.filter((c) => c.path === "/register")).toHaveLength(1);
  });

  it("授权回来：state 一次性；换令牌带 verifier，账号进列表，令牌不是模型能看到的", async () => {
    const { notion, accounts, calls } = notionWith([
      META,
      { json: { client_id: "client-1" } },
      { json: { access_token: "a1", refresh_token: "r1", expires_in: 3600, workspace_id: "w", user_id: "u", workspace_name: "Work" } },
    ]);
    const url = new URL(await notion.startAuthorization(redirect));
    const state = url.searchParams.get("state")!;
    await expect(notion.finishAuthorization({ state: "wrong", code: "c" })).rejects.toThrow(/expired/);
    const account = await notion.finishAuthorization({ state, code: "c" });
    expect(account.label).toBe("Work");
    expect(account.identity).toBe("oauth:w:u");
    const exchange = calls.find((c) => c.form?.get("grant_type") === "authorization_code")!;
    expect(exchange.form!.get("code")).toBe("c");
    expect(exchange.form!.get("code_verifier")).toBeTruthy();
    expect(exchange.form!.get("redirect_uri")).toBe(redirect);
    expect(accounts.view().find((a) => a.id === account.id)!.method).toBe("oauth");
    await expect(notion.finishAuthorization({ state, code: "c" })).rejects.toThrow(/expired/);
  });

  it("用户拒绝授权：不换令牌", async () => {
    const { notion, calls } = notionWith([META, { json: { client_id: "c" } }]);
    const state = new URL(await notion.startAuthorization(redirect)).searchParams.get("state")!;
    await expect(notion.finishAuthorization({ state, error: "access_denied" })).rejects.toThrow(/declined/);
    expect(calls.some((c) => c.form?.get("grant_type"))).toBe(false);
  });

  const init = { json: { jsonrpc: "2.0", id: 1, result: {} }, headers: { "mcp-session-id": "sess" } };

  it("调工具：先握手，带会话 ID；模型只看到工具的文字", async () => {
    const { notion, account, calls } = oauthWith([init, { status: 202, text: "" }, toolText("found it")]);
    expect(await notion.run(account, "search", { query: "plan" })).toBe("found it");
    expect(calls[0].body.method).toBe("initialize");
    expect(calls[1].body.method).toBe("notifications/initialized");
    expect(calls[2].body.params).toEqual({ name: "notion-search", arguments: { query: "plan" } });
    expect(calls[2].headers.authorization).toBe("Bearer access-1");
    expect(calls[2].headers["mcp-session-id"]).toBe("sess");
  });

  it("工具回复可以是 SSE；工具报错转告给模型", async () => {
    const sse = `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "page body" }] } })}\n\n`;
    const a = oauthWith([init, { status: 202, text: "" }, { text: sse, headers: { "content-type": "text/event-stream" } }]);
    expect(await a.notion.run(a.account, "read", { page: PAGE })).toBe("page body");
    const b = oauthWith([init, { status: 202, text: "" }, rpc({ isError: true, content: [{ type: "text", text: "bad page" }] })]);
    await expect(b.notion.run(b.account, "read", { page: PAGE })).rejects.toThrow("Notion refused the request: bad page");
  });

  it("令牌快到期：先换新的，新的 refresh token 马上落盘", async () => {
    const { notion, account, accounts, calls } = oauthWith([META, { json: { access_token: "access-2", refresh_token: "refresh-2", expires_in: 3600 } }, init, { status: 202, text: "" }, toolText("ok")], { expiresAt: Date.now() + 1000 });
    await notion.run(account, "search", {});
    const refresh = calls.find((c) => c.form?.get("grant_type") === "refresh_token")!;
    expect(refresh.form!.get("refresh_token")).toBe("refresh-1");
    expect(refresh.form!.get("client_id")).toBe("client");
    expect((accounts.get(account.id)!.auth as any).refreshToken).toBe("refresh-2");
    expect(calls.at(-1)!.headers.authorization).toBe("Bearer access-2");
  });

  it("同一账号同时要换令牌：只换一次（旧的 refresh token 再用可能吊销整个授权）", async () => {
    const { notion, account, calls } = oauthWith([META, { json: { access_token: "a2", refresh_token: "r2", expires_in: 3600 } }], { expiresAt: Date.now() + 1000 });
    const token = (notion as any).accessToken.bind(notion);
    expect(await Promise.all([token(account), token(account), token(account)])).toEqual(["a2", "a2", "a2"]);
    expect(calls.filter((c) => c.form?.get("grant_type") === "refresh_token")).toHaveLength(1);
  });

  it("refresh token 失效：账号标记要重新授权，不重试", async () => {
    const { notion, account, accounts, calls } = oauthWith([META, { status: 400, json: { error: "invalid_grant" } }], { expiresAt: Date.now() + 1000 });
    await expect(notion.run(account, "search", {})).rejects.toThrow(/re-authorize/);
    expect(accounts.get(account.id)!.needsReauth).toBe(true);
    expect(calls.filter((c) => c.form?.get("grant_type") === "refresh_token")).toHaveLength(1);
  });

  it("新建和修改映射到官方工具的参数", async () => {
    const a = oauthWith([init, { status: 202, text: "" }, toolText("created")]);
    await a.notion.run(a.account, "create", { parent: PAGE, title: "T", content: "# c" });
    expect(a.calls[2].body.params).toEqual({ name: "notion-create-pages", arguments: { parent: { page_id: PAGE }, pages: [{ properties: { title: "T" }, content: "# c" }] } });

    const b = oauthWith([init, { status: 202, text: "" }, toolText("{}"), toolText("{}")]);
    await b.notion.run(b.account, "update", { page: PAGE, properties: { Done: true }, edits: [{ old: "a", new: "b" }] });
    expect(b.calls[2].body.params.arguments).toEqual({ page_id: PAGE, command: "update_properties", properties: { Done: "__YES__" } });
    expect(b.calls[3].body.params.arguments).toEqual({ page_id: PAGE, command: "update_content", content_updates: [{ old_str: "a", new_str: "b" }] });
  });

  it("追加：接在页面最后一行后面，不整页重写；空页面才写入", async () => {
    const a = oauthWith([init, { status: 202, text: "" }, toolText("<page><content>\nfirst\nlast line\n</content></page>"), toolText("{}")]);
    await a.notion.run(a.account, "update", { page: PAGE, append: "more" });
    expect(a.calls[3].body.params.arguments).toEqual({ page_id: PAGE, command: "update_content", content_updates: [{ old_str: "last line", new_str: "last line\nmore" }] });

    const b = oauthWith([init, { status: 202, text: "" }, toolText("<page><content></content></page>"), toolText("{}")]);
    await b.notion.run(b.account, "update", { page: PAGE, append: "more" });
    expect(b.calls[3].body.params.arguments).toEqual({ page_id: PAGE, command: "replace_content", new_str: "more" });
  });

  it("查数据库：先取结构拿 collection 地址，再读行", async () => {
    const { notion, account, calls } = oauthWith([init, { status: 202, text: "" }, toolText(`<data-source url="collection://${SOURCE}">{"schema":{}}</data-source>`), toolText('{"results":[]}')]);
    const text = await notion.run(account, "query", { database: DATABASE, limit: 5 });
    expect(calls[3].body.params).toEqual({ name: "notion-query-data-sources", arguments: { mode: "rows", data_source_url: `collection://${SOURCE}`, limit: 5 } });
    expect(text).toContain('{"results":[]}');
  });
});

function feishuWith(replies: Reply[], over: Partial<{ expiresAt: number }> = {}) {
  const kv = memoryKv();
  const accounts = new AccountStore(kv);
  const { send, calls } = fakeFetch(replies);
  const feishu = new FeishuAccounts({ accounts, fetch: () => send });
  const account: ConnectedAccount = accounts.upsert({
    service: "feishu",
    label: "工作",
    identity: "feishu:ou_1",
    auth: { kind: "feishu-user", brand: "feishu", appId: "cli_1", appSecret: "secret", accessToken: "u-1", refreshToken: "ur-1", expiresAt: over.expiresAt ?? Date.now() + 3600_000 },
  });
  return { feishu, accounts, account, calls };
}
const ok = (data: unknown) => ({ json: { code: 0, data } });
const msg = (text: string, extra: Record<string, unknown> = {}) => ({ msg_type: "text", create_time: "1793500000000", chat_id: "oc_1", sender: { sender_name: "李四" }, body: { content: JSON.stringify({ text }) }, ...extra });

describe("飞书账号：读消息", () => {
  it("消息内容转成文字：文本、富文本、@ 人，其他类型只说是什么", () => {
    expect(messageText(msg("hi @_user_1", { mentions: [{ key: "@_user_1", name: "王五" }] }))).toBe("hi @王五");
    expect(messageText({ msg_type: "post", body: { content: JSON.stringify({ title: "T", content: [[{ tag: "text", text: "a" }, { tag: "img" }]] }) } })).toBe("T\na[image]");
    expect(messageText({ msg_type: "post", body: { content: JSON.stringify({ zh_cn: { content: [[{ tag: "text", text: "中" }]] } }) } })).toBe("中");
    expect(messageText({ msg_type: "image", body: { content: "{}" } })).toBe("[image]");
    expect(messageText({ msg_type: "file", body: { content: JSON.stringify({ file_name: "a.pdf" }) } })).toBe("[file: a.pdf]");
    expect(messageText({ deleted: true, msg_type: "text", body: { content: "{}" } })).toBe("[deleted]");
  });

  it("列会话：用用户令牌，最近活跃的在前，单聊和群聊都有", async () => {
    const { feishu, account, calls } = feishuWith([ok({ items: [{ name: "项目群", chat_mode: "group", chat_id: "oc_1" }, { chat_mode: "p2p", chat_id: "oc_2" }], has_more: true, page_token: "next" })]);
    const text = await feishu.run(account, "chats", {});
    expect(calls[0].url).toContain("https://open.feishu.cn/open-apis/im/v1/chats?");
    expect(calls[0].path).toContain("sort_type=ByActiveTimeDesc");
    expect(new URL(calls[0].url).searchParams.get("types")).toBe("p2p,group");
    expect(calls[0].headers.authorization).toBe("Bearer u-1");
    expect(text).toContain("项目群 | group | chat_id: oc_1");
    expect(text).toContain("(direct message) | p2p | chat_id: oc_2");
    expect(text).toContain('cursor "next"');
  });

  it("按名字找会话", async () => {
    const { feishu, account, calls } = feishuWith([ok({ items: [{ meta_data: { name: "周会", chat_id: "oc_3" } }] })]);
    expect(await feishu.run(account, "chats", { query: "周会" })).toContain("周会");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].path).toContain("/open-apis/im/v2/chats/search");
    expect(calls[0].body).toEqual({ query: "周会" });
  });

  it("读会话：最新的在前，带发送人名字；时间转成秒；缺 chat_id 报错", async () => {
    const { feishu, account, calls } = feishuWith([ok({ items: [msg("你好")], has_more: true, page_token: "older" })]);
    const text = await feishu.run(account, "read", { chat_id: "oc_1", start: "2026-11-01T00:00:00+00:00" });
    const u = new URL(calls[0].url);
    expect(u.searchParams.get("container_id")).toBe("oc_1");
    expect(u.searchParams.get("sort_type")).toBe("ByCreateTimeDesc");
    expect(u.searchParams.get("with_sender_name")).toBe("true");
    expect(u.searchParams.get("start_time")).toBe(String(Date.parse("2026-11-01T00:00:00Z") / 1000));
    expect(text).toContain("李四: 你好");
    expect(text).toContain('cursor "older"');
    await expect(feishu.run(account, "read", {})).rejects.toThrow(/Missing chat_id/);
    await expect(feishu.run(account, "read", { chat_id: "oc_1", start: "tomorrow-ish" })).rejects.toThrow(/isn't a date/);
  });

  it("搜消息：先搜出 ID，再取内容", async () => {
    const { feishu, account, calls } = feishuWith([ok({ items: [{ meta_data: { message_id: "om_1" } }, { meta_data: { message_id: "om_2" } }] }), ok({ items: [msg("周报")] })]);
    const text = await feishu.run(account, "search", { query: "周报", chat_id: "oc_1" });
    expect(calls[0].body).toEqual({ query: "周报", filter: { chat_ids: ["oc_1"] } });
    expect(new URL(calls[1].url).searchParams.getAll("message_ids")).toEqual(["om_1", "om_2"]);
    expect(text).toContain("(chat oc_1): 周报");
  });

  it("令牌快到期：先换新的，新的 refresh token 落盘", async () => {
    const { feishu, account, accounts, calls } = feishuWith([{ json: { access_token: "u-2", refresh_token: "ur-2", expires_in: 7200 } }, ok({ items: [] })], { expiresAt: Date.now() + 1000 });
    await feishu.run(account, "chats", {});
    expect(calls[0].body).toEqual({ grant_type: "refresh_token", refresh_token: "ur-1", client_id: "cli_1", client_secret: "secret" });
    expect((accounts.get(account.id)!.auth as any).refreshToken).toBe("ur-2");
    expect(calls[1].headers.authorization).toBe("Bearer u-2");
  });

  it("令牌被拒：换一次再试；换不了就标记要重新授权", async () => {
    const a = feishuWith([{ json: { code: 99991668, msg: "invalid" } }, { json: { access_token: "u-2", refresh_token: "ur-2" } }, ok({ items: [] })]);
    expect(await a.feishu.run(a.account, "chats", {})).toBe("No chats found.");
    const b = feishuWith([{ json: { code: 99991668 } }, { status: 400, json: { code: 20064, error: "invalid_grant" } }]);
    await expect(b.feishu.run(b.account, "chats", {})).rejects.toThrow(/re-authorize/);
    expect(b.accounts.get(b.account.id)!.needsReauth).toBe(true);
  });

  it("其他错误转告飞书的说明；连不上只说暂时不行", async () => {
    const a = feishuWith([{ json: { code: 99991679, msg: "permission denied" } }]);
    await expect(a.feishu.run(a.account, "chats", {})).rejects.toThrow("Feishu refused the request (99991679): permission denied");
    const b = feishuWith([new Error("offline")]);
    await expect(b.feishu.run(b.account, "chats", {})).rejects.toThrow(/Could not reach Feishu/);
  });
});

describe("飞书账号：添加流程", () => {
  const settle = async (feishu: FeishuAccounts, id: string) => {
    await vi.waitFor(() => expect(["done", "failed"]).toContain(feishu.flow(id)?.state), { timeout: 4000, interval: 10 });
    return feishu.flow(id)!;
  };
  const flowWith = (replies: Reply[]) => {
    const accounts = new AccountStore(memoryKv());
    const { send, calls } = fakeFetch(replies);
    return { feishu: new FeishuAccounts({ accounts, fetch: () => send }), accounts, calls };
  };

  it("一键授权：先创建应用，再设备授权，账号进列表，名字是飞书里的名字", async () => {
    const { feishu, accounts, calls } = flowWith([
      { json: { device_code: "reg", user_code: "UC", interval: 0.01, expire_in: 60 } },
      { json: { client_id: "cli_new", client_secret: "sec_new", user_info: { open_id: "ou_1", tenant_brand: "feishu" } } },
      { json: { device_code: "dev", verification_uri_complete: "https://accounts.feishu.cn/x", interval: 0.01, expires_in: 60 } },
      { json: { error: "authorization_pending" } },
      { json: { access_token: "u-1", refresh_token: "ur-1", expires_in: 7200 } },
      { json: { code: 0, data: { name: "张三", open_id: "ou_1" } } },
    ]);
    const flow = feishu.startFlow();
    expect(flow.state).toBe("create-app");
    const done = await settle(feishu, flow.id);
    expect(done.state).toBe("done");
    expect(done.label).toBe("张三");
    expect(calls[0].form!.get("archetype")).toBe("PersonalAgent");
    expect(calls[2].headers.authorization).toBe(`Basic ${Buffer.from("cli_new:sec_new").toString("base64")}`);
    expect(calls[2].form!.get("scope")).toContain("offline_access");
    expect(calls[2].form!.get("scope")).toContain("im:message.p2p_msg:get_as_user");
    expect(calls[3].form!.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:device_code");
    const [account] = accounts.list("feishu");
    expect(account.label).toBe("张三");
    expect(account.identity).toBe("feishu:ou_1");
    expect(JSON.stringify(done)).not.toContain("sec_new");
  });

  it("用已有应用：跳过创建，只做设备授权", async () => {
    const { feishu, accounts, calls } = flowWith([
      { json: { device_code: "dev", verification_uri_complete: "https://x", interval: 0.01, expires_in: 60 } },
      { json: { access_token: "u", refresh_token: "r" } },
      { json: { code: 0, data: { name: "李四", open_id: "ou_2" } } },
    ]);
    const flow = feishu.startFlow({ appId: "cli_mine", appSecret: "s" });
    expect(flow.state).toBe("authorize");
    expect((await settle(feishu, flow.id)).state).toBe("done");
    expect(calls[0].path).toBe("/oauth/v1/device_authorization");
    expect((accounts.list("feishu")[0].auth as any).appId).toBe("cli_mine");
  });

  it("第二个飞书账号：是另一条；同一个人再授权只换令牌", async () => {
    const replies = (name: string, id: string): Reply[] => [
      { json: { device_code: "d", verification_uri: "https://x", interval: 0.01, expires_in: 60 } },
      { json: { access_token: `a-${id}`, refresh_token: `r-${id}` } },
      { json: { code: 0, data: { name, open_id: id } } },
    ];
    const { feishu, accounts } = flowWith([...replies("工作", "ou_1"), ...replies("个人", "ou_2"), ...replies("工作", "ou_1")]);
    for (let i = 0; i < 3; i++) await settle(feishu, feishu.startFlow({ appId: "a", appSecret: "s" }).id);
    expect(accounts.view().map((a) => `${a.number} ${a.label}`)).toEqual(["1 工作", "2 个人"]);
  });

  it("用户拒绝、过期：流程失败，说明原因，不加账号", async () => {
    const a = flowWith([{ json: { device_code: "d", verification_uri: "https://x", interval: 0.01, expires_in: 60 } }, { json: { error: "access_denied" } }]);
    const fa = await settle(a.feishu, a.feishu.startFlow({ appId: "a", appSecret: "s" }).id);
    expect(fa.state).toBe("failed");
    expect(fa.error).toBe(t("connections.feishuDeclined"));
    expect(a.accounts.list()).toEqual([]);
    const b = flowWith([{ json: { device_code: "d", verification_uri: "https://x", interval: 0.01, expires_in: 60 } }, { json: { error: "expired_token" } }]);
    expect((await settle(b.feishu, b.feishu.startFlow({ appId: "a", appSecret: "s" }).id)).error).toBe(t("connections.feishuAuthExpired"));
  });

  it("App 信息不对：直接说明", async () => {
    const { feishu } = flowWith([{ status: 400, json: { error: "invalid_client" } }]);
    expect((await settle(feishu, feishu.startFlow({ appId: "a", appSecret: "bad" }).id)).error).toBe(t("connections.feishuAppRefused"));
  });

  it("Lark 账号：轮询时换到 Lark 的地址", async () => {
    const { feishu, accounts, calls } = flowWith([
      { json: { device_code: "reg", user_code: "U", interval: 0.01, expire_in: 60 } },
      { json: { error: "authorization_pending", user_info: { tenant_brand: "lark" } } },
      { json: { client_id: "c", client_secret: "s", user_info: { open_id: "ou", tenant_brand: "lark" } } },
      { json: { device_code: "d", verification_uri: "https://x", interval: 0.01, expires_in: 60 } },
      { json: { access_token: "a", refresh_token: "r" } },
      { json: { code: 0, data: { name: "Dana", open_id: "ou" } } },
    ]);
    await settle(feishu, feishu.startFlow().id);
    expect(calls[2].url).toContain("accounts.larksuite.com");
    expect((accounts.list("feishu")[0].auth as any).brand).toBe("lark");
  });

  it("聊天账号一键添加：只扫码创建应用，交给回调连上，不做用户授权", async () => {
    const { feishu, accounts, calls } = flowWith([
      { json: { device_code: "reg", user_code: "UC", interval: 0.01, expire_in: 60 } },
      { json: { client_id: "cli_chat", client_secret: "sec_chat", user_info: { open_id: "ou", tenant_brand: "lark" } } },
      { json: { client_id: "cli_chat", client_secret: "sec_chat", user_info: { open_id: "ou", tenant_brand: "lark" } } },
    ]);
    const got: unknown[] = [];
    const flow = feishu.startAppFlow(async (app) => {
      got.push(app);
      return "飞书";
    });
    expect(flow.state).toBe("create-app");
    const done = await settle(feishu, flow.id);
    expect(done).toMatchObject({ state: "done", label: "飞书", url: "", qr: "" });
    expect(got).toEqual([{ appId: "cli_chat", appSecret: "sec_chat", brand: "lark" }]);
    expect(calls.some((c) => c.path.includes("device_authorization"))).toBe(false);
    // 聊天账号不进数据账号的列表
    expect(accounts.list()).toEqual([]);
  });

  it("聊天账号一键添加：回调失败时流程失败", async () => {
    const { feishu } = flowWith([
      { json: { device_code: "reg", user_code: "UC", interval: 0.01, expire_in: 60 } },
      { json: { client_id: "c", client_secret: "s" } },
    ]);
    const flow = feishu.startAppFlow(async () => {
      throw new ConnectionError("Couldn't connect.");
    });
    expect((await settle(feishu, flow.id)).error).toBe(t("connections.feishuAuthIncomplete"));
  });

  it("取消：流程不再加账号", async () => {
    const { feishu, accounts } = flowWith([{ json: { device_code: "d", verification_uri: "https://x", interval: 30, expires_in: 60 } }]);
    const { id } = feishu.startFlow({ appId: "a", appSecret: "s" });
    await vi.waitFor(() => expect(feishu.flow(id)?.url).toBeTruthy(), { timeout: 2000, interval: 10 });
    feishu.cancelFlow(id);
    expect(feishu.flow(id)).toBeUndefined();
    expect(accounts.list()).toEqual([]);
  });
});

/**
 * 宿主这一侧：bridge 的 /dsh/connections（现有账号的那几个工具）和 /dsh/apps（三个固定的应用工具）经 AgentManager 交给 AppService。
 * 机器人 b1 不在数据库里：用默认设置（工作区可写、使用全部应用）；需要改设置、记「以后都允许」的用例自己建机器人。
 */
async function hostWith(replies: Reply[]) {
  const { send, calls } = fakeFetch(replies);
  const kv = memoryKv();
  const secrets = new MemorySecrets();
  const connections = new ConnectionService({ kv, fetch: () => send, secrets });
  connections.accounts.upsert({ service: "notion", label: "Acme", identity: "t", auth: { kind: "notion-token", token: TOKEN } });
  const apps = new AppService({ kv, secrets, connections });
  const store = new Store(":memory:");
  const mgr = new AgentManager({ store, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), "amb-conn-")), runtimeDir: undefined, upstream: () => ({ baseUrl: "", apiKey: "" }), enabled: false, apps });
  const fakeHost = { taskRootOf: () => undefined, syncPrompt: () => {}, restartIfStale: async () => false };
  (mgr as any).hosts.set("b1", fakeHost);
  await mgr.bridge.start();
  const call = (route: string, body: unknown) =>
    fetch(`${mgr.bridge.url}${route}`, { method: "POST", headers: { authorization: `Bearer ${mgr.bridge.token}`, "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  const post = (body: unknown) => call("/dsh/connections", body);
  const app = (body: unknown) => call("/dsh/apps", body);
  /** 等到有一条待处理的审批（调用正卡在那里等用户） */
  const pending = async () => {
    for (let i = 0; i < 200; i++) {
      const rows = mgr.approvals.pendingAll();
      if (rows.length) return rows;
      await new Promise((r) => setTimeout(r, 10));
    }
    return [];
  };
  const addBot = (settings: Record<string, unknown> = {}) => {
    const bot = store.createBot({ name: "写作机器人", settings: normalizeSettings(settings) });
    (mgr as any).hosts.set(bot.id, fakeHost);
    return bot.id;
  };
  return { mgr, calls, post, app, pending, connections, apps, store, addBot };
}

describe("bridge /dsh/connections → 宿主", () => {
  const write = { botId: "b1", sessionId: "s", service: "notion", op: "create", args: { parent: PAGE, title: "周报 11.11" } };

  it("所有机器人共用：任何已知机器人都能用；不认识的回不可用，错误文字给模型", async () => {
    const { mgr, post, calls } = await hostWith([{ json: { results: [] } }, { json: { results: [] } }, { status: 404 }]);
    try {
      (mgr as any).hosts.set("b2", { taskRootOf: () => undefined, syncPrompt: () => {}, restartIfStale: async () => false });
      expect((await post({ botId: "b1", service: "notion", op: "search", args: {} })).text).toMatch(/Nothing found/);
      expect((await post({ botId: "b2", service: "notion", op: "search", args: {} })).text).toMatch(/Nothing found/);
      expect((await post({ botId: "nobody", service: "notion", op: "search", args: {} })).error).toMatch(/not available/);
      expect((await post({ botId: "b1", service: "notion", op: "read", args: { page: PAGE } })).error).toMatch(/Not found in Notion/);
      expect((await post({ botId: "b1", service: "accounts", op: "list", args: {} })).text).toContain("1. Acme");
      expect(calls).toHaveLength(3);
      // 只读不用问
      expect(mgr.approvals.pendingAll()).toEqual([]);
    } finally {
      await mgr.bridge.stop();
    }
  });

  it("只读机器人：写操作在宿主这边就拒绝（不出审批卡片），读照常", async () => {
    const { mgr, post, calls } = await hostWith([{ json: { results: [] } }]);
    try {
      vi.spyOn(mgr, "settings").mockReturnValue({ ...DEFAULT_SETTINGS, permission: "readonly" });
      expect((await post(write)).error).toMatch(/read-only/);
      expect(calls).toHaveLength(0);
      expect(mgr.approvals.pendingAll()).toEqual([]);
      expect((await post({ botId: "b1", service: "notion", op: "search", args: {} })).text).toBeTruthy();
    } finally {
      await mgr.bridge.stop();
    }
  });

  it("工作区可写（默认）：写入先出审批卡片——哪个应用、哪个工具、关键参数；批了才执行，拒绝就不执行并告诉模型", async () => {
    const { mgr, post, pending, calls } = await hostWith([{ json: pageJson("周报 11.11") }]);
    try {
      const first = post(write);
      const [row] = await pending();
      expect(row).toMatchObject({ kind: "approval", botId: "b1", tool: "Notion · notion_create_page" });
      expect(row.detail).toContain("title: 周报 11.11");
      expect(appToolOf(row)).toMatchObject({ app: "notion", tool: "notion_create_page", category: "write", always: true, params: expect.arrayContaining([["title", "周报 11.11"]]) });
      expect(calls).toHaveLength(0);
      // 渠道里的文字提示沿用现有的写法；卡片按钮是允许 / 拒绝
      expect(promptText(row)).toContain("Notion · notion_create_page");
      expect(promptButtons(row)).toHaveLength(2);
      expect(mgr.approvals.decide(row.id, true, "web")).toBe(true);
      expect((await first).text).toMatch(/Created/);
      expect(calls).toHaveLength(1);
      // 「允许（仅本次）」只管这一次：再写还问。这次拒绝
      const second = post(write);
      const [again] = await pending();
      expect(again.id).not.toBe(row.id);
      mgr.approvals.decide(again.id, false, "web");
      expect((await second).error).toMatch(/denied/);
      expect(calls).toHaveLength(1);
    } finally {
      await mgr.bridge.stop();
    }
  });

  it("「以后这个工具都允许」：同一个机器人对同一个工具不再出卡片；在机器人设置里撤销后恢复；别的机器人不受影响", async () => {
    const { mgr, post, pending, calls, store, addBot } = await hostWith([{ json: pageJson("a") }, { json: pageJson("b") }]);
    try {
      const bot = addBot();
      const other = addBot();
      const mine = { ...write, botId: bot };
      const first = post(mine);
      const [row] = await pending();
      expect(mgr.approvals.decide(row.id, true, "web", { always: true })).toBe(true);
      expect((await first).text).toMatch(/Created/);
      expect(store.getApproval(row.id)).toMatchObject({ status: "allowed", result: "always" });
      const granted = store.getBot(bot)!.settings.apps.alwaysAllow;
      expect(Object.keys(granted.notion)).toEqual(["notion_create_page"]);
      // 第二次直接执行，没有新的审批
      expect((await post(mine)).text).toMatch(/Created/);
      expect(mgr.approvals.pendingAll()).toEqual([]);
      expect(calls).toHaveLength(2);
      // 另一个机器人还是要问
      const theirs = post({ ...write, botId: other });
      const [otherRow] = await pending();
      expect(otherRow.botId).toBe(other);
      mgr.approvals.decide(otherRow.id, false, "web");
      await theirs;
      // 撤销：下一次写入又出卡片
      const cur = store.getBot(bot)!;
      store.updateBot(bot, { settings: { ...cur.settings, apps: { ...cur.settings.apps, alwaysAllow: {} } } });
      const third = post(mine);
      const [back] = await pending();
      expect(appToolOf(back)!.always).toBe(true);
      mgr.approvals.decide(back.id, false, "web");
      await third;
    } finally {
      await mgr.bridge.stop();
    }
  });

  it("完全权限：写入直接执行，不问", async () => {
    const { mgr, post, calls, addBot } = await hostWith([{ json: pageJson("x") }]);
    try {
      const bot = addBot({ permission: "full" });
      expect((await post({ ...write, botId: bot })).text).toMatch(/Created/);
      expect(mgr.approvals.pendingAll()).toEqual([]);
      expect(calls).toHaveLength(1);
    } finally {
      await mgr.bridge.stop();
    }
  });

  it("应用没分给这个机器人、或工具被它关掉：看不到也调不了", async () => {
    const { mgr, post, calls, apps, addBot } = await hostWith([]);
    try {
      const bot = addBot({ apps: { toolsOff: { notion: ["notion_search"] } } });
      expect((await post({ botId: bot, service: "notion", op: "search", args: {} })).error).toMatch(/turned off/);
      apps.setAccess("notion", ["someone-else"]);
      expect((await post({ botId: bot, service: "notion", op: "read", args: { page: PAGE } })).error).toMatch(/not available to this bot/);
      expect(calls).toHaveLength(0);
    } finally {
      await mgr.bridge.stop();
    }
  });

  it("观察规则不能写（直接拒绝并说明）；执行规则的写入进审批，批了才执行", async () => {
    const { mgr, post, pending, calls } = await hostWith([{ json: pageJson("x") }]);
    try {
      let mode = "observe";
      (mgr as any).tasks = { ruleOfSession: () => ({ ruleId: "r", runId: "u", conversationId: "c", mode }), taskOfSession: () => undefined };
      expect((await post(write)).error).toBe("This task is observe-only and can't use write, delete, or outbound tools.");
      expect(calls).toHaveLength(0);
      expect(mgr.approvals.pendingAll()).toEqual([]);
      mode = "act";
      const run = post(write);
      const [row] = await pending();
      expect(row).toMatchObject({ ruleId: "r", runId: "u", conversationId: "c" });
      mgr.approvals.decide(row.id, true, "web");
      expect((await run).text).toMatch(/Created/);
    } finally {
      await mgr.bridge.stop();
    }
  });

  it("规则的工具清单：观察去掉写工具，执行留着，读工具都留着；规则里不能请用户去连接应用", () => {
    for (const tool of ["notion_create_page", "notion_update_page"]) {
      expect(RULE_DENY.observe).toContain(tool);
      expect(RULE_DENY.act).not.toContain(tool);
    }
    for (const tool of ["notion_read_page", "feishu_read_chat", "connected_accounts", "app_tools", "app_call"]) expect(RULE_DENY.observe).not.toContain(tool);
    for (const mode of ["observe", "act"] as const) expect(RULE_DENY[mode]).toContain("app_connect");
  });
});

describe("bridge /dsh/apps → 宿主（三个固定的应用工具和连接卡片）", () => {
  /** 聊天回合里来的调用：会话 s1 属于这个机器人的一个对话 */
  async function chat() {
    const h = await hostWith([]);
    const bot = h.addBot();
    const conv = h.store.ensureConversation(bot, "web", "console");
    h.store.setAgentSession(conv.id, bot, "s1");
    return { ...h, bot, conv };
  }

  it("没有连接时：清单里列出可以去连的应用；找工具、看参数回的是给模型的说明", async () => {
    const { mgr, app, bot } = await chat();
    try {
      const list = (await app({ botId: bot, sessionId: "s1", op: "list", args: {} })).text;
      expect(list).toContain('Notion (app "notion")');
      expect(list).toMatch(/Not connected yet.*feishu/);
      expect((await app({ botId: bot, sessionId: "s1", op: "tools", args: { app: "notion" } })).text).toMatch(/use their own tools directly/);
      expect((await app({ botId: bot, sessionId: "s1", op: "call", args: { app: "linear", tool: "x" } })).error).toMatch(/app_connect/);
      expect((await app({ botId: bot, sessionId: "s1", op: "nope", args: {} })).error).toBe("unknown op");
    } finally {
      await mgr.bridge.stop();
    }
  });

  it("app_connect：对话里出「去连接」卡片并等着；连上后卡片记成已处理，调用返回、原来的任务接着做", async () => {
    const { mgr, app, pending, apps, bot, conv } = await chat();
    try {
      const waiting = app({ botId: bot, sessionId: "s1", op: "connect", args: { app: "linear", reason: "要把纪要记成 Linear 的 issue，需要先连接 Linear。" } });
      const [row] = await pending();
      expect(row).toMatchObject({ kind: "approval", tool: "app_connect", conversationId: conv.id, botId: bot });
      expect(appConnectOf(row)).toMatchObject({ app: "linear", appName: "Linear", kind: "connect", custom: false, reason: expect.stringContaining("Linear") });
      // 渠道里只提示回到电脑上处理，没有按钮；回 y 不算数，界面也只能关掉不能「批准」
      expect(promptText(row)).toBe(t("apps.channelConnect", { app: "Linear" }));
      expect(promptButtons(row)).toBeUndefined();
      expect(mgr.approvals.handleReply(conv.id, `y ${row.code}`, "wx").handled).toBe(true);
      expect(mgr.approvals.decide(row.id, true, "web")).toBe(false);
      expect(mgr.approvals.pendingAll()).toHaveLength(1);
      // 同一个应用再要一次：还是这一张卡片，不堆第二张
      const again = app({ botId: bot, sessionId: "s1", op: "connect", args: { app: "linear", reason: "again" } });
      await new Promise((r) => setTimeout(r, 50));
      expect(mgr.approvals.pendingAll()).toHaveLength(1);
      // 用户连上了（这里直接放一条已连接的记录进去）
      apps.store.put({ id: "lin1", app: "linear", label: "Linear", identity: "lin1", transport: "http", url: "https://mcp.linear.app/mcp", auth: "oauth", enabled: true, state: "connected", checkedAt: Date.now(), tools: [{ name: "list_issues", description: "List issues", inputSchema: { type: "object" }, category: "read", hash: "h" }], createdAt: Date.now() }, {});
      const done = await waiting;
      expect(done.text).toMatch(/Linear is connected/);
      expect(done.text).toContain("linear / list_issues [read]");
      expect((await again).text).toMatch(/Linear is connected/);
      expect(mgr.approvals.pendingAll()).toEqual([]);
    } finally {
      await mgr.bridge.stop();
    }
  });

  it("用户关掉卡片（先不连接）：告诉模型没连上；已经连着的应用不出卡片", async () => {
    const { mgr, app, pending, bot } = await chat();
    try {
      const waiting = app({ botId: bot, sessionId: "s1", op: "connect", args: { app: "github", reason: "x" } });
      const [row] = await pending();
      expect(mgr.approvals.decide(row.id, false, "web")).toBe(true);
      expect((await waiting).error).toMatch(/did not connect GitHub/);
      expect((await app({ botId: bot, sessionId: "s1", op: "connect", args: { app: "notion", reason: "x" } })).text).toMatch(/Notion is connected/);
      expect((await app({ botId: bot, sessionId: "s1", op: "connect", args: { app: "no-such-app", reason: "x" } })).error).toMatch(/There is no app/);
    } finally {
      await mgr.bridge.stop();
    }
  });

  it("后台任务、规则里没人在旁边：不出卡片、不等，直接告诉模型去提醒用户", async () => {
    const { mgr, app } = await hostWith([]);
    try {
      expect((await app({ botId: "b1", sessionId: "task-1", op: "connect", args: { app: "linear", reason: "x" } })).error).toMatch(/nobody is here/);
      expect(mgr.approvals.pendingAll()).toEqual([]);
    } finally {
      await mgr.bridge.stop();
    }
  });

  it("现有账号授权失效：出「重新授权」卡片；用户处理完后自动重试刚才那一步", async () => {
    // 第一次 Notion 拒绝了令牌（账号被标成要重新授权），用户处理完后的重试成功
    const h = await hostWith([{ status: 401, json: { code: "unauthorized" } }, { json: { results: [] } }]);
    const bot = h.addBot();
    const conv = h.store.ensureConversation(bot, "web", "console");
    h.store.setAgentSession(conv.id, bot, "s1");
    try {
      const acc = h.connections.accounts.list("notion")[0];
      const run = h.post({ botId: bot, sessionId: "s1", service: "notion", op: "search", args: {} });
      const [row] = await h.pending();
      expect(h.connections.accounts.get(acc.id)!.needsReauth).toBe(true);
      expect(appConnectOf(row)).toMatchObject({ app: "notion", kind: "reauthorize", accountId: acc.id });
      expect(promptText(row)).toBe(t("apps.channelRepair", { app: "Notion" }));
      h.connections.accounts.update(acc.id, { needsReauth: false });
      expect((await run).text).toMatch(/Nothing found/);
    } finally {
      await h.mgr.bridge.stop();
    }
  });
});

describe("amb-connections 插件", () => {
  const runtime = locateDshRuntime(findAppRoot());

  it.skipIf(!runtime)("宿主让注册什么就注册什么：现有账号的工具和固定的应用工具；调用经 bridge 由宿主执行，带上选的账号", async () => {
    const { mgr, calls } = await hostWith([{ json: { results: [pageJson("Plan")] } }, { status: 404 }]);
    const env = { ...process.env };
    try {
      Object.assign(process.env, { AMB_BRIDGE_URL: mgr.bridge.url, AMB_BRIDGE_TOKEN: mgr.bridge.token, AMB_BOT_ID: "b1" });
      const plugin = await import(path.join(runtime!, "plugins", "amb-connections.mjs"));
      expect(plugin.inject).toEqual(["tools"]);
      const load = (config: unknown) => {
        process.env.AMB_CONNECTIONS = JSON.stringify(config);
        const tools: any[] = [];
        plugin.apply({ tools: { register: (t: any) => tools.push(t) } });
        return tools;
      };
      const NOTION_READ = ["notion_search", "notion_read_page", "notion_query_database"];
      const NOTION_WRITE = ["notion_create_page", "notion_update_page"];
      const FEISHU = ["feishu_list_chats", "feishu_read_chat", "feishu_search_messages"];
      const APPS = ["app_tools", "app_tool_schema", "app_call", "app_connect"];
      // 宿主说注册什么就注册什么：apps = 三个固定的应用工具（加 app_connect），tools = 现有账号的工具里这个机器人能用的
      expect(load({})).toEqual([]);
      expect(load({ apps: false, tools: [] })).toEqual([]);
      expect(load({ apps: true, tools: [] }).map((t) => t.name)).toEqual(["connected_accounts", ...APPS]);
      expect(load({ apps: false, tools: FEISHU }).map((t) => t.name)).toEqual(["connected_accounts", ...FEISHU]);
      expect(load({ apps: true, tools: NOTION_READ }).map((t) => t.name)).toEqual(["connected_accounts", ...NOTION_READ, ...APPS]);
      const tools = load({ apps: true, tools: [...FEISHU, ...NOTION_READ, ...NOTION_WRITE] });
      expect(tools.map((t) => t.name)).toEqual(["connected_accounts", ...FEISHU, ...NOTION_READ, ...NOTION_WRITE, ...APPS]);
      expect(tools.some((t) => /delete|trash|archive|send/.test(t.name))).toBe(false);
      for (const t of tools.filter((t) => !["connected_accounts", "app_tools", "app_tool_schema", "app_connect"].includes(t.name))) expect(t.parameters.properties.account).toBeTruthy();
      expect(tools.find((t) => t.name === "app_call").parameters.properties.arguments).toBeTruthy();

      const exec = { agent: { session: { id: "s1" } }, signal: AbortSignal.timeout(5000) };
      const search = tools.find((t) => t.name === "notion_search");
      expect((await search.execute({ account: "1", query: "plan" }, exec)).text).toContain("[page] Plan");
      expect(calls[0].body.query).toBe("plan");
      const read = tools.find((t) => t.name === "notion_read_page");
      await expect(read.execute({ page: PAGE }, exec)).rejects.toThrow(/Not found in Notion/);
    } finally {
      process.env = env;
      await mgr.bridge.stop();
    }
  });
});
