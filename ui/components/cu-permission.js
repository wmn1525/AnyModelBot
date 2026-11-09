// 电脑操作的系统权限卡片（macOS 桌面版，第 18 项）：机器人要用电脑操作、系统还没给本应用对应权限时，
// 宿主拦下工具调用并结束这一轮，这里按实际缺的那几项说明用途、给出系统原生请求和对应的系统设置入口。
// 只在真的被拦下时出现；用户可以"稍后"收起，不影响普通聊天；授权后可以重新发送任务。
import { useEffect, useState } from "preact/hooks";
import { html, Notice } from "./ui.js";
import { api } from "../lib/api.js";
import { failed } from "../lib/store.js";
import { allDrafts } from "../lib/chat-view.js";
import { t } from "../lib/i18n.js";

export function CuPermissionCard({ botId, onRetry }) {
  const [v, setV] = useState(null);
  const [busy, setBusy] = useState("");
  const load = () => api("/computer-use/permissions").then(setV).catch(() => {});
  useEffect(() => {
    load();
    // 用户在系统设置里打开开关后自己回来：隔几秒看一次，不用手动刷新
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, []);
  if (!v || !v.supported) return null;
  const blocked = v.blocked[botId];
  if (!blocked) return null;
  const missing = blocked.missing.filter((k) => v.status[k] !== "granted");
  const act = async (path, kind) => {
    setBusy(`${path}-${kind}`);
    try {
      setV(await api(`/computer-use/permissions/${path}`, { method: "POST", body: { kind } }));
    } catch (e) {
      failed(e);
    } finally {
      setBusy("");
    }
  };
  const dismiss = () => api(`/computer-use/permissions/blocked/${encodeURIComponent(botId)}`, { method: "DELETE" }).then(setV).catch(() => {});
  // 系统要求重新打开才生效：聊天和任务都在本机存着，输入框里没发出的草稿交给后端暂存一次，重新打开后放回去
  const relaunch = () => api("/computer-use/permissions/relaunch", { method: "POST", body: { drafts: allDrafts() } }).catch(failed);
  return html`<div class="cu-perm">
    <${Notice} tone="amber">
      <span class="err-main">${missing.length ? t("firstUse.cu.title") : t("firstUse.cu.granted")}</span>
      ${missing.map((k) => html`<span class="cu-perm-row" key=${k}>
        <span class="cu-perm-what"><b>${t(`firstUse.cu.${k}`)}</b><span class="hint">${t(`firstUse.cu.${k}Why`)}</span></span>
        <span class="cluster">
          <button type="button" class="btn sm" disabled=${!!busy} onClick=${() => act("request", k)}>${t("firstUse.cu.request")}</button>
          <button type="button" class="btn sm" disabled=${!!busy} onClick=${() => act("open", k)}>${t("firstUse.cu.openSettings")}</button>
        </span>
      </span>`)}
      ${missing.length > 0 && html`<span class="hint">${t("firstUse.cu.steps", { items: missing.map((k) => t(`firstUse.cu.${k}`)).join(t("firstUse.cu.sep")) })}</span>`}
      ${v.restartSuggested && html`<span class="hint">${t("firstUse.cu.restart")}</span>`}
      <span class="cluster cu-perm-actions">
        ${!missing.length && html`<button type="button" class="btn primary sm" onClick=${() => { dismiss(); onRetry?.(); }}>${t("firstUse.cu.retry")}</button>`}
        ${missing.length > 0 && html`<button type="button" class="btn sm" onClick=${load}>${t("firstUse.cu.recheck")}</button>`}
        ${v.restartSuggested && html`<button type="button" class="btn sm" onClick=${relaunch}>${t("firstUse.cu.relaunch")}</button>`}
        <button type="button" class="text" onClick=${dismiss}>${t("firstUse.cu.later")}</button>
      </span>
    <//>
  </div>`;
}
