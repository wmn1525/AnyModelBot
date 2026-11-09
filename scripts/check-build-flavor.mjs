#!/usr/bin/env node
// Checks the packaged app's package.json: a release build must not enable developer tools
// (electron/main.ts reads ambDebugBuild), a debug build must. Used by .github/workflows/release.yml
// so a debug package can never reach a GitHub Release.
//   node scripts/check-build-flavor.mjs <packaged executable> <release|debug>
import fs from "node:fs";
import path from "node:path";
import asar from "@electron/asar";

const [exe, want] = process.argv.slice(2);
if (!exe || !["release", "debug"].includes(want)) {
  console.error("usage: check-build-flavor.mjs <packaged executable> <release|debug>");
  process.exit(2);
}
const abs = path.resolve(exe);
// macOS: X.app/Contents/MacOS/<exe> → X.app/Contents/Resources; Windows / Linux: <dir>/<exe> → <dir>/resources
const resources = abs.includes(".app/Contents/MacOS/") ? path.join(abs.slice(0, abs.indexOf("/Contents/MacOS/")), "Contents", "Resources") : path.join(path.dirname(abs), "resources");
const archive = path.join(resources, "app.asar");
if (!fs.existsSync(archive)) {
  console.error(`app.asar not found next to ${exe} (looked in ${resources})`);
  process.exit(1);
}
const pkg = JSON.parse(asar.extractFile(archive, "package.json").toString("utf8"));
const debug = pkg.ambDebugBuild === true;
if (debug !== (want === "debug")) {
  console.error(`::error::${archive} is a ${debug ? "debug" : "release"} build (ambDebugBuild=${pkg.ambDebugBuild}), expected ${want}`);
  process.exit(1);
}
console.log(`build flavour OK: ${want} (${pkg.name} ${pkg.version})`);
