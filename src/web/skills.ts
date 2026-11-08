import type http from "node:http";
import { readSkillZip, SkillError, SKILL_LIMITS } from "../skills/archive.js";
import type { UserSkills } from "../skills/service.js";

async function readZip(req: http.IncomingMessage): Promise<Buffer> {
  if (!String(req.headers["content-type"] ?? "").split(";")[0].trim().match(/^(application\/zip|application\/octet-stream)$/)) throw new SkillError("invalid_zip", 415);
  if (Number(req.headers["content-length"]) > SKILL_LIMITS.zip) { req.resume(); throw new SkillError("too_large", 413); }
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > SKILL_LIMITS.zip) throw new SkillError("too_large", 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** 沿用 /amb/api 的令牌、跨站预检和代理进程访问检查。ZIP 按二进制上传，不经过 JSON/base64。 */
export async function skillsApi(req: http.IncomingMessage, res: http.ServerResponse, url: URL, botId: string, tail: string[], skills: UserSkills, readJson: (req: http.IncomingMessage) => Promise<any>, changed: () => void): Promise<void> {
  const send = (status: number, data: unknown) => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(data));
  };
  try {
    if (req.method === "GET" && !tail.length) return send(200, { skills: skills.list(botId) });
    if (req.method === "GET" && tail.length === 1) return send(200, { skill: skills.detail(botId, tail[0]) });
    if (req.method === "POST" && (!tail.length || (tail.length === 1 && tail[0] === "preview"))) {
      const pkg = await readSkillZip(await readZip(req));
      if (tail.length) return send(200, { skill: skills.preview(botId, pkg) });
      skills.install(botId, pkg, url.searchParams.get("replaces"));
    } else if (req.method === "PUT" && tail.length === 1) {
      const body = await readJson(req);
      if (typeof body?.enabled !== "boolean") throw new SkillError("invalid_skill");
      skills.setEnabled(botId, tail[0], body.enabled);
    } else if (req.method === "DELETE" && tail.length === 1) skills.remove(botId, tail[0]);
    else throw new SkillError("not_found", 404);
    changed();
    send(200, { skills: skills.list(botId) });
  } catch (e) {
    if (!(e instanceof SkillError)) throw e;
    send(e.status, { error: e.code, code: e.code });
  }
}
