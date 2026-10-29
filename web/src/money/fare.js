// 수도권 통합 거리비례 전철 운임 (pure).
//
// Rule: 국토교통부 수도권 전철 운임 조정, 시행 2025-06-28 (교통카드,
// 성인). Base 1,550원 to 10 km; 10–50 km +100원 per started 5 km; over
// 50 km +100원 per started 8 km. Single-use ticket +100원. Transfers
// inside the integrated system add no new base fare: one journey pays
// one distance fare over the summed ride km.
//
// Pinned vectors (the contract — see fare-15 tests): 9.9 km → 1,550원,
// 10.1 km → 1,650원, 50 km → 2,350원, 58.1 km → 2,450원. Note the last
// one: the over-50 portion counts whole 8 km blocks (floor), so 58.1 km
// pays one over-50 block. Follow the vectors, not the gloss.
//
// Distance per leg resolves (resolveLegKm) from the operator's
// interstation table when it covers the leg's gaps (official), else
// from the engine's OSM chainage or the straight line × 1.2 — both
// marked 추정. 신분당선 legs carry a segment surcharge from
// SHINBUNDANG_EXTRA; values stay null (status 확인 필요) until the
// orchestrator fills them from the operator's official page — never
// invented. While null, the trip shows SHINBUNDANG_PENDING_NOTE and its
// fare source stays 가정값.

import { gapMinutes, scheduleLineOf } from "../transit/schedule.js";
import { normalizeStation } from "../engine/journey.js";

export const FARE_BASE_WON = 1550;
export const FARE_SINGLE_USE_EXTRA_WON = 100;
export const FARE_RULE_LABEL = "국토교통부 수도권 전철 운임 조정 (2025-06-28 시행)";
export const FARE_SOURCE_ID = "molti-fare";
export const FARE_FALLBACK_SOURCE = "가정값";

export const SHINBUNDANG_PENDING_NOTE = "신분당선 별도운임 확인 중";

// 구간별 별도운임 (operator surcharge per segment). Null until filled
// from the operator's official page.
export const SHINBUNDANG_EXTRA = {
  status: "확인 필요",
  source: null,
  segments: {
    "신사–강남": null,
    "강남–정자": null,
    "정자–광교": null,
  },
};

export function distanceFare(km) {
  const d = Number(km);
  if (!(d > 10)) return FARE_BASE_WON;
  if (d <= 50) return FARE_BASE_WON + Math.ceil((d - 10) / 5) * 100;
  return FARE_BASE_WON + 800 + Math.floor((d - 50) / 8) * 100;
}

export function isShinbundangLeg(leg) {
  const name = String((leg && (leg.lineName || leg.line)) || "");
  return name.includes("신분당");
}

// Segments a leg may touch, by endpoint overlap with the segment's
// named ends (approximate until the operator table lands — the fare
// never includes invented numbers either way).
export function shinbundangSegments(leg) {
  const stops = (leg.stops || []).map((s) => normalizeStation(s));
  const hits = [];
  for (const seg of Object.keys(SHINBUNDANG_EXTRA.segments)) {
    const [a, b] = seg.split("–").map((s) => normalizeStation(s));
    if (stops.includes(a) || stops.includes(b)) hits.push(seg);
  }
  return hits;
}

function coordOf(stopCoords, id) {
  if (!stopCoords || id === undefined || id === null) return null;
  const hit = typeof stopCoords.get === "function" ? stopCoords.get(id) : stopCoords[id];
  if (!Array.isArray(hit) || !Number.isFinite(hit[0]) || !Number.isFinite(hit[1])) return null;
  return hit;
}

function haversineKm(lon1, lat1, lon2, lat2) {
  const r = Math.PI / 180;
  const s1 = Math.sin(((lat2 - lat1) * r) / 2);
  const s2 = Math.sin(((lon2 - lon1) * r) / 2);
  const a = s1 * s1 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * s2 * s2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Straight-line km between a leg's ends, or null without coordinates.
export function straightKm(leg, stopCoords) {
  if (Number.isFinite(leg.straight_km) && leg.straight_km >= 0) return leg.straight_km;
  const ids = leg.stopIds || [];
  if (ids.length >= 2 && stopCoords) {
    const a = coordOf(stopCoords, ids[0]);
    const b = coordOf(stopCoords, ids[ids.length - 1]);
    if (a && b) return haversineKm(a[0], a[1], b[0], b[1]);
  }
  return null;
}

// One leg's km: operator-table gaps (official) > engine OSM chainage
// (추정) > straight line × 1.2 (추정). Null when nothing is known — the
// caller then falls back to transit_fare_won (가정값).
export function resolveLegKm(leg, { schedule = null, stopCoords = null } = {}) {
  const lineNum = scheduleLineOf(leg.line, leg.lineName);
  if (schedule && lineNum && Array.isArray(leg.stops) && leg.stops.length >= 2) {
    let km = 0;
    let ok = true;
    for (let i = 0; i + 1 < leg.stops.length; i++) {
      const gap = gapMinutes(schedule, lineNum, leg.stops[i], leg.stops[i + 1]);
      if (!gap || !Number.isFinite(gap.km)) {
        ok = false;
        break;
      }
      km += gap.km;
    }
    if (ok) return { km: Math.round(km * 1000) / 1000, official: true };
  }
  if (Number.isFinite(leg.distanceKm) && leg.distanceKm > 0) {
    return { km: leg.distanceKm, official: false };
  }
  const straight = straightKm(leg, stopCoords);
  if (straight !== null) {
    return { km: Math.round(straight * 1.2 * 1000) / 1000, official: false };
  }
  return null;
}

// One journey's fare over resolved legs [{km, official, line,
// lineName, stops}]. Null legs / no legs / non-adult → null (the caller
// falls back to transit_fare_won, 가정값).
export function fareForTrip({ legs = [], card = "transit_card", age = "adult" } = {}) {
  if (age !== "adult") return null; // only the adult table is implemented
  if (!Array.isArray(legs) || legs.length === 0) return null;
  let km = 0;
  let estimated = false;
  for (const leg of legs) {
    const d = Number(leg.km ?? leg.distanceKm);
    if (!Number.isFinite(d) || d < 0) return null;
    km += d;
    if (leg.official !== true) estimated = true;
  }
  km = Math.round(km * 1000) / 1000;
  const singleUse = card === "single_use";
  const fare = distanceFare(km) + (singleUse ? FARE_SINGLE_USE_EXTRA_WON : 0);
  let shinbundang = null;
  const sbLegs = legs.filter(isShinbundangLeg);
  if (sbLegs.length > 0) {
    const segments = [...new Set(sbLegs.flatMap(shinbundangSegments))];
    const known = segments
      .map((s) => SHINBUNDANG_EXTRA.segments[s])
      .filter((v) => Number.isFinite(v));
    shinbundang = {
      status: SHINBUNDANG_EXTRA.status,
      segments,
      extra_won: known.length > 0 ? known.reduce((a, b) => a + b, 0) : null,
      note: SHINBUNDANG_PENDING_NOTE,
    };
  }
  const pendingExtra = shinbundang && shinbundang.extra_won === null;
  return {
    fare_won: fare,
    distance_km: km,
    distance: estimated ? "추정" : "공식",
    transfers: Math.max(0, legs.length - 1),
    single_use_added_won: singleUse ? FARE_SINGLE_USE_EXTRA_WON : 0,
    shinbundang,
    source: estimated || pendingExtra ? FARE_FALLBACK_SOURCE : FARE_SOURCE_ID,
    rule: FARE_RULE_LABEL,
  };
}
