// 代理的 PowerShell：一条安静的 .notice（淡底 + 图标 + 字，不描边），放在对话空状态和设置 → 常规的顶部，只在 Windows 上出现。
// 正在为代理安装 PowerShell 7（带进度）→ 装好了 / 没装上；用的 PowerShell 起不来、已自动换掉；这台电脑装不了；没有 PowerShell 7。
import { useState } from "preact/hooks";
import { html, Icon, CopyButton, MoreButton, Spinner } from "./ui.js";
import { PWSH_INSTALL_URL, PWSH_WINGET, ackPwsh, dismissPwsh, installPwsh, pwshHint, pwshProgress, recheckPwsh, usePwsh } from "../lib/pwsh.js";
import { failed } from "../lib/store.js";
import { t } from "../lib/i18n.js";

/**
 * inSettings：放在设置 › 常规顶部时，按钮都是小胶囊（站外的文字后带 ↗），一行最多两个，
 * 超过两个操作时「重新检测」「不再提示」收进最右侧的「⋯」；对话空状态里保持原样
 */
export function PwshHint({ inSettings = false } = {}) {
  const s = usePwsh();
  const [busy, setBusy] = useState("");
  const kind = pwshHint(s);
  if (!kind) return null;
  const slow = t("pwsh.slow");
  const run = (what, fn) => async () => {
    setBusy(what);
    try {
      await fn();
    } catch (e) {
      failed(e);
    } finally {
      setBusy("");
    }
  };
  const p = s.private || {};
  const inst = p.install || {};
  const btn = (what, label, fn, cls = "text", busyLabel = `${label}…`) => inSettings
    ? html`<button type="button" class="btn sm" disabled=${!!busy} aria-busy=${busy === what || undefined} onClick=${run(what, fn)}>${busy === what && html`<${Spinner} />`}${busy === what ? busyLabel : label}</button>`
    : html`<button type="button" class=${cls} disabled=${!!busy} aria-busy=${busy === what || undefined} onClick=${run(what, fn)}>${busy === what ? busyLabel : label}</button>`;
  const link = (label, cls) => html`<a class=${inSettings ? "btn sm" : cls} href=${PWSH_INSTALL_URL} target="_blank" rel="noopener noreferrer">${label}</a>`;
  const dismiss = btn("dismiss", t("pwsh.dismiss"), dismissPwsh);
  /** 设置里放不下的操作（重新检测、不再提示）：收进「⋯」 */
  const more = (items) => html`<${MoreButton} name=${t("pwsh.title")} busy=${items.some((it) => it.what === busy)} disabled=${!!busy}
    items=${items.map((it) => ({ label: it.label, onSelect: run(it.what, it.fn) }))} />`;
  const dismissItem = { what: "dismiss", label: t("pwsh.dismiss"), fn: dismissPwsh };
  const recheckItem = { what: "recheck", label: t("pwsh.recheck"), fn: recheckPwsh };
  const box = (icon, title, body, actions, tone = "") => html`<div class=${`notice pwsh-hint${tone ? ` ${tone}` : ""}`} role=${kind === "installing" ? "status" : "note"} aria-label=${title}>
    ${icon === "spinner" ? html`<${Spinner} />` : html`<${Icon} name=${icon} size="sm" />`}
    <div class="pwsh-body">
      <p><b>${title}</b>${body}</p>
      ${actions && html`<div class="pwsh-actions">${actions}</div>`}
    </div>
  </div>`;

  if (kind === "installing")
    return box("spinner", t("pwsh.installingTitle"), t("pwsh.installingBody", { progress: pwshProgress(inst) }));
  if (kind === "installed")
    return box("check", t("pwsh.installedTitle"), t("pwsh.installedBody", { version: s.version || p.version }), html`<button type="button" class="text" onClick=${() => ackPwsh(`ok:${inst.finishedAt}`)}>${t("pwsh.ack")}</button>`);
  if (kind === "fallback")
    return box(
      "alert",
      t("pwsh.fallbackTitle"),
      t("pwsh.fallbackBody", { from: s.fallback.from, reason: s.fallback.reason, private: s.source === "private" ? t("pwsh.privatePrefix") : "", version: s.version || "7" }),
      html`<button type="button" class="text" onClick=${() => ackPwsh(`fb:${s.fallback.at}`)}>${t("pwsh.ack")}</button>`,
      "amber",
    );
  if (kind === "broken")
    return box("alert", t("pwsh.brokenTitle"), t("pwsh.brokenBody", { reason: p.bad.reason, slow }), html`${btn("install", t("pwsh.reinstall"), () => installPwsh(true), "btn")}${dismiss}`, "amber");
  if (kind === "failed")
    return box(
      "alert",
      t("pwsh.failedTitle"),
      t("pwsh.failedBody", { error: inst.error || t("pwsh.unknownReason"), slow }),
      html`${btn("install", t("pwsh.retry"), () => installPwsh(false), "btn")}${link(t("pwsh.installSelf"), "text")}${inSettings ? more([dismissItem]) : dismiss}`,
      "amber",
    );
  if (kind === "unsupported") return box("info", t("pwsh.unsupportedTitle"), t("pwsh.unsupportedBody", { reason: p.reason, slow }), dismiss);
  // missing：改回了系统默认、关了自动安装，或者还没开始装
  return html`<div class="notice pwsh-hint" role="note" aria-label=${t("pwsh.title")}>
    <${Icon} name="info" size="sm" />
    <div class="pwsh-body">
      <p><b>${t("pwsh.title")}</b>${t("pwsh.body", { slow, canInstall: p.supported ? t("pwsh.canInstall") : "" })}</p>
      <div class="pwsh-cmd"><span class="t-meta">${t("pwsh.orRun")}</span><code>${PWSH_WINGET}</code><${CopyButton} text=${PWSH_WINGET} label=${t("pwsh.copyCommand")} /></div>
      <div class="pwsh-actions">
        ${p.supported ? btn("install", t("pwsh.oneClick"), () => installPwsh(false), "btn") : link(t("pwsh.install"), "btn")}
        ${p.supported && link(t("pwsh.installSelf"), "text")}
        ${inSettings ? more([recheckItem, dismissItem]) : html`${btn("recheck", t("pwsh.recheck"), recheckPwsh, "text", t("pwsh.checking"))}${dismiss}`}
      </div>
    </div>
  </div>`;
}
