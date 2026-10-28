// Consult HTTP layer: POST /api/consult for vite dev only (Node-side).
//
// Same pattern as /api/judge: the key stays server-side (env), the browser
// sends the conversation + working scenario and shows the result. The
// server stores no conversations and no files — only derived run artifacts
// in a bounded in-memory cache (runs are deterministic and re-runnable).

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { providerConfig } from "../judge/providers.js";
import { judgeHome } from "../judge/run.js";
import { runTurn } from "./agent.js";
import { createRunCache } from "./tools.js";

export const CONSULT_BODY_MAX = 1048576; // 1 MB (scenario + history)

export function readBody(req, max = CONSULT_BODY_MAX) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > max) {
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

async function loadAreaFs(dataDir, areaCache, areaId) {
  if (areaCache.has(areaId)) return areaCache.get(areaId);
  const dir = join(dataDir, areaId);
  const area = JSON.parse(await readFile(join(dir, "area.json"), "utf8"));
  for (const [key, value] of Object.entries(area)) {
    if (value && typeof value === "object" && !Array.isArray(value)
        && Object.keys(value).join() === "$ref") {
      area[key] = JSON.parse(await readFile(join(dir, value.$ref), "utf8"));
    }
  }
  areaCache.set(areaId, area);
  return area;
}

async function loadDecisionsFs(scenDir, scenarioName, label) {
  for (const provider of ["meta", "baseten"]) {
    try {
      const raw = await readFile(
        join(scenDir, "decisions", `${scenarioName}-${label}-${provider}.json`), "utf8");
      return JSON.parse(raw);
    } catch { /* try the next provider file */ }
  }
  return null;
}

export function createConsultHandler({ dataDir, scenDir, fetchImpl = null } = {}) {
  const cache = createRunCache();
  const areaCache = new Map();
  return async (req, res) => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end("method not allowed");
      return;
    }
    try {
      const body = JSON.parse(await readBody(req));
      const provider = body.provider || "meta";
      const cfg = providerConfig(provider); // throws on unknown provider
      if (!process.env[cfg.keyEnv]) {
        const err = new Error(`${cfg.keyEnv} is not set on the dev server`);
        err.code = "missing_key";
        throw err;
      }
      if (!body.scenario || typeof body.scenario !== "object") {
        throw new Error("scenario must be an object");
      }
      if (body.messages !== undefined && !Array.isArray(body.messages)) {
        throw new Error("messages must be an array");
      }
      const out = await runTurn({
        provider,
        messages: Array.isArray(body.messages) ? body.messages : [],
        scenario: body.scenario,
        cache,
        loadArea: (areaId) => loadAreaFs(dataDir, areaCache, areaId),
        loadDecisions: (name, label) => loadDecisionsFs(scenDir, name, label),
        judgeHome: (args) => judgeHome({ ...args, fetchImpl }),
        fetchImpl,
      });
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(out)); // out.ok is true here
    } catch (err) {
      const missing = err && err.code === "missing_key";
      const msg = String((err && err.message) || err);
      res.statusCode = missing ? 503
        : /body too large|must be|unknown|required|not valid JSON|Unexpected/.test(msg) ? 400 : 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: false, error: msg.slice(0, 500) }));
    }
  };
}
