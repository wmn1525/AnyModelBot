/** 关于我（设置 › 关于我、对话里的提示行、确认卡和建议卡）。不需要登录，也不看模型来源。 */
import { AboutMeError, type AboutChange, type AboutLine, type AboutProposal } from "../../agent/about-me.js";
import { t } from "../../i18n/index.js";
import { HttpError, readJson, send, type Route, type WebContext } from "../http.js";

const ERR = { empty: "aboutMe.empty", tooLong: "aboutMe.tooLong", secret: "aboutMe.secret", idOrCard: "aboutMe.idOrCard", missing: "aboutMe.missing", stale: "aboutMe.stale", notUndoable: "aboutMe.notUndoable" } as const;

/** 给界面的一句：机器人记下的标是哪个机器人（被删了的照旧显示当时的名字） */
export function publicLine(l: AboutLine) {
  return { id: l.id, text: l.text, source: l.source, locked: l.locked, botId: l.botId ?? "", botName: l.botName ?? "", createdAt: l.createdAt, updatedAt: l.updatedAt, sensitive: l.sensitive ?? "" };
}
export function publicChange(h: AboutChange & { undoable?: boolean }) {
  return { id: h.id, at: h.at, op: h.op, text: (h.op === "delete" ? h.before?.text : h.after?.text) ?? "", old: h.op === "edit" ? (h.before?.text ?? "") : "", by: h.by, botId: h.botId ?? "", botName: h.botName ?? "", conversationId: h.conversationId ?? "", undone: !!h.undoneAt, undoOf: h.undoOf ?? "", undoable: !!h.undoable };
}
export function publicProposal(p: AboutProposal) {
  return { id: p.id, kind: p.kind, text: p.text, old: p.old ?? "", category: p.category ?? "", botId: p.botId, botName: p.botName, status: p.status, at: p.at, changeId: p.changeId ?? "" };
}

export function aboutMeRoutes(ctx: WebContext): Route {
  const { app } = ctx;
  const me = () => app.agent.aboutMe;
  const guard = <T>(fn: () => T): T => {
    try {
      return fn();
    } catch (e) {
      if (e instanceof AboutMeError) throw new HttpError(e.code === "missing" ? 404 : 400, t(ERR[e.code]));
      throw e;
    }
  };
  const view = () => ({
    enabled: me().enabled,
    notice: me().notice,
    full: me().full,
    lines: me().lines().map(publicLine),
    history: me().history().map(publicChange),
  });
  return async (req, res, url, seg, p, m) => {
    if (seg[0] !== "about-me") return false;
    const rest = seg.slice(1);
    if (!rest.length && m === "GET") return send(res, 200, view());
    if (rest[0] === "settings" && m === "PUT") {
      const b = await readJson(req);
      if (typeof b.enabled === "boolean") me().setEnabled(b.enabled);
      if (b.notice === false) me().dismissNotice();
      return send(res, 200, view());
    }
    if (rest[0] === "lines" && rest.length === 1 && m === "POST") {
      const b = await readJson(req);
      guard(() => me().userAdd(String(b.text ?? "")));
      return send(res, 200, view());
    }
    if (rest[0] === "lines" && rest[1] && m === "PUT") {
      const b = await readJson(req);
      guard(() => me().userEdit(rest[1], String(b.text ?? "")));
      return send(res, 200, view());
    }
    if (rest[0] === "lines" && rest[1] && m === "DELETE") {
      guard(() => me().userDelete(rest[1]));
      return send(res, 200, view());
    }
    if (rest[0] === "history" && rest[1] && rest[2] === "undo" && m === "POST") {
      const change = guard(() => me().undo(rest[1]));
      return send(res, 200, { ...view(), change: publicChange(change) });
    }
    // 对话里的卡片：记下 / 只这次用、改成这样 / 保持不变
    if (rest[0] === "proposals" && rest[1] && m === "POST") {
      const b = await readJson(req);
      const p2 = guard(() => me().decide(rest[1], b.accept === true));
      const change = p2.changeId ? me().history().find((h) => h.id === p2.changeId) : undefined;
      return send(res, 200, { proposal: publicProposal(p2), ...(change ? { change: publicChange(change) } : {}) });
    }
    // 对话里撤销一行（提示行上的「撤销」）
    if (rest[0] === "undo" && m === "POST") {
      const b = await readJson(req);
      const change = guard(() => me().undo(String(b.id ?? ""), "you"));
      return send(res, 200, { change: publicChange(change) });
    }
    // 一个对话里的提示行和卡片（since：从什么时候起）
    if (rest[0] === "chat" && m === "GET") {
      const conv = url.searchParams.get("conversation") ?? "";
      if (!conv) throw new HttpError(400, "conversation is required");
      const r = me().forConversation(conv, Number(url.searchParams.get("since")) || 0);
      return send(res, 200, { changes: r.changes.map(publicChange), proposals: r.proposals.map(publicProposal) });
    }
    return false;
  };
}
