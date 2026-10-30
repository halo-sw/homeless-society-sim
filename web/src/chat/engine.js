// Client-side chat engine (12b, B): the conversation pulls real data
// without a key. Same tools as the agent (extract_profile, find_homes,
// scenarioFromProfile, simulate, compare) running in the browser over
// the served build (/data, /scenarios). No demo numbers: every figure
// carries its source, and empty states stay empty.
//
// Steps (each timed for the tool-call rows):
//   extractStep  text → profile (+ ≤2 questions for missing essentials)
//   searchStep   profile → candidates (per-region lazy homes index)
//   scenarioStep profile + picked homes → runnable scenario
//   runStep      scenario → worker runs + compare payload
// The live agent (dev key) posts the same flow to /api/consult; both
// paths render the same chat cards.

import { complexNameForHome, extract_profile, missingQuestions, runGate,
  scenarioFromProfile, TENURE_KO } from "../profile.js";
import { DEFAULT_HOME_SORT, find_homes } from "../homes.js";
import { assetUrl } from "../paths.js";
import { parseInterstationCsv } from "../transit/schedule.js";
import { compare as compareRuns } from "../engine/simulate.js";
import { regionsForNames, kindForName } from "../region-names.js";
import { fmtMoney, currencyOf } from "../money/currency.js";

export const HOMES_SUMMARY_URL = assetUrl("/data/homes/summary.json");
export const HOMES_REGION_URL = (id) => assetUrl(`/data/homes/${id}.json`);
export const NETWORK_URL = assetUrl("/data/region/network.json");
export const SCHEDULE_URL = assetUrl("/scenarios/transit/seoul-metro-interstation.csv");
export const PHOTOS_MANIFEST_URL = assetUrl("/scenarios/places/commons-photos.json");
export const NAMED_PHOTOS_URL = assetUrl("/scenarios/places/commons-named.json");
export const REGIONS_URL = assetUrl("/data/regions.json");
export const CORRIDOR_TILES_URL = assetUrl("/data/region/corridor/c1/manifest.json");
const CORRIDOR_TILE_URL = (id) => assetUrl(`/data/region/corridor/c1/tiles/${id}.json`);
export const PAYROLL_URL = assetUrl("/scenarios/assumptions/kr-payroll.json");
export const BOX_AREA_URL = (boxId) => assetUrl(`/data/${boxId}/area.json`);
export const WALKGRAPH_URL = (regionId) => assetUrl(`/data/walkgraph/${regionId}.json`);

export function stationNames(network) {
  const names = new Set();
  for (const line of (network && network.lines) || []) {
    for (const s of line.stops || []) {
      if (s && s.name) names.add(String(s.name).replace(/역$/, ""));
    }
  }
  return [...names];
}

function timed(fn) {
  const t0 = Date.now();
  const out = fn();
  if (out && typeof out.then === "function") {
    return out.then((v) => ({ value: v, ms: Date.now() - t0 }));
  }
  return { value: out, ms: Date.now() - t0 };
}

// --- loaders (fetch-injected; null-tolerant — missing data degrades to
// honest unknown, never a guess) -----------------------------------------------

export async function loadHomesSummary(fetchJson) {
  try {
    const doc = await fetchJson(HOMES_SUMMARY_URL);
    const regions = doc && doc.regions ? Object.keys(doc.regions) : [];
    if (regions.length === 0) return null;
    return { regions, doc };
  } catch {
    return null;
  }
}

// Merged index over the wanted region files (lazy: only the listed
// regions load; `null` loads every region in the summary).
export async function loadHomesIndex(fetchJson, regionIds = null, onProgress = null) {
  const summary = await loadHomesSummary(fetchJson);
  const fallbackRegions = ["seongdong", "songpa-gu", "gangnam", "gangdong",
    "bundang", "sujeong", "jungwon", "suji", "wirye"];
  const ids = Array.isArray(regionIds) && regionIds.length > 0
    ? regionIds
    : (summary ? summary.regions : fallbackRegions);
  const homes = [];
  let done = 0;
  for (const id of ids) {
    try {
      const doc = await fetchJson(HOMES_REGION_URL(id));
      for (const h of (doc && doc.homes) || []) homes.push(h);
    } catch {
      // A missing region file narrows coverage (reported), never fails.
    }
    done += 1;
    if (onProgress) onProgress({ done, total: ids.length, region: id });
  }
  return { homes, regions: ids, summary: summary ? summary.doc : null };
}

export async function loadNetwork(fetchJson) {
  try {
    const doc = await fetchJson(NETWORK_URL);
    return doc && Array.isArray(doc.lines) ? doc : null;
  } catch {
    return null;
  }
}

// Corridor ground tiles intersecting a lon/lat bbox (tiny files with
// real 시군구 boundaries + open water). Null-tolerant: the stage map
// paints fine without them.
export async function loadCorridorTiles(fetchJson, bbox) {
  try {
    const manifest = await fetchJson(CORRIDOR_TILES_URL);
    const tiles = (manifest && manifest.tiles) || [];
    const hit = (t) => {
      const b = t && t.bounds;
      if (!bbox || !Array.isArray(b)) return true;
      return b[0] <= bbox[2] && b[2] >= bbox[0] && b[1] <= bbox[3] && b[3] >= bbox[1];
    };
    const wanted = tiles.filter(hit).slice(0, 24);
    const docs = await Promise.all(wanted.map((t) =>
      fetchJson(CORRIDOR_TILE_URL(t.id)).catch(() => null)));
    return docs.filter(Boolean);
  } catch {
    return [];
  }
}

export async function loadSchedule(fetchText) {
  try {
    const text = await fetchText(SCHEDULE_URL);
    if (!text) return null;
    return parseInterstationCsv(text);
  } catch {
    return null;
  }
}

export async function loadPhotosManifest(fetchJson) {
  try {
    const doc = await fetchJson(PHOTOS_MANIFEST_URL);
    return doc && Array.isArray(doc.items) ? doc : null;
  } catch {
    return null;
  }
}

// 13: name-searched Commons photos ({kind: station|complex,
// target: station:<name>|home:<id>}). May still be in progress —
// null degrades to street photos + our own 3D thumbnail.
export async function loadNamedPhotos(fetchJson) {
  try {
    const doc = await fetchJson(NAMED_PHOTOS_URL);
    return doc && Array.isArray(doc.items) ? doc : null;
  } catch {
    return null;
  }
}

export async function loadRegions(fetchJson) {
  try {
    const doc = await fetchJson(REGIONS_URL);
    return doc && Array.isArray(doc.regions) ? doc : null;
  } catch {
    return null;
  }
}

// 26l: regions.json holds both countries now — keep the US region out
// of Korean views (and vice versa). A missing country counts as KR.
export function regionsForCurrency(doc, currency) {
  const want = currency === "USD" ? "US" : "KR";
  const list = (doc && doc.regions) || [];
  const regions = list.filter((r) => ((r && r.country) || "KR") === want);
  return { ...(doc || {}), regions };
}

// 18: payroll rule table for the custom-run money doc (same file
// money.mjs reads). Null when unserved — the builder then refuses and
// the card says so honestly.
export async function loadPayroll(fetchJson) {
  try {
    const doc = await fetchJson(PAYROLL_URL);
    return doc && doc.social_insurance ? doc : null;
  } catch {
    return null;
  }
}

// Box area with {"$ref": file} sections inlined (same as sim-worker).
export async function loadBoxArea(fetchJson, boxId) {
  const area = await fetchJson(BOX_AREA_URL(boxId));
  for (const [key, value] of Object.entries(area || {})) {
    if (value && typeof value === "object" && !Array.isArray(value)
        && Object.keys(value).join() === "$ref") {
      area[key] = await fetchJson(assetUrl(`/data/${boxId}/${value.$ref}`));
    }
  }
  return area;
}

// --- steps ---------------------------------------------------------------------

export function extractStep(text, current, stations) {
  return timed(() => extract_profile(text, current || null, { stations: stations || [] }));
}

export function searchStep(profile, index, data = {}, opts = {}) {
  return timed(() => find_homes(profile, index, {
    sort: opts.sort || DEFAULT_HOME_SORT,
    limit: opts.limit !== undefined ? opts.limit : 6,
    regions: opts.regions || null,
    kind: kindForName(opts.kind) || opts.kind || null,
    network: data.network || null,
    schedule: data.schedule || null,
    boxes: null, // client pass: must-have minutes stay unmeasured…
    photos: data.manifest || null,
  }));
}

// …then re-run with the loaded box graphs so must-have minutes filter
// honestly (same two-pass shape as the server tool). 13: region walk
// graphs load too, so sceneless homes get real measured walk minutes
// ("도보 미확인" only when the graph can't reach a station).
export async function loadWalkgraph(fetchJson, regionId) {
  if (!regionId) return null;
  try {
    const doc = await fetchJson(WALKGRAPH_URL(regionId));
    return doc && doc.nodes && doc.stations ? doc : null;
  } catch {
    return null;
  }
}

export async function searchWithBoxes(fetchJson, profile, index, prelim, data = {}, opts = {}) {
  const boxes = new Map();
  const ids = [...new Set((prelim.candidates || []).map((h) => h.scene).filter(Boolean))].slice(0, 12);
  for (const id of ids) {
    try {
      const area = await loadBoxArea(fetchJson, id);
      boxes.set(id, { graph: area.graph || null, pois: area.pois || [] });
    } catch {
      // Unloadable box: minutes stay null (honest unknown).
    }
  }
  const walkgraphs = data.walkgraphs instanceof Map ? data.walkgraphs : new Map();
  const regionIds = [...new Set((prelim.candidates || []).map((h) => h.region).filter(Boolean))].slice(0, 12);
  for (const id of regionIds) {
    if (walkgraphs.has(id)) continue;
    const graph = await loadWalkgraph(fetchJson, id);
    if (graph) walkgraphs.set(id, graph);
  }
  return find_homes(profile, index, {
    sort: opts.sort || prelim.sort || DEFAULT_HOME_SORT,
    limit: opts.limit !== undefined ? opts.limit : 6,
    regions: opts.regions || null,
    kind: kindForName(opts.kind) || opts.kind || null,
    network: data.network || null,
    schedule: data.schedule || null,
    boxes,
    photos: data.manifest || null,
    walkgraphs,
    walkMps: Number.isFinite(opts.walkMps) ? opts.walkMps : null,
  });
}

export async function scenarioStep(fetchJson, profile, homes, data = {}) {
  const areas = new Map();
  const cached = data.areas instanceof Map ? data.areas : null;
  for (const h of homes) {
    if (!h.scene) throw new Error(`${h.name}: 3D 장면이 없어 살아 보기를 못 해요`);
    if (!areas.has(h.scene)) {
      areas.set(h.scene, cached && cached.has(h.scene)
        ? cached.get(h.scene)
        : await loadBoxArea(fetchJson, h.scene));
    }
  }
  return timed(() => scenarioFromProfile(profile, homes, {
    areas,
    network: data.network || null,
    schedule: data.schedule || null,
  }));
}

// Scene-complex join for a candidate (same verbatim rule as the
// engine's resolveHome): PNU join first (register matches, exactly
// like the server's build_scenario), else the pipeline-validated OSM
// complex name verbatim (osm_name matches), else nothing — never a
// fuzzy guess. Returns the complex name or null.
export function complexNameForCandidate(candidate, area) {
  if (!candidate || !area) return null;
  const viaPnu = complexNameForHome(candidate, area);
  // complexNameForHome falls back to home.name without a PNU — only
  // accept it when the area really holds that complex verbatim.
  const names = new Set((area.complexes || []).map((c) => c && c.name).filter(Boolean));
  if (viaPnu && names.has(viaPnu)) return viaPnu;
  if (candidate.osm_name && names.has(candidate.osm_name)) return candidate.osm_name;
  if (candidate.name && names.has(candidate.name)) return candidate.name;
  return null;
}

// Can this candidate run? Three kinds: "3d" (scene + walk + position),
// "map" (no scene, but walk + position — 2D map simulation), or not
// ready. Homes without a named complex in the scene (officetels,
// villas) anchor on their footprint centroid (engine coordinate
// fallback); the returned anchor says which path the run will take.
export function simReadyFor(candidate, area) {
  if (!candidate) return { ready: false, kind: "none", reason: "후보 정보가 없어요" };
  // 26d: a US work estimate (assumed-speed minutes) runs the sim even
  // when the station walk is unknown. Reason strings are unchanged.
  const workMin = candidate.commute && candidate.commute.work
    ? candidate.commute.work.minutes : null;
  if (!Number.isFinite(workMin)
      && (!candidate.commute || !candidate.commute.walk || !candidate.commute.walk.known)) {
    return { ready: false, kind: "none", reason: "도보 시간이 확인되지 않아요" };
  }
  if (!Number.isFinite(candidate.lon) || !Number.isFinite(candidate.lat)) {
    return { ready: false, kind: "none", reason: "집 위치가 확인되지 않아요" };
  }
  if (!candidate.scene) {
    return { ready: true, kind: "map", complex: null, anchor: "coordinate", reason: "" };
  }
  const complex = area ? complexNameForCandidate(candidate, area) : null;
  return { ready: true, kind: "3d", complex,
    anchor: complex ? "complex" : "coordinate", reason: "" };
}

// Candidate row → scenarioFromProfile home (station walk + PNU join).
// resolvedName is the complexNameForCandidate result: the engine
// anchors on the verbatim scene complex (PNU join, else the validated
// OSM name) — never on the raw listing name.
export function homeForScenario(candidate, resolvedName) {
  const walk = (candidate.commute && candidate.commute.walk) || {};
  return {
    id: candidate.id,
    name: resolvedName || candidate.name,
    scene: candidate.scene,
    pnu: candidate.pnu || null,
    station: walk.known ? { station: walk.station, walk_minutes: walk.minutes } : null,
    lon: candidate.lon,
    lat: candidate.lat,
  };
}

// Browser worker runner (progress posts per home). Guarded: no Worker
// outside the browser (tests inject their own runWorker).
export function createWorkerRunner(makeWorkerOrUrl, { timeoutMs = 180000 } = {}) {
  const makeWorker = typeof makeWorkerOrUrl === "function"
    ? makeWorkerOrUrl
    : () => new Worker(makeWorkerOrUrl, { type: "module" });
  if (typeof makeWorkerOrUrl !== "function" && typeof Worker === "undefined") {
    throw new Error("sim worker needs a browser Worker");
  }
  return (scenarioInline, labels, onProgress = () => {}) => new Promise((resolve, reject) => {
    let worker;
    try {
      worker = makeWorker();
    } catch (err) {
      reject(err);
      return;
    }
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error("sim worker timed out"));
    }, timeoutMs);
    worker.onmessage = (e) => {
      const d = e.data || {};
      if (d.progress) {
        onProgress(d.progress);
        return;
      }
      clearTimeout(timer);
      worker.terminate();
      if (d.ok) resolve(d.runs);
      else reject(new Error(d.error || "sim worker failed"));
    };
    worker.onerror = (err) => {
      clearTimeout(timer);
      worker.terminate();
      reject(err);
    };
    worker.postMessage({ scenarioInline, labels });
  });
}

// runWorker(scenarioInline, labels, onProgress) runs the engine off the
// main thread (chat-worker.js in the browser; injected in tests).
export async function runStep(runWorker, scenario, labels, onProgress = null) {
  const t0 = Date.now();
  const runs = await runWorker(scenario, labels, onProgress || (() => {}));
  const ordered = labels.map((l) => runs[l]).filter(Boolean);
  if (ordered.length < 2) {
    throw new Error("살아 보기는 집 2곳 이상을 골라야 비교할 수 있어요");
  }
  const cmp = compareRuns(ordered[0], ordered[1]);
  return { runs, compare: cmp, ms: Date.now() - t0 };
}

// --- profile presentation -------------------------------------------------------

function profileValue(profile, key) {
  const f = profile && profile[key];
  return f ? f.value : null;
}

const SOURCE_KO = { customer: "내가 말한 값", default: "기본값", derived: "계산한 값",
  asked: "물어볼 값" };

export function sourceKo(source) {
  return SOURCE_KO[source] || "";
}

export function fieldRows(profile) {
  const rows = [];
  const push = (key, label, fmt) => {
    const f = profile && profile[key];
    if (!f) return;
    const v = f.value;
    const empty = v === null || v === undefined || v === ""
      || (Array.isArray(v) && v.length === 0);
    if (empty) {
      rows.push({ key, label, value: v, source: "asked", note: "",
        text: "아직 몰라요" });
      return;
    }
    rows.push({ key, label, value: v, source: f.source || "",
      note: f.note || "", text: fmt(v, f) });
  };
  // 26c: money fields render in the profile's currency (KRW output
  // is fmtWon, byte-identical to before).
  const cur = currencyOf(profile);
  const won = (v) => (v === null || v === undefined ? "아직" : fmtMoney(v, cur));
  push("members", "함께 사는 사람", (v) => {
    if (!Array.isArray(v) || v.length === 0) return "아직";
    return `${v.length}인`;
  });
  push("workplaces", "출근", (v) => {
    if (!Array.isArray(v) || v.length === 0 || !v[0]) return "아직";
    const w = v[0];
    if (w.noCommute) return "출근 안 해요";
    const where = (w.resolved
      && (w.resolved.station || (w.resolved.place && w.resolved.place.name)))
      || w.text || "모름";
    return `${where}${w.resolved ? "" : " (모름)"}`;
  });
  push("salaryAnnual", "연봉", (v) => {
    if (!Array.isArray(v) || v.length === 0) return "아직";
    return v.map((x) => fmtMoney(x, cur)).join(" · ");
  });
  push("cash", "모은 돈", won);
  push("tenure", "살고 싶은 형태", (v) => (v ? TENURE_KO[v] || v : "아직"));
  push("depositMax", "보증금 상한", won);
  push("monthlyMax", "한 달 상한", won);
  push("priceMax", "매매가 상한", won);
  push("sizeMin", "최소 크기", (v) => (v === null || v === undefined ? "아직" : `${v}㎡`));
  push("commuteMax", "출퇴근 상한", (v) => (v === null || v === undefined ? "아직" : `${v}분`));
  push("home_kinds", "원하는 유형", (v) => (
    !Array.isArray(v) || v.length === 0 ? "아직" : v.join("·")));
  return rows;
}

// "판교 출근 · 1인 · 전세 2억 이하" (top-bar chip; only set fields).
export function profileSummary(profile) {
  const bits = [];
  const wps = profileValue(profile, "workplaces");
  if (Array.isArray(wps) && wps.length > 0 && wps[0]) {
    if (wps[0].noCommute) {
      bits.push("출근 없이");
    } else {
      // 26c: a resolved place (Meta HQ) chips its place name.
      const where = (wps[0].resolved
        && (wps[0].resolved.station || (wps[0].resolved.place && wps[0].resolved.place.name)))
        || wps[0].text;
      if (where) bits.push(`${where} 출근`);
    }
  }
  const members = profileValue(profile, "members");
  if (Array.isArray(members) && members.length > 0) bits.push(`${members.length}인`);
  const tenure = profileValue(profile, "tenure");
  if (tenure && TENURE_KO[tenure]) {
    const budget = tenure === "jeonse" ? profileValue(profile, "depositMax")
      : tenure === "wolse" ? profileValue(profile, "monthlyMax")
        : tenure === "trade" ? profileValue(profile, "priceMax") : null;
    bits.push(budget !== null && budget !== undefined
      ? `${TENURE_KO[tenure]} ${fmtMoney(budget, currencyOf(profile))} 이하` : TENURE_KO[tenure]);
  }
  return bits.join(" · ");
}

export function missingChips(profile) {
  return missingQuestions(profile).map((q) => ({ field: q.field, ask: q.ask }));
}

export { regionsForNames, kindForName, missingQuestions, runGate };

export function profileHomeKinds(profile) {
  const v = profile && profile.home_kinds ? profile.home_kinds.value : null;
  return Array.isArray(v) ? v.filter(Boolean) : [];
}
