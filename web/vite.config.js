import { readFile, stat } from "node:fs/promises";
import { join, normalize, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

// Serves the pipeline output (data/build/<area>/*.json) at /data/<area>/*
// in dev. The data stays outside web/ (never copied); the production build
// only bundles the JS app.
const ROOT = fileURLToPath(new URL(".", import.meta.url));
const DATA_DIR = normalize(join(ROOT, "..", "data", "build"));
// Committed scenario JSON (scenarios/*.json) for sim mode + the worker.
const SCEN_DIR = normalize(join(ROOT, "..", "scenarios"));

function serveDir(mount, dir, { jsonOnly = false } = {}) {
  return async (req, res, next) => {
    try {
      const rel = normalize((req.url || "").replace(/^\/+/, "").split("?")[0]);
      const full = join(dir, rel);
      const outside = relative(dir, full).startsWith("..") || full.includes(`${sep}..${sep}`);
      if (outside || !full.startsWith(dir) || (jsonOnly && !full.endsWith(".json"))) {
        res.statusCode = 403;
        res.end("forbidden");
        return;
      }
      const st = await stat(full);
      if (!st.isFile()) {
        res.statusCode = 404;
        res.end("not found");
        return;
      }
      const body = await readFile(full);
      res.setHeader("Content-Type", full.endsWith(".json") ? "application/json" : "application/octet-stream");
      res.end(body);
    } catch {
      next();
    }
  };
}

function areaDataPlugin() {
  return {
    name: "area-data",
    configureServer(server) {
      server.middlewares.use("/data", serveDir("/data", DATA_DIR));
      server.middlewares.use("/scenarios", serveDir("/scenarios", SCEN_DIR, { jsonOnly: true }));
    },
  };
}

export default {
  plugins: [areaDataPlugin()],
  server: { port: 5173 },
};
