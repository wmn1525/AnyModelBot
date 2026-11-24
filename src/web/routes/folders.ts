/**
 * 工作文件夹的接口（网页对话 <botId>:web:console，PRD R1–R3）：
 *
 *   GET  /bots/:id/folder          当前选择（只核对目录本身能不能用）、最近文件夹、这一端能不能选
 *   POST /bots/:id/folder/pick     桌面版：弹系统目录选择器；取消原选择不变
 *   POST /bots/:id/folder/select   选一个最近文件夹 { id }；不在了、换了别的目录提示重选，原选择不变
 *   POST /bots/:id/folder/clear    不使用文件夹（之后的消息回到默认工作区；不删文件、不停已发出的任务）
 *
 * 只有桌面版有系统目录选择器（同进程的外壳，见 electron/main.ts 的 pickFolder）；命令行 / Docker 打开的网页只能看到
 * 已有的选择，不能新选或更换，也不能凭路径字符串生成目录引用。目录 Bot、代理模式关着时不提供。
 */
import { FolderError, publicFolder } from "../../folders/service.js";
import { t } from "../../i18n/index.js";
import { HttpError, consoleConvId, readJson, send, type Route, type WebContext } from "../http.js";

export function foldersRoutes(ctx: WebContext): Route {
  const { app } = ctx;

  /** 这一端能不能选：web 不是桌面版 · agentOff 代理模式关着（没有文件工具）· catalog 目录 Bot（文件范围由它声明的权限决定） */
  const reasonOf = (botId: string): "web" | "agentOff" | "catalog" | undefined => {
    if (app.store.getBot(botId)?.app) return "catalog";
    if (!app.agent.available) return "agentOff";
    if (!app.folders.canPick) return "web";
    return undefined;
  };

  const view = (botId: string) => {
    const conv = consoleConvId(botId);
    const cur = app.folders.current(conv);
    const reason = reasonOf(botId);
    return {
      picker: !reason,
      ...(reason ? { reason } : {}),
      // 已有的选择照常显示（网页端也是），可不可用只看目录本身
      current: cur ? publicFolder(cur, !app.folders.verify(cur)) : null,
      recent: reason ? [] : app.folders.recent().map((f) => publicFolder(f)),
    };
  };

  const fail = (res: Parameters<Route>[1], e: FolderError) => send(res, e.status, { error: t(`folders.err_${e.code}` as never), code: e.code });

  return async (req, res, _url, seg, _p, m) => {
    if (seg[0] !== "bots" || seg[2] !== "folder" || seg.length > 4) return false;
    const botId = decodeURIComponent(seg[1]);
    if (!app.store.getBot(botId)) throw new HttpError(404, t("web.botNotFound"));
    const conv = consoleConvId(botId);
    try {
      if (seg.length === 3 && m === "GET") return send(res, 200, view(botId));
      if (seg.length !== 4 || m !== "POST") return false;
      const reason = reasonOf(botId);
      if (seg[3] === "clear") {
        app.folders.clear(conv);
        return send(res, 200, view(botId));
      }
      if (reason) throw new FolderError(reason === "web" ? "desktopOnly" : "notAllowed", 400);
      app.store.ensureConversation(botId, "web", "console", "控制台");
      if (seg[3] === "pick") {
        const ref = await app.folders.pick(botId, conv);
        return send(res, 200, { status: ref ? "picked" : "canceled", ...view(botId) });
      }
      if (seg[3] === "select") {
        const b = await readJson(req);
        app.folders.select(botId, conv, String(b.id ?? ""));
        return send(res, 200, view(botId));
      }
      return false;
    } catch (e) {
      if (e instanceof FolderError) return fail(res, e);
      throw e;
    }
  };
}
