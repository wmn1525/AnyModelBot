/** 桌面更新状态机。原生更新器由 Electron 注入；这里不加载 Electron，也不自行下载或解包。 */
import type { AppUpdater, UpdateCheckResult } from "electron-updater";
import { logger } from "../log.js";
import { UpdateActionError, installerSuffix, type DesktopUpdates, type UpdateStatus } from "./check.js";

const log = logger("update");
const RELEASES = "https://github.com/wmn1525/AnyModelBot/releases";
const FIRST_CHECK_MS = 20_000;
const CHECK_EVERY_MS = 6 * 3600_000;
const RETRY_MS = 30 * 60_000;
type NativeUpdater = Pick<AppUpdater, "on" | "autoDownload" | "autoInstallOnAppQuit" | "allowPrerelease" | "allowDowngrade" | "checkForUpdates" | "downloadUpdate" | "quitAndInstall">;
type VersionInfo = { version: string; files?: Array<{ url: string }> };

export class DesktopUpdateService implements DesktopUpdates {
  private state: UpdateStatus;
  private enabled: boolean;
  private running = false;
  private stopped = false;
  private timer?: NodeJS.Timeout;
  private checking?: Promise<void>;
  private downloading?: Promise<unknown>;
  private token?: UpdateCheckResult["cancellationToken"];
  private automaticDownload = false;
  private notifiedVersion = "";

  constructor(private readonly updater: NativeUpdater, private readonly o: {
    current: string;
    platform: string;
    arch: string;
    autoDownload: boolean;
    newToken: () => NonNullable<UpdateCheckResult["cancellationToken"]>;
    isBusy: () => boolean;
    prepareInstall: () => Promise<void>;
    onReady?: (version: string) => void;
    onInstallError?: () => void;
  }) {
    this.enabled = o.autoDownload;
    this.state = { current: o.current, latest: "", available: false, downloadUrl: "", releaseUrl: "", supported: true, phase: "idle", percent: 0, transferred: 0, total: 0 };
    // 所有安装只由用户的“重启并更新”触发，普通退出也不安装。
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    updater.on("update-available", (info: VersionInfo) => {
      if (this.stopped) return;
      this.version(info, true);
      this.state.phase = "available";
    });
    updater.on("update-not-available", (info: VersionInfo) => {
      if (this.stopped) return;
      this.version(info, false);
      this.state.phase = "idle";
    });
    updater.on("download-progress", (p: { percent: number; transferred: number; total: number }) => {
      if (this.stopped || this.state.phase !== "downloading") return;
      this.state.percent = Number.isFinite(p.percent) ? Math.max(0, Math.min(100, p.percent)) : 0;
      this.state.transferred = p.transferred;
      this.state.total = p.total;
    });
    updater.on("update-cancelled", () => {
      if (this.stopped || this.state.phase === "ready") return;
      this.state.phase = "available";
      this.state.percent = 0;
      delete this.state.error;
    });
    updater.on("update-downloaded", (info: VersionInfo) => {
      if (this.stopped) return;
      this.version(info, true);
      this.state.phase = "ready";
      this.state.percent = 100;
      if (this.notifiedVersion !== info.version) {
        this.notifiedVersion = info.version;
        this.o.onReady?.(info.version);
      }
    });
    updater.on("error", (error: Error) => this.fail(error));
  }

  status(): UpdateStatus {
    const busy = this.o.isBusy();
    return { ...this.state, error: this.state.error === "busy" && !busy ? undefined : this.state.error, autoDownload: this.enabled, busy };
  }

  private version(info: VersionInfo, available: boolean): void {
    this.state.latest = info.version;
    this.state.available = available;
    this.state.releaseUrl = `${RELEASES}/tag/v${encodeURIComponent(info.version)}`;
    const suffix = installerSuffix(this.o.platform, this.o.arch);
    const file = info.files?.find((f) => suffix && f.url.endsWith(suffix) && !/[\\/:]/.test(f.url));
    this.state.downloadUrl = file ? `${RELEASES}/download/v${encodeURIComponent(info.version)}/${encodeURIComponent(file.url)}` : this.state.releaseUrl;
    delete this.state.error;
  }

  private fail(error: unknown): void {
    if (this.stopped && this.state.phase !== "installing") return;
    const installing = this.state.phase === "installing";
    const downloading = this.state.phase === "downloading" || !!this.downloading;
    this.state.error = installing ? "install_failed" : downloading ? "download_failed" : "check_failed";
    this.state.phase = "error";
    log.warn("application update failed", { message: String((error as Error)?.message ?? error).slice(0, 1000) });
    if (installing) this.o.onInstallError?.();
    else if (this.running) this.schedule(RETRY_MS);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.stopped = false;
    this.schedule(FIRST_CHECK_MS);
  }

  stop(): void {
    this.running = false;
    this.stopped = true;
    clearTimeout(this.timer);
    if (this.state.phase !== "installing") this.token?.cancel();
  }

  private schedule(delay: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(async () => {
      await this.check();
      if (this.running) this.schedule(this.state.phase === "error" ? RETRY_MS : CHECK_EVERY_MS);
    }, delay);
    this.timer.unref();
  }

  check(): Promise<void> {
    if (this.stopped || this.downloading || this.state.phase === "ready" || this.state.phase === "installing") return Promise.resolve();
    if (this.checking) return this.checking;
    this.state.phase = "checking";
    delete this.state.error;
    this.checking = (async () => {
      try {
        const result = await this.updater.checkForUpdates();
        if (this.stopped) return;
        if (!result) { this.state.phase = "idle"; return; }
        this.token = result.cancellationToken;
        this.version(result.updateInfo, result.isUpdateAvailable ?? this.state.available);
        this.state.phase = this.state.available ? "available" : "idle";
        if (this.state.available && this.enabled) this.download(true);
      } catch (error) { this.fail(error); }
      finally { this.checking = undefined; }
    })();
    return this.checking;
  }

  download(automatic = false): void {
    if (this.stopped) throw new UpdateActionError("unsupported");
    if (this.downloading || this.state.phase === "ready" || this.state.phase === "installing") return;
    if (!this.state.available) throw new UpdateActionError("not_ready");
    this.state.phase = "downloading";
    this.state.percent = 0;
    delete this.state.error;
    this.automaticDownload = automatic;
    if (!this.token || this.token.cancelled) this.token = this.o.newToken();
    const token = this.token;
    this.downloading = Promise.resolve().then(() => this.updater.downloadUpdate(token)).catch((error) => {
      if (this.stopped) return;
      if (token.cancelled) { this.state.phase = "available"; delete this.state.error; return; }
      this.fail(error);
    }).finally(() => {
      this.downloading = undefined;
      if (token.cancelled && this.enabled && this.automaticDownload && !this.stopped) this.download(true);
    });
  }

  setAutoDownload(on: boolean): void {
    this.enabled = on;
    if (!on && this.automaticDownload && this.state.phase === "downloading") this.token?.cancel();
    if (on && this.state.available && !this.downloading && !this.stopped && this.state.phase !== "checking") this.download(true);
  }

  install(): void {
    if (this.state.phase === "installing") return;
    if (this.stopped || this.state.phase !== "ready") throw new UpdateActionError("not_ready");
    if (this.o.isBusy()) throw new UpdateActionError("busy");
    this.state.phase = "installing";
    delete this.state.error;
    // 先让本机 HTTP 接口回完响应，再关闭服务、数据库及子进程。
    setTimeout(() => {
      void (async () => {
        try {
          if (this.o.isBusy()) throw new UpdateActionError("busy");
          await this.o.prepareInstall();
          this.updater.quitAndInstall(true, true);
        } catch (error) {
          if (error instanceof UpdateActionError && error.code === "busy") {
            this.state.phase = "ready";
            this.state.error = "busy";
          } else this.fail(error);
        }
      })();
    }, 100);
  }
}
