/** 代理回合里的一步（模型请求、工具调用、重试…）：存在 messages.activity 列，网页、渠道和任务导出都按它显示。由 agent/activity.ts 从 DSH 事件折叠出来。 */
export interface ActivityStep {
  /** 同一步的更新沿用同一个 id（工具调用 id、m<回合>.<步>…） */
  id: string;
  kind: "model" | "tool" | "retry" | "subagent" | "compact" | "error" | "job" | "steer";
  /** 模型名、工具名… */
  title: string;
  /** 一行摘要：命令、路径、回复开头、失败原因 */
  summary?: string;
  /** 展开后看到的参数 / 输出（已截断） */
  input?: string;
  output?: string;
  status: "running" | "ok" | "error";
  /** 没做完就被打断（回合出错、/stop、看门狗、超时）：说明时仍按"正在做"来说 */
  cut?: boolean;
  at: number;
  ms?: number;
  tokens?: { input?: number; output?: number };
  /** 用到了哪个技能或应用（见 StepUse）；没用到、或没用成且不必说明时没有 */
  use?: StepUse;
}

/**
 * 这一步用到了用户装的技能或连接的应用：网页对话的过程区据此写「正在使用技能 · …」「已使用：…」。
 * skill：name 是技能名（加载技能的 skill 工具）；app：app 是应用的 key（内置应用的 id 或 custom:<连接 id>，认不出时是模型传的原文），
 * tool 是工具名。reason：没用成的原因——loading 技能装了还没生效 · connection 连接要处理 · denied 用户没允许 · readonly 机器人只读 · failed 其他。
 */
export type StepUse =
  | { kind: "skill"; name: string; reason?: "loading" }
  | { kind: "app"; app: string; tool: string; reason?: "connection" | "denied" | "readonly" | "failed" };

/** 过程区折叠后那一行的一项：同一个技能、同一个应用只算一次，用成过一次就算用上了 */
export interface UsedItem {
  kind: "skill" | "app";
  /** 技能名，或应用的 key */
  name: string;
  status: "running" | "ok" | "error";
  reason?: string;
}

/** 升级前连好的 Notion / 飞书账号自己的工具（tools/apps/service.ts LEGACY_TOOLS）：名字前缀就是应用 */
const LEGACY_APP = /^(notion|feishu)_[a-z_]+$/;

function jsonField(input: string, key: string): string {
  try {
    const v = JSON.parse(input || "{}")?.[key];
    if (typeof v === "string") return v;
  } catch {
    /* 截断过的参数：按文字找 */
  }
  return new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.){1,200})"`).exec(input)?.[1] ?? "";
}

/** 工具调用用到的技能或应用（工具名 + 参数原文）；不是这几种工具时返回 undefined */
export function stepUse(tool: string, args: string): StepUse | undefined {
  if (tool === "skill") {
    const name = jsonField(args, "name").trim();
    return name ? { kind: "skill", name } : undefined;
  }
  if (tool === "app_call") {
    const app = jsonField(args, "app").trim();
    return app ? { kind: "app", app, tool: jsonField(args, "tool").trim() } : undefined;
  }
  const legacy = LEGACY_APP.exec(tool);
  return legacy ? { kind: "app", app: legacy[1], tool } : undefined;
}

/**
 * 应用工具没用成的原因，按宿主自己写的英文结果文字认（tools/apps/service.ts、agent/manager.ts passGate）：
 * 连接要处理 / 用户没允许 / 机器人只读；其余（服务报错、参数不对）是 failed。
 */
export function appFailure(text: string): "connection" | "denied" | "readonly" | "failed" {
  if (/needs the user to sign in again|rejected the saved key|dedicated link no longer works|could not be reached right now|local program could not start|is no longer connected|is not connected yet|is turned off\.|not available to this bot/.test(text)) return "connection";
  if (/The user denied this call|Nobody answered the approval request|The call was cancelled/.test(text)) return "denied";
  if (/is read-only/.test(text)) return "readonly";
  return "failed";
}

/** 一轮里用到的技能和应用，按第一次出现的顺序；旧消息的步骤没有 use 时按工具名和参数现认 */
export function usedSummary(steps: ReadonlyArray<Pick<ActivityStep, "kind" | "title" | "input" | "status" | "use">>): UsedItem[] {
  const out: UsedItem[] = [];
  for (const s of steps) {
    if (s.kind !== "tool") continue;
    const use = "use" in s ? s.use : stepUse(s.title, s.input ?? "");
    if (!use) continue;
    // 旧消息里没用成的技能：分不清是不是模型编了个名字，不显示
    if (use.kind === "skill" && s.status === "error" && !use.reason) continue;
    const name = use.kind === "skill" ? use.name : use.app;
    const reason = s.status === "error" ? (use.reason ?? "failed") : undefined;
    const prev = out.find((x) => x.kind === use.kind && x.name === name);
    if (!prev) {
      out.push({ kind: use.kind, name, status: s.status, ...(reason ? { reason } : {}) });
      continue;
    }
    if (prev.status === "ok") continue;
    if (s.status === "ok" || s.status === "running") {
      prev.status = s.status;
      delete prev.reason;
    } else if (prev.status === "error") prev.reason = reason;
  }
  return out;
}
