// 需求与反馈弹窗里三个分类的表单（components/feedback.js 负责状态、草稿和发送）。
// - 使用场景与建议：一段描述 + 折叠的"补充使用场景"三个短字段；只有这个分类显示一句奖励提示。
// - 遇到问题：一段描述 + 折叠的"报错与诊断"（有真实报错时可附带，运行状态和日志勾选才读取）。不支持截图附件。
// - 企业与合作：顶部商务横条（固定外链，不带任何数据）、可移除的咨询场景、必选的角色、按角色变化的题目、选填的企业背景。
// 三个分类共用同一个留联组件（ContactBlock），数据仍各归各的草稿。所有颜色复用现有灰色体系。
import { html, Icon } from "./ui.js";
import { ErrorLine } from "./app-dialogs.js";
import { t } from "../lib/i18n.js";
import { BUSINESS_CONTACT_URL, PRODUCT_INTERESTS, TEAM_SIZES } from "../lib/feedback-links.js";

/** 折叠行："＋ 标题"；展开后由调用方渲染内容 */
export function Fold({ open, label, onToggle, disabled }) {
  return html`<button type="button" class="fb-fold" aria-expanded=${open} disabled=${disabled} onClick=${onToggle}>
    <span class="fb-fold-mark" aria-hidden="true">${open ? "−" : "+"}</span><span>${label}</span></button>`;
}

const fieldError = (ui, field) => ui.errors?.[field] || "";

/** 主描述：题目、文本框、提示和合计字数（不截断，超了在发送时报错） */
function Description({ id, question, placeholder, hint, value, total, max, error, disabled, onInput }) {
  return html`<div class="fb-q">
    <label class="fb-q-label" for=${id}>${question}</label>
    <textarea id=${id} class="field fb-text" rows="3" data-autofocus value=${value} placeholder=${placeholder} disabled=${disabled}
      aria-invalid=${error ? "true" : undefined} aria-describedby=${`${id}-meta`} onInput=${(e) => onInput(e.target.value)}></textarea>
    <div class="fb-q-meta" id=${`${id}-meta`}><span class="hint">${hint}</span><span class=${`fb-count num${total > max ? " over" : ""}`}>${t("feedback.count", { n: total, max })}</span></div>
    <${ErrorLine} text=${error} />
  </div>`;
}

/**
 * 自愿留联：默认只有一行折叠；展开不等于同意。勾选"同意就本次反馈联系我"后本人选账号邮箱或其他联系方式（邮箱 / 微信号，只填一项）。
 * 账号邮箱只来自当前已授权身份；没有时禁用并提示可自行填写，不拿用户名或文字代替。
 */
export function ContactBlock({ tab, draft, ui, identity, disabled, onUi, onDraft }) {
  const error = fieldError(ui, "contact");
  if (!ui.contactOpen) return html`<${Fold} open=${false} label=${t("feedback.contact.collapsed")} disabled=${disabled} onToggle=${() => onUi({ contactOpen: true })} />`;
  const id = `fb-contact-${tab}`;
  const emailOk = !!identity?.emailAvailable;
  return html`<div class="fb-contact">
    <div class="fb-well" role="group" aria-labelledby=${`${id}-title`}>
      <div class="fb-well-head"><b id=${`${id}-title`}>${t("feedback.contact.title")}</b>
        <button type="button" class="fb-link-btn" disabled=${disabled} onClick=${() => onUi({ contactOpen: false, consent: false, channel: "" })}>${t("feedback.contact.remove")}</button></div>
      <label class="sheet-check"><input type="checkbox" checked=${ui.consent} disabled=${disabled}
        onChange=${(e) => (e.target.checked ? onUi({ consent: true }) : onUi({ consent: false, channel: "", contactOpen: false }))} /><span>${t("feedback.contact.consent")}</span></label>
      ${ui.consent && html`<div class="fb-radios" role="radiogroup" aria-label=${t("feedback.contact.title")}>
        <label class=${`fb-radio${emailOk ? "" : " off"}`}><input type="radio" name=${`${id}-ch`} checked=${ui.channel === "account"} disabled=${disabled || !emailOk} onChange=${() => onUi({ channel: "account" })} />
          <span>${t("feedback.contact.useAccount")}<small class="hint">${emailOk ? identity.email : t("feedback.contact.accountUnavailable")}</small></span></label>
        <label class="fb-radio"><input type="radio" name=${`${id}-ch`} checked=${ui.channel === "other"} disabled=${disabled} onChange=${() => onUi({ channel: "other" })} />
          <span>${t("feedback.contact.otherChannel")}</span></label>
        ${ui.channel === "other" && html`<div class="fb-contact-row">
          <select class="field fb-contact-kind" aria-label=${t("feedback.contact.kindLabel")} value=${draft.contactKind || "email"} disabled=${disabled} onChange=${(e) => onDraft({ contactKind: e.target.value })}>
            <option value="email">${t("feedback.contact.kindEmail")}</option><option value="wechat">${t("feedback.contact.kindWechat")}</option></select>
          <input class="field" type=${(draft.contactKind || "email") === "email" ? "email" : "text"} autocomplete=${(draft.contactKind || "email") === "email" ? "email" : "off"} spellcheck="false"
            aria-label=${(draft.contactKind || "email") === "email" ? t("feedback.contact.emailPlaceholder") : t("feedback.contact.wechatPlaceholder")}
            placeholder=${(draft.contactKind || "email") === "email" ? t("feedback.contact.emailPlaceholder") : t("feedback.contact.wechatPlaceholder")}
            value=${draft.contactValue || ""} disabled=${disabled} aria-invalid=${error ? "true" : undefined} onInput=${(e) => onDraft({ contactValue: e.target.value })} /></div>`}
      </div>`}
      <${ErrorLine} text=${error} />
    </div>
    <p class="hint fb-note">${t("feedback.contact.note")}</p>
  </div>`;
}

/** 使用场景与建议 */
export function UseCaseForm({ draft, ui, total, max, disabled, onDraft, onUi }) {
  const ctx = draft.context || {};
  const setCtx = (k, v) => onDraft({ context: { ...ctx, [k]: v } });
  return html`<p class="fb-reward"><b>${t("feedback.reward")}</b></p>
    <${Description} id="fb-desc-use_case" question=${t("feedback.useCase.question")} placeholder=${t("feedback.useCase.placeholder")} hint=${t("feedback.useCase.hint")}
      value=${draft.description} total=${total} max=${max} error=${fieldError(ui, "description") || fieldError(ui, "input_total")} disabled=${disabled} onInput=${(v) => onDraft({ description: v })} />
    <${Fold} open=${ui.contextOpen} label=${t("feedback.useCase.context")} disabled=${disabled} onToggle=${() => onUi({ contextOpen: !ui.contextOpen })} />
    ${ui.contextOpen && html`<div class="fb-fields">
      ${[["task", "feedback.useCase.task"], ["current_approach", "feedback.useCase.current"], ["desired_outcome", "feedback.useCase.outcome"]].map(([k, label]) => html`<label class="fb-field"><span>${t(label)}</span>
        <input class="field" value=${ctx[k] || ""} disabled=${disabled} onInput=${(e) => setCtx(k, e.target.value)} /></label>`)}
    </div>`}`;
}

/** 遇到问题：报错和诊断默认折叠；日志默认不勾、展开也不读 */
export function BugForm({ draft, ui, total, max, disabled, errorContext, env, onDraft, onUi }) {
  const errorLong = errorContext && [...String(errorContext.text || "")].length > (env?.errorMax ?? 1500);
  return html`<${Description} id="fb-desc-bug" question=${t("feedback.bug.question")} placeholder=${t("feedback.bug.placeholder")} hint=""
      value=${draft.description} total=${total} max=${max} error=${fieldError(ui, "description") || fieldError(ui, "input_total")} disabled=${disabled} onInput=${(v) => onDraft({ description: v })} />
    <div class="fb-diag">
      <button type="button" class="fb-diag-head" aria-expanded=${ui.diagOpen} disabled=${disabled} onClick=${() => onUi({ diagOpen: !ui.diagOpen })}>
        <b>${t("feedback.bug.diag")}</b><span class="fb-dot" aria-hidden="true">·</span><span>${ui.diagOpen ? t("feedback.bug.collapse") : t("feedback.bug.expand")}</span></button>
      ${ui.diagOpen && html`<div class="fb-diag-body">
        ${errorContext && html`<label class="sheet-check"><input type="checkbox" checked=${ui.includeError} disabled=${disabled} onChange=${(e) => onUi({ includeError: e.target.checked })} />
          <span>${t("feedback.bug.includeError")}<small class="hint">${t("feedback.bug.includeErrorSub")}</small></span></label>
          ${ui.includeError && html`<pre class="fb-pre" tabindex="0" aria-label=${t("feedback.bug.includeError")}>${errorContext.text}</pre>`}
          ${ui.includeError && errorLong && html`<p class="hint">${t("feedback.bug.errorLong", { max: env?.errorMax ?? 1500 })}</p>`}`}
        <label class="sheet-check"><input type="checkbox" checked=${ui.includeLogs} disabled=${disabled} onChange=${(e) => onUi({ includeLogs: e.target.checked })} />
          <span>${t("feedback.bug.includeLogs")}<small class="hint">${t("feedback.bug.includeLogsSub")}</small></span></label>
        ${env && html`<p class="hint">${t("feedback.bug.env", { version: env.version, os: t(`feedback.os.${env.os === "other" ? "unknown" : env.os}`), runtime: t(`feedback.bug.runtime_${env.runtime}`) })}</p>`}
      </div>`}
    </div>`;
}

/** 企业与合作 */
export function EnterpriseForm({ draft, ui, total, max, disabled, scenarioName, onDraft, onUi, onRemoveScenario }) {
  const partner = draft.role === "solution_partner";
  const b = draft.business || {};
  const setB = (patch) => onDraft({ business: { ...b, ...patch } });
  const roles = ["enterprise_use", "solution_partner"];
  const roleError = fieldError(ui, "role");
  return html`<div class="fb-biz">
      <b>${t("feedback.enterprise.bannerTitle")}</b>
      <a class="btn sm fb-biz-link" href=${BUSINESS_CONTACT_URL} target="_blank" rel="noopener noreferrer">${t("feedback.enterprise.bannerLink")} ↗</a>
    </div>
    ${scenarioName && html`<div class="fb-scenario"><b>${t("feedback.enterprise.scenarioContext", { name: scenarioName })}</b>
      <button type="button" class="fb-link-btn" disabled=${disabled} onClick=${onRemoveScenario}>${t("feedback.enterprise.removeScenario")}</button></div>`}
    <fieldset class="fb-roles" aria-invalid=${roleError ? "true" : undefined}>
      <legend class="fb-q-label">${t("feedback.enterprise.roleQuestion")}</legend>
      <div class="fb-role-grid">
        ${roles.map((r) => html`<label class=${`fb-role${draft.role === r ? " on" : ""}`}>
          <input type="radio" name="fb-role" checked=${draft.role === r} disabled=${disabled} onChange=${() => onDraft({ role: r })} />
          <span><b>${t(`feedback.enterprise.role_${r}`)}</b><small class="hint">${t(`feedback.enterprise.role_${r}Sub`)}</small></span></label>`)}
      </div>
      <${ErrorLine} text=${roleError} />
    </fieldset>
    <${Description} id="fb-desc-enterprise" question=${t(partner ? "feedback.enterprise.partnerQuestion" : "feedback.enterprise.question")}
      placeholder=${t(partner ? "feedback.enterprise.partnerPlaceholder" : "feedback.enterprise.placeholder")} hint=${draft.guidance?.length ? t("feedback.enterprise.editable") : ""}
      value=${draft.description} total=${total} max=${max} error=${fieldError(ui, "description") || fieldError(ui, "input_total")} disabled=${disabled} onInput=${(v) => onDraft({ description: v })} />
    <div class="fb-two">
      <label class="fb-field"><span>${t("feedback.enterprise.company")}</span>
        <input class="field" autocomplete="organization" value=${b.company_name || ""} placeholder=${t("feedback.enterprise.companyPlaceholder")} disabled=${disabled} onInput=${(e) => setB({ company_name: e.target.value })} /></label>
      <label class="fb-field"><span>${t("feedback.enterprise.teamSize")}</span>
        <select class="field" value=${b.team_size || ""} disabled=${disabled} onChange=${(e) => setB({ team_size: e.target.value })}>
          <option value="">${b.team_size ? t("feedback.enterprise.teamNone") : t("feedback.enterprise.choose")}</option>
          ${TEAM_SIZES.map((s) => html`<option value=${s}>${t(`feedback.enterprise.team_${s}`)}</option>`)}
        </select></label>
    </div>
    <${Fold} open=${ui.backgroundOpen} label=${t("feedback.enterprise.background")} disabled=${disabled} onToggle=${() => onUi({ backgroundOpen: !ui.backgroundOpen })} />
    ${ui.backgroundOpen && html`<div class="fb-fields">
      <p class="hint fb-note">${t("feedback.enterprise.backgroundNote")}</p>
      <div class="fb-two">
        <label class="fb-field"><span>${t("feedback.enterprise.jobRole")}</span><input class="field" autocomplete="organization-title" value=${b.job_role || ""} disabled=${disabled} onInput=${(e) => setB({ job_role: e.target.value })} /></label>
        <label class="fb-field"><span>${t("feedback.enterprise.product")}</span>
          <select class="field" value=${b.product_interest || ""} disabled=${disabled} onChange=${(e) => setB({ product_interest: e.target.value })}>
            <option value="">${t("feedback.enterprise.productNone")}</option>
            ${PRODUCT_INTERESTS.map((p) => html`<option value=${p}>${t(`feedback.enterprise.product_${p}`)}</option>`)}
          </select></label>
      </div>
      <label class="fb-field"><span>${t("feedback.enterprise.systems")}</span><input class="field" value=${b.current_systems || ""} disabled=${disabled} onInput=${(e) => setB({ current_systems: e.target.value })} /></label>
      <label class="fb-field"><span>${t("feedback.enterprise.partnership")}</span><textarea class="field" rows="2" value=${b.partnership_context || ""} disabled=${disabled} onInput=${(e) => setB({ partnership_context: e.target.value })}></textarea></label>
      ${draft.role === "enterprise_use" && html`<label class="sheet-check"><input type="checkbox" checked=${!!b.introduce_to_own_company} disabled=${disabled} onChange=${(e) => setB({ introduce_to_own_company: e.target.checked })} /><span>${t("feedback.enterprise.introduce")}</span></label>`}
    </div>`}`;
}

/**
 * 邮件 / GitHub：本人选择、确认风险后自己去提交。打开页面或邮件应用都不是"已发送"；只有本人点"复制完整内容"才写剪贴板。
 * 外部副本由本机服务重新构造（不复用私有快照）：没有联系许可、联系值、企业背景和没选的诊断。
 */
export function OtherWays({ state, disabled, onToggle, onAsk, onProceed, onBack, onCopy }) {
  return html`<div class="fb-other">
    <button type="button" class="fb-link" aria-expanded=${state.open} disabled=${disabled} onClick=${onToggle}>${t("feedback.external.otherWays")} ›</button>
    ${state.open && html`<div class="fb-other-body">
      <p class="hint">${t("feedback.external.otherBody")}</p>
      ${state.ask
        ? html`<div class="fb-well fb-risk" role="alert"><span>${t("feedback.external.risk")}</span>
            <span class="fb-row-actions"><button type="button" class="btn sm ghost" onClick=${onBack}>${t("feedback.external.back")}</button>
            <button type="button" class="btn sm" onClick=${onProceed}>${t("feedback.external.proceed")}</button></span></div>`
        : html`<div class="fb-row-actions start"><button type="button" class="btn sm" disabled=${disabled} onClick=${() => onAsk("email")}>${t("feedback.external.email")} ↗</button>
            <button type="button" class="btn sm" disabled=${disabled} onClick=${() => onAsk("github")}>${t("feedback.external.github")} ↗</button></div>`}
      ${state.opened && html`<div class="fb-row-actions start" role="status"><span class="hint">${t(state.opened === "email" ? "feedback.external.emailOpened" : "feedback.external.githubOpened")}</span>
        <button type="button" class="btn sm ghost" onClick=${onCopy}><${Icon} name="copy" size="sm" />${t("feedback.external.copy")}</button>
        ${state.copied && html`<span class="hint">${t("feedback.external.copied")}</span>`}</div>`}
    </div>`}
  </div>`;
}
