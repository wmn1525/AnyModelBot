import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { App } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { BWRAP_MISSING, findBwrap, locateDshRuntime, probeBwrap } from "../src/agent/host.js";
import { findAppRoot } from "../src/magpie/supervisor.js";
import { listen } from "./helpers.js";

/**
 * Linux 上命令的沙箱只用 bubblewrap：用不了时命令被拒绝，不退到 DSH 的 Landlock（那种模式没有 PID 命名空间，
 * 数据目录也遮不住，沙箱里的命令够得着回环管理接口和界面令牌，见 src/agent/host.ts 的 sandboxPatchLines）。
 *
 * 真实 DSH 子进程 + 脚本化的模型。这里只覆盖「没装 bubblewrap」的机器；装了的机器上，沙箱照常工作由
 * agent.integration.test.ts 覆盖（它在没有 /usr/bin/bwrap 的机器上跳过）。
 */
const runtime = locateDshRuntime(findAppRoot());
const hasBwrap = !!findBwrap();

async function body(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
const textOf = (c: any): string => (typeof c === "string" ? c : Array.isArray(c) ? c.map((p) => (typeof p === "string" ? p : p?.text ?? "")).join("") : "");

describe("bwrap 探测", () => {
  it("起不来的运行器：给出它自己报的那一行；能跑的：没有问题", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "amb-bwrap-probe-"));
    try {
      const bad = path.join(dir, "bad");
      fs.writeFileSync(bad, "#!/bin/sh\necho 'bwrap: setting up uid map: Permission denied' >&2\nexit 1\n", { mode: 0o755 });
      const ok = path.join(dir, "ok");
      fs.writeFileSync(ok, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
      expect(await probeBwrap(bad)).toBe("bwrap: setting up uid map: Permission denied");
      expect(await probeBwrap(ok)).toBeUndefined();
      expect(await probeBwrap(path.join(dir, "missing"))).toMatch(/ENOENT/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe.skipIf(!runtime || hasBwrap || process.platform !== "linux")("没装 bubblewrap 的 Linux（真实 DSH）", () => {
  /** 起一个 App 和一个脚本化的模型：收到 RUNCMD 就在工作区里跑一条会留下文件的命令，拿到工具结果后原样复述 */
  async function boot(extraEnv: Record<string, string> = {}) {
    /** 模型收到的工具结果（命令的输出或拒绝原因） */
    const toolResults: string[] = [];
    const llm = await listen(async (req, res) => {
      const url = req.url?.split("?")[0] ?? "";
      if (url.endsWith("/models")) return void res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ object: "list", data: [{ id: "mock-agent", object: "model" }] }));
      const b = await body(req);
      const msgs: any[] = b.messages ?? [];
      let lastUser = -1;
      for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === "user" && /RUNCMD/.test(textOf(msgs[i].content))) { lastUser = i; break; }
      const tools = lastUser < 0 ? [] : msgs.slice(lastUser + 1).filter((m) => m.role === "tool");
      const step = !b.tools || lastUser < 0
        ? { text: "标题" }
        : tools.length === 0
          ? { tool: { name: "bash", args: { description: "run", command: "echo SANDBOX-RAN-$((6*7)) | tee ran.txt" } } }
          : { text: `RESULT<<${textOf(tools.at(-1).content)}>>` };
      if (tools.length) toolResults.push(textOf(tools.at(-1).content));
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
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "amb-nobwrap-"));
    const app = new App(
      loadConfig({ dataDir, env: { AMB_MAGPIE_BASE_URL: llm.url + "/v1", AMB_MAGPIE_API_KEY: "gw-key", AMB_UI_PORT: "0", AMB_WEIXIN_API_BASE: "http://127.0.0.1:9", AMB_DEFAULT_MODEL: "mock-agent", ...extraEnv } }),
      { printQrToTerminal: false },
    );
    await app.start();
    const base = app.web!.url.replace(/\/+$/, "");
    return {
      app,
      dataDir,
      toolResults,
      chat: async (text: string) => {
        const r = await fetch(`${base}/amb/api/bots/default/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
        expect(r.status).toBe(200);
        return ((await r.json()) as { reply: string }).reply;
      },
      close: async () => {
        await app.stop();
        await llm.close();
        fs.rmSync(dataDir, { recursive: true, force: true });
      },
    };
  }
  const patchOf = (dataDir: string) => fs.readFileSync(path.join(dataDir, "dsh", "default", "amb.patch.yml"), "utf8");

  it("默认：沙箱里的命令被拒绝并说明原因，没有换成 Landlock 照跑，工作区里没有留下文件", async () => {
    const t = await boot();
    try {
      expect(t.app.config.agent.allowLandlock).toBe(false);
      expect(t.app.store.getBot("default")!.settings.permission).not.toBe("full");
      const reply = await t.chat("RUNCMD please");
      // DSH 的拒绝（SANDBOX_UNAVAILABLE）带着占位脚本报的那一行
      expect(t.toolResults.length).toBeGreaterThan(0);
      expect(t.toolResults[0]).toContain("refusing to run the command unconfined");
      expect(t.toolResults[0]).toContain(BWRAP_MISSING);
      expect(reply).toContain("bubblewrap is not installed");
      // 命令没有跑：没有它的输出，也没有它要写的文件
      expect(t.toolResults.join("\n")).not.toContain("SANDBOX-RAN-42");
      expect(fs.existsSync(path.join(t.dataDir, "workspaces", "default", "ran.txt"))).toBe(false);
      // 补丁里把运行器指定成了包装脚本；状态里写明沙箱用不了
      expect(patchOf(t.dataDir)).toMatch(/- id: sandbox\n {2}config:\n {4}runnerCommand: \[".*\/\.amb-bin\/bwrap"\]\n {4}runnerFailureSignatures: \["bwrap: "\]/);
      expect(t.app.agent.host("default").status()).toMatchObject({ sandboxUnavailable: BWRAP_MISSING });
      expect(t.app.agent.host("default").status().sandboxWeak).toBeUndefined();
    } finally {
      await t.close();
    }
  }, 120_000);

  it("AMB_ALLOW_LANDLOCK=1（官方 Docker 镜像）：命令照旧在 Landlock 里跑，状态里写明是弱沙箱", async () => {
    const t = await boot({ AMB_ALLOW_LANDLOCK: "1" });
    try {
      expect(t.app.config.agent.allowLandlock).toBe(true);
      await t.chat("RUNCMD please");
      expect(t.toolResults[0]).toContain("SANDBOX-RAN-42");
      expect(fs.readFileSync(path.join(t.dataDir, "workspaces", "default", "ran.txt"), "utf8").trim()).toBe("SANDBOX-RAN-42");
      // 不指定运行器：沿用 DSH 自己的顺序
      expect(patchOf(t.dataDir)).not.toContain("- id: sandbox\n");
      expect(patchOf(t.dataDir)).not.toContain("runnerCommand");
      expect(t.app.agent.host("default").status()).toMatchObject({ sandboxWeak: BWRAP_MISSING });
      expect(t.app.agent.host("default").status().sandboxUnavailable).toBeUndefined();
    } finally {
      await t.close();
    }
  }, 120_000);
});
