/**
 * 本地命令用的 PATH。从 Dock、开始菜单启动的桌面应用拿不到终端里的 PATH（nvm、Homebrew、uv、bun 装的命令都在
 * shell 的启动文件里加进去），直接 spawn("npx") 会报找不到命令。这里问一次用户的登录 shell，结果记住；
 * 问不到（没有 shell、超时）就用进程自己的 PATH 加上几个常见的目录。Windows 的 PATH 在系统环境变量里，进程本来就有。
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { logger } from "../../log.js";

const log = logger("apps.path");
const MARK = "__AMB_PATH__";

let cached: Promise<string> | undefined;

function common(): string[] {
  if (process.platform === "win32") return [];
  const home = os.homedir();
  return ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", path.join(home, ".local", "bin"), path.join(home, ".bun", "bin"), path.join(home, ".cargo", "bin"), path.join(home, ".volta", "bin"), path.join(home, ".deno", "bin"), path.join(home, ".npm-global", "bin")].filter((d) => {
    try {
      return fs.statSync(d).isDirectory();
    } catch {
      return false;
    }
  });
}

function merge(...lists: Array<string | undefined>): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const dir of String(list ?? "").split(path.delimiter)) {
      if (!dir || seen.has(dir)) continue;
      seen.add(dir);
      out.push(dir);
    }
  }
  return out.join(path.delimiter);
}

function askShell(): Promise<string | undefined> {
  if (process.platform === "win32") return Promise.resolve(undefined);
  const shell = process.env.SHELL && fs.existsSync(process.env.SHELL) ? process.env.SHELL : fs.existsSync("/bin/zsh") ? "/bin/zsh" : fs.existsSync("/bin/bash") ? "/bin/bash" : "";
  if (!shell) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    // -i -l：读 .zshrc / .bash_profile 这些启动文件；输出夹在标记中间，启动文件自己打印的东西不算
    execFile(shell, ["-ilc", `printf '${MARK}%s${MARK}' "$PATH"`], { timeout: 5000, env: { ...process.env, TERM: "dumb" }, windowsHide: true }, (err, stdout) => {
      const m = new RegExp(`${MARK}(.*?)${MARK}`, "s").exec(String(stdout ?? ""));
      if (!m && err) log.debug("could not read PATH from the login shell", { message: err.message });
      resolve(m?.[1] || undefined);
    });
  });
}

/** 本地命令的 PATH：登录 shell 的在前，进程自己的和常见目录补在后面 */
export function userPath(): Promise<string> {
  cached ??= askShell()
    .catch(() => undefined)
    .then((fromShell) => merge(fromShell, process.env.PATH, common().join(path.delimiter)));
  return cached;
}

/** 测试用：换一个 PATH 之后重新问 */
export function resetUserPath(): void {
  cached = undefined;
}
