import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readSkillZip, SKILL_LIMITS } from "../src/skills/archive.js";
import { UserSkills } from "../src/skills/service.js";
import { Store } from "../src/store/db.js";
import { skillMd, skillZip } from "./skill-fixture.js";

describe("技能 ZIP", () => {
  it.each(["", "weekly-report/", "repo-main/skills/weekly-report/"])("识别根目录和外层文件夹 %s，保留脚本与参考文件", async (prefix) => {
    const pkg = await readSkillZip(skillZip([
      { path: prefix + "SKILL.md", text: skillMd() },
      { path: prefix + "scripts/run.py", text: "print('hello')" },
      { path: prefix + "references/模板.txt", text: "周报模板" },
      { path: "__MACOSX/._SKILL.md", text: "finder" },
    ]));
    expect(pkg).toMatchObject({ name: "weekly-report", description: "Prepare weekly reports" });
    expect(pkg.files.map((f) => f.path)).toEqual(["SKILL.md", "scripts/run.py", "references/模板.txt"]);
  });
  it("支持 CRLF、BOM 和 YAML 多行说明", async () => {
    const pkg = await readSkillZip(skillZip([{ path: "SKILL.md", text: '\uFEFF---\r\nname: weekly-report\r\ndescription: >-\r\n  Weekly reports:\r\n  include progress\r\n---\r\nInstructions' }]));
    expect(pkg.description).toBe("Weekly reports: include progress");
    expect(pkg.files[0].data.toString("utf8")).toMatch(/^---\r\n/);
  });
  it.each([
    ["missing_skill", [{ path: "README.md", text: "hello" }]],
    ["multiple_skills", [{ path: "a/SKILL.md", text: skillMd("a") }, { path: "b/SKILL.md", text: skillMd("b") }]],
    ["invalid_skill", [{ path: "SKILL.md", text: "# no frontmatter" }]],
    ["invalid_skill", [{ path: "SKILL.md", text: "---\nname: a\ndescription: [broken\n---\nbody" }]],
    ["invalid_skill", [{ path: "SKILL.md", text: skillMd("../escape") }]],
    ["invalid_skill", [{ path: "SKILL.md", text: skillMd("con") }]],
    ["invalid_skill", [{ path: "SKILL.md", text: skillMd("weekly-report", "") }]],
    ["reserved_name", [{ path: "SKILL.md", text: skillMd("media") }]],
    ["invalid_zip", [{ path: "SKILL.md", text: skillMd(), crc: 1 }]],
    ["invalid_zip", [{ path: "SKILL.md", text: skillMd(), flags: 1 }]],
    ["too_large", [{ path: "SKILL.md", text: skillMd(), size: SKILL_LIMITS.unpacked + 1 }]],
  ] as const)("拒绝损坏或不支持的包：%s", async (code, entries) => {
    await expect(readSkillZip(skillZip([...entries]))).rejects.toMatchObject({ code });
  });
  it.each(["../escape", "/tmp/escape", "C:/escape", "scripts/../escape", "file:secret", "NUL.txt", "foo.", "foo ", "a\\b"])("拒绝路径 %s", async (p) => {
    await expect(readSkillZip(skillZip([{ path: "SKILL.md", text: skillMd() }, { path: p, text: "bad" }]))).rejects.toThrow();
  });
  it.each([
    [{ path: "a", text: "x", mode: 0o120777 }],
    [{ path: "a", text: "x" }, { path: "A", text: "y" }],
    [{ path: "a/b", text: "x" }, { path: "a", text: "y" }],
    [{ path: "a", text: "x" }, { path: "a/b", text: "y" }],
  ])("拒绝符号链接、重名及文件/目录冲突", async (...entries) => {
    await expect(readSkillZip(skillZip([{ path: "SKILL.md", text: skillMd() }, ...entries]))).rejects.toMatchObject({ code: "unsafe_path" });
  });
  it("限制压缩体积、文件数量与解压实际大小", async () => {
    await expect(readSkillZip(Buffer.alloc(SKILL_LIMITS.zip + 1))).rejects.toMatchObject({ code: "too_large" });
    await expect(readSkillZip(skillZip(Array.from({ length: SKILL_LIMITS.files + 1 }, (_, i) => ({ path: `f${i}` }))))).rejects.toMatchObject({ code: "too_large" });
    await expect(readSkillZip(skillZip([{ path: "SKILL.md", text: skillMd() }, { path: "bomb.txt", text: "x".repeat(100_000), size: 1 }]))).rejects.toThrow();
    await expect(readSkillZip(Buffer.from("not a zip"))).rejects.toMatchObject({ code: "invalid_zip" });
  });
});

describe("按机器人管理用户技能", () => {
  let dir: string;
  let store: Store;
  let service: UserSkills;
  const botId = "skill-bot";
  const runtime = (name: string) => path.join(dir, "dsh", botId, "skills", name);
  const pkg = async (body = "instructions", name = "weekly-report") => readSkillZip(skillZip([{ path: "SKILL.md", text: skillMd(name, body) }, { path: "scripts/run.py", text: "print(42)" }]));
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "amb-skills-"));
    store = new Store(path.join(dir, "test.db"));
    store.createBot({ id: botId, name: "Skills" });
    service = new UserSkills(dir, store);
  });
  afterEach(() => { store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  it("预览不安装；安装持久化；空闲同步后启用，停用时只移除目标技能", async () => {
    const input = await pkg();
    expect(service.preview(botId, input)).toMatchObject({ name: input.name, replaces: null });
    expect(service.list(botId)).toEqual([]);
    service.install(botId, input, null);
    expect(fs.existsSync(runtime(input.name))).toBe(false);
    service = new UserSkills(dir, store);
    expect(service.list(botId)).toMatchObject([{ enabled: true, files: 2 }]);
    fs.mkdirSync(runtime("media"), { recursive: true });
    fs.writeFileSync(path.join(runtime("media"), "SKILL.md"), "builtin");
    const rev = service.sync(botId);
    expect(rev).toBe(service.revision(botId));
    expect(fs.readFileSync(path.join(runtime(input.name), "scripts/run.py"), "utf8")).toBe("print(42)");
    service.setEnabled(botId, input.name, false);
    expect(service.revision(botId)).not.toBe(rev);
    expect(fs.existsSync(runtime(input.name))).toBe(true);
    service.sync(botId);
    expect(fs.existsSync(runtime(input.name))).toBe(false);
    expect(fs.readFileSync(path.join(runtime("media"), "SKILL.md"), "utf8")).toBe("builtin");
    service.setEnabled(botId, input.name, true);
    service.sync(botId);
    expect(fs.existsSync(runtime(input.name))).toBe(true);
  });
  it("替换需要准确确认旧版本，保留停用状态，失败不破坏旧版本", async () => {
    const old = await pkg("old");
    const next = await pkg("new");
    service.install(botId, old, null);
    service.setEnabled(botId, old.name, false);
    expect(() => service.install(botId, next, null)).toThrow("conflict");
    expect(() => service.install(botId, next, "stale")).toThrow("conflict");
    expect(service.detail(botId, old.name).instructions).toContain("old");
    service.install(botId, next, old.digest);
    expect(service.detail(botId, old.name)).toMatchObject({ enabled: false, instructions: next.instructions });
    const write = vi.spyOn(fs, "writeFileSync").mockImplementationOnce(() => { throw new Error("disk full"); });
    expect(() => service.install(botId, old, next.digest)).toThrow("disk full");
    write.mockRestore();
    expect(service.detail(botId, next.name).instructions).toBe(next.instructions);
  });
  it("不同机器人互不影响，删除保留工作区文件并清理运行目录", async () => {
    store.createBot({ id: "other", name: "Other" });
    const input = await pkg();
    service.install(botId, input, null);
    service.install("other", input, null);
    service.sync(botId);
    const ws = path.join(dir, "workspaces", botId);
    fs.mkdirSync(ws, { recursive: true });
    fs.writeFileSync(path.join(ws, "report.txt"), "user output");
    service.remove(botId, input.name);
    service.sync(botId);
    expect(service.list(botId)).toEqual([]);
    expect(service.list("other")).toHaveLength(1);
    expect(fs.existsSync(runtime(input.name))).toBe(false);
    expect(fs.readFileSync(path.join(ws, "report.txt"), "utf8")).toBe("user output");
  });
  it("拒绝覆盖未由用户导入的运行目录，以及目录 Bot 保留的技能", async () => {
    fs.mkdirSync(runtime("existing"), { recursive: true });
    expect(() => service.install(botId, {} as any, null)).toThrow();
    const existing = await pkg("body", "existing");
    expect(() => service.preview(botId, existing)).toThrow("reserved_name");
    store.updateBot(botId, { app: { catalogId: "catalog", skills: ["weekly-report"] } as any });
    const input = await pkg();
    expect(() => service.install(botId, input, null)).toThrow("reserved_name");
  });
});
