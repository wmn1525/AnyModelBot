// 需求与反馈的纯函数（不碰浏览器全局，测试直接引用）：分类、场景、字数、留联校验，以及邮件 / GitHub 的备用链接。
// 弹窗的开关状态在 lib/feedback.js；构造、校验的权威版本在本机服务（src/feedback/），这里只做输入时的即时提示。
export const FEEDBACK_TABS = ["use_case", "bug", "enterprise"];
/** 发现页的六类企业场景（名称、说明、关键词在 ui/locales/<语言>/feedback.js 的 scenario.<id>） */
export const FEEDBACK_SCENARIOS = ["sales_customer", "finance_documents", "retail_operations", "content_acquisition", "hiring_people", "procurement_inventory"];
export const TEAM_SIZES = ["1_20", "21_100", "101_500", "over_500"];
export const PRODUCT_INTERESTS = ["anymodelbot", "modelflare", "both"];
/** 商务联系的固定外链：不带账号、角色、场景、正文或联系方式 */
export const BUSINESS_CONTACT_URL = "https://modelflare.dev/business-contact";
const REPO = "https://github.com/modelflare-ai/AnyModelBot";
export const SUPPORT_EMAIL = "support@anymodel.bot";

/** 按 Unicode 码点计数（和本机服务、Modelflare 同一算法：emoji 按码点算，不按字形） */
export const charCount = (s) => [...String(s || "").replace(/\r\n?/g, "\n").trim()].length;

/** 去掉原样未改的指导占位行（"目前使用的应用：[请补充]"），改过的行是本人的内容 */
export function stripGuidance(text, guidance = []) {
  const marks = new Set((guidance || []).map((g) => String(g).trim()).filter(Boolean));
  const s = String(text || "").replace(/\r\n?/g, "\n").trim();
  if (!marks.size) return s;
  return s.split("\n").filter((line) => !marks.has(line.trim())).join("\n").trim();
}

/** 生效的自由文本合计（主描述去指导占位，补充场景、企业背景、生效的自填联系方式） */
export function inputTotal(tab, draft, contact) {
  let n = charCount(stripGuidance(draft.description, draft.guidance));
  if (tab === "use_case") for (const v of Object.values(draft.context || {})) n += charCount(v);
  if (tab === "enterprise") for (const k of ["company_name", "job_role", "current_systems", "partnership_context"]) n += charCount(draft.business?.[k]);
  if (contact?.consent && contact.channel === "other") n += charCount(draft.contactValue);
  return n;
}

const EMAIL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

/** 自填联系方式的即时校验（同意留联时才调用）：返回错误码，没问题返回空串 */
export function contactValueError(kind, raw) {
  const value = String(raw || "").trim();
  if (!value) return "contact_value_required";
  if (kind === "email") {
    if ([...value].length > 254 || CONTROL.test(value)) return "contact_value_invalid";
    if (!EMAIL.test(value)) return "contact_email_invalid";
  } else if ([...value].length > 64 || CONTROL.test(value)) return "contact_value_invalid";
  return "";
}

/**
 * 企业咨询模板：第一行是这个场景的三个关键词（本人的咨询内容），后两行是指导占位（原样未改时构造前移除、不计数）。
 * 不填任何真实公司或系统资料。
 */
export function scenarioTemplate({ intro, apps, problem }) {
  return { description: [intro, apps, problem].join("\n"), guidance: [apps, problem] };
}

/** 已有企业草稿时加入新场景：同一场景不重复追加；超过 4000 就不动原稿、返回 null（界面提示缩短或继续原稿） */
export function appendScenario(description, line, max = 4000) {
  const text = String(description || "").replace(/\s+$/, "");
  if (text.split("\n").some((l) => l.trim() === line.trim())) return text;
  const next = text ? `${text}\n${line}` : line;
  return charCount(next) > max ? null : next;
}

const cut = (s, max) => {
  const a = [...String(s || "")];
  return a.length <= max ? a.join("") : `${a.slice(0, max - 1).join("")}…`;
};

/** 链接里放不下太长的内容：GitHub 的地址最好在 8 KB 以内，中文编码后一个字占 9 个字节 */
const URL_TEXT_MAX = 600;
const URL_EXTRA_MAX = 300;

/**
 * GitHub issue 链接（公开）：按 .github/ISSUE_TEMPLATE 的表单字段 id 预填。问题 → bug_report.yml；使用场景与建议 → feature_request.yml。
 * 只用本机服务重新构造的外部副本（没有联系许可、联系值和企业背景）。truncated：链接里只放了开头，完整内容要本人复制粘贴。
 */
export function githubFeedbackUrl({ tab, text, version, environment, errorText }) {
  const body = String(text || "").trim();
  const truncated = [...body].length > URL_TEXT_MAX || [...String(errorText || "")].length > URL_EXTRA_MAX;
  const q = new URLSearchParams();
  if (tab === "bug") {
    q.set("template", "bug_report.yml");
    if (version) q.set("version", version);
    q.set("steps", cut(body, URL_TEXT_MAX));
    q.set("diagnostics", [environment, errorText && cut(errorText, URL_EXTRA_MAX)].filter(Boolean).join("\n\n"));
  } else {
    q.set("template", "feature_request.yml");
    q.set("problem", cut(body, URL_TEXT_MAX));
  }
  return { url: `${REPO}/issues/new?${q}`, truncated };
}

/** 邮件链接：主题 + 正文（正文太长时只放开头，完整内容要本人复制粘贴） */
export function emailFeedbackUrl({ subject, text, environment, errorText }) {
  const body = [cut(String(text || "").trim(), URL_TEXT_MAX), environment, errorText && cut(errorText, URL_EXTRA_MAX)].filter(Boolean).join("\n\n");
  const truncated = [...String(text || "").trim()].length > URL_TEXT_MAX || [...String(errorText || "")].length > URL_EXTRA_MAX;
  // mailto 用 %20 表示空格（URLSearchParams 会写成 +，部分邮件客户端不认）
  return { url: `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, truncated };
}
