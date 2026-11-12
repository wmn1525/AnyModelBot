// 本机界面偏好：设置 › 外观（字体大小、字体、对话宽度、代码换行、动画、毛玻璃）、设置 › 常规里的对话习惯（发送键、完成通知），
// 以及拖分隔条调过的侧栏 / 信息面板宽度、侧栏是否收起。
// 和主题（lib/theme.js）一样存在 localStorage：每个浏览器 / 桌面窗口各一份，不进服务端配置。
// 外观类的偏好解析成 <html> 上的 data-* 属性（取值见 design/tokens/semantic.css「用户偏好」），CSS 只认这些属性；
// 首帧前 index.html 先按同样的规则套一遍，避免闪——改这里的解析规则时两处一起改。
import { createStore } from "./store.js";

const KEY = "amb-prefs";

export const PREF_DEFAULTS = Object.freeze({
  text: "md", //        字体大小：sm | md | lg | xl
  font: "system", //    界面字体：system | serif | custom
  fontName: "", //      font = custom 时的字体名（逗号分隔可写多个）
  codeFont: "", //      代码字体名，空 = 系统等宽字体
  width: "normal", //   对话宽度：normal | wide | full
  codeWrap: false, //   代码块自动换行
  motion: "system", //  动画：system | on | off
  sendKey: "enter", //  发送：enter（Shift+Enter 换行）| mod（⌘/Ctrl+Enter 发送，Enter 换行）
  notify: false, //     窗口不在前台时，回复完成 / 需要确认弹系统通知
  sideW: 0, //          侧栏宽度（px），拖分隔条调的；0 = 默认（tokens 的 --side-w，窄窗口时更窄）
  panelW: 0, //         右侧面板宽度（px），同上
  workW: 0, //          右侧面板放着工作台（专业 Bot 的专属界面）时的宽度（px），同上；0 = 默认（tokens 的 --work-w）
  sideHidden: false, // 侧栏收起（顶部最左边的按钮）
  updateDismissed: "", // 侧栏叉掉的新版本提示是哪个版本；更新的版本照样提示
});
/** "恢复默认外观"重置的键（对话习惯不动） */
export const APPEARANCE_KEYS = ["text", "font", "fontName", "codeFont", "width", "codeWrap", "motion"];

const CHOICES = {
  text: ["sm", "md", "lg", "xl"],
  font: ["system", "serif", "custom"],
  width: ["normal", "wide", "full"],
  motion: ["system", "on", "off"],
  sendKey: ["enter", "mod"],
};

/** 字体名只留能安全放进 CSS 字符串的字符：去掉引号、反斜杠、分号、花括号、尖括号 */
export const cleanFontName = (s) => String(s || "").replace(/["'\\;{}<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
/** "LXGW WenKai, 霞鹜文楷" → "\"LXGW WenKai\", \"霞鹜文楷\"" */
export const fontStack = (s) =>
  cleanFontName(s)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => `"${x}"`)
    .join(", ");

function sanitize(raw) {
  const p = { ...PREF_DEFAULTS };
  if (!raw || typeof raw !== "object") return p;
  for (const [k, list] of Object.entries(CHOICES)) if (list.includes(raw[k])) p[k] = raw[k];
  for (const k of ["fontName", "codeFont"]) if (typeof raw[k] === "string") p[k] = cleanFontName(raw[k]);
  for (const k of ["codeWrap", "notify", "sideHidden"]) if (typeof raw[k] === "boolean") p[k] = raw[k];
  if (typeof raw.updateDismissed === "string") p.updateDismissed = raw.updateDismissed.slice(0, 32);
  // 宽度只粗查一下是不是合理的像素数；精确的范围（最窄 / 最宽 / 窗口占比）由 CSS 的 clamp() 和 Splitter 管
  for (const k of ["sideW", "panelW"]) if (Number.isFinite(raw[k]) && raw[k] >= 120 && raw[k] <= 1200) p[k] = Math.round(raw[k]);
  if (Number.isFinite(raw.workW) && raw.workW >= 120 && raw.workW <= 2400) p.workW = Math.round(raw.workW);
  return p;
}

function read() {
  try {
    return sanitize(JSON.parse(localStorage.getItem(KEY) || "null"));
  } catch {
    return sanitize(null);
  }
}

function write(p) {
  try {
    const diff = Object.fromEntries(Object.entries(p).filter(([k, v]) => v !== PREF_DEFAULTS[k]));
    if (Object.keys(diff).length) localStorage.setItem(KEY, JSON.stringify(diff));
    else localStorage.removeItem(KEY);
  } catch {
    /* 隐私模式等：只在本次生效 */
  }
}

const mqMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const mqGlass = window.matchMedia("(prefers-reduced-transparency: reduce)");

function apply(p) {
  const root = document.documentElement;
  const d = root.dataset;
  const custom = p.font === "custom" && fontStack(p.fontName);
  d.text = p.text;
  d.font = custom ? "custom" : p.font === "serif" ? "serif" : "system";
  if (custom) root.style.setProperty("--font", `${custom}, var(--font-system)`);
  else root.style.removeProperty("--font");
  const code = fontStack(p.codeFont);
  if (code) root.style.setProperty("--code", `${code}, var(--code-system)`);
  else root.style.removeProperty("--code");
  d.width = p.width;
  d.codeWrap = p.codeWrap ? "on" : "off";
  d.motion = p.motion === "off" ? "off" : p.motion === "on" ? "full" : mqMotion.matches ? "reduce" : "full";
  d.glass = mqGlass.matches ? "off" : "on"; // 没有设置项，只跟随系统的"降低透明度"
  // 拖过的宽度：<html> 上内联 --side-w-user / --panel-w-user / --work-w-user（shell.css 取 var(--side-w-user, var(--side-w))）
  for (const [k, prop] of [["sideW", "--side-w-user"], ["panelW", "--panel-w-user"], ["workW", "--work-w-user"]])
    if (p[k]) root.style.setProperty(prop, `${p[k]}px`);
    else root.style.removeProperty(prop);
}

export const prefs = createStore(read());

export function setPrefs(patch) {
  const next = sanitize({ ...prefs.get(), ...patch });
  write(next);
  prefs.set(next);
  apply(next);
}

export function resetAppearance() {
  setPrefs(Object.fromEntries(APPEARANCE_KEYS.map((k) => [k, PREF_DEFAULTS[k]])));
}

/** 和默认外观是否不同（设置页的"恢复默认"据此可用） */
export const appearanceChanged = (p) => APPEARANCE_KEYS.some((k) => p[k] !== PREF_DEFAULTS[k]);

mqMotion.addEventListener?.("change", () => apply(prefs.get()));
mqGlass.addEventListener?.("change", () => apply(prefs.get()));
// 同一浏览器开了多个标签页：一处改了，其他标签页跟着变
window.addEventListener("storage", (e) => {
  if (e.key !== KEY && e.key !== null) return;
  const next = read();
  prefs.set(next);
  apply(next);
});
apply(prefs.get());
