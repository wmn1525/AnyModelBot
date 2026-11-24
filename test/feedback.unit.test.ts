/**
 * 需求与反馈（src/feedback/）：字数、校验、正文构造、外部副本、工单地址和本机草稿。
 * 工单服务按同样的规则独立再校验一遍（Modelflare controller/connected_app_feedback_v2.go），这里守住客户端这一侧：
 * 按码点计数、超限不无声截断、联系方式只在本人同意时生效、正文里的机器标签和结构化字段一致、密钥不出站。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { composeFeedback, externalCopy, type ComposeInput, type FeedbackEnvironment } from "../src/feedback/compose.js";
import { DraftStore } from "../src/feedback/drafts.js";
import { LIMITS, codePoints, parseReceipt, safeSupportUrl, stripGuidance, validateDraft } from "../src/feedback/model.js";

const env: FeedbackEnvironment = { app_version: "0.1.43", runtime: "desktop", locale: "zh-CN", os_family: "macos", arch: "arm64" };
const base = (patch: Partial<ComposeInput> = {}): ComposeInput => ({
  tab: "use_case",
  source: "account_menu",
  draft: { description: "我想每周整理销售进展，但资料散在几个系统里。" },
  contact: { consent: false },
  identity: {},
  policyVersion: "2026-11-19",
  environment: env,
  clientSubmissionId: "11111111-2222-4333-8444-555555555555",
  ...patch,
});
const errorsOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as { errors: unknown }).errors;
  }
  return [];
};

describe("字数按 Unicode 码点计算", () => {
  it("空白不算；9 个不够、10 个够；4000 可以、4001 不行；组合 emoji 按码点算", () => {
    const check = (description: string) => validateDraft("use_case", { description }, { consent: false }, { emailAvailable: false });
    expect(check("   \n  ")).toEqual([{ field: "description", code: "too_short", params: { min: 10 } }]);
    expect(check("🙂".repeat(9))).toHaveLength(1);
    expect(check(`  ${"🙂".repeat(10)}  `)).toEqual([]);
    // 👍🏽 是两个码点：5 个就是 10
    expect(codePoints("👍🏽".repeat(5))).toBe(10);
    expect(check("👍🏽".repeat(5))).toEqual([]);
    expect(check("字".repeat(4000))).toEqual([]);
    expect(check("字".repeat(4001))).toEqual([{ field: "input_total", code: "too_long", params: { max: 4000 } }]);
  });

  it("应用写进去的指导占位原样未改时不计数、不提交；改过的行是本人的内容", () => {
    const guidance = ["目前使用的应用：[请补充]", "希望先解决的问题：[请补充]"];
    const text = ["我想了解客户跟进、商机整理、合同查询。", ...guidance].join("\n");
    expect(stripGuidance(text, guidance)).toBe("我想了解客户跟进、商机整理、合同查询。");
    expect(stripGuidance(text.replace("[请补充]", "[请补充] 飞书和金蝶"), guidance)).toContain("目前使用的应用：[请补充] 飞书和金蝶");
    // 本人自己写的同样文字不在指导列表里，不会被通用替换删掉
    expect(stripGuidance("目前使用的应用：[请补充]", [])).toBe("目前使用的应用：[请补充]");
  });

  it("自由文本合计 4000：描述、企业背景、自填联系方式一起算；别的分类的字段不算", () => {
    const draft = { description: "字".repeat(3990), role: "enterprise_use" as const, business: { company_name: "名".repeat(11) } };
    expect(validateDraft("enterprise", draft, { consent: false }, { emailAvailable: false })).toEqual([{ field: "input_total", code: "too_long", params: { max: 4000 } }]);
    expect(validateDraft("use_case", draft, { consent: false }, { emailAvailable: false })).toEqual([]);
    expect(validateDraft("use_case", { description: "字".repeat(3990) }, { consent: true, channel: "wechat", value: "w".repeat(11) }, { emailAvailable: false })).toEqual([{ field: "input_total", code: "too_long", params: { max: 4000 } }]);
  });
});

describe("留联只在本人同意时生效", () => {
  const d = { description: "我想把每周整理销售进展的步骤变简单。" };
  const check = (contact: Parameters<typeof validateDraft>[2], emailAvailable = false) => validateDraft("use_case", d, contact, { emailAvailable });
  it("没同意：隐藏的值不校验、不计数", () => {
    expect(check({ consent: false, channel: "email", value: "not-an-email" })).toEqual([]);
  });
  it("同意了：要选渠道、要填值、格式要对，账号邮箱没有时不能选", () => {
    expect(check({ consent: true })).toEqual([{ field: "contact", code: "contact_channel_required" }]);
    expect(check({ consent: true, channel: "wechat", value: "  " })).toEqual([{ field: "contact", code: "contact_value_required" }]);
    expect(check({ consent: true, channel: "email", value: "ada@" })).toEqual([{ field: "contact", code: "contact_email_invalid" }]);
    expect(check({ consent: true, channel: "email", value: `${"a".repeat(250)}@x.io` })).toEqual([{ field: "contact", code: "contact_value_invalid" }]);
    expect(check({ consent: true, channel: "wechat", value: "w".repeat(65) })).toEqual([{ field: "contact", code: "contact_value_invalid" }]);
    expect(check({ consent: true, channel: "wechat", value: "wx\nid" })).toEqual([{ field: "contact", code: "contact_value_invalid" }]);
    expect(check({ consent: true, channel: "account_email" })).toEqual([{ field: "contact", code: "contact_email_unavailable" }]);
    expect(check({ consent: true, channel: "account_email" }, true)).toEqual([]);
    expect(check({ consent: true, channel: "email", value: " ada@example.com " })).toEqual([]);
  });
  it("脱敏会改动的联系方式不能为了留联而放宽保护：请本人更换或取消", () => {
    expect(check({ consent: true, channel: "wechat", value: "sk-abcdefghijk" })).toEqual([{ field: "contact", code: "contact_unsafe" }]);
  });
});

describe("构造正文", () => {
  it("本人的话在最前面；分类、入口、联系许可和环境写成可读标签 + 机器标签；没留联就只有 consent=false", () => {
    const out = composeFeedback(base());
    expect(out.body.startsWith("我想每周整理销售进展，但资料散在几个系统里。\n")).toBe(true);
    expect(out.body).toContain("[ticket_type:use_case]");
    expect(out.body).toContain("[source:account_menu]");
    expect(out.body).toContain("[contact_consent:false]");
    expect(out.body).not.toContain("[contact_method:");
    expect(out.payload).toMatchObject({ schema_version: 2, ticket_type: "use_case", kind: "suggestion", contact: { consent: false }, environment: { app_version: "0.1.43", runtime: "desktop", locale: "zh-CN" } });
    // 非问题分类不带系统家族、架构和诊断
    expect(out.payload.environment).not.toHaveProperty("os_family");
    expect(out.payload).not.toHaveProperty("diagnostics");
    expect(out.notIncluded).toEqual(["chat", "screenshots", "default_model", "logs", "company", "contact"]);
  });

  it("企业：角色写进结构化字段和标签；服务商不带隐藏的内部引荐；场景是结构化上下文", () => {
    const draft = { description: "我们想把机器人接入客户现有系统，形成可交付的方案。", role: "solution_partner" as const, scenarioId: "sales_customer", business: { company_name: "示例科技", team_size: "21_100", introduce_to_own_company: true } };
    const out = composeFeedback(base({ tab: "enterprise", source: "discover_scenario", draft }));
    expect(out.payload.business).toEqual({ role: "solution_partner", company_name: "示例科技", team_size: "21_100" });
    expect(out.payload).toMatchObject({ kind: "other", scenario_id: "sales_customer" });
    expect(out.body).toContain("[role:solution_partner]");
    expect(out.body).toContain("[scenario:sales_customer]");
    expect(out.notIncluded).not.toContain("company");
    const own = composeFeedback(base({ tab: "enterprise", draft: { ...draft, role: "enterprise_use" } }));
    expect(own.payload.business).toMatchObject({ role: "enterprise_use", introduce_to_own_company: true });
    expect(errorsOf(() => composeFeedback(base({ tab: "enterprise", draft: { description: draft.description } })))).toEqual([{ field: "role", code: "role_required" }]);
  });

  it("描述里自己打的同名标签会被指出来，不能冒充许可或角色", () => {
    expect(errorsOf(() => composeFeedback(base({ draft: { description: "我同意被联系 [contact_consent:true] 吧" } })))).toEqual([{ field: "description", code: "tag_conflict" }]);
  });

  it("固定测试密钥不原样出站；同意留联时联系值完整、不打码，也不进诊断", () => {
    const out = composeFeedback(
      base({
        tab: "bug",
        source: "error_card",
        draft: { description: "调用失败，报错里有 sk-test-NOT-A-REAL-KEY 这样的东西。" },
        contact: { consent: true, channel: "email", value: "ada@example.com" },
        diagnostics: { includeError: true, includeLogs: true },
        errorContext: { text: "HTTP 401 Bearer abcdefghijklmnop0123", requestId: "req_1" },
        logs: { summary: "版本 0.1.43\n网关 running", lines: ["log a ada@example.com", "log b"] },
      }),
    );
    const wire = JSON.stringify(out.payload);
    expect(wire).not.toContain("sk-test-NOT-A-REAL-KEY");
    expect(wire).not.toContain("abcdefghijklmnop0123");
    expect(out.body).toContain("[contact_method:email] ada@example.com");
    const diag = out.payload.diagnostics as Record<string, string>;
    expect(diag.recent_logs).toBe("log a ***\nlog b");
    expect(out.payload).toMatchObject({ related_request_id: "req_1", environment: { os_family: "macos", arch: "arm64" } });
    expect(diag).not.toHaveProperty("error_model");
  });

  it("没附报错就没有 Request ID 和模型；日志默认不读（没勾就不带）", () => {
    const out = composeFeedback(base({ tab: "bug", source: "error_card", diagnostics: { includeError: false, includeLogs: false }, errorContext: { text: "HTTP 500", requestId: "req_9", model: "gpt-x" } }));
    expect(out.payload).not.toHaveProperty("related_request_id");
    expect(out.payload).not.toHaveProperty("diagnostics");
    expect(out.body).not.toContain("gpt-x");
  });

  it("技术材料按余量裁剪并提示，主内容和联系方式不裁；整段不超过 7800", () => {
    const longError = "E".repeat(3000);
    const lines = Array.from({ length: 500 }, (_, i) => `2026-11-19 log line ${i} ${"x".repeat(60)}`);
    const out = composeFeedback(
      base({
        tab: "bug",
        source: "troubleshooting",
        draft: { description: "说明".repeat(1900) },
        contact: { consent: true, channel: "wechat", value: "wx_ada" },
        diagnostics: { includeError: true, includeLogs: true },
        errorContext: { text: longError },
        logs: { summary: Array.from({ length: 200 }, (_, i) => `状态 ${i}`).join("\n"), lines },
      }),
    );
    expect(codePoints(out.body)).toBeLessThanOrEqual(LIMITS.bodyMax);
    expect(out.notices).toEqual({ errorTrimmed: true, diagnosticsTrimmed: true });
    expect(out.body).toContain("说明".repeat(1900));
    expect(out.body).toContain("[contact_method:wechat] wx_ada");
    const diag = out.payload.diagnostics as Record<string, string>;
    expect(codePoints(diag.error_text)).toBeLessThanOrEqual(LIMITS.errorMax);
    expect(diag.recent_logs.split("\n").length).toBeLessThanOrEqual(LIMITS.logLines);
    expect(diag.recent_logs).toContain("log line 499");
  });
});

describe("邮件 / GitHub 外部副本", () => {
  it("没有联系许可、标签和企业背景；正文里写到的已知联系方式换成 ***，原稿不动", () => {
    const draft = { description: "我想复用整理周报的步骤，可以加我微信 wx_ada 详聊。", contactValue: "wx_ada", context: { task: "整理周报" } };
    const out = externalCopy({ tab: "use_case", draft, environment: env, knownContacts: ["wx_ada", "ada@example.com"] });
    expect(out.text).toContain("可以加我微信 *** 详聊");
    expect(out.text).toContain("整理周报");
    expect(out.text).not.toMatch(/\[(contact_|role|ticket_type)/);
    expect(draft.description).toContain("wx_ada");
  });
});

describe("工单地址和回执", () => {
  it("只认官方 HTTPS 工单页：相似域、凭据段、非标准端口、HTTP、javascript、开放跳转一律不认", () => {
    expect(safeSupportUrl("https://modelflare.dev/support-tickets?ticket_id=41")).toBe("https://modelflare.dev/support-tickets?ticket_id=41");
    for (const bad of [
      "http://modelflare.dev/support-tickets?ticket_id=41",
      "https://modelflare.dev.evil.com/support-tickets?ticket_id=41",
      "https://evil-modelflare.dev/support-tickets?ticket_id=41",
      "https://user:pw@modelflare.dev/support-tickets?ticket_id=41",
      "https://modelflare.dev:8443/support-tickets?ticket_id=41",
      "https://modelflare.dev/support-tickets?ticket_id=41&next=https://evil.com",
      "https://modelflare.dev/redirect?to=https://evil.com",
      "javascript:alert(1)",
      "data:text/html,hi",
    ]) expect(safeSupportUrl(bad)).toBe("");
  });

  it("回执必须是 schema 2 入库、提交 ID 一致、工单号有效；缺一项都不算成功", () => {
    const id = "11111111-2222-4333-8444-555555555555";
    const ok = { schema_version: 2, stored_schema_version: 2, client_submission_id: id, status: "created", ticket_id: 41, topic: "suggestion", support_url: "https://modelflare.dev/support-tickets?ticket_id=7", replayed: false };
    expect(parseReceipt(ok, id)).toEqual({ clientSubmissionId: id, ticketId: "41", topic: "suggestion", supportUrl: ok.support_url, replayed: false });
    expect(parseReceipt({ ...ok, ticket_id: "example-ticket-001" }, id)?.ticketId).toBe("example-ticket-001");
    expect(parseReceipt({ ...ok, stored_schema_version: 1 }, id)).toBeNull();
    expect(parseReceipt({ ...ok, client_submission_id: "other" }, id)).toBeNull();
    expect(parseReceipt({ ...ok, ticket_id: 0 }, id)).toBeNull();
    expect(parseReceipt({ ...ok, status: "processing" }, id)).toBeNull();
    expect(parseReceipt("<html>ok</html>", id)).toBeNull();
  });
});

describe("本机草稿", () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "amb-fb-"));

  it("按账户隔离，文件只有本人可读；联系许可不落盘", () => {
    const dir = path.join(tmp(), "feedback-drafts");
    const store = new DraftStore(dir);
    store.save("account-a", { use_case: { description: "A 的草稿", contactKind: "wechat", contactValue: "wx_a", consent: true } as never });
    expect(store.load("account-b")).toBeUndefined();
    const a = store.load("account-a")!;
    expect(a.tabs.use_case).toEqual({ description: "A 的草稿", contactKind: "wechat", contactValue: "wx_a" });
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "index.json");
    expect(files).toHaveLength(1);
    expect(fs.readFileSync(path.join(dir, files[0]), "utf8")).not.toContain("account-a");
    if (process.platform !== "win32") expect(fs.statSync(path.join(dir, files[0])).mode & 0o777).toBe(0o600);
  });

  it("闲置 7 天清理；写不进磁盘时只在内存里保留", () => {
    let now = Date.now();
    const dir = path.join(tmp(), "feedback-drafts");
    const store = new DraftStore(dir, () => now);
    store.save("me", { bug: { description: "窗口关掉了" } });
    now += 7 * 24 * 3600_000 + 1;
    expect(store.load("me")).toBeUndefined();
    if (process.platform !== "win32" && process.getuid?.() !== 0) {
      const ro = tmp();
      fs.chmodSync(ro, 0o500);
      const mem = new DraftStore(path.join(ro, "feedback-drafts"));
      expect(mem.isPersistent).toBe(false);
      mem.save("me", { bug: { description: "只在内存里" } });
      expect(mem.load("me")?.tabs.bug?.description).toBe("只在内存里");
    }
  });

  it("按版本清除：迟到的成功只清同版本；换账户时由本人决定是否带入", () => {
    const store = new DraftStore(path.join(tmp(), "feedback-drafts"));
    const v1 = store.save("me", { use_case: { description: "第一版" } }).revisions.use_case!;
    store.save("me", { use_case: { description: "第二版" } }, ["use_case"]);
    expect(store.clear("me", "use_case", v1)).toBe(false);
    expect(store.load("me")?.tabs.use_case?.description).toBe("第二版");
    store.save("local", { enterprise: { description: "未登录时写的企业需求", role: "enterprise_use" } });
    const from = store.pendingFrom("signed-in")!;
    expect(from).toMatch(/^[0-9a-f]{32}$/);
    store.moveFrom(from, "signed-in");
    expect(store.load("signed-in")?.tabs.enterprise?.description).toBe("未登录时写的企业需求");
    expect(store.load("local")).toBeUndefined();
  });
});

// 界面纯函数（ui/lib/feedback-links.js）：输入时的即时提示和邮件 / GitHub 链接，权威校验仍在本机服务
describe("界面：字数、模板合并和外部链接", async () => {
  // @ts-expect-error 界面库是纯 JS
  const links = await import("../ui/lib/feedback-links.js");
  it("界面和本机服务按同一算法计数，指导占位不计", () => {
    expect(links.charCount(" 👍🏽 ")).toBe(codePoints("👍🏽"));
    const g = ["目前使用的应用：[请补充]"];
    expect(links.stripGuidance("我想了解客户跟进。\n目前使用的应用：[请补充]", g)).toBe(stripGuidance("我想了解客户跟进。\n目前使用的应用：[请补充]", g));
    expect(links.inputTotal("use_case", { description: "一二三", contactValue: "wx_ada" }, { consent: true, channel: "other" })).toBe(9);
    expect(links.inputTotal("use_case", { description: "一二三", contactValue: "wx_ada" }, { consent: false })).toBe(3);
  });
  it("已有企业草稿加入新场景：同一场景不重复追加，超过 4000 不动原稿", () => {
    const line = "新增咨询场景：客户与商机（客户跟进 · 商机整理 · 合同查询）";
    expect(links.appendScenario("原来的需求", line)).toBe(`原来的需求\n${line}`);
    expect(links.appendScenario(`原来的需求\n${line}`, line)).toBe(`原来的需求\n${line}`);
    expect(links.appendScenario("字".repeat(3990), line)).toBeNull();
  });
  it("GitHub：问题用 bug_report、使用场景用 feature_request；内容太长时只放开头并标记", () => {
    const bug = new URL(links.githubFeedbackUrl({ tab: "bug", text: "导出卡住", version: "0.1.43", environment: "环境：…", errorText: "HTTP 500" }).url);
    expect(Object.fromEntries(bug.searchParams)).toMatchObject({ template: "bug_report.yml", version: "0.1.43", steps: "导出卡住" });
    const idea = new URL(links.githubFeedbackUrl({ tab: "use_case", text: "复用周报步骤" }).url);
    expect(Object.fromEntries(idea.searchParams)).toEqual({ template: "feature_request.yml", problem: "复用周报步骤" });
    const long = links.githubFeedbackUrl({ tab: "bug", text: "很长的描述".repeat(400) });
    expect(long.truncated).toBe(true);
    expect(long.url.length).toBeLessThan(8000);
    const mail = links.emailFeedbackUrl({ subject: "AnyModelBot", text: "很长的描述".repeat(400) });
    expect(mail.url.startsWith("mailto:support@anymodel.bot?subject=AnyModelBot&body=")).toBe(true);
    expect(mail.url).not.toContain("+");
  });
});
