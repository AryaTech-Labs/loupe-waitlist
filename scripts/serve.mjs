// Serves src/ the way GitHub Pages does, for local checks and the browser tests.
// No dependencies. PORT defaults to 4173; SITE_ROOT serves another folder
// (CI tests the version-stamped copy that ships — LOU-102 4.9).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const ROOT = resolve(process.env.SITE_ROOT ?? resolve(import.meta.dirname, "..", "src"));
const PORT = Number(process.env.PORT ?? 4173);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

createServer(async (req, res) => {
  // A malformed escape ("/%E0%A4%A") threw here, outside any try, and the
  // rejection took the server down mid-run (LOU-102 4.10).
  let path;
  try {
    path = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain" }).end("Bad request");
    return;
  }
  const file = normalize(join(ROOT, path.endsWith("/") ? `${path}index.html` : path));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
  }
}).listen(PORT, () => console.log(`Serving ${ROOT} on http://localhost:${PORT}`));
