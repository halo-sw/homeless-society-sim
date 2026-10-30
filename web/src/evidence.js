// Stage 20c: how the scene on screen counts toward the result.
//
// sceneEvidence({ run, agentKey, day, minute, now }) returns 0-3 short
// lines shown under the sim hero's big number, each { text, tag } where
// tag is "측정", "가정값" or null. Commute lines reuse the same helpers
// as the result card (commuteOneWayMinutes), so the numbers match.
// At home / work / lingering somewhere: [] (nothing to clutter).
import { commuteOneWayMinutes } from "./verify/numbers.js";

// Same half-day cut as verify/numbers.js (AM_END_MINUTES = 12:00).
const AM_END_MINUTES = 720;
// Source value the engine stamps on assumption-based congestion
// (engine/journey.js FALLBACK_SOURCE).
const ASSUMED_SOURCE = "가정값";

const ERRAND_WORD = { errand: "장보기", clinic: "병원", park: "산책" };

const halfOf = (m) => (m ?? 0) < AM_END_MINUTES ? "am" : "pm";

const startOf = (t) => t.depart_min ?? t.arrive_min ?? 0;
const awayStartOf = (a) => a.start_min ?? a.end_min ?? 0;

export function sceneEvidence({ run, agentKey, day, minute, now }) {
  if (!now || now.free || !now.state) return [];
  if (now.state === "trip") {
    const trip = findTrip(run, agentKey, now.tripId, day, minute);
    if (!trip) return [];
    if (trip.purpose === "commute") return commuteLines(run, agentKey, trip, startOf(trip));
    if (ERRAND_WORD[trip.purpose]) return errandLines(run, agentKey, trip);
    return [];
  }
  if (now.state === "ride") {
    const away = findRide(run, agentKey, day, minute);
    if (!away) return [];
    return commuteLines(run, agentKey, away, awayStartOf(away));
  }
  return [];
}

function findTrip(run, agentKey, tripId, day, minute) {
  const trips = (run && run.trips) || [];
  if (tripId) {
    const hit = trips.find((t) => t && t.id === tripId);
    if (hit) return hit;
  }
  const m = Math.floor(minute ?? 0);
  return trips.find((t) => t && t.agent === agentKey && t.day === day
    && Number.isFinite(t.depart_min) && Number.isFinite(t.arrive_min)
    && m >= t.depart_min && m < t.arrive_min) || null;
}

function findRide(run, agentKey, day, minute) {
  const m = Math.floor(minute ?? 0);
  return ((run && run.aways) || []).find((a) => a && a.agent === agentKey
    && a.day === day && a.kind === "ride"
    && Number.isFinite(a.start_min) && Number.isFinite(a.end_min)
    && m >= a.start_min && m < a.end_min) || null;
}

// Ride legs + transfer minutes behind one ride away, in the engine's own
// split (legs carry the train time, transfers carry walk/wait). Without
// leg detail the away window itself is the ride time.
function rideParts(away) {
  const out = { ride: 0, wait: 0, assumed: [] };
  const d = (away && away.detail) || {};
  const details = [];
  if (d.ride && typeof d.ride === "object") details.push(d.ride);
  else if (d.rides && typeof d.rides === "object") {
    if (d.rides.out) details.push(d.rides.out);
    if (d.rides.back) details.push(d.rides.back);
  }
  if (details.length === 0) {
    if (Number.isFinite(away.end_min) && Number.isFinite(away.start_min)) {
      out.ride = Math.max(0, away.end_min - away.start_min);
    } else if (Number.isFinite(d.ride_minutes)) {
      out.ride = d.ride_minutes;
    }
    return out;
  }
  for (const r of details) {
    for (const leg of r.legs || []) {
      if (Number.isFinite(leg.minutes)) out.ride += leg.minutes;
      const c = leg.congestion;
      if (c && (c.source === ASSUMED_SOURCE || c.hasData === false)
          && Number.isFinite(c.valuePct)) {
        out.assumed.push(c.valuePct);
      }
    }
    let w = 0;
    let anyTransfer = false;
    for (const t of r.transfers || []) {
      if (Number.isFinite(t.minutes)) {
        w += t.minutes;
        anyTransfer = true;
      }
    }
    if (!anyTransfer && Number.isFinite(r.transferMinutes)) w = r.transferMinutes;
    out.wait += w;
  }
  return out;
}

// One direction's door-to-door commute for this agent, day and am|pm
// half: the walk trips plus the ride away(s). The total is defined as
// the sum of the rounded parts, so the parts always add up.
function commuteLines(run, agentKey, current, currentStart) {
  const day = current.day;
  const half = halfOf(currentStart);
  const trips = ((run && run.trips) || []).filter((t) => t && t.agent === agentKey
    && t.day === day && t.purpose === "commute" && halfOf(startOf(t)) === half);
  const rides = ((run && run.aways) || []).filter((a) => a && a.agent === agentKey
    && a.day === day && a.kind === "ride" && halfOf(awayStartOf(a)) === half);
  const walk = Math.round(trips.reduce((n, t) =>
    n + (Number.isFinite(t.minutes) ? t.minutes : 0), 0));
  let ride = 0;
  let wait = 0;
  const assumed = [];
  for (const a of rides) {
    const p = rideParts(a);
    ride += p.ride;
    wait += p.wait;
    assumed.push(...p.assumed);
  }
  ride = Math.round(ride);
  wait = Math.round(wait);
  const total = walk + ride + wait;
  const dir = half === "am" ? "출근" : "퇴근";
  const parts = [`걷기 ${walk}분`];
  if (ride > 0) parts.push(`지하철 ${ride}분`);
  if (wait > 0) parts.push(`기다림 ${wait}분`);
  const lines = [{ text: `오늘 ${dir} ${total}분 = ${parts.join(" + ")}`, tag: "측정" }];
  const avg = commuteOneWayMinutes(run, agentKey);
  if (Number.isFinite(avg)) {
    const days = (run && run.meta && run.meta.days) || 30;
    lines.push({ text: `${days}일 출퇴근 편도 평균 ${Math.round(avg)}분 중 하루예요`, tag: "측정" });
  }
  if (assumed.length > 0) {
    const pct = Math.round(Math.max(...assumed));
    lines.push({ text: `혼잡 ${pct}%는 가정값이에요 (실측 없음)`, tag: "가정값" });
  }
  return lines;
}

function errandLines(run, agentKey, trip) {
  const word = ERRAND_WORD[trip.purpose];
  const mine = ((run && run.trips) || [])
    .filter((t) => t && t.agent === agentKey && t.purpose === trip.purpose)
    .sort((a, b) => (a.day - b.day) || (startOf(a) - startOf(b)));
  const idx = mine.findIndex((t) => t.id === trip.id);
  if (idx < 0) return [];
  const days = (run && run.meta && run.meta.days) || 30;
  const to = trip.to || {};
  const label = to.label || to.id || "알 수 없음";
  const walkMin = Math.round(Number.isFinite(trip.minutes) ? trip.minutes : 0);
  return [
    { text: `${days}일 중 ${idx + 1}번째 ${word} · 이 집에서 모두 ${mine.length}번`, tag: "측정" },
    { text: `목적지 ${label} · 걸어서 ${walkMin}분`, tag: "측정" },
  ];
}
