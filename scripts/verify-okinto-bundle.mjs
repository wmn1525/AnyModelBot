#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { extractFile } from "@electron/asar";

const executable = process.argv[2];
if (!executable) throw new Error("Usage: verify-okinto-bundle.mjs <packaged-app-executable>");
const directory = path.dirname(path.resolve(executable));
const resources = path.basename(directory) === "MacOS" ? path.resolve(directory, "..", "Resources") : path.join(directory, "resources");
const archive = path.join(resources, "app.asar");
assert.ok(fs.existsSync(executable), "Packaged executable is missing");
const read = (file) => extractFile(archive, file.split("/").join(path.sep)).toString("utf8");
const pkg = JSON.parse(read("package.json"));
assert.equal(pkg.productName, "okbot", "Product identity must be okbot");
const expected = JSON.parse(fs.readFileSync("package.json", "utf8"));
assert.equal(pkg.version, expected.version, "Packaged version must match the release");
assert.match(fs.readFileSync(path.join(resources, "app-update.yml"), "utf8"), /owner: wmn1525/, "Updater must use the OKINTO fork repository");
assert.ok(read("dist/src/updates/desktop.js").includes("wmn1525/AnyModelBot"), "Native update links must use the fork");
assert.ok(read("dist/src/changelog.js").includes("wmn1525/AnyModelBot"), "Release notes must use the fork");
assert.ok(read("dist/src/web/routes/account.js").includes("groupList"), "OKINTO group route is missing");
assert.ok(read("dist/src/web/routes/models.js").includes("NewApiAccountManager"), "OKINTO model route is missing");
assert.ok(read("dist/src/providers/modelflare.js").includes("https://api.okinto.com/v1"), "OKINTO API endpoint is missing");
assert.ok(read("dist/src/app.js").includes("NewApiAccountManager"), "OKINTO account integration is missing");
const login = read("dist/electron/newapi-login.js");
assert.ok(login.includes("new_api_refresh") && login.includes("newApiDesktop"), "Desktop OKINTO login integration is missing");
assert.ok(read("dist/electron/main.js").includes("newapi-login.js"), "Desktop must load the OKINTO login module");
assert.ok(read("dist/src/account/newapi.js").includes("/pg/chat/completions"), "OKINTO playground chat relay is missing");
assert.ok(read("ui/lib/links.js").includes("https://api.okinto.com"), "UI links must point to OKINTO");
for (const lang of ["zh-CN", "en", "ja", "ko", "ru"]) {
  assert.ok(read(`ui/locales/${lang}/settings.js`).includes("OKINTO"), `OKINTO settings label missing for ${lang}`);
}
console.log(`OKINTO bundle verified: okbot ${pkg.version}; login, API endpoint, chat relay and all five language labels present`);
