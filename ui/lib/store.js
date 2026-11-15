// 极小的全局状态：toast、确认框、主题。toast 的文字在调用时就按当前语言取好。组件用 useStore 订阅。
import { useEffect, useState } from "preact/hooks";
import { ms } from "../design/motion.js";
import { t } from "./i18n.js";

export function createStore(initial) {
  let value = initial;
  const subs = new Set();
  return {
    get: () => value,
    set(next) {
      value = typeof next === "function" ? next(value) : next;
      for (const fn of subs) fn(value);
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

export function useStore(store) {
  const [v, setV] = useState(store.get());
  useEffect(() => store.subscribe(setV), [store]);
  return v;
}

// —— toasts ——
export const toasts = createStore([]);
let toastSeq = 0;
/** 最多三条提示；普通提示显示三秒，悬停暂停，错误由用户关闭。 */
const toastTimers = new Map();
const toastPaused = new Set();
export function pauseToast(id) { toastPaused.add(id); clearTimeout(toastTimers.get(id)); }
export function resumeToast(id) {
  toastPaused.delete(id);
  scheduleToast(id);
}
function scheduleToast(id) {
  clearTimeout(toastTimers.get(id));
  const item = toasts.get().find((t) => t.id === id);
  if (item && !item.leaving && !item.queued && item.kind !== "err" && !toastPaused.has(id)) {
    toastTimers.set(id, setTimeout(() => dismissToast(id), 3000));
  }
}
function promoteToasts() {
  let room = 3 - toasts.get().filter((t) => !t.queued).length;
  const promoted = [];
  toasts.set((list) => list.map((item) => {
    if (item.queued && room-- > 0) { promoted.push(item.id); return { ...item, queued: false }; }
    return item;
  }));
  promoted.forEach(scheduleToast);
  const list = toasts.get();
  if (list.some((t) => t.queued) && !list.some((t) => t.leaving)) dismissToast(list.find((t) => !t.queued).id);
}
export function toast(text, kind = "ok", scope = "") {
  // 同一条提示还在（比如连续保存）：沿用那一条、重新计时，不叠一串、也不重播出现的动画
  const same = toasts.get().find((t) => t.kind === kind && t.text === text && !t.leaving);
  const id = same ? same.id : ++toastSeq;
  if (!same) { toasts.set((l) => [...l, { id, text, kind, scope, queued: true }]); promoteToasts(); }
  else if (same.scope !== scope) toasts.set((l) => l.map((item) => item.id === id ? { ...item, scope } : item));
  scheduleToast(id);
  return id;
}
/** 收起某个区域里的提示（比如保存失败时，刚才那条"已保存"不能再留着） */
export function clearToasts(scope) {
  for (const t of toasts.get()) if ((t.scope || "") === scope) dismissToast(t.id);
}
export function dismissToast(id) {
  if (!toasts.get().some((t) => t.id === id && !t.leaving)) return;
  clearTimeout(toastTimers.get(id));
  toastTimers.delete(id);
  toastPaused.delete(id);
  toasts.set((l) => l.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
  setTimeout(() => { toasts.set((l) => l.filter((t) => t.id !== id)); promoteToasts(); }, ms("--dur-base", 180));
}
export const saved = (scope = "") => toast(t("common.saved"), "ok", scope);
export const failed = (e) => toast(typeof e === "string" ? e : e?.message || t("common.error"), "err");

// —— confirm sheet ——
export const dialog = createStore(null);
/** confirm({ title, body, confirmLabel, danger, check }) → Promise<boolean>。check：{ label, value }，框里多一个勾选项，选择写回 check.value */
export function confirmSheet(opts) {
  return new Promise((resolve) => dialog.set({ ...opts, resolve }));
}
