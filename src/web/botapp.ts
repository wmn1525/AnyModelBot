/**
 * 目录 Bot 的服务端：界面文件的静态路由和目录、实例的接口。
 *
 * 界面跑在 sandbox iframe 里（没有 allow-same-origin，是不透明来源），带不上 Cookie，所以 /amb/botapp/ 下的静态文件不要令牌。
 * 这里只有界面包、界面套件和设计系统，没有用户数据；用户数据只经父页面（ui/lib/bot-bridge.js）走 /amb/api。
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { LIMITS } from "../botkit/format.js";
import { safeRelPath } from "../botkit/bundle.js";
import type { BotCatalog, CatalogEntry } from "../botkit/catalog.js";
import { CatalogError, instanceId, uiBase, type BotInstaller } from "../botkit/installer.js";
import { runnable, sendFile } from "./files.js";
import { SseReply } from "./sse-reply.js";

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

/** 给界面的目录条目：开发目录的本机路径不外传 */
export function publicEntry(e: CatalogEntry, hasInstance: boolean) {
  const { dev, ui, runtime, ...rest } = e;
  return { ...rest, isDev: !!dev, instanceId: hasInstance ? instanceId(e.id) : undefined };
}

export interface ApiDeps {
  catalog: BotCatalog;
  installer: BotInstaller;
  getBot: (id: string) => any;
  publicBot: (bot: any) => unknown;
  deleteBot: (id: string, keepData: boolean) => Promise<void>;
  send: (res: http.ServerResponse, status: number, body: unknown) => void;
  readJson: (req: http.IncomingMessage) => Promise<any>;
  appLang: () => string;
  /** 只有界面监听在本机时才能登记本机目录 */
  loopback: boolean;
  /** 桌面版才有：用系统程序打开、在文件夹中显示 */
  desktop?: { openPath?: (p: string) => unknown; showItemInFolder?: (p: string) => unknown };
}

function fail(res: http.ServerResponse, d: ApiDeps, e: unknown): void {
  // 错误只给代码，文案在界面的词典里（botapp.errors.*）
  const code = e instanceof CatalogError ? e.code : "catalog_failed";
  if (!res.headersSent) d.send(res, e instanceof CatalogError ? e.status : 500, { error: code, code });
}

async function readLargeJson(req: http.IncomingMessage, limit: number): Promise<any> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of req) {
    n += (c as Buffer).length;
    if (n > limit) throw new CatalogError("inbox_too_large", 413);
    chunks.push(c as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

/** /amb/api/catalog*、/amb/api/bots/:id/app*。处理了返回 true */
export async function botAppApi(req: http.IncomingMessage, res: http.ServerResponse, url: URL, seg: string[], d: ApiDeps): Promise<boolean> {
  const m = req.method || "GET";
  try {
    if (seg[0] === "catalog") {
      if (seg.length === 1 && m === "GET") {
        d.send(res, 200, { bots: d.catalog.list().map((e) => publicEntry(e, !!d.getBot(instanceId(e.id)))), syncedAt: d.catalog.syncedAt, enabled: d.catalog.enabled });
        return true;
      }
      if (seg[1] === "sync" && m === "POST") {
        await d.catalog.sync();
        d.send(res, 200, { ok: true, error: d.catalog.lastError || undefined });
        return true;
      }
      if (seg[1] === "dev") {
        if (!d.loopback) throw new CatalogError("dev_loopback_only", 403);
        if (seg.length === 2 && m === "POST") {
          const b = await d.readJson(req);
          let entry: CatalogEntry;
          try {
            entry = d.catalog.addDev(String(b.dir ?? ""));
          } catch {
            throw new CatalogError("dev_invalid", 400);
          }
          d.send(res, 200, { bot: publicEntry(entry, !!d.getBot(instanceId(entry.id))), base: uiBase(entry) });
          return true;
        }
        if (seg.length === 3 && m === "DELETE") {
          d.catalog.removeDev(decodeURIComponent(seg[2]));
          d.send(res, 200, { ok: true });
          return true;
        }
      }
      const id = decodeURIComponent(seg[1] ?? "");
      const entry = d.catalog.get(id);
      if (!entry) throw new CatalogError("catalog_not_found", 404);
      if (seg.length === 2 && m === "GET") {
        d.send(res, 200, { bot: publicEntry(entry, !!d.getBot(instanceId(id))) });
        return true;
      }
      if (seg[2] === "preview" && m === "POST") {
        // 打开只准备界面包（官方包从安装包解出）：不创建实例、不装技能、不起进程
        if (entry.removed) throw new CatalogError("catalog_removed", 410);
        await d.catalog.ensureUi(entry).catch(() => {
          throw new CatalogError("catalog_download_failed", 502);
        });
        d.send(res, 200, { bot: publicEntry(entry, !!d.getBot(instanceId(id))), base: uiBase(entry) });
        return true;
      }
      if (seg[2] === "file" && m === "GET") {
        const file = await d.installer.previewFile(entry, url.searchParams.get("path"), d.appLang());
        if (!file) throw new CatalogError("file_not_found", 404);
        d.send(res, 200, file);
        return true;
      }
      if (seg[2] === "install" && m === "POST") {
        const bot = await d.installer.install(id, d.appLang());
        d.send(res, 200, { bot: d.publicBot(bot), base: uiBase(entry) });
        return true;
      }
      return false;
    }
    if (seg[0] === "bots" && seg[2] === "app") {
      const botId = decodeURIComponent(seg[1]);
      const bot = d.getBot(botId);
      if (!bot?.app) throw new CatalogError("catalog_not_found", 404);
      const sub = seg.slice(3).join("/");
      if (sub === "" && m === "GET") {
        const info = d.installer.info(bot);
        d.send(res, 200, { ref: info.ref, base: info.base, updateAvailable: info.updateAvailable, bot: info.entry ? publicEntry(info.entry, true) : undefined });
        return true;
      }
      if (sub === "update" && m === "POST") {
        const result = await d.installer.update(botId);
        d.send(res, 200, { result, bot: d.publicBot(d.getBot(botId)) });
        return true;
      }
      if (sub === "file" && m === "GET") {
        const file = await d.installer.readFile(bot, url.searchParams.get("path"));
        if (!file) throw new CatalogError("file_not_found", 404);
        d.send(res, 200, file);
        return true;
      }
      if (sub === "image" && m === "GET") {
        const image = d.installer.readImage(bot, url.searchParams.get("path"));
        if (!image) throw new CatalogError("file_not_found", 404);
        d.send(res, 200, image);
        return true;
      }
      if (sub === "list" && m === "GET") {
        d.send(res, 200, { files: d.installer.listApp(botId) });
        return true;
      }
      if (sub === "media" && m === "GET") {
        const file = d.installer.mediaFile(bot, url.searchParams.get("path"));
        if (!file) throw new CatalogError("file_not_found", 404);
        sendFile(req, res, file, file.mime);
        return true;
      }
      if (sub === "download" && m === "GET") {
        const file = d.installer.appFile(bot, url.searchParams.get("path"));
        if (!file) throw new CatalogError("file_not_found", 404);
        sendFile(req, res, file);
        return true;
      }
      // 打开就会运行的文件不直接打开，只在文件夹中显示（同 /conversations/:id/file/open）
      if (sub === "open" && m === "POST") {
        const b = await d.readJson(req);
        const file = d.installer.appFile(bot, b.path);
        if (!file) throw new CatalogError("file_not_found", 404);
        if (!d.desktop?.openPath) throw new CatalogError("desktop_only", 400);
        if (!b.reveal && !runnable(file)) {
          d.desktop.openPath(file.path);
          d.send(res, 200, { ok: true });
          return true;
        }
        if (d.desktop.showItemInFolder) d.desktop.showItemInFolder(file.path);
        else d.desktop.openPath(path.dirname(file.path));
        d.send(res, 200, { ok: true, revealed: true });
        return true;
      }
      if (sub === "inbox" && m === "POST") {
        const b = await readLargeJson(req, Math.ceil(LIMITS.inboxBytes * 1.4));
        const data = Buffer.from(String(b.base64 ?? ""), "base64");
        d.send(res, 200, { path: d.installer.saveInbox(botId, String(b.name ?? "file"), data), size: data.length });
        return true;
      }
      if (sub === "watch" && m === "GET") {
        const out = new SseReply(res);
        const off = d.installer.watch(botId, (rel) => out.send("file", { path: rel }));
        res.on("close", off);
        return true;
      }
    }
  } catch (e) {
    fail(res, d, e);
    return true;
  }
  return false;
}
