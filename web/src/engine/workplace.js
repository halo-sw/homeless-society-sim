// Workplace resolution for place-based commutes (pure).
//
// A station_ride member with work.place names where they work — lon/lat,
// a home-area POI name, or a station name on the region network — and the
// engine derives the commute per home (stage 9c): walk when the workplace
// sits in the home's built area within C-walk-commute-max, else a station
// ride plus a destination walk. Resolution never invents: each form has
// exactly one deterministic answer, or null.

import { normalizeStation } from "./journey.js";
import { poisByName } from "./places.js";

// Resolve a parsed work.place to {name, lon, lat, how}:
// lon/lat wins when present; else the first home-area POI with the name
// (stable id order); else the first region-network stop with the station
// name (line/stop file order). Null when nothing resolves.
export function resolveWorkplace(place, { places = null, network = null } = {}) {
  if (!place || typeof place !== "object") return null;
  if (Number.isFinite(place.lon) && Number.isFinite(place.lat)) {
    return { name: place.name, lon: place.lon, lat: place.lat, how: "coords" };
  }
  if (typeof place.poi === "string" && places) {
    const hits = poisByName(places, place.poi);
    if (hits.length > 0) {
      return { name: place.name, lon: hits[0].lon, lat: hits[0].lat, how: "poi", poiId: hits[0].id };
    }
  }
  if (typeof place.station === "string" && network) {
    const hit = stationCoords(network, place.station);
    if (hit) return { name: place.name, lon: hit.lon, lat: hit.lat, how: "station" };
  }
  return null;
}

// First network stop matching a station name (line/stop file order),
// or null. Shared by the engine and the CLIs (dest-area discovery).
export function stationCoords(network, name) {
  const want = normalizeStation(name);
  for (const line of (network && network.lines) || []) {
    for (const s of line.stops || []) {
      if (normalizeStation(s.name) === want && Number.isFinite(s.lon) && Number.isFinite(s.lat)) {
        return { lon: s.lon, lat: s.lat, stopId: s.id, line: line.id };
      }
    }
  }
  return null;
}

export function bboxContains(bbox, lon, lat) {
  return Array.isArray(bbox) && bbox.length >= 4
    && lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
}

function bboxArea(bbox) {
  return Math.max(0, bbox[2] - bbox[0]) * Math.max(0, bbox[3] - bbox[1]);
}

// Every workplace coordinate a parsed scenario pins down without the
// home graph: lon/lat forms directly, station forms via the network.
// POI forms resolve inside the home area at run time, so they never
// need a destination area.
export function scenarioWorkplaceCoords(scenario, network = null) {
  const out = [];
  const members = (scenario.household && scenario.household.members) || [];
  members.forEach((m, i) => {
    const place = m.work && m.work.place;
    if (!place) return;
    if (Number.isFinite(place.lon) && Number.isFinite(place.lat)) {
      out.push({ member: `h${i + 1}`, name: place.name, lon: place.lon, lat: place.lat });
    } else if (typeof place.station === "string" && network) {
      const hit = stationCoords(network, place.station);
      if (hit) out.push({ member: `h${i + 1}`, name: place.name, lon: hit.lon, lat: hit.lat });
    }
  });
  return out;
}

// The built area id holding (lon, lat) — smallest bbox wins when areas
// nest (songpa contains songpa-jamsil) — excluding `excludeAreaId`
// (the home area needs no destination load), or null.
export function destAreaIdFor(lon, lat, areasMeta, excludeAreaId = null) {
  let best = null;
  let bestArea = Infinity;
  for (const [id, meta] of Object.entries(areasMeta || {})) {
    if (id === excludeAreaId) continue;
    const bbox = meta && meta.bbox;
    if (!bboxContains(bbox, lon, lat)) continue;
    const area = bboxArea(bbox);
    if (area < bestArea || (area === bestArea && (best === null || id < best))) {
      best = id;
      bestArea = area;
    }
  }
  return best;
}
