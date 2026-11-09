/**
 * 微信扫码登录的验证码一步：手机上出现数字时，等用户输入再带着它查（不先挂一个不带验证码的长轮询），
 * 输错了告诉用户，输错太多次换新码；带着验证码的请求没发出去时重发。
 */
import { describe, it, expect } from "vitest";
import { WeixinLogin, type LoginSnapshot } from "../src/channels/weixin/login.js";
import { t } from "../src/i18n/index.js";

const CODE = "4321";

/**
 * 假 iLink：二维码 qr-1、qr-2…；状态按 script 走。轮到 "need" 时：不带验证码的查询记一笔（不该发生），
 * 带对了验证码 → confirmed，带错了 → 还是 need_verifycode（错满 blockAfter 次 → verify_code_blocked）。
 */
function fakeIlink(opts: { script: string[]; blockAfter?: number; failCodeOnce?: boolean }) {
  const seen: { qrcode: string; code?: string }[] = [];
  let qr = 0;
  let wrong = 0;
  let failedOnce = false;
  let step = 0;
  const json = (o: unknown) => new Response(JSON.stringify(o), { headers: { "content-type": "application/json" } });
  const fetchImpl = (async (url: string) => {
    const u = new URL(url);
    if (u.pathname === "/ilink/bot/get_bot_qrcode") {
      qr++;
      step = 0;
      return json({ qrcode: `qr-${qr}`, qrcode_img_content: `https://liteapp.weixin.qq.com/q/mock?qrcode=qr-${qr}` });
    }
    if (u.pathname === "/ilink/bot/get_qrcode_status") {
      const code = u.searchParams.get("verify_code") ?? undefined;
      seen.push({ qrcode: u.searchParams.get("qrcode")!, code });
      const s = opts.script[Math.min(step, opts.script.length - 1)];
      if (s !== "need") {
        step++;
        return json({ status: s });
      }
      if (!code) return json({ status: "need_verifycode" });
      if (opts.failCodeOnce && !failedOnce) {
        failedOnce = true;
        throw new TypeError("fetch failed");
      }
      if (code === CODE) {
        step++;
        return json({ status: "confirmed", bot_token: "tok", ilink_bot_id: "bot@im.bot", ilink_user_id: "owner@im.wechat", baseurl: "https://ilinkai.weixin.qq.com" });
      }
      wrong++;
      return json({ status: opts.blockAfter && wrong >= opts.blockAfter ? "verify_code_blocked" : "need_verifycode" });
    }
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
  return { fetchImpl, seen };
}

const until = async (login: WeixinLogin, ok: (s: LoginSnapshot) => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!ok(login.snapshot)) {
    if (Date.now() > end) throw new Error(`timed out; snapshot=${JSON.stringify({ ...login.snapshot, qrDataUrl: undefined })}`);
    await new Promise((r) => setTimeout(r, 5));
  }
};

const make = (fetchImpl: typeof fetch) => new WeixinLogin({ apiBaseUrl: "https://ilinkai.weixin.qq.com", fetchImpl, pollDelayMs: 1 });

describe("微信扫码登录：验证码", () => {
  it("等用户输入时不再查状态；输错有提示，输对后马上带着验证码查并登录成功", async () => {
    const ilink = fakeIlink({ script: ["wait", "scaned", "need"] });
    const login = make(ilink.fetchImpl);
    const done = login.run();
    await until(login, (s) => s.state === "need_verifycode");
    expect(login.snapshot.codeError).toBe(false);
    expect(login.snapshot.message).toBe(t("channel.login_need_code"));

    // 等验证码的这段时间里不发不带验证码的查询
    const before = ilink.seen.length;
    await new Promise((r) => setTimeout(r, 80));
    expect(ilink.seen.length).toBe(before);

    // 输错：马上带着它查，回来还是要验证码 → 提示输错了
    expect(login.submitVerifyCode(" 1111 ")).toBe(true);
    expect(login.snapshot.verifying).toBe(true);
    await until(login, (s) => s.codeError === true);
    expect(login.snapshot.state).toBe("need_verifycode");
    expect(login.snapshot.verifying).toBe(false);
    expect(login.snapshot.message).toBe(t("channel.login_code_wrong"));
    expect(ilink.seen.at(-1)).toEqual({ qrcode: "qr-1", code: "1111" });

    expect(login.submitVerifyCode(CODE)).toBe(true);
    const res = await done;
    expect(res).toMatchObject({ botToken: "tok", ilinkBotId: "bot@im.bot", userId: "owner@im.wechat" });
    expect(login.snapshot.state).toBe("confirmed");
    // 进入要验证码之后只发过带验证码的查询：不带的只有 wait、scaned、第一次 need_verifycode 这三次
    expect(ilink.seen.map((x) => x.code ?? "-")).toEqual(["-", "-", "-", "1111", CODE]);
  });

  it("不在等验证码时交的不收", async () => {
    const ilink = fakeIlink({ script: ["wait"] });
    const login = make(ilink.fetchImpl);
    const done = login.run();
    await until(login, (s) => s.state === "wait");
    expect(login.submitVerifyCode(CODE)).toBe(false);
    expect(login.snapshot.verifying).toBeFalsy();
    login.cancel();
    expect(await done).toBeUndefined();
    expect(login.snapshot.state).toBe("cancelled");
  });

  it("带着验证码的请求没发出去（网络错误）：下次重发同一个验证码", async () => {
    const ilink = fakeIlink({ script: ["scaned", "need"], failCodeOnce: true });
    const login = make(ilink.fetchImpl);
    const done = login.run();
    await until(login, (s) => s.state === "need_verifycode");
    login.submitVerifyCode(CODE);
    expect(await done).toMatchObject({ botToken: "tok" });
    expect(ilink.seen.filter((x) => x.code === CODE).length).toBe(2);
  });

  it("输错太多次：换新二维码并说明原因，再错满就停", async () => {
    const ilink = fakeIlink({ script: ["need"], blockAfter: 1 });
    const login = make(ilink.fetchImpl);
    const history: LoginSnapshot[] = [];
    login.subscribe((s) => history.push(s));
    const done = login.run();
    for (let n = 1; n <= 3; n++) {
      await until(login, (s) => s.state === "need_verifycode" && !s.verifying && s.qrContent?.endsWith(`qr-${n}`) === true);
      login.submitVerifyCode("0000");
      await until(login, (s) => s.qrContent?.endsWith(`qr-${n + 1}`) === true);
      // 新二维码出来后，下面那句话是"输错太多次"，不是普通的"请扫码"
      const last = history.filter((s) => s.qrContent?.endsWith(`qr-${n + 1}`) && s.state === "wait").at(-1);
      expect(last?.message).toBe(t("channel.login_code_blocked", { n, max: 3 }));
    }
    await until(login, (s) => s.state === "need_verifycode" && !s.verifying);
    login.submitVerifyCode("0000");
    expect(await done).toBeUndefined();
    expect(login.snapshot.state).toBe("failed");
    expect(login.snapshot.message).toBe(t("channel.login_code_blocked_stop"));
  });

  it("等验证码时取消：循环结束，不再发请求", async () => {
    const ilink = fakeIlink({ script: ["need"] });
    const login = make(ilink.fetchImpl);
    const done = login.run();
    await until(login, (s) => s.state === "need_verifycode");
    const n = ilink.seen.length;
    login.cancel();
    expect(await done).toBeUndefined();
    expect(login.snapshot.state).toBe("cancelled");
    expect(ilink.seen.length).toBe(n);
  });
});
