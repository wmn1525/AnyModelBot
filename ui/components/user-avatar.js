// 用户头像：有 Modelflare 头像就显示（圆形裁切），打不开时换成首字；没有头像时名称第一个字放在纯色圆底上
// （色板沿用 Modelflare web/default/src/lib/avatar.ts 的 12 色，按账号稳定选色）；名称是「Modelflare 账号」时用 Modelflare 标志。
import { useEffect, useState } from "preact/hooks";
import { html } from "./ui.js";
import { t } from "../lib/i18n.js";

/** 同一账号固定一种底色：key 用账号的稳定标识（没有时退回邮箱、名称） */
export function userAvatarTone(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return { "--user-avatar-from": `var(--user-avatar-tone-${(hash % 12) + 1})` };
}

/**
 * 左下角账户行、账户菜单顶部、设置 › 模型的账户行用的同一份身份：
 * name：昵称 → 自设用户名 → 完整邮箱 → 「Modelflare 账号」（服务端 src/account/profile.ts 已按这个顺序取好）；
 * sub（只在菜单顶部）：名称是昵称或用户名且有邮箱时是完整邮箱，否则「Modelflare 账号」；
 * logo：没有名称时头像用 Modelflare 标志。没登录或用自己的 API Key 时是「我的账号」「本机用户」。
 */
export function accountIdentity(account) {
  if (account?.state !== "signed_in") return { signedIn: false, real: false, name: t("firstUse.myAccount"), sub: t("sidebar.localUser"), email: "", avatar: "", logo: false, key: "" };
  const real = account.name?.trim() || "";
  const email = account.email?.trim() || "";
  const name = real || t("welcome.accountFallback");
  // 名称本身就是邮箱时不再重复写邮箱（旧版本缓存的资料没有 nameFrom，按内容比）
  const nameIsEmail = account.nameFrom === "email" || (!!email && real === email);
  const sub = real && email && !nameIsEmail ? email : t("welcome.accountFallback");
  return { signedIn: true, real: !!real, name, sub, email, nameIsEmail, avatar: account.avatar || "", logo: !real, key: account.avatarKey || email || real };
}

/** 相邻的账户名称提供可访问文本，头像本身只负责呈现。tone：选色用的稳定标识（缺省用 name） */
export function UserAvatar({ name = "", tone, class: cls = "", src = "", fallback = false, loading = false }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  if (loading) return html`<span class=${`user-avatar loading ${cls}`} aria-hidden="true"></span>`;
  const img = src && !broken;
  const logo = !img && fallback;
  return html`<span class=${`user-avatar${logo ? " logo" : ""} ${cls}`} style=${userAvatarTone(tone || name)} aria-hidden="true">
    ${img ? html`<img src=${src} alt="" referrerpolicy="no-referrer" onError=${() => setBroken(true)} />`
      : logo ? html`<img src="/amb/static/assets/favicon-64.png" alt="" />` : [...name.trim()][0]?.toUpperCase() || "?"}</span>`;
}
