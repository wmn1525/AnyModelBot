/**
 * 给聊天代理的便条：后台任务、规则的结果发出去了（或在等用户回答），下一条聊天消息带上它，
 * 模型知道这件事，用户问"详细说说"时能接上。任务那边写（tasks/service.ts），聊天这边取（core/runtime.ts）。
 */
import type { Store } from "../store/db.js";

const NOTES = "task-notes:";
/** 每个会话最多留几张、每张多长 */
const KEEP = 5;
const MAX_LEN = 500;

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export function addTaskNote(store: Store, conversationId: string, line: string): void {
  let list: string[] = [];
  try {
    list = JSON.parse(store.getKV(NOTES + conversationId) || "[]");
  } catch {
    list = [];
  }
  list.push(clip(line, MAX_LEN));
  store.setKV(NOTES + conversationId, JSON.stringify(list.slice(-KEEP)));
}

/** 取走这个会话攒下的便条（一行一张）；没有时是空字符串 */
export function takeTaskNotes(store: Store, conversationId: string): string {
  const v = store.getKV(NOTES + conversationId);
  if (!v) return "";
  store.deleteKV(NOTES + conversationId);
  try {
    const list = JSON.parse(v) as string[];
    return Array.isArray(list) ? list.join("\n") : "";
  } catch {
    return "";
  }
}
