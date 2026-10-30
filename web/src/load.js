// Area loading with $ref part resolution (no three.js, no DOM).
//
// loadArea(areaId, fetchJson) fetches data/build/<id>/area.json through
// the injected fetchJson (browser: fetch().then(r => r.json()); tests:
// fs reads) and inlines every {"$ref": file} section.

import { assetUrl } from "./paths.js";

export async function loadArea(areaId, fetchJson) {
  const base = assetUrl(`/data/${areaId}`);
  const area = await fetchJson(`${base}/area.json`);
  for (const [key, value] of Object.entries(area)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const keys = Object.keys(value);
      if (keys.length === 1 && keys[0] === "$ref") {
        area[key] = await fetchJson(`${base}/${value.$ref}`);
      }
    }
  }
  return area;
}

export function originOf(area) {
  return area.crs.local.origin; // {lon, lat}
}
