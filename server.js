// Local server: serves public/ and the same /api handlers that Vercel runs.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import rewrite from "./api/rewrite.js";
import check from "./api/check.js";
import health from "./api/health.js";
import sentence from "./api/sentence.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, "public");
const PORT = Number(process.env.PORT || 3000);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".png": "image/png", ".xml": "application/xml", ".txt": "text/plain", ".css": "text/css", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2" };
const routes = { "/api/rewrite": rewrite, "/api/check": check, "/api/health": health, "/api/sentence": sentence };

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > 200_000) throw new Error("too large");
    chunks.push(c);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const route = routes[url.pathname];
  if (route) {
    try { req.body = req.method === "POST" ? await readJson(req) : {}; }
    catch { res.writeHead(400, { "Content-Type": "application/json" }); return res.end('{"error":"Could not read the request."}'); }
    return route(req, res);
  }
  const file = path.normalize(path.join(publicDir, url.pathname === "/" ? "index.html" : url.pathname));
  if (!file.startsWith(publicDir + path.sep)) { res.writeHead(403); return res.end(); }
  try {
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
});

if (!process.env.ANTHROPIC_API_KEY) console.warn("Warning: ANTHROPIC_API_KEY is not set. Rewrites will not work.");
server.listen(PORT, () => console.log(`Humanizer is running at http://localhost:${PORT}`));
