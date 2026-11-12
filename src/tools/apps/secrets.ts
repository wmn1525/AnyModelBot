/**
 * 应用连接的凭证：<数据目录>/app-secrets.json（权限 600，经临时文件改名写入），不进数据库。
 *
 * 和数据目录里的其他凭据（Modelflare 账户、内置网关的 API Key、渠道令牌）一样只靠文件权限保护，不用系统钥匙串：
 * 桌面版、命令行、Docker 读写同一种格式，数据目录拷到别处也能用，macOS 上也不会弹钥匙串权限窗（见 account/vault.ts）。
 * 放在数据库外面是为了让数据库、日志和诊断包里都搜不到令牌：这里的每个字符串都登记到日志脱敏（registerSecret）。
 *
 * 一条连接一个条目，键是连接的 id。条目里放什么由使用方决定（请求头、查询参数、专属链接、环境变量、OAuth 令牌…）。
 */
import fs from "node:fs";
import path from "node:path";
import { logger, registerSecret } from "../../log.js";

const log = logger("apps.secrets");

export interface SecretStore {
  get<T = unknown>(id: string): T | undefined;
  set(id: string, value: unknown): void;
  delete(id: string): void;
  ids(): string[];
}

/** 把一个条目里的字符串都登记到日志脱敏；「Bearer xxx」连同后面的令牌本身 */
export function registerSecretsIn(value: unknown, depth = 0): void {
  if (depth > 6 || value === null || value === undefined) return;
  if (typeof value === "string") {
    registerSecret(value);
    const bearer = /^(?:Bearer|Basic|Token)\s+(\S+)$/i.exec(value.trim());
    if (bearer) registerSecret(bearer[1]);
    return;
  }
  if (Array.isArray(value)) return value.forEach((v) => registerSecretsIn(v, depth + 1));
  if (typeof value === "object") for (const v of Object.values(value as Record<string, unknown>)) registerSecretsIn(v, depth + 1);
}

/** 测试和没有数据目录的场合：只在内存里 */
export class MemorySecrets implements SecretStore {
  private data = new Map<string, unknown>();
  get<T = unknown>(id: string): T | undefined {
    const v = this.data.get(id);
    return v === undefined ? undefined : (structuredClone(v) as T);
  }
  set(id: string, value: unknown): void {
    this.data.set(id, structuredClone(value));
    registerSecretsIn(value);
  }
  delete(id: string): void {
    this.data.delete(id);
  }
  ids(): string[] {
    return [...this.data.keys()];
  }
}

interface FileShape {
  v: 1;
  entries: Record<string, unknown>;
}

export class SecretsFile implements SecretStore {
  private entries: Record<string, unknown> | undefined;

  constructor(readonly file: string) {}

  static at(dataDir: string): SecretsFile {
    return new SecretsFile(path.join(dataDir, "app-secrets.json"));
  }

  /** 读不出来（文件坏了）时当作空的：连接还在，状态变成要重新填凭证，不让整个应用起不来 */
  private load(): Record<string, unknown> {
    if (this.entries) return this.entries;
    let entries: Record<string, unknown> = {};
    try {
      if (fs.existsSync(this.file)) {
        const raw = JSON.parse(fs.readFileSync(this.file, "utf8")) as FileShape;
        if (raw && raw.v === 1 && raw.entries && typeof raw.entries === "object") entries = raw.entries;
      }
    } catch (e) {
      log.warn("凭证文件读不出来，按没有凭证处理", { message: (e as Error).message });
    }
    registerSecretsIn(entries);
    this.entries = entries;
    return entries;
  }

  private save(): void {
    const shape: FileShape = { v: 1, entries: this.load() };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(shape) + "\n", { mode: 0o600 });
    fs.renameSync(tmp, this.file);
    // 文件原来就在时 writeFileSync 的 mode 不生效（改名换掉了它，这里是新文件）；保险起见再设一次
    try {
      fs.chmodSync(this.file, 0o600);
    } catch {
      /* Windows 上没有这套权限 */
    }
  }

  get<T = unknown>(id: string): T | undefined {
    const v = this.load()[id];
    return v === undefined ? undefined : (structuredClone(v) as T);
  }

  set(id: string, value: unknown): void {
    this.load()[id] = structuredClone(value);
    registerSecretsIn(value);
    this.save();
  }

  delete(id: string): void {
    const entries = this.load();
    if (!(id in entries)) return;
    delete entries[id];
    this.save();
  }

  ids(): string[] {
    return Object.keys(this.load());
  }
}
