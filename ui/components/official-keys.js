// 官方 API Key：用户自己在模型厂商那里申请的 Key（src/providers/official.ts）。引导页和设置页共用填 Key 的表单。
import { useEffect, useRef, useState } from "preact/hooks";
import { html, MenuButton, Spinner } from "./ui.js";
import { api } from "../lib/api.js";
import { t } from "../lib/i18n.js";

/** 显示用的名字：同一家分国内和海外时带上地区 */
export const officialName = (p) => (p.region ? t("official.named", { name: p.name, region: t(`official.region.${p.region}`) }) : p.name);

/** 填 Key 的表单：校验通过（厂商列得出模型）才保存；不通过时显示原因，什么都不改 */
export function OfficialKeyForm({ provider, autoFocus = true, onConnected }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const input = useRef(null);
  // 换了一家：上一家的 Key 和错误都不留
  useEffect(() => {
    setKey("");
    setErr("");
    if (autoFocus) input.current?.focus();
  }, [provider.id]);
  const name = officialName(provider);
  const submit = async (e) => {
    e.preventDefault();
    if (!key.trim() || busy) return;
    setBusy(true);
    setErr("");
    try {
      const r = await api(`/official/${encodeURIComponent(provider.id)}`, { method: "PUT", body: { key: key.trim() } });
      setKey("");
      await onConnected(r);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };
  return html`<form class="login-manual official-form" onSubmit=${submit}>
    <input ref=${input} class="field mono" type="password" autocomplete="off" spellcheck="false" placeholder=${t("official.placeholder", { name })} aria-label=${t("official.keyLabel", { name })}
      value=${key} readonly=${busy} aria-invalid=${!!err} onInput=${(e) => { setKey(e.target.value); setErr(""); }} />
    ${err && html`<div class="err-text" role="alert">${err}</div>`}
    <button type="submit" class="btn primary lg block" disabled=${!key.trim() || busy}>${busy ? html`<${Spinner} /> ${t("official.connecting")}` : t("official.connect")}</button>
    <p class="hint">${t("official.privacy", { name })}</p>
    <div class="login-links"><a class="text" href=${provider.keysUrl} target="_blank" rel="noopener noreferrer">${t("official.getKey")}</a></div>
  </form>`;
}

/** 引导页：不想用 OKINTO 账户时，选一家、填 Key 直接开始 */
export function OfficialStart({ onConnected, onBack, accountLogin }) {
  const [list, setList] = useState(null);
  const [cur, setCur] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    api("/official")
      .then((r) => {
        setList(r.providers);
        setCur(r.providers[0]?.id || "");
      })
      .catch((e) => setErr(e.message));
  }, []);
  const provider = list && list.find((p) => p.id === cur);
  return html`<div class="login-cta">
    ${err && html`<div class="err-text" role="alert">${err}</div>`}
    ${!list && !err && html`<div class="login-wait"><${Spinner} /></div>`}
    ${provider && html`<${MenuButton} label=${t("official.choose")} value=${cur} onChange=${setCur} align="left" options=${list.map((p) => [p.id, officialName(p)])} />
      <${OfficialKeyForm} provider=${provider} onConnected=${onConnected} />`}
    ${accountLogin ? html`<section class="own-key-login"><h2 class="t-label">${t("firstUse.noKey")}</h2>${accountLogin}</section>`
      : onBack && html`<div class="login-links"><button type="button" class="text" onClick=${onBack}>${t("official.backToLogin")}</button></div>`}
  </div>`;
}
