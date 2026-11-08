import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { html, Icon, IconButton, Notice, Spinner } from "../components/ui.js";
import { Markdown, Linkified } from "../components/markdown.js";
import { DeliveredFiles } from "../components/files.js";
import { HighlightedText, ConversationFind, HistoryBar, HistoryPageButton, searchChannel, useMessageHistory } from "../components/chat-search.js";
import { api } from "../lib/api.js";
import { fmtTime } from "../lib/format.js";
import { t, useLang } from "../lib/i18n.js";

function Select({ label, value, onChange, options }) {
  return html`<label class="search-filter"><span class="sr-only">${label}</span><select class="field" aria-label=${label} value=${value} onChange=${(e) => onChange(e.target.value)}>${options.map(([id, name]) => html`<option value=${id}>${name}</option>`)}</select></label>`;
}

export function MessageSearchScreen({ open, query, onQuery, bots = [], groups = [], onClose, onSelect, onBot, onGroup, focusToken }) {
  const lang = useLang();
  const [scope, setScope] = useState("");
  const [channel, setChannel] = useState("");
  const [period, setPeriod] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [stored, setData] = useState({ key: "", results: [], total: 0, nextCursor: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [retry, setRetry] = useState(0);
  const [conversations, setConversations] = useState([]);
  useEffect(() => {
    if (!open) return;
    const ac = new AbortController();
    api("/messages/scopes", { signal: ac.signal }).then((r) => setConversations(r.conversations || [])).catch(() => {});
    return () => ac.abort();
  }, [open]);
  const input = useRef(null), scroller = useRef(null), savedTop = useRef(0), active = useRef(null);
  const needle = query.trim();
  const nameMatches = useMemo(() => needle ? [
    ...bots.filter((b) => b.name.toLowerCase().includes(needle.toLowerCase())).map((b) => ({ id: b.id, name: b.name, kind: "bot", entry: b })),
    ...groups.filter((g) => g.name.toLowerCase().includes(needle.toLowerCase())).map((g) => ({ id: g.id, name: g.name, kind: "group", entry: g })),
    ...conversations.filter((c) => c.title.toLowerCase().includes(needle.toLowerCase())).map((c) => ({ id: c.id, name: `${c.title} · ${searchChannel(c.channel)}`, kind: "conversation", entry: c })),
  ] : [], [needle, bots, groups, conversations, lang]);
  const request = useMemo(() => {
    const p = new URLSearchParams({ q: needle });
    if (scope.startsWith("bot:")) p.set("bot", scope.slice(4));
    if (scope.startsWith("group:")) p.set("group", scope.slice(6));
    if (scope.startsWith("conversation:")) p.set("conversation", scope.slice(13));
    if (channel) p.set("channel", channel);
    if (period === "custom") {
      const start = from ? new Date(`${from}T00:00:00`) : null;
      const end = to ? new Date(`${to}T00:00:00`) : null;
      if ((start && !Number.isFinite(start.getTime())) || (end && !Number.isFinite(end.getTime()))) return { error: true, params: "" };
      if (end) end.setDate(end.getDate() + 1);
      if (start && end && start >= end) return { error: true, params: "" };
      if (start) p.set("from", String(start.getTime()));
      if (end) p.set("to", String(end.getTime()));
    } else if (period !== "all") {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      if (period === "week") start.setDate(start.getDate() - 6);
      if (period === "month") start.setDate(start.getDate() - 29);
      p.set("from", String(start.getTime()));
    }
    return { error: false, params: p.toString() };
  }, [needle, scope, channel, period, from, to]);
  const key = request.params;
  // A changed input must never make old results clickable during the debounce.
  const data = stored.key === key ? stored : { results: [], total: 0, nextCursor: null };
  useEffect(() => {
    active.current?.abort();
    const ac = new AbortController(); active.current = ac;
    setData({ key, results: [], total: 0, nextCursor: null }); setSelected(0); setError("");
    savedTop.current = 0; if (scroller.current) scroller.current.scrollTop = 0;
    if (!needle || request.error) { setBusy(false); return; }
    setBusy(true);
    const timer = setTimeout(() => api(`/messages/search?${key}`, { signal: ac.signal })
      .then((r) => { if (!ac.signal.aborted) setData({ ...r, key }); })
      .catch((e) => { if (!ac.signal.aborted) setError(e.message); })
      .finally(() => { if (!ac.signal.aborted) setBusy(false); }), 220);
    return () => { clearTimeout(timer); ac.abort(); };
  }, [key, request.error, retry]);
  useEffect(() => {
    if (open && focusToken) { input.current?.focus({ preventScroll: true }); input.current?.select(); }
  }, [open, focusToken]);
  useLayoutEffect(() => { if (open && scroller.current) scroller.current.scrollTop = savedTop.current; }, [open]);
  const more = async () => {
    if (busy || !data.nextCursor) return;
    const ac = active.current;
    setBusy(true); setError("");
    try {
      const r = await api(`/messages/search?${key}&cursor=${encodeURIComponent(data.nextCursor)}`, { signal: ac.signal });
      if (!ac.signal.aborted) setData((old) => ({ ...r, key, results: [...old.results, ...r.results] }));
    } catch (e) { if (!ac.signal.aborted) setError(e.message); }
    finally { if (!ac.signal.aborted) setBusy(false); }
  };
  const onKey = (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); return; }
    if (e.target.tagName === "SELECT" || e.target.type === "date") return;
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && data.results.length) {
      e.preventDefault();
      const origin = e.target === input.current ? -1 : selected;
      const next = Math.max(0, Math.min(data.results.length - 1, origin + (e.key === "ArrowDown" ? 1 : -1)));
      setSelected(next);
      scroller.current?.querySelector(`[data-search-result="${next}"]`)?.focus({ preventScroll: true });
      scroller.current?.querySelector(`[data-search-result="${next}"]`)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" && e.target === input.current && data.results[selected]) {
      e.preventDefault(); onSelect(data.results[selected], needle);
    }
  };
  return html`<section class="message-search" hidden=${!open} data-screen="message-search" aria-label=${t("search.title")} onKeyDown=${onKey}>
    <header class="search-head"><${Icon} name="search" size="md" /><input ref=${input} type="search" class="search-input" maxLength="200" value=${query} placeholder=${t("search.placeholder")} aria-label=${t("search.placeholder")} onInput=${(e) => onQuery(e.target.value)} />
      <button type="button" class="btn sm search-filter-toggle" aria-expanded=${filtersOpen} aria-controls="chat-search-filters" onClick=${() => setFiltersOpen((v) => !v)}>${t("search.filters")}</button>
      <${IconButton} icon="close" label=${t("search.close")} onClick=${onClose} /></header>
    <div id="chat-search-filters" class=${`search-filters${filtersOpen ? " open" : ""}`}>
      <${Select} label=${t("search.scope")} value=${scope} onChange=${setScope} options=${[["", t("search.allScopes")], ...bots.map((b) => [`bot:${b.id}`, b.name]), ...groups.map((g) => [`group:${g.id}`, `${t("search.group")}: ${g.name}`]), ...conversations.map((c) => [`conversation:${c.id}`, `${searchChannel(c.channel)} · ${c.title} · ${c.botName}`])]} />
      <${Select} label=${t("search.channel")} value=${channel} onChange=${setChannel} options=${[["", t("search.allChannels")], ...["web", "weixin", "feishu", "telegram", "slack", "discord"].map((id) => [id, searchChannel(id)])]} />
      <${Select} label=${t("search.date")} value=${period} onChange=${setPeriod} options=${["all", "today", "week", "month", "custom"].map((p) => [p, t(`search.period.${p}`)])} />
      ${period === "custom" && html`<label class="search-filter"><span class="sr-only">${t("search.from")}</span><input class="field" type="date" value=${from} aria-label=${t("search.from")} onInput=${(e) => setFrom(e.target.value)} /></label>
        <label class="search-filter"><span class="sr-only">${t("search.to")}</span><input class="field" type="date" value=${to} aria-label=${t("search.to")} onInput=${(e) => setTo(e.target.value)} /></label>`}
      ${(scope || channel || period !== "all") && html`<button type="button" class="text" onClick=${() => { setScope(""); setChannel(""); setPeriod("all"); setFrom(""); setTo(""); }}>${t("search.clearFilters")}</button>`}
    </div>
    <div class="search-results" ref=${scroller} onScroll=${(e) => { savedTop.current = e.currentTarget.scrollTop; }}>
      ${request.error && html`<${Notice} tone="red">${t("search.badDates")}<//>`}
      ${error && html`<${Notice} tone="red" action=${html`<button type="button" class="btn sm" onClick=${() => setRetry((n) => n + 1)}>${t("common.retry")}</button>`}>${error}<//>`}
      ${!needle && html`<div class="search-empty"><h2>${t("search.emptyTitle")}</h2><p>${t("search.emptyBody")}</p><kbd>${/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘⇧F" : "Ctrl+Shift+F"}</kbd></div>`}
      ${!!nameMatches.length && html`<section class="search-names"><h2 class="t-label">${t("search.names")}</h2><div class="cluster">${nameMatches.map((m) => html`<button type="button" class="btn sm" key=${`${m.kind}:${m.id}`} onClick=${() => m.kind === "bot" ? onBot(m.id) : m.kind === "group" ? onGroup(m.id) : onSelect({ ...m.entry, id: m.entry.lastMessageId, conversationId: m.id }, needle)}><${HighlightedText} text=${m.name} query=${needle} /></button>`)}</div></section>`}
      ${needle && !request.error && html`<p class="search-count t-meta" role="status">${busy ? html`<${Spinner} /> ${t("search.searching")}` : t("search.count", { count: data.total })}</p>`}
      ${data.results.map((r, i) => html`<button type="button" class=${`search-result${selected === i ? " selected" : ""}`} key=${r.id} data-search-result=${i} onFocus=${() => setSelected(i)} onClick=${() => onSelect(r, needle)}>
        <span class="search-result-head"><strong>${r.groupName || r.botName || r.title}</strong><span>${searchChannel(r.channel)}</span><time datetime=${new Date(r.createdAt).toISOString()}>${new Date(r.createdAt).toLocaleString(lang, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></span>
        <span class="search-result-title">${r.title !== (r.groupName || r.botName) ? r.title : ""}</span>
        <span class="search-result-body"><span class="search-author">${r.role === "user" ? t(r.channel === "web" ? "search.you" : "search.user") : (r.groupId && r.botName) || t("search.assistant")}:</span> <${HighlightedText} text=${r.snippet} query=${needle} /></span>
      </button>`)}
      ${needle && !busy && !error && !request.error && !data.total && html`<p class="search-empty">${t("search.noResults")}</p>`}
      ${data.nextCursor && html`<button class="btn search-more" type="button" disabled=${busy} onClick=${more}>${t("search.more")}</button>`}
    </div>
  </section>`;
}

/** External-channel histories are readable here; replies stay in that channel. */
export function ConversationHistoryScreen({ conversationId, initialFocus, onBack, onBot, bots = [], visible = true }) {
  useLang();
  const scroller = useRef(null);
  const history = useMessageHistory({ scope: { conversation: conversationId }, scroller, initialFocus, visible });
  const [find, setFind] = useState(false);
  const target = history.context?.target;
  return html`<section class="chat history-screen has-chat-tools" data-screen="conversation-history">
    <header class="chat-head"><${IconButton} icon="chevLeft" label=${t("search.backResults")} onClick=${onBack} /><span class="head-bot"><span class="name">${target?.title || t("search.history")}</span></span><span class="grow"></span>
      <${IconButton} icon="search" label=${t("search.findInChat")} onClick=${() => setFind(true)} /></header>
    <div class="chat-tools"><${ConversationFind} scope=${{ conversation: conversationId }} onMatch=${history.show} scroller=${scroller} open=${find} onOpen=${() => setFind(true)} onClose=${() => { setFind(false); history.clearHighlight(); }} />
      <${HistoryBar} history=${history} />
      ${target && html`<p class="history-channel-note">${t("search.external", { channel: searchChannel(target.channel) })} ${target.botId && html`<button type="button" class="text" onClick=${() => onBot(target.botId)}>${t("search.openBot")}</button>`}</p>`}
    </div>
    <div class="chat-scroll" ref=${scroller}><div class="chat-col ready">
      <${HistoryPageButton} history=${history} direction="before" />
      ${(history.context?.messages || []).map((m) => html`<article class=${`msg-row ${m.role}`} data-message-id=${m.id} key=${m.id}>
        <div class="msg-author">${m.role === "user" ? t("search.you") : (bots.find((b) => b.id === m.botId)?.name || t("search.assistant"))}</div>
        <div class="msg">${m.role === "user" ? html`<${Linkified} text=${m.content} />` : html`<${Markdown} text=${[...(m.interim || []), m.content].join("\n\n")} />`}</div>
        <${DeliveredFiles} files=${m.files || []} conv=${m.conversationId} canOpen=${history.context.canOpen} />
        <time class="t-meta">${fmtTime(m.createdAt)}</time>
      </article>`)}
      <${HistoryPageButton} history=${history} direction="after" />
    </div></div>
  </section>`;
}
