import { SEATED_PCT } from "./journey.js";
import { householdKeys, awayEvidence } from "./moments.js";
import { hhmm } from "../timeline.js";

const ASSUMED_SOURCE = "가정값";
const LATE_MIN = 1320;

// 29c1b: mid-month sunset, minutes after midnight, local time
// (한국천문연구원 일몰 시각 근사). Jan…Dec.
const SEOUL_SUNSET = [1060, 1090, 1115, 1140, 1165, 1190, 1195, 1170, 1130, 1085, 1045, 1035];
const MENLO_SUNSET = [1035, 1065, 1150, 1170, 1195, 1215, 1215, 1190, 1150, 1105, 1020, 1010];

export function sunsetMinFor(meta) {
  const m = meta || {};
  let month = 11;
  if (typeof m.start_date === "string") {
    const mm = /-(\d{2})-/.exec(m.start_date);
    if (mm) {
      const n = Number(mm[1]);
      if (n >= 1 && n <= 12) month = n;
    }
  }
  const table = typeof m.area === "string" && m.area.startsWith("us-")
    ? MENLO_SUNSET
    : SEOUL_SUNSET;
  return table[month - 1];
}

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

// 29c1b: commute walks home that arrive after sunset — the walk you only
// learn by living there. Arrive from arrive_min when present, else
// depart_min + minutes.
function darkSide(run) {
  const hh = householdKeys(run);
  const sunset = sunsetMinFor(run.meta);
  let count = 0;
  let minSum = 0;
  let minN = 0;
  let mSum = 0;
  let mN = 0;
  const fromCounts = new Map();
  let evTrip = null;
  for (const t of run.trips || []) {
    if (!hh.has(t.agent)) continue;
    if (!t.to || t.to.kind !== "home") continue;
    if (t.purpose !== "commute") continue;
    let arr = null;
    if (typeof t.arrive_min === "number" && Number.isFinite(t.arrive_min)) {
      arr = t.arrive_min;
    } else if (typeof t.depart_min === "number" && typeof t.minutes === "number"
      && Number.isFinite(t.depart_min) && Number.isFinite(t.minutes)) {
      arr = t.depart_min + t.minutes;
    }
    if (arr === null || arr < sunset) continue;
    count += 1;
    evTrip = t;
    if (typeof t.minutes === "number" && Number.isFinite(t.minutes)) {
      minSum += t.minutes;
      minN += 1;
    }
    if (typeof t.distance_m === "number" && Number.isFinite(t.distance_m)) {
      mSum += t.distance_m;
      mN += 1;
    }
    const label = t.from && typeof t.from.label === "string" && t.from.label
      ? t.from.label
      : null;
    if (label) fromCounts.set(label, (fromCounts.get(label) || 0) + 1);
  }
  let from = null;
  let best = 0;
  for (const [label, n] of fromCounts) {
    if (n > best) {
      best = n;
      from = label;
    }
  }
  return {
    count,
    avgMin: minN === 0 ? null : Math.round(minSum / minN),
    avgM: mN === 0 ? null : Math.round(mSum / mN / 10) * 10,
    from,
    evidence: evTrip ? { type: "trip", id: evTrip.id } : null,
  };
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
  const da = darkSide(runA);
  const db = darkSide(runB);
  if (da.count > 0 || db.count > 0) {
    rows.push({
      kind: "dark_walk",
      sunset: hhmm(sunsetMinFor(runA.meta)),
      a: { count: da.count, avgMin: da.avgMin, avgM: da.avgM, from: da.from },
      b: { count: db.count, avgMin: db.avgMin, avgM: db.avgM, from: db.from },
      source: "기록 · 해 지는 시각 가정",
      evidence: { a: da.evidence, b: db.evidence },
    });
  }
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

function seatedPart(side, label) {
  if (side.measured === 0) return `${label} 혼잡도 자료 없음`;
  return `${label} ${side.seated}/${side.measured}일`;
}

function fmtDist(m) {
  if (typeof m !== "number" || !Number.isFinite(m)) return null;
  if (m < 1000) return `${m}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

function stationName(from) {
  if (!from) return "역";
  return from.endsWith("역") ? from : `${from}역`;
}

function darkPart(side, label) {
  if (side.count === 0) return `${label} 0번`;
  if (typeof side.avgMin !== "number") return `${label} ${side.count}번`;
  const dist = fmtDist(side.avgM);
  return `${label} ${side.count}번 · ${stationName(side.from)}에서 평균 ${side.avgMin}분${dist ? `(${dist})` : ""}`;
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
    if (row.kind === "dark_walk") {
      return `해 진 뒤 걸어서 퇴근: ${darkPart(row.a, la)} · ${darkPart(row.b, lb)} · 해 지는 시각 ${row.sunset} 기준`;
    }
    if (row.kind === "seated") {
      const noData = row.a.measured === 0 || row.b.measured === 0;
      const tail = noData ? `(실측 ${SEATED_PCT}% 이하일 때)` : `(실측 혼잡도 ${SEATED_PCT}% 이하)`;
      return `앉아서 간 출근: ${seatedPart(row.a, la)} · ${seatedPart(row.b, lb)} ${tail}`;
    }
    if (row.kind === "late_home") {
      return `밤 10시 이후 귀가: ${latePart(row.a, la)} · ${latePart(row.b, lb)}`;
    }
    return "";
  });
}
