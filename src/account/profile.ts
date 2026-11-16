/**
 * Display-only account data. Missing optional identity fields never prevent sign-in.
 * name 取第一个有值的：Modelflare 昵称 → 用户自设的用户名（mf_ 开头的系统生成用户名不算）→ 完整邮箱；都没有时为空，
 * 界面显示「Modelflare 账号」和 Modelflare 标志。nameFrom 说名称是哪一种：菜单副标题、设置页「{名称} · {邮箱}」、
 * 「设置昵称 ↗」按它判断（名称本身是邮箱时邮箱只写一次；没有昵称时保留「设置昵称」）。
 */
export interface AccountProfile { name: string; email: string; avatar: string; nameFrom?: "nickname" | "username" | "email" }
const GENERATED = /^mf_[a-z0-9]+$/i;
export function accountProfile(value: Record<string, unknown>): AccountProfile {
  const text = (...keys: string[]) => keys.map((key) => typeof value[key] === "string" ? value[key].trim() : "").find(Boolean) || "";
  const rawEmail = text("email");
  const email = rawEmail.includes("@") ? rawEmail : "";
  const nickname = text("nickname", "display_name");
  // OIDC 的 name 一般就是显示名；和用户名一样，系统生成的 mf_… 不算
  const standardName = text("name");
  const username = text("username", "preferred_username");
  const custom = [standardName, username].find((x) => x && !GENERATED.test(x)) || "";
  const [name, nameFrom] = nickname ? [nickname, "nickname" as const] : custom ? [custom, "username" as const] : email ? [email, "email" as const] : ["", undefined];
  let avatar = text("avatar_url", "picture", "avatar");
  try { if (new URL(avatar).protocol !== "https:") avatar = ""; } catch { avatar = ""; }
  return { name, email, avatar, ...(nameFrom ? { nameFrom } : {}) };
}
