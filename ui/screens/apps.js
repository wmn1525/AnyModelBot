// 「应用与技能」页（头像菜单 › 应用与技能）：「应用」标签把常用应用连上，机器人就能替你读写其中的内容；
// 「技能」标签是技能库（components/skill-library.js），只展示和导航，安装在对话里完成。
// 推荐应用是内置的 10 个连接器（按界面语言置顶），我的 MCP 是自己添加的自定义连接器；每个应用只有一张卡片，账号都归在它下面。
// 页面和发现页同一种结构：占满主区、内容列居中、顶上一条通栏的拖动区。连接、管理、自定义连接器都是弹窗（components/app-dialogs.js）。
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { html, Button, Icon, Seg, Skeleton, Spinner } from "../components/ui.js";
import { SkillsPanel } from "../components/skill-library.js";
import { loadLibrary, libraryNow, matchesSkill } from "../lib/skill-library.js";
import { AppMark } from "../components/app-mark.js";
import { ATTENTION, appsStore, builtinMethod, builtinName, loadApps, matchesApp, methodLabel, openConnect, openCustom, openManage, orderCatalog, stateText, stateTone } from "../lib/apps.js";
import { useStore } from "../lib/store.js";
import { has, t, useLang } from "../lib/i18n.js";

/** 卡片上的状态：已连接（多个账号时带数量）、或者要处理的状态带一个提醒点 */
function CardState({ view }) {
  const attention = ATTENTION.includes(view.state);
  const tools = view.accounts.reduce((n, a) => Math.max(n, a.tools), 0);
  // 内置应用：已连接 + 账号名（多个账号时是数量）；自定义连接器：已连接 + 工具数；其余是状态
  const text = view.state !== "connected" || view.custom ? stateText(view.state, tools) : view.accounts.length > 1 ? t("apps.card.connectedAccounts", { n: view.accounts.length }) : `${t("apps.state.connected")}${view.accounts[0]?.label ? ` · ${view.accounts[0].label}` : ""}`;
  return html`<span class=${`apps-state ${stateTone(view.state)}`}>${attention && html`<span class="dot warn"></span>`}${view.state === "testing" && html`<${Spinner} />`}${text}</span>`;
}

function BuiltinCard({ entry, view, lang }) {
  const name = builtinName(entry, lang);
  const linked = view && view.accounts.length > 0;
  const open = () => (linked ? openManage(entry.id) : openConnect(entry.id));
  return html`<div class="apps-card" role="group" aria-label=${name}>
    <button type="button" class="apps-card-main" onClick=${open}>
      <span class="apps-card-head"><${AppMark} app=${entry.id} name=${name} /><span class="apps-card-name">${name}</span></span>
      <span class="apps-card-desc">${has(`apps.catalog.${entry.id}.desc`) ? t(`apps.catalog.${entry.id}.desc`) : ""}</span>
      <span class="apps-card-meta">${methodLabel(builtinMethod(entry))}${has(`apps.catalog.${entry.id}.requires`) ? html` · <span>${t(`apps.catalog.${entry.id}.requires`)}</span>` : ""}</span>
    </button>
    <span class="apps-card-foot">
      ${linked ? html`<${CardState} view=${view} />` : html`<span></span>`}
      <${Button} size="sm" onClick=${open}>${t(linked ? "apps.card.manage" : "apps.card.connect")}<//>
    </span>
  </div>`;
}

function CustomCard({ view }) {
  const c = view.config || {};
  const open = () => openManage(view.key);
  return html`<div class="apps-card" role="group" aria-label=${view.name}>
    <button type="button" class="apps-card-main" onClick=${open}>
      <span class="apps-card-head"><${AppMark} name=${view.name} /><span class="apps-card-name">${view.name}</span></span>
      <span class="apps-card-desc">${t(c.transport === "stdio" ? "apps.custom.type.local" : "apps.custom.type.remote")} · ${methodLabel(view.accounts[0]?.method || "none")}</span>
      <span class="apps-card-meta mono">${c.transport === "stdio" ? [c.command, ...(c.args || [])].join(" ") : c.url}</span>
    </button>
    <span class="apps-card-foot"><${CardState} view=${view} /><${Button} size="sm" onClick=${open}>${t("apps.card.manage")}<//></span>
  </div>`;
}

function Skeletons() {
  return html`<div class="apps-grid">${[0, 1, 2, 3, 4, 5].map((i) => html`<div key=${i} class="apps-card skel-card"><${Skeleton} w="40%" /><${Skeleton} w="90%" /><${Skeleton} w="55%" /></div>`)}</div>`;
}

const filterPill = (on, label, n, onClick) => html`<button type="button" role="radio" aria-checked=${on} class=${`skill-pill${on ? " on" : ""}`} onClick=${onClick}>${label}<span class="skill-pill-n">${n}</span></button>`;

/**
 * 「应用与技能」页：顶上标题、说明和同时搜应用和技能的搜索框，下面「应用 {n} | 技能 {n}」两个标签（默认「应用」）。
 * 地址：#/apps（应用）、#/apps/connected（应用 · 已连接）、#/skills（技能）。两个标签各自保留筛选和滚动位置。
 * 搜索时两个标签的数量变成命中数，自动停在命中多的标签（一样多时不动）；用户手动切过就不再自动跳，直到清空。
 * 搜索时筛选临时回到「全部」，清空后恢复原来的标签、筛选和滚动位置。
 */
export function AppsScreen({ initialTab = "all" }) {
  const lang = useLang();
  const s = useStore(appsStore);
  const [tab, setTab] = useState(initialTab === "skills" ? "skills" : "apps");
  const [filter, setFilter] = useState(initialTab === "connected" ? "connected" : "all");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [author, setAuthor] = useState("");
  const [lib, setLib] = useState(libraryNow);
  const [libError, setLibError] = useState(false);
  const scroller = useRef(null);
  const searchBox = useRef(null);
  const scrolls = useRef({ apps: 0, skills: 0 });
  const restoreTo = useRef(null);
  /** 开始搜索前的样子（清空后恢复）；manual：搜索期间用户手动切过标签 */
  const before = useRef(null);
  const manual = useRef(false);
  useEffect(() => {
    loadApps();
    // 测试、授权在后台变化（测试中 → 已连接）：停在这一页时隔一会儿取一次
    const timer = setInterval(loadApps, 15_000);
    return () => clearInterval(timer);
  }, []);
  const readLibrary = () => {
    setLibError(false);
    loadLibrary().then(setLib, () => setLibError(true));
  };
  useEffect(readLibrary, []);
  // 地址变了（头像菜单、机器人设置的「浏览技能库」、前进后退）：停到对应的标签
  useEffect(() => {
    if (initialTab === "skills") show("skills");
    else {
      show("apps");
      if (initialTab === "connected") setFilter("connected");
    }
  }, [initialTab]);
  // / 或 ⌘F（Ctrl+F）聚焦搜索框
  useEffect(() => {
    const key = (e) => {
      const typing = e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable);
      const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? e.metaKey : e.ctrlKey;
      if ((e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) || (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "f")) {
        if (document.querySelector(".scrim:not([hidden])")) return;
        e.preventDefault();
        searchBox.current?.focus();
        searchBox.current?.select();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  // 切标签后回到这个标签上次的滚动位置
  useLayoutEffect(() => {
    if (restoreTo.current === null || !scroller.current) return;
    scroller.current.scrollTop = restoreTo.current;
    restoreTo.current = null;
  });

  /** 切到某个标签（记下当前标签的滚动位置）；byUser：用户点的，写进地址，搜索期间不再自动跳 */
  const show = (next, byUser = false) => {
    setTab((cur) => {
      if (cur !== next) {
        scrolls.current[cur] = scroller.current?.scrollTop ?? 0;
        restoreTo.current = scrolls.current[next] ?? 0;
      }
      return next;
    });
    if (!byUser) return;
    if (q.trim()) manual.current = true;
    const want = next === "skills" ? "#/skills" : filter === "connected" ? "#/apps/connected" : "#/apps";
    if (location.hash !== want) location.hash = want.slice(1);
  };
  const onSearch = (v) => {
    const was = !!q.trim();
    const now = !!v.trim();
    if (!was && now) {
      before.current = { tab, filter, category, author, scrolls: { ...scrolls.current, [tab]: scroller.current?.scrollTop ?? 0 } };
      manual.current = false;
      setFilter("all");
      setCategory("all");
      setAuthor("");
    }
    setQ(v);
    if (was && !now) restore();
  };
  const restore = () => {
    const b = before.current;
    before.current = null;
    manual.current = false;
    if (!b) return;
    scrolls.current = b.scrolls;
    setFilter(b.filter);
    setCategory(b.category);
    setAuthor(b.author);
    setTab(b.tab);
    restoreTo.current = b.scrolls[b.tab] ?? 0;
  };
  const clearSearch = () => {
    setQ("");
    restore();
  };

  const viewOf = (key) => s.apps.find((a) => a.key === key);
  const builtin = useMemo(() => orderCatalog(s.catalog, lang), [s.catalog, lang]);
  const custom = s.apps.filter((a) => a.custom);
  const linked = (e) => {
    const v = viewOf(e.id);
    return !!(v && v.accounts.length);
  };
  const hitBuiltin = builtin.filter((e) => matchesApp(q, { entry: e, view: viewOf(e.id), lang }));
  const hitCustom = custom.filter((v) => matchesApp(q, { entry: null, view: v, lang }));
  const connectedOnly = filter === "connected";
  const shownBuiltin = connectedOnly ? hitBuiltin.filter(linked) : hitBuiltin;
  const shownCustom = connectedOnly ? hitCustom.filter((v) => v.enabled) : hitCustom;
  const allCount = hitBuiltin.length + hitCustom.length;
  const connectedCount = hitBuiltin.filter(linked).length + hitCustom.filter((v) => v.enabled).length;
  const searching = !!q.trim();
  const skillHits = lib ? lib.skills.filter((x) => matchesSkill(x, q, lib)).length : 0;
  const appsN = s.loaded ? allCount : "—";
  const skillsN = libError ? "—" : lib ? skillHits : "…";
  // 搜索时自动停在命中多的标签（一样多时不动；手动切过就不跳）
  useEffect(() => {
    if (!searching || manual.current || !s.loaded || !lib) return;
    if (allCount > skillHits && tab !== "apps") show("apps");
    else if (skillHits > allCount && tab !== "skills") show("skills");
  }, [q, allCount, skillHits, s.loaded, !!lib]);
  const full = s.customCount >= s.maxCustom;
  const nothing = !shownBuiltin.length && !shownCustom.length;
  const bothEmpty = searching && !allCount && !skillHits && !!lib;

  return html`<section class="discover apps" data-screen="apps" ref=${scroller}>
    <header class="discover-head">
      <h1 class="t-page">${t("apps.title")}</h1>
      <p>${t("apps.lead")}</p>
      <label class="side-search apps-search"><${Icon} name="search" size="sm" />
        <input type="search" ref=${searchBox} placeholder=${t("apps.search")} aria-label=${t("apps.search")} value=${q} onInput=${(e) => onSearch(e.target.value)} /></label>
    </header>
    <div class="apps-tabs">
      <${Seg} label=${t("apps.title")} value=${tab} onChange=${(v) => show(v, true)} options=${[["apps", t("apps.tabs.apps", { n: appsN })], ["skills", t("apps.tabs.skills", { n: skillsN })]]} />
    </div>
    ${bothEmpty && html`<div class="page-empty skill-empty">
      <h2>${t("skills.empty.title", { query: q.trim() })}</h2><p>${t("skills.empty.body")}</p><${Button} onClick=${clearSearch}>${t("skills.empty.clear")}<//>
    </div>`}
    ${!bothEmpty && tab === "skills" && html`<${SkillsPanel} lib=${lib} error=${libError} onRetry=${readLibrary} q=${q} category=${category} onCategory=${setCategory} author=${author} onAuthor=${(id) => { setAuthor(id); if (id) setCategory("all"); }} onClearSearch=${clearSearch} />`}
    ${!bothEmpty && tab === "apps" && html`
      <div class="apps-bar">
        <div class="skill-pills" role="radiogroup" aria-label=${t("apps.filterLabel")}>
          ${filterPill(!connectedOnly, t("apps.tab.all"), allCount, () => setFilter("all"))}
          ${filterPill(connectedOnly, t("apps.tab.connected"), connectedCount, () => setFilter("connected"))}
        </div>
        <${Button} size="sm" icon="plus" class="apps-add-mine" disabled=${full} title=${full ? t("apps.limit", { max: s.maxCustom }) : ""} onClick=${() => openCustom()}>${t("apps.addMine")}<//>
      </div>
      ${!s.loaded && !s.error && html`<section class="discover-sec"><h2 class="discover-part">${t("apps.suggested")}</h2><${Skeletons} /></section>`}
      ${!s.loaded && s.error && html`<div class="apps-empty"><p>${t("apps.loadFailed")}</p><${Button} onClick=${loadApps}>${t("apps.fix.retry")}<//></div>`}
      ${s.loaded && html`
        ${full && html`<p class="hint">${t("apps.limit", { max: s.maxCustom })}</p>`}
        ${shownBuiltin.length > 0 && html`<section class="discover-sec">
          <h2 class="discover-part">${t("apps.suggested")}</h2>
          <div class="apps-grid">${shownBuiltin.map((e) => html`<${BuiltinCard} key=${e.id} entry=${e} view=${viewOf(e.id)} lang=${lang} />`)}</div>
        </section>`}
        ${shownCustom.length > 0 && html`<section class="discover-sec">
          <h2 class="discover-part">${t("apps.mine")}</h2>
          <div class="apps-grid">${shownCustom.map((v) => html`<${CustomCard} key=${v.key} view=${v} />`)}</div>
        </section>`}
        ${nothing && searching && html`<div class="apps-empty"><p>${t("apps.searchEmpty")}</p><${Button} disabled=${full} onClick=${() => openCustom()}>${t("apps.addCustom")}<//></div>`}
        ${nothing && !searching && connectedOnly && html`<div class="page-empty"><span class="page-empty-icon"><${Icon} name="link" size="lg" /></span><h2>${t("apps.connectedEmpty")}</h2><${Button} onClick=${() => setFilter("all")}>${t("apps.goConnect")}<//></div>`}
      `}
    `}
  </section>`;
}
