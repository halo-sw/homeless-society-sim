// Journey view: pure ride state, train marker, camera phases, tile picking.
//
// When the followed member rides between areas, the scene rises to a
// regional view: the real line geometry is drawn (coloured per segment by
// the current slot's congestion), a train marker moves along it at the
// split pace, and corridor tiles lazy-load around the marker. Everything
// here is pure (no three.js, no DOM); main.js only renders it. Tested.

import { congestionBand } from "./engine/journey.js";

// Congestion band → line colour (legend: 여유 / 보통 / 혼잡 / 매우 혼잡).
export const BAND_COLORS = {
  calm: 0x4a9b6b, // 여유 (≤34 %: seated)
  normal: 0xd9a83c, // 보통 (35–99 %)
  crowded: 0xd96c3c, // 혼잡 (100–150 %)
  packed: 0xc0392b, // 매우 혼잡 (>150 %)
};

export const BAND_ORDER = ["calm", "normal", "crowded", "packed"];
export const BAND_LABEL = { calm: "여유", normal: "보통", crowded: "혼잡", packed: "매우 혼잡" };

// Where in the work away is the member? null when not in a station ride.
// Returns {rides, dir: "out"|"work"|"back", elapsed, ride, progress}.
export function rideStateFor(away, minute) {
  if (!away || away.kind !== "work") return null;
  const detail = away.detail || {};
  const total = detail.ride_minutes;
  if (!(total > 0)) return null;
  const m = Math.floor(minute);
  const outEnd = away.start_min + total;
  const backStart = away.end_min - total;
  if (m >= away.start_min && m < outEnd) {
    return { rides: detail.rides || null, fallback: detail.ride_fallback || null,
      dir: "out", elapsed: m - away.start_min, rideMinutes: total,
      progress: (m - away.start_min) / total };
  }
  if (m >= backStart && m < away.end_min) {
    return { rides: detail.rides || null, fallback: detail.ride_fallback || null,
      dir: "back", elapsed: m - backStart, rideMinutes: total,
      progress: (m - backStart) / total };
  }
  if (m >= outEnd && m < backStart) {
    return { rides: detail.rides || null, fallback: detail.ride_fallback || null,
      dir: "work", elapsed: 0, rideMinutes: total, progress: 0 };
  }
  return null;
}

// Which leg (or transfer gap) is the marker in after `elapsed` ride
// minutes? Returns {legIndex, legElapsed, legMinutes, inTransfer}.
export function legAt(ride, elapsed) {
  let t = 0;
  for (let i = 0; i < ride.legs.length; i++) {
    const leg = ride.legs[i];
    if (elapsed < t + leg.minutes) {
      return { legIndex: i, legElapsed: elapsed - t, legMinutes: leg.minutes,
        inTransfer: false, transferIndex: -1 };
    }
    t += leg.minutes;
    const gap = (ride.transfers[i] && ride.transfers[i].minutes) || 0;
    if (gap > 0 && elapsed < t + gap) {
      return { legIndex: i, legElapsed: leg.minutes, legMinutes: leg.minutes,
        inTransfer: true, transferIndex: i };
    }
    t += gap;
  }
  const last = ride.legs.length - 1;
  return { legIndex: last, legElapsed: ride.legs[last].minutes,
    legMinutes: ride.legs[last].minutes, inTransfer: false, transferIndex: -1 };
}

// Marker position along the travelled pattern geometry at the split pace.
// Returns {lon, lat, legIndex, inTransfer} or null (no geometry).
export function trainPosition(network, ride, elapsed) {
  const at = legAt(ride, elapsed);
  const leg = ride.legs[at.legIndex];
  const pattern = patternById(network, leg.patternId);
  const geom = pattern && pattern.geometry;
  if (!geom || geom.length < 2 || !pattern.chainage_km) return null;
  const ids = pattern.stops;
  const kms = pattern.chainage_km;
  const i0 = ids.indexOf(leg.stopIds[0]);
  const i1 = ids.indexOf(leg.stopIds[leg.stopIds.length - 1]);
  if (i0 < 0 || i1 < 0) return null;
  const frac = at.legMinutes > 0 ? Math.min(1, Math.max(0, at.legElapsed / at.legMinutes)) : 0;
  const targetKm = kms[i0] + (kms[i1] - kms[i0]) * frac;
  const [lon, lat] = pointAtChainage(geom, kms, targetKm);
  return { lon, lat, legIndex: at.legIndex, inTransfer: at.inTransfer,
    transferIndex: at.transferIndex };
}

export function patternById(network, id) {
  if (!network || !id) return null;
  for (const line of network.lines || []) {
    for (const p of line.patterns || []) {
      if (p.id === id) return p;
    }
  }
  return null;
}

// Interpolate the geometry at a chainage value (km along the pattern).
// Chainage increases monotonically along the pattern's stop order, which
// matches the geometry direction up to the mirrored case (handled by the
// pipeline: mirrored geometry is reversed to match).
export function pointAtChainage(geom, kms, targetKm) {
  const n = geom.length;
  const total = kms[kms.length - 1] - kms[0];
  // Geometry length fractions (haversine per vertex hop).
  const cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + haversineM(geom[i - 1], geom[i]));
  const span = cum[n - 1] || 1;
  const want = total > 0 ? ((targetKm - kms[0]) / total) * span : 0;
  let i = 1;
  while (i < n - 1 && cum[i] < want) i++;
  const seg = cum[i] - cum[i - 1] || 1;
  const k = Math.min(1, Math.max(0, (want - cum[i - 1]) / seg));
  return [geom[i - 1][0] + (geom[i][0] - geom[i - 1][0]) * k,
    geom[i - 1][1] + (geom[i][1] - geom[i - 1][1]) * k];
}

function haversineM(a, b) {
  const r = 6371000;
  const p1 = (a[1] * Math.PI) / 180;
  const p2 = (b[1] * Math.PI) / 180;
  const dp = ((b[1] - a[1]) * Math.PI) / 180;
  const dl = ((b[0] - a[0]) * Math.PI) / 180;
  const s = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(s));
}

// Camera phase for the journey state machine (pure). view: the user's
// override ("auto" | "low" = 거리 보기 | "high" = 전체 경로).
// riding: null | {progress 0..1} (out/back rides only, not work hours).
// hasDetailDest: the destination area's detailed scene is loaded.
export function journeyPhase({ riding, view = "auto", hasDetailDest = false }) {
  if (!riding) return "idle";
  if (view === "low") return "street";
  if (view === "high") return "cruise";
  const p = Math.min(1, Math.max(0, riding.progress));
  if (p < 0.15) return "rising";
  if (p > 0.85 && hasDetailDest) return "descending";
  return "cruise";
}

// Per-segment congestion colours for the travelled ride at its slot:
// one entry per inter-station hop (colour of the hop's origin station).
export function rideSegments(ride) {
  const segs = [];
  ride.legs.forEach((leg, li) => {
    for (let i = 0; i + 1 < leg.stops.length; i++) {
      // The leg's congestion reading comes from its boarding station;
      // hops inherit it (documented simplification, C-congestion).
      const band = congestionBand(leg.congestion.valuePct).key;
      segs.push({ legIndex: li, from: leg.stops[i], to: leg.stops[i + 1],
        band, color: BAND_COLORS[band],
        source: leg.congestion.source, valuePct: leg.congestion.valuePct });
    }
  });
  return segs;
}

// Tile picking for the corridor manifest: load tiles near the focus,
// dispose loaded tiles far behind. Distances in metres on the local
// equirectangular frame. Returns {load, unload} tile-id lists, loads
// nearest-first (the caller paces the fetches).
export function tilesFor({ manifest, focus, loaded = [], loadRadiusM = 2500, unloadRadiusM = 5000 }) {
  const lat0 = (focus && focus.lat) || 37.5;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 111320;
  const dist = (bounds) => {
    const cx = (bounds[0] + bounds[2]) / 2;
    const cy = (bounds[1] + bounds[3]) / 2;
    return Math.hypot((cx - focus.lon) * kx, (cy - focus.lat) * ky);
  };
  const near = [];
  for (const t of (manifest && manifest.tiles) || []) {
    near.push({ id: t.id, d: dist(t.bounds) });
  }
  near.sort((a, b) => a.d - b.d);
  const loadedSet = new Set(loaded);
  const load = near.filter((t) => t.d <= loadRadiusM && !loadedSet.has(t.id)).map((t) => t.id);
  const nearSet = new Set(near.filter((t) => t.d <= unloadRadiusM).map((t) => t.id));
  const unload = loaded.filter((id) => !nearSet.has(id));
  return { load, unload };
}

// Corridor manifest matching a ride (same endpoints), or null.
export function corridorFor(index, fromName, toName) {
  const norm = (s) => String(s || "").trim().replace(/역$/, "");
  for (const c of (index && index.corridors) || []) {
    if (norm(c.from) === norm(fromName) && norm(c.to) === norm(toName)) return c;
    if (norm(c.to) === norm(fromName) && norm(c.from) === norm(toName)) return c;
  }
  return null;
}

// Journey banner model (pure): what the overlay says at this instant.
export function journeyBanner({ ride, dir, elapsed, rideMinutes }) {
  if (!ride) return null;
  const at = legAt(ride, elapsed);
  const leg = ride.legs[at.legIndex];
  const left = Math.max(0, rideMinutes - Math.floor(elapsed));
  const where = at.inTransfer
    ? `${leg.to} 환승 중`
    : `${leg.lineName} ${leg.from}→${leg.to} 이동 중`;
  return { where, legIndex: at.legIndex, inTransfer: at.inTransfer,
    minutesLeft: left,
    legs: ride.legs.map((l) => ({ line: l.lineName, from: l.from, to: l.to,
      minutes: l.minutes, valuePct: l.congestion.valuePct,
      source: l.congestion.source,
      band: congestionBand(l.congestion.valuePct).key })) };
}
