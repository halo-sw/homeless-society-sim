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

import { nameForHome, weekdayOf, WEEKDAYS, dateOf } from "./scenario.js";
import { nearestRoundTrip, poisByName, stationsByName } from "./places.js";
import { ruleDefault, WEEKEND_HOME } from "./decisions.js";

export const MORNING_ANCHOR = 450; // 07:30 + jitter
export const SCHOOL_ANCHOR = 480; // 08:00 + jitter
export const MIDDAY_ANCHOR = 600; // 10:00
export const EVENING_ANCHOR = 960; // 16:00
export const AFTER_GAP = 30; // minutes between activities
export const SHOP_DWELL = 15; // minutes in the shop (routine default)
export const CLINIC_DWELL = 30;
export const PARK_DWELL = 30;
export const EVENING_START = 1080; // 18:00
export const DAY_END = 1440; // 24:00
export const STATION_ROUTE_TOLERANCE = 1.2; // 2nd entrance within 20 %

// Weekend-plan activity categories: each maps to a places list, a
// dwell, an away kind and the trip purpose/counter it feeds. Only
// categories with a reachable round trip from home become options.
export const WEEKEND_CATS = [
  { key: "park", dwell: PARK_DWELL, away: "park", purpose: "park", stay: "산책" },
  { key: "supermarket", dwell: SHOP_DWELL, away: "errand", purpose: "errand", stay: "장보기" },
  { key: "convenience", dwell: SHOP_DWELL, away: "errand", purpose: "errand", stay: "장보기" },
  { key: "clinic", dwell: CLINIC_DWELL, away: "clinic", purpose: "clinic", stay: "진료" },
];

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

function overlap(a0, a1, b0, b1) {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

export function planAgent(agent, day, ctx) {
  const { scenario, homeLabel, home, router, places, decider, schedule, collect } = ctx;
  const weekday = WEEKDAYS[weekdayOf(scenario.start_date, day)];
  const speed = agent.speed;
  let seq = 0; // decision sequence for this agent-day
  let clock = null; // end minute of the last activity
  let errandsDone = 0;
  let parkVisits = 0;
  let commuteWalk = 0; // graph minutes on commute/school legs
  let commuteRide = 0; // assumed ride minutes (station_ride only)
  const trips = [];
  const aways = [];

  const homeEnd = () => ({ kind: "home", id: "home", label: home.complex.name });
  const poiEnd = (place) => ({ kind: "poi", id: place.id, label: place.name });

  function addTrip(depart, route, from, to, purpose) {
    const distance_m = round2(route.lengthM);
    const minutes = round1(route.lengthM / speed / 60);
    const arrive = depart + Math.max(1, Math.round(minutes));
    const trip = {
      id: `t${String(collect.tripSeq++).padStart(6, "0")}`,
      agent: agent.key, day, depart_min: depart, arrive_min: arrive,
      from, to, purpose, distance_m, minutes, path: route.nodeIds,
    };
    trips.push(trip);
    collect.trips.push(trip);
    clock = arrive;
    if (purpose === "commute" || purpose === "school") commuteWalk += minutes;
    return trip;
  }

  function addAway(start, end, kind, label, detail) {
    const rec = { agent: agent.key, day, kind, start_min: start, end_min: end, label };
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

  // --- morning: commute and/or school (chained on the running clock) ---
  function commuteStation(stationPlaces, depart) {
    const cands = nearestRoundTrip(router, agent.home_node, stationPlaces, 2);
    if (cands.length === 0) return null;
    let dest = cands[0];
    if (cands.length === 2 && cands[0].lengthM !== cands[1].lengthM
        && cands[1].lengthM <= cands[0].lengthM * STATION_ROUTE_TOLERANCE) {
      const options = cands.map((c, i) => ({
        key: `s${i}`, label: c.place.name, minutes: minutesFor(c.lengthM),
        distance_m: round2(c.lengthM), poi_id: c.place.id,
      }));
      const rec = decide("station_route", depart, options, ruleDefault(options));
      dest = cands[Number(rec.chosen_key.slice(1))];
    }
    return dest;
  }

  const work = agent.work;
  if (agent.workdays.includes(weekday) && work.type !== "none") {
    const depart = MORNING_ANCHOR + schedule.departJitter[day];
    if (work.type === "station_ride") {
      const name = nameForHome(work.station_name, homeLabel);
      const stations = stationsByName(places, name);
      if (stations.length === 0) {
        unavailable("commute", "station", name);
      } else {
        const dest = commuteStation(stations, depart);
        if (dest === null) {
          unavailable("commute", "station", name);
        } else {
          const out = addTrip(depart, dest.route, homeEnd(), poiEnd(dest.place), "commute");
          commuteRide += work.ride_minutes * 2;
          const awayEnd = out.arrive_min + work.ride_minutes + scenario.workday_minutes + work.ride_minutes;
          addAway(out.arrive_min, awayEnd, "work", `${dest.place.name} 방면 근무`, {
            ride_minutes: work.ride_minutes, workday_minutes: scenario.workday_minutes,
            ride_minutes_source: work.ride_minutes_source || "user_assumption",
          });
          addTrip(awayEnd, dest.back, poiEnd(dest.place), homeEnd(), "commute");
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
          const out = addTrip(depart, cands[0].route, homeEnd(), poiEnd(cands[0].place), "commute");
          const awayEnd = out.arrive_min + scenario.workday_minutes;
          addAway(out.arrive_min, awayEnd, "work", `${cands[0].place.name} 근무`, {
            workday_minutes: scenario.workday_minutes,
          });
          addTrip(awayEnd, cands[0].back, poiEnd(cands[0].place), homeEnd(), "commute");
        }
      }
    } else if (work.type === "nearest_station") {
      // Background-internal: nearest station, no ride claim.
      const cands = nearestRoundTrip(router, agent.home_node, places.stations, 1);
      if (cands.length > 0) {
        const out = addTrip(depart, cands[0].route, homeEnd(), poiEnd(cands[0].place), "commute");
        const awayEnd = out.arrive_min + scenario.workday_minutes;
        addAway(out.arrive_min, awayEnd, "work", `${cands[0].place.name} 방면 근무`, {
          workday_minutes: scenario.workday_minutes,
        });
        addTrip(awayEnd, cands[0].back, poiEnd(cands[0].place), homeEnd(), "commute");
      }
    }
  }

  if (agent.school && agent.schooldays.includes(weekday)) {
    const depart = clock === null ? SCHOOL_ANCHOR + schedule.departJitter[day] : clock + AFTER_GAP;
    const cands = nearestRoundTrip(router, agent.home_node, places.schools, 1);
    if (cands.length === 0) {
      unavailable("school", "school");
    } else {
      const out = addTrip(depart, cands[0].route, homeEnd(), poiEnd(cands[0].place), "school");
      const awayEnd = out.arrive_min + scenario.schoolday_minutes;
      addAway(out.arrive_min, awayEnd, "school", `${cands[0].place.name} 등교`, {
        schoolday_minutes: scenario.schoolday_minutes,
      });
      addTrip(awayEnd, cands[0].back, poiEnd(cands[0].place), homeEnd(), "school");
    }
  }

  // --- midday: errands, then clinic ---
  // Household weekends run one weekend_plan instead of the scheduled
  // midday/evening branches; background neighbours keep the routine.
  const householdWeekend = agent.household && isWeekendDay(weekday);
  const slotAfter = () => (clock === null ? MIDDAY_ANCHOR : clock + AFTER_GAP);
  for (const cat of ["supermarket", "convenience"]) {
    if (householdWeekend) continue;
    if (!schedule.errands[cat].has(day)) continue;
    const depart = slotAfter();
    const cands = nearestRoundTrip(router, agent.home_node, places.shops[cat], 3);
    if (cands.length === 0) {
      unavailable("errand", cat);
      continue;
    }
    let dest = cands[0];
    if (cands.length >= 2) {
      const options = cands.map((c, i) => ({
        key: `s${i}`, label: c.place.name, minutes: minutesFor(c.lengthM),
        distance_m: round2(c.lengthM), poi_id: c.place.id,
      }));
      const rec = decide("shop_choice", depart, options, ruleDefault(options));
      dest = cands[Number(rec.chosen_key.slice(1))];
    }
    const out = addTrip(depart, dest.route, homeEnd(), poiEnd(dest.place), "errand");
    addAway(out.arrive_min, out.arrive_min + SHOP_DWELL, "errand", `${dest.place.name} 장보기`, {
      shop_category: cat,
    });
    addTrip(out.arrive_min + SHOP_DWELL, dest.back, poiEnd(dest.place), homeEnd(), "errand");
    errandsDone++;
  }

  if (!householdWeekend && schedule.clinicDays.has(day)) {
    const depart = slotAfter();
    const cands = nearestRoundTrip(router, agent.home_node, places.clinics, 1);
    if (cands.length === 0) {
      unavailable("clinic", "clinic");
    } else {
      const out = addTrip(depart, cands[0].route, homeEnd(), poiEnd(cands[0].place), "clinic");
      addAway(out.arrive_min, out.arrive_min + CLINIC_DWELL, "clinic", `${cands[0].place.name} 진료`, null);
      addTrip(out.arrive_min + CLINIC_DWELL, cands[0].back, poiEnd(cands[0].place), homeEnd(), "clinic");
    }
  }

  // --- evening: park walk or stay home (every day, uniform branch) ---
  if (!householdWeekend && agent.park_walks_per_week > 0) {
    const minute = clock === null ? EVENING_ANCHOR : clock + AFTER_GAP;
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
        const out = addTrip(minute, cands[0].route, homeEnd(), poiEnd(cands[0].place), "park");
        addAway(out.arrive_min, out.arrive_min + PARK_DWELL, "park", `${cands[0].place.name} 산책`, null);
        addTrip(out.arrive_min + PARK_DWELL, cands[0].back, poiEnd(cands[0].place), homeEnd(), "park");
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
    for (const cat of WEEKEND_CATS) {
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
        const cat = WEEKEND_CATS.find((c) => c.key === key);
        const dest = destByCat.get(key);
        const out = addTrip(depart, dest.route, homeEnd(), poiEnd(dest.place), cat.purpose);
        addAway(out.arrive_min, out.arrive_min + cat.dwell, cat.away,
          `${dest.place.name} ${cat.stay}`,
          cat.away === "errand" ? { shop_category: key } : null);
        addTrip(out.arrive_min + cat.dwell, dest.back, poiEnd(dest.place), homeEnd(), cat.purpose);
        if (cat.away === "errand") errandsDone++;
        if (cat.away === "park") parkVisits++;
        depart = clock + AFTER_GAP;
      }
    }
  }

  // --- per-day summary ---
  let walkMinutes = 0;
  let awayEvening = 0;
  for (const t of trips) {
    walkMinutes += t.minutes;
    awayEvening += overlap(t.depart_min, t.arrive_min, EVENING_START, DAY_END);
  }
  for (const a of aways) {
    awayEvening += overlap(a.start_min, a.end_min, EVENING_START, DAY_END);
  }
  return {
    day, date: dateOf(scenario.start_date, day), weekday,
    walk_minutes: round1(walkMinutes),
    commute_walk_minutes: round1(commuteWalk),
    commute_ride_minutes: commuteRide,
    errands_done: errandsDone,
    park_visits: parkVisits,
    home_evening_minutes: Math.max(0, (DAY_END - EVENING_START) - awayEvening),
    trips: trips.length,
  };
}
