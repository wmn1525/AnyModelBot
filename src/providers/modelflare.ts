/**
 * OKINTO New API integration. Existing modelflare provider IDs, routes and config
 * keys remain stable so saved bots and conversations continue to work.
 * Models, metadata and billing all come from the configured New API origin.
 */
import { t } from "../i18n/index.js";

// 保留历史配置值；auto/global 都指向主域名，cn 指向 origin，不代表地域或质量差异。
export type ModelflareLine = "auto" | "global" | "cn" | "cf";

export const MODELFLARE_LINES: Record<Exclude<ModelflareLine, "auto">, string> = {
  global: "https://api.okinto.com/v1",
  cn: "https://api.okinto.com/v1",
  cf: "https://api.okinto.com/v1",
};

export const MODELFLARE_PROVIDER = "modelflare";

/** New API console origin. */
export const MODELFLARE_WEB = "https://api.okinto.com";

/**
 * 账户登录（OIDC 授权码 + PKCE，RFC 8252 原生应用）。client_id 是公开值：本程序是公共客户端，
 * 没有也不需要客户端密钥；回调到本机 127.0.0.1 的临时端口。
 */
export const MODELFLARE_CLIENT_ID = "anymodel-bot";
export const MODELFLARE_SCOPES = "openid profile offline_access account api_keys";

/**
 * 注册来源（OKINTO 后台按 utm_source 统计从本程序来的注册与充值）。
 * 全项目统一：utm_source=anymodelbot&utm_campaign=amb_<位置>。应用内 amb_signup / amb_topup / amb_console …，
 * README 与仓库文档 amb_readme，官网 amb_homepage。
 */
export const UTM = { utm_source: "anymodelbot" } as const;

/** 开发/测试：AMB_MODELFLARE_ISSUER 把登录与账户接口指向本地 mock（界面无法设置） */
export function modelflareIssuer(env: NodeJS.ProcessEnv = process.env): string {
  return (env.AMB_MODELFLARE_ISSUER?.trim() || new URL(modelflareBaseUrl("auto", env)).origin).replace(/\/+$/, "");
}

/** 官网页面链接，带上来源参数 */
export function webUrl(pathname: string, campaign?: string): string {
  const u = new URL(pathname, MODELFLARE_WEB);
  for (const [k, v] of Object.entries(UTM)) u.searchParams.set(k, v);
  if (campaign) u.searchParams.set("utm_campaign", campaign);
  return u.toString();
}

export const SIGNUP_URL = webUrl("/register", "amb_signup");
export const TOPUP_URL = webUrl("/console/topup", "amb_topup");
export const CONSOLE_URL = webUrl("/console", "amb_console");

/**
 * Integration version header. Versions must contain 1–3 numeric segments.
 */
export function skillHeader(version: string): Record<string, string> {
  return /^\d{1,4}(\.\d{1,4}){0,2}$/.test(version) ? { "X-AnyModelBot-Version": version } : {};
}

/** 每个开启了预算的机器人有自己的内置网关 provider（自己的 API Key） */
export const BOT_PROVIDER_PREFIX = "mfb-";
export const botProviderId = (botId: string) => BOT_PROVIDER_PREFIX + botId;

const QUALIFIED = /^(modelflare|mfb-[A-Za-z0-9_-]+)\//;

/** 去掉内置网关的 provider 前缀：modelflare/openai/x、mfb-abc/openai/x → openai/x */
export function bareModel(model: string): string {
  return model.replace(QUALIFIED, "");
}

/** 某个机器人专属 provider 列出的模型（模型列表里不展示，避免同一模型出现多次） */
export function isBotProviderModel(model: string): boolean {
  return model.startsWith(BOT_PROVIDER_PREFIX) && model.includes("/");
}

/**
 * 把模型 id 限定到某个 provider。每个请求都显式带 provider：多个 provider 提供同名模型时，
 * 不带前缀的 id 会被内置网关当成一组在它们之间路由，预算就管不住了。
 */
export function routeModel(model: string, providerId: string): string {
  const bare = bareModel(model.trim());
  return bare ? `${providerId}/${bare}` : bare;
}

export function normalizeLine(v: unknown): ModelflareLine {
  if (v === "origin") return "cn";
  return v === "global" || v === "cn" || v === "cf" ? v : "auto";
}

/** 线路 → 基址。AMB_MODELFLARE_BASE_URL 仅供开发/测试（指向本地 mock），不经界面设置。 */
export function modelflareBaseUrl(line: ModelflareLine, env: NodeJS.ProcessEnv = process.env): string {
  const override = env.AMB_NEWAPI_BASE_URL?.trim() || env.AMB_MODELFLARE_BASE_URL?.trim();
  if (override) {
    const base = override.replace(/\/+$/, "");
    return base.endsWith("/v1") ? base : `${base}/v1`;
  }
  return line === "cn" ? MODELFLARE_LINES.cn : MODELFLARE_LINES.global;
}

/**
 * 交给内置网关的三种对话接口地址：Chat Completions、Responses 都在 {base}（…/v1）下，Anthropic Messages
 * 的地址是根（网关自己拼 /v1/messages）。网关按模型挑：Claude 走 Messages（提示缓存和思考过程只有它保留），
 * 其余走 Chat；上游说某个模型不在这个接口上时，网关换另一个接口再试并记住。
 */
export function modelflareApiBases(baseUrl: string): { chat: string; responses: string; anthropic: string } {
  return { chat: baseUrl, responses: baseUrl, anthropic: baseUrl.replace(/\/v1\/?$/, "") };
}

export type VerifyFailure = "invalid_key" | "forbidden" | "rate_limited" | "upstream" | "network" | "bad_response";

export type VerifyResult =
  | {
      ok: true;
      models: string[];
      /**
       * 能对话的模型（OKINTO 标为 kind=text 的；旧版网关没有 kind 时为全部）。
       * 连接时把它们全部写进内置网关的 picks：网关对超过 24 个模型、又没有 picks 的服务商
       * 只放出列表前 24 个，而 OKINTO 的列表按字母排，后面的模型会被截掉。
       */
      chatModels: string[];
    }
  | { ok: false; code: VerifyFailure; status?: number; message: string };

/** 校验密钥：只发一次 GET /models，不重试、不换线路。 */
export async function verifyModelflareKey(
  baseUrl: string,
  apiKey: string,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number; line?: ModelflareLine } = {},
): Promise<VerifyResult> {
  const f = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await f(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    });
  } catch (e) {
    const host = safeHost(baseUrl);
    return {
      ok: false,
      code: "network",
      message: t("modelflare.unreachable", { host, reason: (e as Error).name === "TimeoutError" ? t("modelflare.timeout") : (e as Error).message }),

    };
  }
  if (res.status === 401) return { ok: false, code: "invalid_key", status: 401, message: t("modelflare.invalid_key") };
  if (res.status === 403) return { ok: false, code: "forbidden", status: 403, message: t("modelflare.forbidden") };
  if (res.status === 429) return { ok: false, code: "rate_limited", status: 429, message: t("modelflare.unavailable", { status: 429, retry: retryAfter(res) }) };
  if (!res.ok) return { ok: false, code: "upstream", status: res.status, message: t("modelflare.unavailable", { status: res.status, retry: "" }) };
  try {
    const body = (await res.json()) as { data?: Array<{ id?: unknown; kind?: unknown }> };
    if (!Array.isArray(body.data)) throw new Error("no data[]");
    const rows = body.data.map((m) => ({ id: String(m.id ?? ""), kind: typeof m.kind === "string" ? m.kind : "" })).filter((m) => m.id);
    // New API usually omits kind. Its public catalog identifies endpoints that are media-only.
    const media = new Set<string>();
    if (!rows.some((m) => m.kind)) {
      try {
        const pricing = await f(`${new URL(baseUrl).origin}/api/pricing`, { signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000) });
        if (pricing.ok) {
          const catalog = await pricing.json() as { data?: Array<{ model_name: string; supported_endpoint_types?: string[] }> };
          for (const e of Array.isArray(catalog.data) ? catalog.data : []) {
            const endpoints = e.supported_endpoint_types ?? [];
            if (endpoints.length && endpoints.every((v) => /image|video|audio|embedding|rerank/i.test(v))) media.add(e.model_name);
          }
        }
      } catch { /* The authorized model list remains usable when pricing is unavailable. */ }
    }
    const classified = rows.some((m) => m.kind);
    return {
      ok: true,
      models: rows.map((m) => m.id).sort(),
      chatModels: rows.filter((m) => (!classified || m.kind === "text") && !media.has(m.id)).map((m) => m.id).sort(),
    };
  } catch {
    return { ok: false, code: "bad_response", status: res.status, message: t("modelflare.bad_models") };
  }
}

function retryAfter(res: Response): string {
  const s = res.headers.get("retry-after");
  return s ? t("modelflare.retry_after", { s }) : "";
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** 只用于展示的密钥尾号 */
export function keyTail(key: string): string {
  return key.length > 4 ? key.slice(-4) : "";
}

export interface KeyBalance {
  available: number | null;
  used: number;
  unit: string;
  scope?: "account" | "token" | "billing";
  unlimited?: boolean;
}

/** New API: billing totals use currency units; total_usage uses cents. */
export async function fetchKeyBalance(baseUrl: string, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<KeyBalance> {
  const origin = new URL(baseUrl).origin;
  const headers = { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };
  const get = async (url: string, auth = true): Promise<any> => {
    const res = await fetchImpl(url, { headers: auth ? headers : { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(t("modelflare.balance_failed", { status: res.status }));
    const body = await res.json() as any;
    if (body.error || body.success === false || body.code === false) throw new Error(t("modelflare.bad_balance"));
    return body;
  };
  const numeric = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
  const [subscription, usage, status] = await Promise.allSettled([
    get(`${baseUrl}/dashboard/billing/subscription`),
    get(`${baseUrl}/dashboard/billing/usage`),
    get(`${origin}/api/status`, false),
  ]);
  const site = status.status === "fulfilled" ? status.value.data : undefined;
  const unit = typeof site?.quota_display_type === "string" ? site.quota_display_type : "USD";
  if (subscription.status === "fulfilled" && usage.status === "fulfilled") {
    const limit = subscription.value.hard_limit_usd;
    const spent = usage.value.total_usage;
    if (numeric(limit) && numeric(spent) && limit >= 0 && spent >= 0) {
      const unlimited = limit === 100000000; // New API's unlimited-token billing sentinel.
      return { available: unlimited ? null : limit - spent / 100, used: spent / 100, unit, scope: "billing", unlimited };
    }
  }
  // Some deployments disable compatibility billing but allow read-only token usage.
  const token = (await get(`${origin}/api/usage/token`)).data;
  const wallet = token?.user_quota ?? token;
  const quotaPerUnit = site?.quota_per_unit;
  if (!numeric(quotaPerUnit) || quotaPerUnit <= 0 || !numeric(wallet?.total_available) || !numeric(wallet?.total_used)) {
    throw new Error(t("modelflare.bad_balance"));
  }
  const unlimited = !token.user_quota && token.unlimited_quota === true;
  return {
    available: unlimited ? null : wallet.total_available / quotaPerUnit,
    used: wallet.total_used / quotaPerUnit,
    // Raw quotas are converted to USD regardless of the site's display currency.
    unit: "USD", scope: token.user_quota ? "account" : "token", unlimited,
  };
}
