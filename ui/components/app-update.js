import { useState } from "preact/hooks";
import { html, Button, MoreButton } from "./ui.js";
import { api } from "../lib/api.js";
import { toast } from "../lib/store.js";
import { t } from "../lib/i18n.js";
import { openWhatsNew } from "./whats-new.js";

export const updateError = (error) => t(`updates.errors.${error?.data?.code || "failed"}`);

/** 账户按钮和菜单使用同一句动作说明。 */
export function updateActionLabel(update) {
  if (["checking", "downloading", "installing"].includes(update?.phase)) return updateDescription(update);
  return t(update?.phase === "ready" ? "updates.restartVersion" : update?.supported ? "updates.downloadVersion" : "updates.browserVersion", { version: update?.latest || "" });
}

export function updateDescription(update) {
  if (!update) return "";
  if (update.phase === "checking") return t("updates.checking");
  if (update.phase === "downloading") return t("updates.downloading", { version: update.latest, percent: Math.floor(update.percent || 0) });
  if (update.phase === "installing") return t("updates.installing");
  if (update.phase === "ready") return t("updates.ready", { version: update.latest });
  if (update.error) return t(`updates.errors.${update.error}`);
  return update.latest ? (update.available ? t("settings.rows.version.available", { version: update.latest }) : t("settings.rows.version.latest")) : "";
}

/**
 * 设置 › 关于 › 版本一行右侧的按钮（R7）：有新版本时墨底主按钮「下载更新 / 重启并更新」（下载中转圈、写「下载中…」）、
 * 灰底「更新内容」和「⋯」（「检查更新」收在菜单里）；已是最新时「检查更新」「更新日志」两个胶囊；
 * 网页版有新版本时是外链胶囊「下载 ↗」和「更新内容」。rowName：「⋯」读屏名称里的行名
 */
export function UpdateActions({ update, onChanged, rowName = "" }) {
  const [pending, setPending] = useState("");
  if (!update) return null;
  const ready = update.phase === "ready";
  const working = ["checking", "downloading", "installing"].includes(update.phase);
  const act = async (action) => {
    if (pending) return;
    setPending(action);
    try { await api(`/update/${action}`, { method: "POST", body: {} }); }
    catch (error) { toast(updateError(error), "err"); }
    finally { setPending(""); onChanged?.(); }
  };
  const checking = pending === "check" || update.phase === "checking";
  const notes = update.available
    ? html`<button type="button" class="btn sm" aria-haspopup="dialog" onClick=${() => openWhatsNew({ mode: "available", version: update.latest })}>${t("settings.rows.version.notes")}</button>`
    : html`<button type="button" class="btn sm" aria-haspopup="dialog" onClick=${() => openWhatsNew({ mode: "history", version: update.current })}>${t("updates.whatsNew.view")}</button>`;
  if (!update.supported) {
    return html`${update.available && html`<a class="btn sm" href=${update.downloadUrl} target="_blank" rel="noopener noreferrer">${t("settings.rows.version.download")}</a>`}${notes}`;
  }
  if (!update.available) {
    return html`<${Button} size="sm" loading=${checking} disabled=${!!pending || working} onClick=${() => act("check")}>${checking ? t("firstUse.checking") : t("updates.check")}<//>${notes}`;
  }
  const downloading = update.phase === "downloading" || pending === "download";
  const label = ready ? t("updates.restart") : downloading ? t("updates.downloadingAction") : update.phase === "installing" ? t("updates.installing") : t("updates.download");
  return html`
    <${Button} size="sm" variant="primary" loading=${downloading || update.phase === "installing" || pending === "install"} disabled=${!!pending || working || (ready && update.busy)} onClick=${() => act(ready ? "install" : "download")}>${label}<//>
    ${ready && update.busy && html`<span class="hint">${t("updates.busy")}</span>`}
    ${notes}
    ${!ready && html`<${MoreButton} name=${rowName} busy=${checking} disabled=${working && !checking} items=${[{ label: t("updates.check"), onSelect: () => act("check") }]} />`}
  `;
}
