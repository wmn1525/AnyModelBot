/** 聊天渠道账号（微信、飞书、Telegram、Slack、Discord）：连接、登录、准入名单。 */
import crypto from "node:crypto";
import { isMessenger, isPushChannel } from "../../core/types.js";
import type { PlatformError } from "../../channels/messenger/transport.js";
import { ACCESS_CHANNELS, peerName, shortPeer, type AccessChannel } from "../../core/access.js";
import { t as tr } from "../../i18n/index.js";
import { HttpError, readJson, send, publicAccess, type Route, type WebContext } from "../http.js";

export function channelsRoutes(ctx: WebContext): Route {
  const { app } = ctx;
  return async (req, res, url, seg, p, m) => {
    // —— 需要你（3b）：所有机器人里在等人的事，和对它们的操作 ——
    // 全局渠道账号（设置 › 连接）：所有机器人共用，消息交给哪个机器人见 core/routes.ts。key 只是账号的命名空间
    if (seg[0] === "channel-accounts") {
      if (seg.length === 1 && m === "GET") return send(res, 200, { accounts: app.channelAccounts() });
      if (p === "/channel-accounts/new-key" && m === "POST") return send(res, 200, { key: `acct_${crypto.randomBytes(6).toString("hex")}` });
      const id = decodeURIComponent(seg[1] ?? "");
      if (!/^[\w-]{1,80}$/.test(id)) throw new HttpError(404, "not found");
      const sub = seg.slice(2).join("/");
      if (sub === "channels" && m === "GET") return send(res, 200, app.channelStatus(id));
      if (seg.length === 4 && seg[3] === "settings" && m === "PUT") {
        const b = await readJson(req);
        const r = await app.updateChannelAccount(id, seg[2], {
          ...(b.label !== undefined ? { label: String(b.label) } : {}),
          ...(b.defaultBot !== undefined ? { defaultBot: String(b.defaultBot) } : {}),
          ...(b.enabled !== undefined ? { enabled: !!b.enabled } : {}),
        });
        if (r === "taken") throw new HttpError(400, tr("web.accountNameTaken"));
        if (r === "invalid") throw new HttpError(400, tr("web.badAccountName"));
        if (r !== "ok") throw new HttpError(404, tr("web.recordNotFound"));
        return send(res, 200, { accounts: app.channelAccounts() });
      }
      if (sub === "access" && m === "GET") {
        const v = app.access.view(id);
        const owner = (ch: AccessChannel) => {
          const o = v.owners[ch];
          if (!o) return null;
          const e = (o.entryId ? app.store.getAccessById(o.entryId) : undefined) ?? { channel: ch, peerId: o.peerId, senderId: o.peerId, name: "" };
          return { peer: shortPeer(o.peerId), name: peerName(e), via: o.via };
        };
        return send(res, 200, {
          policy: v.policy,
          owners: Object.fromEntries(ACCESS_CHANNELS.map((ch) => [ch, owner(ch)])),
          requests: v.requests.map(publicAccess),
          entries: v.entries.filter((e) => e.status !== "owner").map(publicAccess),
        });
      }
      if (seg[2] === "access" && seg.length === 5 && m === "POST") {
        const entry = app.store.getAccessById(decodeURIComponent(seg[3]));
        if (!entry || entry.botId !== id) throw new HttpError(404, tr("web.recordNotFound"));
        if (seg[4] === "approve" || seg[4] === "deny") {
          const r = app.access.decide(entry.id, seg[4] === "approve", "web");
          if (!r) throw new HttpError(409, tr("web.requestAlreadyHandled"));
          return send(res, 200, { entry: publicAccess(r) });
        }
      }
      // 更换主人：清掉"第一个发消息"的主人，下一个发单聊消息的人成为主人（扫码登录的微信要重新扫码）
      if (seg[2] === "access" && seg[3] === "owner" && seg.length === 5 && m === "DELETE") {
        const ch = seg[4];
        if (!isPushChannel(ch)) throw new HttpError(404, tr("web.noSuchChannel"));
        if (app.access.owner(id, ch)?.via === "login") throw new HttpError(409, tr("web.weixinOwnerRescan"));
        app.access.resetOwner(id, ch);
        return send(res, 200, { ok: true });
      }
      if (seg[2] === "access" && seg.length === 4 && m === "DELETE") {
        const entry = app.store.getAccessById(decodeURIComponent(seg[3]));
        if (!entry || entry.botId !== id) throw new HttpError(404, tr("web.recordNotFound"));
        app.access.remove(entry.id);
        return send(res, 200, { ok: true });
      }
      if (sub === "feishu" && m === "PUT") {
        const b = await readJson(req);
        await app.connectFeishu(id, String(b.appId ?? "").trim(), String(b.appSecret ?? "").trim());
        return send(res, 200, app.channelStatus(id));
      }
      // 一键添加：扫码创建应用（流程状态在 /connections/flows/:id），连上后账号才出现
      if (sub === "feishu/one-click" && m === "POST") {
        const flow = app.connections.feishu.startAppFlow(async (created) => {
          await app.connectFeishu(id, created.appId, created.appSecret, created.brand);
          return app.store.getChannelAccount(id, "feishu")?.label ?? "";
        });
        return send(res, 200, { flow });
      }
      if (sub === "feishu" && m === "DELETE") {
        await app.removeChannelAccount(id, "feishu");
        return send(res, 200, app.channelStatus(id));
      }
      if (isMessenger(sub) && m === "PUT") {
        try {
          await app.connectMessenger(id, sub, await readJson(req));
        } catch (e) {
          if ((e as PlatformError).rejected) throw new HttpError(400, (e as Error).message);
          throw e;
        }
        return send(res, 200, app.channelStatus(id));
      }
      if (isMessenger(sub) && m === "DELETE") {
        await app.removeChannelAccount(id, sub);
        return send(res, 200, app.channelStatus(id));
      }
      if (sub === "weixin" && m === "PUT") {
        const b = await readJson(req);
        await app.updateChannelAccount(id, "weixin", { enabled: !!b.enabled });
        return send(res, 200, app.channelStatus(id));
      }
      if (sub === "weixin/login" && m === "POST") {
        const login = app.startWeixinLogin(id);
        // 等待二维码就绪（最多 10 秒）
        const t0 = Date.now();
        while (login.snapshot.state === "idle" || login.snapshot.state === "fetching") {
          if (Date.now() - t0 > 10_000) break;
          await new Promise((r) => setTimeout(r, 50));
        }
        return send(res, 200, login.snapshot);
      }
      if (sub === "weixin/login" && m === "GET") return send(res, 200, app.channels.get(id)?.weixinLogin?.snapshot ?? { state: "idle" });
      if (sub === "weixin/verify" && m === "POST") {
        const b = await readJson(req);
        // 回最新的登录状态：交上去之后界面马上显示"正在验证"（没在等验证码时不收，状态不变）
        const login = app.channels.get(id)?.weixinLogin;
        login?.submitVerifyCode(String(b.code ?? ""));
        return send(res, 200, login?.snapshot ?? { state: "idle" });
      }
      if (sub === "weixin/cancel" && m === "POST") {
        app.channels.get(id)?.weixinLogin?.cancel();
        return send(res, 200, { ok: true });
      }
      if (sub === "weixin/logout" && m === "POST") {
        await app.removeChannelAccount(id, "weixin");
        return send(res, 200, app.channelStatus(id));
      }
      throw new HttpError(405, "method not allowed");
    }
    return false;
  };
}
