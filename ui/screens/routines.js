// 任务库（PRD 2026-11-15）：「定时」页的推荐卡和「试试任务库」（R1）、任务库页（R2）、任务详情（R3）、
// 「用起来」弹窗（R4：选机器人、填几项、什么时候、结果发到、就地补齐缺的应用、更多设置、原话预览）和先试一次（R5）。
// 任务数据和文案从 GET /routines 来（lib/routines.js）；规则名称和原话由服务端按参数写（POST /routines/draft），
// 「打开」「先试一次」都走 POST /routines/save，试跑的结果轮询 GET /routines/trial/<规则>。
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { html, Icon, Button, IconButton, Notice, Seg, Sheet, Spinner, Popover } from "../components/ui.js";
import { BotAvatar } from "../components/avatar.js";
import { Markdown } from "../components/markdown.js";
import { formOf, scheduleOf, ScheduleFields, useSchedulePreview, DestinationPicker, fmtNext } from "../components/rules.js";
import { api } from "../lib/api.js";
import { failed, toast, useStore } from "../lib/store.js";
import { t, useLang, getLang, locale } from "../lib/i18n.js";
import { routines, routineDialog, loadRoutines, listed, recommended, usageOf, needsOf, appState, isNew, localPrefs, setLocal, openRoutine, startRoutine, closeRoutine, openLibrary, libraryFrom, CATEGORIES, MAX_RULES_PER_BOT } from "../lib/routines.js";
import { appsStore, loadApps, openConnect, builtinName } from "../lib/apps.js";
import { scheduled, ruleFocus, rulesChanged } from "../lib/scheduled.js";
import { sideLayout, keyOfBot } from "../lib/sections.js";
import { templateOf, TEMPLATE_ALIASES, templateRequestId, availableName, recommendTemplate, inTrial } from "../lib/templates.js";
import { useModelInfoRaw, strategyOf } from "../components/model-picker.js";
import { guide, isActive } from "../lib/guide.js";

/** 「+ 新规则」（和「定时」页的同一个入口：NewRuleHost 听这个事件） */
const newRule = () => window.dispatchEvent(new Event("amb-new-rule"));

const tplOf = (bot) => TEMPLATE_ALIASES[bot.templateId] || bot.templateId;
const appName = (apps, id) => builtinName(apps.catalog.find((c) => c.id === id), getLang()) || id;
const runsText = (task) => (task.yearly ? t("routines.yearlyOnce") : task.monthlyRuns != null ? t("routines.runsMonthly", { count: task.monthlyRuns }) : "");
/** 用户自己建的、用模板建的机器人（「发现」里的官方机器人不列），按侧栏顺序 */
function ownBots(bots, layout) {
  const keys = layout?.sections?.flatMap((s) => s.items) || [];
  const position = (bot) => { const i = keys.indexOf(keyOfBot(bot)); return i < 0 ? keys.length : i; };
  return bots.filter((b) => b.origin !== "catalog").sort((a, b) => position(a) - position(b));
}
/** 卡片上的「需要什么」：联网搜索 / 需连接{应用} / 已连接{应用} / 需要应用内群聊 / 提醒 · 不花额度（最多 3 个） */
function tagsOf(task, apps) {
  if (task.kind === "remind") return [{ text: t("routines.tag.remind") }];
  const out = [];
  for (const n of needsOf(task, apps)) {
    if (n.kind === "web") out.push({ text: t("routines.tag.web") });
    else if (n.kind === "group") out.push({ text: t("routines.tag.group") });
    else if (n.required) out.push(n.state === "connected" ? { text: t("routines.tag.connected", { app: appName(apps, n.id) }) } : { text: t("routines.tag.needs", { app: n.ids.map((id) => appName(apps, id)).join(" / ") }), warn: true });
  }
  return out.slice(0, 3);
}

/** 一张任务卡：图标、任务名、一句话、一行小字（推荐卡：频率 · 需要什么；任务库：频率 · 大约每月几次）和依赖标签 */
function RoutineCard({ task, data, apps, local, variant = "suggest" }) {
  const used = usageOf(data, task).length;
  const tags = tagsOf(task, apps);
  const meta = variant === "library" ? [task.when, runsText(task)].filter(Boolean).join(" · ") : [task.when, tags.map((x) => x.text).join(" · ") || t("routines.needsNothing")].filter(Boolean).join(" · ");
  return html`<button type="button" class=${`routine-card ${variant}`} onClick=${() => openRoutine(task.id)}>
    <span class="routine-card-head"><span class="routine-icon" aria-hidden="true"><${Icon} name=${task.icon} size="md" /></span>
      <span class="routine-card-name"><b>${task.title}</b>${isNew(task, local) && html`<span class="routine-pill new">${t("routines.new")}</span>`}</span>
      ${used > 0 && html`<span class="routine-pill">${t("routines.inUse", { count: used })}</span>`}</span>
    <span class="routine-card-line">${task.oneLine}</span>
    <span class="routine-card-meta">${meta}</span>
    ${variant === "library" && html`<span class="routine-tags">${tags.map((x) => html`<span class=${`routine-tag${x.warn ? " warn" : ""}`}>${x.text}</span>`)}</span>`}
  </button>`;
}

function useLibrary() {
  const data = useStore(routines);
  const apps = useStore(appsStore);
  const local = useStore(localPrefs);
  useLang();
  useEffect(() => { loadRoutines().catch(() => {}); if (!apps.loaded) loadApps(); }, [getLang()]);
  return { data, apps, local };
}

/** 「定时」页没有规则时（R1 入口二）：标题、说明、6 张推荐卡、「浏览全部」，分隔线下面是原来的示例句和「+ 新规则」 */
export function RoutineSuggestions() {
  const { data, apps, local } = useLibrary();
  const cards = recommended(data.tasks);
  return html`<div class="routine-empty">
    <h2>${t("routines.emptyTitle")}</h2><p class="hint">${t("routines.emptyHint")}</p>
    ${!data.loaded ? html`<${Spinner} />` : html`<div class="routine-grid suggest">${cards.map((task) => html`<${RoutineCard} key=${task.id} task=${task} data=${data} apps=${apps} local=${local} />`)}</div>
      <button type="button" class="text routine-browse" onClick=${() => openLibrary()}>${t("routines.browseAll", { count: data.tasks.filter((x) => !x.hidden).length })}</button>`}
    <div class="routine-divider"></div>
    <p class="hint">${t("scheduled.example")}</p>
    <${Button} icon="plus" onClick=${newRule}>${t("scheduled.newRule")}<//>
  </div>`;
}

/** 有规则时列表最下面的「试试任务库」（R1 入口三）：没用过的前 3 条；全用过时一行字；收起后只剩「任务库 ›」，按本机记住 */
export function TryLibrary() {
  const { data, apps, local } = useLibrary();
  if (local.tryHidden) return html`<div class="routine-try collapsed"><button type="button" class="text" onClick=${() => openLibrary()}>${t("routines.collapsed")}</button></div>`;
  const fresh = listed(data.tasks, local).sort((a, b) => a.rank - b.rank).filter((x) => !usageOf(data, x).length).slice(0, 3);
  return html`<section class="routine-try">
    <div class="routine-try-head"><h2>${t("routines.tryTitle")}</h2><span class="grow"></span>
      <button type="button" class="text" onClick=${() => openLibrary()}>${t("routines.browse")}</button>
      <${IconButton} icon="close" label=${t("routines.hide")} onClick=${() => setLocal({ tryHidden: true })} /></div>
    ${!data.loaded ? html`<${Spinner} />` : fresh.length ? html`<div class="routine-grid try">${fresh.map((task) => html`<${RoutineCard} key=${task.id} task=${task} data=${data} apps=${apps} local=${local} />`)}</div>`
      : html`<button type="button" class="text" onClick=${() => openLibrary()}>${t("routines.allUsed")}</button>`}
  </section>`;
}

/** 任务库页（R2）：返回「定时」、搜索（当前分类内）、分类、两列卡片（「全部」下按分类分节） */
export function RoutineLibraryPage() {
  const { data, apps, local } = useLibrary();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const all = listed(data.tasks, local);
  const needle = q.trim().toLowerCase();
  const hits = all.filter((x) => (cat === "all" || x.category === cat) && (!needle || x.search.includes(needle) || x.title.toLowerCase().includes(needle)));
  const grid = (list) => html`<div class="routine-grid library">${list.map((task) => html`<${RoutineCard} key=${task.id} task=${task} data=${data} apps=${apps} local=${local} variant="library" />`)}</div>`;
  return html`<section class="scheduled-page routine-library" data-screen="routine-library">
    <button type="button" class="text routine-back" onClick=${() => { location.hash = "/scheduled"; }}><${Icon} name="arrowLeft" size="sm" />${t("scheduled.title")}</button>
    <header class="scheduled-head"><div><h1>${t("routines.library")}</h1><p class="hint">${t("routines.libraryHint")}</p></div></header>
    <div class="routine-search"><${Icon} name="search" size="md" /><input class="field" data-autofocus value=${q} aria-label=${t("routines.search")} placeholder=${t("routines.search")} onInput=${(e) => setQ(e.target.value)} /></div>
    <${Seg} label=${t("routines.library")} value=${cat} onChange=${setCat} options=${[["all", t("routines.allCount", { count: all.length })], ...CATEGORIES.map((c) => [c, t(`routines.categories.${c}`)])]} />
    ${!data.loaded && html`<${Spinner} />`}
    ${data.loaded && !hits.length && html`<div class="page-empty"><p>${t("routines.noResults")}</p><${Button} icon="plus" onClick=${newRule}>${t("scheduled.newRule")}<//></div>`}
    ${data.loaded && hits.length > 0 && (cat === "all" ? CATEGORIES.map((c) => {
      const list = hits.filter((x) => x.category === c);
      return list.length ? html`<section class="routine-section" key=${c}><h2>${t(`routines.categories.${c}`)}</h2>${grid(list)}</section>` : null;
    }) : grid(hits))}
  </section>`;
}

/** 依赖的一行：已具备 / 已连接 / 未连接（去连接）/ 要重新授权（重新连接）/ 可选 / 群聊 */
function NeedRow({ need, apps }) {
  const name = appName(apps, need.id);
  if (need.kind === "web") return html`<li><span>${t("routines.need.web")}</span><span class="hint">${t("routines.need.ready")}</span></li>`;
  if (need.kind === "group") return html`<li><span>${t("routines.need.groupName")}</span><span class="hint">${t("routines.need.group")}</span></li>`;
  if (need.state === "connected") return html`<li><span>${name}</span><span class="routine-ok">${t("routines.need.connected")}</span></li>`;
  const fix = html`<button type="button" class="text" onClick=${() => connectApp(need.id)}>${t(need.state === "reauth" ? "routines.reconnect" : "routines.connect")}</button>`;
  if (!need.required) return html`<li><span>${name}</span><span class="hint">${t("routines.need.optional", { app: name })}</span>${fix}</li>`;
  return html`<li class="warn"><span>${need.ids.map((id) => appName(apps, id)).join(" / ")}</span><span>${t(need.state === "reauth" ? "routines.need.reauth" : "routines.need.missing")}</span>${need.ids.length > 1 ? need.ids.map((id) => html`<button type="button" class="text" onClick=${() => connectApp(id)}>${t("routines.connectApp", { app: appName(apps, id) })}</button>`) : fix}</li>`;
}
/** 打开「应用与技能」里这个应用的连接弹窗（要重新授权的带上账号，走修复） */
function connectApp(id) {
  const v = appsStore.get().apps.find((a) => a.key === id);
  const account = appState(id) === "reauth" ? v?.accounts?.[0]?.id : undefined;
  openConnect(id, account ? { accountId: account } : {});
}

/** 任务详情（R3）：说明、它会做什么、结果示例、默认时间、需要什么、推荐机器人、你需要填、已在用；「用起来」 */
function RoutineDetail({ task, bots, onClose }) {
  const { data, apps } = useLibrary();
  const layout = useStore(sideLayout);
  const mine = ownBots(bots, layout);
  const tplBot = task.suggestedTemplate && mine.find((b) => tplOf(b) === task.suggestedTemplate);
  const used = usageOf(data, task);
  const byBot = [...new Set(used.map((u) => u.botId))].map((botId) => ({ bot: bots.find((b) => b.id === botId), rules: used.filter((u) => u.botId === botId) })).filter((x) => x.bot);
  const view = (rule) => {
    onClose();
    location.hash = "/scheduled";
    ruleFocus.set({ id: rule.ruleId, botId: rule.botId, at: Date.now() });
  };
  useEffect(() => { loadApps(); }, []);
  return html`<${Sheet} wide framed class="routine-detail" title=${task.title} onClose=${onClose}
    footer=${html`<${Button} onClick=${onClose}>${t("common.close")}<//><${Button} variant="primary" onClick=${() => startRoutine(task.id, { from: routineDialog.get()?.from })}>${t("routines.use")}<//>`}>
    <div class="routine-detail-body">
      <p>${task.oneLine}</p><p class="hint">${t("routines.audience", { audience: task.audience })}</p>
      <section><h3 class="t-label">${t("routines.heads.steps")}</h3><ol class="routine-steps">${task.steps.map((x) => html`<li>${x}</li>`)}</ol></section>
      <section><h3 class="t-label">${t("routines.heads.example")}</h3><p class="hint">${t("routines.exampleHint")}</p>
        <div class=${`routine-sample ${task.kind === "check" && task.resultStyle === "brief" ? "brief" : "line"}`}>${task.kind === "check" && task.resultStyle === "brief" ? html`<${Markdown} text=${task.sample} />` : task.sample}</div></section>
      <section><h3 class="t-label">${t("routines.heads.schedule")}</h3>
        <p>${[`${task.when}${data.timeZone ? t("routines.zone", { zone: data.timeZone }) : ""}`, runsText(task)].filter(Boolean).join(" · ")}</p>
        <p class="hint">${t(task.kind === "remind" ? "routines.quotaRemind" : "routines.quotaCheck")}</p></section>
      <section><h3 class="t-label">${t("routines.heads.needs")}</h3>
        ${task.kind === "remind" && !task.needs.web && !task.needs.apps.length ? html`<p class="hint">${t("routines.tag.remind")}</p>` : !needsOf(task, apps).length ? html`<p class="hint">${t("routines.needsNothing")}</p>` : html`<ul class="routine-needs">${needsOf(task, apps).map((n) => html`<${NeedRow} need=${n} apps=${apps} />`)}</ul>`}</section>
      <section><h3 class="t-label">${t("routines.heads.bot")}</h3><p>${tplBot ? t("routines.willUse", { bot: tplBot.name }) : task.suggestedTemplate ? t("routines.suggested", { template: templateOf(task.suggestedTemplate)?.name || task.suggestedTemplate }) : t("routines.anyBot")}</p></section>
      ${task.params.length > 0 && html`<section><h3 class="t-label">${t("routines.heads.fill")}</h3><div class="routine-chips">${task.params.map((p) => html`<span class="chip">${p.label}</span>`)}</div></section>`}
      ${byBot.map((x) => html`<p class="hint routine-in-use">${t("routines.inUseOn", { bot: x.bot.name, count: x.rules.length })} · <button type="button" class="text" onClick=${() => view(x.rules[0])}>${t("routines.view")}</button></p>`)}
    </div>
  <//>`;
}

/** 参数输入：文字（带字数）、列表（逗号或换行分开）、单选 / 多选胶囊、数字、日期（月、日）、每月几号、群、应用（只列已连接的） */
function ParamField({ p, value, onChange, error, groups, apps }) {
  const id = `routine-param-${p.key}`;
  const label = html`<span class="routine-field-label">${p.label}${p.required && html`<span class="routine-required">${t("routines.required")}</span>`}</span>`;
  const errorText = error && error !== "required" ? t(`routines.errors.${error}`, { max: p.maxItems || p.max || 0 }) : "";
  const count = (v) => [...String(v ?? "")].length;
  if (p.type === "select" || p.type === "app") {
    const opts = p.type === "app" ? p.options.filter((o) => appState(o.value, apps) === "connected") : p.options;
    if (p.type === "app" && !opts.length) return html`<div class="routine-field">${label}<span class="hint">${t("routines.appNone")}</span></div>`;
    const options = opts.map((o) => [o.value, p.type === "app" ? appName(apps, o.value) : o.label]);
    // 选项少而短时用分段，多了（语言、品种）用下拉
    if (options.length > 3 || options.some(([, text]) => [...text].length > 12)) return html`<label class="routine-field" for=${id}>${label}<select class="field" id=${id} value=${value ?? ""} onChange=${(e) => onChange(e.target.value)}>${!p.default && html`<option value="">${t("routines.pickOne")}</option>`}${options.map(([v, text]) => html`<option value=${v}>${text}</option>`)}</select></label>`;
    return html`<div class="routine-field">${label}<${Seg} label=${p.label} value=${value ?? ""} onChange=${onChange} options=${options} /></div>`;
  }
  if (p.type === "multiselect") {
    const list = Array.isArray(value) ? value : [];
    const toggle = (v) => onChange(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
    return html`<div class="routine-field">${label}<div class="routine-chips">${p.options.map((o) => html`<button type="button" class=${`chip${list.includes(o.value) ? " on" : ""}`} aria-pressed=${list.includes(o.value)} onClick=${() => toggle(o.value)}>${o.label}</button>`)}</div></div>`;
  }
  if (p.type === "group") {
    return html`<div class="routine-field">${label}${groups?.length ? html`<select class="field" id=${id} value=${value || ""} onChange=${(e) => onChange(e.target.value)}><option value="">${t("scheduled.groupMissing")}</option>${groups.map((g) => html`<option value=${g.id}>${g.name}</option>`)}</select>` : html`<span class="hint">${t("routines.noGroups")}</span>`}</div>`;
  }
  if (p.type === "dayOfMonth") {
    return html`<label class="routine-field" for=${id}>${label}<select class="field" id=${id} value=${value ?? ""} onChange=${(e) => onChange(e.target.value)}><option value="">${t("routines.pickDay")}</option>${Array.from({ length: 31 }, (_, i) => html`<option value=${i + 1}>${t("routines.dayOption", { day: i + 1 })}</option>`)}<option value="last">${t("scheduled.lastDay")}</option></select></label>`;
  }
  if (p.type === "date") {
    const [m, d] = String(value || "").split("-");
    const max = m ? new Date(2024, Number(m), 0).getDate() : 31;
    const set = (mm, dd) => onChange(mm && dd ? `${String(mm).padStart(2, "0")}-${String(Math.min(Number(dd), new Date(2024, Number(mm), 0).getDate())).padStart(2, "0")}` : mm ? `${String(mm).padStart(2, "0")}-` : "");
    return html`<div class="routine-field">${label}<div class="routine-date">
      <select class="field" aria-label=${p.label} value=${m ? Number(m) : ""} onChange=${(e) => set(e.target.value, d || 1)}><option value="">${t("routines.pickMonth")}</option>${Array.from({ length: 12 }, (_, i) => html`<option value=${i + 1}>${new Date(2024, i, 1).toLocaleDateString(locale(), { month: "long" })}</option>`)}</select>
      <select class="field" aria-label=${p.label} value=${d ? Number(d) : ""} onChange=${(e) => set(m || 1, e.target.value)}><option value="">${t("routines.pickDay")}</option>${Array.from({ length: max }, (_, i) => html`<option value=${i + 1}>${i + 1}</option>`)}</select></div>
      ${errorText && html`<span class="tone-danger">${errorText}</span>`}</div>`;
  }
  if (p.type === "list" || p.type === "repo") {
    const text = Array.isArray(value) ? value.join(", ") : value ?? "";
    return html`<label class="routine-field" for=${id}>${label}<input class="field" id=${id} value=${text} placeholder=${p.placeholder} onInput=${(e) => onChange(e.target.value)} />
      <span class=${errorText ? "tone-danger" : "hint"}>${errorText || t("routines.listHint", { count: p.maxItems || 1 })}</span></label>`;
  }
  return html`<label class="routine-field" for=${id}>${label}<input class="field" id=${id} inputmode=${p.type === "number" ? "decimal" : undefined} value=${value ?? ""} maxlength=${p.type === "text" && p.max ? p.max : undefined} placeholder=${p.placeholder}
      onInput=${(e) => onChange(p.type === "text" ? e.target.value.replace(/[\r\n]+/g, " ") : e.target.value)} />
    ${p.type === "text" && p.max ? html`<span class=${errorText ? "tone-danger" : "hint"}>${errorText || t("routines.count", { n: count(value), max: p.max })}</span>` : errorText && html`<span class="tone-danger">${errorText}</span>`}</label>`;
}

/** 下拉选机器人（和「给哪个机器人建？」同一个样子）：头像、名字、人设第一行；超过 8 个可搜索；满 30 条的置灰；最后可以「用模板新建」 */
function BotSelect({ bots, value, onChange, template, counts }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);
  const cur = bots.find((b) => b.id === value);
  const list = bots.filter((b) => b.name.toLocaleLowerCase().includes(q.trim().toLocaleLowerCase()));
  const pick = (id) => { setOpen(false); onChange(id); };
  return html`<button type="button" class="pick block routine-bot-pick" ref=${ref} aria-haspopup="dialog" aria-expanded=${open} onClick=${() => setOpen(!open)}>
      <span class="v">${value === "template" ? html`<span>${t("routines.newFromTemplate", { template: template?.name || "" })}</span>` : cur ? html`<${BotAvatar} bot=${cur} size=${20} /><span>${cur.name}</span>` : t("routines.pickBot")}</span><${Icon} name="chevDown" /></button>
    ${open && html`<${Popover} anchor=${ref.current} onClose=${() => setOpen(false)} width=${ref.current?.offsetWidth || 360} label=${t("routines.sections.bot")} class="routine-bot-pop">
      ${bots.length > 8 && html`<div class="rule-bot-search"><${Icon} name="search" size="md" /><input class="field" data-autofocus value=${q} aria-label=${t("scheduled.searchBots")} placeholder=${t("scheduled.searchBots")} onInput=${(e) => setQ(e.target.value)} /></div>`}
      <div class="rule-bot-picker">${list.map((bot) => {
        const full = (counts[bot.id] || 0) >= MAX_RULES_PER_BOT;
        return html`<button type="button" class=${`rule-bot-option${bot.id === value ? " cur" : ""}`} key=${bot.id} disabled=${full} onClick=${() => pick(bot.id)}><${BotAvatar} bot=${bot} size=${32} /><span><b>${bot.name}</b>${full ? html`<small>${t("routines.botFull")}</small>` : bot.systemPrompt?.trim() && html`<small>${bot.systemPrompt.trim().split(/\r?\n/)[0]}</small>`}</span></button>`;
      })}
        ${!list.length && q && html`<p class="hint">${t("scheduled.noBotsMatch", { query: q })}</p>`}
        ${template && html`<button type="button" class=${`rule-bot-option${value === "template" ? " cur" : ""}`} onClick=${() => pick("template")}><span class="routine-icon" aria-hidden="true"><${Icon} name="plus" size="md" /></span><span><b>${t("routines.newFromTemplate", { template: template.name })}</b><small>${t("routines.newFromTemplateHint")}</small></span></button>`}
      </div><//>`}`;
}

const quietRange = (q) => {
  const m = (s) => { const [h, mm] = String(s).split(":").map(Number); return h * 60 + mm; };
  return q?.enabled ? [m(q.from), m(q.to)] : null;
};
const inQuiet = (minute, range) => (range ? (range[0] <= range[1] ? minute >= range[0] && minute < range[1] : minute >= range[0] || minute < range[1]) : false);
/** cron 的小时字段一天跑几次（喝水提醒：10-18/2 → 5） */
function perDay(f) {
  if (f.kind !== "cron") return 1;
  const parts = String(f.cron).trim().split(/\s+/);
  if (parts.length !== 5) return 1;
  const hours = new Set();
  for (const part of parts[1].split(",")) {
    const m = /^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(part);
    if (!m) return 1;
    const a = m[1] === "*" ? 0 : Number(m[2]), b = m[1] === "*" ? 23 : m[3] !== undefined ? Number(m[3]) : m[4] ? 23 : a;
    for (let h = a; h <= b; h += Number(m[4] || 1)) hours.add(h);
  }
  return hours.size * parts[0].split(",").length;
}

/** 「用起来」弹窗（R4、R5） */
function RoutineUse({ task: initial, bots, from, models, defaultModel, account, onBotsChanged, onClose }) {
  const { data, apps } = useLibrary();
  const layout = useStore(sideLayout);
  const rulesData = useStore(scheduled);
  const g = useStore(guide);
  const info = useModelInfoRaw();
  const [task, setTask] = useState(initial);
  const mine = ownBots(bots, layout);
  const counts = useMemo(() => rulesData.rules.reduce((a, r) => ((a[r.botId] = (a[r.botId] || 0) + 1), a), {}), [rulesData.rules]);
  const template = task.suggestedTemplate && !mine.some((b) => tplOf(b) === task.suggestedTemplate) ? templateOf(task.suggestedTemplate) : null;
  const [botId, setBotId] = useState(() => {
    const ok = (b) => b && (counts[b.id] || 0) < MAX_RULES_PER_BOT;
    const fromBot = mine.find((b) => b.id === from?.botId);
    if (ok(fromBot)) return fromBot.id;
    const tpl = task.suggestedTemplate && mine.find((b) => tplOf(b) === task.suggestedTemplate);
    if (ok(tpl)) return tpl.id;
    const recent = mine.filter(ok).sort((a, b) => (data.recent?.[b.id] || 0) - (data.recent?.[a.id] || 0))[0];
    if (recent) return recent.id;
    return template ? "template" : "";
  });
  const bot = mine.find((b) => b.id === botId);
  const [created, setCreated] = useState("");
  const [values, setValues] = useState(() => Object.fromEntries(initial.params.filter((p) => p.default !== undefined).map((p) => [p.key, p.default])));
  const setParam = (key, v) => setValues((x) => ({ ...x, [key]: v }));
  const [draft, setDraft] = useState(null);
  const zone = data.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [f, setF] = useState(() => formOf(null));
  const [touched, setTouched] = useState(false);
  const lastDefault = useRef("");
  const [more, setMore] = useState(false);
  const { preview, error: scheduleError } = useSchedulePreview(f, zone, !draft?.schedule && !touched);
  const [choices, setChoices] = useState(null);
  const [conv, setConv] = useState("");
  const [missed, setMissed] = useState("catchup");
  const [runB, setRunB] = useState("");
  const [monthB, setMonthB] = useState("");
  const [trial, setTrial] = useState(null);
  const [ruleId, setRuleId] = useState("");
  const [busy, setBusy] = useState("");
  const [dup, setDup] = useState(null);
  const [done, setDone] = useState(null);
  const [gone, setGone] = useState(false);
  const [resumed, setResumed] = useState({});
  const requestId = useRef(templateRequestId());
  const check = task.kind === "check";
  useEffect(() => { loadApps(); }, []);
  // 规则名称、原话、默认时间：参数一变就让服务端重写（防抖）；默认时间跟着参数（每月几号、按市场），用户改过时间就不动
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => api("/routines/draft", { method: "POST", body: { taskId: task.id, params: values, botId: botId === "template" ? "" : botId, ruleId } }).then((d) => {
      if (!alive) return;
      setDraft(d);
      // 默认时间跟着参数（每月几号、提前几天、按市场）：用户只改过时刻时保留那个时刻
      const key = JSON.stringify(d.schedule || null);
      if (d.schedule && key !== lastDefault.current) {
        lastDefault.current = key;
        setF((cur) => (touched ? { ...formOf(d.schedule), time: cur.time } : formOf(d.schedule)));
      }
    }).catch(() => {}), 200);
    return () => { alive = false; clearTimeout(timer); };
  }, [task.id, JSON.stringify(values), botId, ruleId]);
  // 结果发到：这个机器人的桌面对话（默认）、群聊、渠道；用模板新建时只有桌面
  useEffect(() => {
    if (!bot) { setChoices(null); setConv(""); return; }
    let alive = true;
    api(`/rules/destinations?bot=${encodeURIComponent(bot.id)}`).then((d) => { if (!alive) return; setChoices(d); setConv((c) => (d.destinations.some((x) => x.id === c) ? c : d.destinations.find((x) => x.default)?.id || "")); }).catch(failed);
    return () => { alive = false; };
  }, [bot?.id]);
  // 试跑的结果：每 2 秒看一次，跑完为止
  useEffect(() => {
    if (!trial?.runId || trial.run?.state === "ended" || !ruleId) return;
    const timer = setInterval(() => api(`/routines/trial/${encodeURIComponent(ruleId)}?run=${encodeURIComponent(trial.runId)}`).then((d) => setTrial((x) => (x?.runId === trial.runId ? { ...x, run: d.run } : x))).catch(() => {}), 2000);
    return () => clearInterval(timer);
  }, [trial?.runId, trial?.run?.state, ruleId]);

  const groups = choices?.groups || [];
  const channel = choices?.destinations.find((d) => d.id === conv)?.channel || "web";
  const paused = bot && bot.settings?.paused && !resumed[bot.id];
  const noModel = bot && !bot.defaultModel && !defaultModel;
  const needs = needsOf(task, apps);
  const appParam = task.params.find((p) => p.type === "app");
  const picked = appParam && values[appParam.key];
  const connectedOpts = appParam ? appParam.options.filter((o) => appState(o.value, apps) === "connected") : [];
  useEffect(() => { if (appParam && !values[appParam.key] && connectedOpts.length) setParam(appParam.key, connectedOpts[0].value); }, [connectedOpts.map((o) => o.value).join()]);
  const missingApps = needs.filter((n) => n.kind === "app" && n.required && (picked ? appState(picked, apps) !== "connected" : n.state !== "connected"));
  const noGroups = task.needs.group && bot && choices && !groups.length;
  const range = quietRange(bot?.settings?.quietHours);
  const firstAt = preview?.times?.[0];
  const firstClock = firstAt ? new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(firstAt) : "";
  const firstMinute = firstClock ? Number(firstClock.slice(0, 2)) * 60 + Number(firstClock.slice(3, 5)) : -1;
  const quiet = check && ["weixin", "feishu"].includes(channel) && firstMinute >= 0 && inQuiet(firstMinute, range);
  const dailyChecks = rulesData.rules.filter((r) => r.conversationId === conv && r.kind === "check" && r.mode !== "off" && !r.pausedReason && (r.monthlyRuns || 0) >= 28 && r.id !== ruleId).length;
  const sendsPerDay = perDay(f);
  // 第一个没满足的原因（按钮上方那句）
  const firstError = draft && task.params.find((p) => draft.errors?.[p.key] && !(p.type === "app" && !connectedOpts.length));
  const reason = !mine.length && !template ? t("routines.reason.noBot")
    : !botId ? t("routines.reason.bot")
    : gone ? t("routines.botGone")
    : bot && (counts[bot.id] || 0) >= MAX_RULES_PER_BOT && !ruleId ? t("routines.botFull")
    : noGroups ? t("routines.noGroups")
    : firstError ? (firstError.type === "group" ? t("routines.reason.group") : t("routines.reason.field", { field: firstError.label }))
    : missingApps.length ? t("routines.reason.app", { app: missingApps[0].ids.map((id) => appName(apps, id)).join(" / ") })
    : check && noModel ? t("routines.reason.model")
    : scheduleError && touched ? t("routines.reason.schedule")
    : !draft || (!preview && (draft.schedule || touched)) ? "…" : "";
  const blocked = !!reason;
  const trialRunning = trial && (!trial.run || trial.run.state !== "ended") && !trial.error;

  const switchToWeb = () => {
    const next = data.tasks.find((x) => x.id === task.fallback);
    if (!next) return;
    setValues((x) => Object.fromEntries(Object.entries(x).filter(([k]) => next.params.some((p) => p.key === k))));
    setTask(next);
  };
  /** 用模板新建：按模板添加机器人（模型按同一套推荐规则选），只建一次 */
  const ensureBot = async () => {
    if (botId !== "template") return botId;
    if (created) return created;
    const item = template;
    const rec = recommendTemplate(item, models, info, strategyOf(account), defaultModel, inTrial(account, isActive(g)));
    const r = await api("/bots/from-template", { method: "POST", body: { templateId: item.id, requestId: requestId.current, name: availableName(item.name, bots), systemPrompt: item.persona, avatar: item.avatar, defaultModel: rec.model || "", memoryEnabled: true } });
    setCreated(r.bot.id);
    await onBotsChanged?.();
    setBotId(r.bot.id);
    return r.bot.id;
  };
  const body = (id, extra) => ({
    taskId: task.id, params: values, botId: id, conversationId: botId === "template" || created === id ? "" : conv,
    schedule: scheduleOf(f, zone), missedPolicy: missed,
    ...(check && runB ? { runBudgetUsd: Number(runB) } : {}), ...(check && monthB ? { monthBudgetUsd: Number(monthB) } : {}),
    ...(ruleId ? { ruleId } : {}), templateRule: created === id || botId === "template", ...extra,
  });
  const fail = (e) => {
    if (e?.status === 410) { setGone(true); onBotsChanged?.(); return; }
    // 打开期间应用断开了：服务端拒绝后重新读应用状态，缺的那个出现在「需要什么」里
    loadApps();
    failed(e);
  };
  const tryOnce = async () => {
    setBusy("try"); setDup(null);
    try {
      const id = await ensureBot();
      const d = await api("/routines/save", { method: "POST", body: body(id, { trial: true, force: true }) });
      setRuleId(d.rule.id); rulesChanged(); loadRoutines().catch(() => {});
      setTrial(d.trialError ? { error: d.trialError } : { runId: d.run, run: null, startedAt: Date.now() });
    } catch (e) { fail(e); }
    setBusy("");
  };
  const stopTrial = async () => { try { await api(`/routines/trial/${encodeURIComponent(ruleId)}`, { method: "DELETE" }); } catch (e) { failed(e); } };
  const turnOn = async (force = false) => {
    setBusy("on"); setDup(null);
    try {
      const id = await ensureBot();
      const d = await api("/routines/save", { method: "POST", body: body(id, { on: true, force }) });
      if (d.duplicate) { setDup(d.duplicate); setBusy(""); return; }
      rulesChanged(); loadRoutines().catch(() => {});
      setDone(d.rule);
    } catch (e) { fail(e); }
    setBusy("");
  };
  const close = () => {
    if (ruleId && !done) toast(t("routines.keptOff"));
    onClose();
  };
  // Esc 走对话框挂上时的那个回调：经 ref 取最新的（试过之后关掉要提示存成了关着的规则）
  const closeRef = useRef(close);
  closeRef.current = close;
  const closeLatest = () => closeRef.current();
  const viewRule = (rule) => {
    onClose();
    location.hash = "/scheduled";
    ruleFocus.set({ id: rule.id, botId: rule.botId, at: Date.now() });
  };
  const resume = async () => {
    try { await api(`/bots/${encodeURIComponent(bot.id)}/settings`, { method: "PUT", body: { paused: false } }); setResumed((x) => ({ ...x, [bot.id]: true })); onBotsChanged?.(); } catch (e) { failed(e); }
  };

  if (done) {
    const where = done.destination || t("scheduled.destinationMissing");
    return html`<${Sheet} framed class="routine-use" title=${t("routines.useTitle", { task: task.title })} onClose=${onClose}
      footer=${html`<${Button} onClick=${() => { onClose(); openLibrary(); }}>${t("routines.pickAnother")}<//><${Button} variant="primary" onClick=${() => viewRule(done)}>${t("routines.viewRule")}<//>`}>
      <div class="routine-done"><span class="routine-icon ok" aria-hidden="true"><${Icon} name="check" size="lg" /></span>
        <h3>${t("routines.done", { name: done.title })}</h3>
        <p class="hint">${[done.nextRunAt ? t("routines.doneNext", { next: fmtNext(done.nextRunAt, Date.now(), done.trigger?.schedule?.tz) }) : "", t("routines.doneWhere", { where })].filter(Boolean).join(" · ")}</p></div>
    <//>`;
  }
  const run = trial?.run;
  const seconds = run?.startedAt && run?.endedAt ? Math.max(1, Math.round((run.endedAt - run.startedAt) / 1000)) : 0;
  const failedWhy = trial?.error || (run?.state === "ended" && run.outcome !== "done" ? (run.errorCode === "timeout" ? t("routines.trial.timeout") : run.outcome === "interrupted" || run.errorCode === "trial_interrupted" ? t("routines.trial.interrupted") : run.outcome === "stopped" ? t("routines.trial.stopped") : run.message || run.error || run.line) : "");
  const appFailed = failedWhy && run?.outcome === "failed" && run.errorCode !== "timeout" && needs.find((n) => n.kind === "app" && n.required);
  return html`<${Sheet} wide framed sticky class="routine-use" title=${t("routines.useTitle", { task: task.title })} onClose=${closeLatest}
    footer=${html`<div class="routine-footer">
      ${dup ? html`<div class="routine-dup" role="alert"><span>${t("routines.duplicate", { bot: bot?.name || "" })}</span><span class="grow"></span><${Button} onClick=${() => viewRule(dup)}>${t("routines.viewIt")}<//><${Button} variant="primary" loading=${busy === "on"} onClick=${() => turnOn(true)}>${t("routines.createAnyway")}<//></div>`
        : html`${reason && reason !== "…" && html`<p class="routine-reason tone-warning">${reason}</p>`}
        <div class="routine-buttons">${check && html`<span class="hint">${t("routines.quotaNote")}</span>`}<span class="grow"></span>
          <${Button} onClick=${close}>${t("common.cancel")}<//>
          ${check && html`<${Button} loading=${busy === "try"} disabled=${blocked || !!busy || trialRunning} onClick=${tryOnce}>${t(trial ? "routines.tryAgain" : "routines.try")}<//>`}
          <${Button} variant="primary" loading=${busy === "on"} disabled=${blocked || !!busy} onClick=${() => turnOn(false)}>${t("routines.turnOn")}<//></div>`}
    </div>`}>
    <div class="rule-form routine-form">
      <section><h3 class="rule-group-title">${t("routines.sections.bot")}</h3>
        ${!mine.length && !template ? html`<p class="hint">${t("routines.reason.noBot")}</p>` : html`<${BotSelect} bots=${mine} value=${botId} onChange=${(id) => { setBotId(id); setGone(false); }} template=${template} counts=${counts} />`}
        ${botId === "template" && html`<p class="hint">${t("routines.newFromTemplateHint")}</p>`}
        ${gone && html`<${Notice} tone="amber">${t("routines.botGone")}<//>`}
        ${paused && html`<${Notice} tone="amber" action=${html`<button type="button" class="btn" onClick=${resume}>${t("routines.resume")}</button>`}>${t("routines.botPaused")}<//>`}
        ${noModel && check && html`<${Notice} tone="amber" action=${html`<button type="button" class="btn" onClick=${() => { onClose(); location.hash = `/bot/${encodeURIComponent(bot.id)}/settings`; }}>${t("routines.setUp")}</button>`}>${t("routines.noModel")}<//>`}
      </section>
      ${task.params.length > 0 && html`<section><h3 class="rule-group-title">${t("routines.sections.fill")}</h3>
        ${task.params.map((p) => html`<${ParamField} key=${p.key} p=${p} value=${values[p.key]} onChange=${(v) => setParam(p.key, v)} error=${draft?.errors?.[p.key]} groups=${groups} apps=${apps} />`)}</section>`}
      <section class="rule-when"><h3 class="rule-group-title">${t("routines.sections.when")}</h3>
        ${!draft?.schedule && !touched ? html`<p class="hint">${task.when}</p>` : html`<${ScheduleFields} f=${f} setF=${(x) => { setF(x); setTouched(true); }} zone=${zone} preview=${preview} error=${touched ? scheduleError : ""} remind=${!check} more=${more} setMore=${setMore} compact />`}
        ${(draft?.schedule || touched) && html`<button type="button" class="text routine-more-time" aria-expanded=${more} onClick=${() => setMore(!more)}>${t("scheduled.more")}<${Icon} name="chevDown" class=${more ? "flipped" : ""} size="xs" /></button>`}
      </section>
      <section class="rule-delivery-group"><h3 class="rule-group-title">${t("routines.sections.to")}</h3>
        ${botId === "template" ? html`<p>${t("routines.desktopOnly", { bot: template?.name || "" })}</p>` : choices ? html`<${DestinationPicker} destinations=${choices.destinations} value=${conv} onChange=${setConv} />` : bot ? html`<${Spinner} />` : null}
        ${botId !== "template" && bot && !choices?.destinations.some((d) => d.channel === "weixin" || d.channel === "feishu") && html`<p class="hint"><button type="button" class="text" onClick=${() => { close(); location.hash = "/settings/connections"; }}>${t("routines.connectChannel")}</button></p>`}
        ${quiet && html`<${Notice} tone="amber" action=${html`<button type="button" class="btn" onClick=${() => { setF({ ...f, time: bot.settings.quietHours.to }); setTouched(true); }}>${t("routines.changeTime")}</button>`}>${t("routines.quiet", { time: firstClock, end: bot.settings.quietHours.to })}<//>`}
        ${channel === "weixin" && check && dailyChecks >= 3 && html`<${Notice} tone="amber">${t("routines.weixinCap")}<//>`}
        ${channel === "weixin" && !check && sendsPerDay > 1 && html`<p class="hint">${t("routines.perDay", { count: sendsPerDay })}</p>`}
      </section>
      ${(missingApps.length > 0 || noGroups) && html`<section class="routine-missing"><h3 class="rule-group-title">${t("routines.sections.missing")}</h3>
        ${missingApps.map((n) => html`<div class="routine-missing-row"><span>${t("routines.missingApp", { app: (picked ? [picked] : n.ids).map((id) => appName(apps, id)).join(" / ") })}</span><span class="grow"></span>
          ${(picked ? [picked] : n.ids).map((id) => html`<${Button} size="sm" onClick=${() => connectApp(id)}>${n.ids.length > 1 && !picked ? t("routines.connectApp", { app: appName(apps, id) }) : t(appState(id, apps) === "reauth" ? "routines.reconnect" : "routines.connect")}<//>`)}</div>`)}
        ${missingApps.length > 0 && task.fallback && html`<button type="button" class="text" onClick=${switchToWeb}>${t("routines.useWeb")}</button>`}
        ${noGroups && html`<p class="hint">${t("routines.noGroups")}</p>`}</section>`}
      <details class="rule-advanced"><summary><${Icon} name="chevRight" size="xs" />${t("routines.sections.more")}</summary><div class="rule-form">
        ${f.kind !== "every" && html`<span class="t-label">${t("scheduled.missedPolicy")}</span><${Seg} label=${t("scheduled.missedPolicy")} options=${[["catchup", t("scheduled.catchup")], ["skip", t("scheduled.skip")]]} value=${missed} onChange=${setMissed} />`}
        ${check && html`<div class="rule-when-row"><label>${t("rules.perRun")} ($)<input class="field num" type="number" min="0.01" step="0.01" placeholder=${String(task.budget?.runUsd ?? 0.1)} value=${runB} onInput=${(e) => setRunB(e.target.value)} /></label><label>${t("rules.perMonth")} ($)<input class="field num" type="number" min="0.01" step="0.5" placeholder=${String(task.budget?.monthUsd ?? 3)} value=${monthB} onInput=${(e) => setMonthB(e.target.value)} /></label></div>`}
      </div></details>
      <details class="rule-advanced routine-words"><summary><${Icon} name="chevRight" size="xs" />${t("routines.preview")}</summary>
        ${draft && html`<p class="selectable routine-words-text">${check ? draft.instruction : draft.message}</p><p class="hint">${t("routines.previewEdit")}</p>`}</details>
      ${check && trial && html`<section class="routine-trial" aria-live="polite">
        ${trialRunning && html`<div class="routine-trial-state"><${Spinner} /><span>${run?.state === "queued" ? t("routines.trial.queued") : t("routines.trial.running")}</span><span class="grow"></span><${Button} size="sm" onClick=${stopTrial}>${t("routines.trial.stop")}<//></div>`}
        ${run?.state === "ended" && run.outcome === "done" && run.message && html`<p class="hint">${t("routines.trial.head", { s: seconds })}</p>
          <div class=${`routine-sample ${draft?.resultStyle === "brief" ? "brief" : "line"}`}>${draft?.resultStyle === "brief" ? html`<${Markdown} text=${run.message} />` : run.message}</div>
          <p class="hint">${t("routines.trial.hint")}</p>`}
        ${run?.state === "ended" && run.outcome === "done" && !run.message && html`<p>${t("routines.trial.quiet")}</p>`}
        ${run?.state === "ended" && (run.approvals || []).map((a) => html`<p class="hint">${t("routines.trial.approval", { action: a })}</p>`)}
        ${failedWhy && html`<${Notice} tone="amber" action=${html`${appFailed && html`<button type="button" class="btn" onClick=${() => connectApp(appFailed.id)}>${t("routines.trial.reconnect", { app: appName(apps, appFailed.id) })}</button>`}<button type="button" class="btn" disabled=${blocked || !!busy} onClick=${tryOnce}>${t("routines.tryAgain")}</button>`}>${t("routines.trial.failed", { reason: failedWhy })}<//>`}
      </section>`}
    </div>
  <//>`;
}

/** 全局一个：详情和「用起来」弹窗（推荐卡、任务库、命令面板、规则详情的来源行都经 lib/routines.js 打开它） */
export function RoutineHost({ bots, models, defaultModel, account, onBotsChanged }) {
  const dialog = useStore(routineDialog);
  const data = useStore(routines);
  const from = useStore(libraryFrom);
  useLang();
  useEffect(() => { if (dialog && !data.loaded) loadRoutines().catch(failed); }, [!!dialog]);
  if (!dialog) return null;
  const task = data.tasks.find((x) => x.id === dialog.id);
  if (!task) return null;
  if (dialog.kind === "use") return html`<${RoutineUse} key=${task.id} task=${task} bots=${bots} from=${dialog.from || from} models=${models} defaultModel=${defaultModel} account=${account} onBotsChanged=${onBotsChanged} onClose=${closeRoutine} />`;
  return html`<${RoutineDetail} key=${task.id} task=${task} bots=${bots} onClose=${closeRoutine} />`;
}
