/** 机器人协作（设置 › 机器人协作、两人对话、对话里的灰色小字）。未登录时只读锁定状态，改不了。 */
import path from "node:path";
import { HttpError, readJson, send, type Route, type WebContext } from "../http.js";
import { describeFile } from "../files.js";
import { t } from "../../i18n/index.js";

export function collabRoutes(ctx: WebContext): Route {
  const { app } = ctx;
  return async (req, res, url, seg, p, m) => {
    if (seg[0] !== "collab") return false;
    const c = app.collab;
    const rest = seg.slice(1);
    const page = () => {
      const signedIn = !!app.account?.signedIn;
      return {
        signedIn,
        settings: c.settings(),
        today: c.usedToday(),
        // 关掉时还在做的
        open: c.openCount(),
        // 未登录时列表不显示
        pairs: signedIn ? c.pairs() : [],
      };
    };
    if (!rest.length && m === "GET") return send(res, 200, page());
    if (rest[0] === "settings" && m === "PUT") {
      const b = await readJson(req);
      const r = c.setSettings({
        ...(typeof b.enabled === "boolean" ? { enabled: b.enabled } : {}),
        ...(b.budgetUsd !== undefined ? { budgetUsd: Number(b.budgetUsd) } : {}),
        ...(b.capMs !== undefined ? { capMs: Number(b.capMs) } : {}),
        ...(b.daily !== undefined ? { daily: Number(b.daily) } : {}),
        ...(b.redo !== undefined ? { redo: Number(b.redo) } : {}),
      });
      if (r.error === "signin") throw new HttpError(409, t("web.collabSignIn"));
      if (r.error) throw new HttpError(400, t("web.collabChoice"));
      return send(res, 200, page());
    }
    // 两人对话
    if (rest[0] === "pairs" && rest[1] && m === "GET") {
      const pair = c.pair(decodeURIComponent(rest[1]));
      if (!pair) throw new HttpError(404, "not found");
      // 附件在收到它的那个机器人的工作区里：A 带给 B 的在 B 那里，B 回的已复制进 A 的工作区；预览经那个机器人的对话读
      const ws = (botId: string) => path.join(app.config.dataDir, "workspaces", botId);
      const messages = pair.messages.map((m) => {
        if (!m.files.length) return m;
        const holder = m.from === pair.a ? pair.b : pair.a;
        return { ...m, fileConv: `${holder}:web:console`, files: m.files.map((f) => describeFile(path.join(ws(holder), f))) };
      });
      return send(res, 200, { ...pair, messages });
    }
    // 处理过程展开的细节（保存 30 天）
    if (rest[0] === "steps" && rest[1] && m === "GET") return send(res, 200, { steps: c.steps(decodeURIComponent(rest[1])) });
    // 一个对话里的灰色小字（A 这边发出的、B 主对话里的两行）和按钮
    if (rest[0] === "chat" && m === "GET") {
      const conv = url.searchParams.get("conversation") ?? "";
      if (!conv) throw new HttpError(400, "conversation is required");
      return send(res, 200, c.chatView(conv));
    }
    return false;
  };
}
