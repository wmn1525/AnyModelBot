import { useEffect, useRef, useState } from "preact/hooks";
import { html, Button, Sheet, Switch, Skeleton } from "./ui.js";
import { api, uploadSkillZip } from "../lib/api.js";
import { confirmSheet, failed, saved } from "../lib/store.js";
import { t, has } from "../lib/i18n.js";

const errorText = (e) => has(`botSettings.skills.errors.${e?.data?.code}`) ? t(`botSettings.skills.errors.${e.data.code}`) : e?.message || t("common.error");

export function Skills({ botId }) {
  const base = `/bots/${encodeURIComponent(botId)}/skills`;
  const [skills, setSkills] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState(null);
  const input = useRef(null);
  const working = useRef(false);
  useEffect(() => {
    const abort = new AbortController();
    api(base, { signal: abort.signal }).then((r) => setSkills(r.skills)).catch((e) => { if (!abort.signal.aborted) setError(errorText(e)); });
    return () => abort.abort();
  }, [botId]);
  const run = async (fn) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try { await fn(); } catch (e) { failed(errorText(e)); }
    finally { working.current = false; setBusy(false); }
  };
  const reload = () => run(async () => { const r = await api(base); setSkills(r.skills); setError(""); });
  const select = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) return failed(t("botSettings.skills.errors.too_large"));
    run(async () => { const r = await uploadSkillZip(base + "/preview", file); setDetail({ ...r.skill, file }); });
  };
  const install = () => run(async () => {
    const q = detail.replaces ? `?replaces=${encodeURIComponent(detail.replaces)}` : "";
    const r = await uploadSkillZip(base + q, detail.file);
    setSkills(r.skills);
    setError("");
    setDetail(null);
    saved();
  });
  const toggle = (skill, enabled) => run(async () => {
    const r = await api(`${base}/${encodeURIComponent(skill.name)}`, { method: "PUT", body: { enabled } });
    setSkills(r.skills);
    saved();
  });
  const remove = (skill) => run(async () => {
    if (!await confirmSheet({ title: t("botSettings.skills.removeTitle", { name: skill.name }), body: t("botSettings.skills.removeBody"), confirmLabel: t("common.delete"), danger: true })) return;
    const r = await api(`${base}/${encodeURIComponent(skill.name)}`, { method: "DELETE" });
    setSkills(r.skills);
    saved();
  });
  const view = (skill) => run(async () => { const r = await api(`${base}/${encodeURIComponent(skill.name)}`); setDetail(r.skill); });
  const close = () => { if (!working.current) setDetail(null); };
  return html`
    <div class="list-head" id="bot-skills">${t("botSettings.skills.head")}</div>
    <p class="set-note">${t("botSettings.skills.note")}</p>
    <div class="list skill-list" aria-busy=${busy}>
      <div class="row">
        <div class="who"><div class="name">${t("botSettings.skills.import")}</div><div class="sub">${t("botSettings.skills.importSub")}</div></div>
        <div class="ctl"><input type="file" accept=".zip,application/zip" hidden ref=${input} onChange=${select} />
          <${Button} disabled=${busy || skills === null} onClick=${() => input.current?.click()}>${busy ? t("common.loading") : t("botSettings.skills.import")}<//></div>
      </div>
      ${error ? html`<div class="row"><div class="who">${error}</div><${Button} disabled=${busy} onClick=${reload}>${t("common.retry")}<//></div>`
        : skills === null ? html`<div class="row"><${Skeleton} w="60%" /></div>`
        : !skills.length ? html`<div class="row"><div class="sub">${t("botSettings.skills.empty")}</div></div>`
        : skills.map((skill) => html`<div class="row" key=${skill.name}>
          <div class="who"><div class="name">${skill.name}</div><div class="sub">${skill.description}</div></div>
          <div class="ctl">
            <button type="button" class="text" disabled=${busy} onClick=${() => view(skill)}>${t("common.view")}</button>
            <button type="button" class="text danger" disabled=${busy} onClick=${() => remove(skill)}>${t("common.delete")}</button>
            <${Switch} label=${t("botSettings.skills.enable", { name: skill.name })} value=${skill.enabled} disabled=${busy} onChange=${(v) => toggle(skill, v)} />
          </div>
        </div>`)}
    </div>
    ${detail && html`<${Sheet} title=${detail.name} onClose=${close}>
      <p class="body">${detail.description}</p>
      <p class="body skill-meta">${t("botSettings.skills.files", { count: detail.files, size: Math.ceil(detail.bytes / 1024) })}</p>
      ${detail.file && html`<p class="body">${t(detail.replaces ? "botSettings.skills.replaceBody" : "botSettings.skills.addBody")}</p>`}
      <details class="skill-instructions"><summary>${t("botSettings.skills.instructions")}</summary><pre>${detail.instructions}</pre></details>
      <div class="actions">
        <${Button} disabled=${busy} data-autofocus onClick=${close}>${t(detail.file ? "common.cancel" : "common.close")}<//>
        ${detail.file && html`<${Button} variant="primary" disabled=${busy} onClick=${install}>${t(detail.replaces ? "botSettings.skills.replace" : "botSettings.skills.add")}<//>`}
      </div>
    <//>`}`;
}
