// Built-area index for the app (12a, A3).
//
// The area list comes from the built data/build/areas-index.json (id,
// label, center, bbox, station, size) — never a hard-coded array. The
// scene loads only the selected box (load.js loadArea); the index is
// small (one row per built area) and carries the bboxes, so station
// containment needs no area.json fetch.

import { assetUrl } from "./paths.js";

export const AREAS_INDEX_URL = assetUrl("/data/areas-index.json");

// Last-resort fallback when the built index is absent (dev before any
// build): the four legacy areas. Labelled as fallback wherever shown.
export const FALLBACK_AREAS = [
  { id: "pangyo", label: "판교", center: null, bbox: null, station: null, size_bytes: null },
  { id: "seongsu", label: "성수", center: null, bbox: null, station: null, size_bytes: null },
  { id: "songpa", label: "송파구", center: null, bbox: null, station: null, size_bytes: null },
  { id: "songpa-jamsil", label: "잠실", center: null, bbox: null, station: null, size_bytes: null },
];

export async function loadAreasIndex(fetchJson) {
  const doc = await fetchJson(AREAS_INDEX_URL);
  const areas = doc && Array.isArray(doc.areas) ? doc.areas : [];
  if (areas.length === 0) throw new Error("areas-index is empty");
  return { areas, fallback: false };
}

export async function areasOrFallback(fetchJson) {
  try {
    return await loadAreasIndex(fetchJson);
  } catch {
    return { areas: FALLBACK_AREAS, fallback: true };
  }
}
