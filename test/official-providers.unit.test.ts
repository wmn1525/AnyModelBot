/** 官方 API：厂商表、模型 id、错误说明和模型资料。真实网关上的连接见 official-providers.integration.test.ts */
import { describe, it, expect } from "vitest";
import { gatewayModelInfo } from "../src/account/model-info.js";
import { agentApi } from "../src/agent/host.js";
import { OFFICIAL_PROVIDERS, officialBases, officialFailure, officialModelName, officialOf, officialPicks, officialProvider } from "../src/providers/official.js";
// @ts-expect-error 界面代码是不经构建的 JS
import { groupModels, modelFamily, officialSource, sameModel } from "../ui/lib/models.js";

const openai = officialProvider("openai")!;

describe("厂商表", () => {
  it("id 不重复；地址都是厂商自己的 https；每家至少一个对话地址和一个拿 Key 的链接", () => {
    expect(new Set(OFFICIAL_PROVIDERS.map((p) => p.id)).size).toBe(OFFICIAL_PROVIDERS.length);
    for (const p of OFFICIAL_PROVIDERS) {
      const urls = [p.chat, p.responses, p.anthropic].filter(Boolean) as string[];
      expect(urls.length, p.id).toBeGreaterThan(0);
      for (const u of [...urls, p.keysUrl]) expect(new URL(u).protocol, u).toBe("https:");
      expect(urls.join(" "), p.id).not.toMatch(/modelflare/i);
    }
  });

  it("代理的接口和地址对得上：走 Responses 的有 Responses 地址，走 Messages 的有 Messages 地址，其余有 Chat 地址", () => {
    for (const p of OFFICIAL_PROVIDERS) {
      if (p.api === "openai-response") expect(p.responses, p.id).toBeTruthy();
      else if (p.api === "anthropic") expect(p.anthropic, p.id).toBeTruthy();
      else expect(p.chat, p.id).toBeTruthy();
    }
    expect(agentApi(["openai-response"])).toBe("openai-responses");
    expect(agentApi(["anthropic"])).toBe("anthropic-messages");
    expect(agentApi(["openai"])).toBe("openai-completions");
  });

  it("测试用的地址覆盖只来自环境变量，覆盖后三种接口都指向它（Messages 是根地址）", () => {
    expect(officialBases(openai, {})).toEqual({ chat: "https://api.openai.com/v1", responses: "https://api.openai.com/v1" });
    expect(officialBases(officialProvider("anthropic")!, { AMB_OFFICIAL_BASE_URL: "http://127.0.0.1:1/v1/" })).toEqual({ anthropic: "http://127.0.0.1:1" });
    expect(officialBases(openai, { AMB_OFFICIAL_BASE_URL: "http://127.0.0.1:1/v1/" })).toEqual({ chat: "http://127.0.0.1:1/v1", responses: "http://127.0.0.1:1/v1" });
  });

  it("界面显示用的名字表和服务端的一致", () => {
    for (const p of OFFICIAL_PROVIDERS) expect(officialSource(`official-${p.id}/m`), p.id).toBe(p.name);
  });
});

describe("模型 id", () => {
  it("official-<厂商>/<模型> 才算官方 API；Modelflare 的 openai/x 写法不算", () => {
    expect(officialOf("official-openai/gpt-x")?.id).toBe("openai");
    expect(officialOf("official-moonshot-cn/kimi-k3")?.id).toBe("moonshot-cn");
    expect(officialOf("openai/gpt-x")).toBeUndefined();
    expect(officialOf("modelflare/gpt-x")).toBeUndefined();
    expect(officialOf("gpt-x")).toBeUndefined();
    expect(officialOf("official-nope/gpt-x")).toBeUndefined();
    expect(officialOf("official-openai")).toBeUndefined();
  });

  it("厂商自己的模型名只去掉一层前缀（模型名里还可能有斜杠）", () => {
    expect(officialModelName("official-google/models/gemini-3")).toBe("models/gemini-3");
    expect(officialModelName("modelflare/gpt-x")).toBe("modelflare/gpt-x");
  });

  it("选择器：官方的写明是哪一家，和 Modelflare 的同名模型是两项；归族、筛选照常", () => {
    const [[family, rows]] = groupModels(["official-openai/gpt-6", "modelflare/gpt-6"]);
    expect(family).toBe("GPT");
    expect(rows.map(([, label]: [string, string]) => label).sort()).toEqual(["gpt-6", "gpt-6 · OpenAI"]);
    expect(sameModel("official-openai/gpt-6", "modelflare/gpt-6")).toBe(false);
    expect(modelFamily("official-anthropic/claude-opus-5-5")).toBe("Claude");
    expect(groupModels(["official-openai/gpt-6", "claude-x"], "openai").map(([f]: [string]) => f)).toEqual(["GPT"]);
    expect(officialSource("gpt-6")).toBe("");
  });
});

describe("放进选择器的模型", () => {
  it("去掉不能对话的；带日期的快照在不带日期的那个也在时去掉，只有带日期的那个时留着", () => {
    expect(
      officialPicks([
        "gpt-6", "gpt-6-2026-01-01", "gpt-5-2025-08-07", "gpt-image-1", "gpt-4o-mini-tts", "gpt-4o-transcribe", "gpt-4o-realtime-preview", "gpt-4o-audio-preview", "sora-2", "whisper-1", "text-embedding-3-small", "omni-moderation-latest",
        "claude-opus-5-5", "claude-3-5-sonnet-20241022", "gemini-3.8-flash", "gemini-2.5-flash-image", "gemini-embedding-001", "imagen-4", "veo-3", "qwen3.8-max", "qwen-tts", "wan2.5-t2v", "mistral-large-latest", "mistral-embed", "mistral-ocr-latest", "speech-02-hd", "kimi-k3", "glm-5.3", "deepseek-v4-flash",
      ]),
    ).toEqual(["gpt-6", "gpt-5-2025-08-07", "claude-opus-5-5", "claude-3-5-sonnet-20241022", "gemini-3.8-flash", "qwen3.8-max", "mistral-large-latest", "kimi-k3", "glm-5.3", "deepseek-v4-flash"]);
  });
});

describe("连不上时的说明", () => {
  // 下面的原话是 2026-11-04 用假 Key 问各家官方接口时网关转述的
  const REAL = [
    "no model list: https://api.openai.com/v1/models: 401 Unauthorized (Incorrect API key provided: sk-inval************robe. You can find your API key at https://platform.openai.com/ac",
    "no model list: https://api.anthropic.com/models: 404 Not Found; https://api.anthropic.com/v1/models: 401 Unauthorized (invalid x-api-key) — type its model ids in by hand",
    "no model list: https://generativelanguage.googleapis.com/v1beta/openai/models: 400 Bad Request (Please pass a valid API key) — type its model ids in by hand",
    "no model list: https://api.x.ai/v1/models: 400 Bad Request (Incorrect API key provided. You can obtain an API key from https://console.x.ai.)",
    "no model list: https://open.bigmodel.cn/api/paas/v4/models: 401 Unauthorized (令牌已过期或验证不正确)",
    "no model list: https://api.mistral.ai/v1/models: 401 Unauthorized — type its model ids in by hand",
  ];
  it("各家说 Key 不对的方式不一样（Google、xAI 回 400），都认得出", () => {
    for (const text of REAL) expect(officialFailure(openai, text, "k").code, text).toBe("invalid_key");
  });

  it("限流、连不上、其他错误分开说；原话里的 Key 不外传", () => {
    expect(officialFailure(openai, "no model list: x: 429 Too Many Requests", "k").code).toBe("rate_limited");
    expect(officialFailure(openai, "Get https://api.openai.com/v1/models: dial tcp: lookup api.openai.com: no such host", "k").code).toBe("network");
    const r = officialFailure(openai, "no model list: x: 500 boom sk-secret-1 — type its model ids in by hand, or give the URL", "sk-secret-1");
    expect(r.code).toBe("upstream");
    expect(r.message).toContain("500 boom ***");
    expect(r.message).not.toContain("sk-secret-1");
    expect(r.message).not.toContain("type its model ids");
  });
});

describe("模型资料", () => {
  const rows = [
    { id: "official-openai/gpt-5.6-sol", context_length: 922000, reasoning: true, modalities: { input: ["text", "image"] }, pricing: { prompt: "0.000004", completion: "0.00002", input_cache_read: "0.0000004", input_cache_write: "0.000005" } },
    { id: "official-anthropic/claude-x", reasoning: true },
    { id: "official-deepseek/deepseek-v4-flash", reasoning: false, pricing: { prompt: "not a number" } },
    { id: "modelflare/gpt-5.6-sol", context_length: 1 },
    { id: 7 },
  ];
  const quality = { updatedAt: "", source: "", models: { "gpt-5.6-sol": { aa: "x", default: { intelligence: 50, costPerTask: 2 }, medium: { intelligence: 60, costPerTask: 3 } } } };
  const info = gatewayModelInfo(rows, (id) => officialOf(id)?.api, officialModelName, quality);

  it("只收官方 API 的模型；价格换算成美元 / 百万 tokens；官方价的倍率都是 1", () => {
    expect(Object.keys(info).sort()).toEqual(["official-anthropic/claude-x", "official-deepseek/deepseek-v4-flash", "official-openai/gpt-5.6-sol"]);
    expect(info["official-openai/gpt-5.6-sol"]).toMatchObject({
      context: 922000,
      vision: true,
      reasoning: true,
      price: { input: 4, output: 20 },
      rates: { input: 4, output: 20, cacheRead: 0.4, cacheWrite: 5 },
      endpoints: ["openai-response"],
      factors: { low_cost: 1, balanced: 1, stable: 1 },
      effort: true,
    });
  });

  it("智能指数按代理实际用的那档取：Responses 上的推理模型是 medium", () => {
    expect(info["official-openai/gpt-5.6-sol"].quality).toEqual({ intelligence: 60, costPerTask: 3 });
  });

  it("目录里没有的不瞎填：没有价格就没有 price；不推理的模型不显示推理强度", () => {
    const flash = info["official-deepseek/deepseek-v4-flash"];
    expect(flash.price).toBeUndefined();
    expect(flash.rates).toBeUndefined();
    expect(flash.effort).toBeUndefined();
    expect(flash.endpoints).toEqual(["openai"]);
  });
});
