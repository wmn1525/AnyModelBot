// 侧栏 280（参考 Grok Bot，宽度可以拖右边的分隔条调整）：顶部只有新建按钮，常驻搜索框，
// 机器人行（头像 + 名称 + 时间 + 一行预览；悬停出现"更多"，和右键是同一份菜单），左下角账户（点头像看余额，点齿轮打开设置）。
// 新建在主区的新建页（screens/new-bot.js）；新建页打开时，机器人列表末尾（建好后它就在这）有一行占位，跟着显示头像和名字。
// 机器人和群聊的增删：新行淡入并定位到它（新机器人的头像打个招呼），删掉的行淡出（design/motion.js 的 useListPresence）。
// 群聊排在机器人后面（screens/group.js）；有两个以上机器人时，新建按钮是一个菜单（机器人 / 群聊）。
// 搜索框下面是固定的导航（和设置导航同一种行）：「发现」，有事在等你时下面多一行「需要你 N」（没事时没有这一行）；
// 导航之下才是可滚动的「我的」列表。有事在等的机器人，行的第二行换成最早那件事。
import { useEffect, useRef, useState } from "preact/hooks";
import { html, Icon, IconButton, Menu, Popover, Skeleton } from "../components/ui.js";
import { BotAvatar } from "../components/avatar.js";
import { GuidePill } from "../components/guide.js";
import { api } from "../lib/api.js";
import { updateDescription, updateError } from "../components/app-update.js";
import { openWhatsNew } from "../components/whats-new.js";
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
import { AccountLogin } from "./onboarding.js";
import { previewText } from "../lib/errors.js";
import { GroupAvatars } from "./group.js";

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

/** 余额：一个数字 + 说明。低于提醒线时数字不变色（红字像欠费），只多一行小字 */
export function Balance({ account, note }) {
  return html`<div class="bal">
    <div class="bal-label">${t("sidebar.balance")}</div>
    <div class="bal-amount">${accountBalance(account)}</div>
    ${account.lowBalance && html`<div class="bal-note"><span class="dot warn"></span>${t("sidebar.belowLine", { amount: usd(account.alerts?.lowBalanceUsd) })}</div>`}
    ${note && html`<div class="bal-note">${note}</div>`}
  </div>`;
}

/** Bot 额度的圆环：剩余百分比画成一段弧（12 点起顺时针），中性色；0% 时只剩底圈 */
export function QuotaRing({ percent }) {
  const r = 6;
  const c = 2 * Math.PI * r;
  const p = Math.min(100, Math.max(0, Number(percent) || 0));
  return html`<svg class="quota-ring" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <circle class="quota-ring-track" cx="8" cy="8" r=${r} />
    ${p > 0 && html`<circle class="quota-ring-arc" cx="8" cy="8" r=${r} stroke-dasharray=${`${((c * p) / 100).toFixed(2)} ${c.toFixed(2)}`} transform="rotate(-90 8 8)" />`}
  </svg>`;
}

/**
 * 点圆环弹出的卡片：顶上一行说明 Bot 额度只能在 AnyModelBot 里用；Bot 额度剩余百分比、账户余额（两位小数）；
 * 充值入口，下面一行小字说订阅套餐另送 Bot 额度。
 * 那一行叫"余额"不叫"充值额度"：账户余额里还有 Modelflare 的赠额，不全是充值的钱。
 */
export function BotQuotaCard({ account }) {
  const bot = account.bot;
  return html`<div class="account-menu quota-card">
    <p class="quota-scope">${t("sidebar.botQuotaScope")}</p>
    <div class="quota-row"><span>${t("sidebar.botQuota")}</span><span class="num">${t("sidebar.botLeft", { percent: bot.remainingPercent })}</span></div>
    <div class="quota-row"><span>${t("sidebar.balance")}</span><span class="num">${usd(account.balanceUsd, 2)}</span></div>
    ${account.lowBalance && html`<div class="quota-note"><span class="dot warn"></span>${t("sidebar.belowLine", { amount: usd(account.alerts?.lowBalanceUsd) })}</div>`}
    <hr />
    <a href=${account.topupUrl || MF_TOPUP} target="_blank" rel="noopener noreferrer"><span>${t("firstUse.topUp")}</span><span class="hint">${t("sidebar.subscribeBonus")}</span></a>
  </div>`;
}

/**
 * 左下角账户区（第 12、10、19 项）：
 * - 头像 + 昵称常驻，整行可点（悬停、打开时只有头像变深，不给整行铺底），向上展开菜单：设置、意见和反馈、检查更新、
 *   分隔线、退出登录（顺序固定）。设置只放在这个菜单里（还有 ⌘, 快捷键），账户行旁边不再单独摆齿轮。
 *   菜单贴着整个账户区往上开、和账户区一样宽，不盖住上面的余额条。
 * - 上面一条：登录了 Modelflare 时是余额 + 充值（低于提醒线时多一行"余额较低"，充值一直能点，不用先关掉提示）；
 *   用自己的 API Key、没登录 Modelflare 时是"登录 Modelflare"的独立入口，不显示不存在的余额。
 * - 余额加载中 / 读取失败不显示成 0；名字缺失时显示"我的账号"，不拿内部生成的用户名冒充昵称。
 * - 有 Bot 额度的账户：余额那一条换成圆环 + "Bot 额度 剩余 N%"，点开是额度卡片（打开时刷新一次）。没有 Bot 额度
 *   （或连的是还不返回这个字段的服务端）时这一条和以前完全一样。
 */
export function AccountButton({ account, onSettings, update, onUpdateChanged }) {
  const [open, setOpen] = useState(false);
  const [login, setLogin] = useState(false);
  const [quota, setQuota] = useState(false);
  const quotaRef = useRef(null);
  const [check, setCheck] = useState(""); // 这次手动检查的结果：checking / latest / failed（没检查过时为空，不说"已是最新"）
  const [leaving, setLeaving] = useState(false);
  const ref = useRef(null);
  const stackRef = useRef(null);
  const loginRef = useRef(null);
  const signedIn = account?.state === "signed_in";
  const hasBalance = signedIn || account?.source === "key" && (account.unlimitedBalance || account.balanceUsd != null);
  const me = (signedIn && account.name?.trim()) || t("firstUse.myAccount");
  const changed = () => window.dispatchEvent(new Event("amb-connection-change"));
  const phase = update?.phase;
  const ready = phase === "ready";
  const updateWorking = ["checking", "downloading", "installing"].includes(phase);
  const runUpdate = async () => {
    // 有新版本：已下载好的按"重启更新"（有任务在跑时服务端会拒绝）；没下载的开始下载；不支持应用内更新的打开下载页
    if (!update?.supported) return void window.open(update?.downloadUrl || update?.releaseUrl || "https://github.com/wmn1525/AnyModelBot/releases", "_blank", "noopener");
    try {
      await api(`/update/${ready ? "install" : "download"}`, { method: "POST", body: {} });
    } catch (e) {
      failed(updateError(e));
    } finally {
      onUpdateChanged?.();
    }
  };
  const checkUpdate = async () => {
    if (update?.available) return runUpdate();
    if (!update?.supported) return void window.open(update?.releaseUrl || "https://github.com/wmn1525/AnyModelBot/releases", "_blank", "noopener");
    setCheck("checking");
    try {
      const result = await api("/update/check", { method: "POST", body: {} });
      setCheck(result.error ? "failed" : result.available ? "" : "latest");
    } catch {
      setCheck("failed");
    } finally {
      onUpdateChanged?.();
    }
  };
  const checkLabel = check === "checking" || phase === "checking" ? t("firstUse.checking")
    : updateWorking || ready ? updateDescription(update)
    : update?.available ? t("sidebar.update", { version: update.latest || "" })
    : check === "failed" ? t("firstUse.updateFailed")
    : check === "latest" ? t("firstUse.latest")
    : t("firstUse.checkUpdate");
  const leave = async () => {
    if (leaving) return;
    try {
      const state = await api("/agent").catch(() => ({}));
      const busy = !!(state.busy?.length || Object.values(state.background || {}).some((n) => Number(n) > 0));
      const title = t(signedIn ? "firstUse.logout" : "firstUse.backConfig");
      // 退出登录会断开 Modelflare 连接：有任务在跑时先说清楚影响，由用户决定；回到接入配置保留 Key，任务照常
      const body = signedIn ? t(busy ? "firstUse.logoutBusy" : "firstUse.logoutBody") : t("firstUse.backConfigBody");
      if (!(await confirmSheet({ title, body, confirmLabel: title, danger: signedIn }))) return;
      setLeaving(true);
      const result = await api(signedIn ? "/account/logout" : "/account/setup", { method: "POST", body: signedIn ? { stopRunning: busy } : {} });
      if (signedIn && result.revoked === false) failed(t("settings.logout.notRevoked"));
      setOpen(false);
      changed();
    } catch (e) {
      failed(e);
    } finally {
      setLeaving(false);
    }
  };
  const balance = !hasBalance ? "" : account.error ? t("firstUse.balanceUnavailable") : account.balanceUsd == null && !account.unlimitedBalance ? t("firstUse.balanceLoading") : accountBalance(account);
  const bot = signedIn && !account.error ? account.bot : null;
  const toggleQuota = () => {
    // 打开卡片时请后端读一次最新的额度（main.js 接这个事件）
    if (!quota) window.dispatchEvent(new Event("amb-account-refresh"));
    setQuota(!quota);
  };
  return html`<div class="account-stack" ref=${stackRef}>
    ${hasBalance
      ? html`<div class=${`account-balance${account.lowBalance && !account.error ? " low" : ""}`} role="status">
          ${bot
            ? html`<button type="button" class="account-quota" ref=${quotaRef} aria-haspopup="dialog" aria-expanded=${quota} onClick=${toggleQuota}
                aria-label=${t("sidebar.botQuotaOpen", { percent: bot.remainingPercent })} title=${t("sidebar.botQuotaOpen", { percent: bot.remainingPercent })}>
                <${QuotaRing} percent=${bot.remainingPercent} />
                <span class="account-balance-text"><span class="hint">${t("sidebar.botQuota")}</span><span class="num">${t("sidebar.botLeft", { percent: bot.remainingPercent })}</span></span>
              </button>
              ${account.lowBalance && html`<span class="dot warn" role="img" aria-label=${t("firstUse.lowBalance")} title=${t("firstUse.lowBalance")}></span>`}`
            : html`<span class="account-balance-text">
                ${account.lowBalance && !account.error
                  ? html`<span class="account-low"><span class="dot warn"></span>${t("firstUse.lowBalance")}</span><span class="hint num">${balance}</span>`
                  : html`<span class="hint">${t("sidebar.balance")}</span><span class="num">${balance}</span>`}
              </span>`}
          <a class="text account-topup" href=${account.topupUrl || MF_TOPUP} target="_blank" rel="noopener noreferrer">${t("firstUse.topUp")}</a>
        </div>`
      : account && account.state !== "unavailable" && html`<button type="button" class="account-login" ref=${loginRef} aria-expanded=${login} onClick=${() => setLogin((v) => !v)}>
          <span class="account-login-title">${t("firstUse.signIn")}</span><span class="hint">${t("firstUse.signInSub")}</span></button>`}
    <div class="account-row">
      <button type="button" class=${`account${open ? " on" : ""}`} ref=${ref} title=${me} aria-label=${t("firstUse.accountMenu", { name: me })} aria-haspopup="menu" aria-expanded=${open} onClick=${() => setOpen((v) => !v)}>
        <span class="me" aria-hidden="true">${me.slice(0, 1).toUpperCase()}</span><span class="who">${me}</span>
        ${update?.available && html`<span class="dot new account-dot" title=${t("sidebar.update", { version: update.latest || "" })}></span>`}
      </button>
    </div>
    ${open && html`<${Popover} anchor=${stackRef.current} trigger=${ref.current} prefer="up" width=${stackRef.current?.offsetWidth || 280} label=${t("sidebar.account")} onClose=${() => setOpen(false)}>
      <div class="account-menu primary" role="menu">
        <button type="button" role="menuitem" onClick=${() => { setOpen(false); onSettings?.(); }}>
          <span>${t("sidebar.settings")}</span><kbd>${isMac ? "⌘," : "Ctrl+,"}</kbd></button>
        <a role="menuitem" href="https://github.com/wmn1525/AnyModelBot/issues/new/choose" target="_blank" rel="noopener noreferrer" onClick=${() => setOpen(false)}>
          <span>${t("firstUse.feedback")}</span><span class="hint">${t("firstUse.feedbackNote")}</span></a>
        <button type="button" role="menuitem" disabled=${check === "checking" || updateWorking || (ready && update.busy)} title=${ready && update.busy ? t("updates.busy") : ""} onClick=${checkUpdate}>
          ${update?.available && html`<span class="dot new"></span>`}<span role="status">${checkLabel}</span></button>
        <hr />
        <button type="button" role="menuitem" class="danger" disabled=${leaving} onClick=${leave}>${t(signedIn ? "firstUse.logout" : "firstUse.backConfig")}</button>
      </div>
    <//>`}
    ${quota && bot && html`<${Popover} anchor=${quotaRef.current} prefer="up" width=${260} label=${t("sidebar.botQuota")} onClose=${() => setQuota(false)}>
      <${BotQuotaCard} account=${account} />
    <//>`}
    ${login && html`<${Popover} anchor=${loginRef.current} prefer="up" width=${300} label=${t("firstUse.signIn")} onClose=${() => setLogin(false)}>
      <div class="account-pop"><p class="hint">${t("firstUse.signInKeep")}</p>
        <${AccountLogin} autoStart secondary label=${t("firstUse.useAccount")} manual=${!!account?.manualLogin} onSignedIn=${() => { setLogin(false); changed(); }} /></div>
    <//>`}
  </div>`;
}

/** 更新提示：支持的桌面版直接下载/重启；手动分发继续打开安装包链接。 */
/**
 * 新版本提示：点它先打开"更新了什么"（components/whats-new.js），看完再在弹窗里下载 / 重启更新，
 * 不用盲目升级。不支持应用内更新的，弹窗底部是安装包链接。
 */
export function UpdateNotice({ update }) {
  const { updateDismissed } = useStore(prefs);
  const ready = update?.phase === "ready";
  const key = ready ? `${update.latest}:ready` : update?.latest;
  if (!update || !update.available || updateDismissed === key) return null;
  const text = update.supported ? updateDescription(update) : t("sidebar.update", { version: update.latest });
  return html`<div class="side-note" role="status">
    <button type="button" class="side-note-main" title=${text} aria-haspopup="dialog" onClick=${() => openWhatsNew({ mode: "available", version: update.latest })}>
      <span class="dot new"></span><span class="v">${ready ? t("updates.restart") : text}</span></button>
    <${IconButton} icon="close" size="xs" iconSize="xs" label=${t("sidebar.updateDismiss")} onClick=${() => setPrefs({ updateDismissed: key })} />
  </div>`;
}

export function Sidebar({ bots, botsError, reloadBots, selectedId, view, previews, pending, working, needs = { n: 0, bots: {} }, username, account, update, onUpdateChanged, onNew, onSelect, onNeeds, onDeleted, onOpenSettings, onBotSettings, onGuide, groups = [], groupsLoaded = true, groupId, onNewGroup, onSelectGroup, onEditGroup, onDeletedGroup, catalog = [], catalogId, onDiscover, onOpenCatalog, onOpenSearch }) {
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
  // 搜索框下面固定的导航：「发现」（有目录 Bot 时）和「需要你」（有事时）。不跟着机器人列表滚动
  const hasNav = catalog.length > 0 || needs.n > 0;
  const discoverOn = view === "discover";

  return html`<aside class="side" ref=${root} aria-label=${t("sidebar.bots")}>
    <div class="side-top">
      <span class="side-brand"><img src="/amb/static/assets/favicon-64.png" alt="" /><span>okbot</span></span>
      <${IconButton} icon="plus" iconSize="md" label=${canGroup ? t("sidebar.newMenu") : t("sidebar.newShortcut")} on=${view === "new"} aria-haspopup=${canGroup ? "menu" : undefined} aria-expanded=${canGroup ? !!newMenu : undefined}
        onClick=${(e) => { if (!canGroup) return onNew(); const el = e.currentTarget; setNewMenu((m) => (m ? null : el)); }} />
    </div>
    <button type="button" class="side-search" data-global-search-entry aria-haspopup="dialog" aria-label=${t("search.title")} onClick=${() => onOpenSearch?.()}>
      <${Icon} name="search" size="sm" /><span class="side-search-label">${t("search.placeholder")}</span><kbd>${isMac ? "⌘⇧F" : "Ctrl+Shift+F"}</kbd>
    </button>
    ${hasNav && html`<div class="side-nav">
      ${catalog.length > 0 && html`<button type="button" class=${`nav-item${discoverOn ? " sel" : ""}`} aria-current=${discoverOn ? "page" : undefined} onClick=${onDiscover}>
        <${Icon} name="compass" size="md" /><span class="label">${t("botapp.sidebar.discover")}</span>${hasNew && html`<span class="thread-new-dot" title=${t("botapp.sidebar.new")}></span>`}
      </button>`}
      <${NeedsRow} count=${needs.n} on=${view === "needs"} onClick=${onNeeds} />
    </div>`}
    <nav class="side-list" aria-label=${t("sidebar.list")}>
      ${hasNav && html`<div class="side-group"><span class="text t-label">${t("botapp.sidebar.mine")}</span></div>`}
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
              <span class="line"><span class="snip">${nd?.line || (working[b.id] ? t("sidebar.workingNow") : pv?.text || t("sidebar.noChats"))}</span>${n > 0 && html`<span class="needs-dot" role="img" title=${t("sidebar.needs", { count: n })} aria-label=${t("sidebar.needs", { count: n })}></span>`}</span>
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
        const line = g.running && g.current ? t("group.working", { name: bots.find((b) => b.id === g.current)?.name ?? "" }) : g.last ? `${who ? `${who}: ` : ""}${previewText(g.last.text)}` : t("group.noMessages");
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
    <${UpdateNotice} update=${update} onChanged=${onUpdateChanged} />
    ${bots && bots.length > 0 && html`<${GuidePill} onGo=${onGuide} />`}
    <div class="side-foot"><${AccountButton} username=${username} account=${account} update=${update} onUpdateChanged=${onUpdateChanged} onSettings=${() => onOpenSettings()} onModelflare=${() => onOpenSettings("modelflare")} /></div>
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
