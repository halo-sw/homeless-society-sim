import { SEATED_PCT } from "./journey.js";
import { householdKeys, awayEvidence } from "./moments.js";
import { hhmm } from "../timeline.js";

const ASSUMED_SOURCE = "가정값";
const LATE_MIN = 1320;

const isMeasured = (c) =>
  c && c.hasData === true && c.source !== ASSUMED_SOURCE && Number.isFinite(c.valuePct);

function boardingOf(away) {
  const det = away.detail || {};
  const ride = det.rides ? det.rides.out : det.ride;
  const legs = ride && Array.isArray(ride.legs) ? ride.legs : null;
  if (!legs || legs.length === 0) return null;
  return legs[0];
}

function seatedSide(run, ids) {
  const hh = householdKeys(run);
  const seen = new Map();
  for (const away of run.aways || []) {
    if (!hh.has(away.agent)) continue;
    if (away.kind !== "work" && away.kind !== "school") continue;
    const boarding = boardingOf(away);
    if (!isMeasured(boarding && boarding.congestion)) continue;
    const key = `${away.agent}|${away.day}`;
    // One boarding per member-day: the first measured one wins.
    if (!seen.has(key)) {
      seen.set(key, { away, seated: boarding.congestion.valuePct <= SEATED_PCT });
    }
  }
  let measured = 0;
  let seated = 0;
  let evidence = null;
  for (const { away, seated: s } of seen.values()) {
    measured += 1;
    if (s) seated += 1;
    if (!evidence) evidence = awayEvidence(run, ids, away, ["commute"]);
  }
  return { measured, seated, evidence };
}

// The station→home walk of a late trip: the walking minutes of its last
// part when the trip carries parts, else the trip's own minutes when the
// trip mode is walking (engine walk trips carry no mode; bike trips carry
// mode "bike" and their walk share is unknown → null).
function lastWalkMin(trip) {
  const parts = trip.parts;
  if (Array.isArray(parts) && parts.length > 0) {
    const last = parts[parts.length - 1];
    for (const k of ["walkMin", "walk_min", "walk_minutes"]) {
      if (typeof last[k] === "number" && Number.isFinite(last[k])) return last[k];
    }
    if ((last.mode === "walk" || last.kind === "walk" || last.mode == null)
      && typeof last.minutes === "number" && Number.isFinite(last.minutes)) {
      return last.minutes;
    }
    return null;
  }
  if ((trip.mode === "walk" || trip.mode == null)
    && typeof trip.minutes === "number" && Number.isFinite(trip.minutes)) {
    return trip.minutes;
  }
  return null;
}

function lateSide(run) {
  const hh = householdKeys(run);
  let count = 0;
  let walkSum = 0;
  let walkN = 0;
  let latest = -1;
  let evTrip = null;
  for (const t of run.trips || []) {
    if (!hh.has(t.agent)) continue;
    if (!t.to || t.to.kind !== "home") continue;
    if (typeof t.depart_min !== "number" || typeof t.minutes !== "number") continue;
    const arr = t.depart_min + t.minutes;
    if (arr < LATE_MIN) continue;
    count += 1;
    if (arr > latest) {
      latest = arr;
      evTrip = t;
    }
    const w = lastWalkMin(t);
    if (typeof w === "number" && Number.isFinite(w)) {
      walkSum += w;
      walkN += 1;
    }
  }
  return {
    count,
    avgWalkMin: count === 0 || walkN === 0 ? null : Math.round(walkSum / walkN),
    latest: count === 0 ? null : hhmm(latest),
    evidence: evTrip ? { type: "trip", id: evTrip.id } : null,
  };
}

export function lifeEvents(runA, runB, { labels = ["A", "B"] } = {}) {
  const idsA = new Set((runA.decisions || []).map((d) => d.id));
  const idsB = new Set((runB.decisions || []).map((d) => d.id));
  const rows = [];
  const sa = seatedSide(runA, idsA);
  const sb = seatedSide(runB, idsB);
  if (sa.measured > 0 || sb.measured > 0) {
    rows.push({
      kind: "seated",
      a: { seated: sa.seated, measured: sa.measured },
      b: { seated: sb.seated, measured: sb.measured },
      source: "실측 혼잡도",
      evidence: { a: sa.evidence, b: sb.evidence },
    });
  }
  const la = lateSide(runA);
  const lb = lateSide(runB);
  if (la.count > 0 || lb.count > 0) {
    rows.push({
      kind: "late_home",
      a: { count: la.count, avgWalkMin: la.avgWalkMin, latest: la.latest },
      b: { count: lb.count, avgWalkMin: lb.avgWalkMin, latest: lb.latest },
      source: "기록",
      evidence: { a: la.evidence, b: lb.evidence },
    });
  }
  return rows;
}

function latePart(side, label) {
  if (side.count === 0) return `${label} 0번`;
  let s = `${label} ${side.count}번`;
  const bits = [];
  if (typeof side.avgWalkMin === "number") bits.push(`역에서 걸어 평균 ${side.avgWalkMin}분`);
  if (side.latest) bits.push(`가장 늦게 ${side.latest}`);
  if (bits.length > 0) s += `(${bits.join(", ")})`;
  return s;
}

export function lifeEventLines(rows, labels) {
  const [la = "A", lb = "B"] = labels || [];
  return (rows || []).map((row) => {
    if (row.kind === "seated") {
      return `앉아서 간 출근: ${la} ${row.a.seated}/${row.a.measured}일 · ${lb} ${row.b.seated}/${row.b.measured}일 (실측 혼잡도 ${SEATED_PCT}% 이하)`;
    }
    if (row.kind === "late_home") {
      return `밤 10시 이후 귀가: ${latePart(row.a, la)} · ${latePart(row.b, lb)}`;
    }
    return "";
  });
}
