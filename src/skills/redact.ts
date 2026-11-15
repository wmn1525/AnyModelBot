/**
 * 存成技能时的密钥与个人信息检查（skills/drafts.ts）。
 *
 * - 密钥：API Key、令牌、密码、验证码、Cookie，以及身份证号、银行卡这类长数字。草稿生成时删掉，保存时（含编辑后）再查，
 *   还有就不让保存。规则和长期记忆拒存的那一套一致（agent/memory.ts looksSecret）：技能会导出、在多个机器人上用，
 *   传得比记忆更远，身份证号同样按密钥处理。
 * - 个人信息：手机号、邮箱、工作区以外带用户名的文件路径由这里认；人名、群名由模型在草稿里标出。
 *   每处让用户选「保留」或「运行时再问」（默认运行时再问，改成占位）。
 */

/** 一眼能认出的密钥格式（和 agent/memory.ts 的 KEY_PATTERNS 同一套，这里要找出每一处，所以是全局匹配） */
const KEY_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  /\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}/g,
  /\bhf_[A-Za-z0-9]{30,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/g,
];

/** 「密码是 xxx」「token: xxx」「验证码 123456」：说出来的那个值（第 1 组） */
const GIVEN = [
  /(?:密码(?!管理|策略|规则)|口令|验证码|校验码|\bpassw(?:or)?d\b|\bpwd\b|\bpass(?:code|phrase)\b|\b(?:otp|cvv|cvc)\b|\b(?:security|verification) code\b|\bapi[_ -]?key\b|\bsecret\b|\btoken\b)[^\n.。;；,，]{0,20}?(?:是|为|:|：|=|\bis\b)\s*([^\s，。,;；"'“”]{4,})/gi,
  /\bcookie\s*[:：=]\s*([^\n]{8,})/gi,
];

/** 身份证号（18 位，末位可以是 X）；银行卡号这类 15 位以上的数字 */
const LONG_DIGITS = /(?<![\dA-Za-z])(?:\d{17}[\dXx]|\d{15,})(?![\dA-Za-z])/g;

/** 大小写字母和数字混排、32 位以上：多半是密钥（网址里的不算） */
const RANDOM = /[A-Za-z0-9+=]{32,}/g;

function eachMatch(text: string, re: RegExp, group = 0): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"))) {
    const v = m[group];
    if (v) out.push(v);
  }
  return out;
}

/** 文字里像密钥的每一处（去重，长的在前，替换时不会只换掉一半） */
export function findSecrets(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();
  for (const p of KEY_PATTERNS) for (const v of eachMatch(text, p)) found.add(v);
  for (const p of GIVEN) for (const v of eachMatch(text, p, 1)) found.add(v.trim());
  const bare = text.replace(/\bhttps?:\/\/\S+/g, " ");
  for (const v of eachMatch(bare, LONG_DIGITS)) found.add(v);
  for (const v of eachMatch(bare, RANDOM)) if (/[a-z]/.test(v) && /[A-Z]/.test(v) && /\d/.test(v)) found.add(v);
  // 被别的匹配包住的不重复算（Bearer xxx 和 xxx）
  const list = [...found].sort((a, b) => b.length - a.length);
  return list.filter((v, i) => !list.slice(0, i).some((w) => w.includes(v)));
}

/** 删掉文字里的密钥：每处换成 mark；返回删掉了哪些 */
export function scrubSecrets(text: string, mark: string): { text: string; found: string[] } {
  const found = findSecrets(text);
  let out = text;
  for (const v of found) out = out.split(v).join(mark);
  return { text: out, found };
}

export type PersonalKind = "phone" | "email" | "id" | "name" | "group" | "path" | "other";

/** 中国大陆手机号；带国家码的号码 */
const PHONE = /(?<![\dA-Za-z])(?:1[3-9]\d{9}|\+\d{1,3}[ -]?\d[\d -]{6,14}\d)(?![\dA-Za-z])/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** 工作区以外、带用户名的绝对路径：/Users/<名字>/…、/home/<名字>/…、C:\Users\<名字>\… */
const HOME_PATH = /(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)[^\s/\\'"“”）)，,。]+(?:[\\/][^\s'"“”）)，,。]*)?/g;

/** 由规则认出来的个人信息（手机号、邮箱、带用户名的路径），按出现顺序、去重 */
export function findPersonal(text: string): Array<{ text: string; kind: PersonalKind }> {
  if (!text) return [];
  const out: Array<{ text: string; kind: PersonalKind }> = [];
  const add = (v: string, kind: PersonalKind) => {
    const s = v.trim();
    if (s && !out.some((x) => x.text === s || x.text.includes(s))) out.push({ text: s, kind });
  };
  for (const v of eachMatch(text, EMAIL)) add(v, "email");
  for (const v of eachMatch(text, PHONE)) add(v, "phone");
  for (const v of eachMatch(text, HOME_PATH)) add(v.replace(/[.,;:，。；：]+$/, ""), "path");
  return out;
}
