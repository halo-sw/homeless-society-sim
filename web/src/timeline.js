// Day-at-a-glance timeline builders (12b, D). Pure: no DOM, no React,
// no three.js. The scene publishes the results; timeline.jsx renders.
//
// daySegments: one horizontal bar per member for 05:00–24:00, colour-
// coded by activity (집/걷기/지하철/직장/장보기/공원/기타). Gaps between
// trips and aways read as 집. The same ACTIVITY_COLORS paint the map
// route (route-ahead line = 걷기, ride stub = 지하철).
// routeSteps: the clickable step list for the outing containing a
// minute (walk legs, ride legs with congestion + source, transfers).
// monthStrip: one cell per simulated day (commute minutes + fatigue,
// weekends marked) for the day picker.

export const DAY_STRIP_START = 5 * 60; // 05:00
export const DAY_STRIP_END = 24 * 60; // 24:00

// Activity vocabulary: fixed 7 (brief). school/clinic fall under 기타
// with their own labels — the label always says what it is.
export const ACTIVITIES = {
  home: { label: "집", color: "#d9cfbb" },
  walk: { label: "걷기", color: "#2471a3" },
  bike: { label: "자전거", color: "#1b8a7a" },
  subway: { label: "지하철", color: "#8e44ad" },
  work: { label: "직장", color: "#b25a33" },
  errand: { label: "장보기", color: "#d9a83c" },
  park: { label: "공원", color: "#4a9b6b" },
  other: { label: "기타", color: "#9a9a9a" },
};

export const ACTIVITY_ORDER = ["home", "walk", "subway", "work", "errand", "park", "other"];

// 26i: a trip with engine bike mode (26d) reads 자전거 everywhere a
// walk trip reads 걷기. Trips without a mode key stay walk.
export function activityOfTrip(trip) {
  return trip && trip.mode === "bike" ? "bike" : "walk";
}

export function tripMoveWord(trip) {
  return trip && trip.mode === "bike" ? "자전거로" : "걸어서";
}

export function runHasBikeTrip(run) {
  return ((run && run.trips) || []).some((t) => t && t.mode === "bike");
}

const AWAY_ACTIVITY = {
  ride: "subway",
  work: "work",
  errand: "errand",
  park: "park",
  school: "other",
  clinic: "other",
};

export function activityOfAway(kind) {
  return AWAY_ACTIVITY[kind] || "other";
}

// 18d: the ONE minute→HH:MM formatter for every customer surface
// (selection log, ticker, moments, clocks). Floors float minutes —
// String(1060.2 % 60) leaks "40.200000000000045" into the UI.
export const hhmm = (m) => {
  const v = Math.max(0, Math.min(1439, Math.floor(m)));
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
};

function agentDay(items, agentKey, day, startKey) {
  return (items || [])
    .filter((t) => t.agent === agentKey && t.day === day)
    .sort((a, b) => a[startKey] - b[startKey]);
}

function rideLegLabel(ride) {
  const legs = (ride && ride.legs) || [];
  if (legs.length === 0) return "지하철 이동";
  return legs.map((l) => `${l.lineName} ${l.from}→${l.to}`).join(" · ");
}

// --- day segments -------------------------------------------------------------

export function daySegments({ run, agentKey, day }) {
  const trips = agentDay(run && run.trips, agentKey, day, "depart_min");
  const aways = agentDay(run && run.aways, agentKey, day, "start_min");
  const events = [];
  for (const t of trips) {
    const mins = Math.max(1, Math.round(t.arrive_min - t.depart_min));
    events.push({
      start: t.depart_min, end: t.arrive_min,
      activity: activityOfTrip(t),
      label: `${(t.from && t.from.label) || "출발"} → ${(t.to && t.to.label) || "도착"}`,
      detail: `${tripMoveWord(t)} ${mins}분`,
      minutes: mins,
      ref: { tripId: t.id, purpose: t.purpose || null },
    });
  }
  for (const a of aways) {
    const activity = activityOfAway(a.kind);
    const mins = Math.max(0, Math.round(a.end_min - a.start_min));
    const ride = a.detail && a.detail.ride;
    events.push({
      start: a.start_min, end: a.end_min,
      activity,
      label: a.kind === "ride" ? rideLegLabel(ride) : (a.label || activityLabel(activity)),
      detail: a.kind === "ride" ? `타고 ${mins}분` : `${mins}분 머무름`,
      minutes: mins,
      ref: { awayKind: a.kind },
    });
  }
  events.sort((a, b) => a.start - b.start || a.end - b.end);
  // Cover [05:00, 24:00): clamp, drop overlaps defensively, fill gaps
  // with 집 (the engine clock always advances, so gaps mean at home).
  const out = [];
  let cursor = DAY_STRIP_START;
  for (const e of events) {
    const start = Math.max(e.start, cursor);
    const end = Math.min(e.end, DAY_STRIP_END);
    if (start > cursor) {
      out.push({ start: cursor, end: Math.min(start, DAY_STRIP_END),
        activity: "home", label: "집", detail: "", minutes: Math.min(start, DAY_STRIP_END) - cursor,
        ref: {} });
      cursor = Math.min(start, DAY_STRIP_END);
    }
    if (end > start) {
      out.push({ ...e, start, end, minutes: end - start });
      cursor = end;
    }
    if (cursor >= DAY_STRIP_END) break;
  }
  if (cursor < DAY_STRIP_END) {
    out.push({ start: cursor, end: DAY_STRIP_END, activity: "home",
      label: "집", detail: "", minutes: DAY_STRIP_END - cursor, ref: {} });
  }
  return out.filter((s) => s.end > s.start);
}

export function activityLabel(activity) {
  return (ACTIVITIES[activity] || ACTIVITIES.other).label;
}

// "08:21–08:35 걷기 · 레이크팰리스 → 잠실역 14분" (hover/title text).
// The strip end (1440) reads 24:00; clock values stay 00:00–23:59.
export function segmentTitle(seg) {
  const end = seg.end >= DAY_STRIP_END ? "24:00" : hhmm(seg.end);
  const span = `${hhmm(seg.start)}–${end}`;
  const what = activityLabel(seg.activity);
  const where = seg.label && seg.activity !== "home" ? ` · ${seg.label}` : "";
  const mins = seg.activity === "home" ? "" : ` ${Math.round(seg.minutes)}분`;
  return `${span} ${what}${where}${mins}`;
}

// Fraction (0–1) of the playhead/segment position on the strip.
export function stripFrac(minute) {
  const m = Math.max(DAY_STRIP_START, Math.min(DAY_STRIP_END, minute));
  return (m - DAY_STRIP_START) / (DAY_STRIP_END - DAY_STRIP_START);
}

export function stripMinute(frac) {
  const f = Math.max(0, Math.min(1, frac));
  return Math.round(DAY_STRIP_START + f * (DAY_STRIP_END - DAY_STRIP_START));
}

// --- route steps --------------------------------------------------------------
// The outing containing `minute`: the maximal run of trips + aways with
// no home gap around it. Steps render as
// "집 → 잠실역 (걸어서 14분) → 2호선 잠실→강남 (9분, 혼잡 91% 실측) → …".

function outingKey(t) {
  return t.from && t.from.kind === "home" ? "leave" : t.to && t.to.kind === "home" ? "return" : "mid";
}

export function outingsFor({ run, agentKey, day }) {
  const trips = agentDay(run && run.trips, agentKey, day, "depart_min");
  const aways = agentDay(run && run.aways, agentKey, day, "start_min");
  const items = [
    ...trips.map((t) => ({ kind: "trip", start: t.depart_min, end: t.arrive_min, t })),
    ...aways.map((a) => ({ kind: "away", start: a.start_min, end: a.end_min, a })),
  ].sort((x, y) => x.start - y.start);
  const outings = [];
  let cur = [];
  const flush = () => {
    if (cur.length > 0) {
      outings.push({ items: cur, start: cur[0].start,
        end: cur[cur.length - 1].end });
      cur = [];
    }
  };
  for (const it of items) {
    if (it.kind === "trip" && outingKey(it.t) === "leave" && cur.length > 0) flush();
    cur.push(it);
    // A trip ends when the member is home again — or when the work /
    // school day ends (the way back is its own trip).
    if (it.kind === "trip" && outingKey(it.t) === "return") flush();
    if (it.kind === "away" && (it.a.kind === "work" || it.a.kind === "school")) flush();
  }
  flush();
  return outings;
}

function congestionKo(congestion) {
  if (!congestion) return "";
  const pct = Math.round(congestion.valuePct);
  const tag = congestion.source === "서울교통공사" ? "실측" : "가정";
  return `혼잡 ${pct}% ${tag}`;
}

// Steps for every outing of the day (the scene publishes this once per
// day; the UI picks the outing + current step by the playhead minute).
export function outingStepsFor({ run, agentKey, day }) {
  return outingsFor({ run, agentKey, day }).map((outing) => ({
    start: outing.start,
    end: outing.end,
    steps: stepsForOuting(outing),
  }));
}

// The outing shown for a minute: containing, else nearest past, else
// nearest future. Index into outingStepsFor().
export function outingIndexAt(outings, minute) {
  const m = Math.floor(minute);
  const list = outings || [];
  if (list.length === 0) return -1;
  const at = list.findIndex((o) => m >= o.start && m < o.end);
  if (at >= 0) return at;
  let past = -1;
  let future = -1;
  list.forEach((o, i) => {
    if (o.end <= m) past = i;
    if (o.start > m && future < 0) future = i;
  });
  if (past >= 0) return past;
  if (future >= 0) return future;
  return 0;
}

function stepsForOuting(outing) {
  const steps = [];
  const first = outing.items[0];
  const homeLabel = first.kind === "trip" && first.t.from ? first.t.from.label : "집";
  steps.push({ kind: "place", label: homeLabel || "집", minute: outing.start });
  for (const it of outing.items) {
    if (it.kind === "trip") {
      const mins = Math.max(1, Math.round(it.t.arrive_min - it.t.depart_min));
      const bike = it.t && it.t.mode === "bike";
      steps.push({ kind: bike ? "bike" : "walk",
        label: `${(it.t.to && it.t.to.label) || "도착"} (${bike ? "자전거로" : "걸어서"} ${mins}분)`,
        minute: it.t.depart_min, tripId: it.t.id, minutes: mins });
    } else {
      const a = it.a;
      const ride = a.detail && a.detail.ride;
      if (a.kind === "ride" && ride && Array.isArray(ride.legs) && ride.legs.length > 0) {
        for (let li = 0; li < ride.legs.length; li++) {
          const leg = ride.legs[li];
          const mins = Math.max(1, Math.round(leg.minutes));
          const cong = congestionKo(leg.congestion);
          steps.push({ kind: "ride",
            label: `${leg.lineName} ${leg.from}→${leg.to} (${mins}분${cong ? `, ${cong}` : ""})`,
            minute: a.start_min, legIndex: li, minutes: mins,
            congestion: leg.congestion || null });
          const xfer = (ride.transfers || [])[li];
          if (xfer && li < ride.legs.length - 1) {
            steps.push({ kind: "transfer",
              label: `${xfer.station} 환승 ${Math.round(xfer.minutes)}분`,
              minute: a.start_min, minutes: Math.round(xfer.minutes) });
          }
        }
        const dw = a.detail && a.detail.dest_walk;
        if (dw && dw.minutes > 0) {
          steps.push({ kind: "walk",
            label: `직장 (걸어서 ${Math.round(dw.minutes)}분)`,
            minute: a.end_min - Math.round(dw.minutes),
            minutes: Math.round(dw.minutes) });
        }
      } else if (a.kind === "work" || a.kind === "school") {
        steps.push({ kind: "place", label: a.label || activityLabel(activityOfAway(a.kind)),
          minute: a.start_min, minutes: Math.max(0, Math.round(a.end_min - a.start_min)) });
      } else if (a.kind !== "ride") {
        steps.push({ kind: "stay",
          label: `${a.label || activityLabel(activityOfAway(a.kind))} `
            + `${Math.max(0, Math.round(a.end_min - a.start_min))}분`,
          minute: a.start_min });
      }
    }
  }
  return steps;
}

export function routeSteps({ run, agentKey, day, minute }) {
  const m = Math.floor(minute);
  const outings = outingStepsFor({ run, agentKey, day });
  if (outings.length === 0) return { steps: [], current: -1, outing: null, outings };
  const outing = outings[Math.max(0, outingIndexAt(outings, m))];
  return { steps: outing.steps, current: stepIndexAt(outing.steps, m),
    outing: { start: outing.start, end: outing.end },
    outings: outings.map((o) => ({ start: o.start, end: o.end })) };
}

// Previous / next outing starts around `minute` (←/→, buttons). Null
// when there is none in that direction.
export function tripNav({ run, agentKey, day, minute }) {
  const m = Math.floor(minute);
  const outings = outingsFor({ run, agentKey, day })
    .map((o) => ({ start: o.start, end: o.end }));
  return navFromOutings(outings, m);
}

// UI-side form: the scene publishes outings once per day; the playhead
// minute moves freely underneath.
export function navFromOutings(outings, minute) {
  const m = Math.floor(minute);
  let prev = null;
  let next = null;
  for (const o of outings || []) {
    if (o.start < m && (prev === null || o.start > prev)) prev = o.start;
    if (o.start > m && (next === null || o.start < next)) next = o.start;
  }
  // Inside an outing, ← goes to its start first.
  const inside = (outings || []).find((o) => m > o.start && m < o.end);
  if (inside) prev = inside.start;
  return { prev, next };
}

// Current step index for the playhead minute (last step at/before m).
export function stepIndexAt(steps, minute) {
  const m = Math.floor(minute);
  let current = 0;
  (steps || []).forEach((s, i) => {
    if (s.minute <= m) current = i;
  });
  return current;
}

// --- 30-day strip --------------------------------------------------------------

const WEEKEND = new Set(["Sat", "Sun", "토", "일"]);

export function monthStrip({ run, agentKey }) {
  const entry = (run && run.daily || []).find((d) => d.agent === agentKey);
  const days = (entry && entry.days) || [];
  return days.map((d, i) => {
    const walk = Number.isFinite(d.commute_walk_minutes) ? d.commute_walk_minutes : null;
    const ride = Number.isFinite(d.commute_ride_minutes) ? d.commute_ride_minutes : null;
    const commute = walk === null && ride === null ? null : Math.round((walk || 0) + (ride || 0));
    const fatigue = d.fatigue && Number.isFinite(d.fatigue.mean) ? d.fatigue.mean : null;
    return {
      day: Number.isFinite(d.day) ? d.day : i,
      date: d.date || "",
      weekday: d.weekday || "",
      weekend: WEEKEND.has(d.weekday),
      commuteMin: commute,
      fatigueMean: fatigue === null ? null : Math.round(fatigue * 10) / 10,
      trips: Number.isFinite(d.trips) ? d.trips : null,
    };
  });
}
