/**
 * 连接应用（tools/apps/service.ts）：应用页的清单、连接内置应用、自定义连接器、授权登录的流程、管理（别名、主账号、谁能用、
 * 工具类别、断开）。凭证不出现在任何回复里：密钥只给名字，值是掩码。
 * 现有的 Notion 令牌 / 一键授权、飞书扫码还在 routes/connections.ts（应用页的 Notion、飞书卡片用它们）。
 */
import type http from "node:http";
import { BUILTIN_APPS, CUSTOM_APP } from "../../tools/apps/catalog.js";
import { AppUserError, type ConnectorDraft } from "../../tools/apps/service.js";
import { TOOL_CATEGORIES, type ToolCategory } from "../../tools/apps/types.js";
import { t } from "../../i18n/index.js";
import { logger, redactText } from "../../log.js";
import { HttpError, isLoopback, readJson, send, type Route, type WebContext } from "../http.js";

const log = logger("web");

/** 授权登录的回调地址（动态注册时登记的就是它，所以固定） */
export const APPS_CALLBACK = "/oauth/apps/callback";

/**
 * 授权页跳回哪里。本机访问：固定的回环地址（浏览器和应用在同一台电脑上）。
 * 从别的机器访问网页（Docker、远程）：用访问时的地址；服务商不接受这样的回调地址时，界面上可以把回跳后的地址粘贴进来。
 */
export function appsRedirectUri(req: http.IncomingMessage, boundPort: number): string {
  const host = String(req.headers.host ?? "");
  const name = host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  if (!host || isLoopback(name)) return `http://127.0.0.1:${boundPort}${APPS_CALLBACK}`;
  const proto = String(req.headers["x-forwarded-proto"] ?? "").split(",")[0].trim() === "https" ? "https" : "http";
  return `${proto}://${host}${APPS_CALLBACK}`;
}

export function appsRoutes(ctx: WebContext): Route {
  const { app } = ctx;
  return async (req, res, _url, seg, _p, m) => {
    if (seg[0] !== "apps") return false;
    const apps = app.apps;
    const guard = async <T>(run: () => Promise<T> | T): Promise<T> => {
      try {
        return await run();
      } catch (e) {
        if (e instanceof AppUserError) throw new HttpError(400, e.message);
        if (e instanceof HttpError) throw e;
        log.warn("app connection failed", { message: redactText(e instanceof Error ? e.message : String(e)).slice(0, 300) });
        throw new HttpError(500, t("apps.unreachable"));
      }
    };
    const catalog = () => BUILTIN_APPS.map((b) => ({ id: b.id, name: b.name, region: b.region, keywords: b.keywords, docs: b.docs, ...(b.termsUrl ? { termsUrl: b.termsUrl } : {}), methods: b.methods.map((x) => ({ kind: x.kind, ...("getUrl" in x ? { getUrl: x.getUrl } : {}), ...("variants" in x && x.variants ? { variants: x.variants.map((v) => ({ id: v.id, label: v.label })) } : {}) })) }));
    const all = () => ({ catalog: catalog(), ...apps.view() });
    const decode = (s: string) => decodeURIComponent(s ?? "");

    if (seg.length === 1 && m === "GET") {
      apps.refreshStale();
      return send(res, 200, all());
    }
    // 侧栏的提醒点：只要一个布尔值，不必拉整份清单
    if (seg[1] === "attention" && m === "GET") return send(res, 200, { attention: apps.attention() });

    // 连接内置应用的一个账号（accountId：重新授权、修改密钥、更新链接）
    if (seg[1] === "builtin" && seg[2] && seg[3] === "connect" && m === "POST") {
      const b = await readJson(req);
      const r = await guard(() =>
        apps.connectBuiltin(decode(seg[2]), {
          method: typeof b.method === "string" ? b.method : undefined,
          variant: typeof b.variant === "string" ? b.variant : undefined,
          token: typeof b.token === "string" ? b.token : undefined,
          key: typeof b.key === "string" ? b.key : undefined,
          url: typeof b.url === "string" ? b.url : undefined,
          accountId: typeof b.accountId === "string" && b.accountId ? b.accountId : undefined,
          redirectUri: appsRedirectUri(req, ctx.boundPort),
        }),
      );
      return send(res, 200, { ...r, ...all() });
    }

    // 授权登录的流程：界面轮询；关掉弹窗就取消；授权页没跳回本机时把回跳地址粘贴进来
    if (seg[1] === "flows" && seg[2]) {
      const id = decode(seg[2]);
      if (m === "DELETE") {
        apps.cancelFlow(id);
        return send(res, 200, { ok: true });
      }
      if (seg[3] === "paste" && m === "POST") {
        const b = await readJson(req);
        await guard(() => apps.finishFromUrl(id, String(b.url ?? "")));
        return send(res, 200, { flow: apps.flow(id), ...all() });
      }
      const flow = apps.flow(id);
      if (!flow) throw new HttpError(404, "not found");
      return send(res, 200, flow.state === "done" ? { flow, ...all() } : { flow });
    }

    // 自定义连接器：添加、修改（保存后马上测试）、去授权、开关
    if (seg[1] === "custom") {
      if (seg.length === 2 && m === "POST") {
        const b = await readJson(req);
        const r = await guard(() => apps.saveCustom((b.draft ?? {}) as ConnectorDraft, { redirectUri: appsRedirectUri(req, ctx.boundPort) }));
        return send(res, 200, { ...r, ...all() });
      }
      const id = decode(seg[2] ?? "");
      if (seg.length === 3 && m === "PUT") {
        const b = await readJson(req);
        const r = await guard(() => apps.saveCustom((b.draft ?? {}) as ConnectorDraft, { id, redirectUri: appsRedirectUri(req, ctx.boundPort) }));
        return send(res, 200, { ...r, ...all() });
      }
      if (seg[3] === "authorize" && m === "POST") {
        const flow = await guard(() => apps.authorizeCustom(id, appsRedirectUri(req, ctx.boundPort)));
        return send(res, 200, { flow });
      }
      if (seg[3] === "enabled" && m === "POST") {
        const b = await readJson(req);
        const view = await guard(() => apps.setEnabled(id, b.on === true));
        return send(res, 200, { app: view, ...all() });
      }
      throw new HttpError(405, "method not allowed");
    }

    // 一条连接（内置应用的一个账号，或一个自定义连接器）：重测、改别名、断开
    if (seg[1] === "connections" && seg[2]) {
      const id = decode(seg[2]);
      if (seg[3] === "test" && m === "POST") {
        await guard(() => apps.test(id));
        return send(res, 200, all());
      }
      if (seg.length === 3 && m === "PUT") {
        const b = await readJson(req);
        const renamed = apps.rename(id, String(b.label ?? ""));
        if (renamed !== "ok") throw new HttpError(400, t(renamed === "taken" ? "web.accountNameTaken" : "web.badAccountName"));
        return send(res, 200, all());
      }
      if (seg.length === 3 && m === "DELETE") {
        apps.remove(id);
        return send(res, 200, all());
      }
      throw new HttpError(405, "method not allowed");
    }

    // 一个应用：主账号、谁能用、工具的类别
    if (seg[1] === "app" && seg[2]) {
      const key = decode(seg[2]);
      if (seg[3] === "primary" && m === "POST") {
        const b = await readJson(req);
        if (key === CUSTOM_APP || !apps.setPrimary(key, String(b.accountId ?? ""))) throw new HttpError(404, t("apps.notFound"));
        return send(res, 200, all());
      }
      if (seg[3] === "access" && m === "PUT") {
        const b = await readJson(req);
        const known = new Set(app.store.listBots().map((x) => x.id));
        const bots = b.bots === "all" ? "all" : Array.isArray(b.bots) ? b.bots.map(String).filter((id: string) => known.has(id)) : undefined;
        if (bots === undefined || !apps.setAccess(key, bots)) throw new HttpError(400, t("apps.notFound"));
        return send(res, 200, all());
      }
      if (seg[3] === "tools" && seg[4] && m === "PUT") {
        const b = await readJson(req);
        const category = b.category === null ? null : (TOOL_CATEGORIES as readonly unknown[]).includes(b.category) ? (b.category as ToolCategory) : undefined;
        if (category === undefined || !apps.setCategory(key, decode(seg[4]), category)) throw new HttpError(400, t("apps.notFound"));
        return send(res, 200, all());
      }
      throw new HttpError(405, "method not allowed");
    }
    throw new HttpError(404, "not found");
  };
}
