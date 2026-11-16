import { useEffect, useRef, useState } from "preact/hooks";
import { html, Icon, Button, Sheet, Seg, Spinner } from "../components/ui.js";
import { RuleEditor, RuleRow } from "../components/rules.js";
import { failed, useStore } from "../lib/store.js";
import { loadRules, openScheduled, scheduled, ruleFocus, RULES_CHANGED } from "../lib/scheduled.js";
import { libraryFrom, openLibrary } from "../lib/routines.js";
import { RoutineSuggestions, TryLibrary } from "./routines.js";
import { sideLayout, keyOfBot } from "../lib/sections.js";
import { t, useLang } from "../lib/i18n.js";
import { BotAvatar } from "../components/avatar.js";

export const newRule = () => window.dispatchEvent(new Event("amb-new-rule"));
export function ScheduledSync() {
  const lang = useLang();
  useEffect(() => {
    const load = () => loadRules().catch(() => {});
    load(); const timer = setInterval(load, 5000);
    window.addEventListener(RULES_CHANGED, load);
    return () => { clearInterval(timer); window.removeEventListener(RULES_CHANGED, load); };
  }, [lang]);
  return null;
}
export function ScheduledButton({ active }) {
  const { rules } = useStore(scheduled);
  const count = rules.filter((r) => r.needsAttention).length;
  const label = t(count === 1 ? "scheduled.attentionOne" : count ? "scheduled.attention" : "scheduled.title", { count });
  return html`<button type="button" class=${`nav-item scheduled-nav${active ? " sel" : ""}`} title=${label} aria-label=${label} aria-current=${active ? "page" : undefined} onClick=${openScheduled}><${Icon} name="clock" size="md" /><span class="label">${t("scheduled.title")}</span>${count > 0 && html`<span class="scheduled-dot" aria-hidden="true"></span>`}</button>`;
}
export function NewRuleHost({ bots }) {
  const layout = useStore(sideLayout);
  const [query, setQuery] = useState("");
  const list = useRef(null);
  const [open, setOpen] = useState(false);
  const [botId, setBotId] = useState("");
  const [editing, setEditing] = useState(null);
  useEffect(() => {
    const show = () => { setEditing(null); setBotId(""); setQuery(""); setOpen(true); };
    const edit = (event) => { setEditing(event.detail); setBotId(event.detail.botId); setOpen(true); };
    window.addEventListener("amb-new-rule", show);
    window.addEventListener("amb-edit-rule", edit);
    return () => { window.removeEventListener("amb-new-rule", show); window.removeEventListener("amb-edit-rule", edit); };
  }, []);
  if (!open) return null;
  const chosen = botId || (bots.length === 1 ? bots[0].id : "");
  if (chosen) return html`<${RuleEditor} key=${editing?.id || chosen} botId=${chosen} rule=${editing} onClose=${() => setOpen(false)} onSaved=${() => setOpen(false)} />`;
  const keys = layout?.sections?.flatMap((s) => s.items) || [];
  const position = (bot) => { const i = keys.indexOf(keyOfBot(bot)); return i < 0 ? keys.length : i; };
  const ordered = [...bots].sort((a, b) => position(a) - position(b)).filter((b) => b.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const move = (e) => {
    if (!["ArrowDown", "ArrowUp"].includes(e.key) || e.isComposing) return;
    const buttons = [...list.current.querySelectorAll("button")];
    if (!buttons.length) return;
    e.preventDefault();
    const i = buttons.indexOf(document.activeElement);
    buttons[i < 0 ? (e.key === "ArrowDown" ? 0 : buttons.length - 1) : (i + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length].focus();
  };
  return html`<${Sheet} class="rule-picker-sheet" title=${t("scheduled.chooseBot")} onClose=${() => setOpen(false)}>
    <p class="hint rule-library-link"><button type="button" class="text" onClick=${() => { setOpen(false); openLibrary(); }}>${t("routines.notSure")}</button></p>
    ${bots.length > 8 && html`<div class="rule-bot-search" onKeyDown=${move}><${Icon} name="search" size="md" /><input class="field" data-autofocus value=${query} aria-label=${t("scheduled.searchBots")} placeholder=${t("scheduled.searchBots")} onInput=${(e) => setQuery(e.target.value)} /></div>`}
    <div class="rule-bot-picker" ref=${list} onKeyDown=${move}>${ordered.map((bot, i) => html`<button type="button" class="rule-bot-option" key=${bot.id} data-autofocus=${bots.length <= 8 && i === 0 ? "" : undefined} onClick=${() => setBotId(bot.id)}><${BotAvatar} bot=${bot} size=${32} /><span><b>${bot.name}</b>${bot.systemPrompt?.trim() && html`<small>${bot.systemPrompt.trim().split(/\r?\n/)[0]}</small>`}</span></button>`)}
      ${!ordered.length && html`<p class="hint">${t("scheduled.noBotsMatch", { query })}</p>`}</div>
    <div class="actions"><${Button} onClick=${() => setOpen(false)}>${t("common.cancel")}<//></div><//>`;
}
export function ScheduledPage({ bots }) {
  const data = useStore(scheduled);
  const layout = useStore(sideLayout);
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState("");
  // 回到「定时」页：之后打开的「用起来」不再默认右侧面板的那个机器人
  useEffect(() => libraryFrom.set(null), []);
  // 从任务库「查看规则」、详情的「已在用 · 查看」过来：展开那条规则并滚到它
  const focus = useStore(ruleFocus);
  const focused = useRef(0);
  useEffect(() => {
    if (!focus || focused.current === focus.at || !data.rules.some((r) => r.id === focus.id)) return;
    focused.current = focus.at; setFilter("all"); setOpen(focus.id);
    const timer = setTimeout(() => { const el = document.querySelector(`.scheduled-page [data-rule-id="${CSS.escape(focus.id)}"]`); el?.scrollIntoView({ block: "center" }); el?.classList.add("rule-locate"); setTimeout(() => el?.classList.remove("rule-locate"), 1800); }, 80);
    return () => clearTimeout(timer);
  }, [focus, data.rules.length]);
  const keys = layout?.sections?.flatMap((s) => s.items) || [];
  const position = (bot) => { const i = keys.indexOf(keyOfBot(bot)); return i < 0 ? keys.length : i; };
  const ordered = [...bots].sort((a, b) => position(a) - position(b));
  const count = data.rules.filter((r) => r.needsAttention).length;
  const refresh = () => loadRules().catch(failed);
  const rows = data.rules.filter((r) => filter !== "needs" || r.needsAttention);
  return html`<section class="scheduled-page" data-screen="scheduled">
    <header class="scheduled-head"><div><h1>${t("scheduled.title")}</h1><p class="hint">${t("scheduled.description", { zone: data.timeZone })}</p></div><div class="scheduled-head-actions"><${Button} icon="library" onClick=${() => openLibrary()}>${t("routines.library")}<//><${Button} variant="primary" icon="plus" onClick=${newRule}>${t("scheduled.newRule")}<//></div></header>
    <${Seg} label=${t("scheduled.title")} options=${[["all", `${t("scheduled.all")} ${data.rules.length}`], ["needs", `${t("scheduled.needs")} ${count}`]]} value=${filter} onChange=${setFilter} />
    ${!data.loaded && html`<${Spinner} />`}
    ${data.loaded && !data.rules.length && html`<${RoutineSuggestions} />`}
    ${data.loaded && data.rules.length > 0 && !rows.length && html`<div class="page-empty"><span class="page-empty-icon"><${Icon} name=${filter === "needs" ? "check" : "clock"} size="lg" /></span><h2>${t(filter === "needs" ? "scheduled.emptyNeedsTitle" : "scheduled.emptyTitle")}</h2><p>${t(filter === "needs" ? "scheduled.emptyNeedsHint" : "scheduled.example")}</p>${filter !== "needs" && html`<${Button} icon="plus" onClick=${newRule}>${t("scheduled.newRule")}<//>`}</div>`}
    ${ordered.map((bot) => {
      const rules = rows.filter((r) => r.botId === bot.id).sort((a, b) => Number(a.mode === "off") - Number(b.mode === "off") || (a.nextRunAt || Infinity) - (b.nextRunAt || Infinity) || a.createdAt - b.createdAt);
      return rules.length ? html`<section class="scheduled-group" key=${bot.id}><h2>${bot.name}</h2>${rules.map((rule) => html`<${RuleRow} key=${rule.id} full rule=${rule} timeZone=${data.timeZone} open=${open === rule.id} onToggle=${() => setOpen(open === rule.id ? "" : rule.id)} onChanged=${refresh} />`)}</section>` : null;
    })}
    ${data.loaded && data.rules.length > 0 && filter === "all" && html`<${TryLibrary} />`}
  </section>`;
}
