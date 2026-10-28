// Household + background agents (pure).
//
// Household members live at the resolved home entrance. Background
// neighbours (시뮬레이션 주민, never named after real people) are
// synthesised into residential buildings weighted by households when
// present, else floors × footprint, and get simple routines from the
// same rules. All synthesis draws come from one stream ("background"),
// so household streams never shift with the background count.

import { intBelow, shuffled, streamFor } from "./prng.js";

export const ADULT_MPS = 1.3;
export const SLOW_MPS = 1.1; // children and seniors
export const MAX_HOME_ANCHOR_M = 150;

export function speedOf(role) {
  return role === "adult" ? ADULT_MPS : SLOW_MPS;
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

function anchorableHomes(area, router) {
  const out = [];
  for (const b of area.buildings || []) {
    if (!["apartment", "house", "mixed"].includes(b.residential)) continue;
    if (!b.geometry) continue;
    const [lon, lat] = buildingAnchorLonLat(b);
    const n = router.nearestNode(lon, lat);
    if (n.id === null || n.distM > MAX_HOME_ANCHOR_M) continue;
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

function backgroundRoutine(rng) {
  const commuter = rng() < 0.7;
  const r = rng();
  const role = r < 0.8 ? "adult" : r < 0.9 ? "senior" : "child";
  return {
    role,
    commuter: role === "child" ? false : commuter,
    school: role === "child",
    workdays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    schooldays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    errands_per_week: {
      supermarket: 1 + intBelow(rng, 2), // 1..2
      convenience: intBelow(rng, 3), // 0..2
    },
    park_walks_per_week: intBelow(rng, 3), // 0..2
    clinic_visits_per_month: intBelow(rng, 2), // 0..1
  };
}

export function buildAgents(area, scenario, home, homeNode, router) {
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
      speed: speedOf(m.role),
    });
  });
  const n = scenario.background;
  if (n > 0) {
    const homes = anchorableHomes(area, router);
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
      const routine = backgroundRoutine(rng);
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
        speed: speedOf(routine.role),
      });
    }
  }
  return agents;
}

// Weekly/monthly schedule + per-day departure jitter, all drawn up
// front from the agent's own stream (fixed order, never shifted by
// hook choices). Returns {errands: {cat: Set(days)},
// parkDays: Set, clinicDays: Set, departJitter: [mins], ...}.
export function planSchedule(agent, scenario) {
  const rng = streamFor(scenario.seed, agent.key);
  const days = scenario.days;
  const errands = { supermarket: new Set(), convenience: new Set() };
  const parkDays = new Set();
  const weeks = Math.ceil(days / 7);
  for (let w = 0; w < weeks; w++) {
    for (const cat of ["supermarket", "convenience"]) {
      const k = Math.min(7, agent.errands_per_week[cat]);
      for (const wd of shuffled(rng, [0, 1, 2, 3, 4, 5, 6]).slice(0, k)) {
        const d = w * 7 + wd;
        if (d < days) errands[cat].add(d);
      }
    }
    const kp = Math.min(7, agent.park_walks_per_week);
    for (const wd of shuffled(rng, [0, 1, 2, 3, 4, 5, 6]).slice(0, kp)) {
      const d = w * 7 + wd;
      if (d < days) parkDays.add(d);
    }
  }
  const clinicDays = new Set();
  const kc = Math.min(days, agent.clinic_visits_per_month);
  const allDays = Array.from({ length: days }, (_, d) => d);
  for (const d of shuffled(rng, allDays).slice(0, kc)) clinicDays.add(d);
  // Morning departure jitter per day (0..59 min past the 07:30/08:00
  // anchors), drawn in day order.
  const departJitter = Array.from({ length: days }, () => intBelow(rng, 60));
  return { errands, parkDays, clinicDays, departJitter };
}

export { shuffled };
