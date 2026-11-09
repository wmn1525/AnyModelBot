// 机器人头像：内置毛绒角色（6 个基础角色 + 12 个领域专家，蓝色的"天天"是默认头像），每个机器人配一个，只决定长相，和它做什么无关；会看指针、眨眼，并对平台里发生的事做出反应。
// 图层由 scripts/build-bot-avatars.py 从 anymodelbot_design/logo avator/ 生成（ui/design/bots/<key>.webp，另有小档 <key>@<边长>.webp）；
// 下面的几何是相对头像方框的百分比，和脚本输出的是同一套数，换图后要一起更新。
import { useEffect, useRef, useState } from "preact/hooks";
import { html } from "./ui.js";
import { ms, reducedMotion } from "../design/motion.js";
import { t } from "../lib/i18n.js";

/**
 * 角色。eyes：两眼中心；r：眼睛半径；earL / earR / top：耳朵与头顶配件的转轴；tip：配件的中心（特效从这里发出）；
 * lens：护目镜镜片（只有飞飞有）。
 * 名字 name、一句介绍 about 在词典 avatar.chars.<key> 里，用 charText(key) 取；BOT_CHARS[key].name / .about 也能读（getter，读的时候按当前语言翻译）。
 * 基础角色没有定位：机器人做什么由人设决定，不要在这里给基础角色写岗位，也不要让模板绑定角色。
 */
export const BOT_CHARS = {
  blue: {
    eyes: [[38.81, 62.99], [60.82, 62.99]], r: 3.41, earL: [18.14, 62.21], earR: [81.94, 62.21], top: [49.96, 31.78], tip: [49.8, 21.2],
  },
  yellow: {
    eyes: [[38.34, 63.5], [61.4, 63.48]], r: 3.57, earL: [17.91, 62.13], earR: [82.25, 62.13], top: [50.04, 31.32], tip: [50, 19.7],
  },
  green: {
    eyes: [[38.8, 63.07], [61.09, 63.08]], r: 3.49, earL: [17.91, 62.71], earR: [82.02, 62.71], top: [50, 31.32], tip: [50.2, 21.2],
  },
  red: {
    eyes: [[37.53, 59.46], [62.24, 59.45]], r: 3.88, earL: [19.53, 58.06], earR: [80.47, 58.06], top: [50.04, 28.37], tip: [50, 15],
  },
  purple: {
    eyes: [[38.86, 63.04], [60.96, 63.04]], r: 3.49, earL: [18.14, 62.91], earR: [81.94, 62.91], top: [49.84, 32.87], tip: [50, 22],
  },
  orange: {
    eyes: [[38.18, 61.84], [61.83, 61.84]], r: 3.57, earL: [15.66, 61.47], earR: [84.34, 61.47], top: [50.12, 27.44], tip: [50, 17],
    lens: [[35.27, 40.85], [64.81, 40.85], 6.4],
  },
};
/** 基础角色：没选过头像的机器人只在这六个里挑（charOf），官网也只用这六个。site/scripts/sync-from-app.ts 比对的是上面这一段的几何，专家不要写进去 */
export const BASE_KEYS = Object.keys(BOT_CHARS);
/**
 * 12 个领域专家：用户 2026-11-03 要的，形象带领域（avatar.chars.<key>.field），在选择器里单独一组。
 * 选了也只换长相，人设、模型和能力不变；模板同样不绑定它们。字段同上，原图在 anymodelbot_design/logo avator/专家/。
 */
export const EXPERT_CHARS = {
  law: {
    eyes: [[38.8, 62.95], [60.87, 62.95]], r: 3.41, earL: [18.45, 62.21], earR: [81.4, 62.21], top: [49.73, 31.94], tip: [49.7, 21.5],
  },
  health: {
    eyes: [[38.9, 61.56], [61.02, 61.56]], r: 3.41, earL: [17.6, 60.5], earR: [82.25, 60.5], top: [50.0, 30.0], tip: [50.0, 21.2],
  },
  finance: {
    eyes: [[38.69, 62.89], [60.88, 62.89]], r: 3.41, earL: [18.06, 61.63], earR: [81.32, 61.63], top: [49.42, 30.78], tip: [49.5, 20.9],
  },
  code: {
    eyes: [[38.85, 62.92], [60.85, 62.93]], r: 3.41, earL: [18.45, 62.02], earR: [81.24, 62.02], top: [49.88, 31.32], tip: [49.9, 21.9],
  },
  design: {
    eyes: [[38.81, 62.86], [60.95, 62.88]], r: 3.49, earL: [18.22, 61.86], earR: [81.32, 61.86], top: [49.92, 31.55], tip: [50.8, 21.6],
  },
  writing: {
    eyes: [[38.98, 62.96], [61.17, 62.97]], r: 3.49, earL: [18.99, 62.4], earR: [81.09, 62.4], top: [50.08, 33.02], tip: [50.1, 21.9],
  },
  education: {
    eyes: [[38.74, 60.26], [61.16, 60.25]], r: 3.41, earL: [18.06, 59.77], earR: [81.47, 59.77], top: [50.16, 29.15], tip: [49.8, 20.7],
  },
  science: {
    eyes: [[38.69, 63.0], [60.77, 62.99]], r: 3.41, earL: [18.45, 62.25], earR: [81.4, 62.25], top: [49.81, 31.71], tip: [49.9, 21.4],
  },
  data: {
    eyes: [[38.65, 62.99], [60.68, 63.0]], r: 3.41, earL: [18.29, 62.36], earR: [81.32, 62.36], top: [48.99, 31.94], tip: [49.7, 21.9],
  },
  marketing: {
    eyes: [[38.79, 62.99], [60.82, 62.99]], r: 3.57, earL: [18.45, 62.25], earR: [81.47, 62.25], top: [49.69, 31.71], tip: [52.8, 21.6],
  },
  cooking: {
    eyes: [[38.67, 62.52], [61.35, 62.52]], r: 3.57, earL: [18.37, 61.71], earR: [81.63, 61.71], top: [50.12, 33.1], tip: [50.0, 22.2],
  },
  translate: {
    eyes: [[38.79, 63.55], [60.92, 63.55]], r: 3.41, earL: [18.6, 62.95], earR: [81.32, 62.95], top: [49.26, 32.33], tip: [50.0, 21.6],
  },
};
export const EXPERT_KEYS = Object.keys(EXPERT_CHARS);
Object.assign(BOT_CHARS, EXPERT_CHARS);
export const CHAR_KEYS = Object.keys(BOT_CHARS);
export const MAIN_CHAR = "blue";

/**
 * 精灵图分档（每格边长）：<key>.webp 是 448，另有这几档小的 <key>@<边长>.webp，都是脚本从原图直接缩出来的（和脚本的 TIERS 一致）。
 * 按显示尺寸 × 设备像素比挑最小的够用的一档，浏览器最多再缩一倍：拿 448 的图实时缩到 20–40px，绒毛边缘会出锯齿，动起来还会闪。
 */
export const SPRITE_TIERS = [56, 112, 224];
export function spriteUrl(key, px) {
  const tier = SPRITE_TIERS.find((c) => c >= px);
  return `/amb/static/design/bots/${key}${tier ? "@" + tier : ""}.webp`;
}

/** 角色的名字、介绍和领域（按当前语言）；基础角色没有领域 */
export const charText = (key) => ({ name: t(`avatar.chars.${key}.name`), about: t(`avatar.chars.${key}.about`), field: EXPERT_CHARS[key] ? t(`avatar.chars.${key}.field`) : "" });
for (const k of CHAR_KEYS)
  for (const f of ["name", "about"]) Object.defineProperty(BOT_CHARS[k], f, { get: () => t(`avatar.chars.${k}.${f}`), enumerable: true });

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
/** 机器人用哪个角色：设置里选过的 > 默认机器人用默认头像 > 由 id 稳定地在基础角色里挑一个（不能用全部角色：加了角色，老机器人的头像就变了） */
export function charOf(bot) {
  const a = bot && bot.settings && bot.settings.avatar;
  if (a && BOT_CHARS[a]) return a;
  if (!bot || bot.id === "default") return MAIN_CHAR;
  return BASE_KEYS[hash(String(bot.id || bot.name || "?")) % BASE_KEYS.length];
}

// —— 指针：一个全局监听，写每张脸的 --look-x / --look-y（只有指针靠近的脸会看过去） ——
let watchers = 0;
let px = -1e5;
let py = -1e5;
let raf = 0;
function applyLook() {
  raf = 0;
  for (const el of document.querySelectorAll(".bot-face")) {
    const r = el.getBoundingClientRect();
    if (!r.width) continue;
    const dx = px - (r.left + r.width / 2);
    const dy = py - (r.top + r.height / 2);
    const fall = Math.max(0, 1 - Math.hypot(dx, dy) / Math.max(140, r.width * 4));
    el.style.setProperty("--look-x", Math.max(-1, Math.min(1, (dx / (r.width * 0.7)) * fall)).toFixed(3));
    el.style.setProperty("--look-y", Math.max(-1, Math.min(1, (dy / (r.height * 0.7)) * fall)).toFixed(3));
  }
}
const onMove = (e) => {
  px = e.clientX;
  py = e.clientY;
  if (!raf) raf = requestAnimationFrame(applyLook);
};
const onOut = (e) => {
  if (e.relatedTarget) return;
  px = py = -1e5;
  if (!raf) raf = requestAnimationFrame(applyLook);
};
function watchPointer() {
  if (reducedMotion()) return () => {};
  if (watchers++ === 0) {
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerout", onOut);
  }
  return () => {
    if (--watchers) return;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerout", onOut);
  };
}

// —— 表情：每种都画在以眼睛中心为原点的坐标里（单位同 viewBox 0–100），右眼镜像 ——
function eyeShapes(R) {
  const f = (n) => +(n * R).toFixed(2);
  const spiral = [];
  for (let i = 0; i <= 28; i++) {
    const t = (i / 28) * Math.PI * 4.2;
    const rr = (0.12 + (0.9 * i) / 28) * R;
    spiral.push(`${i ? "L" : "M"}${(Math.cos(t) * rr).toFixed(2)} ${(Math.sin(t) * rr).toFixed(2)}`);
  }
  return html`<circle class="e e-open" r=${R} />
    <path class="e e-happy line" d=${`M${f(-1.05)} ${f(0.45)}Q0 ${f(-1.3)} ${f(1.05)} ${f(0.45)}`} />
    <path class="e e-closed line" d=${`M${f(-1.05)} ${f(-0.15)}Q0 ${f(0.8)} ${f(1.05)} ${f(-0.15)}`} />
    <path class="e e-sad" d=${`M${f(-1.05)} 0L${f(1.05)} 0A${f(1.05)} ${f(1.05)} 0 0 1 ${f(-1.05)} 0Z`} />
    <path class="e e-x line" d=${`M${f(-0.8)} ${f(-0.8)}L${f(0.8)} ${f(0.8)}M${f(0.8)} ${f(-0.8)}L${f(-0.8)} ${f(0.8)}`} />
    <path class="e e-spiral line thin" d=${spiral.join("")} />
    <path class="e e-heart" d=${`M0 ${f(1.05)}C${f(-1.7)} ${f(-0.05)} ${f(-1)} ${f(-1.4)} 0 ${f(-0.5)}C${f(1)} ${f(-1.4)} ${f(1.7)} ${f(-0.05)} 0 ${f(1.05)}Z`} />`;
}

const BUSY = new Set(["thinking", "replying", "working"]);
/** 一次性反应对应的表情（error 先是 ×× 再变成难过，在 CSS 里接力） */
const SHOT_EYES = { hello: "happy", done: "happy", poke: "happy", love: "heart", dizzy: "spiral", error: "error" };
const STATE_EYES = { sleep: "closed" };

/** 粒子：只在大于 FX_MIN 的头像上画 */
const FX_MIN = 36;
const BURST = [0, 45, 90, 135, 180, 225, 270, 315];
const Twinkles = () => html`<span class="fx fx-twinkle"><i></i><i></i><i></i></span>`;
function Fx({ char, state, shot }) {
  const busy = BUSY.has(state);
  return html`
    ${busy && (char === "yellow" || char === "purple") && html`<${Twinkles} />`}
    ${state === "thinking" && !shot && html`<span class="fx fx-think"><i></i><i></i><i></i></span>`}
    ${state === "waiting" && !shot && html`<span class="fx fx-bang">!</span>`}
    ${state === "sleep" && !shot && html`<span class="fx fx-zzz"><i>z</i><i>z</i><i>z</i></span>`}
    ${(shot === "done" || shot === "hello" || shot === "love") && html`<span class="fx fx-burst">${BURST.map((a, i) => html`<i style=${{ "--a": a + "deg", "--i": i }}></i>`)}</span>`}
    ${shot === "done" && char === "green" && html`<span class="fx fx-leaf"></span>`}
    ${shot === "love" && html`<span class="fx fx-hearts"><i></i><i></i><i></i></span>`}
    ${shot === "dizzy" && html`<span class="fx fx-orbit"><i></i><i></i><i></i></span>`}`;
}

/**
 * 机器人头像。
 *   bot / char        角色：给 bot 时按 charOf(bot)，char 直接指定（选择器、样例页）
 *   state             持续状态：idle | listening（用户在输入）| thinking | replying | working | waiting（等你批准）| sleep
 *   cue               一次性反应 { kind: "error" | "done" | "hello", at }，at 变了就再播一次；忙 → 不忙时自动播 done
 *   greet             挂载时打个招呼（hello）
 *   lively            大头像：空闲时也呼吸、眨眼、四处看，脚下有影子
 *   pokeable          可以戳：戳一下开心，连戳三下冒爱心，戳太多会晕
 *   neutral           还没有身份的灰色版（新建页占位）
 */
export function BotAvatar({ bot, id, name, char, size = 34, state = "idle", working = false, cue, greet = false, lively = false, pokeable = false, neutral = false }) {
  const key = BOT_CHARS[char] ? char : neutral ? MAIN_CHAR : charOf(bot || (id || name ? { id, name } : null));
  const c = BOT_CHARS[key];
  const st = working && state === "idle" ? "working" : state;
  const [shot, setShot] = useState(greet ? "hello" : "");
  const [n, setN] = useState(0);
  const timer = useRef(0);
  const playing = useRef(greet ? "hello" : "");
  const prev = useRef(st);
  const lastCue = useRef(cue && cue.at);
  const pokes = useRef([]);

  const play = (kind) => {
    clearTimeout(timer.current);
    playing.current = kind;
    setShot(kind);
    setN((v) => v + 1);
    timer.current = setTimeout(() => ((playing.current = ""), setShot("")), ms(`--bot-${kind}`, 1200));
  };
  useEffect(() => {
    if (greet) timer.current = setTimeout(() => ((playing.current = ""), setShot("")), ms("--bot-hello", 1600));
    const stop = watchPointer();
    return () => (clearTimeout(timer.current), stop());
  }, []);
  useEffect(() => {
    const was = prev.current;
    prev.current = st;
    if (cue && cue.at && cue.at !== lastCue.current) {
      lastCue.current = cue.at;
      play(cue.kind);
    } else if (BUSY.has(was) && !BUSY.has(st) && st !== "waiting" && playing.current !== "error") play("done");
  }, [st, cue && cue.at]);

  const poke = () => {
    const now = performance.now();
    pokes.current = pokes.current.filter((t) => now - t < 1800).concat(now);
    const k = pokes.current.length;
    if (k >= 6) pokes.current = [];
    play(k >= 6 ? "dizzy" : k >= 3 ? "love" : "poke");
  };

  const eyes = (shot && SHOT_EYES[shot]) || STATE_EYES[st] || "open";
  const p = (pt) => `${pt[0]}% ${pt[1]}%`;
  const style = {
    "--s": size + "px",
    "--bf-sprite": `url("${spriteUrl(key, size * (window.devicePixelRatio || 1))}")`,
    "--o-el": p(c.earL),
    "--o-er": p(c.earR),
    "--o-top": p(c.top),
    "--tip-x": c.tip[0] + "%",
    "--tip-y": c.tip[1] + "%",
    "--bf-seed": ((hash(String((bot && bot.id) || id || key)) % 1000) / 1000).toFixed(3),
  };
  const cls = `bot-face${lively ? " lively" : ""}${pokeable ? " pokeable" : ""}${neutral ? " neutral" : ""}${size < FX_MIN ? " sm" : ""}`;
  const part = (k) => html`<i class=${`bf-part bf-${k}`}><i class="bf-pin"><b class="bf-img"></b><b class="bf-glow"></b></i></i>`;
  return html`<div class=${cls} style=${style} data-char=${key} data-state=${st} data-shot=${shot || undefined} data-eyes=${eyes}
      aria-hidden="true" onClick=${pokeable ? poke : undefined}>
    ${lively && html`<i class="bf-shadow"></i>`}
    <i class="bf-aura"></i>
    <div class="bf-body">
      <div class="bf-shot" key=${n}>
        <div class="bf-look">
          ${part("ear-l")}${part("ear-r")}${part("top")}
          <i class="bf-part bf-head"><b class="bf-img"></b><b class="bf-glow"></b></i>
          ${c.lens && c.lens.slice(0, 2).map((l) => html`<i class="bf-lens" style=${{ left: l[0] + "%", top: l[1] + "%", "--lens": c.lens[2] * 2 + "%" }}></i>`)}
          ${c.eyes.map((e) => html`<i class="bf-blush" style=${{ left: (e[0] + (e[0] < 50 ? -5.6 : 5.6)).toFixed(2) + "%", top: (e[1] + 6.2).toFixed(2) + "%" }}></i>`)}
          <svg class="bf-eyes" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <g class="bf-gaze"><g class="bf-glance">
              ${c.eyes.map((e, i) => html`<g transform=${`translate(${e[0]} ${e[1]})${i ? " scale(-1 1)" : ""}`}><g class="bf-lid">${eyeShapes(c.r)}</g></g>`)}
            </g></g>
          </svg>
          ${size >= FX_MIN && key === "blue" && BUSY.has(st) && html`<span class="fx fx-rings"><i></i><i></i><i></i></span>`}
        </div>
        ${size >= FX_MIN && html`<${Fx} char=${key} state=${st} shot=${shot} />`}
      </div>
    </div>
  </div>`;
}

/** 选角色（单选）：基础角色一组，领域专家一组，每行 6 个。value 为空时高亮 fallback（当前由 id 决定的那个） */
export function AvatarPicker({ value, fallback, onChange, size = 44, label = t("avatar.label") }) {
  const cur = value || fallback;
  const opt = (k) => {
    const c = charText(k);
    return html`<button type="button" key=${k} class=${`avatar-opt${k === cur ? " on" : ""}`} role="radio" aria-checked=${k === cur}
        title=${`${c.name} · ${c.about}`} onClick=${() => k !== cur && onChange(k)}>
      <${BotAvatar} char=${k} size=${size} state=${k === cur ? "listening" : "idle"} />
      <span class="avatar-name">${c.name}</span>
      ${c.field && html`<span class="avatar-field">${c.field}</span>`}
    </button>`;
  };
  return html`<div class="avatar-picker" role="radiogroup" aria-label=${label}>
    <div class="avatar-group">${BASE_KEYS.map(opt)}</div>
    <div class="t-label">${t("avatar.groups.expert")}</div>
    <div class="avatar-group">${EXPERT_KEYS.map(opt)}</div>
  </div>`;
}

/** AnyModelBot 自己的标志：一个 m 字形的折线 */
export function AppMark({ size = 32 }) {
  return html`<div class="app-mark" style=${{ width: size + "px", height: size + "px" }} aria-hidden="true">
    <svg viewBox="0 0 18 18" fill="none"><path d="M4 12.5V5.5L9 10l5-4.5v7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
  </div>`;
}
