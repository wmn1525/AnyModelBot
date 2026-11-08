// 专属界面容器：主区是 Bot 的界面（沙箱 iframe），底部一行输入框，最新回复显示在输入框上方；
// 完整对话和 Bot 信息在右边一列。还没有实例时界面显示示例数据：不创建实例、不装技能、不起进程，第一次发消息才创建。
import { useEffect, useRef, useState } from "preact/hooks";
import { html, Button, IconButton, Notice, Spinner } from "../components/ui.js";
import { BotAvatar } from "../components/avatar.js";
import { ChatScreen, PromptCard } from "./chat.js";
import { api, streamChat, watchApp } from "../lib/api.js";
import { attachBridge, currentEnv, pickFiles, safeExternalUrl, watchEnv } from "../lib/bot-bridge.js";
import { markCatalogSeen, tr } from "../lib/catalog.js";
import { guide, markSeen } from "../lib/guide.js";
import { confirmSheet, toast } from "../lib/store.js";
import { t, useLang } from "../lib/i18n.js";

const errorText = (e) => {
  const key = `botapp.errors.${e?.data?.code || "catalog_failed"}`;
  const s = t(key);
  return s === key ? t("botapp.errors.catalog_failed") : s;
};

/** Bot 信息：三行说明、用到的技能（作者和许可证，链回原页面）、需要的权限 */
function BotInfo({ entry, lang, onSettings }) {
  if (!entry) return null;
  return html`<div class="botapp-info">
    <section><h3 class="t-label">${t("botapp.info.what")}</h3><ul>${(tr(entry.about, lang) || []).map((x) => html`<li>${x}</li>`)}</ul></section>
    ${entry.skills.length > 0 && html`<section><h3 class="t-label">${t("botapp.info.skills")}</h3>
      <ul class="botapp-skills">${entry.skills.map((s) => html`<li><a href=${s.url} target="_blank" rel="noopener noreferrer">${s.name}</a><span class="t-meta">${s.author} · ${s.license}</span></li>`)}</ul></section>`}
    <section><h3 class="t-label">${t("botapp.info.perms")}</h3><ul>${entry.permissions.map((p) => html`<li>${t(`botapp.perm.${p}`)}</li>`)}</ul></section>
    ${onSettings && html`<${Button} onClick=${onSettings}>${t("botapp.info.settings")}<//>`}
  </div>`;
}

export function BotAppScreen({ catalogId, bot, onInstalled, onBotUpdated, onOpenBotSettings, onOpenSettings, chatProps }) {
  const lang = useLang();
  const [entry, setEntry] = useState(null);
  const [base, setBase] = useState("");
  const [loadErr, setLoadErr] = useState("");
  const [uiFailed, setUiFailed] = useState(false);
  const [messages, setMessages] = useState(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState("");
  const [replyOpen, setReplyOpen] = useState(false);
  const [side, setSide] = useState(null); // "chat" | "info" | null
  const [prompts, setPrompts] = useState([]); // 这一轮里 Bot 在等用户确认的事（权限、提问）
  const [used, setUsed] = useState(!!bot);
  const [desktop, setDesktop] = useState(false);
  const frame = useRef(null);
  const bridge = useRef(null);
  const urlConfirming = useRef(false);
  // 桥接的回调要读到最新的状态
  const live = useRef(/** @type {any} */ ({}));
  live.current = { bot, entry, messages, used, desktop };

  useEffect(() => {
    let alive = true;
    api("/status").then((s) => alive && setDesktop(!!s?.desktop)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // 打开：有实例读实例，没有就只准备界面
  useEffect(() => {
    let alive = true;
    markCatalogSeen(catalogId);
    (async () => {
      try {
        if (bot) {
          const d = await api(`/bots/${encodeURIComponent(bot.id)}/app`);
          if (!alive) return;
          setEntry(d.bot || null);
          setBase(d.base);
          if (d.ref.removed?.security || !d.base) setUiFailed(true);
          // 有新版本就在打开时换上；正在工作或用户改过人设的由后端跳过
          if (d.updateAvailable && !d.bot?.isDev) {
            const r = await api(`/bots/${encodeURIComponent(bot.id)}/app/update`, { method: "POST", body: {} }).catch(() => null);
            if (r?.result === "updated" && alive) {
              const n = await api(`/bots/${encodeURIComponent(bot.id)}/app`);
              setBase(n.base);
              onBotUpdated?.();
            }
          }
        } else {
          const d = await api(`/catalog/${encodeURIComponent(catalogId)}/preview`, { method: "POST", body: {} });
          if (!alive) return;
          setEntry(d.bot);
          setBase(d.base);
        }
      } catch (e) {
        if (alive) setLoadErr(errorText(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [catalogId]);

  // 界面文案（ui/locales/<语言>.json）：缺了退回 en
  useEffect(() => {
    if (!base) return;
    let alive = true;
    const read = (l) => fetch(`${base}locales/${l}.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    Promise.all([read("en"), read(lang)]).then(([en, cur]) => alive && setMessages({ ...en, ...cur }));
    return () => {
      alive = false;
    };
  }, [base, lang]);

  const envOf = () => {
    const { bot: b, entry: e, messages: m, desktop: d } = live.current;
    return { ...currentEnv(), sample: !b, desktop: !!d, messages: m || {}, bot: { id: b?.id || null, name: b?.name || tr(e?.name, lang) || "", avatar: e?.avatar || "" } };
  };

  /** 第一次发消息才创建实例 */
  const ensureInstance = async () => {
    if (live.current.bot) return live.current.bot;
    const d = await api(`/catalog/${encodeURIComponent(catalogId)}/install`, { method: "POST", body: {} });
    live.current.bot = d.bot;
    onInstalled?.(d.bot);
    if (guide.get().trim) markSeen("first-bot");
    return d.bot;
  };

  const send = async (text) => {
    const msg = String(text || "").trim();
    if (!msg || busy) return;
    setBusy(true);
    setReply("");
    setReplyOpen(false);
    setUsed(true);
    bridge.current?.post("turn", { busy: true });
    try {
      const b = await ensureInstance();
      bridge.current?.post("env", envOf());
      let last = "";
      await streamChat(b.id, msg, {
        text: (d) => {
          if (d?.text) {
            last = d.text;
            setReply(last);
          }
        },
        done: (d) => {
          if (d?.text) setReply(d.text);
        },
        error: (d) => setReply(d?.message || t("botapp.errors.catalog_failed")),
        // 第一次用某项权限、Bot 提问：用现有的审批卡片，就显示在输入框上方
        prompt: (d) => d?.requestId && setPrompts((l) => (l.some((x) => x.requestId === d.requestId) ? l : [...l, d])),
      });
    } catch (e) {
      setReply(errorText(e));
    } finally {
      setBusy(false);
      setPrompts([]);
      bridge.current?.post("turn", { busy: false });
    }
  };

  const stop = () => {
    const b = live.current.bot;
    if (b) return api(`/conversations/${encodeURIComponent(`${b.id}:web:console`)}/stop`, { method: "POST", body: {} });
  };

  // 接上桥接
  useEffect(() => {
    const el = frame.current;
    if (!el || !base || uiFailed) return;
    const fileApi = (path) => {
      const b = live.current.bot;
      const q = `file?path=${encodeURIComponent(path)}`;
      return api(b ? `/bots/${encodeURIComponent(b.id)}/app/${q}` : `/catalog/${encodeURIComponent(catalogId)}/${q}`);
    };
    const mediaHandles = new Set();
    const mediaAbort = new AbortController();
    let loadingMedia = 0;
    let mediaSeq = 0;
    const br = attachBridge(el, {
      init: () => envOf(),
      readFile: ({ path }) => fileApi(path),
      readImage: ({ path }) => {
        const b = live.current.bot;
        if (!b) throw new Error("no_instance");
        return api(`/bots/${encodeURIComponent(b.id)}/app/image?path=${encodeURIComponent(path)}`);
      },
      readMedia: async ({ path }) => {
        const b = live.current.bot;
        if (!b) throw new Error("no_instance");
        if (mediaHandles.size + loadingMedia >= 4) throw new Error("media_preview_limit");
        loadingMedia++;
        try {
          const r = await fetch(`/amb/api/bots/${encodeURIComponent(b.id)}/app/media?path=${encodeURIComponent(path)}`, { signal: mediaAbort.signal });
          if (!r.ok) throw new Error("media_not_found");
          const blob = await r.blob();
          if (mediaAbort.signal.aborted) throw new Error("media_preview_closed");
          // Blob URLs from this origin cannot be fetched by an opaque sandbox.
          // Structured-clone the Blob; kit.js creates its URL inside the iframe.
          const handle = String(++mediaSeq);
          mediaHandles.add(handle);
          return { blob, handle, size: blob.size };
        } finally {
          loadingMedia--;
        }
      },
      releaseMedia: ({ handle }) => {
        mediaHandles.delete(handle);
        return true;
      },
      // 只响应用户刚点过的操作：界面不能自己打开文件（点击的用户激活会传到父页面）
      openFile: async ({ path, reveal }) => {
        const b = live.current.bot;
        if (!b) throw new Error("no_instance");
        if (navigator.userActivation && !navigator.userActivation.isActive) throw new Error("needs_user_gesture");
        const id = encodeURIComponent(b.id);
        if (live.current.desktop) return api(`/bots/${id}/app/open`, { method: "POST", body: { path, reveal: !!reveal } });
        window.open(`/amb/api/bots/${id}/app/download?path=${encodeURIComponent(path)}`, "_blank", "noopener");
        return { ok: true };
      },
      // 外部链接：地址可能来自网页内容，打开前让用户看清楚。同一时间只有一个确认框，界面刷不出一串弹窗
      openUrl: async ({ url }) => {
        const safe = safeExternalUrl(url);
        if (!safe) throw new Error("invalid_url");
        if (urlConfirming.current) return false;
        urlConfirming.current = true;
        try {
          const ok = await confirmSheet({ title: t("botapp.app.openUrlTitle"), body: safe, confirmLabel: t("botapp.app.openUrlConfirm") });
          if (ok) window.open(safe, "_blank", "noopener,noreferrer");
          return !!ok;
        } finally {
          urlConfirming.current = false;
        }
      },
      send: ({ text, action }) => {
        // 界面上的操作以用户的身份发给 Bot（约定在 botkit/app-skill.ts）
        const line = action ? `[ui-action] ${JSON.stringify(action)}${text ? `\n${text}` : ""}` : text;
        void send(line);
        return true;
      },
      stop,
      subscribe: () => true,
      pickFile: async (opts) => {
        const picked = await pickFiles(opts);
        if (!picked.length) return [];
        const b = await ensureInstance();
        return Promise.all(picked.map(async (f) => ({ name: f.name, size: f.size, ...(await api(`/bots/${encodeURIComponent(b.id)}/app/inbox`, { method: "POST", body: { name: f.name, base64: f.base64 } })) })));
      },
      openChannels: () => onOpenSettings?.("connections"),
      reportError: ({ message }) => {
        console.error("bot ui error", catalogId, message);
        setUiFailed(true);
      },
      rendered: () => true,
    });
    bridge.current = br;
    const offEnv = watchEnv(() => br.post("env", envOf()));
    return () => {
      br.close();
      offEnv();
      bridge.current = null;
      mediaAbort.abort();
      mediaHandles.clear();
    };
  }, [base, uiFailed]);

  // 文案读到之后、知道是不是桌面版之后再告诉界面一次
  useEffect(() => {
    if (messages) bridge.current?.post("env", envOf());
  }, [messages, desktop]);

  // app/ 下的文件变了（Bot 改的，包括微信里改的）：转告界面
  const botId = bot?.id;
  useEffect(() => {
    if (!botId) return;
    const ac = new AbortController();
    watchApp(botId, { file: (d) => bridge.current?.post("file", d) }, ac.signal).catch(() => {});
    return () => ac.abort();
  }, [botId]);

  // 第一次真正用完离开时说一句（全局只说一次）
  useEffect(
    () => () => {
      if (live.current.used && live.current.bot && !guide.get().seen.includes("botapp-kept")) {
        markSeen("botapp-kept");
        toast(t("botapp.tip.kept", { name: live.current.bot.name }));
      }
    },
    [],
  );

  const starters = (entry && tr(entry.starters, lang)) || [];
  const name = bot?.name || tr(entry?.name, lang) || "";
  const removed = bot?.app?.removed;
  const onKey = (e) => {
    if (e.isComposing || e.keyCode === 229 || e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    const v = draft;
    setDraft("");
    void send(v);
  };

  return html`<div class=${`botapp${side ? " with-side" : ""}`} data-screen="bot-app">
    <div class="botapp-main">
      <header class="chat-head">
        <span class="head-bot static">${entry && html`<${BotAvatar} bot=${bot} char=${bot ? undefined : entry.avatar} size=${22} />`}<span class="name">${name}</span></span>
        ${!bot && entry && html`<span class="botapp-sample">${t("botapp.app.sample")}</span>`}
        <span class="grow"></span>
        ${bot && html`<${IconButton} icon="chat" iconSize="md" label=${t("botapp.app.conversation")} on=${side === "chat"} onClick=${() => setSide((s) => (s === "chat" ? null : "chat"))} />`}
        <${IconButton} icon="info" iconSize="md" label=${t("botapp.app.info")} on=${side === "info"} onClick=${() => setSide((s) => (s === "info" ? null : "info"))} />
      </header>
      ${removed && html`<${Notice} tone="amber">${t(removed.security ? "botapp.app.removedSecurity" : "botapp.app.removed")}<//>`}
      ${uiFailed && !removed && html`<${Notice} tone="amber">${t("botapp.app.uiFailed")}<//>`}
      ${loadErr && html`<${Notice} tone="red">${loadErr}<//>`}
      <div class="botapp-stage">
        ${uiFailed && bot
          ? html`<${ChatScreen} key=${bot.id} bot=${bot} ...${chatProps} infoOpen=${false} onToggleInfo=${() => setSide("info")} />`
          : base && !uiFailed && html`<iframe ref=${frame} class="botapp-frame" title=${name} src=${`${base}index.html`} sandbox="allow-scripts allow-forms"></iframe>`}
        ${!base && !loadErr && !uiFailed && html`<div class="botapp-loading"><${Spinner} /></div>`}
      </div>
      ${!(uiFailed && bot) && html`<div class="composer-dock botapp-dock">
        ${reply && html`<button type="button" class=${`botapp-reply${replyOpen ? " open" : ""}`} aria-expanded=${replyOpen} onClick=${() => setReplyOpen((v) => !v)}>
          <${BotAvatar} bot=${bot} char=${bot ? undefined : entry?.avatar} size=${22} /><span class="text">${reply}</span>
        </button>`}
        ${prompts.map((p) => html`<${PromptCard} key=${p.requestId} requestId=${p.requestId} fallback=${p.prompt} />`)}
        ${!used && starters.length > 0 && html`<div class="chips botapp-starters">${starters.map((s) => html`<button type="button" class="chip" key=${s} disabled=${busy} onClick=${() => send(s)}>${s}</button>`)}</div>`}
        <div class="composer">
          <textarea rows="1" placeholder=${t("botapp.app.placeholder")} aria-label=${t("botapp.app.placeholder")} value=${draft} onInput=${(e) => setDraft(e.target.value)} onKeyDown=${onKey}></textarea>
          <div class="composer-bar"><span class="grow"></span>
            ${busy
              ? html`<${IconButton} icon="stop" class="send" label=${t("botapp.app.stop")} onClick=${stop} />`
              : html`<${IconButton} icon="up" class="send" label=${t("botapp.app.send")} disabled=${!draft.trim()} onClick=${() => { const v = draft; setDraft(""); void send(v); }} />`}
          </div>
        </div>
      </div>`}
    </div>
    ${side === "chat" && bot && html`<aside class="botapp-side"><${ChatScreen} key=${bot.id} bot=${bot} ...${chatProps} infoOpen=${false} onToggleInfo=${() => setSide("info")} /></aside>`}
    ${side === "info" && html`<aside class="botapp-side"><${BotInfo} entry=${entry} lang=${lang} onSettings=${bot ? () => onOpenBotSettings(bot.id) : null} /></aside>`}
  </div>`;
}
