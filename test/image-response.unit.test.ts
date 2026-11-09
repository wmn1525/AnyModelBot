import { describe, expect, it } from "vitest";
import { imagePayload, imageSources } from "../src/tools/media/image-response.js";

const image = "data:image/png;base64,aW1hZ2U=";
describe("image response parser", () => {
  it("reads completed image events and ignores partial previews and echoed references", () => {
    const events = [
      { type: "image_generation.partial_image", b64_json: "cHJldmlldw==" },
      { type: "image_generation.completed", b64_json: "aW1hZ2U=" },
    ].map((event) => "data: " + JSON.stringify(event) + "\n\n").join("");
    expect(imageSources(imagePayload(": keepalive\n\n" + events + "data: [DONE]\n\n"))).toEqual([image]);
    expect(imageSources({ input: [{ image_url: image }], data: [] })).toEqual([]);
  });
  it("supports Responses output and native Gemini without duplicate files", () => {
    expect(imageSources({ output: [{ type: "image_generation_call", status: "completed", result: "aW1hZ2U=" }], candidates: [{ content: { parts: [{ inline_data: { mime_type: "image/png", data: "aW1hZ2U=" } }] } }] })).toEqual([image]);
  });
  it("does not silently accept malformed or failed streams", () => {
    expect(() => imagePayload("data: {broken}\n\n")).toThrow();
    expect(() => imagePayload('event: error\ndata: {"error":{"message":"quota exhausted"}}\n\n')).toThrow("quota exhausted");
    expect(() => imagePayload("<html>gateway error</html>")).toThrow();
  });
});
