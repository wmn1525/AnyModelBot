/**
 * 需求与反馈的本机服务：能力识别、草稿、冻结快照、提交、按提交 ID 查询。界面只经 web/routes/feedback.ts 调这里。
 *
 * 应用内建单只在"内置网关 + 已登录 Modelflare"时可用，而且要先确认工单服务支持 schema 2 和需要的能力（结构化字段、
 * 幂等、按提交 ID 查询）；缺任何一项都阻止新版建单并保留草稿，绝不自动剥字段降成旧版正文协议。
 *
 * 预览只构造一次：完整正文、结构化字段、本人选的诊断，绑定账户、分类、草稿版本和提交 ID（UUID），之后不可变。
 * 发送只用这份快照，不重读日志、不补默认模型。超时 / 断网 / 5xx / 不是有效回执都按"结果未知"处理：先按同一个提交 ID
 * 查询，或由本人用同一个 ID 和同一份载荷重试；不自动换新 ID，也不跨渠道补发。成功只清这次快照对应版本的那个分类的草稿。
 */
import crypto from "node:crypto";
import type { App } from "../app.js";
import { AccountRevokedError, ApiError, type RawApiResponse } from "../account/client.js";
import { diagnosticsReportParts } from "../diagnostics.js";
import { lang } from "../i18n/index.js";
import { logger } from "../log.js";
import { ComposeError, composeFeedback, environmentLine, externalCopy, feedbackEnvironment } from "./compose.js";
import { DraftStore, sanitizeTabDraft, type DraftSet } from "./drafts.js";
import {
  CONTACT_CHANNELS,
  CONTACT_POLICY_VERSION,
  FEEDBACK_SCENARIOS,
  FEEDBACK_SOURCES,
  FEEDBACK_TABS,
  LIMITS,
  SUBMIT_TIMEOUT_MS,
  parseReceipt,
  type ContactChoice,
  type FeedbackSource,
  type FeedbackTab,
  type FieldError,
  type Receipt,
  type TabDraft,
} from "./model.js";

const log = logger("feedback");

const CAPS_TTL_MS = 60_000;
/** 没发出去的快照放多久（之后要重新预览） */
const SNAPSHOT_TTL_MS = 30 * 60_000;
/** 结果未知的快照留多久（让本人查询或用同一个 ID 重试） */
const UNKNOWN_TTL_MS = 24 * 3600_000;

export type RemoteState = "ok" | "unsupported" | "error" | "skipped";

export interface FeedbackCapabilities {
  gateway: "builtin" | "external";
  signedIn: boolean;
  /** 当前能不能在应用内建单（内置网关 + 已登录 + 工单服务支持 schema 2） */
  canSubmit: boolean;
  remote: RemoteState;
  limits: { descriptionMin: number; inputMax: number; bodyMax: number; errorMax: number; logLines: number; emailMax: number; wechatMax: number; dailyLimit?: number };
  contactPolicyVersion: string;
  /** 账号邮箱：只来自当前已授权身份已有的值；没有时 emailAvailable = false，不拿用户名、域名代替 */
  identity: { emailAvailable: boolean; email?: string; revision?: string };
  environment: { version: string; os: string; runtime: string; locale: string; line: Record<FeedbackTab, string> };
  drafts: { persistent: boolean };
  /** 当前账户的短摘要：界面开着时据此发现换了账户（不是账户标识本身） */
  ownerTag: string;
}

interface RemoteCaps {
  policyVersion: string;
  dailyLimit?: number;
  identity: { emailAvailable: boolean; email?: string; revision?: string };
}

interface Snapshot {
  id: string;
  owner: string;
  tab: FeedbackTab;
  revision: number;
  csid: string;
  payload: Record<string, unknown>;
  identityRevision?: string;
  createdAt: number;
  state: "ready" | "sending" | "unknown" | "created";
  /** 构造时拿不到工单服务的能力（未登录、外部网关、能力读取失败）：只能看，不能发 */
  previewOnly?: boolean;
  receipt?: Receipt;
  inflight?: Promise<SubmitResult>;
}

export type SubmitResult =
  | { status: "created"; receipt: Receipt; tab: FeedbackTab; draftCleared: boolean }
  | { status: "processing"; clientSubmissionId: string }
  | { status: "unknown"; clientSubmissionId: string }
  | { status: "not_found"; clientSubmissionId: string }
  | { status: "failed"; code: string; field?: string }
  | { status: "rate_limited" }
  | { status: "session_expired" }
  | { status: "unsupported" }
  | { status: "unavailable" }
  | { status: "stale" };

export interface PreviewInput {
  tab: FeedbackTab;
  source: FeedbackSource;
  draft: TabDraft;
  contact: ContactChoice;
  diagnostics?: { includeError?: boolean; includeLogs?: boolean };
  errorContext?: { text?: string; requestId?: string; model?: string };
  /** 界面加载能力时看到的身份版本：和现在的不一致就要求重新检查 */
  identityRevision?: string;
}

export class FeedbackPreviewError extends Error {
  constructor(readonly errors: FieldError[]) {
    super("feedback preview rejected");
  }
}

const isTab = (v: unknown): v is FeedbackTab => FEEDBACK_TABS.includes(v as FeedbackTab);
const isSource = (v: unknown): v is FeedbackSource => FEEDBACK_SOURCES.includes(v as FeedbackSource);

/** 界面传来的预览请求：只取认识的字段 */
export function previewInput(b: any): PreviewInput | undefined {
  if (!b || !isTab(b.tab) || !isSource(b.source)) return undefined;
  const draft = sanitizeTabDraft(b.draft) ?? {};
  if (draft.scenarioId && !FEEDBACK_SCENARIOS.includes(draft.scenarioId as never)) delete draft.scenarioId;
  const c = b.contact ?? {};
  const contact: ContactChoice = c.consent === true ? { consent: true, ...(CONTACT_CHANNELS.includes(c.channel) ? { channel: c.channel } : {}), ...(typeof c.value === "string" ? { value: c.value.slice(0, 400) } : {}) } : { consent: false };
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);
  return {
    tab: b.tab,
    source: b.source,
    draft,
    contact,
    diagnostics: b.tab === "bug" ? { includeError: b.diagnostics?.includeError === true, includeLogs: b.diagnostics?.includeLogs === true } : undefined,
    errorContext: b.tab === "bug" && b.errorContext ? { text: str(b.errorContext.text, 20_000), requestId: str(b.errorContext.requestId, 80), model: str(b.errorContext.model, 200) } : undefined,
    identityRevision: str(b.identityRevision, 128),
  };
}

export class FeedbackService {
  readonly drafts: DraftStore;
  private caps: { owner: string; at: number; value: RemoteCaps | null; state: RemoteState } | undefined;
  private snapshots = new Map<string, Snapshot>();

  private submitTimeoutMs: number;

  constructor(private app: Pick<App, "magpie" | "account" | "config"> & Partial<App>, opts: { drafts?: DraftStore; submitTimeoutMs?: number } = {}) {
    this.drafts = opts.drafts ?? DraftStore.at(app.config.dataDir);
    this.submitTimeoutMs = opts.submitTimeoutMs ?? SUBMIT_TIMEOUT_MS;
  }

  /** 草稿和快照归属的账户（未登录是 local） */
  owner(): string {
    return this.app.account.isolationKey || "pending-account";
  }

  private get builtin(): boolean {
    return !!this.app.magpie;
  }

  private signedIn(): boolean {
    return this.builtin && this.app.account.signedIn;
  }

  /** 读工单服务的能力（内置网关 + 已登录才读；匿名编辑、外部网关不碰远端） */
  private async remoteCaps(force: boolean): Promise<{ value: RemoteCaps | null; state: RemoteState }> {
    if (!this.signedIn()) return { value: null, state: "skipped" };
    const owner = this.owner();
    if (!force && this.caps && this.caps.owner === owner && Date.now() - this.caps.at < CAPS_TTL_MS && this.caps.state !== "error") return this.caps;
    let res: RawApiResponse;
    try {
      res = await this.app.account.feedbackCapabilities();
    } catch (e) {
      if (e instanceof AccountRevokedError) return { value: null, state: "skipped" };
      // 读不到能力是"未知"，不是"可以发"：界面可以重试
      this.caps = { owner, at: Date.now(), value: null, state: "error" };
      return this.caps;
    }
    const parsed = parseRemoteCaps(res);
    this.caps = { owner, at: Date.now(), value: parsed.value, state: parsed.state };
    return this.caps;
  }

  async capabilities(force = false): Promise<FeedbackCapabilities> {
    const { value, state } = await this.remoteCaps(force);
    const env = feedbackEnvironment(lang());
    return {
      gateway: this.builtin ? "builtin" : "external",
      signedIn: this.signedIn(),
      canSubmit: this.signedIn() && state === "ok",
      remote: state,
      limits: { descriptionMin: LIMITS.descriptionMin, inputMax: LIMITS.inputMax, bodyMax: LIMITS.bodyMax, errorMax: LIMITS.errorMax, logLines: LIMITS.logLines, emailMax: LIMITS.emailMax, wechatMax: LIMITS.wechatMax, ...(value?.dailyLimit ? { dailyLimit: value.dailyLimit } : {}) },
      contactPolicyVersion: value?.policyVersion ?? "",
      identity: value?.identity ?? { emailAvailable: false },
      environment: {
        version: env.app_version,
        os: env.os_family,
        runtime: env.runtime,
        locale: env.locale,
        line: { use_case: environmentLine(env, "use_case"), bug: environmentLine(env, "bug"), enterprise: environmentLine(env, "enterprise") },
      },
      drafts: { persistent: this.drafts.isPersistent },
      ownerTag: this.ownerTag(),
    };
  }

  ownerTag(): string {
    return crypto.createHash("sha256").update(`amb-feedback-owner\n${this.owner()}`).digest("hex").slice(0, 12);
  }

  // —— 草稿 ——

  draft(): { persistent: boolean; draft: DraftSet | null; pendingMove: boolean; ownerTag: string } {
    const owner = this.owner();
    this.drafts.sweep();
    return { persistent: this.drafts.isPersistent, draft: this.drafts.load(owner) ?? null, pendingMove: !!this.drafts.pendingFrom(owner), ownerTag: this.ownerTag() };
  }

  saveDraft(tabs: DraftSet["tabs"], only?: FeedbackTab[]): { persistent: boolean; revisions: DraftSet["revisions"] } {
    const set = this.drafts.save(this.owner(), tabs, only);
    return { persistent: this.drafts.isPersistent, revisions: set.revisions };
  }

  clearDraft(tab?: FeedbackTab): void {
    if (tab) this.drafts.clear(this.owner(), tab);
    else this.drafts.clearAll(this.owner());
  }

  /** 换了账户后的那份草稿：本人选"带入并检查"才移过来，选"不带入"就不再问 */
  movePending(decision: "move" | "dismiss"): DraftSet | null {
    const owner = this.owner();
    const from = this.drafts.pendingFrom(owner);
    if (decision === "move" && from) return this.drafts.moveFrom(from, owner) ?? null;
    this.drafts.dismissPending(owner);
    return this.drafts.load(owner) ?? null;
  }

  // —— 预览（冻结快照） ——

  private expireSnapshots(): void {
    const now = Date.now();
    for (const [id, s] of this.snapshots) {
      const ttl = s.state === "unknown" || s.state === "sending" ? UNKNOWN_TTL_MS : SNAPSHOT_TTL_MS;
      if (now - s.createdAt > ttl) this.snapshots.delete(id);
    }
  }

  /**
   * 按当前分类构造一次完整内容并冻结。只在本机处理，不发工单；勾了"运行状态和最近日志"才读日志（此刻读一次，之后不再读）。
   * 同时把这份草稿存一次，快照记下存好的版本号：之后的任何编辑都会让版本前进，旧快照不能再清新的输入。
   */
  async preview(input: PreviewInput): Promise<{ snapshotId: string; clientSubmissionId: string; tab: FeedbackTab; body: string; notIncluded: string[]; notices: { errorTrimmed?: boolean; diagnosticsTrimmed?: boolean }; contact: { consent: boolean; channel?: string; value?: string }; revision: number }> {
    this.expireSnapshots();
    const { value } = await this.remoteCaps(false);
    if (input.contact.consent && input.contact.channel === "account_email" && value?.identity.revision && input.identityRevision && input.identityRevision !== value.identity.revision) {
      throw new FeedbackPreviewError([{ field: "contact", code: "identity_changed" }]);
    }
    const owner = this.owner();
    const env = feedbackEnvironment(lang());
    const logs = input.tab === "bug" && input.diagnostics?.includeLogs ? this.readDiagnostics() : undefined;
    const csid = crypto.randomUUID();
    let composed;
    try {
      composed = composeFeedback({
        tab: input.tab,
        source: input.source,
        draft: input.draft,
        contact: input.contact,
        identity: value?.identity.emailAvailable ? { email: value.identity.email, revision: value.identity.revision } : {},
        policyVersion: value?.policyVersion ?? CONTACT_POLICY_VERSION,
        environment: env,
        diagnostics: input.diagnostics,
        errorContext: input.errorContext,
        logs,
        clientSubmissionId: csid,
      });
    } catch (e) {
      if (e instanceof ComposeError) throw new FeedbackPreviewError(e.errors);
      throw e;
    }
    const saved = this.drafts.save(owner, { [input.tab]: input.draft }, [input.tab]);
    const snap: Snapshot = {
      id: crypto.randomUUID(),
      owner,
      tab: input.tab,
      revision: saved.revisions[input.tab] ?? 0,
      csid,
      payload: composed.payload,
      identityRevision: input.contact.channel === "account_email" && input.contact.consent ? value?.identity.revision : undefined,
      createdAt: Date.now(),
      state: "ready",
      ...(value ? {} : { previewOnly: true }),
    };
    this.snapshots.set(snap.id, snap);
    const contact = composed.payload.contact as { consent: boolean; channel?: string; value?: string };
    return {
      snapshotId: snap.id,
      clientSubmissionId: csid,
      tab: snap.tab,
      body: composed.body,
      notIncluded: composed.notIncluded,
      notices: composed.notices,
      contact: contact.consent ? { consent: true, channel: contact.channel, value: contact.channel === "account_email" ? value?.identity.email : contact.value } : { consent: false },
      revision: snap.revision,
    };
  }

  /** 本人放弃这次预览（返回修改、切分类、关闭）：快照作废 */
  discard(snapshotId: string): void {
    const s = this.snapshots.get(snapshotId);
    if (s && s.state === "ready") this.snapshots.delete(snapshotId);
  }

  /** 勾了"运行状态和最近日志"才读：最近 120 行（已脱敏）和不含日志的状态摘要 */
  private readDiagnostics(): { summary: string; lines: string[] } | undefined {
    if (!this.app.agent) return undefined;
    const parts = diagnosticsReportParts(this.app as App, LIMITS.logLines);
    return { summary: parts.summary, lines: parts.logs };
  }

  // —— 提交 ——

  async submit(snapshotId: string): Promise<SubmitResult> {
    this.expireSnapshots();
    const snap = this.snapshots.get(snapshotId);
    if (!snap || snap.owner !== this.owner()) return { status: "stale" };
    if (snap.state === "created" && snap.receipt) return { status: "created", receipt: snap.receipt, tab: snap.tab, draftCleared: false };
    // 双击、并发窗口：同一份快照只有一个请求在路上
    if (snap.inflight) return snap.inflight;
    if (!this.builtin) return { status: "unavailable" };
    if (!this.app.account.signedIn) return { status: "session_expired" };
    if (snap.previewOnly) {
      // 构造时拿不到工单服务的能力：这份只能看。服务端不支持新协议就照实说，否则请本人重新检查后再发
      const { state } = await this.remoteCaps(false);
      return state === "unsupported" ? { status: "unsupported" } : { status: "stale" };
    }
    snap.inflight = this.send(snap).finally(() => {
      snap.inflight = undefined;
    });
    return snap.inflight;
  }

  private async send(snap: Snapshot): Promise<SubmitResult> {
    const { value, state } = await this.remoteCaps(false);
    if (state === "unsupported") return { status: "unsupported" };
    if (state !== "ok" || !value) return snap.state === "unknown" ? { status: "unknown", clientSubmissionId: snap.csid } : { status: "unavailable" };
    if (snap.identityRevision && value.identity.revision !== snap.identityRevision) {
      this.snapshots.delete(snap.id);
      return { status: "failed", code: "CONTACT_IDENTITY_CHANGED" };
    }
    const prev = snap.state;
    snap.state = "sending";
    let res: RawApiResponse;
    try {
      res = await this.app.account.submitFeedback(snap.payload, this.submitTimeoutMs);
    } catch (e) {
      if (e instanceof AccountRevokedError) {
        // 重新登录后联系许可要重新确认，这份快照不能再用
        if (prev !== "unknown") this.snapshots.delete(snap.id);
        else snap.state = "unknown";
        return { status: "session_expired" };
      }
      if (e instanceof ApiError && e.status === 409) {
        snap.state = prev;
        return { status: "session_expired" };
      }
      // 超时、断网：结果未知。快照（同一个 ID、同一份载荷）留着
      snap.state = "unknown";
      log.warn("feedback submission result unknown", { reason: (e as Error).message });
      return { status: "unknown", clientSubmissionId: snap.csid };
    }
    return this.settle(snap, res, prev);
  }

  private settle(snap: Snapshot, res: RawApiResponse, prev: Snapshot["state"]): SubmitResult {
    const data = res.isJson && res.json && typeof res.json === "object" ? (res.json as Record<string, any>) : undefined;
    if ((res.status === 200 || res.status === 201) && data?.success === true) {
      const receipt = parseReceipt(data.data, snap.csid);
      if (receipt) return this.created(snap, receipt);
      if (data.data?.status === "processing") {
        snap.state = "unknown";
        return { status: "processing", clientSubmissionId: snap.csid };
      }
      // 200 却不是有效回执（HTML、缺字段、地址不合格）：不能显示已提交，先查
      snap.state = "unknown";
      return { status: "unknown", clientSubmissionId: snap.csid };
    }
    if (res.status === 202) {
      snap.state = "unknown";
      return { status: "processing", clientSubmissionId: snap.csid };
    }
    if (res.status >= 500 || res.status < 200 || (res.status < 300 && !data)) {
      snap.state = "unknown";
      return { status: "unknown", clientSubmissionId: snap.csid };
    }
    // 明确的拒绝：这次没有建单，快照回到原状态（本人可以修改、取消或重新预览；修改后是新的提交）
    snap.state = prev === "sending" ? "ready" : prev;
    const code = typeof data?.code === "string" ? data.code : "";
    const field = typeof data?.field === "string" ? data.field : undefined;
    if (res.status === 429) return { status: "rate_limited" };
    if (res.status === 404 || res.status === 405 || res.status === 426 || code === "FEEDBACK_SCHEMA_UNSUPPORTED") {
      if (this.caps) this.caps.state = "unsupported";
      return { status: "unsupported" };
    }
    if (code === "CONTACT_IDENTITY_CHANGED" || code === "CONTACT_EMAIL_UNAVAILABLE") this.caps = undefined;
    if (prev !== "unknown") this.snapshots.delete(snap.id);
    return { status: "failed", code: code || `HTTP_${res.status}`, ...(field ? { field } : {}) };
  }

  private created(snap: Snapshot, receipt: Receipt): SubmitResult {
    snap.state = "created";
    snap.receipt = receipt;
    snap.payload = {};
    // 只清这次快照对应版本的那个分类；之后又改过（版本前进了）就不清
    const draftCleared = this.drafts.clear(snap.owner, snap.tab, snap.revision);
    return { status: "created", receipt, tab: snap.tab, draftCleared };
  }

  /** 结果未知时按同一个提交 ID 查询：查到原回执就展示；处理中只显示处理中；查不到不授权换新 ID 补发 */
  async lookup(clientSubmissionId: string): Promise<SubmitResult> {
    const snap = [...this.snapshots.values()].find((s) => s.csid === clientSubmissionId && s.owner === this.owner());
    if (!snap) return { status: "stale" };
    if (snap.state === "created" && snap.receipt) return { status: "created", receipt: snap.receipt, tab: snap.tab, draftCleared: false };
    if (!this.signedIn()) return { status: "session_expired" };
    let res: RawApiResponse;
    try {
      res = await this.app.account.feedbackSubmission(clientSubmissionId);
    } catch (e) {
      if (e instanceof AccountRevokedError) return { status: "session_expired" };
      return { status: "unknown", clientSubmissionId };
    }
    const data = res.isJson && res.json && typeof res.json === "object" ? (res.json as Record<string, any>) : undefined;
    if (res.status === 200 && data?.success === true) {
      const receipt = parseReceipt(data.data, clientSubmissionId);
      if (receipt) return this.created(snap, receipt);
      if (data.data?.status === "processing") return { status: "processing", clientSubmissionId };
      if (data.data?.status === "not_found" && data.data?.client_submission_id === clientSubmissionId) return { status: "not_found", clientSubmissionId };
    }
    if (res.status === 404 || res.status === 405) return { status: "unsupported" };
    return { status: "unknown", clientSubmissionId };
  }

  // —— 邮件 / GitHub ——

  /** 外部副本（重新构造，不复用私有快照）：没有联系许可、联系值和结构化企业背景；已知的留联值也换成 *** */
  async external(input: PreviewInput): Promise<{ text: string; description: string; errorText: string; environment: string; version: string }> {
    if (input.tab === "enterprise") throw new FeedbackPreviewError([{ field: "tab", code: "external_unavailable" }]);
    const env = feedbackEnvironment(lang());
    const known = [input.draft.contactValue ?? "", input.contact.value ?? ""];
    const identity = this.caps?.value?.identity;
    if (identity?.email) known.push(identity.email);
    const logs = input.tab === "bug" && input.diagnostics?.includeLogs ? this.readDiagnostics() : undefined;
    const out = externalCopy({ tab: input.tab, draft: input.draft, environment: env, knownContacts: known, diagnostics: input.diagnostics, errorText: input.errorContext?.text, logs });
    return { ...out, environment: environmentLine(env, input.tab), version: env.app_version };
  }
}

/** 检查工单服务的能力：支持 schema 2 而且结构化字段、幂等、查询三项都在，才算可以发新版工单 */
export function parseRemoteCaps(res: RawApiResponse): { value: RemoteCaps | null; state: RemoteState } {
  if (res.status === 404 || res.status === 405) return { value: null, state: "unsupported" };
  if (res.status >= 500 || !res.isJson) return { value: null, state: res.status >= 200 && res.status < 300 ? "unsupported" : "error" };
  const body = res.json as Record<string, any>;
  if (res.status !== 200 || body?.success !== true || !body.data || typeof body.data !== "object") return { value: null, state: res.status >= 400 && res.status < 500 ? "unsupported" : "error" };
  const d = body.data;
  const versions = Array.isArray(d.supported_schema_versions) ? d.supported_schema_versions : [];
  const f = d.features ?? {};
  if (!versions.includes(2) || f.structured_fields !== true || f.idempotency !== true || f.submission_lookup !== true) return { value: null, state: "unsupported" };
  if (typeof d.contact_policy_version !== "string" || !d.contact_policy_version || d.contact_policy_version.length > 32) return { value: null, state: "unsupported" };
  const ci = d.contact_identity ?? {};
  const email = ci.email_available === true && typeof ci.email === "string" && ci.email.length <= LIMITS.emailMax ? ci.email : undefined;
  const revision = typeof ci.identity_revision === "string" && ci.identity_revision.length <= 128 ? ci.identity_revision : undefined;
  const limit = d.limits?.daily_limit;
  return {
    value: {
      policyVersion: d.contact_policy_version,
      ...(typeof limit === "number" && limit > 0 ? { dailyLimit: limit } : {}),
      identity: { emailAvailable: !!email && !!revision, ...(email && revision ? { email, revision } : {}) },
    },
    state: "ok",
  };
}
