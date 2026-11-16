// 任务库（PRD 2026-11-15）：GET /routines 拿当前语言的任务（文案、默认时间、每月次数、依赖、参数、搜索用的字）和「已在用」。
// 全局一份：「定时」页的推荐卡和「试试任务库」、任务库页、详情、「用起来」弹窗、命令面板都读它。
// 详情和弹窗由 RoutineHost（main.js 里挂一个）打开：openRoutine(id) 打开详情，startRoutine(id) 直接打开「用起来」弹窗。
// 本机记住的：底部「试试任务库」收起了没有、每条任务第一次看到的时间（「新」标 7 天）。存在 localStorage。
import { createStore } from "./store.js";
import { api } from "./api.js";
import { appsStore } from "./apps.js";
import { RULES_CHANGED } from "./scheduled.js";

export const routines = createStore({ loaded: false, tasks: [], usage: {}, recent: {}, timeZone: "" });
/** 打开着的：{ kind: "detail" | "use", id, botId?, from? } */
export const routineDialog = createStore(null);
export const CATEGORIES = ["news", "work", "learning", "life", "money"];
export const NEW_DAYS = 7;
/** 每个机器人最多几条规则（和服务端 MAX_RULES 一样） */
export const MAX_RULES_PER_BOT = 30;
const KEY = "amb-routines";

let loading = null;
// 规则建了、删了：「已在用」跟着变（读过才重新读）
if (typeof window !== "undefined") window.addEventListener(RULES_CHANGED, () => { if (routines.get().loaded) loadRoutines().catch(() => {}); });
export function loadRoutines() {
  loading ??= api("/routines").then((d) => {
    routines.set({ ...d, loaded: true });
    markSeen(d.tasks);
    return d;
  }).finally(() => { loading = null; });
  return loading;
}

function readLocal() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
function writeLocal(patch) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...readLocal(), ...patch })); } catch {}
}
export const localPrefs = createStore(readLocal());
export function setLocal(patch) {
  writeLocal(patch);
  localPrefs.set(readLocal());
}

/** 第一次装上任务库时现有的任务都不算新；之后版本里新加的，从第一次看到起标「新」7 天 */
function markSeen(tasks) {
  const local = readLocal();
  const seen = { ...(local.seen || {}) };
  const first = !local.seen;
  let changed = first;
  for (const x of tasks) if (!(x.id in seen)) { seen[x.id] = first ? 0 : Date.now(); changed = true; }
  if (changed) setLocal({ seen });
}
export const isNew = (task, local = localPrefs.get(), now = Date.now()) => {
  const at = local.seen?.[task.id];
  return !!at && now - at < NEW_DAYS * 86_400_000;
};

/** 任务库里列出来的（隐藏的联网版不列），按分类、推荐顺序；新的排在同分类最前 */
export function listed(tasks, local = localPrefs.get()) {
  return tasks.filter((x) => !x.hidden).sort((a, b) => Number(isNew(b, local)) - Number(isNew(a, local)) || a.rank - b.rank);
}
/** 首屏推荐：rank 最小的 6 条 */
export const recommended = (tasks) => tasks.filter((x) => !x.hidden).sort((a, b) => a.rank - b.rank).slice(0, 6);

/** 这条任务的现存规则（联网版算在原任务上） */
export function usageOf(data, task) {
  const ids = [task.id, ...(task.fallback ? [task.fallback] : [])];
  return ids.flatMap((id) => data.usage?.[id] || []);
}

/** 应用的连接状态：connected 已连接 · reauth 要重新授权 · none 没连（和服务端 appState 同一套） */
export function appState(id, apps = appsStore.get()) {
  const v = apps.apps.find((a) => a.key === id);
  if (!v?.accounts?.length) return "none";
  if (v.connected) return "connected";
  return ["needs-login", "key-rejected", "link-invalid", "expired"].includes(v.state) ? "reauth" : "connected";
}

/** 依赖逐项：{ kind: "web" | "app" | "group", id?, required, state } */
export function needsOf(task, apps = appsStore.get()) {
  const out = [];
  if (task.needs.web) out.push({ kind: "web", required: true, state: "ready" });
  for (const a of task.needs.apps || []) {
    const ids = [a.id, ...(a.alternatives || [])];
    const connected = ids.find((id) => appState(id, apps) === "connected");
    out.push({ kind: "app", id: connected || a.id, ids, required: a.required, state: connected ? "connected" : appState(a.id, apps) });
  }
  if (task.needs.group) out.push({ kind: "group", required: true, state: "group" });
  return out;
}

export const openRoutine = (id, opts = {}) => routineDialog.set({ kind: "detail", id, ...opts });
export const startRoutine = (id, opts = {}) => routineDialog.set({ kind: "use", id, ...opts });
export const closeRoutine = () => routineDialog.set(null);
/** 打开任务库页；from：右侧面板进来时带上当前机器人（之后的弹窗默认选它） */
export function openLibrary(opts = {}) {
  libraryFrom.set(opts.botId ? { botId: opts.botId } : null);
  if (location.hash !== "#/scheduled/library") location.hash = "/scheduled/library";
}
export const libraryFrom = createStore(null);
