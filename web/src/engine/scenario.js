// Scenario parsing, home resolution and the sim calendar (pure).
//
// A scenario fixes everything the engine may not invent: who lives in
// the household, the two candidate homes (verbatim complex names), the
// 30-day window, the seed, and the assumed durations (ride, workday).
// Full schema: docs/scenario-schema.md.
//
// All defaults come from the criteria file (criteria.js) — never
// literals. criteria_overrides lets a scenario re-set per-criterion
// values (validated there); _explicit records which native fields the
// customer set, so resolved criterion sources read 고객 입력 honestly.

import { criterionDefault, validateOverrides } from "./criteria.js";
import { defaultWeights, validateWeights } from "../priorities.js";

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DEFAULT_START_DATE = criterionDefault("C-sim-window", "start_default"); // a Monday
export const DEFAULT_DAYS = criterionDefault("C-sim-window", "days_default");
export const DEFAULT_SEED = criterionDefault("C-sim-window", "seed_default");
export const DEFAULT_BACKGROUND = criterionDefault("C-neighbour", "count_default");
export const DEFAULT_WORKDAY_MINUTES = criterionDefault("C-work-hours", "workday_minutes"); // 9 h
export const DEFAULT_SCHOOLDAY_MINUTES = criterionDefault("C-work-hours", "schoolday_minutes"); // 6 h

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function fail(msg) {
  throw new Error(`scenario: ${msg}`);
}

function checkWeekdays(list, where) {
  if (!Array.isArray(list) || list.length === 0) fail(`${where} needs a non-empty weekday list`);
  for (const w of list) {
    if (!WEEKDAYS.includes(w)) fail(`${where} has unknown weekday ${JSON.stringify(w)}`);
  }
  return [...list];
}

// Days from civil date (Howard Hinnant's algorithm, pure integer math)
// -> weekday with 2026-11-02 (Monday) as the anchor. No Date anywhere.
function daysFromCivil(y, m, d) {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor((yy >= 0 ? yy : yy - 399) / 400);
  const yoe = yy - era * 400;
  const mp = m <= 2 ? m + 9 : m - 3;
  const doy = Math.floor((153 * mp + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468; // days since 1970-01-01
}

const ANCHOR_DAYS = daysFromCivil(2026, 11, 2); // Monday

export function parseDateISO(text) {
  const m = DATE_RE.exec(text || "");
  if (!m) fail(`bad start_date ${JSON.stringify(text)} (want YYYY-MM-DD)`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) fail(`bad start_date ${JSON.stringify(text)}`);
  return { y, mo, d };
}

// Weekday index (Mon = 0) of start_date + dayOffset.
export function weekdayOf(startDate, dayOffset) {
  const { y, mo, d } = parseDateISO(startDate);
  const delta = daysFromCivil(y, mo, d) - ANCHOR_DAYS;
  return (((delta + dayOffset) % 7) + 7) % 7;
}

// YYYY-MM-DD of start_date + dayOffset (civil round-trip).
export function dateOf(startDate, dayOffset) {
  const { y, mo, d } = parseDateISO(startDate);
  let z = daysFromCivil(y, mo, d) + dayOffset + 719468;
  const era = Math.floor((z >= 0 ? z : z - 146096) / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const yy = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const dd = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const mm = mp < 10 ? mp + 3 : mp - 9;
  const yyyy = yy + (mm <= 2 ? 1 : 0);
  const p2 = (n) => String(n).padStart(2, "0");
  return `${yyyy}-${p2(mm)}-${p2(dd)}`;
}

function parseWork(raw, where) {
  if (raw === undefined || raw === null) return { type: "none" };
  if (raw.type === "none") return { type: "none" };
  if (raw.type === "station_ride") {
    if (raw.station_name === undefined) fail(`${where}.work needs station_name`);
    const rideMinutes = parseRideMinutes(raw.ride_minutes, `${where}.work`);
    if (raw.destination_station !== undefined && raw.destination_station !== null
        && typeof raw.destination_station !== "string"
        && typeof raw.destination_station !== "object") {
      fail(`${where}.work.destination_station wants a station name or {homeLabel: name}`);
    }
    return {
      type: "station_ride",
      station_name: raw.station_name, // string or {homeLabel: name}
      // Optional alighting station (string or {homeLabel: name}, null when
      // unknown): only with it can the engine draw the real journey path.
      // Never invented — without it the ride stays a minutes number.
      destination_station: raw.destination_station === undefined ? null : raw.destination_station,
      ride_minutes: rideMinutes, // number or {homeLabel: minutes} per path
      ride_minutes_source: raw.ride_minutes_source || "user_assumption",
      needs_user_input: raw.needs_user_input === true,
      // Optional workplace (stage 9c): the engine derives the commute per
      // home — walk when the workplace is in-area within C-walk-commute-max,
      // else station ride + destination walk. Absent → the old form.
      place: parseWorkplace(raw.place, `${where}.work`),
    };
  }
  if (raw.type === "local_poi") {
    if (raw.name === undefined) fail(`${where}.work needs a POI name`);
    return { type: "local_poi", name: raw.name };
  }
  if (raw.type === "place") {
    const place = parseWorkplace(raw.place, `${where}.work`);
    if (!place || !Number.isFinite(place.lon) || !Number.isFinite(place.lat)) {
      fail(`${where}.work.place needs lon/lat`);
    }
    let modes = ["walk", "bike"];
    if (raw.modes !== undefined) {
      if (!Array.isArray(raw.modes) || raw.modes.length === 0) {
        fail(`${where}.work.modes wants a non-empty array of walk/bike`);
      }
      for (const m of raw.modes) {
        if (m !== "walk" && m !== "bike") {
          fail(`${where}.work.modes allows only walk and bike, not ${JSON.stringify(m)}`);
        }
      }
      modes = [...raw.modes];
    }
    return {
      type: "place",
      place: { name: place.name, lon: place.lon, lat: place.lat },
      modes,
    };
  }
  fail(`${where}.work has unknown type ${JSON.stringify(raw.type)}`);
}

// Ride minutes: one customer number for every path, or a per-home map
// when paths differ (a home without an entry has no ride input — a ride
// derivation there records unavailable instead of guessing).
function parseRideMinutes(raw, where) {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw < 0) fail(`${where} needs ride_minutes >= 0`);
    return raw;
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const out = {};
    for (const [label, v] of Object.entries(raw)) {
      if (!Number.isFinite(v) || v < 0) {
        fail(`${where}.ride_minutes[${label}] wants a number >= 0`);
      }
      out[label] = v;
    }
    return out;
  }
  fail(`${where} needs ride_minutes >= 0 (a number or a {homeLabel: minutes} map)`);
}

// The ride input for one home: number, or null when the map has no entry.
export function rideMinutesForHome(work, homeLabel) {
  const rm = work && work.ride_minutes;
  if (typeof rm === "number") return rm;
  if (rm && typeof rm === "object") {
    const hit = rm[homeLabel];
    return Number.isFinite(hit) ? hit : null;
  }
  return null;
}

// Workplace: a display name plus one locating form — lon/lat, a home-area
// POI name, or a station name (region network stop). Absent → null (the
// old station_ride form, unchanged).
function parseWorkplace(raw, where) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) fail(`${where}.place wants an object`);
  if (typeof raw.name !== "string" || raw.name.length === 0) fail(`${where}.place needs a name`);
  const out = { name: raw.name };
  const hasLonLat = raw.lon !== undefined || raw.lat !== undefined;
  if (hasLonLat) {
    if (!Number.isFinite(raw.lon) || raw.lon < -180 || raw.lon > 180
        || !Number.isFinite(raw.lat) || raw.lat < -90 || raw.lat > 90) {
      fail(`${where}.place lon/lat wants finite degrees`);
    }
    out.lon = raw.lon;
    out.lat = raw.lat;
  }
  for (const key of ["poi", "station"]) {
    if (raw[key] !== undefined && raw[key] !== null) {
      if (typeof raw[key] !== "string" || raw[key].length === 0) {
        fail(`${where}.place.${key} wants a non-empty name`);
      }
      out[key] = raw[key];
    }
  }
  if (!hasLonLat && out.poi === undefined && out.station === undefined) {
    fail(`${where}.place needs lon/lat, a poi name or a station name`);
  }
  return out;
}

// Optional per-home name (destination station): string, {A: ..., B: ...},
// or null when unknown. Missing homes read null (never throw): an
// unknown destination keeps the ride numeric, it never blocks the run.
export function destForHome(nameOrMap, homeLabel) {
  if (nameOrMap === undefined || nameOrMap === null) return null;
  if (typeof nameOrMap === "string") return nameOrMap;
  if (typeof nameOrMap === "object") {
    const hit = nameOrMap[homeLabel];
    return typeof hit === "string" ? hit : null;
  }
  return null;
}

// A name that may vary per home: string, or {A: ..., B: ...}.
export function nameForHome(nameOrMap, homeLabel) {
  if (typeof nameOrMap === "string") return nameOrMap;
  if (nameOrMap && typeof nameOrMap === "object") {
    const hit = nameOrMap[homeLabel];
    if (typeof hit === "string") return hit;
  }
  fail(`no name for home ${JSON.stringify(homeLabel)} in ${JSON.stringify(nameOrMap)}`);
}

function parseErrands(raw, where) {
  const out = { supermarket: 0, convenience: 0 };
  if (raw === undefined || raw === null) return out;
  for (const cat of Object.keys(out)) {
    const v = raw[cat];
    if (v === undefined) continue;
    if (!Number.isInteger(v) || v < 0 || v > 7) fail(`${where}.errands_per_week.${cat} wants 0..7`);
    out[cat] = v;
  }
  return out;
}

function parseMember(raw, index) {
  const where = `household.members[${index}]`;
  if (!raw || typeof raw !== "object") fail(`${where} must be an object`);
  const role = raw.role || "adult";
  if (!["adult", "child", "senior"].includes(role)) fail(`${where} has unknown role ${JSON.stringify(role)}`);
  const school = raw.school === true
    || (raw.school && (raw.school.mode === "nearest" || raw.school === true));
  if (raw.preferences !== undefined
      && (typeof raw.preferences !== "string" || raw.preferences.length > 500)) {
    fail(`${where}.preferences wants a short free-text string (≤ 500 chars, no personal or health data)`);
  }
  return {
    id: typeof raw.id === "string" ? raw.id : `m${index + 1}`,
    label: typeof raw.label === "string" ? raw.label : `구성원 ${index + 1}`,
    preferences: typeof raw.preferences === "string" ? raw.preferences : "",
    role,
    workdays: raw.workdays === undefined ? ["Mon", "Tue", "Wed", "Thu", "Fri"] : checkWeekdays(raw.workdays, where),
    schooldays: raw.schooldays === undefined ? ["Mon", "Tue", "Wed", "Thu", "Fri"] : checkWeekdays(raw.schooldays, `${where}.schooldays`),
    work: parseWork(raw.work, where),
    school: school === true,
    errands_per_week: parseErrands(raw.errands_per_week, where),
    park_walks_per_week: raw.park_walks_per_week === undefined ? 0 : raw.park_walks_per_week,
    clinic_visits_per_month: raw.clinic_visits_per_month === undefined ? 0 : raw.clinic_visits_per_month,
  };
}

export function parseScenario(raw) {
  if (!raw || typeof raw !== "object") fail("scenario must be an object");
  const members = raw.household && raw.household.members;
  if (!Array.isArray(members) || members.length === 0) fail("household.members needs ≥ 1 member");
  const homes = raw.homes;
  if (!Array.isArray(homes) || homes.length === 0) fail("homes needs ≥ 1 home");
  const seenLabels = new Set();
  for (const [i, h] of homes.entries()) {
    if (typeof h.label !== "string" || typeof h.area !== "string" || typeof h.complex_name !== "string") {
      fail(`homes[${i}] needs {label, area, complex_name} strings`);
    }
    if (seenLabels.has(h.label)) fail(`duplicate home label ${JSON.stringify(h.label)}`);
    seenLabels.add(h.label);
    // 12b: optional footprint-centroid lon/lat for the coordinate
    // anchor (picked homes that form no named complex).
    for (const key of ["lon", "lat"]) {
      if (h[key] !== undefined && h[key] !== null && !Number.isFinite(h[key])) {
        fail(`homes[${i}].${key} wants a finite degree number`);
      }
    }
  }
  const background = raw.background === undefined ? DEFAULT_BACKGROUND : raw.background;
  if (!Number.isInteger(background) || background < 0) fail("background wants an int ≥ 0");
  const days = raw.days === undefined ? DEFAULT_DAYS : raw.days;
  if (!Number.isInteger(days) || days < 1 || days > 366) fail("days wants 1..366");
  const seed = raw.seed === undefined ? DEFAULT_SEED : raw.seed;
  if (!Number.isInteger(seed)) fail("seed wants an int");
  for (const [i, m] of members.entries()) {
    const pm = parseMember(m, i);
    members[i] = pm;
    if (!Number.isInteger(pm.park_walks_per_week) || pm.park_walks_per_week < 0 || pm.park_walks_per_week > 7) {
      fail(`household.members[${i}].park_walks_per_week wants 0..7`);
    }
    if (!Number.isInteger(pm.clinic_visits_per_month) || pm.clinic_visits_per_month < 0 || pm.clinic_visits_per_month > 31) {
      fail(`household.members[${i}].clinic_visits_per_month wants 0..31`);
    }
  }
  const homesOut = homes.map((h) => {
    const out = { label: h.label, area: h.area, complex_name: h.complex_name };
    if (Number.isFinite(h.lon) && Number.isFinite(h.lat)) {
      out.lon = h.lon;
      out.lat = h.lat;
    }
    return out;
  });
  if (raw.workday_minutes !== undefined
      && (!Number.isFinite(raw.workday_minutes) || raw.workday_minutes < 0)) {
    fail("workday_minutes wants a number >= 0");
  }
  if (raw.schoolday_minutes !== undefined
      && (!Number.isFinite(raw.schoolday_minutes) || raw.schoolday_minutes < 0)) {
    fail("schoolday_minutes wants a number >= 0");
  }
  let criteriaOverrides = {};
  try {
    criteriaOverrides = validateOverrides(raw.criteria_overrides);
  } catch (err) {
    fail(String((err && err.message) || err).replace(/^criteria: /, "criteria_overrides: "));
  }
  let priorities = { weights: defaultWeights(), explicit: false };
  if (raw.priorities !== undefined && raw.priorities !== null) {
    if (typeof raw.priorities !== "object" || Array.isArray(raw.priorities)) {
      fail("priorities must be an object {weights, explicit}");
    }
    if (raw.priorities.weights !== undefined) {
      const checked = validateWeights(raw.priorities.weights);
      if (!checked.ok) fail(`priorities: ${checked.errors.join("; ")}`);
      priorities = { weights: checked.weights,
        explicit: raw.priorities.explicit === true };
    } else if (raw.priorities.explicit !== undefined
        && typeof raw.priorities.explicit !== "boolean") {
      fail("priorities.explicit wants a boolean");
    } else if (raw.priorities.explicit === true) {
      priorities = { weights: defaultWeights(), explicit: true };
    }
  }
  return {
    name: typeof raw.name === "string" ? raw.name : "scenario",
    priorities,
    start_date: raw.start_date === undefined ? DEFAULT_START_DATE : raw.start_date,
    days,
    seed,
    background,
    workday_minutes: raw.workday_minutes === undefined ? DEFAULT_WORKDAY_MINUTES : raw.workday_minutes,
    schoolday_minutes: raw.schoolday_minutes === undefined ? DEFAULT_SCHOOLDAY_MINUTES : raw.schoolday_minutes,
    household: { members },
    homes: homesOut,
    money: parseMoney(raw.money, members, homesOut),
    criteria_overrides: criteriaOverrides,
    _explicit: readExplicit(raw),
  };
}

// Which native fields the customer set (for criterion source badges).
// Fresh files: field presence. Re-parses (consult turns): the incoming
// _explicit is reused as-is — writers (update_scenario, set_money) mark
// their own patches, since a parsed scenario carries every field.
export function readExplicit(raw) {
  const out = {};
  if (raw && raw._explicit && typeof raw._explicit === "object" && !Array.isArray(raw._explicit)) {
    for (const [k, v] of Object.entries(raw._explicit)) {
      if (v === true) out[k] = true;
    }
    return out;
  }
  if (!raw || typeof raw !== "object") return out;
  for (const k of ["workday_minutes", "schoolday_minutes", "days", "seed", "background", "start_date"]) {
    if (raw[k] !== undefined) out[k] = true;
  }
  if (raw.money && typeof raw.money === "object") {
    for (const k of Object.keys(DEFAULT_MONEY_ASSUMPTIONS)) {
      if (raw.money.assumptions && raw.money.assumptions[k] !== undefined) out[`money_${k}`] = true;
    }
    if (raw.money.burden_threshold_pct !== undefined) out.money_burden_threshold_pct = true;
  }
  return out;
}

export const TENURE_KINDS = ["매매", "전세", "월세", "공공임대"];

export const DEFAULT_MONEY_ASSUMPTIONS = {
  loan_rate_pct: criterionDefault("C-money-fixed", "loan_rate_pct"),
  loan_years: criterionDefault("C-money-fixed", "loan_years"),
  jeonse_loan_cap_won: criterionDefault("C-money-fixed", "jeonse_loan_cap_won"),
  maintenance_won_month: criterionDefault("C-money-fixed", "maintenance_won"),
  transit_fare_won: criterionDefault("C-money-fare", "fare_won"),
  basket_won: criterionDefault("C-money-basket", "basket_won"),
  other_fixed_won_month: criterionDefault("C-money-fixed", "other_fixed_won"),
  pay_day_of_month: criterionDefault("C-money-fixed", "pay_day"),
  fixed_due_day_1based: criterionDefault("C-money-fixed", "due_day_1based"),
};

export const DEFAULT_BURDEN_THRESHOLD_PCT = criterionDefault("C-burden-rule", "threshold_pct");

// Optional `money` block (stage 6): salary inputs, own funds, per-home
// tenure and spending assumptions. Everything without a measured source
// is a 가정값 the customer can edit; income lives in browser memory only.
function parseMoney(raw, members, homes) {
  const out = {
    members: {},
    cash_won: 0,
    tenure: {},
    area_m2: {},
    assumptions: { ...DEFAULT_MONEY_ASSUMPTIONS },
    burden_threshold_pct: DEFAULT_BURDEN_THRESHOLD_PCT,
    home_c: null,
  };
  if (raw === undefined || raw === null) {
    for (const h of homes) out.tenure[h.label] = "전세";
    return out;
  }
  if (typeof raw !== "object") fail("money must be an object");
  const ids = new Set(members.map((m) => m.id));
  for (const [id, entry] of Object.entries(raw.members || {})) {
    if (!ids.has(id)) fail(`money.members has unknown member ${JSON.stringify(id)}`);
    if (!entry || typeof entry !== "object") fail(`money.members[${id}] must be an object`);
    const slot = {};
    for (const key of ["annual_salary_won", "monthly_net_won"]) {
      if (entry[key] !== undefined && entry[key] !== null) {
        if (!Number.isFinite(entry[key]) || entry[key] < 0) fail(`money.members[${id}].${key} wants a won amount >= 0`);
        slot[key] = entry[key];
      }
    }
    out.members[id] = slot;
  }
  if (raw.cash_won !== undefined && raw.cash_won !== null) {
    if (!Number.isFinite(raw.cash_won) || raw.cash_won < 0) fail("money.cash_won wants a won amount >= 0");
    out.cash_won = raw.cash_won;
  }
  for (const h of homes) {
    const t = (raw.tenure || {})[h.label];
    if (t === undefined || t === null) {
      out.tenure[h.label] = "전세";
    } else if (!TENURE_KINDS.includes(t)) {
      fail(`money.tenure[${h.label}] wants one of ${TENURE_KINDS.join("/")}`);
    } else {
      out.tenure[h.label] = t;
    }
    const am2 = (raw.area_m2 || {})[h.label];
    if (am2 !== undefined && am2 !== null) {
      if (!Number.isFinite(am2) || am2 <= 0) fail(`money.area_m2[${h.label}] wants a positive ㎡ number`);
      out.area_m2[h.label] = am2;
    }
  }
  for (const [key, value] of Object.entries(raw.assumptions || {})) {
    if (!(key in out.assumptions)) fail(`money.assumptions has unknown key ${JSON.stringify(key)}`);
    if (!Number.isFinite(value) || value < 0) fail(`money.assumptions.${key} wants a number >= 0`);
    out.assumptions[key] = value;
  }
  if (raw.burden_threshold_pct !== undefined && raw.burden_threshold_pct !== null) {
    if (!Number.isFinite(raw.burden_threshold_pct) || raw.burden_threshold_pct <= 0 || raw.burden_threshold_pct > 100) {
      fail("money.burden_threshold_pct wants 0..100");
    }
    out.burden_threshold_pct = raw.burden_threshold_pct;
  }
  if (raw.home_c !== undefined && raw.home_c !== null) {
    if (typeof raw.home_c !== "object") fail("money.home_c must be an object");
    out.home_c = { ...raw.home_c };
  }
  return out;
}

export function homeOf(scenario, label) {
  const hit = scenario.homes.find((h) => h.label === label);
  if (!hit) fail(`unknown home label ${JSON.stringify(label)}`);
  return hit;
}

function buildingAnchorLonLat(building) {
  const g = building.geometry;
  const ring = g.type === "Polygon" ? g.coordinates[0] : g.coordinates[0][0];
  let x = 0;
  let y = 0;
  for (const [lon, lat] of ring) {
    x += lon;
    y += lat;
  }
  return [x / ring.length, y / ring.length];
}

// Resolve a home: the verbatim complex, and the household entrance —
// the graph node nearest to a building of that complex. Deterministic:
// lowest anchor distance wins, ties break on (building id, node id).
//
// 12b coordinate fallback: picked homes (officetels, villas) often form
// no named complex in the scene. When the name matches nothing but the
// home carries footprint-centroid lon/lat, anchor the entrance at the
// graph node nearest to that point, with the nearest building as the
// home building. Same determinism rules; the returned anchor says
// which path was taken (recorded in run.meta.home_anchor).
export function resolveHome(area, home, router) {
  const matches = (area.complexes || [])
    .filter((c) => c.name === home.complex_name)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const byId = new Map((area.buildings || []).map((b) => [b.id, b]));
  if (matches.length > 0) {
    const complex = matches[0];
    let best = null;
    for (const bid of [...complex.building_ids].sort()) {
      const b = byId.get(bid);
      if (!b || !b.geometry) continue;
      const [lon, lat] = buildingAnchorLonLat(b);
      const n = router.nearestNode(lon, lat);
      if (n.id === null) continue;
      if (best === null || n.distM < best.distM
          || (n.distM === best.distM && (bid < best.buildingId
            || (bid === best.buildingId && n.id < best.nodeId)))) {
        best = { buildingId: bid, nodeId: n.id, distM: n.distM };
      }
    }
    if (best === null) fail(`home ${home.label}: complex ${JSON.stringify(home.complex_name)} has no graph-anchored building`);
    return { complex, buildingId: best.buildingId, nodeId: best.nodeId,
      anchor: { method: "complex", complex_name: complex.name } };
  }
  if (Number.isFinite(home.lon) && Number.isFinite(home.lat)) {
    const n = router.nearestNode(home.lon, home.lat);
    if (n.id === null) fail(`home ${home.label}: no graph node near ${home.lon},${home.lat}`);
    let best = null;
    for (const b of [...(area.buildings || [])].sort((x, y) =>
        (String(x.id) < String(y.id) ? -1 : 1))) {
      if (!b || !b.geometry) continue;
      const [lon, lat] = buildingAnchorLonLat(b);
      const d = Math.hypot(lon - home.lon, lat - home.lat);
      const res = (b.residential && b.residential !== "none") ? 0 : 1;
      const key = [res, d, String(b.id)];
      if (best === null || keyLess(key, best.key)) {
        best = { key, buildingId: b.id };
      }
    }
    if (best === null) fail(`home ${home.label}: no building near ${home.lon},${home.lat}`);
    return {
      complex: { name: home.complex_name },
      buildingId: best.buildingId,
      nodeId: n.id,
      anchor: { method: "coordinate", lon: home.lon, lat: home.lat,
        node_dist_m: Math.round(n.distM * 10) / 10 },
    };
  }
  fail(`home ${home.label}: no complex named ${JSON.stringify(home.complex_name)}`);
}

function keyLess(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] < b[i]) return true;
    if (a[i] > b[i]) return false;
  }
  return a.length < b.length;
}
