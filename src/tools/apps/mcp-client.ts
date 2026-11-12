/**
 * 主程序这边的 MCP 客户端：连一台 MCP 服务器，列工具、调工具。用官方的 @modelcontextprotocol/client。
 *
 * 远程和本地命令都由主程序来连（不走代理进程里的 mcp-client 插件）：令牌、Key、专属链接只在主程序里，
 * 机器人进程经 bridge 调用（agent/manager.ts appOp），审批、按机器人分配、结果截断也都在主程序这一处做。
 *
 * 远程：先试 Streamable HTTP，不行再试旧式 SSE（少数服务只给 SSE 地址）；地址以 /sse 结尾或上次就是用 SSE 连上的，先试 SSE。
 * 本地命令：用户的登录 shell 里的 PATH（图形界面启动的应用拿不到，npx、uvx 会找不到，见 shell-path.ts）。
 *
 * 这里抛的 McpFailure 只带种类和不含密钥的短说明；怎么对应到连接状态在 service.ts。
 */
import { Client, SSEClientTransport, StreamableHTTPClientTransport, UnauthorizedError, type AuthProvider, type Transport } from "@modelcontextprotocol/client";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/client/stdio";
import { redactText } from "../../log.js";
import { userPath } from "./shell-path.js";
import type { ToolAnnotations } from "./types.js";

/**
 * unauthorized 服务器拒绝了凭证（或要求登录）· unreachable 地址不对、网络不通、服务不可用 ·
 * spawn 本地程序起不来 · protocol 连上了但对面说的不是 MCP · timeout 超时
 */
export type FailKind = "unauthorized" | "unreachable" | "spawn" | "protocol" | "timeout";

export class McpFailure extends Error {
  constructor(
    readonly kind: FailKind,
    message: string,
    readonly status = 0,
    /** 本地程序最后输出的几行（脱敏后），给「查看日志」 */
    readonly output = "",
    /** 401 时服务器给的 WWW-Authenticate（授权登录从这里找授权服务器和 scope） */
    readonly challenge?: { resourceMetadataUrl?: URL; scope?: string },
  ) {
    super(message);
    this.name = "McpFailure";
  }
}

export interface HttpTarget {
  transport: "http";
  url: string;
  headers?: Record<string, string>;
  /** 授权登录的令牌：每次请求前取，401 时让它续期一次 */
  auth?: AuthProvider;
  fetch?: typeof fetch;
  preferSse?: boolean;
}
export interface StdioTarget {
  transport: "stdio";
  command: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
}
export type McpTarget = HttpTarget | StdioTarget;

export interface RawTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: unknown;
  annotations?: ToolAnnotations;
}

export interface CallResult {
  text: string;
  isError: boolean;
}

const OUTPUT_TAIL = 4000;

/** 请求里带着 401 的质询头时记下来（SDK 的 UnauthorizedError 不带它） */
function challengeFetch(base: typeof fetch, seen: { value?: { resourceMetadataUrl?: URL; scope?: string } }): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await base(input as any, init);
    if (res.status === 401) {
      const header = res.headers.get("www-authenticate") ?? "";
      const meta = /resource_metadata="([^"]+)"/i.exec(header)?.[1];
      const scope = /\bscope="([^"]+)"/i.exec(header)?.[1];
      let resourceMetadataUrl: URL | undefined;
      try {
        resourceMetadataUrl = meta ? new URL(meta) : undefined;
      } catch {
        resourceMetadataUrl = undefined;
      }
      seen.value = { resourceMetadataUrl, scope };
    }
    return res;
  }) as typeof fetch;
}

/** 出错的原因里可能带着地址（专属链接、带 Key 的地址）：只留种类，不留原文 */
function failureOf(e: unknown, seen: { value?: { resourceMetadataUrl?: URL; scope?: string } }, output = ""): McpFailure {
  if (e instanceof McpFailure) return e;
  const err = e as any;
  // 续期失败（oauth.ts 的 OAuthFlowError）：授权不再有效 = 凭证被拒；授权服务一时连不上 = 连不上
  if (err?.name === "OAuthFlowError") return err.code === "unavailable" ? new McpFailure("unreachable", "The authorization service could not be reached.", 0, output) : new McpFailure("unauthorized", "The authorization is no longer valid.", 401, output, seen.value);
  // HTTP 状态码：SDK 的错误放在 status 或 data.status 里；code 可能是 JSON-RPC 的负数或 "ENOENT" 这样的字符串，只认 100–599
  const httpish = [err?.status, err?.data?.status, err?.code].map((v) => Number(v)).find((n) => Number.isInteger(n) && n >= 100 && n <= 599);
  const status = httpish ?? 0;
  const message = String(err?.message ?? e ?? "");
  if (UnauthorizedError.isInstance?.(e) || e instanceof UnauthorizedError || status === 401 || status === 403 || /\b(401|403)\b|unauthorized|forbidden|invalid[_ ]token/i.test(message)) {
    return new McpFailure("unauthorized", "The server refused the credentials.", status || 401, output, seen.value);
  }
  if (err?.name === "AbortError" || err?.name === "TimeoutError" || /timed? ?out|timeout/i.test(message)) return new McpFailure("timeout", "The server did not answer in time.", status, output);
  if (err?.code === "ENOENT" || /ENOENT|not found.*spawn|spawn .* ENOENT/i.test(message)) return new McpFailure("spawn", "The command was not found.", 0, output);
  if (/EACCES|EPERM/.test(String(err?.code ?? "")) || /EACCES|EPERM/.test(message)) return new McpFailure("spawn", "The command could not be run (permission denied).", 0, output);
  if (status >= 400) return new McpFailure("unreachable", `The server answered HTTP ${status}.`, status, output);
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|network|socket|certificate|getaddrinfo|ERR_/i.test(message + String(err?.cause?.code ?? "") + String(err?.cause?.message ?? ""))) {
    return new McpFailure("unreachable", "Could not reach the server.", status, output);
  }
  return new McpFailure("protocol", "The server did not answer as an MCP server.", status, output);
}

async function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          onTimeout();
          reject(new McpFailure("timeout", "The server did not answer in time."));
        }, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** 工具结果的内容块 → 给模型的文字。图片、音频只说是什么；资源链接给名字和地址 */
export function contentText(result: any): string {
  const parts: string[] = [];
  for (const c of Array.isArray(result?.content) ? result.content : []) {
    if (!c || typeof c !== "object") continue;
    if (c.type === "text" && typeof c.text === "string") parts.push(c.text);
    else if (c.type === "image") parts.push(`[image: ${String(c.mimeType ?? "image")}]`);
    else if (c.type === "audio") parts.push(`[audio: ${String(c.mimeType ?? "audio")}]`);
    else if (c.type === "resource_link") parts.push(`[${String(c.name ?? c.title ?? "resource")}](${String(c.uri ?? "")})`);
    else if (c.type === "resource" && c.resource) {
      if (typeof c.resource.text === "string") parts.push(c.resource.text);
      else parts.push(`[resource: ${String(c.resource.uri ?? "")}]`);
    }
  }
  if (!parts.length && result?.structuredContent !== undefined) parts.push(JSON.stringify(result.structuredContent));
  return parts.join("\n\n");
}

export class McpSession {
  /** 这次是用旧式 SSE 连上的 */
  usedSse = false;
  /** 连接断了（服务器关了、本地程序退出了）：下次调用要重新连 */
  closed = false;
  private output = "";

  private constructor(
    private client: Client,
    private transport: Transport,
  ) {}

  /** 本地程序最后输出的几行（脱敏后） */
  outputTail(): string {
    return redactText(this.output.slice(-OUTPUT_TAIL));
  }

  get instructions(): string {
    return String(this.client.getInstructions() ?? "").slice(0, 4000);
  }

  get serverName(): string {
    const v = this.client.getServerVersion();
    return String(v?.title ?? v?.name ?? "").slice(0, 80);
  }

  static async open(target: McpTarget, opts: { timeoutMs: number }): Promise<McpSession> {
    return target.transport === "stdio" ? McpSession.openStdio(target, opts.timeoutMs) : McpSession.openHttp(target, opts.timeoutMs);
  }

  private static newClient(): Client {
    return new Client({ name: "AnyModelBot", version: "1" }, { capabilities: {} });
  }

  private static async openHttp(target: HttpTarget, timeoutMs: number): Promise<McpSession> {
    let url: URL;
    try {
      url = new URL(target.url);
    } catch {
      throw new McpFailure("unreachable", "The address is not a valid URL.");
    }
    const sseFirst = target.preferSse || /\/sse\/?$/i.test(url.pathname);
    const order: Array<"http" | "sse"> = sseFirst ? ["sse", "http"] : ["http", "sse"];
    let first: McpFailure | undefined;
    const deadline = Date.now() + timeoutMs;
    for (const kind of order) {
      const left = deadline - Date.now();
      // 第二种传输至少给几秒：第一种把时间用完时，也要有机会试一下
      const budget = kind === order[0] ? left : Math.max(left, 5000);
      const seen: { value?: { resourceMetadataUrl?: URL; scope?: string } } = {};
      const fetchFn = challengeFetch(target.fetch ?? fetch, seen);
      const requestInit: RequestInit = { headers: target.headers ?? {} };
      const transport: Transport =
        kind === "http"
          ? new StreamableHTTPClientTransport(url, { requestInit, fetch: fetchFn as any, ...(target.auth ? { authProvider: target.auth } : {}) })
          : new SSEClientTransport(url, { requestInit, fetch: fetchFn as any, eventSourceInit: { fetch: fetchFn as any }, ...(target.auth ? { authProvider: target.auth } : {}) });
      const client = McpSession.newClient();
      const session = new McpSession(client, transport);
      session.usedSse = kind === "sse";
      try {
        await withTimeout(client.connect(transport, { timeout: budget }), budget + 500, () => void transport.close().catch(() => {}));
        session.watch();
        return session;
      } catch (e) {
        void transport.close().catch(() => {});
        const failure = failureOf(e, seen);
        // 凭证被拒不是传输的问题：不用再试另一种
        if (failure.kind === "unauthorized") throw failure;
        first ??= failure;
      }
    }
    throw first ?? new McpFailure("unreachable", "Could not reach the server.");
  }

  private static async openStdio(target: StdioTarget, timeoutMs: number): Promise<McpSession> {
    const env: Record<string, string> = { ...getDefaultEnvironment(), PATH: await userPath(), ...proxyEnv(), ...(target.env ?? {}) };
    const transport = new StdioClientTransport({ command: target.command, args: target.args, env, stderr: "pipe", ...(target.cwd ? { cwd: target.cwd } : {}) });
    const client = McpSession.newClient();
    const session = new McpSession(client, transport);
    transport.stderr?.on("data", (chunk: Buffer | string) => {
      session.output = (session.output + String(chunk)).slice(-OUTPUT_TAIL * 2);
    });
    try {
      await withTimeout(client.connect(transport, { timeout: timeoutMs }), timeoutMs + 500, () => void transport.close().catch(() => {}));
      session.watch();
      return session;
    } catch (e) {
      void transport.close().catch(() => {});
      const failure = failureOf(e, {}, session.outputTail());
      // 本地程序：超时、提前退出、说的不是 MCP，都是「启动失败」
      throw failure.kind === "spawn" ? failure : new McpFailure("spawn", failure.kind === "timeout" ? "The program did not start in time." : "The program exited or did not speak MCP.", 0, session.outputTail());
    }
  }

  private watch(): void {
    const prev = this.transport.onclose;
    this.transport.onclose = () => {
      this.closed = true;
      prev?.();
    };
  }

  async listTools(timeoutMs: number): Promise<RawTool[]> {
    try {
      const r = await this.client.listTools(undefined, { timeout: timeoutMs } as any);
      return (r.tools ?? []) as RawTool[];
    } catch (e) {
      throw failureOf(e, {}, this.outputTail());
    }
  }

  async callTool(name: string, args: Record<string, unknown>, opts: { timeoutMs: number; signal?: AbortSignal }): Promise<CallResult> {
    try {
      const r = await this.client.callTool({ name, arguments: args }, { timeout: opts.timeoutMs, signal: opts.signal } as any);
      return { text: contentText(r), isError: (r as any).isError === true };
    } catch (e) {
      const err = e as any;
      // 服务器回的 JSON-RPC 错误（参数不对、没有这个工具）：原话给模型，它能自己改
      if (typeof err?.code === "number" && err.code < 0 && typeof err?.message === "string" && !(e instanceof UnauthorizedError)) {
        return { text: redactText(err.message).slice(0, 2000), isError: true };
      }
      throw failureOf(e, {}, this.outputTail());
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.client.close().catch(() => {});
  }
}

/** 本地程序（npx 下载软件包）也要走用户配置的代理 */
function proxyEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy", "npm_config_registry", "UV_INDEX_URL", "PIP_INDEX_URL"]) {
    const v = process.env[k];
    if (v) out[k] = v;
  }
  return out;
}
