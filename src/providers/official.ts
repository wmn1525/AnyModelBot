/**
 * 官方 API：用户填自己的 Key，模型请求经内置网关直接发给模型厂商，不经过 OKINTO。
 * - 地址写死在这张表里：界面和接口只能选表里的厂商，不能填地址，Key 不会被发到别的地方。
 * - Key 和 OKINTO 的一样，只存在内置网关的隔离配置里（magpie/supervisor.ts）。
 * - 网关里的 provider id 是 official-<id>，模型 id 是 official-<id>/<厂商的模型名>：和 OKINTO 的同名模型分得开，
 *   也不会被当成 OKINTO 的 openai/x 这种写法。
 */
import { t } from "../i18n/index.js";

/** 代理用哪个接口（和 OKINTO 目录的 supported_endpoint_types 同一套写法，host.ts 的 agentApi 读它） */
export type OfficialApi = "openai-response" | "anthropic" | "openai";

export interface OfficialProvider {
  /** 同时也是内置网关的预设名：上下文长度、价格这些模型资料由网关按预设给 */
  id: string;
  name: string;
  /** 同一家在国内和海外是两套账号，Key 不通用 */
  region?: "cn" | "global";
  /** 去哪里拿 Key */
  keysUrl: string;
  chat?: string;
  responses?: string;
  anthropic?: string;
  /**
   * 代理走哪个接口。OpenAI 用 Responses、Anthropic 用 Messages，这是它们自己的原生接口；其余厂商的 Responses、
   * Messages 是兼容层，Chat Completions 最稳。这里选错了也不致命：host.ts 被拒后会回退到 Chat。
   */
  api: OfficialApi;
}

export const OFFICIAL_PROVIDERS: readonly OfficialProvider[] = [
  { id: "openai", name: "OpenAI", keysUrl: "https://platform.openai.com/api-keys", chat: "https://api.openai.com/v1", responses: "https://api.openai.com/v1", api: "openai-response" },
  { id: "anthropic", name: "Anthropic", keysUrl: "https://console.anthropic.com/settings/keys", anthropic: "https://api.anthropic.com", api: "anthropic" },
  { id: "google", name: "Google Gemini", keysUrl: "https://aistudio.google.com/apikey", chat: "https://generativelanguage.googleapis.com/v1beta/openai", api: "openai" },
  { id: "xai", name: "xAI", keysUrl: "https://console.x.ai", chat: "https://api.x.ai/v1", api: "openai" },
  { id: "deepseek", name: "DeepSeek", keysUrl: "https://platform.deepseek.com/api_keys", chat: "https://api.deepseek.com/v1", api: "openai" },
  { id: "moonshot-cn", name: "Kimi", region: "cn", keysUrl: "https://platform.moonshot.cn/console/api-keys", chat: "https://api.moonshot.cn/v1", api: "openai" },
  { id: "moonshot", name: "Kimi", region: "global", keysUrl: "https://platform.moonshot.ai/console/api-keys", chat: "https://api.moonshot.ai/v1", api: "openai" },
  { id: "zhipu", name: "GLM", region: "cn", keysUrl: "https://open.bigmodel.cn/usercenter/proj-mgmt/apikeys", chat: "https://open.bigmodel.cn/api/paas/v4", api: "openai" },
  { id: "zai", name: "GLM", region: "global", keysUrl: "https://z.ai/manage-apikey/apikey-list", chat: "https://api.z.ai/api/paas/v4", api: "openai" },
  { id: "qwen-cn", name: "Qwen", region: "cn", keysUrl: "https://bailian.console.aliyun.com/?tab=model#/api-key", chat: "https://dashscope.aliyuncs.com/compatible-mode/v1", api: "openai" },
  { id: "qwen", name: "Qwen", region: "global", keysUrl: "https://modelstudio.console.alibabacloud.com/?tab=playground#/api-key", chat: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", api: "openai" },
  { id: "minimax-cn", name: "MiniMax", region: "cn", keysUrl: "https://platform.minimaxi.com/user-center/basic-information/interface-key", chat: "https://api.minimaxi.com/v1", api: "openai" },
  { id: "minimax", name: "MiniMax", region: "global", keysUrl: "https://platform.minimax.io/user-center/basic-information/interface-key", chat: "https://api.minimax.io/v1", api: "openai" },
  { id: "mistral", name: "Mistral", keysUrl: "https://console.mistral.ai/api-keys", chat: "https://api.mistral.ai/v1", api: "openai" },
];

export const OFFICIAL_PREFIX = "official-";

export const officialProviderId = (id: string) => OFFICIAL_PREFIX + id;

export function officialProvider(id: string): OfficialProvider | undefined {
  return OFFICIAL_PROVIDERS.find((p) => p.id === id);
}

/** 展示用的名字：同一家分国内和海外时带上地区（托盘、日志、错误信息；界面自己翻译地区） */
export function officialLabel(p: OfficialProvider): string {
  return p.region ? `${p.name} (${p.region === "cn" ? "China" : "Global"})` : p.name;
}

/** official-openai/gpt-x → OpenAI 这一项；不是官方 API 的模型（或厂商不在表里）→ undefined */
export function officialOf(model: string): OfficialProvider | undefined {
  const m = model.trim();
  if (!m.startsWith(OFFICIAL_PREFIX)) return undefined;
  const i = m.indexOf("/");
  return i > 0 ? officialProvider(m.slice(OFFICIAL_PREFIX.length, i)) : undefined;
}

/** 厂商自己的模型名：official-openai/gpt-x → gpt-x；不是官方 API 的模型原样返回 */
export function officialModelName(model: string): string {
  const m = model.trim();
  return officialOf(m) ? m.slice(m.indexOf("/") + 1) : m;
}

/** 交给内置网关的地址。AMB_OFFICIAL_BASE_URL 仅供开发/测试（所有厂商都指向本地 mock，形如 http://127.0.0.1:8080/v1），界面无法设置 */
export function officialBases(p: OfficialProvider, env: NodeJS.ProcessEnv = process.env): { chat?: string; responses?: string; anthropic?: string } {
  const override = env.AMB_OFFICIAL_BASE_URL?.trim().replace(/\/+$/, "");
  const pick = (url: string | undefined, to: string | undefined) => (url && override ? to : url);
  return {
    ...(p.chat ? { chat: pick(p.chat, override) } : {}),
    ...(p.responses ? { responses: pick(p.responses, override) } : {}),
    ...(p.anthropic ? { anthropic: pick(p.anthropic, override?.replace(/\/v1$/, "")) } : {}),
  };
}

/** 不能对话的模型：厂商的模型列表里混着语音、图片、视频、向量、审核这些 */
const NON_CHAT =
  /(^|[-_./])(tts|stt|asr|whisper|transcribe|realtime|audio|speech|music|image|images|imagen|dall-e|cogview|seedream|seedance|sora|veo|wan|kling|hailuo|video|embedding|embeddings|embed|rerank|moderation|aqa|ocr)([-_./\d]|$)/i;
/** OpenAI 这样的日期快照（gpt-x-2025-08-07）：不带日期的那个也在列表里时不再列出，否则同一个模型要占好几行 */
const DATED = /-\d{4}-\d{2}-\d{2}$/;

/** 从厂商列出的模型里挑出放进选择器的：网关对没有 picks 的服务商只放出前 24 个，所以由我们写明（和 OKINTO 一样） */
export function officialPicks(listed: readonly string[]): string[] {
  const all = new Set(listed);
  return listed.filter((m) => !NON_CHAT.test(m) && !(DATED.test(m) && all.has(m.replace(DATED, ""))));
}

export type OfficialFailure = "invalid_key" | "network" | "rate_limited" | "upstream";

/**
 * 网关问模型列表失败时的说明：一律 HTTP 400，错误文字里才有厂商的状态码和原话。Key 无效时各家说法不同
 * （Google、xAI 回的是 400 不是 401），都按文字认。原话可能带着 Key 的片段，先去掉。
 */
export function officialFailure(p: OfficialProvider, detail: string, key: string): { code: OfficialFailure; message: string } {
  const name = officialLabel(p);
  if (/\b40[13]\b|unauthori[sz]ed|forbidden|invalid[ _-]*(api[ _-]*)?(key|auth)|incorrect api key|valid api key|api key not valid|authentication|令牌已过期|未授权/i.test(detail)) {
    return { code: "invalid_key", message: t("official.invalid_key", { name }) };
  }
  if (/\b429\b|rate.?limit|too many requests/i.test(detail)) return { code: "rate_limited", message: t("official.rate_limited", { name }) };
  if (/no such host|connection refused|timeout|timed out|deadline exceeded|network is unreachable|connection reset|\btls\b|\beof\b/i.test(detail)) {
    return { code: "network", message: t("official.network", { name }) };
  }
  // 只有这一种会把原话给用户看，所以脱敏放在这里
  const text = (key ? detail.split(key).join("***") : detail).replace(/\s+/g, " ").trim();
  return { code: "upstream", message: t("official.upstream", { name, detail: text.replace(/ — type its model ids.*$/, "").slice(0, 240) }) };
}
