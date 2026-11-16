import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SkillAvatars, imageType } from "../src/web/skill-avatars.js";

const PNG = (n: number) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16, n)]);
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function setup(responses: Array<() => Response | Promise<Response>>, opts: { now?: () => number } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "amb-avatars-"));
  dirs.push(dir);
  const calls: string[] = [];
  const fetchImpl = (async (url: string) => {
    calls.push(String(url));
    const next = responses.shift();
    if (!next) throw new Error("offline");
    return next();
  }) as unknown as typeof fetch;
  const avatars = new SkillAvatars({ dir, authors: () => ["affaan-m", "Kostja"], fetchImpl: () => fetchImpl, now: opts.now });
  return { dir, calls, avatars };
}

describe("技能库作者头像的本机缓存", () => {
  it("只认清单里的作者；读到的存到本机，下次直接给本机这份", async () => {
    const { calls, avatars, dir } = setup([() => new Response(PNG(1), { headers: { "content-type": "image/png" } })]);
    expect(await avatars.get("someone-else")).toBeNull();
    expect(await avatars.get("../etc")).toBeNull();
    const first = await avatars.get("affaan-m");
    expect(first?.type).toBe("image/png");
    expect(calls).toEqual(["https://github.com/affaan-m.png?size=128"]);
    expect(fs.existsSync(path.join(dir, "affaan-m.img"))).toBe(true);
    const again = await avatars.get("affaan-m");
    expect(again?.data.equals(PNG(1))).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("过期后先给旧图，同时在后台更新；取不到（断网、不是图片）时返回 null，不存坏文件", async () => {
    let now = Date.now();
    const { calls, avatars } = setup([
      () => new Response(PNG(1)),
      () => new Response(PNG(2)),
    ], { now: () => now });
    await avatars.get("Kostja");
    now += 8 * 24 * 3600_000;
    const stale = await avatars.get("Kostja");
    expect(stale?.data.equals(PNG(1))).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toHaveLength(2);
    now += 1000;
    expect((await avatars.get("kostja"))?.data.equals(PNG(2))).toBe(true);

    const offline = setup([]);
    expect(await offline.avatars.get("affaan-m")).toBeNull();
    const html = setup([() => new Response("<html>")]);
    expect(await html.avatars.get("affaan-m")).toBeNull();
    expect(fs.readdirSync(html.dir)).toEqual([]);
  });

  it("按文件头认图片格式", () => {
    expect(imageType(PNG(0))).toBe("image/png");
    expect(imageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe("image/jpeg");
    expect(imageType(Buffer.from("GIF89a....."))).toBe("image/gif");
    expect(imageType(Buffer.from("RIFF....WEBPVP8 "))).toBe("image/webp");
    expect(imageType(Buffer.from("<svg></svg>"))).toBeNull();
  });
});
