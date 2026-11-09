import http from "node:http";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { AddressInfo } from "node:net";
import { ApiError, type AppKey } from "./client.js";
import type { AccountHooks, AccountStatus, AlertSettings, BotBudget, UsageSummary } from "./manager.js";
import { startOfLocalDay, summarizeUsage } from "./manager.js";
import { referencePrice, estimateRates, type PricingCatalog, type ModelInfo } from "./model-info.js";
import { playgroundModel, parsePlaygroundModel, type NewApiDesktop } from "../providers/newapi.js";
import type { KeyBalance } from "../providers/modelflare.js";
import { registerSecret } from "../log.js";
import type { Store } from "../store/db.js";
import { imageRoute, priceNote, unitPrice, sortModels, type Catalog, type MediaKind, type MediaModel } from "../tools/media/index.js";
import { logger } from "../log.js";

const SESSION = "newapi.session";
const log = logger("account.newapi");
export interface NewApiGroup { id: string; description: string; ratio: number | string; models: string[]; error?: string }
interface AuthBundle { access_token: string; access_expires_at: number; user: { id: number; username: string; display_name?: string; quota: number; used_quota: number }; session?: { id?: string; sid?: string } }

/** Uses the exact dashboard JWT + refresh-cookie flow and /pg route used by New API's playground. */
export class NewApiAccountManager {
  private bundle?: AuthBundle;
  private state: AccountStatus["state"] = "signed_out";
  private error = "";
  private name = "";
  private balance: number | null = null;
  private used: number | null = null;
  private updatedAt = 0;
  private quotaPerUnit = 0;
  private refreshing?: Promise<AccountStatus>;
  private rotating?: Promise<void>;
  private login?: ReturnType<NewApiDesktop["login"]>;
  private loginGeneration = 0;
  private groups: NewApiGroup[] = [];
  private catalogAt = 0;
  private catalogLoading?: Promise<void>;
  private relay?: http.Server;
  private relayUrl = "";
  private relayKey = crypto.randomBytes(32).toString("base64url");
  private relayStarting?: Promise<void>;
  private attached = false;
  private stopped = false;
  private keyBalance?: KeyBalance;
  private stopController = new AbortController();
  private mediaCache?: { at: number; data: MediaModel[] };
  private infoCache?: { at: number; data: Record<string, ModelInfo> };
  botsSource: () => Array<{ id: string; name: string; budget: BotBudget }> = () => [];

  constructor(private o: {
    origin: string; desktop: NewApiDesktop; store: Store; hooks: AccountHooks; alerts: () => AlertSettings;
    connectRelay(endpoint: { baseUrl: string; apiKey: string }, models: string[]): Promise<void>;
    onSignedIn?(): Promise<void>;
  }) { registerSecret(this.relayKey); }

  init(): void {
    const saved = this.o.store.getKV(SESSION);
    if (saved) {
      try { const record = JSON.parse(saved); if (record.origin === this.o.origin) { this.state = "signing_in"; this.name = record.name ?? ""; } } catch { /* stale metadata */ }
    }
  }
  async restore(): Promise<void> { if (this.state === "signing_in") await this.refresh(); }
  get signedIn(): boolean { return this.state === "signed_in"; }
  get ownerKey(): string {
    if (!this.signedIn) return "local";
    if (!this.bundle?.user.id) return "pending-account";
    return crypto.createHash("sha256").update(`${this.o.origin}:${this.bundle.user.id}`).digest("hex");
  }
  knownBalanceUsd(): number | null { return this.status().balanceUsd; }
  get baseUrl(): string { return this.relayUrl; }
  /** Only the host uses this loopback credential; site keys never leave this class. */
  get mediaKey(): string { return this.active ? this.relayKey : ""; }
  get active(): boolean { return !!this.bundle && this.attached; }
  status(): AccountStatus {
    const alerts = this.o.alerts();
    return { bot: null, topupUrl: `${this.o.origin}/console/topup`, state: this.state, name: this.name, source: this.signedIn ? "account" : this.keyBalance ? "key" : "none", balanceUsd: this.signedIn ? this.balance : this.keyBalance?.available ?? null, usedUsd: this.signedIn ? this.used : this.keyBalance?.used ?? null,
      balanceUnit: this.signedIn ? "USD" : this.keyBalance?.unit ?? "USD", balanceScope: this.signedIn ? "account" : this.keyBalance?.scope, unlimitedBalance: !this.signedIn && this.keyBalance?.unlimited, billedToEnterprise: false, updatedAt: this.updatedAt, error: this.error,
      loginUrl: this.login ? `${this.o.origin}/login` : "", alerts, keyQuality: { strategy: "balanced", supported: false }, lowBalance: !this.keyBalance?.unlimited && (this.keyBalance?.unit ?? "USD") === "USD" && (this.signedIn ? this.balance : this.keyBalance?.available) != null && alerts.lowBalanceUsd > 0 && (this.signedIn ? this.balance! : this.keyBalance!.available!) < alerts.lowBalanceUsd,
      ...(this.active ? { loginMethod: "newapi-playground" as const, capabilities: { groups: true, usage: true, budgets: false, notifications: false, invite: false, media: true } } : {}),
    };
  }

  private async raw(path: string, init: RequestInit = {}): Promise<Response> {
    // Never follow an authenticated redirect to a different host.
    return this.o.desktop.fetch(`${this.o.origin}${path}`, { ...init, redirect: "error", credentials: "include", signal: AbortSignal.any([this.stopController.signal, init.signal ?? AbortSignal.timeout(20000)]),
      headers: { Accept: "application/json", Origin: this.o.origin, Referer: `${this.o.origin}/`, ...Object.fromEntries(new Headers(init.headers)) } });
  }
  private async rotate(): Promise<void> {
    if (this.rotating) return this.rotating;
    const generation = this.loginGeneration;
    this.rotating = (async () => {
      const response = await this.raw("/api/user/auth/refresh", { method: "POST", headers: { "content-type": "application/json", ...(this.bundle?.session?.sid ? { "X-Auth-Session": this.bundle.session.sid } : {}) }, body: "{}" });
      const body = await response.json().catch(() => ({})) as any;
      if (!response.ok || body.success !== true || !body.data?.access_token) {
        if ([401, 403].includes(response.status)) throw new ApiError("OKINTO 登录已失效，请重新登录", 401);
        throw new ApiError(body.message || `登录刷新失败（HTTP ${response.status}）`, response.ok ? 502 : response.status);
      }
      const bundle = body.data as AuthBundle;
      if (!Number.isFinite(bundle.access_expires_at) || !Number.isSafeInteger(bundle.user?.id) || bundle.user.id <= 0) throw new ApiError("OKINTO 登录返回格式无效", 502);
      if (generation !== this.loginGeneration || this.stopped) throw new ApiError("登录已取消", 409);
      registerSecret(bundle.access_token);
      this.bundle = bundle;
    })().finally(() => { this.rotating = undefined; });
    return this.rotating;
  }
  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    if (!this.bundle || this.bundle.access_expires_at <= Date.now() / 1000 + 60) await this.rotate();
    for (let attempt = 0; ; attempt++) {
      const response = await this.raw(path, { ...init, headers: { ...Object.fromEntries(new Headers(init.headers)), Authorization: `Bearer ${this.bundle!.access_token}`, "New-Api-User": String(this.bundle!.user.id) } });
      if (response.status !== 401 || attempt) return response;
      await response.body?.cancel();
      await this.rotate();
    }
  }
  private async data<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.request(path, init);
    const body = await res.json().catch(() => ({})) as any;
    if (!res.ok || body.success === false || body.error) throw new ApiError(body.message || body.error?.message || `New API HTTP ${res.status}`, res.ok ? 502 : res.status);
    return body.data as T;
  }

  async startLogin(): Promise<string> {
    if (this.signedIn) throw new ApiError("当前已登录，请先退出后再更换账户", 409);
    if (this.login) return `${this.o.origin}/login`;
    await this.o.desktop.clear();
    this.error = ""; this.state = "signing_in";
    const generation = ++this.loginGeneration;
    const attempt = this.o.desktop.login();
    this.login = attempt;
    void attempt.result.then(async () => {
      if (generation !== this.loginGeneration) return;
      this.login = undefined;
      await this.refresh();
      if (generation === this.loginGeneration && this.signedIn) await this.o.onSignedIn?.();
    }, (error: Error) => {
      if (generation !== this.loginGeneration) return;
      this.login = undefined; this.state = "signed_out";
      this.error = error.message === "cancelled" ? "" : error.message;
    });
    return `${this.o.origin}/login`;
  }
  cancelLogin(): void {
    this.loginGeneration++; this.login?.cancel(); this.login = undefined;
    if (this.state === "signing_in") this.state = "signed_out";
  }

  refresh(): Promise<AccountStatus> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.doRefresh().finally(() => { this.refreshing = undefined; });
    return this.refreshing;
  }
  private async doRefresh(): Promise<AccountStatus> {
    if (this.stopped || this.login) return this.status();
    const generation = this.loginGeneration;
    if (this.state === "signed_out" && !this.bundle) {
      try { this.keyBalance = await this.o.hooks.keyBalance?.(); this.updatedAt = Date.now(); this.error = ""; }
      catch (error) { this.error = (error as Error).message; }
      return this.status();
    }
    try {
      const user = await this.data<AuthBundle["user"]>("/api/user/self");
      const status = await this.raw("/api/status");
      const site = await status.json() as { data?: { quota_per_unit?: number } };
      const quota = Number(site.data?.quota_per_unit);
      if (!status.ok || !Number.isFinite(quota) || quota <= 0 || !Number.isFinite(user.quota) || !Number.isFinite(user.used_quota)) throw new ApiError("账户余额返回格式无效", 502);
      if (generation !== this.loginGeneration || this.stopped) return this.status();
      this.keyBalance = undefined;
      this.quotaPerUnit = quota; this.name = user.display_name || user.username;
      this.balance = user.quota / quota; this.used = user.used_quota / quota;
      this.error = ""; this.updatedAt = Date.now();
      await this.loadGroups(!this.attached);
      if (generation !== this.loginGeneration || this.stopped) return this.status();
      this.state = "signed_in";
      this.o.store.setKV(SESSION, JSON.stringify({ origin: this.o.origin, name: this.name }));
      this.alertLowBalance();
    } catch (error) {
      if (generation !== this.loginGeneration || this.stopped) return this.status();
      this.error = (error as Error).message;
      if (error instanceof ApiError && error.status === 401) await this.expire();
      else if (!this.attached) this.state = "signed_out";
    }
    return this.status();
  }
  private alertLowBalance(): void {
    const low = this.status().lowBalance;
    const key = "newapi.lowBalanceAlerted";
    if (low && !this.o.store.getKV(key)) {
      this.o.store.setKV(key, "1"); this.o.hooks.alert(`OKINTO 账户余额不足：$${this.balance!.toFixed(2)}，请到 ${this.o.origin}/console/topup 充值`, this.o.alerts().push);
    } else if (!low) this.o.store.deleteKV(key);
  }

  async groupList(force = false): Promise<NewApiGroup[]> { if (this.signedIn) await this.loadGroups(force); return this.groups; }
  private async loadGroups(force = false): Promise<void> {
    if (!force && this.attached && Date.now() - this.catalogAt < 5 * 60_000) return;
    if (this.catalogLoading) return this.catalogLoading;
    const generation = this.loginGeneration;
    this.catalogLoading = (async () => {
      const groups = await this.data<Record<string, { desc?: string; ratio?: number | string }>>("/api/user/self/groups");
      if (!groups || typeof groups !== "object" || Array.isArray(groups)) throw new ApiError("分组列表返回格式无效", 502);
      const results: NewApiGroup[] = [];
      const entries = Object.entries(groups);
      // Bound concurrency: accounts with many groups must not flood the site.
      let cursor = 0;
      await Promise.all(Array.from({ length: Math.min(4, entries.length) }, async () => {
        for (;;) {
          const entry = entries[cursor++]; if (!entry) break;
          const [id, group] = entry;
          try {
            const models = await this.data<unknown>(`/api/user/models?group=${encodeURIComponent(id)}`);
            if (!Array.isArray(models) || !models.every((m) => typeof m === "string")) throw new ApiError("模型列表返回格式无效", 502);
            results.push({ id, description: group.desc ?? "", ratio: group.ratio ?? 1, models: [...new Set(models)].sort() });
          } catch (error) {
            if (error instanceof ApiError && error.status === 401) throw error;
            results.push({ id, description: group.desc ?? "", ratio: group.ratio ?? 1, models: [], error: (error as Error).message });
          }
        }
      }));
      results.sort((a, b) => a.id.localeCompare(b.id));
      if (generation !== this.loginGeneration || this.stopped) return;
      this.groups = results;
      this.infoCache = undefined; this.mediaCache = undefined;
      await this.startRelay();
      const models = this.chatModels();
      if (generation !== this.loginGeneration || this.stopped) return;
      await this.o.connectRelay({ baseUrl: this.relayUrl, apiKey: this.relayKey }, models);
      if (generation !== this.loginGeneration || this.stopped) return;
      this.attached = true; this.catalogAt = Date.now();
    })().finally(() => { this.catalogLoading = undefined; });
    return this.catalogLoading;
  }
  private chatModels(): string[] { return this.groups.flatMap((g) => g.models.map((m) => playgroundModel(g.id, m))); }

  /** Intersect the public image catalog with the authenticated group/model list. */
  async mediaModels(kind: MediaKind): Promise<MediaModel[]> {
    if (!this.active || !this.signedIn) throw new ApiError("请先登录 OKINTO", 401);
    if (kind !== "image") return [];
    await this.loadGroups();
    if (this.mediaCache && Date.now() - this.mediaCache.at < 5 * 60_000) return this.mediaCache.data;
    const generation = this.loginGeneration;
    const response = await this.raw("/api/pricing");
    if (!response.ok) throw new ApiError(`读取生图模型目录失败（HTTP ${response.status}）`, 502);
    const catalog = await response.json() as Catalog;
    if (!Array.isArray(catalog.data)) throw new ApiError("生图模型目录格式无效", 502);
    const entries = new Map(catalog.data.map((entry) => [entry.model_name, entry]));
    const models: MediaModel[] = [];
    for (const group of this.groups) for (const id of group.models) {
      const entry = entries.get(id);
      const route = imageRoute(id, entry?.supported_endpoint_types);
      if (!route) continue;
      // Never use the cheapest OTHER group's rate for a pinned group request.
      const ratio = Number(group.ratio);
      const effective: Catalog = { group_ratio: { [group.id]: Number.isFinite(ratio) && ratio >= 0 ? ratio : NaN }, usable_group: { [group.id]: group.description } };
      const priced = entry && { ...entry, enable_groups: [group.id] };
      const knownRatio = Number.isFinite(ratio) && ratio >= 0;
      models.push({ id: playgroundModel(group.id, id), kind: "image", route, options: entry?.media_options?.image,
        requiresReference: entry?.media_options?.image?.requires_reference === true,
        price: knownRatio ? priceNote(priced, effective) : "", cost: knownRatio ? unitPrice(priced, effective) : undefined,
        priority: entry?.display_priority ?? 1e9 });
    }
    if (generation !== this.loginGeneration || !this.signedIn || this.stopped) throw new ApiError("OKINTO 登录状态已变更，请重试", 409);
    const data = sortModels(models);
    this.mediaCache = { at: Date.now(), data };
    return data;
  }

  /** Images API requires a real token; scope it to one group/model and revoke it after use. */
  private async imageRequest(selected: { group: string; model: string }, endpoint: string, body: Record<string, unknown>, signal: AbortSignal): Promise<Response> {
    const generation = this.loginGeneration;
    const name = `okbot-image-${crypto.randomUUID()}`;
    let tokenId: number | undefined;
    if (!this.bundle || this.bundle.access_expires_at <= Date.now() / 1000 + 60) await this.rotate();
    const auth = this.bundle!;
    const tokenData = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
      const response = await this.raw(path, { ...init, headers: { ...Object.fromEntries(new Headers(init.headers)), Authorization: `Bearer ${auth.access_token}`, "New-Api-User": String(auth.user.id) } });
      const result = await response.json().catch(() => ({})) as { success?: boolean; message?: string; data: T };
      if (!response.ok || result.success !== true) throw new ApiError(result.message || `创建或读取临时生图令牌失败，请检查站点令牌权限（HTTP ${response.status}）`, response.ok ? 502 : response.status);
      return result.data;
    };
    try {
      signal.throwIfAborted();
      if (generation !== this.loginGeneration || !this.signedIn || this.stopped) throw new ApiError("OKINTO 登录状态已变更，请重试", 409);
      await tokenData("/api/token/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        name, group: selected.group, expired_time: Math.floor(Date.now() / 1000) + 15 * 60,
        unlimited_quota: true, model_limits_enabled: true, model_limits: selected.model, cross_group_retry: false,
      }) });
      const found = await tokenData<{ items?: Array<{ id: number; name: string }> }>(`/api/token/search?keyword=${encodeURIComponent(name)}&p=1&page_size=10`);
      tokenId = found?.items?.find((token) => token.name === name)?.id;
      if (!Number.isSafeInteger(tokenId) || tokenId! <= 0) throw new ApiError("无法找到临时生图令牌，请检查站点令牌权限", 502);
      const token = await tokenData<{ key?: string }>(`/api/token/${tokenId}/key`, { method: "POST" });
      if (!token?.key || typeof token.key !== "string") throw new ApiError("无法读取临时生图令牌，请检查站点令牌权限", 502);
      const key = token.key.startsWith("sk-") ? token.key : `sk-${token.key}`;
      registerSecret(token.key); registerSecret(key);
      if (generation !== this.loginGeneration || this.stopped || !this.signedIn) throw new ApiError("OKINTO 登录状态已变更，请重试", 409);
      signal.throwIfAborted();
      const { model: _model, group: _group, ...payload } = body;
      const response = await this.raw(endpoint, { method: "POST", headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify(endpoint.startsWith("/v1beta/") ? payload : { ...payload, model: selected.model }), signal });
      // fetch resolves at headers; retain the scoped token until the entire body arrives.
      const limit = 200 * 1024 * 1024;
      const chunks: Uint8Array[] = [];
      let length = 0;
      const reader = response.body?.getReader();
      try {
        if (reader) for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > limit) throw new ApiError("生图响应超过 200 MB", 502);
          chunks.push(value);
        }
      } catch (error) {
        await reader?.cancel().catch(() => {});
        if (error instanceof ApiError) throw error;
        throw new ApiError(signal.aborted ? "生图请求已取消或超时" : "生图响应传输中断，图片未完整接收；未自动重试以避免重复扣费", 502);
      } finally { reader?.releaseLock(); }
      const headers = new Headers({ "content-type": response.headers.get("content-type") ?? "application/json" });
      return new Response(length ? Buffer.concat(chunks, length) : null, { status: response.status, statusText: response.statusText, headers });
    } finally {
      if (tokenId && auth) {
        // Use the original account even if logout/login raced the generation.
        try {
          const response = await this.raw(`/api/token/${tokenId}`, { method: "DELETE", headers: { Authorization: `Bearer ${auth.access_token}`, "New-Api-User": String(auth.user.id) } });
          const result = await response.json() as { success?: boolean };
          if (!response.ok || result.success === false) log.warn("temporary image token revocation failed; expires within 15 minutes");
        } catch { log.warn("temporary image token revocation failed; expires within 15 minutes"); }
      }
    }
  }

  private async startRelay(): Promise<void> {
    if (this.relayUrl) return;
    if (this.relayStarting) return this.relayStarting;
    this.relayStarting = (async () => {
      this.relay = http.createServer((req, res) => void this.handleRelay(req, res));
      await new Promise<void>((resolve, reject) => { this.relay!.once("error", reject); this.relay!.listen(0, "127.0.0.1", resolve); });
      this.relayUrl = `http://127.0.0.1:${(this.relay.address() as AddressInfo).port}/v1`;
    })().finally(() => { this.relayStarting = undefined; });
    return this.relayStarting;
  }
  private async handleRelay(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const controller = new AbortController();
    const aborted = () => { if (!res.writableFinished) controller.abort(); };
    req.on("aborted", aborted); res.on("close", aborted);
    const json = (status: number, message: unknown) => { if (!res.headersSent) res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(message)); };
    try {
      if (req.headers.authorization !== `Bearer ${this.relayKey}`) return json(401, { error: { message: "Unauthorized" } });
      const path = new URL(req.url!, "http://localhost").pathname;
      if (this.bundle && req.method === "GET" && path === "/v1/models") return json(200, { data: this.chatModels().map((id) => ({ id, object: "model" })) });
      if (!this.signedIn) return json(401, { error: { message: "OKINTO 登录已失效，请重新登录" } });
      const images = path === "/v1/images/generations" || path === "/v1/images/edits";
      const gemini = /^\/v1(?:beta)?\/models\/(.+):generateContent$/.exec(path);
      if (req.method !== "POST" || path !== "/v1/chat/completions" && !images && !gemini) return json(404, { error: { message: "Unsupported New API relay endpoint" } });
      let size = 0; const chunks: Buffer[] = [];
      for await (const chunk of req) { size += chunk.length; if (size > 32 * 1024 * 1024) return json(413, { error: { message: "Request too large" } }); chunks.push(chunk); }
      let body: any; try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return json(400, { error: { message: "Invalid JSON" } }); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, { error: { message: "Invalid request body" } });
      let modelId: string;
      try { modelId = gemini ? decodeURIComponent(gemini[1]) : String(body.model ?? ""); }
      catch { return json(400, { error: { message: "Invalid model ID" } }); }
      const selected = parsePlaygroundModel(modelId);
      const group = selected && this.groups.find((g) => g.id === selected.group);
      if (!selected || !group || !group.models.includes(selected.model)) return json(400, { error: { message: "请选择当前账户可用分组中的模型" } });
      if (images || gemini) {
        const allowed = (await this.mediaModels("image")).some((model) => model.id === playgroundModel(selected.group, selected.model) && model.route === (gemini ? "gemini" : "images"));
        if (!allowed) return json(400, { error: { message: "当前模型不支持此生图接口" } });
      }
      // Preserve tools, multimodal messages, thinking and all other OpenAI fields.
      const upstream = images || gemini
        ? await this.imageRequest(selected, gemini ? `/v1beta/models/${encodeURIComponent(selected.model)}:generateContent` : path, body, controller.signal)
        : await this.request("/pg/chat/completions", { method: "POST", headers: { "content-type": "application/json", Accept: "text/event-stream" }, body: JSON.stringify({ ...body, group: selected.group, model: selected.model }), signal: controller.signal });
      res.writeHead(upstream.status, { "content-type": upstream.headers.get("content-type") ?? "application/json", "cache-control": "no-store" });
      if (upstream.body) await pipeline(Readable.fromWeb(upstream.body as any), res); else res.end();
    } catch (error) {
      if (!controller.signal.aborted) json(error instanceof ApiError ? error.status : 502, { error: { message: (error as Error).message } });
      if (res.headersSent && !res.writableEnded) res.end();
    } finally { req.off("aborted", aborted); res.off("close", aborted); }
  }

  async modelInfo(): Promise<Record<string, ModelInfo>> {
    if (this.infoCache && Date.now() - this.infoCache.at < 5 * 60_000) return this.infoCache.data;
    const response = await this.raw("/api/pricing");
    const catalog = response.ok ? await response.json().catch(() => ({})) as PricingCatalog : {};
    const entries = new Map((Array.isArray(catalog.data) ? catalog.data : []).map((e) => [e.model_name, e]));
    const out: Record<string, ModelInfo> = {};
    for (const group of this.groups) for (const model of group.models) {
      const entry = entries.get(model);
      const effective: PricingCatalog = { ...catalog, group_ratio: { [group.id]: typeof group.ratio === "number" ? group.ratio : NaN }, usable_group: { [group.id]: group.description } };
      out[playgroundModel(group.id, model)] = {
        ...(Number(entry?.context_window) > 0 ? { context: Number(entry!.context_window) } : {}),
        ...(entry ? { price: referencePrice(entry, effective), rates: estimateRates(entry, effective) } : {}),
        endpoints: ["openai"], group: { name: group.id, description: group.description, ratio: group.ratio },
      };
    }
    this.infoCache = { at: Date.now(), data: out };
    return out;
  }
  async usage(days: number): Promise<UsageSummary> {
    if (!this.signedIn) throw new ApiError("请先登录 OKINTO", 409);
    const now = Date.now(), start = startOfLocalDay(now - (days - 1) * 86400000);
    const rows: Array<{ model_name: string; created_at: number; quota: number; count: number; token_used: number }> = [];
    for (let page = 1; page <= 100; page++) {
      const data = await this.data<{ total: number; items: Array<{ model_name: string; created_at: number; quota: number }> }>(`/api/log/self?type=2&start_timestamp=${Math.floor(start / 1000)}&end_timestamp=${Math.floor(now / 1000)}&p=${page}&page_size=100`);
      if (!Array.isArray(data?.items)) throw new ApiError("用量返回格式无效", 502);
      rows.push(...data.items.map((r) => ({ ...r, count: 1, token_used: 0 })));
      if (rows.length >= data.total || !data.items.length) return summarizeUsage(rows, this.quotaPerUnit, start, days);
    }
    throw new ApiError("用量记录超过 10000 条，请到 OKINTO 控制台查看完整记录", 409);
  }
  async repairKeys(): Promise<boolean> { if (!this.signedIn) return false; await this.refresh(); return false; }
  async setRoutingStrategy(): Promise<AccountStatus> { throw new ApiError("请在 OKINTO 控制台管理路由策略", 409); }
  async setBotBudget(_id: string, _name: string, _budget: BotBudget): Promise<void> { throw new ApiError("游乐场登录使用账户余额；请在 OKINTO 控制台管理账户额度", 409); }
  async botBudgets(): Promise<Record<string, Pick<AppKey, "status" | "limit_usd" | "remain_usd" | "used_usd">>> { return {}; }
  async notifications(): Promise<unknown> { return { items: [], unread_count: 0 }; }
  async invite(): Promise<{ code: string; url: string }> { throw new ApiError("请到 OKINTO 控制台查看邀请信息", 409); }

  private async closeRelay(): Promise<void> {
    await this.relayStarting?.catch(() => {});
    const relay = this.relay;
    this.relay = undefined; this.relayUrl = "";
    if (relay) { relay.closeAllConnections(); await new Promise<void>((resolve) => relay.close(() => resolve())); }
  }
  private async expire(): Promise<void> {
    this.loginGeneration++;
    this.bundle = undefined; this.state = "signed_out"; this.balance = null; this.used = null; this.updatedAt = 0;
    this.groups = []; this.attached = false; this.catalogAt = 0; this.infoCache = undefined; this.mediaCache = undefined; this.o.store.deleteKV(SESSION);
    await this.closeRelay();
    await this.o.desktop.clear();
    await this.o.hooks.disconnect();
  }
  async logout(): Promise<{ revoked: boolean }> {
    this.cancelLogin();
    // Wait for a rotating refresh cookie before revoking this exact browser session.
    await this.refreshing?.catch(() => {});
    await this.catalogLoading?.catch(() => {});
    await this.rotating?.catch(() => {});
    let revoked = true;
    try {
      const res = await this.raw("/api/user/auth/logout", { method: "POST", headers: { "content-type": "application/json", ...(this.bundle ? { Authorization: `Bearer ${this.bundle.access_token}` } : {}), ...(this.bundle?.session?.sid ? { "X-Auth-Session": this.bundle.session.sid } : {}) }, body: "{}" });
      revoked = res.ok;
    } catch { revoked = false; }
    await this.o.desktop.clear(); await this.expire(); this.error = ""; this.name = "";
    return { revoked };
  }
  async close(): Promise<void> {
    this.stopped = true; this.cancelLogin(); this.stopController.abort();
    await this.refreshing?.catch(() => {});
    await this.catalogLoading?.catch(() => {});
    await this.closeRelay();
  }
}
