/** 连接应用（内置应用连接器 + 自定义 MCP）共用的类型。总览见 service.ts。 */

/** 一个工具做的事：只读、写入、删除、对外发送（替用户发消息、发邮件、发帖、付款）。审批按它分级（gate.ts） */
export type ToolCategory = "read" | "write" | "delete" | "send";
export const TOOL_CATEGORIES: readonly ToolCategory[] = ["read", "write", "delete", "send"];

/**
 * 认证方式（自定义连接器的下拉，也是内置应用卡片上写的接入方式）。以后加新的方式只在这里加一项。
 * - auto：保存时先测试，能直接连就连；服务要求授权登录就走授权登录；被拒就请用户改成请求头、查询参数或专属链接
 * - none：公开服务
 * - headers：API Key、Bearer 令牌放请求头
 * - query：令牌放 URL 查询参数
 * - dedicatedUrl：每位用户一条不同的地址，地址本身就是凭证
 * - oauth：OAuth 2.0 授权码（默认 PKCE S256，支持动态注册，也可以填预注册的客户端）
 * 本地命令没有这一项：凭证是环境变量。
 */
export type AuthMethod = "auto" | "none" | "headers" | "query" | "dedicatedUrl" | "oauth";
export const AUTH_METHODS: readonly AuthMethod[] = ["auto", "none", "headers", "query", "dedicatedUrl", "oauth"];

/**
 * 连接状态（应用页卡片、管理弹窗、机器人设置、对话里的卡片都用这一套）：
 * off 未开启 · testing 测试中 · connected 已连接 · needs-login 需要登录 · key-rejected 密钥被拒 · link-invalid 链接无效 ·
 * unreachable 连不上 · local-failed 本地程序启动失败 · expired 授权过期
 */
export type ConnState = "off" | "testing" | "connected" | "needs-login" | "key-rejected" | "link-invalid" | "unreachable" | "local-failed" | "expired";
/** 要用户处理凭证的状态：应用页入口和机器人设置里亮提醒点。连不上多半是网络，不亮 */
export const ATTENTION_STATES: readonly ConnState[] = ["needs-login", "key-rejected", "link-invalid", "expired"];

export interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/** 服务器报的一个工具，加上我们给它定的类别和定义的指纹 */
export interface ToolInfo {
  name: string;
  title?: string;
  description: string;
  inputSchema: unknown;
  annotations?: ToolAnnotations;
  category: ToolCategory;
  /** 名字 + 说明 + 参数 + 标注的指纹：「以后都允许」记的是它，工具的定义变了就不算数了 */
  hash: string;
}

/** 远程连接的 OAuth 设置（不含密钥） */
export interface OAuthSettings {
  /** 预注册的客户端 ID；空 = 动态注册 */
  clientId?: string;
  scopes?: string[];
  /** 默认开；服务不支持 PKCE 时关掉 */
  pkce: boolean;
}

/** 一条 MCP 连接（内置应用的一个账号，或一个自定义连接器）。凭证不在这里，在凭证文件里（secrets.ts） */
export interface McpConnection {
  id: string;
  /** 内置应用的 id（catalog.ts）；自定义连接器是 "custom" */
  app: string;
  /** 别名（内置应用的账号）或名称（自定义连接器）。同一个应用里不重复 */
  label: string;
  /** 这个账号是谁：同一个账号再连一次时更新它，不多出一条 */
  identity: string;
  transport: "http" | "stdio";
  /** 远程：地址。专属链接和带查询参数的地址只留到路径为止的打码形式，完整的在凭证文件里 */
  url?: string;
  /** 上次是用旧式 SSE 连上的：下次先试它 */
  sse?: boolean;
  auth: AuthMethod;
  /** 请求头、查询参数、环境变量的名字（值在凭证文件里） */
  headerNames?: string[];
  queryNames?: string[];
  envNames?: string[];
  oauth?: OAuthSettings;
  /** 本地命令 */
  command?: string;
  args?: string[];
  /** 内置应用预置的本地程序（"yuque"）：运行什么由 service.ts 决定，用户只给令牌 */
  builtinCommand?: string;
  /** 本地命令成功启动过：之前的那一次可能要先下载软件包，等得久一些 */
  startedOnce?: boolean;
  /** 自定义连接器的开关；内置应用的账号总是开着 */
  enabled: boolean;
  state: ConnState;
  /** 状态的简短原因（给用户看，不含密钥） */
  detail?: string;
  checkedAt: number;
  tools: ToolInfo[];
  /** 用户改过类别的工具 */
  categoryOverrides?: Record<string, ToolCategory>;
  createdAt: number;
}

/** 凭证文件里一条 MCP 连接的条目 */
export interface McpSecrets {
  /** 专属链接、或带查询参数的完整地址 */
  url?: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  env?: Record<string, string>;
  oauth?: {
    /** 授权服务器（发现到的） */
    issuer?: string;
    clientId?: string;
    clientSecret?: string;
    /** 动态注册时用的回调地址：换了端口就要重新注册 */
    redirectUri?: string;
    accessToken?: string;
    refreshToken?: string;
    /** 毫秒时间戳；0 = 不知道 */
    expiresAt?: number;
    scope?: string;
  };
}

/** 凭证文件里 MCP 连接的键 */
export const mcpSecretId = (id: string) => `mcp:${id}`;

/** 给模型看的错误：文字直接进工具结果，说清楚怎么办，不带密钥 */
export class AppError extends Error {
  constructor(
    message: string,
    /** 连接的问题：对话里据此出「去连接 / 重新授权 / 更新密钥 / 更新链接」卡片 */
    readonly repair?: { app: string; state: ConnState },
  ) {
    super(message);
    this.name = "AppError";
  }
}
