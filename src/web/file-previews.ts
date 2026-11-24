/** Read-only previews for the right-hand panel. Text is cut to whole lines with the
 * total size reported; CSV reads further. HTML gets a short-lived, directory-scoped
 * capability (renewed while the tab stays open) so an opaque sandbox can load its
 * assets without receiving the console's credentials; a small script reports link
 * clicks to the panel instead of navigating inside the frame.
 *
 * The page is untrusted (the agent may have written it from something it was sent, and
 * files from chat peers land in the same workspace), and it can reach https: hosts for
 * images, styles and scripts. So it may load what sits next to it, but its own code must
 * not be able to read those files: see ASSETS and SCRIPT_READABLE. */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type http from "node:http";
import { IMAGE_TYPES, resolveFile, type FileScope, type ResolvedFile } from "./files.js";

const PREFIX = "/amb/file-preview/";
/** Markdown, code, plain text and JSON show at most this much (cut back to a whole line). */
export const TEXT_LIMIT = 2 * 1024 * 1024;
/** CSV / TSV read up to this much; the table caps rows separately. */
export const CSV_LIMIT = 10 * 1024 * 1024;
/** HTML pages and their assets. */
export const ASSET_LIMIT = 32 * 1024 * 1024;
const TTL = 60 * 60 * 1000;
/** Counting lines or PDF pages past this size is skipped (the panel then omits the number). */
const SCAN_LIMIT = 256 * 1024 * 1024;
const PDF_SCAN_LIMIT = 64 * 1024 * 1024;
export const TEXT_EXT = new Set(
  [
    ".txt .log .csv .tsv .json .yaml .yml .xml .js .mjs .cjs .ts .tsx .jsx .css .py .sh .sql .toml .ini .env .md .markdown",
    ".go .rs .java .kt .swift .c .h .cpp .hpp .cs .rb .php .lua .r .dart .vue .svelte .scss .less .gradle .conf .cfg .properties .jsonl .ndjson .srt .vtt",
  ].join(" ").split(" "),
);
const TEXT_NAMES = new Set(["dockerfile", "makefile"]);
const CSV_EXT = new Set([".csv", ".tsv"]);
const PREVIEW_IMAGES: Record<string, string> = { ...IMAGE_TYPES, ".svg": "image/svg+xml" };
/** What a page may load from its directory. Data files (JSON …) are left out: only a script reading them could use them. */
const ASSETS: Record<string, string> = {
  ...PREVIEW_IMAGES, ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".ico": "image/x-icon", ".avif": "image/avif",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
  ".mp4": "video/mp4", ".webm": "video/webm", ".mp3": "audio/mpeg", ".wav": "audio/wav",
};
/**
 * The only assets served with CORS: from an opaque origin, ES modules and @font-face do not load without it.
 * Everything else still displays (<img>, <link>, <video>, a link to a sibling page) but stays opaque to the
 * page's code — no fetch(), no canvas read-back — so a page cannot pick up the files beside it and send
 * them out in an https: image URL. fetch / XHR are also off in the CSP (connect-src 'none').
 */
const SCRIPT_READABLE = new Set([".js", ".mjs", ".woff", ".woff2", ".ttf", ".otf"]);
/**
 * Injected into every page served through a grant: a plain link click is reported to the panel
 * (postMessage) instead of navigating the frame, so external links open in the system browser
 * and sibling pages open as panel tabs. Same-page anchors and links the page handles itself are left alone.
 */
export const LINK_SCRIPT =
  '<script>(function(){function f(e){if(parent===window||e.defaultPrevented||(e.type==="auxclick"&&e.button!==1))return;var t=e.target,a=t&&t.closest?t.closest("a[href],area[href]"):null;if(!a)return;var h=a.getAttribute("href")||"";if(h.charAt(0)==="#")return;var u;try{u=new URL(a.href,location.href)}catch(x){return}if(!/^(https?|file):$/.test(u.protocol))return;if(u.origin===location.origin&&u.pathname===location.pathname&&u.search===location.search&&u.hash)return;e.preventDefault();parent.postMessage({amb:"preview-link",href:u.href},"*")}addEventListener("click",f);addEventListener("auxclick",f)})();</script>';

export type Encoding = "utf-8" | "utf-8-bom" | "gbk";
export interface PreviewOptions {
  /** Force a text encoding ("auto" or missing = detect). */
  encoding?: string;
}

type Grant = { root: string; entry: string; scope: FileScope; expires: number };
const inside = (file: string, root: string) => {
  const rel = path.relative(root, file);
  return !path.isAbsolute(rel) && rel !== ".." && !rel.startsWith(".." + path.sep);
};

let gbkDecoder: TextDecoder | null | undefined;
function gbk(fatal: boolean): TextDecoder | null {
  if (gbkDecoder === undefined) {
    try { gbkDecoder = new TextDecoder("gbk"); } catch { gbkDecoder = null; }
  }
  if (!gbkDecoder) return null;
  return fatal ? new TextDecoder("gbk", { fatal: true }) : gbkDecoder;
}

/** UTF-8 (with or without BOM) or GBK; `want` forces one. Undecodable bytes become U+FFFD. */
export function decodeText(buf: Buffer, want?: string): { text: string; encoding: Encoding; detected: Encoding } {
  const bom = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  const utf8 = (b: Buffer) => new TextDecoder("utf-8").decode(b);
  let detected: Encoding = bom ? "utf-8-bom" : "utf-8";
  let gbkText: string | undefined;
  if (!bom) {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(buf);
    } catch {
      try {
        const d = gbk(true);
        if (d) { gbkText = d.decode(buf); detected = "gbk"; }
      } catch { /* neither: show UTF-8 with replacement characters */ }
    }
  }
  const choice: Encoding = want === "gbk" ? (gbk(false) ? "gbk" : detected) : want === "utf-8" ? (bom ? "utf-8-bom" : "utf-8") : detected;
  if (choice === "gbk") return { text: gbkText ?? gbk(false)!.decode(buf), encoding: "gbk", detected };
  return { text: utf8(bom ? buf.subarray(3) : buf), encoding: choice, detected };
}

/** Whole lines only: drop a trailing partial line (both UTF-8 and GBK never use 0x0A inside a character). */
export function cutToLine(buf: Buffer): Buffer {
  const nl = buf.lastIndexOf(0x0a);
  return nl >= 0 ? buf.subarray(0, nl + 1) : buf;
}

async function countLines(file: string, size: number): Promise<number | undefined> {
  if (size > SCAN_LIMIT) return undefined;
  let n = 0;
  let last = 0x0a;
  for await (const chunk of fs.createReadStream(file, { highWaterMark: 1 << 20 }) as AsyncIterable<Buffer>) {
    let i = -1;
    while ((i = chunk.indexOf(0x0a, i + 1)) !== -1) n++;
    if (chunk.length) last = chunk[chunk.length - 1];
  }
  return last === 0x0a ? n : n + 1;
}

/** Page count from the page tree (/Type /Pages … /Count n), else counted /Type /Page objects; undefined when unreadable. */
export function pdfPages(buf: Buffer): number | undefined {
  const s = buf.toString("latin1");
  let best = 0;
  const count = /\/Count\s+(\d+)/g;
  for (let m; (m = count.exec(s)); ) {
    const open = s.lastIndexOf("<<", m.index);
    const close = s.indexOf(">>", m.index);
    const dict = s.slice(open < 0 ? Math.max(0, m.index - 512) : open, close < 0 ? m.index + 512 : close);
    if (/\/Type\s*\/Pages\b/.test(dict)) best = Math.max(best, Number(m[1]));
  }
  if (!best) best = (s.match(/\/Type\s*\/Page(?![A-Za-z])/g) || []).length;
  return best > 0 && best < 1_000_000 ? best : undefined;
}

/** Plain text when it has no NUL byte; files without an extension (LICENSE, .gitignore) are sniffed this way. */
const looksBinary = (buf: Buffer) => buf.subarray(0, 8192).includes(0);

async function readHead(file: string, limit: number): Promise<{ buf: Buffer; truncated: boolean }> {
  const handle = await fs.promises.open(file, "r");
  try {
    // Bound the read even if the agent grows the file after it was resolved.
    const buf = Buffer.alloc(limit + 1);
    const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
    if (bytesRead > limit) return { buf: cutToLine(buf.subarray(0, limit)), truncated: true };
    return { buf: buf.subarray(0, bytesRead), truncated: false };
  } finally { await handle.close(); }
}

/** How the panel shows a file name: markdown / text / … are decided by the panel from the extension. */
export function isTextName(name: string): boolean {
  const lower = name.toLowerCase();
  return TEXT_EXT.has(path.extname(lower)) || TEXT_NAMES.has(lower);
}

export class FilePreviews {
  private grants = new Map<string, Grant>();

  async describe(file: ResolvedFile, scope: FileScope, opts: PreviewOptions = {}) {
    const name = path.basename(file.path);
    const ext = path.extname(name).toLowerCase();
    // Size and time come from the read itself: the agent may have rewritten the file since it was resolved.
    let st: fs.Stats;
    try { st = await fs.promises.stat(file.path); } catch { st = { size: file.size, mtimeMs: file.mtimeMs } as fs.Stats; }
    const meta = { name, path: file.path, size: st.size, mtimeMs: st.mtimeMs };
    if (st.size === 0) return { ...meta, kind: "empty" };
    if (PREVIEW_IMAGES[ext]) return { ...meta, kind: "image" };
    if (ext === ".pdf") {
      let pages: number | undefined;
      if (st.size <= PDF_SCAN_LIMIT) {
        try { pages = pdfPages(await fs.promises.readFile(file.path)); } catch { pages = undefined; }
      }
      return { ...meta, kind: "pdf", ...(pages ? { pages } : {}) };
    }
    if (ext === ".html" || ext === ".htm") {
      if (st.size > ASSET_LIMIT) return { ...meta, kind: "tooLarge", limit: ASSET_LIMIT };
      const { buf, truncated } = await readHead(file.path, TEXT_LIMIT);
      const decoded = decodeText(buf, opts.encoding);
      return { ...meta, kind: "html", url: this.grant(file.path, scope), ...decoded, truncated };
    }
    const sniff = !ext || !isTextName(name);
    if (sniff && ext) return { ...meta, kind: "unsupported" };
    const { buf, truncated } = await readHead(file.path, CSV_EXT.has(ext) ? CSV_LIMIT : TEXT_LIMIT);
    if (looksBinary(buf)) return { ...meta, kind: "unsupported" };
    const decoded = decodeText(buf, opts.encoding);
    const totalLines = truncated ? await countLines(file.path, st.size).catch(() => undefined) : undefined;
    return { ...meta, kind: "text", ...decoded, truncated, ...(totalLines ? { totalLines } : {}) };
  }

  private grant(entry: string, scope: FileScope): string {
    const now = Date.now();
    for (const [key, grant] of this.grants) if (grant.expires <= now) this.grants.delete(key);
    while (this.grants.size >= 64) this.grants.delete(this.grants.keys().next().value!);
    const key = crypto.randomBytes(24).toString("base64url");
    this.grants.set(key, { root: path.dirname(entry), entry, scope, expires: now + TTL });
    return `${PREFIX}${key}/${encodeURIComponent(path.basename(entry))}`;
  }

  /** Keep an open page's asset grant alive (the panel calls this while the tab stays open). */
  renew(url: unknown): boolean {
    if (typeof url !== "string") return false;
    let pathname: string;
    try { pathname = new URL(url, "http://localhost").pathname; } catch { return false; }
    if (!pathname.startsWith(PREFIX)) return false;
    const grant = this.grants.get(pathname.slice(PREFIX.length).split("/")[0]);
    if (!grant || grant.expires <= Date.now()) return false;
    grant.expires = Date.now() + TTL;
    return true;
  }

  static isAssetRequest(req: http.IncomingMessage, url: URL) {
    return url.pathname.startsWith(PREFIX) && (req.method === "GET" || req.method === "HEAD");
  }

  serve(req: http.IncomingMessage, res: http.ServerResponse, url: URL): boolean {
    if (!FilePreviews.isAssetRequest(req, url)) return false;
    const fail = () => { if (!res.headersSent) res.writeHead(404, { "cache-control": "no-store" }).end("not found"); else res.destroy(); return true; };
    const [key, ...parts] = url.pathname.slice(PREFIX.length).split("/");
    const grant = this.grants.get(key);
    if (!grant || grant.expires <= Date.now()) { this.grants.delete(key); return fail(); }
    let rel: string;
    try { rel = parts.map(decodeURIComponent).join("/"); } catch { return fail(); }
    if (!rel || rel.includes("\\") || rel.includes("\0") || rel.split("/").some((p) => p === ".." || p === ".") || path.isAbsolute(rel)) return fail();
    const file = resolveFile(path.join(grant.root, rel), grant.scope);
    if (!file || !inside(file.path, grant.root) || file.size > ASSET_LIMIT) return fail();
    // Delivered files outside the workspace do not grant access to their siblings.
    let workspace: string;
    try { workspace = fs.realpathSync(grant.scope.workspace); } catch { return fail(); }
    if (!inside(grant.entry, workspace) && file.path !== grant.entry) return fail();
    const ext = path.extname(file.path).toLowerCase();
    const mime = ASSETS[ext];
    if (!mime) return fail();
    const host = req.headers.host || "localhost";
    const sources = [`http://${host}${PREFIX}${key}/`, `https://${host}${PREFIX}${key}/`].join(" ");
    const headers: Record<string, string> = {
      "content-type": mime, "cache-control": "no-store",
      "x-content-type-options": "nosniff", "referrer-policy": "no-referrer",
      // No cookies, console API access, parent access, popups, forms, nested frames, fetch or XHR.
      "content-security-policy": `sandbox allow-scripts; default-src 'none'; script-src ${sources} https: 'unsafe-inline'; style-src ${sources} https: 'unsafe-inline'; img-src ${sources} https: data: blob:; font-src ${sources} https: data:; media-src ${sources} blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri ${sources}; form-action 'none'; frame-ancestors 'self'`,
    };
    if (SCRIPT_READABLE.has(ext)) headers["access-control-allow-origin"] = "*";
    if (mime.startsWith("text/html")) {
      fs.promises.readFile(file.path).then((body) => {
        const page = withLinkScript(body);
        headers["content-length"] = String(page.length);
        res.writeHead(200, headers);
        res.end(req.method === "HEAD" ? undefined : page);
      }, fail);
      return true;
    }
    headers["content-length"] = String(file.size);
    if (req.method === "HEAD") { res.writeHead(200, headers).end(); return true; }
    const stream = fs.createReadStream(file.path);
    stream.once("open", () => { res.writeHead(200, headers); stream.pipe(res); });
    stream.once("error", fail);
    res.once("close", () => stream.destroy());
    return true;
  }
}

/** The link script goes right after <head> (or <html>, or the doctype) so the page stays in standards mode. */
export function withLinkScript(body: Buffer): Buffer {
  const head = body.subarray(0, 65536).toString("latin1");
  const m = /<head\b[^>]*>/i.exec(head) || /<html\b[^>]*>/i.exec(head) || /<!doctype[^>]*>/i.exec(head);
  const bom = body[0] === 0xef && body[1] === 0xbb && body[2] === 0xbf ? 3 : 0;
  const at = m ? m.index + m[0].length : bom;
  return Buffer.concat([body.subarray(0, at), Buffer.from(LINK_SCRIPT, "latin1"), body.subarray(at)]);
}
