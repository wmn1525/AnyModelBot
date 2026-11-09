import { playgroundSelection } from "../lib/models.js";
// 首次启动 / 退出登录后："未连接"时的整页空态：大头像 + 一句 slogan + 一个登录按钮（在系统浏览器里完成，
// 回来后自动连接）。Docker / 远程部署时浏览器登录的回调回不到这台机器，登录后要把地址栏里的链接贴回来。
// 不是向导路由。
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { html, Icon, Menu, Notice, Spinner, CopyButton, Seg } from "../components/ui.js";
import { BotAvatar, MAIN_CHAR } from "../components/avatar.js";
import { FamilyHead, PickModel, familyName, groupModels, useFamilies } from "../components/model-picker.js";
import { OfficialStart } from "../components/official-keys.js";
import { api } from "../lib/api.js";
import { failed } from "../lib/store.js";
import { LANGS, LANG_NAMES, changeLang, getLangPref, t, useLang } from "../lib/i18n.js";
import { MF_CONSOLE, MF_DOCS, MF_KEYS } from "../lib/links.js";

export { MF_CONSOLE, MF_DOCS };
/** OKINTO 线路的选项 [值, 显示名]（引导页"高级"和设置页共用；按当前语言，渲染时再调） */
export const lineOptions = () => [
  ["auto", t("common.auto")],
  ["global", t("onboarding.line.global")],
  ["cn", t("onboarding.line.cn")],
];

/** 粘贴 Key → 校验（GET /v1/models）→ 写入。onConnected(result) 收到 { models, keyTail, … } */
/** onFace(state)：给旁边的头像用——"listening"（在输入）/ "thinking"（正在校验）/ "idle" / "error"（一次性） */
export function KeyForm({ line: initialLine = "auto", onConnected, onFace, showLine = false, submitLabel = t("onboarding.key.submit") }) {
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const [line, setLine] = useState(initialLine);
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [err, setErr] = useState(null);
  const input = useRef(null);
  const btn = useRef(null);
  useEffect(() => input.current?.focus(), []);
  useEffect(() => onFace?.(busy ? "thinking" : key.trim() ? "listening" : "idle"), [busy, !!key.trim()]);

  const submit = async (lineOverride) => {
    const k = key.trim();
    if (!k || busy) return;
    const useLine = lineOverride || line;
    if (lineOverride) setLine(lineOverride);
    setBusy(true);
    setErr(null);
    setSlow(false);
    const slowTimer = setTimeout(() => setSlow(true), 4000);
    try {
      const r = await api("/modelflare", { method: "PUT", body: { apiKey: k, line: useLine } });
      setKey("");
      onConnected(r);
    } catch (e) {
      setErr({ message: e.message, code: e.data?.code, suggestLine: e.data?.suggestLine });
      onFace?.("error");
    } finally {
      clearTimeout(slowTimer);
      setBusy(false);
      setSlow(false);
    }
  };
  const paste = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) {
        setKey(text);
        setErr(null);
        requestAnimationFrame(() => btn.current?.focus());
      }
    } catch {
      input.current?.focus();
    }
  };
  const retype = () => {
    input.current?.focus();
    input.current?.select();
  };

  return html`<form class="list" onSubmit=${(e) => { e.preventDefault(); submit(); }}>
    <label class="k" for="mf-key">${t("onboarding.key.label")}</label>
    <div class="field-wrap">
      <input id="mf-key" ref=${input} class=${`field mono${err?.code === "invalid_key" ? " err" : ""}`} type=${show ? "text" : "password"}
        autocomplete="off" spellcheck="false" placeholder=${t("onboarding.key.placeholder")} value=${key} readonly=${busy}
        aria-invalid=${!!err} aria-describedby="mf-key-note"
        onInput=${(e) => { setKey(e.target.value); setErr(null); }}
        onPaste=${() => requestAnimationFrame(() => btn.current?.focus())} />
      <span class="tail">
        <button type="button" class="icon-btn" title=${t("onboarding.key.paste")} aria-label=${t("onboarding.key.paste")} onClick=${paste}><${Icon} name="paste" size="sm" /></button>
        <button type="button" class="icon-btn" title=${show ? t("onboarding.key.hide") : t("onboarding.key.show")} aria-label=${show ? t("onboarding.key.hideKey") : t("onboarding.key.showKey")} onClick=${() => setShow((v) => !v)}><${Icon} name=${show ? "eyeOff" : "eye"} size="sm" /></button>
      </span>
    </div>
    ${err && html`<div class="err-text" role="alert">
      <span>${err.message}</span>
      ${err.code === "invalid_key" && html`<button type="button" class="text" onClick=${retype}>${t("onboarding.key.retype")}</button>`}
      ${err.code === "forbidden" && html`<a href=${MF_CONSOLE} target="_blank" rel="noopener noreferrer">${t("onboarding.key.checkGroup")}</a>`}
      ${(err.code === "rate_limited" || err.code === "upstream" || err.code === "bad_response") && html`<button type="button" class="text" onClick=${() => submit()}>${t("common.retry")}</button>`}
      ${err.code === "network" && err.suggestLine === "cn" && html`<button type="button" class="text accent" onClick=${() => submit("cn")}>${t("onboarding.key.useCn")}</button>`}
    </div>`}
    <p class="hint" id="mf-key-note">${t("onboarding.key.note")}</p>
    <button type="submit" ref=${btn} class="btn primary lg block" disabled=${!key.trim() || busy}>
      ${busy ? html`<${Spinner} /> ${t("onboarding.key.connecting")}` : submitLabel}
    </button>
    ${slow && html`<p class="slow">${showLine ? t("onboarding.key.slowLine") : t("onboarding.key.slow")}</p>`}
    ${showLine && html`<details>
      <summary>${t("onboarding.key.advanced")} <${Icon} name="chevDown" size="xs" /></summary>
      <div class="row compact">
        <div class="who"><div class="name">${t("onboarding.line.label")}</div><div class="sub">${t("onboarding.line.sub")}</div></div>
        <${Seg} label=${t("onboarding.line.label")} options=${lineOptions()} value=${line} onChange=${setLine} disabled=${busy} />
      </div>
    </details>`}
  </form>`;
}

/**
 * 登录 / 注册 OKINTO：桌面版由主进程在系统浏览器里打开授权页；浏览器版在新标签页打开（被拦截时
 * 用下面的链接）。等待期间每秒读一次账户状态，登录完成后 onSignedIn(status)。
 * manual：Docker / 远程部署，回调回不到这台机器：等待时让用户把登录后地址栏里的链接贴回来。
 * explain / gift：按钮下面写上"新用户注册送 $1 Bot 额度"（首次启动的登录页、填 API Key 页里的"改用账号登录"）。
 */
export function AccountLogin({ onSignedIn, onFace, manual = false, label = t("firstUse.login"), secondary = false, explain = false, gift = false, autoStart = false }) {
  const [waiting, setWaiting] = useState(false);
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  const [link, setLink] = useState("");
  const [sending, setSending] = useState(false);
  useEffect(() => onFace?.(waiting ? "thinking" : "idle"), [waiting]);
  useEffect(() => {
    if (!waiting) return;
    let stop = false;
    const poll = setInterval(async () => {
      const s = await api("/account").catch(() => null);
      if (!s || stop) return;
      if (s.state === "signed_in") {
        stop = true;
        setWaiting(false);
        setSending(false);
        onSignedIn(s);
      } else if (s.state !== "signing_in") {
        stop = true;
        setWaiting(false);
        setSending(false);
        if (s.error) {
          setErr(s.error);
          onFace?.("error");
        }
      }
    }, 1000);
    return () => clearInterval(poll);
  }, [waiting]);
  const start = async () => {
    setErr("");
    setLink("");
    try {
      const r = await api("/account/login", { method: "POST", body: {} });
      setUrl(r.loginUrl);
      setWaiting(true);
      if (!r.opened) window.open(r.loginUrl, "_blank", "noopener");
    } catch (e) {
      setErr(e.message);
      onFace?.("error");
    }
  };
  useEffect(() => { if (autoStart) void start(); }, []);
  const cancel = () => {
    setWaiting(false);
    setSending(false);
    api("/account/login/cancel", { method: "POST", body: {} }).catch(() => {});
  };
  // 收起登录（关掉浮层、离开这一页）就是取消：这次登录作废，之后不会突然切换账户；浏览器里已经同意、
  // 正在完成登录时取消，服务端会撤销刚签发的授权和 Key。当前的 Key 和配置都不受影响
  const waitingNow = useRef(false);
  waitingNow.current = waiting;
  useEffect(() => () => {
    if (waitingNow.current) api("/account/login/cancel", { method: "POST", body: {} }).catch(() => {});
  }, []);
  // 贴回来的链接通过了就交给上面的轮询（换令牌、接网关要一会儿）；不对就留在这里重新贴
  const submitLink = async () => {
    const v = link.trim();
    if (!v || sending) return;
    setErr("");
    setSending(true);
    try {
      await api("/account/login/complete", { method: "POST", body: { link: v } });
    } catch (e) {
      setSending(false);
      setErr(e.message);
      onFace?.("error");
    }
  };
  if (waiting) {
    return html`<div class="login-cta" role="status">
      ${manual
        ? html`<form class="login-manual" onSubmit=${(e) => { e.preventDefault(); submitLink(); }}>
            <p class="hint">${t("onboarding.login.manualHint")}</p>
            <input class="field mono" autocomplete="off" spellcheck="false" placeholder="http://127.0.0.1:…/callback?code=…" aria-label=${t("onboarding.login.manualLabel")}
              value=${link} readonly=${sending} aria-invalid=${!!err} onInput=${(e) => { setLink(e.target.value); setErr(""); }} />
            ${err && html`<div class="err-text" role="alert">${err}</div>`}
            <button type="submit" class="btn primary lg block" disabled=${!link.trim() || sending}>${sending ? html`<${Spinner} /> ${t("onboarding.login.manualSending")}` : t("onboarding.login.manualSubmit")}</button>
          </form>`
        : html`<div class="login-wait"><${Spinner} /> ${t("onboarding.login.waiting")}</div>`}
      <div class="login-links">
        <a class="text" href=${url} target="_blank" rel="noopener noreferrer">${t("onboarding.login.reopen")}</a>
        <${CopyButton} text=${url} label=${t("onboarding.login.copyLink")} />
        <button type="button" class="text" onClick=${cancel}>${t("common.cancel")}</button>
      </div>
    </div>`;
  }
  return html`<div class="login-cta">
    <button type="button" class=${`btn${secondary ? "" : " primary"} lg block`} onClick=${start}>${label}</button>
    ${explain && html`<p class="hint">${t("firstUse.accountHint")}</p><p class="hint">${t("firstUse.signupHint")}</p>`}
    ${(explain || gift) && html`<p class="login-gift"><${Icon} name="spark" size="sm" />${t("firstUse.signupGift")}</p>`}
    ${err && html`<div class="err-text" role="alert">${err}</div>`}
  </div>`;
}

function ModelStep({ models, initial, onDone, auto }) {
  const [q, setQ] = useState("");
  const [cur, setCur] = useState(initial || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [selectedGroup, setSelectedGroup] = useState(playgroundSelection(initial)?.group || "");
  const availableGroups = useMemo(() => [...new Set(models.map((m) => playgroundSelection(m)?.group).filter(Boolean))].sort(), [models]);
  const groups = useMemo(() => groupModels(models.filter((m) => !selectedGroup || playgroundSelection(m)?.group === selectedGroup), q), [models, q, selectedGroup]);
  const { isOpen, toggle } = useFamilies(groups, cur);
  const folding = !q.trim() && groups.length > 1;
  // 默认的图片 / 视频模型：之前选过且还能用就沿用，否则用推荐的
  const [media, setMedia] = useState(null);
  const [img, setImg] = useState("");
  const [vid, setVid] = useState("");
  useEffect(() => {
    Promise.all([api("/media/models"), api("/settings").catch(() => ({}))])
      .then(([d, st]) => {
        setMedia(d);
        setImg(d.image.includes(st.imageModel) ? st.imageModel : d.recommended.image || "");
        setVid(d.video.includes(st.videoModel) ? st.videoModel : d.recommended.video || "");
      })
      .catch(() => setMedia({ image: [], video: [] }));
  }, []);
  const hasMedia = media && (media.image.length > 0 || media.video.length > 0);
  const start = async () => {
    setBusy(true);
    try {
      await api("/settings", {
        method: "PUT",
        body: { defaultModel: cur, ...(media && media.image.length ? { imageModel: img } : {}), ...(media && media.video.length ? { videoModel: vid } : {}) },
      });
      onDone();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };
  // 目录里有 Bot 时不让新用户先选模型：直接用默认的，进发现页
  useEffect(() => {
    if (auto && cur && models.includes(cur)) void start();
  }, []);
  if (auto && cur && models.includes(cur) && !err) return html`<div class="login-cta" role="status"><div class="login-wait"><${Spinner} /></div></div>`;
  // 首用默认模型（第 8 项）：服务端只在找到"支持工具、预占和代表性任务花费都在体验额度内"的模型时才预选；
  // 没找到时不替用户挑一个可能马上耗尽额度的，说明原因、请用户自己选
  const noPick = models.length > 0 && !(initial && models.includes(initial));
  return html`<div class="list">
    <div class="connected"><span class="dot ok"></span>${t("onboarding.model.found", { count: models.length, n: html`<span class="num">${models.length}</span>` })}</div>
    ${noPick && html`<${Notice} tone="amber">${t("firstUse.noFirstModel")}<//>`}
    ${models.length
      ? html`<p class="hint">${t("onboarding.model.hint")}</p>
        ${availableGroups.length > 0 && html`<label class="k" for="onboard-group">${t("models.group")}</label>
          <select id="onboard-group" class="field" value=${selectedGroup} onChange=${(e) => {
            const group = e.target.value; setSelectedGroup(group);
            if (group && playgroundSelection(cur)?.group !== group) setCur(models.find((m) => playgroundSelection(m)?.group === group) || "");
          }}><option value="">${t("models.allGroups")}</option>${availableGroups.map((g) => html`<option value=${g}>${g}</option>`)}</select>`}
        <input class="field" placeholder=${t("onboarding.model.filter")} value=${q} onInput=${(e) => setQ(e.target.value)} aria-label=${t("onboarding.model.filter")} />
        <div class="picklist" role="listbox" aria-label=${t("onboarding.model.default")}>
          ${groups.map(([g, ms]) => {
            const rows = ms.map(([m, label]) => html`<button type="button" role="option" aria-selected=${m === cur} class=${m === cur ? "cur" : ""} onClick=${() => setCur(m)} onDblClick=${start}>
              <span class="v">${label}</span>${m === cur && html`<span class="check"><${Icon} name="check" size="sm" /></span>`}
            </button>`);
            if (!folding) return html`${groups.length > 1 && html`<div class="group">${familyName(g)}</div>`}${rows}`;
            const open = isOpen(g);
            const hit = open ? undefined : ms.find(([m]) => m === cur);
            return html`<button type="button" class="fam" aria-expanded=${open} onClick=${() => toggle(g)}><${FamilyHead} name=${g} count=${ms.length} current=${hit?.[1]} /></button>${open && rows}`;
          })}
          ${!groups.length && html`<p class="hint">${t("onboarding.model.noMatch")}</p>`}
        </div>
        ${hasMedia && html`<div class="media-pick">
          <p class="hint">${t("onboarding.model.mediaHint")}</p>
          ${media.image.length > 0 && html`<div class="row compact">
            <div class="who"><div class="name">${t("onboarding.model.image")}</div></div>
            <${PickModel} value=${img} models=${media.image} onChange=${setImg} label=${t("onboarding.model.imageLabel")} />
          </div>`}
          ${media.video.length > 0 && html`<div class="row compact">
            <div class="who"><div class="name">${t("onboarding.model.video")}</div></div>
            <${PickModel} value=${vid} models=${media.video} onChange=${setVid} label=${t("onboarding.model.videoLabel")} />
          </div>`}
        </div>`}`
      : html`<${Notice} tone="amber" action=${html`<a class="btn" href=${MF_CONSOLE} target="_blank" rel="noopener noreferrer">${t("onboarding.model.console")}</a>`}>${t("onboarding.model.empty")}<//>`}
    ${err && html`<div class="err-text" role="alert">${err}</div>`}
    <button type="button" class="btn primary lg block" disabled=${busy || (models.length > 0 && !(cur && models.includes(cur)))} onClick=${start}>${busy ? html`<${Spinner} /> ${t("onboarding.model.saving")}` : models.length ? t("onboarding.model.start") : t("onboarding.model.startAnyway")}</button>
  </div>`;
}

/** 语言切换：在引导列顶上靠右。新用户连接前就能换语言（按钮上是当前界面语言的名字，菜单里勾的是偏好） */
function LangSwitch() {
  const lang = useLang();
  const pref = getLangPref();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const label = t("common.lang.label");
  const opts = [["system", t("common.lang.system")], ...LANGS.map((l) => [l, LANG_NAMES[l]])];
  return html`<div class="onboard-lang">
    <button type="button" class="pick" ref=${ref} aria-haspopup="menu" aria-expanded=${open} aria-label=${label} title=${label} onClick=${() => setOpen((v) => !v)}>
      <${Icon} name="globe" size="sm" class="lead" /><span class="v">${LANG_NAMES[lang]}</span><${Icon} name="chevDown" />
    </button>
    ${open && html`<${Menu} anchor=${ref.current} width=${180} align="right" label=${label} onClose=${() => setOpen(false)}
      items=${opts.map(([v, text]) => ({ label: text, cur: v === pref, onSelect: () => v !== pref && changeLang(v).catch(failed) }))} />`}
  </div>`;
}

export function Onboarding({ gateway, defaultModel, onDone, skipModelStep, existingConnection }) {
  const [models, setModels] = useState(null);
  // Docker / 远程部署：浏览器登录的回调到不了本程序，只能用 API Key
  const [useKey, setUseKey] = useState(false);
  const [canLogin, setCanLogin] = useState(false);
  const [suggested, setSuggested] = useState(defaultModel || "");
  // Docker / 远程部署：浏览器登录的回调到不了本程序，登录后要把链接贴回来
  const [manual, setManual] = useState(false);
  // 授权在网页上被撤销后会回到这里：说明原因
  const [why, setWhy] = useState("");
  useEffect(() => {
    api("/account")
      .then((a) => {
        if (a.error) setWhy(a.error);
        setCanLogin(a.loginAvailable !== false);
        if (a.loginAvailable === false) setUseKey(true);
      })
      .catch(() => {});
  }, []);
  const [face, setFace] = useState("idle");
  const [cue, setCue] = useState(null);
  // 用自己的官方 API Key，不登录 OKINTO
  const [ownKey, setOwnKey] = useState(false);
  const onFace = (f) => (f === "error" ? setCue({ kind: "error", at: Date.now() }) : setFace(f));
  // 读模型列表失败时不当成"没有模型"：给出原因和重试，不静默换模型
  const [modelsErr, setModelsErr] = useState("");
  const loadModels = () => {
    setModelsErr("");
    return Promise.all([api("/models"), api("/settings")])
      .then(([d, st]) => {
        if (d.error && !(d.models || []).length) throw new Error(d.error);
        setSuggested(st.defaultModel || "");
        setModels(d.models || []);
      })
      .catch((e) => setModelsErr(e.message || t("common.error")));
  };
  return html`<main class="onboard" data-screen="onboarding">
    <div class="onboard-col">
      <${LangSwitch} />
      <div class="onboard-hero">
        <${BotAvatar} char=${MAIN_CHAR} size=${models === null ? 168 : 88} state=${face} cue=${cue} lively pokeable greet />
        <h1>${t("onboarding.slogan")}</h1>
      </div>
      ${gateway && gateway.mode === "managed" && gateway.state === "failed" && html`<${Notice} tone="red">${t("onboarding.gatewayFailed", { error: gateway.lastError || t("onboarding.unknownReason") })}<//>`}
      ${why && models === null && !modelsErr && html`<${Notice} tone="amber">${why}<//>`}
      ${modelsErr && models === null && html`<${Notice} tone="red" action=${html`<button type="button" class="btn" onClick=${loadModels}>${t("common.retry")}</button>`}>${t("firstUse.modelsLoadFailed", { error: modelsErr })}<//>`}
      ${modelsErr && models === null ? null : models !== null
        ? html`<${ModelStep} models=${models} initial=${suggested} onDone=${onDone} auto=${skipModelStep} />`
        : ownKey
          ? html`<${OfficialStart} onConnected=${loadModels} onBack=${() => setOwnKey(false)} />`
          : useKey
          ? html`<${KeyForm} line=${gateway?.line || "auto"} onFace=${onFace} onConnected=${(r) => (setFace("idle"), setModels(r.models || []))} />
            <div class="links">
              ${canLogin && html`<button type="button" class="text" onClick=${() => setUseKey(false)}>${t("onboarding.login.label")}</button>`}
              <span>${t("onboarding.keyOnly")}</span>
              <a href=${MF_KEYS} target="_blank" rel="noopener noreferrer">${t("onboarding.createKey")}</a>
            </div>`
          : html`<${AccountLogin} onFace=${onFace} onSignedIn=${loadModels} />
            <p class="hint">${t("onboarding.login.hint")}</p>
            <div class="links"><button type="button" class="text" onClick=${() => setUseKey(true)}>${t("onboarding.useKey")}</button></div>`}
      ${models === null && !ownKey && html`<div class="login-links"><button type="button" class="text" onClick=${() => setOwnKey(true)}>${t("official.useOwn")}</button></div>`}
      ${existingConnection && models === null && html`<button type="button" class="text" onClick=${async () => { await api("/account/continue", { method: "POST", body: {} }); onDone(); }}>${t("firstUse.connectionContinue")}</button>`}
    </div>
  </main>`;
}
