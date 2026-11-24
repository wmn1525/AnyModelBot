/**
 * 需求与反馈的本机草稿：<数据目录>/feedback-drafts/<账户摘要>.json（目录 700、文件 600，经临时文件改名写入）。
 * 和账户凭据一样只靠文件权限保护；数据目录对机器人的沙箱是禁读的（agent/host.ts 的 AMB_DENY_READ），
 * 所以草稿不会进机器人的上下文。不云同步、不写日志（这里不记录任何内容），闲置 7 天清理。
 *
 * 按账户隔离：每个账户（以及未登录）一个文件，文件名是账户标识的摘要。联系许可从不落盘（关闭、恢复、
 * 登录完成、切账号都要重新确认）；自填的联系方式可以留着，但只是本人下次不用重输，不代表同意。
 * 诊断日志也不落盘。写不进磁盘（只读的数据目录等）时退回进程内存，界面改说"草稿仅在本次运行保留"。
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DRAFT_TTL_MS, FEEDBACK_TABS, type FeedbackTab, type TabDraft } from "./model.js";

export interface DraftSet {
  /** 每次保存加一：快照绑定这个版本，迟到的成功回执只清和已发快照同版本的草稿 */
  revisions: Partial<Record<FeedbackTab, number>>;
  tabs: Partial<Record<FeedbackTab, TabDraft>>;
  savedAt: number;
}

interface FileShape extends DraftSet {
  v: 1;
}

interface IndexShape {
  v: 1;
  /** 最近保存草稿的账户（摘要）：换了账户时问本人要不要把那份带过来 */
  lastOwner?: string;
}

const MAX_TEXT = 20_000;
const str = (v: unknown, max = MAX_TEXT) => (typeof v === "string" ? v.slice(0, max) : undefined);

/** 只留认识的字段；联系许可、诊断、报错一律不存 */
export function sanitizeTabDraft(raw: unknown): TabDraft | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const d = raw as Record<string, any>;
  const out: TabDraft = {};
  const description = str(d.description);
  if (description) out.description = description;
  if (Array.isArray(d.guidance)) {
    const g = d.guidance.map((x: unknown) => str(x, 400)).filter(Boolean) as string[];
    if (g.length) out.guidance = g.slice(0, 8);
  }
  if (d.context && typeof d.context === "object") {
    const c = { task: str(d.context.task), current_approach: str(d.context.current_approach), desired_outcome: str(d.context.desired_outcome) };
    if (c.task || c.current_approach || c.desired_outcome) out.context = Object.fromEntries(Object.entries(c).filter(([, v]) => v)) as TabDraft["context"];
  }
  if (d.role === "enterprise_use" || d.role === "solution_partner") out.role = d.role;
  if (d.business && typeof d.business === "object") {
    const b = d.business;
    const business: NonNullable<TabDraft["business"]> = {};
    for (const k of ["company_name", "job_role", "current_systems", "partnership_context", "team_size", "product_interest"] as const) {
      const v = str(b[k]);
      if (v) business[k] = v;
    }
    if (b.introduce_to_own_company === true) business.introduce_to_own_company = true;
    if (Object.keys(business).length) out.business = business;
  }
  const scenario = str(d.scenarioId, 40);
  if (scenario) out.scenarioId = scenario;
  if (d.contactKind === "email" || d.contactKind === "wechat") out.contactKind = d.contactKind;
  const contactValue = str(d.contactValue, 300);
  if (contactValue) out.contactValue = contactValue;
  return Object.keys(out).length ? out : undefined;
}

export function sanitizeDraftTabs(raw: unknown): DraftSet["tabs"] {
  const tabs: DraftSet["tabs"] = {};
  if (!raw || typeof raw !== "object") return tabs;
  for (const tab of FEEDBACK_TABS) {
    const d = sanitizeTabDraft((raw as Record<string, unknown>)[tab]);
    if (d) tabs[tab] = d;
  }
  return tabs;
}

/** 草稿有没有本人写的内容（只有角色、场景上下文、自填联系方式不算） */
export function hasContent(d: TabDraft | undefined): boolean {
  if (!d) return false;
  return !!(d.description?.trim() || Object.values(d.context ?? {}).some((v) => v?.trim()) || ["company_name", "job_role", "current_systems", "partnership_context"].some((k) => (d.business as any)?.[k]?.trim()));
}

export class DraftStore {
  private memory = new Map<string, DraftSet>();
  private memoryLastOwner: string | undefined;
  private persistent: boolean;

  constructor(private dir: string, private now: () => number = Date.now) {
    this.persistent = this.prepare();
    if (this.persistent) this.sweep();
  }

  static at(dataDir: string): DraftStore {
    return new DraftStore(path.join(dataDir, "feedback-drafts"));
  }

  /** 能不能存在本机磁盘（否则只在本次运行的内存里） */
  get isPersistent(): boolean {
    return this.persistent;
  }

  private prepare(): boolean {
    try {
      fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
      if (process.platform !== "win32") fs.chmodSync(this.dir, 0o700);
      const probe = path.join(this.dir, `.probe-${process.pid}`);
      fs.writeFileSync(probe, "", { mode: 0o600 });
      fs.rmSync(probe, { force: true });
      return true;
    } catch {
      return false;
    }
  }

  private key(owner: string): string {
    return crypto.createHash("sha256").update(`amb-feedback-draft\n${owner}`).digest("hex").slice(0, 32);
  }
  private file(owner: string): string {
    return path.join(this.dir, `${this.key(owner)}.json`);
  }
  private get indexFile(): string {
    return path.join(this.dir, "index.json");
  }

  private writeAtomic(file: string, data: string): void {
    const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
    fs.writeFileSync(tmp, data, { mode: 0o600 });
    fs.renameSync(tmp, file);
  }

  private expired(set: DraftSet | undefined): boolean {
    return !set || this.now() - set.savedAt > DRAFT_TTL_MS;
  }

  /** 清掉闲置超过 7 天的草稿（启动时、每次读写时） */
  sweep(): void {
    if (!this.persistent) {
      for (const [k, v] of this.memory) if (this.expired(v)) this.memory.delete(k);
      return;
    }
    let names: string[] = [];
    try {
      names = fs.readdirSync(this.dir);
    } catch {
      return;
    }
    for (const name of names) {
      const f = path.join(this.dir, name);
      if (name.endsWith(".tmp")) {
        fs.rmSync(f, { force: true });
        continue;
      }
      if (!/^[0-9a-f]{32}\.json$/.test(name)) continue;
      try {
        const set = JSON.parse(fs.readFileSync(f, "utf8")) as FileShape;
        if (this.expired(set)) fs.rmSync(f, { force: true });
      } catch {
        fs.rmSync(f, { force: true });
      }
    }
  }

  load(owner: string): DraftSet | undefined {
    if (!this.persistent) {
      const set = this.memory.get(this.key(owner));
      if (this.expired(set)) {
        this.memory.delete(this.key(owner));
        return undefined;
      }
      return set;
    }
    const f = this.file(owner);
    if (!fs.existsSync(f)) return undefined;
    try {
      const raw = JSON.parse(fs.readFileSync(f, "utf8")) as FileShape;
      if (raw.v !== 1 || this.expired(raw)) {
        fs.rmSync(f, { force: true });
        return undefined;
      }
      return { tabs: sanitizeDraftTabs(raw.tabs), revisions: raw.revisions ?? {}, savedAt: raw.savedAt };
    } catch {
      return undefined;
    }
  }

  /** 保存（整份替换某几个分类）。空分类删掉；全空就删文件。返回各分类的新版本号 */
  save(owner: string, tabs: DraftSet["tabs"], only?: FeedbackTab[]): DraftSet {
    const prev = this.load(owner);
    const next: DraftSet = { tabs: { ...(prev?.tabs ?? {}) }, revisions: { ...(prev?.revisions ?? {}) }, savedAt: this.now() };
    for (const tab of only ?? FEEDBACK_TABS) {
      const d = sanitizeTabDraft(tabs[tab]);
      const before = JSON.stringify(prev?.tabs?.[tab] ?? null);
      if (d) next.tabs[tab] = d;
      else delete next.tabs[tab];
      if (JSON.stringify(next.tabs[tab] ?? null) !== before) next.revisions[tab] = (next.revisions[tab] ?? 0) + 1;
    }
    this.write(owner, next);
    return next;
  }

  /** 清掉一个分类；expectRevision 给了时只在版本一致才清（迟到的成功回执不清新的输入） */
  clear(owner: string, tab: FeedbackTab, expectRevision?: number): boolean {
    const prev = this.load(owner);
    if (!prev?.tabs[tab]) return false;
    if (expectRevision !== undefined && (prev.revisions[tab] ?? 0) !== expectRevision) return false;
    const next: DraftSet = { tabs: { ...prev.tabs }, revisions: { ...prev.revisions, [tab]: (prev.revisions[tab] ?? 0) + 1 }, savedAt: this.now() };
    delete next.tabs[tab];
    this.write(owner, next);
    return true;
  }

  clearAll(owner: string): void {
    this.write(owner, { tabs: {}, revisions: {}, savedAt: this.now() });
  }

  private write(owner: string, set: DraftSet): void {
    const empty = !Object.keys(set.tabs).length;
    if (!this.persistent) {
      if (empty) this.memory.delete(this.key(owner));
      else {
        this.memory.set(this.key(owner), set);
        this.memoryLastOwner = this.key(owner);
      }
      return;
    }
    const f = this.file(owner);
    try {
      if (empty) fs.rmSync(f, { force: true });
      else {
        this.writeAtomic(f, JSON.stringify({ v: 1, ...set } satisfies FileShape));
        this.writeAtomic(this.indexFile, JSON.stringify({ v: 1, lastOwner: this.key(owner) } satisfies IndexShape));
      }
    } catch {
      // 磁盘写不进去：这次运行剩下的时间退回内存，界面会改提示
      this.persistent = false;
      if (!empty) {
        this.memory.set(this.key(owner), set);
        this.memoryLastOwner = this.key(owner);
      }
    }
  }

  /** 另一个账户（或未登录时）留下的草稿：有就返回它的摘要，供"要不要带到新账号"使用 */
  pendingFrom(owner: string): string | undefined {
    const mine = this.key(owner);
    let last = this.memoryLastOwner;
    if (this.persistent) {
      try {
        last = (JSON.parse(fs.readFileSync(this.indexFile, "utf8")) as IndexShape).lastOwner;
      } catch {
        last = undefined;
      }
    }
    if (!last || last === mine || !/^[0-9a-f]{32}$/.test(last)) return undefined;
    const set = this.loadByKey(last);
    return set && FEEDBACK_TABS.some((tab) => hasContent(set.tabs[tab])) ? last : undefined;
  }

  private loadByKey(key: string): DraftSet | undefined {
    if (!this.persistent) {
      const set = this.memory.get(key);
      return this.expired(set) ? undefined : set;
    }
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(this.dir, `${key}.json`), "utf8")) as FileShape;
      return raw.v === 1 && !this.expired(raw) ? { tabs: sanitizeDraftTabs(raw.tabs), revisions: raw.revisions ?? {}, savedAt: raw.savedAt } : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * 本人选择"带入并检查"：把上一个账户的草稿正文移到当前账户（覆盖当前账户同一分类里空着的部分，已有内容的分类保留当前的），
   * 原账户那份删掉。联系许可本来就不落盘，带过来也要重新确认。
   */
  moveFrom(fromKey: string, owner: string): DraftSet | undefined {
    if (!/^[0-9a-f]{32}$/.test(fromKey) || fromKey === this.key(owner)) return this.load(owner);
    const from = this.loadByKey(fromKey);
    if (!from) return this.load(owner);
    const mine = this.load(owner);
    const tabs: DraftSet["tabs"] = { ...(mine?.tabs ?? {}) };
    for (const tab of FEEDBACK_TABS) if (!hasContent(tabs[tab]) && from.tabs[tab]) tabs[tab] = from.tabs[tab];
    const next = this.save(owner, tabs);
    if (this.persistent) fs.rmSync(path.join(this.dir, `${fromKey}.json`), { force: true });
    else this.memory.delete(fromKey);
    return next;
  }

  /** 本人选择"不带入"：以后不再问这份（原账户的草稿留着，回到那个账户还在） */
  dismissPending(owner: string): void {
    if (!this.persistent) {
      this.memoryLastOwner = this.key(owner);
      return;
    }
    try {
      this.writeAtomic(this.indexFile, JSON.stringify({ v: 1, lastOwner: this.key(owner) } satisfies IndexShape));
    } catch {
      /* 下次再问一次也无妨 */
    }
  }
}
