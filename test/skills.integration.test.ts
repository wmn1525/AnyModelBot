/** 真 DSH + 本地脚本模型：检查技能发现、按需加载和资源读取，不依赖模型账号或系统 shell 沙箱。 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { App } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { locateDshRuntime } from "../src/agent/host.js";
import { findAppRoot } from "../src/magpie/supervisor.js";
import { skillMd, skillZip } from "./skill-fixture.js";
import { listen } from "./helpers.js";

describe.skipIf(!locateDshRuntime(findAppRoot()))("ZIP 技能运行时", () => {
  let app: App, dir: string, base: string, llm: Awaited<ReturnType<typeof listen>>;
  const calls: any[] = [];
  let held: (() => void) | undefined;
  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "amb-skill-runtime-"));
    llm = await listen(async (req, res) => {
      if (req.method !== "POST") return void res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ data: [{ id: "mock-agent" }] }));
      let raw = "";
      for await (const c of req) raw += c;
      const b = JSON.parse(raw);
      calls.push(b);
      const start = b.messages.findLastIndex((m: any) => m.role === "user" && /IMPORTED_SKILL|HOLD_SKILL|IDLE_SKILL/.test(JSON.stringify(m.content)));
      const text = JSON.stringify(b.messages[start]?.content);
      const outputs = b.messages.slice(start + 1).filter((m: any) => m.role === "tool");
      const steps = [
        { name: "skill", arguments: JSON.stringify({ name: "zip-fixture" }) },
        { name: "read", arguments: JSON.stringify({ file_path: path.join(dir, "dsh/default/skills/zip-fixture/references/value.txt") }) },
      ];
      const step = b.tools && text?.includes("IMPORTED_SKILL") ? steps[outputs.length] : undefined;
      const content = outputs.length ? outputs.map((m: any) => JSON.stringify(m.content)).join("\n") : "ok";
      if (b.tools && text?.includes("HOLD_SKILL")) await new Promise<void>((resolve) => { held = resolve; });
      res.writeHead(200, { "content-type": "text/event-stream" });
      const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);
      send({ id: "chat-skill", object: "chat.completion.chunk", choices: [{ index: 0, delta: step ? { role: "assistant", tool_calls: [{ index: 0, id: `call-${outputs.length}`, type: "function", function: step }] } : { role: "assistant", content } }] });
      send({ choices: [{ index: 0, delta: {}, finish_reason: step ? "tool_calls" : "stop" }] });
      res.end("data: [DONE]\n\n");
    });
    app = new App(loadConfig({ dataDir: dir, env: { AMB_MAGPIE_BASE_URL: llm.url + "/v1", AMB_MAGPIE_API_KEY: "local-test", AMB_UI_PORT: "0", AMB_DEFAULT_MODEL: "mock-agent", AMB_WEIXIN_API_BASE: "http://127.0.0.1:9" } }), { printQrToTerminal: false });
    await app.start();
    app.store.updateBot("default", { settings: { ...app.store.getBot("default")!.settings, computerUse: { enabled: false, backend: "cua", approval: "auto" }, memory: { enabled: false, review: false, teamWrite: false }, steward: { enabled: false } } });
    base = app.web!.url.replace(/\/$/, "") + "/amb/api/bots/default";
  });
  afterAll(async () => { held?.(); await app?.stop(); await llm?.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const json = async (p: string, body: unknown, method = "POST") => {
    const res = await fetch(base + p, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    expect(res.status).toBe(200);
    return await res.json() as any;
  };
  const upload = async (marker: string, replaces?: string) => {
    const zip = skillZip([{ path: "wrapper/SKILL.md", text: skillMd("zip-fixture", marker) }, { path: "wrapper/references/value.txt", text: `resource-${marker}` }]);
    const res = await fetch(base + "/skills" + (replaces ? `?replaces=${replaces}` : ""), { method: "POST", headers: { "content-type": "application/zip" }, body: new Uint8Array(zip) });
    expect(res.status).toBe(200);
    return (await res.json() as any).skills[0].digest;
  };
  it("导入后发现并加载技能；停用、替换、重新启用、删除后更新运行时", async () => {
    const digest = await upload("skill-marker-v1");
    const first = await json("/chat", { text: "IMPORTED_SKILL first" });
    expect(first.reply).toContain("skill-marker-v1");
    expect(first.reply).toContain("resource-skill-marker-v1");
    expect(first.prompts).toEqual([]);
    const firstRequest = calls.find((b) => b.tools);
    expect(JSON.stringify(firstRequest)).toContain("Prepare weekly reports");
    expect(JSON.stringify(firstRequest)).not.toContain("skill-marker-v1");
    // 系统提示词里有这个机器人装的技能（界面上的名字 → 技能名：示例），问起时只列它们
    const system = JSON.stringify(firstRequest.messages.filter((m: any) => m.role === "system"));
    expect(system).toContain("# 技能和应用");
    expect(system).toMatch(/- zip-fixture：/);
    // 这一轮用到了技能：历史消息带着「已使用」，设置列表里它已生效
    const chat = await (await fetch(base + "/chat")).json() as any;
    expect(chat.messages.findLast((m: any) => m.role === "assistant").used).toEqual([{ kind: "skill", name: "zip-fixture", status: "ok" }]);
    const listed = await (await fetch(base + "/skills")).json() as any;
    expect(listed.skills[0]).toMatchObject({ name: "zip-fixture", state: "active", modelInvocable: true });
    const working = json("/chat", { text: "HOLD_SKILL" });
    for (let i = 0; !held && i < 100; i++) await new Promise((r) => setTimeout(r, 20));
    expect(held).toBeTypeOf("function");
    await json("/skills/zip-fixture", { enabled: false }, "PUT");
    expect(fs.existsSync(path.join(dir, "dsh/default/skills/zip-fixture"))).toBe(true);
    // 正在跑的时候装上的技能：等当前任务结束才生效（不说下一条消息起）；关掉的不标状态
    const second = await fetch(base + "/skills", { method: "POST", headers: { "content-type": "application/zip" }, body: new Uint8Array(skillZip([{ path: "SKILL.md", text: skillMd("zip-second", "second-marker") }])) });
    const during = (await second.json() as any).skills;
    expect(during.find((x: any) => x.name === "zip-second").state).toBe("waiting");
    expect(during.find((x: any) => x.name === "zip-fixture").state).toBe("off");
    held!();
    await working;
    await json("/chat", { text: "IDLE_SKILL disabled" });
    expect(fs.existsSync(path.join(dir, "dsh/default/skills/zip-fixture"))).toBe(false);
    const after = (await (await fetch(base + "/skills")).json() as any).skills;
    expect(after.find((x: any) => x.name === "zip-second").state).toBe("active");
    expect((await fetch(base + "/skills/zip-second", { method: "DELETE" })).status).toBe(200);
    await upload("skill-marker-v2", digest);
    await json("/skills/zip-fixture", { enabled: true }, "PUT");
    expect((await json("/chat", { text: "IMPORTED_SKILL updated" })).reply).toContain("resource-skill-marker-v2");
    expect((await fetch(base + "/skills/zip-fixture", { method: "DELETE" })).status).toBe(200);
    await json("/chat", { text: "IDLE_SKILL removed" });
    expect(fs.existsSync(path.join(dir, "dsh/default/skills/zip-fixture"))).toBe(false);
  }, 120_000);
});
