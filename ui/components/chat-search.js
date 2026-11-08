import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { html, Icon, IconButton, Spinner } from "./ui.js";
import { api } from "../lib/api.js";
import { t } from "../lib/i18n.js";

export const searchChannel = (channel) => channel === "web" ? t("search.appChannel") : ["weixin", "feishu", "telegram", "slack", "discord"].includes(channel) ? t(`info.channel.${channel}`) : channel;
const literal = (q) => Array.from(q, (c) => ".*+?^$(){}|[]".includes(c) || c.charCodeAt(0) === 92 ? String.fromCharCode(92) + c : c).join("");

export function HighlightedText({ text = "", query = "" }) {
  if (!query.trim()) return text;
  const re = new RegExp(literal(query.trim()), "giu");
  const parts = []; let at = 0;
  for (const match of text.matchAll(re)) {
    parts.push(text.slice(at, match.index), html`<mark>${match[0]}</mark>`);
    at = match.index + match[0].length;
  }
  parts.push(text.slice(at));
  return parts;
}

/** Highlight DOM text through CSS ranges, leaving Markdown/Preact nodes intact. */
function highlightMessage(node, query) {
  if (!globalThis.CSS?.highlights || !globalThis.Highlight) return () => {};
  const ranges = [];
  if (node && query.trim()) {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const re = new RegExp(literal(query.trim()), "giu");
    while (walker.nextNode() && ranges.length < 1000) {
      const text = walker.currentNode;
      if (!text.parentElement?.closest(".msg")) continue;
      for (const m of text.textContent.matchAll(re)) {
        const range = new Range(); range.setStart(text, m.index); range.setEnd(text, m.index + m[0].length);
        ranges.push(range);
        if (ranges.length >= 1000) break;
      }
    }
  }
  const name = "amb-chat-search";
  const highlight = new globalThis.Highlight(...ranges);
  CSS.highlights.set(name, highlight);
  return () => { if (CSS.highlights.get(name) === highlight) CSS.highlights.delete(name); };
}

/** A separate history window lets ongoing replies keep streaming into the latest
 * timeline while the user reads an old match. No model context is changed.
 */
export function useMessageHistory({ scope, scroller, stick = null, initialFocus, visible = true }) {
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(null);
  const position = useRef(null);
  const scopeKey = JSON.stringify(scope || {});
  const clear = useCallback(() => {
    request.current?.abort(); request.current = null;
    setContext(null); setLoading(false); setError("");
    if (stick) stick.current = true;
  }, []);
  const show = useCallback(async (id, query = "") => {
    request.current?.abort();
    const ac = new AbortController(); request.current = ac;
    setLoading(true); setError("");
    if (stick) stick.current = false;
    try {
      const r = await api(`/messages/${encodeURIComponent(id)}/context`, { signal: ac.signal });
      if (ac.signal.aborted) return;
      if ((scope?.group && r.target.groupId !== scope.group) || (scope?.conversation && r.target.conversationId !== scope.conversation)) throw new Error(t("search.wrongConversation"));
      position.current = { id: Number(id) };
      setContext({ ...r, query, focusId: Number(id) });
    } catch (e) { if (!ac.signal.aborted) setError(e.message); }
    finally { if (!ac.signal.aborted) setLoading(false); }
  }, [scopeKey]);
  const extend = async (direction) => {
    if (!context || loading) return;
    const before = direction === "before";
    const anchor = before ? context.messages[0] : context.messages.at(-1);
    request.current?.abort();
    const ac = new AbortController(); request.current = ac;
    setLoading(true); setError("");
    try {
      const r = await api(`/messages/${anchor.id}/context?before=${before ? 100 : 0}&after=${before ? 0 : 100}`, { signal: ac.signal });
      if (ac.signal.aborted) return;
      const el = scroller.current;
      position.current = { top: el?.scrollTop || 0, height: before ? el?.scrollHeight || 0 : 0 };
      const merged = [...new Map([...context.messages, ...r.messages].map((m) => [m.id, m])).values()].sort((a, b) => a.id - b.id);
      setContext({ ...context, messages: merged, hasBefore: before ? r.hasBefore : context.hasBefore, hasAfter: before ? context.hasAfter : r.hasAfter });
    } catch (e) { if (!ac.signal.aborted) setError(e.message); }
    finally { if (!ac.signal.aborted) setLoading(false); }
  };
  useEffect(() => {
    if (initialFocus?.id) show(initialFocus.id, initialFocus.query || "");
  }, [initialFocus?.id, initialFocus?.query, initialFocus?.nonce, show]);
  useEffect(() => () => request.current?.abort(), []);
  useLayoutEffect(() => {
    if (!context || !visible || !scroller.current?.getClientRects().length) return;
    const el = scroller.current, p = position.current;
    const node = el.querySelector(`[data-message-id="${context.focusId}"]`);
    if (p?.id && node) node.scrollIntoView({ block: "center", behavior: "instant" });
    else if (p && !p.id) el.scrollTop = p.top + (p.height ? el.scrollHeight - p.height : 0);
    position.current = null;
    if (node) node.classList.add("message-located");
    const timer = setTimeout(() => node?.classList.remove("message-located"), 2500);
    const off = highlightMessage(node, context.query);
    return () => { clearTimeout(timer); node?.classList.remove("message-located"); off(); };
  }, [context, visible]);
  const clearHighlight = () => {
    request.current?.abort(); request.current = null;
    setLoading(false); setError("");
    setContext((c) => c ? { ...c, query: "" } : c);
  };
  return { context, loading, error, show, clear, clearHighlight, extend };
}

export function HistoryBar({ history, onBack, onLatest }) {
  if (!history.context && !history.loading && !history.error) return null;
  return html`<div class="history-bar" role="status">
    ${history.loading && html`<${Spinner} />`}
    <span>${history.error || t("search.history")}</span>
    <span class="grow"></span>
    ${onBack && html`<button class="btn sm" type="button" onClick=${onBack}>${t("search.backResults")}</button>`}
    ${onLatest && html`<button class="btn sm" type="button" onClick=${onLatest}>${t("search.latest")}</button>`}
  </div>`;
}

export function HistoryPageButton({ history, direction }) {
  if (!history.context?.[direction === "before" ? "hasBefore" : "hasAfter"]) return null;
  return html`<button type="button" class="btn sm history-page" disabled=${history.loading} onClick=${() => history.extend(direction)}>${t(direction === "before" ? "search.earlier" : "search.later")}</button>`;
}

/** Search all stored messages in this conversation, not only mounted DOM nodes. */
export function ConversationFind({ scope, onMatch, scroller, open, onOpen, onClose }) {
  const [query, setQuery] = useState("");
  const [stored, setPage] = useState({ key: "", results: [], total: 0, nextCursor: null });
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef(null), active = useRef(null), params = useRef("");
  const controls = useRef(null); controls.current = { open, onOpen, onClose };
  const scopeKey = JSON.stringify(scope);
  const resultKey = JSON.stringify([scopeKey, query.trim()]);
  const page = stored.key === resultKey ? stored : { results: [], total: 0, nextCursor: null };
  const select = useRef(onMatch); select.current = onMatch;
  useEffect(() => {
    if (open) { input.current?.focus({ preventScroll: true }); input.current?.select(); }
  }, [open]);
  useEffect(() => {
    const key = (e) => {
      if (e.isComposing || e.keyCode === 229 || !scroller.current?.getClientRects().length) return;
      const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? e.metaKey : e.ctrlKey;
      if (mod && !e.shiftKey && e.key.toLowerCase() === "f") { e.preventDefault(); e.stopPropagation(); controls.current.onOpen(); input.current?.focus(); input.current?.select(); }
      else if (controls.current.open && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); controls.current.onClose(); }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [open, onOpen, onClose]);
  useEffect(() => {
    active.current?.abort();
    const ac = new AbortController(); active.current = ac;
    setPage({ key: resultKey, results: [], total: 0, nextCursor: null }); setIndex(0); setError("");
    if (!open || !query.trim()) { setBusy(false); return; }
    setBusy(true);
    params.current = new URLSearchParams({ q: query.trim(), ...scope, limit: "100" }).toString();
    const timer = setTimeout(() => {
      api(`/messages/search?${params.current}`, { signal: ac.signal }).then((r) => {
        if (ac.signal.aborted) return;
        setPage({ ...r, key: resultKey });
        if (r.results[0]) select.current(r.results[0].id, query.trim());
      }).catch((e) => { if (!ac.signal.aborted) setError(e.message); }).finally(() => { if (!ac.signal.aborted) setBusy(false); });
    }, 220);
    return () => { clearTimeout(timer); ac.abort(); };
  }, [query, open, scopeKey]);
  const move = async (delta) => {
    if (busy || !page.results.length) return;
    let rows = page.results;
    let next = index + delta;
    if (next >= rows.length && page.nextCursor) {
      setBusy(true); setError("");
      const ac = active.current;
      try {
        const r = await api(`/messages/search?${params.current}&cursor=${encodeURIComponent(page.nextCursor)}`, { signal: ac.signal });
        if (ac.signal.aborted) return;
        rows = [...rows, ...r.results]; setPage({ ...r, key: resultKey, results: rows });
      } catch (e) { if (!ac.signal.aborted) setError(e.message); return; }
      finally { if (!ac.signal.aborted) setBusy(false); }
    }
    // Wrap only after the last stored result has actually been loaded.
    if (next < 0) next = 0;
    if (next >= rows.length) next = 0;
    setIndex(next); select.current(rows[next].id, query.trim());
  };
  if (!open) return null;
  return html`<div class="conversation-find" role="search" aria-label=${t("search.findInChat")}>
    <${Icon} name="search" size="sm" />
    <input ref=${input} class="field" type="search" maxLength="200" value=${query} placeholder=${t("search.findInChat")} aria-label=${t("search.findInChat")} onInput=${(e) => setQuery(e.target.value)} onKeyDown=${(e) => {
      if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); move(e.shiftKey ? -1 : 1); }
    }} />
    <span class="find-count" aria-live="polite">${busy ? t("search.searching") : error || (query.trim() ? t("search.position", { index: page.total ? index + 1 : 0, total: page.total }) : "")}</span>
    <${IconButton} icon="up" label=${t("search.previousMatch")} disabled=${busy || !page.total || index === 0} onClick=${() => move(-1)} />
    <${IconButton} icon="down" label=${t("search.nextMatch")} disabled=${busy || !page.total} onClick=${() => move(1)} />
    <${IconButton} icon="close" label=${t("search.closeFind")} onClick=${onClose} />
  </div>`;
}
