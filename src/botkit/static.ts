/**
 * 目录 Bot 界面的静态路由（/amb/botapp/）：App 的网页服务和 amb-bot check 的渲染都用它。
 *
 * 界面跑在 sandbox iframe 里（没有 allow-same-origin，是不透明来源），带不上 Cookie，所以 /amb/botapp/ 下的静态文件不要令牌。
 * 这里只有界面包、界面套件和设计系统，没有用户数据；用户数据只经父页面（ui/lib/bot-bridge.js）走 /amb/api。
 */
import fs from "node:fs";
import type http from "node:http";
import path from "node:path";
import { safeRelPath } from "../domain/paths.js";
import type { BotCatalog } from "./catalog.js";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

/**
 * connect-src 'none' 是底线：写错一处界面也调不到管理接口。sandbox 再兜一层：直接打开这个地址同样进沙箱。
 * 'self' 对不透明来源各家浏览器的解释不一，同时写上明确的来源。
 */
export function botAppCsp(origin: string): string {
  const self = `'self' ${origin}`;
  return [
    "default-src 'none'",
    `script-src ${self}`,
    `style-src ${self}`,
    `img-src ${self} data: blob:`,
    `font-src ${self}`,
    `media-src ${self} data: blob:`,
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    `frame-ancestors ${self}`,
    "sandbox allow-scripts allow-forms",
  ].join("; ");
}

/** 模块脚本从不透明来源加载要过 CORS；这些文件都不含用户数据 */
function headers(file: string, origin: string, cache: string): Record<string, string> {
  return {
    "content-type": MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream",
    "cache-control": cache,
    "x-content-type-options": "nosniff",
    "access-control-allow-origin": "*",
    "cross-origin-resource-policy": "cross-origin",
    ...(/\.html?$/i.test(file) ? { "content-security-policy": botAppCsp(origin) } : {}),
  };
}

function serve(res: http.ServerResponse, root: string, rel: string, origin: string, cache: string): void {
  if (!safeRelPath(rel)) return void res.writeHead(404).end();
  fs.realpath(path.join(root, ...rel.split("/")), (err, real) => {
    // 符号链接走出目录的不给
    let base = "";
    try {
      base = fs.realpathSync(root);
    } catch {
      return void res.writeHead(404).end();
    }
    if (err || !(real === base || real.startsWith(base + path.sep))) return void res.writeHead(404).end();
    fs.readFile(real, (e, data) => {
      if (e) return void res.writeHead(404).end();
      res.writeHead(200, headers(real, origin, cache));
      res.end(data);
    });
  });
}

export interface StaticDeps {
  uiDir: string;
  vendor: Record<string, string>;
  catalog: BotCatalog;
}

const KIT_DESIGN_EXT = /\.(css|webp|png|woff2)$/i;

/**
 * Preact 的 hooks 按裸名字引用 preact；沙箱页不能写内联 import map（CSP 不放行），这里把引用改成相对路径。
 * 只改第三方文件的这一处，界面套件自己用相对路径。
 */
const rewriteVendor = (text: string) => text.replace(/from\s*["']preact["']/g, 'from"./preact.mjs"');
const vendorCache = new Map<string, Buffer>();

/** 处理了返回 true */
export function serveBotAppStatic(req: http.IncomingMessage, res: http.ServerResponse, url: URL, d: StaticDeps): boolean {
  if (!url.pathname.startsWith("/amb/botapp/")) return false;
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405).end();
    return true;
  }
  const proto = String(req.headers["x-forwarded-proto"] || "http").split(",")[0].trim() === "https" ? "https" : "http";
  const origin = `${proto}://${String(req.headers.host || "localhost").replace(/[^\w.:[\]-]/g, "")}`;
  const parts = url.pathname.slice("/amb/botapp/".length).split("/").map((x) => {
    try {
      return decodeURIComponent(x);
    } catch {
      return "\0";
    }
  });
  const [kind, a] = parts;
  if (kind === "kit") {
    const rest = parts.slice(1).join("/");
    if (a === "vendor") {
      const name = parts[2];
      const f = d.vendor[name];
      if (!f || parts.length !== 3) return res.writeHead(404).end(), true;
      let body = vendorCache.get(name);
      if (!body) {
        try {
          body = Buffer.from(rewriteVendor(fs.readFileSync(f, "utf8")));
          vendorCache.set(name, body);
        } catch {
          return res.writeHead(404).end(), true;
        }
      }
      res.writeHead(200, headers(f, origin, "no-cache"));
      res.end(body);
      return true;
    }
    if (a === "design") {
      const rel = parts.slice(2).join("/");
      if (!KIT_DESIGN_EXT.test(rel)) return res.writeHead(404).end(), true;
      serve(res, path.join(d.uiDir, "design"), rel, origin, "no-cache");
      return true;
    }
    serve(res, path.join(d.uiDir, "botkit"), rest, origin, "no-cache");
    return true;
  }
  if (kind === "b") {
    const dir = d.catalog.uiDirIfPresent(a);
    if (!dir) return res.writeHead(404).end(), true;
    serve(res, path.join(dir, "ui"), parts.slice(2).join("/") || "index.html", origin, "public, max-age=31536000, immutable");
    return true;
  }
  if (kind === "d") {
    const entry = d.catalog.get(a);
    if (!entry?.dev) return res.writeHead(404).end(), true;
    serve(res, path.join(entry.dev, "ui"), parts.slice(2).join("/") || "index.html", origin, "no-cache");
    return true;
  }
  if (kind === "thumb") {
    d.catalog.thumb(a).then((f) => {
      if (!f) return void res.writeHead(404).end();
      res.writeHead(200, headers(f, origin, "public, max-age=31536000, immutable"));
      fs.createReadStream(f).pipe(res);
    }).catch(() => res.writeHead(404).end());
    return true;
  }
  res.writeHead(404).end();
  return true;
}
