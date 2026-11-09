/** DSH 在磁盘上的会话记录：某个任务的会话目录在哪、占多大（宿主删任务会话、任务详情显示大小都用）。 */
import fs from "node:fs";
import path from "node:path";

/** 目录占多大（字节）：不跟链接，最多看 limit 个条目（很大的文件夹算个大概） */
export function dirBytes(dir: string, limit = 20_000): number {
  let total = 0;
  let seen = 0;
  const walk = (d: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (++seen > limit) return;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) {
        try {
          total += fs.statSync(p).size;
        } catch {
          /* 刚被删了 */
        }
      }
    }
  };
  walk(dir);
  return total;
}

/**
 * 任务会话在 DSH 里的记录：DSH_HOME/sessions/<工作目录>/<会话 id>/（dsh-session-persistence-jsonl 的布局，会话 id 里只有
 * 字母数字和 -_，目录名就是 id）。task-<id>，以及恢复不了时换过的 task-<id>-N。SDK 没有删会话的接口，宿主直接删目录。
 */
export function taskSessionDirs(home: string, taskId: string): string[] {
  const root = path.join(home, "sessions");
  const name = `task-${taskId}`;
  const out: string[] = [];
  let projects: fs.Dirent[];
  try {
    projects = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const p of projects) {
    if (!p.isDirectory()) continue;
    let sessions: string[];
    try {
      sessions = fs.readdirSync(path.join(root, p.name));
    } catch {
      continue;
    }
    for (const s of sessions) if (s === name || (s.startsWith(name + "-") && /^\d+$/.test(s.slice(name.length + 1)))) out.push(path.join(root, p.name, s));
  }
  return out;
}
