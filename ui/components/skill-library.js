// 「应用与技能」页的「技能」标签（screens/apps.js 里切换）：分类胶囊 → 按分类分节的两列列表 → 第三方声明；
// 点一行开右侧半屏的详情，悬停头像或作者标签出作者浮层。文案在 ui/locales/<语言>/skills.js，清单见 lib/skill-library.js。
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { html, Button, Icon, Popover, Sheet, Spinner } from "./ui.js";
import { toast } from "../lib/store.js";
import { t, useLang } from "../lib/i18n.js";
import {
  authorName, avatarSrc, avatarState, categoryName, copyText, initialOf, installPrompt, matchesSkill, openExternal, repoUrl, setAvatarState, skillText,
} from "../lib/skill-library.js";

/** 打开 GitHub：浏览器打不开时把地址复制下来 */
export function openGithub(url) {
  if (openExternal(url)) return;
  copyText(url).catch(() => undefined);
  toast(t("skills.toast.openFailed", { url }), "err");
}

/** 作者头像：进入可视区域才加载（之前是灰色占位），取不到或 3 秒没加载出来显示首字母；运行期间同一头像只请求一次 */
export function SkillAvatar({ author, big }) {
  const ref = useRef(null);
  const [state, setState] = useState(() => avatarState(author.id) || "idle");
  useEffect(() => {
    if (state !== "idle") return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return setState("loading");
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        setState(avatarState(author.id) || "loading");
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [state, author.id]);
  useEffect(() => {
    if (state !== "loading") return;
    const timer = setTimeout(() => {
      setAvatarState(author.id, "fail");
      setState(avatarState(author.id));
    }, 3000);
    return () => clearTimeout(timer);
  }, [state, author.id]);
  const done = (ok) => {
    setAvatarState(author.id, ok ? "ok" : "fail");
    setState(avatarState(author.id));
  };
  return html`<span class=${`skill-avatar${big ? " big" : ""}${state === "fail" ? " initial" : ""}`} ref=${ref} role="img" aria-label=${t("skills.author.avatar", { name: authorName(author) })}>
    ${(state === "loading" || state === "ok") && html`<img src=${avatarSrc(author.id)} alt="" class=${state === "ok" ? "on" : ""} referrerpolicy="no-referrer" onLoad=${() => done(true)} onError=${() => done(false)} />`}
    ${state === "fail" && html`<span aria-hidden="true">${initialOf(author)}</span>`}
  </span>`;
}

function Marks({ s }) {
  return s.marks.slice(0, 2).map((m) => html`<span key=${m} class="skill-mark" title=${t(`skills.markTips.${m}`)} aria-label=${t("skills.markAria", { label: t(`skills.marks.${m}`), tip: t(`skills.markTips.${m}`) })} tabindex="0">${t(`skills.marks.${m}`)}</span>`);
}

/** 标签（可点）：GitHub 打开原仓库，作者昵称筛选这位作者；标记（不可点）排在后面 */
function Tags({ s, lib, onAuthor, hover }) {
  const a = lib.authors[s.author];
  return html`<span class="skill-tags">
    <button type="button" class="skill-tag" aria-label=${t("skills.openRepoLabel", { name: s.id })} onClick=${(e) => (e.stopPropagation(), openGithub(repoUrl(s)))}>GitHub</button>
    <button type="button" class="skill-tag" aria-label=${t("skills.filterAuthorLabel", { name: authorName(a) })} onClick=${(e) => (e.stopPropagation(), onAuthor(a.id))}
      onMouseEnter=${(e) => hover?.enter(a, e.currentTarget)} onMouseLeave=${() => hover?.leave()}>${authorName(a)}</button>
    <${Marks} s=${s} />
  </span>`;
}

const tryLine = (s) => t("skills.tryLine", { text: skillText(s, "try") });

function SkillRow({ s, lib, copied, onOpen, onCopy, onAuthor, hover }) {
  const a = lib.authors[s.author];
  const stop = (fn) => (e) => {
    e.stopPropagation();
    fn(e);
  };
  return html`<div class="skill-row" tabindex="0" role="group" data-skill=${s.id} aria-label=${t("skills.nameTitle", { name: s.id, title: skillText(s, "title") })}
    onClick=${(e) => onOpen(s, e.currentTarget)} onKeyDown=${(e) => e.key === "Enter" && e.target === e.currentTarget && (e.preventDefault(), onOpen(s, e.currentTarget))}>
    <button type="button" class="skill-row-avatar" aria-label=${t("skills.author.show", { name: authorName(a) })}
      onClick=${stop((e) => hover.pin(a, e.currentTarget))} onMouseEnter=${(e) => hover.enter(a, e.currentTarget)} onMouseLeave=${() => hover.leave()}>
      <${SkillAvatar} author=${a} />
    </button>
    <span class="skill-row-text">
      <span class="skill-row-title">${t("skills.nameTitle", { name: s.id, title: skillText(s, "title") })}</span>
      <span class="skill-row-sub">${skillText(s, "summary")}</span>
      <span class="skill-row-sub">${tryLine(s)}</span>
      <${Tags} s=${s} lib=${lib} onAuthor=${onAuthor} hover=${hover} />
    </span>
    <span class="skill-row-actions">
      <${Button} size="sm" class="skill-act" aria-label=${t("skills.openRepoLabel", { name: s.id })} onClick=${stop(() => openGithub(s.url))}>GitHub<${Icon} name="ext" size="xs" /><//>
      <${Button} size="sm" class="skill-act" aria-label=${t("skills.copyLabel", { name: s.id })} onClick=${stop(() => onCopy(s))}>${copied ? t("skills.copied") : t("skills.copy")}<//>
    </span>
  </div>`;
}

/** 作者浮层：悬停 300ms 出现，点头像固定；移开或 Esc 关闭 */
/** 「技能库中 {n} 个技能 · 主要分类」 */
function authorMeta(a) {
  const main = a.main.map(categoryName);
  const list = typeof Intl.ListFormat === "function" ? new Intl.ListFormat(document.documentElement.lang || undefined, { style: "narrow", type: "conjunction" }).format(main) : main.join(", ");
  return `${t("skills.author.count", { count: a.count })}${main.length ? ` · ${list}` : ""}`;
}

function AuthorPop({ pop, lib, onClose, onAuthor, hover }) {
  const a = pop.author;
  return html`<${Popover} anchor=${pop.anchor} onClose=${onClose} width=${300} keepFocus=${!pop.pinned} label=${authorName(a)} class="skill-author-pop-wrap">
    <div class="skill-author-pop" onMouseEnter=${() => hover.stay()} onMouseLeave=${() => hover.leave()}>
      <div class="skill-author-head">
        <${SkillAvatar} author=${a} big />
        <div class="skill-author-names"><strong>${authorName(a)}</strong><span>@${a.id}</span></div>
      </div>
      ${a.bio && html`<p class="skill-author-bio">${a.bio}</p>`}
      <p class="skill-author-meta">${authorMeta(a)}</p>
      <div class="skill-author-actions">
        <${Button} size="sm" onClick=${() => (onAuthor(a.id), onClose())}>${t("skills.author.only")}<//>
        <${Button} size="sm" onClick=${() => openGithub(`https://github.com/${a.id}`)}>${t("skills.author.profile")}<${Icon} name="ext" size="xs" /><//>
      </div>
      <p class="skill-author-from">${t("skills.author.from")}</p>
    </div>
  <//>`;
}

/** 作者浮层的开关：悬停 300ms 打开，离开 200ms 后关（移进浮层不关），点头像固定 */
function useAuthorHover() {
  const [pop, setPop] = useState(null);
  const timer = useRef(0);
  const clear = () => clearTimeout(timer.current);
  const hover = useMemo(() => ({
    enter(author, anchor) {
      clear();
      timer.current = setTimeout(() => setPop((p) => (p?.pinned ? p : { author, anchor, pinned: false })), 300);
    },
    leave() {
      clear();
      timer.current = setTimeout(() => setPop((p) => (p?.pinned ? p : null)), 200);
    },
    stay: clear,
    pin(author, anchor) {
      clear();
      setPop((p) => (p?.pinned && p.author.id === author.id ? null : { author, anchor, pinned: true }));
    },
  }), []);
  useEffect(() => clear, []);
  return [pop, () => (clear(), setPop(null)), hover];
}

function Section({ title, count, children }) {
  return html`<section class="skill-sec">
    <div class="skill-sec-head"><h2 class="discover-part">${title}</h2><span class="skill-sec-count">${t("skills.sectionCount", { count })}</span></div>
    <div class="skill-grid">${children}</div>
  </section>`;
}

/**
 * 「技能」标签的内容。q：页面的搜索词；category / author：分类胶囊和作者筛选（由页面保存，切标签时保留）。
 * onEmptyClear：搜索无结果时的「清空搜索」。
 */
export function SkillsPanel({ lib, error, onRetry, q, category, onCategory, author, onAuthor, onClearSearch }) {
  const lang = useLang();
  const [detail, setDetail] = useState(null); // { id, manual }
  const [copied, setCopied] = useState("");
  const [pop, closePop, hover] = useAuthorHover();
  const copiedTimer = useRef(0);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  const copy = async (s, inDetail = false) => {
    try {
      await copyText(installPrompt(s));
      setCopied(s.id);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(""), 1500);
      toast(t("skills.toast.copied"));
    } catch {
      toast(t("skills.toast.copyFailed"), "err");
      // 列表项上失败：直接打开详情并全选指令；详情里失败：指令展开成多行并全选
      setDetail({ id: s.id, manual: true, nonce: Date.now(), inDetail });
    }
  };

  if (error) {
    return html`<div class="page-empty skill-empty"><h2>${t("skills.loadFailed.title")}</h2><p>${t("skills.loadFailed.body")}</p><${Button} onClick=${onRetry}>${t("skills.loadFailed.retry")}<//></div>`;
  }
  if (!lib) return html`<div class="skill-loading"><${Spinner} /></div>`;

  const searched = lib.skills.filter((s) => matchesSkill(s, q, lib) && (!author || s.author === author));
  const shown = category === "all" ? searched : searched.filter((s) => s.category === category);
  const countOf = (c) => searched.filter((s) => s.category === c).length;
  const authorObj = author ? lib.authors[author] : null;
  const current = detail && lib.skills.find((s) => s.id === detail.id);
  const open = (s) => setDetail({ id: s.id, manual: false });
  const row = (s) => html`<${SkillRow} key=${s.id} s=${s} lib=${lib} copied=${copied === s.id} onOpen=${open} onCopy=${copy} onAuthor=${onAuthor} hover=${hover} />`;

  return html`<div class="skill-panel" data-lang=${lang}>
    <div class="skill-pills" role="radiogroup" aria-label=${t("skills.categoryLabel")}>
      ${authorObj && html`<span class="skill-author-chip">${t("skills.authorFilter", { name: authorName(authorObj) })}
        <button type="button" class="icon-btn xs" aria-label=${t("skills.clearAuthor")} title=${t("skills.clearAuthor")} onClick=${() => onAuthor("")}><${Icon} name="close" size="xs" /></button></span>`}
      ${[["all", t("skills.allCategories"), searched.length], ...lib.categories.map((c) => [c, categoryName(c), countOf(c)])].map(([v, label, n]) => html`<button type="button" key=${v} role="radio" aria-checked=${category === v}
        class=${`skill-pill${category === v ? " on" : ""}`} onClick=${() => onCategory(v)}>${label}<span class="skill-pill-n">${n}</span></button>`)}
    </div>
    ${!shown.length
      ? html`<div class="page-empty skill-empty">
          <h2>${q.trim() ? t("skills.empty.title", { query: q.trim() }) : t("skills.empty.none")}</h2>
          <p>${t("skills.empty.body")}</p>
          ${q.trim() ? html`<${Button} onClick=${onClearSearch}>${t("skills.empty.clear")}<//>` : html`<${Button} onClick=${() => (onCategory("all"), onAuthor(""))}>${t("skills.allCategories")}<//>`}
        </div>`
      : category === "all"
        ? lib.categories.map((c) => {
            const list = shown.filter((s) => s.category === c);
            return list.length ? html`<${Section} key=${c} title=${categoryName(c)} count=${list.length}>${list.map(row)}<//>` : null;
          })
        : html`<${Section} title=${categoryName(category)} count=${shown.length}>${shown.map(row)}<//>`}
    <p class="skill-notice">${t("skills.notice.page")}</p>
    ${pop && html`<${AuthorPop} pop=${pop} lib=${lib} onClose=${closePop} onAuthor=${onAuthor} hover=${hover} />`}
    ${current && html`<${SkillDetail} key=${current.id} s=${current} lib=${lib} manual=${detail.manual} nonce=${detail.nonce} copied=${copied === current.id}
      onCopy=${(s) => copy(s, true)} onAuthor=${(id) => (setDetail(null), onAuthor(id))} onClose=${() => setDetail(null)} />`}
  </div>`;
}

/** 技能详情：右侧半屏（窄窗口占满），Esc 或点遮罩关闭，关闭后焦点回到原来那一行 */
function SkillDetail({ s, lib, manual, nonce, copied, onCopy, onAuthor, onClose }) {
  const a = lib.authors[s.author];
  const prompt = installPrompt(s);
  const area = useRef(null);
  useEffect(() => {
    if (!manual) return;
    requestAnimationFrame(() => {
      area.current?.focus();
      area.current?.select();
    });
  }, [manual, nonce]);
  const license = s.license === "custom" ? t("skills.detail.customLicense") : s.license;
  const title = skillText(s, "title");
  return html`<${Sheet} onClose=${onClose} label=${t("skills.nameTitle", { name: s.id, title })} class="skill-drawer">
    <div class="skill-drawer-body">
      <div class="skill-drawer-top">
        <button type="button" class="icon-btn skill-drawer-close" aria-label=${t("common.close")} title=${t("common.close")} onClick=${onClose}><${Icon} name="close" size="md" /></button>
      </div>
      <header class="skill-detail-head">
        <${SkillAvatar} author=${a} />
        <div class="skill-detail-names">
          <h2>${s.id}</h2>
          <p>${title}</p>
          <${Tags} s=${s} lib=${lib} onAuthor=${onAuthor} />
        </div>
      </header>
      <div class="skill-detail-actions">
        <${Button} variant="primary" data-autofocus aria-label=${t("skills.copyLabel", { name: s.id })} onClick=${() => onCopy(s)}>${copied ? t("skills.copied") : t("skills.copy")}<//>
        <${Button} onClick=${() => openGithub(s.url)}>GitHub<${Icon} name="ext" size="xs" /><//>
      </div>
      ${manual
        ? html`<textarea class="field skill-prompt multi" ref=${area} readonly rows="3" value=${prompt} aria-label=${t("skills.detail.promptLabel")}></textarea>`
        : html`<input class="field skill-prompt" readonly value=${prompt} aria-label=${t("skills.detail.promptLabel")} onFocus=${(e) => e.currentTarget.select()} />`}
      <p class="hint skill-prompt-note">${t("skills.detail.promptNote")}</p>
      <section class="skill-detail-sec"><h3>${t("skills.detail.about")}</h3><p>${skillText(s, "summary")}</p></section>
      <section class="skill-detail-sec"><h3>${t("skills.detail.howTo")}</h3><p>${tryLine(s)}</p></section>
      ${s.marks.length > 0 && html`<section class="skill-detail-sec"><h3>${t("skills.detail.labels")}</h3>
        <ul class="skill-detail-marks">${s.marks.map((m) => html`<li key=${m}><span class="skill-mark">${t(`skills.marks.${m}`)}</span><span>${t(`skills.markTips.${m}`)}</span></li>`)}</ul></section>`}
      <section class="skill-detail-sec"><h3>${t("skills.detail.author")}</h3>
        <div class="skill-author-card">
          <${SkillAvatar} author=${a} />
          <div class="skill-author-names"><strong>${authorName(a)}</strong><span>@${a.id}</span></div>
          ${a.bio && html`<p class="skill-author-bio">${a.bio}</p>`}
          <p class="skill-author-meta">${authorMeta(a)}</p>
          <div class="skill-author-actions">
            <${Button} size="sm" onClick=${() => onAuthor(a.id)}>${t("skills.author.only")}<//>
            <${Button} size="sm" onClick=${() => openGithub(`https://github.com/${a.id}`)}>${t("skills.author.profile")}<${Icon} name="ext" size="xs" /><//>
          </div>
        </div>
      </section>
      <section class="skill-detail-sec"><h3>${t("skills.detail.source")}</h3>
        <dl class="skill-source">
          <div><dt>${t("skills.detail.repo")}</dt><dd><a href=${repoUrl(s)} onClick=${(e) => (e.preventDefault(), openGithub(repoUrl(s)))}>${s.repo}</a></dd></div>
          <div><dt>${t("skills.detail.path")}</dt><dd class="mono">${s.path || t("skills.detail.root")}</dd></div>
          <div><dt>${t("skills.detail.license")}</dt><dd>${license}</dd></div>
          <div><dt>${t("skills.detail.stars", { date: lib.checkedAt })}</dt><dd>${s.stars}</dd></div>
        </dl>
      </section>
      ${s.license === "custom" && html`<p class="skill-license-note">${t("skills.detail.licenseNote", { license })}</p>`}
      <p class="skill-notice">${t("skills.notice.detail")}</p>
    </div>
  <//>`;
}
