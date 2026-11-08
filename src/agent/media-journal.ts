/** Durable identities for paid media work. No credentials or request bodies are stored. */
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

export interface MediaReceipt {
  fingerprint: string;
  kind: "image" | "video";
  model: string;
  baseUrl: string;
  status: "submitting" | "pending" | "done" | "failed";
  taskId?: string;
  result?: string;
  updatedAt: string;
}

function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canonical(x)]));
  return v;
}

export function mediaFingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

export class MediaJournal {
  readonly file: string;
  constructor(workspace: string, requestId: unknown) {
    if (typeof requestId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(requestId)) throw new Error("request_id 格式无效");
    const root = fs.realpathSync(workspace);
    const dir = path.join(root, "media", ".jobs");
    for (const p of [path.join(root, "media"), dir, path.join(dir, `${requestId}.json`)]) {
      try {
        const st = fs.lstatSync(p);
        if (st.isSymbolicLink() || (st.isFile() && st.nlink !== 1)) throw new Error("媒体任务记录路径无效");
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
    }
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, `${requestId}.json`);
  }
  read(): MediaReceipt | undefined {
    if (!fs.existsSync(this.file)) return undefined;
    if (fs.statSync(this.file).size > 32 * 1024) throw new Error("媒体任务记录过大");
    const r = JSON.parse(fs.readFileSync(this.file, "utf8")) as MediaReceipt;
    if (!r || !["submitting", "pending", "done", "failed"].includes(r.status) || typeof r.model !== "string" || typeof r.fingerprint !== "string") throw new Error("媒体任务记录损坏");
    return r;
  }
  write(value: MediaReceipt): void {
    const temp = `${this.file}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temp, JSON.stringify({ ...value, updatedAt: new Date().toISOString() }), { flag: "wx", mode: 0o600 });
      fs.renameSync(temp, this.file);
    } finally {
      fs.rmSync(temp, { force: true });
    }
  }
}
