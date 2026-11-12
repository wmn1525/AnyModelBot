/**
 * 头像角色在几处各有一份：界面（avatar.js）、精灵图、颜色、样式、服务端校验、文案。加角色时漏一处，这里会拦下。
 * 目录 Bot 的专属形象只属于一个 Bot：目录里不能有两个 Bot 长得一样。
 * 另外守住两条容易被加角色破坏的约定：老机器人的头像不能变，官网只用六个基础角色。
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BOT_AVATARS, CATALOG_AVATARS, PICKABLE_AVATARS, normalizeSettings } from "../src/agent/settings.js";
// @ts-expect-error Browser i18n is an unbundled JS module.
import * as ui from "../ui/lib/i18n.js";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const src = read("ui/components/avatar.js");
const block = (name: string) => {
  const m = src.match(new RegExp(`export const ${name} = (\\{[\\s\\S]*?\\n\\});`));
  if (!m) throw new Error(`avatar.js 里没有 ${name}`);
  return m[1];
};
const keysOf = (b: string) => [...b.matchAll(/^ {2}(\w+): \{$/gm)].map((m) => m[1]);
const base = keysOf(block("BOT_CHARS"));
const experts = keysOf(block("EXPERT_CHARS"));
const catalog = keysOf(block("CATALOG_CHARS"));
const numsOf = (s: string, re: RegExp) => {
  const m = s.match(re);
  if (!m) throw new Error(`没有找到 ${re}`);
  return m[1].split(",").map((n) => Number(n.trim())).sort((a, b) => a - b);
};
const tiers = numsOf(src, /export const SPRITE_TIERS = \[([\d, ]+)\];/);

describe("头像角色", () => {
  it("基础 6 个，专家 12 个，目录专属 4 个，服务端认的和界面一样", () => {
    expect(base).toEqual(["blue", "yellow", "green", "red", "purple", "orange"]);
    expect(experts).toHaveLength(12);
    expect(catalog).toHaveLength(4);
    expect([...PICKABLE_AVATARS]).toEqual([...base, ...experts]);
    expect([...BOT_AVATARS]).toEqual([...base, ...experts, ...catalog]);
    for (const k of [...experts, ...catalog]) expect(normalizeSettings({ avatar: k }).avatar).toBe(k);
    const owners = Object.fromEntries([...block("CATALOG_CHARS").matchAll(/^ {2}(\w+): \{\n {4}owner: "([\w-]+)",$/gm)].map((m) => [m[1], m[2]]));
    expect(owners).toEqual(CATALOG_AVATARS);
  });

  it("专属形象只给它的主人用，目录里没有两个 Bot 撞头像", () => {
    const bots = fs.readdirSync(path.join(process.cwd(), "bots")).filter((d) => fs.existsSync(path.join(process.cwd(), "bots", d, "bot.json")));
    const avatarOf = Object.fromEntries(bots.map((d) => [d, JSON.parse(read(`bots/${d}/bot.json`)).avatar as string]));
    expect(new Set(Object.values(avatarOf)).size).toBe(bots.length);
    for (const [key, owner] of Object.entries(CATALOG_AVATARS)) expect(avatarOf[owner], owner).toBe(key);
  });

  it("每个角色都有精灵图、颜色、样式和文案", () => {
    const tokens = read("ui/design/tokens/primitives.css");
    const css = read("ui/design/components/avatar.css");
    const zh = read("ui/locales/zh-CN/avatar.js");
    for (const k of [...base, ...experts, ...catalog]) {
      expect(fs.existsSync(path.join(process.cwd(), `ui/design/bots/${k}.webp`)), `${k}.webp`).toBe(true);
      for (const t of tiers) expect(fs.existsSync(path.join(process.cwd(), `ui/design/bots/${k}@${t}.webp`)), `${k}@${t}.webp`).toBe(true);
      expect(tokens).toContain(`--bot-${k}-eye:`);
      expect(tokens).toContain(`--bot-${k}-glow:`);
      expect(zh).toMatch(new RegExp(`\\b${k}: \\{ name:`));
    }
    for (const k of [...experts, ...catalog]) {
      expect(css).toContain(`.bot-face[data-char="${k}"] { --bf-eye: var(--bot-${k}-eye);`);
      expect(zh).toMatch(new RegExp(`\\b${k}: \\{ name: "[^"]+", field: "[^"]+"`));
    }
  });

  it("专家和专属形象的名字、领域、介绍和分组标题，每种语言都取得到", () => {
    for (const lang of ui.LANGS) {
      ui.setLangPref(lang);
      for (const g of ["expert", "own", "base"]) expect(ui.t(`avatar.groups.${g}`), lang).not.toBe(`avatar.groups.${g}`);
      for (const k of [...experts, ...catalog])
        for (const f of ["name", "field", "about"]) expect(ui.t(`avatar.chars.${k}.${f}`), `${lang} ${k}.${f}`).not.toBe(`avatar.chars.${k}.${f}`);
    }
    ui.setLangPref("system");
  });

  it("没选过头像的机器人只在基础角色里挑：加角色不能让老机器人换头像", () => {
    expect(src).toContain("BASE_KEYS[hash(String(bot.id || bot.name || \"?\")) % BASE_KEYS.length]");
  });

  it("官网比对的几何还是六个基础角色，只同步它们的精灵图", () => {
    const nums = block("BOT_CHARS").replace(/(name|role|pick): "[^"]*",?/g, "").match(/-?\d+(?:\.\d+)?/g) ?? [];
    const hash = crypto.createHash("sha256").update(nums.join(",")).digest("hex").slice(0, 16);
    expect(read("site/src/lib/bots.ts")).toContain(`BOT_CHARS_HASH = "${hash}"`);
    expect(read("site/scripts/sync-from-app.ts")).toContain("siteChars.has(path.parse(f).name.split(\"@\")[0])");
  });

  it("精灵图分档在生成脚本、App 和官网是同一套数，官网有每一档的 WebP 和 AVIF", () => {
    expect(tiers.length).toBeGreaterThan(0);
    expect(numsOf(read("scripts/build-bot-avatars.py"), /^TIERS = \(([\d, ]+)\)/m)).toEqual(tiers);
    expect(numsOf(read("site/src/lib/bots.ts"), /export const SPRITE_TIERS = \[([\d, ]+)\];/)).toEqual(tiers);
    for (const k of base)
      for (const t of ["", ...tiers.map((n) => `@${n}`)])
        for (const ext of ["webp", "avif"]) expect(fs.existsSync(path.join(process.cwd(), `site/public/bots/${k}${t}.${ext}`)), `${k}${t}.${ext}`).toBe(true);
  });
});
