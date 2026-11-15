/**
 * 「我的技能」和「存成技能」草稿卡的接口：
 * - /my-skills：全部「我的技能」；/my-skills/<名字>：详情（含技能说明、上一版、用它的规则有几条）、导出 ZIP、恢复上一版、删除。
 *   在某个机器人上打开或关上走 /bots/<id>/skills/<名字>（web/skills.ts），和其他技能同一个开关。
 * - /skill-drafts/<id>：对话里的草稿卡——读状态、技能说明全文、保存 / 更新 / 另存为新技能 / 取消 / 重试、
 *   改纠正的勾选、个人信息的保留或运行时再问、编辑原文。对话历史里的卡片随 GET /bots/:id/chat、GET /groups/:id 的 installs 返回。
 */
import { SkillError } from "../../skills/archive.js";
import { mySkillInfo } from "../skills.js";
import { readJson, send, type Route, type WebContext } from "../http.js";

export function mySkillsRoutes(ctx: WebContext): Route {
  const { app } = ctx;
  return async (req, res, _url, seg, _p, m) => {
    if (seg[0] !== "my-skills" && seg[0] !== "skill-drafts") return false;
    try {
      if (seg[0] === "my-skills") {
        const mine = app.userSkills.mine;
        if (seg.length === 1 && m === "GET") return send(res, 200, { skills: mine.list().map((s) => ({ ...s, ...mySkillInfo(s) })) });
        const name = decodeURIComponent(seg[1] ?? "");
        const skill = mine.get(name);
        if (!skill) throw new SkillError("not_found", 404);
        if (seg.length === 2 && m === "GET") {
          return send(res, 200, { skill: { ...skill, ...mySkillInfo(skill), instructions: mine.text(name), rules: app.tasks.rulesUsingSkill(name), botNames: Object.fromEntries(skill.bots.map((b) => [b, app.store.getBot(b)?.name ?? b])) } });
        }
        if (seg.length === 3 && seg[2] === "export" && m === "GET") {
          const zip = mine.exportZip(name);
          res.writeHead(200, {
            "content-type": "application/zip",
            "cache-control": "no-store",
            "content-disposition": `attachment; filename="${name}.zip"`,
            "content-length": String(zip.length),
          });
          return void res.end(zip);
        }
        if (seg.length === 3 && seg[2] === "restore" && m === "POST") {
          const next = mine.restore(name);
          return send(res, 200, { skill: { ...next, ...mySkillInfo(next) } });
        }
        if (seg.length === 2 && m === "DELETE") {
          mine.remove(name);
          return send(res, 200, { ok: true });
        }
        return send(res, 404, { error: "not_found", code: "not_found" });
      }
      const drafts = app.skillDrafts;
      const id = decodeURIComponent(seg[1] ?? "");
      const card = drafts.get(id);
      if (!card) throw new SkillError("not_found", 404);
      if (seg.length === 2 && m === "GET") return send(res, 200, { draft: drafts.view(card) });
      if (seg.length === 3 && seg[2] === "instructions" && m === "GET") {
        const text = drafts.instructions(id);
        if (text === undefined) throw new SkillError("not_found", 404);
        return send(res, 200, { instructions: text });
      }
      if (seg.length === 3 && m === "POST") {
        const op = seg[2];
        const body = ["edit", "personal", "correction"].includes(op) ? await readJson(req) : {};
        const next =
          op === "save" || op === "update" || op === "copy" ? drafts.confirm(id, op, "web")
          : op === "cancel" ? drafts.cancel(id, "web")
          : op === "retry" ? drafts.retry(id, "web")
          : op === "edit" ? drafts.edit(id, String(body?.text ?? ""))
          : op === "personal" ? drafts.setPersonal(id, body?.id ? String(body.id) : undefined, !!body?.keep)
          : op === "correction" ? drafts.setCorrection(id, Number(body?.index), !!body?.on)
          : undefined;
        if (!next) return send(res, 404, { error: "not_found", code: "not_found" });
        return send(res, 200, { draft: drafts.view(next) });
      }
      return send(res, 404, { error: "not_found", code: "not_found" });
    } catch (e) {
      if (!(e instanceof SkillError)) throw e;
      return send(res, e.status, { error: e.code, code: e.code, ...e.detail });
    }
  };
}
