// 站点级数据：部署值（环境变量，缺省时保留占位符，生产构建由 check-placeholders 拦下）、下载数据、价格快照。
import { z } from "zod";
import releasesJson from "../data/releases.json";
import snapshotJson from "../data/pricing.snapshot.json";
import githubJson from "../data/github.json";
import type { Lang } from "../i18n/locales";
import type { Snapshot } from "./pricing";


export const SITE_DOMAIN = process.env.SITE_DOMAIN || "";
export const GITHUB_URL = process.env.GITHUB_URL || "https://github.com/wmn1525/AnyModelBot";
export const SECURITY_EMAIL = process.env.SECURITY_EMAIL || "";
export const CONTACT_URL = `${GITHUB_URL}/issues`;
// 统计是可选的：没配置时页面不加载统计脚本（不留占位符）
const optional = (k: string) => (import.meta.env[k] as string | undefined) || process.env[k] || "";
export const ANALYTICS_SCRIPT_URL = optional("ANALYTICS_SCRIPT_URL");
export const ANALYTICS_SITE_ID = optional("ANALYTICS_SITE_ID");
export const PARTNERS_EMAIL = "";
export const ORIGIN = SITE_DOMAIN ? `https://${SITE_DOMAIN}` : "";
/** GitHub 星数的初始值：构建时取（scripts/fetch-github-stars.ts）；页面打开后由 scripts/stars.ts 换成站内 /stars.json 的值 */
export const githubStars = z.object({ stars: z.number().int().nonnegative() }).parse(githubJson).stars;

/** 跳到 okinto 的链接都带来源参数：全项目统一 utm_source=okbot&utm_campaign=amb_<位置>，官网是 amb_homepage */
export const MF_UTM = "utm_source=okbot&utm_campaign=okbot_homepage";
const mf = (url: string) => `${url}${url.includes("?") ? "&" : "?"}${MF_UTM}`;
/** okinto 使用统一的控制台地址，各语言共用。 */
const mfPage = (_lang: Lang, path: string) => mf(`https://api.okinto.com${path || "/"}`);

export const MF = {
  home: (lang: Lang) => mfPage(lang, ""),
  pricing: (lang: Lang) => mfPage(lang, "/pricing"),
  signIn: (lang: Lang) => mfPage(lang, "/"),
  docs: "https://docs.newapi.pro",
  partnerApply: (_lang: Lang) => mf("https://api.okinto.com/register"),
};

const Bin = z.object({ url: z.string().min(1), sha256: z.string().min(1), sizeMB: z.number().nonnegative() });
const Releases = z.object({
  version: z.string().min(1),
  publishedAt: z.string().min(1),
  platforms: z.object({
    "win-x64": Bin,
    "mac-arm64": Bin,
    "mac-x64": Bin,
    "linux-x64": Bin,
    docker: z.object({ image: z.string().min(1), command: z.string().min(1) }),
  }),
});
export const releases = Releases.parse(releasesJson);
export type PlatformId = "win-x64" | "mac-arm64" | "mac-x64" | "linux-x64";
export const PLATFORMS: PlatformId[] = ["win-x64", "mac-arm64", "mac-x64", "linux-x64"];

export const pricing = snapshotJson as Snapshot;
export const rowOf = (model: string) => pricing.rows.find((r) => r.model === model);
