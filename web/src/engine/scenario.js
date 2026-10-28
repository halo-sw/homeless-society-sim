// Scenario parsing, home resolution and the sim calendar (pure).
//
// A scenario fixes everything the engine may not invent: who lives in
// the household, the two candidate homes (verbatim complex names), the
// 30-day window, the seed, and the assumed durations (ride, workday).
// Full schema: docs/scenario-schema.md.

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DEFAULT_START_DATE = "2026-11-02"; // a Monday
export const DEFAULT_DAYS = 30;
export const DEFAULT_SEED = 20261102;
export const DEFAULT_BACKGROUND = 60;
export const DEFAULT_WORKDAY_MINUTES = 540; // 9 h, scenario assumption
export const DEFAULT_SCHOOLDAY_MINUTES = 360; // 6 h, scenario assumption

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
    if (!Number.isFinite(raw.ride_minutes) || raw.ride_minutes < 0) {
      fail(`${where}.work needs ride_minutes >= 0`);
    }
    return {
      type: "station_ride",
      station_name: raw.station_name, // string or {homeLabel: name}
      ride_minutes: raw.ride_minutes,
      ride_minutes_source: raw.ride_minutes_source || "user_assumption",
      needs_user_input: raw.needs_user_input === true,
    };
  }
  if (raw.type === "local_poi") {
    if (raw.name === undefined) fail(`${where}.work needs a POI name`);
    return { type: "local_poi", name: raw.name };
  }
  fail(`${where}.work has unknown type ${JSON.stringify(raw.type)}`);
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
  return {
    name: typeof raw.name === "string" ? raw.name : "scenario",
    start_date: raw.start_date === undefined ? DEFAULT_START_DATE : raw.start_date,
    days,
    seed,
    background,
    workday_minutes: raw.workday_minutes === undefined ? DEFAULT_WORKDAY_MINUTES : raw.workday_minutes,
    schoolday_minutes: raw.schoolday_minutes === undefined ? DEFAULT_SCHOOLDAY_MINUTES : raw.schoolday_minutes,
    household: { members },
    homes: homes.map((h) => ({ label: h.label, area: h.area, complex_name: h.complex_name })),
  };
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
export function resolveHome(area, home, router) {
  const matches = (area.complexes || [])
    .filter((c) => c.name === home.complex_name)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  if (matches.length === 0) fail(`home ${home.label}: no complex named ${JSON.stringify(home.complex_name)}`);
  const complex = matches[0];
  const byId = new Map((area.buildings || []).map((b) => [b.id, b]));
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
  return { complex, buildingId: best.buildingId, nodeId: best.nodeId };
}
