// Consult money tools (stage 6, Node-side): salary → living-cost answers.
//
// set_money / estimate_net_pay / price_reference / living_cost /
// recommend_public_rental / add_home_c. All numbers come from the payroll
// table, RTMS rows, the public-housing snapshot/API, or the engine run —
// the model only cites them. Guards (no forecasts, no loan/eligibility
// judgement, no buy/don't-buy) live in consult/guards.js + the prompt.

import { parseScenario, resolveHome, nameForHome } from "../engine/scenario.js";
import { moneyOptsFromCriteria, resolveCriteria } from "../engine/criteria.js";
import { Router } from "../engine/graph.js";
import { buildPlaces, stationsByName } from "../engine/places.js";
import { ADULT_MPS } from "../engine/agents.js";
import { buildPnuIndex, matchRtmsRow, complexOfBuildings, 단지명Matches } from "../money/pnu.js";
import { referencePrice, rowsForComplex } from "../money/prices.js";
import { estimateNetPay, memberMonthlyNet, householdMonthlyNet } from "../money/payroll.js";
import { tenureCost, TENURES } from "../money/tenure.js";
import { moneyTimeline } from "../money/timeline.js";
import { worthItComparison, applyOwnershipCosts,
  WORTHIT_HORIZONS, WORTHIT_DEFAULT_SCENARIOS } from "../money/worthit.js";
import { jeonseRatio, registerSignals, JEONSE_SPARSE_NOTE } from "../money/jeonse.js";
import { mockDepositLoss, MOCKLOSS_PATHS } from "../money/mockloss.js";
import { compareAllSupport } from "../money/support.js";
import {
  normalizeSnapshot, recommendPublicRental, noticesFor,
  ELIGIBILITY_NOTE,
} from "../money/housing.js";
import { fmtWon, fmtPct } from "../money/format.js";

export const AREA_RTMS_DISTRICT = {
  "songpa-jamsil": "songpa",
  "songpa": "songpa",
  "seongsu": "seongdong",
  "pangyo": "bundang",
};

function clone(value) {
  return structuredClone(value);
}

function fail(message) {
  return { ok: false, error: String(message).slice(0, 500) };
}

function needRun(session, id) {
  const hit = session.cache.runs.get(String(id));
  if (!hit) throw new Error(`unknown run ${JSON.stringify(id)} — call run_simulation first`);
  return hit;
}

async function needPayroll(session) {
  if (!session.loadPayroll) throw new Error("payroll table is unavailable on this server");
  return session.loadPayroll();
}

async function needRtms(session, district) {
  if (!session.loadRtms) throw new Error("RTMS data is unavailable on this server");
  return session.loadRtms(district);
}

async function needHousing(session) {
  if (!session.loadHousing) throw new Error("public-rental data is unavailable on this server");
  const snap = await session.loadHousing();
  return snap && snap.complexes ? snap : normalizeSnapshot(snap);
}

async function needAssumption(session, file) {
  if (!session.loadAssumption) throw new Error("assumption tables are unavailable on this server");
  return session.loadAssumption(file);
}

function pnuIndexFor(area) {
  const buildings = Array.isArray(area.buildings) ? area.buildings : [];
  return buildPnuIndex(buildings);
}

// --- set_money ---------------------------------------------------------------

async function set_money(session, args) {
  const patch = (args && args.patch) || args || {};
  if (!patch || typeof patch !== "object") return fail("patch must be an object");
  const next = clone(session.scenario);
  next.money = next.money || {};
  for (const [key, value] of Object.entries(patch)) {
    if (key === "members" || key === "tenure" || key === "assumptions" || key === "area_m2") {
      if (!value || typeof value !== "object") return fail(`money.${key} must be an object`);
      next.money[key] = { ...(next.money[key] || {}), ...clone(value) };
    } else if (key === "cash_won" || key === "burden_threshold_pct" || key === "home_c") {
      next.money[key] = clone(value);
    } else {
      return fail(`unknown money key ${JSON.stringify(key)} (want members, cash_won, tenure, assumptions, area_m2, burden_threshold_pct)`);
    }
  }
  let parsed;
  try {
    parsed = parseScenario(next);
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err).slice(0, 400) };
  }
  // Customer-set money numbers read as 고객 입력 in the criteria badges.
  for (const k of Object.keys((patch.assumptions) || {})) parsed._explicit[`money_${k}`] = true;
  if (patch.burden_threshold_pct !== undefined) parsed._explicit.money_burden_threshold_pct = true;
  session.scenario = parsed;
  let net = null;
  try {
    const table = await needPayroll(session);
    net = householdMonthlyNet(parsed.money, parsed.household.members, table);
  } catch { /* payroll unavailable: money still saved */ }
  return { ok: true, money: clone(parsed.money),
    household_monthly_net_preview: net,
    note: "가정값은 화면에서 언제든 바꿀 수 있습니다. 소득은 이 대화의 메모리에만 있습니다." };
}

// --- estimate_net_pay ----------------------------------------------------------

async function estimate_net_pay(session, args) {
  const table = await needPayroll(session).catch((err) => ({ __error: err }));
  if (table.__error) return fail(table.__error.message);
  const members = ((session.scenario.household) || {}).members || [];
  if (args.member !== undefined && args.member !== null) {
    const s = String(args.member);
    const mem = members.find((m, i) =>
      m.id === s || m.label === s || `m${i + 1}` === s || `h${i + 1}` === s);
    if (!mem) return fail(`unknown member ${JSON.stringify(args.member)}`);
    const entry = ((session.scenario.money || {}).members || {})[mem.id] || {};
    const r = memberMonthlyNet(entry, table);
    return { ok: true, member: mem.id, label: mem.label, ...r,
      formatted: fmtWon(r.monthly_net_won, { monthly: true }) };
  }
  const annual = Number(args.annual_salary_won);
  if (!Number.isFinite(annual) || annual <= 0) {
    return fail("pass annual_salary_won (> 0) or member (a scenario member id/label)");
  }
  const r = estimateNetPay(annual, table);
  return { ok: true, ...r, formatted: fmtWon(r.monthly_net_won, { monthly: true }) };
}

// --- price_reference -----------------------------------------------------------

function matchRowsToComplex(rows, area, complexName, index) {
  const complexes = area.complexes || [];
  const byId = new Map(complexes.map((c) => [c.id, c]));
  const parcelHits = [];
  for (const r of rows || []) {
    const m = matchRtmsRow(r, index);
    if (m.buildings.length === 0) continue;
    const names = complexOfBuildings(m.buildings, complexes);
    if (!names.some((c) => c.name === complexName)) continue;
    if (!단지명Matches(r.complex, complexName)) continue;
    parcelHits.push(r);
  }
  const nameHits = rowsForComplex(rows || [], { complexName });
  return { parcelHits, nameHits, byId };
}

async function price_reference(session, args) {
  const areaId = String(args.area || "");
  const complexName = String(args.complex || "");
  if (!areaId || !complexName) return fail("pass area (built area id) and complex (verbatim complex name)");
  const district = AREA_RTMS_DISTRICT[areaId];
  if (!district) return fail(`no RTMS district for area ${JSON.stringify(areaId)}`);
  let area;
  try {
    area = await session.loadArea(areaId);
  } catch (err) {
    return fail(`cannot load area ${areaId}: ${String((err && err.message) || err).slice(0, 200)}`);
  }
  if (!(area.complexes || []).some((c) => c.name === complexName)) {
    return fail(`no complex named ${JSON.stringify(complexName)} in ${areaId} — call list_complexes`);
  }
  const rows = await needRtms(session, district).catch((err) => ({ __error: err }));
  if (rows.__error) return fail(rows.__error.message);
  const { parcelHits, nameHits } = matchRowsToComplex(rows, area, complexName, pnuIndexFor(area));
  let used = parcelHits;
  let matchMethod = "parcel+name";
  if (used.length < 3 && nameHits.length > used.length) {
    used = nameHits;
    matchMethod = "name-only";
  }
  let areaM2 = Number(args.area_m2);
  if (!Number.isFinite(areaM2) || areaM2 <= 0) {
    const areas = used.map((r) => r.area_m2).filter(Number.isFinite).sort((a, b) => a - b);
    areaM2 = areas.length > 0 ? areas[Math.floor(areas.length / 2)] : null;
  }
  if (areaM2 === null) {
    return { ok: true, area: areaId, complex: complexName, match_method: matchMethod,
      parcel_rows: parcelHits.length, name_rows: nameHits.length,
      note: "같은 단지 실거래가 없습니다. 면적을 바꿔 다시 물어보세요." };
  }
  const ref = referencePrice(used, { areaM2 });
  return {
    ok: true, area: areaId, complex: complexName, area_m2: areaM2,
    match_method: matchMethod,
    match_note: matchMethod === "parcel+name"
      ? "시군구+본번/부번→PNU로 단지 필지를 맞추고 단지명으로 확인했습니다."
      : "필지 일치가 3건 미만이라 같은 단지명 전체로 넓혔습니다 (면적대는 ±5㎡).",
    parcel_rows: parcelHits.length, name_rows: nameHits.length,
    reference: ref,
  };
}

// --- living_cost -----------------------------------------------------------------

async function living_cost(session, args) {
  let hit;
  try {
    hit = needRun(session, args.run);
  } catch (err) {
    return fail(err.message);
  }
  const run = hit.run;
  const scenario = parseScenario(clone(session.scenario));
  const tenure = args.tenure || (scenario.money.tenure || {})[hit.home] || "전세";
  if (!TENURES.includes(tenure)) {
    return fail(`unknown tenure ${JSON.stringify(tenure)} (want ${TENURES.join("/")})`);
  }
  const table = await needPayroll(session).catch((err) => ({ __error: err }));
  if (table.__error) return fail(table.__error.message);
  const net = householdMonthlyNet(scenario.money, scenario.household.members, table);
  // Criteria-resolved money values (criteria_overrides apply), so consult
  // and money.mjs timelines agree for the same scenario.
  const A = moneyOptsFromCriteria(resolveCriteria(scenario));

  // Price inputs: explicit won args win (the model's cited medians), else
  // the RTMS median for this home's complex at the requested area.
  let price = {
    price_won: args.price_won ?? null,
    deposit_won: args.deposit_won ?? null,
    monthly_rent_won: args.monthly_rent_won ?? null,
    source: "user_input",
    area_m2: args.area_m2 ?? null,
  };
  let refNote = "";
  if (price.price_won === null && price.deposit_won === null && price.monthly_rent_won === null) {
    const pref = await price_reference(session, {
      area: run.meta.area, complex: run.meta.complex, area_m2: args.area_m2,
    });
    if (!pref.ok) return pref;
    if (!pref.reference) {
      return { ok: false, error: `no reference price for ${run.meta.complex} — pass explicit price_won/deposit_won/monthly_rent_won` };
    }
    const ref = pref.reference;
    price = {
      price_won: tenure === "매매" ? ref.trade.median
        : tenure === "전세" ? ref.jeonse.deposit.median : null,
      deposit_won: tenure === "월세" ? ref.wolse.deposit.median
        : tenure === "공공임대" ? (args.deposit_won ?? null) : null,
      monthly_rent_won: (tenure === "월세" || tenure === "공공임대") ? ref.wolse.monthly.median : null,
      source: "rtms",
      area_m2: pref.area_m2,
      match_method: pref.match_method,
      period: ref.period,
      disclaimer: ref.disclaimer,
    };
    refNote = `기준가: ${run.meta.complex} ${pref.area_m2}㎡ (${pref.match_method}, ${ref.period.from}~${ref.period.to})`;
  }
  if (tenure === "공공임대" && (price.deposit_won === null || price.monthly_rent_won === null)) {
    const hc = scenario.money.home_c;
    if (hc && Number.isFinite(hc.deposit_won) && Number.isFinite(hc.monthly_rent_won)) {
      price.deposit_won = hc.deposit_won;
      price.monthly_rent_won = hc.monthly_rent_won;
      price.source = "housing_api";
      refNote = `공공임대 후보 ${hc.address || ""} ${hc.unit_type || ""}형`;
    } else {
      return fail("공공임대 living_cost needs home C (add_home_c) or explicit deposit_won/monthly_rent_won");
    }
  }
  let housing;
  try {
    housing = tenureCost({
      tenure,
      price_won: price.price_won, deposit_won: price.deposit_won, monthly_rent_won: price.monthly_rent_won,
      cash_won: scenario.money.cash_won,
      loan_rate_pct: A.loan_rate_pct, loan_years: A.loan_years,
      source: price.source,
    });
  } catch (err) {
    return fail(err.message);
  }
  const tl = moneyTimeline(run, scenario, {
    transit_fare_won: A.transit_fare_won, basket_won: A.basket_won,
    maintenance_won_month: A.maintenance_won_month, other_fixed_won_month: A.other_fixed_won_month,
    household_monthly_net_won: net.household_monthly_net_won,
    housing_monthly_won: housing.monthly_won,
    tenure, housing_source: price.source,
    pay_day_of_month: A.pay_day_of_month, fixed_due_day_1based: A.fixed_due_day_1based,
    salary_source: salarySourceOf(net),
  });
  return {
    ok: true, run: hit.id, home: hit.home, tenure,
    monthly_net_won: net.household_monthly_net_won,
    per_member_net: net.per_member,
    housing, price_inputs: price, reference_note: refNote,
    timeline: {
      totals_by_category: tl.totals_by_category,
      monthly_spent_won: tl.monthly_spent_won,
      remaining_won: tl.remaining_won,
      burden_ratio: tl.burden_ratio,
      burden_pct: tl.burden_ratio === null ? null : Math.round(tl.burden_ratio * 1000) / 10,
      counts: tl.counts,
      daily_balance_won: tl.daily_balance_won,
      payday_note: tl.payday_note,
    },
    formatted: {
      monthly_net: fmtWon(net.household_monthly_net_won, { monthly: true }),
      housing_monthly: fmtWon(housing.monthly_won, { monthly: true }),
      remaining: fmtWon(tl.remaining_won, { monthly: true }),
      burden: tl.burden_ratio === null ? "–" : fmtPct(tl.burden_ratio),
    },
  };
}

function salarySourceOf(net) {
  const vals = Object.values((net && net.per_member) || {});
  if (vals.length > 0 && vals.every((v) => v && v.estimated)) return "payroll_estimate";
  if (vals.length > 0 && vals.every((v) => v && !v.estimated && v.source === "user_input")) return "user_input";
  return "mixed";
}

// --- recommend_public_rental -------------------------------------------------------

function complexCentroid(complex) {
  const c = complex && complex.centroid;
  if (Array.isArray(c) && c.length >= 2) return { lon: c[0], lat: c[1] };
  return null;
}

function haversineM(a, b) {
  const R = 6371000;
  const dLa = (b.lat - a.lat) * Math.PI / 180;
  const dLo = (b.lon - a.lon) * Math.PI / 180;
  const s = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Session-cached per-area commute index: pnu -> {areaId, lon, lat}
// (cheap: no routers up front). Routers, station lists and graph nodes
// build lazily per area/node on first commute lookup, so a recommend call
// pays only for the areas its candidates actually sit in.
async function commuteIndex(session) {
  if (session._commuteIndex) return session._commuteIndex;
  const idx = { areas: new Map(), pnuTo: new Map(), nodeCache: new Map() };
  for (const a of ["songpa-jamsil", "songpa", "seongsu", "pangyo"]) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const area = await session.loadArea(a);
      idx.areas.set(a, { area, router: null, places: null });
      const buildings = Array.isArray(area.buildings) ? area.buildings : [];
      for (const b of buildings) {
        const pnu = b.register && b.register.pnu;
        if (!pnu || idx.pnuTo.has(pnu)) continue;
        const g = b.geometry;
        const ring = g && g.type === "Polygon" ? g.coordinates[0]
          : g && g.type === "MultiPolygon" ? g.coordinates[0][0] : null;
        if (!ring || ring.length === 0) continue;
        let lon = 0;
        let lat = 0;
        for (const [x, y] of ring) {
          lon += x;
          lat += y;
        }
        idx.pnuTo.set(pnu, { areaId: a, lon: lon / ring.length, lat: lat / ring.length });
      }
    } catch { /* area unavailable: skip */ }
  }
  idx.ensureRouter = (areaId) => {
    const entry = idx.areas.get(areaId);
    if (!entry) return null;
    if (!entry.router) {
      entry.router = new Router(entry.area.graph);
      entry.places = buildPlaces(entry.area, entry.router);
    }
    return entry;
  };
  idx.nodeFor = (pnu) => {
    if (idx.nodeCache.has(pnu)) return idx.nodeCache.get(pnu);
    const slot = idx.pnuTo.get(pnu);
    if (!slot) return null;
    const entry = idx.ensureRouter(slot.areaId);
    if (!entry) return null;
    const n = entry.router.nearestNode(slot.lon, slot.lat);
    const out = n.id === null ? null : { areaId: slot.areaId, nodeId: n.id };
    idx.nodeCache.set(pnu, out);
    return out;
  };
  session._commuteIndex = idx;
  return idx;
}

function workStationOf(scenario, memberRef) {
  const members = (scenario.household || {}).members || [];
  const list = memberRef !== undefined && memberRef !== null
    ? members.filter((m, i) => [m.id, m.label, `m${i + 1}`, `h${i + 1}`].includes(String(memberRef)))
    : members;
  for (const m of list) {
    if (m.work && m.work.type === "station_ride") return m.work.station_name;
  }
  return null;
}

async function recommend_public_rental(session, args) {
  const snap = await needHousing(session).catch((err) => ({ __error: err }));
  if (snap.__error) return fail(snap.__error.message);
  const scenario = parseScenario(clone(session.scenario));
  const table = await needPayroll(session).catch(() => null);
  const net = table ? householdMonthlyNet(scenario.money, scenario.household.members, table)
    : { household_monthly_net_won: 0, per_member: {} };
  const monthlyNet = Number(args.monthly_net_won) > 0 ? Number(args.monthly_net_won) : net.household_monthly_net_won;
  const threshold = Number(args.threshold_pct) > 0 ? Number(args.threshold_pct)
    : scenario.money.burden_threshold_pct;
  const stationName = args.work_station
    || (typeof workStationOf(scenario, args.member) === "string" ? workStationOf(scenario, args.member) : null);
  const idx = await commuteIndex(session);
  if (!idx.distCache) idx.distCache = new Map(); // `${areaId}|${nodeId}` -> dist map (session-persistent)
  const distCache = idx.distCache;
  const commuteMinutes = (complex) => {
    if (!complex.pnu) return null;
    const slot = idx.nodeFor(complex.pnu);
    if (!slot) return null;
    const entry = idx.ensureRouter(slot.areaId);
    if (!entry) return null;
    const key = `${slot.areaId}|${slot.nodeId}`;
    if (!distCache.has(key)) distCache.set(key, entry.router.distFrom(slot.nodeId).dist);
    const dist = distCache.get(key);
    let names = [];
    if (stationName) {
      names = [typeof stationName === "string" ? stationName : stationName[slot.areaId]];
    } else {
      // No station named: nearest station of any name.
      let best = Infinity;
      for (const st of entry.places.stations) {
        const d = dist.get(st.nodeId);
        if (d !== undefined && d < best) best = d;
      }
      return best === Infinity ? null : Math.round(best / ADULT_MPS / 60 * 10) / 10;
    }
    let best = Infinity;
    for (const nm of names) {
      if (!nm) continue;
      for (const st of stationsByName(entry.places, nm)) {
        const d = dist.get(st.nodeId);
        if (d !== undefined && d < best) best = d;
      }
    }
    return best === Infinity ? null : Math.round(best / ADULT_MPS / 60 * 10) / 10;
  };
  const rec = recommendPublicRental(snap, {
    monthlyNetWon: monthlyNet,
    thresholdPct: threshold,
    targetAreaM2: Number(args.target_area_m2) || null,
    areaTolM2: Number(args.area_tol_m2) || 10,
    commuteMinutes,
    limit: Math.min(10, Math.max(1, Number(args.limit) || 5)),
  });
  return {
    ok: true,
    monthly_net_won: monthlyNet,
    work_station: stationName || null,
    ...rec,
    candidates: rec.candidates.map((c) => ({
      ...c,
      formatted_monthly: fmtWon(c.monthly_housing_won, { monthly: true }),
      formatted_deposit: fmtWon(c.deposit_won),
      eligibility_note: ELIGIBILITY_NOTE,
    })),
  };
}

// --- add_home_c ----------------------------------------------------------------------

async function add_home_c(session, args) {
  const snap = await needHousing(session).catch((err) => ({ __error: err }));
  if (snap.__error) return fail(snap.__error.message);
  const complex = (snap.complexes || []).find((c) =>
    String(c.id) === String(args.complex_id) && (!args.complex_source || c.source === args.complex_source));
  if (!complex) return fail(`unknown public-rental complex ${JSON.stringify(args.complex_id)} — call recommend_public_rental first`);
  const unit = (complex.unit_types || []).find((u) => String(u.unit_type) === String(args.unit_type))
    || (complex.unit_types || [])[0];
  if (!unit) return fail(`complex ${complex.id} has no unit types with areas`);
  if (!complex.pnu) {
    return { ok: false,
      error: `이 후보(${complex.address || complex.name})는 PNU가 없어 지역 매칭이 안 됩니다. 시뮬레이션은 지역 생성 후 — 주소로 공고만 확인해 주세요.` };
  }
  const idx = await commuteIndex(session);
  const located = idx.pnuTo.get(complex.pnu);
  if (!located) {
    return { ok: false,
      error: `이 후보(${complex.address || complex.name})는 지은 지역 밖에 있습니다. 시뮬레이션은 지역 생성 후 — 주소와 공고 링크로 확인해 주세요.` };
  }
  const entry = idx.ensureRouter(located.areaId);
  const slot = idx.nodeFor(complex.pnu);
  if (!entry || !slot) {
    return { ok: false,
      error: `이 후보(${complex.address || complex.name})는 그래프에 닿지 않습니다. 시뮬레이션은 지역 생성 후 — 주소와 공고 링크로 확인해 주세요.` };
  }
  const area = entry.area;
  // The complex holding this parcel, else the nearest named complex.
  const buildings = Array.isArray(area.buildings) ? area.buildings : [];
  const hit = buildings.find((b) => b.register && b.register.pnu === complex.pnu);
  let chosen = null;
  let how = "";
  if (hit) {
    chosen = (area.complexes || []).find((c) => (c.building_ids || []).includes(hit.id)) || null;
    if (chosen) how = "같은 필지의 단지";
  }
  if (!chosen) {
    let best = Infinity;
    const here = (() => {
      const g = hit && hit.geometry;
      const ring = g && g.type === "Polygon" ? g.coordinates[0]
        : g && g.type === "MultiPolygon" ? g.coordinates[0][0] : null;
      if (!ring || !ring.length) return null;
      let lon = 0;
      let lat = 0;
      for (const [x, y] of ring) {
        lon += x;
        lat += y;
      }
      return { lon: lon / ring.length, lat: lat / ring.length };
    })();
    for (const c of area.complexes || []) {
      const cc = complexCentroid(c);
      if (!here || !cc) continue;
      const d = haversineM({ lon: here.lon, lat: here.lat }, cc);
      if (d < best) {
        best = d;
        chosen = c;
      }
    }
    how = chosen ? `가장 가까운 단지(중심까지 약 ${Math.round(best)} m)` : "";
  }
  if (!chosen) return fail(`area ${slot.areaId} has no named complex to anchor home C`);
  const next = clone(session.scenario);
  next.homes = (next.homes || []).filter((h) => h.label !== "C");
  next.homes.push({ label: "C", area: slot.areaId, complex_name: chosen.name });
  next.money = next.money || {};
  next.money.tenure = { ...(next.money.tenure || {}), C: "공공임대" };
  next.money.home_c = {
    complex_source: complex.source, complex_id: complex.id,
    address: complex.address, pnu: complex.pnu,
    unit_type: unit.unit_type, building_type: unit.building_type,
    exclusive_area_m2: unit.exclusive_area_m2,
    deposit_won: unit.deposit_won, monthly_rent_won: unit.monthly_rent_won,
    anchored_area: slot.areaId, anchored_complex: chosen.name,
  };
  let parsed;
  try {
    parsed = parseScenario(next);
  } catch (err) {
    return fail(String((err && err.message) || err).slice(0, 300));
  }
  try {
    resolveHome(area, { label: "C", area: slot.areaId, complex_name: chosen.name }, entry.router);
  } catch (err) {
    return fail(`home C anchor failed: ${String((err && err.message) || err).slice(0, 200)}`);
  }
  session.scenario = parsed;
  return {
    ok: true, home: { label: "C", area: slot.areaId, complex_name: chosen.name },
    anchor_note: `C의 출입구는 ${how}의 출입구를 씁니다.`,
    candidate: next.money.home_c,
    notices: noticesFor(complex, snap.notices || []),
    eligibility_note: ELIGIBILITY_NOTE,
    next: "run_simulation(home=C)으로 30일 시뮬레이션을 실행하세요.",
  };
}

// --- worth_it (stage 9b) ------------------------------------------------------------

function compactWorthIt(w) {
  const totals = {};
  for (const [name, t] of Object.entries(w.tenures)) {
    const last = name === "매매"
      ? { cash_out_won: t.band[t.band.length - 1].cash_out_won }
      : { cash_out_won: t.yearly[t.yearly.length - 1].cash_out_won };
    totals[name] = {
      ...last,
      interest_won: t.total_interest_won,
      locked_won: t.locked_won,
      opportunity_won: t.opportunity_cum_won,
    };
    if (name === "매매") {
      totals[name].equity_by_scenario = {};
      totals[name].net_by_scenario = {};
      for (const [g, rows] of Object.entries(t.yearly_by_scenario)) {
        const end = rows[rows.length - 1];
        totals[name].equity_by_scenario[g] = end.equity_won;
        totals[name].net_by_scenario[g] = end.net_won;
      }
    } else {
      totals[name].net_won = t.yearly[t.yearly.length - 1].net_won;
    }
  }
  const series = [];
  const horizon = w.horizon_years;
  for (let y = 1; y <= horizon; y++) {
    const row = { year: y };
    for (const [name, t] of Object.entries(w.tenures)) {
      if (name === "매매") {
        row.buy_net_by_scenario = {};
        for (const [g, rows] of Object.entries(t.yearly_by_scenario)) {
          row.buy_net_by_scenario[g] = rows[y - 1].net_won;
        }
      } else {
        row[`net_${name}`] = t.yearly[y - 1].net_won;
      }
    }
    series.push(row);
  }
  return { totals, series };
}

async function worth_it(session, args) {
  let hit;
  try {
    hit = needRun(session, args.run);
  } catch (err) {
    return fail(err.message);
  }
  const horizon = Number(args.horizon_years);
  if (!WORTHIT_HORIZONS.includes(horizon)) {
    return fail(`horizon_years wants one of ${WORTHIT_HORIZONS.join("/")} (the customer picks)`);
  }
  const scenario = parseScenario(clone(session.scenario));
  const A = moneyOptsFromCriteria(resolveCriteria(scenario));
  const table = await needPayroll(session).catch((err) => ({ __error: err }));
  if (table.__error) return fail(table.__error.message);
  const net = householdMonthlyNet(scenario.money, scenario.household.members, table);
  const homeRec = (scenario.homes || []).find((hh) => hh.label === hit.home);
  if (!homeRec) return fail(`scenario has no home ${JSON.stringify(hit.home)}`);
  const pref = await price_reference(session, {
    area: homeRec.area, complex: homeRec.complex_name, area_m2: args.area_m2,
  });
  if (!pref.ok) return pref;
  if (!pref.reference) return fail(`no reference price for ${hit.run.meta.complex} — pass explicit won args`);
  const ref = pref.reference;
  const buyPrice = args.price_won ?? ref.trade.median;
  const jeonseDeposit = args.jeonse_won ?? ref.jeonse.deposit.median;
  const wolseDeposit = args.deposit_won ?? ref.wolse.deposit.median;
  const wolseMonthly = args.monthly_rent_won ?? ref.wolse.monthly.median;
  let costs = null;
  try {
    costs = applyOwnershipCosts(await needAssumption(session, "kr-ownership-costs.json"), "KR");
  } catch {
    costs = null; // table unavailable: costs stay unmodelled, listed as such
  }
  const scenarios = Array.isArray(args.scenarios_pct) && args.scenarios_pct.length > 0
    ? args.scenarios_pct.map(Number).filter(Number.isFinite)
    : [...WORTHIT_DEFAULT_SCENARIOS];
  let w;
  try {
    w = worthItComparison({
      horizon_years: horizon,
      cash_won: scenario.money.cash_won,
      loan_rate_pct: A.loan_rate_pct, loan_years: A.loan_years,
      opportunity_rate_pct: Number(args.opportunity_rate_pct) || 0,
      scenarios_pct: scenarios,
      buy: buyPrice > 0 ? { price_won: buyPrice } : null,
      jeonse: jeonseDeposit > 0 ? { deposit_won: jeonseDeposit } : null,
      wolse: wolseMonthly !== null && wolseMonthly !== undefined
        ? { deposit_won: wolseDeposit || 0, monthly_won: wolseMonthly } : null,
      public: Number.isFinite(Number(args.public_deposit_won)) && Number.isFinite(Number(args.public_monthly_won))
        ? { deposit_won: Number(args.public_deposit_won), monthly_won: Number(args.public_monthly_won) } : null,
      ownership_costs: costs,
      annual_income_won: Number(args.annual_income_won) > 0
        ? Number(args.annual_income_won) : net.household_monthly_net_won * 12,
      other_debt_service_annual_won: Number(args.other_debt_service_annual_won) || 0,
    });
  } catch (err) {
    return fail(err.message);
  }
  return {
    ok: true, run: hit.id, home: hit.home, horizon_years: horizon,
    inputs: {
      buy_price_won: buyPrice, jeonse_won: jeonseDeposit,
      wolse_deposit_won: wolseDeposit, wolse_monthly_won: wolseMonthly,
      cash_won: scenario.money.cash_won,
      loan_rate_pct: A.loan_rate_pct, loan_years: A.loan_years,
      opportunity_rate_pct: Number(args.opportunity_rate_pct) || 0,
      source: "rtms",
      period: ref.period,
    },
    ...compactWorthIt(w),
    loan_schedule: w.tenures["매매"] ? {
      loan_won: w.tenures["매매"].loan_won,
      rate_pct: w.tenures["매매"].schedule.rate_pct,
      years: w.tenures["매매"].schedule.years,
      monthly_won: w.tenures["매매"].schedule.monthly_won,
      total_interest_won: w.tenures["매매"].schedule.total_interest_won,
      yearly: w.tenures["매매"].schedule.yearly,
    } : null,
    breakeven_year: w.breakeven,
    breakeven_none_label: w.breakeven_none_label,
    scenario_label: w.scenario_label,
    dsr: w.dsr,
    rate_stress: w.rate_stress,
    ownership_excluded: (w.ownership_excluded || []).map((e) => e.label),
    ownership_included: w.ownership_included || [],
    lender_note: w.lender_note,
    note: "숫자 비교만 보여준다. 매매 판단·계약 판단은 하지 않는다.",
  };
}

// --- jeonse_check (stage 9b) ----------------------------------------------------

async function jeonse_check(session, args) {
  const areaId = String(args.area || "");
  const complexName = String(args.complex || "");
  if (!areaId || !complexName) return fail("pass area (built area id) and complex (verbatim complex name)");
  const district = AREA_RTMS_DISTRICT[areaId];
  if (!district) return fail(`no RTMS district for area ${JSON.stringify(areaId)}`);
  let area;
  try {
    area = await session.loadArea(areaId);
  } catch (err) {
    return fail(`cannot load area ${areaId}: ${String((err && err.message) || err).slice(0, 200)}`);
  }
  if (!(area.complexes || []).some((c) => c.name === complexName)) {
    return fail(`no complex named ${JSON.stringify(complexName)} in ${areaId} — call list_complexes`);
  }
  const rows = await needRtms(session, district).catch((err) => ({ __error: err }));
  if (rows.__error) return fail(rows.__error.message);
  const { parcelHits, nameHits } = matchRowsToComplex(rows, area, complexName, pnuIndexFor(area));
  const used = parcelHits.length >= 3 ? parcelHits : nameHits;
  const matchMethod = parcelHits.length >= 3 ? "parcel+name" : "name-only";
  let areaM2 = Number(args.area_m2);
  if (!Number.isFinite(areaM2) || areaM2 <= 0) {
    const areas = used.map((r) => r.area_m2).filter(Number.isFinite).sort((a, b) => a - b);
    areaM2 = areas.length > 0 ? areas[Math.floor(areas.length / 2)] : null;
  }
  if (areaM2 === null) {
    return { ok: true, area: areaId, complex: complexName, match_method: matchMethod,
      ratio: null, sparse_note: JEONSE_SPARSE_NOTE,
      note: "같은 단지 실거래가 없습니다. 면적을 바꿔 다시 물어보세요." };
  }
  const scenario = parseScenario(clone(session.scenario));
  const flat = resolveCriteria(scenario).flat;
  const ratio = jeonseRatio(used, { areaM2,
    cautionPct: flat.jeonse_caution_pct, warningPct: flat.jeonse_warning_pct });
  const complexRec = (area.complexes || []).find((c) => c.name === complexName);
  const buildings = complexRec
    ? (Array.isArray(area.buildings) ? area.buildings : [])
      .filter((b) => (complexRec.building_ids || []).includes(b.id))
    : [];
  const register = registerSignals(buildings);
  let checklist = null;
  try {
    checklist = await needAssumption(session, "kr-jeonse-checklist.json");
  } catch {
    checklist = null;
  }
  return {
    ok: true, area: areaId, complex: complexName, area_m2: areaM2,
    match_method: matchMethod,
    parcel_rows: parcelHits.length, name_rows: nameHits.length,
    ratio,
    register,
    checklist,
    note: "신호·빠진 정보·체크리스트만 보여준다. 안전/위험 판정은 하지 않는다.",
  };
}

// --- mock_deposit_loss (stage 9b) -------------------------------------------------

async function mock_deposit_loss(session, args) {
  if (!MOCKLOSS_PATHS.includes(args.path)) {
    return fail(`path wants one of ${MOCKLOSS_PATHS.join("/")} (보증보험 가입 / 미가입+경매 / 미회수)`);
  }
  const deposit = Number(args.deposit_won);
  if (!(deposit > 0)) return fail("deposit_won (> 0) is required — the customer's jeonse deposit");
  const scenario = parseScenario(clone(session.scenario));
  const flat = resolveCriteria(scenario).flat;
  let out;
  try {
    out = mockDepositLoss({
      depositWon: deposit,
      monthlyNetWon: args.monthly_net_won ?? null,
      monthlySpentWon: args.monthly_spent_won ?? null,
      path: args.path,
      assumptions: {
        insured_months: flat.mockloss_insured_months,
        insured_pct: flat.mockloss_insured_pct,
        auction_months: flat.mockloss_auction_months,
        auction_pct: flat.mockloss_auction_pct,
        unrecovered_pct: flat.mockloss_unrecovered_pct,
      },
    });
  } catch (err) {
    return fail(err.message);
  }
  let center = null;
  try {
    const checklist = await needAssumption(session, "kr-jeonse-checklist.json");
    center = (checklist && checklist.support_center) || null;
  } catch { /* checklist unavailable: centre name still below */ }
  return { ok: true, ...out, support_center: center || { name: "전세피해지원센터" } };
}

// --- support_programs (stage 9b) ----------------------------------------------------

const SUPPORT_PROFILE_KEYS = ["age", "household_type", "married", "marriage_years",
  "annual_income_won", "assets_won", "owns_home", "has_newborn",
  "deposit_won", "price_won"];

async function support_programs(session, args) {
  const doc = await needAssumption(session, "kr-support-programs.json")
    .catch((err) => ({ __error: err }));
  if (doc.__error) return fail(doc.__error.message);
  const profile = {};
  for (const k of SUPPORT_PROFILE_KEYS) {
    if (args[k] !== undefined && args[k] !== null && args[k] !== "") profile[k] = args[k];
  }
  const compared = compareAllSupport(doc, profile);
  let rentals = null;
  if (args.include_public_rental !== false) {
    const rec = await recommend_public_rental(session, {
      monthly_net_won: args.monthly_net_won,
      target_area_m2: args.target_area_m2,
      limit: 3,
    });
    rentals = rec.ok ? rec : { ok: false, error: rec.error };
  }
  return {
    ok: true, profile,
    programs: compared.programs,
    public_rentals: rentals,
    note: "조건을 한 줄씩 대조만 한다. 최종 판정(대상 여부)은 하지 않는다. 공고 원문에서 확인해 주세요.",
  };
}

export const MONEY_TOOL_DEFS = [
  { type: "function", function: { name: "set_money",
    description: "Patch the scenario money block (per-member salary/net, cash_won, per-home tenure, assumptions, burden_threshold_pct). Income stays in this conversation only.",
    parameters: { type: "object", additionalProperties: false,
      properties: {
        patch: { type: "object", additionalProperties: true,
          description: "{members:{m1:{annual_salary_won?, monthly_net_won?}}, cash_won?, tenure?{A:매매/전세/월세/공공임대}, area_m2?{A:㎡}, assumptions?, burden_threshold_pct?}" },
      } } } },
  { type: "function", function: { name: "estimate_net_pay",
    description: "Estimate monthly net pay from a gross annual salary with the documented payroll table (marked 추정), or resolve a scenario member's net (their typed monthly_net_won wins).",
    parameters: { type: "object", additionalProperties: false,
      properties: {
        annual_salary_won: { type: "number" },
        member: { type: "string", description: "Scenario member id/label (uses scenario money inputs)." },
      } } } },
  { type: "function", function: { name: "price_reference",
    description: "Last-12-month real transactions for a complex at an area (±5㎡): trade median/p25-p75 + jeonse/wolse deposit/monthly. Matched by parcel PNU + complex name.",
    parameters: { type: "object", additionalProperties: false,
      properties: {
        area: { type: "string" }, complex: { type: "string" },
        area_m2: { type: "number", description: "Target exclusive area (default: median of matched rows)." },
      }, required: ["area", "complex"] } } },
  { type: "function", function: { name: "living_cost",
    description: "30-day money timeline for a stored run: tenure housing cost + salary/spending events tied to simulated trips, burden ratio, remaining money. Prices default to the RTMS median; explicit won args override.",
    parameters: { type: "object", additionalProperties: false,
      properties: {
        run: { type: "string" }, tenure: { type: "string" }, area_m2: { type: "number" },
        price_won: { type: "number" }, deposit_won: { type: "number" }, monthly_rent_won: { type: "number" },
      }, required: ["run"] } } },
  { type: "function", function: { name: "recommend_public_rental",
    description: "Public-rental candidates under the burden threshold, similar area, shortest commute to the work station. Each links notices; eligibility is for the notice text to decide.",
    parameters: { type: "object", additionalProperties: false,
      properties: {
        target_area_m2: { type: "number" }, area_tol_m2: { type: "number" },
        threshold_pct: { type: "number" }, monthly_net_won: { type: "number" },
        work_station: { type: "string" }, member: { type: "string" },
        limit: { type: "integer" },
      } } } },
  { type: "function", function: { name: "add_home_c",
    description: "Add a public-rental candidate as home C (공공임대) when its parcel is inside a built area; else explains the area is not built yet.",
    parameters: { type: "object", additionalProperties: false,
      properties: {
        complex_id: { type: "string" }, complex_source: { type: "string" },
        unit_type: { type: "string" },
      }, required: ["complex_id"] } } },
  { type: "function", function: { name: "worth_it",
    description: "Multi-year buy-vs-rent cost comparison for a stored run (horizon 5/10/20, customer picks): totals, interest, locked cash, opportunity cost, buy equity under customer-chosen price scenarios (default −2/0/+2 %/yr, 가정 시나리오), break-even years, DSR display. Numbers only — never a buy verdict.",
    parameters: { type: "object", additionalProperties: false,
      properties: {
        run: { type: "string" }, horizon_years: { type: "integer" },
        area_m2: { type: "number" },
        scenarios_pct: { type: "array", items: { type: "number" } },
        opportunity_rate_pct: { type: "number" },
        price_won: { type: "number" }, jeonse_won: { type: "number" },
        deposit_won: { type: "number" }, monthly_rent_won: { type: "number" },
        public_deposit_won: { type: "number" }, public_monthly_won: { type: "number" },
        annual_income_won: { type: "number" },
        other_debt_service_annual_won: { type: "number" },
      }, required: ["run", "horizon_years"] } } },
  { type: "function", function: { name: "jeonse_check",
    description: "전세 signals for a complex: 전세가율 (median jeonse ÷ median trade, same bucket, last 12 months) with counts, building-register tenant fields, and the official checklist. Signals only — never a safe/unsafe verdict.",
    parameters: { type: "object", additionalProperties: false,
      properties: {
        area: { type: "string" }, complex: { type: "string" },
        area_m2: { type: "number" },
      }, required: ["area", "complex"] } } },
  { type: "function", function: { name: "mock_deposit_loss",
    description: "Mock scenario (모의): if the jeonse deposit is not returned at expiry — locked months, recovery and shortfall per path (insured / auction / unrecovered), shortfall in months of stated remainder. Not legal advice.",
    parameters: { type: "object", additionalProperties: false,
      properties: {
        path: { type: "string" }, deposit_won: { type: "number" },
        monthly_net_won: { type: "number" }, monthly_spent_won: { type: "number" },
      }, required: ["path", "deposit_won"] } } },
  { type: "function", function: { name: "support_programs",
    description: "Policy loans and youth/newly-wed benefits: condition-by-condition comparison of the customer profile with published conditions, plus public-rental candidates. Never a final eligibility verdict.",
    parameters: { type: "object", additionalProperties: false,
      properties: {
        age: { type: "number" }, household_type: { type: "string" },
        married: { type: "boolean" }, marriage_years: { type: "number" },
        annual_income_won: { type: "number" }, assets_won: { type: "number" },
        owns_home: { type: "boolean" }, has_newborn: { type: "boolean" },
        deposit_won: { type: "number" }, price_won: { type: "number" },
        monthly_net_won: { type: "number" }, target_area_m2: { type: "number" },
        include_public_rental: { type: "boolean" },
      } } } },
];

export { SUPPORT_PROFILE_KEYS };

export const MONEY_HANDLERS = {
  set_money, estimate_net_pay, price_reference, living_cost,
  recommend_public_rental, add_home_c,
  worth_it, jeonse_check, mock_deposit_loss, support_programs,
};

export { commuteIndex };
