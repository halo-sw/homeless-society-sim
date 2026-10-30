// Daily routines: the rule defaults the judge layer branches on (pure).
//
// Every agent's day is an ordered, non-overlapping timeline on the
// minute grid: morning commute and/or school, midday errands and clinic
// visits, and an evening park-or-home branch. Household weekends run one
// weekend_plan (up to 3 reachable activities, in order) instead of the
// scheduled midday/evening branches. All randomness was drawn up front
// (agents.planSchedule); this module only converts schedules + graph
// routes into trips, away intervals, decisions and summaries.
//
// Sources: trip minutes/distances come from the walk graph; ride,
// workday, schoolday and dwell durations are scenario assumptions.
// `unavailable` records are written for household members only —
// background neighbours adapt silently (their routine was synthesised,
// never requested) so the signal stays about the user's scenario.
//
// Anchors, dwells, gaps and tolerances come from the resolved criteria
// (ctx.crit, see engine/criteria.js); the module-level constants below
// are the same defaults for import-compatible readers. Every trip and
// stay carries a `cause` object {type, criterion_ids, decision_id?,
// text} built where it was scheduled, so the UI can always say what is
// happening and why (stage 7, Part A).

import { destForHome, nameForHome, rideMinutesForHome, weekdayOf, WEEKDAYS, dateOf } from "./scenario.js";
import { MAX_ANCHOR_M, nearestRoundTrip, poisByName, stationsByName } from "./places.js";
import { ruleDefault, WEEKEND_HOME } from "./decisions.js";
import { criterionDefault, defaultFlat, resolveCriteria } from "./criteria.js";
import { CAPACITY_PCT, buildRides, rideLegFatigue, walkFatigue } from "./journey.js";
import { bboxContains, resolveWorkplace, stationCoords } from "./workplace.js";

export const MORNING_ANCHOR = criterionDefault("C-commute-depart", "morning_anchor_min"); // 07:30 + jitter
export const SCHOOL_ANCHOR = criterionDefault("C-commute-depart", "school_anchor_min"); // 08:00 + jitter
export const MIDDAY_ANCHOR = criterionDefault("C-daily-rhythm", "midday_anchor_min"); // 10:00
export const EVENING_ANCHOR = criterionDefault("C-daily-rhythm", "evening_anchor_min"); // 16:00
export const AFTER_GAP = criterionDefault("C-daily-rhythm", "after_gap_min"); // minutes between activities
export const SHOP_DWELL = criterionDefault("C-shop-dwell", "dwell_min"); // minutes in the shop
export const CLINIC_DWELL = criterionDefault("C-clinic-dwell", "dwell_min");
export const PARK_DWELL = criterionDefault("C-park-dwell", "dwell_min");
export const EVENING_START = criterionDefault("C-measure-evening", "evening_start_min"); // 18:00
export const DAY_END = criterionDefault("C-measure-evening", "day_end_min"); // 24:00
export const STATION_ROUTE_TOLERANCE = criterionDefault("C-station-route", "tolerance_ratio"); // 2nd entrance within 20 %
export const FATIGUE_CLAMP = criterionDefault("C-fatigue-recovery", "clamp_max"); // 0–100

const DEFAULTS = defaultFlat();

// Weekend-plan activity categories: each maps to a places list, a
// dwell, an away kind and the trip purpose/counter it feeds. Only
// categories with a reachable round trip from home become options.
// Dwells here are the criteria defaults; planAgent rebuilds them per
// run from the resolved criteria (overrides apply).
export const WEEKEND_CATS = [
  { key: "park", dwell: PARK_DWELL, away: "park", purpose: "park", stay: "산책" },
  { key: "supermarket", dwell: SHOP_DWELL, away: "errand", purpose: "errand", stay: "장보기" },
  { key: "convenience", dwell: SHOP_DWELL, away: "errand", purpose: "errand", stay: "장보기" },
  { key: "clinic", dwell: CLINIC_DWELL, away: "clinic", purpose: "clinic", stay: "진료" },
];

const WEEKDAY_KO = { Mon: "월", Tue: "화", Wed: "수", Thu: "목", Fri: "금", Sat: "토", Sun: "일" };
const SHOP_CAT_KO = { supermarket: "대형마트", convenience: "편의점" };

export function weekendPlaces(places, key) {
  if (key === "park") return places.parks;
  if (key === "supermarket") return places.shops.supermarket;
  if (key === "convenience") return places.shops.convenience;
  if (key === "clinic") return places.clinics;
  return [];
}

export function isWeekendDay(weekday) {
  return weekday === "Sat" || weekday === "Sun";
}

export const round1 = (x) => Math.round(x * 10) / 10;
export const round2 = (x) => Math.round(x * 100) / 100;

export const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

function overlap(a0, a1, b0, b1) {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

// A cause records why a trip or stay exists, in the engine's own words:
// type "routine" (the daily rule scheduled it), "decision" (a branch
// record chose its destination/plan — decision_id joins it), or "input"
// (the customer's scenario schedule drove it; background neighbours,
// whose schedule was synthesised, read "routine" instead).
function makeCause(type, criterion_ids, text, decision_id = null) {
  const cause = { type, criterion_ids: [...criterion_ids], text };
  if (decision_id) cause.decision_id = decision_id;
  return cause;
}

export function planAgent(agent, day, ctx) {
  const { scenario, homeLabel, home, router, places, decider, schedule, collect } = ctx;
  const F = (ctx && ctx.crit) || (scenario ? resolveCriteria(scenario).flat : DEFAULTS);
  const region = (ctx && ctx.region) || null;
  // Destination-area graph for place commutes (stage 9c): {area, router,
  // places} or null. destAreaId/homeAreaId tag remote trips; homeBbox
  // gates the in-area walk check (fixture areas carry no bbox — then the
  // graph alone decides).
  const dest = (ctx && ctx.dest) || null;
  const destAreaId = (ctx && ctx.destAreaId) || null;
  const homeAreaId = (ctx && ctx.homeAreaId) || null;
  const homeBbox = (ctx && ctx.homeBbox) || null;
  const weekday = WEEKDAYS[weekdayOf(scenario.start_date, day)];
  const wk = WEEKDAY_KO[weekday] || weekday;
  const speed = agent.speed;
  let seq = 0; // decision sequence for this agent-day
  let clock = null; // end minute of the last activity
  let errandsDone = 0;
  let parkVisits = 0;
  let commuteWalk = 0; // graph minutes on commute/school legs
  let commuteRide = 0; // assumed ride minutes (station_ride only)
  // Fatigue (stage 8, household only): the day opens at the overnight
  // baseline; every load/recovery rounds to 0.1 so trip deltas and the
  // series points always agree. Background neighbours carry no series.
  let fat = agent.household ? F.fatigue_overnight_base : null;
  let fatPeak = fat;
  let fatCrowded = 0;
  let fatArrivalWork = null;
  let fatAfterHome = null;
  // The day's most crowded boarding (stage 9c): shown beside fatigue
  // everywhere ("혼잡도 93 %, 서서 감"), so 0 crowded minutes reads as a
  // measurement, not a gap. Strictly-greater wins (first boarding keeps
  // ties — deterministic).
  let fatPeakCong = null;
  const noteCongestion = (pct, line, station, source) => {
    if (!Number.isFinite(pct)) return;
    if (fatPeakCong === null || pct > fatPeakCong.pct) {
      fatPeakCong = { pct, line: line || null, station: station || null, source: source || null };
    }
  };
  const noteRidePeak = (ride) => {
    for (const leg of (ride && ride.legs) || []) {
      const c = leg.congestion;
      if (c) noteCongestion(c.valuePct, leg.lineName, c.station, c.source);
    }
  };
  const fatSeries = agent.household ? [{ m: 0, v: round1(fat), label: "시작" }] : [];
  const fatPoint = (m, label = null) => {
    if (fat !== null) fatSeries.push({ m, v: round1(fat), label });
  };
  const fatLoad = (x) => {
    if (fat === null) return;
    fat = Math.min(FATIGUE_CLAMP, round1(fat + x));
    if (fat > fatPeak) fatPeak = fat;
  };
  const fatRecover = (mins, rate) => {
    if (fat === null || !(mins > 0)) return;
    fat = Math.max(0, round1(fat - mins * rate));
  };
  const homeGapTo = (depart) => {
    const from = clock === null ? 0 : clock;
    const gap = depart - from;
    if (fat !== null && gap > 0 && fat > 0) {
      // The value path is linear-then-flat: mark where it hits zero so
      // the series never reads stale mid-gap (overnight especially).
      const zeroIn = fat / F.fatigue_home_per_min;
      if (zeroIn < gap) {
        fatSeries.push({ m: Math.ceil(from + zeroIn), v: 0, label: null });
      }
    }
    fatRecover(gap, F.fatigue_home_per_min);
  };
  const trips = [];
  const aways = [];
  const weekendCats = WEEKEND_CATS.map((c) => ({
    ...c,
    dwell: c.key === "park" ? F.park_dwell_min
      : c.key === "clinic" ? F.clinic_dwell_min : F.shop_dwell_min,
  }));

  const homeEnd = () => ({ kind: "home", id: "home", label: home.complex.name });
  const poiEnd = (place) => ({ kind: "poi", id: place.id, label: place.name });

  function addTrip(depart, route, from, to, purpose, cause, labels = {}) {
    homeGapTo(depart); // at-home recovery since the last activity
    fatPoint(depart, labels.depart || null);
    const distance_m = round2(route.lengthM);
    const spd = labels.speedMps || speed;
    const minutes = round1(route.lengthM / spd / 60);
    const arrive = depart + Math.max(1, Math.round(minutes));
    const fatigueDelta = labels.mode === "bike"
      ? round1(walkFatigue(minutes, F) * 0.6)
      : round1(walkFatigue(minutes, F));
    fatLoad(fatigueDelta);
    fatPoint(arrive, labels.arrive || null);
    const trip = {
      id: `t${String(collect.tripSeq++).padStart(6, "0")}`,
      agent: agent.key, day, depart_min: depart, arrive_min: arrive,
      from, to, purpose, distance_m, minutes, path: route.nodeIds,
      congestion: null, // walk legs have no congestion reading
      fatigue_delta: fatigueDelta,
      cause,
    };
    if (labels.mode) trip.mode = labels.mode;
    trips.push(trip);
    collect.trips.push(trip);
    clock = arrive;
    if (purpose === "commute" || purpose === "school") commuteWalk += minutes;
    return trip;
  }

  // A commute walk on the destination graph (stage 9c): same minute grid
  // and walk fatigue as addTrip, but the path belongs to another area's
  // graph (graph_area tags it; remote marks a foreign graph so the scene
  // never samples it on the home map). No at-home recovery — the member
  // is away.
  function addRemoteTrip(depart, leg, from, to, cause, labels = {}) {
    fatPoint(depart, labels.depart || null);
    const distance_m = round2(leg.distance_m);
    const minutes = round1(leg.minutes);
    const arrive = depart + Math.max(1, Math.round(minutes));
    const fatigueDelta = round1(walkFatigue(minutes, F));
    fatLoad(fatigueDelta);
    fatPoint(arrive, labels.arrive || null);
    const trip = {
      id: `t${String(collect.tripSeq++).padStart(6, "0")}`,
      agent: agent.key, day, depart_min: depart, arrive_min: arrive,
      from, to, purpose: "commute", distance_m, minutes, path: leg.path,
      remote: leg.graphArea !== homeAreaId, graph_area: leg.graphArea,
      congestion: null, // walk legs have no congestion reading
      fatigue_delta: fatigueDelta,
      cause,
    };
    trips.push(trip);
    collect.trips.push(trip);
    clock = arrive;
    commuteWalk += minutes;
    return trip;
  }

  // Seated stays (work/school) recover; errand/clinic/park stays are
  // neutral. Old-form station-ride work aways replay the ride timeline
  // inside: out-ride load, seated work hours, back-ride load — from the
  // journey legs when a path was drawn, else from the fallback
  // congestion. New-form (stage 9c) ride aways carry one direction each.
  function addAway(start, end, kind, label, detail, cause, labels = {}) {
    const rides = detail && detail.rides;
    const fallback = detail && detail.ride_fallback;
    if (kind === "ride") {
      const ride = detail && detail.ride;
      const dir = (detail && detail.direction) === "back" ? "back" : "out";
      fatPoint(start, dir === "out" ? "출근 승차" : "퇴근 승차");
      if (ride) {
        fatLoad(ride.fatigueDelta);
        fatCrowded = round1(fatCrowded + ride.crowdedMin);
      } else if (fallback) {
        fatLoad(fallback.delta);
        if (fallback.congestion_pct > CAPACITY_PCT) {
          fatCrowded = round1(fatCrowded + fallback.ride_minutes);
        }
      }
      fatPoint(end, "하차");
    } else if ((kind === "work") && (rides || fallback)) {
      const outD = rides ? rides.out.fatigueDelta : fallback.out_delta;
      const backD = rides ? rides.back.fatigueDelta : fallback.back_delta;
      const outLen = rides ? rides.out.minutesTotal : fallback.ride_minutes;
      const backLen = rides ? rides.back.minutesTotal : fallback.ride_minutes;
      fatPoint(start, "출근 승차");
      fatLoad(outD);
      fatArrivalWork = fat;
      fatPoint(start + outLen, "근무 시작");
      fatRecover((detail && detail.seated_minutes) || 0, F.fatigue_seated_per_min);
      fatPoint(end - backLen, "근무 종료");
      fatLoad(backD);
      const crowded = rides ? rides.out.crowdedMin + rides.back.crowdedMin
        : (fallback.congestion_pct > CAPACITY_PCT ? 2 * fallback.ride_minutes : 0);
      fatCrowded = round1(fatCrowded + crowded);
    } else if (kind === "work" || kind === "school") {
      fatRecover((detail && detail.seated_minutes) || 0, F.fatigue_seated_per_min);
    }
    fatPoint(end, labels.end || null);
    const rec = { agent: agent.key, day, kind, start_min: start, end_min: end, label, cause };
    if (detail) rec.detail = detail;
    aways.push(rec);
    collect.aways.push(rec);
    clock = end;
    return rec;
  }

  function unavailable(activity, category, detail) {
    if (!agent.household) return; // background adapts silently
    const rec = { agent: agent.key, day, activity, category };
    if (detail !== undefined) rec.detail = detail;
    collect.unavailable.push(rec);
  }

  function decide(kind, minute, options, default_key, extra = {}) {
    const rec = decider.resolve({ agent: agent.key, day, minute, kind, options, default_key, ...extra }, seq++);
    collect.decisions.push(rec);
    return rec;
  }

  function minutesFor(lengthM) {
    return round1(lengthM / speed / 60);
  }

  function anchorText(anchor, depart) {
    return `${hhmm(anchor)} 기준+지터${depart - anchor}분 → ${hhmm(depart)} 출발`;
  }

  // --- morning: commute and/or school (chained on the running clock) ---
  function commuteStation(stationPlaces, depart) {
    const cands = nearestRoundTrip(router, agent.home_node, stationPlaces, 2);
    if (cands.length === 0) return null;
    let dest = cands[0];
    let decision = null;
    if (cands.length === 2 && cands[0].lengthM !== cands[1].lengthM
        && cands[1].lengthM <= cands[0].lengthM * F.station_tolerance) {
      const options = cands.map((c, i) => ({
        key: `s${i}`, label: c.place.name, minutes: minutesFor(c.lengthM),
        distance_m: round2(c.lengthM), poi_id: c.place.id,
      }));
      decision = decide("station_route", depart, options, ruleDefault(options));
      dest = cands[Number(decision.chosen_key.slice(1))];
    }
    return { dest, decision };
  }

  // Old-form station ride (no work.place): one work away covering the
  // out ride, the workday and the back ride. Behaviour is unchanged;
  // rideMinutesForHome only adds per-home map support (numbers behave
  // exactly as before). placedNull reuses this shape for a named
  // workplace the engine cannot locate, labelled by the workplace name.
  function commuteLegacy(work, depart, placedNull = false) {
    const rideMin = rideMinutesForHome(work, homeLabel);
    if (rideMin === null) {
      unavailable("commute", "ride", `${homeLabel} 경로의 승차 시간 입력 없음`);
      return;
    }
    const rideIds = ["C-ride-minutes"];
    const name = nameForHome(work.station_name, homeLabel);
    const stations = stationsByName(places, name);
    if (stations.length === 0) {
      unavailable("commute", "station", name);
      return;
    }
    const found = commuteStation(stations, depart);
    if (found === null) {
      unavailable("commute", "station", name);
      return;
    }
    const ids = ["C-commute-depart", "C-walk-speed", "C-walk-route", "C-work-days",
      ...rideIds, "C-congestion", "C-fatigue-load", "C-fatigue-recovery"];
    if (found.decision) ids.push("C-station-route");
    const cause = makeCause("routine", ids,
      `${wk} 근무일 · ${anchorText(F.morning_anchor_min, depart)}`,
      found.decision ? found.decision.id : null);
    const out = addTrip(depart, found.dest.route, homeEnd(), poiEnd(found.dest.place), "commute", cause);
    commuteRide += rideMin * 2;
    const awayEnd = out.arrive_min + rideMin + F.workday_minutes + rideMin;
    // The journey path (both directions) when the destination is
    // known and the region network is loaded; else the ride stays
    // numeric and fatigue uses the fallback congestion.
    const destName = destForHome(work.destination_station, homeLabel);
    let rides = null;
    let journeyNote = null;
    if (!destName) journeyNote = "목적지 역 없음";
    else if (!region || !region.network) journeyNote = "노선도 없음";
    else {
      rides = buildRides({
        network: region.network, congestion: region.congestion || null,
        fromName: name, toName: destName, rideMinutes: rideMin,
        departOut: out.arrive_min, departBack: awayEnd - rideMin,
        weekday, crit: F,
      });
      if (!rides) journeyNote = "노선도에 없는 역";
      else {
        cause.criterion_ids.push("C-journey-path", "C-ride-split");
        noteRidePeak(rides.out);
        noteRidePeak(rides.back);
      }
    }
    if (placedNull) {
      journeyNote = journeyNote
        ? `${journeyNote}; 근무지 위치 확인 불가` : "근무지 위치 확인 불가";
    }
    const detail = {
      ride_minutes: rideMin, workday_minutes: F.workday_minutes,
      seated_minutes: F.workday_minutes,
      ride_minutes_source: work.ride_minutes_source || "user_assumption",
      rides, journey_note: journeyNote,
    };
    if (!rides && rideMin > 0) {
      const perRide = round1(rideLegFatigue(rideMin,
        F.congestion_fallback_pct, F));
      detail.ride_fallback = { out_delta: perRide, back_delta: perRide,
        ride_minutes: rideMin,
        congestion_pct: F.congestion_fallback_pct, source: "가정값" };
      noteCongestion(F.congestion_fallback_pct, null, name, "가정값");
    }
    const label = placedNull && work.place
      ? `${work.place.name} 근무` : `${found.dest.place.name} 방면 근무`;
    addAway(out.arrive_min, awayEnd, "work", label, detail, cause);
    addTrip(awayEnd, found.dest.back, poiEnd(found.dest.place), homeEnd(), "commute", cause,
      { arrive: "귀가" });
    fatAfterHome = fat;
  }

  // Destination walk for a place commute (stage 9c): the alighting
  // station to the workplace on the destination graph. Graph minutes
  // only — never a straight-line estimate (see graph.js): without a
  // loaded destination area, an anchored station, or a route, the walk
  // is 0 with an explicit note.
  function planDestWalk(destName, wp) {
    const none = (note) => ({ go: null, back: null, source: "none", note, graphArea: destAreaId });
    if (!destName) return none("목적지 역 없음");
    if (!dest) return none("목적지 지역 미생성");
    const networkHit = region && region.network ? stationCoords(region.network, destName) : null;
    let anchor = networkHit ? { lon: networkHit.lon, lat: networkHit.lat } : null;
    if (!anchor) {
      const pois = stationsByName(dest.places, destName);
      if (pois.length > 0) anchor = { lon: pois[0].lon, lat: pois[0].lat };
    }
    if (!anchor) return none("하차역 위치 확인 불가");
    const sNode = dest.router.nearestNode(anchor.lon, anchor.lat);
    const wNode = dest.router.nearestNode(wp.lon, wp.lat);
    if (sNode.id === null || wNode.id === null
        || sNode.distM > MAX_ANCHOR_M || wNode.distM > MAX_ANCHOR_M) {
      return none("목적지 도보 연결 확인 불가");
    }
    const go = dest.router.route(sNode.id, wNode.id);
    const back = dest.router.route(wNode.id, sNode.id);
    if (!go || !back) return none("목적지 도보 연결 확인 불가");
    return { go, back, source: "graph", note: "", graphArea: destAreaId };
  }

  // Place-based commute (stage 9c): the workplace is a place, so the
  // engine derives the commute per home. In-area within
  // C-walk-commute-max → walk there and back. Otherwise → walk to the
  // home station, ride (the customer's per-path minutes, split on the
  // stage-8 path), walk from the alighting station to the workplace,
  // and mirror it home. Work is labelled by the workplace and starts
  // on arrival there — the ride is its own leg, never "work".
  function commutePlace(work, depart) {
    const rideMin = rideMinutesForHome(work, homeLabel);
    const wp = resolveWorkplace(work.place, { places, network: region && region.network });
    if (!wp) {
      commuteLegacy(work, depart, true);
      return;
    }
    const wpId = wp.how === "poi" && wp.poiId ? wp.poiId : `workplace:${agent.key}`;
    const inBbox = !homeBbox || bboxContains(homeBbox, wp.lon, wp.lat);
    let walkCand = null;
    let walkMin = null;
    if (inBbox) {
      const anchor = router.nearestNode(wp.lon, wp.lat);
      if (anchor.id !== null && anchor.distM <= MAX_ANCHOR_M) {
        const cands = nearestRoundTrip(router, agent.home_node,
          [{ id: wpId, name: wp.name, lon: wp.lon, lat: wp.lat, nodeId: anchor.id }], 1);
        if (cands.length > 0) {
          walkCand = cands[0];
          walkMin = cands[0].lengthM / speed / 60;
        }
      }
    }
    if (walkCand && walkMin <= F.walk_commute_max_min) {
      const cause = makeCause("routine",
        ["C-commute-depart", "C-walk-speed", "C-walk-route", "C-work-days",
          "C-walk-commute-max", "C-fatigue-load", "C-fatigue-recovery"],
        `${wk} 근무일 · ${anchorText(F.morning_anchor_min, depart)} · ` +
        `${wp.name}까지 도보 ${round1(walkMin)}분(${F.walk_commute_max_min}분 이내)`);
      const end = { kind: "poi", id: walkCand.place.id, label: wp.name };
      const out = addTrip(depart, walkCand.route, homeEnd(), end, "commute", cause);
      fatArrivalWork = fat;
      const awayEnd = out.arrive_min + F.workday_minutes;
      addAway(out.arrive_min, awayEnd, "work", `${wp.name} 근무`, {
        workday_minutes: F.workday_minutes, seated_minutes: F.workday_minutes,
        workplace: { name: wp.name, lon: wp.lon, lat: wp.lat },
        commute: "walk",
      }, cause);
      addTrip(awayEnd, walkCand.back, end, homeEnd(), "commute", cause,
        { arrive: "귀가" });
      fatAfterHome = fat;
      return;
    }
    if (rideMin === null) {
      unavailable("commute", "ride", `${homeLabel} 경로의 승차 시간 입력 없음`);
      return;
    }
    const name = nameForHome(work.station_name, homeLabel);
    const stations = stationsByName(places, name);
    if (stations.length === 0) {
      unavailable("commute", "station", name);
      return;
    }
    const found = commuteStation(stations, depart);
    if (found === null) {
      unavailable("commute", "station", name);
      return;
    }
    const destName = destForHome(work.destination_station, homeLabel);
    const dw = planDestWalk(destName, wp);
    const dwGoMin = dw.go ? round1(dw.go.lengthM / speed / 60) : 0;
    const dwBackMin = dw.back ? round1(dw.back.lengthM / speed / 60) : 0;
    const overText = walkCand
      ? `도보 ${round1(walkMin)}분(${F.walk_commute_max_min}분 초과)`
      : "도보 연결 없음";
    const ids = ["C-commute-depart", "C-walk-speed", "C-walk-route", "C-work-days",
      "C-walk-commute-max", "C-ride-minutes", "C-congestion", "C-fatigue-load", "C-fatigue-recovery"];
    if (found.decision) ids.push("C-station-route");
    const cause = makeCause("routine", ids,
      `${wk} 근무일 · ${anchorText(F.morning_anchor_min, depart)} · ` +
      `${wp.name}까지 ${overText} → ${name}역 승차`,
      found.decision ? found.decision.id : null);
    const out = addTrip(depart, found.dest.route, homeEnd(), poiEnd(found.dest.place), "commute", cause);
    commuteRide += rideMin * 2;
    const dwGoLen = dw.go && dwGoMin > 0 ? Math.max(1, Math.round(dwGoMin)) : 0;
    const dwBackLen = dw.back && dwBackMin > 0 ? Math.max(1, Math.round(dwBackMin)) : 0;
    const tBoard = out.arrive_min;
    const tWork = tBoard + rideMin + dwGoLen;
    const tWorkEnd = tWork + F.workday_minutes;
    const tBackBoard = tWorkEnd + dwBackLen;
    const tStation = tBackBoard + rideMin;
    let rides = null;
    let journeyNote = null;
    if (!(rideMin > 0)) journeyNote = "승차 시간 0분";
    else if (!destName) journeyNote = "목적지 역 없음";
    else if (!region || !region.network) journeyNote = "노선도 없음";
    else {
      rides = buildRides({
        network: region.network, congestion: region.congestion || null,
        fromName: name, toName: destName, rideMinutes: rideMin,
        departOut: tBoard, departBack: tBackBoard,
        weekday, crit: F,
      });
      if (!rides) journeyNote = "노선도에 없는 역";
      else {
        cause.criterion_ids.push("C-journey-path", "C-ride-split");
        noteRidePeak(rides.out);
        noteRidePeak(rides.back);
      }
    }
    let singleFallback = null;
    if (!rides && rideMin > 0) {
      const perRide = round1(rideLegFatigue(rideMin,
        F.congestion_fallback_pct, F));
      singleFallback = { delta: perRide, ride_minutes: rideMin,
        congestion_pct: F.congestion_fallback_pct, source: "가정값" };
      noteCongestion(F.congestion_fallback_pct, null, name, "가정값");
    }
    const rideSource = work.ride_minutes_source || "user_assumption";
    const mkRideDetail = (direction, ride) => ({
      direction, ride_minutes: rideMin, ride_minutes_source: rideSource,
      ride: ride || null, journey_note: journeyNote,
      ride_fallback: ride ? null : (singleFallback ? { ...singleFallback } : null),
    });
    const outDetail = mkRideDetail("out", rides && rides.out);
    outDetail.dest_walk = {
      minutes: dwGoMin, distance_m: dw.go ? round2(dw.go.lengthM) : 0,
      source: dw.source, note: dw.note || "",
    };
    // A zero-minute destination walk (workplace at the station node) leaves
    // no trip record — the timeline spends 0 minutes there too.
    const walkGo = dw.go && dwGoMin > 0;
    const walkBack = dw.back && dwBackMin > 0;
    if (rideMin > 0) addAway(tBoard, tBoard + rideMin, "ride", "지하철 이동", outDetail, cause);
    const stationEnd = { kind: "poi", id: `station:${destName || "?"}`, label: destName || "하차역" };
    const workEnd = { kind: "poi", id: wpId, label: wp.name };
    if (walkGo) {
      const dwCause = makeCause("routine", ["C-walk-speed", "C-walk-route", "C-fatigue-load"],
        `하차 후 ${wp.name}까지 도보 ${dwGoMin}분 (목적지 도보 그래프)`);
      addRemoteTrip(tBoard + rideMin,
        { minutes: dwGoMin, distance_m: dw.go.lengthM, path: dw.go.nodeIds, graphArea: dw.graphArea },
        stationEnd, workEnd, dwCause, { arrive: "직장 도착" });
    }
    const lastOutLeg = rides && rides.out.legs[rides.out.legs.length - 1];
    const firstOutLeg = rides && rides.out.legs[0];
    // Arrival fatigue is read at the workplace door, before the seated
    // work hours recover it.
    fatArrivalWork = fat;
    addAway(tWork, tWorkEnd, "work", `${wp.name} 근무`, {
      workday_minutes: F.workday_minutes, seated_minutes: F.workday_minutes,
      workplace: { name: wp.name, lon: wp.lon, lat: wp.lat },
      commute: {
        mode: "ride",
        out_start: tBoard, out_end: tBoard + rideMin,
        back_start: tBackBoard, back_end: tStation,
        dest_station: destName,
        dest_stop_id: lastOutLeg ? lastOutLeg.stopIds[lastOutLeg.stopIds.length - 1] : null,
        board_stop_id: firstOutLeg ? firstOutLeg.stopIds[0] : null,
      },
    }, cause);
    if (walkBack) {
      const dwCause = makeCause("routine", ["C-walk-speed", "C-walk-route", "C-fatigue-load"],
        `${wp.name}에서 ${destName}역까지 도보 ${dwBackMin}분 (목적지 도보 그래프)`);
      addRemoteTrip(tWorkEnd,
        { minutes: dwBackMin, distance_m: dw.back.lengthM, path: dw.back.nodeIds, graphArea: dw.graphArea },
        workEnd, stationEnd, dwCause);
    }
    if (rideMin > 0) {
      addAway(tBackBoard, tStation, "ride", "지하철 이동", mkRideDetail("back", rides && rides.back), cause);
    }
    addTrip(tStation, found.dest.back, poiEnd(found.dest.place), homeEnd(), "commute", cause,
      { arrive: "귀가" });
    fatAfterHome = fat;
  }

  // Place-based commute without a station (stage 26d, US homes): the
  // workplace is lon/lat. Walk when the place is in the home bbox and
  // the walk round trip is within C-walk-commute-max (exactly the walk
  // branch of commutePlace); else bike when allowed and the bike round
  // trip is within C-bike-commute-max; else an unavailable record.
  function commuteToPlace(work, depart) {
    const wp = resolveWorkplace(work.place, { places, network: region && region.network });
    const modes = Array.isArray(work.modes) ? work.modes : ["walk", "bike"];
    const name = (wp && wp.name) || (work.place && work.place.name) || "직장";
    if (!wp) {
      unavailable("commute", "bike", `${name}까지 걷기·자전거 상한을 넘어요`);
      return;
    }
    const wpId = `workplace:${agent.key}`;
    const inBbox = !homeBbox || bboxContains(homeBbox, wp.lon, wp.lat);
    let walkCand = null;
    let walkMin = null;
    if (inBbox && modes.includes("walk")) {
      const anchor = router.nearestNode(wp.lon, wp.lat);
      if (anchor.id !== null && anchor.distM <= MAX_ANCHOR_M) {
        const cands = nearestRoundTrip(router, agent.home_node,
          [{ id: wpId, name: wp.name, lon: wp.lon, lat: wp.lat, nodeId: anchor.id }], 1);
        if (cands.length > 0) {
          walkCand = cands[0];
          walkMin = cands[0].lengthM / speed / 60;
        }
      }
    }
    if (walkCand && walkMin <= F.walk_commute_max_min) {
      const cause = makeCause("routine",
        ["C-commute-depart", "C-walk-speed", "C-walk-route", "C-work-days",
          "C-walk-commute-max", "C-fatigue-load", "C-fatigue-recovery"],
        `${wk} 근무일 · ${anchorText(F.morning_anchor_min, depart)} · ` +
        `${wp.name}까지 도보 ${round1(walkMin)}분(${F.walk_commute_max_min}분 이내)`);
      const end = { kind: "poi", id: walkCand.place.id, label: wp.name };
      const out = addTrip(depart, walkCand.route, homeEnd(), end, "commute", cause);
      fatArrivalWork = fat;
      const awayEnd = out.arrive_min + F.workday_minutes;
      addAway(out.arrive_min, awayEnd, "work", `${wp.name} 근무`, {
        workday_minutes: F.workday_minutes, seated_minutes: F.workday_minutes,
        workplace: { name: wp.name, lon: wp.lon, lat: wp.lat },
        commute: "walk",
      }, cause);
      addTrip(awayEnd, walkCand.back, end, homeEnd(), "commute", cause,
        { arrive: "귀가" });
      fatAfterHome = fat;
      return;
    }
    const bikeRouter = (ctx && ctx.bikeRouter) || null;
    if (modes.includes("bike") && bikeRouter) {
      const anchor = bikeRouter.nearestNode(wp.lon, wp.lat);
      if (anchor.id !== null && anchor.distM <= MAX_ANCHOR_M) {
        const cands = nearestRoundTrip(bikeRouter, agent.home_node,
          [{ id: wpId, name: wp.name, lon: wp.lon, lat: wp.lat, nodeId: anchor.id }], 1);
        if (cands.length > 0) {
          const bikeMin = cands[0].lengthM / F.bike_mps / 60;
          if (bikeMin <= F.bike_commute_max_min) {
            const kmh = F.bike_kmh || round1(F.bike_mps * 3.6);
            const cause = makeCause("routine",
              ["C-commute-depart", "C-bike-speed", "C-bike-commute-max", "C-work-days",
                "C-fatigue-load", "C-fatigue-recovery"],
              `${wk} 근무일 · ${anchorText(F.morning_anchor_min, depart)} · ` +
              `${wp.name}까지 자전거 ${round1(bikeMin)}분` +
              `(${F.bike_commute_max_min}분 이내, 속도 가정 ${kmh}km/h)`);
            const end = { kind: "poi", id: cands[0].place.id, label: wp.name };
            const out = addTrip(depart, cands[0].route, homeEnd(), end, "commute", cause,
              { speedMps: F.bike_mps, mode: "bike" });
            fatArrivalWork = fat;
            const awayEnd = out.arrive_min + F.workday_minutes;
            addAway(out.arrive_min, awayEnd, "work", `${wp.name} 근무`, {
              workday_minutes: F.workday_minutes, seated_minutes: F.workday_minutes,
              workplace: { name: wp.name, lon: wp.lon, lat: wp.lat },
              commute: "bike",
            }, cause);
            addTrip(awayEnd, cands[0].back, end, homeEnd(), "commute", cause,
              { arrive: "귀가", speedMps: F.bike_mps, mode: "bike" });
            fatAfterHome = fat;
            return;
          }
        }
      }
    }
    unavailable("commute", "bike", `${name}까지 걷기·자전거 상한을 넘어요`);
  }

  const work = agent.work;
  if (agent.workdays.includes(weekday) && work.type !== "none") {
    const depart = F.morning_anchor_min + schedule.departJitter[day];
    if (work.type === "station_ride") {
      if (work.place) commutePlace(work, depart);
      else commuteLegacy(work, depart, false);
    } else if (work.type === "place") {
      commuteToPlace(work, depart);
    } else if (work.type === "local_poi") {
      const name = nameForHome(work.name, homeLabel);
      const pois = poisByName(places, name);
      if (pois.length === 0) {
        unavailable("commute", "poi", name);
      } else {
        const cands = nearestRoundTrip(router, agent.home_node, pois, 1);
        if (cands.length === 0) {
          unavailable("commute", "poi", name);
        } else {
          const cause = makeCause("routine",
            ["C-commute-depart", "C-walk-speed", "C-walk-route", "C-work-days",
              "C-fatigue-load", "C-fatigue-recovery"],
            `${wk} 근무일 · ${anchorText(F.morning_anchor_min, depart)}`);
          const out = addTrip(depart, cands[0].route, homeEnd(), poiEnd(cands[0].place), "commute", cause);
          fatArrivalWork = fat;
          const awayEnd = out.arrive_min + F.workday_minutes;
          addAway(out.arrive_min, awayEnd, "work", `${cands[0].place.name} 근무`, {
            workday_minutes: F.workday_minutes, seated_minutes: F.workday_minutes,
          }, cause);
          addTrip(awayEnd, cands[0].back, poiEnd(cands[0].place), homeEnd(), "commute", cause,
            { arrive: "귀가" });
          fatAfterHome = fat;
        }
      }
    } else if (work.type === "nearest_station") {
      // Background-internal: nearest station, no ride claim.
      const cands = nearestRoundTrip(router, agent.home_node, places.stations, 1);
      if (cands.length > 0) {
        const cause = makeCause("routine",
          ["C-commute-depart", "C-walk-speed", "C-walk-route", "C-work-days", "C-neighbour",
            "C-fatigue-load", "C-fatigue-recovery"],
          `${wk} 근무일 · ${anchorText(F.morning_anchor_min, depart)}`);
        const out = addTrip(depart, cands[0].route, homeEnd(), poiEnd(cands[0].place), "commute", cause);
        const awayEnd = out.arrive_min + F.workday_minutes;
        addAway(out.arrive_min, awayEnd, "work", `${cands[0].place.name} 방면 근무`, {
          workday_minutes: F.workday_minutes, seated_minutes: F.workday_minutes,
        }, cause);
        addTrip(awayEnd, cands[0].back, poiEnd(cands[0].place), homeEnd(), "commute", cause);
      }
    }
  }

  if (agent.school && agent.schooldays.includes(weekday)) {
    const anchored = clock === null;
    const depart = anchored ? F.school_anchor_min + schedule.departJitter[day] : clock + F.after_gap_min;
    const cands = nearestRoundTrip(router, agent.home_node, places.schools, 1);
    if (cands.length === 0) {
      unavailable("school", "school");
    } else {
      const cause = makeCause("routine",
        ["C-commute-depart", "C-walk-speed", "C-walk-route", "C-work-days",
          "C-fatigue-load", "C-fatigue-recovery"],
        anchored ? `${wk} 등교일 · ${anchorText(F.school_anchor_min, depart)}`
          : `앞 일정 종료 후 ${F.after_gap_min}분 뒤 출발`);
      const out = addTrip(depart, cands[0].route, homeEnd(), poiEnd(cands[0].place), "school", cause);
      const awayEnd = out.arrive_min + F.schoolday_minutes;
      addAway(out.arrive_min, awayEnd, "school", `${cands[0].place.name} 등교`, {
        schoolday_minutes: F.schoolday_minutes, seated_minutes: F.schoolday_minutes,
      }, cause);
      addTrip(awayEnd, cands[0].back, poiEnd(cands[0].place), homeEnd(), "school", cause);
    }
  }

  // --- midday: errands, then clinic ---
  // Household weekends run one weekend_plan instead of the scheduled
  // midday/evening branches; background neighbours keep the routine.
  const householdWeekend = agent.household && isWeekendDay(weekday);
  const slotAfter = () => (clock === null ? F.midday_anchor_min : clock + F.after_gap_min);
  for (const cat of ["supermarket", "convenience"]) {
    if (householdWeekend) continue;
    if (!schedule.errands[cat].has(day)) continue;
    const depart = slotAfter();
    const cands = nearestRoundTrip(router, agent.home_node, places.shops[cat], 3);
    if (cands.length === 0) {
      unavailable("errand", cat);
      continue;
    }
    const freq = agent.errands_per_week[cat];
    const schedNote = agent.household ? `고객 입력 주 ${freq}회` : `주 ${freq}회 일정`;
    let dest = cands[0];
    let decision = null;
    if (cands.length >= 2) {
      const options = cands.map((c, i) => ({
        key: `s${i}`, label: c.place.name, minutes: minutesFor(c.lengthM),
        distance_m: round2(c.lengthM), poi_id: c.place.id,
      }));
      decision = decide("shop_choice", depart, options, ruleDefault(options));
      dest = cands[Number(decision.chosen_key.slice(1))];
    }
    const cause = decision
      ? makeCause("decision",
        ["C-decide-kinds", "C-grocery-freq", "C-walk-speed", "C-walk-route", "C-shop-dwell",
          "C-fatigue-load"],
        `장보기처 판단 → ${dest.place.name} 선택 (${schedNote})`, decision.id)
      : makeCause(agent.household ? "input" : "routine",
        ["C-grocery-freq", "C-walk-speed", "C-walk-route", "C-shop-dwell", "C-fatigue-load"],
        agent.household
          ? `고객 입력: 주 ${freq}회 장보기 · 가장 가까운 ${SHOP_CAT_KO[cat]}`
          : `주간 일정: 주 ${freq}회 장보기 · 가장 가까운 ${SHOP_CAT_KO[cat]}`);
    const out = addTrip(depart, dest.route, homeEnd(), poiEnd(dest.place), "errand", cause);
    addAway(out.arrive_min, out.arrive_min + F.shop_dwell_min, "errand", `${dest.place.name} 장보기`, {
      shop_category: cat,
    }, cause);
    addTrip(out.arrive_min + F.shop_dwell_min, dest.back, poiEnd(dest.place), homeEnd(), "errand", cause);
    errandsDone++;
  }

  if (!householdWeekend && schedule.clinicDays.has(day)) {
    const depart = slotAfter();
    const cands = nearestRoundTrip(router, agent.home_node, places.clinics, 1);
    if (cands.length === 0) {
      unavailable("clinic", "clinic");
    } else {
      const freq = agent.clinic_visits_per_month;
      const cause = makeCause(agent.household ? "input" : "routine",
        ["C-clinic-freq", "C-clinic-dwell", "C-walk-speed", "C-walk-route", "C-fatigue-load"],
        agent.household ? `고객 입력: 월 ${freq}회 병원` : `월간 일정: 월 ${freq}회 병원`);
      const out = addTrip(depart, cands[0].route, homeEnd(), poiEnd(cands[0].place), "clinic", cause);
      addAway(out.arrive_min, out.arrive_min + F.clinic_dwell_min, "clinic", `${cands[0].place.name} 진료`, null, cause);
      addTrip(out.arrive_min + F.clinic_dwell_min, cands[0].back, poiEnd(cands[0].place), homeEnd(), "clinic", cause);
    }
  }

  // --- evening: park walk or stay home (every day, uniform branch) ---
  if (!householdWeekend && agent.park_walks_per_week > 0) {
    const minute = clock === null ? F.evening_anchor_min : clock + F.after_gap_min;
    const cands = nearestRoundTrip(router, agent.home_node, places.parks, 1);
    if (cands.length === 0) {
      if (schedule.parkDays.has(day)) unavailable("park", "park");
    } else {
      const options = [
        { key: "park", label: cands[0].place.name, minutes: minutesFor(cands[0].lengthM),
          distance_m: round2(cands[0].lengthM), poi_id: cands[0].place.id },
        { key: "home", label: "집", minutes: 0, distance_m: 0 },
      ];
      const rec = decide("park_or_home", minute, options, schedule.parkDays.has(day) ? "park" : "home");
      if (rec.chosen_key === "park") {
        const freq = agent.park_walks_per_week;
        const cause = makeCause("decision",
          ["C-decide-kinds", "C-park-habit", "C-walk-speed", "C-walk-route", "C-park-dwell",
            "C-daily-rhythm", "C-fatigue-load"],
          agent.household
            ? `저녁 산책 판단 → ${cands[0].place.name} 선택 (고객 입력 주 ${freq}회 중)`
            : `저녁 산책 판단 → ${cands[0].place.name} 선택 (주 ${freq}회 일정 중)`,
          rec.id);
        const out = addTrip(minute, cands[0].route, homeEnd(), poiEnd(cands[0].place), "park", cause);
        addAway(out.arrive_min, out.arrive_min + F.park_dwell_min, "park", `${cands[0].place.name} 산책`, null, cause);
        addTrip(out.arrive_min + F.park_dwell_min, cands[0].back, poiEnd(cands[0].place), homeEnd(), "park", cause);
        parkVisits++;
      }
    }
  }

  // --- household weekend: one plan, up to 3 activities in order ---
  // Options are the categories with a reachable round trip from home
  // (graph minutes); the plan executes home-based legs with real paths.
  if (householdWeekend) {
    const minute = slotAfter();
    const destByCat = new Map();
    const options = [];
    for (const cat of weekendCats) {
      const cands = nearestRoundTrip(router, agent.home_node, weekendPlaces(places, cat.key), 1);
      if (cands.length === 0) continue;
      destByCat.set(cat.key, cands[0]);
      options.push({
        key: cat.key, label: cands[0].place.name, minutes: minutesFor(cands[0].lengthM),
        distance_m: round2(cands[0].lengthM), poi_id: cands[0].place.id,
      });
    }
    if (options.length > 0) {
      options.push({ key: WEEKEND_HOME, label: "집에서 휴식", minutes: 0, distance_m: 0 });
      const catsOnly = options.filter((o) => o.key !== WEEKEND_HOME);
      const wish = (schedule.weekendWishes && schedule.weekendWishes.get(day)) || WEEKEND_HOME;
      const rec = decide("weekend_plan", minute, options, ruleDefault(catsOnly), { wish });
      let depart = minute;
      for (const key of rec.plan) {
        const cat = weekendCats.find((c) => c.key === key);
        const dest = destByCat.get(key);
        const dwellId = key === "park" ? "C-park-dwell" : key === "clinic" ? "C-clinic-dwell" : "C-shop-dwell";
        const cause = makeCause("decision",
          ["C-decide-kinds", "C-weekend-plan", "C-walk-speed", "C-walk-route", dwellId,
            "C-fatigue-load"],
          `주말 계획(${rec.plan.length}곳) → ${dest.place.name} ${cat.stay}`, rec.id);
        const out = addTrip(depart, dest.route, homeEnd(), poiEnd(dest.place), cat.purpose, cause);
        addAway(out.arrive_min, out.arrive_min + cat.dwell, cat.away,
          `${dest.place.name} ${cat.stay}`,
          cat.away === "errand" ? { shop_category: key } : null, cause);
        addTrip(out.arrive_min + cat.dwell, dest.back, poiEnd(dest.place), homeEnd(), cat.purpose, cause);
        if (cat.away === "errand") errandsDone++;
        if (cat.away === "park") parkVisits++;
        depart = clock + F.after_gap_min;
      }
    }
  }

  // --- per-day summary ---
  // Home rest runs to midnight: the day's end is the 24:00 value.
  homeGapTo(1440);
  fatPoint(1440);
  let walkMinutes = 0;
  let awayEvening = 0;
  for (const t of trips) {
    walkMinutes += t.minutes;
    awayEvening += overlap(t.depart_min, t.arrive_min, F.evening_start_min, F.day_end_min);
  }
  for (const a of aways) {
    awayEvening += overlap(a.start_min, a.end_min, F.evening_start_min, F.day_end_min);
  }
  return {
    day, date: dateOf(scenario.start_date, day), weekday,
    walk_minutes: round1(walkMinutes),
    commute_walk_minutes: round1(commuteWalk),
    commute_ride_minutes: commuteRide,
    errands_done: errandsDone,
    park_visits: parkVisits,
    home_evening_minutes: Math.max(0, (F.day_end_min - F.evening_start_min) - awayEvening),
    trips: trips.length,
    fatigue: fat === null ? null : {
      start: F.fatigue_overnight_base,
      end: round1(fat),
      mean: round1(fatMean(fatSeries)),
      peak: round1(fatPeak),
      arrival_work: fatArrivalWork === null ? null : round1(fatArrivalWork),
      after_home: fatAfterHome === null ? null : round1(fatAfterHome),
      crowded_min: round1(fatCrowded),
      peak_congestion: fatPeakCong,
      series: fatSeries,
    },
  };
}

// Time-weighted mean of a stepwise day series over 0..1440.
function fatMean(series) {
  if (!series || series.length === 0) return 0;
  let acc = 0;
  for (let i = 0; i < series.length; i++) {
    const m0 = series[i].m;
    const m1 = i + 1 < series.length ? series[i + 1].m : 1440;
    acc += series[i].v * Math.max(0, m1 - m0);
  }
  return acc / 1440;
}
