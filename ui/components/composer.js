// 输入框（参考 Codex 的输入框）：对话页和目录 Bot 的专属界面用的是同一个。上面是文字；下面一行左边 ＋ 菜单和文件权限，
// 右边模型和发送 / 停止；打 / 弹出命令。草稿、发送和停止由页面管（发出去以后两边显示的地方不一样）；模型和文件权限在这里读写。
import { useEffect, useRef, useState } from "preact/hooks";
import { html, Icon, Menu, Popover, Spinner, autoGrow } from "./ui.js";
import { ModelPicker, prefetchModelInfo, shortModel, sameModel } from "./model-picker.js";
import { api } from "../lib/api.js";
import { confirmSheet, createStore, failed, saved, useStore } from "../lib/store.js";
import { markDone } from "../lib/guide.js";
import { perms, confirmPermission } from "../lib/perms.js";
import { prefs } from "../lib/prefs.js";
import { t } from "../lib/i18n.js";

// 文案跟着界面语言：渲染时再取（写成函数，不在模块顶层缓存翻译）
const commands = () => [
  ["/model", t("chat.commands.model")],
  ["/new", t("chat.commands.new")],
  ["/reset", t("chat.commands.reset")],
  ["/status", t("chat.commands.status")],
  ["/stop", t("chat.commands.stop")],
  ["/tasks", t("chat.commands.tasks")],
  ["/help", t("chat.commands.help")],
];
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const MOD_ENTER = isMac ? "⌘Enter" : "Ctrl+Enter";

// 控制台对话的模型（空 = 跟着 Bot），按 Bot id 存：目录 Bot 的界面和右边的完整对话同时开着时，两个输入框显示同一个。
// 目录 Bot 还没有实例时用 catalog:<目录 id> 先记着，第一次发消息建好实例后由页面写进去
const convModels = createStore({});
export const convModelOf = (key) => convModels.get()[key] || "";
export const setConvModel = (key, model) => convModels.set((all) => ({ ...all, [key]: model || "" }));
export const useConvModel = (key) => useStore(convModels)[key] || "";

/**
 * bot：null 时是目录 Bot 的示例（还没有实例）：只能选模型，不显示 ＋ 菜单和文件权限。
 * onSend(raw)：raw 不给时发输入框里的文字。steer：回复进行中可以接着发（并进那一轮）。
 * ctl：页面拿到 { openModel, closeSlash }（出错提示里的「换个模型」、引导卡片填入句子）。
 */
export function Composer({ bot, modelKey = bot?.id, text, setText, taRef, placeholder, label, generating = false, stopping = false, sent = false, steer = false, onSend, onStop,
  models, modelsError, reloadModels, defaultModel, account, onAccount, onBotUpdated, onOpenBotSettings, showPerm = true, guide = false, ctl }) {
  const own = useRef(null);
  const ta = taRef || own;
  const plusRef = useRef(null);
  const modelRef = useRef(null);
  const permRef = useRef(null);
  const [menu, setMenu] = useState(null); // "plus" | "perm" | "model" | null
  const [perm, setPerm] = useState("");
  const [slashSel, setSlashSel] = useState(0);
  const [slashOff, setSlashOff] = useState(false);
  const { sendKey } = useStore(prefs);
  const convModel = useConvModel(modelKey);
  const botId = bot?.id;
  const openModel = () => requestAnimationFrame(() => setMenu("model"));
  if (ctl) ctl.current = { openModel, closeSlash: () => setSlashOff(true) };

  // —— 文件权限 ——
  useEffect(() => {
    setPerm("");
    if (!botId || !showPerm) return;
    let alive = true;
    api(`/bots/${encodeURIComponent(botId)}/settings`).then((d) => alive && setPerm(d.settings.permission)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [botId, showPerm]);
  const pickPerm = async (p) => {
    if (!(await confirmPermission(p))) return;
    const prev = perm;
    setPerm(p);
    try {
      const d = await api(`/bots/${encodeURIComponent(botId)}/settings`, { method: "PUT", body: { permission: p } });
      setPerm(d.settings.permission);
      saved();
    } catch (e) {
      setPerm(prev);
      failed(e);
    }
  };

  // —— 模型 ——
  const botDefault = bot?.defaultModel || "";
  const effective = convModel || botDefault || defaultModel || (models && models[0]) || "";
  // 模型资料（滑块要用）先取好，打开选择器时不用等
  useEffect(() => {
    if (models && models.length) prefetchModelInfo();
  }, [!!(models && models.length)]);
  const pickModel = async (m) => {
    try {
      if (botId) await api(`/bots/${encodeURIComponent(botId)}/chat/model`, { method: "PUT", body: { model: m } });
      setConvModel(modelKey, m);
      if (botId) {
        saved();
        markDone("model");
      }
    } catch (e) {
      failed(e);
    }
  };
  const setBotDefault = async () => {
    try {
      const r = await api(`/bots/${encodeURIComponent(botId)}`, { method: "PUT", body: { defaultModel: effective } });
      await api(`/bots/${encodeURIComponent(botId)}/chat/model`, { method: "PUT", body: { model: "" } });
      setConvModel(modelKey, "");
      onBotUpdated?.(r.bot);
      saved();
      markDone("model");
    } catch (e) {
      failed(e);
    }
  };
  const plusItems = bot && [
    { label: t("chat.menu.switchModel"), onSelect: openModel },
    { sep: true },
    { label: t("chat.menu.newConv"), note: "/new", onSelect: () => onSend("/new") },
    {
      label: t("chat.menu.reset"),
      note: "/reset",
      onSelect: async () => {
        if (await confirmSheet({ title: t("chat.reset.title"), body: t("chat.reset.body", { name: bot.name }), confirmLabel: t("chat.reset.confirm"), danger: true })) onSend("/reset");
      },
    },
    { label: t("chat.menu.status"), note: "/status", onSelect: () => onSend("/status") },
    { label: t("chat.menu.allCommands"), note: "/help", onSelect: () => onSend("/help") },
  ];

  // —— 斜杠命令菜单 ——
  const slashQuery = /^\/\S*$/.test(text) && !slashOff ? text.toLowerCase() : null;
  const slashHits = slashQuery !== null ? commands().filter(([c]) => c.startsWith(slashQuery)) : [];
  const slashOpen = slashHits.length > 0 && !(slashHits.length === 1 && slashHits[0][0] === text);
  const completeSlash = (cmd) => {
    setText(cmd === "/model" ? "/model " : cmd);
    setSlashOff(cmd === "/model");
    ta.current?.focus();
  };

  const onKey = (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (slashOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        return setSlashSel((s) => (s + 1) % slashHits.length);
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        return setSlashSel((s) => (s - 1 + slashHits.length) % slashHits.length);
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        return completeSlash(slashHits[Math.min(slashSel, slashHits.length - 1)][0]);
      }
      if (e.key === "Escape") {
        e.preventDefault();
        return setSlashOff(true);
      }
    }
    // 发送键（设置 › 常规 › 发送消息）：Enter 发送、Shift+Enter 换行；或 ⌘/Ctrl+Enter 发送、Enter 换行
    if (e.key === "Enter" && !e.shiftKey && (sendKey !== "mod" || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onSend();
    } else if (e.key === "Escape" && generating) {
      e.preventDefault();
      onStop();
    }
  };

  // 点发送 / 停止不抢输入框的焦点：光标留在原处，接着就能打下一句（键盘 Tab 过去照样能按）
  const keepFocus = (e) => e.preventDefault();
  const key = sendKey === "mod" ? MOD_ENTER : "Enter";
  const permMap = perms();
  const permChip = showPerm && bot && permMap[perm];
  return html`<div class="composer" data-guide=${guide ? "composer" : undefined}>
      <textarea ref=${ta} rows="1" placeholder=${placeholder} aria-label=${label} value=${text}
        onInput=${(e) => { setText(e.target.value); setSlashOff(false); setSlashSel(0); autoGrow(e.target); }}
        onKeyDown=${onKey} />
      <div class="composer-bar">
        ${plusItems && html`<button type="button" class="plus" ref=${plusRef} aria-label=${t("chat.menu.more")} aria-haspopup="menu" aria-expanded=${menu === "plus"} onClick=${() => setMenu(menu === "plus" ? null : "plus")}><${Icon} name="plus" size="md" /></button>`}
        ${permChip && html`<button type="button" class=${`model-chip perm ${perm}`} ref=${permRef} title=${t("chat.perm.title", { note: permChip.note })} aria-haspopup="menu" aria-expanded=${menu === "perm"}
          onClick=${() => setMenu(menu === "perm" ? null : "perm")}>
          <${Icon} name=${permChip.icon} size="sm" class="lead" /><span class="v">${permChip.label}</span><${Icon} name="chevDown" />
        </button>`}
        <span class="grow"></span>
        <button type="button" class="model-chip" ref=${modelRef} data-guide=${guide ? "model" : undefined} title=${effective ? t("chat.composer.currentModel", { model: effective }) : t("chat.composer.pickModel")} aria-haspopup="listbox" aria-expanded=${menu === "model"}
          onClick=${() => setMenu(menu === "model" ? null : "model")}>
          <span class="v">${effective ? shortModel(effective) : t("chat.composer.pickModel")}</span><${Icon} name="chevDown" />
        </button>
        ${steer && generating && text.trim() && !text.trim().startsWith("/") && !stopping
          ? html`<button type="button" class="send" aria-label=${t("chat.composer.steer")} title=${t("chat.composer.steerTitle", { key })} onMouseDown=${keepFocus} onClick=${() => onSend()}><${Icon} name="up" size="md" strong /></button>`
          : null}
        ${generating
          ? html`<button type="button" class="send stop" aria-label=${stopping ? t("chat.composer.stopping") : t("chat.composer.stop")} title=${stopping ? t("chat.composer.stopping") : t("chat.composer.stopTitle")}
              disabled=${stopping} aria-busy=${stopping} onMouseDown=${keepFocus} onClick=${onStop}>${stopping ? html`<${Spinner} />` : html`<${Icon} name="stop" size="md" />`}</button>`
          : html`<button type="button" class=${`send${sent ? " back" : ""}`} aria-label=${t("chat.composer.send")} title=${t("chat.composer.sendTitle", { key })} disabled=${!text.trim()} onMouseDown=${keepFocus} onClick=${() => onSend()}><${Icon} name="up" size="md" strong /></button>`}
      </div>
    </div>
    ${slashOpen && ta.current && html`<${Popover} anchor=${ta.current} prefer="up" width=${320} keepFocus label=${t("chat.commandsLabel")} onClose=${() => setSlashOff(true)}>
      <ul role="listbox" aria-label=${t("chat.commandsLabel")}>
        ${slashHits.map(([c, d], i) => html`<li role="option" aria-selected=${i === slashSel} class=${`explained${i === Math.min(slashSel, slashHits.length - 1) ? " sel" : ""}`}
          onPointerDown=${(e) => e.preventDefault()} onPointerMove=${() => setSlashSel(i)} onClick=${() => completeSlash(c)}>
          <span class="v">${c}</span><span class="n">${d}</span>
        </li>`)}
      </ul>
    <//>`}
    ${menu === "plus" && plusItems && html`<${Menu} anchor=${plusRef.current} prefer="up" width=${240} label=${t("chat.menu.more")} onClose=${() => setMenu(null)} items=${plusItems} />`}
    ${menu === "perm" && permChip && html`<${Menu} anchor=${permRef.current} prefer="up" width=${280} label=${t("chat.perm.menu")} onClose=${() => setMenu(null)}
      items=${[
        { group: t("chat.perm.menu") },
        ...Object.entries(permMap).map(([k, p]) => ({ label: p.label, note: p.note, icon: p.icon, danger: p.danger, cur: k === perm, onSelect: () => k !== perm && pickPerm(k) })),
        { sep: true },
        { label: t("chat.perm.more"), onSelect: () => onOpenBotSettings?.(botId, "permission") },
      ]} />`}
    ${menu === "model" && html`<${ModelPicker} anchor=${modelRef.current} prefer="up" align="right" models=${models} error=${modelsError} onRetry=${reloadModels}
      current=${convModel || botDefault || defaultModel} onPick=${pickModel} onClose=${() => setMenu(null)} account=${account} onAccount=${onAccount || (() => {})}
      reset=${{ label: t("chat.model.followBot"), note: shortModel(botDefault || defaultModel) || t("common.auto"), onSelect: () => pickModel("") }}
      foot=${bot ? { label: t("chat.model.setDefault"), disabled: !effective || sameModel(effective, botDefault), onClick: setBotDefault } : undefined} />`}`;
}
