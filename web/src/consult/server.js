// Consult HTTP layer: POST /api/consult for vite dev only (Node-side).
//
// Same pattern as /api/judge: the key stays server-side (env), the browser
// sends the conversation + working scenario and shows the result. The
// server stores no conversations and no files — only derived run artifacts
// in a bounded in-memory cache (runs are deterministic and re-runnable).

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { providerConfig } from "../judge/providers.js";
import { judgeHome } from "../judge/run.js";
import { runTurn } from "./agent.js";
import { BYOK_HEADER, resolveProxyKey, redactSecrets } from "./byok.js";
import { createRunCache } from "./tools.js";
import { createCsvBackend } from "../money/rtms.js";
import { normalizeSnapshot, createHousingApi, HOUSING_KEY_ENV } from "../money/housing.js";
import { parseInterstationCsv } from "../transit/schedule.js";

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

// Bounding boxes for destination-area discovery (stage 9c): the full
// area.json parses are cached, so the four candidates cost one read.
async function loadAreaMetaFs(dataDir, areaMetaCache, areaId) {
  if (areaMetaCache.has(areaId)) return areaMetaCache.get(areaId);
  const doc = JSON.parse(await readFile(join(dataDir, areaId, "area.json"), "utf8"));
  const meta = { bbox: doc.bbox || null };
  areaMetaCache.set(areaId, meta);
  return meta;
}

async function loadRegionFs(dataDir) {
  const region = {};
  for (const [key, file] of [["network", "network.json"], ["congestion", "congestion.json"]]) {
    try {
      region[key] = JSON.parse(await readFile(join(dataDir, "region", file), "utf8"));
    } catch {
      region[key] = null;
    }
  }
  if (!region.network && !region.congestion) return null;
  return region;
}

async function loadSafetyFs(dataDir) {
  return JSON.parse(await readFile(join(dataDir, "region", "safety.json"), "utf8"));
}

async function loadPersonaFs(scenDir, personaId) {
  if (!/^[a-z0-9-]+$/.test(personaId)) throw new Error("bad persona id");
  return JSON.parse(await readFile(join(scenDir, "personas", `${personaId}.json`), "utf8"));
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
  const areaMetaCache = new Map();
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
    // Dev snapshots first (orchestrator-fetched, gitignored, never
    // served): every snapshot_*.json merges into one view, newest file
    // wins per complex id. Live API when the key is set.
    if (rawDir) {
      try {
        const dir = join(rawDir, "public_housing");
        const files = (await readdir(dir)).filter((f) => f.startsWith("snapshot_") && f.endsWith(".json")).sort();
        if (files.length > 0) {
          const byComplex = new Map();
          const byNotice = new Map();
          let fetchedAt = null;
          for (const file of files) {
            const doc = JSON.parse(await readFile(join(dir, file), "utf8"));
            const norm = normalizeSnapshot(doc);
            // Sorted file order: later files win per id (newest last).
            if (norm.fetched_at) fetchedAt = norm.fetched_at;
            for (const c of norm.complexes) byComplex.set(`${c.source}|${c.id}`, c);
            for (const n of norm.notices) byNotice.set(`${n.source}|${n.id}`, n);
          }
          const merged = {
            fetched_at: fetchedAt,
            complexes: [...byComplex.values()],
            notices: [...byNotice.values()],
          };
          merged.snapshot_files = files;
          housingCache = merged;
          return housingCache;
        }
      } catch { /* fall through to the API */ }
    }
    const key = process.env[HOUSING_KEY_ENV];
    if (!key) throw new Error("public-rental data needs the dev snapshot or HOUSING_API_KEY on the server");
    const api = createHousingApi({ key, fetchImpl: fetchImpl || fetch });
    const [complexes, notices] = await Promise.all([api.complexes(), api.notices()]);
    housingCache = normalizeSnapshot({ fetched_at: new Date().toISOString(), complexes, notices });
    return housingCache;
  };
  let homesCache = null;
  const loadHomes = async () => {
    if (!homesCache) {
      homesCache = JSON.parse(await readFile(join(dataDir, "homes-index.json"), "utf8"));
    }
    return homesCache;
  };
  let photosCache = null;
  const loadPhotos = async () => {
    if (!photosCache) {
      photosCache = JSON.parse(await readFile(join(scenDir, "places", "commons-photos.json"), "utf8"));
    }
    return photosCache;
  };
  let areasIndexCache = null;
  const loadAreasIndex = async () => {
    if (!areasIndexCache) {
      areasIndexCache = JSON.parse(await readFile(join(dataDir, "areas-index.json"), "utf8"));
    }
    return areasIndexCache;
  };
  let stationBoxesCache = null;
  const loadStationBoxes = async () => {
    if (!stationBoxesCache) {
      stationBoxesCache = JSON.parse(await readFile(join(dataDir, "station-boxes.json"), "utf8"));
    }
    return stationBoxesCache;
  };
  let transitCache = null;
  const loadTransit = async () => {
    if (!transitCache) {
      const text = await readFile(join(scenDir, "transit", "seoul-metro-interstation.csv"), "utf8");
      transitCache = parseInterstationCsv(text);
    }
    return transitCache;
  };
  const assumptionCache = new Map();
  const ASSUMPTION_ALLOWLIST = new Set([
    "kr-payroll.json", "kr-ownership-costs.json", "kr-jeonse-checklist.json",
    "kr-support-programs.json",
  ]);
  const loadAssumption = async (name) => {
    if (!ASSUMPTION_ALLOWLIST.has(name)) throw new Error(`unknown assumption file ${JSON.stringify(name)}`);
    if (!assumptionCache.has(name)) {
      assumptionCache.set(name,
        JSON.parse(await readFile(join(scenDir, "assumptions", name), "utf8")));
    }
    return assumptionCache.get(name);
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
      // 13: bring your own key — the per-request header wins, else the
      // server env key. The key is forwarded, never logged/stored/echoed.
      const byok = req.headers ? (req.headers[BYOK_HEADER] || req.headers[BYOK_HEADER.toLowerCase()]) : null;
      const { key: apiKey, from: keyFrom } = resolveProxyKey({
        headers: byok ? { [BYOK_HEADER]: byok } : {},
        provider, env: process.env,
      });
      if (!apiKey) {
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
      if (body.context !== undefined && body.context !== null
          && (typeof body.context !== "object" || Array.isArray(body.context))) {
        throw new Error("context must be an object");
      }
      const out = await runTurn({
        provider,
        apiKey,
        keyFrom,
        messages: Array.isArray(body.messages) ? body.messages : [],
        scenario: body.scenario,
        context: body.context && typeof body.context === "object" ? body.context : null,
        cache,
        loadArea: (areaId) => loadAreaFs(dataDir, areaCache, areaId),
        loadAreaMeta: (areaId) => loadAreaMetaFs(dataDir, areaMetaCache, areaId),
        loadDecisions: (name, label) => loadDecisionsFs(scenDir, name, label),
        loadRegion: () => loadRegionFs(dataDir),
        judgeHome: (args) => judgeHome({ ...args, fetchImpl }),
        loadPayroll, loadRtms, loadHousing,
        loadSafety: () => loadSafetyFs(dataDir),
        loadPersona: (id) => loadPersonaFs(scenDir, id),
        loadAssumption,
        loadHomes, loadPhotos, loadAreasIndex, loadStationBoxes, loadTransit,
        fetchImpl,
      });
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(out)); // out.ok is true here
    } catch (err) {
      const missing = err && err.code === "missing_key";
      // 13: the key must never appear in errors — redact everything.
      const byok = req.headers ? (req.headers[BYOK_HEADER] || req.headers[BYOK_HEADER.toLowerCase()]) : null;
      const msg = redactSecrets(String((err && err.message) || err),
        [typeof byok === "string" ? byok : ""]);
      res.statusCode = missing ? 503
        : /body too large|must be|unknown|required|not valid JSON|Unexpected/.test(msg) ? 400 : 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: false, error: msg.slice(0, 500) }));
    }
  };
}
