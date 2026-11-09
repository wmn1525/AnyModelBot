/**
 * 手动更新的回退：没有原生更新器的桌面运行方式只查询版本、提供安装包链接。
 * 已安装的 macOS / Windows / AppImage 使用 desktop.ts 管理下载和重启安装。
 * 请求里只有当前版本号（User-Agent），不带账户和对话内容。Docker 和命令行不查，它们不靠安装包升级。
 */
import { logger } from "../log.js";

const log = logger("update");

const REPO = "wmn1525/AnyModelBot";
const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`;
/** 这些地址会在系统浏览器里打开，所以只认这个仓库的发布页和安装包 */
const RELEASES = `https://github.com/${REPO}/releases/`;

const FIRST_CHECK_MS = 20_000; //          启动时不抢资源
const CHECK_EVERY_MS = 6 * 3600_000; //    关窗口后留在托盘，一开可能好几天
const RETRY_MS = 30 * 60_000; //           没网、被限流：过一会儿再试，用户看不到报错
const TIMEOUT_MS = 15_000;

const parts = (v: string): number[] | null => {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};

/** latest 是否比 current 新。预发布版（1.2.0-beta.1）和写法不对的都不算 */
export function isNewer(latest: string, current: string): boolean {
  const a = parts(latest);
  const b = parts(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

/** 这台机器该下载的安装包的文件名结尾（命名见 release.yml）；没有对应安装包的系统和架构回 null */
export function installerSuffix(platform: string, arch: string): string | null {
  if (arch !== "x64" && arch !== "arm64") return null;
  if (platform === "win32") return `-win-${arch}.exe`;
  if (platform === "darwin") return `-mac-${arch}.dmg`;
  if (platform === "linux") return `-linux-${arch === "x64" ? "x86_64" : "arm64"}.AppImage`;
  return null;
}

export interface UpdateStatus {
  current: string;
  /** 最新发布的版本号；还没查到时是空字符串 */
  latest: string;
  available: boolean;
  /** 这台机器对应的安装包；找不到时是发布页 */
  downloadUrl: string;
  /** 这个版本的发布页（更新内容） */
  releaseUrl: string;
  supported?: boolean;
  autoDownload?: boolean;
  phase?: "idle" | "checking" | "available" | "downloading" | "ready" | "installing" | "error";
  percent?: number;
  transferred?: number;
  total?: number;
  error?: "check_failed" | "download_failed" | "install_failed" | "busy";
  busy?: boolean;
}

export class UpdateActionError extends Error {
  constructor(readonly code: "unsupported" | "not_ready" | "busy") { super(code); }
}

/** 只有已安装的桌面应用提供；CLI / Docker 保留版本查询接口，不下载应用更新。 */
export interface DesktopUpdates {
  status(): UpdateStatus;
  start(): void;
  stop(): void;
  check(): Promise<void>;
  download(automatic?: boolean): void;
  install(): void;
  setAutoDownload(on: boolean): void;
}

export class UpdateChecker {
  private latest = "";
  private downloadUrl = "";
  private releaseUrl = "";
  private running = false;
  private timer?: NodeJS.Timeout;

  constructor(private readonly o: { current: string; fetch?: () => typeof fetch | undefined; platform?: string; arch?: string }) {}

  status(): UpdateStatus {
    return {
      current: this.o.current,
      latest: this.latest,
      available: isNewer(this.latest, this.o.current),
      downloadUrl: this.downloadUrl,
      releaseUrl: this.releaseUrl,
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.schedule(FIRST_CHECK_MS);
  }

  stop(): void {
    this.running = false;
    clearTimeout(this.timer);
  }

  private schedule(ms: number): void {
    this.timer = setTimeout(async () => {
      const ok = await this.check();
      if (this.running) this.schedule(ok ? CHECK_EVERY_MS : RETRY_MS);
    }, ms);
    this.timer.unref();
  }

  /** 查一次。失败时保留上次的结果，回 false */
  async check(): Promise<boolean> {
    try {
      const send = this.o.fetch?.() ?? fetch;
      const res = await send(LATEST_API, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": `anymodel-bot/${this.o.current}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { tag_name?: unknown; html_url?: unknown; assets?: unknown };
      const tag = typeof body.tag_name === "string" ? body.tag_name.trim() : "";
      if (!parts(tag)) throw new Error(`unexpected tag ${JSON.stringify(body.tag_name)}`);
      const page = typeof body.html_url === "string" && body.html_url.startsWith(RELEASES) ? body.html_url : `${RELEASES}latest`;
      const suffix = installerSuffix(this.o.platform ?? process.platform, this.o.arch ?? process.arch);
      const assets = (Array.isArray(body.assets) ? body.assets : []) as { name?: unknown; browser_download_url?: unknown }[];
      const installer = assets.find(
        (a) => suffix && typeof a?.name === "string" && a.name.endsWith(suffix) && typeof a.browser_download_url === "string" && a.browser_download_url.startsWith(RELEASES),
      );
      this.latest = tag.replace(/^v/, "");
      this.releaseUrl = page;
      this.downloadUrl = installer ? String(installer.browser_download_url) : page;
      return true;
    } catch (e) {
      log.info("update check failed", { message: (e as Error).message.slice(0, 200) });
      return false;
    }
  }
}
