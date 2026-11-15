/**
 * 按 GitHub 链接读取一个技能（技能库的「复制安装指令」、用户发来的链接）。
 *
 * - 只认 github.com 上的公开仓库：仓库根（默认分支，根目录要有 SKILL.md）、/tree/{分支}/{路径} 目录、/blob/{分支}/{路径}/SKILL.md 文件
 *   （按所在目录处理）；末尾斜杠、.git、查询参数和锚点都不管。
 * - 请求只发往 GitHub 官方域名（api.github.com 查仓库、提交和目录树，raw.githubusercontent.com 下载文件），跳到别的域名按失败处理；
 *   不带用户的 GitHub 登录信息。未登录的 API 每个 IP 每小时 60 次，每次安装用 3 次（仓库、提交、目录树），文件下载不占次数。
 * - 先按目录树查数量、大小、路径和 SKILL.md 个数（和 ZIP 导入同样的上限：下载总量算「打包后」），都通过才下载文件，
 *   最后交给 packageFiles 做和 ZIP 导入完全一样的格式校验。整个读取最多 30 秒。
 * - 只读文件，不运行、不安装依赖；确认安装时写入的就是这里读到的这一份（skills/installs.ts 暂存）。
 */
import crypto from "node:crypto";
import type { BundleFile } from "../botkit/bundle.js";
import { SkillError, SKILL_LIMITS, ignoredSkillPath, packageFiles, skillPath, skillRoots, type SkillPackage } from "./archive.js";

export const GITHUB_HOSTS = ["github.com", "api.github.com", "codeload.github.com", "raw.githubusercontent.com"];
export const READ_TIMEOUT_MS = 30_000;
const API = "https://api.github.com";
const RAW = "https://raw.githubusercontent.com";
/** 分支名可以带斜杠：/tree/ 后面最多试这么多段当分支名 */
const MAX_REF_SEGMENTS = 6;

export interface SkillLink {
  /** 用户发来的原样（去掉首尾标点） */
  url: string;
  owner: string;
  repo: string;
  kind: "root" | "tree" | "blob";
  /** /tree/ 或 /blob/ 后面的各段（分支 + 路径，分支可能带斜杠，要问 GitHub 才分得清） */
  rest: string[];
}

export interface GithubSkillSource {
  owner: string;
  repo: string;
  /** 技能目录在仓库里的路径；仓库根是空串 */
  path: string;
  ref: string;
  commit: string;
  /** 技能目录的地址：https://github.com/{owner}/{repo}/tree/{分支}/{路径}，在仓库根时只到仓库 */
  url: string;
}

export interface GithubSkill {
  pkg: SkillPackage;
  source: GithubSkillSource;
  /** 仓库的许可证（SPDX，如 MIT）；"NOASSERTION" = GitHub 认不出的条款（作者自定义）；null = 没有声明 */
  license: string | null;
}

/** 文字里的 github.com 链接（按出现的顺序、不重复）；中文标点、引号、括号不算链接的一部分 */
export function findGithubLinks(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/https?:\/\/(?:www\.)?github\.com\/[^\s<>"'`，。；、）》」』】]+/gi)) {
    const url = m[0].replace(/[.,;:!?)\]}]+$/, "");
    if (!out.includes(url)) out.push(url);
  }
  return out;
}

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;

/** 能不能当技能链接装；不能时返回 null（失败卡片：「这不是能安装的 GitHub 技能链接」） */
export function parseSkillLink(raw: string): SkillLink | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol) || !/^(www\.)?github\.com$/i.test(u.hostname) || u.username || u.password || (u.port && u.port !== "443")) return null;
  let seg: string[];
  try {
    seg = u.pathname.split("/").filter(Boolean).map((s) => decodeURIComponent(s));
  } catch {
    return null;
  }
  if (seg.length < 2) return null;
  const owner = seg[0];
  const repo = seg[1].replace(/\.git$/i, "");
  if (!OWNER.test(owner) || !REPO.test(repo) || repo === "." || repo === "..") return null;
  if (seg.length === 2) return { url: raw.trim(), owner, repo, kind: "root", rest: [] };
  const kind = seg[2];
  const rest = seg.slice(3);
  if ((kind !== "tree" && kind !== "blob") || !rest.length || rest.some((s) => s === "." || s === "..")) return null;
  if (kind === "blob" && (rest.length < 2 || rest.at(-1) !== "SKILL.md")) return null;
  return { url: raw.trim(), owner, repo, kind, rest };
}

/** 技能目录的地址（技能库和确认卡片显示的那个） */
export function skillUrl(owner: string, repo: string, ref: string, path: string): string {
  const base = `https://github.com/${owner}/${repo}`;
  return path ? `${base}/tree/${ref.split("/").map(encodeURIComponent).join("/")}/${path.split("/").map(encodeURIComponent).join("/")}` : base;
}

export interface ReadOptions {
  /** 桌面版是 Electron 的 net.fetch（系统代理、PAC、系统证书），命令行 / Docker 是 Node 的 fetch */
  fetch?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
  now?: () => number;
}

interface TreeEntry {
  path: string;
  mode: string;
  type: "blob" | "tree" | "commit";
  size?: number;
}

/** 读一个技能：成功返回技能包和来源；失败抛 SkillError（code 对应确认卡片的失败文案） */
export async function readGithubSkill(link: SkillLink, opts: ReadOptions = {}): Promise<GithubSkill> {
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? READ_TIMEOUT_MS);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;

  const get = async (url: string, accept: string): Promise<Response> => {
    let res: Response;
    try {
      res = await doFetch(url, { headers: { accept, "user-agent": "AnyModelBot", "x-github-api-version": "2022-11-28" }, redirect: "follow", credentials: "omit", signal });
    } catch {
      throw new SkillError("network", 502);
    }
    // 跳转到 GitHub 以外的地方按失败处理（不跟着去下载）
    try {
      if (res.url && !GITHUB_HOSTS.includes(new URL(res.url).hostname.toLowerCase())) throw new Error("off-site redirect");
    } catch {
      await res.body?.cancel().catch(() => undefined);
      throw new SkillError("network", 502);
    }
    if ((res.status === 403 || res.status === 429) && (res.headers.get("x-ratelimit-remaining") === "0" || res.headers.has("retry-after"))) {
      await res.body?.cancel().catch(() => undefined);
      const reset = Number(res.headers.get("x-ratelimit-reset")) * 1000;
      const after = Number(res.headers.get("retry-after")) * 1000;
      throw new SkillError("rate_limited", 429, { resetAt: reset > 0 ? reset : now() + (after > 0 ? after : 60_000) });
    }
    return res;
  };
  const api = async <T>(p: string): Promise<{ status: number; body?: T }> => {
    const res = await get(API + p, "application/vnd.github+json");
    if (res.status === 404 || res.status === 422 || res.status === 451) {
      await res.body?.cancel().catch(() => undefined);
      return { status: res.status };
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      throw new SkillError("network", 502);
    }
    try {
      return { status: res.status, body: (await res.json()) as T };
    } catch {
      throw new SkillError("network", 502);
    }
  };
  const repoPath = `/repos/${encodeURIComponent(link.owner)}/${encodeURIComponent(link.repo)}`;

  // 1. 仓库：不存在、私有（未登录看不到）都是 404
  const repo = await api<{ full_name?: string; default_branch?: string; private?: boolean; license?: { spdx_id?: string | null } | null }>(repoPath);
  if (!repo.body || repo.body.private || typeof repo.body.default_branch !== "string") throw new SkillError("repo_not_found", 404);
  const [owner, name] = String(repo.body.full_name || `${link.owner}/${link.repo}`).split("/");
  const canonical = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;

  // 2. 分支和路径 → 提交：/tree/ 后面先试第一段当分支名，不对再加一段（分支名可以带斜杠）
  const candidates: Array<{ ref: string; path: string[] }> = link.kind === "root"
    ? [{ ref: repo.body.default_branch, path: [] }]
    : Array.from({ length: Math.min(MAX_REF_SEGMENTS, link.rest.length - (link.kind === "blob" ? 1 : 0)) }, (_, i) => ({ ref: link.rest.slice(0, i + 1).join("/"), path: link.rest.slice(i + 1) }));
  let commit: { sha: string; ref: string; path: string } | undefined;
  for (const c of candidates) {
    const r = await api<{ sha?: string }>(`${canonical}/commits/${encodeURIComponent(c.ref)}`);
    if (r.body?.sha && /^[0-9a-f]{40}$/.test(r.body.sha)) {
      const dir = link.kind === "blob" ? c.path.slice(0, -1) : c.path;
      commit = { sha: r.body.sha, ref: c.ref, path: dir.join("/") };
      break;
    }
  }
  if (!commit) throw new SkillError("missing_skill", 404);
  if (commit.path && !skillPath(commit.path)) throw new SkillError("missing_skill", 404);

  // 3. 技能目录的整棵树（只取这个目录，不取整个仓库）
  const treeRef = commit.path ? `${commit.sha}:${commit.path}` : commit.sha;
  const tree = await api<{ tree?: TreeEntry[]; truncated?: boolean }>(`${canonical}/git/trees/${encodeURIComponent(treeRef)}?recursive=1`);
  if (!tree.body || !Array.isArray(tree.body.tree)) throw new SkillError("missing_skill", 404);
  if (tree.body.truncated) throw new SkillError("too_large", 413);
  const entries = tree.body.tree;
  if (entries.length > SKILL_LIMITS.files) throw new SkillError("too_large", 413);
  // 路径、符号链接、子模块、大小写重名：和 ZIP 导入同样不支持
  const seen = new Set<string>();
  for (const e of entries) {
    if (!skillPath(e.path)) throw new SkillError("unsafe_path");
    if (e.type === "commit" || e.mode === "120000") throw new SkillError("unsafe_path");
    const key = e.path.normalize("NFC").toLowerCase();
    if (seen.has(key)) throw new SkillError("unsafe_path");
    seen.add(key);
  }
  const blobs = entries.filter((e) => e.type === "blob" && !ignoredSkillPath(e.path));
  const total = blobs.reduce((n, e) => n + (Number(e.size) || 0), 0);
  if (total > SKILL_LIMITS.zip || total > SKILL_LIMITS.unpacked) throw new SkillError("too_large", 413);
  const roots = skillRoots(blobs.map((e) => e.path));
  if (!roots.length) throw new SkillError("missing_skill", 404);
  if (roots.length > 1) throw new SkillError("multiple_skills", 400, { n: roots.length });
  const md = blobs.find((e) => e.path === roots[0])!;
  if ((Number(md.size) || 0) > SKILL_LIMITS.markdown) throw new SkillError("too_large", 413);
  // 唯一的 SKILL.md 在下一层（和 ZIP 一样认）：只下载那个目录，来源记成它
  const prefix = roots[0].slice(0, -"SKILL.md".length);
  const wanted = prefix ? blobs.filter((e) => e.path.startsWith(prefix)) : blobs;
  const skillDir = [commit.path, prefix.replace(/\/$/, "")].filter(Boolean).join("/");

  // 4. 下载文件（raw.githubusercontent.com，按提交号取，读到的就是这一版）
  const files: BundleFile[] = new Array(wanted.length);
  let next = 0;
  let downloaded = 0;
  const worker = async () => {
    for (let i = next++; i < wanted.length; i = next++) {
      const e = wanted[i];
      const file = [commit!.path, e.path].filter(Boolean).join("/");
      const res = await get(`${RAW}/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/${commit!.sha}/${file.split("/").map(encodeURIComponent).join("/")}`, "application/octet-stream");
      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined);
        throw new SkillError(res.status === 404 ? "missing_skill" : "network", 502);
      }
      let data: Buffer;
      try {
        data = Buffer.from(await res.arrayBuffer());
      } catch {
        throw new SkillError("network", 502);
      }
      downloaded += data.length;
      if (downloaded > SKILL_LIMITS.zip) throw new SkillError("too_large", 413);
      if (e.size !== undefined && data.length !== Number(e.size)) throw new SkillError("network", 502);
      files[i] = { path: e.path, data };
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, wanted.length) }, worker));

  // 内容摘要当技能包的目录名：同一版内容装几次都是同一个目录
  const hash = crypto.createHash("sha256");
  for (const f of [...files].sort((a, b) => (a.path < b.path ? -1 : 1))) hash.update(f.path).update("\0").update(f.data).update("\0");
  const pkg = packageFiles(files, hash.digest("hex"));
  const spdx = repo.body.license?.spdx_id;
  return {
    pkg,
    source: { owner, repo: name, path: skillDir, ref: commit.ref, commit: commit.sha, url: skillUrl(owner, name, commit.ref, skillDir) },
    license: typeof spdx === "string" && spdx ? spdx : null,
  };
}
