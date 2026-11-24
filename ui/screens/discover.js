// 发现页：一句话说明、精选、上新，然后是"企业应用与场景"，最后是模板入口。点工具卡片直接打开 Bot，点开就是示例界面，
// 不单独做详情页（docs/bot-framework.md）。工具卡片上面是封面（Bot 目录里的 cover/light.png、cover/dark.png，打包成 thumbs，
// 跟着主题换），下面是头像、名字和一句话。精选是两列的大卡，其余是三列的小卡；没有封面的退回头像。
// 企业分区只是咨询入口：六类工作场景卡片打开"需求与反馈"的企业与合作（带本人点的场景），不是机器人、不连接任何企业系统，
// 也不暗示即点即用（只有一处"具体支持范围以接入评估为准"）。
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { html, Icon } from "../components/ui.js";
import { BotAvatar } from "../components/avatar.js";
import { templateFlow } from "../lib/template-flow.js";
import { FEEDBACK_SCENARIOS, openFeedback } from "../lib/feedback.js";
import { tr } from "../lib/catalog.js";
import { t, useLang } from "../lib/i18n.js";
import { fold } from "../lib/text-fold.js";

/** 目录多到一屏放不下才有搜索框 */
const SEARCH_MIN = 12;

const themeNow = () => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");
/** <html data-theme> 总是解析后的值（跟随系统时也会变）：看着它换封面 */
function useTheme() {
  const [theme, setTheme] = useState(themeNow);
  useEffect(() => {
    const mo = new MutationObserver(() => setTheme(themeNow()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  return theme;
}

function Cover({ entry, theme, big }) {
  const hash = entry.thumbs?.[theme] || entry.thumbs?.light || entry.thumbs?.dark;
  const [broken, setBroken] = useState("");
  return html`<span class="discover-cover">
    ${hash && broken !== hash
      ? html`<img src=${`/amb/botapp/thumb/${hash}`} alt="" loading="lazy" decoding="async" onError=${() => setBroken(hash)} />`
      : html`<${BotAvatar} char=${entry.avatar} size=${big ? 88 : 72} />`}
  </span>`;
}

function Card({ entry, lang, theme, big, onOpen }) {
  return html`<button type="button" class=${`discover-card${big ? " big" : ""}`} onClick=${() => onOpen(entry)}>
    <${Cover} entry=${entry} theme=${theme} big=${big} />
    <span class="discover-meta">
      <${BotAvatar} char=${entry.avatar} size=${big ? 36 : 32} />
      <span class="discover-text"><span class="title">${tr(entry.name, lang)}</span><span class="summary">${tr(entry.summary, lang)}</span></span>
    </span>
  </button>`;
}

/** 企业应用与场景：标题、介绍、主动作，下面六类场景（3×2，窄窗两列或一列） */
function BusinessSection() {
  return html`<section class="discover-sec discover-biz" aria-labelledby="discover-biz-title">
    <div class="discover-biz-head">
      <div class="discover-biz-text"><h2 class="discover-biz-title" id="discover-biz-title">${t("feedback.discover.title")}</h2><p>${t("feedback.discover.intro")}</p></div>
      <button type="button" class="btn primary discover-biz-action" aria-haspopup="dialog" onClick=${() => openFeedback({ source: "discover_business" })}>${t("feedback.discover.action")}</button>
    </div>
    <div class="discover-biz-grid">
      ${FEEDBACK_SCENARIOS.map((id) => html`<button type="button" key=${id} class="discover-biz-card" aria-haspopup="dialog" onClick=${() => openFeedback({ source: "discover_scenario", scenarioId: id })}>
        <span class="title">${t(`feedback.scenario.${id}.name`)}</span>
        <span class="desc">${t(`feedback.scenario.${id}.desc`)}</span>
        <span class="keywords">${t(`feedback.scenario.${id}.keywords`)}</span>
        <span class="ask">${t("feedback.discover.ask")} ›</span>
      </button>`)}
    </div>
    <p class="hint discover-biz-scope">${t("feedback.discover.scope")}</p>
  </section>`;
}

export function DiscoverScreen({ catalog, onOpen, onTemplates }) {
  const lang = useLang();
  const root = useRef(null);
  useLayoutEffect(() => { const el = root.current; el.scrollTop = templateFlow.get().discoverScroll; return () => templateFlow.set((s) => ({ ...s, discoverScroll: el.scrollTop })); }, []);
  const theme = useTheme();
  const [q, setQ] = useState("");
  const list = catalog || [];
  const needle = fold(q.trim());
  const hits = useMemo(() => {
    if (!needle) return list;
    return list.filter((e) => [tr(e.name, lang), tr(e.summary, lang), ...e.skills.map((s) => s.name)].some((x) => fold(x).includes(needle)));
  }, [list, needle, lang]);
  const featured = needle ? [] : hits.filter((e) => e.featured);
  const rest = needle ? hits : hits.filter((e) => !e.featured);
  const cards = (items, big) => items.map((e) => html`<${Card} key=${e.id} entry=${e} lang=${lang} theme=${theme} big=${big} onOpen=${onOpen} />`);
  return html`<section class="discover" ref=${root} data-screen="discover">
    <header class="discover-head">
      <h1 class="t-page">${t("botapp.discover.title")}</h1>
      <p>${t("botapp.discover.lead")}</p>
      ${list.length >= SEARCH_MIN && html`<label class="side-search discover-search"><${Icon} name="search" size="sm" />
        <input type="search" placeholder=${t("common.search")} aria-label=${t("common.search")} value=${q} onInput=${(e) => setQ(e.target.value)} /></label>`}
    </header>
    ${featured.length > 0 && html`<section class="discover-sec"><h2 class="discover-part">${t("botapp.discover.featured")}</h2><div class="discover-grid big">${cards(featured, true)}</div></section>`}
    ${rest.length > 0 && html`<section class="discover-sec"><h2 class="discover-part">${t("botapp.discover.latest")}</h2><div class="discover-grid">${cards(rest, false)}</div></section>`}
    ${!hits.length && html`<p class="hint">${t("botapp.discover.empty")}</p>`}
    ${!needle && html`<${BusinessSection} />`}
    <button type="button" class="template-entry" onClick=${onTemplates}><span><b>${t("templates.discoverEntry")}</b><small>${t("templates.entryHint")}</small></span><span>${t("templates.seeAll")}</span></button>
  </section>`;
}
