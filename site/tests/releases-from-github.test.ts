import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const script = fs.readFileSync(new URL("../scripts/releases-from-github.ts", import.meta.url), "utf8");
const hash = "a".repeat(64);
const suffixes = ["win-x64.exe", "mac-arm64.dmg", "mac-x64.dmg", "linux-x86_64.AppImage"];

function generate(prefix: string, checksums = true, omitWindows = false) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "okbot-releases-test-"));
  try {
    fs.mkdirSync(path.join(directory, "scripts"));
    fs.mkdirSync(path.join(directory, "src/data"), { recursive: true });
    const assets = suffixes.filter(name => !omitWindows || !name.startsWith("win-")).map(suffix => ({
      name: prefix + "-0.1.26-" + suffix,
      size: 1048576,
      browser_download_url: "https://downloads.example/" + prefix + "-0.1.26-" + suffix,
    }));
    const release = { tag_name: "v0.1.26", published_at: "2026-11-06T00:00:00Z", html_url: "https://example.com/release", assets: [...assets, ...(checksums ? [{ name: "SHA256SUMS", size: 1, browser_download_url: "https://downloads.example/SHA256SUMS" }] : [])] };
    const sums = assets.map(asset => hash + "  " + asset.name).join("\n");
    const mock = "globalThis.fetch = async (url) => { if (String(url).endsWith('/releases/latest')) return new Response(" + JSON.stringify(JSON.stringify(release)) + ", { status: 200 }); if (String(url).endsWith('/SHA256SUMS')) return new Response(" + JSON.stringify(sums) + ", { status: 200 }); throw new Error('Unexpected network request: ' + url); };\n";
    const entry = path.join(directory, "scripts/releases-from-github.mts");
    fs.writeFileSync(entry, mock + script);
    const result = spawnSync(process.execPath, [require.resolve("tsx/cli"), entry], { encoding: "utf8", timeout: 15000, env: { ...process.env, GITHUB_URL: "https://github.com/example/repository", GITHUB_TOKEN: "", DOCKER_IMAGE: "" } });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    return { data: JSON.parse(fs.readFileSync(path.join(directory, "src/data/releases.json"), "utf8")), logs: result.stdout + result.stderr };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

describe("Release download metadata", () => {
  it.each(["okbot", "anymodel-bot"])("reads all installers named %s", prefix => {
    const { data, logs } = generate(prefix);
    for (const id of ["win-x64", "mac-arm64", "mac-x64", "linux-x64"]) {
      expect(data.platforms[id].url).toMatch(/^https:\/\/downloads.example\//);
      expect(data.platforms[id].sha256).toBe(hash);
    }
    expect(logs).toContain("四个平台齐全");
  });

  it("retains real URLs when checksum metadata is absent", () => {
    const { data, logs } = generate("okbot", false);
    expect(data.platforms["win-x64"].url).toBe("https://downloads.example/okbot-0.1.26-win-x64.exe");
    expect(data.platforms["win-x64"].sha256).toBe("{WIN_X64_SHA256}");
    expect(logs).toContain("但缺少 SHA256");
  });

  it("reports the available asset names when an installer is missing", () => {
    const { data, logs } = generate("okbot", true, true);
    expect(data.platforms["win-x64"].url).toBe("{WIN_X64_URL}");
    expect(data.platforms["mac-arm64"].sha256).toBe(hash);
    expect(logs).toContain("平台 win-x64：未匹配到安装包");
    expect(logs).toContain("okbot-0.1.26-mac-arm64.dmg");
  });
});
