// Household + background agents (pure).
//
// Household members live at the resolved home entrance. Background
// neighbours (시뮬레이션 주민, never named after real people) are
// synthesised into residential buildings weighted by households when
// present, else floors × footprint, and get simple routines from the
// same rules. All synthesis draws come from one stream ("background"),
// so household streams never shift with the background count.

import { intBelow, shuffled, streamFor } from "./prng.js";
import { criterionDefault, defaultFlat, resolveCriteria } from "./criteria.js";
import { WEEKDAYS, weekdayOf } from "./scenario.js";

// Defaults alias the criteria file (C-walk-speed, C-neighbour); per-run
// code uses the resolved flat values threaded through buildAgents and
// planSchedule so criteria_overrides apply.
export const ADULT_MPS = criterionDefault("C-walk-speed", "adult_mps");
export const SLOW_MPS = criterionDefault("C-walk-speed", "slow_mps"); // children and seniors
export const MAX_HOME_ANCHOR_M = criterionDefault("C-neighbour", "anchor_max_m");

const DEFAULTS = defaultFlat();

export function speedOf(role, flat = null) {
  const f = flat || DEFAULTS;
  return role === "adult" ? f.adult_mps : f.slow_mps;
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

function floorsOf(building) {
  if (Number.isInteger(building.levels) && building.levels > 0) return building.levels;
  return Math.max(1, Math.round((building.height_m || 3) / 3));
}

// Household weight: register households (세대수) when present, else
// floors × footprint area.
export function homeWeight(building) {
  const hh = building.register && building.register.api && building.register.api.households;
  if (Number.isInteger(hh) && hh > 0) return hh;
  return Math.max(1, Math.round(floorsOf(building) * (building.area_m2 || 50)));
}

function anchorableHomes(area, router, flat) {
  const out = [];
  for (const b of area.buildings || []) {
    if (!["apartment", "house", "mixed"].includes(b.residential)) continue;
    if (!b.geometry) continue;
    const [lon, lat] = buildingAnchorLonLat(b);
    const n = router.nearestNode(lon, lat);
    if (n.id === null || n.distM > flat.anchor_max_m) continue;
    out.push({ building: b, buildingId: b.id, nodeId: n.id, weight: homeWeight(b) });
  }
  out.sort((a, b) => (a.buildingId < b.buildingId ? -1 : 1));
  return out;
}

// Weighted draw with replacement (cumulative weights + binary search).
function weightedDraw(rng, homes, total) {
  let r = rng() * total;
  let lo = 0;
  let hi = homes.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (r < homes[mid].cum) hi = mid;
    else lo = mid + 1;
  }
  return homes[lo];
}

function backgroundRoutine(rng, flat) {
  const commuter = rng() < flat.commuter_p;
  const r = rng();
  const role = r < flat.bg_adult_p ? "adult" : r < flat.bg_senior_p ? "senior" : "child";
  return {
    role,
    commuter: role === "child" ? false : commuter,
    school: role === "child",
    workdays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    schooldays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    errands_per_week: {
      supermarket: flat.bg_supermarket_min
        + intBelow(rng, flat.bg_supermarket_max - flat.bg_supermarket_min + 1),
      convenience: intBelow(rng, flat.bg_convenience_max + 1),
    },
    park_walks_per_week: intBelow(rng, flat.bg_park_max + 1),
    clinic_visits_per_month: intBelow(rng, flat.bg_clinic_max + 1),
  };
}

export function buildAgents(area, scenario, home, homeNode, router, flat = null) {
  const F = flat || resolveCriteria(scenario).flat;
  const agents = [];
  scenario.household.members.forEach((m, i) => {
    agents.push({
      key: `h${i + 1}`,
      id: m.id,
      label: m.label,
      role: m.role,
      household: true,
      home_building: home.buildingId,
      home_node: homeNode,
      work: m.work,
      school: m.school,
      workdays: m.workdays,
      schooldays: m.schooldays,
      errands_per_week: m.errands_per_week,
      park_walks_per_week: m.park_walks_per_week,
      clinic_visits_per_month: m.clinic_visits_per_month,
      speed: speedOf(m.role, F),
    });
  });
  const n = scenario.background;
  if (n > 0) {
    const homes = anchorableHomes(area, router, F);
    if (homes.length === 0) throw new Error(`area ${area.area}: no anchorable residential building for background agents`);
    let total = 0;
    for (const h of homes) {
      total += h.weight;
      h.cum = total;
    }
    const rng = streamFor(scenario.seed, "background");
    const width = Math.max(2, String(n).length);
    for (let i = 0; i < n; i++) {
      const pick = weightedDraw(rng, homes, total);
      const routine = backgroundRoutine(rng, F);
      agents.push({
        key: `b${String(i + 1).padStart(width, "0")}`,
        id: `b${String(i + 1).padStart(width, "0")}`,
        label: `주민 ${String(i + 1).padStart(2, "0")}`,
        role: routine.role,
        household: false,
        home_building: pick.buildingId,
        home_node: pick.nodeId,
        work: routine.commuter ? { type: "nearest_station" } : { type: "none" },
        school: routine.school,
        workdays: routine.workdays,
        schooldays: routine.schooldays,
        errands_per_week: routine.errands_per_week,
        park_walks_per_week: routine.park_walks_per_week,
        clinic_visits_per_month: routine.clinic_visits_per_month,
        speed: speedOf(routine.role, F),
      });
    }
  }
  return agents;
}

// Weekend wishes: what the agent feels like on a weekend day, drawn
// home-independently (uniform over the weekend categories + staying
// home). Recorded on the weekend_plan decision as context; the rule
// default stays the fastest reachable category, so wishes never move a
// trip by themselves.
export const WEEKEND_WISH_KEYS = ["park", "supermarket", "convenience", "clinic", "home"];

// Weekly/monthly schedule + per-day departure jitter + weekend wishes,
// all drawn up front (before any routing) from independent streams
// keyed by (seed, agent, week/day, purpose) — never one shared stream.
// Home-independent draws therefore cannot drift between homes A and B:
// the same (seed, agent) always sees the same errand days, park days,
// jitter and wishes, whatever the routes look like. Returns {errands:
// {cat: Set(days)}, parkDays: Set, clinicDays: Set, departJitter:
// [mins], weekendWishes: Map(day -> wish key)}.
export function planSchedule(agent, scenario, flat = null) {
  const F = flat || resolveCriteria(scenario).flat;
  const seed = scenario.seed;
  const key = agent.key;
  const days = scenario.days;
  const errands = { supermarket: new Set(), convenience: new Set() };
  const parkDays = new Set();
  const weeks = Math.ceil(days / 7);
  for (let w = 0; w < weeks; w++) {
    for (const cat of ["supermarket", "convenience"]) {
      const rng = streamFor(seed, `${key}:w${w}:${cat}`);
      const k = Math.min(7, agent.errands_per_week[cat]);
      for (const wd of shuffled(rng, [0, 1, 2, 3, 4, 5, 6]).slice(0, k)) {
        const d = w * 7 + wd;
        if (d < days) errands[cat].add(d);
      }
    }
    const rngPark = streamFor(seed, `${key}:w${w}:park`);
    const kp = Math.min(7, agent.park_walks_per_week);
    for (const wd of shuffled(rngPark, [0, 1, 2, 3, 4, 5, 6]).slice(0, kp)) {
      const d = w * 7 + wd;
      if (d < days) parkDays.add(d);
    }
  }
  const clinicDays = new Set();
  const kc = Math.min(days, agent.clinic_visits_per_month);
  const allDays = Array.from({ length: days }, (_, d) => d);
  const rngClinic = streamFor(seed, `${key}:clinic`);
  for (const d of shuffled(rngClinic, allDays).slice(0, kc)) clinicDays.add(d);
  // Morning departure jitter per day (0..59 min past the 07:30/08:00
  // anchors), each day from its own stream.
  const span = F.jitter_max - F.jitter_min + 1;
  const departJitter = Array.from({ length: days }, (_, d) => {
    const rng = streamFor(seed, `${key}:${d}:jitter`);
    return F.jitter_min + intBelow(rng, span);
  });
  // Weekend wishes, one per Sat/Sun, each from its own stream.
  const weekendWishes = new Map();
  for (let d = 0; d < days; d++) {
    const weekday = WEEKDAYS[weekdayOf(scenario.start_date, d)];
    if (weekday !== "Sat" && weekday !== "Sun") continue;
    const rng = streamFor(seed, `${key}:${d}:weekend`);
    weekendWishes.set(d, WEEKEND_WISH_KEYS[intBelow(rng, WEEKEND_WISH_KEYS.length)]);
  }
  return { errands, parkDays, clinicDays, departJitter, weekendWishes };
}

export { shuffled };
