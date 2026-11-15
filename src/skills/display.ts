/**
 * 技能给用户看的样子：名字、一句简介、「试试这样说」，以及它现在生效了没有。
 *
 * 技能库里收录的（按 GitHub 仓库和目录对上，ui/data/skill-library.json）用库里当前语言的标题、简介和触发方式
 * （ui/locales/<语言>/skillItems.json）；库外的和本地 ZIP 导入的用技能名和 SKILL.md 的描述，示例统一是「用{名称}帮我……」：
 * SKILL.md 的描述是写给模型看的触发条件，不像用户会说的话。
 * 设置列表、加号菜单、安装卡片和机器人提示词（agent/host.ts）都读这一份，名字和示例在各处一致。
 */
import fs from "node:fs";
import path from "node:path";
import { findAppRoot } from "../magpie/supervisor.js";
import { lang as currentLang, tl, type Lang } from "../i18n/index.js";
import type { SkillSource, UserSkill } from "./service.js";

interface LibraryItem {
  title?: string;
  summary?: string;
  try?: string;
}

let uiRoot: string | undefined;
let library: Map<string, string> | undefined;
const items = new Map<Lang, Record<string, LibraryItem>>();

/** 测试用：换一个界面目录（里面有 data/skill-library.json 和 locales/） */
export function setSkillUiDir(dir: string | undefined): void {
  uiRoot = dir;
  library = undefined;
  items.clear();
}

const uiDir = () => uiRoot ?? path.join(findAppRoot(), "ui");

function readJson<T>(file: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return undefined;
  }
}

const libraryKey = (repo: string, dir: string) => `${repo.toLowerCase()}|${dir.replace(/^\/+|\/+$/g, "")}`;

/** 按 GitHub 链接装的技能在技能库里的 id；库外的、ZIP 导入的没有 */
export function libraryId(source: SkillSource | undefined): string | undefined {
  if (source?.type !== "github") return undefined;
  if (!library) {
    const data = readJson<{ skills?: Array<{ id: string; repo: string; path?: string }> }>(path.join(uiDir(), "data", "skill-library.json"));
    library = new Map((data?.skills ?? []).map((s) => [libraryKey(s.repo, s.path ?? ""), s.id]));
  }
  return library.get(libraryKey(`${source.owner}/${source.repo}`, source.path));
}

function itemsOf(l: Lang): Record<string, LibraryItem> {
  let m = items.get(l);
  if (!m) {
    m = readJson<Record<string, LibraryItem>>(path.join(uiDir(), "locales", l, "skillItems.json")) ?? {};
    items.set(l, m);
  }
  return m;
}

/** 技能库里这一条在某种语言下的文字；这种语言没有时先用英文，再用中文 */
function libraryText(id: string, field: keyof LibraryItem, l: Lang): string {
  for (const x of [l, "en", "zh-CN"] as Lang[]) {
    const v = itemsOf(x)[id]?.[field];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

export interface SkillDisplay {
  /** 名字：库里的标题，没有就是技能名 */
  title: string;
  /** 一句简介：库里的简介，没有就是 SKILL.md 的描述 */
  summary: string;
  /** 「试试这样说」：库里的触发方式，没有就是「用{名称}帮我……」 */
  example: string;
  /** 技能库里的 id（收录了才有） */
  library?: string;
}

export function skillDisplay(skill: Pick<UserSkill, "name" | "description" | "source"> & Partial<Pick<UserSkill, "title" | "example">>, l: Lang = currentLang()): SkillDisplay {
  const id = libraryId(skill.source);
  // 库外的技能：SKILL.md 的 metadata 写了标题和示例（导出的「我的技能」）就用它们
  const title = (id && libraryText(id, "title", l)) || skill.title || skill.name;
  const summary = (id && libraryText(id, "summary", l)) || skill.description;
  const example = (id && libraryText(id, "try", l)) || skill.example || tl(l, "skills.tryFallback", { name: title });
  return { title, summary, example, ...(id ? { library: id } : {}) };
}

/**
 * 机器人进程里技能的现状（agent/host.ts skillRuntime）：
 * running 进程在跑；starting 正在启动或为换技能重启；busy 有聊天、后台任务或后台命令在跑，换技能要等它们结束；
 * applied 这个进程启动时部署的技能（名字 → 包的摘要）。
 */
export interface SkillRuntime {
  running: boolean;
  starting: boolean;
  busy: boolean;
  applied?: ReadonlyMap<string, string>;
}

/**
 * 一个技能现在能不能用：active 已生效 · waiting 当前任务结束后生效 · loading 加载中 · off 已关闭。
 * 进程没在跑时，下一条消息启动它就会带上，算已生效；在启动的时候一律是加载中（加载完成前不说已经可用）。
 */
export type SkillState = "active" | "waiting" | "loading" | "off";
export function skillState(skill: Pick<UserSkill, "name" | "digest" | "enabled">, rt: SkillRuntime | undefined): SkillState {
  if (!skill.enabled) return "off";
  if (!rt) return "active";
  if (rt.starting) return "loading";
  if (!rt.running) return "active";
  if (rt.applied?.get(skill.name) === skill.digest) return "active";
  return rt.busy ? "waiting" : "loading";
}
