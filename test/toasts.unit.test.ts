import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
let store: any;
beforeEach(async () => {
  vi.useFakeTimers(); vi.resetModules();
  vi.stubGlobal("window", { matchMedia: () => ({ matches: false }), addEventListener() {} });
  vi.stubGlobal("document", { documentElement: { dataset: {} } });
  vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "140ms" }));
  // @ts-expect-error Browser module, exercised without mounting the UI.
  store = await import("../ui/lib/store.js");
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("全局提示的生命周期", () => {
  it("普通提示三秒淡出，悬停暂停，离开后重新计时", () => {
    const id = store.toast("Saved");
    vi.advanceTimersByTime(2900); store.pauseToast(id);
    vi.advanceTimersByTime(8000);
    expect(store.toasts.get()[0].leaving).toBeUndefined();
    store.resumeToast(id); vi.advanceTimersByTime(2999);
    expect(store.toasts.get()[0].leaving).toBeUndefined();
    vi.advanceTimersByTime(1); expect(store.toasts.get()[0].leaving).toBe(true);
    vi.advanceTimersByTime(200); expect(store.toasts.get()).toEqual([]);
  });
  it("跨作用域的相同提示合并，错误不会自动关闭", () => {
    const id = store.toast("Saved", "ok", "bot-settings");
    vi.advanceTimersByTime(2500);
    expect(store.toast("Saved")).toBe(id);
    vi.advanceTimersByTime(1000); expect(store.toasts.get()).toHaveLength(1);
    store.toast("Failed", "err"); vi.advanceTimersByTime(60_000);
    expect(store.toasts.get().map((t: any) => t.text)).toEqual(["Failed"]);
  });
  it("第四条先让最早的淡出，任何时候最多三条，最新的在底部", () => {
    ["one", "two", "three", "four"].forEach((s) => store.toast(s, "err"));
    expect(store.toasts.get().filter((t: any) => !t.queued)).toHaveLength(3);
    expect(store.toasts.get()[0].leaving).toBe(true);
    vi.advanceTimersByTime(200);
    expect(store.toasts.get().filter((t: any) => !t.queued).map((t: any) => t.text)).toEqual(["two", "three", "four"]);
  });
});
