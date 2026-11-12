// 新手引导（上手清单）的状态：步骤（文案在 ui/locales/<语言>/guide.js）、进度（存在后端 /guide，见 src/guide.ts）、当前在引导哪一步。
// 各界面在看到结果时调 markDone()：对话里收到回复、换了模型、收到文件；信息面板看到渠道已连接。
// 有些步骤后端能从数据里推导出来（记忆、渠道），refreshGuide() 取回来时一并庆祝。
import { createStore, toast } from "./store.js";
import { api } from "./api.js";
import { getLang, has, t } from "./i18n.js";

/**
 * 清单的六步，id 与 src/guide.ts 的 GUIDE_STEPS 一致；target：引导卡片指向的界面位置（data-guide）。
 * 文案在 ui/locales/<语言>/guide.js 的 steps.<id>，渲染时用 stepText / stepHow 取（切换语言后跟着变，这里不缓存）：
 * title、desc、how（几条怎么做）、try（可以一键发出的示例，没有就不给按钮）、note、doneText；生图那一步另有 demoNote、noModelText。
 */
export const STEPS = [
  { id: "hello", target: "composer" },
  { id: "model", target: "model" },
  { id: "weixin", target: "weixin" },
  { id: "hands", target: "composer" },
  { id: "memory", target: "composer" },
  // 引导里这一步只放预置演示：教会怎么操作就够了，不替用户调用真的模型花钱（见 runMediaDemo）
  { id: "media", target: "composer" },
];

const stepKey = (s, field) => `guide.steps.${s.id}.${field}`;
/** 「连接常用聊天工具」能选的渠道（和设置 › 连接里能加的一致） */
export const GUIDE_CHANNELS = ["weixin", "feishu", "telegram", "slack", "discord"];
/**
 * 这一步当前选的渠道：用户选过的（存在进度里）；没选过时按界面语言推荐一个初始值。
 * 语言只用来推荐，不代表地区，也不采集位置；任何人都能改选所有渠道。
 */
export const guideChannel = (g = guide.get()) => (GUIDE_CHANNELS.includes(g.channel) ? g.channel : getLang() === "zh-CN" ? "weixin" : "telegram");
export const channelLabel = (id) => (has(`access.channel.${id}`) ? t(`access.channel.${id}`) : id);
export function setGuideChannel(id) {
  if (!GUIDE_CHANNELS.includes(id)) return;
  guide.set((g) => ({ ...g, channel: id }));
  api("/guide", { method: "PUT", body: { channel: id, owner: guide.get().owner } }).catch(() => {});
}
/** 步骤的一段文案（field 见上），{name} 换成机器人的名字；这一步没有这段（比如换模型没有 try）时返回 "" */
export function stepText(s, field, name = t("guide.defaultBotName")) {
  if (s.id === "weixin") {
    const key = { title: "channelTitle", desc: "channelDesc", note: "channelNote", doneText: "channelDone" }[field];
    return key ? t(`firstUse.${key}`) : "";
  }
  return has(stepKey(s, field)) ? t(stepKey(s, field), { name }) : "";
}
/** 「怎么做」的几条 */
export function stepHow(s) {
  if (s.id === "weixin") return [t("firstUse.channelHow", { channel: channelLabel(guideChannel()) })];
  if (s.id === "memory") return [t("firstUse.memoryHow")];
  const out = [];
  for (let i = 0; has(stepKey(s, `how.${i}`)); i++) out.push(t(stepKey(s, `how.${i}`)));
  return out;
}

/** loaded：读到了后端进度；media：账户有可用的图片 / 视频模型（只决定演示完了说什么、要不要给开通链接）；
 *  focus：引导卡片正指着的步骤；armed：从清单卡里直接发出了这一步的示例，做完时引导卡片接着出来说「做好了 → 下一步」 */
export const guide = createStore({ loaded: false, done: [], hidden: false, seen: [], media: false, focus: null, armed: null, trim: false, channel: "", owner: "" });
/** 刚完成一步：{ id, n, total, all, at }，对话页的头像、左下角的清单据此动一下 */
export const completed = createStore(null);
/** 往对话输入框里填一句（引导卡片的「填入」） */
export const fill = createStore(null);
/** 对话输入框里有没发出的草稿：自动弹出的引导卡片先不出来，免得打断（对话页写，引导卡片读） */
export const composerBusy = createStore(false);
/** 在对话里放一遍生图的预置演示（对话页订阅它） */
export const demo = createStore(null);

/**
 * 六步都在；生图那一步不管有没有可用模型都走预置演示。
 * 目录里有 Bot 时（trim）新用户先走 Bot：打招呼和动手在用 Bot 时就学会了，换模型有默认档位，只留三步。
 */
const TRIMMED = ["weixin", "memory", "media"];
export const visibleSteps = (g = guide.get()) => (g.trim ? STEPS.filter((s) => TRIMMED.includes(s.id)) : STEPS);
export const setGuideTrim = (on) => guide.set((g) => (g.trim === on ? g : { ...g, trim: on }));
export const currentStep = (g = guide.get()) => visibleSteps(g).find((s) => !g.done.includes(s.id)) || null;
export const nextStep = (id, g = guide.get()) => {
  const list = visibleSteps(g);
  const i = list.findIndex((s) => s.id === id);
  return list.slice(i + 1).find((s) => !g.done.includes(s.id)) || list.find((s) => !g.done.includes(s.id) && s.id !== id) || null;
};
/**
 * 清单在不在：接入完成、进入主界面后就有固定入口（不再等用过发现页的 Bot）。
 * 收起（稍后 / 不再显示）只是不显示，不算完成；全部完成是里程碑（completed），之后一直收起。
 */
export const isActive = (g = guide.get()) => g.loaded && !g.hidden && !g.seen.includes("completed");

const ORDER = STEPS.map((s) => s.id);

function celebrate(ids, g) {
  if (!ids.length || g.hidden) return;
  const list = visibleSteps(g);
  const n = list.filter((s) => g.done.includes(s.id)).length;
  const all = n === list.length;
  const last = STEPS.find((s) => s.id === ids[ids.length - 1]);
  completed.set({ id: last.id, n, total: list.length, all, at: Date.now() });
  toast(all ? t("guide.allDone") : t("guide.toastProgress", { progress: `${n}/${list.length}`, title: stepText(last, "title", t("guide.nameToast")) }));
}

/** 后端进度 → 本地；新出现的完成项（后端推导出来的）也庆祝一下 */
function apply(d, quiet) {
  const g = guide.get();
  const sameOwner = !g.owner || g.owner === d.owner;
  const fresh = g.loaded && sameOwner ? d.done.filter((id) => !g.done.includes(id)) : [];
  const next = { ...g, loaded: true, done: ORDER.filter((id) => d.done.includes(id) || (sameOwner && g.done.includes(id))), hidden: !!d.hidden, seen: d.seen || [], channel: d.channel || "", owner: d.owner, ...(!sameOwner ? { focus: null, armed: null } : {}) };
  guide.set(next);
  if (!quiet) celebrate(fresh, next);
  if (next.seen.includes("completed")) guide.set((g) => ({ ...g, focus: null, armed: null }));
}

/** 先读进度把清单显示出来；有没有可用的图片模型要问 OKINTO（可能要好几秒），在后台慢慢问，问不到就当没有 */
export async function loadGuide() {
  const d = await api("/guide").catch(() => null);
  if (d) apply(d, true);
  api("/media/models")
    .then((m) => guide.set((g) => ({ ...g, media: !!(m.image?.length || m.video?.length) })))
    .catch(() => {});
}
/** 再读一次（回复结束后、指着渠道那一步时）：后端推导出的新完成项会被庆祝 */
export const refreshGuide = () => api("/guide").then((d) => apply(d, false)).catch(() => {});

/**
 * 回复结束后再看几次：记忆可能在回合之后才写入（模型没自己调用 remember 时，由回合后的记忆整理写，
 * 明确说"记住……"时一两秒内，其他时候最多一分半），渠道也可能稍后才连上。只在这两步还没做完时看。
 */
let soonTimers = [];
export function refreshGuideSoon() {
  for (const t of soonTimers) clearTimeout(t);
  soonTimers = [];
  const pending = () => {
    const g = guide.get();
    return isActive(g) && (!g.done.includes("memory") || !g.done.includes("weixin"));
  };
  if (!pending()) return;
  for (const ms of [2500, 8000, 20_000, 60_000, 100_000]) soonTimers.push(setTimeout(() => pending() && refreshGuide(), ms));
}

export function markDone(id) {
  const g = guide.get();
  if (!g.loaded || g.done.includes(id)) return;
  const next = { ...g, done: ORDER.filter((x) => g.done.includes(x) || x === id), ...(g.armed === id ? { focus: id, armed: null, focusAuto: true } : {}) };
  guide.set(next);
  celebrate([id], next);
  api("/guide", { method: "PUT", body: { done: id, owner: g.owner } }).then((d) => apply(d, true)).catch(() => {});
}

/** 用户自己点开的引导（清单里的"带我去"、左下角清单的一项）：照常显示，不受草稿、运行中任务的限制 */
export const setFocus = (id) => guide.set((g) => ({ ...g, focus: id, focusAuto: false }));
/** 清单卡里点了「发送这句」：做完这一步时把引导卡片叫出来 */
export const arm = (id) => guide.set((g) => ({ ...g, armed: id }));

export function markSeen(key) {
  guide.set((g) => (g.seen.includes(key) ? g : { ...g, seen: [...g.seen, key] }));
  api("/guide", { method: "PUT", body: { seen: key, owner: guide.get().owner } }).catch(() => {});
}

/** 设置 → 常规 → 上手清单「重新开始」：清掉收起与不再显示，已经能从数据看出来做过的步骤仍算做过 */
export async function resetGuide() {
  const d = await api("/guide", { method: "PUT", body: { reset: true } });
  guide.set((g) => ({ ...g, done: [], focus: null, armed: null }));
  apply(d, true);
}

export function hideGuide() {
  guide.set((g) => ({ ...g, hidden: true, focus: null }));
  api("/guide", { method: "PUT", body: { hidden: true, owner: guide.get().owner } }).catch(() => {});
}

export const fillComposer = (text) => fill.set({ text, at: Date.now() });
/** 把一句话直接发给当前对话的机器人（输入框里有草稿时只填进去，不替用户发） */
export const sendToChat = (text) => fill.set({ text, at: Date.now(), send: true });

/** 放一遍生图的预置演示：流程和真的一样（直接生成 → 图片显示在对话里），图是客户端自带的示例，不调用模型、不扣费 */
export function runMediaDemo() {
  demo.set({ text: stepText(STEPS.find((s) => s.id === "media"), "try"), at: Date.now() });
}

/** 文件名看起来是图片或视频：算「生成一张图」，其余的交付算「让它动手做件事」 */
export const isMediaFile = (name) => /\.(png|jpe?g|webp|gif|bmp|mp4|mov|webm)$/i.test(name || "");
