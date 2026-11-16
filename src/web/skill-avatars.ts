/**
 * 技能库作者头像的本机缓存（「应用与技能」› 技能列表）：GitHub 头像在国内读得慢，读到过的存到
 * <dataDir>/cache/skill-avatars/，下次打开直接给本机这份；过了 TTL 在后台重新取，取到之前照旧给旧图。
 * 只认技能库清单里的作者（ui/data/skill-library.json），不替界面去取任意地址。取不到时返回 null（界面一直显示首字母）。
 */
import fs from "node:fs";
import path from "node:path";
import { logger } from "../log.js";

const log = logger("skill-avatars");
/** 存下的头像多久之后在后台更新一次 */
export const SKILL_AVATAR_TTL_MS = 7 * 24 * 3600_000;
const MAX_BYTES = 1_000_000;
const TIMEOUT_MS = 10_000;

/** 文件头认图片格式：只收 PNG、JPEG、GIF、WebP */
export function imageType(b: Buffer): string | null {
  if (b.length > 8 && b[0] === 0x89 && b.toString("ascii", 1, 4) === "PNG") return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 6 && b.toString("ascii", 0, 4) === "GIF8") return "image/gif";
  if (b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export class SkillAvatars {
  private pending = new Map<string, Promise<Buffer | null>>();
  private known: Set<string> | undefined;

  constructor(private o: { dir: string; authors: () => string[]; fetchImpl: () => typeof fetch; now?: () => number; ttlMs?: number }) {}

  private allowed(account: string): boolean {
    this.known ??= new Set(this.o.authors().map((a) => a.toLowerCase()));
    return this.known.has(account.toLowerCase());
  }

  private file(account: string): string {
    return path.join(this.o.dir, `${account.toLowerCase()}.img`);
  }

  /** 这位作者的头像：本机有就直接给（过期了顺带在后台更新），没有就去取一次 */
  async get(account: string): Promise<{ data: Buffer; type: string } | null> {
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(account) || !this.allowed(account)) return null;
    const file = this.file(account);
    try {
      const st = fs.statSync(file);
      const data = fs.readFileSync(file);
      const type = imageType(data);
      if (type) {
        if ((this.o.now?.() ?? Date.now()) - st.mtimeMs > (this.o.ttlMs ?? SKILL_AVATAR_TTL_MS)) void this.fetch(account);
        return { data, type };
      }
    } catch {
      /* 还没存过 */
    }
    const data = await this.fetch(account);
    const type = data && imageType(data);
    return data && type ? { data, type } : null;
  }

  /** 同一位作者同时只取一次 */
  private fetch(account: string): Promise<Buffer | null> {
    let p = this.pending.get(account);
    if (!p) {
      p = this.download(account).finally(() => this.pending.delete(account));
      this.pending.set(account, p);
    }
    return p;
  }

  private async download(account: string): Promise<Buffer | null> {
    try {
      const res = await this.o.fetchImpl()(`https://github.com/${encodeURIComponent(account)}.png?size=128`, { redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) return null;
      const data = Buffer.from(await res.arrayBuffer());
      if (!data.length || data.length > MAX_BYTES || !imageType(data)) return null;
      fs.mkdirSync(this.o.dir, { recursive: true });
      const file = this.file(account);
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, data);
      fs.renameSync(tmp, file);
      return data;
    } catch (e) {
      log.info("skill avatar unavailable", { account, message: (e as Error).message.slice(0, 120) });
      return null;
    }
  }
}
