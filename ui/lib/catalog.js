// 目录 Bot 在界面这边的状态：用户看过哪些（「发现」旁边的小蓝点、行上的「有新的」）。
// 看过只是本机的显示偏好，存在 localStorage 里。侧栏里目录 Bot 放在哪个分组见 lib/sections.js。
import { createStore } from "./store.js";

const SEEN = "amb-catalog-seen";

const read = (k, d) => {
  try {
    return JSON.parse(localStorage.getItem(k) || "null") ?? d;
  } catch {
    return d;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* 隐私模式等存不了：只影响小圆点 */
  }
};

export const catalogSeen = createStore(read(SEEN, []));

export function markCatalogSeen(id) {
  catalogSeen.set((s) => {
    if (s.includes(id)) return s;
    const next = [...s, id].slice(-500);
    write(SEEN, next);
    return next;
  });
}

/** 文案按语言取：缺了退回 en，再退回 zh-CN */
export const tr = (v, lang) => (v ? v[lang] ?? v.en ?? v["zh-CN"] : undefined);
