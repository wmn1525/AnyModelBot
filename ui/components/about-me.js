// 关于我（PRD 2026-11-15 R1–R4）：设置 › 关于我（只用来看和改错）、对话里回复下面的提示行（✓ 已记到关于我 · 撤销）、
// 敏感信息的确认卡（记下 / 只这次用）、你改过的句子的建议卡（改成这样 / 保持不变）。所有用户都能用，不需要登录。
import { useEffect, useRef, useState } from "preact/hooks";
import { html, Icon, Switch, Skeleton, Button } from "./ui.js";
import { api } from "../lib/api.js";
import { confirmSheet, failed, saved, toast } from "../lib/store.js";
import { fmtSep } from "../lib/format.js";
import { t } from "../lib/i18n.js";

/** 来源那一行：{机器人}从对话里记下 · {时间} / 你改过 / 原团队记忆 · {时间} */
function sourceText(l) {
  if (l.source === "team") return t("aboutMe.sourceTeam", { time: fmtSep(l.createdAt) });
  if (l.source === "you") return t("aboutMe.sourceYou", { time: fmtSep(l.updatedAt) });
  return t("aboutMe.sourceChat", { bot: l.botName || "?", time: fmtSep(l.updatedAt) });
}

/** 一行可编辑的句子（改、自己写一句） */
function LineEditor({ value = "", placeholder, onSave, onCancel }) {
  const [v, setV] = useState(value);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  useEffect(() => requestAnimationFrame(() => ref.current?.focus()), []);
  const save = async () => {
    if (!v.trim() || busy) return;
    setBusy(true);
    try {
      await onSave(v.trim());
    } finally {
      setBusy(false);
    }
  };
  return html`<div class="aboutme-edit">
    <input ref=${ref} class="field" value=${v} maxlength="300" placeholder=${placeholder} onInput=${(e) => setV(e.target.value)}
      onKeyDown=${(e) => { if (e.isComposing || e.keyCode === 229) return; if (e.key === "Enter") save(); if (e.key === "Escape") { e.stopPropagation(); onCancel(); } }} />
    <${Button} size="sm" variant="primary" disabled=${!v.trim() || busy} onClick=${save}>${t("aboutMe.save")}<//>
    <${Button} size="sm" onClick=${onCancel}>${t("aboutMe.cancel")}<//>
  </div>`;
}

/** 变更历史的一条：谁、什么时候、记下 / 改 / 删除了什么；能撤销的带「撤销」，撤销过的写「已撤销」 */
function HistoryRow({ h, onUndo }) {
  const who = h.by === "you" ? t("aboutMe.byYou") : h.botName || "?";
  const what = t(h.op === "add" ? "aboutMe.opAdd" : h.op === "edit" ? "aboutMe.opEdit" : "aboutMe.opDelete", { text: h.text });
  return html`<div class="row compact aboutme-history-row">
    <div class="who"><div class="sub">${fmtSep(h.at)} · ${who}</div><div class="name wrap">${what}</div></div>
    <div class="ctl">${h.undone ? html`<span class="hint">${t("aboutMe.undone")}</span>` : h.undoable ? html`<button type="button" class="text" onClick=${() => onUndo(h)}>${t("aboutMe.undo")}</button>` : ""}</div>
  </div>`;
}

/** 设置 › 关于我 */
export function AboutMePane() {
  const [d, setD] = useState(null);
  const [editing, setEditing] = useState("");
  const [adding, setAdding] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const load = () => api("/about-me").then(setD).catch(failed);
  useEffect(() => {
    load();
  }, []);
  const call = async (path, opts, quiet = false) => {
    try {
      const r = await api(path, opts);
      setD((v) => ({ ...v, ...r }));
      if (!quiet) saved();
      return true;
    } catch (e) {
      failed(e);
      return false;
    }
  };
  const remove = async (l) => {
    if (!(await confirmSheet({ title: t("aboutMe.deleteTitle"), body: t("aboutMe.deleteBody"), confirmLabel: t("aboutMe.delete"), danger: true }))) return;
    await call(`/about-me/lines/${encodeURIComponent(l.id)}`, { method: "DELETE" });
  };
  const undo = async (h) => {
    if (await call(`/about-me/history/${encodeURIComponent(h.id)}/undo`, { method: "POST", body: {} }, true)) toast(t("aboutMe.undoneLine"));
  };
  if (!d) return html`<div class="list"><div class="row"><${Skeleton} w="50%" /></div><div class="row"><${Skeleton} w="40%" /></div></div>`;
  const latest = d.history[0];
  return html`<div class="aboutme">
    <p class="set-note">${t("aboutMe.desc")}</p>
    ${d.full && !d.notice && html`<div class="collab-warn">${t("aboutMe.fullNote")}</div>`}
    ${d.notice && html`<div class="aboutme-notice" role="status">
      <div class="who"><div class="name">${t("aboutMe.notice")}</div><div class="sub">${t("aboutMe.noticeSub")}${d.full ? ` ${t("aboutMe.fullNote")}` : ""}</div></div>
      <button type="button" class="icon-btn" title=${t("aboutMe.noticeClose")} aria-label=${t("aboutMe.noticeClose")} onClick=${() => call("/about-me/settings", { method: "PUT", body: { notice: false } }, true)}><${Icon} name="close" size="sm" /></button>
    </div>`}
    ${!d.lines.length && !adding
      ? html`<div class="aboutme-empty">
          <div class="aboutme-empty-icon"><${Icon} name="user" size="lg" /></div>
          <div class="name">${t("aboutMe.emptyTitle")}</div>
          <div class="sub">${t("aboutMe.emptyBody")}</div>
        </div>`
      : html`<div class="list aboutme-lines">
          ${d.lines.map((l) =>
            editing === l.id
              ? html`<div class="row" key=${l.id}><${LineEditor} value=${l.text} onCancel=${() => setEditing("")}
                  onSave=${async (text) => (await call(`/about-me/lines/${encodeURIComponent(l.id)}`, { method: "PUT", body: { text } })) && setEditing("")} /></div>`
              : html`<div class="row aboutme-line" key=${l.id}>
                  <div class="who">
                    <div class="name wrap selectable">${l.text}</div>
                    <div class="sub">${l.locked && html`<span class="aboutme-lock" title=${t("aboutMe.locked")}><${Icon} name="lock" size="xs" /></span>`}${sourceText(l)}${l.locked ? ` · ${t("aboutMe.locked")}` : ""}</div>
                  </div>
                  <div class="ctl">
                    <button type="button" class="text" onClick=${() => setEditing(l.id)}>${t("aboutMe.edit")}</button>
                    <button type="button" class="text danger" onClick=${() => remove(l)}>${t("aboutMe.delete")}</button>
                  </div>
                </div>`,
          )}
          ${adding && html`<div class="row"><${LineEditor} placeholder=${t("aboutMe.addPlaceholder")} onCancel=${() => setAdding(false)}
            onSave=${async (text) => (await call("/about-me/lines", { method: "POST", body: { text } })) && setAdding(false)} /></div>`}
        </div>`}
    ${!adding && html`<button type="button" class="text aboutme-add" onClick=${() => setAdding(true)}>${t("aboutMe.addLine")}</button>`}
    <div class="list">
      <div class="row" id="set-aboutme-switch">
        <div class="who"><div class="name">${t("aboutMe.switch")}</div><div class="sub">${t("aboutMe.switchSub")}</div></div>
        <div class="ctl"><${Switch} label=${t("aboutMe.switch")} value=${d.enabled} onChange=${(v) => call("/about-me/settings", { method: "PUT", body: { enabled: v } })} /></div>
      </div>
    </div>
    <div class="set-part aboutme-history-head">
      <button type="button" class="text" aria-expanded=${showHistory} onClick=${() => setShowHistory((v) => !v)}>${t("aboutMe.history")} <${Icon} name=${showHistory ? "chevDown" : "chevRight"} size="xs" /></button>
      ${latest && !showHistory && html`<span class="hint">${t("aboutMe.latest", { who: latest.by === "you" ? t("aboutMe.byYou") : latest.botName, time: fmtSep(latest.at) })}</span>`}
    </div>
    ${showHistory && html`<p class="set-note">${t("aboutMe.historyNote")}</p>
      <div class="list">
        ${d.history.length ? d.history.map((h) => html`<${HistoryRow} key=${h.id} h=${h} onUndo=${undo} />`) : html`<div class="row"><span class="hint">${t("aboutMe.historyEmpty")}</span></div>`}
      </div>`}
  </div>`;
}

const CATEGORY = { address: "aboutMe.categoryAddress", phone: "aboutMe.categoryPhone", email: "aboutMe.categoryEmail" };

/**
 * 对话里回复下面那一行：机器人记下、改了、删了关于我的哪一句，带「撤销」（不限时间，只要这一句还是那样）；
 * 撤销过的换成「已撤销，关于我恢复为原来的样子」
 */
export function AboutMeLine({ change, onChanged }) {
  const [busy, setBusy] = useState(false);
  const text = change.op === "delete" ? t("aboutMe.removed", { line: change.text }) : change.op === "edit" ? t("aboutMe.changed", { line: change.text }) : t("aboutMe.added", { line: change.text });
  if (change.undone) return html`<div class="aboutme-hint done">${t("aboutMe.undoneLine")}</div>`;
  const undo = async () => {
    setBusy(true);
    try {
      await api("/about-me/undo", { method: "POST", body: { id: change.id } });
      onChanged?.();
    } catch (e) {
      failed(e);
    }
    setBusy(false);
  };
  return html`<div class="aboutme-hint"><span class="aboutme-hint-text">${text}</span>${change.undoable && html`<button type="button" class="text" disabled=${busy} onClick=${undo}>${t("aboutMe.undo")}</button>`}</div>`;
}

/** 确认卡（地址、电话、邮箱：记下 / 只这次用）和建议卡（你改过的句子：改成这样 / 保持不变） */
export function AboutMeCard({ proposal: p, change, onChanged }) {
  const [busy, setBusy] = useState(false);
  const decide = async (accept) => {
    setBusy(true);
    try {
      await api(`/about-me/proposals/${encodeURIComponent(p.id)}`, { method: "POST", body: { accept } });
    } catch (e) {
      failed(e);
    }
    setBusy(false);
    onChanged?.();
  };
  // 有了决定：确认卡和建议卡收成一行结果（记下的、改了的仍能撤销）
  if (p.status !== "pending") {
    if (p.status === "stale") return html`<div class="aboutme-hint done">${t("aboutMe.stale")}</div>`;
    if (p.status === "once") return html`<div class="aboutme-hint done">${t("aboutMe.onceResult")}</div>`;
    if (p.status === "kept") return html`<div class="aboutme-hint done">${t("aboutMe.keptResult")}</div>`;
    if (change) return html`<${AboutMeLine} change=${{ ...change, op: p.kind === "change" ? "edit" : change.op }} onChanged=${onChanged} />`;
    return html`<div class="aboutme-hint done">${t("aboutMe.addedResult")}</div>`;
  }
  if (p.kind === "sensitive")
    return html`<div class="card aboutme-card">
      <div class="q">${t("aboutMe.sensitiveTitle")}</div>
      <div class="aboutme-quote">${p.text}</div>
      <div class="q-detail">${t("aboutMe.sensitiveBody", { category: t(CATEGORY[p.category] || CATEGORY.address) })}</div>
      <div class="actions">
        <button type="button" class="btn primary" disabled=${busy} onClick=${() => decide(true)}>${t("aboutMe.add")}</button>
        <button type="button" class="btn" disabled=${busy} onClick=${() => decide(false)}>${t("aboutMe.once")}</button>
      </div>
    </div>`;
  return html`<div class="card aboutme-card">
    <div class="q">${t("aboutMe.changeTitle")}</div>
    <div class="q-detail">${t("aboutMe.changeNow", { text: p.old })}</div>
    <div class="aboutme-to">${t("aboutMe.changeTo", { text: p.text })}</div>
    <div class="q-detail">${t("aboutMe.changeBody")}</div>
    <div class="actions">
      <button type="button" class="btn primary" disabled=${busy} onClick=${() => decide(true)}>${t("aboutMe.changeIt")}</button>
      <button type="button" class="btn" disabled=${busy} onClick=${() => decide(false)}>${t("aboutMe.keepIt")}</button>
    </div>
  </div>`;
}

/**
 * 关于我在对话里的东西按回复挂好：itemId → [{ change } | { proposal, change }]。机器人做的变更、出的卡挂在那一轮的回复下面；
 * 卡片上点出来的变更、撤销产生的变更不单独显示（卡片和原来那一行自己会变）
 */
export function aboutMeByItem(data, items, replyAfter) {
  const map = new Map();
  if (!data) return map;
  const all = [...(data.changes || []), ...(data.proposals || []).map((p) => ({ ...p, proposal: true }))].sort((a, b) => a.at - b.at);
  const changes = new Map((data.changes || []).map((c) => [c.id, c]));
  const fromCards = new Set((data.proposals || []).map((p) => p.changeId).filter(Boolean));
  for (const x of all) {
    if (!x.proposal && (x.undoOf || fromCards.has(x.id) || x.by !== "bot")) continue;
    const id = replyAfter(items, x.at);
    if (!id) continue;
    map.set(id, [...(map.get(id) || []), x.proposal ? { proposal: x, change: x.changeId ? changes.get(x.changeId) : undefined } : { change: x }]);
  }
  return map;
}

/** 回复下面的那几行 / 卡 */
export function AboutMeNotes({ list, onChanged }) {
  if (!list?.length) return null;
  return html`<div class="aboutme-notes">${list.map((x) => (x.proposal ? html`<${AboutMeCard} key=${x.proposal.id} proposal=${x.proposal} change=${x.change} onChanged=${onChanged} />` : html`<${AboutMeLine} key=${x.change.id} change=${x.change} onChanged=${onChanged} />`))}</div>`;
}
