import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { crc32 } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { App } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { locateDshRuntime } from "../src/agent/host.js";
import { findAppRoot } from "../src/magpie/supervisor.js";
import { listen } from "./helpers.js";

/**
 * 工作文件夹与 ZIP（PRD R2、R6、R7），真实 DSH 子进程 + 脚本化的模型：
 * - 所选目录在这条消息里就是可写根：写进去不用批准；写到目录外仍要批准（拒绝了就不写）。
 * - 换回「不使用文件夹」之后，旧目录不再可写（不能沿用上一条消息的目录）。
 * - 目录被删掉 / 换了：这一轮按不可用处理（模型收到说明，写不进去），不去默认工作区。
 * - zip_list / zip_extract：只能取这个对话发出的 ZIP；默认解到受管空间；解到工作文件夹不用批准。
 * 文件工具在 DSH 进程里执行，不经过 bubblewrap，所以没装 bubblewrap 的机器上也能跑。
 */
const runtime = locateDshRuntime(findAppRoot());

async function body(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
const textOf = (c: any): string => (typeof c === "string" ? c : Array.isArray(c) ? c.map((p) => (typeof p === "string" ? p : p?.text ?? "")).join("") : "");

/** 一个只有一个文件的 ZIP（Stored） */
function tinyZip(name: string, content: string): Buffer {
  const n = Buffer.from(name);
  const d = Buffer.from(content);
  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0);
  lh.writeUInt16LE(20, 4);
  lh.writeUInt16LE(0x800, 6);
  lh.writeUInt32LE(crc32(d) >>> 0, 14);
  lh.writeUInt32LE(d.length, 18);
  lh.writeUInt32LE(d.length, 22);
  lh.writeUInt16LE(n.length, 26);
  const local = Buffer.concat([lh, n, d]);
  const ch = Buffer.alloc(46);
  ch.writeUInt32LE(0x02014b50, 0);
  ch.writeUInt16LE(20, 4);
  ch.writeUInt16LE(20, 6);
  ch.writeUInt16LE(0x800, 8);
  ch.writeUInt32LE(crc32(d) >>> 0, 16);
  ch.writeUInt32LE(d.length, 20);
  ch.writeUInt32LE(d.length, 24);
  ch.writeUInt16LE(n.length, 28);
  const cd = Buffer.concat([ch, n]);
  const e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0);
  e.writeUInt16LE(1, 8);
  e.writeUInt16LE(1, 10);
  e.writeUInt32LE(cd.length, 12);
  e.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, cd, e]);
}

describe.skipIf(!runtime)("工作文件夹与 ZIP（真实 DSH）", () => {
  let app: App;
  let llm: Awaited<ReturnType<typeof listen>>;
  let dataDir = "";
  let outside = "";
  let base = "";
  let picked = "";
  /** 每条用户消息要模型做的事：按消息里的关键字选一串工具调用 */
  const plans: Array<[RegExp, (text: string) => Array<{ name: string; args: Record<string, unknown> }>]> = [];
  /** 模型最后收到的用户消息全文（带宿主加的说明）和工具结果 */
  let lastUser = "";
  let lastResults: string[] = [];

  const api = async (p: string, init: { method?: string; body?: unknown } = {}) => {
    const r = await fetch(`${base}/amb/api${p}`, { method: init.method ?? "GET", headers: { "content-type": "application/json" }, ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}) });
    return { status: r.status, body: (await r.json().catch(() => ({}))) as any };
  };
  const pending = async () => (await api("/approvals?status=pending")).body.approvals as any[];
  /** 发一条网页消息（带点发送时的目录 id），等它答完；期间出现的审批按 decide 处理 */
  const chat = async (text: string, decide?: (row: any) => "approve" | "deny") => {
    const folder = (await api("/bots/default/folder")).body.current?.id ?? "";
    const done = fetch(`${base}/amb/api/bots/default/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, folder }) });
    const decided = new Set<string>();
    let finished = false;
    void done.finally(() => (finished = true));
    while (!finished) {
      for (const row of await pending()) {
        if (decided.has(row.id)) continue;
        decided.add(row.id);
        await api(`/approvals/${row.id}/${decide ? decide(row) : "deny"}`, { method: "POST", body: {} });
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    const r = await done;
    return { status: r.status, body: (await r.json()) as any, approvals: decided.size };
  };

  beforeAll(async () => {
    llm = await listen(async (req, res) => {
      const url = req.url?.split("?")[0] ?? "";
      if (url.endsWith("/models")) return void res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ object: "list", data: [{ id: "mock-agent", object: "model" }] }));
      const b = await body(req);
      const msgs: any[] = b.messages ?? [];
      let at = -1;
      for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === "user" && plans.some(([re]) => re.test(textOf(msgs[i].content)))) { at = i; break; }
      const text = at >= 0 ? textOf(msgs[at].content) : "";
      const plan = at >= 0 && b.tools ? plans.find(([re]) => re.test(text))![1](text) : [];
      const results = at >= 0 ? msgs.slice(at + 1).filter((m) => m.role === "tool") : [];
      if (at >= 0) {
        lastUser = text;
        lastResults = results.map((m) => textOf(m.content));
      }
      const step = !b.tools || at < 0 ? { text: "标题" } : results.length < plan.length ? { tool: plan[results.length] } : { text: `DONE<<${lastResults.join(" | ")}>>` };
      if (!b.stream) return void res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ choices: [{ message: { role: "assistant", content: step.text ?? "" }, finish_reason: "stop" }] }));
      res.writeHead(200, { "content-type": "text/event-stream" });
      const send = (o: any) => res.write(`data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", model: b.model, ...o })}\n\n`);
      if (step.tool) {
        send({ choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: "call_" + Math.random().toString(36).slice(2, 8), type: "function", function: { name: step.tool.name, arguments: JSON.stringify(step.tool.args) } }] } }] });
        send({ choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] });
      } else {
        send({ choices: [{ index: 0, delta: { role: "assistant", content: step.text } }] });
        send({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
      }
      send({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
      res.write("data: [DONE]\n\n");
      res.end();
    });
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "amb-workfolder-"));
    // 用户目录放在临时目录之外：工作区可写本来就允许写 /tmp 和系统临时目录（DSH 的约定），放在那里测不出边界
    fs.mkdirSync(path.join(findAppRoot(), "test-results"), { recursive: true });
    outside = fs.mkdtempSync(path.join(findAppRoot(), "test-results", "amb-user-folders-"));
    app = new App(loadConfig({ dataDir, env: { AMB_MAGPIE_BASE_URL: llm.url + "/v1", AMB_MAGPIE_API_KEY: "gw-key", AMB_UI_PORT: "0", AMB_WEIXIN_API_BASE: "http://127.0.0.1:9", AMB_DEFAULT_MODEL: "mock-agent" } }), { printQrToTerminal: false });
    await app.start();
    // 桌面版的系统目录选择器：测试里直接返回要选的目录
    (app as any).desktop = { ...(app.desktop ?? {}), pickFolder: async () => picked || undefined };
    base = app.web!.url.replace(/\/+$/, "");
  }, 120_000);
  afterAll(async () => {
    await app?.stop();
    await llm?.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });

  it("所选目录里直接写；目录外要批准、拒绝了不写；换回不使用文件夹后旧目录不再可写", async () => {
    const A = path.join(outside, "项目 A");
    const B = path.join(outside, "B");
    fs.mkdirSync(A);
    fs.mkdirSync(B);
    picked = A;
    const r = await api("/bots/default/folder/pick", { method: "POST" });
    expect(r.body).toMatchObject({ status: "picked", picker: true, current: { name: "项目 A", path: fs.realpathSync(A) } });

    // 相对路径以所选目录为准，写进去不用批准
    plans.push([/WRITE_IN/, () => [{ name: "write", args: { file_path: "note.txt", content: "hello from the bot" } }]]);
    const w = await chat("WRITE_IN 在这个文件夹里写一个说明");
    expect(w.status).toBe(200);
    expect(w.approvals).toBe(0);
    expect(fs.readFileSync(path.join(A, "note.txt"), "utf8")).toBe("hello from the bot");
    expect(fs.existsSync(path.join(dataDir, "workspaces", "default", "note.txt"))).toBe(false);

    // 目录外：要批准；拒绝了就不写
    plans.push([/WRITE_OUT/, () => [{ name: "write", args: { file_path: path.join(B, "x.txt"), content: "nope" } }]]);
    const out = await chat("WRITE_OUT 写到别处", () => "deny");
    expect(out.status).toBe(200);
    // 沙箱拒绝（模型要提权才会出批准卡）；文件没写出来
    expect(lastResults[0]).toMatch(/sandbox/i);
    expect(fs.existsSync(path.join(B, "x.txt"))).toBe(false);
    // 模型请求提权：出批准卡，用户拒绝了就不写
    plans.push([/ESCALATE_OUT/, () => [{ name: "write", args: { file_path: path.join(B, "y.txt"), content: "nope", sandbox_permissions: "danger-full-access", justification: "测试" } }]]);
    const esc = await chat("ESCALATE_OUT 提权写到别处", () => "deny");
    expect(esc.approvals).toBe(1);
    expect(fs.existsSync(path.join(B, "y.txt"))).toBe(false);

    // 不使用文件夹：之后的消息回到默认工作区，原来的目录要批准才能写
    await api("/bots/default/folder/clear", { method: "POST" });
    plans.push([/WRITE_OLD/, () => [{ name: "write", args: { file_path: path.join(A, "later.txt"), content: "should not land" } }, { name: "write", args: { file_path: "in-workspace.txt", content: "ws" } }]]);
    const old = await chat("WRITE_OLD 不选目录了", () => "deny");
    expect(old.status).toBe(200);
    expect(lastResults[0]).toMatch(/sandbox/i);
    expect(fs.existsSync(path.join(A, "later.txt"))).toBe(false);
    expect(fs.readFileSync(path.join(dataDir, "workspaces", "default", "in-workspace.txt"), "utf8")).toBe("ws");
  }, 180_000);

  it("发送时的选择和服务端的对不上：不受理；不可选的位置拒绝；原选择不变", async () => {
    const C = path.join(outside, "C");
    fs.mkdirSync(C);
    picked = C;
    await api("/bots/default/folder/pick", { method: "POST" });
    const stale = await fetch(`${base}/amb/api/bots/default/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "hi", folder: "some-old-id" }) });
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as any).code).toBe("folderChanged");
    for (const bad of [dataDir, path.join(dataDir, "workspaces", "default"), os.homedir(), path.parse(outside).root]) {
      picked = bad;
      const r = await api("/bots/default/folder/pick", { method: "POST" });
      expect(r.body.code).toBe("notAllowed");
    }
    expect((await api("/bots/default/folder")).body.current.name).toBe("C");
  }, 60_000);

  it("目录被删掉：这一轮按不可用处理，模型收到说明，写不进去，也不写到默认工作区", async () => {
    const D = path.join(outside, "D");
    fs.mkdirSync(D);
    picked = D;
    await api("/bots/default/folder/pick", { method: "POST" });
    const folder = (await api("/bots/default/folder")).body.current.id;
    fs.rmSync(D, { recursive: true });
    fs.mkdirSync(D); // 同名的新目录：身份对不上，不能当成原来那个
    plans.push([/WRITE_GONE/, () => [{ name: "write", args: { file_path: path.join(D, "x.txt"), content: "x" } }]]);
    const r = await fetch(`${base}/amb/api/bots/default/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "WRITE_GONE 继续改", folder }) });
    expect(r.status).toBe(200);
    expect(lastUser).toContain("「D」");
    expect(fs.existsSync(path.join(D, "x.txt"))).toBe(false);
    expect((await api("/bots/default/folder")).body.current).toMatchObject({ name: "D", available: false });
    await api("/bots/default/folder/clear", { method: "POST" });
  }, 120_000);

  it("ZIP：只交引用；查看、解到受管空间；解到工作文件夹不用批准；别的对话拿不到", async () => {
    const zip = tinyZip("报告/数据.csv", "a,b\n1,2\n");
    const st = (await api("/bots/default/attachments/state")).body;
    expect(st.zip).toBe(true);
    const reserved = await api("/bots/default/attachments/batches", { method: "POST", body: { protocol: 1, segment: st.segment, batch: "batch-zip-1", items: [{ clientId: "client-zip-1", name: "资料.zip", mime: "application/zip", size: zip.length }] } });
    const att = reserved.body.items[0];
    const put = await fetch(`${base}/amb/api/bots/default/attachments/${att.id}/content`, { method: "PUT", headers: { "content-type": "application/octet-stream" }, body: new Uint8Array(zip) });
    expect(((await put.json()) as any).item).toMatchObject({ status: "ready", kind: "zip", name: "资料.zip" });
    const E = path.join(outside, "E");
    fs.mkdirSync(E);
    picked = E;
    await api("/bots/default/folder/pick", { method: "POST" });
    plans.push([/ZIP_WORK/, (text) => {
      const id = /attachment ID ([A-Za-z0-9_-]+)|附件编号 ([A-Za-z0-9_-]+)/.exec(text);
      const ref = id?.[1] ?? id?.[2] ?? "missing";
      return [
        { name: "zip_list", args: { attachment: ref } },
        { name: "zip_extract", args: { attachment: ref } },
        { name: "zip_extract", args: { attachment: ref, target: "folder" } },
        { name: "zip_list", args: { attachment: "not-this-one" } },
      ];
    }]);
    const s2 = (await api("/bots/default/attachments/state")).body;
    const sent = await api("/bots/default/chat/send", { method: "POST", body: { version: 1, clientMessageId: "zip-msg-0001", text: "ZIP_WORK 解压后看看", segment: s2.segment, revision: s2.revision, modelRevision: s2.model.revision, attachments: s2.items.map((a: any) => ({ id: a.id, version: a.version })), folder: (await api("/bots/default/folder")).body.current.id } });
    expect(sent.body.status).toBe("accepted");
    for (let i = 0; i < 300 && (await api("/bots/default/attachments/state")).body.busy; i++) await new Promise((r) => setTimeout(r, 100));
    // 模型只拿到一行引用，没有包里的内容
    expect(lastUser).toContain("资料.zip");
    expect(lastUser).not.toContain("a,b");
    expect(lastResults[0]).toContain("报告/数据.csv");
    expect(lastResults[1]).toMatch(/Extracted .* into .*extracted/);
    expect(fs.readFileSync(path.join(dataDir, "workspaces", "default", "extracted", "资料", "报告", "数据.csv"), "utf8")).toBe("a,b\n1,2\n");
    expect(fs.readFileSync(path.join(E, "资料", "报告", "数据.csv"), "utf8")).toBe("a,b\n1,2\n");
    expect(await pending()).toEqual([]);
    expect(lastResults[3]).toMatch(/Can't access this attachment|无法访问这个附件/);
    // 已发的 ZIP 原文件：网页下载到当前操作的这台电脑
    const dl = await fetch(`${base}/amb/api/bots/default/attachments/${att.id}/download`);
    expect(dl.headers.get("content-type")).toBe("application/zip");
    expect(Buffer.from(await dl.arrayBuffer()).equals(zip)).toBe(true);
    // 到期：受管解压目录随附件回收；解到用户工作文件夹里的不动；之后再取用说明已过期
    app.store.db.prepare("UPDATE attachments SET expires_at = 1 WHERE id = ?").run(att.id);
    app.attachments.sweep();
    expect(fs.existsSync(path.join(dataDir, "workspaces", "default", "extracted", "资料"))).toBe(false);
    expect(fs.readFileSync(path.join(E, "资料", "报告", "数据.csv"), "utf8")).toBe("a,b\n1,2\n");
    expect((await fetch(`${base}/amb/api/bots/default/attachments/${att.id}/download`)).status).toBe(410);
    await api("/bots/default/folder/clear", { method: "POST" });
  }, 180_000);

  it("后台任务继承发起它的那条消息绑定的目录；不选目录时还是任务文件夹", async () => {
    const F = path.join(outside, "F");
    fs.mkdirSync(F);
    picked = F;
    await api("/bots/default/folder/pick", { method: "POST" });
    plans.push([/TASK_HERE/, () => [{ name: "task_start", args: { title: "整理目录", brief: "在这个文件夹里整理文件" } }]]);
    await chat("TASK_HERE 在后台整理这个文件夹");
    const task = app.store.listTasks({ botId: "default", limit: 5 }).find((t) => t.title === "整理目录");
    expect(task?.root).toBe(fs.realpathSync(F));
    await api("/bots/default/folder/clear", { method: "POST" });
    plans.push([/TASK_PLAIN/, () => [{ name: "task_start", args: { title: "普通任务", brief: "随便做点什么" } }]]);
    await chat("TASK_PLAIN 后台做件事");
    const plain = app.store.listTasks({ botId: "default", limit: 5 }).find((t) => t.title === "普通任务");
    expect(plain?.root).toBe("");
    for (const t of [task, plain]) if (t) await app.tasks.stopTask(t.id, "test").catch(() => undefined);
  }, 180_000);
});
