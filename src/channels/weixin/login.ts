/*
 * 微信 iLink 扫码登录状态机（供 UI 与 CLI 共用）。
 * 流程移植自 Tencent/openclaw-weixin src/auth/login-qr.ts（MIT，见 ./LICENSE.openclaw-weixin）。
 */
import fs from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import { IlinkClient, type QrStatusResp } from "./api.js";
import { logger } from "../../log.js";
import { t } from "../../i18n/index.js";

const log = logger("weixin.login");
const MAX_QR_REFRESH = 3;
const LOGIN_TIMEOUT_MS = 8 * 60_000;

export type LoginState =
  | "idle"
  | "fetching"
  | "wait"
  | "scaned"
  | "need_verifycode"
  | "confirmed"
  | "already_bound"
  | "failed"
  | "cancelled";

export interface LoginSnapshot {
  state: LoginState;
  message: string;
  /** 二维码内容（URL）；UI 用 dataUrl 显示 */
  qrContent?: string;
  qrDataUrl?: string;
  qrPngPath?: string;
  refreshCount: number;
  /** 验证码已交上去，正在等服务端答复（界面上输入框先禁用、显示"正在验证"） */
  verifying?: boolean;
  /** 上一次交的验证码不对（服务端带着验证码查回来还是要验证码） */
  codeError?: boolean;
}

export interface LoginResult {
  botToken: string;
  ilinkBotId: string;
  baseUrl: string;
  userId: string;
}

export class WeixinLogin {
  snapshot: LoginSnapshot = { state: "idle", message: "", refreshCount: 0 };
  private abort = new AbortController();
  /** 正在等用户输入验证码时，交上来的验证码从这里递给轮询循环 */
  private codeWaiter: ((code: string) => void) | undefined;
  private onUpdate: ((s: LoginSnapshot) => void) | undefined;

  constructor(
    private opts: {
      apiBaseUrl: string;
      pngPath?: string;
      fetchImpl?: typeof fetch;
      printTerminal?: boolean;
      localTokens?: string[];
      pollDelayMs?: number;
    },
  ) {}

  subscribe(fn: (s: LoginSnapshot) => void): void {
    this.onUpdate = fn;
  }

  private set(patch: Partial<LoginSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.onUpdate?.(this.snapshot);
  }

  /** 交验证码：只在等验证码的时候收（早到、重复交的不算），收下后循环立刻带着它去查 */
  submitVerifyCode(code: string): boolean {
    const c = code.trim();
    const waiter = this.codeWaiter;
    if (!c || !waiter) return false;
    this.codeWaiter = undefined;
    // 先改状态再交给循环：接口这次的回复里就是"正在验证"
    this.set({ verifying: true, codeError: false, message: t("channel.login_verifying") });
    waiter(c);
    return true;
  }

  /**
   * 等用户输入手机上显示的数字。等的时候不去查状态：不带验证码的查询服务端会挂着不回（约 30 秒），
   * 用户交了验证码也得等它回来才能发出去（同 openclaw-weixin：读到验证码后立即带着它查询）。
   * 取消或整个登录超时返回 undefined。
   */
  private nextCode(signal: AbortSignal, deadline: number): Promise<string | undefined> {
    return new Promise((resolve) => {
      const done = (code: string | undefined) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        this.codeWaiter = undefined;
        resolve(code);
      };
      const onAbort = () => done(undefined);
      const timer = setTimeout(() => done(undefined), Math.max(0, deadline - Date.now()));
      signal.addEventListener("abort", onAbort, { once: true });
      this.codeWaiter = done;
    });
  }

  cancel(): void {
    this.abort.abort();
    if (!["confirmed", "failed", "already_bound"].includes(this.snapshot.state)) this.set({ state: "cancelled", message: t("channel.login_cancelled") });
  }

  private async showQr(client: IlinkClient): Promise<string> {
    const qr = await client.getBotQrCode(this.opts.localTokens ?? []);
    const content = qr.qrcode_img_content;
    const qrDataUrl = await QRCode.toDataURL(content, { margin: 1, width: 320 });
    if (this.opts.pngPath) {
      fs.mkdirSync(path.dirname(this.opts.pngPath), { recursive: true });
      await QRCode.toFile(this.opts.pngPath, content, { margin: 1, width: 320 });
    }
    if (this.opts.printTerminal) {
      const qt = (await import("qrcode-terminal")).default;
      qt.generate(content, { small: true }, (s: string) => process.stdout.write(`\n${t("channel.login_terminal_scan")}\n${s}\n`));
      if (this.opts.pngPath) process.stdout.write(`${t("channel.login_terminal_saved", { path: this.opts.pngPath })}\n`);
    }
    this.set({ state: "wait", message: t("channel.login_wait"), qrContent: content, qrDataUrl, qrPngPath: this.opts.pngPath, verifying: false, codeError: false });
    return qr.qrcode;
  }

  /** 运行完整登录流程，成功返回凭据，失败/取消返回 undefined。 */
  async run(): Promise<LoginResult | undefined> {
    const signal = this.abort.signal;
    // 取二维码总在固定地址；扫码后服务端可能让轮询换到另一个机房（scaned_but_redirect），换了新二维码再回到固定地址
    const home = new IlinkClient({ baseUrl: this.opts.apiBaseUrl, fetchImpl: this.opts.fetchImpl });
    let client = home;
    const deadline = Date.now() + LOGIN_TIMEOUT_MS;
    let refreshCount = 0;
    try {
      this.set({ state: "fetching", message: t("channel.login_fetching"), refreshCount });
      let qrcode = await this.showQr(home);
      /** 下一次查询要带上的验证码（用户刚交的） */
      let code: string | undefined;
      let last = "wait";
      while (!signal.aborted && Date.now() < deadline) {
        const sent = code;
        code = undefined;
        const st: QrStatusResp = await client.getQrCodeStatus(qrcode, sent, 35_000, signal);
        // 状态变了才记（排查"扫了没反应"时能看出停在哪一步）
        if (st.status !== last || sent) log.info("qr status", { status: st.status, withCode: !!sent });
        last = st.status;
        switch (st.status) {
          case "wait":
            // 带着验证码的那次请求没发出去（网络错误）：下次再带上；服务端还没给结论就接着等，界面保持"正在验证"
            if (sent && st.failed) code = sent;
            break;
          case "scaned":
            if (this.snapshot.state !== "scaned" || this.snapshot.verifying) this.set({ state: "scaned", message: t("channel.login_scanned"), verifying: false, codeError: false });
            break;
          case "need_verifycode": {
            // 带着验证码查回来还是要验证码：输错了，让用户重输
            this.set({ state: "need_verifycode", message: t(sent ? "channel.login_code_wrong" : "channel.login_need_code"), verifying: false, codeError: !!sent });
            code = await this.nextCode(signal, deadline);
            continue; // 立刻带着验证码查，不等那 1 秒（取消、超时时 while 条件会结束循环）
          }
          case "scaned_but_redirect":
            if (st.redirect_host) {
              client = new IlinkClient({ baseUrl: `https://${st.redirect_host}`, fetchImpl: this.opts.fetchImpl });
              log.info("IDC redirect", { host: st.redirect_host });
            } else log.warn("scaned_but_redirect without redirect_host, keep polling the current host");
            break;
          case "binded_redirect":
            this.set({ state: "already_bound", message: t("channel.login_already_bound") });
            return undefined;
          case "expired":
          case "verify_code_blocked": {
            const blocked = st.status === "verify_code_blocked";
            refreshCount++;
            if (refreshCount > MAX_QR_REFRESH) {
              this.set({ state: "failed", message: t(blocked ? "channel.login_code_blocked_stop" : "channel.login_qr_expired_too_often") });
              return undefined;
            }
            this.set({ refreshCount, verifying: false, message: t(blocked ? "channel.login_code_blocked" : "channel.login_qr_refreshing", { n: refreshCount, max: MAX_QR_REFRESH }) });
            client = home;
            qrcode = await this.showQr(home);
            // 输错太多次换了新码：让"输错太多次"这句话留在新二维码下面，不然用户不知道为什么要重扫
            if (blocked) this.set({ message: t("channel.login_code_blocked", { n: refreshCount, max: MAX_QR_REFRESH }) });
            break;
          }
          case "confirmed": {
            if (!st.ilink_bot_id || !st.bot_token) {
              this.set({ state: "failed", message: t("channel.login_no_token") });
              return undefined;
            }
            this.set({ state: "confirmed", message: t("channel.login_confirmed"), qrDataUrl: undefined, qrContent: undefined });
            log.info("weixin login confirmed", { ilinkBotId: st.ilink_bot_id });
            return {
              botToken: st.bot_token,
              ilinkBotId: st.ilink_bot_id,
              baseUrl: st.baseurl || this.opts.apiBaseUrl,
              userId: st.ilink_user_id || "",
            };
          }
        }
        await new Promise((r) => setTimeout(r, this.opts.pollDelayMs ?? 1000));
      }
      if (!signal.aborted) this.set({ state: "failed", message: t("channel.login_timeout") });
      return undefined;
    } catch (e) {
      if (signal.aborted) return undefined;
      this.set({ state: "failed", message: t("channel.login_failed", { message: (e as Error).message }) });
      return undefined;
    }
  }
}
