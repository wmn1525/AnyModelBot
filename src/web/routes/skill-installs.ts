/**
 * 技能安装卡片（skills/installs.ts）：对话里的卡片读状态、展开 SKILL.md、点「安装 / 替换 / 取消 / 重试」。
 * 对话历史里的卡片随 GET /bots/:id/chat、GET /groups/:id 的 installs 返回。
 */
import { SkillError } from "../../skills/archive.js";
import { send, type Route, type WebContext } from "../http.js";

export function skillInstallsRoutes(ctx: WebContext): Route {
  const { app } = ctx;
  return async (_req, res, _url, seg, _p, m) => {
    if (seg[0] !== "skill-installs" || seg.length < 2) return false;
    const installs = app.skillInstalls;
    const id = decodeURIComponent(seg[1]);
    try {
      const card = installs.get(id);
      if (!card) throw new SkillError("not_found", 404);
      if (seg.length === 2 && m === "GET") return send(res, 200, { install: installs.view(card) });
      if (seg.length === 3 && seg[2] === "instructions" && m === "GET") {
        const text = installs.instructions(id);
        if (text === undefined) throw new SkillError("not_found", 404);
        return send(res, 200, { instructions: text });
      }
      if (seg.length === 3 && m === "POST" && ["install", "cancel", "retry"].includes(seg[2])) {
        const next = seg[2] === "install" ? installs.install(id, "web") : seg[2] === "cancel" ? installs.cancel(id, "web") : installs.retry(id);
        return send(res, 200, { install: installs.view(next) });
      }
      return send(res, 404, { error: "not_found", code: "not_found" });
    } catch (e) {
      if (!(e instanceof SkillError)) throw e;
      return send(res, e.status, { error: e.code, code: e.code });
    }
  };
}
