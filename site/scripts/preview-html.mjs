import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4321);
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".avif": "image/avif", ".woff2": "font/woff2", ".txt": "text/plain", ".xml": "application/xml" };
const server = http.createServer((req, res) => {
  try {
    if (!["GET", "HEAD"].includes(req.method)) { res.writeHead(405).end(); return; }
    const url = new URL(req.url, "http://localhost");
    const file = path.resolve(root, "." + decodeURIComponent(url.pathname));
    if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const target = [file, path.join(file, "index.html"), file + ".html"].find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
    if (!target || target.endsWith(".mjs") && path.dirname(target) === root) { res.writeHead(404).end("Not found"); return; }
    res.writeHead(200, { "Content-Type": (types[path.extname(target)] || "application/octet-stream") + "; charset=utf-8", "X-Content-Type-Options": "nosniff" });
    if (req.method === "HEAD") res.end(); else fs.createReadStream(target).pipe(res);
  } catch { res.writeHead(400).end("Bad request"); }
});
server.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
server.listen(port, "127.0.0.1", () => console.log("okbot website preview: http://127.0.0.1:" + port + " (Ctrl+C to stop)"));
