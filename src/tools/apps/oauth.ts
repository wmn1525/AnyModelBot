/**
 * 远程 MCP 的授权登录：OAuth 2.0 授权码，默认 PKCE（S256），支持动态注册；服务不支持动态注册时用预注册的客户端，
 * 服务不支持 PKCE 时可以关掉。授权服务器从 MCP 服务器发现（RFC 9728 → RFC 8414 / OIDC），发现用官方 SDK 的实现
 * （各家把元数据放在哪条路径上有好几种写法）；注册、换令牌、续期这几步是普通的表单请求，自己发：
 * 这样对回包宽容一些（只要有 client_id / access_token 就认），PKCE 也能关。
 *
 * 流程由主程序来做（运行时自己做不了授权登录）：start 回授权页地址，用户在浏览器里同意后跳回
 * <回调地址>?code=…&state=…，finish 用一次性的 state 找回这次流程。state 十分钟过期，用过即弃。
 * 令牌由调用方存进凭证文件（secrets.ts），这里不落盘。
 *
 * 续期：同一条连接的续期排队做（有的服务每次续期都会轮换 refresh token，旧的再用会吊销整个授权）。
 */
import crypto from "node:crypto";
import { discoverOAuthServerInfo } from "@modelcontextprotocol/client";
import { logger, registerSecret } from "../../log.js";
import type { OAuthSettings } from "./types.js";

const log = logger("apps.oauth");

const TIMEOUT_MS = 30_000;
/** 授权页最多等多久 */
export const AUTH_TTL_MS = 10 * 60_000;
const DISCOVERY_TTL_MS = 60 * 60_000;

/**
 * no-oauth 这台服务器没有授权登录 · registration 不支持动态注册（要填客户端 ID）· pkce 服务不接受 PKCE ·
 * declined 用户拒绝 · expired 链接过期或不认识 · exchange 换令牌失败 · unavailable 授权服务连不上
 */
export type OAuthFailCode = "no-oauth" | "registration" | "pkce" | "declined" | "expired" | "exchange" | "unavailable";

export class OAuthFlowError extends Error {
  constructor(
    readonly code: OAuthFailCode,
    message: string,
  ) {
    super(message);
    this.name = "OAuthFlowError";
  }
}

export interface OAuthClient {
  clientId: string;
  clientSecret?: string;
  /** 动态注册时登记的回调地址 */
  redirectUri?: string;
  /** 这个客户端是在哪个授权服务器注册的 */
  issuer?: string;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  /** 毫秒时间戳；0 = 服务器没说 */
  expiresAt: number;
  scope?: string;
}

interface Discovered {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint?: string;
  tokenAuthMethods: string[];
  challengeMethods?: string[];
  scopesSupported?: string[];
  /** RFC 8707 的 resource：发现到受保护资源的元数据时才带 */
  resource?: string;
  at: number;
}

interface Flow {
  key: string;
  serverUrl: string;
  redirectUri: string;
  verifier?: string;
  client: OAuthClient;
  discovered: Discovered;
  expires: number;
}

export interface OAuthChallenge {
  resourceMetadataUrl?: URL;
  scope?: string;
}

const b64url = (b: Buffer) => b.toString("base64url");

export class OAuthManager {
  private flows = new Map<string, Flow>();
  private discovered = new Map<string, Discovered>();
  private refreshing = new Map<string, Promise<OAuthTokens>>();

  constructor(private o: { fetch?: () => typeof fetch | undefined; now?: () => number } = {}) {}

  private now(): number {
    return (this.o.now ?? Date.now)();
  }

  private send(): typeof fetch {
    return this.o.fetch?.() ?? fetch;
  }

  private sweep(): void {
    const now = this.now();
    for (const [state, f] of this.flows) if (f.expires <= now) this.flows.delete(state);
  }

  /** 这台 MCP 服务器的授权服务器；没有授权登录时是 undefined */
  async discover(serverUrl: string, challenge?: OAuthChallenge): Promise<Discovered | undefined> {
    const cached = this.discovered.get(serverUrl);
    if (cached && this.now() - cached.at < DISCOVERY_TTL_MS) return cached;
    const fetchFn = this.send() as any;
    let info: Awaited<ReturnType<typeof discoverOAuthServerInfo>> | undefined;
    try {
      info = await discoverOAuthServerInfo(serverUrl, { resourceMetadataUrl: challenge?.resourceMetadataUrl, fetchFn });
    } catch (e) {
      // 有的授权服务器元数据里的 issuer 和地址对不上：再宽容地试一次（地址是用户自己填的或内置清单里的）
      try {
        info = await discoverOAuthServerInfo(serverUrl, { resourceMetadataUrl: challenge?.resourceMetadataUrl, fetchFn, skipIssuerMetadataValidation: true });
        log.warn("authorization server metadata accepted without issuer check", { message: (e as Error).message.slice(0, 200) });
      } catch (e2) {
        const message = (e2 as Error).message ?? "";
        if (/fetch failed|ECONN|ENOTFOUND|network|timeout|timed out/i.test(message)) throw new OAuthFlowError("unavailable", "The authorization service could not be reached.");
        return undefined;
      }
    }
    const m = info?.authorizationServerMetadata as any;
    if (!m?.authorization_endpoint || !m?.token_endpoint) return undefined;
    const out: Discovered = {
      issuer: String(m.issuer ?? info!.authorizationServerUrl),
      authorizationEndpoint: String(m.authorization_endpoint),
      tokenEndpoint: String(m.token_endpoint),
      registrationEndpoint: m.registration_endpoint ? String(m.registration_endpoint) : undefined,
      tokenAuthMethods: Array.isArray(m.token_endpoint_auth_methods_supported) ? m.token_endpoint_auth_methods_supported.map(String) : [],
      challengeMethods: Array.isArray(m.code_challenge_methods_supported) ? m.code_challenge_methods_supported.map(String) : undefined,
      scopesSupported: Array.isArray((info?.resourceMetadata as any)?.scopes_supported) ? (info!.resourceMetadata as any).scopes_supported.map(String) : undefined,
      resource: (info?.resourceMetadata as any)?.resource ? String((info!.resourceMetadata as any).resource) : undefined,
      at: this.now(),
    };
    this.discovered.set(serverUrl, out);
    return out;
  }

  private async register(d: Discovered, redirectUri: string, scope?: string): Promise<OAuthClient> {
    if (!d.registrationEndpoint) throw new OAuthFlowError("registration", "The service does not accept new clients; a client ID is needed.");
    let res: Response;
    try {
      res = await this.send()(d.registrationEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          client_name: "AnyModelBot",
          redirect_uris: [redirectUri],
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
          ...(scope ? { scope } : {}),
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new OAuthFlowError("unavailable", "The authorization service could not be reached.");
    }
    const data: any = await res.json().catch(() => undefined);
    if (!res.ok || typeof data?.client_id !== "string") {
      log.warn("dynamic client registration refused", { status: res.status });
      throw new OAuthFlowError("registration", "The service refused to register this app; a client ID is needed.");
    }
    if (typeof data.client_secret === "string" && data.client_secret) registerSecret(data.client_secret);
    return { clientId: data.client_id, ...(typeof data.client_secret === "string" && data.client_secret ? { clientSecret: data.client_secret } : {}), redirectUri, issuer: d.issuer };
  }

  /**
   * 开始授权：回授权页地址和 state。known 是这条连接上次用的客户端（动态注册的要回调地址一样才能再用）。
   * settings.clientId 给了就用预注册的客户端（clientSecret 可有可无）。
   */
  async start(input: { key: string; serverUrl: string; redirectUri: string; settings: OAuthSettings; clientSecret?: string; known?: OAuthClient; challenge?: OAuthChallenge }): Promise<{ state: string; url: string }> {
    this.sweep();
    const d = await this.discover(input.serverUrl, input.challenge);
    if (!d) throw new OAuthFlowError("no-oauth", "This server does not offer sign-in.");
    const scope = input.settings.scopes?.length ? input.settings.scopes.join(" ") : input.challenge?.scope || d.scopesSupported?.join(" ") || undefined;
    let client: OAuthClient;
    if (input.settings.clientId) client = { clientId: input.settings.clientId, ...(input.clientSecret ? { clientSecret: input.clientSecret } : {}), issuer: d.issuer };
    else if (input.known?.clientId && input.known.redirectUri === input.redirectUri && (!input.known.issuer || input.known.issuer === d.issuer)) client = input.known;
    else client = await this.register(d, input.redirectUri, scope);

    const pkce = input.settings.pkce !== false;
    if (pkce && d.challengeMethods && !d.challengeMethods.includes("S256")) throw new OAuthFlowError("pkce", "The service does not support PKCE (S256).");
    const state = b64url(crypto.randomBytes(24));
    const verifier = pkce ? b64url(crypto.randomBytes(32)) : undefined;
    const url = new URL(d.authorizationEndpoint);
    const q = url.searchParams;
    q.set("response_type", "code");
    q.set("client_id", client.clientId);
    q.set("redirect_uri", input.redirectUri);
    q.set("state", state);
    if (verifier) {
      q.set("code_challenge", b64url(crypto.createHash("sha256").update(verifier).digest()));
      q.set("code_challenge_method", "S256");
    }
    if (scope) q.set("scope", scope);
    if (d.resource) q.set("resource", d.resource);
    // 同一条连接只留最新的一次：重新打开授权页时，旧的 state 作废
    for (const [s, f] of this.flows) if (f.key === input.key) this.flows.delete(s);
    this.flows.set(state, { key: input.key, serverUrl: input.serverUrl, redirectUri: input.redirectUri, verifier, client, discovered: d, expires: this.now() + AUTH_TTL_MS });
    return { state, url: url.toString() };
  }

  /** state 属于哪次连接（回调来了、或用户粘贴回跳地址时找它） */
  keyOf(state: string): string | undefined {
    this.sweep();
    return this.flows.get(state)?.key;
  }

  /** 关掉弹窗：这次授权作废，之后回调来了也不会冒出一个连接 */
  cancel(key: string): void {
    for (const [s, f] of this.flows) if (f.key === key) this.flows.delete(s);
  }

  async finish(params: { state?: string | null; code?: string | null; error?: string | null }): Promise<{ key: string; tokens: OAuthTokens; client: OAuthClient }> {
    this.sweep();
    const state = String(params.state ?? "");
    const flow = this.flows.get(state);
    if (!flow) throw new OAuthFlowError("expired", "This sign-in link has expired.");
    this.flows.delete(state);
    if (params.error) throw new OAuthFlowError("declined", "The authorization was declined.");
    if (!params.code) throw new OAuthFlowError("exchange", "The authorization did not complete.");
    const form = new URLSearchParams({ grant_type: "authorization_code", code: params.code, redirect_uri: flow.redirectUri });
    if (flow.verifier) form.set("code_verifier", flow.verifier);
    if (flow.discovered.resource) form.set("resource", flow.discovered.resource);
    const tokens = await this.token(flow.discovered, flow.client, form);
    return { key: flow.key, tokens, client: flow.client };
  }

  /** 续期。同一个 key 同时只做一次；失败抛 OAuthFlowError（exchange = 授权已失效，要重新授权；unavailable = 稍后再试） */
  refresh(input: { key: string; serverUrl: string; client: OAuthClient; refreshToken: string }): Promise<OAuthTokens> {
    const running = this.refreshing.get(input.key);
    if (running) return running;
    const p = (async () => {
      const d = await this.discover(input.serverUrl);
      if (!d) throw new OAuthFlowError("unavailable", "The authorization service could not be reached.");
      const form = new URLSearchParams({ grant_type: "refresh_token", refresh_token: input.refreshToken });
      if (d.resource) form.set("resource", d.resource);
      const next = await this.token(d, input.client, form);
      return { ...next, refreshToken: next.refreshToken ?? input.refreshToken };
    })().finally(() => this.refreshing.delete(input.key));
    this.refreshing.set(input.key, p);
    return p;
  }

  private async token(d: Discovered, client: OAuthClient, form: URLSearchParams): Promise<OAuthTokens> {
    const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
    // 有密钥的客户端：服务器只收 Basic 时用 Basic，其余放表单里；没有密钥的公开客户端只带 client_id
    if (client.clientSecret && d.tokenAuthMethods.includes("client_secret_basic") && !d.tokenAuthMethods.includes("client_secret_post")) {
      headers.authorization = `Basic ${Buffer.from(`${encodeURIComponent(client.clientId)}:${encodeURIComponent(client.clientSecret)}`).toString("base64")}`;
    } else {
      form.set("client_id", client.clientId);
      if (client.clientSecret) form.set("client_secret", client.clientSecret);
    }
    let res: Response;
    try {
      res = await this.send()(d.tokenEndpoint, { method: "POST", headers, body: form.toString(), signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw new OAuthFlowError("unavailable", "The authorization service could not be reached.");
    }
    const data: any = await res.json().catch(() => undefined);
    if (!res.ok || typeof data?.access_token !== "string" || !data.access_token) {
      log.warn("token request refused", { status: res.status, error: typeof data?.error === "string" ? data.error.slice(0, 80) : undefined });
      // 5xx 是服务一时不行；4xx（invalid_grant 等）是授权不再有效
      if (res.status >= 500) throw new OAuthFlowError("unavailable", "The authorization service is temporarily unavailable.");
      throw new OAuthFlowError("exchange", "The authorization is no longer valid.");
    }
    registerSecret(data.access_token);
    if (typeof data.refresh_token === "string") registerSecret(data.refresh_token);
    const seconds = Number(data.expires_in);
    return {
      accessToken: data.access_token,
      ...(typeof data.refresh_token === "string" && data.refresh_token ? { refreshToken: data.refresh_token } : {}),
      expiresAt: Number.isFinite(seconds) && seconds > 0 ? this.now() + seconds * 1000 : 0,
      ...(typeof data.scope === "string" && data.scope ? { scope: data.scope } : {}),
    };
  }
}
