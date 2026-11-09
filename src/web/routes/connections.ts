/** 授权账号（Notion、飞书数据）：添加、授权回调地址、删除。 */
import { ConnectionError, connectionUserMessage } from "../../tools/accounts/index.js";
import { t } from "../../i18n/index.js";
import { HttpError, readJson, NOTION_CALLBACK, send, type Route, type WebContext } from "../http.js";
import { logger } from "../../log.js";

const log = logger("web");

export function connectionsRoutes(ctx: WebContext): Route {
  const { app } = ctx;
  return async (req, res, url, seg, p, m) => {
    // 已授权账号（设置 › 连接）：全局一份，所有机器人共用。令牌不出现在任何回复里
    if (seg[0] === "connections") {
      const c = app.connections;
      const guard = async <T>(run: () => Promise<T>): Promise<T> => {
        try {
          return await run();
        } catch (e) {
          if (!(e instanceof ConnectionError)) log.warn("connection authorization failed", { message: e instanceof Error ? e.message : String(e) });
          throw new HttpError(e instanceof ConnectionError ? 400 : 500, connectionUserMessage(e));
        }
      };
      if (seg.length === 1 && m === "GET") return send(res, 200, { accounts: c.accounts.view() });
      if (p === "/connections/notion/token" && m === "POST") {
        const b = await readJson(req);
        const token = String(b.token ?? "").trim();
        if (!token) throw new HttpError(400, t("web.notionTokenRejected"));
        const who = await c.notion.verifyToken(token);
        if (who.rejected) throw new HttpError(400, t("web.notionTokenRejected"));
        c.accounts.upsert({ service: "notion", label: who.label, identity: who.identity, auth: { kind: "notion-token", token } });
        return send(res, 200, { accounts: c.accounts.view() });
      }
      if (p === "/connections/notion/oauth" && m === "POST") {
        const url = await guard(() => c.notion.startAuthorization(`http://127.0.0.1:${ctx.boundPort}${NOTION_CALLBACK}`));
        return send(res, 200, { url });
      }
      if (p === "/connections/feishu" && m === "POST") {
        const b = await readJson(req);
        const appId = String(b.appId ?? "").trim();
        const appSecret = String(b.appSecret ?? "").trim();
        if (Boolean(appId) !== Boolean(appSecret)) throw new HttpError(400, t("web.feishuAppIncomplete"));
        return send(res, 200, { flow: c.feishu.startFlow(appId ? { appId, appSecret } : undefined) });
      }
      if (seg[1] === "flows" && seg[2]) {
        if (m === "DELETE") {
          c.feishu.cancelFlow(seg[2]);
          return send(res, 200, { ok: true });
        }
        const flow = c.feishu.flow(seg[2]);
        if (!flow) throw new HttpError(404, "not found");
        return send(res, 200, { flow, accounts: c.accounts.view() });
      }
      if (seg.length === 2 && m === "PUT") {
        const b = await readJson(req);
        const renamed = c.accounts.rename(seg[1], String(b.label ?? ""));
        if (renamed !== "ok") throw new HttpError(400, t(renamed === "taken" ? "web.accountNameTaken" : "web.badAccountName"));
        return send(res, 200, { accounts: c.accounts.view() });
      }
      if (seg.length === 2 && m === "DELETE") {
        c.accounts.remove(seg[1]);
        return send(res, 200, { accounts: c.accounts.view() });
      }
      throw new HttpError(405, "method not allowed");
    }
    return false;
  };
}
