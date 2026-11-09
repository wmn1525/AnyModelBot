/**
 * 界面：左下角的 Bot 额度（圆环 + 点开的卡片）、额度卡片的金额格式，以及处理完一件事后刷新额度用的节流。
 */
import { afterEach, describe, expect, it, vi } from "vitest";

/** 组件返回的 vnode 树里找节点（htm 生成的是 preact 的 vnode：type + props.children） */
function find(node: any, pred: (n: any) => boolean, out: any[] = []): any[] {
  if (Array.isArray(node)) node.forEach((n) => find(n, pred, out));
  else if (node && typeof node === "object") {
    if (pred(node)) out.push(node);
    find(node.props?.children, pred, out);
  }
  return out;
}
/** 节点里的文字（只看字符串和数字子节点） */
function text(node: any): string {
  if (node === null || node === undefined || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return text(node.props?.children);
}

const load = async (lang = "zh-CN") => {
  // 界面模块在浏览器里跑：只补上它们加载时要的那一点
  (globalThis as any).window ??= { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
  (globalThis as any).document ??= { documentElement: { dataset: {}, style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {} }, addEventListener() {}, removeEventListener() {} };
  (globalThis as any).localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
  // @ts-expect-error 界面代码是不经构建的 JS
  const i18n = await import("../ui/lib/i18n.js");
  i18n.setLangPref(lang);
  // @ts-expect-error 同上
  const sidebar = await import("../ui/screens/sidebar.js");
  // @ts-expect-error 同上
  const links = await import("../ui/lib/links.js");
  return { ...sidebar, ...links };
};

const account = (over: Record<string, unknown> = {}) => ({
  state: "signed_in",
  balanceUsd: 12.345,
  bot: { balanceUsd: 0.83, remainingPercent: 83 },
  lowBalance: false,
  alerts: { lowBalanceUsd: 5, push: false },
  topupUrl: "https://modelflare.dev/billing?utm_source=anymodelbot&utm_campaign=amb_topup#amb_account=sub-1",
  error: "",
  ...over,
});

describe("Bot 额度卡片", () => {
  it("顶上说明只能在 AnyModelBot 里用；一行 Bot 额度剩余百分比，一行余额（账户余额，两位小数）；底部是带账户标识的充值链接和订阅加赠", async () => {
    const { BotQuotaCard } = await load();
    const v = BotQuotaCard({ account: account() });
    const rows = find(v, (n) => n.props?.class === "quota-row").map(text);
    expect(rows).toEqual(["Bot 额度剩余 83%", "余额$12.35"]);
    const link = find(v, (n) => n.type === "a")[0];
    expect(link.props).toMatchObject({ href: account().topupUrl, target: "_blank" });
    expect(text(link)).toBe("充值↗订阅套餐另送套餐额度 10% 的 Bot 额度");
    expect(text(find(v, (n) => n.props?.class === "quota-scope")[0])).toBe("只能在 AnyModelBot 里使用");
    expect(find(v, (n) => n.props?.class === "quota-note")).toHaveLength(0);
  });

  it("用完时显示剩余 0%；余额很小也按两位小数", async () => {
    const { BotQuotaCard } = await load();
    const v = BotQuotaCard({ account: account({ bot: { balanceUsd: 0, remainingPercent: 0 }, balanceUsd: 0.004 }) });
    expect(find(v, (n) => n.props?.class === "quota-row").map(text)).toEqual(["Bot 额度剩余 0%", "余额$0.00"]);
  });

  it("余额低于提醒线时卡片里多一行说明", async () => {
    const { BotQuotaCard } = await load();
    const v = BotQuotaCard({ account: account({ balanceUsd: 3, lowBalance: true }) });
    expect(text(find(v, (n) => n.props?.class === "quota-note")[0])).toBe("低于提醒线 $5.00");
  });

  it("没有服务端给的充值地址时用默认的充值页", async () => {
    const { BotQuotaCard, MF_TOPUP } = await load();
    const v = BotQuotaCard({ account: account({ topupUrl: "" }) });
    expect(find(v, (n) => n.type === "a")[0].props.href).toBe(MF_TOPUP);
  });

  it("英文界面", async () => {
    const { BotQuotaCard } = await load("en");
    const v = BotQuotaCard({ account: account() });
    expect(find(v, (n) => n.props?.class === "quota-row").map(text)).toEqual(["Bot credits83% left", "Balance$12.35"]);
    expect(text(find(v, (n) => n.props?.class === "quota-scope")[0])).toBe("Only usable in AnyModelBot");
    expect(text(find(v, (n) => n.type === "a")[0])).toBe("Top up ↗Subscriptions add Bot credits worth 10% of the plan");
  });
});

describe("Bot 额度圆环", () => {
  const arc = (v: any) => find(v, (n) => n.props?.class === "quota-ring-arc")[0];
  it("弧长按剩余百分比；0% 只剩底圈；超出范围的夹住", async () => {
    const { QuotaRing } = await load();
    const c = 2 * Math.PI * 6;
    expect(arc(QuotaRing({ percent: 83 })).props["stroke-dasharray"]).toBe(`${((c * 83) / 100).toFixed(2)} ${c.toFixed(2)}`);
    expect(arc(QuotaRing({ percent: 100 })).props["stroke-dasharray"]).toBe(`${c.toFixed(2)} ${c.toFixed(2)}`);
    expect(arc(QuotaRing({ percent: 0 }))).toBeUndefined();
    expect(find(QuotaRing({ percent: 0 }), (n) => n.props?.class === "quota-ring-track")).toHaveLength(1);
    expect(arc(QuotaRing({ percent: 180 })).props["stroke-dasharray"]).toBe(`${c.toFixed(2)} ${c.toFixed(2)}`);
  });
});

describe("usd()", () => {
  it("默认很小的数保留四位；指定位数时按指定的", async () => {
    const { usd } = await load();
    expect(usd(0.004)).toBe("$0.0040");
    expect(usd(0.004, 2)).toBe("$0.00");
    expect(usd(12.345, 2)).toBe("$12.35");
    expect(usd(null, 2)).toBe("—");
  });
});

describe("处理完一件事后刷新额度的节流", () => {
  afterEach(() => vi.useRealTimers());

  it("第一次等 delay 再刷新；间隔内的多次并成一次，并且在最后那次之后补一次", async () => {
    vi.useFakeTimers();
    // @ts-expect-error 界面代码是不经构建的 JS
    const { trailingThrottle } = await import("../ui/lib/throttle.js");
    const fn = vi.fn();
    const run = trailingThrottle(fn, 10_000, 1500);
    run();
    run();
    vi.advanceTimersByTime(1499);
    expect(fn).toHaveBeenCalledTimes(0);
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    // 刚刷新过：等满 10 秒再刷，期间的调用都并进这一次
    vi.advanceTimersByTime(2000);
    run();
    vi.advanceTimersByTime(3000);
    run();
    vi.advanceTimersByTime(4999);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(2);
    // 很久没刷过：又只等 delay
    vi.advanceTimersByTime(60_000);
    run();
    vi.advanceTimersByTime(1500);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
