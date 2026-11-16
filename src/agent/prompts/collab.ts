/**
 * 机器人之间发消息（PRD 2026-11-15 R5–R12）的提示词：系统提示词「其他机器人」段里的协作规则、B 收到的第一条输入、
 * B 回消息后 A 那一轮的输入、停下时 A 那一轮的输入、聊天输入前面的「进行中的事」便条。
 * 和其他提示词一样以中文为主；示例句是语气参考，由机器人按上下文用用户的语言说。
 */

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/**
 * 「其他机器人」段里的协作规则。on = 已登录 Modelflare 且总开关开着（这时才建议）；未登录或关着时只说明用户要求时工具会告诉原因。
 */
export function collabRules(on: boolean): string {
  if (!on)
    return "现在不能把事交给别的机器人（需要登录 Okinto 并打开机器人协作），不要主动建议；用户明确要求时照样调用 message_bot，按它的回执回答。";
  return [
    "你可以用 message_bot 把一件事交给用户的另一个机器人（B 用自己的模型、权限和预算在后台做，做完回消息给你，你核对后告诉用户）：",
    "- 只在用户明确说了才发：「交给 B」「让 B 去做……」「问问 B……」，或对你的建议说「好」「交给它」。只想问它一个问题时用 ask。",
    "- 觉得别的机器人更合适时，可以用一句话建议（如「这类事 B 更擅长，要我发消息让它来做吗？也可以我自己来。」），不要自己发；用户不回应就不发，也先别自己做；用户说「你来」就自己做。同一件事只建议一次，用户拒绝后这段对话里不再为同类事建议。",
    "- 一次只发给一个机器人；消息里写清要做什么、3～5 条背景要点、相关文件和做完的标准（从用户的话里提炼，不自己加要求），不要写进密码和令牌。",
    "- 发出后用一句自然的话回应用户，不要自己去做那件事。用户补充、叫停、让它继续时用 bot_request。",
  ].join("\n");
}

export interface HandoffBriefInput {
  /** A 的名字 */
  from: string;
  ask: boolean;
  /** A 发来的消息全文 */
  message: string;
  /** 这两个机器人之前的往来（最近几条） */
  recent: Array<{ who: string; text: string }>;
  /** 带来的文件在 B 工作区里的路径 */
  files: string[];
  memory?: string;
  folder: string;
}

/** B 收到的第一条输入：这件事是 A 发来的；ask 时只回答、不动手 */
export function handoffBrief(o: HandoffBriefInput): string {
  const parts = [
    `[${o.from}发来的消息]（用户在和${o.from}的对话里让它交给你；你做完回消息给${o.from}，由它核对后告诉用户）`,
    o.message.trim(),
  ];
  if (o.files.length) parts.push(`[带来的文件]（已放进你的工作区）\n${o.files.join("\n")}`);
  if (o.recent.length) parts.push(`[你们之前的往来]\n${o.recent.map((m) => `${m.who}：${clip(m.text.replace(/\s+/g, " ").trim(), 300)}`).join("\n")}`);
  if (o.memory !== undefined) parts.push(`[长期记忆快照]\n${o.memory.trim() || "（目前为空）"}`);
  parts.push(
    [
      "[怎么做]",
      o.ask
        ? `不用动手，只回答就行：只凭你知道的、你的记忆和工作区里的文件回答，不做任何操作（不改文件、不运行会改东西的命令、不发送）。答完调用 task_report：state 为 done，summary 写给${o.from}的回答。`
        : `当前目录是这件事的文件夹（${o.folder}），产出的文件放在这里。做完调用 task_report：state 为 done，summary 写给${o.from}的结果说明（做了什么、结论、还差什么），files 列出产出的文件；做不下去就报 failed 并说明原因。`,
      `这件事是${o.from}发给你的：你不能再把它交给别的机器人，也不能发回给${o.from}；需要别的机器人时，在结果里说明「这一步请用户直接找某某」。`,
    ].join("\n"),
  );
  return parts.join("\n\n");
}

export interface CheckInput {
  id: string;
  /** B 的名字 */
  bot: string;
  ask: boolean;
  title: string;
  criteria: string;
  reply: string;
  /** 已复制进 A 工作区的文件 */
  files: string[];
  redos: number;
  redoLimit: number;
  /** 用户补充过的要求（按补充后的要求核对） */
  additions: string[];
}

/** B 回消息后 A 那一轮：核对、汇总；没达标就让 B 重做，这一轮不回复用户 */
export function checkInput(o: CheckInput): string {
  const head = `[收到${o.bot}的消息 · ${o.id}]（这是${o.bot}回给你的，不是用户说的；你这一轮的最后回复会发给用户）`;
  if (o.ask)
    return [head, `你问它的：${o.title}`, `它的回答：\n${o.reply.trim() || "（没有写）"}`, "用自然的话把答案转述给用户（说明是它说的），不要再发给它。"].join("\n\n");
  const lines = [
    head,
    `你交给它的：${o.title}`,
    `做完的标准：${o.criteria || "（没写）"}`,
    ...(o.additions.length ? [`用户后来补充的要求：\n${o.additions.map((a) => `- ${a}`).join("\n")}`] : []),
    `它的回复：\n${o.reply.trim() || "（没有写）"}`,
    o.files.length ? `文件（已放进你的工作区）：\n${o.files.join("\n")}` : "没有文件。",
    `已让它重做 ${o.redos} 次，最多 ${o.redoLimit} 次。`,
    [
      "对照用户的要求和做完的标准核对（需要时打开文件看）：",
      `- 达标：回复用户，说清做了什么、结论和文件（文件用 present 发给用户）${o.redos ? `，并说明让它重做过 ${o.redos} 次` : ""}${o.additions.length ? "，并说明按补充改了什么" : ""}。`,
      o.redos < o.redoLimit
        ? `- 没达标：调用 bot_request（id ${o.id}，action redo，text 写清问题）让它改，然后结束这一轮，不要回复用户（这一轮说的话用户看不到）。`
        : "- 没达标：重做次数已经用完，如实告诉用户还差什么。",
    ].join("\n"),
  ];
  return lines.join("\n\n");
}

export interface StopInput {
  id: string;
  bot: string;
  title: string;
  /** 为什么停下（一句话） */
  why: string;
  /** 它已做的部分（最近一次报告） */
  done: string;
  files: string[];
  /** 能不能继续（超时、花满时问用户要不要继续） */
  canContinue: boolean;
}

/** B 先停下了（超时、花满、出错、在别处被叫停）：A 用自然的话告诉用户做到哪 */
export function stopInput(o: StopInput): string {
  return [
    `[${o.bot}先停下了 · ${o.id}]（这不是用户说的；你这一轮的回复会发给用户）`,
    `你交给它的：${o.title}`,
    `原因：${o.why}`,
    `它已做的部分：\n${o.done.trim() || "（没有回报）"}`,
    o.files.length ? `文件（已放进你的工作区）：\n${o.files.join("\n")}` : "",
    `用自然的话告诉用户它做到哪、还差什么，做过的不会撤回${o.canContinue ? `；问用户要不要继续（用户说继续时调用 bot_request，id ${o.id}，action continue）` : ""}。`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** 聊天输入前面的便条：A 这边还没完成的、B 这边正在做的别的机器人发来的事（没有就不加） */
export function collabNote(o: { sent: Array<{ id: string; bot: string; title: string; state: string }>; inbox: Array<{ id: string; bot: string; title: string }> }): string {
  const parts: string[] = [];
  if (o.sent.length)
    parts.push(`[你发给别的机器人、还没完成的事]\n${o.sent.map((h) => `- ${h.id} → ${h.bot}：${h.title}（${h.state}）`).join("\n")}\n用户补充、叫停、让它继续时用 bot_request（action add / stop / continue）。`);
  if (o.inbox.length)
    parts.push(`[别的机器人发给你、正在做的事]\n${o.inbox.map((h) => `- ${h.id} ← ${h.bot}：${h.title}`).join("\n")}\n用户在这里补充要求或让它停下时用 bot_request（action add / stop）；你做完时会在回消息里告诉它。`);
  return parts.join("\n\n");
}
