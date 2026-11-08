import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MediaService, type MediaModel } from "../src/agent/media.js";

const model: MediaModel = { id: "video-test", kind: "video", route: "videos", requiresReference: false, price: "", priority: 1 };

describe("media receipts", () => {
  let workspace: string;
  beforeEach(() => { workspace = fs.mkdtempSync(path.join(os.tmpdir(), "amb-media-recovery-")); });
  afterEach(() => fs.rmSync(workspace, { recursive: true, force: true }));
  const service = (fetchImpl: typeof fetch) => new MediaService({ baseUrl: () => "https://example.invalid/v1", keyFor: () => "test-key", headers: () => ({}), workspace: () => workspace, fetchImpl, pollMs: 1, videoTimeoutMs: 1 });

  it("resumes the existing provider job after restart and reuses downloaded results", async () => {
    let posts = 0, downloads = 0;
    let ready = false;
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "POST") { posts++; return Response.json({ id: "provider-job" }); }
      if (String(url).endsWith("/content")) { downloads++; return new Response("actual media", { headers: { "content-type": "video/mp4" } }); }
      return Response.json({ status: ready ? "completed" : "in_progress" });
    }) as typeof fetch;
    const args = { request_id: "shot-01", prompt: "Ocean waves", model: model.id, seconds: 4 };
    await expect(service(fetcher).execute("bot", model, args)).rejects.toThrow(/相同 request_id/);
    expect(posts).toBe(1);
    ready = true;
    const recovered = await service(fetcher).recover("bot", "video", args);
    expect(recovered).toContain("media/video-");
    expect(posts).toBe(1);
    expect(downloads).toBe(1);
    expect(await service(fetcher).recover("bot", "video", args)).toBe(recovered);
    expect(downloads).toBe(1);
    const saved = recovered!.match(/media\/video-[\w-]+\.mp4/)![0];
    fs.unlinkSync(path.join(workspace, saved));
    expect(await service(fetcher).recover("bot", "video", args)).toContain("media/video-");
    expect(posts).toBe(1);
    expect(downloads).toBe(2);
    const receipt = fs.readFileSync(path.join(workspace, "media/.jobs/shot-01.json"), "utf8");
    expect(receipt).not.toContain("test-key");
    expect(receipt).not.toContain("Ocean waves");
  });

  it("reuses images and does not regenerate a deleted paid image automatically", async () => {
    let posts = 0;
    const fetcher = (async () => { posts++; return Response.json({ data: [{ b64_json: Buffer.from("image data").toString("base64") }] }); }) as typeof fetch;
    const imageModel: MediaModel = { ...model, id: "image-test", kind: "image", route: "images" };
    const args = { request_id: "image-once", prompt: "Fox", model: imageModel.id };
    const result = await service(fetcher).execute("bot", imageModel, args);
    expect(await service(fetcher).recover("bot", "image", args)).toBe(result);
    fs.unlinkSync(path.join(workspace, result.match(/media\/image-[\w-]+\.png/)![0]));
    await expect(service(fetcher).recover("bot", "image", args)).rejects.toThrow(/已丢失/);
    expect(posts).toBe(1);
  });

  it("keeps task identity after a download failure", async () => {
    let posts = 0, downloads = 0;
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "POST") { posts++; return Response.json({ task_id: "download-job" }); }
      if (String(url).endsWith("/content")) {
        if (++downloads === 1) throw new Error("connection dropped");
        return new Response("recovered", { headers: { "content-type": "video/mp4" } });
      }
      return Response.json({ status: "succeeded" });
    }) as typeof fetch;
    const args = { prompt: "Sunrise", request_id: "download-once", model: model.id };
    await expect(service(fetcher).execute("bot", model, args)).rejects.toThrow("connection dropped");
    expect(await service(fetcher).recover("bot", "video", args)).toContain("media/video-");
    expect(posts).toBe(1);
  });

  it("rejects changed inputs and never resubmits ambiguous requests", async () => {
    let posts = 0;
    const fetcher = (async () => { posts++; throw new Error("submission timeout"); }) as typeof fetch;
    const args = { prompt: "Clouds", request_id: "ambiguous", model: model.id };
    await expect(service(fetcher).execute("bot", model, args)).rejects.toThrow("submission timeout");
    await expect(service(fetcher).execute("bot", model, args)).rejects.toThrow(/结果未知/);
    await expect(service(fetcher).recover("bot", "video", { ...args, prompt: "Rain" })).rejects.toThrow(/不同/);
    expect(posts).toBe(1);
  });

  it("does not let task IDs write outside the journal or follow symlinks", async () => {
    const media = service((async () => { throw new Error("must not call provider"); }) as typeof fetch);
    await expect(media.execute("bot", model, { prompt: "x", request_id: "../../escape" })).rejects.toThrow(/格式/);
    fs.mkdirSync(path.join(workspace, "target"));
    fs.symlinkSync(path.join(workspace, "target"), path.join(workspace, "media"), "dir");
    await expect(media.execute("bot", model, { prompt: "x", request_id: "safe-id" })).rejects.toThrow(/路径/);
  });
});
