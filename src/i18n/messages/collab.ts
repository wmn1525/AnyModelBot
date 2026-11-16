// collab（机器人之间发消息，PRD 2026-11-15 R5–R12）：zh 与 en 的键必须一一对应。
// 用户看得到的：A 发给 B 的消息里的固定字（两人对话里显示）、A 没法开口时直接存进对话的那句、作废和删除的说明。
// 给模型看的工具回执、核对说明不在这里（collab/service.ts、agent/prompts/collab.ts）。
import type { Catalog } from "../types.js";

export const zh = {
  msgPoints: "背景要点：",
  msgFiles: "相关文件：",
  msgAskOnly: "不用动手，只回答就行。",
  msgDoneWhen: "做完的标准：{criteria}",
  msgRedo: "{issue}，请改一下。（重做 {n}/{limit}）",
  msgAdds: "用户补充：{text}",
  whyUser: "你让它停下了",
  whyTimeout: "超过 {limit}",
  whyBudget: "这件事已花满 {budget}",
  whyError: "出错了：{reason}",
  hours: { other: "{count} 小时" },
  minutes: { other: "{count} 分钟" },
  noText: "（没有写说明）",
  fallbackReply: "收到{bot}的消息：\n\n{text}",
  fallbackStopped: "{bot}先停下了（{why}）。{text}",
  droppedExpired: "{bot}排队超过 24 小时还没开始，这件事作废了。",
  droppedModel: "{bot}换成了你自己的 API Key 模型，排着的这件没法开始，已取消。",
  deleted: "{bot}已被删除，这件事停下了。",
} satisfies Catalog;

export const en: Catalog<typeof zh> = {
  msgPoints: "Background:",
  msgFiles: "Files:",
  msgAskOnly: "No need to do anything. Just answer.",
  msgDoneWhen: "Done when: {criteria}",
  msgRedo: "{issue}. Please fix it. (Redo {n}/{limit})",
  msgAdds: "The user adds: {text}",
  whyUser: "you asked it to stop",
  whyTimeout: "over {limit}",
  whyBudget: "this used up {budget}",
  whyError: "something went wrong: {reason}",
  hours: { one: "{count} hour", other: "{count} hours" },
  minutes: { one: "{count} minute", other: "{count} minutes" },
  noText: "(no summary)",
  fallbackReply: "Message from {bot}:\n\n{text}",
  fallbackStopped: "{bot} stopped ({why}). {text}",
  droppedExpired: "{bot} didn't start within 24 hours, so this request was dropped.",
  droppedModel: "{bot} switched to a model from your own API key, so this queued request was cancelled.",
  deleted: "{bot} was deleted, so this stopped.",
};
