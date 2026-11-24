// 对话页（参考 Grok Bot 的顶栏、Codex 的对话与输入框）：顶栏左侧头像 + 名称，右侧新对话 / 信息面板；
// 760 阅读列，用户消息是浅灰气泡，机器人回复是整列正文，上方一行"思考中 / 正在回复 / 用时"；底部两行输入框。
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { html, Icon, IconButton, CopyButton, Badge, Notice, Skeleton, autoGrow } from "../components/ui.js";
import { BotAvatar } from "../components/avatar.js";
import { Markdown, Linkified } from "../components/markdown.js";
import { Composer, setConvModel, useConvModel } from "../components/composer.js";
import { officialSource } from "../lib/models.js";
import { classifyError, redact, uiActionOf } from "../lib/errors.js";
import { openFeedback } from "../lib/feedback.js";
import { MF_TOPUP } from "../lib/links.js";
import { PwshHint } from "../components/pwsh-hint.js";
import { ActivityLine, currentStep, upsertStep } from "../components/activity.js";
import { TaskChip } from "../components/tasks.js";
import { DeliveredFiles } from "../components/files.js";
import { Welcome, GuideCompletion, MediaDemo, OfficialGuideNotice } from "../components/guide.js";
import { CuPermissionCard, permissionState } from "../components/cu-permission.js";
import { RuleCard, RuleSource, useRuleActions } from "../components/rules.js";
import { api, attachChat, streamChat } from "../lib/api.js";
import { confirmSheet, failed, toast, useStore } from "../lib/store.js";
import { appDisplayName, appsStore, openRepair } from "../lib/apps.js";
import { focusRange, insertPhrase, useBotSkills, usedFromSteps, usedLine, usedName, usedSummaryText } from "../lib/usage.js";
import { completed, composerBusy, consumeWelcome, guideBlocked, currentStep as guideStep, demo, fill, guide, isActive,  markDone, refreshGuide, refreshGuideSoon } from "../lib/guide.js";
import { fmtSep, fmtClock, fmtDur } from "../lib/format.js";
import { t, useLang } from "../lib/i18n.js";
import { notify, plainSnippet } from "../lib/notify.js";
import { reducedMotion, usePresence } from "../design/motion.js";
import { ConversationFind, HistoryBar, HistoryPageButton, useMessageHistory } from "../components/chat-search.js";
import { chatView, saveChatView, useChatDraft, useFollowBottom } from "../lib/chat-view.js";
import { SkillInstallCard } from "../components/skill-install-card.js";
import { SkillDraftCard } from "../components/skill-draft-card.js";
import { openSkillDetail } from "../lib/my-skills.js";
import { AboutMeNotes, aboutMeByItem } from "../components/about-me.js";
import { CollabItem, collabByItem, useCollabView } from "../components/collab.js";
import { botById, replyAfter } from "../lib/collab.js";
import { addFiles, clearDraft, draftStore, droppedFiles, isFileDrag, newMessageId, notify as attachNotify, querySend, refresh as refreshAttachments, sendCheck, setSending, setUnknown, settleSent, submit as submitAttachments, useDraft } from "../lib/attachments.js";
import { DropOverlay, GenerationNote, ImageLightbox, SentAttachments } from "../components/attachments.js";
import { WorkFolder } from "../components/work-folder.js";
import { folderIdOf, refreshFolder, resetFolder, useFolder } from "../lib/folder.js";

const NEAR_BOTTOM = 80;
let seq = 0;
const uid = () => `l${++seq}`;

export const isError = (s) => typeof s === "string" && s.startsWith("⚠️");
export const errText = (s) => s.replace(/^⚠️\s*/, "");
// 服务端报错的文字（两种语言都认）

// steps：代理回合的活动记录有几步（展开时按 mid 取）；interim：模型在回合中间说的话；files：交付的文件
function toItems(messages) {
  return messages.map((m) =>
    m.role === "assistant" && isError(m.content)
      ? { kind: "error", id: "m" + m.id, mid: m.id, text: errText(m.content), at: m.createdAt, steps: m.steps, used: m.used, interim: m.interim, files: m.files, ruleSource: m.ruleSource, permissionWait: m.permissionWait }
      : { kind: "msg", id: "m" + m.id, mid: m.id, role: m.role === "user" ? "user" : "assistant", text: m.content, at: m.createdAt, steps: m.steps, used: m.used, interim: m.interim, files: m.files, ruleSource: m.ruleSource, permissionWait: m.permissionWait, attachments: m.attachments, generation: m.generation },
  );
}

/**
 * 技能安装卡片（src/skills/installs.ts）按时间插进历史；进行中的那条消息里的卡片由 live 显示，这里不重复
 */
export function withInstalls(list, installs = [], live = []) {
  const since = live?.[0]?.startedAt ?? Infinity;
  const out = [...list];
  for (const x of installs || []) {
    if (x.at >= since) continue;
    // kind：skill_install 技能安装卡片 · skill_draft「存成技能」草稿卡（src/skills/drafts.ts）
    const pkind = x.kind || "skill_install";
    const item = { kind: "prompt", pkind, id: (pkind === "skill_draft" ? "sd" : "si") + x.id, requestId: x.id, botId: x.botId, at: x.at };
    const i = out.findIndex((m) => m.at > x.at);
    out.splice(i < 0 ? out.length : i, 0, item);
  }
  return out;
}

/**
 * 「已开始新对话」分隔线：用户主动开新对话的时刻（服务端存在换段记录里，刷新、重开后仍在原位置）按时间插进历史。
 * 它前面没有消息的（对话清空过、或更早的消息没读进来）不画
 */
export function withDividers(list, times = []) {
  if (!times?.length) return list;
  const out = [...list];
  for (const at of times) {
    if (!out.some((x) => x.kind !== "divider" && x.at && x.at <= at)) continue;
    const i = out.findIndex((x) => x.at > at);
    out.splice(i < 0 ? out.length : i, 0, { kind: "divider", id: `d${at}`, at });
  }
  return out;
}

/** 已经是新对话：还没聊过，或最后一条（不算卡片）就是分隔线 */
export const freshConversation = (list) => {
  const last = (list || []).filter((x) => x.kind !== "prompt").at(-1);
  return !last || last.kind === "divider";
};

const squash = (s) => String(s || "").replace(/[\s「」“”"']/g, ""); // i18n-ignore
const DESKTOP_DENIED_ZH = "无法访问桌面上的文件。请在系统设置里允许 AnyModelBot 访问桌面，然后再试一次。"; // i18n-ignore
/**
 * 回复里说的是「系统禁止访问桌面」那一句（机器人按提示词原样说，界面语言或中文）：下面给一个打开系统设置对应页面的入口。
 * 这和电脑操作的「辅助功能」「屏幕录制」是两回事，不出那张授权卡。
 */
export const saysDesktopDenied = (text) => {
  const body = squash(text);
  return !!body && (body.includes(squash(t("firstUse.cu.desktopDenied"))) || body.includes(squash(DESKTOP_DENIED_ZH)));
};

/** 回复显示的全文：模型在回合中间说的话在前，按说的顺序，最后的回复接着（最后没再说话时回复就是中间说的最后一句，不重复） */
export function shownText(it) {
  const before = it.interim || [];
  const rest = before.length && before.at(-1) === it.text ? before.slice(0, -1) : before;
  return [...rest, it.text].filter(Boolean).join("\n\n");
}

/** 按路径加一个交付的文件（回合中 present 时来一次，结束时可能再来一次） */
export const addFile = (files, f) => ((files || []).some((x) => x.path === f.path) ? files : [...(files || []), f]);

// 进行中的一条消息（服务端的 live 快照）：用户消息 + 到目前为止的回复；turn 标记这些项属于哪条进行中的消息。
// 代理自己醒来的一轮（后台命令结束）没有用户消息；并进前一条处理的消息没有自己的回复
function liveItems(t, cards = []) {
  return [
    ...(t.userText ? [{ kind: "msg", id: "u" + t.id, role: "user", text: t.userText, at: t.startedAt, turn: t.id }] : []),
    ...cards.map((c) => ({ ...c, turn: t.id })),
    ...(t.steered ? [] : [{ kind: "msg", id: "a" + t.id, role: "assistant", text: t.text, interim: t.interim, files: t.files, at: t.startedAt, live: true, startedAt: t.startedAt, activity: t.steps, turn: t.id }]),
  ];
}

// —— 审批 / 提问卡片 ——
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
/**
 * 别的机器人（B）的审批和提问出现在你和 A 的对话里时，以 B 的名义：卡片上面一行 B 的头像、名字和时间（R9）
 */
function SignedBy({ row, chatBot, children }) {
  if (!row || !chatBot || !row.botId || row.botId === chatBot) return children;
  const b = botById(row.botId);
  return html`<div class="signed-card">
    <div class="signed-by"><${BotAvatar} bot=${b} id=${row.botId} size=${22} /><span class="name">${b?.name || row.botId}</span><span class="num tone-muted">${fmtClock(row.createdAt)}</span></div>
    ${children}
  </div>`;
}

export function PromptCard({ requestId, fallback, chatBot }) {
  const [row, setRow] = useState(null);
  const [gone, setGone] = useState(false);
  const [picked, setPicked] = useState({});
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api(`/approvals/${encodeURIComponent(requestId)}`).then((d) => setRow(d.approval)).catch(() => setGone(true)), [requestId]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!row || row.status !== "pending") return;
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [row && row.status]);

  if (gone || (!row && !requestId)) return html`<${Notice}><span class="pre-wrap">${fallback}</span><//>`;
  if (!row) return html`<div class="card"><${Skeleton} w="60%" /><${Skeleton} w="40%" /></div>`;
  const pending = row.status === "pending";
  const sign = (node) => html`<${SignedBy} row=${row} chatBot=${chatBot}>${node}<//>`;
  const decide = async (ok, always = false) => {
    setBusy(true);
    try {
      const r = await api(`/approvals/${row.id}/${ok ? "approve" : "deny"}`, { method: "POST", body: always ? { always: true } : {} });
      setRow(r.approval);
    } catch (e) {
      failed(e);
      load();
    }
    setBusy(false);
  };
  // 连接应用的两种卡片：去连接 / 修复（连上后机器人接着做），和应用工具的审批（写入类多一个「以后这个工具都允许」）
  if (row.appConnect) {
    const c = row.appConnect;
    const name = c.custom ? c.appName : appDisplayName(c.app, c.appName);
    const connected = row.status === "allowed";
    return sign(html`<div class=${`card app-card${pending ? "" : " done"}`}>
      <div class="q">${connected ? t("apps.card.connectedTitle", { app: name }) : t(`apps.card.title.${c.kind}`, { app: name })}</div>
      ${connected ? html`<div class="q-detail">${t("apps.card.connected")}</div>` : c.reason && html`<div class="q-detail">${c.reason}</div>`}
      ${pending && html`<div class="actions">
        <button type="button" class="btn primary" disabled=${busy} onClick=${() => openRepair(c)}>${t(`apps.card.fix.${c.kind}`)}</button>
        <button type="button" class="text" disabled=${busy} onClick=${() => decide(false)}>${t("apps.card.notNow")}</button>
      </div>`}
      ${!pending && !connected && html`<div class="meta"><${Badge} s=${row.status} /></div>`}
    </div>`);
  }
  if (row.appTool) {
    const a = row.appTool;
    const name = a.custom ? a.appName : appDisplayName(a.app, a.appName);
    const bot = a.botName || "";
    return sign(html`<div class=${`card app-card${pending ? "" : " done"}`}>
      <div class="meta"><span>${t(row.taskTitle ? "chat.approval.neededTask" : "chat.approval.needed", { title: row.taskTitle, code: html`<span class="num">${row.code}</span>` })}</span>
        ${!pending && html`<span class="app-card-done"><${Badge} s=${row.status} />${row.always && html`<span class="hint">${t("apps.bot.always")}</span>`}</span>`}</div>
      <div class="q">${t("apps.card.toolTitle", { bot })}</div>
      <div class="cmd">${[bot, name, a.toolTitle || a.tool].filter(Boolean).join("  ·  ")}</div>
      ${a.params.length > 0 && html`<dl class="app-card-params">${a.params.map(([k, v]) => html`<div key=${k}><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>`}
      ${pending && html`<div class="actions">
        <button type="button" class="btn primary" disabled=${busy} onClick=${() => decide(true)}>${t("chat.approval.allowOnce")}</button>
        ${a.always && html`<button type="button" class="btn" disabled=${busy} onClick=${() => decide(true, true)}>${t("apps.card.always")}</button>`}
        <button type="button" class="btn" disabled=${busy} onClick=${() => decide(false)}>${t("chat.approval.deny")}</button>
      </div>`}
    </div>`);
  }
  if (row.kind === "approval") {
    return sign(html`<div class=${`card${pending ? "" : " done"}`}>
      <div class="meta"><span>${t(row.taskTitle ? "chat.approval.neededTask" : "chat.approval.needed", { title: row.taskTitle, code: html`<span class="num">${row.code}</span>` })}</span>${!pending && html`<${Badge} s=${row.status} />`}</div>
      <div class="q">${row.reason || t("chat.approval.fallbackReason")}</div>
      ${(row.tool || row.detail) && html`<div class="cmd">${row.tool}${row.detail ? "  " + row.detail : ""}</div>`}
      ${pending && html`<div class="actions">
        <button type="button" class="btn primary" disabled=${busy} onClick=${() => decide(true)}>${t("chat.approval.allowOnce")}</button>
        <button type="button" class="btn" disabled=${busy} onClick=${() => decide(false)}>${t("chat.approval.deny")}</button>
      </div>`}
    </div>`);
  }
  const qs = row.questions || [];
  const submit = async (answers) => {
    setBusy(true);
    try {
      const r = await api(`/approvals/${row.id}/answer`, { method: "POST", body: { answers } });
      setRow(r.approval);
    } catch (e) {
      failed(e);
      load();
    }
    setBusy(false);
  };
  const single = qs.length === 1 && (qs[0].options || []).length && !qs[0].multiSelect;
  const choose = (q, label) => {
    if (!pending || busy) return;
    if (single) {
      setPicked({ [q.id]: [label] });
      return submit([{ id: q.id, selected: [label] }]);
    }
    setPicked((p) => {
      const cur = p[q.id] || [];
      const next = q.multiSelect ? (cur.includes(label) ? cur.filter((x) => x !== label) : [...cur, label]) : [label];
      return { ...p, [q.id]: next };
    });
  };
  const sendAll = () =>
    submit(qs.map((q, i) => ({ id: q.id, selected: picked[q.id] || [], ...(i === qs.length - 1 && custom.trim() ? { custom: custom.trim() } : {}) })));
  return sign(html`<div class=${`card${pending ? "" : " done"}`}>
    ${row.taskTitle && html`<div class="meta"><span>${t("chat.question.taskAsks", { title: row.taskTitle })}</span></div>`}
    ${qs.map((q) => html`<div class="q-block">
      <div class="q">${q.question}</div>
      ${q.detail && html`<div class="q-detail">${q.detail}</div>`}
      ${row.note && html`<div class="q-detail">${row.note}</div>`}
      ${(q.options || []).length > 0 && html`<div class="opts" role=${q.multiSelect ? "group" : "radiogroup"}>
        ${q.options.map((o, i) => html`<button type="button" class=${`opt${(picked[q.id] || []).includes(o.label) ? " picked" : ""}`} disabled=${!pending || busy}
          role=${q.multiSelect ? "checkbox" : "radio"} aria-checked=${(picked[q.id] || []).includes(o.label)} onClick=${() => choose(q, o.label)}>
          <span class="letter">${LETTERS[i] || i + 1}</span>
          <span>${o.label}${o.description && html`<span class="desc">${o.description}</span>`}</span>
        </button>`)}
      </div>`}
    </div>`)}
    ${pending && !single && html`<div class="answer">
      <input class="field" placeholder=${qs.some((q) => (q.options || []).length) ? t("chat.question.otherOptional") : t("chat.question.yourAnswer")} value=${custom}
        onInput=${(e) => setCustom(e.target.value)} onKeyDown=${(e) => e.key === "Enter" && !e.isComposing && e.keyCode !== 229 && sendAll()} />
      <button type="button" class="btn primary" disabled=${busy || (!custom.trim() && !Object.values(picked).some((v) => v.length))} onClick=${sendAll}>${t("chat.question.submit")}</button>
    </div>`}
    ${pending && single && html`<div class="answer">
      <input class="field" placeholder=${t("chat.question.orOther")} value=${custom} onInput=${(e) => setCustom(e.target.value)}
        onKeyDown=${(e) => e.key === "Enter" && !e.isComposing && e.keyCode !== 229 && custom.trim() && submit([{ id: qs[0].id, selected: [], custom: custom.trim() }])} />
    </div>`}
    ${!pending && html`<div class="meta"><${Badge} s=${row.status} /></div>`}
  </div>`);
}

/**
 * 回复上方的工作状态，一句话：没出字时"思考中 N 秒"，有一步在做时是那一步"运行 bash，已用 N 秒"，出字后"正在回复 N 秒"，
 * 结束后"用时 N 秒"（短于 3 秒且没有步骤时不显示）。
 * 代理回合有步骤时这一行可以展开成处理过程（默认折叠）；历史消息只知道步数，展开时用 load 取。
 */
export function WorkLine({ live, stopping, text, startedAt, workedMs, steps, count, load, used, botId }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [live]);
  const ms = live ? Date.now() - startedAt : workedMs;
  // 用到的技能和应用：进行中按步骤逐行写「正在使用…」，结束后接在「用时」后面写「已使用：…」（名字和加号菜单、设置列表一致）
  const found = live || steps?.length ? usedFromSteps(steps) : used || [];
  const skills = useBotSkills(found.length ? botId : null);
  useStore(appsStore);
  if (!live && !(ms >= 3000) && !steps?.length && !count) return null;
  const items = found.map((u) => ({ ...u, label: usedName(u, skills) })).filter((u) => u.label);
  // 有一步在做时说那一步（模型在回合中间说过话也一样）；没有时出了字是"正在回复"。在用技能或应用的那一步说人话
  // （「正在使用技能 · 名字」「正在使用 Notion · 搜索页面」），不说内部的调用工具名
  const busyUse = live && (steps || []).findLast((s) => s.status === "running")?.use;
  const busyItem = busyUse && items.find((u) => u.kind === busyUse.kind && (busyUse.kind === "skill" ? u.name === busyUse.name : u.name === busyUse.app && u.tool === (busyUse.tool || undefined)));
  const cur = live ? (busyItem ? usedLine({ ...busyItem, status: "running" }, busyItem.label) : currentStep(steps)) : "";
  // 按了停止：代理要重启进程，可能要几秒，先说清楚在停
  const long = ms >= 3000;
  const label = live
    ? stopping
      ? long ? t("chat.work.stoppingAfter", { d: fmtDur(ms) }) : t("chat.work.stopping")
      : cur ? (long ? t("activity.stepFor", { step: cur, d: fmtDur(ms) }) : cur)
      : text ? t("chat.work.replying", { d: fmtDur(ms) })
      : long ? t("chat.work.thinkingFor", { d: fmtDur(ms) }) : t("chat.work.thinking")
    : long ? t("chat.work.done", { d: fmtDur(ms) }) : t("chat.work.process");
  // 换阶段（思考 → 回复 → 用时）时文字淡入：key 变才重播，秒数跳动不重播
  const phase = !live ? "done" : stopping ? "stop" : !cur && text ? "reply" : "think";
  // 技能名可以点：打开和机器人设置里「查看」同一份只读详情（所有来源都行；宿主自带的生图、电脑操作不能点；应用不能点）
  const name = (u) => (u.kind === "skill" && !HOST_SKILLS.has(u.name)
    ? html`<button type="button" class="text skill-link" title=${t("mySkills.activity.view")} onClick=${(e) => (e.stopPropagation(), openSkillDetail({ botId, name: u.name }))}>${u.label}</button>`
    : u.label);
  const uses = live ? items.map((u) => ({ key: `${u.kind}:${u.name}:${u.tool || ""}`, status: u.status, text: withMark(usedLine(u, MARK), name(u)) })) : null;
  return html`<${ActivityLine} label=${label} phase=${phase} live=${live} steps=${steps} count=${count} load=${load} used=${live || !items.length ? "" : usedSummaryNodes(items, name)} uses=${uses} />`;
}

/** 宿主自己生成的技能（生图、电脑操作、目录 Bot 界面）：没有可看的详情 */
const HOST_SKILLS = new Set(["media", "computer-use", "amb-app"]);
const MARK = "\u0001";
/** 一句带标记的话：标记换成 node（可点的技能名） */
const withMark = (text, node) => String(text).split(MARK).flatMap((p, i) => (i ? [node, p] : [p]));
/** 结束后折叠的那一行（和 usedSummaryText 同样的话），每个名字分别可点 */
function usedSummaryNodes(items, name) {
  const sep = t("chat.use.sep");
  const part = (key, list) => withMark(t(key, { list: MARK }), list.map((x, i) => html`${i ? sep : ""}${name(x)}`));
  const ok = items.filter((x) => x.status !== "error");
  const bad = items.filter((x) => x.status === "error");
  const parts = [ok.length && part("chat.use.used", ok), bad.length && part("chat.use.notUsed", bad)].filter(Boolean);
  return parts.map((p, i) => html`${i ? " · " : ""}${p}`);
}

/**
 * 用户消息：界面按钮发给目录 Bot 的 "[ui-action] {json}" 不给人看 JSON（第 9 项），显示附带的说明，
 * 没有说明时显示"在界面上操作"。复制的仍是原文（Bot 按原文执行，内部上下文不丢）。
 */
function userMessage(it, botId, ta, onLoad, canSave) {
  // 附件在正文气泡上方、同一组右对齐；只有附件时不造一个空的文字气泡
  if (it.attachments?.length) {
    return html`<${SentAttachments} botId=${botId} list=${it.attachments} fallback=${ta} onLoad=${onLoad} canSave=${canSave} />
      ${it.text && html`<div class="msg"><${Linkified} text=${it.text} /></div>`}
      <${GenerationNote} generation=${it.generation} />
      ${it.text ? html`<${MsgActions} text=${it.text} at=${it.at} />` : html`<div class="msg-actions">${it.at && html`<span class="when num">${fmtClock(it.at)}</span>`}</div>`}`;
  }
  const ua = uiActionOf(it.text);
  if (!ua) return html`<div class="msg"><${Linkified} text=${it.text} /></div><${GenerationNote} generation=${it.generation} /><${MsgActions} text=${it.text} at=${it.at} />`;
  return html`<div class="msg">${ua.text ? html`<${Linkified} text=${ua.text} />` : html`<span class="tone-muted">${t("firstUse.errors.uiAction")}</span>`}</div><${MsgActions} text=${ua.text || it.text} at=${it.at} />`;
}

/** 消息下方的操作：复制 + 时刻（悬停时出现，最后一条回复常显） */
export function MsgActions({ text, at }) {
  return html`<div class="msg-actions"><${CopyButton} text=${text} label=${t("chat.copyMessage")} />${at && html`<span class="when num">${fmtClock(at)}</span>`}</div>`;
}

/**
 * 任务出错（第 9 项）：一句简明的主提示 + 和错误来源对得上的恢复入口，原始报错折叠在"错误详情"里，可以复制（已去掉凭据）。
 * - 余额 / 额度不足：Modelflare 的给"充值"；自己的 API Key（source = 厂商名）不引导去 Modelflare 充值，只提示去厂商那里看。
 * - 凭据失效、模型不可用、限流、网络、其他 403 分开说，不把所有 403 都当成欠费。
 * - "重新发送"是从头再执行这条消息：这一轮已经做过操作（有步骤、交付了文件）时先说清楚可能会重复，再让用户决定。
 * - "反馈这个问题"打开应用内反馈，附带这条报错（已去掉凭据）和 Request ID。
 */
export function ErrorNotice({ text, onRetry, onFixKey, onSwitchModel, source = "", ranSteps = false, topupUrl = "", disabled = false, detailsAfterActions = false }) {
  const [retrying, setRetrying] = useState(false);
  const e = classifyError(text);
  const kind = e.kind;
  const auth = kind === "auth";
  const main = auth
    ? source ? t("chat.error.officialKeyInvalid", { name: source }) : t("chat.error.authInvalid")
    : kind === "balance" ? (source ? t("firstUse.errors.balanceOfficial", { name: source }) : t("firstUse.errors.balance"))
    : e.toolsUnsupported ? t("welcome.toolsUnsupported")
    : kind === "unfinished" && !e.raw ? text
    : t(`firstUse.errors.${kind}`);
  const hint = kind === "balance" ? (source ? t("firstUse.errors.balanceOfficialHint", { name: source }) : t("firstUse.errors.balanceHint")) : kind === "model" ? t("firstUse.errors.modelHint") : "";
  const retry = async () => {
    if (retrying || disabled) return;
    setRetrying(true);
    try {
      if (ranSteps && !(await confirmSheet({ title: t("firstUse.errors.retryTitle"), body: t("firstUse.errors.retryBody"), confirmLabel: t("firstUse.errors.retry") }))) return;
      await onRetry();
    } catch (error) { failed(error); }
    finally { setRetrying(false); }
  };
  const details = kind !== "unfinished" || e.raw;
  const detailText = redact(text);
  // 反馈这条报错（components/feedback.js）：打开"遇到问题"，可选附带去掉凭据的报错和 Request ID（本人可以在发送前移除）。
  // 不带模型：这里认不出出错那次用的是哪个模型，不能拿默认模型代替。有"错误详情"时放在复制旁边，没有时放在操作按钮最后
  const reportButton = html`<button type="button" class="btn sm ghost" aria-haspopup="dialog" onClick=${() => openFeedback({ source: "error_card", errorText: detailText, relatedRequestId: e.requestId })}>${t("feedback.reportError")}</button>`;
  const detail = details && html`<details class="err-details">
      <summary>${t("firstUse.errors.details")}</summary>
      ${(e.status || e.requestId) && html`<div class="err-meta">${e.status ? html`<span>${t("firstUse.errors.status", { status: e.status })}</span>` : ""}${e.requestId ? html`<span>Request ID: <code>${e.requestId}</code></span>` : ""}</div>`}
      <pre class="err-raw">${detailText}</pre>
      <span class="err-detail-actions"><${CopyButton} text=${detailText} label=${t("firstUse.errors.copy")} />${reportButton}</span>
    </details>`;
  return html`<${Notice} tone="red" action=${html`<div class="err-actions">
      ${kind === "balance" && !source && html`<a class="btn primary" href=${topupUrl || MF_TOPUP} target="_blank" rel="noopener noreferrer">${t("sidebar.topUp")}</a>`}
      ${auth && onFixKey && html`<button type="button" class="btn" onClick=${onFixKey}>${source ? t("chat.error.fixOfficialKey") : t("chat.error.fixKey")}</button>`}
      ${(kind === "balance" || kind === "model") && onSwitchModel && html`<button type="button" class="btn" disabled=${disabled || retrying} onClick=${onSwitchModel}>${t("chat.menu.switchModel")}</button>`}
      ${onRetry && kind !== "auth" && html`<button type="button" class="btn" disabled=${disabled || retrying} title=${t("firstUse.errors.retryHint")} onClick=${retry}>${t("firstUse.errors.retry")}</button>`}
      ${!details && reportButton}</div>${detailsAfterActions && detail}`}>
    <div class="err-main">${main}</div>
    ${hint && html`<div class="err-hint">${hint}</div>`}
    ${!detailsAfterActions && detail}

  <//>`;
}

/**
 * 对话页。infoOpen / onToggleInfo：右侧面板（screens/work-panel.js）开没开、顶栏的开关。
 * 专业 Bot 的页面（screens/bot-app.js）另外给：ctl —— 这里填上 { send(text) }，面板里界面上的操作经它发出，和打字一样进对话流
 * （正在回复时不发，返回 false）；starters —— 空对话时代替通用示例的那几句。
 */
export function ChatScreen({ bot, models, modelsError, reloadModels, defaultModel, infoOpen, onToggleInfo, onWorking, onOpenSettings, onOpenBotSettings, onBotUpdated, pending = 0, serverBusy = false, account, onAccount, initialFocus, onBackToSearch, visible = true, cuBlocked = false, ctl, starters }) {
  const viewId = `${bot.id}:web:console`;
  const ruleActions = useRuleActions(viewId);
  const savedView = useRef(chatView(viewId));
  const restoreView = useRef(true);
  const [items, setItems] = useState(null);
  const convModel = useConvModel(bot.id);
  const [text, setText] = useChatDraft(viewId);
  const [findOpen, setFindOpen] = useState(false);
  // generating：正在跟着一条消息（本页发出的，或切回 / 刷新后接上的）；stopping：按了停止，等服务端收尾
  const [generating, setGenerating] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [scrolled, setScrolled] = useState(false); // 内容滚到顶栏底下了：顶栏出现细线
  const [unseen, setUnseen] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [cue, setCue] = useState(null); // 头像的一次性反应（出错）；完成时头像自己会播
  const [canOpen, setCanOpen] = useState(false); // 桌面版：交付的文件用系统程序打开
  // 关于我：这个对话里记下、改了、删了的提示行和确认卡、建议卡（挂在那一轮的回复下面）
  const [aboutMe, setAboutMe] = useState(null);
  const loadAboutMe = useCallback(() => api(`/about-me/chat?conversation=${encodeURIComponent(`${bot.id}:web:console`)}`).then((d) => mounted.current && setAboutMe(d)).catch(() => {}), [bot.id]);
  const lang = useLang();
  const scroller = useRef(null);
  const stick = useRef(savedView.current.atBottom);
  // 内容自己长高、输入框变高时：在底部的再贴一次底（关于我的提示行、草稿卡不被输入框盖住）
  useFollowBottom(scroller, stick);
  const history = useMessageHistory({ scope: { conversation: viewId }, scroller, stick, initialFocus, visible });
  const ta = useRef(null);
  const composer = useRef(null); // 输入框给的 { openModel, closeSlash }
  // 正在跟的那条消息的事件流 { ac, local }：同一时刻只跟一条，切走时断开（消息在服务端照常处理）
  const following = useRef(null);
  const mounted = useRef(true);
  const lastUser = useRef("");
  const convId = useRef("");
  const attachRef = useRef(null);
  // 处理中又发的消息（并进正在进行的回复）结束后重新读一次历史：存下的顺序是两条用户消息、一条回复
  const reloadAfter = useRef(false);
  // 开始新对话（新建按钮、加号菜单、手动输入 /new）：正在请求；回复进行中手动输入的 /new 排到回复结束后
  const [newBusy, setNewBusy] = useState(false);
  // macOS 桌面版才有系统设置的入口（其他系统不展示）
  const systemPerms = useStore(permissionState);
  // —— 附件：当前输入里的待发附件、拖入遮罩、带附件消息的发送（受理不明时只查原请求） ——
  const draft = useDraft(bot.id);
  // 工作文件夹：选择变了要重新算「补充」能不能用（订阅它，变了就重新渲染）
  const folder = useFolder(bot.id);
  /** 能不能把输入并进进行中的那一轮：那一轮绑定的工作文件夹和现在选的一样才行（PRD R2） */
  const steerOk = () => (following.current?.folder ?? folder.current?.id ?? "") === (folder.current?.id || "");
  const [dragging, setDragging] = useState(false);
  const dragState = useRef({ cancelled: false, last: 0 });
  const sendingAtt = useRef(false);
  const newQueued = useRef(false);
  // 对话底部的轻提示（已经是新对话了、代理没有启用、没能开始新对话）：几秒后自己消失
  const [hint, setHint] = useState(null);
  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(() => setHint(null), hint.ms);
    return () => clearTimeout(timer);
  }, [hint]);
  // 这个会话的后台任务（胶囊挂在请求它的那条消息的回复下面）；任务结束时结果写进了历史，重新读一次
  const [tasks, setTasks] = useState([]);
  const taskGroups = useRef({});
  const sentOnce = useRef(false); // 发过消息：之后发送钮换回箭头时才播"升回来"，打开页面时不动
  // 上手清单：完成一步时头像开心一下；引导卡片「填入」的句子进输入框（只认这个页面挂载之后的请求）
  const g = useStore(guide);
  const justDone = useStore(completed);
  const fillReq = useStore(fill);
  const demoReq = useStore(demo);
  const [samples, setSamples] = useState([]);
  const born = useRef(Date.now());
  // 示例只属于当前视图；重复点击定位可见示例，不产生用户消息或模型请求。
  useEffect(() => {
    if (!demoReq || demoReq.at < born.current) return;
    const box = scroller.current?.getBoundingClientRect();
    const sample = [...(scroller.current?.querySelectorAll("[data-guide-sample]") || [])].find((el) => {
      const r = el.getBoundingClientRect(); return box && r.bottom > box.top && r.top < box.bottom;
    });
    if (sample) {
      sample.scrollIntoView({ block: "nearest", behavior: "auto" });
      sample.classList.remove("guide-sample-flash"); void sample.offsetWidth; sample.classList.add("guide-sample-flash");
    } else { stick.current = true; setSamples((l) => [...l, uid()]); }
  }, [demoReq && demoReq.at]);
  useEffect(() => {
    guideBlocked.set(!!cuBlocked || pending > 0 || items?.at(-1)?.kind === "error");
    return () => guideBlocked.set(false);
  }, [cuBlocked, pending, items?.at(-1)?.kind]);
  useEffect(() => {
    if (justDone && justDone.at > born.current) setCue({ kind: "done", at: justDone.at });
  }, [justDone && justDone.at]);
  // 输入框里有没发出的草稿：自动弹出的引导卡片先不出来（第 11.2 项）
  useEffect(() => {
    composerBusy.set(!!text.trim());
  }, [!!text.trim()]);
  useEffect(() => () => composerBusy.set(false), []);
  useEffect(() => {
    if (!fillReq || (fillReq.target ? fillReq.target !== bot.id && fillReq.target !== viewId : fillReq.at < born.current)) return;
    fill.set(null);
    if (fillReq.send) {
      if (items === null) queued.current = fillReq.text;
      else void send(fillReq.text);
      return;
    }
    // 「填入输入框」（技能与应用的示例）：不发送，不丢草稿，插在光标处
    if (fillReq.insert) {
      const r = insertPhrase(text, ta.current, fillReq.text, fillReq.select);
      setText(r.text);
      composer.current?.closeSlash();
      requestAnimationFrame(() => autoGrow(ta.current));
      focusRange(ta.current, r.start, r.end);
      return;
    }
    if (text.trim()) return;
    setText(fillReq.text);
    composer.current?.closeSlash();
    requestAnimationFrame(() => {
      ta.current?.focus();
      autoGrow(ta.current);
    });
  }, [fillReq && fillReq.at]);

  // ended：刚接着的那条消息结束了 { since, ms }，存下的回复照样显示"用时"（和一直停在这页时一样）
  const load = useCallback(async (ended = undefined) => {
    try {
      const d = await api(`/bots/${encodeURIComponent(bot.id)}/chat`);
      if (!mounted.current) return;
      convId.current = d.conversationId || "";
      setConvModel(bot.id, d.model || "");
      setCanOpen(!!d.canOpen);
      if (d.aboutMe) setAboutMe(d.aboutMe);
      const list = withDividers(withInstalls(toItems(d.messages || []), d.installs, d.live), d.dividers);
      const reply = ended && list.findLast((x) => x.kind !== "prompt" && x.role !== "user");
      if (reply && reply.at >= ended.since) reply.workedMs = ended.ms;
      const cards = (d.pending || []).map((a) => ({ kind: "prompt", id: "p" + a.id, requestId: a.id, prompt: "" }));
      // 进行中的消息（切走前、刷新前或别的窗口发的）：显示用户消息和到目前为止的回复，再接上它继续更新。
      // 已经在跟一条了（本页刚发的）就保留本页的那几项，不重复接
      const turns = following.current ? [] : d.live || [];
      turns.forEach((t, i) => list.push(...liveItems(t, i === 0 ? cards : [])));
      if (!turns.length && !following.current) list.push(...cards);
      setItems((prev) => (following.current ? [...list, ...(prev || []).filter((x) => x.turn)] : list));
      setLoadErr("");
      if (turns.length) attachRef.current(turns[0]);
    } catch (e) {
      if (mounted.current) {
        setItems((v) => v || []);
        setLoadErr(e.message);
      }
    }
  }, [bot.id]);

  useEffect(() => {
    mounted.current = true;
    load();
    requestAnimationFrame(() => { ta.current?.focus({ preventScroll: true }); autoGrow(ta.current); });
    return () => {
      mounted.current = false;
      following.current?.ac.abort();
    };
  }, [load]);
  useEffect(() => { if (cuBlocked && !following.current) load(); }, [cuBlocked]);
  useEffect(() => onWorking(bot.id, generating), [generating]);
  // 机器人之间发消息：灰色小字（已发消息给 / 收到…的消息）；B 回了消息、A 汇总好了（存进了历史）时重新读一次
  const [collab, reloadCollab] = useCollabView(`${bot.id}:web:console`, () => !following.current && load());
  // 一轮结束：这一轮可能记了关于我、发了消息给别的机器人
  useEffect(() => {
    if (generating) return;
    loadAboutMe();
    reloadCollab();
  }, [generating]);
  useEffect(() => {
    const result = (e) => { if (e.detail.includes(bot.id)) load(); };
    window.addEventListener("amb-rule-results", result);
    return () => window.removeEventListener("amb-rule-results", result);
  }, [bot.id, load]);
  // 服务端开始处理这个机器人的消息，而本页没在跟（代理自己醒来的一轮、别的窗口发的）：读一次，接上进行中的那条
  useEffect(() => {
    if (serverBusy && !following.current && mounted.current) load();
  }, [serverBusy]);
  useEffect(() => () => onWorking(bot.id, false), []);

  const loadTasks = useCallback(
    () =>
      api(`/tasks?conversation=${encodeURIComponent(`${bot.id}:web:console`)}&limit=20`)
        .then((d) => {
          if (!mounted.current) return;
          const list = d.tasks || [];
          const finished = list.some((t) => taskGroups.current[t.id] === "working" && t.stage.group !== "working");
          taskGroups.current = Object.fromEntries(list.map((t) => [t.id, t.stage.group]));
          setTasks(list);
          if (finished && !following.current) load();
        })
        .catch(() => {}),
    [bot.id, load],
  );
  const tasksWorking = tasks.some((t) => t.stage.group === "working");
  useEffect(() => {
    taskGroups.current = {};
    setTasks([]);
    loadTasks();
  }, [bot.id]);
  // 回复结束（可能刚开了一个任务）就看一次；有任务在进行时 3 秒一次，否则 15 秒
  useEffect(() => {
    if (!generating) loadTasks();
  }, [generating]);
  useEffect(() => {
    const timer = setInterval(loadTasks, tasksWorking ? 3000 : 15000);
    return () => clearInterval(timer);
  }, [loadTasks, tasksWorking]);

  // 只有用户本来就在底部附近时才跟随新内容；否则亮出"回到底部"
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !visible || history.context || items === null) return;
    if (restoreView.current) {
      restoreView.current = false;
      if (!savedView.current.atBottom) { el.scrollTop = savedView.current.top; return; }
    }
    if (stick.current) el.scrollTop = el.scrollHeight;
    else setUnseen(true);
  }, [items, history.context, visible]);
  const onScroll = () => {
    const el = scroller.current;
    if (!visible || !el?.getClientRects().length) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM;
    stick.current = history.context ? false : near;
    setAtBottom(history.context ? false : near);
    if (!history.context) saveChatView(viewId, { top: el.scrollTop, atBottom: near });
    setScrolled(el.scrollTop > 2);
    if (near) setUnseen(false);
  };
  const toBottom = () => {
    history.clear();
    stick.current = true;
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: reducedMotion() ? "auto" : "smooth" });
    setUnseen(false);
  };

  const patchLive = (id, fn) => mounted.current && setItems((l) => (l || []).map((it) => (it.id === id ? fn(it) : it)));

  /**
   * 跟着一条消息走到结束：本页发出的（chat/stream）和接上的（chat/live）事件一样。返回最后的回复文字；
   * 切走了（组件卸载、事件流被断开）返回 null。liveId 是回复那一项，turn 是这条消息的几项共用的标记。
   */
  const follow = async (liveId, turn, open, folder) => {
    // folder：这一轮绑定的工作文件夹 id（本页发出的知道；接上的从 snapshot 里读）。选择变了之后不再提供「补充」
    const f = { ac: new AbortController(), local: false, turn, folder };
    following.current = f;
    setGenerating(true);
    let finalText = "";
    const card = (d) =>
      mounted.current &&
      setItems((l) => {
        if (d.requestId && l.some((x) => x.kind === "prompt" && x.requestId === d.requestId)) return l;
        const i = l.findIndex((x) => x.id === liveId);
        const c = { kind: "prompt", id: uid(), requestId: d.requestId, prompt: d.prompt, pkind: d.kind, turn, enter: true };
        return i < 0 ? [...l, c] : [...l.slice(0, i), c, ...l.slice(i)];
      });
    try {
      await open(
        {
          snapshot: (d) => {
            finalText = d.text;
            if (typeof d.folder === "string") f.folder = d.folder;
            patchLive(liveId, (it) => ({ ...it, text: d.text, interim: d.interim || [], files: d.files || [], activity: d.steps, startedAt: d.startedAt }));
            d.prompts.forEach(card);
            if (d.stopping && mounted.current) setStopping(true);
          },
          text: (d) => {
            finalText = d.text;
            patchLive(liveId, (it) => ({ ...it, text: d.text }));
          },
          // 模型在回合中间说的一段话：接在已经说过的后面
          interim: (d) => patchLive(liveId, (it) => ({ ...it, interim: [...(it.interim || []), d.text] })),
          activity: (d) => patchLive(liveId, (it) => ({ ...it, activity: upsertStep(it.activity, d) })),
          prompt: (d) => {
            notify(bot.name, t("notify.prompt"), `amb-prompt-${bot.id}`);
            card(d);
          },
          // 交付的文件（回合中 present 时就来）：挂在这条回复下面，图片直接显示
          file: (d) => {
            markDone("hands");
            patchLive(liveId, (it) => ({ ...it, files: addFile(it.files, d) }));
          },
          stopping: () => mounted.current && setStopping(true),
          error: (d) => {
            finalText = "⚠️ " + (d.message || t("common.error"));
          },
        },
        f.ac.signal,
      );
    } catch (e) {
      if (e.name !== "AbortError") finalText = "⚠️ " + e.message;
      // 发送那一刻的工作文件夹和服务端的对不上（别的窗口刚换过）：没有受理；重新读一次选择，重试按钮照常可用
      if (e.data?.code === "folderChanged") void refreshFolder(bot.id);
    }
    if (following.current === f) following.current = null;
    if (!mounted.current || (f.ac.signal.aborted && !f.local)) return null;
    setGenerating(false);
    setStopping(false);
    return finalText;
  };

  // 接上进行中的消息；结束后重新读历史（存下的用户消息和回复替换掉这几项，不重复）
  const attach = async (t) => {
    if (following.current) return;
    stick.current = true;
    const finalText = await follow("a" + t.id, t.id, (h, signal) => attachChat(bot.id, t.id, h, signal));
    reloadAfter.current = false;
    if (finalText === null) return;
    // 出错时只在对话里留一个主要提示（重新读历史后就是那条出错的回复），不再另弹一条同样的提示
    if (isError(finalText)) setCue({ kind: "error", at: Date.now() });
    load({ since: t.startedAt, ms: Date.now() - t.startedAt });
  };
  attachRef.current = attach;

  /**
   * 回复还在进行时又发一条（不是命令）：交给服务端并进正在进行的处理，模型下一步就看到它，回复在那一条里一起给。
   * 用户消息先插在进行中的回复上面；服务端没能并入（那一轮刚好结束）时它按普通消息处理，结束后重新读历史。
   */
  const steer = async (msg) => {
    setText("");
    requestAnimationFrame(() => autoGrow(ta.current));
    lastUser.current = msg;
    stick.current = true;
    const turn = following.current?.turn;
    setItems((l) => {
      const list = l || [];
      const user = { kind: "msg", id: uid(), role: "user", text: msg, at: Date.now(), enter: true, turn };
      const i = list.findIndex((x) => x.live && x.turn === turn);
      return i < 0 ? [...list, user] : [...list.slice(0, i), user, ...list.slice(i)];
    });
    reloadAfter.current = true;
    try {
      await streamChat(bot.id, msg, {}, new AbortController().signal, folderIdOf(bot.id));
    } catch (e) {
      failed(e);
    }
    if (mounted.current && !following.current && reloadAfter.current) {
      reloadAfter.current = false;
      load();
    }
  };

  /**
   * 开始新对话：不发「/new」、不出气泡和「思考中」。成功时对话末尾出现灰色分隔线「已开始新对话」并滚到底，输入框获得焦点，
   * 欢迎示例收起；交接便条在后台写（服务端）。已经是新对话、代理没启用、开新对话本身出错时不加分隔线，底部轻提示。
   */
  const newConversation = async () => {
    if (newBusy || generating || following.current) return;
    history.clear();
    setFindOpen(false);
    setSamples([]);
    consumeWelcome();
    const focus = () => requestAnimationFrame(() => ta.current?.focus());
    if (items !== null && freshConversation(items)) {
      setHint({ text: t("chat.newConv.already"), ms: 2000 });
      return focus();
    }
    setNewBusy(true);
    try {
      const r = await api(`/bots/${encodeURIComponent(bot.id)}/chat/new`, { method: "POST", body: {} });
      if (!mounted.current) return;
      if (r.status === "started") {
        // 新对话不带上一段没发出的附件
        clearDraft(bot.id);
        // 新对话不带入旧的工作文件夹
        void resetFolder(bot.id);
        stick.current = true;
        setUnseen(false);
        setItems((l) => [...(l || []), { kind: "divider", id: `d${r.at}`, at: r.at, enter: true }]);
      } else if (r.status === "already") setHint({ text: t("chat.newConv.already"), ms: 2000 });
      else if (r.status === "off") setHint({ text: t("chat.newConv.agentOff"), ms: 5000 });
      else setHint({ text: t("chat.newConv.failed", { error: r.error || t("common.error") }), ms: 5000 });
    } catch (e) {
      if (mounted.current) setHint({ text: t("chat.newConv.failed", { error: e.message }), ms: 5000 });
    } finally {
      if (mounted.current) setNewBusy(false);
      focus();
    }
  };

  /**
   * 带附件的消息（用的还是原来的发送按钮）：冻结这一刻的文字和有序的内容版本，交给服务端原子受理；只有受理了才出现一条消息、
   * 清掉这次发出的输入（等待期间新打的字不动）。没受理时文字和附件原位保留，只给一句原因。
   * 断线、结果不明时保留输入并提示，之后只查同一个请求：确认受理就显示原消息，确认未受理才放开原发送按钮，不自动重发。
   */
  const accepted = (r, sentText, cids) => {
    settleSent(bot.id, cids);
    // 等待期间又打了字：只去掉已经发出去的那一段
    setText((cur) => (cur.trim() === sentText ? "" : cur.startsWith(sentText) ? cur.slice(sentText.length).replace(/^\s+/, "") : cur));
    requestAnimationFrame(() => autoGrow(ta.current));
    consumeWelcome();
    sentOnce.current = true;
    stick.current = true;
    history.clear();
    // 历史里已经有这条用户消息（带附件）；接上它的回合
    void load();
  };
  const sendWithAttachments = async (msg) => {
    if (sendingAtt.current) return;
    const check = sendCheck(draftStore(bot.id).get(), { text: msg, generating: generating || !!following.current });
    if (check.blocked) return attachNotify(bot.id, check.blocked, undefined, check.params);
    sendingAtt.current = true;
    setSending(bot.id, true);
    const clientMessageId = newMessageId();
    try {
      const r = await submitAttachments(bot.id, msg, clientMessageId, folderIdOf(bot.id));
      if (!mounted.current) return;
      if (r.ok) return accepted(r.receipt, msg, r.cids);
      if (r.unknown) {
        setUnknown(bot.id, { clientMessageId, text: msg, cids: r.cids });
        return;
      }
      attachNotify(bot.id, r.code, undefined, r.params);
      // 工作文件夹的选择在别处变了：重新读一次，让人看清楚再发
      if (r.code === "folderChanged") void refreshFolder(bot.id);
    } finally {
      sendingAtt.current = false;
      setSending(bot.id, false);
    }
  };
  // 结果不明：每 2 秒查一次原请求，期间不能再发
  useEffect(() => {
    const u = draft.unknown;
    if (!u) return;
    let alive = true;
    const tick = async () => {
      const r = await querySend(bot.id, u.clientMessageId);
      if (!alive || !mounted.current) return;
      if (r.status === "accepted") return accepted(r.receipt, u.text, u.cids);
      if (r.status === "none") {
        // 确认没有受理：输入原样留着，条件允许后点原发送按钮
        setUnknown(bot.id, null);
        void refreshAttachments(bot.id);
        attachNotify(bot.id, "network");
      }
    };
    const timer = setInterval(tick, 2000);
    void tick();
    return () => { alive = false; clearInterval(timer); };
  }, [draft.unknown?.clientMessageId]);
  // 服务连不上时隔几秒再读一次能力，连上了提示自己消失
  useEffect(() => {
    if (!draft.offline) return;
    const timer = setInterval(() => void refreshAttachments(bot.id), 5000);
    return () => clearInterval(timer);
  }, [draft.offline]);

  // —— 拖入真实的系统文件：对话主区都能放，输入框高亮成落点；松开前不读文件、不发送 ——
  const onDragEnter = (e) => {
    if (!isFileDrag(e.dataTransfer)) return;
    const d = dragState.current;
    // 隔了一阵没有拖动事件：是新的一次拖动，上一次按 Esc 的取消不再算数
    if (Date.now() - d.last > 1500) d.cancelled = false;
    d.last = Date.now();
    if (!d.cancelled) setDragging(true);
  };
  const onDragOver = (e) => {
    if (!isFileDrag(e.dataTransfer)) return;
    e.preventDefault();
    dragState.current.last = Date.now();
    e.dataTransfer.dropEffect = dragState.current.cancelled ? "none" : "copy";
  };
  const onDragLeave = (e) => {
    // 经过内部子节点不算离开；拖出主区或窗口才收起
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setDragging(false);
  };
  const onDrop = (e) => {
    if (!isFileDrag(e.dataTransfer)) return;
    e.preventDefault();
    const cancelled = dragState.current.cancelled;
    dragState.current = { cancelled: false, last: 0 };
    setDragging(false);
    if (cancelled) return;
    const { files, dirs } = droppedFiles(e.dataTransfer);
    // 文件夹不加入、不展开（提示用上方的选择文件夹）；同一次拖进来的文件逐项照常核对
    if (!files.length && !dirs.length) return attachNotify(bot.id, "unreadable");
    void addFiles(bot.id, files, dirs);
    requestAnimationFrame(() => ta.current?.focus());
  };
  useEffect(() => {
    if (!dragging) return;
    // Esc 取消这一次拖动：收起遮罩，直到这次拖动结束都不再唤起
    const key = (e) => {
      if (e.key !== "Escape") return;
      dragState.current.cancelled = true;
      setDragging(false);
    };
    const end = () => setDragging(false);
    window.addEventListener("keydown", key, true);
    window.addEventListener("dragend", end);
    window.addEventListener("blur", end);
    return () => { window.removeEventListener("keydown", key, true); window.removeEventListener("dragend", end); window.removeEventListener("blur", end); };
  }, [dragging]);

  const send = async (raw) => {
    const msg = (raw ?? text).trim();
    // 当前输入里有附件：走带附件的发送（不当命令、不并进正在进行的回复、不排队）
    if (raw === undefined && draftStore(bot.id).get().items.length) return sendWithAttachments(msg);
    if (raw === undefined && draftStore(bot.id).get().unknown) return attachNotify(bot.id, "unknown");
    if (msg) { history.clear(); setFindOpen(false); }
    // 手动输入的 /new（后面的文字忽略）和新建按钮一样；回复进行中时排到回复结束后立即开始
    if (/^\/new(\s|$)/i.test(msg)) {
      if (raw === undefined) {
        setText("");
        requestAnimationFrame(() => autoGrow(ta.current));
      }
      if (generating || following.current) {
        newQueued.current = true;
        return;
      }
      return newConversation();
    }
    if (msg && (generating || following.current) && !msg.startsWith("/") && raw === undefined) {
      // 进行中的那一轮绑定的工作文件夹和现在选的不一样：不并进去（不让人以为补充会改用新目录），回复结束后再发
      if (!steerOk()) return setHint({ text: t("folder.waitTurn"), ms: 4000 });
      return steer(msg);
    }
    // 正在回复时点「存成技能…」或发 /skill：排在这一轮后面，回复结束后再整理
    if (msg && (generating || following.current) && /^\/skill\b/i.test(msg)) {
      skillQueued.current = msg;
      if (raw === undefined) setText("");
      return toast(t("mySkills.queued"));
    }
    if (!msg || generating || following.current) return;
    if (raw === undefined) {
      setText("");
      requestAnimationFrame(() => autoGrow(ta.current));
    }
    if (!msg.startsWith("/")) lastUser.current = msg;
    consumeWelcome();
    sentOnce.current = true;
    stick.current = true;
    const liveId = uid();
    const isReset = /^\/reset\b/i.test(msg);
    if (isReset) setSamples([]);
    setItems((l) => [...(l || []), { kind: "msg", id: uid(), role: "user", text: msg, at: Date.now(), enter: true, turn: liveId }, { kind: "msg", id: liveId, role: "assistant", text: "", at: Date.now(), live: true, startedAt: Date.now(), turn: liveId }]);
    // 命令不绑定工作文件夹；其余的消息带上点发送那一刻的选择
    const folder = msg.startsWith("/") ? undefined : folderIdOf(bot.id);
    const finalText = await follow(liveId, liveId, (h, signal) => streamChat(bot.id, msg, h, signal, folder), folder ?? "");
    if (finalText === null) return;
    // 窗口不在前台时通知（设置 › 常规 › 回复完成时通知）
    if (finalText) notify(bot.name, isError(finalText) ? t("notify.replyError", { text: plainSnippet(errText(finalText)) }) : plainSnippet(finalText) || t("notify.replyDone"), `amb-reply-${bot.id}`);
    // 上手清单：普通消息有了回复就算打过招呼；/model 切换成功算换过模型；其余能从数据里看出来的（记忆、渠道）问一次后端
    if (finalText && !isError(finalText)) {
      if (!msg.startsWith("/")) { markDone("hello"); if (bot.id !== "default") markDone("second"); }
      const gs = guide.get();
      if (isActive(gs) && guideStep(gs)) {
        refreshGuide();
        // 记忆可能在回合之后才写入、渠道可能稍后才连上：再看几次
        refreshGuideSoon();
      }
    }
    if (isError(finalText)) setCue({ kind: "error", at: Date.now() });
    if (reloadAfter.current) {
      reloadAfter.current = false;
      return load();
    }
    setItems((l) => {
      const out = [];
      for (const item of l || []) {
        if (item.turn !== liveId) {
          out.push(item);
          continue;
        }
        const { turn, ...it } = item; // 结束了：不再属于进行中的消息
        if (it.id !== liveId) out.push(it);
        else if (isError(finalText))
          out.push({ kind: "error", id: liveId, text: errText(finalText), retry: msg.startsWith("/") ? undefined : msg, at: it.at, activity: it.activity, interim: it.interim, files: it.files, workedMs: Date.now() - it.startedAt, enter: true });
        else if (finalText || it.activity?.length || it.interim?.length || it.files?.length) out.push({ ...it, text: finalText, live: false, workedMs: Date.now() - it.startedAt });
      }
      return isReset && !isError(finalText) ? out.filter((x) => x.id === liveId) : out;
    });
    if (/^\/model\s+\S/i.test(msg)) load();
  };

  /**
   * 停止：交给服务端（/conversations/:id/stop），纯对话、排队中、等代理启动、代理回合、接上的消息都是这一条路；
   * 事件流照常收到"已中止"再结束。代理要重启进程，可能要几秒，这期间显示"正在停止…"。
   */
  const stop = async () => {
    if (stopping || !following.current) return;
    setStopping(true);
    try {
      const r = await api(`/conversations/${encodeURIComponent(convId.current || `${bot.id}:web:console`)}/stop`, { method: "POST", body: {} });
      // 服务端已经没有在处理的了（刚好结束）：事件流马上会收尾；万一没有，几秒后在本页收尾
      if (!r.stopped) {
        const f = following.current;
        setTimeout(() => {
          if (f && following.current === f) {
            f.local = true;
            f.ac.abort();
          }
        }, 3000);
      }
    } catch (e) {
      if (mounted.current) setStopping(false);
      failed(t("chat.error.stopFailed", { error: e.message }));
    }
  };
  const loadActivity = (mid) => () => api(`/conversations/${encodeURIComponent(convId.current)}/messages/${mid}/activity`).then((d) => d.steps);

  // 出错提示里的「当前模型」（官方 Key 的模型要去官方 Key 那里修）；选择在输入框里
  const effective = convModel || bot.defaultModel || defaultModel || (models && models[0]) || "";

  // —— 渲染 ——
  /** 任务胶囊挂在哪一项后面：请求那条用户消息之后的第一条回复；那一轮还在进行时挂在进行中的回复后面 */
  const chipsAfter = useMemo(() => {
    const map = new Map();
    const list = items || [];
    for (const t of [...tasks].sort((a, b) => a.createdAt - b.createdAt)) {
      const i = list.findIndex((x) => x.mid === t.originMessageId);
      let at;
      if (i >= 0) at = list.find((x, k) => k > i && !(x.kind === "msg" && x.role === "user")) ?? list[i];
      else if (list.some((x) => x.live)) at = list.findLast((x) => x.turn);
      if (!at) continue;
      map.set(at.id, [...(map.get(at.id) || []), t]);
    }
    return map;
  }, [items, tasks]);

  const chips = (it) => (chipsAfter.get(it.id) || []).map((t) => html`<${TaskChip} key=${t.id} task=${t} onChanged=${loadTasks} />`);
  // 图片读完了高度才定下来：本来就跟着底部时，再贴一次底
  const onMedia = () => {
    if (stick.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  };
  const files = (it) => html`<${DeliveredFiles} files=${it.files} conv=${convId.current || `${bot.id}:web:console`} canOpen=${canOpen} onLoad=${onMedia} />`;
  const changeModel = (id) => (id === bot.id ? composer.current?.openModel() : onOpenBotSettings?.(id, "model"));
  const rows = useMemo(() => {
    const out = [];
    const baseItems = history.context ? toItems(history.context.messages) : items;
    // 关于我的提示行、灰色小字挂到哪一项；B 主对话里的两行按时间插进去
    const notes = history.context ? new Map() : aboutMeByItem(aboutMe, baseItems, replyAfter);
    const co = history.context ? { after: new Map(), before: new Map(), loose: [] } : collabByItem(collab, baseItems, replyAfter);
    const shownItems = co.loose.length ? [...(baseItems || [])] : baseItems;
    for (const x of co.loose) {
      const i = shownItems.findIndex((m) => m.at > x.at && !m.live);
      shownItems.splice(i < 0 ? shownItems.length : i, 0, x);
    }
    const coItems = (list) => (list || []).map((x, i) => html`<${CollabItem} key=${i} x=${x} onSignIn=${() => onOpenSettings("modelflare", "account")} onChangeModel=${changeModel} />`);
    let prev = null;
    let afterDivider = false;
    const lastAi = (shownItems || []).findLast((x) => x.kind === "msg" && x.role === "assistant" && !x.live)?.id;
    for (const it of shownItems || []) {
      // 「已开始新对话」：一条灰色分隔线，不另画时间；下一条消息不和分隔线前的连成一组
      if (it.kind === "divider") {
        out.push(html`<div class=${`conv-divider${it.enter ? " enter" : ""}`} role="separator" aria-label=${t("chat.newConv.divider")} key=${it.id}><span>${t("chat.newConv.divider")}</span></div>`);
        afterDivider = true;
        continue;
      }
      if (it.at && (!prev?.at || new Date(it.at).toDateString() !== new Date(prev.at).toDateString() || it.at - prev.at > 15 * 60_000)) {
        out.push(html`<div class="time-sep" key=${"t" + it.id}>${fmtSep(it.at)}</div>`);
        prev = null;
      }
      const role = it.kind === "msg" ? it.role : "assistant";
      const cont = prev && !afterDivider && (prev.kind === "msg" ? prev.role : "assistant") === role;
      afterDivider = false;
      const cls = `msg-row ${role}${cont ? " cont" : ""}${it.enter ? " enter" : ""}${it.live ? " live" : ""}`;
      if (it.kind === "collab") {
        out.push(html`<div class="msg-row assistant collab-row" key=${it.id}><${CollabItem} x=${it.line} /></div>`);
        prev = it;
        continue;
      }
      if (it.kind === "msg") {
        // 回复：工作状态行（处理过程折叠在里面）、模型说的话（回合中间说的在前）、交付的文件
        const shown = it.permissionWait ? "" : it.role === "user" ? it.text : shownText(it);
        out.push(html`<div class=${`${cls}${it.id === lastAi ? " last" : ""}`} data-message-id=${it.mid} key=${it.id}>
          ${it.role === "user"
            ? userMessage(it, bot.id, ta, onMedia, canOpen)
            : html`${co.before.has(it.id) && html`<div class="collab-lines">${coItems(co.before.get(it.id))}</div>`}
              ${(it.live || it.workedMs || it.steps) && html`<${WorkLine} live=${it.live} stopping=${it.live && stopping} text=${it.text} startedAt=${it.startedAt} workedMs=${it.workedMs}
                steps=${it.activity} count=${it.steps} used=${it.used} botId=${bot.id} load=${it.mid ? loadActivity(it.mid) : undefined} />`}
              ${it.permissionWait && html`<${CuPermissionCard} botId=${bot.id} messageId=${it.mid} />`}
              ${it.ruleSource && html`<${RuleSource} source=${it.ruleSource} botId=${bot.id} />`}
              ${shown && html`<div class="msg"><${Markdown} text=${shown} conv=${convId.current || `${bot.id}:web:console`} canOpen=${canOpen} /></div>`}
              ${!it.live && systemPerms?.supported && saysDesktopDenied(shown) && html`<div class="folder-denied"><button type="button" class="btn sm" onClick=${() => api("/computer-use/permissions/open", { method: "POST", body: { kind: "files" } }).catch(failed)}>${t("firstUse.cu.openSettings")}</button></div>`}
              ${files(it)}
              ${chips(it)}
              <${AboutMeNotes} list=${notes.get(it.id)} onChanged=${loadAboutMe} />
              ${co.after.has(it.id) && html`<div class="collab-lines">${coItems(co.after.get(it.id))}</div>`}
              ${ruleActions.filter((a) => a.messageId === it.mid).map((a) => html`<${RuleCard} key=${a.id} action=${a} />`)}
              ${!it.live && html`<${MsgActions} text=${shown} at=${it.at} />`}`}
        </div>`);
      } else if (it.kind === "prompt") {
        out.push(html`<div class=${cls} key=${it.id}>${it.pkind === "skill_install" ? html`<${SkillInstallCard} id=${it.requestId} />` : it.pkind === "skill_draft" ? html`<${SkillDraftCard} id=${it.requestId} />` : html`<${PromptCard} requestId=${it.requestId} fallback=${it.prompt} chatBot=${bot.id} />`}</div>`);
      } else if (it.kind === "media-demo") {
        out.push(html`<div class=${cls} key=${it.id} data-guide-sample><${MediaDemo} onLoad=${onMedia} account=${account} /></div>`);
      } else if (it.kind === "error") {
        out.push(html`<div class=${cls} data-message-id=${it.mid} key=${it.id}>
          ${(it.activity?.length || it.steps) && html`<${WorkLine} workedMs=${it.workedMs} steps=${it.activity} count=${it.steps} used=${it.used} botId=${bot.id} load=${it.mid ? loadActivity(it.mid) : undefined} />`}
          ${it.interim?.length > 0 && html`<div class="msg"><${Markdown} text=${it.interim.join("\n\n")} conv=${convId.current || `${bot.id}:web:console`} canOpen=${canOpen} /></div>`}
          ${files(it)}
          <${ErrorNotice} text=${it.text} topupUrl=${account?.topupUrl} onRetry=${it.retry ? () => send(it.retry) : undefined} source=${officialSource(effective)} ranSteps=${!!(it.activity?.length || it.steps || it.files?.length)}
            onSwitchModel=${() => composer.current?.openModel()} onFixKey=${() => onOpenSettings("modelflare", officialSource(effective) ? "official-add" : "account")} />
        </div>`);
      }
      // 回复下面直接挂在同一行里（在复制按钮之前）；挂在卡片、文件、出错提示后面时自成一行
      if (!(it.kind === "msg" && it.role === "assistant") && chipsAfter.has(it.id)) out.push(html`<div class="msg-row assistant cont" key=${"task-" + it.id}>${chips(it)}</div>`);
      // 出错提示后面的提示行、灰色小字（这一轮记下了、发出了，回复却出错了）
      if (it.kind === "error" && (notes.has(it.id) || co.after.has(it.id))) out.push(html`<div class="msg-row assistant cont" key=${"co-" + it.id}><${AboutMeNotes} list=${notes.get(it.id)} onChanged=${loadAboutMe} />${co.after.has(it.id) && html`<div class="collab-lines">${coItems(co.after.get(it.id))}</div>`}</div>`);
      prev = it;
    }
    return out;
  }, [items, history.context, generating, stopping, chipsAfter, lang, canOpen, ruleActions, aboutMe, collab, systemPerms?.supported]);

  // 经 ctl 交来的话（专业 Bot 界面上的操作、还没有实例时发的第一句）：历史还没读到时先记着，读到后再发——
  // 否则先发出去的这一轮会被随后到的历史整个换掉（回复很快出错时连提示都没了）
  const queued = useRef("");
  const skillQueued = useRef("");
  useEffect(() => {
    if (generating || following.current || !skillQueued.current) return;
    const msg = skillQueued.current;
    skillQueued.current = "";
    void send(msg);
  }, [generating]);
  // 回复进行中手动输入的 /new：回复结束（或停止）后立即开始新对话
  useEffect(() => {
    if (generating || following.current || !newQueued.current) return;
    newQueued.current = false;
    void newConversation();
  }, [generating]);
  if (ctl) ctl.current = { send: (msg) => (generating || following.current || queued.current ? false : items === null ? ((queued.current = msg), true) : (void send(msg), true)) };
  useEffect(() => () => { if (ctl) ctl.current = null; }, []);
  useEffect(() => {
    if (items === null || !queued.current) return;
    const msg = queued.current;
    queued.current = "";
    void send(msg);
  }, [items !== null]);

  const empty = !history.context && items && items.length === 0;
  const showGuide = isActive(g) && g.welcome && bot.id === g.primaryBotId;
  // 头像跟着对话走：等你批准 > 还没出字（思考）/ 出字了（回复）> 你在输入（在听）
  const replying = generating && (items || []).some((x) => x.live && x.text);
  const face = pending > 0 ? "waiting" : generating ? (replying ? "replying" : "thinking") : text.trim() ? "listening" : "idle";
  const toBottomBtn = usePresence(!atBottom);
  return html`<section class=${`chat${scrolled ? " scrolled" : ""}${findOpen || history.context || history.loading || history.error ? " has-chat-tools" : ""}${dragging ? " dropping" : ""}`} data-screen="chat" data-drop-zone aria-label=${t("chat.aria", { name: bot.name })}
    onDragEnter=${onDragEnter} onDragOver=${onDragOver} onDragLeave=${onDragLeave} onDrop=${onDrop}>
    <header class="chat-head">
      ${onBackToSearch && html`<${IconButton} icon="chevLeft" label=${t("search.backResults")} onClick=${onBackToSearch} />`}
      <button type="button" class="head-bot bot-hover" data-guide="info" aria-pressed=${infoOpen} title=${t("chat.infoPanel")} onClick=${onToggleInfo}>
        <${BotAvatar} bot=${bot} size=${22} state=${face} cue=${cue} />
        <span class="name">${bot.name}</span>
      </button>
      <span class="grow"></span>
      <${IconButton} icon="search" iconSize="md" label=${t("search.findInChat")} onClick=${() => setFindOpen(true)} />
      <${IconButton} icon="compose" iconSize="md" label=${generating ? t("chat.newConv.busy") : t("chat.newConvCmd")} disabled=${generating} aria-busy=${newBusy || undefined} onClick=${newConversation} />
      <${IconButton} icon="panel" iconSize="md" label=${t("chat.infoPanel")} on=${infoOpen} aria-pressed=${infoOpen} onClick=${onToggleInfo} />
    </header>
    ${bot.origin === "catalog" && html`<${OfficialGuideNotice} installed busy=${generating || !!pending || !!cuBlocked} />`}
    <div class="chat-tools" hidden=${!(findOpen || history.context || history.loading || history.error)}>
      <${ConversationFind} scope=${{ conversation: viewId }} onMatch=${history.show} scroller=${scroller} open=${findOpen} onOpen=${() => setFindOpen(true)} onClose=${() => { setFindOpen(false); history.clearHighlight(); }} />
      <${HistoryBar} history=${history} onLatest=${toBottom} />
    </div>
    <div class="chat-scroll" ref=${scroller} onScroll=${onScroll}>
      <div class=${`chat-col${items ? " ready" : ""}`} role="log" aria-live="polite" aria-busy=${generating}>
        <${HistoryPageButton} history=${history} direction="before" />
        ${loadErr && html`<${Notice} tone="red" action=${html`<button type="button" class="btn" onClick=${() => load()}>${t("common.retry")}</button>`}>${t("chat.error.loadHistory", { error: loadErr })}<//>`}
        ${items === null && html`<div class="chat-skel"><${Skeleton} w="40%" /><${Skeleton} w="28%" /></div>`}
        ${empty && html`<div class=${`chat-empty${showGuide ? " with-guide" : ""}`}>
          <${BotAvatar} bot=${bot} size=${88} state=${face} cue=${cue} lively pokeable greet />
          ${showGuide
            ? html`<${Welcome} bot=${bot} />`
            : html`<h2>${t("chat.empty.title", { name: bot.name })}</h2>
              <p>${t("welcome.normalBody")}</p>
              <div class=${`chips${starters?.length ? " starters" : ""}`}>
                ${starters?.length
                  ? starters.map((x) => html`<button type="button" class="chip" key=${x} onClick=${() => send(x)}>${x}</button>`)
                  : html`<button type="button" class="chip" onClick=${() => send(t("chat.empty.sample"))}>${t("chat.empty.sample")}</button>`}
              </div>`}
          <${PwshHint} />
        </div>`}
        ${rows}
        <${GuideCompletion} bot=${bot} account=${account} />
        ${samples.map((id) => html`<div class="msg-row assistant" key=${id} data-guide-sample><${MediaDemo} account=${account} onLoad=${onMedia} /></div>`)}
        <${HistoryPageButton} history=${history} direction="after" />
      </div>
    </div>
    ${toBottomBtn.mounted && html`<button type="button" class=${`to-bottom${toBottomBtn.leaving ? " leaving" : ""}`} aria-label=${t("chat.toBottom")} onClick=${toBottom}><${Icon} name="down" size="md" />${unseen && html`<span class="new"></span>`}</button>`}
    ${hint && html`<div class="chat-hint" role="status" key=${hint.text}>${hint.text}</div>`}
    ${dragging && html`<${DropOverlay} limits=${draft.server?.limits} />`}
    <${ImageLightbox} />
    <div class="composer-dock">
      <${WorkFolder} botId=${bot.id} />
      <${Composer} bot=${bot} text=${text} setText=${setText} taRef=${ta} ctl=${composer} guide steer=${steerOk()} onNewConversation=${newConversation} attachments dragging=${dragging}
        placeholder=${t("chat.composer.placeholder", { name: bot.name })} label=${t("chat.composer.label")}
        generating=${generating} stopping=${stopping} sent=${sentOnce.current} onSend=${send} onStop=${stop}
        models=${models} modelsError=${modelsError} reloadModels=${reloadModels} defaultModel=${defaultModel} account=${account} onAccount=${onAccount}
        onBotUpdated=${onBotUpdated} onOpenBotSettings=${onOpenBotSettings} />
    </div>
  </section>`;
}
