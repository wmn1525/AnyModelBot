// 加号菜单里的「技能与应用」：只列当前这个机器人能用的技能和应用，按「技能」「应用」两组排。点一项把「用{名称}帮我……」填进输入框
// （选中末尾的省略号，接着打字就替换它），不另做指定标签，发出去后由机器人自己判断用不用。
// 已经连上、但没分给这个机器人的应用放在「未分配给这个机器人」，可以就地分配；某一组没有可用项时写原因和入口。
// 模型不能自己用的技能（SKILL.md 写了 disable-model-invocation）不列：填一句话叫不动它。
import { useEffect, useRef, useState } from "preact/hooks";
import { html, Icon, Popover, Spinner } from "./ui.js";
import { AppMark } from "./app-mark.js";
import { api } from "../lib/api.js";
import { failed, toast, useStore } from "../lib/store.js";
import { ATTENTION, appLabel, appsStore, loadApps, setApps, stateText } from "../lib/apps.js";
import { loadBotSkills, prefillOf, useBotSkills } from "../lib/usage.js";
import { has, t, useLang } from "../lib/i18n.js";

/** 任一组超过这么多项时顶上出搜索框 */
const SEARCH_AT = 10;

const initial = (s) => [...String(s || "").replace(/^[^\p{L}\p{N}]+/u, "")][0]?.toUpperCase() || "?";
const hit = (q, ...fields) => !q || fields.some((f) => f && String(f).toLowerCase().includes(q));

/**
 * bot：当前对话的机器人；perm：它的文件权限（只读时不给写入类应用能力）。
 * onPick({ text, start, end })：把这句话放进输入框；onOpenSkills / onOpenApps：空状态的入口。
 */
export function UsablesPanel({ anchor, bot, perm, onPick, onClose, onOpenSkills, onOpenApps }) {
  const lang = useLang();
  const skills = useBotSkills(bot.id);
  const s = useStore(appsStore);
  const [settings, setSettings] = useState(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [busy, setBusy] = useState("");
  const listRef = useRef(null);
  useEffect(() => {
    loadApps();
    loadBotSkills(bot.id).catch(() => {});
    let alive = true;
    api(`/bots/${encodeURIComponent(bot.id)}/settings`).then((d) => alive && setSettings(d.settings)).catch(() => alive && setSettings({}));
    return () => {
      alive = false;
    };
  }, [bot.id]);

  // —— 技能：开着、模型能自己用的 ——
  const mySkills = (skills || []).filter((x) => x.enabled && x.modelInvocable !== false);
  // —— 应用：和机器人设置的「应用」一节同一套判断（components/bot-apps.js） ——
  const barred = !!bot.app && !(bot.app.permissions || []).includes("accounts");
  const appsSet = settings?.apps || { mode: "all", selected: [], toolsOff: {} };
  const readonly = (settings?.permission || perm) === "readonly";
  const usable = barred ? [] : s.apps.filter((v) => (v.custom ? v.enabled : v.accounts.length > 0));
  const reachable = (v) => v.access === "all" || (Array.isArray(v.access) && v.access.includes(bot.id));
  const assigned = (v) => reachable(v) && (appsSet.mode === "all" || appsSet.selected.includes(v.key));
  const off = (v) => new Set(appsSet.toolsOff?.[v.key] || []);
  // 工具全被关掉的应用等于用不了；没列出工具（连不上、还没取到清单）的照常列
  const live = (v) => !v.tools.length || v.tools.some((x) => !off(v).has(x.name));
  const myApps = usable.filter((v) => assigned(v) && live(v));
  const unassigned = usable.filter((v) => !assigned(v));
  const name = (v) => appLabel(v, s.catalog, lang);
  /** 只读时：有查询工具的照常能点（说明写成只能查询）；只有写入类工具的不能点 */
  const canRead = (v) => !v.tools.length || v.tools.some((x) => x.category === "read" && !off(v).has(x.name));
  // 说明：要处理连接的先说连接；只读时只说能做的（不展示写入类能力）；内置应用用应用页同一句，自定义连接器写连接状态和工具数
  const appDesc = (v) => {
    if (ATTENTION.includes(v.state)) return stateText(v.state, v.tools.length);
    if (readonly) return canRead(v) ? t("chat.use.readonlyDesc") : t("chat.use.readonlyNo");
    if (!v.custom && has(`apps.catalog.${v.app}.desc`)) return t(`apps.catalog.${v.app}.desc`);
    return stateText(v.state, v.tools.length);
  };

  const searching = mySkills.length > SEARCH_AT || myApps.length > SEARCH_AT;
  const needle = searching ? q.trim().toLowerCase() : "";
  const skillRows = mySkills.filter((x) => hit(needle, x.title, x.summary, x.name));
  const appRows = myApps.filter((v) => hit(needle, name(v), appDesc(v)));
  const options = [
    ...skillRows.map((x) => ({ key: `s:${x.name}`, label: x.title, run: () => onPick(prefillOf(x.title)) })),
    ...appRows.map((v) => ({ key: `a:${v.key}`, label: name(v), disabled: readonly && !canRead(v), run: () => onPick(prefillOf(name(v))) })),
  ];
  const pickable = options.filter((o) => !o.disabled);
  const cur = pickable[Math.min(sel, pickable.length - 1)];
  useEffect(() => setSel(0), [needle]);

  const onKey = (e) => {
    if (!pickable.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((i) => (Math.min(i, pickable.length - 1) + 1) % pickable.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((i) => (Math.min(i, pickable.length - 1) - 1 + pickable.length) % pickable.length);
    } else if (e.key === "Enter" && cur && !e.isComposing) {
      e.preventDefault();
      cur.run();
    }
  };
  useEffect(() => {
    if (!searching) listRef.current?.focus();
  }, [searching]);
  useEffect(() => {
    listRef.current?.querySelector("li.sel")?.scrollIntoView?.({ block: "nearest" });
  }, [cur?.key]);

  const assign = async (v) => {
    setBusy(v.key);
    try {
      // 应用那边「谁能用」没算上这个机器人：加上它（全部机器人的保持全部）
      if (!reachable(v)) setApps(await api(`/apps/app/${encodeURIComponent(v.key)}/access`, { method: "PUT", body: { bots: [...(Array.isArray(v.access) ? v.access : []), bot.id] } }));
      // 机器人这边只用选定的应用：把它勾上
      if (appsSet.mode === "selected" && !appsSet.selected.includes(v.key)) {
        const r = await api(`/bots/${encodeURIComponent(bot.id)}/settings`, { method: "PUT", body: { apps: { ...appsSet, selected: [...new Set([...appsSet.selected, v.key])] } } });
        setSettings(r.settings);
      }
      toast(t("chat.use.assigned", { app: name(v), bot: bot.name }));
    } catch (e) {
      failed(e);
    }
    setBusy("");
  };

  const row = (o, lead, title, desc, note) => {
    const i = pickable.indexOf(o);
    return html`<li key=${o.key} role="option" aria-selected=${cur === o} aria-disabled=${!!o.disabled}
      class=${`rich use-item${cur === o ? " sel" : ""}${o.disabled ? " disabled" : ""}`}
      onPointerMove=${() => !o.disabled && i >= 0 && setSel(i)} onClick=${() => !o.disabled && o.run()}>
      ${lead}
      <span class="txt"><span class="v">${title}</span>${desc && html`<span class="n">${desc}</span>`}${note && html`<span class="n use-note">${note}</span>`}</span>
    </li>`;
  };
  const empty = (title, body, action) => html`<li class="use-empty" key=${title}>
    <p class="use-empty-t">${title}</p>${body && html`<p class="use-empty-b">${body}</p>`}
    ${action && html`<button type="button" class="btn sm" onClick=${() => (onClose(), action.run())}>${action.label}</button>`}
  </li>`;

  const loadingSkills = skills === null;
  const loadingApps = !s.loaded || settings === null;
  const noSkills = !loadingSkills && !mySkills.length;
  const appsEmpty = !loadingApps && !myApps.length;
  return html`<${Popover} class="use-pop" anchor=${anchor} prefer="up" width=${320} label=${t("chat.menu.usables")} onClose=${onClose}>
    ${searching && html`<div class="search"><${Icon} name="search" size="sm" />
      <input type="search" value=${q} placeholder=${t("chat.use.search")} aria-label=${t("chat.use.search")} data-autofocus onInput=${(e) => setQ(e.target.value)} onKeyDown=${onKey} /></div>`}
    <ul role="listbox" tabindex="-1" ref=${listRef} aria-label=${t("chat.menu.usables")} onKeyDown=${onKey} style="outline:none">
      <li class="group">${t("chat.use.skills")}</li>
      ${loadingSkills && html`<li class="use-loading"><${Spinner} /></li>`}
      ${noSkills && empty(t("chat.use.noSkills"), [t("chat.use.noSkillsBody"), t("mySkills.emptyExtra")].join(/^(zh|ja)/.test(lang) ? "" : " "), { label: t("chat.use.importSkill"), run: onOpenSkills })}
      ${skillRows.map((x) => {
        const o = options.find((p) => p.key === `s:${x.name}`);
        const note = x.state === "waiting" || x.state === "loading" ? t(`chat.use.state.${x.state}`) : "";
        return row(o, html`<span class="lead use-initial" aria-hidden="true">${initial(x.title)}</span>`, x.title, x.summary, note);
      })}
      ${searching && needle && !skillRows.length && mySkills.length > 0 && html`<li class="use-none">${t("chat.use.noMatch")}</li>`}
      <li class="sep" role="separator"></li>
      <li class="group">${t("chat.use.apps")}</li>
      ${loadingApps && html`<li class="use-loading"><${Spinner} /></li>`}
      ${appsEmpty && (barred
        ? empty(t("chat.use.noApps"), t("apps.bot.barred"))
        : empty(t("chat.use.noApps"), t(usable.length ? "chat.use.noAppsAssigned" : "chat.use.noAppsBody"), { label: t("chat.use.connectApp"), run: onOpenApps }))}
      ${!loadingApps && appRows.map((v) => {
        const o = options.find((p) => p.key === `a:${v.key}`);
        const warn = ATTENTION.includes(v.state);
        return row(o, html`<span class="lead use-mark"><${AppMark} app=${v.custom ? undefined : v.app} name=${name(v)} size="sm" /></span>`, name(v), html`<span class=${warn ? "tone-warn" : ""}>${appDesc(v)}</span>`, "");
      })}
      ${searching && needle && !appRows.length && myApps.length > 0 && html`<li class="use-none">${t("chat.use.noMatch")}</li>`}
      ${!loadingApps && unassigned.length > 0 && html`
        <li class="group">${t("chat.use.unassigned")}</li>
        ${unassigned.map((v) => html`<li key=${`u:${v.key}`} class="rich use-item use-unassigned">
          <span class="lead use-mark"><${AppMark} app=${v.custom ? undefined : v.app} name=${name(v)} size="sm" /></span>
          <span class="txt"><span class="v">${name(v)}</span></span>
          <button type="button" class="btn sm" disabled=${!!busy} aria-busy=${busy === v.key} onClick=${(e) => (e.stopPropagation(), assign(v))}>${busy === v.key ? html`<${Spinner} />` : t("chat.use.assign")}</button>
        </li>`)}`}
    </ul>
  <//>`;
}
