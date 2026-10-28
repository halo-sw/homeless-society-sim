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
import { createCsvBackend } from "../money/rtms.js";
import { normalizeSnapshot, createHousingApi, HOUSING_KEY_ENV } from "../money/housing.js";

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

export function createConsultHandler({ dataDir, scenDir, rawDir = null, fetchImpl = null } = {}) {
  const cache = createRunCache();
  const areaCache = new Map();
  const rtmsCache = new Map();
  let payrollCache = null;
  let housingCache = null;
  const loadPayroll = async () => {
    if (!payrollCache) {
      payrollCache = JSON.parse(await readFile(join(scenDir, "assumptions", "kr-payroll.json"), "utf8"));
    }
    return payrollCache;
  };
  const loadRtms = async (district) => {
    if (rtmsCache.has(district)) return rtmsCache.get(district);
    if (!rawDir) throw new Error("RTMS data is unavailable on this server");
    const backend = createCsvBackend({
      rawDir: join(rawDir, "rtms"),
      readFile: (path) => readFile(path),
    });
    const rows = await backend.loadAll(district);
    rtmsCache.set(district, rows);
    return rows;
  };
  const loadHousing = async () => {
    if (housingCache) return housingCache;
    // Dev snapshot first (orchestrator-fetched, gitignored, never served);
    // live API when the key is set.
    if (rawDir) {
      try {
        const raw = await readFile(join(rawDir, "public_housing", "snapshot_3districts.json"), "utf8");
        housingCache = normalizeSnapshot(JSON.parse(raw));
        return housingCache;
      } catch { /* fall through to the API */ }
    }
    const key = process.env[HOUSING_KEY_ENV];
    if (!key) throw new Error("public-rental data needs the dev snapshot or HOUSING_API_KEY on the server");
    const api = createHousingApi({ key, fetchImpl: fetchImpl || fetch });
    const [complexes, notices] = await Promise.all([api.complexes(), api.notices()]);
    housingCache = normalizeSnapshot({ fetched_at: new Date().toISOString(), complexes, notices });
    return housingCache;
  };
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
        loadPayroll, loadRtms, loadHousing,
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
