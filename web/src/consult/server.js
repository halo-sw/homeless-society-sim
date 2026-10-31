// Consult HTTP layer: POST /api/consult for vite dev only (Node-side).
//
// Same pattern as /api/judge: the key stays server-side (env), the browser
// sends the conversation + working scenario and shows the result. The
// server stores no conversations and no files — only derived run artifacts
// in a bounded in-memory cache (runs are deterministic and re-runnable).

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { providerConfig, completeWithTools } from "../judge/providers.js";
import { writeDiary } from "./diary.js";
import { writeReport } from "./report.js";
import { judgeHome } from "../judge/run.js";
import { runTurn } from "./agent.js";
import { BYOK_HEADER, resolveProxyKey, redactSecrets } from "./byok.js";
import { createRunCache } from "./tools.js";
import { createCsvBackend } from "../money/rtms.js";
import { normalizeSnapshot, createHousingApi, HOUSING_KEY_ENV } from "../money/housing.js";
import { parseInterstationCsv } from "../transit/schedule.js";

export const CONSULT_BODY_MAX = 1048576; // 1 MB (scenario + history)

// One NDJSON line for the streaming consult response.
export function ndjsonLine(ev) {
  return `${JSON.stringify(ev)}\n`;
}

export function validateReportBody(body) {
  const labels = body && body.labels;
  if (!Array.isArray(labels) || labels.length < 2 || labels.length > 3
      || !labels.every((l) => l === "A" || l === "B" || l === "C")) {
    throw new Error("labels must be an array of 2–3 of \"A\"|\"B\"|\"C\"");
  }
  for (const label of labels) {
    const run = body.runs && body.runs[label];
    if (!run || typeof run !== "object") {
      throw new Error(`runs.${label} must be an object`);
    }
    for (const [key, max] of [["trips", 3000], ["aways", 3000], ["decisions", 2000]]) {
      if (!Array.isArray(run[key]) || run[key].length > max) {
        throw new Error(`runs.${label}.${key} must be an array of at most ${max}`);
      }
    }
    const home = body.homes && body.homes[label];
    if (!home || typeof home !== "object" || Array.isArray(home)) {
      throw new Error(`homes.${label} must be an object`);
    }
  }
  if (!body.persona || typeof body.persona !== "string") {
    throw new Error("persona must be a string");
  }
  return true;
}

export function readBody(req, max = CONSULT_BODY_MAX) {
  // Platforms that already parsed the body (Vercel, the relay): reuse it
  // instead of the stream, under the same size limit.
  const parked = req && req.body !== undefined && req.body !== null ? req.body : undefined;
  if (parked !== undefined) {
    let text;
    if (typeof parked === "string") text = parked;
    else if (Buffer.isBuffer(parked)) text = parked.toString("utf8");
    else if (typeof parked === "object") text = JSON.stringify(parked);
    else text = String(parked);
    if (Buffer.byteLength(text, "utf8") > max) return Promise.reject(new Error("body too large"));
    return Promise.resolve(text);
  }
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

async function loadAreaFs(readText, areaCache, areaId) {
  if (areaCache.has(areaId)) return areaCache.get(areaId);
  const area = JSON.parse(await readText("data", `${areaId}/area.json`));
  for (const [key, value] of Object.entries(area)) {
    if (value && typeof value === "object" && !Array.isArray(value)
        && Object.keys(value).join() === "$ref") {
      area[key] = JSON.parse(await readText("data", `${areaId}/${value.$ref}`));
    }
  }
  areaCache.set(areaId, area);
  return area;
}

// Bounding boxes for destination-area discovery (stage 9c): the full
// area.json parses are cached, so the four candidates cost one read.
async function loadAreaMetaFs(readText, areaMetaCache, areaId) {
  if (areaMetaCache.has(areaId)) return areaMetaCache.get(areaId);
  const doc = JSON.parse(await readText("data", `${areaId}/area.json`));
  const meta = { bbox: doc.bbox || null };
  areaMetaCache.set(areaId, meta);
  return meta;
}

async function loadRegionFs(readText) {
  const region = {};
  for (const [key, file] of [["network", "network.json"], ["congestion", "congestion.json"]]) {
    try {
      region[key] = JSON.parse(await readText("data", `region/${file}`));
    } catch {
      region[key] = null;
    }
  }
  if (!region.network && !region.congestion) return null;
  return region;
}

async function loadSafetyFs(readText) {
  return JSON.parse(await readText("data", "region/safety.json"));
}

async function loadPersonaFs(readText, personaId) {
  if (!/^[a-z0-9-]+$/.test(personaId)) throw new Error("bad persona id");
  return JSON.parse(await readText("scen", `personas/${personaId}.json`));
}

async function loadDecisionsFs(readText, scenarioName, label) {
  for (const provider of ["meta", "baseten"]) {
    try {
      const raw = await readText("scen", `decisions/${scenarioName}-${label}-${provider}.json`);
      return JSON.parse(raw);
    } catch { /* try the next provider file */ }
  }
  return null;
}

// 26y: the Menlo Park file for US searches. Same readText reader as
// every other data file, so the relay needs no change. Missing file
// reads as empty — find_homes then fails honestly instead of falling
// back to Korean homes.
export function createUsHomesLoader(read) {
  let cache = null;
  return async () => {
    if (!cache) {
      try {
        const doc = JSON.parse(await read("data", "homes/us-menlo.json"));
        cache = (doc && doc.homes) || [];
      } catch {
        cache = [];
      }
    }
    return cache;
  };
}

// Read data/scenario files over HTTP (the public relay has no data dir).
// base always ends in "/"; a non-2xx answer throws.
export function httpReadText(baseUrl, fetchImpl) {
  const base = String(baseUrl || "");
  const root = base.endsWith("/") ? base : `${base}/`;
  const get = fetchImpl || fetch;
  return async (kind, rel) => {
    const url = `${root}${kind === "data" ? "data" : "scenarios"}/${rel}`;
    const res = await get(url);
    if (!res.ok) throw new Error("not found: " + rel);
    return await res.text();
  };
}

export async function mergeHomesIndex(index, summary, readRegion) {
  const regionIds = [...new Set([...Object.keys((summary && summary.regions) || {}), ...Object.keys((summary && summary.other_regions) || {})])];
  const list = Array.isArray(index) ? index : (index.homes || []);
  const haveRegions = new Set();
  for (const h of list) { if (h && h.region) haveRegions.add(h.region); }
  for (const id of regionIds) {
    if (haveRegions.has(id)) continue;
    try {
      const raw = await readRegion(id);
      const extra = Array.isArray(raw) ? raw : (raw.homes || []);
      for (const h of extra) {
        if (h && !h.region) h.region = id;
        list.push(h);
      }
      haveRegions.add(id);
    } catch { /* a missing region file narrows coverage, never throws */ }
  }
  return index;
}

export function createHomesLoader(read) {
  let homesCache = null;
  return async () => {
    if (!homesCache) {
      homesCache = JSON.parse(await read("data", "homes-index.json"));
      try {
        const summary = JSON.parse(await read("data", "homes/summary.json"));
        await mergeHomesIndex(homesCache, summary, async (id) =>
          JSON.parse(await read("data", `homes/${id}.json`)));
      } catch { /* a missing summary narrows coverage, never throws */ }
    }
    return homesCache;
  };
}

export function createConsultHandler({ dataDir, scenDir, rawDir = null, fetchImpl = null, readText = null, env = process.env } = {}) {
  // File reads go through readText(root, rel): "data" or "scen" plus a
  // "/"-joined relative path. The default reads the local dirs exactly
  // as before; the relay passes an HTTP reader instead.
  const read = readText || ((root, rel) =>
    readFile(join(root === "data" ? dataDir : scenDir, rel), "utf8"));
  const cache = createRunCache();
  const areaCache = new Map();
  const areaMetaCache = new Map();
  const rtmsCache = new Map();
  let payrollCache = null;
  let housingCache = null;
  const loadPayroll = async () => {
    if (!payrollCache) {
      payrollCache = JSON.parse(await read("scen", "assumptions/kr-payroll.json"));
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
    const key = env[HOUSING_KEY_ENV];
    if (!key) throw new Error("public-rental data needs the dev snapshot or HOUSING_API_KEY on the server");
    const api = createHousingApi({ key, fetchImpl: fetchImpl || fetch });
    const [complexes, notices] = await Promise.all([api.complexes(), api.notices()]);
    housingCache = normalizeSnapshot({ fetched_at: new Date().toISOString(), complexes, notices });
    return housingCache;
  };
  const loadHomes = createHomesLoader(read);
  const loadUsHomes = createUsHomesLoader(read);
  let photosCache = null;
  const loadPhotos = async () => {
    if (!photosCache) {
      photosCache = JSON.parse(await read("scen", "places/commons-photos.json"));
    }
    return photosCache;
  };
  let areasIndexCache = null;
  const loadAreasIndex = async () => {
    if (!areasIndexCache) {
      areasIndexCache = JSON.parse(await read("data", "areas-index.json"));
    }
    return areasIndexCache;
  };
  let stationBoxesCache = null;
  const loadStationBoxes = async () => {
    if (!stationBoxesCache) {
      stationBoxesCache = JSON.parse(await read("data", "station-boxes.json"));
    }
    return stationBoxesCache;
  };
  let transitCache = null;
  const loadTransit = async () => {
    if (!transitCache) {
      const text = await read("scen", "transit/seoul-metro-interstation.csv");
      transitCache = parseInterstationCsv(text);
    }
    return transitCache;
  };
  let groundTruthCache = null;
  const assumptionCache = new Map();
  const ASSUMPTION_ALLOWLIST = new Set([
    "kr-payroll.json", "kr-ownership-costs.json", "kr-jeonse-checklist.json",
    "kr-support-programs.json",
  ]);
  const loadAssumption = async (name) => {
    if (!ASSUMPTION_ALLOWLIST.has(name)) throw new Error(`unknown assumption file ${JSON.stringify(name)}`);
    if (!assumptionCache.has(name)) {
      assumptionCache.set(name,
        JSON.parse(await read("scen", `assumptions/${name}`)));
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
        provider, env,
      });
      if (!apiKey) {
        const keyNames = (cfg.keyEnvFallback && cfg.keyEnvFallback.length)
          ? `${cfg.keyEnv} (or ${cfg.keyEnvFallback.join(", ")})`
          : cfg.keyEnv;
        const err = new Error(`${keyNames} is not set on the dev server`);
        err.code = "missing_key";
        throw err;
      }
      if (body.task === "diary") {
        if (!Array.isArray(body.digests) || body.digests.length < 1 || body.digests.length > 3) {
          throw new Error("digests must be an array of 1–3");
        }
        for (const d of body.digests) {
          if (!d || !Array.isArray(d.facts) || d.facts.length > 60) {
            throw new Error("each digest must have at most 60 facts");
          }
        }
        // 26s: the UI language travels like context.lang does for the
        // agent — explicit `lang` wins, else the request context.
        const diaryLang = typeof body.lang === "string" && body.lang !== ""
          ? body.lang
          : (body.context && body.context.lang) || "ko";
        const out = await writeDiary({
          complete: (args) => completeWithTools({ ...args, fetchImpl: fetchImpl || fetch, apiKey }),
          provider,
          digests: body.digests,
          lang: diaryLang,
        });
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(out));
        return;
      }
      if (body.task === "report") {
        validateReportBody(body);
        if (!groundTruthCache) {
          groundTruthCache = JSON.parse(await read("scen", "verify/ground_truth.json"));
        }
        const call = (args) => completeWithTools(
          { ...args, fetchImpl: fetchImpl || fetch, apiKey });
        const reportLang = typeof body.lang === "string" && body.lang !== ""
          ? body.lang
          : (body.context && body.context.lang) || "ko";
        const reportArgs = {
          call, provider,
          runs: body.runs, labels: body.labels, homes: body.homes,
          names: body.names || {},
          persona: body.persona, groundTruth: groundTruthCache,
          lang: reportLang,
        };
        if (body.stream === true) {
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/x-ndjson");
          res.flushHeaders?.();
          const out = await writeReport({
            ...reportArgs,
            onAttempt: (a) => {
              try {
                res.write(ndjsonLine({ type: "attempt", ...a }));
              } catch { /* a slow reader must not break the report */ }
            },
          });
          res.write(ndjsonLine({ type: "done", ...out }));
          res.end();
          return;
        }
        const out = await writeReport(reportArgs);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(out));
        return;
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
      const turnArgs = {
        provider,
        apiKey,
        keyFrom,
        messages: Array.isArray(body.messages) ? body.messages : [],
        scenario: body.scenario,
        context: body.context && typeof body.context === "object" ? body.context : null,
        cache,
        loadArea: (areaId) => loadAreaFs(read, areaCache, areaId),
        loadAreaMeta: (areaId) => loadAreaMetaFs(read, areaMetaCache, areaId),
        loadDecisions: (name, label) => loadDecisionsFs(read, name, label),
        loadRegion: () => loadRegionFs(read),
        judgeHome: (args) => judgeHome({ ...args, fetchImpl }),
        loadPayroll, loadRtms, loadHousing,
        loadSafety: () => loadSafetyFs(read),
        loadPersona: (id) => loadPersonaFs(read, id),
        loadAssumption,
        loadHomes, loadUsHomes, loadPhotos, loadAreasIndex, loadStationBoxes, loadTransit,
        fetchImpl,
      };
      if (body.stream === true) {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.flushHeaders?.();
        try {
          const out = await runTurn({
            ...turnArgs,
            onEvent: (ev) => {
              try {
                res.write(ndjsonLine(ev));
              } catch { /* a slow reader must not break the turn */ }
            },
          });
          res.write(ndjsonLine({ type: "done", ...out }));
          res.end();
        } catch (err) {
          const msg = redactSecrets(String((err && err.message) || err),
            [typeof byok === "string" ? byok : ""]).slice(0, 500);
          try {
            res.write(ndjsonLine({ type: "error", error: msg }));
          } catch { /* headers already sent; just end */ }
          res.end();
        }
        return;
      }
      const out = await runTurn(turnArgs);
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
