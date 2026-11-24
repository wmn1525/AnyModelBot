/**
 * 机器人之间发消息（PRD 2026-11-15 R5–R12）：你在 A 的对话里说「交给 B」→ A 给 B 发消息 → B 在后台用自己的模型、权限、预算干活
 * （B 名下的一个后台任务，tasks.handoff_id 指回这件事）→ B 回消息给 A → A 核对、汇总后回复你。
 *
 * - 使用条件在这里检查（不只在界面上）：已登录 Modelflare，A、B 当前用的都是 Modelflare 模型（不是自己 API Key 接入的）。
 *   每次发出、排着的这件开始前都查；做到一半换了模型的做完为止，退出登录时进行中的停下、重新登录后不自动继续。
 * - 只发一层、一次一个：只有聊天会话有 message_bot（任务、规则会话里没有，B 处理的这件事在任务会话里）；一条用户消息最多引出一件，
 *   和 B 正在做的一样时不重复发；每天最多发起 N 件（本机时区 00:00 恢复）。
 * - 每件：最多花 $1、最长 4 小时（等批准不算），重做最多 2 次（都可在设置里改，只影响之后发起的）；同一个机器人最多同时接 3 件，
 *   实际同时进行的受后台名额限制，排队超过 24 小时没开始的作废。
 * - 两人对话：一对机器人之间所有往来的只读记录（store/collab.ts）；进展和意外是居中的一行灰字（note，按看的人的语言显示）。
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Store } from "../store/db.js";
import type { HandoffRow, HandoffState, HandoffStop, PairMessage } from "../store/collab.js";
import { pairKeyOf } from "../store/collab.js";
import type { HandoffHooks, TaskService } from "../tasks/service.js";
import type { ApprovalEvent } from "../agent/approvals.js";
import { questionsOf } from "../agent/approvals.js";
import type { BotSettings } from "../domain/bot-settings.js";
import { localParts, systemTimeZone } from "../domain/quiet.js";
import type { ActivityStep } from "../domain/activity.js";
import { looksSecret } from "../agent/memory.js";
import { checkInput, collabNote, handoffBrief, stopInput } from "../agent/prompts/collab.js";
import { t } from "../i18n/index.js";
import { logger } from "../log.js";

const log = logger("collab");

export const BUDGET_CHOICES = [0.5, 1, 2, 5, 10] as const;
export const CAP_CHOICES = [30 * 60_000, 3600_000, 2 * 3600_000, 4 * 3600_000] as const;
export const DAILY_CHOICES = [10, 30, 50, 100] as const;
export const REDO_CHOICES = [0, 1, 2, 3] as const;
/** 同一个机器人最多同时接几件别的机器人发来的事 */
export const PER_BOT = 3;
/** 排队多久没开始就作废 */
export const QUEUE_MS = 24 * 3600_000;
/** 一次最多带几个文件、每个多大 */
const MAX_FILES = 10;
const MAX_FILE_BYTES = 100 * 1024 * 1024;

export interface CollabSettings {
  /** 允许机器人之间发消息 */
  enabled: boolean;
  budgetUsd: number;
  capMs: number;
  daily: number;
  redo: number;
}
export const DEFAULT_COLLAB: CollabSettings = { enabled: true, budgetUsd: 1, capMs: 4 * 3600_000, daily: 30, redo: 2 };
const SETTINGS_KEY = "collab.settings";
const NOTICE_KEY = "collab.notice:";

/** 还没结束的 */
const OPEN: HandoffState[] = ["queued", "working", "waiting", "replied"];
/** 已经开始、还没回消息的（B「手上」的） */
const BUSY: HandoffState[] = ["working", "waiting"];

/** 对话里 A 的回复下面的按钮：去登录、去换模型（哪一边） */
export interface CollabNotice {
  at: number;
  kind: "signin" | "model";
  /** model：要换模型的机器人（A 自己或 B），可以两个 */
  bots?: string[];
}

export interface CollabOptions {
  store: Store;
  tasks: TaskService;
  signedIn: () => boolean;
  /** 这个模型是不是 Modelflare 的（不是自己 API Key 接入的） */
  modelflareModel: (model: string) => boolean;
  defaultModel: () => string;
  workspace: (botId: string) => string;
  settings: (botId: string) => BotSettings;
  /** B 的后台名额（同时进行几件） */
  slots: (botId: string) => number;
  /** 让 A 开一轮（核对、汇总）：排在 A 正在处理的消息后面；keep() 为假时这一轮的话不存（A 让 B 重做了） */
  turn?: (botId: string, conversationId: string, input: string, keep: () => boolean) => Promise<{ messageId?: number; text?: string; error?: string }>;
  timeZone?: () => string;
  now?: () => number;
  onChange?: () => void;
}

const hex = (n: number) => crypto.randomBytes(n).toString("hex");
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
const squash = (s: string) => s.replace(/İ/g, "I").toLowerCase().replace(/[\s，。,.!！?？；;：:、"'“”‘’「」]/g, "");

/** 发出前过滤登录信息和令牌：像密钥、密码的那一行换掉 */
export function redact(text: string): string {
  return text
    .split("\n")
    .map((line) => (looksSecret(line) ? line.replace(/(:|：|=|是|is)\s*\S.*$/i, "$1 [已隐藏]").replace(/\b[A-Za-z0-9_\-+=/.]{24,}\b/g, "[已隐藏]") : line))
    .map((line) => (looksSecret(line) ? "[已隐藏一行登录信息]" : line))
    .join("\n");
}

/** 两个名字的编辑距离（找最接近的机器人） */
function distance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

/** 两段要做的事是不是同一件（不重复发） */
function sameRequest(a: string, b: string): boolean {
  const x = squash(a);
  const y = squash(b);
  if (!x || !y) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const grams = (s: string) => new Set(Array.from({ length: Math.max(0, s.length - 1) }, (_, i) => s.slice(i, i + 2)));
  const gx = grams(x);
  const gy = grams(y);
  let both = 0;
  for (const g of gx) if (gy.has(g)) both++;
  return gx.size + gy.size > 0 && (2 * both) / (gx.size + gy.size) >= 0.8;
}

/** 处理过程的摘要：读了几个文件、运行了几条命令…（给两人对话里「处理过程：…」） */
export function stepsSummary(steps: ActivityStep[]): { count: number; reads: number; writes: number; commands: number; web: number; other: number } {
  const out = { count: steps.length, reads: 0, writes: 0, commands: 0, web: 0, other: 0 };
  for (const s of steps) {
    if (s.kind !== "tool" && s.kind !== "job" && s.kind !== "subagent") {
      out.count--;
      continue;
    }
    const tool = String(s.title ?? "").toLowerCase();
    if (/read|view|glob|grep|ls\b|list/.test(tool)) out.reads++;
    else if (/write|edit|patch|create|apply/.test(tool)) out.writes++;
    else if (/bash|shell|exec|command|pwsh|job/.test(tool) || s.kind === "job") out.commands++;
    else if (/web|search|fetch|browse/.test(tool)) out.web++;
    else out.other++;
  }
  return out;
}

export class CollabService {
  private sweepTimer: NodeJS.Timeout | undefined;
  /** 正在跑 A 的核对那一轮的件（同一件不并发） */
  private checking = new Set<string>();

  constructor(private o: CollabOptions) {}

  private get store(): Store {
    return this.o.store;
  }
  private now(): number {
    return (this.o.now ?? Date.now)();
  }
  private get db() {
    return this.o.store.collab;
  }
  private changed(): void {
    try {
      this.o.onChange?.();
    } catch {
      /* ignore */
    }
  }

  start(): void {
    clearInterval(this.sweepTimer);
    this.sweepTimer = setInterval(() => this.sweep(), 60_000);
    this.sweepTimer.unref?.();
    this.sweep();
    // 上次退出时 B 已经回了消息、A 还没核对完的：接着核对
    for (const h of this.db.list({ states: ["replied"], limit: 100 })) void this.check(h.id);
  }

  stop(): void {
    clearInterval(this.sweepTimer);
    this.sweepTimer = undefined;
  }

  // ---------- 设置 ----------

  settings(): CollabSettings {
    let s: Partial<CollabSettings> = {};
    try {
      s = JSON.parse(this.store.getKV(SETTINGS_KEY) || "{}");
    } catch {
      s = {};
    }
    const pick = <T extends number>(v: unknown, list: readonly T[], d: T): T => (list.includes(Number(v) as T) ? (Number(v) as T) : d);
    return {
      enabled: typeof s.enabled === "boolean" ? s.enabled : DEFAULT_COLLAB.enabled,
      budgetUsd: pick(s.budgetUsd, BUDGET_CHOICES, 1),
      capMs: pick(s.capMs, CAP_CHOICES, 4 * 3600_000),
      daily: pick(s.daily, DAILY_CHOICES, 30),
      redo: pick(s.redo, REDO_CHOICES, 2),
    };
  }

  /** 改设置：只能从下拉的值里选；未登录时不能改（R5） */
  setSettings(patch: Partial<CollabSettings>): { settings?: CollabSettings; error?: string } {
    if (!this.o.signedIn()) return { error: "signin" };
    const cur = this.settings();
    const next = { ...cur };
    if (patch.enabled !== undefined) next.enabled = !!patch.enabled;
    const check = <K extends "budgetUsd" | "capMs" | "daily" | "redo">(k: K, list: readonly number[]) => {
      if (patch[k] === undefined) return true;
      if (!list.includes(Number(patch[k]))) return false;
      next[k] = Number(patch[k]) as CollabSettings[K];
      return true;
    };
    if (!check("budgetUsd", BUDGET_CHOICES) || !check("capMs", CAP_CHOICES) || !check("daily", DAILY_CHOICES) || !check("redo", REDO_CHOICES)) return { error: "choice" };
    this.store.setKV(SETTINGS_KEY, JSON.stringify(next));
    log.info("collab settings changed", { enabled: next.enabled });
    this.changed();
    return { settings: next };
  }

  /** 本机时区的今天（YYYY-MM-DD） */
  today(at = this.now()): string {
    const p = localParts(at, this.o.timeZone?.() || systemTimeZone());
    return `${p.y}-${String(p.mo).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
  }

  usedToday(): number {
    return this.db.countDay(this.today());
  }

  // ---------- 模型和登录 ----------

  /** 这个机器人在这个会话里当前用的模型（会话里临时换的优先） */
  modelOf(botId: string, conversationId?: string): string {
    const conv = conversationId ? this.store.getConversation(conversationId) : undefined;
    return conv?.model || this.store.getBot(botId)?.defaultModel || this.o.defaultModel() || "";
  }

  /** 这个机器人现在能不能参与（它用的模型、后台小任务模型都是 Modelflare 的） */
  private modelOk(botId: string, conversationId?: string): boolean {
    const m = this.modelOf(botId, conversationId);
    if (!m || !this.o.modelflareModel(m)) return false;
    const utility = this.o.settings(botId).utilityModel;
    return !utility || this.o.modelflareModel(utility);
  }

  private botName(id: string): string {
    return this.store.getBot(id)?.name ?? id;
  }

  // ---------- 对话里的按钮（去登录、去换模型） ----------

  private notice(conversationId: string, n: Omit<CollabNotice, "at">): void {
    const list = this.notices(conversationId);
    list.push({ at: this.now(), ...n });
    this.store.setKV(NOTICE_KEY + conversationId, JSON.stringify(list.slice(-20)));
  }

  notices(conversationId: string): CollabNotice[] {
    try {
      const v = JSON.parse(this.store.getKV(NOTICE_KEY + conversationId) || "[]");
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }

  // ---------- 发起（A 的 message_bot） ----------

  /** 找机器人：名字全等 → 包含 → 最接近的（问用户是不是指它） */
  private findBot(name: string, self: string): { id?: string; closest?: string } {
    const want = name.trim().toLowerCase().replace(/^@/, "");
    const bots = this.store.listBots();
    if (!want) return {};
    const exact = bots.find((b) => b.name.trim().toLowerCase() === want || b.id === want);
    if (exact) return { id: exact.id };
    const part = bots.filter((b) => b.name.trim().toLowerCase().includes(want) || want.includes(b.name.trim().toLowerCase()));
    if (part.length === 1) return { id: part[0].id };
    const others = bots.filter((b) => b.id !== self);
    const best = others.map((b) => ({ b, d: distance(want, b.name.trim().toLowerCase()) })).sort((x, y) => x.d - y.d)[0];
    return { closest: best?.b.name };
  }

  /**
   * 用户有没有明确说：最近一条用户消息里点了 B 的名字，或 A 上一条回复里提到 B（建议过）、用户这条很短（「好」「交给它」）。
   * 机器人不能自己决定发给谁（R6）。
   */
  private explicit(conversationId: string, bName: string): boolean {
    const msgs = this.store.listMessages(conversationId, 12).filter((m) => m.role === "user" || m.role === "assistant");
    const i = msgs.findLastIndex((m) => m.role === "user");
    if (i < 0) return false;
    const user = msgs[i].content.toLowerCase();
    const name = bName.trim().toLowerCase();
    if (name && user.includes(name)) return true;
    const before = msgs.slice(0, i).findLast((m) => m.role === "assistant");
    return !!before && before.content.toLowerCase().includes(name) && msgs[i].content.trim().length <= 40;
  }

  /** message_bot：args 来自模型（bot、ask、title、task、points、files、done_when） */
  send(fromBot: string, conversationId: string, sessionChat: boolean, a: Record<string, unknown>): { text?: string; error?: string } {
    const conv = this.store.getConversation(conversationId);
    const bName = String(a.bot ?? "").trim();
    // 在哪发起：只在应用里的单聊；定时规则、后台任务和别的机器人发来的事里不能（这些会话里根本没有这个工具，这里再挡一次）
    if (!sessionChat || !conv || conv.botId !== fromBot)
      return { error: "Only your chat with the user can message other bots. This work came from somewhere else, so you cannot pass it on; say in your result which step the user should ask the other bot about directly." };
    if (conv.kind === "group")
      return { text: `Not sent: in a group chat, bots hand over with @ instead (mention ${bName || "the other bot"} in your reply if it should take over); messaging another bot works only in the app's one-to-one chat.` };
    if (conv.channel !== "web")
      return { text: `Not sent: bots can only message each other from the app's one-to-one chat. Tell the user in one sentence that they need to say it in the app to hand it to ${bName || "the other bot"}, and offer to do it yourself now (e.g. "这个要在应用里说，我才能发给${bName || "它"}；这次我先自己来？").` };
    // 使用条件
    if (!this.o.signedIn()) {
      this.notice(conversationId, { kind: "signin" });
      return { text: `Not sent: bots can only message each other after the user signs in to Okinto. Reply in one or two sentences in the user's language, like "机器人之间发消息需要先登录 Okinto 账户。登录后我就能交给${bName || "它"}；现在要我自己来吗？". The app adds a "Sign in" button under your reply. Do not suggest handing things to other bots again in this chat.` };
    }
    const st = this.settings();
    if (!st.enabled) return { text: `Not sent: bot collaboration is turned off. Say so in one sentence and ask whether to do it yourself or turn it on in Settings, like "机器人协作已关闭，我不能发消息给${bName || "它"}。要我自己来，还是去设置里打开？".` };
    const found = this.findBot(bName, fromBot);
    if (!found.id) return { text: found.closest ? `No bot is called "${bName}". Ask the user in one sentence whether they mean ${found.closest} (e.g. "没找到叫${bName}的机器人，你是说${found.closest}吗？"). Do not send yet.` : `No bot is called "${bName}". Ask the user which bot they mean.` };
    const to = this.store.getBot(found.id)!;
    if (to.id === fromBot) return { error: "You cannot message yourself. Do it yourself, or ask which other bot the user means." };
    if (!this.explicit(conversationId, to.name))
      return { error: `Only message ${to.name} when the user explicitly asks in this chat ("hand this to ${to.name}", "ask ${to.name} …") or says yes to your suggestion. If you think ${to.name} fits better, suggest it in one sentence instead; do not send.` };
    const badA = !this.modelOk(fromBot, conversationId);
    const badB = !this.modelOk(to.id);
    if (badA || badB) {
      this.notice(conversationId, { kind: "model", bots: [...(badA ? [fromBot] : []), ...(badB ? [to.id] : [])] });
      const who = badA && badB ? `both you and ${to.name} are` : badA ? "you are" : `${to.name} is`;
      return { text: `Not sent: ${who} using a model from the user's own API key; bots can only message each other when both use Okinto models. Say which side in one or two sentences and offer to do it yourself, like "${badB ? to.name : "我"}现在用的是你自己的 API Key 模型。两边的机器人都用 Okinto 模型时才能发消息。把${badB ? `${to.name}的` : "我的"}模型换回 Okinto 模型就行，或者这次我自己来？". The app adds a "Change model" button under your reply.` };
    }
    const today = this.today();
    if (this.db.countDay(today) >= st.daily)
      return { text: `Not sent: today's limit of ${st.daily} requests between bots is used up; it resets at 00:00. Say so in one sentence and offer to do it yourself, like "今天机器人之间的往来已经到上限了，明天 00:00 恢复，这件我先自己做？".` };
    // 一条用户消息最多引出 1 件
    const lastUser = this.store.listMessages(conversationId, 12).filter((m) => m.role === "user").at(-1)?.createdAt ?? 0;
    if (this.db.list({ conversationId, limit: 20 }).some((h) => h.createdAt >= lastUser))
      return { text: `Not sent: one message from the user can hand off only one request, to one bot. If they named two bots, say you started with the first and they can ask again for the other (e.g. "这一期一次只能交给一个机器人。我先交给…，${to.name}那边你可以再跟我说一次。").` };
    const task = clip(String(a.task ?? "").trim(), 4000);
    if (!task) return { error: "task is required: what the other bot should do (or the question to ask)." };
    // 不重复发：和 B 正在做的一样
    const dup = this.db.list({ fromBot, toBot: to.id, states: OPEN }).find((h) => sameRequest(h.title, String(a.title ?? task)) || sameRequest(h.message.split("\n")[0], task));
    if (dup) return { text: `Not sent: ${to.name} is already working on this (${dup.id}). Say in one sentence that you won't send it again and will tell them when it's done, like "${to.name}正在做这件事，我就不重复发了，做完我第一时间告诉你。".` };

    const ask = a.ask === true;
    const id = `h_${hex(5)}`;
    const now = this.now();
    const title = clip(oneLine(String(a.title ?? "") || task.split("\n")[0]), 60);
    const criteria = ask ? "" : clip(oneLine(String(a.done_when ?? "")), 300);
    const points = String(a.points ?? "")
      .split("\n")
      .map((x) => x.replace(/^\s*[-*•\d.、]+\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 6);
    // 带上文件：从 A 的工作区复制到 B 的工作区（inbox/from-<A>/<件>/）
    const files = this.copyFiles(fromBot, to.id, Array.isArray(a.files) ? a.files.map(String) : [], `inbox/from-${fromBot}/${id}`);
    const message = redact(
      [
        task,
        points.length ? `${t("collab.msgPoints")}\n${points.map((p) => `- ${p}`).join("\n")}` : "",
        files.length ? `${t("collab.msgFiles")}\n${files.map((f) => `- ${f}`).join("\n")}` : "",
        ask ? t("collab.msgAskOnly") : criteria ? t("collab.msgDoneWhen", { criteria }) : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
    const h = this.db.insert({ id, fromBot, toBot: to.id, conversationId, kind: ask ? "ask" : "do", title, message, criteria, redoLimit: st.redo, budgetUsd: st.budgetUsd, capMs: st.capMs, day: today, createdAt: now });
    this.db.addMessage({ pairKey: h.pairKey, handoffId: id, from: fromBot, kind: "message", text: message, files, at: now });
    const recent = this.db
      .messages(h.pairKey, 12)
      .filter((m) => m.kind === "message" && m.handoffId !== id)
      .slice(-6)
      .map((m) => ({ who: this.botName(m.from), text: m.text }));
    const fromName = this.botName(fromBot);
    const r = this.o.tasks.createHandoff({
      handoffId: id,
      botId: to.id,
      conversationId,
      title,
      budgetUsd: st.budgetUsd,
      capMs: st.capMs,
      ask,
      brief: (folder, memory) => handoffBrief({ from: fromName, ask, message, recent, files, memory, folder }),
    });
    if (!r.task) {
      this.db.update(id, { state: "dropped", stopReason: "error", error: r.error ?? "", endedAt: now, updatedAt: now });
      return { error: `Could not send: ${r.error ?? "unknown error"}. Do it yourself or tell the user.` };
    }
    this.db.update(id, { taskId: r.task.id });
    // 为什么先排着：B 手上已有 3 件、后台名额满了、暂停了后台工作、预算不够
    const busy = this.db.list({ toBot: to.id, states: BUSY }).length;
    const paused = !!this.store.getBot(to.id)?.settings.paused;
    const low = !!this.o.tasks.reserve(to.id);
    const running = this.store.listRuns({ botId: to.id, states: ["running", "settling"] }).length;
    let queued = "";
    if (busy >= PER_BOT) {
      this.note(h, "queued", { count: PER_BOT });
      queued = ` It is queued: ${to.name} already has ${PER_BOT} requests in progress. Mention it.`;
    } else if (paused) {
      this.note(h, "queuedPaused", {});
      queued = ` It is queued: ${to.name} has paused background work, so it starts once resumed. Say so (e.g. "${to.name}暂停了后台工作，恢复后才会开始。").`;
    } else if (low) {
      this.note(h, "queuedBudget", {});
      queued = ` It is queued: ${to.name}'s budget is almost used up, so it starts once there is budget again. Say so.`;
    } else if (running >= this.o.slots(to.id)) {
      this.note(h, "queuedSlots", {});
      queued = ` It is queued until one of ${to.name}'s background slots frees up.`;
    }
    log.info("message sent to another bot", { from: fromBot, to: to.id, handoff: id, ask });
    this.changed();
    return {
      text: ask
        ? `Asked ${to.name} (${id}); it answers from what it knows without doing anything. In your reply, say in one natural sentence that you asked ${to.name} and will pass on its answer (e.g. "好，我问一下${to.name}。"). The app shows a gray "Messaged ${to.name}" line under your reply. Do not answer it yourself.${queued}`
        : `Sent to ${to.name} (${id}). In your reply, say in one natural sentence that you handed it to ${to.name} and will check its work and tell the user (e.g. "好，这件事我交给${to.name}了，它做完我核对一遍再告诉你。"). The app shows a gray "Messaged ${to.name}" line under your reply. Do not do the work yourself.${queued}`,
    };
  }

  /** 把文件从一个机器人的工作区复制到另一个的（相对路径，返回在目标工作区里的路径） */
  private copyFiles(from: string, to: string, list: string[], dir: string): string[] {
    const src = this.o.workspace(from);
    const dst = this.o.workspace(to);
    const out: string[] = [];
    let root: string;
    try {
      root = fs.realpathSync(src);
    } catch {
      return [];
    }
    for (const p of list.slice(0, MAX_FILES)) {
      try {
        const real = fs.realpathSync(path.resolve(src, p));
        if (real !== root && !real.startsWith(root + path.sep)) continue;
        const st = fs.statSync(real);
        if (!st.isFile() || st.size > MAX_FILE_BYTES) continue;
        const rel = path.posix.join(dir, path.basename(real));
        fs.mkdirSync(path.join(dst, dir), { recursive: true });
        fs.copyFileSync(real, path.join(dst, rel));
        if (!out.includes(rel)) out.push(rel);
      } catch {
        /* 不存在、不在工作区里：跳过 */
      }
    }
    return out;
  }

  // ---------- 管理一件事（bot_request） ----------

  /**
   * bot_request：A 的对话里（或 A 核对那一轮）redo / add / stop / continue；B 的主对话里 add / stop。
   * id 不给或对不上时，只有一件进行中的就是它。
   */
  async request(botId: string, conversationId: string, a: Record<string, unknown>): Promise<{ text?: string; error?: string }> {
    const action = String(a.action ?? "");
    const text = clip(String(a.text ?? "").trim(), 2000);
    const ref = String(a.id ?? "").trim();
    const mine = (h: HandoffRow) => (h.fromBot === botId && h.conversationId === conversationId) || (h.toBot === botId && conversationId === `${botId}:web:console`);
    let h = ref ? this.db.get(ref) : undefined;
    if (h && !mine(h)) h = undefined;
    if (!h) {
      const open = [...this.db.list({ conversationId, states: OPEN }), ...this.db.list({ toBot: botId, states: OPEN })].filter(mine);
      if (open.length === 1) h = open[0];
      else if (action === "continue") h = this.db.list({ conversationId, states: ["stopped"], limit: 5 }).find((x) => x.stopReason === "timeout" || x.stopReason === "budget");
    }
    if (!h) return { error: ref ? `No request ${ref} in this chat.` : "Several requests are in progress; pass the id." };
    const asA = h.fromBot === botId;
    const B = this.botName(h.toBot);
    const A = this.botName(h.fromBot);
    switch (action) {
      case "redo": {
        if (!asA) return { error: "Only the bot that sent the request can ask for a redo." };
        if (h.state !== "replied") return { error: `Redo only after ${B} replies; it is ${h.state} now.` };
        if (h.redos >= h.redoLimit) return { error: `No redos left (${h.redoLimit}). Tell the user honestly what is still missing.` };
        if (!text) return { error: "text is required: what is wrong and what to fix." };
        const n = h.redos + 1;
        const line = t("collab.msgRedo", { issue: text, n, limit: h.redoLimit });
        this.db.update(h.id, { redos: n, state: "working", updatedAt: this.now() });
        this.db.addMessage({ pairKey: h.pairKey, handoffId: h.id, from: h.fromBot, kind: "message", text: line, at: this.now() });
        const r = await this.o.tasks.handoffInput(h.taskId, `[${A}让你重做（${n}/${h.redoLimit}）]\n${text}\n改好后同样用 task_report 回消息。`);
        if (r.error) return { error: r.error };
        this.changed();
        return { text: `Sent back to ${B} to fix (redo ${n}/${h.redoLimit}). End this turn now without replying to the user; you will get its new reply.` };
      }
      case "add": {
        if (!text) return { error: "text is required: the user's addition." };
        if (h.state === "stopped" || h.state === "dropped") return { error: `That request has ${h.state === "stopped" ? "stopped" : "been dropped"}; send a new one if the user wants.` };
        // 补充不算新的一件：做完了的接着做（先改状态：交给任务时可能马上就开始了）
        if (h.state === "done") this.db.update(h.id, { state: "working", endedAt: 0, updatedAt: this.now() });
        if (asA) {
          this.db.addMessage({ pairKey: h.pairKey, handoffId: h.id, from: h.fromBot, kind: "message", text: t("collab.msgAdds", { text }), at: this.now() });
          this.addition(h.id, text);
          const r = await this.o.tasks.handoffInput(h.taskId, `[${A}转来用户的补充]\n${text}`);
          if (r.error) return { error: r.error };
          this.changed();
          return { text: `Passed the addition to ${B}. Tell the user in one short sentence; you will check the result against it.` };
        }
        this.addition(h.id, text);
        const r = await this.o.tasks.handoffInput(h.taskId, `[用户在你的主对话里补充]\n${text}\n回消息给${A}时说明按补充改了什么。`);
        if (r.error) return { error: r.error };
        this.changed();
        return { text: `Added it to the request from ${A}. Tell the user in one short sentence; you will mention it when you reply to ${A}.` };
      }
      case "stop": {
        if (!OPEN.includes(h.state)) return { text: `That request already ${h.state === "done" ? "finished" : "stopped"}.` };
        const done = this.stopNow(h, "user");
        if (asA) return { text: `${B} has stopped. Tell the user in one or two sentences what is done and what isn't, and that finished steps stay done (e.g. "好，已经让${B}停下了。…，…还没做。做过的不会撤回。"). What it reported so far: ${done || "nothing yet"}.` };
        // 在 B 的主对话里叫停：A 要告诉用户做到哪
        void this.afterStop(h.id, t("collab.whyUser"));
        return { text: `Stopped the request from ${A}. Tell the user in one short sentence; ${A} will tell them where it got to.` };
      }
      case "continue": {
        if (!asA) return { error: "Only the bot that sent the request can let it continue." };
        if (!(h.state === "stopped" && (h.stopReason === "timeout" || h.stopReason === "budget"))) return { error: "Continue only after it stopped at its time or spending limit." };
        if (!this.o.signedIn() || !this.modelOk(h.fromBot, h.conversationId) || !this.modelOk(h.toBot)) return { error: "It cannot continue now: sign-in or models no longer allow bots to message each other." };
        this.o.tasks.extendHandoff(h.taskId, h.budgetUsd);
        this.db.update(h.id, { state: "working", stopReason: "", endedAt: 0, updatedAt: this.now() });
        const r = await this.o.tasks.handoffInput(h.taskId, `[用户让你继续]\n从停下的地方接着做，做完同样用 task_report 回消息。`);
        if (r.error) return { error: r.error };
        this.changed();
        return { text: `${B} continues with another ${h.budgetUsd} USD and the same time limit. Tell the user in one short sentence.` };
      }
      default:
        return { error: "action must be redo, add, stop or continue" };
    }
  }

  /** 用户补充过的要求（A 核对时按补充后的要求） */
  private addition(id: string, text: string): void {
    const key = `collab.adds:${id}`;
    let list: string[] = [];
    try {
      list = JSON.parse(this.store.getKV(key) || "[]");
    } catch {
      list = [];
    }
    list.push(clip(oneLine(text), 300));
    this.store.setKV(key, JSON.stringify(list.slice(-10)));
  }
  private additions(id: string): string[] {
    try {
      const v = JSON.parse(this.store.getKV(`collab.adds:${id}`) || "[]");
      return Array.isArray(v) ? v.map(String) : [];
    } catch {
      return [];
    }
  }

  /** 立即停下 B（做过的不撤回）：返回它已经报告的那部分 */
  private stopNow(h: HandoffRow, reason: HandoffStop): string {
    const now = this.now();
    this.db.update(h.id, { state: "stopped", stopReason: reason, endedAt: now, updatedAt: now });
    if (h.taskId) void this.o.tasks.stopTask(h.taskId, `collab:${reason}`);
    if (reason === "user") this.note(h, "stopped", {});
    const task = h.taskId ? this.store.getTask(h.taskId) : undefined;
    this.syncSpent(h.id);
    this.changed();
    return task?.report ? oneLine(task.report.summary || task.report.message || "") : "";
  }

  /** 在「需要你」里停（B 的审批那一行的「停止」） */
  stopFromAttention(taskId: string): boolean {
    const h = this.db.byTask(taskId);
    if (!h || !OPEN.includes(h.state)) return false;
    this.stopNow(h, "user");
    void this.afterStop(h.id, t("collab.whyUser"));
    return true;
  }

  // ---------- 任务服务的钩子 ----------

  readonly hooks: HandoffHooks = {
    canStart: (task) => {
      const h = this.handoffOf(task);
      if (!h || !OPEN.includes(h.state)) return true;
      // 排着、还没开始的：开始前再查一次登录和两边的模型；不满足就作废
      if (!h.startedAt) {
        if (!this.o.signedIn()) {
          setImmediate(() => this.drop(h.id, "signout"));
          return false;
        }
        if (!this.modelOk(h.fromBot, h.conversationId) || !this.modelOk(h.toBot)) {
          setImmediate(() => this.drop(h.id, "model"));
          return false;
        }
      }
      // B 同时最多接 3 件（已经接下的这件的后续 run 不受限）
      if (h.state === "queued") {
        const busy = this.db.list({ toBot: h.toBot, states: BUSY }).filter((x) => x.id !== h.id).length;
        if (busy >= PER_BOT) return false;
      }
      return true;
    },
    started: (task) => {
      const h = this.handoffOf(task);
      if (!h || !OPEN.includes(h.state)) return;
      const now = this.now();
      if (!h.startedAt) this.note(h, "started", {});
      this.db.update(h.id, { state: "working", ...(h.startedAt ? {} : { startedAt: now }), updatedAt: now });
      this.changed();
    },
    ended: (task, runId, outcome, report, error, halt) => {
      const h = this.handoffOf(task);
      if (!h) return;
      this.syncSpent(h.id);
      if (!OPEN.includes(h.state)) return void this.changed();
      if (outcome === "needs_you") {
        this.db.update(h.id, { state: "waiting", updatedAt: this.now() });
        return void this.changed();
      }
      if (outcome === "done") return this.replied(h.id, runId, report?.summary || report?.message || "", report?.files ?? []);
      if (outcome === "budget" || halt === "budget") {
        this.note(h, "budget", { budget: h.budgetUsd });
        return this.halted(h.id, runId, "budget");
      }
      if (halt === "cap") {
        this.note(h, "timeout", { ms: h.capMs });
        return this.halted(h.id, runId, "timeout");
      }
      if (outcome === "failed") {
        this.note(h, "error", { reason: clip(oneLine(error || report?.message || report?.summary || ""), 200) });
        return this.halted(h.id, runId, "error", error || report?.message || "");
      }
      this.changed();
    },
    approval: (task, e) => this.onApproval(task.id, e),
  };

  /** 任务属于哪件事（建任务时就写好了 handoff_id；件上的 task_id 稍后才填） */
  private handoffOf(task: { id: string; handoffId: string }): HandoffRow | undefined {
    return (task.handoffId ? this.db.get(task.handoffId) : undefined) ?? this.db.byTask(task.id);
  }

  private onApproval(taskId: string, e: ApprovalEvent): void {
    const task = this.store.getTask(taskId);
    const h = task ? this.handoffOf(task) : undefined;
    if (!h || !OPEN.includes(h.state)) return;
    const row = e.row;
    if (e.type === "created") {
      if (row.kind === "approval") this.note(h, "waitApprove", { action: clip(oneLine(row.detail || row.tool || ""), 120) });
      else this.note(h, "waitAnswer", { question: clip(oneLine(questionsOf(row)[0]?.question ?? row.detail), 160) });
      this.db.update(h.id, { state: "waiting", updatedAt: this.now() });
    } else {
      if (row.status === "allowed") this.note(h, "allowed", {});
      else if (row.status === "rejected") this.note(h, "denied", {});
      else if (row.status === "expired") this.note(h, "approvalTimeout", {});
      else if (row.status === "answered") this.note(h, "answered", {});
      const cur = this.db.get(h.id);
      if (cur?.state === "waiting") this.db.update(h.id, { state: "working", updatedAt: this.now() });
    }
    this.changed();
  }

  private syncSpent(id: string): void {
    const h = this.db.get(id);
    const task = h?.taskId ? this.store.getTask(h.taskId) : undefined;
    if (h && task) this.db.update(h.id, { spentUsd: task.spentUsd });
  }

  /** B 回消息给 A：结果说明 + 文件（复制进 A 的工作区）；接着 A 核对 */
  private replied(id: string, runId: string, text: string, files: string[]): void {
    const h = this.db.get(id);
    if (!h) return;
    const now = this.now();
    const task = this.store.getTask(h.taskId);
    const steps = this.o.tasks.activity(runId);
    if (steps.length) this.db.addMessage({ pairKey: h.pairKey, handoffId: h.id, from: h.toBot, kind: "steps", text: JSON.stringify(stepsSummary(steps)), runId, at: now });
    const copied = task ? this.copyFiles(h.toBot, h.fromBot, files.map((f) => (fs.existsSync(path.join(this.o.workspace(h.toBot), task.folder, f)) ? path.posix.join(task.folder, f) : f)), `inbox/from-${h.toBot}/${h.id}`) : [];
    const reply = text.trim() || t("collab.noText");
    this.db.addMessage({ pairKey: h.pairKey, handoffId: h.id, from: h.toBot, kind: "message", text: reply, files: copied, at: now });
    this.db.update(h.id, { state: "replied", replyText: reply, replyFiles: copied, repliedAt: now, updatedAt: now });
    log.info("bot replied to the bot that asked", { handoff: h.id, from: h.toBot, to: h.fromBot });
    this.changed();
    void this.check(h.id);
  }

  /** B 先停下了（超时、花满、出错）：已做的部分发回，A 告诉用户做到哪 */
  private halted(id: string, runId: string, reason: HandoffStop, error = ""): void {
    const h = this.db.get(id);
    if (!h) return;
    const now = this.now();
    const task = this.store.getTask(h.taskId);
    const steps = this.o.tasks.activity(runId);
    if (steps.length) this.db.addMessage({ pairKey: h.pairKey, handoffId: h.id, from: h.toBot, kind: "steps", text: JSON.stringify(stepsSummary(steps)), runId, at: now });
    const done = task?.report ? (task.report.summary || task.report.message || "").trim() : "";
    const files = task?.report?.files?.length ? this.copyFiles(h.toBot, h.fromBot, task.report.files.map((f) => path.posix.join(task.folder, f)), `inbox/from-${h.toBot}/${h.id}`) : [];
    if (done) this.db.addMessage({ pairKey: h.pairKey, handoffId: h.id, from: h.toBot, kind: "message", text: done, files, at: now });
    this.db.update(h.id, { state: "stopped", stopReason: reason, error: clip(oneLine(error), 300), replyText: done, replyFiles: files, repliedAt: now, endedAt: now, updatedAt: now });
    this.changed();
    const why = reason === "timeout" ? t("collab.whyTimeout", { limit: this.capText(h.capMs) }) : reason === "budget" ? t("collab.whyBudget", { budget: `$${h.budgetUsd}` }) : t("collab.whyError", { reason: clip(oneLine(error), 200) || "?" });
    void this.afterStop(h.id, why);
  }

  private capText(ms: number): string {
    return ms >= 3600_000 ? t("collab.hours", { count: Math.round(ms / 3600_000) }) : t("collab.minutes", { count: Math.round(ms / 60_000) });
  }

  /** B 回消息后 A 这一轮：核对、汇总（没达标让 B 重做，这一轮不回复用户） */
  private async check(id: string): Promise<void> {
    if (this.checking.has(id)) return;
    const h = this.db.get(id);
    if (!h || h.state !== "replied") return;
    this.checking.add(id);
    try {
      const input = checkInput({ id: h.id, bot: this.botName(h.toBot), ask: h.kind === "ask", title: h.title, criteria: h.criteria, reply: h.replyText, files: h.replyFiles, redos: h.redos, redoLimit: h.redoLimit, additions: this.additions(h.id) });
      const redos = h.redos;
      const keep = () => {
        const cur = this.db.get(id);
        return !!cur && cur.redos === redos && cur.state === "replied";
      };
      const r = this.o.turn ? await this.o.turn(h.fromBot, h.conversationId, input, keep) : { error: "unavailable" };
      const cur = this.db.get(id);
      if (!cur || cur.state !== "replied") return; // 让 B 重做了，或在这期间停了
      let messageId = r.messageId;
      if (!messageId) {
        // A 没法开这一轮（代理不可用、出错）：直接把 B 的消息转给你
        messageId = this.store.addMessage(h.conversationId, "assistant", t("collab.fallbackReply", { bot: this.botName(h.toBot), text: clip(cur.replyText, 3000) }), undefined, { files: cur.replyFiles.map((f) => path.join(this.o.workspace(h.fromBot), f)) });
      }
      const now = this.now();
      this.db.update(id, { state: "done", doneMessageId: messageId, endedAt: now, updatedAt: now });
      this.syncSpent(id);
      this.changed();
    } finally {
      this.checking.delete(id);
    }
  }

  /** 停下之后 A 告诉你做到哪（超时、花满、出错、在 B 的对话或「需要你」里叫停） */
  private async afterStop(id: string, why: string): Promise<void> {
    const h = this.db.get(id);
    if (!h) return;
    const canContinue = h.stopReason === "timeout" || h.stopReason === "budget";
    const task = h.taskId ? this.store.getTask(h.taskId) : undefined;
    const done = h.replyText || (task?.report ? (task.report.summary || task.report.message || "").trim() : "");
    const input = stopInput({ id: h.id, bot: this.botName(h.toBot), title: h.title, why, done, files: h.replyFiles, canContinue });
    const r = this.o.turn ? await this.o.turn(h.fromBot, h.conversationId, input, () => true) : { error: "unavailable" };
    const messageId = r.messageId ?? this.store.addMessage(h.conversationId, "assistant", t("collab.fallbackStopped", { bot: this.botName(h.toBot), why, text: clip(done, 2000) || t("collab.noText") }));
    this.db.update(id, { doneMessageId: messageId, updatedAt: this.now() });
    this.changed();
  }

  /** 作废（排队超过 24 小时、开始前模型不符、退出登录）：A 告诉你原因 */
  private drop(id: string, reason: HandoffStop): void {
    const h = this.db.get(id);
    if (!h || h.state !== "queued") return;
    const now = this.now();
    this.db.update(id, { state: reason === "signout" ? "stopped" : "dropped", stopReason: reason, endedAt: now, updatedAt: now });
    if (h.taskId) void this.o.tasks.stopTask(h.taskId, `collab:${reason}`);
    const B = this.botName(h.toBot);
    if (reason === "expired") {
      this.note(h, "dropped", {});
      this.store.addMessage(h.conversationId, "assistant", t("collab.droppedExpired", { bot: B }));
    } else if (reason === "model") {
      this.note(h, "droppedModel", {});
      this.store.addMessage(h.conversationId, "assistant", t("collab.droppedModel", { bot: B }));
    } else if (reason === "signout") this.note(h, "signout", {});
    log.info("queued request dropped", { handoff: id, reason });
    this.changed();
  }

  /** 每分钟：排队超过 24 小时没开始的作废 */
  sweep(now = this.now()): void {
    for (const h of this.db.list({ states: ["queued"], limit: 500 })) if (!h.startedAt && now - h.createdAt >= QUEUE_MS) this.drop(h.id, "expired");
  }

  /** 退出 Modelflare 账户：进行中的停下，两人对话里记一行；重新登录后不自动继续 */
  signedOut(): void {
    for (const h of this.db.list({ states: OPEN, limit: 500 })) {
      const now = this.now();
      this.db.update(h.id, { state: "stopped", stopReason: "signout", endedAt: now, updatedAt: now });
      if (h.taskId) void this.o.tasks.stopTask(h.taskId, "collab:signout");
      this.note(h, "signout", {});
    }
    this.changed();
  }

  /** 删除机器人：和它有关的进行中的事停下（B 被删时 A 告诉你），两人对话一起删除 */
  botDeleted(botId: string): void {
    for (const h of this.db.list({ states: OPEN, limit: 500 })) {
      if (h.toBot !== botId && h.fromBot !== botId) continue;
      if (h.taskId) void this.o.tasks.stopTask(h.taskId, "collab:deleted");
      if (h.toBot === botId && this.store.getBot(h.fromBot)) this.store.addMessage(h.conversationId, "assistant", t("collab.deleted", { bot: this.botName(botId) }));
    }
    this.db.dropBot(botId);
    this.changed();
  }

  // ---------- 两人对话的灰字 ----------

  private note(h: HandoffRow, code: string, params: Record<string, string | number>): void {
    this.db.addMessage({ pairKey: h.pairKey, handoffId: h.id, from: "", kind: "note", text: JSON.stringify({ code, params, bot: h.toBot }), at: this.now() });
  }

  // ---------- 聊天里看得到的 ----------

  /** 聊天输入前面的便条：A 这边还没完成的、B 这边正在做的（没有就是空串） */
  chatNote(botId: string, conversationId: string): string {
    const conv = this.store.getConversation(conversationId);
    if (!conv || conv.channel !== "web" || conv.kind === "group") return "";
    const sent = this.db.list({ conversationId, states: OPEN, limit: 10 }).filter((h) => h.fromBot === botId).map((h) => ({ id: h.id, bot: this.botName(h.toBot), title: h.title, state: h.state }));
    const inbox = conv.peerId === "console" ? this.db.list({ toBot: botId, states: OPEN, limit: 10 }).map((h) => ({ id: h.id, bot: this.botName(h.fromBot), title: h.title })) : [];
    return collabNote({ sent, inbox });
  }

  /** 一件事给界面看的样子 */
  view(h: HandoffRow) {
    const task = h.taskId ? this.store.getTask(h.taskId) : undefined;
    return {
      id: h.id,
      from: h.fromBot,
      fromName: this.botName(h.fromBot),
      to: h.toBot,
      toName: this.botName(h.toBot),
      pairKey: h.pairKey,
      kind: h.kind,
      title: h.title,
      state: h.state,
      stopReason: h.stopReason,
      redos: h.redos,
      redoLimit: h.redoLimit,
      spentUsd: task?.spentUsd ?? h.spentUsd,
      budgetUsd: task?.budgetUsd ?? h.budgetUsd,
      doneMessageId: h.doneMessageId,
      createdAt: h.createdAt,
      startedAt: h.startedAt,
      repliedAt: h.repliedAt,
      endedAt: h.endedAt,
    };
  }

  /** 一个对话里的灰色小字：A 这边发出的（挂在那一轮的回复下面）、B 主对话里的两行（收到 / 已回消息）、按钮 */
  chatView(conversationId: string) {
    const conv = this.store.getConversation(conversationId);
    const sent = this.db.list({ conversationId, limit: 200 }).map((h) => this.view(h));
    const inbox = conv && conv.channel === "web" && conv.peerId === "console" ? this.db.list({ toBot: conv.botId, limit: 200 }).filter((h) => h.startedAt).map((h) => this.view(h)) : [];
    return { sent, inbox, notices: this.notices(conversationId) };
  }

  /** 设置 › 机器人协作的对话列表：每对机器人一行 */
  pairs() {
    return this.db.pairs().map((p) => {
      const [a, b] = p.pairKey.split("|");
      const last = this.db.lastMessage(p.pairKey);
      const spent = this.db.list({ pairKey: p.pairKey, limit: 1000 }).reduce((n, h) => n + (h.taskId ? (this.store.getTask(h.taskId)?.spentUsd ?? h.spentUsd) : h.spentUsd), 0);
      // 先列最近发起的那一方（A），和对话标题「A ⇄ B」一致
      const first = this.db.list({ pairKey: p.pairKey, limit: 1 })[0];
      const [x, y] = first && first.fromBot === b ? [b, a] : [a, b];
      return { pairKey: p.pairKey, a: x, aName: this.botName(x), b: y, bName: this.botName(y), lastAt: p.lastAt, last: last ? this.messageView(last) : undefined, spentUsd: spent, open: p.open };
    });
  }

  private messageView(m: PairMessage) {
    let note: { code: string; params: Record<string, unknown>; bot?: string } | undefined;
    if (m.kind === "note" || m.kind === "steps") {
      try {
        note = JSON.parse(m.text);
      } catch {
        note = undefined;
      }
    }
    return {
      id: m.id,
      handoffId: m.handoffId,
      from: m.from,
      fromName: m.from ? this.botName(m.from) : "",
      kind: m.kind,
      text: m.kind === "message" ? m.text : "",
      ...(m.kind === "note" && note ? { note: { code: note.code, params: note.params, bot: note.bot ? this.botName(note.bot) : "" } } : {}),
      // 处理过程：摘要一直在；展开的细节保存 30 天（运行记录清掉之后只剩摘要）
      ...(m.kind === "steps" && note ? { steps: note, runId: m.runId, detail: !!(m.runId && this.store.getRun(m.runId)) } : {}),
      files: m.files,
      at: m.at,
    };
  }

  /** 两人对话：这两个机器人之间所有的往来 */
  pair(pairKey: string) {
    const [a, b] = pairKey.split("|");
    if (!a || !b) return undefined;
    const first = this.db.list({ pairKey, limit: 1 })[0];
    const [x, y] = first && first.fromBot === b ? [b, a] : [a, b];
    return { pairKey, a: x, aName: this.botName(x), b: y, bName: this.botName(y), messages: this.db.messages(pairKey).map((m) => this.messageView(m)), handoffs: this.db.list({ pairKey, limit: 200 }).map((h) => this.view(h)) };
  }

  /** 处理过程展开的细节（运行记录还在时） */
  steps(runId: string): ActivityStep[] {
    return this.o.tasks.activity(runId);
  }

  /** 设置页：总开关关掉时还在做的（谁、几件） */
  openCount(): Array<{ bot: string; name: string; count: number }> {
    const by = new Map<string, number>();
    for (const h of this.db.list({ states: OPEN, limit: 500 })) by.set(h.toBot, (by.get(h.toBot) ?? 0) + 1);
    return [...by].map(([bot, count]) => ({ bot, name: this.botName(bot), count }));
  }
}
