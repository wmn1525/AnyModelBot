/**
 * 目录之间的依赖方向（src/ 下每个目录算一个模块，根目录的文件各算一个）。
 * - domain/：纯数据形状和规则（存进数据库的设置、时间表、目录 Bot 记录…），不做 I/O，只依赖 i18n。
 * - store/：只依赖 domain、i18n 和日志，不认识代理、任务、目录框架。
 * - tools/：代理用的能力（搜索、生图、电脑操作、PowerShell、授权账号），不认识代理进程、任务和渠道。
 * - providers/、updates/：只依赖 i18n 和日志。
 * - 模块之间不能绕成环（只看运行时 import，import type 不算）：上层用下层，下层不回头用上层。
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "../src");

const ALLOWED: Record<string, string[]> = {
  domain: ["i18n"],
  store: ["domain", "i18n", "log.ts"],
  tools: ["domain", "i18n", "log.ts", "store", "providers"],
  providers: ["i18n", "log.ts"],
  updates: ["i18n", "log.ts"],
};

interface Edge {
  from: string;
  to: string;
  file: string;
  typeOnly: boolean;
}

const moduleOf = (abs: string) => {
  const rel = path.relative(SRC, abs).split(path.sep);
  return rel.length > 1 ? rel[0] : rel[0].replace(/\.js$/, ".ts");
};

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : e.name.endsWith(".ts") ? [p] : [];
  });
}

// import / export ... from "./x.js"（可以跨行）；import type / export type 只是类型
const IMPORT = /^\s*(?:import|export)\s+(type\s+)?(?:[^"';]*?\s+from\s+)?["'](\.[^"']+)["']/gm;

function edges(): Edge[] {
  const out: Edge[] = [];
  for (const file of files(SRC)) {
    const from = moduleOf(file);
    for (const m of fs.readFileSync(file, "utf8").matchAll(IMPORT)) {
      const to = moduleOf(path.resolve(path.dirname(file), m[2]));
      if (to !== from) out.push({ from, to, file: path.relative(SRC, file), typeOnly: !!m[1] });
    }
  }
  return out;
}

/** 找出所有绕成环的模块组（Tarjan 强连通分量，只留两个以上模块的） */
function cycles(deps: Map<string, Set<string>>): string[][] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const out: string[][] = [];
  let n = 0;
  const visit = (v: string) => {
    index.set(v, n);
    low.set(v, n++);
    stack.push(v);
    onStack.add(v);
    for (const w of deps.get(v) ?? []) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, index.get(w)!));
    }
    if (low.get(v) === index.get(v)) {
      const group: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        group.push(w);
      } while (w !== v);
      if (group.length > 1) out.push(group.sort());
    }
  };
  for (const v of deps.keys()) if (!index.has(v)) visit(v);
  return out;
}

describe("目录之间的依赖方向", () => {
  const all = edges();

  it("能读到 import（解析没坏）", () => {
    expect(all.length).toBeGreaterThan(100);
    expect(all.some((e) => e.from === "store" && e.to === "domain")).toBe(true);
  });

  for (const [mod, allowed] of Object.entries(ALLOWED)) {
    it(`${mod}/ 只依赖 ${allowed.join("、")}`, () => {
      const bad = all.filter((e) => e.from === mod && !allowed.includes(e.to)).map((e) => `${e.file} → ${e.to}`);
      expect(bad).toEqual([]);
    });
  }

  it("模块之间不绕成环", () => {
    const deps = new Map<string, Set<string>>();
    for (const e of all) if (!e.typeOnly) deps.set(e.from, (deps.get(e.from) ?? new Set()).add(e.to));
    // 出现环时列出环里每一条边，方便找是哪个 import
    const found = cycles(deps).map((group) =>
      all.filter((e) => !e.typeOnly && group.includes(e.from) && group.includes(e.to)).map((e) => `${e.file} → ${e.to}`),
    );
    expect(found).toEqual([]);
  });
});
