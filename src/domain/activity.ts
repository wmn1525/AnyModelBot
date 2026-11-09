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
}
