// 官方社群：QQ 群、Telegram 群、Discord 服务器。账号菜单、设置 › 关于、故障排查从这里取（components/community.js）。
// 别和"连接"里的聊天渠道混了：那是机器人接入 Slack / Telegram / Discord，这里是用户交流群。
// 显示规则和官网一样（用户 2026-11-15 定）：界面是简体中文时 QQ 群在前，后面 Telegram、Discord；其他语言只放 Discord、Telegram。
// 官网 site/src/data/community.ts、README、CONTRIBUTING 里各有一份链接，改的时候一起改。Discord 邀请要用永不过期的。
export const QQ_GROUP = "1132903119";

export const COMMUNITY = {
  // 名字有 nameKey 的取文案（界面代码里不写中文，scripts/i18n-check.mjs 会拦），其他直接用品牌名
  qq: { id: "qq", nameKey: "settings.rows.community.qq", url: "https://qm.qq.com/q/yHN9KrvlGa", color: "#1EBAFC" },
  telegram: { id: "telegram", name: "Telegram", url: "https://t.me/+Tx6Payfzxqk2ZGVl", color: "#26A5E4" },
  discord: { id: "discord", name: "Discord", url: "https://discord.gg/umBN6wX3zJ", color: "#5865F2" },
};

/** lang 是解析后的界面语言（getLang()：zh-CN | en | …） */
export const communityFor = (lang) => (lang === "zh-CN" ? ["qq", "telegram", "discord"] : ["discord", "telegram"]).map((id) => COMMUNITY[id]);
