/**
 * 消息图片用作生图参考（PRD 2026-11-23）：能力接口的三态解析与时效、发送条件的优先级与限制交集、按编码构建请求、
 * 先记录再提交与防重、受理接口的门槛（自定义 Key、换账号、能力修订、纯图片型号）、宿主直接执行与交付。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { App } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { mockOpenAI } from "./helpers.js";
import { normalizedSize } from "../src/attachments/limits.js";
import { sniffImage } from "../src/attachments/sniff.js";
import { ModelCapabilities, parseCapabilities, type CapsSnapshot, type ModelCaps } from "../src/tools/media/capabilities.js";
import { modelVerdict, referenceVerdict, requestBytes, type RefItem } from "../src/imagegen/reference.js";
import { buildDirectRequest, parseDirectResponse } from "../src/tools/media/direct.js";
import { MediaError, MediaService, MediaUnknownError } from "../src/tools/media/index.js";
import { ImageGeneration, type GenerationPlan } from "../src/imagegen/generate.js";
import { ApprovalCenter } from "../src/agent/approvals.js";
import { Store } from "../src/store/db.js";
import { Attachments } from "../src/attachments/service.js";

function png(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(height * (1 + width * 4), 0x80);
  for (let y = 0; y < height; y++) raw[y * (1 + width * 4)] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const NOW = 1_800_000_000_000;
const MODELS: any[] = [
  {
    id: "gpt-image-2", authorized: true, available: true,
    capabilities: { chat: "unsupported", vision: "unsupported", image_generation: "supported", reference_images: "supported" },
    image_generation: { endpoint: "images" },
    reference_images: { encoding: "images_json", max_images: 2, formats: ["png", "jpeg"], max_image_bytes: 20_000_000, max_request_bytes: 64_000_000, dimensions: { min_edge: 4, max_edge: 8000, min_aspect_ratio: 0.125, max_aspect_ratio: 8 } },
  },
  { id: "flux-text", authorized: true, available: true, capabilities: { chat: "unsupported", image_generation: "supported", reference_images: "unsupported" }, image_generation: { endpoint: "images" } },
  { id: "gpt-4o-mock", authorized: true, available: true, capabilities: { chat: "supported", vision: "supported", image_generation: "unsupported", reference_images: "unsupported" } },
  { id: "mystery", authorized: true, available: true, capabilities: { chat: "supported", image_generation: "yes", reference_images: 1 } },
  { id: "half-limits", authorized: true, available: true, capabilities: { image_generation: "supported", reference_images: "supported" }, reference_images: { encoding: "images_json", max_images: 0, formats: ["png"], max_image_bytes: "none", max_request_bytes: "none", dimensions: "none" } },
  { id: "future-enc", authorized: true, available: true, capabilities: { image_generation: "supported", reference_images: "supported" }, reference_images: { encoding: "images_v9", max_images: 4, formats: ["png"], max_image_bytes: "none", max_request_bytes: "none", dimensions: "none" } },
  { id: "revoked", authorized: false, available: true, capabilities: { image_generation: "supported", reference_images: "supported" } },
];
const snapshot = (models = MODELS, extra: Record<string, unknown> = {}) => parseCapabilities({ success: true, data: { schema_version: 1, line: "global", expires_in: 600, models, ...extra } }, { line: "global", account: "acct-1", now: NOW })!;
const item = (w: number, h: number, bytes = 1000, mime = "image/png"): RefItem => ({ kind: "image", mime, width: w, height: h, storedBytes: bytes });

describe("能力接口的解析（R1）", () => {
  it("三态分开：明确支持 / 不支持，看不懂的值算未知；限制里 0 不当成 0 张或无限", () => {
    const s = snapshot();
    expect(s.status).toBe("ok");
    expect(s.expiresAt).toBe(NOW + 600_000);
    const img = s.models.get("gpt-image-2")!;
    expect(img).toMatchObject({ chat: "unsupported", generation: "supported", reference: "supported", generationEndpoint: "images", line: "global" });
    expect(img.referenceSpec).toMatchObject({ encoding: "images_json", maxImages: { value: 2 }, formats: ["png", "jpeg"], dimensions: { minEdge: 4, maxEdge: 8000, minAspect: 0.125, maxAspect: 8 } });
    expect(s.models.get("mystery")).toMatchObject({ generation: "unknown", reference: "unknown", referenceSpec: undefined });
    expect(s.models.get("half-limits")!.referenceSpec).toMatchObject({ maxImages: undefined, maxImageBytes: "none", dimensions: "none" });
  });

  it("版本不对、线路不对、不是对象：整份不用；别的线路的条目不收", () => {
    expect(parseCapabilities({ schema_version: 2, models: [] }, { line: "global", account: "a", now: NOW })).toBeUndefined();
    expect(parseCapabilities({ schema_version: 1, line: "cn", models: [] }, { line: "global", account: "a", now: NOW })).toBeUndefined();
    expect(parseCapabilities("<html>", { line: "global", account: "a", now: NOW })).toBeUndefined();
    const s = snapshot([{ ...MODELS[0], line: "cf" }, MODELS[1]]);
    expect([...s.models.keys()]).toEqual(["flux-text"]);
  });

  it("缓存：过期后重新取；取失败时有旧的标成过期、没有的标成失败；404 算未知；换账户不用旧的", async () => {
    let now = NOW;
    let account = "acct-1";
    const replies: Array<"ok" | "fail" | "404"> = ["ok", "fail", "404"];
    let calls = 0;
    const caps = new ModelCapabilities({
      account: () => account,
      line: () => "global",
      now: () => now,
      fetch: async () => {
        calls++;
        const r = replies.shift();
        if (r === "fail") throw new Error("ECONNRESET");
        if (r === "404") return { ok: false, reason: "unsupported" };
        return { ok: true, json: { schema_version: 1, line: "global", expires_in: 60, models: MODELS } };
      },
    });
    expect(caps.peek().status).toBe("loading");
    expect((await caps.get()).status).toBe("ok");
    expect((await caps.get()).status).toBe("ok");
    expect(calls).toBe(1);
    now += 61_000;
    expect(caps.peek().status).toBe("stale");
    expect((await caps.get()).status).toBe("stale");
    account = "acct-2";
    expect(caps.peek().status).toBe("loading");
    expect((await caps.get()).status).toBe("unknown");
    account = "";
    expect((await caps.get()).status).toBe("unknown");
  });
});

describe("发送条件（R2–R5）", () => {
  const s = snapshot();
  const m = (id: string) => s.models.get(id);

  it("优先级：未授权 → 能力加载 / 未知 → 不支持生图 / 参考 / 适配 → 数量、格式、尺寸、大小 → 缺文字", () => {
    expect(modelVerdict(s, undefined).code).toBe("ref_unauthorized");
    expect(modelVerdict(s, m("revoked")).code).toBe("ref_unauthorized");
    expect(modelVerdict({ ...s, status: "failed" }, m("gpt-image-2")).code).toBe("ref_caps_failed");
    expect(modelVerdict({ ...s, status: "stale" }, m("gpt-image-2")).code).toBe("ref_caps_stale");
    expect(modelVerdict({ ...s, status: "loading" }, m("gpt-image-2")).code).toBe("ref_loading");
    expect(modelVerdict({ ...s, status: "unknown" }, m("gpt-image-2")).code).toBe("ref_caps_unknown");
    expect(modelVerdict(s, m("gpt-4o-mock")).code).toBe("ref_no_generation");
    expect(modelVerdict(s, m("flux-text")).code).toBe("ref_no_reference");
    expect(modelVerdict(s, m("mystery")).code).toBe("ref_caps_unknown");
    expect(modelVerdict(s, m("half-limits")).code).toBe("ref_limits_unknown");
    expect(modelVerdict(s, m("future-enc")).code).toBe("ref_adapter");
    expect(modelVerdict(s, m("gpt-image-2")).code).toBe("");
    // 同时有多个问题时只报最前面的那个
    expect(referenceVerdict(s, m("flux-text"), [item(1, 1, 1, "image/webp"), { ...item(1, 1), kind: "text" }], "").code).toBe("ref_no_reference");
  });

  it("型号上限和本机 4 张取交集；还在处理的图片也占数量；混入别的文件直接拦下", () => {
    const img = m("gpt-image-2");
    expect(referenceVerdict(s, img, [item(100, 100), item(100, 100)], "猫").code).toBe("");
    expect(referenceVerdict(s, img, [item(100, 100), item(100, 100), item(100, 100)], "猫")).toEqual({ code: "ref_count", count: 2 });
    expect(referenceVerdict(s, img, [item(100, 100), item(100, 100)], "猫", { images: 1, other: 0 })).toEqual({ code: "ref_count", count: 2 });
    expect(referenceVerdict(s, img, [item(100, 100)], "猫", { images: 0, other: 1 }).code).toBe("ref_other_files");
    const none = snapshot([{ ...MODELS[0], reference_images: { ...MODELS[0].reference_images, max_images: "none" } }]);
    expect(referenceVerdict(none, none.models.get("gpt-image-2"), [1, 2, 3, 4, 5].map(() => item(100, 100)), "猫")).toEqual({ code: "ref_local_count", count: 4 });
  });

  it("格式、每边、宽高比、单张字节、整次请求（Base64 膨胀）分别核对；文字只有空白算没写", () => {
    const img = m("gpt-image-2");
    expect(referenceVerdict(s, img, [item(100, 100, 10, "image/webp")], "猫").code).toBe("ref_format");
    expect(referenceVerdict(s, img, [item(2, 100)], "猫")).toMatchObject({ code: "ref_limit", limit: { kind: "edge", min: 4, max: 8000 } });
    expect(referenceVerdict(s, img, [item(1000, 100)], "猫")).toMatchObject({ code: "ref_limit", limit: { kind: "aspect" } });
    expect(referenceVerdict(s, img, [item(100, 100, 21_000_000)], "猫")).toMatchObject({ code: "ref_limit", limit: { kind: "bytes", max: 20_000_000 } });
    // 两张各 19 MB：原始字节 38 MB 没超 64 MB，Base64 后约 50.7 MB 也没超；把上限收到 45 MB 就超了
    const tight = snapshot([{ ...MODELS[0], reference_images: { ...MODELS[0].reference_images, max_request_bytes: 45_000_000 } }]);
    expect(referenceVerdict(s, img, [item(100, 100, 19_000_000), item(100, 100, 19_000_000)], "猫").code).toBe("");
    expect(referenceVerdict(tight, tight.models.get("gpt-image-2"), [item(100, 100, 19_000_000), item(100, 100, 19_000_000)], "猫")).toMatchObject({ code: "ref_limit", limit: { kind: "request" } });
    expect(requestBytes("images_json", [{ mime: "image/png", storedBytes: 3_000_000 }], "", "m")).toBeGreaterThan(4_000_000);
    expect(requestBytes("images_multipart", [{ mime: "image/png", storedBytes: 3_000_000 }], "", "m")).toBeLessThan(3_100_000);
    expect(referenceVerdict(s, img, [item(100, 100)], "  \n ").code).toBe("ref_no_text");
  });
});

describe("按编码构建请求（R4 技术前提 2）", () => {
  const images = [{ data: Buffer.from("aaa"), mime: "image/png" }, { data: Buffer.from("bbb"), mime: "image/jpeg" }];
  it("Images JSON 编辑、multipart、Gemini 内容块、纯文字各自正确编码，顺序不变", async () => {
    const json = buildDirectRequest({ model: "gpt-image-2", line: "global", mode: "reference", encoding: "images_json", prompt: "换成水彩", images });
    expect(json).toMatchObject({ path: "/images/edits", json: { model: "gpt-image-2", prompt: "换成水彩", images: [{ image_url: "data:image/png;base64,YWFh" }, { image_url: "data:image/jpeg;base64,YmJi" }] } });
    const form = buildDirectRequest({ model: "m", line: "global", mode: "reference", encoding: "images_multipart", prompt: "p", images });
    expect("form" in form && form.path).toBe("/images/edits");
    const parts = (form as { form: FormData }).form.getAll("image[]") as File[];
    expect(parts.map((f) => [f.name, f.type])).toEqual([["reference-1.png", "image/png"], ["reference-2.jpg", "image/jpeg"]]);
    expect(Buffer.from(await parts[1].arrayBuffer()).toString()).toBe("bbb");
    const gem = buildDirectRequest({ model: "gemini-img", line: "global", mode: "reference", encoding: "gemini_native", prompt: "p", images });
    expect(gem).toMatchObject({ path: "/models/gemini-img:generateContent", json: { contents: [{ role: "user", parts: [{ text: "p" }, { inline_data: { mime_type: "image/png", data: "YWFh" } }, { inline_data: { mime_type: "image/jpeg", data: "YmJi" } }] }] } });
    expect(buildDirectRequest({ model: "flux", line: "global", mode: "text", encoding: "images", prompt: "一只猫", images: [] })).toEqual({ path: "/images/generations", json: { model: "flux", prompt: "一只猫" } });
    expect(() => buildDirectRequest({ model: "x", line: "global", mode: "reference", encoding: "images_v9" as never, prompt: "p", images })).toThrow();
  });

  it("解析：Images API 的 data[] 与 generateContent 的内容块；文字另取，思考过程不算", () => {
    expect(parseDirectResponse({ data: [{ b64_json: "AAA" }, { url: "https://x/y.png" }, {}] }).images).toEqual([{ b64: "AAA" }, { url: "https://x/y.png" }, {}]);
    const g = parseDirectResponse({ candidates: [{ content: { parts: [{ text: "想一想", thought: true }, { text: "这是一只猫" }, { inlineData: { mimeType: "image/png", data: "BBB" } }] } }] });
    expect(g).toEqual({ images: [{ b64: "BBB", mime: "image/png" }], text: "这是一只猫" });
  });
});

describe("先记录再提交、防重复（R6）", () => {
  let dir: string;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "amb-direct-"));
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
  const service = (respond: (url: string, init: RequestInit) => Response | Promise<Response>) => {
    const posts: Array<{ url: string; body: unknown }> = [];
    const media = new MediaService({
      baseUrl: () => "https://mf.test/v1",
      keyFor: () => "sk-test",
      headers: () => ({}),
      workspace: () => dir,
      sniff: (d) => sniffImage(d),
      fetchImpl: (async (url: string, init: RequestInit) => {
        posts.push({ url, body: typeof init.body === "string" ? JSON.parse(init.body) : init.body });
        return respond(url, init);
      }) as typeof fetch,
    });
    return { media, posts };
  };
  const job = (prompt = "画一只猫") => ({ model: "gpt-image-2", line: "global", mode: "reference" as const, encoding: "images_json" as const, prompt, images: [{ data: png(4, 4), mime: "image/png" }] });

  it("成功后同一个操作标识只取回原结果，不再 POST；空内容、解不开的不算图片", async () => {
    const good = png(8, 8).toString("base64");
    const { media, posts } = service(() => new Response(JSON.stringify({ data: [{ b64_json: good }, { b64_json: "" }, { b64_json: Buffer.from("not an image").toString("base64") }] }), { status: 200, headers: { "content-type": "application/json" } }));
    const r = await media.generateDirect("b", job(), "ref-ok-1");
    expect(r).toMatchObject({ missing: 2, undelivered: 0, replayed: false });
    expect(r.files).toHaveLength(1);
    expect(fs.existsSync(path.join(dir, r.files[0]))).toBe(true);
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe("https://mf.test/v1/images/edits");
    expect((posts[0].body as any).images[0].image_url).toMatch(/^data:image\/png;base64,/);
    const again = await media.generateDirect("b", job(), "ref-ok-1");
    expect(again).toMatchObject({ files: r.files, replayed: true });
    expect(posts).toHaveLength(1);
    // 同一个标识换了内容：拒绝，不提交
    await expect(media.generateDirect("b", job("换一句"), "ref-ok-1")).rejects.toBeInstanceOf(MediaError);
    expect(posts).toHaveLength(1);
  });

  it("5xx、断线：结果未知，记录留在提交中；之后同一标识也不再 POST", async () => {
    const { media, posts } = service(() => new Response("{}", { status: 502 }));
    await expect(media.generateDirect("b", job(), "ref-502")).rejects.toBeInstanceOf(MediaUnknownError);
    await expect(media.generateDirect("b", job(), "ref-502")).rejects.toBeInstanceOf(MediaUnknownError);
    expect(posts).toHaveLength(1);
    const net = service(() => Promise.reject(new TypeError("fetch failed")));
    await expect(net.media.generateDirect("b", job(), "ref-net")).rejects.toBeInstanceOf(MediaUnknownError);
    await expect(net.media.generateDirect("b", job(), "ref-net")).rejects.toBeInstanceOf(MediaUnknownError);
    expect(net.posts).toHaveLength(1);
  });

  it("上游明确拒绝（4xx）：脱敏后的原因，不自动重试", async () => {
    const { media, posts } = service(() => new Response(JSON.stringify({ error: { message: "safety system rejected; key sk-abcdef1234567890" } }), { status: 400 }));
    const e = await media.generateDirect("b", job(), "ref-400").catch((x) => x);
    expect(e).toBeInstanceOf(MediaError);
    expect(e).not.toBeInstanceOf(MediaUnknownError);
    expect(e.message).toContain("safety system rejected");
    expect(e.message).not.toContain("sk-abcdef1234567890");
    await expect(media.generateDirect("b", job(), "ref-400")).rejects.toBeInstanceOf(MediaError);
    expect(posts).toHaveLength(1);
  });
});

describe("宿主直接执行（R6、R7）", () => {
  let dir: string, store: Store, atts: Attachments, approvals: ApprovalCenter;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "amb-gen-"));
    store = new Store(":memory:");
    store.createBot({ id: "b", name: "b", defaultModel: "gpt-image-2" });
    store.ensureConversation("b", "web", "console", "控制台");
    atts = new Attachments(store, path.join(dir, "att"));
    approvals = new ApprovalCenter(store);
    fs.mkdirSync(path.join(dir, "ws"), { recursive: true });
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  const out = () => {
    const ops: any[] = [];
    return { ops, apply: async (op: any) => void ops.push(op) };
  };
  const make = (o: { account?: () => string; confirm?: "auto" | "always"; snap?: () => CapsSnapshot; result?: () => Promise<any>; usd?: number }) => {
    const calls: any[] = [];
    const snap = o.snap ?? (() => snapshot());
    const caps = { get: async () => snap(), peek: () => snap() } as unknown as ModelCapabilities;
    const media = {
      generateDirect: async (botId: string, job: any, id: string) => {
        calls.push({ botId, job, id });
        if (o.result) return o.result();
        fs.mkdirSync(path.join(dir, "ws", "media"), { recursive: true });
        fs.writeFileSync(path.join(dir, "ws", "media", "image-1.png"), png(2, 2));
        return { files: ["media/image-1.png"], missing: 0, undelivered: 0, text: "", replayed: false };
      },
      imageModel: async () => ({ id: "flux-text", price: `$${o.usd ?? 0.04}/张`, cost: { per: "image", usd: o.usd ?? 0.04 } }),
    } as unknown as MediaService;
    const gen = new ImageGeneration({ store, media, caps, attachments: atts, approvals, workspace: () => path.join(dir, "ws"), account: o.account ?? (() => "acct-1"), confirm: () => o.confirm ?? "auto" });
    return { gen, calls };
  };
  const plan = (over: Partial<GenerationPlan> = {}): GenerationPlan => ({
    botId: "b", conversationId: "b:web:console", operationId: `gen-${crypto.randomBytes(6).toString("hex")}`, account: "acct-1", model: "flux-text", line: "global",
    mode: "text", encoding: "images", prompt: "一只猫", refs: [], capsRevision: snapshot().revision, ...over,
  });

  it("纯文字：用选的那个型号直接走图片接口，结果作为文件交在原对话；只返回图片时如实说明", async () => {
    const { gen, calls } = make({});
    const o = out();
    await gen.run(plan(), o, new AbortController().signal);
    expect(calls).toHaveLength(1);
    expect(calls[0].job).toMatchObject({ model: "flux-text", mode: "text", encoding: "images", prompt: "一只猫", images: [] });
    expect(o.ops.find((x) => x.type === "file")?.path).toBe(path.join(dir, "ws", "media", "image-1.png"));
    const last = store.listMessages("b:web:console").at(-1)!;
    expect(last.content).toBe("已取得图片；本次仅返回图片，未执行额外文字或文件任务。");
    expect(last.files).toEqual([path.join(dir, "ws", "media", "image-1.png")]);
  });

  it("账户换了、能力修订变了：不提交，说明原因；预计超过 0.5 美元先问，批准后才提交", async () => {
    const changed = make({ account: () => "acct-2" });
    await changed.gen.run(plan(), out(), new AbortController().signal);
    expect(changed.calls).toHaveLength(0);
    expect(store.listMessages("b:web:console").at(-1)!.content).toContain("生成条件已变化");
    const moved = make({ snap: () => snapshot(MODELS.slice(1)) });
    await moved.gen.run(plan(), out(), new AbortController().signal);
    expect(moved.calls).toHaveLength(0);

    const costly = make({ usd: 0.8 });
    const o = out();
    const p = plan();
    const running = costly.gen.run(p, o, new AbortController().signal);
    for (let i = 0; i < 100 && !o.ops.some((x) => x.type === "interactive"); i++) await new Promise((r) => setTimeout(r, 10));
    const card = o.ops.find((x) => x.type === "interactive");
    expect(card).toBeTruthy();
    expect(costly.calls).toHaveLength(0);
    const row = store.getApproval(card.requestId)!;
    expect(row.payload).toContain("flux-text");
    approvals.answer(row.id, { answers: [{ id: "model", selected: ["生成"] }] }, "web");
    await running;
    expect(costly.calls).toHaveLength(1);
  });

  it("结果未知、部分取得、没有有效图片：各说实话，不自动重试", async () => {
    const unknown = make({ result: async () => { throw new MediaUnknownError("x"); } });
    await unknown.gen.run(plan(), out(), new AbortController().signal);
    expect(store.listMessages("b:web:console").at(-1)!.content).toBe("⚠️ 生图结果尚未确认，已停止自动重试，请先核对原请求记录。");
    const partial = make({ result: async () => ({ files: ["media/image-1.png"], missing: 1, undelivered: 0, text: "", replayed: false }) });
    await partial.gen.run(plan(), out(), new AbortController().signal);
    expect(store.listMessages("b:web:console").at(-1)!.content).toBe("已取得1张图片，其余1张未取得；未自动重新生成。");
    const none = make({ result: async () => ({ files: [], missing: 1, undelivered: 0, text: "", replayed: false }) });
    await none.gen.run(plan(), out(), new AbortController().signal);
    expect(store.listMessages("b:web:console").at(-1)!.content).toBe("这次没有取得有效图片，没有自动重试。");
    expect(unknown.calls.length + partial.calls.length + none.calls.length).toBe(3);
  });

  it("提交后停止：只停止等待（说明可能仍在计费），迟到的结果仍交回原对话", async () => {
    let finish!: (v: any) => void;
    const slow = make({ result: () => new Promise((r) => (finish = r)) });
    const ac = new AbortController();
    const running = slow.gen.run(plan(), out(), ac.signal);
    for (let i = 0; i < 100 && !slow.calls.length; i++) await new Promise((r) => setTimeout(r, 5));
    ac.abort();
    await running;
    expect(store.listMessages("b:web:console").at(-1)!.content).toBe("已停止等待；原请求可能仍在处理或计费。");
    finish({ files: ["media/image-1.png"], missing: 0, undelivered: 0, text: "", replayed: false });
    await new Promise((r) => setTimeout(r, 20));
    expect(store.listMessages("b:web:console").at(-1)!.files).toEqual([path.join(dir, "ws", "media", "image-1.png")]);
    expect(slow.calls).toHaveLength(1);
  });
});

describe("受理接口的门槛（R1–R6）", () => {
  let app: App, llm: Awaited<ReturnType<typeof mockOpenAI>>, root: string, base: string;
  let ctx: { accountLogin: boolean; account: string; snap: CapsSnapshot; model: string };
  const ran: GenerationPlan[] = [];
  const id = () => crypto.randomBytes(9).toString("base64url");
  const api = async (p: string, init: RequestInit = {}) => {
    const res = await fetch(`${base}/amb/api${p}`, { ...init, headers: { ...(init.body && !(init.body instanceof Uint8Array) ? { "content-type": "application/json" } : {}), ...(init.headers ?? {}) } });
    return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
  };
  const state = (bot: string) => api(`/bots/${bot}/attachments/state`).then((r) => r.body);
  const addImage = async (bot: string, w = 8, h = 6) => {
    const s = await state(bot);
    const data = png(w, h);
    const r = await api(`/bots/${bot}/attachments/batches`, { method: "POST", body: JSON.stringify({ protocol: 1, segment: s.segment, batch: id(), items: [{ clientId: id(), name: "a.png", mime: "image/png", size: data.length }] }) });
    const att = r.body.items[0].id;
    const put = (what: string, d: Buffer) => api(`/bots/${bot}/attachments/${att}/${what}`, { method: "PUT", body: new Uint8Array(d), headers: { "content-type": "application/octet-stream" } });
    await put("content", data);
    const n = normalizedSize(w, h);
    return (await put("rendition", png(n.width, n.height))).body.item;
  };
  const addText = async (bot: string) => {
    const s = await state(bot);
    const data = Buffer.from("说明");
    const r = await api(`/bots/${bot}/attachments/batches`, { method: "POST", body: JSON.stringify({ protocol: 1, segment: s.segment, batch: id(), items: [{ clientId: id(), name: "a.md", mime: "", size: data.length }] }) });
    await api(`/bots/${bot}/attachments/${r.body.items[0].id}/content`, { method: "PUT", body: new Uint8Array(data), headers: { "content-type": "application/octet-stream" } });
  };
  const toggle = async (bot: string, on: boolean) => api(`/bots/${bot}/attachments/reference`, { method: "PUT", body: JSON.stringify({ on, segment: (await state(bot)).segment }) });
  const send = async (bot: string, text: string, reference?: boolean, over: Record<string, unknown> = {}) => {
    const s = await state(bot);
    return api(`/bots/${bot}/chat/send`, { method: "POST", body: JSON.stringify({ version: 1, clientMessageId: id(), text, segment: s.segment, revision: s.revision, modelRevision: s.model.revision, attachments: s.items.map((a: any) => ({ id: a.id, version: a.version })), ...(reference ? { reference: { on: true, revision: s.reference.revision } } : {}), ...over }) });
  };

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amb-imgref-"));
    llm = await mockOpenAI({ models: ["gpt-4o-mock"], reply: () => "好的" });
    app = new App(loadConfig({ dataDir: root, env: { AMB_MAGPIE_BASE_URL: llm.url + "/v1", AMB_MAGPIE_API_KEY: "test-key", AMB_UI_PORT: "0", AMB_AGENT: "off", AMB_WEIXIN_API_BASE: "http://127.0.0.1:9", AMB_DEFAULT_MODEL: "gpt-4o-mock" } }), { printQrToTerminal: false });
    await app.start();
    for (const b of ["r1", "r2", "r3", "r4", "r5"]) app.store.createBot({ id: b, name: b, defaultModel: "gpt-image-2" });
    base = app.web!.url.replace(/\/$/, "");
    ctx = { accountLogin: true, account: "acct-1", snap: snapshot(), model: "gpt-image-2" };
    // 账号登录与能力接口由测试替身给（真实的走 Modelflare 的 connected-app 接口）
    (app as any).referenceContext = async (botId: string, conv: string) => {
      const model = app.store.getConversation(conv)?.model || ctx.model;
      return { model, bare: model, accountLogin: ctx.accountLogin, account: ctx.account, snap: ctx.accountLogin ? ctx.snap : undefined, caps: ctx.accountLogin ? ctx.snap.models.get(model) : undefined };
    };
    (app.runtime as any).opts.imageGen = {
      plan: async () => undefined,
      run: async (p: GenerationPlan, out: any) => {
        ran.push(p);
        await out.apply({ type: "text", text: "ok" });
      },
    };
  });
  afterAll(async () => { await app?.stop(); await llm?.close(); fs.rmSync(root, { recursive: true, force: true }); });

  it("账号登录有图才可开；开着时按真实能力核对，通过后受理：参考序号、型号随消息存下，计划按显示顺序绑定，开关重置", async () => {
    let s = await state("r1");
    expect(s.reference).toMatchObject({ available: true, on: false, model: { id: "gpt-image-2", pure: true } });
    expect(s.reference.imageModels).toEqual(["flux-text", "gpt-image-2"]);
    expect((await toggle("r1", true)).status).toBe(409);
    const a = await addImage("r1");
    const b = await addImage("r1", 10, 10);
    expect((await toggle("r1", true)).body.reference).toMatchObject({ on: true, verdict: { code: "" } });
    // 开着却按普通附件发：不受理
    expect((await send("r1", "换成水彩")).body.code).toBe("changed");
    // 能力修订对不上（直接请求、界面过时）：不受理
    expect((await send("r1", "换成水彩", false, { reference: { on: true, revision: "stale" } })).body.code).toBe("changed");
    expect((await send("r1", "   ", true)).body.code).toBe("ref_no_text");
    const r = await send("r1", "换成水彩", true);
    expect(r).toMatchObject({ status: 200, body: { status: "accepted" } });
    for (let i = 0; i < 100 && !ran.length; i++) await new Promise((x) => setTimeout(x, 10));
    expect(ran[0]).toMatchObject({ mode: "reference", model: "gpt-image-2", encoding: "images_json", prompt: "换成水彩", account: "acct-1", refs: [{ id: a.id, version: a.version }, { id: b.id, version: b.version }] });
    const user = (await api("/bots/r1/chat")).body.messages.find((m: any) => m.role === "user");
    expect(user.generation).toEqual({ model: "gpt-image-2", mode: "reference" });
    expect(user.attachments.map((x: any) => x.ref)).toEqual([1, 2]);
    s = await state("r1");
    expect(s.items).toEqual([]);
    expect(s.reference.on).toBe(false);
  });

  it("型号不支持参考、超过型号上限：开关保持开着，不受理；关掉后回到普通附件校验", async () => {
    app.store.ensureConversation("r2", "web", "console", "控制台");
    app.store.setConversationModel("r2:web:console", "flux-text");
    await addImage("r2");
    await toggle("r2", true);
    let s = await state("r2");
    expect(s.reference).toMatchObject({ on: true, verdict: { code: "ref_no_reference" } });
    expect((await send("r2", "猫", true)).body.code).toBe("ref_no_reference");
    app.store.setConversationModel("r2:web:console", "gpt-image-2");
    await addImage("r2");
    await addImage("r2");
    s = await state("r2");
    expect(s.reference).toMatchObject({ on: true, verdict: { code: "ref_count", count: 2 } });
    const r = await send("r2", "猫", true);
    expect(r.body).toMatchObject({ code: "ref_count", count: 2 });
    expect(r.body.error).toBe("当前模型最多支持2张参考图，请减少图片或切换模型。");
    // 关掉：纯图片型号带普通图片，要开参考或换能处理图片的型号（不悄悄忽略图片）
    await toggle("r2", false);
    expect((await send("r2", "猫")).body.code).toBe("img_model_images");
    await addText("r2");
    expect((await send("r2", "猫")).body.code).toBe("img_model_files");
    await toggle("r2", true);
    expect((await state("r2")).reference.verdict.code).toBe("ref_other_files");
  });

  it("换成自定义 Key：开关清掉、图文保留，提示一次；直接请求也拦下。换账号：重置并提示重新校验", async () => {
    await addImage("r3");
    await toggle("r3", true);
    ctx.accountLogin = false;
    let s = await state("r3");
    expect(s.reference).toMatchObject({ available: false, on: false, notice: "ref_custom_key" });
    expect(s.items).toHaveLength(1);
    expect((await toggle("r3", true)).body.code).toBe("ref_custom_key");
    expect((await send("r3", "猫", true, { reference: { on: true, revision: "" } })).body.code).toBe("ref_custom_key");
    ctx.accountLogin = true;
    s = await state("r3");
    expect(s.reference.notice).toBe("");
    await toggle("r3", true);
    ctx.account = "acct-2";
    s = await state("r3");
    expect(s.reference).toMatchObject({ on: false, notice: "ref_account" });
    ctx.account = "acct-1";
  });

  it("能力读不到 / 过期：不说成不支持，也不放行", async () => {
    await addImage("r4");
    await toggle("r4", true);
    const keep = ctx.snap;
    ctx.snap = { ...keep, status: "stale" };
    expect((await state("r4")).reference.verdict.code).toBe("ref_caps_stale");
    ctx.snap = { ...keep, status: "failed", models: new Map<string, ModelCaps>() };
    expect((await state("r4")).reference.verdict.code).toBe("ref_caps_failed");
    expect((await send("r4", "猫", true)).body.code).toBe("ref_caps_failed");
    ctx.snap = keep;
  });
});
