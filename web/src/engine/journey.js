// Station-ride journeys: path, ride-minutes split, congestion, fatigue (pure).
//
// A station ride keeps the ride_minutes total — the customer's number
// when given, else the operator-schedule derived number (C-ride-minutes)
// — and, when the scenario names a destination station and the region
// network is loaded, draws the real path on the OSM station graph
// (C-journey-path: shortest line km + transfer penalty), splits the
// total across legs in proportion to line distance after per-transfer
// walk/wait (C-ride-split),
// looks up the boarding-station congestion for the ride's 30-minute slot
// (C-congestion), and accrues the stated fatigue model (C-fatigue-load /
// C-fatigue-recovery: 가정 모델이며 건강·의학적 판단이 아닙니다).
//
// No network or no destination → buildRides returns null and the ride
// stays a minutes number (fatigue then uses the fallback congestion).

import { criterionDefault } from "./criteria.js";

export const SEATED_PCT = criterionDefault("C-congestion", "seated_pct"); // 34
export const CAPACITY_PCT = criterionDefault("C-congestion", "capacity_pct"); // 100
export const VERY_CROWDED_PCT = criterionDefault("C-congestion", "very_crowded_pct"); // 150

export const CONGESTION_SOURCE = "서울교통공사";
export const FALLBACK_SOURCE = "가정값";

export function normalizeStation(name) {
  return String(name || "").trim().replace(/\s*\([^()]*\)\s*$/, "").trim()
    .replace(/역$/, "").trim();
}

// weekday: Mon..Sun → congestion day kind.
export function dayKindFor(weekday) {
  if (weekday === "Sat") return "saturday";
  if (weekday === "Sun") return "sunday";
  return "weekday";
}

// Index of the 30-minute slot containing `minute` (clamped into range).
export function slotIndexFor(minute, slots) {
  let idx = 0;
  for (let i = 0; i < slots.length; i++) {
    if (minute >= slots[i]) idx = i;
    else break;
  }
  return idx;
}

// Shortest path by line km + transfer penalty (same rule as the corridor
// builder). Ties break on stop-id order, so all runtimes agree.
export function findPath(network, fromName, toName, penaltyKm) {
  const stops = new Map();
  for (const line of network.lines || []) {
    for (const s of line.stops || []) {
      stops.set(s.id, { line: line.id, lineName: line.name, ...s });
    }
  }
  const want = (n) => normalizeStation(n);
  const starts = [...stops.keys()].filter((id) => want(stops.get(id).name) === want(fromName)).sort();
  const goals = new Set([...stops.keys()].filter((id) => want(stops.get(id).name) === want(toName)));
  if (starts.length === 0 || goals.size === 0) return null;
  const adj = new Map([...stops.keys()].map((id) => [id, []]));
  for (const line of network.lines || []) {
    for (const p of line.patterns || []) {
      const ids = p.stops;
      const kms = p.chainage_km;
      for (let i = 0; i + 1 < ids.length; i++) {
        const w = Math.abs(kms[i + 1] - kms[i]);
        adj.get(ids[i]).push([ids[i + 1], w, p.id]);
        adj.get(ids[i + 1]).push([ids[i], w, p.id]);
      }
    }
  }
  const byKey = new Map();
  for (const [id, s] of stops) {
    if (!byKey.has(s.key)) byKey.set(s.key, []);
    byKey.get(s.key).push(id);
  }
  for (const ids of byKey.values()) {
    for (const a of ids) {
      for (const b of ids) {
        if (a !== b) adj.get(a).push([b, penaltyKm, "transfer"]);
      }
    }
  }
  for (const list of adj.values()) list.sort((x, y) => (x[0] < y[0] ? -1 : 1));
  let best = null;
  for (const start of starts) {
    const dist = new Map([[start, 0]]);
    const prev = new Map();
    const heap = [[0, start]]; // tiny graph: array heap is fine
    while (heap.length > 0) {
      heap.sort((x, y) => x[0] - y[0]);
      const [d, u] = heap.shift();
      if (d > dist.get(u)) continue;
      if (goals.has(u)) break;
      for (const [v, w, via] of adj.get(u)) {
        const nd = d + w;
        if (nd < (dist.has(v) ? dist.get(v) : Infinity)) {
          dist.set(v, nd);
          prev.set(v, [u, via]);
          heap.push([nd, v]);
        }
      }
    }
    const reached = [...goals].filter((g) => dist.has(g))
      .map((g) => [dist.get(g), g]).sort((x, y) => x[0] - y[0] || (x[1] < y[1] ? -1 : 1));
    if (reached.length === 0) continue;
    if (best === null || reached[0][0] < best[0]) {
      let node = reached[0][1];
      const chain = [node];
      while (node !== start) {
        node = prev.get(node)[0];
        chain.push(node);
      }
      chain.reverse();
      best = [reached[0][0], start, chain, prev];
    }
  }
  if (best === null) return null;
  const [, start, chain, prev] = best;
  const legs = [];
  let cur = [chain[0]];
  const transfers = [];
  for (const node of chain.slice(1)) {
    if (prev.get(node)[1] === "transfer") {
      legs.push(cur);
      cur = [node];
      transfers.push(stops.get(node).key);
    } else {
      cur.push(node);
    }
  }
  legs.push(cur);
  let totalKm = 0;
  const outLegs = legs.map((leg) => {
    let km = 0;
    const edgeKm = [];
    for (let i = 0; i + 1 < leg.length; i++) {
      const hit = adj.get(leg[i]).find(([v, , via]) => v === leg[i + 1] && via !== "transfer");
      const w = hit ? hit[1] : 0;
      edgeKm.push(Math.round(w * 1000) / 1000);
      km += w;
    }
    totalKm += km;
    return {
      line: stops.get(leg[0]).line,
      lineName: stops.get(leg[0]).lineName,
      stops: leg.map((id) => stops.get(id).name),
      stopIds: [...leg],
      distanceKm: Math.round(km * 1000) / 1000,
      edgeKm,
    };
  });
  return { from: fromName, to: toName, legs: outLegs,
    transfers, distanceKm: Math.round(totalKm * 1000) / 1000 };
}

// The directed pattern carrying a leg: the stop run must appear in
// travel order (a reversed run is the opposite direction — the wrong
// congestion column — so it never matches).
export function patternForLeg(network, leg) {
  const want = leg.stopIds;
  for (const line of network.lines || []) {
    if (line.id !== leg.line) continue;
    for (const p of line.patterns || []) {
      const ids = p.stops;
      for (let i = 0; i + want.length <= ids.length; i++) {
        if (ids.slice(i, i + want.length).every((id, k) => id === want[k])) {
          return p;
        }
      }
    }
  }
  return null;
}

// Split the customer total across legs (C-ride-split): transfer walk/wait
// first, the rest in proportion to line distance. The rounded pieces sum
// to the total exactly (residue on the longest leg).
export function splitRide(totalMinutes, path, transferMin) {
  const legs = path.legs;
  const nTransfer = Math.max(0, legs.length - 1);
  const transferEach = nTransfer > 0 ? transferMin : 0;
  const transferTotal = transferEach * nTransfer;
  const rideTotal = Math.max(0, totalMinutes - transferTotal);
  const distTotal = legs.reduce((a, l) => a + l.distanceKm, 0);
  const raw = legs.map((l) => (distTotal > 0 ? (l.distanceKm / distTotal) * rideTotal : rideTotal / legs.length));
  const rounded = raw.map((m) => Math.round(m * 10) / 10);
  let residue = Math.round((rideTotal - rounded.reduce((a, b) => a + b, 0)) * 10) / 10;
  if (residue !== 0 && rounded.length > 0) {
    let longest = 0;
    for (let i = 1; i < legs.length; i++) {
      if (legs[i].distanceKm > legs[longest].distanceKm) longest = i;
    }
    rounded[longest] = Math.round((rounded[longest] + residue) * 10) / 10;
    residue = 0;
  }
  return {
    legs: rounded,
    transferMinutesEach: transferEach,
    transferMinutesTotal: Math.round(transferTotal * 10) / 10,
    total: totalMinutes,
  };
}

// Boarding-station congestion for a leg starting at `minute`.
export function congestionFor(congestion, { dayKind, lineName, station, directionLabel, minute, fallbackPct }) {
  const slots = (congestion && congestion.slots) || [];
  const noTable = !congestion || !congestion.days || slots.length === 0;
  const idx = noTable ? -1 : slotIndexFor(minute, slots);
  const values = !noTable
    && (((congestion.days[dayKind] || {})[lineName] || {})[station] || {})[directionLabel];
  if (Array.isArray(values) && idx >= 0 && idx < values.length && values[idx] !== null) {
    return {
      line: lineName, station, direction: directionLabel,
      slot: idx, slotLabel: (congestion.slot_labels || [])[idx] || "",
      valuePct: values[idx], source: CONGESTION_SOURCE, hasData: true,
    };
  }
  return {
    line: lineName, station, direction: directionLabel,
    slot: idx, slotLabel: (congestion && congestion.slot_labels && congestion.slot_labels[idx]) || "",
    valuePct: fallbackPct, source: FALLBACK_SOURCE, hasData: false,
  };
}

// Standing share: 0 at/ below seatedPct, 1 at/above capacityPct, linear.
export function standShare(congPct, seatedPct = SEATED_PCT, capacityPct = CAPACITY_PCT) {
  if (congPct <= seatedPct) return 0;
  if (congPct >= capacityPct) return 1;
  return (congPct - seatedPct) / (capacityPct - seatedPct);
}

// The crowding number shown beside fatigue everywhere (stage 9c):
// "2호선 잠실 혼잡도 93.2%, 서서 감". peak: {pct, line, station} | null.
// Null without rides (walked commutes), never a guess.
export function congestionPeakLine(peak) {
  if (!peak || !Number.isFinite(peak.pct)) return null;
  const where = [peak.line, peak.station].filter(Boolean).join(" ");
  const posture = standShare(peak.pct) >= 0.5 ? "서서 감" : "앉아서 감";
  const pct = Math.round(peak.pct * 10) / 10;
  return `${where ? `${where} ` : ""}혼잡도 ${pct}%, ${posture}`;
}

// Expected fatigue load of a ride leg (C-fatigue-load): seated minutes +
// standing minutes + above-capacity extra. Deterministic (no sampling).
export function rideLegFatigue(minutes, congPct, crit) {
  const share = standShare(congPct);
  const perMin = (1 - share) * crit.fatigue_ride_seated_per_min
    + share * crit.fatigue_ride_stand_per_min
    + Math.max(0, (congPct - CAPACITY_PCT) / 100) * crit.fatigue_crowd_extra_per_min;
  return minutes * perMin;
}

export function walkFatigue(minutes, crit) {
  return minutes * crit.fatigue_walk_per_min;
}

// Congestion band for the journey legend (thresholds from C-congestion).
export function congestionBand(pct) {
  if (pct <= SEATED_PCT) return { key: "calm", label: "여유" };
  if (pct < CAPACITY_PCT) return { key: "normal", label: "보통" };
  if (pct <= VERY_CROWDED_PCT) return { key: "crowded", label: "혼잡" };
  return { key: "packed", label: "매우 혼잡" };
}

const round1 = (x) => Math.round(x * 10) / 10;

// Both directions of one commute day's rides, or null (no destination,
// unknown stations, or no network). Slots come from the actual ride
// starts, so the morning and evening legs read different columns.
export function buildRides({ network, congestion, fromName, toName, rideMinutes, departOut, departBack, weekday, crit }) {
  if (!network || !fromName || !toName || !(rideMinutes > 0)) return null;
  if (normalizeStation(fromName) === normalizeStation(toName)) return null;
  const dayKind = dayKindFor(weekday);
  const split = { out: null, back: null };
  const pathOut = findPath(network, fromName, toName, crit.journey_transfer_penalty_km);
  if (!pathOut) return null;
  const pathBack = findPath(network, toName, fromName, crit.journey_transfer_penalty_km) || pathOut;
  const mkRide = (path, depart) => {
    const parts = splitRide(rideMinutes, path, crit.ride_transfer_min);
    const legs = path.legs.map((leg, i) => {
      const pattern = patternForLeg(network, leg);
      const directionLabel = pattern ? pattern.direction_label : "";
      const station = leg.stops[0];
      const cong = congestionFor(congestion, {
        dayKind, lineName: leg.lineName, station, directionLabel,
        minute: depart, fallbackPct: crit.congestion_fallback_pct,
      });
      const fat = rideLegFatigue(parts.legs[i], cong.valuePct, crit);
      return {
        line: leg.line, lineName: leg.lineName,
        from: leg.stops[0], to: leg.stops[leg.stops.length - 1],
        stops: [...leg.stops], stopIds: [...leg.stopIds],
        distanceKm: leg.distanceKm,
        patternId: pattern ? pattern.id : null,
        minutes: parts.legs[i], congestion: cong, fatigueDelta: round1(fat),
      };
    });
    const transfers = path.transfers.map((key) => ({ station: key,
      minutes: parts.transferMinutesEach }));
    const transferFat = transfers.length * crit.fatigue_per_transfer
      + parts.transferMinutesTotal * crit.fatigue_wait_per_min;
    const fatigueDelta = round1(legs.reduce((a, l) => a + l.fatigueDelta, 0) + transferFat);
    return { departMin: depart, legs, transfers,
      transferMinutes: parts.transferMinutesTotal,
      minutesTotal: rideMinutes, fatigueDelta,
      crowdedMin: round1(legs.filter((l) => l.congestion.valuePct > CAPACITY_PCT)
        .reduce((a, l) => a + l.minutes, 0)) };
  };
  split.out = mkRide(pathOut, departOut);
  split.back = mkRide(pathBack, departBack);
  return split;
}

// Human one-liner for the split (the total stays the customer's number).
export function splitLine(rides, rideSource) {
  const bits = [];
  const legs = rides.out.legs;
  legs.forEach((leg, i) => {
    bits.push(`${leg.lineName} ${leg.from}→${leg.to} 약 ${leg.minutes}분`);
    if (i < legs.length - 1) {
      bits.push(`환승 ${rides.out.transfers[i] ? rides.out.transfers[i].minutes : 0}분`);
    }
  });
  const src = rideSource === "user_input" ? "고객 입력"
    : rideSource === "derived" ? "운행시간표·추정" : "가정값";
  return `${bits.join(" · ")} — 합계는 ${src} ${rides.out.minutesTotal}분`;
}
