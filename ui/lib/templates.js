import catalog from "../data/bot-templates.json" with { type: "json" };
import { t, getLang, has } from "./i18n.js";
import { tiers, levelOf } from "./frontier.js";
import { normModel, sameModel } from "./models.js";
export const TEMPLATE_META = catalog;
export const templateRequestId = () => globalThis.crypto?.randomUUID?.() || `template-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
export const TEMPLATE_ALIASES = { translate: "polish", coder: "coding-partner" };
export function templateOf(id) {
  const item = catalog.find((x) => x.id === (TEMPLATE_ALIASES[id] || id));
  if (!item) return null;
  const key = `templates.roles.${item.id}`;
  const memory = []; for (let i = 0; has(`${key}.memory.${i}`); i++) memory.push(t(`${key}.memory.${i}`));
  return { ...item, name: t(`${key}.name`), desc: t(`${key}.desc`), persona: t(`${key}.persona`), sample: t(`${key}.sample`),
    memoryTitle: item.memory ? t(`${key}.memoryTitle`) : "", memoryNotes: memory, memoryHint: t(`${key}.memoryHint`),
    appIds: getLang() !== "zh-CN" && item.globalApps ? item.globalApps : item.apps,
    channelText: item.channelHint ? t(`${key}.channelHint`) : "",
    ruleTitle: item.rule ? t(`${key}.rule.title`) : "", ruleInstruction: item.rule ? t(`${key}.rule.instruction`) : "" };
}
export function availableName(raw, bots) {
  const cut = (s, n) => s.slice(0, n).replace(/[\uD800-\uDBFF]$/, "");
  const base = cut(raw.trim(), 60); const names = new Set((bots || []).map((b) => b.name));
  if (!names.has(base)) return base;
  for (let i = 2; ; i++) { const tail = ` ${i}`; const next = cut(base, 60 - tail.length) + tail; if (!names.has(next)) return next; }
}
export const templateInfo = (info, id) => info?.[normModel(id)] || info?.[normModel(id).split("/").at(-1)] || {};
export function capabilityState(template, model, info) {
  const data = templateInfo(info, model);
  const required = ["tools", "reasoning"].filter((key) => template[key]);
  if (required.some((key) => data[key] === false)) return "incompatible";
  if (required.some((key) => data[key] !== true)) return "unknown";
  return "ok";
}
/** 模板档位：0 低 / 2 中 / 4 高（对应前沿的首、中、末）。 */
export const TEMPLATE_TIERS = [0, 2, 4];
export const tierName = (tier) => (tier <= 0 ? "low" : tier <= 2 ? "medium" : "high");
const targetOf = (tier, n) => Math.floor(tier * (n - 1) / 4);

/**
 * The existing frontier has up to five stops. Templates target its low/middle/high regions.
 * 体验额度期（trial）内，模板档位高于全局默认所在档位时降到那一档；降档后这一档没有满足能力的模型就跟随全局默认。
 * 结果：tier = 实际选用的档位，downgraded = 是否降过档。
 */
export function recommendTemplate(template, models, info, strategy, defaultModel, trial = false) {
  if (!models || !info) return { model: "", reason: "unavailable" };
  const { stops, points } = tiers(models, info, strategy, defaultModel);
  if (stops.length < 3) return { model: "", reason: "unranked" };
  const nearest = (p) => stops.reduce((best, s, i) => Math.abs(s.intelligence - p.intelligence) < Math.abs(stops[best].intelligence - p.intelligence) ? i : best, 0);
  let tier = template.tier;
  if (trial && defaultModel) {
    const current = points.find((p) => sameModel(p.id, defaultModel));
    // 全局默认没有分档资料：判断不了它在哪一档，体验期内不冒险推荐更贵的档位
    if (!current) return { model: "", reason: "unranked" };
    const at = nearest(current);
    const defaultTier = [...TEMPLATE_TIERS].reverse().find((x) => targetOf(x, stops.length) <= at) ?? TEMPLATE_TIERS[0];
    if (tier > defaultTier) tier = defaultTier;
  }
  const downgraded = tier !== template.tier;
  const target = targetOf(tier, stops.length);
  const candidates = points.filter((p) => nearest(p) === target && capabilityState(template, p.id, info) === "ok");
  if (!candidates.length) return { model: "", reason: "incompatible", tier, downgraded };
  candidates.sort((a, b) => {
    const x = templateInfo(info, a.id), y = templateInfo(info, b.id);
    return (template.vision ? Number(y.vision === true) - Number(x.vision === true) : 0)
      || (template.longContext ? (y.context || 0) - (x.context || 0) : 0) || a.cost - b.cost || b.intelligence - a.intelligence || a.id.localeCompare(b.id);
  });
  return { model: candidates[0].id, reason: downgraded ? "downgraded" : "recommended", tier, downgraded, level: levelOf(target, stops.length) };
}

/** 推荐理由与下方的补充说明（只有降档后没有可用模型时才说「通常更适合」）。 */
export function recommendationText(template, rec) {
  const name = (tier) => t(`templates.levels.${tierName(tier)}`);
  const reason = rec?.reason || "unavailable";
  return {
    reason: reason === "downgraded"
      ? t("templates.model.downgraded", { actualTier: name(rec.tier), originalTier: name(template.tier) })
      : t(`templates.model.${reason}`, { level: name(template.tier) }),
    usual: reason === "incompatible" && rec.downgraded ? t("templates.usualTier", { level: name(template.tier) }) : "",
  };
}

/** 体验额度期：用 Modelflare 账号（不是企业托管、不是自己的 Key），而且新账号的上手清单还在进行中。 */
export const inTrial = (account, guideActive) => !!guideActive && account?.state === "signed_in" && !account.billedToEnterprise;
