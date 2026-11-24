/**
 * 网页单聊里由宿主直接执行的生图（PRD 2026-11-23 R4、R6、R7）：参考图生图，和右下角选了纯图片生成型号时的纯文字生图。
 *
 * 点发送那一刻的计划（账户、精确型号与线路、用途、文字、有序的参考图内容版本、能力修订）在受理时冻结，之后的草稿编辑
 * 改不了它。执行时：复核（账户没换、能力修订没变、图片还在）→ 需要时问费用（每次都问 / 预计超过 0.5 美元）→ 批准后再复核 →
 * 先记下操作再提交（同一条消息只提交一次）→ 逐张核对结果 → 在原对话交付。
 * 结果未知不自动重试、不换标识；停止等待不等于上游取消；迟到的结果仍交回原对话，不重新生成。
 */
import path from "node:path";
import type { Store } from "../store/db.js";
import type { Attachments } from "../attachments/service.js";
import type { ApprovalCenter, QuestionItem } from "../agent/approvals.js";
import type { ReplySession } from "../core/types.js";
import type { MediaConfirm } from "../domain/bot-settings.js";
import { MEDIA_ASK_USD } from "../agent/manager.js";
import { interactiveOp } from "../core/runtime.js";
import { t } from "../i18n/index.js";
import { logger } from "../log.js";
import { capsFor, pureImageModel, type ModelCapabilities } from "../tools/media/capabilities.js";
import { modelVerdict, referenceVerdict, type RefItem, type RefVerdict } from "./reference.js";
import { MediaError, MediaUndeliveredError, MediaUnknownError, estimateUsd, safeReason, type DirectResult, type MediaService } from "../tools/media/index.js";
import type { DirectImage } from "../tools/media/direct.js";

const log = logger("media.generate");

/** 受理时冻结的一次生成 */
export interface GenerationPlan {
  botId: string;
  conversationId: string;
  /** 稳定的操作标识（网页的客户端消息 id，或纯文字生图时新建的） */
  operationId: string;
  /** 账户摘要：执行前和费用批准后都要和当前账户一致 */
  account: string;
  /** 精确型号 id（不带内置网关前缀）与线路 */
  model: string;
  line: string;
  mode: "reference" | "text";
  /** 参考图编码或文生图接口（来自能力接口） */
  encoding: string;
  prompt: string;
  /** 参考图（按显示顺序）的附件 id 与内容版本 */
  refs: Array<{ id: string; version: string }>;
  /** 冻结时的能力修订 */
  capsRevision: string;
}

export interface GenerationDeps {
  store: Store;
  media: MediaService;
  caps: ModelCapabilities;
  attachments: Attachments;
  approvals: ApprovalCenter;
  workspace: (botId: string) => string;
  /** 当前账户摘要；不是账号登录时为空 */
  account: () => string;
  confirm: (botId: string) => MediaConfirm;
  approvalTtlMs?: number;
}

/** 一句原因（服务端语言）：参考校验的原因码 → attachments.err_*，带上数量 / 限制 */
export function verdictText(v: RefVerdict): string {
  if (!v.code) return "";
  return t(`attachments.err_${v.code}` as never, { count: v.count ?? 0, limit: v.limit ? limitText(v.limit) : "" });
}

export function limitText(l: NonNullable<RefVerdict["limit"]>): string {
  const range = (fmt: (n: number) => string) => (l.min && l.max ? `${fmt(l.min)}–${fmt(l.max)}` : l.max ? `≤${fmt(l.max)}` : l.min ? `≥${fmt(l.min)}` : "");
  const mb = (n: number) => `${+(n / 1_000_000).toFixed(1)} MB`;
  const ratio = (r: number) => (r >= 1 ? `${+r.toFixed(2)}:1` : `1:${+(1 / r).toFixed(2)}`);
  if (l.kind === "edge") return t("attachments.limitEdge", { range: range(String) });
  if (l.kind === "aspect") return t("attachments.limitAspect", { range: range(ratio) });
  if (l.kind === "bytes") return t("attachments.limitBytes", { max: mb(l.max ?? 0) });
  return t("attachments.limitRequest", { max: mb(l.max ?? 0) });
}

export class ImageGeneration {
  constructor(private d: GenerationDeps) {}

  /** 参考图的受管副本（内容版本对得上、还在）；有一张不在就是 undefined */
  private images(plan: GenerationPlan): Array<DirectImage & { item: RefItem }> | undefined {
    const out: Array<DirectImage & { item: RefItem }> = [];
    for (const ref of plan.refs) {
      const a = this.d.attachments.get(plan.botId, ref.id);
      if (!a || a.version !== ref.version || a.kind !== "image" || a.conversationId !== plan.conversationId) return undefined;
      const data = this.d.attachments.read(a);
      if (!data) return undefined;
      out.push({ data, mime: a.mime === "image/jpeg" ? "image/jpeg" : "image/png", item: { kind: "image", mime: a.mime, width: a.width, height: a.height, storedBytes: a.storedBytes } });
    }
    return out;
  }

  /**
   * 提交前复核：账户、能力（修订、授权、能力、适配、限制）和图片。返回空串 = 可以提交，否则是给用户的一句原因。
   * 能力修订变了（后台改了这个账户的授权或能力）就不按旧计划提交。
   */
  async recheck(plan: GenerationPlan): Promise<{ reason: string; images?: DirectImage[] }> {
    if (!plan.account || this.d.account() !== plan.account) return { reason: t("media.directChanged") };
    const snap = await this.d.caps.get();
    if (snap.status === "ok" && snap.revision !== plan.capsRevision) return { reason: t("media.directChanged") };
    const m = capsFor(snap, plan.model);
    if (plan.mode === "text") {
      // 纯文字：授权、能力和文生图接口要明确；参考图相关的条件不适用
      if (snap.status !== "ok") return { reason: verdictText(modelVerdict(snap, m)) };
      if (!m || m.authorized === false || m.available === false) return { reason: verdictText({ code: "ref_unauthorized" }) };
      if (m.authorized !== true || m.available !== true || m.generation === "unknown") return { reason: verdictText({ code: "ref_caps_unknown" }) };
      if (m.generation !== "supported") return { reason: verdictText({ code: "ref_no_generation" }) };
      if (!m.generationEndpoint || m.generationEndpoint !== plan.encoding) return { reason: t("attachments.err_gen_adapter") };
      if (!plan.prompt.trim()) return { reason: verdictText({ code: "ref_no_text" }) };
      return { reason: "", images: [] };
    }
    const imgs = this.images(plan);
    if (!imgs) return { reason: t("attachments.err_expired") };
    const v = referenceVerdict(snap, m, imgs.map((i) => i.item), plan.prompt);
    if (v.code) return { reason: verdictText(v) };
    if (m!.referenceSpec!.encoding !== plan.encoding) return { reason: t("media.directChanged") };
    return { reason: "", images: imgs.map(({ data, mime }) => ({ data, mime })) };
  }

  /** 费用：每次都问，或已知预估超过上限才问；价格未知时明说按实际用量计费，不写 0 */
  private async confirm(plan: GenerationPlan, out: ReplySession, signal: AbortSignal): Promise<"go" | "cancel" | "stopped"> {
    const model = await this.d.media.imageModel(plan.botId, plan.model);
    const estimate = model ? estimateUsd(model, undefined, {}) : undefined;
    const setting = this.d.confirm(plan.botId);
    const ask = setting === "always" || (estimate !== undefined && estimate > MEDIA_ASK_USD);
    if (!ask) return "go";
    const priceLine = estimate !== undefined ? t("media.summaryPrice", { price: model?.price || `$${Math.round(estimate * 100) / 100}` }) : t("media.estimateUnknown");
    const summary = [
      t("media.summaryPrompt", { prompt: plan.prompt.length > 120 ? `${plan.prompt.slice(0, 120)}…` : plan.prompt }),
      plan.refs.length ? t("media.summaryRefs", { count: plan.refs.length }) : "",
      priceLine,
      plan.refs.length ? t("media.shareNote") : "",
    ].filter(Boolean).join("\n");
    const reason = setting !== "always" && estimate !== undefined ? t("media.reasonCost", { amount: Math.round(estimate * 100) / 100, limit: MEDIA_ASK_USD }) : "";
    const q: QuestionItem = {
      id: "model",
      header: t("media.confirmHeaderImage"),
      question: t("media.directQuestion", { model: plan.model }),
      detail: [summary, reason].filter(Boolean).join("\n"),
      // 只有这一个型号：不列别的型号让人换（换型号要回右下角的选择器）
      options: [{ label: t("media.directGo"), description: [plan.model, model?.price].filter(Boolean).join(" · ") }, { label: t("media.cancel"), description: t("media.cancelDesc") }],
    };
    const row = this.d.approvals.create({ kind: "question", botId: plan.botId, conversationId: plan.conversationId, sessionId: "", tool: "generate_image", detail: q.question, reason: "", payload: JSON.stringify([q]) });
    await out.apply(interactiveOp(row));
    const deadline = Date.now() + (this.d.approvalTtlMs ?? 10 * 60_000) + 10_000;
    let cur = row;
    const onAbort = () => this.d.approvals.cancel(row.id, "user");
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      while (cur.status === "pending") {
        if (signal.aborted) return "stopped";
        if (Date.now() > deadline) {
          this.d.approvals.cancel(row.id, "timeout");
          return "cancel";
        }
        const next = await this.d.approvals.wait(row.id, 60_000);
        if (!next) return "cancel";
        cur = next;
      }
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
    if (signal.aborted) return "stopped";
    if (cur.status !== "answered") return "cancel";
    let pick = "";
    try {
      pick = ((JSON.parse(cur.result) as { answers?: Array<{ selected?: string[]; custom?: string }> }).answers?.[0]?.selected?.[0] ?? "").trim();
    } catch {
      pick = "";
    }
    return pick === t("media.directGo") ? "go" : "cancel";
  }

  /** 交付：保存好的图片作为这条回复的文件；文字只说实际发生了什么 */
  private deliverText(r: DirectResult): string {
    const lost = r.missing + r.undelivered;
    if (!r.files.length) return r.undelivered ? t("media.directUndelivered") : t("media.directNoImages");
    const parts = [r.text];
    if (lost) parts.push(t("media.directPartial", { ok: r.files.length, missing: lost }));
    else if (!r.text) parts.push(t("media.directImagesOnly"));
    return parts.filter(Boolean).join("\n\n");
  }

  private abs(botId: string, rel: string): string {
    return path.join(this.d.workspace(botId), rel);
  }

  /**
   * 执行一次（在会话队列里，用户消息已经存好）。不抛错：每种结局都在原对话里留一句。
   * signal：停止按钮。提交前停止 = 不提交；提交后停止 = 停止等待（上游可能还在处理或计费），结果迟到时仍交回原对话。
   */
  async run(plan: GenerationPlan, out: ReplySession, signal: AbortSignal): Promise<void> {
    const { store } = this.d;
    const say = async (text: string, files: string[] = []) => {
      store.addMessage(plan.conversationId, "assistant", text, undefined, files.length ? { files } : {});
      await out.apply({ type: "text", text });
      for (const f of files) await out.apply({ type: "file", path: f, name: path.basename(f) }).catch(() => {});
    };
    await out.apply({ type: "typing", on: true });
    try {
      let check = await this.recheck(plan);
      if (check.reason) return await say(`⚠️ ${check.reason}`);
      if (signal.aborted) return await say(t("media.directCancelled"));
      const decision = await this.confirm(plan, out, signal);
      if (decision !== "go") return await say(t("media.directCancelled"));
      // 等批准期间账户、能力、图片可能变了：按原计划复核，不调整后继续
      check = await this.recheck(plan);
      if (check.reason) return await say(`⚠️ ${check.reason}`);
      if (signal.aborted) return await say(t("media.directCancelled"));
      const job = { model: plan.model, line: plan.line, mode: plan.mode, encoding: plan.encoding as never, prompt: plan.prompt, images: check.images ?? [] };
      const work = this.d.media.generateDirect(plan.botId, job, plan.operationId);
      let stopped = false;
      const raced = await Promise.race([
        work.then((r) => ({ r }), (e: unknown) => ({ e })),
        new Promise<{ stop: true }>((resolve) => {
          if (signal.aborted) return resolve({ stop: true });
          signal.addEventListener("abort", () => resolve({ stop: true }), { once: true });
        }),
      ]);
      if ("stop" in raced) {
        stopped = true;
        await say(t("media.directStopWaiting"));
        // 迟到的结果：只补交付已经生成的，不重新生成；归原对话
        void work.then(
          (r) => {
            const files = r.files.map((f) => this.abs(plan.botId, f));
            store.addMessage(plan.conversationId, "assistant", this.deliverText(r), undefined, files.length ? { files } : {});
          },
          (e: unknown) => log.warn("late image generation failed", { bot: plan.botId, message: (e as Error).message.slice(0, 200) }),
        );
        return;
      }
      if ("e" in raced) throw raced.e;
      const r = raced.r;
      if (!stopped) await say(this.deliverText(r), r.files.map((f) => this.abs(plan.botId, f)));
    } catch (e) {
      if (e instanceof MediaUnknownError) return await say(`⚠️ ${t("media.directUnknown")}`);
      if (e instanceof MediaUndeliveredError) return await say(`⚠️ ${t("media.directUndelivered")}`);
      const reason = e instanceof MediaError ? e.message : safeReason((e as Error).message ?? String(e));
      log.warn("image generation failed", { bot: plan.botId, model: plan.model, message: reason.slice(0, 200) });
      await say(`⚠️ ${t("media.directFailed", { reason })}`);
    } finally {
      await out.apply({ type: "typing", on: false }).catch(() => {});
    }
  }
}

/** 选的型号是不是纯图片生成型号（能力快照里明确能生图、不能对话） */
export function isPureImage(caps: ModelCapabilities, bareId: string): boolean {
  const snap = caps.peek();
  return snap.status === "ok" || snap.status === "stale" ? pureImageModel(capsFor(snap, bareId)) : false;
}
