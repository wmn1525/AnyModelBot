/**
 * 需求与反馈（界面：components/feedback.js；构造、草稿和提交：src/feedback/）。全部只给本机界面用：
 * - GET    /feedback/v2/capabilities          网关 / 登录状态、工单服务能力、当前身份已有的账号邮箱、环境
 * - GET    /feedback/v2/draft                 当前账户的草稿；另一个账户留下的草稿只告诉"有"（要不要带过来由本人决定）
 * - PUT    /feedback/v2/draft                 保存草稿（联系许可、诊断、报错不落盘）
 * - DELETE /feedback/v2/draft?tab=…           清除（不带 tab 清全部）
 * - POST   /feedback/v2/draft/move            { decision: "move" | "dismiss" }
 * - POST   /feedback/v2/preview               构造并冻结要发的内容，返回快照 ID；字段有问题回 422 { errors }
 * - POST   /feedback/v2/preview/discard       { snapshotId }：返回修改、切换分类时作废快照
 * - POST   /feedback/v2/submit                { snapshotId }：只发冻结的快照
 * - GET    /feedback/v2/submissions/:id       结果未知时按提交 ID 查询
 * - POST   /feedback/v2/external              邮件 / GitHub 用的外部副本（单独构造，不含联系方式）
 *
 * 除了全局的 Host / 令牌 / JSON 预检，这里还要求请求来自本机界面本身（Sec-Fetch-Site 是 same-origin），
 * 目录 Bot 的沙箱界面、别的本机网页都读不到草稿和账号邮箱，也不能借这里提交。
 */
import { FEEDBACK_TABS, type FeedbackTab } from "../../feedback/model.js";
import { FeedbackPreviewError, FeedbackService, previewInput } from "../../feedback/service.js";
import { sanitizeDraftTabs } from "../../feedback/drafts.js";
import { t } from "../../i18n/index.js";
import { HttpError, readJson, send, type Route, type WebContext } from "../http.js";

const isTab = (v: unknown): v is FeedbackTab => FEEDBACK_TABS.includes(v as FeedbackTab);

export function feedbackRoutes(ctx: WebContext): Route {
  const service = new FeedbackService(ctx.app);
  return async (req, res, url, seg, _p, m) => {
    if (seg[0] !== "feedback") return false;
    if (seg[1] !== "v2") throw new HttpError(404, "not found");
    const site = String(req.headers["sec-fetch-site"] ?? "");
    if (site && site !== "same-origin" && site !== "none") throw new HttpError(403, t("feedback.forbidden"));
    const sub = seg.slice(2).join("/");

    if (sub === "capabilities" && m === "GET") return send(res, 200, await service.capabilities(url.searchParams.get("refresh") === "1"));

    if (sub === "draft") {
      if (m === "GET") return send(res, 200, service.draft());
      if (m === "PUT") {
        const b = await readJson(req);
        const only = Array.isArray(b?.only) ? (b.only as unknown[]).filter(isTab) : undefined;
        return send(res, 200, service.saveDraft(sanitizeDraftTabs(b?.tabs), only));
      }
      if (m === "DELETE") {
        const tab = url.searchParams.get("tab");
        if (tab && !isTab(tab)) throw new HttpError(400, t("feedback.invalid_tab"));
        service.clearDraft(tab ? (tab as FeedbackTab) : undefined);
        return send(res, 200, { ok: true });
      }
    }
    if (sub === "draft/move" && m === "POST") {
      const b = await readJson(req);
      if (b?.decision !== "move" && b?.decision !== "dismiss") throw new HttpError(400, t("feedback.invalid_tab"));
      return send(res, 200, { draft: service.movePending(b.decision) });
    }

    if (sub === "preview" && m === "POST") {
      const input = previewInput(await readJson(req));
      if (!input) throw new HttpError(400, t("feedback.invalid_tab"));
      try {
        return send(res, 200, await service.preview(input));
      } catch (e) {
        if (e instanceof FeedbackPreviewError) return send(res, 422, { errors: e.errors });
        throw e;
      }
    }
    if (sub === "preview/discard" && m === "POST") {
      const b = await readJson(req);
      if (typeof b?.snapshotId === "string") service.discard(b.snapshotId);
      return send(res, 200, { ok: true });
    }
    if (sub === "submit" && m === "POST") {
      const b = await readJson(req);
      if (typeof b?.snapshotId !== "string") throw new HttpError(400, t("feedback.invalid_tab"));
      return send(res, 200, await service.submit(b.snapshotId));
    }
    if (seg[2] === "submissions" && seg.length === 4 && m === "GET") {
      const id = decodeURIComponent(seg[3]);
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, t("feedback.invalid_tab"));
      return send(res, 200, await service.lookup(id.toLowerCase()));
    }
    if (sub === "external" && m === "POST") {
      const input = previewInput(await readJson(req));
      if (!input) throw new HttpError(400, t("feedback.invalid_tab"));
      try {
        return send(res, 200, await service.external(input));
      } catch (e) {
        if (e instanceof FeedbackPreviewError) return send(res, 422, { errors: e.errors });
        throw e;
      }
    }
    return false;
  };
}
