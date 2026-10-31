// Stage 30a: tiny static file server for the built site (web/dist) in
// the `web` Docker stage. No dependencies. Serves files under the root
// dir; unknown paths fall back to index.html (SPA routes). Never lists
// directories. Usage: node serve-static.mjs [root] [port].

import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function resolveRoot(argv2) {
  return argv2 || process.env.STATIC_ROOT || "dist";
}

function resolvePort(argv3) {
  if (argv3) return Number(argv3);
  if (process.env.PORT) return Number(process.env.PORT);
  return 8080;
}

function safePath(root, url) {
  const raw = String(url || "/").split("?")[0];
  let decoded;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const rel = normalize(decoded.replace(/^\/+/, ""));
  if (rel === ".." || rel.startsWith(`..${sep}`) || rel.includes(`${sep}..${sep}`)) return null;
  const full = join(root, rel);
  if (relative(root, full).startsWith("..")) return null;
  return full;
}

export function startStaticServer({ root = resolveRoot(), port = resolvePort() } = {}) {
  const server = http.createServer(async (req, res) => {
    try {
      let full = safePath(root, req.url);
      if (!full) {
        res.statusCode = 400;
        res.end("bad request");
        return;
      }
      let st = null;
      try {
        st = await stat(full);
      } catch {
        st = null;
      }
      if (st && st.isDirectory()) full = join(full, "index.html");
      let body = null;
      try {
        body = await readFile(full);
      } catch {
        body = await readFile(join(root, "index.html"));
        full = join(root, "index.html");
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", TYPES[extname(full).toLowerCase()] || "application/octet-stream");
      res.setHeader("Cache-Control", "no-store");
      res.end(body);
    } catch {
      if (!res.headersSent) res.statusCode = 500;
      try {
        res.end("internal error");
      } catch {
        // The socket is already gone; nothing left to do.
      }
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => {
      const actual = server.address() && server.address().port;
      console.log(JSON.stringify({ static: true, root, port: actual }));
      resolve({ server, port: actual });
    });
  });
}

let invokedAsMain = false;
try {
  invokedAsMain = import.meta.url === pathToFileURL(process.argv[1]).href;
} catch {
  invokedAsMain = false;
}

if (invokedAsMain) {
  startStaticServer({ root: resolveRoot(process.argv[2]), port: resolvePort(process.argv[3]) }).catch((err) => {
    console.error(String((err && err.message) || err));
    process.exitCode = 1;
  });
}
