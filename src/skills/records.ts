/**
 * 存成技能时宿主自己记下的东西（不靠模型说）：从这段对话的活动记录（messages.activity，见 domain/activity.ts）里认出
 * 做事的工具调用有几次、有没有定时运行做不了的步骤、用到了哪些应用（按连接别名）和哪些技能（带来源）。
 * 「没有可存的事」、「不能设成定时」都按这里判断。
 */
import type { ActivityStep } from "../domain/activity.js";
import { stepUse } from "../domain/activity.js";
import type { BlockedStep, MySkillApp, MySkillUse } from "./mine.js";
import type { SkillRecords } from "./drafts.js";

/** 不算「做了事」的工具：存技能、装技能、加载技能本身，记忆，提问，交付文件，查连接和查工具 */
const NOT_WORK = new Set(["save_skill", "install_skill", "skill", "remember", "forget", "recall", "ask_user_question", "present", "connected_accounts", "app_tools", "app_tool_schema", "app_connect", "task_list", "rule_create", "rule_update", "background_pause", "media_models", "media_docs"]);
/** 宿主自己生成的技能：不算「用到的技能」 */
const BUILTIN_SKILLS = new Set(["media", "computer-use", "amb-app"]);

/** 定时运行做不了的步骤（tasks/rules.ts RULE_DENY、RULE_DENY_PREFIX 里的那几类） */
export function blockedOf(tool: string): BlockedStep | undefined {
  if (/^mcp__computer-use__/.test(tool) || /^computer[_-]/.test(tool)) return "computer";
  if (tool === "generate_image" || tool === "generate_video") return "media";
  if (tool === "task_start" || tool === "task_message") return "background";
  return undefined;
}

export interface RecordLookups {
  /** 应用的 key → 名字、账号（编号和别名）、工具的类别；认不出时 undefined */
  app(key: string): { name: string; accounts: Array<{ number: number; label: string; primary: boolean }>; tools: Array<{ name: string; category: string }> } | undefined;
  /** 用到的技能 → 名字和来源；宿主自己的、认不出的返回 undefined */
  skill(name: string): MySkillUse | undefined;
}

function accountArg(input: string | undefined): string {
  try {
    const v = JSON.parse(input || "{}")?.account;
    return v === undefined || v === null ? "" : String(v).trim();
  } catch {
    return /"account"\s*:\s*"?([^",}]+)"?/.exec(input ?? "")?.[1]?.trim() ?? "";
  }
}

export function skillRecordsOf(steps: ReadonlyArray<ActivityStep>, look: RecordLookups): SkillRecords {
  let work = 0;
  const blocked = new Set<BlockedStep>();
  const apps = new Map<string, MySkillApp>();
  const uses = new Map<string, MySkillUse>();
  for (const s of steps) {
    if (s.kind !== "tool") continue;
    const b = blockedOf(s.title);
    if (b && s.status !== "error") blocked.add(b);
    if (!NOT_WORK.has(s.title) && s.status !== "error") work++;
    const use = s.use ?? stepUse(s.title, s.input ?? "");
    if (!use || s.status === "error") continue;
    if (use.kind === "skill") {
      if (BUILTIN_SKILLS.has(use.name) || uses.has(use.name)) continue;
      const u = look.skill(use.name);
      if (u) uses.set(use.name, u);
      continue;
    }
    const info = look.app(use.app);
    if (!info) continue;
    const sel = accountArg(s.input);
    const acc = sel ? info.accounts.find((a) => String(a.number) === sel || a.label === sel) : info.accounts.find((a) => a.primary) ?? (info.accounts.length === 1 ? info.accounts[0] : undefined);
    const sends = info.tools.find((x) => x.name === use.tool)?.category === "send";
    const key = `${use.app}|${acc?.label ?? ""}`;
    const prev = apps.get(key);
    if (prev) prev.sends ||= sends;
    else apps.set(key, { key: use.app, name: info.name, ...(acc?.label ? { alias: acc.label } : {}), sends });
  }
  return { work, blocked: [...blocked], apps: [...apps.values()], uses: [...uses.values()] };
}
