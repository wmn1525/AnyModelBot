import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cmpVersion, parseChangelog, releasedChangelog } from "../src/lib/changelog";
import releases from "../src/data/releases.json";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SAMPLE = `# 更新日志

## 0.1.39 - 2026-11-15

- 还没发布

## 0.1.38 - 2026-11-15

- 已发布

## 0.1.37 - 2026-11-15

- 更早
`;

describe("更新日志页只显示已发布版本", () => {
  it("版本号比较", () => {
    expect(cmpVersion("0.1.39", "0.1.38")).toBeGreaterThan(0);
    expect(cmpVersion("0.1.38", "0.1.38")).toBe(0);
    expect(cmpVersion("0.1.37", "0.1.38")).toBeLessThan(0);
  });

  it("比已发布版本新的不出现，其余保持原文顺序", () => {
    const list = releasedChangelog(parseChangelog(SAMPLE), "0.1.38");
    expect(list.map((r) => r.version)).toEqual(["0.1.38", "0.1.37"]);
    expect(list[0].groups[0].items[0]).toContain("已发布");
  });

  it("已发布版本本身留在最上面", () => {
    expect(releasedChangelog(parseChangelog(SAMPLE), "0.1.39").map((r) => r.version)).toEqual(["0.1.39", "0.1.38", "0.1.37"]);
  });

  it("版本号还是占位符时不过滤", () => {
    expect(releasedChangelog(parseChangelog(SAMPLE), "{VERSION}").map((r) => r.version)).toEqual(["0.1.39", "0.1.38", "0.1.37"]);
  });

  it("仓库里的中文日志，页上第一版就是 releases.json 的版本", () => {
    const md = fs.readFileSync(path.join(root, "src/data/changelog.md"), "utf8");
    const list = releasedChangelog(parseChangelog(md), releases.version);
    expect(list[0]?.version).toBe(releases.version);
    expect(list.some((r) => cmpVersion(r.version, releases.version) > 0)).toBe(false);
  });
});
