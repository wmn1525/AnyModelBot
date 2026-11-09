import { useState } from "preact/hooks";
import { html } from "./ui.js";
import { api } from "../lib/api.js";
import { toast } from "../lib/store.js";
import { t } from "../lib/i18n.js";
import { openWhatsNew } from "./whats-new.js";

export const updateError = (error) => t(`updates.errors.${error?.data?.code || "failed"}`);

export function updateDescription(update) {
  if (!update) return "";
  if (update.phase === "checking") return t("updates.checking");
  if (update.phase === "downloading") return t("updates.downloading", { version: update.latest, percent: Math.floor(update.percent || 0) });
  if (update.phase === "installing") return t("updates.installing");
  if (update.phase === "ready") return t("updates.ready", { version: update.latest });
  if (update.error) return t(`updates.errors.${update.error}`);
  return update.latest ? (update.available ? t("settings.rows.version.available", { version: update.latest }) : t("settings.rows.version.latest")) : "";
}

export function UpdateActions({ update, onChanged }) {
  const [pending, setPending] = useState(false);
  if (!update) return null;
  const ready = update.phase === "ready";
  const working = ["checking", "downloading", "installing"].includes(update.phase);
  const act = async (action) => {
    if (pending) return;
    setPending(true);
    try { await api(`/update/${action}`, { method: "POST", body: {} }); }
    catch (error) { toast(updateError(error), "err"); }
    finally { setPending(false); onChanged?.(); }
  };
  return html`
    ${update.supported
      ? html`${update.available && html`<button type="button" class="text" disabled=${pending || working || (ready && update.busy)} onClick=${() => act(ready ? "install" : "download")}>
          ${t(ready ? "updates.restart" : update.phase === "downloading" ? "updates.downloadingAction" : update.phase === "installing" ? "updates.installing" : "updates.download")}</button>`}
        ${!ready && html`<button type="button" class="text" disabled=${pending || working} onClick=${() => act("check")}>${t("updates.check")}</button>`}
        ${ready && update.busy && html`<span class="hint">${t("updates.busy")}</span>`}`
      : update.available && html`<a class="text" href=${update.downloadUrl} target="_blank" rel="noopener noreferrer">${t("settings.rows.version.download")}</a>`}
    ${update.available
      ? html`<button type="button" class="text" aria-haspopup="dialog" onClick=${() => openWhatsNew({ mode: "available", version: update.latest })}>${t("settings.rows.version.notes")}</button>`
      : html`<button type="button" class="text" aria-haspopup="dialog" onClick=${() => openWhatsNew({ mode: "history", version: update.current })}>${t("updates.whatsNew.view")}</button>`}
  `;
}
