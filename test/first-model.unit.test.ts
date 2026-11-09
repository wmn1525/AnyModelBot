// 首次使用的默认模型（第 8 项）：只从当前目录里选支持工具、预占和代表性任务都在体验额度内的；
// 优先 DeepSeek；没有合适的就不选（不替用户挑一个会马上耗尽额度的）。
import { describe, expect, it } from "vitest";
import { firstUseModel, FIRST_USE_BUDGET_USD } from "../src/account/first-model.js";
import type { ModelInfo } from "../src/account/model-info.js";

// 单价：美元 / 百万 tokens
const cheap: ModelInfo = { tools: true, context: 128_000, price: { input: 0.1, output: 0.4 } };
const pricey: ModelInfo = { tools: true, context: 200_000, price: { input: 15, output: 75 } };
const noTools: ModelInfo = { tools: false, price: { input: 0.01, output: 0.02 } };
const perCall: ModelInfo = { tools: true, price: { perCall: 0.001 } };

describe("首次使用的默认模型", () => {
  it("只选支持工具、按 token 计价、花费在体验额度内的；昂贵模型不选", () => {
    const pick = firstUseModel(["big-model", "small-model", "no-tools", "per-call"], { "big-model": pricey, "small-model": cheap, "no-tools": noTools, "per-call": perCall });
    expect(pick.model).toBe("small-model");
    expect(pick.reviewed.find((r) => r.model === "big-model")?.passed).toBe(false);
    expect(pick.reviewed.some((r) => r.model === "no-tools" || r.model === "per-call")).toBe(false);
  });

  it("通过的模型里优先 DeepSeek（不锁定型号），按当前目录里的名字", () => {
    const info = { "deepseek-v9-lite": { ...cheap, price: { input: 0.2, output: 0.8 } }, "other-mini": cheap };
    expect(firstUseModel(["other-mini", "modelflare/deepseek-v9-lite"], info).model).toBe("modelflare/deepseek-v9-lite");
  });

  it("目录里没有的不选；没有合适的返回空", () => {
    expect(firstUseModel(["big-model"], { "big-model": pricey, "small-model": cheap }).model).toBe("");
    expect(firstUseModel([], { "small-model": cheap }).model).toBe("");
  });

  it("已知余额比体验额度少时按余额算，余额为 0 时不预选", () => {
    expect(firstUseModel(["small-model"], { "small-model": cheap }, FIRST_USE_BUDGET_USD * 10).model).toBe("small-model");
    expect(firstUseModel(["small-model"], { "small-model": cheap }, 0).model).toBe("");
  });
});
