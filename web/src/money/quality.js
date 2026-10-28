// Quality-of-life card: three axes, no single score (pure).
//
// Per home, three groups side by side with units and sources: 시간
// (commute minutes/day, evening minutes at home), 돈 (monthly housing
// cost, 주거비 부담률, 남는 돈), 생활 편의 (grocery / park / clinic /
// station / restaurant&cafe within 10 walking minutes on the graph).
// No composite score by design; an optional "내 기준" weighting is the
// customer's own explicit input and is shown as such.

import { ADULT_MPS } from "../engine/agents.js";
import { criterionDefault } from "../engine/criteria.js";
import { buildPlaces } from "../engine/places.js";
import { resolveHome } from "../engine/scenario.js";

export const QOL_WALK_MINUTES = criterionDefault("C-convenience-radius", "walk_minutes");
export const QOL_SPEED_MPS = ADULT_MPS;

export function convenienceCounts(area, router, homeNodeId, walkMinutes = QOL_WALK_MINUTES, opts = {}) {
  const places = buildPlaces(area, router);
  const { dist } = router.distFrom(homeNodeId);
  const maxM = walkMinutes * 60 * QOL_SPEED_MPS;
  const within = (list) => list.filter((p) => {
    const d = dist.get(p.nodeId);
    return d !== undefined && d <= maxM;
  });
  const groceryList = [...within(places.shops.supermarket), ...within(places.shops.convenience)];
  const parkList = within(places.parks);
  const clinicList = within(places.clinics);
  const stationList = within(places.stations);
  const eateryList = within(places.eateries);
  const stationNames = new Set(stationList.map((p) => p.name));
  const out = {
    grocery: groceryList.length,
    park: parkList.length,
    clinic: clinicList.length,
    station: stationNames.size,
    station_pois: stationList.length,
    eatery: eateryList.length,
    walk_minutes: walkMinutes,
    speed_mps: QOL_SPEED_MPS,
    source: "graph",
  };
  // The 3D scene highlights the counted POIs on hover (stage 7, Part B):
  // money.mjs ships their ids alongside the counts.
  if (opts.includeIds) {
    out.poi_ids = {
      grocery: groceryList.map((p) => p.id),
      park: parkList.map((p) => p.id),
      clinic: clinicList.map((p) => p.id),
      station: stationList.map((p) => p.id),
      eatery: eateryList.map((p) => p.id),
    };
  }
  return out;
}

export function round1(n) {
  return Math.round(n * 10) / 10;
}

// money: {monthly_housing_won, burden_ratio, remaining_won,
//         monthly_net_won, source} from the money timeline + tenure cost.
// walkMinutes / includeIds flow the resolved convenience criterion into
// the counts (money.mjs passes them; tests use the defaults).
export function qualityCard(run, area, router, money = {}, walkMinutes = QOL_WALK_MINUTES, opts = {}) {
  const days = (run.meta && run.meta.days) || 30;
  const h = (run.totals && run.totals.household) || {};
  const home = { label: run.meta.home, area: run.meta.area, complex: run.meta.complex };
  let resolved = null;
  try {
    resolved = resolveHome(area, { ...home, complex_name: run.meta.complex }, router);
  } catch {
    resolved = null;
  }
  return {
    home,
    days,
    time: {
      commute_minutes_per_day: round1(((h.commute_walk_minutes || 0) + (h.commute_ride_minutes || 0)) / days),
      commute_walk_minutes_per_day: round1((h.commute_walk_minutes || 0) / days),
      commute_ride_minutes_per_day: round1((h.commute_ride_minutes || 0) / days),
      evening_at_home_minutes_per_day: round1((h.home_evening_minutes || 0) / days),
      unit: "minutes",
      source: "graph+scenario",
      note: "승차 시간은 가정값",
    },
    money: {
      monthly_housing_won: money.monthly_housing_won ?? null,
      burden_ratio: money.burden_ratio ?? null,
      remaining_won: money.remaining_won ?? null,
      monthly_net_won: money.monthly_net_won ?? null,
      tenure: money.tenure || null,
      source: money.source || "rtms",
    },
    convenience: resolved ? convenienceCounts(area, router, resolved.nodeId, walkMinutes, opts)
      : { grocery: 0, park: 0, clinic: 0, station: 0, eatery: 0, source: "graph" },
    weights: money.weights || null, // "내 기준": the customer's own weighting, never ours
    no_score_note: "종합 점수는 매기지 않습니다. 세 축을 나란히 보고 고객이 직접 판단합니다.",
  };
}
