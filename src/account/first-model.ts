/**
 * 首次使用的默认模型（第一次接入、全局默认模型还空着时选一次；用户之后改了就不再动）。
 *
 * 规则（不按地区、注册来源区分；不打真实请求）：
 * 1. 只从当前服务实际列出的模型里选，而且模型资料里写明支持工具调用（代理任务要用工具）、有按 token 计的单价。
 * 2. 两道预算线，都按"体验额度"算：
 *    - 单轮预占：一轮请求按 首轮输入 tokens × 输入价 + 最大输出 tokens × 输出价 估算（服务端按最大输出预扣），
 *      不超过体验额度的 PER_TURN_SHARE，第一句话不会因为额度预占失败；
 *    - 代表性任务：REPRESENTATIVE_TASK 轮、每轮输入 / 输出 tokens 按下面的常量，总花费不超过体验额度的 TASK_SHARE。
 * 3. 通过两道线的模型里优先 DeepSeek（候选，不锁定型号），其次按代表性任务花费从低到高；同价时 AA 智能指数高的在前。
 * 4. 没有模型通过时返回空：不替用户选一个可能马上耗尽额度的模型，界面让用户自己选。
 *
 * 体验额度：账户余额已知时取余额与 FIRST_USE_BUDGET_USD 的较小值；不知道时取 FIRST_USE_BUDGET_USD。
 * FIRST_USE_BUDGET_USD 是产品策略假设（原需求里的 0.25 美元），不是对所有账号赠额的承诺。
 */
import { modelLimits } from "../agent/host.js";
import type { ModelInfo } from "./model-info.js";

export const FIRST_USE_BUDGET_USD = 0.25;
/** 代理首轮的输入：系统提示词 + 工具定义 + 用户第一句话（DSH 的工具定义本身就有一两万 tokens） */
export const FIRST_TURN_INPUT_TOKENS = 24_000;
/** 一个代表性的新手任务（比如"帮我写一段产品介绍并改一版"）：几轮来回，每轮带着上下文 */
export const REPRESENTATIVE_TASK = { turns: 4, inputTokens: 30_000, outputTokens: 2_000 } as const;
export const PER_TURN_SHARE = 0.4;
export const TASK_SHARE = 0.6;

export interface FirstModelPick {
  model: string;
  /** 每个候选的估算（便于日志和审查） */
  reviewed: Array<{ model: string; turnReserveUsd: number; taskUsd: number; passed: boolean }>;
}

const unitRates = (p: ModelInfo | undefined): { input: number; output: number } | undefined => {
  if (!p) return undefined;
  if (p.rates && Number.isFinite(p.rates.input) && Number.isFinite(p.rates.output)) return { input: p.rates.input, output: p.rates.output };
  const pr = p.price;
  if (!pr || pr.perCall !== undefined || pr.input === undefined || pr.output === undefined) return undefined;
  return { input: pr.input, output: pr.output };
};

export function firstUseModel(models: readonly string[], info: Record<string, ModelInfo>, balanceUsd?: number | null): FirstModelPick {
  const budget = typeof balanceUsd === "number" && Number.isFinite(balanceUsd) && balanceUsd >= 0 ? Math.min(balanceUsd, FIRST_USE_BUDGET_USD) : FIRST_USE_BUDGET_USD;
  const profile = (id: string) => info[id] ?? info[id.replace(/^[^/]+\//, "")] ?? info[id.split("/").pop() ?? id];
  const reviewed: FirstModelPick["reviewed"] = [];
  const passed: Array<{ model: string; taskUsd: number; intelligence: number; deepseek: boolean }> = [];
  for (const id of models) {
    const p = profile(id);
    const r = unitRates(p);
    if (!p || p.tools !== true || !r) continue;
    const maxOut = modelLimits(id, p.context).maxTokens;
    // 单价单位：美元 / 百万 tokens
    const turnReserveUsd = (FIRST_TURN_INPUT_TOKENS * r.input + maxOut * r.output) / 1e6;
    const taskUsd = (REPRESENTATIVE_TASK.turns * (REPRESENTATIVE_TASK.inputTokens * r.input + REPRESENTATIVE_TASK.outputTokens * r.output)) / 1e6;
    const ok = turnReserveUsd <= budget * PER_TURN_SHARE && taskUsd <= budget * TASK_SHARE;
    reviewed.push({ model: id, turnReserveUsd, taskUsd, passed: ok });
    if (ok) passed.push({ model: id, taskUsd, intelligence: p.quality?.intelligence ?? 0, deepseek: /^deepseek/i.test(id.split("/").pop() || "") });
  }
  passed.sort((a, b) => Number(b.deepseek) - Number(a.deepseek) || a.taskUsd - b.taskUsd || b.intelligence - a.intelligence || a.model.localeCompare(b.model));
  return { model: passed[0]?.model ?? "", reviewed };
}
