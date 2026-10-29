import { readFile, stat } from "node:fs/promises";
import { join, normalize, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { buildPrompt } from "./src/judge/context.js";
import { providerConfig } from "./src/judge/providers.js";
import { emptyUsage, judgeSingle } from "./src/judge/run.js";
import { createConsultHandler } from "./src/consult/server.js";

// Serves the pipeline output (data/build/<area>/*.json) at /data/<area>/*
// in dev. The data stays outside web/ (never copied); the production build
// only bundles the JS app.
const ROOT = fileURLToPath(new URL(".", import.meta.url));
const DATA_DIR = normalize(join(ROOT, "..", "data", "build"));
// Committed scenario JSON (scenarios/*.json) for sim mode + the worker.
const SCEN_DIR = normalize(join(ROOT, "..", "scenarios"));
// Raw reference data (RTMS CSVs, housing snapshot) for the consult server
// only — never served to the browser.
const RAW_DIR = normalize(join(ROOT, "..", "data", "raw"));

function serveDir(mount, dir, { jsonOnly = false, allow = [] } = {}) {
  return async (req, res, next) => {
    try {
      const rel = normalize((req.url || "").replace(/^\/+/, "").split("?")[0]);
      const full = join(dir, rel);
      const outside = relative(dir, full).startsWith("..") || full.includes(`${sep}..${sep}`);
      const allowed = allow.includes(rel);
      if (outside || !full.startsWith(dir) || (jsonOnly && !full.endsWith(".json") && !allowed)) {
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
      res.setHeader("Content-Type", full.endsWith(".json") ? "application/json"
        : full.endsWith(".csv") ? "text/csv; charset=utf-8" : "application/octet-stream");
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
      // 12b: the chat derives ride minutes client-side from the
      // committed inter-station schedule (one CSV, allowlisted).
      server.middlewares.use("/scenarios", serveDir("/scenarios", SCEN_DIR,
        { jsonOnly: true, allow: [`transit${sep}seoul-metro-interstation.csv`] }));
    },
  };
}

const JUDGE_BODY_MAX = 262144; // 256 KB
const JUDGE_KINDS = new Set(["shop_choice", "park_or_home", "station_route", "weekend_plan"]);

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > JUDGE_BODY_MAX) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function checkShell(shell) {
  if (!shell || typeof shell !== "object") throw new Error("shell must be an object");
  if (!JUDGE_KINDS.has(shell.kind)) throw new Error("shell.kind unknown");
  if (!Array.isArray(shell.options) || shell.options.length === 0) {
    throw new Error("shell.options must be a non-empty array");
  }
  for (const o of shell.options) {
    if (!o || typeof o.key !== "string" || !Number.isFinite(o.minutes) || !Number.isFinite(o.distance_m)) {
      throw new Error("shell.options entries need {key, minutes, distance_m}");
    }
  }
  if (typeof shell.default_key !== "string"
      || !shell.options.some((o) => o.key === shell.default_key)) {
    throw new Error("shell.default_key must be one of the options");
  }
}

// Live demo path (vite dev only): POST /api/judge judges one decision
// through the provider. The key stays server-side (env); the browser
// only sends the decision context and shows the result. Never runs in
// the production build (configureServer only), which uses committed
// decision files instead.
function judgeApiPlugin() {
  return {
    name: "judge-api",
    configureServer(server) {
      server.middlewares.use("/api/judge", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("method not allowed");
          return;
        }
        try {
          const body = JSON.parse(await readBody(req));
          const cfg = providerConfig(body.provider); // throws on unknown provider
          checkShell(body.shell);
          if (!process.env[cfg.keyEnv]) {
            const err = new Error(`${cfg.keyEnv} is not set on the dev server`);
            err.code = "missing_key";
            throw err;
          }
          const ctx = {
            member: body.member || { role: "adult", preferences: "" },
            agentLabel: body.agentLabel || "구성원",
            date: body.date || "2026-11-02",
            weekday: body.weekday || "Mon",
            minute: Number.isFinite(body.minute) ? body.minute : 600,
            tripsToday: Array.isArray(body.tripsToday) ? body.tripsToday : [],
            memory: Array.isArray(body.memory) ? body.memory : [],
            shell: body.shell,
          };
          const prompt = buildPrompt(ctx);
          const usage = emptyUsage();
          const entry = await judgeSingle({
            provider: body.provider, prompt, shell: body.shell, ctx, usage,
          });
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true, entry, usage }));
        } catch (err) {
          const missing = err && err.code === "missing_key";
          res.statusCode = missing ? 503 : /body too large|must be|unknown/.test(err.message) ? 400 : 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: false, error: String((err && err.message) || err).slice(0, 300) }));
        }
      });
    },
  };
}

// Consult path (vite dev only): POST /api/consult runs one 상담 turn
// server-side. Same key rules as /api/judge: env only, never logged,
// never returned. The production build has no consult key path — the
// panel shows a recorded demo transcript instead.
function consultApiPlugin() {
  return {
    name: "consult-api",
    configureServer(server) {
      server.middlewares.use("/api/consult",
        createConsultHandler({ dataDir: DATA_DIR, scenDir: SCEN_DIR, rawDir: RAW_DIR }));
    },
  };
}

export default {
  plugins: [react(), areaDataPlugin(), judgeApiPlugin(), consultApiPlugin()],
  server: { port: 5173 },
};
