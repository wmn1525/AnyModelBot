// 对话里的「存成技能」草稿卡（src/skills/drafts.ts）：生成中 → 等你确认 → 保存中 → 已保存 / 已更新；另有已取消、已过期、失败（带重试）。
// 不点「保存」或「更新」不写任何文件。处理过的卡片只留结果、没有按钮，重启后不变。按钮都是原生按钮：Tab 聚焦、回车触发；状态变化经 aria-live 播报。
import { useCallback, useEffect, useState } from "preact/hooks";
import { html, Button, Spinner } from "./ui.js";
import { api } from "../lib/api.js";
import { failed } from "../lib/store.js";
import { getLang, t } from "../lib/i18n.js";
import { copyExample, fillChat, useBotSkills } from "../lib/usage.js";
import { manageMySkills, openSkillDetail, sendChatTo } from "../lib/my-skills.js";

const FINAL = ["saved", "updated", "failed", "canceled", "expired"];

const sourceText = (src) => (src?.type === "github" ? t("mySkills.card.sourceGithub", { repo: `${src.owner}/${src.repo}` }) : src?.type === "mine" ? t("mySkills.card.sourceMine") : t("mySkills.card.sourceZip"));

/** 不能设成定时的原因（含电脑操作、生图生视频、后台任务的步骤；未验证）；能设时是空串 */
export function unschedulable(s) {
  if (!s) return "";
  if (s.blocked?.includes("computer") || s.blocked?.includes("media")) return t("mySkills.cant.media");
  if (s.blocked?.includes("background")) return t("mySkills.cant.background");
  if (s.unverified) return t("mySkills.cant.unverified");
  return "";
}

/** 一处个人信息：原文标黄，选「保留」或「运行时再问」（默认运行时再问） */
function PersonalItem({ p, busy, onKeep }) {
  return html`<li class="draft-personal-item">
    <mark>${p.text}</mark>
    <span class="draft-personal-seg" role="radiogroup" aria-label=${p.text}>
      <button type="button" role="radio" aria-checked=${p.keep} class=${p.keep ? "on" : ""} disabled=${busy} onClick=${() => !p.keep && onKeep(true)}>${t("mySkills.card.keep")}</button>
      <button type="button" role="radio" aria-checked=${!p.keep} class=${!p.keep ? "on" : ""} disabled=${busy} onClick=${() => p.keep && onKeep(false)}>${t("mySkills.card.ask")}</button>
    </span>
  </li>`;
}

/** 和已有的那个比：每处的删改，删掉的划线、加的高亮 */
function Diff({ hunks }) {
  return html`<div class="draft-diff">${hunks.slice(0, 12).map((h, i) => html`<div class="draft-hunk" key=${i}>
    ${h.del.map((l) => html`<div class="del">${l}</div>`)}${h.add.map((l) => html`<div class="add">${l}</div>`)}
  </div>`)}</div>`;
}

export function SkillDraftCard({ id }) {
  const [c, setC] = useState(null);
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [full, setFull] = useState(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const load = useCallback(() => api(`/skill-drafts/${encodeURIComponent(id)}`).then((d) => setC(d.draft)).catch(() => setGone(true)), [id]);
  useEffect(() => {
    load();
  }, [load]);
  // 生成中、保存中勤着看；等确认时也看（渠道里可能先回了「保存」，卡片还会过期）
  useEffect(() => {
    if (!c || FINAL.includes(c.state)) return;
    const timer = setInterval(load, c.state === "pending" ? 5000 : 1000);
    return () => clearInterval(timer);
  }, [c && c.state, load]);
  const done = !!c && (c.state === "saved" || c.state === "updated");
  const botSkills = useBotSkills(done && c.botExists ? c.botId : null);
  if (gone) return html`<div class="card skill-card done"><div class="q-detail">${t("mySkills.card.missing")}</div></div>`;
  if (!c || c.state === "drafting") return html`<div class="card skill-card draft-card" aria-live="polite"><span class="skill-card-line"><${Spinner} />${t("mySkills.card.drafting")}</span></div>`;

  const act = async (op, body = {}) => {
    setBusy(true);
    try {
      const r = await api(`/skill-drafts/${encodeURIComponent(id)}/${op}`, { method: "POST", body });
      setC(r.draft);
      setFull(null);
      return r.draft;
    } catch (e) {
      failed(e);
      load();
    } finally {
      setBusy(false);
    }
  };
  const instructions = async () => {
    const r = await api(`/skill-drafts/${encodeURIComponent(id)}/instructions`);
    return r.instructions;
  };
  const toggleFull = async () => {
    if (open) return setOpen(false);
    try {
      setFull(await instructions());
      setOpen(true);
    } catch (e) {
      failed(e);
    }
  };
  const startEdit = async () => {
    try {
      setEditing(await instructions());
    } catch (e) {
      failed(e);
    }
  };
  const finishEdit = async () => {
    const next = await act("edit", { text: editing });
    if (next) setEditing(null);
  };

  const d = c.draft;
  const pending = c.state === "pending" && !!d;
  const check = c.check;
  const fixes = d?.corrections || [];
  const askCount = (d?.personal || []).length;
  const head = html`<div class="q">${t("mySkills.card.title", { bot: c.botName })}</div>`;

  // —— 处理过的卡片：只留结果 ——
  if (done) {
    const r = c.result;
    const s = c.skill;
    const mine = botSkills?.find((x) => x.name === r.name);
    const state = !mine ? "loading" : mine.state === "waiting" || mine.state === "loading" ? mine.state : "active";
    const example = r.example;
    const cant = s?.exists ? unschedulable(s) : t("mySkills.card.gone");
    return html`<div class="card skill-card draft-card done" aria-live="polite">
      ${head}
      <div class="skill-card-result">${[c.state === "saved" ? t("mySkills.card.saved", { bot: c.botName }) : t("mySkills.card.updated", { title: r.title }), s?.exists !== false ? t(`mySkills.card.ready.${state}`) : ""].filter(Boolean).join(/^(zh|ja)/.test(getLang()) ? "" : " ")}</div>
      ${example && html`<p class="skill-card-try">${t("chat.use.try", { example })}</p>`}
      ${(s?.sends || []).map((app) => html`<p class="hint draft-sends">${t("mySkills.card.sends", { app })}</p>`)}
      ${c.botExists && html`<div class="actions">
        ${example && html`<${Button} onClick=${() => fillChat(c.botId, example)}>${t("chat.use.fill")}<//>`}
        ${example && html`<${Button} onClick=${() => copyExample(example)}>${t("chat.use.copy")}<//>`}
        <span class="grow"></span>
        ${s?.exists !== false && html`<${Button} onClick=${() => openSkillDetail({ botId: c.botId, name: r.name, kind: "mine" })}>${t("mySkills.card.view")}<//>`}
        <span title=${cant || undefined}><${Button} variant="primary" disabled=${!!cant} onClick=${() => sendChatTo(c.botId, t("mySkills.scheduleAsk", { title: r.title }))}>${t("mySkills.card.schedule")}<//></span>
      </div>`}
      ${cant && s?.exists && html`<p class="hint draft-cant">${cant}</p>`}
    </div>`;
  }
  if (c.state === "canceled" || c.state === "expired") {
    return html`<div class="card skill-card draft-card done" aria-live="polite">${head}<div class="skill-card-result">${t(c.state === "canceled" ? "mySkills.card.canceled" : c.superseded ? "mySkills.card.superseded" : "mySkills.card.expired")}</div></div>`;
  }
  if (c.state === "failed") {
    const code = c.error?.code;
    const retry = () => (code === "draft_failed" ? sendChatTo(c.botId, "/skill") : act("retry"));
    return html`<div class="card skill-card draft-card done" aria-live="polite">
      ${head}
      <div class="skill-card-result warn">${t(code === "mine_full" ? "mySkills.card.full" : code === "draft_failed" ? "mySkills.card.draftFailed" : "mySkills.card.saveFailed")}</div>
      <div class="actions">
        ${code === "mine_full" && c.botExists && html`<${Button} onClick=${() => manageMySkills(c.botId)}>${t("mySkills.card.manage")}<//>`}
        <${Button} disabled=${busy} onClick=${retry}>${t("mySkills.card.retry")}<//>
      </div>
    </div>`;
  }
  if (c.state === "saving") return html`<div class="card skill-card draft-card" aria-live="polite">${head}<span class="skill-card-line"><${Spinner} />${t("mySkills.card.saving")}</span></div>`;

  // —— 编辑原文 ——
  if (editing !== null) {
    return html`<div class="card skill-card draft-card" aria-live="polite">
      ${head}
      <label class="draft-edit"><span class="t-label">${t("mySkills.card.editTitle")}</span>
        <textarea class="field mono" rows="14" value=${editing} onInput=${(e) => setEditing(e.target.value)} spellcheck="false"></textarea></label>
      <p class="hint">${t("mySkills.card.editHint")}</p>
      <div class="actions"><span class="grow"></span>
        <${Button} disabled=${busy} onClick=${() => setEditing(null)}>${t("mySkills.card.cancel")}<//>
        <${Button} variant="primary" loading=${busy} onClick=${finishEdit}>${t("mySkills.card.done")}<//>
      </div>
    </div>`;
  }

  // —— 等你确认 ——
  const problems = [
    check && check.secrets > 0 && t("mySkills.card.blockedSecrets", { count: check.secrets }),
    check && !check.name && t("mySkills.card.badName"),
    check && !check.description && t("mySkills.card.badDescription"),
    check && check.tooLong && t("mySkills.card.tooLong"),
  ].filter(Boolean);
  const fullNew = c.full && !d.same;
  const canSave = !!check?.ok && !busy;
  const changes = (c.diff || []).length;
  return html`<div class="card skill-card draft-card" aria-live="polite">
    ${head}
    ${d.unfinished && html`<p class="skill-card-hint draft-warn">${t("mySkills.card.unfinished", { step: d.unfinished })}</p>`}
    ${d.same && html`<div class="draft-same"><b>${t("mySkills.card.same", { title: d.same.title })}</b>${changes > 0 && html`<span class="hint">${t("mySkills.card.changes", { count: changes })}</span>`}${changes > 0 && html`<${Diff} hunks=${c.diff} />`}</div>`}
    <div class="skill-card-body">
      <div class="draft-name"><span class="draft-title">${d.title}</span><span class="skill-file">${d.name}</span></div>
      ${d.description && html`<div class="draft-sec"><div class="t-label">${t("mySkills.card.when")}</div><div class="skill-card-desc">${d.description}</div></div>`}
      ${!d.edited && d.steps.length > 0 && html`<div class="draft-sec"><div class="t-label">${t("mySkills.card.steps")}</div><ol class="draft-steps">${d.steps.map((x, i) => html`<li key=${i}>${x}</li>`)}</ol></div>`}
      ${!d.edited && fixes.length > 0 && html`<div class="draft-sec"><div class="t-label">${t("mySkills.card.corrections")}</div>
        <ul class="draft-fixes">${fixes.map((f, i) => html`<li key=${i}><label class="draft-fix"><input type="checkbox" checked=${f.on} disabled=${busy} onChange=${(e) => act("correction", { index: i, on: e.target.checked })} />
          <span>${f.quote && html`<span class="draft-quote">${t("mySkills.card.said", { quote: f.quote })}</span>`}<span class=${f.on ? "" : "off"}>${f.rule}</span></span></label></li>`)}</ul></div>`}
      ${d.apps.length > 0 && html`<div class="draft-sec"><div class="t-label">${t("mySkills.card.apps")}</div><div class="skill-card-meta">${d.apps.map((a) => html`<span key=${a.key + (a.alias || "")}>${a.alias ? t("mySkills.card.appAlias", { app: a.name, alias: a.alias }) : a.name}</span>`)}</div></div>`}
      ${d.uses.length > 0 && html`<div class="draft-sec"><div class="t-label">${t("mySkills.card.skills")}</div><div class="skill-card-meta">${d.uses.map((u) => html`<span key=${u.name}>${u.title || u.name} · ${sourceText(u.source)}</span>`)}</div></div>`}
      ${d.example && html`<div class="draft-sec"><div class="t-label">${t("mySkills.card.tryLabel")}</div><p class="skill-card-try">${d.example}</p></div>`}
      ${d.secrets > 0 && html`<p class="hint draft-secrets">${t("mySkills.card.secrets", { count: d.secrets })}</p>`}
      ${askCount > 0 && html`<div class="draft-sec draft-personal"><div class="t-label">${t("mySkills.card.personal", { count: askCount })}</div>
        <ul>${d.personal.map((p) => html`<${PersonalItem} key=${p.id} p=${p} busy=${busy} onKeep=${(keep) => act("personal", { id: p.id, keep })} />`)}</ul></div>`}
      <button type="button" class="text skill-card-more" aria-expanded=${open} onClick=${toggleFull}>${open ? t("mySkills.card.hideInstructions") : t("mySkills.card.showInstructions")}</button>
      ${open && full !== null && html`<pre class="skill-card-full selectable">${full}</pre>`}
    </div>
    ${problems.map((p) => html`<p class="skill-card-hint warn draft-problem">${p}</p>`)}
    ${fullNew && html`<p class="skill-card-hint warn">${t("mySkills.card.full")}</p>`}
    ${pending && html`<div class="skill-card-foot">
      <span class="hint">${t("mySkills.card.saveTo", { bot: c.botName })}</span>
      <span class="actions">
        <${Button} disabled=${busy} onClick=${startEdit}>${t("mySkills.card.edit")}<//>
        <${Button} disabled=${busy} onClick=${() => act("cancel")}>${t("mySkills.card.cancel")}<//>
        ${d.same
          ? html`<${Button} disabled=${!canSave || c.full} onClick=${() => act("copy")}>${t("mySkills.card.saveNew")}<//><${Button} variant="primary" disabled=${!canSave} onClick=${() => act("update")}>${t("mySkills.card.update")}<//>`
          : html`<${Button} variant="primary" disabled=${!canSave || fullNew} onClick=${() => act("save")}>${t("mySkills.card.save")}<//>`}
      </span>
    </div>`}
    ${pending && fullNew && c.botExists && html`<div class="actions"><${Button} onClick=${() => manageMySkills(c.botId)}>${t("mySkills.card.manage")}<//></div>`}
  </div>`;
}
