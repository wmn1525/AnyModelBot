// 技能库（「应用与技能」页的「技能」标签、技能详情、作者浮层）：清单随应用内置（ui/data/skill-library.json），
// 标题、简介、触发方式在 ui/locales/<语言>/skillItems.json。只展示和导航：没有安装按钮，不下载、保存或转发技能文件；
// 「复制安装指令」复制一句话，用户发给机器人，由应用在对话里出确认卡片（src/skills/installs.ts）。
import { getLang, has, t } from "./i18n.js";

let cache = null;
let loading = null;

/** 读清单（第一次打开「技能」标签时才加载）：作者的技能数和主要分类、每条的 GitHub 地址在这里算好 */
export function loadLibrary() {
  if (cache) return Promise.resolve(cache);
  loading ??= import("../data/skill-library.json", { with: { type: "json" } })
    .then((m) => (cache = prepare(m.default)))
    .finally(() => (loading = null));
  return loading;
}
export const libraryNow = () => cache;

function prepare(d) {
  const skills = d.skills.map((s) => ({ ...s, url: s.path ? `https://github.com/${s.repo}/tree/${s.branch}/${s.path}` : `https://github.com/${s.repo}` }));
  const order = (c) => d.categories.indexOf(c);
  const authors = Object.fromEntries(
    Object.entries(d.authors).map(([id, a]) => {
      const mine = skills.filter((s) => s.author === id);
      // 主要分类：技能最多的两类；一样多时按分类的固定顺序
      const main = d.categories
        .map((c) => [c, mine.filter((s) => s.category === c).length])
        .filter(([, n]) => n)
        .sort((x, y) => y[1] - x[1] || order(x[0]) - order(y[0]))
        .slice(0, 2)
        .map(([c]) => c);
      return [id, { id, ...a, count: mine.length, main }];
    }),
  );
  return { ...d, skills, authors };
}

/** 作者昵称：中文界面用中文写法，其余语言用英文写法 */
export const authorName = (a) => (a ? (getLang() === "zh-CN" ? a.name : a.nameEn || a.name) : "");
/** 首字母占位（头像取不到时） */
export const initialOf = (a) => [...authorName(a).replace(/^[^\p{L}\p{N}]+/u, "")][0]?.toUpperCase() || "?";
export const skillText = (s, field) => (has(`skillItems.${s.id}.${field}`) ? t(`skillItems.${s.id}.${field}`) : "");
export const categoryName = (c) => t(`skills.categories.${c}`);
export const repoUrl = (s) => `https://github.com/${s.repo}`;

/** 安装指令：中文界面复制中文，其余语言复制英文（格式由 src/skills/installs.ts 的 installPromptLinks 识别） */
export const installPrompt = (s) => (getLang() === "zh-CN" ? `帮我安装这个技能：${s.url}` : `Install this skill for me: ${s.url}`); // i18n-ignore: fixed install prompt formats

/** 搜索：名称、标题、简介、触发方式、作者（昵称两种写法和 GitHub 账号）、标记，不区分大小写 */
export function matchesSkill(s, q, lib) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const a = lib.authors[s.author];
  const hay = [s.id, skillText(s, "title"), skillText(s, "summary"), skillText(s, "try"), a?.name, a?.nameEn, s.author, ...s.marks.map((m) => t(`skills.marks.${m}`))];
  return hay.some((x) => x && String(x).toLowerCase().includes(needle));
}

/** 复制到剪贴板；不可用或被拒绝时抛错（调用方展开指令让用户手动复制） */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    /* 退回旧办法 */
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand?.("copy");
  ta.remove();
  if (!ok) throw new Error("clipboard unavailable");
}

/** 在系统浏览器里打开（桌面版由主进程转给系统浏览器）；网页版被拦下时返回 false */
export function openExternal(url) {
  if (/Electron/i.test(navigator.userAgent)) {
    window.open(url, "_blank");
    return true;
  }
  const w = window.open(url, "_blank");
  if (!w) return false;
  try {
    w.opener = null;
  } catch {
    /* 跨域窗口 */
  }
  return true;
}

// —— 作者头像：从 github.com/{账号}.png 读，运行期间同一头像只请求一次；取不到或 3 秒内没加载出来就用首字母 ——
const avatars = new Map(); // 账号 → "ok" | "fail"
export const avatarSrc = (account) => `https://github.com/${encodeURIComponent(account)}.png?size=128`;
export const avatarState = (account) => avatars.get(account);
export function setAvatarState(account, state) {
  if (!avatars.has(account)) avatars.set(account, state);
}
