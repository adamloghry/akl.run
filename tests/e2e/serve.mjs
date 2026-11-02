import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

/** Parse the `/*` block of public/_headers into [name, value] pairs. */
export function parseHeaders(file = path.join(ROOT, "public/_headers")) {
  const out = [];
  let inStar = false;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (/^\S/.test(line)) {
      inStar = line.trim() === "/*";
      continue;
    }
    if (!inStar || !line.trim()) continue;
    const i = line.indexOf(":");
    if (i > 0) out.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
  }
  return out;
}

export async function serve(dir, port) {
  const root = path.resolve(dir);
  const headers = parseHeaders();
  const server = http.createServer(async (req, res) => {
    const send = (code, body, type) => {
      for (const [k, v] of headers) res.setHeader(k, v);
      res.statusCode = code;
      if (type) res.setHeader("Content-Type", type);
      res.end(body);
    };
    try {
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (p.endsWith("/")) p += "index.html";
      let file = path.join(root, p);
      if (file !== root && !file.startsWith(root + path.sep)) return send(404, "not found", "text/plain");
      if ((await stat(file).catch(() => null))?.isDirectory()) file = path.join(file, "index.html");
      const body = await readFile(file);
      send(200, body, MIME[path.extname(file)] ?? "application/octet-stream");
    } catch {
      // Like the Worker (not_found_handling "404-page"): a miss gets dist/404.html with status 404.
      const page = await readFile(path.join(root, "404.html")).catch(() => null);
      if (page) send(404, page, MIME[".html"]);
      else send(404, "not found", "text/plain");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return {
    close: () =>
      new Promise((r) => {
        server.closeAllConnections?.();
        server.close(() => r());
      }),
  };
}
