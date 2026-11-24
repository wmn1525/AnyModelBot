// 需求与反馈：全局一个弹窗（components/feedback.js 的 FeedbackHost，挂在 main.js）。
// 入口决定打开哪个分类：账号菜单、关于页 → 使用场景与建议；报错卡、故障排查 → 遇到问题；发现页的企业分区 → 企业与合作。
// 已经开着时再从别的入口打开，复用同一个弹窗实例（不叠窗）。
// 提交放在这里而不是组件里：本人可以在发送中收起窗口，结果回来时仍按原分类处理，重新打开能看到结果。
import { createStore, toast } from "./store.js";
import { api } from "./api.js";
import { t } from "./i18n.js";

export { FEEDBACK_SCENARIOS, FEEDBACK_TABS, SUPPORT_EMAIL, charCount } from "./feedback-links.js";

const TAB_OF = { account_menu: "use_case", about: "use_case", error_card: "bug", troubleshooting: "bug", discover_business: "enterprise", discover_scenario: "enterprise" };

/**
 * 当前打开的入口；null = 没开。
 * { source, tab, scenarioId?, errorContext?: { text（已脱敏的报错）, requestId?, model? }, at }
 * model 只在确实属于这条报错时给（不能拿默认模型代替）。
 */
export const feedbackDialog = createStore(null);

/**
 * 正在进行或刚结束的提交（窗口收起后也留着，重新打开时先展示结果）：
 * { tab, snapshotId, clientSubmissionId, phase: "sending" | "done", result?, seen }
 */
export const feedbackSubmission = createStore(null);

export function openFeedback(opts = {}) {
  const source = TAB_OF[opts.source] ? opts.source : "account_menu";
  const entry = { source, tab: TAB_OF[source], at: Date.now() };
  if (source === "discover_scenario" && opts.scenarioId) entry.scenarioId = opts.scenarioId;
  if (source === "error_card" && opts.errorText) entry.errorContext = { text: String(opts.errorText), ...(opts.relatedRequestId ? { requestId: String(opts.relatedRequestId) } : {}), ...(opts.model ? { model: String(opts.model) } : {}) };
  feedbackDialog.set(entry);
}
export const closeFeedback = () => feedbackDialog.set(null);

/** 发送冻结的快照（同一个快照再点也只有一个请求在路上；结果未知时本人可以用同一个快照重试） */
export async function submitFeedback({ tab, snapshotId, clientSubmissionId }) {
  const cur = feedbackSubmission.get();
  if (cur?.phase === "sending") return cur.promise;
  const promise = api("/feedback/v2/submit", { method: "POST", body: { snapshotId } }).catch(() => ({ status: "unknown", clientSubmissionId }));
  feedbackSubmission.set({ tab, snapshotId, clientSubmissionId, phase: "sending", promise, seen: true });
  const result = await promise;
  const hidden = !feedbackDialog.get();
  feedbackSubmission.set({ tab, snapshotId, clientSubmissionId, phase: "done", result, seen: !hidden });
  if (hidden) toast(resultToast(result), result.status === "created" ? "ok" : "err");
  return result;
}

/** 结果未知时按同一个提交 ID 查询 */
export async function lookupFeedback({ tab, snapshotId, clientSubmissionId }) {
  const result = await api(`/feedback/v2/submissions/${encodeURIComponent(clientSubmissionId)}`).catch(() => ({ status: "unknown", clientSubmissionId }));
  feedbackSubmission.set({ tab, snapshotId, clientSubmissionId, phase: "done", result, seen: !!feedbackDialog.get() });
  return result;
}

export const clearFeedbackSubmission = () => feedbackSubmission.set(null);

function resultToast(result) {
  switch (result.status) {
    case "created":
      return t("feedback.success.subtitle");
    case "rate_limited":
      return t("feedback.state.rateLimited");
    case "unknown":
    case "processing":
    case "not_found":
      return t("feedback.state.unknown");
    default:
      return t("feedback.state.failed");
  }
}
