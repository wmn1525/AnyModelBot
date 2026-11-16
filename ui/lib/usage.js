// 装好的技能、连上的应用在对话里怎么用：加号菜单「技能与应用」、过程区「正在使用 / 已使用」、设置列表和成功提示里的「试试这样说」共用这一套——
// 机器人的技能清单（显示名、简介、示例和生效状态由服务端算好，src/skills/display.ts）、应用的名字和示例、往输入框里填一句话。
import { useEffect } from "preact/hooks";
import { createStore, failed, successToast, toast, useStore } from "./store.js";
import { api } from "./api.js";
import { fill } from "./guide.js";
import { appDisplayName, appsStore, loadApps } from "./apps.js";
import { has, t } from "./i18n.js";
import { copyText } from "./skill-library.js";

// —— 机器人的技能清单（按机器人缓存；有还没生效的就勤着刷新，状态变了界面跟着变）——
const skillsByBot = createStore({}); // botId → { skills, at }
const loading = new Map();

export function setBotSkills(botId, skills) {
  if (botId && Array.isArray(skills)) skillsByBot.set((m) => ({ ...m, [botId]: { skills, at: Date.now() } }));
}

export function loadBotSkills(botId) {
  if (!botId) return Promise.resolve([]);
  if (!loading.has(botId)) {
    loading.set(
      botId,
      api(`/bots/${encodeURIComponent(botId)}/skills`)
        .then((d) => (setBotSkills(botId, d.skills), d.skills))
        .finally(() => loading.delete(botId)),
    );
  }
  return loading.get(botId);
}

export const pendingSkill = (s) => s.enabled && (s.state === "waiting" || s.state === "loading");

/** 订阅一个机器人的技能清单：第一次用、或放了半分钟以上时重新取；有还没生效的每 2 秒刷新一次 */
export function useBotSkills(botId) {
  const all = useStore(skillsByBot);
  const entry = botId ? all[botId] : undefined;
  useEffect(() => {
    if (botId && (!entry || Date.now() - entry.at > 30_000)) loadBotSkills(botId).catch(() => {});
  }, [botId]);
  const waiting = !!entry?.skills?.some(pendingSkill);
  useEffect(() => {
    if (!botId || !waiting) return;
    const timer = setInterval(() => loadBotSkills(botId).catch(() => {}), 2000);
    return () => clearInterval(timer);
  }, [botId, waiting]);
  return entry ? entry.skills : null;
}

// —— 名字 ——
/** 宿主自带的技能（生图、电脑操作）用功能的名字；目录 Bot 界面的说明（amb-app）不算用户的技能，不显示 */
const BUILTIN_SKILLS = { media: "botSettings.media.head", "computer-use": "botSettings.computer.head" };
const HIDDEN_SKILLS = new Set(["amb-app"]);

/** 过程区里技能的名字：和加号菜单、设置列表里显示的一样；返回空串表示不显示 */
export function skillLabel(name, skills) {
  if (HIDDEN_SKILLS.has(name)) return "";
  if (BUILTIN_SKILLS[name]) return t(BUILTIN_SKILLS[name]);
  return skills?.find((s) => s.name === name)?.title || name;
}

/** 应用的 key（内置应用的 id、custom:<连接 id>，认不出时是模型写的原文）→ 界面上的名字 */
export function appLabelOf(key) {
  const s = appsStore.get();
  if (!s.loaded) loadApps();
  const view = s.apps.find((v) => v.key === key);
  if (view?.custom) return view.name || key;
  return appDisplayName(key, key);
}

/** 内置应用的一句示例（应用页、连接成功时用的同一句）；自定义连接器和只读机器人用「用{应用}帮我……」 */
export function appExample(view, name, readonly = false) {
  if (!readonly && view && !view.custom && has(`apps.catalog.${view.app}.example`)) return t(`apps.catalog.${view.app}.example`);
  return t("chat.use.appExample", { app: name });
}

// —— 过程区 ——
/**
 * 进行中这一轮用到的技能和应用（步骤上有服务端标好的 use），和服务端 usedSummary 一致：技能同一项只算一次；
 * 应用按「应用 + 工具」算（同一应用的不同工具各一行，同一工具多次调用只算一行）；用成过一次就算用上了
 */
export function usedFromSteps(steps) {
  const out = [];
  for (const s of steps || []) {
    const use = s.kind === "tool" && s.use;
    if (!use) continue;
    const name = use.kind === "skill" ? use.name : use.app;
    const tool = use.kind === "app" ? use.tool || undefined : undefined;
    const reason = s.status === "error" ? use.reason || "failed" : undefined;
    const prev = out.find((x) => x.kind === use.kind && x.name === name && x.tool === tool);
    if (!prev) {
      const toolTitle = use.kind === "app" ? use.toolTitle : undefined;
      out.push({ kind: use.kind, name, ...(tool ? { tool } : {}), ...(toolTitle ? { toolTitle } : {}), status: s.status, ...(reason ? { reason } : {}) });
      continue;
    }
    if (prev.status === "ok") continue;
    if (s.status === "ok" || s.status === "running") {
      prev.status = s.status;
      delete prev.reason;
    } else if (prev.status === "error") prev.reason = reason;
  }
  return out;
}

/**
 * 一项的名字：技能按显示名；应用写成「{应用} · {工具}」，工具优先用应用给的显示名称，没有时用工具名原文
 * （没有工具名的旧记录只写应用名）。不显示的技能返回空串
 */
export function usedName(u, skills) {
  if (u.kind === "skill") return skillLabel(u.name, skills);
  const app = appLabelOf(u.name);
  const tool = u.toolTitle || u.tool;
  return tool ? t("chat.use.appTool", { app, tool }) : app;
}

/** 没用成的原因（一句话，不露出内部报错）。name：应用名（不带工具名，「请检查「Notion」的连接」） */
export function usedReason(u, name) {
  if (u.reason === "loading") return t("chat.use.reason.loading");
  if (u.reason === "connection") return t("chat.use.reason.connection", { app: u.kind === "app" && u.name ? appLabelOf(u.name) : name });
  if (u.reason === "denied") return t("chat.use.reason.denied");
  if (u.reason === "readonly") return t("chat.use.reason.readonly");
  return t("chat.use.reason.failed");
}

/** 进行中的一行：「正在使用技能 · 名字」「正在使用 {应用} · {工具}」；没用成的「没能使用…。原因」（name 是 usedName 给的名字） */
export function usedLine(u, name) {
  if (u.status === "error") return t(u.kind === "skill" ? "chat.use.failedSkill" : "chat.use.failedApp", { name, app: name, reason: usedReason(u, name) });
  return t(u.kind === "skill" ? "chat.use.usingSkill" : "chat.use.usingApp", { name, app: name });
}

/** 结束后折叠的那一行：「已使用：A、B」；全部没用成时「没能使用：C」；都有时两段都写 */
export function usedSummaryText(items) {
  const ok = items.filter((x) => x.status !== "error").map((x) => x.label);
  const bad = items.filter((x) => x.status === "error").map((x) => x.label);
  const sep = t("chat.use.sep");
  return [ok.length && t("chat.use.used", { list: ok.join(sep) }), bad.length && t("chat.use.notUsed", { list: bad.join(sep) })].filter(Boolean).join(" · ");
}

// —— 往输入框里填 ——
/**
 * 加号菜单点一项时填的「用{名称}帮我……」：返回文字和要选中的范围（「帮我」后面的省略号，接着打字就替换掉它）。
 * 文案里用 {cursor} 标光标的位置。
 */
export function prefillOf(name, key = "chat.use.prefill") {
  const mark = "\u0001";
  const raw = t(key, { name, app: name, cursor: mark });
  const i = raw.indexOf(mark);
  const text = raw.replace(mark, "");
  return { text, start: i < 0 ? text.length : i, end: text.length };
}

/**
 * 把一句话放进输入框，不丢草稿：输入框是空的就整句填进去；有草稿时插在光标处（前面不是空白就隔一个空格）。
 * select：要选中的范围（相对这句话），不给就把光标放在句末。返回 { text, start, end }（整段的新文字和选区）。
 */
export function insertPhrase(current, el, phrase, select) {
  const draft = current || "";
  const sel = select || { start: phrase.length, end: phrase.length };
  if (!draft.trim()) return { text: phrase, start: sel.start, end: sel.end };
  const from = Math.min(el?.selectionStart ?? draft.length, draft.length);
  const to = Math.min(Math.max(el?.selectionEnd ?? from, from), draft.length);
  const pad = from > 0 && !/\s/.test(draft[from - 1]) ? " " : "";
  const text = draft.slice(0, from) + pad + phrase + draft.slice(to);
  const at = from + pad.length;
  return { text, start: at + sel.start, end: at + sel.end };
}

/** 选中输入框里的一段并聚焦（等文字更新到界面上之后） */
export function focusRange(el, start, end) {
  requestAnimationFrame(() => {
    if (!el) return;
    el.focus();
    try {
      el.setSelectionRange(start, end);
    } catch {
      /* 不是文本框 */
    }
  });
}

/**
 * 在设置页、卡片上点「填入输入框」：打开这个机器人的对话，把这句话放进它的输入框（不发送，不丢草稿）。
 * 已经在它的对话里时就地填进去（对话页收到 fill 后处理，见 screens/chat.js）。
 */
export function fillChat(botId, text, select) {
  if (!botId || !text) return;
  const id = encodeURIComponent(botId);
  // 目录 Bot 的对话在 #/app/<实例>（#/chat/ 会被转过去）
  const here = [`#/chat/${id}`, `#/app/${id}`].some((r) => location.hash === r || location.hash.startsWith(`${r}/`));
  if (!here) location.hash = `#/chat/${id}`;
  fill.set({ text, target: botId, at: Date.now(), insert: true, select });
}

/** 一段描述的第一句（到第一个句号、问号、感叹号为止），最长 120 字 */
function firstSentence(text) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  const m = /^.+?(?:[。！？!?]|\.(?=\s|$))/u.exec(s); // i18n-ignore: sentence-ending punctuation in any language
  return (m ? m[0] : s).slice(0, 120).trim();
}

/** 装好技能后成功提示里的示例：技能库里有触发方式的用那一句；库外或 ZIP 导入的技能用描述第一句，没有则「用{名称}帮我……」 */
export function installedExample(skill, name) {
  if (skill?.library && skill.example) return skill.example;
  return firstSentence(skill?.description) || t("chat.use.appExample", { app: name });
}

/** 现在是不是在应用内的群聊里（群聊没有单个机器人的输入框：成功提示只给「复制」） */
export const inGroupChat = () => location.hash.startsWith("#/group/");

/**
 * 装好技能、分配好应用后的成功提示：结果句 + 生效说法（text），下一行「试试这样说：{示例}」，
 * 按钮「填入输入框」（写进这个机器人的输入框并聚焦；群聊里不给）和「复制」
 */
export function readyToast(text, botId, example) {
  successToast({ text, example, onFill: inGroupChat() ? undefined : () => fillChat(botId, example), onCopy: () => copyExample(example) });
}

/** 复制一句示例：成功、失败都给一句短提示 */
export async function copyExample(text) {
  try {
    await copyText(text);
    toast(t("common.copied"));
  } catch {
    failed(t("chat.use.copyFailed"));
  }
}
