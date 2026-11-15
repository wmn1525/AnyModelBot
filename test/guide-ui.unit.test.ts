import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
let ui: any;
const state = () => ({ owner: "local", version: 2, done: [], skipped: [], hidden: false, seen: [], welcomeAvailable: true, primaryBotId: "default", connectedChannels: [] });
const response = (data: any) => ({ ok: true, json: async () => ({ ...data }) });
beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal("window", { matchMedia: () => ({ matches: false }), addEventListener() {}, dispatchEvent() {} });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem() {}, removeItem() {} });
  // @ts-expect-error Unbundled browser module.
  ui = await import("../ui/lib/guide.js");
});
afterEach(() => vi.unstubAllGlobals());
describe("首次欢迎的会话边界", () => {
  it("初次进入后保留欢迎；退出再接入同一本机身份不重放", async () => {
    const saved = state();
    vi.stubGlobal("fetch", vi.fn(async (_url: string, options: any) => {
      if (options?.body && JSON.parse(options.body).entered) saved.welcomeAvailable = false;
      return response(saved);
    }));
    await ui.loadGuide(); expect(ui.guide.get().welcome).toBe(true);
    ui.enteredWelcome(); await ui.refreshGuide(); expect(ui.guide.get().welcome).toBe(true);
    ui.leaveGuideSession(); await ui.loadGuide(); expect(ui.guide.get().welcome).toBe(false);
  });
  it("退出之后迟到的进度加载不能重新打开欢迎状态", async () => {
    let resolve!: (v: unknown) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((done) => { resolve = done; })));
    const loading = ui.loadGuide(); ui.leaveGuideSession(); resolve(response(state())); await loading;
    expect(ui.guide.get()).toMatchObject({ loaded: false, welcome: false });
  });
  it("读取已有完成里程碑不会重新弹完成卡片", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ ...state(), seen: ["completed"], migration: true })));
    await ui.loadGuide(); expect(ui.isActive()).toBe(false); expect(ui.completionCard.get()).toBe(null);
  });
});
describe("主动点清单步骤", () => {
  it("能显示就设为当前引导；被挡住时只提示最前一条原因，不留待弹出的引导", async () => {
    vi.stubGlobal("document", { documentElement: { dataset: {} } });
    vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "140ms" }));
    // @ts-expect-error Unbundled browser module.
    const store = await import("../ui/lib/store.js");
    // @ts-expect-error Unbundled browser module.
    const { t } = await import("../ui/lib/i18n.js");
    for (const reason of ["permission", "needs", "replying"]) {
      ui.stepBlock.set(reason);
      expect(ui.focusStep("hello")).toBe(false);
      expect(ui.guide.get().focus).toBe(null);
      expect(store.toasts.get().at(-1).text).toBe(t(`guide.blocked.${reason}`));
    }
    ui.stepBlock.set("");
    expect(ui.focusStep("memory")).toBe(true);
    expect(ui.guide.get()).toMatchObject({ focus: "memory", focusAuto: false });
  });
});
describe("引导卡判断有没有弹层挡着", () => {
  it("一直挂在页面上、关着时 hidden 的消息搜索遮罩不算弹层；真正显示的弹层才算", async () => {
    vi.stubGlobal("document", { documentElement: { dataset: {}, style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {} }, addEventListener() {}, removeEventListener() {} });
    // @ts-expect-error Native browser JavaScript module.
    const { openOverlay } = await import("../ui/components/guide.js");
    const el = (hidden: boolean, rects = 1) => ({ closest: (sel: string) => (sel === "[hidden]" && hidden ? {} : null), getClientRects: () => ({ length: rects }) });
    const root = (...els: unknown[]) => ({ querySelectorAll: () => els });
    expect(openOverlay(root(el(true, 0)))).toBe(false);
    expect(openOverlay(root(el(false, 0)))).toBe(false);
    expect(openOverlay(root(el(true, 0), el(false)))).toBe(true);
    expect(openOverlay(root())).toBe(false);
  });
});
