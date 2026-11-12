/** 目录 Bot 实例的记录（存在 bots.app 列）和目录 Bot 能申请的权限：存储层和目录框架都用。 */

/**
 * Bot 能声明的权限。没声明的运行时拒绝（agent/host.ts、dsh-runtime/plugins/amb-bot-gate.mjs）：
 * workspace-write = 写自己的工作区（否则只读）；network = 联网搜索、抓网页和命令联网；
 * channel-send = 后台任务（结果会主动发到聊天渠道）；computer-use = 操作电脑；accounts = 用户授权的账号（Notion、飞书数据）。
 */
export const BOT_PERMISSIONS = ["workspace-write", "network", "channel-send", "computer-use", "accounts"] as const;
export type BotPermission = (typeof BOT_PERMISSIONS)[number];

/** bots.app 列：实例来自目录的哪个 Bot、哪个版本；升级和下架都靠它 */
export interface BotAppRef {
  catalogId: string;
  version: string;
  /** 界面包哈希；开发中的 Bot 为空 */
  ui: string;
  runtime: string;
  permissions: BotPermission[];
  /** 装进 <data>/dsh/<botId>/skills/ 的技能名（升级、卸载时只动这些） */
  skills: string[];
  /** 目录上次给它的头像。设置里的头像还是这个（用户没换过）时，目录换了头像它跟着换 */
  avatar?: string;
  /** 用户改过人设：不再跟随目录升级 */
  customized?: boolean;
  /** 目录里已下架 */
  removed?: { reason: string; security?: boolean; at: number };
}

export function normalizeAppRef(raw: unknown): BotAppRef | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, any>;
  if (typeof r.catalogId !== "string") return null;
  return {
    catalogId: r.catalogId,
    version: String(r.version ?? ""),
    ui: String(r.ui ?? ""),
    runtime: String(r.runtime ?? ""),
    permissions: Array.isArray(r.permissions) ? r.permissions.filter((p: unknown) => (BOT_PERMISSIONS as readonly unknown[]).includes(p)) : [],
    skills: Array.isArray(r.skills) ? r.skills.map(String) : [],
    ...(typeof r.avatar === "string" && r.avatar ? { avatar: r.avatar } : {}),
    ...(r.customized ? { customized: true } : {}),
    ...(r.removed ? { removed: r.removed } : {}),
  };
}
