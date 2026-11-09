import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MediaService, imageRoute } from "../src/tools/media/index.js";

const workspaces: string[] = [];
afterEach(() => {
  for (const dir of workspaces.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function fixture(message: Record<string, unknown>, imageResponse?: () => Response) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "amb-image-formats-"));
  workspaces.push(workspace);
  const requests: Array<{ url: string; init?: RequestInit; body?: any }> = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.includes("/models?")) return Response.json({ data: [{ id: "gemini-3.1-flash-image-preview" }] });
    if (url.endsWith("/chat/completions")) return imageResponse ? imageResponse() : Response.json({ choices: [{ message }] });
    if (url === "https://cdn.example/result.png") return new Response("remote image", { headers: { "content-type": "image/png" } });
    throw new Error(`Unexpected request ${url}`);
  }) as typeof fetch;
  const media = new MediaService({ baseUrl: () => "https://api.example/v1", keyFor: () => "sk-private", headers: () => ({}), workspace: () => workspace, fetchImpl });
  return { workspace, requests, media };
}

describe("New API image response formats", () => {
  it.each([
    { content: "![result](data:image/png;base64,aW1hZ2U=)" },
    { content: [{ type: "image_url", image_url: { url: "data:image/png;base64,aW1hZ2U=" } }] },
    { content: "done", images: [{ type: "image_url", image_url: { url: "data:image/png;base64,aW1hZ2U=" } }] },
    { content: [{ type: "image", image_url: "data:image/png;base64,aW1hZ2U=" }] },
  ])("saves a returned image and forces non-streaming for %j", async (message) => {
    const f = fixture(message);
    await f.media.run("bot", "image", { prompt: "cat" });
    const files = fs.readdirSync(path.join(f.workspace, "media"));
    expect(files).toHaveLength(1);
    expect(fs.readFileSync(path.join(f.workspace, "media", files[0]), "utf8")).toBe("image");
    expect(f.requests.find((r) => r.url.endsWith("/chat/completions"))?.body).toMatchObject({ model: "gemini-3.1-flash-image-preview", stream: false });
  });

  it("downloads Markdown image URLs without sending the account key", async () => {
    const f = fixture({ content: "Here is your image: ![cat](https://cdn.example/result.png)" });
    await f.media.run("bot", "image", { prompt: "cat" });
    expect(new Headers(f.requests.find((r) => r.url.startsWith("https://cdn.example"))?.init?.headers).has("authorization")).toBe(false);
    const files = fs.readdirSync(path.join(f.workspace, "media"));
    expect(fs.readFileSync(path.join(f.workspace, "media", files[0]), "utf8")).toBe("remote image");
  });

  it("inlines reference images, overrides the model and stream, and removes duplicate results", async () => {
    const url = "data:image/png;base64,aW1hZ2U=";
    const f = fixture({ content: url, images: [{ image_url: { url } }] });
    fs.writeFileSync(path.join(f.workspace, "reference.png"), "reference");
    await f.media.run("bot", "image", { prompt: "cat", body: { model: "wrong", stream: true, messages: [{ role: "user", content: [{ type: "text", text: "cat" }, { type: "image_url", image_url: { url: "workspace:reference.png" } }] }] } });
    const body = f.requests.find((r) => r.url.endsWith("/chat/completions"))?.body;
    expect(body).toMatchObject({ model: "gemini-3.1-flash-image-preview", stream: false });
    expect(body.messages[0].content[1].image_url.url).toBe("data:image/png;base64,cmVmZXJlbmNl");
    expect(fs.readdirSync(path.join(f.workspace, "media"))).toHaveLength(1);
  });

  it.each([
    { content: "done", images: [{ url: "https://cdn.example/result.png" }] },
    { content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: "aW1hZ2U=" } }] },
  ])("accepts additional image part formats %j", async (message) => {
    const f = fixture(message); await f.media.run("bot", "image", { prompt: "cat" });
    expect(fs.readdirSync(path.join(f.workspace, "media"))).toHaveLength(1);
  });

  it("parses SSE image chunks even when the site streams despite stream:false", async () => {
    const events = [
      { choices: [{ delta: { content: "![cat](data:image/png;base64," } }] },
      { choices: [{ delta: { content: "aW1hZ2U=)" } }] },
    ];
    const f = fixture({}, () => new Response(events.map((e) => `data: ${JSON.stringify(e)}\r\n\r\n`).join("") + "data: [DONE]\r\n\r\n", { headers: { "content-type": "text/event-stream" } }));
    await f.media.run("bot", "image", { prompt: "cat" });
    const files = fs.readdirSync(path.join(f.workspace, "media"));
    expect(files).toHaveLength(1); expect(fs.readFileSync(path.join(f.workspace, "media", files[0]), "utf8")).toBe("image");
  });

  it("reports a text-only response as a failure", async () => {
    const f = fixture({ content: "I cannot generate that image." });
    await expect(f.media.run("bot", "image", { prompt: "cat" })).rejects.toThrow("gemini-3.1-flash-image-preview");
    expect(fs.existsSync(path.join(f.workspace, "media"))).toBe(false);
  });

  it("uses explicit endpoints before known image model families and ignores ordinary chat models", () => {
    expect(imageRoute("custom-model", ["image-generation"])).toBe("images");
    expect(imageRoute("gemini-3-pro-image-preview", ["image-generation", "openai"])).toBe("images");
    expect(imageRoute("gemini-3-pro-image-preview", ["gemini"])).toBe("gemini");
    expect(imageRoute("gemini-3-pro-image-preview", ["openai", "gemini"])).toBe("chat");
    expect(imageRoute("nano-banana-2.1", ["openai"])).toBe("chat");
    expect(imageRoute("grok-imagine-image-quality", ["openai"])).toBe("chat");
    expect(imageRoute("gpt-image-2.5")).toBe("images");
    expect(imageRoute("gpt-5.5", ["openai"])).toBeUndefined();
    expect(imageRoute("gemini-3-pro", ["gemini"])).toBeUndefined();
  });
});
