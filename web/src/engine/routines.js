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

import { nameForHome, weekdayOf, WEEKDAYS, dateOf } from "./scenario.js";
import { nearestRoundTrip, poisByName, stationsByName } from "./places.js";
import { ruleDefault, WEEKEND_HOME } from "./decisions.js";
import { criterionDefault, defaultFlat, resolveCriteria } from "./criteria.js";

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
  const weekday = WEEKDAYS[weekdayOf(scenario.start_date, day)];
  const wk = WEEKDAY_KO[weekday] || weekday;
  const speed = agent.speed;
  let seq = 0; // decision sequence for this agent-day
  let clock = null; // end minute of the last activity
  let errandsDone = 0;
  let parkVisits = 0;
  let commuteWalk = 0; // graph minutes on commute/school legs
  let commuteRide = 0; // assumed ride minutes (station_ride only)
  const trips = [];
  const aways = [];
  const weekendCats = WEEKEND_CATS.map((c) => ({
    ...c,
    dwell: c.key === "park" ? F.park_dwell_min
      : c.key === "clinic" ? F.clinic_dwell_min : F.shop_dwell_min,
  }));

  const homeEnd = () => ({ kind: "home", id: "home", label: home.complex.name });
  const poiEnd = (place) => ({ kind: "poi", id: place.id, label: place.name });

  function addTrip(depart, route, from, to, purpose, cause) {
    const distance_m = round2(route.lengthM);
    const minutes = round1(route.lengthM / speed / 60);
    const arrive = depart + Math.max(1, Math.round(minutes));
    const trip = {
      id: `t${String(collect.tripSeq++).padStart(6, "0")}`,
      agent: agent.key, day, depart_min: depart, arrive_min: arrive,
      from, to, purpose, distance_m, minutes, path: route.nodeIds,
      cause,
    };
    trips.push(trip);
    collect.trips.push(trip);
    clock = arrive;
    if (purpose === "commute" || purpose === "school") commuteWalk += minutes;
    return trip;
  }

  function addAway(start, end, kind, label, detail, cause) {
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

  function decide(kind, minute, options, default_key) {
    const rec = decider.resolve({ agent: agent.key, day, minute, kind, options, default_key }, seq++);
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

  const work = agent.work;
  if (agent.workdays.includes(weekday) && work.type !== "none") {
    const depart = F.morning_anchor_min + schedule.departJitter[day];
    const rideIds = work.type === "station_ride" ? ["C-ride-minutes"] : [];
    if (work.type === "station_ride") {
      const name = nameForHome(work.station_name, homeLabel);
      const stations = stationsByName(places, name);
      if (stations.length === 0) {
        unavailable("commute", "station", name);
      } else {
        const found = commuteStation(stations, depart);
        if (found === null) {
          unavailable("commute", "station", name);
        } else {
          const ids = ["C-commute-depart", "C-walk-speed", "C-walk-route", "C-work-days", ...rideIds];
          if (found.decision) ids.push("C-station-route");
          const cause = makeCause("routine", ids,
            `${wk} 근무일 · ${anchorText(F.morning_anchor_min, depart)}`,
            found.decision ? found.decision.id : null);
          const out = addTrip(depart, found.dest.route, homeEnd(), poiEnd(found.dest.place), "commute", cause);
          commuteRide += work.ride_minutes * 2;
          const awayEnd = out.arrive_min + work.ride_minutes + F.workday_minutes + work.ride_minutes;
          addAway(out.arrive_min, awayEnd, "work", `${found.dest.place.name} 방면 근무`, {
            ride_minutes: work.ride_minutes, workday_minutes: F.workday_minutes,
            ride_minutes_source: work.ride_minutes_source || "user_assumption",
          }, cause);
          addTrip(awayEnd, found.dest.back, poiEnd(found.dest.place), homeEnd(), "commute", cause);
        }
      }
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
            ["C-commute-depart", "C-walk-speed", "C-walk-route", "C-work-days"],
            `${wk} 근무일 · ${anchorText(F.morning_anchor_min, depart)}`);
          const out = addTrip(depart, cands[0].route, homeEnd(), poiEnd(cands[0].place), "commute", cause);
          const awayEnd = out.arrive_min + F.workday_minutes;
          addAway(out.arrive_min, awayEnd, "work", `${cands[0].place.name} 근무`, {
            workday_minutes: F.workday_minutes,
          }, cause);
          addTrip(awayEnd, cands[0].back, poiEnd(cands[0].place), homeEnd(), "commute", cause);
        }
      }
    } else if (work.type === "nearest_station") {
      // Background-internal: nearest station, no ride claim.
      const cands = nearestRoundTrip(router, agent.home_node, places.stations, 1);
      if (cands.length > 0) {
        const cause = makeCause("routine",
          ["C-commute-depart", "C-walk-speed", "C-walk-route", "C-work-days", "C-neighbour"],
          `${wk} 근무일 · ${anchorText(F.morning_anchor_min, depart)}`);
        const out = addTrip(depart, cands[0].route, homeEnd(), poiEnd(cands[0].place), "commute", cause);
        const awayEnd = out.arrive_min + F.workday_minutes;
        addAway(out.arrive_min, awayEnd, "work", `${cands[0].place.name} 방면 근무`, {
          workday_minutes: F.workday_minutes,
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
        ["C-commute-depart", "C-walk-speed", "C-walk-route", "C-work-days"],
        anchored ? `${wk} 등교일 · ${anchorText(F.school_anchor_min, depart)}`
          : `앞 일정 종료 후 ${F.after_gap_min}분 뒤 출발`);
      const out = addTrip(depart, cands[0].route, homeEnd(), poiEnd(cands[0].place), "school", cause);
      const awayEnd = out.arrive_min + F.schoolday_minutes;
      addAway(out.arrive_min, awayEnd, "school", `${cands[0].place.name} 등교`, {
        schoolday_minutes: F.schoolday_minutes,
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
        ["C-decide-kinds", "C-grocery-freq", "C-walk-speed", "C-walk-route", "C-shop-dwell"],
        `장보기처 판단 → ${dest.place.name} 선택 (${schedNote})`, decision.id)
      : makeCause(agent.household ? "input" : "routine",
        ["C-grocery-freq", "C-walk-speed", "C-walk-route", "C-shop-dwell"],
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
        ["C-clinic-freq", "C-clinic-dwell", "C-walk-speed", "C-walk-route"],
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
          ["C-decide-kinds", "C-park-habit", "C-walk-speed", "C-walk-route", "C-park-dwell", "C-daily-rhythm"],
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
      const rec = decide("weekend_plan", minute, options, ruleDefault(catsOnly));
      let depart = minute;
      for (const key of rec.plan) {
        const cat = weekendCats.find((c) => c.key === key);
        const dest = destByCat.get(key);
        const dwellId = key === "park" ? "C-park-dwell" : key === "clinic" ? "C-clinic-dwell" : "C-shop-dwell";
        const cause = makeCause("decision",
          ["C-decide-kinds", "C-weekend-plan", "C-walk-speed", "C-walk-route", dwellId],
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
  };
}
