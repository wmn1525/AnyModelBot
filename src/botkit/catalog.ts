/**
 * 官方目录直接读安装包中的 index.json；界面和技能从内置包校验、解压到数据目录，全程不联网。
 * 显式配置远程目录时才每 6 小时同步签名索引，按需下载并校验 sha256。
 * 没配置目录地址或公钥时目录就是空的，App 的行为和没有这个功能时一样。
 * 开发时可以把本机目录登记进来（amb-bot dev），不经过下载和签名。
 */
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { logger } from "../log.js";
import { LIMITS, parseManifest, versionGte, type BotManifest } from "./format.js";
import { sha256, unpackTo } from "./bundle.js";
import { verifyCatalog } from "./sign.js";

const log = logger("botkit");

export const SYNC_INTERVAL_MS = 6 * 3600_000;

export interface CatalogEntry extends BotManifest {
  /** 界面包：ui/、sample.<语言>.json、state.schema.json、bot.json */
  ui: { sha256: string; size: number };
  /** 运行包：persona.md、skills/ */
  runtime: { sha256: string; size: number };
  /** 约束检查的截图（发现页缩略图），按 sha256 读取 */
  thumbs?: { light?: string; dark?: string };
  featured?: boolean;
  publishedAt: number;
  /** 已下架：不再出现在目录里；security 时用过的实例也要停用（installer.ts） */
  removed?: { reason: string; security?: boolean; at: number };
  /** 开发中的本机目录（只在本机有） */
  dev?: string;
}

export interface CatalogIndex {
  version: 1;
  publishedAt: number;
  bots: CatalogEntry[];
}

export interface CatalogOptions {
  dataDir: string;
  appVersion: string;
  /** 安装包内的可信目录（index.json、bundles/、thumbs/）；存在时不连接远程目录。 */
  bundledDir?: string;
  /** index.json 的地址；同目录下有 index.json.sig、bundles/、thumbs/ */
  url?: string;
  publicKey?: string;
  fetch?: () => typeof fetch | undefined;
}

const devFile = (dataDir: string) => path.join(dataDir, "catalog", "dev.json");

export class BotCatalog extends EventEmitter {
  private index: CatalogIndex | undefined;
  private etag = "";
  private devDirs = new Map<string, string>();
  private devEntries = new Map<string, CatalogEntry>();
  private timer: NodeJS.Timeout | undefined;
  private loading = new Map<string, Promise<void>>();
  syncedAt = 0;
  lastError = "";

  constructor(readonly o: CatalogOptions) {
    super();
    if (o.bundledDir) this.index = this.parseIndex(fs.readFileSync(path.join(o.bundledDir, "index.json")));
    else this.loadCache();
    this.loadDev();
  }

  private get dir(): string {
    return path.join(this.o.dataDir, "catalog");
  }
  private get base(): string {
    return this.o.url ? this.o.url.replace(/[^/]*$/, "") : "";
  }
  private get doFetch(): typeof fetch {
    return this.o.fetch?.() ?? fetch;
  }
  /** 没有地址或公钥就不联网：不会有未验签的目录 */
  get remoteEnabled(): boolean {
    return !this.o.bundledDir && !!(this.o.url && this.o.publicKey);
  }
  get enabled(): boolean {
    return !!this.o.bundledDir || this.remoteEnabled || this.devEntries.size > 0;
  }

  private parseIndex(buf: Buffer): CatalogIndex {
    const idx = JSON.parse(buf.toString("utf8")) as CatalogIndex;
    if (idx.version !== 1 || !Array.isArray(idx.bots)) throw new Error("unsupported catalog index");
    return idx;
  }

  private loadCache(): void {
    if (!this.o.publicKey) return;
    try {
      const data = fs.readFileSync(path.join(this.dir, "index.json"));
      const sig = fs.readFileSync(path.join(this.dir, "index.json.sig"), "utf8");
      // 缓存也要验签：数据目录里的文件被改过就当没有
      if (!verifyCatalog(data, sig, this.o.publicKey)) throw new Error("cached catalog signature mismatch");
      this.index = this.parseIndex(data);
      this.etag = fs.existsSync(path.join(this.dir, "index.etag")) ? fs.readFileSync(path.join(this.dir, "index.etag"), "utf8") : "";
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") log.warn("catalog cache ignored", { err: String(e) });
    }
  }

  private loadDev(): void {
    try {
      const saved = JSON.parse(fs.readFileSync(devFile(this.o.dataDir), "utf8")) as Record<string, string>;
      for (const [id, dir] of Object.entries(saved)) {
        try {
          this.registerDev(dir);
        } catch (e) {
          log.warn("dev bot ignored", { id, err: String(e) });
        }
      }
    } catch {
      /* 没有登记过 */
    }
  }

  private saveDev(): void {
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(devFile(this.o.dataDir), JSON.stringify(Object.fromEntries(this.devDirs), null, 2));
  }

  private registerDev(dir: string): CatalogEntry {
    const abs = path.resolve(dir);
    const { manifest, issues } = parseManifest(JSON.parse(fs.readFileSync(path.join(abs, "bot.json"), "utf8")));
    if (!manifest) throw new Error(issues.map((i) => i.message).join("; "));
    const entry: CatalogEntry = { ...manifest, ui: { sha256: "", size: 0 }, runtime: { sha256: "", size: 0 }, publishedAt: fs.statSync(path.join(abs, "bot.json")).mtimeMs, dev: abs };
    this.devDirs.set(manifest.id, abs);
    this.devEntries.set(manifest.id, entry);
    return entry;
  }

  /** amb-bot dev：把本机目录登记成一个目录 Bot */
  addDev(dir: string): CatalogEntry {
    const e = this.registerDev(dir);
    this.saveDev();
    this.emit("changed");
    return e;
  }
  removeDev(id: string): void {
    this.devDirs.delete(id);
    this.devEntries.delete(id);
    this.saveDev();
    this.emit("changed");
  }

  start(): void {
    if (this.o.bundledDir) {
      this.emit("changed");
      return;
    }
    if (!this.remoteEnabled || this.timer) return;
    void this.sync();
    this.timer = setInterval(() => void this.sync(), SYNC_INTERVAL_MS);
    this.timer.unref();
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** 拉一次目录。验签失败不更新，记日志；网络失败继续用缓存 */
  async sync(): Promise<boolean> {
    if (!this.remoteEnabled) return false;
    try {
      const res = await this.doFetch(this.o.url!, { headers: this.etag ? { "if-none-match": this.etag } : {} });
      this.syncedAt = Date.now();
      if (res.status === 304) return false;
      if (!res.ok) throw new Error(`catalog HTTP ${res.status}`);
      const data = Buffer.from(await res.arrayBuffer());
      const sigRes = await this.doFetch(`${this.o.url}.sig`);
      if (!sigRes.ok) throw new Error(`catalog signature HTTP ${sigRes.status}`);
      const sig = await sigRes.text();
      if (!verifyCatalog(data, sig, this.o.publicKey!)) throw new Error("catalog signature mismatch");
      const idx = this.parseIndex(data);
      fs.mkdirSync(this.dir, { recursive: true });
      for (const [name, content] of [["index.json", data], ["index.json.sig", sig]] as const) {
        const tmp = path.join(this.dir, `${name}.${process.pid}.tmp`);
        fs.writeFileSync(tmp, content);
        fs.renameSync(tmp, path.join(this.dir, name));
      }
      this.etag = res.headers.get("etag") ?? "";
      fs.writeFileSync(path.join(this.dir, "index.etag"), this.etag);
      this.index = idx;
      this.lastError = "";
      this.emit("changed");
      return true;
    } catch (e) {
      this.lastError = (e as Error).message;
      log.warn("catalog sync failed", { err: this.lastError });
      return false;
    }
  }

  private usable(e: CatalogEntry): boolean {
    return !e.removed && versionGte(this.o.appVersion, e.minAppVersion);
  }

  /** 目录里能用的 Bot：开发中的排在前面，其余按上架时间从新到旧 */
  list(): CatalogEntry[] {
    const remote = (this.index?.bots ?? []).filter((e) => this.usable(e) && !this.devEntries.has(e.id));
    return [...this.devEntries.values(), ...remote.sort((a, b) => b.publishedAt - a.publishedAt)];
  }

  /** 包括已下架的（实例要知道自己被下架了） */
  get(id: string): CatalogEntry | undefined {
    return this.devEntries.get(id) ?? this.index?.bots.find((e) => e.id === id);
  }

  private async download(url: string, expect: string, limit: number): Promise<Buffer> {
    if (!this.remoteEnabled) throw new Error("remote catalog is disabled");
    const res = await this.doFetch(url);
    if (!res.ok) throw new Error(`download HTTP ${res.status}: ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    this.checkAsset(buf, expect, limit);
    return buf;
  }

  private checkAsset(buf: Buffer, expect: string, limit: number): void {
    if (buf.length > limit) throw new Error(`catalog asset too large: ${expect}`);
    if (sha256(buf) !== expect) throw new Error(`sha256 mismatch: ${expect}`);
  }

  private async asset(rel: string, hash: string, limit: number): Promise<Buffer> {
    if (!this.o.bundledDir) return this.download(`${this.base}${rel}`, hash, limit);
    const buf = fs.readFileSync(path.join(this.o.bundledDir, rel));
    this.checkAsset(buf, hash, limit);
    return buf;
  }

  bundleDir(hash: string): string {
    return path.join(this.dir, "bundles", hash);
  }

  /** 同一个包只准备一次（并发请求共用一次读取和解压） */
  private ensureBundle(hash: string, limit: number): Promise<void> {
    if (!/^[0-9a-f]{64}$/.test(hash)) return Promise.reject(new Error("invalid bundle hash"));
    if (fs.existsSync(this.bundleDir(hash))) return Promise.resolve();
    let p = this.loading.get(hash);
    if (!p) {
      p = (async () => {
        const buf = await this.asset(`bundles/${hash}.ambot`, hash, limit);
        fs.mkdirSync(path.join(this.dir, "bundles"), { recursive: true });
        unpackTo(buf, this.bundleDir(hash));
      })().finally(() => this.loading.delete(hash));
      this.loading.set(hash, p);
    }
    return p;
  }

  /** 界面目录（里面有 ui/、sample.<语言>.json、state.schema.json） */
  async ensureUi(e: CatalogEntry): Promise<string> {
    if (e.dev) return e.dev;
    await this.ensureBundle(e.ui.sha256, LIMITS.uiBundleBytes);
    return this.bundleDir(e.ui.sha256);
  }

  /** 运行目录（里面有 persona.md、skills/） */
  async ensureRuntime(e: CatalogEntry): Promise<string> {
    if (e.dev) return e.dev;
    await this.ensureBundle(e.runtime.sha256, LIMITS.runtimeBundleBytes);
    return this.bundleDir(e.runtime.sha256);
  }

  /** 已经解压的界面目录，没有就是 undefined（静态路由用，不触发读取或下载） */
  uiDirIfPresent(hash: string): string | undefined {
    const d = this.bundleDir(hash);
    return /^[0-9a-f]{64}$/.test(hash) && fs.existsSync(d) ? d : undefined;
  }

  /** 发现页缩略图：读取内置文件或显式远程目录并缓存；只接受目录里登记过的哈希 */
  async thumb(hash: string): Promise<string | undefined> {
    if (!/^[0-9a-f]{64}$/.test(hash)) return undefined;
    const known = this.index?.bots.some((e) => e.thumbs?.light === hash || e.thumbs?.dark === hash);
    const f = path.join(this.dir, "thumbs", `${hash}.png`);
    if (fs.existsSync(f)) return f;
    if (!known || !this.enabled) return undefined;
    const buf = await this.asset(`thumbs/${hash}.png`, hash, LIMITS.uiBundleBytes);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, buf);
    return f;
  }
}
