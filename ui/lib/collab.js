// 关于我、机器人协作在对话里要用的几样：认识的机器人（头像和名字）、打开两人对话、把提示行和灰色小字挂到对话里的哪一项。
import { createStore } from "./store.js";

/** 应用读到的机器人列表（main.js 设）：灰色小字和两人对话里画头像 */
export const knownBots = createStore([]);
export const setKnownBots = (list) => knownBots.set(Array.isArray(list) ? list : []);
export const botById = (id) => knownBots.get().find((b) => b.id === id) || null;

/** 打开的两人对话：{ pairKey, handoffId?, from? }（from：从设置列表点开时滚到最新） */
export const pairChat = createStore(null);
export const openPairChat = (pairKey, handoffId = "") => pairChat.set({ pairKey, handoffId, at: Date.now() });

/** 还没结束的件 */
export const OPEN_STATES = ["queued", "working", "waiting", "replied"];

/**
 * 对话里的一项（回复、出错提示）在什么时间之后：按时间找「这一轮的回复」——at 之后的第一条机器人回复；
 * 那一轮还在进行时挂在进行中的那条上。返回 item.id，找不到时空串。
 */
export function replyAfter(items, at) {
  const list = items || [];
  const hit = list.find((x) => (x.kind === "msg" || x.kind === "error") && x.role !== "user" && !x.live && x.at >= at - 500);
  if (hit) return hit.id;
  const live = list.findLast((x) => x.live);
  return live ? live.id : "";
}
