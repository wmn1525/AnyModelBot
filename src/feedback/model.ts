/**
 * 需求与反馈（应用内工单 schema 2）的数据形状、限制和校验。纯函数，不碰网络和磁盘，测试直接引用。
 *
 * 三个分类：use_case 使用场景与建议 · bug 遇到问题 · enterprise 企业与合作。每个分类的草稿、错误和联系许可互相独立，
 * 发送只用当前分类允许的字段。字数一律按 Unicode 码点（[...s].length）计算，CRLF 先统一成 LF，emoji 按码点而不是字形算，
 * 和 Modelflare 的校验同一算法（controller/connected_app_feedback_v2.go）。
 */
import { redactText } from "../log.js";

export const FEEDBACK_TABS = ["use_case", "bug", "enterprise"] as const;
export type FeedbackTab = (typeof FEEDBACK_TABS)[number];

/** 旧客户端兼容用的 kind（工单服务按 ticket_type 分类，不靠 other 分流） */
export const LEGACY_KIND: Record<FeedbackTab, "suggestion" | "bug" | "other"> = { use_case: "suggestion", bug: "bug", enterprise: "other" };

export const FEEDBACK_SOURCES = ["account_menu", "about", "error_card", "troubleshooting", "discover_business", "discover_scenario"] as const;
export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number];

/** 发现页的六类企业场景（名称、说明、关键词在界面词典和正文词典里） */
export const FEEDBACK_SCENARIOS = ["sales_customer", "finance_documents", "retail_operations", "content_acquisition", "hiring_people", "procurement_inventory"] as const;
export type FeedbackScenario = (typeof FEEDBACK_SCENARIOS)[number];

export const BUSINESS_ROLES = ["enterprise_use", "solution_partner"] as const;
export type BusinessRole = (typeof BUSINESS_ROLES)[number];
export const TEAM_SIZES = ["1_20", "21_100", "101_500", "over_500"] as const;
export const PRODUCT_INTERESTS = ["anymodelbot", "modelflare", "both"] as const;
export const CONTACT_CHANNELS = ["account_email", "email", "wechat"] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

/**
 * 联系许可文案（"同意就本次反馈联系我"）的版本。工单服务在能力接口里回它认的版本，两边不一致时以服务端为准、
 * 这边只在拿不到远端能力时（未登录、外部网关）用它构造"只能看、不能发"的预览。改了那句文案就一起改。
 */
export const CONTACT_POLICY_VERSION = "2026-11-19";

export const LIMITS = {
  /** 主描述去首尾空白后至少这么多码点 */
  descriptionMin: 10,
  /** 本人写的自由文本合计（主描述、补充场景、企业背景、自填联系方式） */
  inputMax: 4000,
  /** 拼好的整段正文 */
  bodyMax: 7800,
  /** 附带的报错 */
  errorMax: 1500,
  /** 运行日志最多取这么多行 */
  logLines: 120,
  emailMax: 254,
  wechatMax: 64,
} as const;

/** 工单提交超过这么久还没有完整回执，就当作结果未知（先查询，再由本人决定用同一个提交 ID 重试） */
export const SUBMIT_TIMEOUT_MS = 20_000;
/** 闲置这么久的草稿清理掉 */
export const DRAFT_TTL_MS = 7 * 24 * 3600_000;

/** 一个分类的草稿（界面 → 本机服务）。联系许可从不持久化，只在本次编辑里有效 */
export interface TabDraft {
  description?: string;
  /** 应用写进描述的指导占位行（企业咨询模板里的"目前使用的应用：[请补充]"）：原样未改的行在构造前移除，不计数 */
  guidance?: string[];
  /** 使用场景与建议：补充使用场景 */
  context?: { task?: string; current_approach?: string; desired_outcome?: string };
  /** 企业与合作 */
  role?: BusinessRole;
  business?: {
    company_name?: string;
    job_role?: string;
    current_systems?: string;
    partnership_context?: string;
    team_size?: string;
    product_interest?: string;
    introduce_to_own_company?: boolean;
  };
  /** 当前的咨询场景（可移除的结构化上下文，不是正文） */
  scenarioId?: string;
  /** 自填联系方式（不生效，只是本人下次不用重输；许可每次重新确认） */
  contactKind?: "email" | "wechat";
  contactValue?: string;
}

export interface ContactChoice {
  consent: boolean;
  channel?: ContactChannel;
  /** email / wechat 时本人填写的值 */
  value?: string;
}

export interface FieldError {
  field: string;
  code: string;
  params?: Record<string, number | string>;
}

export const codePoints = (s: string): number => [...s].length;
export const normalizeText = (s: unknown): string => (typeof s === "string" ? s.replace(/\r\n?/g, "\n").trim() : "");
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/;
const CONTROL_OR_NEWLINE = /[\u0000-\u001f\u007f-\u009f]/;

/** 去掉原样未改的指导占位行；改过的行（哪怕只多一个字）是本人的内容，一字不动 */
export function stripGuidance(description: string, guidance: readonly string[] = []): string {
  const text = normalizeText(description);
  if (!guidance.length) return text;
  const marks = new Set(guidance.map((g) => g.trim()).filter(Boolean));
  return text
    .split("\n")
    .filter((line) => !marks.has(line.trim()))
    .join("\n")
    .trim();
}

/** 邮箱：比 Modelflare 的 net/mail 更严一点（只收常见的 addr-spec），客户端放行的服务端一定收 */
const EMAIL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

/** 自填联系方式的校验：返回错误码，没问题返回空串 */
export function contactValueError(kind: "email" | "wechat", raw: string | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) return "contact_value_required";
  if (kind === "email") {
    if (codePoints(value) > LIMITS.emailMax || CONTROL_OR_NEWLINE.test(value)) return "contact_value_invalid";
    if (!EMAIL.test(value)) return "contact_email_invalid";
  } else if (codePoints(value) > LIMITS.wechatMax || CONTROL_OR_NEWLINE.test(value)) return "contact_value_invalid";
  // 联系方式不能为了"保留"而放宽密钥保护：脱敏会改动它，就请本人换一个或取消留联
  if (redactText(value) !== value) return "contact_unsafe";
  return "";
}

/** 生效的自由文本（已去指导占位、去首尾空白；空的省略） */
export interface EffectiveText {
  description: string;
  context: Partial<Record<"task" | "current_approach" | "desired_outcome", string>>;
  business: Partial<Record<"company_name" | "job_role" | "current_systems" | "partnership_context", string>>;
  contactValue: string;
}

const pick = <K extends string>(src: Partial<Record<K, unknown>> | undefined, keys: readonly K[]): Partial<Record<K, string>> => {
  const out: Partial<Record<K, string>> = {};
  for (const k of keys) {
    const v = normalizeText(src?.[k]);
    if (v) out[k] = v;
  }
  return out;
};

export const CONTEXT_KEYS = ["task", "current_approach", "desired_outcome"] as const;
export const BUSINESS_TEXT_KEYS = ["company_name", "job_role", "current_systems", "partnership_context"] as const;

/** 按分类取生效的文本：别的分类的字段一律不算、不发（比如问题分类不带企业背景） */
export function effectiveText(tab: FeedbackTab, draft: TabDraft, contact: ContactChoice): EffectiveText {
  return {
    description: stripGuidance(draft.description ?? "", draft.guidance),
    context: tab === "use_case" ? pick(draft.context, CONTEXT_KEYS) : {},
    business: tab === "enterprise" ? pick(draft.business, BUSINESS_TEXT_KEYS) : {},
    contactValue: contact.consent && (contact.channel === "email" || contact.channel === "wechat") ? (contact.value ?? "").trim() : "",
  };
}

/** 计入 4000 的自由文本合计 */
export function inputTotal(text: EffectiveText): number {
  return [text.description, ...Object.values(text.context), ...Object.values(text.business), text.contactValue].reduce((n, s) => n + codePoints(s ?? ""), 0);
}

/**
 * 发送前的字段校验（本机先做一遍，Modelflare 再独立做一遍）。只校验当前分类、只在同意留联时校验联系方式；
 * 超限一律报错，不无声截断。
 */
export function validateDraft(tab: FeedbackTab, draft: TabDraft, contact: ContactChoice, identity: { emailAvailable: boolean }): FieldError[] {
  const errors: FieldError[] = [];
  const text = effectiveText(tab, draft, contact);
  const n = codePoints(text.description);
  if (n < LIMITS.descriptionMin) errors.push({ field: "description", code: "too_short", params: { min: LIMITS.descriptionMin } });
  if (CONTROL.test(text.description)) errors.push({ field: "description", code: "invalid" });
  if (tab === "enterprise" && !BUSINESS_ROLES.includes(draft.role as BusinessRole)) errors.push({ field: "role", code: "role_required" });
  if (contact.consent) {
    if (!contact.channel || !CONTACT_CHANNELS.includes(contact.channel)) errors.push({ field: "contact", code: "contact_channel_required" });
    else if (contact.channel === "account_email") {
      if (!identity.emailAvailable) errors.push({ field: "contact", code: "contact_email_unavailable" });
    } else {
      const code = contactValueError(contact.channel, contact.value);
      if (code) errors.push({ field: "contact", code });
    }
  }
  const total = inputTotal(text);
  if (total > LIMITS.inputMax) errors.push({ field: "input_total", code: "too_long", params: { max: LIMITS.inputMax } });
  return errors;
}

// —— 回执与工单地址 ——

/** 工单服务的官方主机：只认精确主机名（不认通配子域、相似域）；换成别的发行方要显式配置 AMB_MODELFLARE_ISSUER */
export function supportHosts(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const hosts = new Set(["modelflare.dev"]);
  const issuer = env.AMB_MODELFLARE_ISSUER?.trim();
  if (issuer) {
    try {
      const u = new URL(issuer);
      if (u.protocol === "https:" && !u.username && !u.password && !u.port) hosts.add(u.hostname);
    } catch {
      /* 配置写错就只认默认主机 */
    }
  }
  return hosts;
}

/**
 * 工单地址必须是服务端工单路由给的官方 HTTPS 地址：精确主机、无用户信息段、无非标准端口、路径就是工单页、
 * 只带 ticket_id。不合格返回空串（界面不打开，也不据此显示已提交）。
 */
export function safeSupportUrl(raw: unknown, hosts: Set<string> = supportHosts()): string {
  if (typeof raw !== "string" || !raw || raw.length > 2048) return "";
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "";
  }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return "";
  if (!hosts.has(u.hostname)) return "";
  if (!/^\/(?:[a-z]{2}(?:-[A-Za-z]{2,4})?\/)?support-tickets\/?$/.test(u.pathname)) return "";
  const keys = [...u.searchParams.keys()];
  if (keys.length !== 1 || keys[0] !== "ticket_id" || !/^\d{1,18}$/.test(u.searchParams.get("ticket_id") ?? "") || u.hash) return "";
  return u.toString();
}

export interface Receipt {
  clientSubmissionId: string;
  /** 统一按文本显示 */
  ticketId: string;
  topic: string;
  supportUrl: string;
  replayed: boolean;
}

/**
 * 校验 schema 2 回执：必须声明按结构化契约入库（stored_schema_version = 2）、提交 ID 和这次一致、状态 created、
 * 工单号是非空字符串或正整数、工单地址合格。任一项不满足都不是有效成功（返回 null）。
 */
export function parseReceipt(data: unknown, clientSubmissionId: string, hosts?: Set<string>): Receipt | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.schema_version !== 2 || d.stored_schema_version !== 2 || d.status !== "created") return null;
  if (d.client_submission_id !== clientSubmissionId) return null;
  const id = d.ticket_id;
  const ticketId = typeof id === "number" && Number.isSafeInteger(id) && id > 0 ? String(id) : typeof id === "string" && id.trim() && id.length <= 64 && !CONTROL_OR_NEWLINE.test(id) ? id.trim() : "";
  if (!ticketId || typeof d.topic !== "string") return null;
  const supportUrl = safeSupportUrl(d.support_url, hosts);
  if (!supportUrl) return null;
  return { clientSubmissionId, ticketId, topic: d.topic, supportUrl, replayed: d.replayed === true };
}
