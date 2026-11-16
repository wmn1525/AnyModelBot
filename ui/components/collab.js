// 机器人之间发消息（PRD 2026-11-15 R5–R12）的界面：设置 › 机器人协作、对话里的灰色小字（已发消息给 / 收到…的消息）、
// B 主对话里的两行、去登录 / 去换模型按钮、两人对话（只读，底部只有「关闭聊天」）。
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { html, Icon, Switch, MenuButton, Skeleton, Spinner, Sheet } from "./ui.js";
import { BotAvatar } from "./avatar.js";
import { Markdown } from "./markdown.js";
import { DeliveredFiles } from "./files.js";
import { api } from "../lib/api.js";
import { failed, saved, useStore } from "../lib/store.js";
import { botById, knownBots, OPEN_STATES, openPairChat, pairChat } from "../lib/collab.js";
import { fmtClock, fmtDay, fmtSep } from "../lib/format.js";
import { t } from "../lib/i18n.js";

const BUDGETS = [0.5, 1, 2, 5, 10];
const CAPS = [30 * 60_000, 3600_000, 2 * 3600_000, 4 * 3600_000];
const DAILY = [10, 30, 50, 100];
const REDOS = [0, 1, 2, 3];

const usdText = (v) => `$${Number.isInteger(v) ? v : v.toFixed(2).replace(/0$/, "")}`;
const spentText = (v) => (v > 0 && v < 0.005 ? "<$0.01" : `$${(v || 0).toFixed(2)}`);
export const capText = (ms) => (ms >= 3600_000 ? t("collab.hours", { count: Math.round(ms / 3600_000) }) : t("collab.minutes", { count: Math.round(ms / 60_000) }));

/** 一个小头像 + 名字（灰色小字里、两人对话的标题里） */
function Who({ id, name, size = 16 }) {
  useStore(knownBots);
  const bot = botById(id);
  return html`<span class="collab-who"><${BotAvatar} bot=${bot} id=${id} name=${name} size=${size} neutral=${!bot && !id} /><span class="collab-name">${bot?.name || name}</span></span>`;
}

/** 把含 {bot} 的一句拆开，名字处放头像 + 名字 */
function withWho(key, params, who) {
  const MARK = "\u0001";
  const parts = t(key, { ...params, bot: MARK }).split(MARK);
  return parts.flatMap((p, i) => (i ? [who, p] : [p]));
}

// —— 对话里的灰色小字 ——

/** A 的回复下面：「已发消息给 [头像] B」，B 没做完时末尾有小转圈；点开两人对话 */
export function CollabSent({ h }) {
  const open = OPEN_STATES.includes(h.state);
  return html`<button type="button" class="collab-line" onClick=${() => openPairChat(h.pairKey, h.id)}>
    ${withWho("collab.sent", {}, html`<${Who} id=${h.to} name=${h.toName} />`)}${open && html`<${Spinner} />`}
  </button>`;
}

/** A 的汇总上面：「收到 [头像] B 的消息」 */
export function CollabReceived({ h }) {
  return html`<button type="button" class="collab-line" onClick=${() => openPairChat(h.pairKey, h.id)}>${withWho("collab.received", {}, html`<${Who} id=${h.to} name=${h.toName} />`)}</button>`;
}

/** 退出登录时停下的：A 的主对话里同一行灰字 */
export function CollabSignedOut({ h }) {
  return html`<button type="button" class="collab-line" onClick=${() => openPairChat(h.pairKey, h.id)}>${withWho("collab.signedOut", { time: fmtClock(h.endedAt) }, html`<${Who} id=${h.to} name=${h.toName} />`)}</button>`;
}

/** B 的主对话：「收到 [头像] A 的消息 · 时间」「已回消息给 [头像] A · 时间」 */
export function CollabInbox({ h, kind }) {
  const at = kind === "got" ? h.startedAt : h.repliedAt;
  return html`<button type="button" class="collab-line" onClick=${() => openPairChat(h.pairKey, h.id)}>
    ${withWho(kind === "got" ? "collab.inboxGot" : "collab.inboxReplied", { time: fmtClock(at) }, html`<${Who} id=${h.from} name=${h.fromName} />`)}
  </button>`;
}

/** 发不出去时 A 的回复下面的按钮：去登录（打开登录）、去换模型（打开那个机器人的模型选择） */
export function CollabNotice({ notice, onSignIn, onChangeModel }) {
  if (notice.kind === "signin") return html`<div class="collab-actions"><button type="button" class="btn" onClick=${onSignIn}>${t("collab.signIn")}</button></div>`;
  return html`<div class="collab-actions">${(notice.bots || []).map((id) => html`<button type="button" class="btn" key=${id} onClick=${() => onChangeModel(id)}>${t("collab.changeModel")}${(notice.bots || []).length > 1 ? ` · ${botById(id)?.name || id}` : ""}</button>`)}</div>`;
}

/**
 * 灰色小字挂在对话的哪一项：发出的（那一轮的回复下面）、收到的（A 的汇总上面）、按钮（那一轮的回复下面）；
 * 不挂在回复上的（B 主对话里的两行、退出登录停下的那行）按时间插进对话里（kind: "collab"）
 */
export function collabByItem(view, items, replyAfter) {
  const after = new Map();
  const before = new Map();
  const loose = [];
  if (!view) return { after, before, loose };
  const push = (m, id, x) => id && m.set(id, [...(m.get(id) || []), x]);
  for (const h of view.sent || []) {
    push(after, replyAfter(items, h.createdAt), { kind: "sent", h });
    if (h.doneMessageId) {
      const it = (items || []).find((x) => x.mid === h.doneMessageId);
      if (it) push(before, it.id, { kind: "received", h });
    }
    if (h.state === "stopped" && h.stopReason === "signout") loose.push({ kind: "collab", id: `co-so-${h.id}`, at: h.endedAt, line: { kind: "signout", h } });
  }
  for (const n of view.notices || []) push(after, replyAfter(items, n.at), { kind: "notice", notice: n });
  for (const h of view.inbox || []) {
    if (h.startedAt) loose.push({ kind: "collab", id: `co-in-${h.id}`, at: h.startedAt, line: { kind: "got", h } });
    if (h.repliedAt) loose.push({ kind: "collab", id: `co-re-${h.id}`, at: h.repliedAt, line: { kind: "replied", h } });
  }
  return { after, before, loose };
}

/** 一项灰色小字 */
export function CollabItem({ x, onSignIn, onChangeModel }) {
  if (x.kind === "sent") return html`<${CollabSent} h=${x.h} />`;
  if (x.kind === "received") return html`<${CollabReceived} h=${x.h} />`;
  if (x.kind === "notice") return html`<${CollabNotice} notice=${x.notice} onSignIn=${onSignIn} onChangeModel=${onChangeModel} />`;
  if (x.kind === "signout") return html`<${CollabSignedOut} h=${x.h} />`;
  return html`<${CollabInbox} h=${x.h} kind=${x.kind} />`;
}

// —— 两人对话 ——

function stepsText(s) {
  if (!s || !s.count) return t("collab.stepsNone");
  const parts = [
    s.reads && t("collab.stepsReads", { count: s.reads }),
    s.writes && t("collab.stepsWrites", { count: s.writes }),
    s.commands && t("collab.stepsCommands", { count: s.commands }),
    s.web && t("collab.stepsWeb", { count: s.web }),
    s.other && t("collab.stepsOther", { count: s.other }),
  ].filter(Boolean);
  return parts.join(t("collab.stepsSep"));
}

/** 居中的一行灰字（进展和意外） */
function noteText(n) {
  const p = n.params || {};
  const time = "";
  const key = {
    queued: "collab.noteQueued",
    queuedSlots: "collab.noteQueuedSlots",
    queuedPaused: "collab.noteQueuedPaused",
    queuedBudget: "collab.noteQueuedBudget",
    started: "collab.noteStarted",
    waitApprove: "collab.noteWaitApprove",
    waitAnswer: "collab.noteWaitAnswer",
    allowed: "collab.noteAllowed",
    denied: "collab.noteDenied",
    answered: "collab.noteAnswered",
    approvalTimeout: "collab.noteApprovalTimeout",
    timeout: "collab.noteTimeout",
    budget: "collab.noteBudget",
    error: "collab.noteError",
    stopped: "collab.noteStopped",
    dropped: "collab.noteDropped",
    droppedModel: "collab.noteDroppedModel",
    signout: "collab.noteSignout",
  }[n.code];
  if (!key) return n.code;
  return t(key, { time, bot: n.bot || "", action: p.action ?? "", question: p.question ?? "", limit: p.ms ? capText(Number(p.ms)) : "", budget: p.budget ? usdText(Number(p.budget)) : "", reason: p.reason ?? "" }).trim();
}

/** 日期分隔：今天 / 昨天 / M月D日 */
function dayLabel(at) {
  const d = new Date(at);
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(new Date()) - day(d)) / 86_400_000);
  return diff === 0 ? t("collab.dateToday") : diff === 1 ? t("collab.dateYesterday") : fmtDay(at);
}

function StepsRow({ m }) {
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState(null);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !steps && m.detail) api(`/collab/steps/${encodeURIComponent(m.runId)}`).then((d) => setSteps(d.steps || [])).catch(() => setSteps([]));
  };
  return html`<div class="pair-steps">
    <button type="button" class="text" aria-expanded=${open} onClick=${toggle}><${Icon} name=${open ? "chevDown" : "chevRight"} size="xs" />${t("collab.steps", { summary: stepsText(m.steps) })}</button>
    ${open && (m.detail
      ? html`<ol class="pair-step-list">${(steps || []).map((s) => html`<li key=${s.id}><span class="tone-muted">${s.title}</span>${s.summary ? ` ${s.summary}` : ""}</li>`)}</ol>`
      : html`<div class="hint">${t("collab.stepsGone")}</div>`)}
  </div>`;
}

/** 两人对话：顶部两个头像和名字，中间按时间的往来（日期分隔、收起的处理过程、居中灰字），底部只有「关闭聊天」 */
export function PairChatHost() {
  const req = useStore(pairChat);
  const [d, setD] = useState(null);
  const body = useRef(null);
  useEffect(() => {
    if (!req) return setD(null);
    let alive = true;
    const load = () => api(`/collab/pairs/${encodeURIComponent(req.pairKey)}`).then((x) => alive && setD(x)).catch((e) => alive && failed(e));
    load();
    const timer = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [req && req.at]);
  // 从灰色小字点进来：滚到这件事开始的那条消息；从设置列表点进来：滚到最新
  const scrolled = useRef("");
  useEffect(() => {
    if (!d || !req || scrolled.current === `${req.at}`) return;
    scrolled.current = `${req.at}`;
    requestAnimationFrame(() => {
      const el = body.current;
      if (!el) return;
      const target = req.handoffId && el.querySelector(`[data-handoff="${req.handoffId}"]`);
      if (target) target.scrollIntoView({ block: "start" });
      else el.scrollTop = el.scrollHeight;
    });
  }, [d, req]);
  if (!req) return null;
  const close = () => pairChat.set(null);
  const rows = [];
  let lastDay = "";
  const firstOf = new Set();
  for (const m of d?.messages || []) {
    const day = new Date(m.at).toDateString();
    if (day !== lastDay) {
      rows.push(html`<div class="pair-date" key=${"d" + m.id}>${dayLabel(m.at)}</div>`);
      lastDay = day;
    }
    const anchor = m.handoffId && !firstOf.has(m.handoffId) ? (firstOf.add(m.handoffId), m.handoffId) : undefined;
    if (m.kind === "note") rows.push(html`<div class="pair-note" key=${m.id} data-handoff=${anchor}><span class="num">${fmtClock(m.at)}</span> ${noteText(m.note || {})}</div>`);
    else if (m.kind === "steps") rows.push(html`<div class="pair-msg cont" key=${m.id} data-handoff=${anchor}><${StepsRow} m=${m} /></div>`);
    else
      rows.push(html`<div class="pair-msg" key=${m.id} data-handoff=${anchor}>
        <${BotAvatar} bot=${botById(m.from)} id=${m.from} name=${m.fromName} size=${28} />
        <div class="pair-body">
          <div class="pair-meta"><span class="pair-name">${botById(m.from)?.name || m.fromName}</span><span class="num tone-muted">${fmtClock(m.at)}</span></div>
          <div class="msg"><${Markdown} text=${m.text} /></div>
          ${m.files?.length > 0 && html`<${DeliveredFiles} files=${m.files} conv=${m.fileConv} canOpen=${false} />`}
        </div>
      </div>`);
  }
  return html`<${Sheet} wide class="pair-sheet" label=${d ? t("collab.pairTitle", { a: d.aName, b: d.bName }) : t("collab.title")} onClose=${close}>
    <div class="pair-head">
      ${d ? html`<${Who} id=${d.a} name=${d.aName} size=${24} /><span class="pair-arrow" aria-hidden="true">⇄</span><${Who} id=${d.b} name=${d.bName} size=${24} />` : html`<${Skeleton} w="40%" />`}
    </div>
    <div class="pair-scroll" ref=${body}>${d ? rows : html`<div class="row"><${Skeleton} w="60%" /></div>`}</div>
    <div class="pair-foot"><button type="button" class="btn block" data-autofocus onClick=${close}>${t("collab.close")}</button></div>
  <//>`;
}

// —— 设置 › 机器人协作 ——

/** 设置页：未登录锁定；总开关；四项上限；机器人之间的对话列表；花费说明 */
export function CollabPane({ onSignIn }) {
  const [d, setD] = useState(null);
  useStore(knownBots);
  const load = () => api("/collab").then(setD).catch(failed);
  useEffect(() => {
    load();
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  }, []);
  const put = async (patch) => {
    try {
      setD(await api("/collab/settings", { method: "PUT", body: patch }));
      saved();
    } catch (e) {
      failed(e);
      load();
    }
  };
  if (!d) return html`<div class="list"><div class="row"><${Skeleton} w="50%" /></div></div>`;
  const s = d.settings;
  const locked = !d.signedIn;
  const off = locked || !s.enabled;
  const full = d.today >= s.daily;
  const options = (list, text) => list.map((v) => [String(v), text(v)]);
  const openN = (d.open || []).reduce((n, x) => n + x.count, 0);
  return html`<div class="collab-pane">
    <p class="set-note">${t("collab.desc")}</p>
    ${locked && html`<div class="collab-lock">
      <${Icon} name="lock" size="md" />
      <div class="name">${t("collab.lockTitle")}</div>
      <div class="sub">${t("collab.lockSub")}</div>
      <button type="button" class="btn primary" onClick=${onSignIn}>${t("collab.signIn")}</button>
    </div>`}
    <div class="list">
      <div class=${`row${locked ? " off" : ""}`} id="set-collab-switch">
        <div class="who"><div class="name">${t("collab.switch")}</div><div class="sub">${t("collab.switchSub")}</div></div>
        <div class="ctl"><${Switch} label=${t("collab.switch")} value=${s.enabled && !locked} disabled=${locked} onChange=${(v) => put({ enabled: v })} /></div>
      </div>
    </div>
    ${!locked && !s.enabled && openN > 0 && html`<div class="collab-warn">${t("collab.offNote", { bots: d.open.map((x) => x.name).join(t("collab.listSep")), count: openN })}</div>`}
    <div class="list">
      <div class=${`row${off ? " off" : ""}`}>
        <div class="who"><div class="name">${t("collab.budget")}</div><div class="sub">${t("collab.budgetSub")}</div></div>
        <div class="ctl"><${MenuButton} label=${t("collab.budget")} width=${140} value=${String(s.budgetUsd)} disabled=${off} options=${options(BUDGETS, usdText)} onChange=${(v) => put({ budgetUsd: Number(v) })} /></div>
      </div>
      <div class=${`row${off ? " off" : ""}`}>
        <div class="who"><div class="name">${t("collab.cap")}</div><div class="sub">${t("collab.capSub")}</div></div>
        <div class="ctl"><${MenuButton} label=${t("collab.cap")} width=${140} value=${String(s.capMs)} disabled=${off} options=${options(CAPS, capText)} onChange=${(v) => put({ capMs: Number(v) })} /></div>
      </div>
      <div class=${`row${off ? " off" : ""}`}>
        <div class="who"><div class="name">${t("collab.daily")}</div>${!locked && html`<div class=${`sub${full ? " tone-red" : ""}`}>${t(full ? "collab.dailyFull" : "collab.dailySub", { count: d.today })}</div>`}</div>
        <div class="ctl"><${MenuButton} label=${t("collab.daily")} width=${140} value=${String(s.daily)} disabled=${off} options=${options(DAILY, (v) => t("collab.items", { count: v }))} onChange=${(v) => put({ daily: Number(v) })} /></div>
      </div>
      <div class=${`row${off ? " off" : ""}`}>
        <div class="who"><div class="name">${t("collab.redo")}</div><div class="sub">${t("collab.redoSub")}</div></div>
        <div class="ctl"><${MenuButton} label=${t("collab.redo")} width=${140} value=${String(s.redo)} disabled=${off} options=${options(REDOS, (v) => t("collab.times", { count: v }))} onChange=${(v) => put({ redo: Number(v) })} /></div>
      </div>
    </div>
    ${!locked && html`<div class="set-part collab-pairs-head"><span>${t("collab.pairs")}</span><span class="hint num">${t("collab.today", { used: d.today, limit: s.daily })}</span></div>
      <div class="list">
        ${d.pairs.length
          ? d.pairs.map((p) => html`<button type="button" class="row collab-pair" key=${p.pairKey} onClick=${() => openPairChat(p.pairKey)}>
              <div class="who">
                <div class="name collab-pair-names"><${Who} id=${p.a} name=${p.aName} /><span class="pair-arrow" aria-hidden="true">⇄</span><${Who} id=${p.b} name=${p.bName} />${p.open > 0 && html`<${Spinner} />`}</div>
                <div class="sub">${[fmtSep(p.lastAt), p.last ? (p.last.kind === "message" ? p.last.text : p.last.kind === "note" ? noteText(p.last.note || {}) : t("collab.steps", { summary: stepsText(p.last.steps) })) : "", spentText(p.spentUsd)].filter(Boolean).join(" · ").slice(0, 160)}</div>
              </div>
              <div class="ctl"><${Icon} name="chevRight" size="sm" /></div>
            </button>`)
          : html`<div class="collab-empty"><div class="name">${t("collab.empty")}</div><div class="sub">${t("collab.emptySub")}</div></div>`}
      </div>
      <p class="set-note">${t("collab.costNote")}</p>`}
  </div>`;
}

/** 对话里的灰色小字和按钮要的数据：读一次，有进行中的就 3 秒一次；状态变了（结束、A 回复了）通知对话重新读历史 */
export function useCollabView(conversationId, onSettled) {
  const [v, setV] = useState(null);
  const sig = useRef("");
  const load = useMemo(
    () => () =>
      conversationId
        ? api(`/collab/chat?conversation=${encodeURIComponent(conversationId)}`)
            .then((x) => {
              const next = [...(x.sent || []), ...(x.inbox || [])].map((h) => `${h.id}:${h.state}:${h.doneMessageId}:${h.repliedAt}`).join("|");
              if (sig.current && next !== sig.current) onSettled?.();
              sig.current = next;
              setV(x);
            })
            .catch(() => {})
        : Promise.resolve(),
    [conversationId],
  );
  const open = [...(v?.sent || []), ...(v?.inbox || [])].some((h) => OPEN_STATES.includes(h.state));
  useEffect(() => {
    sig.current = "";
    load();
  }, [load]);
  useEffect(() => {
    const timer = setInterval(load, open ? 3000 : 20_000);
    return () => clearInterval(timer);
  }, [load, open]);
  return [v, load];
}
