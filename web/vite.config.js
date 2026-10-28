import { readFile, stat } from "node:fs/promises";
import { join, normalize, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

// Serves the pipeline output (data/build/<area>/*.json) at /data/<area>/*
// in dev. The data stays outside web/ (never copied); the production build
// only bundles the JS app.
const ROOT = fileURLToPath(new URL(".", import.meta.url));
const DATA_DIR = normalize(join(ROOT, "..", "data", "build"));

function areaDataPlugin() {
  return {
    name: "area-data",
    configureServer(server) {
      server.middlewares.use("/data", async (req, res, next) => {
        try {
          const rel = normalize((req.url || "").replace(/^\/+/, ""));
          const full = join(DATA_DIR, rel);
          const outside = relative(DATA_DIR, full).startsWith("..") || full.includes(`${sep}..${sep}`);
          if (outside || !full.startsWith(DATA_DIR)) {
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
      });
    },
  };
}

export default {
  plugins: [areaDataPlugin()],
  server: { port: 5173 },
};
