#!/usr/bin/env node
// Money-data CLI: precompute living-cost + price + QoL data for the UI.
//
//   node web/scripts/money.mjs --scenario scenarios/demo-two-homes.json --out data/build/sim/
//
// Reads data/build/<area>, runs the engine in-process (rules), loads RTMS
// CSVs (data/raw/rtms) and the payroll table, and writes
// <out>/<name>-money.json: household net, per-home price references, per
// tenure living-cost timelines, and QoL time/convenience axes. The UI
// renders from this file (plus agent results for home C). Run it from
// anywhere; paths resolve from the repo root (the script's ../..).

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { canon } from "../src/engine/canonical.js";
import { CRITERIA_DOC_NAME, CRITERIA_VERSION, moneyOptsFromCriteria, resolveCriteria } from "../src/engine/criteria.js";
import { parseScenario } from "../src/engine/scenario.js";
import { loadDestArea } from "../src/engine/destload.js";
import { engineMetrics, runPaired } from "../src/engine/paired.js";
import { parseInterstationCsv } from "../src/transit/schedule.js";
import { Router } from "../src/engine/graph.js";
import { createCsvBackend } from "../src/money/rtms.js";
import { AREA_BUCKET_TOL_M2, matchAreaBucket, referencePrice } from "../src/money/prices.js";
import { buildPnuIndex, matchRtmsRow, complexOfBuildings, 단지명Matches } from "../src/money/pnu.js";
import { householdMonthlyNet } from "../src/money/payroll.js";
import { tenureCost, TENURES } from "../src/money/tenure.js";
import { moneyTimeline } from "../src/money/timeline.js";
import { qualityCard } from "../src/money/quality.js";
import { buildPlaces } from "../src/engine/places.js";
import { resolveHome } from "../src/engine/scenario.js";
import { educationCounts, schoolRoute } from "../src/education.js";
import { safetyView } from "../src/safety.js";
import { jeonseRatio, registerSignals } from "../src/money/jeonse.js";
import { recommendPublicRental, normalizeSnapshot } from "../src/money/housing.js";
import { filterPublicListings } from "../src/money/listing.js";
import { AREA_RTMS_DISTRICT } from "../src/consult/tools-money.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");

function usage(exit = 2) {
  console.error("usage: money.mjs --scenario <json> --out <dir>");
  process.exit(exit);
}

function args(argv) {
  const out = { scenario: null, out: "data/build/sim" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--scenario") out.scenario = argv[++i];
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--help" || a === "-h") usage(0);
    else usage();
  }
  if (!out.scenario) usage();
  return out;
}

async function loadArea(areaId) {
  const dir = join(REPO, "data", "build", areaId);
  const area = JSON.parse(await readFile(join(dir, "area.json"), "utf8"));
  for (const [key, value] of Object.entries(area)) {
    if (value && typeof value === "object" && !Array.isArray(value)
        && Object.keys(value).join() === "$ref") {
      area[key] = JSON.parse(await readFile(join(dir, value.$ref), "utf8"));
    }
  }
  return area;
}

const opts = args(process.argv.slice(2));
const scenarioRaw = JSON.parse(await readFile(resolve(REPO, opts.scenario), "utf8"));

// Region data for journeys (stage 8): same files the sim CLI loads, so
// QoL fatigue matches the compare tab exactly.
async function loadRegion() {
  const dir = join(REPO, "data", "build", "region");
  const region = {};
  for (const [key, file] of [["network", "network.json"], ["congestion", "congestion.json"]]) {
    try {
      region[key] = JSON.parse(await readFile(join(dir, file), "utf8"));
    } catch {
      region[key] = null;
    }
  }
  if (!region.network && !region.congestion) return null;
  return region;
}
const region = await loadRegion();
// Fare table (stage 15.3): operator interstation km for lines 1–8 plus
// network stop coordinates for the straight-line × 1.2 fallback.
let fareSchedule = null;
try {
  fareSchedule = parseInterstationCsv(await readFile(
    join(REPO, "scenarios", "transit", "seoul-metro-interstation.csv"), "utf8"));
} catch {
  fareSchedule = null;
}
let fareStopCoords = null;
if (region && region.network) {
  fareStopCoords = new Map();
  for (const line of region.network.lines || []) {
    for (const s of line.stops || []) {
      if (s && s.id !== undefined && Number.isFinite(s.lon) && Number.isFinite(s.lat)) {
        fareStopCoords.set(s.id, [s.lon, s.lat]);
      }
    }
  }
}
// Safety stats (stage 9a): optional build artifact; the UI + consult say
// so honestly when it is missing.
let safetyDoc = null;
try {
  safetyDoc = JSON.parse(await readFile(join(REPO, "data", "build", "region", "safety.json"), "utf8"));
} catch {
  safetyDoc = null;
}
const scenario = parseScenario(structuredClone(scenarioRaw));
const table = JSON.parse(await readFile(join(REPO, "scenarios", "assumptions", "kr-payroll.json"), "utf8"));
// Stage 9b assumption files (committed, keyless) ride along for the UI.
const assumptions9b = {};
for (const file of ["kr-ownership-costs.json", "kr-jeonse-checklist.json", "kr-support-programs.json"]) {
  try {
    assumptions9b[file.replace(/^kr-|\.json$/g, "")] =
      JSON.parse(await readFile(join(REPO, "scenarios", "assumptions", file), "utf8"));
  } catch {
    assumptions9b[file.replace(/^kr-|\.json$/g, "")] = null;
  }
}
// supportRentals is filled after `net` below.
const net = householdMonthlyNet(scenario.money, scenario.household.members, table);
// Public-rental snapshot (dev-only, gitignored): candidates without
// commute minutes (the consult tool adds the graph commute live).
let supportRentals = null;
let housingSnap = null;
try {
  const snapRaw = JSON.parse(await readFile(
    join(REPO, "data", "raw", "public_housing", "snapshot_3districts.json"), "utf8"));
  housingSnap = normalizeSnapshot(snapRaw);
  supportRentals = recommendPublicRental(housingSnap, {
    monthlyNetWon: net.household_monthly_net_won,
    thresholdPct: scenario.money.burden_threshold_pct,
    targetAreaM2: scenario.money.area_m2[scenario.homes[0].label] || null,
    areaTolM2: 10,
    commuteMinutes: null,
    limit: 5,
  });
} catch {
  supportRentals = null;
  housingSnap = null;
}
const backend = createCsvBackend({
  rawDir: join(REPO, "data", "raw", "rtms"),
  readFile: (p) => readFile(p),
});
const rtmsCache = new Map();
async function rtmsFor(district) {
  if (!rtmsCache.has(district)) rtmsCache.set(district, await backend.loadAll(district));
  return rtmsCache.get(district);
}

const crit = resolveCriteria(scenario);
const A = moneyOptsFromCriteria(crit);
const homes = {};
const areasById = {};
for (const h of scenario.homes) {
  if (!areasById[h.area]) areasById[h.area] = await loadArea(h.area);
}
// Destination graph for place commutes (stage 9c): same resolution as
// the sim CLI, so money and compare read identical runs.
const metaCache = new Map();
async function listAreas() {
  const entries = await readdir(join(REPO, "data", "build"), { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name)
    .filter((n) => !["region", "sim", "_cache"].includes(n));
}
async function readAreaMeta(areaId) {
  if (!metaCache.has(areaId)) {
    const doc = JSON.parse(await readFile(join(REPO, "data", "build", areaId, "area.json"), "utf8"));
    metaCache.set(areaId, { bbox: doc.bbox || null });
  }
  return metaCache.get(areaId);
}
const prepByLabel = {};
const routersByLabel = {};
const pairedAreas = {};
const pairedDestAreas = {};
for (const h of scenario.homes) {
  const area = areasById[h.area];
  const router = new Router(area.graph);
  routersByLabel[h.label] = router;
  pairedAreas[h.label] = area;
  const destArea = await loadDestArea({ scenario, network: region && region.network,
    homeArea: area, listAreas, readAreaMeta, loadArea });
  if (destArea) pairedDestAreas[h.label] = destArea;
  // Price reference: parcel+name match, name-only fallback (< 3 rows).
  const district = AREA_RTMS_DISTRICT[h.area];
  const rows = district ? await rtmsFor(district) : [];
  const idx = buildPnuIndex(Array.isArray(area.buildings) ? area.buildings : []);
  const parcelHits = [];
  for (const r of rows) {
    const m = matchRtmsRow(r, idx);
    if (m.buildings.length === 0) continue;
    if (!complexOfBuildings(m.buildings, area.complexes).some((c) => c.name === h.complex_name)) continue;
    if (!단지명Matches(r.complex, h.complex_name)) continue;
    parcelHits.push(r);
  }
  const nameHits = rows.filter((r) => 단지명Matches(r.complex, h.complex_name));
  const used = parcelHits.length >= 3 ? parcelHits : nameHits;
  const matchMethod = parcelHits.length >= 3 ? "parcel+name" : "name-only";
  let ownAreaM2 = scenario.money.area_m2[h.label] || null;
  if (!ownAreaM2) {
    const areas = used.map((r) => r.area_m2).filter(Number.isFinite).sort((a, b) => a - b);
    ownAreaM2 = areas.length > 0 ? areas[Math.floor(areas.length / 2)] : null;
  }
  prepByLabel[h.label] = { home: h, area, parcelHits, nameHits, used,
    matchMethod, ownAreaM2 };
}
// Same-size anchor (stage 15.4): home A's area. Each other home uses
// the real-transaction bucket closest to the anchor when it sits within
// ±5㎡, else keeps its own area with an area_mismatch flag.
const anchorM2 = prepByLabel[scenario.homes[0].label].ownAreaM2;
for (const h of scenario.homes) {
  const prep = prepByLabel[h.label];
  let areaM2 = prep.ownAreaM2;
  let areaMatch = null;
  let areaMismatch = null;
  if (h.label !== scenario.homes[0].label) {
    const matched = matchAreaBucket(prep.used, anchorM2, prep.ownAreaM2);
    areaM2 = matched.area_m2;
    areaMatch = matched.area_match;
    if (!areaMatch && Number.isFinite(anchorM2) && Number.isFinite(prep.ownAreaM2)
        && Math.abs(prep.ownAreaM2 - anchorM2) > AREA_BUCKET_TOL_M2) {
      areaMismatch = { a: anchorM2, b: prep.ownAreaM2,
        diff_m2: Math.round(Math.abs(prep.ownAreaM2 - anchorM2) * 100) / 100 };
    }
  }
  const reference = areaM2 ? referencePrice(prep.used, { areaM2 }) : null;
  const priceInputs = (tenure) => {
    if (!reference) return { price_won: null, deposit_won: null, monthly_rent_won: null, source: "rtms" };
    if (tenure === "매매") return { price_won: reference.trade.median, source: "rtms" };
    if (tenure === "전세") return { price_won: reference.jeonse.deposit.median, source: "rtms" };
    if (tenure === "월세") {
      return { deposit_won: reference.wolse.deposit.median,
        monthly_rent_won: reference.wolse.monthly.median, source: "rtms" };
    }
    return { price_won: null, deposit_won: null, monthly_rent_won: null, source: "rtms" };
  };
  Object.assign(prep, { areaM2, areaMatch, areaMismatch, reference, priceInputs });
}
// Paired repeats across all homes (same 10 seeds by default); run 1
// feeds the per-home fields below, every run feeds runs_summary.
const spendOptsBase = {
  transit_fare_won: A.transit_fare_won, basket_won: A.basket_won,
  maintenance_won_month: A.maintenance_won_month, other_fixed_won_month: A.other_fixed_won_month,
  household_monthly_net_won: net.household_monthly_net_won,
  pay_day_of_month: A.pay_day_of_month, fixed_due_day_1based: A.fixed_due_day_1based,
  fare_schedule: fareSchedule, fare_stop_coords: fareStopCoords,
};
const housingFor = (label, tenure) => {
  if (tenure === "공공임대") return null;
  const prep = prepByLabel[label];
  const pi = prep.priceInputs(tenure);
  const hasPrice = [pi.price_won, pi.deposit_won, pi.monthly_rent_won].some((v) => Number.isFinite(v));
  if (!hasPrice) return null;
  return { pi, housing: tenureCost({ tenure, ...pi,
    cash_won: scenario.money.cash_won,
    loan_rate_pct: A.loan_rate_pct, loan_years: A.loan_years,
    jeonse_loan_cap_won: A.jeonse_loan_cap_won, source: pi.source }) };
};
const paired = runPaired(pairedAreas, scenarioRaw, {
  ...(region ? { region } : {}),
  ...(Object.keys(pairedDestAreas).length > 0 ? { destAreas: pairedDestAreas } : {}),
  summarize: (run, label) => {
    const m = engineMetrics(run);
    // Seed-matched scenario so the grocery spread falls on this run's
    // own planned errand days (totals never depend on the seed).
    const scForRun = run.meta.seed === scenario.seed ? scenario : { ...scenario, seed: run.meta.seed };
    const spend = moneyTimeline(run, scForRun, { ...spendOptsBase, housing_monthly_won: 0 });
    m.grocery_won = -spend.totals_by_category.grocery;
    m.transit_won = -spend.totals_by_category.transit;
    const rem = {};
    for (const tenure of TENURES) {
      const hh = housingFor(label, tenure);
      if (!hh) continue;
      const tl = moneyTimeline(run, scForRun, { ...spendOptsBase,
        housing_monthly_won: hh.housing.monthly_won, tenure, housing_source: hh.pi.source });
      rem[tenure] = tl.remaining_won;
    }
    m.remaining_won_per_month = rem;
    return m;
  },
});
for (const h of scenario.homes) {
  const { area, parcelHits, nameHits, used, matchMethod, areaM2, areaMatch, areaMismatch,
    reference, priceInputs } = prepByLabel[h.label];
  const router = routersByLabel[h.label];
  const run = paired.runs[0][h.label];
  const byTenure = {};
  for (const tenure of TENURES) {
    if (tenure === "공공임대") {
      byTenure[tenure] = null; // needs a candidate (agent add_home_c)
      continue;
    }
    const pi = priceInputs(tenure);
    const hasPrice = [pi.price_won, pi.deposit_won, pi.monthly_rent_won].some((v) => Number.isFinite(v));
    if (!hasPrice) {
      byTenure[tenure] = null;
      continue;
    }
    const housing = tenureCost({ tenure, ...pi,
      cash_won: scenario.money.cash_won,
      loan_rate_pct: A.loan_rate_pct, loan_years: A.loan_years,
      jeonse_loan_cap_won: A.jeonse_loan_cap_won, source: pi.source });
    const tl = moneyTimeline(run, scenario, {
      transit_fare_won: A.transit_fare_won, basket_won: A.basket_won,
      maintenance_won_month: A.maintenance_won_month, other_fixed_won_month: A.other_fixed_won_month,
      household_monthly_net_won: net.household_monthly_net_won,
      housing_monthly_won: housing.monthly_won, tenure, housing_source: pi.source,
      pay_day_of_month: A.pay_day_of_month, fixed_due_day_1based: A.fixed_due_day_1based,
      fare_schedule: fareSchedule, fare_stop_coords: fareStopCoords,
    });
    byTenure[tenure] = {
      housing, price_inputs: pi,
      totals_by_category: tl.totals_by_category,
      monthly_spent_won: tl.monthly_spent_won,
      remaining_won: tl.remaining_won,
      burden_ratio: tl.burden_ratio,
      counts: tl.counts,
      flags: tl.flags,
      daily_balance_won: tl.daily_balance_won,
      payday_note: tl.payday_note,
    };
  }
  // QoL time + convenience axes (money merges client-side per tenure).
  // POI ids ship alongside the counts for the 3D hover highlight.
  const qol = qualityCard(run, area, router, {}, crit.flat.convenience_minutes, { includeIds: true });
  // Education access + child school routes (stage 9a, Part D).
  const places = buildPlaces(area, router);
  let qolEducation = null;
  let schoolRoutes = [];
  try {
    const homeNode = resolveHome(area, h, router).nodeId;
    qolEducation = educationCounts(places, router, homeNode);
    schoolRoutes = run.agents
      .filter((a) => a.household && a.role === "child")
      .map((a) => ({ ...schoolRoute(run, router, a.key), label: a.label, id: a.id }));
  } catch {
    qolEducation = null;
    schoolRoutes = [];
  }
  const qolSafety = safetyView(safetyDoc, h.area);
  // Tenure-independent spending events for the Now-card ticker (transit,
  // grocery, salary, fixed — housing is monthly and lives in its tab).
  const spendTl = moneyTimeline(run, scenario, {
    transit_fare_won: A.transit_fare_won, basket_won: A.basket_won,
    maintenance_won_month: A.maintenance_won_month, other_fixed_won_month: A.other_fixed_won_month,
    household_monthly_net_won: net.household_monthly_net_won,
    housing_monthly_won: 0,
    pay_day_of_month: A.pay_day_of_month, fixed_due_day_1based: A.fixed_due_day_1based,
    fare_schedule: fareSchedule, fare_stop_coords: fareStopCoords,
  });
  // Stage 9b: jeonse ratio over the same matched rows + register signals
  // for the complex's buildings (thresholds resolve per scenario run).
  const jeonse = areaM2 ? jeonseRatio(used, {
    areaM2,
    cautionPct: crit.flat.jeonse_caution_pct,
    warningPct: crit.flat.jeonse_warning_pct,
  }) : null;
  const complexRec = (area.complexes || []).find((c) => c.name === h.complex_name);
  const complexBuildings = complexRec
    ? (Array.isArray(area.buildings) ? area.buildings : [])
      .filter((b) => (complexRec.building_ids || []).includes(b.id))
    : [];
  const register = registerSignals(complexBuildings);
  // 18: weekend/leisure outings from this home's own run-1 totals
  // (the same counters compare sums) — the score reads the money doc
  // only, so it never shifts when another panel opens.
  const hh = (run.totals && run.totals.household) || {};
  const leisureTrips = Math.round(((hh.errands_done || 0) + (hh.park_visits || 0)) * 10) / 10;
  homes[h.label] = {
    area: h.area, complex_name: h.complex_name, area_m2: areaM2,
    match_method: matchMethod,
    leisure_trips_30d: leisureTrips,
    parcel_rows: parcelHits.length, name_rows: nameHits.length,
    flags: { ...spendTl.flags,
      ...(areaMismatch ? { area_mismatch: areaMismatch } : {}) },
    area_match: areaMatch,
    reference, by_tenure: byTenure,
    jeonse_check: jeonse ? { ...jeonse, match_method: matchMethod } : null,
    register_signals: register,
    qol_time: qol.time, qol_convenience: qol.convenience,
    qol_fatigue: qol.fatigue,
    qol_education: qolEducation, school_routes: schoolRoutes,
    qol_safety: qolSafety,
    spending_events: spendTl.events,
  };
  console.log(JSON.stringify({ home: h.label, area_m2: areaM2, match: matchMethod,
    parcel: parcelHits.length, name: nameHits.length,
    tenures: Object.fromEntries(Object.entries(byTenure).map(([k, v]) =>
      [k, v ? v.housing.monthly_won : null])) }));
}

// Workplace: the first named destination/work station resolved to a
// station POI in the loaded areas (straight-line pin distance only).
function findWorkplace() {
  const wants = [];
  for (const m of scenario.household.members || []) {
    const w = m.work || {};
    const dst = w.destination_station;
    const dstName = typeof dst === "string" ? dst
      : dst && typeof dst === "object" ? Object.values(dst)[0] : null;
    const st = w.station_name;
    const stName = typeof st === "string" ? st
      : st && typeof st === "object" ? Object.values(st)[0] : null;
    if (dstName) wants.push(String(dstName));
    if (stName) wants.push(String(stName));
  }
  const stationPoi = (area) => (area.pois || []).filter((p) =>
    p.category === "railway:station" || p.category === "railway:stop");
  const matchName = (name, want) => name === want || name === `${want}역`
    || `${want}역` === name || name.startsWith(want) || want.startsWith(name);
  // Prefer full stations over stops.
  for (const cats of [["railway:station"], ["railway:stop"]]) {
    for (const want of wants) {
      for (const area of Object.values(areasById)) {
        for (const p of stationPoi(area)) {
          if (!cats.includes(p.category)) continue;
          const name = String(p.name || "");
          if (name && matchName(name, want)) {
            const [lon, lat] = (p.geometry && p.geometry.coordinates) || [];
            if (Number.isFinite(lon) && Number.isFinite(lat)) {
              return { label: name.endsWith("역") ? name : `${name}역`,
                lon, lat, area: area.area || area.id || null };
            }
          }
        }
      }
    }
  }
  return null;
}

// Public listings block: every snapshot complex (compact) with
// straight-line workplace distance, plus the newest notices (capped).
let publicListings = null;
if (housingSnap) {
  const workplace = findWorkplace();
  const shaped = filterPublicListings(housingSnap, {
    limit: Math.max(housingSnap.complexes.length, housingSnap.notices.length, 1),
    near: workplace ? { lon: workplace.lon, lat: workplace.lat, max_km: null } : null,
  });
  const NOTICE_CAP = 150;
  publicListings = {
    fetched_at: shaped.fetched_at,
    attribution: shaped.attribution,
    workplace,
    workplace_note: workplace
      ? `직장(${workplace.label})에서 직선 거리예요. 출퇴근 시간은 아니에요.`
      : "직장 위치를 찾지 못해서 거리를 재지 못했어요.",
    complexes: shaped.complexes.map((c) => ({
      ...c, distance_to_work_m: c.distance_km === null ? null : Math.round(c.distance_km * 1000),
    })),
    complex_total: shaped.complex_total,
    notices: shaped.notices.slice(0, NOTICE_CAP),
    notice_total: shaped.notice_total,
    notice_cap_note: shaped.notice_total > NOTICE_CAP
      ? `새로 올라온 순서대로 ${NOTICE_CAP}개만 담았어요.` : null,
    notes: shaped.notes,
  };
}

const doc = {
  scenario: scenario.name,
  days: scenario.days,
  payroll: { as_of: table.as_of, source: table.source },
  household_monthly_net_won: net.household_monthly_net_won,
  per_member_net: net.per_member,
  cash_won: scenario.money.cash_won,
  assumptions: { ...scenario.money.assumptions,
    transit_fare_won: A.transit_fare_won, basket_won: A.basket_won,
    maintenance_won_month: A.maintenance_won_month, other_fixed_won_month: A.other_fixed_won_month,
    pay_day_of_month: A.pay_day_of_month, fixed_due_day_1based: A.fixed_due_day_1based,
    loan_rate_pct: A.loan_rate_pct, loan_years: A.loan_years,
    jeonse_loan_cap_won: A.jeonse_loan_cap_won },
  burden_threshold_pct: crit.flat.burden_threshold_pct,
  criteria: { doc: CRITERIA_DOC_NAME, version: CRITERIA_VERSION, overrides: crit.overridden },
  default_tenure: scenario.money.tenure,
  homes,
  run_seeds: paired.seeds,
  runs_summary: paired.summary,
  assumptions9b,
  support_rentals: supportRentals,
  public_listings: publicListings,
};
const outDir = resolve(REPO, opts.out);
await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, `${scenario.name}-money.json`), `${canon(doc)}\n`, "utf8");
console.log(JSON.stringify({ file: join(opts.out, `${scenario.name}-money.json`) }));
