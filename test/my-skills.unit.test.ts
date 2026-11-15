/** 存成技能（「我的技能」）：密钥与个人信息、名称规则、重名与更新、导出再导入、部署、规则暂停。PRD 2026-11-15 R1–R9。 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Store } from "../src/store/db.js";
import { UserSkills } from "../src/skills/service.js";
import { SkillDrafts, composeSkill, lineDiff, placeholdersOf, type SkillRecords } from "../src/skills/drafts.js";
import { MY_SKILLS_MAX, normalizeMyName, uniqueName } from "../src/skills/mine.js";
import { findPersonal, findSecrets } from "../src/skills/redact.js";
import { readSkillZip, SkillError } from "../src/skills/archive.js";
import { skillRecordsOf } from "../src/skills/records.js";
import { zipFiles } from "../src/skills/zip.js";
import { skillsView } from "../src/web/skills.js";
import { TaskService, type TaskHost } from "../src/tasks/service.js";
import { DEFAULT_SETTINGS } from "../src/domain/bot-settings.js";
import { setLangPref } from "../src/i18n/index.js";
import { mySkillsPrompt } from "../src/agent/prompts/my-skills.js";

const records = (o: Partial<SkillRecords> = {}): SkillRecords => ({ work: 3, blocked: [], apps: [], uses: [], ...o });
const args = (o: Record<string, unknown> = {}) => ({
  title: "整理周报",
  name: "weekly-report",
  description: "用户要整理一周的工作周报时用",
  steps: ["读取本周的日报文件", "按项目归类，写成三段", "发给 test@example.com"],
  corrections: [{ quote: "不要写成表格", rule: "周报写成段落，不用表格" }, { quote: "标题加日期", rule: "标题带上本周日期" }],
  example: "用整理周报帮我整理这周的周报",
  ...o,
});

describe("密钥与个人信息（R3）", () => {
  it("认出验收用例里的密钥、手机号和邮箱", () => {
    const text = "key sk-FAKE0000example0000 and ghp_FAKE0000example0000example0000, call 13800000000 or test@example.com";
    expect(findSecrets(text).sort()).toEqual(["ghp_FAKE0000example0000example0000", "sk-FAKE0000example0000"].sort());
    expect(findPersonal(text).map((p) => p.kind).sort()).toEqual(["email", "phone"]);
  });
  it("身份证号按密钥处理，带用户名的路径算个人信息", () => {
    expect(findSecrets("身份证 11010519491231002X")).toEqual(["11010519491231002X"]);
    expect(findPersonal("文件在 /Users/alice/Desktop/report.docx")[0]).toMatchObject({ kind: "path", text: "/Users/alice/Desktop/report.docx" });
    expect(findPersonal("写到 reports/weekly.md")).toEqual([]);
  });
});

describe("名字", () => {
  it("文件名补 my- 前缀、去掉不合规字符、不超过 64 个字符", () => {
    expect(normalizeMyName("Weekly Report!")).toBe("my-weekly-report");
    expect(normalizeMyName("my-x")).toBe("my-x");
    expect(normalizeMyName("周报")).toBe("my-skill");
    expect(normalizeMyName("a".repeat(100)).length).toBe(64);
  });
  it("重名自动加序号", () => {
    const taken = new Set(["my-a", "my-a-2"]);
    expect(uniqueName("my-a", (n) => taken.has(n))).toBe("my-a-3");
  });
});

describe("草稿卡与「我的技能」", () => {
  let dir: string;
  let store: Store;
  let skills: UserSkills;
  let drafts: SkillDrafts;
  let saved: string[][];
  beforeEach(() => {
    setLangPref("zh-CN");
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "amb-my-skills-"));
    store = new Store(":memory:");
    store.createBot({ id: "a", name: "小助手" });
    store.createBot({ id: "b", name: "写手" });
    skills = new UserSkills(dir, store);
    saved = [];
    drafts = new SkillDrafts({ store, skills, onSaved: (ids) => saved.push(ids), readiness: () => "active" });
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const conv = "a:web:console";
  const draft = (o: Record<string, unknown> = {}, r = records(), context = "") => drafts.request({ botId: "a", conversationId: conv, args: args(o), records: r, context });

  it("密钥不进技能，卡片写去掉了几处；个人信息默认运行时再问", () => {
    const c = draft({ steps: ["用 sk-FAKE0000example0000 调接口", "把结果发给 test@example.com，电话 13800000000"] }, records(), "我的 token 是 ghp_FAKE0000example0000example0000");
    const d = c.draft!;
    expect(c.state).toBe("pending");
    expect(d.secrets).toBe(2);
    expect(JSON.stringify(d)).not.toContain("sk-FAKE");
    expect(d.personal.map((p) => [p.kind, p.keep])).toEqual([["email", false], ["phone", false]]);
    const text = drafts.finalText(d);
    expect(text).not.toContain("test@example.com");
    expect(placeholdersOf(text)).toEqual(["邮箱", "手机号"]);
    // 编辑时手动加回密钥：不能保存
    const edited = drafts.edit(c.id, text + "\n- 备用 key sk-FAKE0000example0000\n");
    expect(drafts.check(edited.draft!).secrets).toBe(1);
    expect(drafts.confirm(c.id, "save", "web").state).toBe("pending");
    expect(skills.mine.list()).toHaveLength(0);
  });

  it("取消勾选的纠正不写进技能；保存后只在保存它的机器人上打开", () => {
    const c = draft();
    drafts.setCorrection(c.id, 1, false);
    const done = drafts.confirm(c.id, "save", "web");
    expect(done.state).toBe("saved");
    const s = skills.mine.get("my-weekly-report")!;
    expect(s.bots).toEqual(["a"]);
    expect(s.title).toBe("整理周报");
    const text = skills.mine.text(s.name);
    expect(text).toContain("周报写成段落");
    expect(text).not.toContain("标题带上本周日期");
    expect(text).toContain("title: 整理周报");
    expect(saved).toEqual([["a"]]);
    // 两个机器人都列出它，只有 a 是开着的
    expect(skillsView("a", skills).find((x) => x.name === s.name)?.enabled).toBe(true);
    expect(skillsView("b", skills).find((x) => x.name === s.name)?.enabled).toBe(false);
  });

  it("没做完的标未验证，卡住的步骤写进注意事项", () => {
    const c = draft({ unfinished_step: "上传到飞书" });
    expect(drafts.promptText(c)).toContain("卡在「上传到飞书」");
    drafts.confirm(c.id, "save", "web");
    const s = skills.mine.list()[0];
    expect(s.unverified).toBe(true);
    expect(skills.mine.text(s.name)).toContain("上次没有做完，卡在「上传到飞书」");
    skills.mine.markVerified(s.name);
    expect(skills.mine.get(s.name)!.unverified).toBe(false);
  });

  it("标题相同是同一个技能：可以更新（能恢复上一版），也可以另存为新技能", () => {
    drafts.confirm(draft().id, "save", "web");
    const second = draft({ steps: ["读取本周的日报文件", "写成两段"] });
    expect(second.draft!.same).toEqual({ name: "my-weekly-report", title: "整理周报" });
    const view = drafts.view(second);
    expect(view.diff!.length).toBeGreaterThan(0);
    expect(drafts.confirm(second.id, "update", "web").state).toBe("updated");
    const s = skills.mine.get("my-weekly-report")!;
    expect(s.prev).toBeTruthy();
    expect(skills.mine.text(s.name)).toContain("写成两段");
    skills.mine.restore(s.name);
    expect(skills.mine.text(s.name)).toContain("按项目归类");
    skills.mine.restore(s.name);
    expect(skills.mine.text(s.name)).toContain("写成两段");
    const third = draft();
    expect(drafts.confirm(third.id, "copy", "web").state).toBe("saved");
    expect(skills.mine.list().map((x) => [x.name, x.title])).toContainEqual(["my-weekly-report-2", "整理周报 2"]);
  });

  it("对话里改了出新卡，旧卡失效", () => {
    const first = draft();
    const second = draft({ title: "整理周报（新）" });
    expect(drafts.get(first.id)!.state).toBe("expired");
    expect(drafts.get(first.id)!.superseded).toBe(true);
    expect(drafts.confirm(first.id, "save", "web").state).toBe("expired");
    expect(second.state).toBe("pending");
  });

  it("文件名和描述不合规时不能保存", () => {
    const c = draft();
    const text = drafts.finalText(c.draft!).replace("name: my-weekly-report", "name: Bad_Name");
    expect(drafts.check(drafts.edit(c.id, text).draft!).name).toBe(false);
    const c2 = draft();
    const noDesc = drafts.finalText(c2.draft!).replace(/^description:.*$/m, 'description: ""');
    expect(drafts.check(drafts.edit(c2.id, noDesc).draft!).description).toBe(false);
    // 去掉 my- 前缀：保存时自动补上
    const c3 = draft();
    const bare = drafts.finalText(c3.draft!).replace("name: my-weekly-report", "name: weekly-report");
    expect(drafts.check(drafts.edit(c3.id, bare).draft!).name).toBe(true);
  });

  it("满 100 个时新存失败，更新照常", () => {
    drafts.confirm(draft().id, "save", "web");
    for (let i = 1; i < MY_SKILLS_MAX; i++) skills.mine.create({ name: `my-x-${i}`, text: `---\nname: my-x-${i}\ndescription: d\n---\n\nbody ${i}\n`, meta: { title: `x${i}`, description: "d", example: "e", unverified: false, blocked: [], asks: [], kept: 0, apps: [], uses: [] }, botId: "a", botName: "小助手" });
    const fresh = draft({ title: "别的事", name: "other" });
    expect(drafts.confirm(fresh.id, "save", "web")).toMatchObject({ state: "failed", error: { code: "mine_full" } });
    const again = draft();
    expect(drafts.confirm(again.id, "update", "web").state).toBe("updated");
  });

  it("文件名和机器人已装的技能重名时自动加序号；已有「我的技能」的名字不能再装", async () => {
    const zip = (name: string) => readSkillZip(fakeZip(name));
    skills.install("a", await zip("my-weekly-report"), null);
    drafts.confirm(draft().id, "save", "web");
    expect(skills.mine.list()[0].name).toBe("my-weekly-report-2");
    await expect(zip("my-weekly-report-2").then((p) => skills.install("b", p, null))).rejects.toMatchObject({ code: "mine_name", detail: { title: "整理周报" } });
    expect(skills.mineAvailable("a", "my-weekly-report")).toBe(false);
    expect(skills.mineAvailable("b", "my-weekly-report")).toBe(true);
  });

  it("导出的 ZIP 能当本地 ZIP 技能装上，带着标题", async () => {
    drafts.confirm(draft().id, "save", "web");
    const pkg = await readSkillZip(skills.mine.exportZip("my-weekly-report"));
    expect(pkg).toMatchObject({ name: "my-weekly-report", title: "整理周报", example: "用整理周报帮我整理这周的周报" });
    skills.mine.remove("my-weekly-report");
    const s = skills.install("b", pkg, null);
    expect(s.source?.type).toBe("zip");
    expect(skillsView("b", skills).find((x) => x.name === "my-weekly-report")?.title).toBe("整理周报");
  });

  it("部署：在机器人上打开的「我的技能」拷进它的 skills/，关掉后清掉", () => {
    drafts.confirm(draft().id, "save", "web");
    const rev = skills.revision("a");
    skills.sync("a");
    expect(fs.existsSync(path.join(dir, "dsh", "a", "skills", "my-weekly-report", "SKILL.md"))).toBe(true);
    expect(skills.applied("a")?.get("my-weekly-report")).toBe(skills.mine.get("my-weekly-report")!.digest);
    expect(skills.revision("b")).toBe("");
    skills.mine.setEnabled("my-weekly-report", "a", false);
    expect(skills.revision("a")).not.toBe(rev);
    skills.sync("a");
    expect(fs.existsSync(path.join(dir, "dsh", "a", "skills", "my-weekly-report"))).toBe(false);
  });

  it("渠道：回「保存」存下、回别的话交给机器人；「保留个人信息」全部保留", () => {
    const c = draft();
    expect(drafts.handleReply(conv, "改成每周一发", "weixin:u").handled).toBe(false);
    const keep = drafts.handleReply(conv, "保留个人信息", "weixin:u");
    expect(keep.handled).toBe(true);
    expect(drafts.get(c.id)!.draft!.personal.every((p) => p.keep)).toBe(true);
    const r = drafts.handleReply(conv, "保存", "weixin:u");
    expect(r.ack).toBe("已存进我的技能，已在「小助手」上打开。下一条消息起可用。试试这样说：用整理周报帮我整理这周的周报");
    expect(skills.mine.text("my-weekly-report")).toContain("test@example.com");
    expect(skills.mine.get("my-weekly-report")!.kept).toBe(1);
  });

  it("记下的工具：没做事时 work 为 0；电脑操作、生图算定时运行做不了；应用按别名", () => {
    const rec = skillRecordsOf(
      [
        { id: "1", kind: "tool", title: "skill", input: '{"name":"pptx"}', status: "ok", at: 0, use: { kind: "skill", name: "pptx" } },
        { id: "2", kind: "tool", title: "mcp__computer-use__click", status: "ok", at: 0 },
        { id: "3", kind: "tool", title: "app_call", input: '{"app":"feishu","tool":"send_message","account":"2"}', status: "ok", at: 0, use: { kind: "app", app: "feishu", tool: "send_message" } },
      ],
      {
        app: () => ({ name: "飞书", accounts: [{ number: 1, label: "个人", primary: true }, { number: 2, label: "工作号", primary: false }], tools: [{ name: "send_message", category: "send" }] }),
        skill: (n) => ({ name: n, title: n, source: { type: "github", owner: "anthropics", repo: "skills", url: "https://github.com/anthropics/skills" } }),
      },
    );
    expect(rec.work).toBe(2);
    expect(rec.blocked).toEqual(["computer"]);
    expect(rec.apps).toEqual([{ key: "feishu", name: "飞书", alias: "工作号", sends: true }]);
    expect(rec.uses[0].source).toMatchObject({ type: "github", repo: "skills" });
    expect(skillRecordsOf([{ id: "1", kind: "tool", title: "recall", status: "ok", at: 0 }], { app: () => undefined, skill: () => undefined }).work).toBe(0);
    const text = composeSkill({ ...drafts.request({ botId: "a", conversationId: "x", args: args(), records: rec }).draft! });
    expect(text).toContain("飞书（工作号） — 发送前先问用户");
    expect(text).toContain("帮我安装这个技能：https://github.com/anthropics/skills");
  });

  it("提示词列出全部「我的技能」，注明没打开的", () => {
    const p = mySkillsPrompt({ bot: "写手", skills: [{ name: "my-a", title: "整理周报", on: false }] });
    expect(p).toContain("整理周报 → my-a（没在你这里打开）");
    expect(p).toContain("「{标题}」在「写手」上没打开");
  });

  it("按行比较改了几处", () => {
    expect(lineDiff("a\nb\nc", "a\nB\nc\nd")).toEqual([{ del: ["b"], add: ["B"] }, { del: [], add: ["d"] }]);
  });
});

describe("设成定时（R8）", () => {
  let dir: string;
  let store: Store;
  let skills: UserSkills;
  let tasks: TaskService;
  const zone = "Asia/Shanghai";
  const meta = (o = {}) => ({ title: "整理周报", description: "d", example: "e", unverified: false, blocked: [], asks: [], kept: 0, apps: [], uses: [], ...o });
  const text = (body = "body") => `---\nname: my-weekly\ndescription: d\n---\n\n${body}\n`;
  beforeEach(() => {
    setLangPref("zh-CN");
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "amb-my-rules-"));
    store = new Store(":memory:");
    store.createBot({ id: "a", name: "小助手" });
    skills = new UserSkills(dir, store);
    const host: TaskHost = { available: true, workspace: () => dir, settings: () => DEFAULT_SETTINGS, memoryPrefix: () => "", prompt: async () => "x", steer: async () => false, stop: async () => {}, cancel: async () => {}, quiet: async () => ({ quiet: true }) };
    tasks = new TaskService({ store, host, timeZone: zone, mySkills: skills.mine });
    skills.mine.onChange = (e) => tasks.skillChanged(e);
    skills.mine.create({ name: "my-weekly", text: text(), meta: meta(), botId: "a", botName: "小助手" });
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const create = () => {
    const r = tasks.createRule({ botId: "a", conversationId: "", title: "周报", instruction: "", skill: "my-weekly", schedule: { kind: "daily", time: "08:00", tz: zone } });
    expect(r.error).toBeUndefined();
    return r.rule!;
  };

  it("规则显示用技能，原话默认是「按技能「…」做」", () => {
    const r = create();
    expect(r.instruction).toBe("按技能「整理周报」做");
    expect(tasks.ruleView(r).skill).toEqual({ name: "my-weekly", title: "整理周报", exists: true });
  });

  it("未验证、含电脑操作的不能设成定时", () => {
    skills.mine.update("my-weekly", { text: text("v2"), meta: meta({ unverified: true }) });
    expect(tasks.createRule({ botId: "a", conversationId: "", title: "周报", instruction: "", skill: "my-weekly", schedule: { kind: "daily", time: "08:00", tz: zone } }).error).toBe("先成功跑一次");
    skills.mine.update("my-weekly", { text: text("v3"), meta: meta({ blocked: ["computer"] }) });
    expect(tasks.createRule({ botId: "a", conversationId: "", title: "周报", instruction: "", skill: "my-weekly", schedule: { kind: "daily", time: "08:00", tz: zone } }).error).toContain("定时运行做不了");
  });

  it.each([
    ["删除", () => skills.mine.remove("my-weekly"), "skill_deleted", "技能已删除"],
    ["在机器人上关掉", () => skills.mine.setEnabled("my-weekly", "a", false), "skill_off", "「整理周报」在「小助手」上已关闭"],
    ["更新后多了占位", () => skills.mine.update("my-weekly", { text: text("v2"), meta: meta({ asks: ["收件人"] }) }), "skill_ask", "技能改动后需要你先回答：收件人"],
    ["更新后多了做不了的步骤", () => skills.mine.update("my-weekly", { text: text("v2"), meta: meta({ blocked: ["media"] }) }), "skill_blocked", "技能改动后有定时运行做不了的步骤"],
    ["恢复上一版后变成未验证", () => { skills.mine.update("my-weekly", { text: text("v2"), meta: meta({ unverified: true }) }); }, "skill_unverified", "技能变成了未验证，先成功跑一次"],
  ])("%s：规则自动暂停并进「需要处理」", (_name, change, code, line) => {
    const r = create();
    change();
    const after = store.getRule(r.id)!;
    expect(after.pausedReason).toBe(code);
    const view = tasks.ruleView(after);
    expect(view.needsAttention).toBe(true);
    expect(view.pausedLine).toBe(line);
    // 问题还在：不能重新开
    expect(tasks.updateRule(r.id, { mode: "act" }).error).toBe(line);
  });

  it("恢复上一版也会触发暂停，换回来后能重新开", () => {
    skills.mine.update("my-weekly", { text: text("v2"), meta: meta() });
    const r = create();
    skills.mine.update("my-weekly", { text: text("v3"), meta: meta({ unverified: true }) });
    expect(store.getRule(r.id)!.pausedReason).toBe("skill_unverified");
    skills.mine.restore("my-weekly");
    expect(tasks.updateRule(r.id, { mode: "act" }).error).toBeUndefined();
    expect(store.getRule(r.id)!.pausedReason).toBe("");
    expect(tasks.rulesUsingSkill("my-weekly")).toBe(1);
    expect(() => skills.mine.restore("nope")).toThrow(SkillError);
  });
});

/** 一个最小的技能 ZIP（只有 SKILL.md） */
function fakeZip(name: string): Buffer {
  return zipFiles([{ path: `${name}/SKILL.md`, data: Buffer.from(`---\nname: ${name}\ndescription: test\n---\n\nbody\n`) }]);
}
