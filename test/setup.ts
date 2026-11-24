/**
 * 管理接口在回环地址上也要带访问令牌（src/web/server.ts）。测试里起的 App 多数没配令牌，用的是启动时生成的那个：
 * 这里记下每个这样的管理界面的令牌，发给它的 fetch 自动带上，各个用例照常写 fetch(base + ...)。
 *
 * 自己配了令牌的用例（AMB_UI_TOKEN）不登记：带不带、带什么由用例自己定。
 * 要发一个真的不带令牌的请求（验证会被拒绝），用 node:http。浏览器用例先调 helpers.ts 的 signIn。
 */
import { vi } from "vitest";

/** 管理界面的来源（http://127.0.0.1:<端口>）→ 它生成的令牌。挂在 globalThis 上：test/helpers.ts 的 uiToken 也读这一份 */
const tokens: Map<string, string> = ((globalThis as { __ambTestUiTokens?: Map<string, string> }).__ambTestUiTokens ??= new Map());

vi.mock("../src/web/server.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/web/server.js")>();
  return {
    ...real,
    startWebServer: async (...args: Parameters<typeof real.startWebServer>) => {
      const configured = !!args[0].config.ui.token;
      const web = await real.startWebServer(...args);
      if (configured) return web;
      const origins = [`http://127.0.0.1:${web.port}`, `http://localhost:${web.port}`];
      for (const o of origins) tokens.set(o, web.token);
      const close = web.close.bind(web);
      web.close = async () => {
        for (const o of origins) tokens.delete(o);
        await close();
      };
      return web;
    },
  };
});

const rawFetch: typeof fetch = globalThis.fetch.bind(globalThis);

globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  let token: string | undefined;
  try {
    token = tokens.get(new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url).origin);
  } catch {
    /* 不是能解析的地址：原样交给 fetch 去报错 */
  }
  if (!token) return rawFetch(input, init);
  const headers = new Headers(init?.headers ?? (typeof input === "object" && "headers" in input ? input.headers : undefined));
  if (!headers.has("x-amb-token")) headers.set("x-amb-token", token);
  return rawFetch(input, { ...init, headers });
}) as typeof fetch;
