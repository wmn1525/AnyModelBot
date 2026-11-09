import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CancellationToken as Token } from "electron-updater";
import { DesktopUpdateService } from "../src/updates/desktop.js";

// 只加载更新器自己的纯 Node 依赖，不加载 Electron 或运行桌面应用。
const require = createRequire(import.meta.url);
const CancellationToken = createRequire(require.resolve("electron-updater/package.json"))("builder-util-runtime").CancellationToken as new () => Token;

const info = { version: "1.1.0", releaseDate: "2026-11-09", files: [{ url: "anymodel-bot-1.1.0-mac-arm64.dmg", sha512: "fixture" }] };
class FakeUpdater extends EventEmitter {
  autoDownload = true;
  autoInstallOnAppQuit = true;
  allowPrerelease = true;
  allowDowngrade = true;
  checkForUpdates = vi.fn(async () => {
    this.emit("update-available", info);
    return { isUpdateAvailable: true, updateInfo: info, cancellationToken: new CancellationToken(), downloadPromise: null };
  });
  downloadUpdate = vi.fn(async (_token?: Token): Promise<string[]> => []);
  quitAndInstall = vi.fn();
}
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const services: DesktopUpdateService[] = [];
afterEach(() => { for (const service of services.splice(0)) service.stop(); vi.useRealTimers(); });

function make(autoDownload = true) {
  const updater = new FakeUpdater();
  let busy = false;
  const onReady = vi.fn();
  const prepareInstall = vi.fn(async () => {});
  const onInstallError = vi.fn();
  const service = new DesktopUpdateService(updater as unknown as ConstructorParameters<typeof DesktopUpdateService>[0], {
    current: "1.0.0", platform: "darwin", arch: "arm64", autoDownload,
    newToken: () => new CancellationToken(), isBusy: () => busy, prepareInstall, onReady, onInstallError,
  });
  services.push(service);
  return { updater, service, onReady, prepareInstall, onInstallError, setBusy: (value: boolean) => { busy = value; } };
}

describe("desktop updates", () => {
  it("downloads in the background, reports progress, notifies once and never installs by itself", async () => {
    vi.useFakeTimers();
    const f = make();
    expect(f.updater).toMatchObject({ autoDownload: false, autoInstallOnAppQuit: false, allowPrerelease: false, allowDowngrade: false });
    f.service.start();
    await vi.advanceTimersByTimeAsync(19_999);
    expect(f.updater.checkForUpdates).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(f.updater.downloadUpdate).toHaveBeenCalledOnce();
    f.updater.emit("download-progress", { percent: 42, transferred: 420, total: 1000 });
    expect(f.service.status()).toMatchObject({ phase: "downloading", autoDownload: true, percent: 42, transferred: 420, total: 1000 });
    f.updater.emit("update-downloaded", info);
    f.updater.emit("update-downloaded", info);
    expect(f.service.status()).toMatchObject({ phase: "ready", latest: "1.1.0", percent: 100, available: true });
    expect(f.onReady).toHaveBeenCalledExactlyOnceWith("1.1.0");
    await f.service.check();
    expect(f.updater.checkForUpdates).toHaveBeenCalledOnce();
    expect(f.updater.quitAndInstall).not.toHaveBeenCalled();
    f.service.stop();
    await vi.advanceTimersByTimeAsync(12 * 3600_000);
    expect(f.updater.quitAndInstall).not.toHaveBeenCalled();
  });

  it("disabled automatic downloads still allow an explicit download", async () => {
    const f = make(false);
    await f.service.check();
    expect(f.service.status()).toMatchObject({ phase: "available", autoDownload: false });
    expect(f.updater.downloadUpdate).not.toHaveBeenCalled();
    f.service.download();
    await flush();
    expect(f.updater.downloadUpdate).toHaveBeenCalledOnce();
  });

  it("turning automatic downloads off cancels only the automatic transfer and allows a fresh retry", async () => {
    const f = make();
    f.updater.downloadUpdate.mockImplementationOnce((token) => new Promise((_resolve, reject) => token!.once("cancel", () => reject(new Error("cancelled")))));
    await f.service.check(); await flush();
    const first = f.updater.downloadUpdate.mock.calls[0][0]!;
    f.service.setAutoDownload(false);
    await flush();
    expect(first.cancelled).toBe(true);
    expect(f.service.status()).toMatchObject({ phase: "available", autoDownload: false });
    expect(f.service.status().error).toBeUndefined();
    f.service.download(); await flush();
    const second = f.updater.downloadUpdate.mock.calls[1][0]!;
    expect(second).not.toBe(first);
    f.service.setAutoDownload(false);
    expect(second.cancelled).toBe(false);
  });

  it("waits for work to finish, closes services, then explicitly installs", async () => {
    vi.useFakeTimers();
    const f = make();
    await f.service.check(); await flush();
    f.updater.emit("update-downloaded", info);
    f.setBusy(true);
    expect(() => f.service.install()).toThrow("busy");
    expect(f.prepareInstall).not.toHaveBeenCalled();
    f.setBusy(false);
    f.prepareInstall.mockImplementation(async () => f.service.stop());
    f.service.install();
    expect(f.service.status().phase).toBe("installing");
    expect(f.prepareInstall).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(f.prepareInstall).toHaveBeenCalledOnce();
    expect(f.updater.quitAndInstall).toHaveBeenCalledExactlyOnceWith(true, true);
  });

  it("turning automatic downloads back on during cancellation starts a fresh transfer", async () => {
    const f = make();
    f.updater.downloadUpdate.mockImplementationOnce((token) => new Promise((_resolve, reject) => token!.once("cancel", () => reject(new Error("cancelled")))));
    await f.service.check(); await flush();
    f.service.setAutoDownload(false);
    f.service.setAutoDownload(true);
    await flush();
    expect(f.updater.downloadUpdate).toHaveBeenCalledTimes(2);
    expect(f.service.status()).toMatchObject({ autoDownload: true, phase: "downloading" });
    expect(f.updater.downloadUpdate.mock.calls[1][0]!.cancelled).toBe(false);
  });

  it("reports a native installation failure after shutdown so the shell can reopen", async () => {
    vi.useFakeTimers();
    const f = make();
    await f.service.check(); await flush();
    f.updater.emit("update-downloaded", info);
    f.prepareInstall.mockImplementation(async () => f.service.stop());
    f.updater.quitAndInstall.mockImplementation(() => f.updater.emit("error", new Error("installer could not start")));
    f.service.install();
    await vi.advanceTimersByTimeAsync(100);
    expect(f.service.status()).toMatchObject({ phase: "error", error: "install_failed" });
    expect(f.onInstallError).toHaveBeenCalledOnce();
  });

  it("does not interrupt a task that starts between the click and shutdown", async () => {
    vi.useFakeTimers();
    const f = make();
    await f.service.check(); await flush();
    f.updater.emit("update-downloaded", info);
    f.service.install();
    f.setBusy(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(f.service.status()).toMatchObject({ phase: "ready", error: "busy" });
    expect(f.updater.quitAndInstall).not.toHaveBeenCalled();
    expect(f.prepareInstall).not.toHaveBeenCalled();
    f.setBusy(false);
    expect(f.service.status().error).toBeUndefined();
  });

  it("check and download failures remain retryable without starting an installation", async () => {
    const f = make();
    f.updater.checkForUpdates.mockRejectedValueOnce(new Error("network unavailable"));
    await f.service.check();
    expect(f.service.status()).toMatchObject({ phase: "error", error: "check_failed" });
    f.updater.downloadUpdate.mockRejectedValueOnce(new Error("checksum mismatch"));
    await f.service.check(); await flush();
    expect(f.service.status()).toMatchObject({ phase: "error", error: "download_failed" });
    expect(() => f.service.install()).toThrow("not_ready");
    f.service.download(); await flush();
    f.updater.emit("update-downloaded", info);
    expect(f.service.status().phase).toBe("ready");
    expect(f.updater.quitAndInstall).not.toHaveBeenCalled();
  });

  it("late check results after stopping cannot start a download", async () => {
    const f = make();
    let resolve!: (result: Awaited<ReturnType<FakeUpdater["checkForUpdates"]>>) => void;
    f.updater.checkForUpdates.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const pending = f.service.check();
    f.service.stop();
    resolve({ isUpdateAvailable: true, updateInfo: info, cancellationToken: new CancellationToken(), downloadPromise: null });
    await pending;
    expect(f.updater.downloadUpdate).not.toHaveBeenCalled();
  });

  it("retries a failed background download on the shorter retry interval", async () => {
    vi.useFakeTimers();
    const f = make();
    f.updater.downloadUpdate.mockRejectedValueOnce(new Error("offline"));
    f.service.start();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(f.service.status()).toMatchObject({ phase: "error", error: "download_failed" });
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(f.updater.checkForUpdates).toHaveBeenCalledTimes(2);
    expect(f.updater.downloadUpdate).toHaveBeenCalledTimes(2);
    expect(f.updater.quitAndInstall).not.toHaveBeenCalled();
  });
});
