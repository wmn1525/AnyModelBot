// 「需求与反馈」弹窗（打开方式见 lib/feedback.js，表单见 components/feedback-forms.js，本机服务见 src/web/routes/feedback.ts）。
// 流程：入口定位三个分类之一 → 写一段描述、按需补充或留联 → 本机构造并冻结发送内容 → 本人发送 → 私有工单和后续回复。
// - 三个分类的草稿、字段、错误、展开状态和联系许可各自独立；切换分类不发送、不读日志、不调用模型。
// - 草稿只存本机受保护的位置（按账户隔离）；联系许可只在本次编辑里有效：关闭、恢复、登录完成、切账号都要重新确认。
// - 同意留联时必须先看"发送内容"再确认发送；不留联也走同样的构造和服务端校验。
// - 只有拿到有效工单号和官方工单地址才显示已提交；超时、断网、不是有效回执都按"结果未知"处理，先查询，再由本人决定用原请求重试。
// - 应用内建单要内置网关 + 登录 Modelflare；未登录先写草稿、登录并继续，外部网关提示改用邮件或 GitHub（企业只有商务外链）。
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { html, Button, Icon, Notice, Sheet, Spinner } from "./ui.js";
import { ErrorLine } from "./app-dialogs.js";
import { BugForm, ContactBlock, EnterpriseForm, Fold, OtherWays, UseCaseForm } from "./feedback-forms.js";
import { api } from "../lib/api.js";
import { accountLogin, startAccountLogin } from "../lib/account-login.js";
import { FEEDBACK_TABS, clearFeedbackSubmission, closeFeedback, feedbackDialog, feedbackSubmission, lookupFeedback, submitFeedback } from "../lib/feedback.js";
import { appendScenario, contactValueError, emailFeedbackUrl, githubFeedbackUrl, inputTotal, scenarioTemplate } from "../lib/feedback-links.js";
import { toast, useStore } from "../lib/store.js";
import { t } from "../lib/i18n.js";
import { usePresence } from "../design/motion.js";

const blankDraft = () => ({ description: "", guidance: [], context: {}, role: "", business: {}, scenarioId: "", contactKind: "email", contactValue: "" });
const blankUi = () => ({ contactOpen: false, consent: false, channel: "", contextOpen: false, backgroundOpen: false, diagOpen: false, includeError: true, includeLogs: false, errors: {} });
const allTabs = (make) => Object.fromEntries(FEEDBACK_TABS.map((tab) => [tab, make()]));
/** 撤回本次编辑里的联系许可（自填的值留着，但不生效） */
const revokeConsent = (u) => ({ ...u, consent: false, channel: "", contactOpen: false });

/** 存下来的草稿 → 编辑状态。restoreRole：本人主动继续原稿时才恢复角色，新入口一律不代选 */
function fromStored(d, restoreRole) {
  if (!d) return blankDraft();
  return { ...blankDraft(), ...d, guidance: d.guidance ?? [], context: d.context ?? {}, business: d.business ?? {}, role: restoreRole ? d.role ?? "" : "", scenarioId: d.scenarioId ?? "", contactKind: d.contactKind ?? "email", contactValue: d.contactValue ?? "" };
}
/** 编辑状态 → 存盘 / 构造用的草稿（空字段省略，不用空字符串冒充已填写） */
function toDraft(d) {
  const out = {};
  if (d.description) out.description = d.description;
  if (d.guidance?.length) out.guidance = d.guidance;
  const ctx = Object.fromEntries(Object.entries(d.context || {}).filter(([, v]) => v));
  if (Object.keys(ctx).length) out.context = ctx;
  if (d.role) out.role = d.role;
  const b = Object.fromEntries(Object.entries(d.business || {}).filter(([, v]) => v));
  if (Object.keys(b).length) out.business = b;
  if (d.scenarioId) out.scenarioId = d.scenarioId;
  if (d.contactValue) {
    out.contactKind = d.contactKind || "email";
    out.contactValue = d.contactValue;
  }
  return out;
}
const hasText = (d) => !!(d?.description?.trim() || Object.values(d?.context || {}).some((v) => String(v || "").trim()) || ["company_name", "job_role", "current_systems", "partnership_context"].some((k) => String(d?.business?.[k] || "").trim()));

/** 字段错误码 → 文案 */
function fieldMessage(code, params = {}) {
  switch (code) {
    case "too_short":
      return t("feedback.errors.tooShort", { min: params.min ?? 10 });
    case "too_long":
      return t("feedback.errors.tooLong", { max: params.max ?? 4000 });
    case "role_required":
      return t("feedback.enterprise.roleRequired");
    case "contact_channel_required":
      return t("feedback.errors.channelRequired");
    case "contact_value_required":
      return t("feedback.errors.valueRequired");
    case "contact_email_invalid":
      return t("feedback.errors.emailInvalid");
    case "contact_value_invalid":
      return t("feedback.errors.valueInvalid");
    case "contact_unsafe":
      return t("feedback.errors.unsafe");
    case "contact_email_unavailable":
      return t("feedback.contact.accountUnavailable");
    case "identity_changed":
      return t("feedback.errors.identityChanged");
    case "unavailable":
      return t("feedback.state.unavailable");
    default:
      return t("feedback.errors.reviewAgain");
  }
}
/** 本机服务的字段名 → 界面上挂错误的位置 */
const fieldSlot = (field) => (field === "role" ? "role" : field === "contact" || field?.startsWith("contact.") ? "contact" : field === "input_total" ? "input_total" : field === "description" ? "description" : "");

function Lead({ text }) {
  return text ? html`<p class="fb-lead">${text}</p>` : null;
}

function PreviewView({ tab, state, onRetry }) {
  if (state.loading) return html`<p class="hint fb-center"><${Spinner} /> ${t("feedback.preview.loading")}</p>`;
  if (state.error) return html`<${Notice} tone="red" action=${html`<${Button} size="sm" onClick=${onRetry}>${t("feedback.preview.retry")}<//>`}>${state.error}<//>`;
  const p = state.data;
  const items = p.notIncluded.filter((k) => k !== "contact");
  return html`<section class="fb-preview" aria-labelledby="fb-preview-title">
    <h3 class="fb-h" id="fb-preview-title">${t(`feedback.tabs.${tab}`)}</h3>
    <pre class="fb-body" tabindex="0" aria-label=${t("feedback.reviewLink")}>${p.body}</pre>
    ${p.notices?.errorTrimmed && html`<p class="hint">${t("feedback.bug.errorLong", { max: 1500 })}</p>`}
    ${p.notices?.diagnosticsTrimmed && html`<p class="hint">${t("feedback.bug.diagLong")}</p>`}
    <h3 class="fb-h">${t("feedback.preview.notIncluded")}</h3>
    ${items.length > 0 && html`<p class="fb-muted">${t("feedback.preview.list", { items: items.map((k) => t(`feedback.preview.item_${k}`)).join(t("feedback.preview.sep")) })}</p>`}
    ${p.notIncluded.includes("contact") && html`<p class="fb-muted">${t("feedback.preview.noContact")}</p>`}
    <p class="fb-muted">${t("feedback.preview.confirmHint")}</p>
  </section>`;
}

function SuccessView({ tab, receipt }) {
  return html`<div class="fb-done" role="status">
    <span class="fb-done-mark"><${Icon} name="check" size="lg" /></span>
    <h3>${t("feedback.success.title")}</h3>
    <p>${t(`feedback.success.${tab}`)}</p>
    <p class="fb-muted num">${t("feedback.success.ticket", { id: receipt.ticketId })}</p>
    <p class="hint">${t("feedback.success.followUp")}</p>
  </div>`;
}

function ResultView({ result }) {
  const processing = result.status === "processing";
  return html`<div class="fb-done" role="status">
    <span class="fb-done-mark"><${Icon} name="alert" size="lg" /></span>
    <p>${t(processing ? "feedback.state.processing" : "feedback.state.unknown")}</p>
  </div>`;
}

function FeedbackModule({ entry, leaving, onClose }) {
  const [caps, setCaps] = useState(null);
  const [capsFailed, setCapsFailed] = useState(false);
  const [tab, setTab] = useState(entry.tab);
  const [source, setSource] = useState(entry.source);
  const [tabs, setTabs] = useState(() => allTabs(blankDraft));
  const [ui, setUi] = useState(() => allTabs(blankUi));
  const [errorContext, setErrorContext] = useState(entry.errorContext || null);
  const [prompt, setPrompt] = useState(null);
  const [view, setView] = useState("edit");
  const [preview, setPreview] = useState(null);
  const [banner, setBanner] = useState("");
  const [clearAsk, setClearAsk] = useState(false);
  const [persistent, setPersistent] = useState(true);
  const [ext, setExt] = useState({ open: false, ask: "", opened: "", copied: false, copy: null });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState("");
  const sub = useStore(feedbackSubmission);
  const login = useStore(accountLogin);
  const stored = useRef({});
  const owner = useRef("");
  const loginFromHere = useRef(false);
  const saveTimer = useRef(null);
  const reviewRef = useRef(null);
  const pendingScenario = useRef(null);

  const sending = sub?.phase === "sending";
  const d = tabs[tab];
  const u = ui[tab];
  const builtin = caps?.gateway === "builtin";
  const signedIn = !!caps?.signedIn;

  const patchUi = (which, patch) => setUi((s) => ({ ...s, [which]: { ...s[which], ...(typeof patch === "function" ? patch(s[which]) : patch) } }));
  const contactChoice = (which) => {
    const uu = ui[which];
    if (!uu.consent) return { consent: false };
    if (uu.channel === "account") return { consent: true, channel: "account_email" };
    if (uu.channel === "other") return { consent: true, channel: tabs[which].contactKind || "email", value: tabs[which].contactValue };
    return { consent: true };
  };
  const total = useMemo(() => inputTotal(tab, d, { consent: u.consent, channel: u.channel }), [tab, d, u.consent, u.channel]);

  // —— 草稿：编辑后稍等一下存本机；关闭时立刻存 ——
  const saveNow = (which = tab, snapshot = tabs) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = null;
    return api("/feedback/v2/draft", { method: "PUT", body: { tabs: { [which]: toDraft(snapshot[which]) }, only: [which] } })
      .then((r) => setPersistent(r.persistent !== false))
      .catch(() => {});
  };
  const scheduleSave = (which, snapshot) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveNow(which, snapshot), 600);
  };
  const editDraft = (patch, which = tab) => {
    setTabs((s) => {
      const next = { ...s, [which]: { ...s[which], ...patch } };
      scheduleSave(which, next);
      return next;
    });
    // 编辑让旧的检查结果作废；改了哪里就清哪里的错误
    patchUi(which, (cur) => {
      const errors = { ...cur.errors };
      if ("description" in patch) {
        delete errors.description;
        delete errors.input_total;
      }
      if ("role" in patch) delete errors.role;
      if ("contactValue" in patch || "contactKind" in patch) delete errors.contact;
      return { errors };
    });
    setBanner("");
  };
  const editUi = (patch, which = tab) => {
    patchUi(which, (cur) => ({ ...patch, errors: "consent" in patch || "channel" in patch ? { ...cur.errors, contact: "" } : cur.errors }));
    setBanner("");
  };

  // —— 能力（网关、登录、工单服务、账号邮箱） ——
  const loadCaps = async (refresh = false) => {
    try {
      const c = await api(`/feedback/v2/capabilities${refresh ? "?refresh=1" : ""}`);
      setCaps(c);
      setCapsFailed(c.remote === "error");
      setPersistent(c.drafts?.persistent !== false);
      return c;
    } catch {
      setCapsFailed(true);
      return null;
    }
  };

  /** 企业场景：空稿用三个关键词生成可编辑模板；已有正文时先问怎么加入 */
  const applyScenario = (scenarioId, current) => {
    if (sending) {
      pendingScenario.current = scenarioId;
      setPrompt({ kind: "mergeSending" });
      return;
    }
    if (hasText(current)) return setPrompt({ kind: "merge", scenarioId });
    const tpl = scenarioTemplate({ intro: t("feedback.enterprise.templateIntro", { keywords: t(`feedback.scenario.${scenarioId}.list`) }), apps: t("feedback.enterprise.templateApps"), problem: t("feedback.enterprise.templateProblem") });
    setTabs((s) => ({ ...s, enterprise: { ...current, description: tpl.description, guidance: tpl.guidance, scenarioId, role: "" } }));
    patchUi("enterprise", revokeConsent);
  };

  /** 按入口定位分类并装载草稿（首次打开，和换了账户之后） */
  const applyEntry = (e, storedTabs, { initial }) => {
    const next = {};
    for (const which of FEEDBACK_TABS) next[which] = fromStored(storedTabs[which], false);
    setTab(e.tab);
    setSource(e.source);
    if (e.errorContext) setErrorContext(e.errorContext);
    const target = storedTabs[e.tab];
    if (e.source === "discover_scenario" && e.scenarioId) {
      setTabs(next);
      applyScenario(e.scenarioId, next.enterprise);
    } else {
      // 普通重开：目标分类有没发出的草稿时，让本人选继续还是新建（其他分类的草稿原位保留）
      if (hasText(target)) {
        next[e.tab] = blankDraft();
        setPrompt({ kind: "resume" });
      } else if (initial) setPrompt(null);
      setTabs(next);
    }
    setUi(allTabs(blankUi));
  };

  const loadDrafts = async () => {
    const r = await api("/feedback/v2/draft").catch(() => null);
    stored.current = r?.draft?.tabs || {};
    owner.current = r?.ownerTag || "";
    setPersistent(r?.persistent !== false);
    return r;
  };

  useEffect(() => {
    (async () => {
      const [, r] = await Promise.all([loadCaps(), loadDrafts()]);
      if (r?.pendingMove && !FEEDBACK_TABS.some((x) => hasText(stored.current[x]))) setPrompt({ kind: "move" });
      else applyEntry(entry, stored.current, { initial: true });
      // 收起窗口时有结果回来、或上次结果还没确认：先展示那一份（结果未知时避免重复提交）
      const s = feedbackSubmission.get();
      const unresolved = ["unknown", "processing", "not_found"].includes(s?.result?.status);
      if (s?.phase === "done" && (!s.seen || unresolved)) {
        feedbackSubmission.set({ ...s, seen: true });
        setTab(s.tab);
        showResult(s.result, s.tab);
      } else if (s?.phase === "sending") setTab(s.tab);
      setLoaded(true);
    })();
    return () => clearTimeout(saveTimer.current);
  }, []);

  // 同一个弹窗里换入口（不叠窗）：切到对应分类；报错卡换上新的报错；发现页的场景走合并流程
  const firstEntry = useRef(entry.at);
  useEffect(() => {
    if (!loaded || entry.at === firstEntry.current) return;
    firstEntry.current = entry.at;
    if (view !== "edit" && !sending) {
      if (preview?.data?.snapshotId) void api("/feedback/v2/preview/discard", { method: "POST", body: { snapshotId: preview.data.snapshotId } }).catch(() => {});
      setView("edit");
      setPreview(null);
    }
    if (!sending) setTab(entry.tab);
    setSource(entry.source);
    if (entry.errorContext) {
      setErrorContext(entry.errorContext);
      patchUi("bug", { includeError: true });
    }
    if (entry.source === "discover_scenario" && entry.scenarioId) applyScenario(entry.scenarioId, tabs.enterprise);
  }, [entry.at, loaded]);

  // —— 换了账户：登录完成、切账号都撤回联系许可；本人从这里登录的直接带上草稿，其他情况先问 ——
  const accountChanged = async () => {
    const c = await loadCaps(true);
    if (!c || !owner.current || c.ownerTag === owner.current) return;
    setUi((s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, revokeConsent(v)])));
    if (preview?.data?.snapshotId) void api("/feedback/v2/preview/discard", { method: "POST", body: { snapshotId: preview.data.snapshotId } }).catch(() => {});
    if (view === "preview") setView("edit");
    if (loginFromHere.current) {
      loginFromHere.current = false;
      await api("/feedback/v2/draft/move", { method: "POST", body: { decision: "move" } }).catch(() => {});
      for (const which of FEEDBACK_TABS) if (hasText(tabs[which])) await saveNow(which, tabs);
      await loadDrafts();
      return;
    }
    if (FEEDBACK_TABS.some((x) => hasText(tabs[x]))) setPrompt({ kind: "move", live: true });
    else {
      await loadDrafts();
      applyEntry({ ...entry, tab }, stored.current, { initial: false });
    }
  };
  useEffect(() => {
    if (login.success) void accountChanged();
  }, [login.success]);
  useEffect(() => {
    const on = () => void accountChanged();
    window.addEventListener("amb-account-refresh", on);
    window.addEventListener("amb-connection-change", on);
    return () => {
      window.removeEventListener("amb-account-refresh", on);
      window.removeEventListener("amb-connection-change", on);
    };
  });

  const decideMove = async (decision) => {
    const live = prompt?.live;
    setPrompt(null);
    await api("/feedback/v2/draft/move", { method: "POST", body: { decision } }).catch(() => {});
    if (live && decision === "move") {
      for (const which of FEEDBACK_TABS) if (hasText(tabs[which])) await saveNow(which, tabs);
      await loadDrafts();
      return;
    }
    await loadDrafts();
    // 带入的是正文：角色要本人重新选，许可也要重新确认
    applyEntry(live ? { ...entry, tab } : entry, stored.current, { initial: false });
  };

  const decideResume = (cont) => {
    setPrompt(null);
    if (cont) setTabs((s) => ({ ...s, [tab]: fromStored(stored.current[tab], true) }));
  };

  const decideMerge = (add) => {
    const scenarioId = prompt?.scenarioId;
    setPrompt(null);
    const cur = tabs.enterprise;
    if (!add) {
      // 继续原稿：不附新场景，角色是本人原来的选择
      setTabs((s) => ({ ...s, enterprise: { ...cur, role: cur.role || stored.current.enterprise?.role || "" } }));
      return;
    }
    const line = t("feedback.enterprise.mergeLine", { name: t(`feedback.scenario.${scenarioId}.name`), keywords: t(`feedback.scenario.${scenarioId}.keywords`) });
    const next = appendScenario(cur.description, line, caps?.limits?.inputMax ?? 4000);
    if (next === null) return setPrompt({ kind: "mergeTooLong" });
    editDraft({ description: next, scenarioId, role: "" }, "enterprise");
    patchUi("enterprise", revokeConsent);
  };

  // 发送完成后再处理收起期间来的场景
  useEffect(() => {
    if (!sending && pendingScenario.current) {
      const id = pendingScenario.current;
      pendingScenario.current = null;
      setPrompt(null);
      setTab("enterprise");
      applyScenario(id, tabs.enterprise);
    }
  }, [sending]);

  // —— 构造、预览、发送 ——
  const input = (which = tab) => ({
    tab: which,
    source,
    draft: toDraft(tabs[which]),
    contact: contactChoice(which),
    ...(which === "bug" ? { diagnostics: { includeError: !!errorContext && ui.bug.includeError, includeLogs: ui.bug.includeLogs }, ...(errorContext ? { errorContext } : {}) } : {}),
    ...(caps?.identity?.revision ? { identityRevision: caps.identity.revision } : {}),
  });

  /** 本机即时校验（服务端还会再查一遍）：只查当前分类、只在同意留联时查联系方式 */
  const localErrors = () => {
    const errors = {};
    const desc = [...String(d.description || "").trim()].length;
    const min = caps?.limits?.descriptionMin ?? 10;
    if (inputTotal(tab, { description: d.description, guidance: d.guidance }, null) < min || !desc) errors.description = fieldMessage("too_short", { min });
    if (tab === "enterprise" && !d.role) errors.role = fieldMessage("role_required");
    if (u.consent) {
      if (!u.channel) errors.contact = fieldMessage("contact_channel_required");
      else if (u.channel === "account" && !caps?.identity?.emailAvailable) errors.contact = fieldMessage("contact_email_unavailable");
      else if (u.channel === "other") {
        const code = contactValueError(d.contactKind || "email", d.contactValue);
        if (code) errors.contact = fieldMessage(code);
      }
    }
    if (total > (caps?.limits?.inputMax ?? 4000)) errors.input_total = fieldMessage("too_long", { max: caps?.limits?.inputMax ?? 4000 });
    return errors;
  };

  const buildPreview = async () => {
    const errors = localErrors();
    if (Object.keys(errors).length) {
      patchUi(tab, { errors });
      return null;
    }
    clearTimeout(saveTimer.current);
    try {
      return await api("/feedback/v2/preview", { method: "POST", body: input() });
    } catch (e) {
      if (e.status === 422 && Array.isArray(e.data?.errors)) {
        const next = {};
        let other = "";
        for (const err of e.data.errors) {
          const slot = fieldSlot(err.field);
          if (slot) next[slot] = fieldMessage(err.code, err.params);
          else other = fieldMessage(err.code, err.params);
        }
        patchUi(tab, { errors: next });
        if (other) setBanner(other);
        if (e.data.errors.some((x) => x.code === "identity_changed")) void loadCaps(true);
        return null;
      }
      throw e;
    }
  };

  const openPreview = async () => {
    setBanner("");
    const errors = localErrors();
    if (Object.keys(errors).length) return patchUi(tab, { errors });
    setView("preview");
    setPreview({ loading: true });
    try {
      const p = await buildPreview();
      if (!p) {
        setView("edit");
        setPreview(null);
        return;
      }
      setPreview({ data: p });
    } catch {
      setPreview({ error: t("feedback.preview.failed") });
    }
  };

  const backToEdit = () => {
    if (preview?.data?.snapshotId) void api("/feedback/v2/preview/discard", { method: "POST", body: { snapshotId: preview.data.snapshotId } }).catch(() => {});
    setView("edit");
    setPreview(null);
    requestAnimationFrame(() => reviewRef.current?.focus());
  };

  const showResult = (result, which) => {
    const st = result?.status;
    if (st === "created") {
      setView("success");
      if (result.draftCleared) {
        setTabs((s) => ({ ...s, [which]: blankDraft() }));
        setUi((s) => ({ ...s, [which]: blankUi() }));
      }
      return;
    }
    if (st === "unknown" || st === "processing" || st === "not_found") return setView("result");
    setView("edit");
    setPreview(null);
    const map = {
      rate_limited: "feedback.state.rateLimited",
      session_expired: "feedback.state.sessionExpired",
      unsupported: "feedback.state.unsupported",
      unavailable: "feedback.state.unavailable",
      stale: "feedback.preview.stale",
    };
    if (map[st]) {
      setBanner(t(map[st]));
      if (st !== "rate_limited") void loadCaps(true);
      return;
    }
    const code = result?.code || "";
    if (code === "CONTACT_IDENTITY_CHANGED") {
      patchUi(which, { errors: { contact: t("feedback.errors.identityChanged") } });
      void loadCaps(true);
    } else if (code === "CONTACT_EMAIL_UNAVAILABLE") patchUi(which, { errors: { contact: t("feedback.contact.accountUnavailable") } });
    else if (code === "CONTACT_WITHOUT_CONSENT") patchUi(which, { errors: { contact: t("feedback.errors.noConsent") } });
    else if (code === "PREVIEW_MISMATCH" || code === "SENSITIVE_CONTENT") setBanner(t("feedback.errors.reviewAgain"));
    else if (code === "SUBMISSION_CONFLICT") setBanner(t("feedback.errors.conflict"));
    else if (code === "OWNER_OR_REQUEST_FORBIDDEN") setBanner(t("feedback.errors.forbidden"));
    else if (code === "SCHEMA_OR_FIELD_INVALID") setBanner(t("feedback.errors.fieldInvalid"));
    else setBanner(t("feedback.state.failed"));
  };

  const doSend = async (p) => {
    setBanner("");
    await submitFeedback({ tab: p.tab, snapshotId: p.snapshotId, clientSubmissionId: p.clientSubmissionId });
  };
  // 发送结束（包括本人收起后又打开的这个窗口）：按原分类展示结果
  const prevPhase = useRef(sub?.phase);
  useEffect(() => {
    if (prevPhase.current === "sending" && sub?.phase === "done") {
      feedbackSubmission.set({ ...sub, seen: true });
      showResult(sub.result, sub.tab);
    }
    prevPhase.current = sub?.phase;
  }, [sub?.phase]);

  const primary = async () => {
    if (sending || busy) return;
    if (builtin && !signedIn) {
      // 登录并继续：先存草稿，登录完成后回到原分类，正文保留、不自动发送
      await saveNow();
      loginFromHere.current = true;
      void startAccountLogin();
      return;
    }
    if (!caps?.canSubmit) return;
    setBusy("prepare");
    setBanner("");
    try {
      const p = await buildPreview();
      if (!p) return;
      // 留了联系方式：必须先看发送内容，再由"确认发送"提交
      if (p.contact?.consent) {
        setPreview({ data: p });
        setView("preview");
        return;
      }
      await doSend(p);
    } catch {
      setBanner(t("feedback.preview.failed"));
    } finally {
      setBusy("");
    }
  };

  const confirmSend = async () => {
    if (!preview?.data || sending) return;
    await doSend(preview.data);
  };

  const check = async () => {
    if (!sub) return;
    setBusy("check");
    const result = await lookupFeedback(sub);
    setBusy("");
    showResult(result, sub.tab);
  };
  const retrySame = async () => {
    if (sub) await submitFeedback(sub);
  };

  // —— 切换分类、关闭、清除 ——
  const switchTab = (next) => {
    if (sending || next === tab) return;
    setTab(next);
    setBanner("");
    setClearAsk(false);
    setExt({ open: false, ask: "", opened: "", copied: false, copy: null });
    if (prompt?.kind === "resume") setPrompt(null);
  };

  const close = () => {
    if (leaving) return;
    if (sending) {
      // 收起窗口：发送继续，结果回来后重新打开就能看到
      toast(t("feedback.state.hidden"));
      onClose();
      return;
    }
    if (view === "success") clearFeedbackSubmission();
    if (preview?.data?.snapshotId && view === "preview") void api("/feedback/v2/preview/discard", { method: "POST", body: { snapshotId: preview.data.snapshotId } }).catch(() => {});
    if (saveTimer.current) void saveNow();
    onClose();
  };

  const clearDraft = async () => {
    setClearAsk(false);
    await api(`/feedback/v2/draft?tab=${tab}`, { method: "DELETE" }).catch(() => {});
    setTabs((s) => ({ ...s, [tab]: blankDraft() }));
    setUi((s) => ({ ...s, [tab]: blankUi() }));
    if (tab === "bug") setErrorContext(null);
  };

  const another = () => {
    clearFeedbackSubmission();
    setView("edit");
    setPreview(null);
  };

  // —— 邮件 / GitHub ——
  const proceedExternal = async () => {
    const kind = ext.ask;
    try {
      const copy = await api("/feedback/v2/external", { method: "POST", body: input() });
      const link =
        kind === "github"
          ? githubFeedbackUrl({ tab, text: copy.description, version: copy.version, environment: copy.environment, errorText: copy.errorText })
          : emailFeedbackUrl({ subject: t("feedback.external.emailSubject", { tab: t(`feedback.tabs.${tab}`) }), text: copy.description, environment: copy.environment, errorText: copy.errorText });
      const a = document.createElement("a");
      a.href = link.url;
      if (kind === "github") {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      }
      a.click();
      setExt((s) => ({ ...s, ask: "", opened: kind, copied: false, copy }));
    } catch {
      setExt((s) => ({ ...s, ask: "" }));
      setBanner(t("feedback.preview.failed"));
    }
  };
  const copyExternal = () => {
    if (!ext.copy) return;
    navigator.clipboard?.writeText(ext.copy.text).then(() => setExt((s) => ({ ...s, copied: true })), () => {});
  };

  // —— 渲染 ——
  const scenarioName = d.scenarioId ? t(`feedback.scenario.${d.scenarioId}.name`) : "";
  const leadText =
    view === "preview"
      ? t("feedback.preview.subtitle")
      : view === "success"
        ? t("feedback.success.subtitle")
        : tab === "use_case"
          ? builtin && !signedIn
            ? t("feedback.lead.use_caseSignedOut")
            : t("feedback.lead.use_case")
          : tab === "bug"
            ? t("feedback.lead.bug")
            : scenarioName
              ? t("feedback.lead.enterpriseScenario")
              : t("feedback.lead.enterprise");
  const max = caps?.limits?.inputMax ?? 4000;
  const disabled = sending || !loaded;
  const formProps = { draft: d, ui: u, total, max, disabled, onDraft: (p) => editDraft(p), onUi: (p) => editUi(p) };

  const promptBox = (() => {
    if (!prompt || view !== "edit") return null;
    if (prompt.kind === "resume")
      return html`<div class="fb-well fb-prompt"><span>${t("feedback.draft.saved")}</span><span class="fb-row-actions">
        <button type="button" class="btn sm" onClick=${() => decideResume(true)}>${t("feedback.draft.resume")}</button>
        <button type="button" class="btn sm ghost" onClick=${() => decideResume(false)}>${t("feedback.draft.fresh")}</button></span></div>`;
    if (prompt.kind === "move")
      return html`<div class="fb-well fb-prompt"><span>${t("feedback.draft.moveQuestion")}</span><span class="fb-row-actions">
        <button type="button" class="btn sm ghost" onClick=${() => decideMove("dismiss")}>${t("feedback.draft.dontMove")}</button>
        <button type="button" class="btn sm" onClick=${() => decideMove("move")}>${t("feedback.draft.move")}</button></span></div>`;
    if (prompt.kind === "merge")
      return html`<div class="fb-well fb-prompt"><span>${t("feedback.enterprise.mergeQuestion")}</span><span class="fb-row-actions">
        <button type="button" class="btn sm ghost" onClick=${() => decideMerge(false)}>${t("feedback.enterprise.mergeContinue")}</button>
        <button type="button" class="btn sm" onClick=${() => decideMerge(true)}>${t("feedback.enterprise.mergeAdd")}</button></span></div>`;
    if (prompt.kind === "mergeTooLong") return html`<div class="fb-well fb-prompt" role="alert"><span>${t("feedback.enterprise.mergeTooLong")}</span><button type="button" class="btn sm ghost" onClick=${() => setPrompt(null)}>${t("feedback.enterprise.mergeContinue")}</button></div>`;
    if (prompt.kind === "mergeSending") return html`<div class="fb-well fb-prompt" role="status"><span>${t("feedback.enterprise.mergeSending")}</span></div>`;
    return null;
  })();

  const modeBox = (() => {
    if (!caps) return null;
    if (!builtin) return html`<${Notice}>${t("feedback.external.modeNotice")}<//>`;
    if (!signedIn)
      return html`<div class="fb-well fb-signin"><b>${t("feedback.signIn.title")}</b><span class="hint">${login.waiting ? t("feedback.signIn.waiting") : t("feedback.signIn.body")}</span></div>`;
    if (capsFailed) return html`<${Notice} action=${html`<${Button} size="sm" onClick=${() => loadCaps(true)}>${t("feedback.preview.retry")}<//>`}>${t("feedback.state.unavailable")}<//>`;
    if (caps.remote === "unsupported") return html`<${Notice}>${t("feedback.state.unsupported")}<//>`;
    return null;
  })();

  const editBody = html`
    <${Lead} text=${leadText} />
    <div class="fb-tabs" role="tablist" aria-label=${t("feedback.tabs.label")}>
      ${FEEDBACK_TABS.map((x) => html`<button type="button" role="tab" id=${`fb-tab-${x}`} aria-controls="fb-panel" aria-selected=${tab === x} class=${`fb-tab${tab === x ? " on" : ""}`} disabled=${sending && tab !== x} onClick=${() => switchTab(x)}>${t(`feedback.tabs.${x}`)}</button>`)}
    </div>
    ${promptBox}
    <div class="fb-panel" id="fb-panel" role="tabpanel" aria-labelledby=${`fb-tab-${tab}`}>
      ${tab === "use_case" && html`<${UseCaseForm} ...${formProps} />`}
      ${tab === "bug" && html`<${BugForm} ...${formProps} errorContext=${errorContext} env=${caps ? { ...caps.environment, errorMax: caps.limits.errorMax } : null} />`}
      ${tab === "enterprise" && html`<${EnterpriseForm} ...${formProps} scenarioName=${scenarioName} onRemoveScenario=${() => editDraft({ scenarioId: "" })} />`}
      ${modeBox}
      <${ContactBlock} tab=${tab} draft=${d} ui=${u} identity=${caps?.identity} disabled=${disabled} onUi=${(p) => editUi(p)} onDraft=${(p) => editDraft(p)} />
      ${tab !== "enterprise" && html`<${OtherWays} state=${ext} disabled=${disabled}
        onToggle=${() => setExt((s) => ({ ...s, open: !s.open, ask: "" }))} onAsk=${(kind) => setExt((s) => ({ ...s, ask: kind, opened: "", copied: false }))}
        onProceed=${proceedExternal} onBack=${() => setExt((s) => ({ ...s, ask: "" }))} onCopy=${copyExternal} />`}
      <div class="fb-review-row">
        <button type="button" class="fb-link" ref=${reviewRef} disabled=${disabled} onClick=${openPreview}>${t("feedback.reviewLink")} ›</button>
        ${tab === "bug" && html`<span class="hint">${t("feedback.bug.noAttachments")}</span>`}
      </div>
      <${ErrorLine} text=${banner} />
    </div>`;

  const primaryLabel = builtin && !signedIn ? t("feedback.actions.signIn") : tab === "enterprise" ? t("feedback.actions.submitRequest") : t("feedback.actions.send");
  const primaryDisabled = !loaded || (builtin && !signedIn ? login.waiting : !caps?.canSubmit) || !!busy;
  const footer = (() => {
    if (view === "preview")
      return html`<${Button} onClick=${backToEdit} disabled=${sending}>${t("feedback.preview.back")}<//>
        ${preview?.data && (signedIn && caps?.canSubmit
          ? html`<${Button} variant="primary" loading=${sending} disabled=${sending} onClick=${confirmSend}>${sending ? t("feedback.state.sending") : t("feedback.preview.confirm")}<//>`
          : builtin && !signedIn
            ? html`<${Button} variant="primary" disabled=${login.waiting} onClick=${primary}>${t("feedback.actions.signIn")}<//>`
            : null)}`;
    if (view === "success") {
      const r = sub?.result?.receipt;
      return html`<button type="button" class="btn ghost" onClick=${another}>${t("feedback.success.another")}</button>
        ${r?.supportUrl && html`<a class="btn" href=${r.supportUrl} target="_blank" rel="noopener noreferrer">${t("feedback.success.view")} ↗</a>`}
        <${Button} variant="primary" data-autofocus onClick=${close}>${t("feedback.success.done")}<//>`;
    }
    if (view === "result")
      return html`<${Button} onClick=${() => { setView("edit"); clearFeedbackSubmission(); }} disabled=${sending}>${t("feedback.preview.back")}<//>
        <${Button} onClick=${retrySame} loading=${sending} disabled=${sending || !!busy}>${t("feedback.state.retrySame")}<//>
        <${Button} variant="primary" loading=${busy === "check"} disabled=${sending || !!busy} onClick=${check}>${t("feedback.state.check")}<//>`;
    if (clearAsk)
      return html`<span class="fb-foot-left"><b>${t("feedback.draft.clearQuestion")}</b> <span class="hint">${t("feedback.draft.clearBody")}</span></span>
        <${Button} onClick=${() => setClearAsk(false)}>${t("feedback.draft.keep")}<//>
        <button type="button" class="btn danger" onClick=${clearDraft}>${t("feedback.draft.clear")}</button>`;
    return html`<span class="fb-foot-left hint">${persistent ? t("feedback.draft.local") : t("feedback.draft.session")}${!sending && html` · <button type="button" class="fb-link-btn danger" onClick=${() => setClearAsk(true)}>${t("feedback.draft.clear")}</button>`}</span>
      <${Button} onClick=${close}>${sending ? t("feedback.actions.hide") : t("feedback.actions.later")}<//>
      ${(!caps || builtin) && html`<${Button} variant="primary" loading=${sending || busy === "prepare"} disabled=${primaryDisabled || sending} onClick=${primary}>${sending ? t("feedback.state.sending") : !caps ? t("feedback.state.preparing") : primaryLabel}<//>`}`;
  })();

  const body =
    view === "preview"
      ? html`<${Lead} text=${leadText} /><${PreviewView} tab=${tab} state=${preview || { loading: true }} onRetry=${openPreview} />`
      : view === "success" && sub?.result?.receipt
        ? html`<${Lead} text=${leadText} /><${SuccessView} tab=${sub.tab} receipt=${sub.result.receipt} />`
        : view === "result" && sub?.result
          ? html`<${Lead} text=${t(`feedback.tabs.${sub.tab}`)} /><${ResultView} result=${sub.result} />`
          : editBody;

  const hasAny = FEEDBACK_TABS.some((x) => hasText(tabs[x]));
  return html`<${Sheet} title=${t("feedback.title")} class="fb-sheet" wide framed leaving=${leaving} sticky=${hasAny || sending} onClose=${close} footer=${footer}>
    ${sending && view === "edit" && html`<p class="hint" role="status">${t("feedback.state.sending")}</p>`}
    ${body}
  <//>`;
}

/** 挂在 main.js：store 里有入口就显示；已经开着时换入口复用同一个实例 */
export function FeedbackHost() {
  const cur = useStore(feedbackDialog);
  const [last, setLast] = useState(cur);
  useEffect(() => void (cur && setLast(cur)), [cur]);
  // 每次从关着到打开算一次新会话（新实例）；开着时换入口沿用同一个实例
  const session = useRef(0);
  const wasOpen = useRef(false);
  if (cur && !wasOpen.current) session.current += 1;
  wasOpen.current = !!cur;
  const { mounted, leaving } = usePresence(!!cur);
  const shown = cur || last;
  if (!mounted || !shown) return null;
  return html`<${FeedbackModule} key=${session.current} entry=${shown} leaving=${leaving} onClose=${() => !leaving && closeFeedback()} />`;
}
