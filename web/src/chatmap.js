// Chat stage map data + geometry (18, part 4 — pure, no DOM).
//
// Replaces the drifting slab board with a painted map answering "where
// are my candidates, and how far from work": beige ground, open water
// and parks where the data has them, region coverage boxes as thin
// lines with quiet labels, subway lines from the network doc each in
// its line colour with station dots, a workplace pin, numbered
// candidate pins matching the card order with price tags, and commute
// lines along the subway for picked homes.

import { findPath, normalizeStation } from "./engine/journey.js";

export const MAP_COLORS = {
  ground: "#cfc4ad",
  water: "#3f6f8f",
  park: "#8a9a5b",
  boundary: "#8f897f",
  regionLine: "#a89e8c",
  stationDot: "#57534a",
  workPin: "#b25a33",
  pinFill: "#1d1b18",
  pinHi: "#2f6fed",
  pickedRing: "#2f9e44",
};

// Official Seoul metropolitan subway colours, by network line id. The
// map reads line.color from the network doc first — this table only
// fills lines that carry none.
export const LINE_COLORS = {
  line2: "#00A84D",
  line3: "#EF7C1C",
  line5: "#996CAC",
  line7: "#747F00",
  line8: "#E6186C",
  line9: "#BDB092",
  bundang: "#F5A200",
  sinbundang: "#D4003B",
  gyeonggang: "#003DA5",
};
export const LINE_FALLBACK_COLOR = "#6b7280";

export function lineColorFor(line) {
  if (!line) return LINE_FALLBACK_COLOR;
  if (line.color) return line.color;
  return LINE_COLORS[line.id] || LINE_FALLBACK_COLOR;
}

const normName = (s) => String(s || "").replace(/\s+/g, "");

export function findStop(network, name) {
  const want = normalizeStation(name);
  if (!want) return null;
  for (const line of (network && network.lines) || []) {
    for (const s of line.stops || []) {
      if (!Number.isFinite(s.lon) || !Number.isFinite(s.lat)) continue;
      if (normalizeStation(s.name) === want || normName(s.name) === normName(name)) {
        return { line: line.id, name: s.name, lon: s.lon, lat: s.lat };
      }
    }
  }
  return null;
}

// Flattened degrees: x compensates longitude by latitude so the fit is
// honest away from the equator.
export function flatXY(lon, lat, lat0) {
  const k = Math.cos((lat0 * Math.PI) / 180) || 1;
  return [(lon || 0) * k, lat || 0];
}

// Fit lon/lat points into a W×H stage with at least `margin` (fraction)
// of each side clear. Returns {view:[x,y,w,h], toXY} where toXY maps
// lon/lat to stage px. Single points and empty input fall back to a
// default span around the centre so the panel still fills.
export const MAP_FIT_MARGIN = 0.08;
const MIN_SPAN_DEG = 0.02;

export function fitMapView(points, W, H, margin = MAP_FIT_MARGIN) {
  const w = Math.max(1, Number(W) || 1);
  const h = Math.max(1, Number(H) || 1);
  const m = Math.min(0.4, Math.max(0, Number(margin) || 0));
  const list = (points || []).filter((p) => Number.isFinite(p.lon) && Number.isFinite(p.lat));
  let lon0, lat0, lon1, lat1;
  if (list.length === 0) {
    lon0 = 127.0; lat0 = 37.4; lon1 = 127.16; lat1 = 37.55;
  } else {
    lon0 = Math.min(...list.map((p) => p.lon));
    lon1 = Math.max(...list.map((p) => p.lon));
    lat0 = Math.min(...list.map((p) => p.lat));
    lat1 = Math.max(...list.map((p) => p.lat));
  }
  const midLat = (lat0 + lat1) / 2;
  let [fx0] = flatXY(lon0, lat0, midLat);
  let [fx1] = flatXY(lon1, lat1, midLat);
  let fw = Math.max(fx1 - fx0, MIN_SPAN_DEG);
  let fh = Math.max(lat1 - lat0, MIN_SPAN_DEG);
  const cx = (fx0 + fx1) / 2;
  const cy = (lat0 + lat1) / 2;
  // Pad so the pins keep `margin` clear on every side (the padded
  // span is span/(1-2m), so edge pins sit exactly at m), then widen
  // the narrower axis to the stage aspect so the panel fills edge to
  // edge.
  fw /= Math.max(1 - 2 * m, 0.2);
  fh /= Math.max(1 - 2 * m, 0.2);
  const want = w / h;
  if (fw / fh < want) fw = fh * want;
  else fh = fw / want;
  const view = [cx - fw / 2, cy - fh / 2, fw, fh];
  const toXY = (lon, lat) => {
    const [fx] = flatXY(lon, lat, midLat);
    return [((fx - view[0]) / view[2]) * w, ((view[1] + view[3] - lat) / view[3]) * h];
  };
  return { view, toXY, midLat };
}

// Simplify + round one lon/lat ring (~18 m spacing, ~1 m precision).
const RING_STEP = 0.0002;
const r5 = (v) => Math.round(v * 1e5) / 1e5;

function simplifyRing(ring) {
  const out = [];
  let last = null;
  for (const pt of ring || []) {
    if (!Array.isArray(pt) || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) continue;
    if (last && Math.abs(pt[0] - last[0]) < RING_STEP
      && Math.abs(pt[1] - last[1]) < RING_STEP) continue;
    out.push([r5(pt[0]), r5(pt[1])]);
    last = pt;
  }
  return out;
}

function ringsOf(geometry) {
  const coords = geometry && geometry.coordinates;
  if (!Array.isArray(coords) || coords.length === 0) return [];
  const polys = Array.isArray(coords[0][0][0]) ? coords.flat() : coords;
  return polys.filter(Array.isArray);
}

const WATER_KINDS = new Set(["natural:water", "waterway:riverbank", "waterway:dock"]);
const PARK_KINDS = new Set(["leisure:park", "leisure:garden"]);

// Water + park rings out of one box area.json landuse list.
export function extractGreenRings(landuse) {
  const water = new Map();
  const parks = new Map();
  for (const item of landuse || []) {
    const target = WATER_KINDS.has(item && item.kind) ? water
      : PARK_KINDS.has(item && item.kind) ? parks : null;
    if (!target) continue;
    for (const ring of ringsOf(item.geometry)) {
      const simple = simplifyRing(ring);
      if (simple.length < 4) continue;
      target.set(JSON.stringify(simple), simple);
    }
  }
  return { water: [...water.values()], parks: [...parks.values()] };
}

function commuteMinutesOf(candidate) {
  const c = (candidate && candidate.commute) || {};
  const walk = (c.walk && c.walk.known ? c.walk.minutes : 0) || 0;
  const ride = (c.ride && c.ride.known ? c.ride.minutes : 0) || 0;
  const total = Math.round((walk + ride) * 10) / 10;
  return total > 0 ? total : null;
}

// The subway path a picked home rides to work, through the same router
// the engine prices. Legs carry their line colour; null when either end
// is unknown or unroutable (never invented).
export function commutePathFor(network, boardStation, workStation) {
  if (!network || !boardStation || !workStation) return null;
  let path;
  try {
    path = findPath(network, boardStation, workStation, 2.0);
  } catch {
    return null;
  }
  if (!path || !Array.isArray(path.legs) || path.legs.length === 0) return null;
  const coords = new Map();
  for (const line of network.lines || []) {
    for (const s of line.stops || []) coords.set(s.id, [s.lon, s.lat]);
  }
  const legs = [];
  for (const leg of path.legs) {
    const pts = (leg.stopIds || []).map((id) => coords.get(id)).filter(Boolean);
    if (pts.length < 2) continue;
    const line = (network.lines || []).find((l) => l.id === leg.line) || { id: leg.line };
    legs.push({ line: leg.line, color: lineColorFor(line), pts });
  }
  if (legs.length === 0) return null;
  return { legs, transfers: path.transfers || [] };
}

export function buildChatMap({ regions, network, tiles, green, candidates, picks, workplaceStation, tenure }) {
  const regionList = (regions && regions.regions) || regions || [];
  const regionBoxes = (Array.isArray(regionList) ? regionList : []).map((r) => ({
    id: r.id, label: r.label || r.id, bbox: r.bbox || null,
  })).filter((r) => Array.isArray(r.bbox));
  const lines = ((network && network.lines) || []).map((l) => ({
    id: l.id, name: l.name, color: lineColorFor(l),
    pts: (l.stops || []).filter((s) => Number.isFinite(s.lon) && Number.isFinite(s.lat))
      .map((s) => [s.lon, s.lat, s.name]),
  }));
  const stations = [];
  for (const l of (network && network.lines) || []) {
    for (const s of l.stops || []) {
      if (!Number.isFinite(s.lon) || !Number.isFinite(s.lat)) continue;
      stations.push({ line: l.id, name: s.name, lon: s.lon, lat: s.lat });
    }
  }
  const list = candidates || [];
  const picked = new Set(picks || []);
  const pins = list.map((c, i) => ({
    n: i + 1,
    id: c.id,
    lon: c.lon,
    lat: c.lat,
    picked: picked.has(c.id),
    commuteMin: commuteMinutesOf(c),
    candidate: c,
  })).filter((p) => Number.isFinite(p.lon) && Number.isFinite(p.lat));
  const workStop = findStop(network, workplaceStation);
  const workPin = workStop ? { ...workStop } : null;
  const commutes = [];
  for (const p of pins) {
    if (!p.picked) continue;
    const board = p.candidate && p.candidate.commute && p.candidate.commute.walk
      && p.candidate.commute.walk.known ? p.candidate.commute.walk.station : null;
    const path = commutePathFor(network, board, workplaceStation);
    if (!path) continue;
    commutes.push({ label: `후보 ${p.n}`, pinId: p.id, minutes: p.commuteMin, ...path });
  }
  const tileWater = [];
  const tileBounds = [];
  for (const t of tiles || []) {
    for (const b of t.boundaries || []) {
      if (Array.isArray(b.pts) && b.pts.length > 1) {
        tileBounds.push({ name: b.name || "", pts: b.pts });
      }
    }
    for (const wseg of t.water || []) {
      if (Array.isArray(wseg.pts) && wseg.pts.length > 1) {
        tileWater.push({ closed: !!wseg.closed, name: wseg.name || "", pts: wseg.pts });
      }
    }
  }
  return {
    regions: regionBoxes,
    lines,
    stations,
    pins,
    workPin,
    commutes,
    tileBounds,
    tileWater,
    green: { water: (green && green.water) || [], parks: (green && green.parks) || [] },
    tenure: tenure || null,
  };
}
