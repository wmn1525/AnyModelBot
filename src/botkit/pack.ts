/**
 * 打包目录：把 bots/ 下每个 Bot 过一遍静态检查，打成内容寻址的包，产出签名的 index.json。
 * 目录仓库根下有 catalog.json（精选和下架）和 catalog.lock.json（每个 Bot 上次发布的记录，
 * 版本不变时上架时间不变；Bot 目录删了之后，下架记录还在 index 里，已经用过的客户端才知道它下架了）。
 */
import fs from "node:fs";
import path from "node:path";
import { packFiles, sha256 } from "./bundle.js";
import type { CatalogEntry, CatalogIndex } from "./catalog.js";
import { checkStatic, runtimeBundleFiles, uiBundleFiles } from "./check.js";
import type { Issue } from "./format.js";
import { signCatalog } from "./sign.js";

export interface CatalogConfig {
  /** 精选：新用户第一屏 */
  featured?: string[];
  /** 下架：security = 用过的实例也立刻停用 */
  removed?: Record<string, { reason: string; security?: boolean; at?: number }>;
}

export const readCatalogConfig = (root: string): CatalogConfig => {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, "catalog.json"), "utf8")) as CatalogConfig;
  } catch {
    return {};
  }
};

const readLock = (root: string): Record<string, CatalogEntry> => {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, "catalog.lock.json"), "utf8")) as Record<string, CatalogEntry>;
  } catch {
    return {};
  }
};

export function botDirs(root: string): string[] {
  const bots = path.join(root, "bots");
  if (!fs.existsSync(bots)) return [];
  return fs.readdirSync(bots, { withFileTypes: true }).filter((e) => e.isDirectory() && fs.existsSync(path.join(bots, e.name, "bot.json"))).map((e) => path.join(bots, e.name)).sort();
}

export interface PackResult {
  index: CatalogIndex;
  failures: Array<{ dir: string; issues: Issue[] }>;
}

/** 两种分发共用检查和包格式；内置目录不依赖发布机器的签名密钥或 lock。 */
function prepareCatalog(o: { root: string; now?: number; lock?: Record<string, CatalogEntry> }) {
  const now = o.now ?? Date.now();
  const cfg = readCatalogConfig(o.root);
  const lock = o.lock ?? {};
  const failures: PackResult["failures"] = [];
  const bots: CatalogEntry[] = [];
  const blobs: Array<[string, Buffer]> = [];
  const avatarOwner = new Map<string, string>();
  for (const dir of botDirs(o.root)) {
    const { manifest, issues } = checkStatic(dir);
    // 头像不能和目录里别的 Bot 撞：发现页、侧栏里两个 Bot 长得一样就分不清了
    const taken = manifest && avatarOwner.get(manifest.avatar);
    if (manifest && taken) issues.push({ rule: "format.avatar", message: `avatar ${manifest.avatar} 已经是 ${taken} 的头像，换一个`, file: "bot.json" });
    else if (manifest) avatarOwner.set(manifest.avatar, manifest.id);
    if (!manifest || issues.length) {
      failures.push({ dir, issues });
      continue;
    }
    const ui = packFiles(uiBundleFiles(dir));
    const runtime = packFiles(runtimeBundleFiles(dir));
    const uiHash = sha256(ui);
    const rtHash = sha256(runtime);
    blobs.push([`bundles/${uiHash}.ambot`, ui], [`bundles/${rtHash}.ambot`, runtime]);
    const thumbs: CatalogEntry["thumbs"] = {};
    for (const theme of ["light", "dark"] as const) {
      // 发现页封面：先用画好的 cover/<主题>.png，没有时退回渲染检查的界面截图
      const f = [path.join(dir, "cover", `${theme}.png`), path.join(dir, ".check", `${theme}.png`)].find((p) => fs.existsSync(p));
      if (!f) continue;
      const data = fs.readFileSync(f);
      const h = sha256(data);
      thumbs[theme] = h;
      blobs.push([`thumbs/${h}.png`, data]);
    }
    const prev = lock[manifest.id];
    bots.push({ ...manifest, ui: { sha256: uiHash, size: ui.length }, runtime: { sha256: rtHash, size: runtime.length }, ...(Object.keys(thumbs).length ? { thumbs } : {}), publishedAt: prev && prev.version === manifest.version ? prev.publishedAt : now });
  }
  if (failures.length) return { index: { version: 1 as const, publishedAt: now, bots: [] }, failures, blobs: [] };
  // 目录删了的 Bot 只要在 lock 里，就继续留在 index：下架记录要能传到用过的客户端
  for (const [id, prev] of Object.entries(lock)) if (!bots.some((b) => b.id === id) && cfg.removed?.[id]) bots.push(prev);
  for (const b of bots) {
    const r = cfg.removed?.[b.id];
    if (r) b.removed = { reason: r.reason, ...(r.security ? { security: true } : {}), at: r.at ?? now };
    else delete b.removed;
    if (cfg.featured?.includes(b.id)) b.featured = true;
    else delete b.featured;
  }
  const index: CatalogIndex = { version: 1, publishedAt: now, bots };
  return { index, failures, blobs };
}

function writeCatalog(outDir: string, index: CatalogIndex, blobs: Array<[string, Buffer]>): Buffer {
  const data = Buffer.from(JSON.stringify(index));
  fs.mkdirSync(path.join(outDir, "bundles"), { recursive: true });
  fs.mkdirSync(path.join(outDir, "thumbs"), { recursive: true });
  for (const [rel, buf] of blobs) fs.writeFileSync(path.join(outDir, rel), buf);
  fs.writeFileSync(path.join(outDir, "index.json"), data);
  return data;
}

/** 有 Bot 没过检查时什么都不写（failures 里说明原因） */
export function packCatalog(o: { root: string; outDir: string; privateKey: string; now?: number }): PackResult {
  const { index, failures, blobs } = prepareCatalog({ ...o, lock: readLock(o.root) });
  if (failures.length) return { index, failures };
  const data = writeCatalog(o.outDir, index, blobs);
  fs.writeFileSync(path.join(o.outDir, "index.json.sig"), signCatalog(data, o.privateKey));
  fs.writeFileSync(path.join(o.root, "catalog.lock.json"), `${JSON.stringify(Object.fromEntries(index.bots.map((b) => [b.id, b])), null, 2)}\n`);
  return { index, failures };
}

/** 随 App 发布的可信资源：保留逐包哈希校验，不需要线上目录的私钥，不改发布 lock。 */
export function packBuiltinCatalog(o: { root: string; outDir: string }): PackResult {
  const { index, failures, blobs } = prepareCatalog({ root: o.root, now: 0 });
  if (failures.length) return { index, failures };
  // 新版本不能夹带上次构建已经删除的 Bot 包。
  fs.rmSync(o.outDir, { recursive: true, force: true });
  writeCatalog(o.outDir, index, blobs);
  return { index, failures };
}

/** 某个技能牵连了哪些 Bot（按技能名或来源查，下架时用） */
export function whoUsesSkill(root: string, skill: string): string[] {
  const out: string[] = [];
  for (const dir of botDirs(root)) {
    try {
      const m = JSON.parse(fs.readFileSync(path.join(dir, "bot.json"), "utf8")) as { id: string; skills?: Array<{ name: string; source: string }> };
      const own = fs.existsSync(path.join(dir, "skills", skill));
      if (own || m.skills?.some((s) => s.name === skill || s.source === skill || s.source.startsWith(`${skill}@`))) out.push(m.id);
    } catch {
      /* 格式问题由 check 报 */
    }
  }
  return out;
}
