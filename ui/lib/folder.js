// 输入框上方的工作文件夹（PRD R1–R3）：每个机器人的网页对话一份，换页回来还在。
// 只记位置引用，不读、不传、不复制里面的内容；选择、更换、取消都只影响之后发送的消息（服务端按发送那一刻的选择绑定）。
// 只有桌面版能弹系统的目录选择器；网页里只看得到已有的选择，不能新选或更换。
import { api, ApiError } from "./api.js";
import { createStore, toast, useStore } from "./store.js";
import { t } from "./i18n.js";

const blank = () => ({ loaded: false, picker: false, reason: "", current: null, recent: [], busy: false });
const stores = new Map();
export function folderStore(botId) {
  if (!stores.has(botId)) stores.set(botId, createStore(blank()));
  return stores.get(botId);
}
export const useFolder = (botId) => useStore(folderStore(botId || "-"));

const apply = (botId, d) => folderStore(botId).set((s) => ({ ...s, loaded: true, picker: !!d.picker, reason: d.reason || "", current: d.current || null, recent: d.recent || [] }));

/** 读一次：当前选择（只核对目录本身能不能用）、最近文件夹、这一端能不能选 */
export async function refreshFolder(botId) {
  if (!botId) return;
  try {
    apply(botId, await api(`/bots/${encodeURIComponent(botId)}/folder`));
  } catch {
    /* 旧服务没有这个接口：不显示选择位 */
  }
}

/** 点发送那一刻的选择 id（"" = 没选） */
export const folderIdOf = (botId) => folderStore(botId).get().current?.id || "";

async function call(botId, what, body) {
  const s = folderStore(botId);
  if (s.get().busy) return;
  s.set((x) => ({ ...x, busy: true }));
  try {
    const d = await api(`/bots/${encodeURIComponent(botId)}/folder/${what}`, { method: "POST", body: body || {} });
    apply(botId, d);
    return d;
  } catch (e) {
    // 不可选的位置、不在了、系统不允许访问：一句短提示，原选择不变
    toast(e instanceof ApiError ? e.message : t("folder.failed"));
    void refreshFolder(botId);
  } finally {
    s.set((x) => ({ ...x, busy: false }));
  }
}

/** 弹系统目录选择器；取消时原选择不变 */
export const pickFolder = (botId) => call(botId, "pick");
/** 选一个最近文件夹 */
export const selectFolder = (botId, id) => call(botId, "select", { id });
/** 不使用文件夹：之后的消息回到机器人原来的工作区 */
export const clearFolder = (botId) => call(botId, "clear");
/** 开始新对话：新分段不带入旧选择（服务端已经清掉，这里跟着刷新） */
export const resetFolder = (botId) => refreshFolder(botId);

/** 最近文件夹里同名的几项：附上父路径区分 */
export function sameNames(list) {
  const n = new Map();
  for (const f of list) n.set(f.name, (n.get(f.name) || 0) + 1);
  return (f) => (n.get(f.name) || 0) > 1;
}
