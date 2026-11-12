/**
 * 工具的类别（只读 / 写入 / 删除 / 对外发送）和定义指纹。审批按类别分级（service.ts gate）。
 *
 * 类别从哪来，按先后：
 * 1. 用户在连接器上改过的（categoryOverrides）
 * 2. 内置应用里按名字给定的（catalog.ts categories、allRead）
 * 3. 工具自带的标注（MCP annotations）：readOnlyHint = 只读，显式的 destructiveHint = 删除
 * 4. 名字里的动词
 *
 * 标注是服务器自己报的。内置应用连的是官方服务，标注和名字都信；自定义连接器不一样：
 * - 没有标注的一律按写入处理（名字像删除、像发送的再升一级），不因为名字像查询就当只读
 * - 标了只读、名字却是删除 / 发送 / 写入的动词，按名字算：一个把 delete_all 标成只读的服务器不能绕过审批
 * 用户可以在连接器的管理里改任何一个工具的类别。
 *
 * destructiveHint 在规范里没写时默认是 true，含义是「可能有破坏性的更新」，不单指删除。
 * 这里只认显式写了 true 的：服务器自己说它有破坏性，就每次都问。没写的按写入。
 */
import crypto from "node:crypto";
import type { ToolAnnotations, ToolCategory, ToolInfo } from "./types.js";

const READ = new Set(["get", "list", "search", "find", "fetch", "read", "query", "view", "show", "describe", "lookup", "check", "count", "export", "download", "resolve", "whoami", "me", "ping", "preview", "summarize", "inspect", "browse", "retrieve", "status", "info", "history", "diff", "compare", "validate", "explain", "analyze", "detect", "geocode", "regeocode", "weather", "direction", "distance", "around", "nearby", "route", "locate"]);
const WRITE = new Set(["create", "update", "add", "set", "edit", "write", "insert", "put", "patch", "move", "rename", "upload", "append", "merge", "close", "reopen", "assign", "unassign", "comment", "duplicate", "copy", "import", "generate", "make", "new", "save", "modify", "change", "replace", "sync", "submit", "approve", "reject", "resolve", "star", "unstar", "fork", "label", "tag", "link", "unlink", "attach", "restore", "enable", "disable", "start", "stop", "run", "trigger", "execute", "schedule", "book", "register", "configure", "fill", "apply", "commit", "push"]);
const DELETE = new Set(["delete", "remove", "destroy", "drop", "purge", "trash", "erase", "clear", "wipe", "revoke", "uninstall", "archive", "unpublish", "cancel", "terminate", "kill", "truncate", "reset", "discard", "empty"]);
const SEND = new Set(["send", "email", "mail", "sms", "notify", "broadcast", "publish", "tweet", "reply", "invite", "pay", "purchase", "buy", "order", "checkout", "transfer", "refund", "charge", "donate", "message", "dm", "call", "announce", "forward"]);

/** 名字拆成小写的词：create_doc、create-doc、createDoc、docs.create → ["create", "doc"] */
export function nameTokens(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .map((s) => s.toLowerCase())
    .filter(Boolean);
}

/**
 * 名字里的动词说的是哪一类；看不出来是 undefined。最重的赢：send_and_delete 算删除还是发送都要每次问，取先出现的那个。
 * 「message」「call」这类既是名词又是动词的词，只有在没有别的动词时才算（get_messages 是只读）。
 */
export function verbCategory(name: string): ToolCategory | undefined {
  const tokens = nameTokens(name);
  let read = false;
  let write = false;
  let weakSend = false;
  for (const tk of tokens) {
    if (DELETE.has(tk)) return "delete";
    if (SEND.has(tk)) {
      if (tk === "message" || tk === "call" || tk === "mail" || tk === "email" || tk === "order" || tk === "reply") weakSend = true;
      else return "send";
    }
    if (WRITE.has(tk)) write = true;
    if (READ.has(tk)) read = true;
  }
  if (write) return "write";
  if (read) return "read";
  if (weakSend) return "send";
  return undefined;
}

export interface ClassifyContext {
  /** 内置应用（官方服务）：标注和名字都信 */
  trusted: boolean;
  /** 内置应用里按名字给定的类别 */
  fixed?: Record<string, ToolCategory>;
  /** 这个应用只有查询 */
  allRead?: boolean;
  /** 用户改过的 */
  overrides?: Record<string, ToolCategory>;
}

export function classifyTool(name: string, annotations: ToolAnnotations | undefined, ctx: ClassifyContext): ToolCategory {
  const override = ctx.overrides?.[name];
  if (override) return override;
  const fixed = ctx.fixed?.[name];
  if (fixed) return fixed;
  if (ctx.allRead) return "read";
  const verb = verbCategory(name);
  if (annotations?.destructiveHint === true && annotations.readOnlyHint !== true) return verb === "send" ? "send" : "delete";
  if (annotations?.readOnlyHint === true) {
    // 自定义连接器：标了只读，名字却是别的动词，按名字算
    if (!ctx.trusted && verb && verb !== "read") return verb;
    return "read";
  }
  if (ctx.trusted) return verb ?? "write";
  // 自定义连接器、没有只读标注：至少是写入
  return verb === "delete" || verb === "send" ? verb : "write";
}

/** 稳定的 JSON（键排序）：同一个定义总是同一个指纹 */
function stable(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .filter((k) => o[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
    .join(",")}}`;
}

export function toolHash(t: { name: string; description?: string; inputSchema?: unknown; annotations?: ToolAnnotations }): string {
  return crypto
    .createHash("sha256")
    .update(stable({ name: t.name, description: t.description ?? "", inputSchema: t.inputSchema ?? null, annotations: t.annotations ?? null }))
    .digest("hex")
    .slice(0, 16);
}

/** 服务器报的工具 → 带类别和指纹的 ToolInfo */
export function describeTools(raw: Array<{ name: string; title?: string; description?: string; inputSchema?: unknown; annotations?: ToolAnnotations }>, ctx: ClassifyContext): ToolInfo[] {
  const seen = new Set<string>();
  const out: ToolInfo[] = [];
  for (const t of raw) {
    const name = String(t?.name ?? "");
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const annotations = t.annotations && typeof t.annotations === "object" ? pickAnnotations(t.annotations) : undefined;
    const description = String(t.description ?? "").slice(0, 8000);
    const inputSchema = t.inputSchema && typeof t.inputSchema === "object" ? t.inputSchema : { type: "object", properties: {} };
    out.push({
      name,
      ...(t.title || annotations?.title ? { title: String(t.title ?? annotations?.title).slice(0, 200) } : {}),
      description,
      inputSchema,
      ...(annotations ? { annotations } : {}),
      category: classifyTool(name, annotations, ctx),
      hash: toolHash({ name, description, inputSchema, annotations }),
    });
  }
  return out;
}

function pickAnnotations(a: ToolAnnotations): ToolAnnotations | undefined {
  const out: ToolAnnotations = {};
  if (typeof a.title === "string") out.title = a.title;
  for (const k of ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"] as const) if (typeof a[k] === "boolean") out[k] = a[k];
  return Object.keys(out).length ? out : undefined;
}

/** 审批卡片上的关键参数：标题、目标、收件人这类短的字符串和数字，最多几项；像密钥的不要 */
const PARAM_SECRET = /(secret|token|password|passwd|api[_-]?key|authorization|cookie|credential|signature)/i;
export function keyParams(args: unknown, max = 4): Array<[string, string]> {
  if (!args || typeof args !== "object" || Array.isArray(args)) return [];
  const out: Array<[string, string]> = [];
  const push = (k: string, v: unknown) => {
    if (out.length >= max || PARAM_SECRET.test(k)) return;
    if (typeof v === "string") {
      const s = v.replace(/\s+/g, " ").trim();
      if (s) out.push([k, s.length > 80 ? `${s.slice(0, 80)}…` : s]);
    } else if (typeof v === "number" || typeof v === "boolean") out.push([k, String(v)]);
    else if (Array.isArray(v) && v.length && v.every((x) => typeof x === "string" || typeof x === "number")) {
      const s = v.slice(0, 5).join(", ");
      out.push([k, s.length > 80 ? `${s.slice(0, 80)}…` : s]);
    }
  };
  const entries = Object.entries(args as Record<string, unknown>);
  // 先放最能说明这次操作的：标题、名字、目标、收件人
  const lead = /^(title|name|subject|to|recipient|recipients|target|parent|page|path|repo|repository|project|channel|chat|url|id|query)/i;
  for (const [k, v] of entries.filter(([k]) => lead.test(k))) push(k, v);
  for (const [k, v] of entries.filter(([k]) => !lead.test(k))) push(k, v);
  return out;
}
