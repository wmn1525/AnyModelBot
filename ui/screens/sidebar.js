// 侧栏 280（参考 Grok Bot，宽度可以拖右边的分隔条调整）：顶部只有新建按钮，常驻搜索框，
// 机器人行（头像 + 名称 + 时间 + 一行预览；悬停出现"更多"，和右键是同一份菜单），左下角账户（点头像看余额，点齿轮打开设置）。
// 新建在主区的新建页（screens/new-bot.js）；新建页打开时，机器人列表末尾（建好后它就在这）有一行占位，跟着显示头像和名字。
// 机器人和群聊的增删：新行淡入并定位到它（新机器人的头像打个招呼），删掉的行淡出（design/motion.js 的 useListPresence）。
// 群聊排在机器人后面（screens/group.js）；有两个以上机器人时，新建按钮是一个菜单（机器人 / 群聊）。
// 有事在等你时，机器人列表上方多一行「需要你 N」（没事时没有这一行）；机器人行的第二行换成最早那件事。
import { useEffect, useRef, useState } from "preact/hooks";
import { html, Icon, IconButton, Menu, Popover, Skeleton } from "../components/ui.js";
import { BotAvatar } from "../components/avatar.js";
import { GuidePill } from "../components/guide.js";
import { api } from "../lib/api.js";
import { confirmSheet, failed, toast, useStore } from "../lib/store.js";
import { deleteBot } from "../lib/bots.js";
import { useListPresence } from "../design/motion.js";
import { newBotDraft } from "./new-bot.js";
import { prefs, setPrefs } from "../lib/prefs.js";
import { fmtAgo } from "../lib/format.js";
import { MF_TOPUP, usd, accountBalance } from "../lib/links.js";
import { t, useLang } from "../lib/i18n.js";
import { NeedsRow } from "./needs-you.js";
import { catalogFold, catalogSeen, latestOf, setCatalogFold, tr } from "../lib/catalog.js";
import { GroupAvatars } from "./group.js";

/** 余额：一个数字 + 说明。低于提醒线时数字不变色（红字像欠费），只多一行小字 */
export function Balance({ account, note }) {
  return html`<div class="bal">
    <div class="bal-label">${t("sidebar.balance")}</div>
    <div class="bal-amount">${usd(account.balanceUsd)}</div>
    ${account.lowBalance && html`<div class="bal-note"><span class="dot warn"></span>${t("sidebar.belowLine", { amount: usd(account.alerts?.lowBalanceUsd) })}</div>`}
    ${note && html`<div class="bal-note">${note}</div>`}
  </div>`;
}

/**
 * 左下角账户：头像字母 + 名称（登录后是 OKINTO 账户名），旁边是设置齿轮。
 * 余额不常驻：用户反馈一直看到它，会觉得一直在花钱。点头像才弹出来；余额低于提醒线时另有 LowBalance 提示。
 * 没有余额可看时（没登录、不是 OKINTO 托管），点头像和点齿轮一样打开设置。
 */
export function AccountButton({ username, account, settingsOn, onSettings, onModelflare }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const me = ((account && account.state === "signed_in" && account.name) || username || t("sidebar.localUser")).trim();
  const bal = account && (account.unlimitedBalance || account.balanceUsd !== null && account.balanceUsd !== undefined) ? accountBalance(account) : "";
  return html`<button type="button" class=${`account${open ? " on" : ""}`} ref=${ref}
      aria-label=${bal ? t("sidebar.account") : t("sidebar.openSettings")} aria-haspopup=${bal ? "dialog" : undefined} aria-expanded=${bal ? open : undefined}
      onClick=${bal ? () => setOpen((v) => !v) : onSettings}>
      <span class="me" aria-hidden="true">${me.slice(0, 1).toUpperCase()}</span>
      <span class="who">${me}</span>
    </button>
    <${IconButton} icon="gear" iconSize="md" label=${t("sidebar.settingsTitle")} on=${settingsOn} onClick=${onSettings} />
    ${open && bal && html`<${Popover} anchor=${ref.current} prefer="up" width=${260} label=${t("sidebar.account")} onClose=${() => setOpen(false)}>
      <div class="account-pop">
        <div class="account-pop-name">${me}</div>
        <div class="account-pop-bal">
          <${Balance} account=${account} />
          <a class=${`btn sm${account.lowBalance ? " primary" : ""}`} href=${MF_TOPUP} target="_blank" rel="noopener noreferrer">${t("sidebar.topUp")}</a>
        </div>
      </div>
      <div class="foot"><button type="button" onClick=${() => { setOpen(false); onModelflare(); }}>${t("sidebar.accountDetails")}</button></div>
    <//>`}`;
}

/** 余额低于提醒线时，侧栏底部一行安静的提示：不写金额，金额在账户浮层里 */
function LowBalance({ account }) {
  if (!account || !account.lowBalance) return null;
  return html`<a class="side-note" href=${MF_TOPUP} target="_blank" rel="noopener noreferrer" role="status">
    <span class="side-note-main"><span class="dot warn"></span><span class="v">${t("sidebar.lowBalance")}</span><span class="go">${t("sidebar.topUp")}</span></span>
  </a>`;
}

/** 有新版本：点这一行在浏览器里下载这台机器对应的安装包；叉掉后这个版本不再提示，设置 › 关于 里还能找到 */
function UpdateNotice({ update }) {
  const { updateDismissed } = useStore(prefs);
  if (!update || !update.available || updateDismissed === update.latest) return null;
  const text = t("sidebar.update", { version: update.latest });
  return html`<div class="side-note" role="status">
    <a class="side-note-main" href=${update.downloadUrl} target="_blank" rel="noopener noreferrer" title=${text}><span class="dot new"></span><span class="v">${text}</span></a>
    <${IconButton} icon="close" size="xs" iconSize="xs" label=${t("sidebar.updateDismiss")} onClick=${() => setPrefs({ updateDismissed: update.latest })} />
  </div>`;
}

export function Sidebar({ bots, botsError, reloadBots, selectedId, view, previews, pending, working, needs = { n: 0, bots: {} }, username, account, update, onNew, onSelect, onNeeds, onDeleted, onOpenSettings, onBotSettings, onGuide, groups = [], groupsLoaded = true, groupId, onNewGroup, onSelectGroup, onEditGroup, onDeletedGroup, catalog = [], catalogId, onDiscover, onOpenCatalog, searchQuery = "", searchOpen = false, onSearchQuery, onOpenSearch, onCloseSearch }) {
  const lang = useLang();
  const seen = useStore(catalogSeen);
  const fold = useStore(catalogFold);
  const latest = latestOf(catalog);
  const hasNew = catalog.some((e) => !e.instanceId && !seen.includes(e.id));
  const [ctx, setCtx] = useState(null); // 行的操作菜单：右键 { bot, x, y }，或者"更多"按钮 { bot, el }
  const [groupCtx, setGroupCtx] = useState(null); // 群聊行的操作菜单：{ group, x, y } 或 { group, el }
  const [newMenu, setNewMenu] = useState(null); // 新建菜单的锚点
  const [renaming, setRenaming] = useState("");
  const [renameText, setRenameText] = useState("");
  const root = useRef(null);
  const searchRef = useRef(null);
  const renameRef = useRef(null);
  useEffect(() => {
    if (renaming) requestAnimationFrame(() => (renameRef.current?.focus(), renameRef.current?.select()));
  }, [renaming]);

  const rename = async (bot) => {
    const n = renameText.trim();
    setRenaming("");
    if (!n || n === bot.name) return;
    try {
      await api(`/bots/${bot.id}`, { method: "PUT", body: { name: n } });
      reloadBots();
      toast(t("sidebar.renamed"));
    } catch (e) {
      failed(e);
    }
  };
  const del = async (bot) => {
    if (await deleteBot(bot)) onDeleted(bot.id);
  };

  const delGroup = async (g) => {
    if (!(await confirmSheet({ title: t("group.delete.title", { name: g.name }), body: t("group.delete.body"), confirmLabel: t("group.delete.confirm"), danger: true }))) return;
    try {
      await api(`/groups/${encodeURIComponent(g.id)}`, { method: "DELETE" });
      onDeletedGroup?.(g.id);
    } catch (e) {
      failed(e);
    }
  };
  const groupBots = (g) => g.members.map((id) => (bots || []).find((b) => b.id === id)).filter(Boolean);

  const draft = useStore(newBotDraft);
  const botRows = useListPresence(bots);
  const groupRows = useListPresence(groupsLoaded ? groups : null);
  const list = botRows;
  const shownGroups = groupRows;
  // 新行可能在列表下面看不见的地方：滚过去
  const entered = [...botRows, ...groupRows].filter((r) => r.state === "enter").map((r) => r.item.id).join();
  useEffect(() => {
    if (entered || view === "new") root.current?.querySelector(".thread-item.anim-fade-in, .thread.draft")?.scrollIntoView({ block: "nearest" });
  }, [entered, view === "new"]);
  const canGroup = !!bots && bots.length >= 2;

  return html`<aside class="side" ref=${root} aria-label=${t("sidebar.bots")}>
    <div class="side-top">
      <span class="side-brand"><img src="/amb/static/assets/favicon-64.png" alt="" /><span>okbot</span></span>
      <${IconButton} icon="plus" iconSize="md" label=${canGroup ? t("sidebar.newMenu") : t("sidebar.newShortcut")} on=${view === "new"} aria-haspopup=${canGroup ? "menu" : undefined} aria-expanded=${canGroup ? !!newMenu : undefined}
        onClick=${(e) => { if (!canGroup) return onNew(); const el = e.currentTarget; setNewMenu((m) => (m ? null : el)); }} />
    </div>
    <label class="side-search">
      <${Icon} name="search" size="sm" />
      <input ref=${searchRef} type="search" placeholder=${t("search.placeholder")} aria-label=${t("search.title")} data-global-search-entry maxLength="200" value=${searchQuery} onFocus=${() => onOpenSearch?.(false)} onInput=${(e) => { onSearchQuery?.(e.target.value); onOpenSearch?.(false); }}
        onKeyDown=${(e) => { if (e.key === "Escape" && !e.isComposing && searchOpen) { e.preventDefault(); e.stopPropagation(); onCloseSearch?.(); } }} />
    </label>
    <nav class="side-list" aria-label=${t("sidebar.list")}>
      <${NeedsRow} count=${needs.n} on=${view === "needs"} onClick=${onNeeds} />
      ${catalog.length > 0 && html`<button type="button" class=${`thread${view === "discover" ? " sel" : ""}`} aria-current=${view === "discover" ? "page" : undefined} onClick=${onDiscover}>
        <span class="thread-icon"><${Icon} name="spark" size="md" /></span>
        <span class="body"><span class="line"><span class="title">${t("botapp.sidebar.discover")}</span>${hasNew && html`<span class="thread-new-dot" title=${t("botapp.sidebar.new")}></span>`}</span></span>
      </button>
      <div class="side-group"><span class="text t-label">${t("botapp.sidebar.mine")}</span></div>`}
      ${botsError && html`<div class="side-empty"><span>${t("sidebar.loadFailed")}</span><button type="button" class="btn" onClick=${reloadBots}>${t("common.retry")}</button></div>`}
      ${!bots && !botsError && [0, 1, 2].map((k) => html`<div class="thread" key=${k}><${Skeleton} w="38px" circle /><span class="thread-skel"><${Skeleton} w="50%" /><${Skeleton} w="75%" /></span></div>`)}
      ${bots && !bots.length && view !== "new" && html`<div class="side-empty"><span>${t("sidebar.empty")}</span><button type="button" class="btn primary" onClick=${onNew}>${t("sidebar.create")}</button></div>`}
      ${list.map(({ item: b, state: rowState }) => {
        const sel = (view === "chat" || view === "bot-settings" || view === "app") && b.id === selectedId;
        // 等你的：「需要你」里这个机器人的件数和最早那件（没有时退回待审批数）
        const nd = needs.bots[b.id];
        const n = nd?.n || pending[b.id] || 0;
        if (renaming === b.id)
          return html`<div class="thread sel" key=${b.id}><${BotAvatar} bot=${b} size=${38} />
            <input class="field" value=${renameText} aria-label=${t("sidebar.newName")} ref=${renameRef}
              onInput=${(e) => setRenameText(e.target.value)} onBlur=${() => rename(b)}
              onKeyDown=${(e) => { if (e.isComposing || e.keyCode === 229) return; if (e.key === "Enter" && !e.isComposing && e.keyCode !== 229) e.target.blur(); if (e.key === "Escape") { e.stopPropagation(); setRenaming(""); } }} /></div>`;
        const pv = previews[b.id];
        const menuOpen = !!(ctx && ctx.el && ctx.bot.id === b.id);
        const rowFx = rowState === "enter" ? " anim-fade-in" : rowState === "leave" ? " anim-fade-out" : "";
        return html`<div class=${`thread-item${rowFx}`} key=${b.id} inert=${rowState === "leave" || undefined}>
          <button type="button" class=${`thread bot-hover${sel && rowState !== "leave" ? " sel" : ""}`} aria-current=${sel ? "page" : undefined}
            onClick=${() => onSelect(b.id)} onContextMenu=${(e) => { e.preventDefault(); setCtx({ bot: b, x: e.clientX, y: e.clientY }); }}>
            <span class="avatar-wrap"><${BotAvatar} bot=${b} size=${38} greet=${rowState === "enter"} state=${n > 0 ? "waiting" : working[b.id] ? "working" : "idle"} />${working[b.id] && html`<span class="working-dot" title=${t("sidebar.working")}></span>`}</span>
            <span class="body">
              <span class="line"><span class="title">${b.name}</span>${pv?.at && html`<span class="when num">${fmtAgo(pv.at)}</span>`}</span>
              <span class="line"><span class="snip">${nd?.line || (working[b.id] ? t("sidebar.workingNow") : pv?.text || t("sidebar.noChats"))}</span>${n > 0 && html`<span class="badge count" title=${t("sidebar.needs", { count: n })}>${n}</span>`}</span>
            </span>
          </button>
          <${IconButton} icon="more" class="thread-more" label=${t("sidebar.moreFor", { name: b.name })} aria-haspopup="menu" aria-expanded=${menuOpen}
            onClick=${(e) => { const el = e.currentTarget; setCtx((c) => (c && c.el && c.bot.id === b.id ? null : { bot: b, el })); }} />
        </div>`;
      })}
      ${view === "new" && html`<div class="thread sel draft anim-fade-in" aria-current="page"><${BotAvatar} char=${draft?.avatar} neutral size=${38} />
        <span class="body"><span class="line"><span class="title">${draft?.name || t("sidebar.newBot")}</span></span><span class="line"><span class="snip">${t("sidebar.creating")}</span></span></span></div>`}
      ${bots && shownGroups.map(({ item: g, state: rowState }) => {
        const sel = view === "group" && g.id === groupId && rowState !== "leave";
        const who = g.last?.botId ? (bots.find((b) => b.id === g.last.botId)?.name ?? "") : "";
        const line = g.running && g.current ? t("group.working", { name: bots.find((b) => b.id === g.current)?.name ?? "" }) : g.last ? `${who ? `${who}: ` : ""}${g.last.text.replace(/^⚠️\s*/, "").replace(/\s+/g, " ")}` : t("group.noMessages");
        const menuOpen = !!(groupCtx && groupCtx.el && groupCtx.group.id === g.id);
        const rowFx = rowState === "enter" ? " anim-fade-in" : rowState === "leave" ? " anim-fade-out" : "";
        return html`<div class=${`thread-item${rowFx}`} key=${"g" + g.id} inert=${rowState === "leave" || undefined}>
          <button type="button" class=${`thread${sel ? " sel" : ""}`} aria-current=${sel ? "page" : undefined}
            onClick=${() => onSelectGroup(g.id)} onContextMenu=${(e) => { e.preventDefault(); setGroupCtx({ group: g, x: e.clientX, y: e.clientY }); }}>
            <span class="avatar-wrap"><${GroupAvatars} bots=${groupBots(g)} size=${38} pile />${g.running && html`<span class="working-dot" title=${t("sidebar.working")}></span>`}</span>
            <span class="body">
              <span class="line"><span class="title">${g.name}</span>${g.last?.at && html`<span class="when num">${fmtAgo(g.last.at)}</span>`}</span>
              <span class="line"><span class="snip">${line}</span></span>
            </span>
          </button>
          <${IconButton} icon="more" class="thread-more" label=${t("sidebar.moreFor", { name: g.name })} aria-haspopup="menu" aria-expanded=${menuOpen}
            onClick=${(e) => { const el = e.currentTarget; setGroupCtx((c) => (c && c.el && c.group.id === g.id ? null : { group: g, el })); }} />
        </div>`;
      })}
      ${latest.length > 0 && html`<button type="button" class="side-group text" aria-expanded=${!fold} onClick=${() => setCatalogFold(!fold)}>
        <span class="text t-label">${t("botapp.sidebar.latest")}</span><${Icon} name=${fold ? "chevRight" : "chevDown"} size="sm" />
      </button>
      ${!fold && latest.map((e) => html`<button type="button" key=${"c" + e.id} class=${`thread bot-hover${view === "preview" && catalogId === e.id ? " sel" : ""}`} aria-current=${view === "preview" && catalogId === e.id ? "page" : undefined} onClick=${() => onOpenCatalog(e)}>
        <span class="avatar-wrap"><${BotAvatar} char=${e.avatar} size=${38} /></span>
        <span class="body">
          <span class="line"><span class="title">${tr(e.name, lang)}</span>${!seen.includes(e.id) && html`<span class="thread-new-dot" title=${t("botapp.sidebar.new")}></span>`}</span>
          <span class="line"><span class="snip">${tr(e.summary, lang)}</span></span>
        </span>
      </button>`)}`}
    </nav>
    <${UpdateNotice} update=${update} />
    <${LowBalance} account=${account} />
    ${bots && bots.length > 0 && html`<${GuidePill} onGo=${onGuide} />`}
    <div class="side-foot"><${AccountButton} username=${username} account=${account} onSettings=${() => onOpenSettings()} onModelflare=${() => onOpenSettings("modelflare")} /></div>
    ${ctx && html`<${Menu} anchor=${ctx.el || { left: ctx.x, right: ctx.x, top: ctx.y, bottom: ctx.y, width: 0 }} align=${ctx.el ? "right" : undefined}
      width=${200} label=${t("sidebar.actionsFor", { name: ctx.bot.name })} onClose=${() => setCtx(null)}
      items=${[
        ...(onBotSettings ? [{ label: t("sidebar.menu.settings"), onSelect: () => onBotSettings(ctx.bot.id) }, { sep: true }] : []),
        { label: t("common.rename"), onSelect: () => { setRenameText(ctx.bot.name); setRenaming(ctx.bot.id); } },
        { label: t("sidebar.menu.copyId"), onSelect: () => navigator.clipboard?.writeText(ctx.bot.id).then(() => toast(t("common.copied"))).catch(failed) },
        { sep: true },
        { label: t("sidebar.menu.delete"), danger: true, onSelect: () => del(ctx.bot) },
      ]} />`}
    ${groupCtx && html`<${Menu} anchor=${groupCtx.el || { left: groupCtx.x, right: groupCtx.x, top: groupCtx.y, bottom: groupCtx.y, width: 0 }} align=${groupCtx.el ? "right" : undefined}
      width=${200} label=${t("sidebar.groupActionsFor", { name: groupCtx.group.name })} onClose=${() => setGroupCtx(null)}
      items=${[
        { label: t("sidebar.groupEdit"), onSelect: () => onEditGroup(groupCtx.group) },
        { sep: true },
        { label: t("sidebar.menu.delete"), danger: true, onSelect: () => delGroup(groupCtx.group) },
      ]} />`}
    ${newMenu && html`<${Menu} anchor=${newMenu} align="right" width=${180} label=${t("sidebar.newMenu")} onClose=${() => setNewMenu(null)}
      items=${[
        { label: t("sidebar.newBotItem"), onSelect: onNew },
        { label: t("sidebar.newGroupItem"), onSelect: onNewGroup },
      ]} />`}
  </aside>`;
}
