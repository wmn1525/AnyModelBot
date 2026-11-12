/**
 * 已授权账号的入口：amb-connections 插件的每次工具调用经 bridge 到这里，按服务和 account 参数选账号，交给对应的实现。
 * 账号和令牌见 index.ts。
 */
import { ACCOUNT_SERVICES, AccountStore, ConnectionError, type AccountService } from "./index.js";
import { FeishuAccounts } from "./feishu.js";
import { NOTION_WRITE_OPS, NotionService } from "./notion.js";
import type { SecretStore } from "../apps/secrets.js";

export interface ConnectionServiceOptions {
  kv: { getKV(key: string): string | undefined; setKV(key: string, value: string): void };
  fetch?: () => typeof fetch | undefined;
  /** 令牌放的地方（apps/secrets.ts）；没给时和账号一起放在 kv 里（测试） */
  secrets?: SecretStore;
}

export class ConnectionService {
  readonly accounts: AccountStore;
  readonly notion: NotionService;
  readonly feishu: FeishuAccounts;

  constructor(o: ConnectionServiceOptions) {
    this.accounts = new AccountStore(o.kv, o.secrets);
    this.notion = new NotionService({ accounts: this.accounts, kv: o.kv, fetch: o.fetch });
    this.feishu = new FeishuAccounts({ accounts: this.accounts, fetch: o.fetch });
  }

  /** 哪些服务有账号：有账号才给机器人对应的工具 */
  available(): Partial<Record<AccountService, boolean>> {
    const out: Partial<Record<AccountService, boolean>> = {};
    for (const s of ACCOUNT_SERVICES) if (this.accounts.list(s).length) out[s] = true;
    return out;
  }

  isWrite(service: string, op: string): boolean {
    return service === "notion" && NOTION_WRITE_OPS.includes(op);
  }

  /** 模型看的账号清单：用户说「第一个飞书」，模型按这里的序号选 */
  listText(): string {
    const parts: string[] = [];
    if (this.accounts.list("notion").length) parts.push(`Notion:\n${this.accounts.listText("notion")}`);
    if (this.accounts.list("feishu").length) parts.push(`Feishu:\n${this.accounts.listText("feishu")}`);
    return parts.join("\n\n") || "No accounts are connected. The user can connect them under Connect apps.";
  }

  async run(service: string, op: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
    if (service === "accounts") return this.listText();
    if (service !== "notion" && service !== "feishu") throw new ConnectionError(`Unknown service: ${service}`);
    const account = this.accounts.resolve(service, args.account);
    return service === "notion" ? this.notion.run(account, op, args, signal) : this.feishu.run(account, op, args, signal);
  }
}
