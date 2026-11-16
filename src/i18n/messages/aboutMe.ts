// aboutMe（关于我，PRD 2026-11-15 R1–R4）：zh 与 en 的键必须一一对应。
// 用户看得到的：聊天软件里回复后面的那一行、回「撤销」后的那句、关于我页的报错。给模型看的回执不在这里（agent/manager.ts）。
import type { Catalog } from "../types.js";

export const zh = {
  addedChannel: "✓ 已记到关于我：{line}（回复「撤销」可撤回）",
  changedChannel: "✓ 已改关于我：{line}（回复「撤销」可撤回）",
  removedChannel: "✓ 已从关于我删除：{line}（回复「撤销」可撤回）",
  undone: "已撤销，关于我恢复为原来的样子",
  empty: "写一句话再保存",
  tooLong: "一句最多 300 字",
  secret: "密码、密钥、令牌、验证码不能存",
  idOrCard: "证件号、银行卡号不能存进关于我",
  missing: "这一句已经不在了",
  stale: "这一句已经改过了，这个建议不再有效",
  notUndoable: "这次变更已经不能撤销了",
} satisfies Catalog;

export const en: Catalog<typeof zh> = {
  addedChannel: "✓ Added to About me: {line} (reply \"undo\" to take it back)",
  changedChannel: "✓ Updated About me: {line} (reply \"undo\" to take it back)",
  removedChannel: "✓ Removed from About me: {line} (reply \"undo\" to take it back)",
  undone: "Undone. About me is back to how it was.",
  empty: "Write a sentence first",
  tooLong: "A line can be at most 300 characters",
  secret: "Passwords, keys, tokens and codes can't be saved",
  idOrCard: "ID and bank card numbers can't be saved in About me",
  missing: "This line is no longer there",
  stale: "This line has changed, so the suggestion no longer applies",
  notUndoable: "This change can no longer be undone",
};
