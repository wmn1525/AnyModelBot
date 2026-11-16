// 官方社群：QQ 群、Telegram 群、Discord 服务器。页脚、导航（图标菜单和手机抽屉）、首页 FAQ、收尾横幅和公告条都从这里取。
// 别和 data/channels*.ts 混了：那是机器人能接入的聊天渠道（在 Slack / Telegram / Discord 里和机器人聊），这里是用户交流群。
// 显示哪些（用户 2026-11-15 定）：中文站 QQ 群在前，后面是 Telegram、Discord；其他语言只放 Discord、Telegram，不放 QQ。
// 链接只改这里。README、CONTRIBUTING（各 7 种语言）、.github/ISSUE_TEMPLATE/config.yml 和 App（ui/lib/community.js）里各有一份，改的时候一起改。
// Discord 邀请要用永不过期的（服务器设置 → 邀请 → 过期时间选"永不"），默认邀请 7–30 天就失效。
import type { Lang } from "../i18n/locales";

export type CommunityId = "qq" | "telegram" | "discord";
export interface CommunityLink {
  id: CommunityId;
  /** 显示的名字；QQ 只出现在中文站，所以直接写"QQ 群" */
  name: string;
  url: string;
  /** 品牌色：平时图标是灰的，指到时才换成它 */
  color: string;
}

export const QQ_GROUP = "1132903119";

export const COMMUNITY: Record<CommunityId, CommunityLink> = {
  qq: { id: "qq", name: "QQ 群", url: "https://qm.qq.com/q/yHN9KrvlGa", color: "#1EBAFC" },
  telegram: { id: "telegram", name: "Telegram", url: "https://t.me/+Tx6Payfzxqk2ZGVl", color: "#26A5E4" },
  discord: { id: "discord", name: "Discord", url: "https://discord.gg/umBN6wX3zJ", color: "#5865F2" },
};

const ORDER: Record<"zh" | "other", CommunityId[]> = { zh: ["qq", "telegram", "discord"], other: ["discord", "telegram"] };
export const communityFor = (lang: Lang): CommunityLink[] => ORDER[lang === "zh" ? "zh" : "other"].map((id) => COMMUNITY[id]);

/**
 * QQ 群二维码（内容就是上面的加群链接，QQ 扫了直接进群页）：29 × 29 个模块，不含留白，描边画法（每行一笔 h 线段）。
 * 换了加群链接要重新生成：在仓库根目录跑
 *   node -e 'require("qrcode").toString("<链接>",{type:"svg",margin:0,errorCorrectionLevel:"M"},(e,s)=>console.log(s))'
 * 把输出里第二个 path 的 d 和 viewBox 的边长抄过来。
 */
export const QQ_QR = { size: 29, d: "M0 0.5h7m6 0h3m1 0h2m1 0h1m1 0h7M0 1.5h1m5 0h1m2 0h9m4 0h1m5 0h1M0 2.5h1m1 0h3m1 0h1m1 0h1m3 0h2m1 0h1m2 0h1m3 0h1m1 0h3m1 0h1M0 3.5h1m1 0h3m1 0h1m1 0h1m2 0h1m2 0h2m1 0h3m2 0h1m1 0h3m1 0h1M0 4.5h1m1 0h3m1 0h1m1 0h2m2 0h1m2 0h3m2 0h1m1 0h1m1 0h3m1 0h1M0 5.5h1m5 0h1m1 0h1m1 0h2m6 0h1m1 0h1m1 0h1m5 0h1M0 6.5h7m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h7M8 7.5h4m2 0h1m1 0h1M0 8.5h1m1 0h5m2 0h1m6 0h1m2 0h2m1 0h5M0 9.5h1m1 0h1m1 0h2m3 0h1m1 0h5m1 0h4m1 0h3m3 0h1M2 10.5h2m2 0h1m1 0h1m2 0h1m1 0h6m1 0h2m1 0h2M0 11.5h3m1 0h2m1 0h1m2 0h1m1 0h2m1 0h1m3 0h2m3 0h2m1 0h1M0 12.5h4m2 0h3m1 0h3m1 0h2m1 0h1m1 0h1m1 0h1m1 0h1m1 0h2M0 13.5h1m2 0h3m2 0h1m2 0h1m3 0h2m2 0h1m1 0h4m3 0h1M0 14.5h1m5 0h1m1 0h1m1 0h1m6 0h2m1 0h1m1 0h1m2 0h2M0 15.5h2m1 0h1m1 0h1m2 0h1m2 0h1m2 0h1m1 0h1m1 0h1m2 0h3m3 0h1M1 16.5h2m1 0h1m1 0h2m4 0h1m3 0h2m2 0h1m4 0h2M0 17.5h3m5 0h2m3 0h3m3 0h4m1 0h1m1 0h1m1 0h1M0 18.5h1m5 0h1m2 0h9m2 0h2m1 0h2m1 0h1M0 19.5h1m1 0h1m1 0h1m5 0h4m1 0h1m2 0h3m1 0h2m3 0h1M0 20.5h1m3 0h1m1 0h1m1 0h1m5 0h2m1 0h1m1 0h6m1 0h3M8 21.5h5m2 0h4m1 0h1m3 0h5M0 22.5h7m2 0h1m9 0h2m1 0h1m1 0h3M0 23.5h1m5 0h1m1 0h1m3 0h1m1 0h1m1 0h1m1 0h1m1 0h1m3 0h1m2 0h2M0 24.5h1m1 0h3m1 0h1m1 0h2m1 0h2m7 0h5m1 0h1m1 0h1M0 25.5h1m1 0h3m1 0h1m1 0h1m2 0h1m2 0h2m2 0h2m5 0h2M0 26.5h1m1 0h3m1 0h1m1 0h1m2 0h1m3 0h3m1 0h9M0 27.5h1m5 0h1m4 0h2m2 0h1m4 0h1m1 0h4m1 0h1M0 28.5h7m1 0h3m2 0h1m1 0h1m1 0h1m1 0h1m2 0h1m1 0h3" };
