// Schedule-driven trains (pure, no three.js).
//
// Positions come from the official interstation times
// (transit/schedule.js: per-gap minutes where the schedule covers the
// line, median-minutes-per-km estimates elsewhere) with one seeded
// offset per line. Each pattern carrying the box station is a run;
// trains circulate evenly spaced (가정 headway) and arrivals at the
// station drive the marker pulse.
//
// Display: our data has no at-grade/elevated tags, and urban lines
// run underground through these boxes — so the renderer shows only a
// pulse on the station marker at arrival times (table.display is
// "pulse"), never moving train meshes.

import { pointAtChainage } from "../journey.js";
import { gapMinutes, scheduleLineOf, SCHEDULE_SOURCE_LABEL } from "../transit/schedule.js";
import { normalizeStation } from "../engine/journey.js";
import { unitFrom } from "./rng.js";

export const TRAIN_SOURCE = SCHEDULE_SOURCE_LABEL;
export const TRAIN_ASSUMPTIONS = "가정값";
export const TURNAROUND_MIN = 4; // 가정: terminus dwell per end
export const HEADWAY_TARGET_MIN = 10; // 가정: trains spaced ~this far apart
export const PULSE_WINDOW_MIN = 1.5; // pulse fades over ±this many minutes

// Cumulative minutes from the pattern start to each stop, from the
// schedule gaps (official) or the km estimate (가정) per gap.
export function stopMinutes(pattern, stopNameOf, lineNum, schedule) {
  const names = pattern.stops.map(stopNameOf);
  const kms = pattern.chainage_km || [];
  const cum = [0];
  const methods = [];
  for (let i = 0; i + 1 < names.length; i++) {
    const gap = gapMinutes(schedule, lineNum, names[i], names[i + 1]);
    if (gap) {
      cum.push(cum[i] + gap.minutes);
      methods.push("schedule");
    } else {
      const edgeKm = kms.length === names.length
        ? Math.abs(kms[i + 1] - kms[i]) : 0;
      cum.push(cum[i] + edgeKm * (schedule.medianMinPerKm || 0));
      methods.push("estimate");
    }
  }
  const method = methods.every((m) => m === "schedule") ? "schedule"
    : methods.every((m) => m === "estimate") ? "estimate" : "mixed";
  return { names, cumMin: cum, oneWayMin: cum[cum.length - 1], method };
}

function kmAtMinute(run, minute) {
  const { cumMin, chainage } = run;
  const m = Math.min(Math.max(minute, 0), cumMin[cumMin.length - 1]);
  let i = 0;
  while (i < cumMin.length - 2 && cumMin[i + 1] < m) i++;
  const span = cumMin[i + 1] - cumMin[i] || 1;
  const f = (m - cumMin[i]) / span;
  return chainage[i] + (chainage[i + 1] - chainage[i]) * f;
}

// One table per (box station, seed): every pattern carrying the
// station becomes a run with evenly spaced trains.
export function buildTrainTable({ network, schedule, station, seed }) {
  const want = normalizeStation(station);
  const runs = [];
  for (const line of (network && network.lines) || []) {
    const byId = new Map((line.stops || []).map((s) => [s.id, s.name]));
    const stopNameOf = (id) => byId.get(id) || id;
    const lineNum = scheduleLineOf(line.id, line.name);
    for (const pattern of line.patterns || []) {
      const ids = pattern.stops || [];
      if (!ids.some((id) => normalizeStation(stopNameOf(id)) === want)) continue;
      if (ids.length < 2 || !pattern.geometry || pattern.geometry.length < 2) continue;
      const sm = stopMinutes(pattern, stopNameOf, lineNum, schedule);
      if (!(sm.oneWayMin > 0)) continue;
      const circle = !!line.circle;
      const cycleMin = circle ? sm.oneWayMin + TURNAROUND_MIN
        : 2 * (sm.oneWayMin + TURNAROUND_MIN);
      const k = Math.min(12, Math.max(2, Math.round(cycleMin / HEADWAY_TARGET_MIN)));
      const offset = unitFrom("trains", seed, line.id, pattern.id) * cycleMin;
      const stationIdx = sm.names.findIndex((n) => normalizeStation(n) === want);
      const chainage = (pattern.chainage_km || []).length === ids.length
        ? [...pattern.chainage_km]
        : ids.map((_, i) => i);
      runs.push({
        lineId: line.id, lineName: line.name, patternId: pattern.id,
        geometry: pattern.geometry, chainage,
        names: sm.names, cumMin: sm.cumMin, oneWayMin: sm.oneWayMin,
        method: sm.method, circle, cycleMin, stationIdx,
        stationMin: sm.cumMin[stationIdx],
        trains: Array.from({ length: k }, (_, t) => offset + (t * cycleMin) / k),
      });
    }
  }
  const trains = runs.reduce((a, r) => a + r.trains.length, 0);
  return { seed, station: want, runs, trains,
    display: "pulse", hasGradeData: false };
}

export function allocTrainState(max) {
  return { data: new Float64Array(Math.max(max, 1) * 3) }; // lon, lat, dir
}

// Pure positions at sim minute tMin (kept for tests/future use; the
// renderer shows the station pulse only — see stationPulse).
export function trainsAt(table, tMin, out) {
  const { data } = out;
  let w = 0;
  for (const run of table.runs) {
    for (const dep of run.trains) {
      const tau = (((tMin - dep) % run.cycleMin) + run.cycleMin) % run.cycleMin;
      const m = Math.min(tau, run.oneWayMin);
      const km = kmAtMinute(run, m);
      const total = run.chainage[run.chainage.length - 1] - run.chainage[0];
      const [lon, lat] = total > 0
        ? pointAtChainage(run.geometry, run.chainage, km)
        : run.geometry[0];
      data[w * 3] = lon;
      data[w * 3 + 1] = lat;
      data[w * 3 + 2] = tau <= run.oneWayMin ? 1 : 0; // 1 moving, 0 dwelling
      w++;
    }
  }
  return w;
}

// Pulse 0..1 at the station marker: 1 exactly at an arrival, fading
// over ±PULSE_WINDOW_MIN. arrivals lists the nearest arrival per run
// (minutes away, negative = just left).
export function stationPulse(table, tMin) {
  let pulse = 0;
  const arrivals = [];
  for (const run of table.runs) {
    let best = Infinity;
    for (const dep of run.trains) {
      // Each run is one direction: the outbound crossing each cycle.
      // (The opposite track is its own run; the second half of a
      // non-loop cycle is ghost return time, pinned at the terminus.)
      const ph = dep + run.stationMin;
      let d = (tMin - ph) % run.cycleMin;
      if (d > run.cycleMin / 2) d -= run.cycleMin;
      if (d < -run.cycleMin / 2) d += run.cycleMin;
      if (Math.abs(d) < Math.abs(best)) best = d;
    }
    pulse = Math.max(pulse, Math.max(0, 1 - Math.abs(best) / PULSE_WINDOW_MIN));
    arrivals.push({ line: run.lineName, pattern: run.patternId,
      inMin: Math.round(best * 10) / 10, method: run.method });
  }
  arrivals.sort((a, b) => Math.abs(a.inMin) - Math.abs(b.inMin));
  return { pulse, arrivals, trains: table.trains };
}
