import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Store } from "../src/store/db.js";
import { FolderError, FolderService, MAX_RECENT } from "../src/folders/service.js";

/** 工作文件夹的选择、最近文件夹、不可选的位置、发送时的绑定（PRD R1、R2） */
describe("工作文件夹（folders/service.ts）", () => {
  let root = "";
  let data = "";
  let home = "";
  let segment = "s0-0";
  let picked: string | undefined;
  let desktop = true;
  let store: Store;
  let svc: FolderService;
  const conv = "default:web:console";

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amb-folders-"));
    data = path.join(root, "data");
    home = path.join(root, "home");
    fs.mkdirSync(path.join(data, "workspaces", "default"), { recursive: true });
    fs.mkdirSync(home);
    store = new Store(":memory:");
    svc = new FolderService({ store, dataDir: data, home, segmentOf: () => segment, picker: () => (desktop ? async () => picked : undefined) });
  });
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  const dir = (name: string) => {
    const p = path.join(home, name);
    fs.mkdirSync(p, { recursive: true });
    return p;
  };
  const pick = (p: string | undefined) => {
    picked = p;
    return svc.pick("default", conv);
  };

  it("选择即生效：只记位置（空目录、中文名、长名都行），取消不改原选择", async () => {
    const empty = dir("空的项目目录-一个很长很长很长很长很长很长很长很长很长的名字");
    const a = await pick(empty);
    expect(a).toMatchObject({ name: path.basename(empty), path: fs.realpathSync(empty) });
    expect(svc.current(conv)?.id).toBe(a!.id);
    expect(await pick(undefined)).toBeUndefined();
    expect(svc.current(conv)?.id).toBe(a!.id);
  });

  it("不可选的位置：数据目录（含默认工作区）、磁盘根、主目录本身，链接指过去的也一样；原选择不变", async () => {
    const before = svc.current(conv)?.id;
    const link = path.join(root, "link-to-data");
    fs.symlinkSync(data, link);
    // 数据目录的上层也不行：选了它，数据目录就落进可写范围
    for (const p of [data, path.join(data, "workspaces", "default"), root, path.parse(root).root, home, link]) {
      const err = await pick(p).then(() => undefined, (e) => e);
      expect(err).toBeInstanceOf(FolderError);
      expect((err as FolderError).code).toBe("notAllowed");
    }
    // 主目录下的子文件夹可以
    expect((await pick(dir("Desktop")))?.name).toBe("Desktop");
    expect(before).toBeTruthy();
  });

  it("最近文件夹：最多 10 个、同一个真实目录不重复、重选移到最前；同名不同位置能区分", async () => {
    const first = dir("r/0");
    await pick(first);
    for (let i = 1; i <= MAX_RECENT; i++) await pick(dir(`r/${i}`));
    const list = svc.recent();
    expect(list).toHaveLength(MAX_RECENT);
    expect(list.map((f) => f.path)).not.toContain(fs.realpathSync(first));
    // 重选同一个目录不增加项，移到最前
    await pick(dir("r/5"));
    expect(svc.recent()).toHaveLength(MAX_RECENT);
    expect(svc.recent()[0].path).toBe(fs.realpathSync(dir("r/5")));
    // 两个同名不同位置：都在，父路径不同
    await pick(dir("x/docs"));
    await pick(dir("y/docs"));
    const docs = svc.recent().filter((f) => f.name === "docs");
    expect(docs.map((f) => path.dirname(f.path)).sort()).toEqual([fs.realpathSync(dir("x")), fs.realpathSync(dir("y"))]);
  });

  it("选最近项只核对目录本身：不在了或换成同名新目录都提示重选，原选择不变", async () => {
    const keep = await pick(dir("keep"));
    const gone = svc.recent().find((f) => f.path === fs.realpathSync(dir("r/5")))!;
    fs.rmSync(gone.path, { recursive: true });
    expect(() => svc.select("default", conv, gone.id)).toThrow(FolderError);
    // 同名的新目录：身份对不上
    fs.mkdirSync(gone.path);
    expect(() => svc.select("default", conv, gone.id)).toThrow(FolderError);
    expect(svc.current(conv)?.id).toBe(keep!.id);
  });

  it("发送时的绑定：和现在的选择一致才受理；没选是 null；对不上抛 changed", async () => {
    const cur = svc.current(conv)!;
    expect(svc.bind(conv, cur.id)).toMatchObject({ id: cur.id, path: cur.path });
    expect(() => svc.bind(conv, "")).toThrow(FolderError);
    expect(() => svc.bind(conv, "stale")).toThrow(FolderError);
    expect(svc.resolve(cur)).toEqual({ root: cur.path });
    svc.clear(conv);
    expect(svc.bind(conv, "")).toBeNull();
  });

  it("开始新对话（新分段）不带入旧选择；网页端（没有系统选择器）不能选", async () => {
    await pick(dir("seg"));
    expect(svc.current(conv)).toBeTruthy();
    segment = "s1-123";
    expect(svc.current(conv)).toBeUndefined();
    desktop = false;
    expect(svc.canPick).toBe(false);
    const err = await pick(dir("web")).then(() => undefined, (e) => e);
    expect((err as FolderError).code).toBe("desktopOnly");
    desktop = true;
  });
});
