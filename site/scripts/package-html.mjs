import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.dirname(site);
const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
const dist = path.join(site, "dist");
if (!fs.existsSync(path.join(dist, "index.html"))) throw new Error("Run npm run build:html first.");
const output = path.join(root, "release", "okbot-site-html-" + version);
fs.mkdirSync(output, { recursive: true });
fs.cpSync(dist, output, { recursive: true, filter: (source) => {
  const rel = path.relative(dist, source).split(path.sep).join("/");
  return !/^(demo|badges)(\/|$)/.test(rel) && (!rel.startsWith("og/") || /^og\/okbot\.(png|svg)$/.test(rel));
} });
fs.copyFileSync(path.join(root, "LICENSE"), path.join(output, "LICENSE"));
fs.copyFileSync(path.join(root, "THIRD_PARTY_NOTICES.md"), path.join(output, "THIRD_PARTY_NOTICES.md"));
fs.copyFileSync(path.join(site, "scripts/preview-html.mjs"), path.join(output, "preview.mjs"));
fs.writeFileSync(path.join(output, "stars.json"), JSON.stringify(JSON.parse(fs.readFileSync(path.join(site, "src/data/github.json"), "utf8"))));
fs.writeFileSync(path.join(output, "preview.cmd"), '@echo off\r\ncd /d "%~dp0"\r\necho Open http://127.0.0.1:4321 after the server starts.\r\nnode preview.mjs\r\npause\r\n');
fs.writeFileSync(path.join(output, "README.txt"), [
  "okbot 官网 HTML 静态站", "",
  "本地预览：安装 Node.js 后双击 preview.cmd，浏览器打开 http://127.0.0.1:4321 。", "也可在本目录执行 node preview.mjs；PORT 环境变量可修改端口。", "",
  "部署：将本目录的页面、_astro、bots、fonts 等静态文件一起上传到网站根目录。", "支持 Nginx、Caddy、Cloudflare Pages 等静态托管，无需 Node.js 后端。", "请通过 HTTP 预览；直接双击 index.html 时根路径资源和模块脚本无法完整运行。", "",
  "品牌：okbot；AI 服务：okinto（https://api.okinto.com）；API：https://api.okinto.com/v1。", "下载：GitHub wmn1525/AnyModelBot 的 okbot v" + version + "，包含 SHA-256。", "模型价格为构建时的 okinto API 快照，账户计费单位不等于实际充值现金成本，最终以 okinto 账单为准。", "",
  "本包未绑定正式域名，也没有开启访问统计。", "确定域名后，在源码 site/ 中设置 SITE_DOMAIN 再运行 npm run build:html 和 npm run package:html，生成 canonical 与 sitemap。", "源码目录：site/。保留了原项目 MIT 许可、版权及第三方声明。", "包含 5 种语言：首页、下载、价格、机器人目录、安全、隐私、许可、更新日志和联系页面。", ""
].join("\r\n"));
const zip = output + ".zip";
if (process.platform === "win32") {
  const quote = (s) => "'" + s.replaceAll("'", "''") + "'";
  execFileSync("powershell.exe", ["-NoProfile", "-Command", "Compress-Archive -LiteralPath " + quote(output) + " -DestinationPath " + quote(zip) + " -Force"], { stdio: "inherit", windowsHide: true });
} else {
  execFileSync("zip", ["-qr", zip, path.basename(output)], { cwd: path.dirname(output), stdio: "inherit" });
}
console.log(JSON.stringify({ directory: output, archive: zip, bytes: fs.statSync(zip).size }, null, 2));
