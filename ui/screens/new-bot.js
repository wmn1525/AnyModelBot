// 新建机器人（参考 Grok Bot 的创建页）：头像角色 + 名称 + 人设，下面是从模板开始。
// 默认头像是天天。头像只管长相，选模板不会换头像：机器人做什么由人设决定。
import { useEffect, useRef, useState } from "preact/hooks";
import { html, Icon, IconButton, Button, Notice, autoGrow } from "../components/ui.js";
import { PickModel, shortModel, sameModel } from "../components/model-picker.js";
import { BotAvatar, AvatarPicker, MAIN_CHAR } from "../components/avatar.js";
import { api } from "../lib/api.js";
import { createStore, failed } from "../lib/store.js";
import { t } from "../lib/i18n.js";

/** 模板。名称、简介和人设在词典 newBot.tpl.<key> 里，读的时候按当前语言翻译（选模板时按当时的语言填进表单） */
const template = (key, icon) => ({
  key,
  icon,
  get name() {
    return t(`newBot.tpl.${key}.name`);
  },
  get desc() {
    return t(`newBot.tpl.${key}.desc`);
  },
  get prompt() {
    return t(`newBot.tpl.${key}.prompt`);
  },
});
export const TEMPLATES = [
  template("digest", "file"),
  template("support", "chat"),
  template("translate", "globe"),
  template("minutes", "clock"),
  template("writer", "compose"),
  template("coder", "code"),
];

/** 正在填的新机器人：侧栏那一行占位跟着显示头像和名字，建好后原地换成真的那一行 */
export const newBotDraft = createStore(null);

export function NewBotScreen({ first, onCreated, onCancel, models, modelsError, reloadModels, defaultModel }) {
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [tpl, setTpl] = useState("");
  const [avatar, setAvatar] = useState(MAIN_CHAR);
  const [hi, setHi] = useState(null);
  const [busy, setBusy] = useState(false);
  // 模型设置（第 16 项）：默认跟随全局默认模型；全局默认没设、或者已经下架时不悄悄换成列表里的第一个，请用户自己选
  const [model, setModel] = useState("");
  const listed = (m) => !!m && !!models?.some((x) => sameModel(x, m));
  const inherited = listed(defaultModel) ? defaultModel : "";
  const effectiveModel = model || inherited;
  // 列表读不到时：跟随默认还能建（之后在对话里出错会提示换模型）；手选的模型核对不了，先重试
  const modelAvailable = listed(effectiveModel) || (!!modelsError && !model && !!defaultModel);
  const needsPick = !!models && !modelsError && !modelAvailable;
  const nameRef = useRef(null);
  const promptRef = useRef(null);
  useEffect(() => {
    requestAnimationFrame(() => nameRef.current?.focus());
  }, []);
  useEffect(() => autoGrow(promptRef.current, 240), [prompt]);
  useEffect(() => {
    newBotDraft.set({ name: name.trim(), avatar });
  }, [name, avatar]);
  useEffect(() => () => {
    newBotDraft.set(null);
  }, []);

  const pick = (tp) => {
    setTpl(tp.key);
    setName(tp.name);
    setPrompt(tp.prompt);
    requestAnimationFrame(() => (nameRef.current?.focus(), nameRef.current?.select()));
  };
  const choose = (k) => {
    setAvatar(k);
    setHi({ kind: "hello", at: Date.now() });
  };
  const create = async (e) => {
    e.preventDefault();
    const n = name.trim();
    if (!n || busy || !modelAvailable) return;
    setBusy(true);
    try {
      const r = await api("/bots", { method: "POST", body: { name: n, systemPrompt: prompt.trim(), avatar, defaultModel: model } });
      await onCreated(r.bot);
    } catch (err) {
      failed(err);
      setBusy(false);
    }
  };

  return html`<section class="new-bot view" data-screen="new-bot">
    <header class="chat-head">
      <span class="head-bot static"><${BotAvatar} char=${avatar} size=${22} /><span class="name">${t("newBot.headName")}</span></span>
      <span class="grow"></span>
      ${onCancel && html`<${IconButton} icon="close" iconSize="md" label=${t("newBot.cancel")} onClick=${onCancel} />`}
    </header>
    <div class="new-body">
      <form class="new-form" onSubmit=${create}>
        <${BotAvatar} char=${avatar} size=${96} lively pokeable greet cue=${hi} state=${busy ? "thinking" : name.trim() ? "listening" : "idle"} />
        <h1 class="new-title">${first ? t("newBot.firstTitle") : t("newBot.title")}</h1>
        <p class="new-lead">${t("newBot.lead")}</p>
        <${AvatarPicker} value=${avatar} onChange=${choose} size=${40} />
        <label class="set-field">
          <span class="k">${t("newBot.name")}</span>
          <input class="field" ref=${nameRef} maxlength="60" placeholder=${t("newBot.namePlaceholder")} value=${name} onInput=${(e) => setName(e.target.value)}
            onKeyDown=${(e) => e.key === "Escape" && name && (e.stopPropagation(), setName(""))} />
        </label>
        <label class="set-field">
          <span class="k">${t("newBot.persona")}<span class="hint">${t("newBot.personaHint")}</span></span>
          <textarea class="field" ref=${promptRef} rows="3" placeholder=${t("newBot.personaPlaceholder")} value=${prompt}
            onInput=${(e) => { setPrompt(e.target.value); setTpl(""); }} />
        </label>
        <details class="new-model-settings" open=${needsPick || undefined}>
          <summary>${t("firstUse.modelSettings")}<span class="hint">${!models && !modelsError ? t("firstUse.modelLoading")
            : model ? shortModel(model)
            : inherited ? t("firstUse.inherit", { model: shortModel(inherited) })
            : t("firstUse.modelNone")}</span></summary>
          <p class="hint">${t("firstUse.modelHint")}</p>
          <${PickModel} value=${model} models=${models} modelsError=${modelsError} reloadModels=${reloadModels} onChange=${setModel}
            resetLabel=${inherited ? t("firstUse.inherit", { model: shortModel(inherited) }) : undefined} label=${t("firstUse.modelSettings")} />
        </details>
        ${modelsError && html`<${Notice} tone="red" action=${html`<button type="button" class="btn" onClick=${reloadModels}>${t("common.retry")}</button>`}>${t("firstUse.modelFailed")}<//>`}
        ${needsPick && html`<${Notice} tone="amber">${t(model || defaultModel ? "firstUse.modelUnavailable" : "firstUse.modelPickFirst")}<//>`}
        <p class="hint">${t("firstUse.moreCapabilities")}</p>
        <${Button} type="submit" variant="primary" size="lg" loading=${busy} disabled=${!name.trim() || !modelAvailable}>${t("newBot.create")}<//>
      </form>
      <div class="new-sugg">
        <div class="list-head">${t("newBot.fromTemplate")}</div>
        <div class="tpl-grid">
          ${TEMPLATES.map((tp) => html`<button type="button" key=${tp.key} class=${`tpl${tpl === tp.key ? " on" : ""}`} aria-pressed=${tpl === tp.key} onClick=${() => pick(tp)}>
            <span class="tpl-ic"><${Icon} name=${tp.icon} size="lg" /></span>
            <span class="tpl-name">${tp.name}</span>
            <span class="tpl-desc">${tp.desc}</span>
          </button>`)}
        </div>
      </div>
    </div>
  </section>`;
}
