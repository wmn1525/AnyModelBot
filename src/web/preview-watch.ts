/**
 * 右侧预览的自动刷新：界面把已打开标签对应的文件交给这里（标签增减时重新订阅），文件变了就推一条事件。
 *
 * 只看 stat（大小、修改时间、inode），不读内容。连续写入合并：签名稳定 QUIET 毫秒后才报，
 * 所以"先删再写""写临时文件再改名替换"不会先报一次消失；真的消失也要等这么久再确认（PRD R6）。
 * 轮询而不是 fs.watch：覆盖写、改名替换、网络盘在三个平台上都一样可靠，十几个文件的 stat 开销可以忽略。
 */
import fs from "node:fs";

export interface WatchTarget {
  /** 界面标签的 id，原样带回 */
  key: string;
  /** 绝对路径（文件可以暂时不在） */
  file: string;
}

export type WatchEvent = { key: string; gone: true } | { key: string; gone?: false; size: number; mtimeMs: number };

export const POLL_MS = 400;
export const QUIET_MS = 1000;

function signature(file: string): { sig: string; size: number; mtimeMs: number } {
  try {
    const st = fs.statSync(file);
    if (!st.isFile()) return { sig: "gone", size: 0, mtimeMs: 0 };
    return { sig: `${st.size}:${st.mtimeMs}:${st.ino}`, size: st.size, mtimeMs: st.mtimeMs };
  } catch {
    return { sig: "gone", size: 0, mtimeMs: 0 };
  }
}

/** 订阅一组文件；返回取消函数。now / every 可替换（测试用） */
export function watchFiles(targets: WatchTarget[], emit: (e: WatchEvent) => void, opts: { every?: number; quiet?: number; now?: () => number } = {}): () => void {
  const every = opts.every ?? POLL_MS;
  const quiet = opts.quiet ?? QUIET_MS;
  const now = opts.now ?? Date.now;
  const state = targets.map((t) => {
    const s = signature(t.file);
    return { ...t, reported: s.sig, seen: s.sig, since: now() };
  });
  const tick = () => {
    for (const s of state) {
      const cur = signature(s.file);
      if (cur.sig !== s.seen) {
        s.seen = cur.sig;
        s.since = now();
        continue;
      }
      if (s.seen === s.reported || now() - s.since < quiet) continue;
      s.reported = s.seen;
      emit(s.seen === "gone" ? { key: s.key, gone: true } : { key: s.key, size: cur.size, mtimeMs: cur.mtimeMs });
    }
  };
  const timer = setInterval(tick, every);
  timer.unref?.();
  return () => clearInterval(timer);
}
