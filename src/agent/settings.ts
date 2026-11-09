/** 机器人设置：数据形状和规范化在 domain/bot-settings.ts（存储层也要用），这里加上只和代理有关的部分。 */
import type { PermissionPreset } from "../domain/bot-settings.js";
export * from "../domain/bot-settings.js";

/** DSH 的沙箱模式。full 用 danger-full-access，但宿主会把它的审批策略从 never 改成 ask（递归删除还要问，见 host.ts） */
export function permissionMode(p: PermissionPreset): string {
  return p === "readonly" ? "read-only" : p === "full" ? "danger-full-access" : "workspace-write";
}
