/**
 * MCP 连接的存放：名字、地址、状态、工具清单在数据库的 kv 里（app-connections），凭证在凭证文件里（secrets.ts）。
 * 谁能用（app-access）和主账号（app-primary）也在 kv 里。现有的 Notion、飞书账号仍在 accounts/index.ts 的 AccountStore。
 */
import crypto from "node:crypto";
import { AUTH_METHODS, TOOL_CATEGORIES, mcpSecretId, type AuthMethod, type ConnState, type McpConnection, type McpSecrets, type ToolCategory, type ToolInfo } from "./types.js";
import type { SecretStore } from "./secrets.js";

export const CONNECTIONS_KV = "app-connections";
export const ACCESS_KV = "app-access";
export const PRIMARY_KV = "app-primary";

interface KvStore {
  getKV(key: string): string | undefined;
  setKV(key: string, value: string): void;
}

const STATES: readonly ConnState[] = ["off", "testing", "connected", "needs-login", "key-rejected", "link-invalid", "unreachable", "local-failed", "expired"];

function readJson<T>(kv: KvStore, key: string, fallback: T): T {
  try {
    const raw = kv.getKV(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

const strings = (v: unknown): string[] | undefined => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : undefined);

function validTool(t: any): t is ToolInfo {
  return t && typeof t === "object" && typeof t.name === "string" && typeof t.hash === "string" && (TOOL_CATEGORIES as readonly unknown[]).includes(t.category);
}

function parse(raw: any): McpConnection | undefined {
  if (!raw || typeof raw !== "object" || typeof raw.id !== "string" || typeof raw.app !== "string") return undefined;
  const transport = raw.transport === "stdio" ? "stdio" : "http";
  if (transport === "http" && typeof raw.url !== "string") return undefined;
  if (transport === "stdio" && typeof raw.command !== "string" && typeof raw.builtinCommand !== "string") return undefined;
  const overrides: Record<string, ToolCategory> = {};
  if (raw.categoryOverrides && typeof raw.categoryOverrides === "object") {
    for (const [k, v] of Object.entries(raw.categoryOverrides)) if ((TOOL_CATEGORIES as readonly unknown[]).includes(v)) overrides[k] = v as ToolCategory;
  }
  // 上次退出时正在测试的：没有结果，按连不上算，下次用到时再测
  const state: ConnState = STATES.includes(raw.state) ? (raw.state === "testing" ? "unreachable" : raw.state) : "unreachable";
  return {
    id: raw.id,
    app: raw.app,
    label: typeof raw.label === "string" && raw.label ? raw.label : raw.app,
    identity: typeof raw.identity === "string" ? raw.identity : raw.id,
    transport,
    ...(typeof raw.url === "string" ? { url: raw.url } : {}),
    ...(raw.sse === true ? { sse: true } : {}),
    auth: (AUTH_METHODS as readonly unknown[]).includes(raw.auth) ? (raw.auth as AuthMethod) : "none",
    ...(strings(raw.headerNames) ? { headerNames: strings(raw.headerNames) } : {}),
    ...(strings(raw.queryNames) ? { queryNames: strings(raw.queryNames) } : {}),
    ...(strings(raw.envNames) ? { envNames: strings(raw.envNames) } : {}),
    ...(raw.oauth && typeof raw.oauth === "object"
      ? { oauth: { ...(typeof raw.oauth.clientId === "string" && raw.oauth.clientId ? { clientId: raw.oauth.clientId } : {}), ...(strings(raw.oauth.scopes)?.length ? { scopes: strings(raw.oauth.scopes) } : {}), pkce: raw.oauth.pkce !== false } }
      : {}),
    ...(typeof raw.command === "string" ? { command: raw.command } : {}),
    ...(strings(raw.args) ? { args: strings(raw.args) } : {}),
    ...(typeof raw.builtinCommand === "string" ? { builtinCommand: raw.builtinCommand } : {}),
    ...(raw.startedOnce === true ? { startedOnce: true } : {}),
    enabled: raw.enabled !== false,
    state,
    ...(typeof raw.detail === "string" && raw.detail ? { detail: raw.detail } : {}),
    checkedAt: Number(raw.checkedAt) || 0,
    tools: Array.isArray(raw.tools) ? raw.tools.filter(validTool) : [],
    ...(Object.keys(overrides).length ? { categoryOverrides: overrides } : {}),
    createdAt: Number(raw.createdAt) || 0,
  };
}

export class McpConnectionStore {
  private items: McpConnection[] = [];
  private listeners = new Set<() => void>();

  constructor(
    private kv: KvStore,
    private secretStore: SecretStore,
  ) {
    const raw = readJson<unknown[]>(kv, CONNECTIONS_KV, []);
    for (const r of Array.isArray(raw) ? raw : []) {
      const c = parse(r);
      if (c) this.items.push(c);
    }
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private save(): void {
    this.kv.setKV(CONNECTIONS_KV, JSON.stringify(this.items));
    for (const fn of this.listeners) fn();
  }

  list(app?: string): McpConnection[] {
    return app ? this.items.filter((c) => c.app === app) : [...this.items];
  }

  get(id: string): McpConnection | undefined {
    return this.items.find((c) => c.id === id);
  }

  newId(): string {
    return crypto.randomBytes(8).toString("hex");
  }

  /** 加一条（或者按 id 换掉已有的），凭证一起存 */
  put(conn: McpConnection, secrets: McpSecrets): McpConnection {
    this.secretStore.set(mcpSecretId(conn.id), secrets);
    const i = this.items.findIndex((c) => c.id === conn.id);
    if (i >= 0) this.items[i] = conn;
    else this.items.push(conn);
    this.save();
    return conn;
  }

  update(id: string, patch: Partial<McpConnection>): McpConnection | undefined {
    const c = this.get(id);
    if (!c) return undefined;
    Object.assign(c, patch);
    for (const k of Object.keys(patch) as Array<keyof McpConnection>) if (patch[k] === undefined) delete c[k];
    this.save();
    return c;
  }

  remove(id: string): boolean {
    const before = this.items.length;
    this.items = this.items.filter((c) => c.id !== id);
    if (this.items.length === before) return false;
    this.secretStore.delete(mcpSecretId(id));
    this.save();
    return true;
  }

  secrets(id: string): McpSecrets {
    return this.secretStore.get<McpSecrets>(mcpSecretId(id)) ?? {};
  }

  setSecrets(id: string, secrets: McpSecrets): void {
    this.secretStore.set(mcpSecretId(id), secrets);
  }

  // ---------- 谁能用 ----------

  /** 应用（内置应用的 id，或 custom:<连接 id>）→ 允许的机器人；没有条目 = 全部机器人 */
  access(): Record<string, string[]> {
    const raw = readJson<Record<string, unknown>>(this.kv, ACCESS_KV, {});
    const out: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(raw && typeof raw === "object" ? raw : {})) {
      const list = strings(v);
      if (list) out[k] = list;
    }
    return out;
  }

  setAccess(appKey: string, bots: string[] | "all"): void {
    const all = this.access();
    if (bots === "all") delete all[appKey];
    else all[appKey] = [...new Set(bots)];
    this.kv.setKV(ACCESS_KV, JSON.stringify(all));
    for (const fn of this.listeners) fn();
  }

  // ---------- 主账号 ----------

  /** 应用 → 没说用哪个账号时用的那一个 */
  primary(): Record<string, string> {
    const raw = readJson<Record<string, unknown>>(this.kv, PRIMARY_KV, {});
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw && typeof raw === "object" ? raw : {})) if (typeof v === "string" && v) out[k] = v;
    return out;
  }

  setPrimary(app: string, accountId: string | undefined): void {
    const all = this.primary();
    if (accountId) all[app] = accountId;
    else delete all[app];
    this.kv.setKV(PRIMARY_KV, JSON.stringify(all));
    for (const fn of this.listeners) fn();
  }
}
