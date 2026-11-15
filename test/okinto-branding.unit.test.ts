import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { catalogs } from "../src/i18n/messages/index.js";
import { translations } from "../src/i18n/index.js";
// @ts-expect-error Shared release-check helper is plain JavaScript.
import { APP_LANGUAGES, assertLocaleBranding, legacyBrandValues } from "../scripts/lib/brand-copy.mjs";
const root = path.resolve(import.meta.dirname, "..");

describe("Okinto display branding", () => {
  it.each(APP_LANGUAGES as string[])("has no legacy brand in UI values for %s (keys stay compatible)", (lang: string) => {
    const dir = path.join(root, "ui/locales", lang);
    for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".js") && name !== "index.js")) {
      expect(() => assertLocaleBranding(fs.readFileSync(path.join(dir, file), "utf8"), `${lang}/${file}`)).not.toThrow();
    }
  });
  it("checks server messages in every language, including desktop dialogs and CLI output", () => {
    expect(legacyBrandValues(catalogs)).toEqual([]);
    expect(legacyBrandValues(translations)).toEqual([]);
  });
  it("does not mistake legacy namespace keys for user-facing values", () => {
    expect(legacyBrandValues({ modelflare: "Okinto", nested: { modelflareKeys: "Okinto models" } })).toEqual([]);
    expect(legacyBrandValues({ label: "Sign in to Modelflare" })).toHaveLength(1);
    expect(legacyBrandValues({ url: "https://modelflare.dev" })).toHaveLength(1);
  });
  it("uses fork update links, Okinto account labels and media descriptions", () => {
    const sidebar = fs.readFileSync(path.join(root, "ui/screens/sidebar.js"), "utf8");
    expect(sidebar).toContain('signedIn ? "Okinto"');
    expect(sidebar).not.toContain('"Modelflare"');
    for (const file of ["ui/screens/sidebar.js", "ui/components/whats-new.js"]) {
      const text = fs.readFileSync(path.join(root, file), "utf8");
      expect(text).toContain("https://github.com/wmn1525/AnyModelBot/releases");
      expect(text).not.toContain("https://github.com/modelflare-ai/AnyModelBot");
    }
    expect(fs.readFileSync(path.join(root, "dsh-runtime/plugins/amb-media.mjs"), "utf8")).not.toMatch(/modelflare/i);
  });
  it("checks every official bot manifest shipped in the built-in catalog", () => {
    for (const dir of fs.readdirSync(path.join(root, "bots"), { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
      const file = path.join(root, "bots", dir.name, "bot.json");
      if (fs.existsSync(file)) expect(legacyBrandValues(JSON.parse(fs.readFileSync(file, "utf8"))), dir.name).toEqual([]);
    }
  });
  it("keeps stored credentials, provider IDs and API routes compatible", () => {
    expect(fs.readFileSync(path.join(root, "src/account/vault.ts"), "utf8")).toContain('"modelflare-account.json"');
    expect(fs.readFileSync(path.join(root, "src/providers/modelflare.ts"), "utf8")).toContain('"modelflare"');
    expect(fs.readFileSync(path.join(root, "src/web/routes/models.ts"), "utf8")).toContain('"/modelflare"');
    expect(fs.readFileSync(path.join(root, "ui/lib/models.js"), "utf8")).toContain('"modelflare/"');
  });
});
