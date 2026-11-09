import { describe, expect, it } from "vitest";
import { displayModel as serverLabel, parsePlaygroundModel } from "../src/providers/newapi.js";
// @ts-expect-error Browser module
import { displayModel, displayModelText, shortModel } from "../ui/lib/models.js";

describe("model display labels", () => {
  it.each([
    ["modelflare/Okinto/%E5%9B%BD%E6%A8%A1/gpt-image-2.5", "gpt-image-2.5 · 国模"],
    ["mfb-bot/Okinto/%E5%B8%A6%2F%E6%96%9C%E6%9D%A0/vendor/model", "vendor/model · 带/斜杠"],
    ["modelflare/gpt-image-2.5", "gpt-image-2.5"],
    ["Okinto/%broken/model", "Okinto/%broken/model"],
    ["official-openai/gpt-5", "official-openai/gpt-5"],
  ])("formats %s consistently", (id, expected) => {
    expect(serverLabel(id)).toBe(expected);
    expect(displayModel(id)).toBe(expected);
  });
  it("keeps stored routing IDs intact and fixes old model strings in activity details", () => {
    const id = "modelflare/Okinto/%E5%9B%BD%E6%A8%A1/gpt-image-2.5";
    expect(shortModel(id)).toBe("gpt-image-2.5 · 国模");
    expect(parsePlaygroundModel(id)).toEqual({ group: "国模", model: "gpt-image-2.5" });
    expect(displayModelText('model: "' + id + '"')).toBe('model: "gpt-image-2.5 · 国模"');
    expect(displayModelText("https://example.com/Okinto/a/model")).toBe("https://example.com/Okinto/a/model");
  });
});
