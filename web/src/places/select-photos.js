// Photo selection for candidate cards (13, Part 5). Order per home:
//  1. complex photos from commons-named.json (home:<id>, or the same
//     complex name in the same region) — "단지 사진 · 위키미디어 공용"
//  2. nearest-station photos (station:<name>) — "가까운 역 사진 · <역명>"
//  3. geotagged street/park photos within 700 m — "주변 사진 · …"
//  4. our own 3D thumbnail or a small map — never an unrelated photo.
//
// Every candidate passes the photo-filter; each photo is used at most
// once per candidate list. Pure; tested in photos-13.test.js.

import { photosNear, PHOTOS_DISCLAIMER } from "./photos.js";
import { isIrrelevantPhoto } from "./photo-filter.js";

export const COMPLEX_LABEL = "단지 사진 · 위키미디어 공용";
export const STATION_LABEL_PREFIX = "가까운 역 사진";
export const STREET_LABEL = PHOTOS_DISCLAIMER;
export const FALLBACK_3D_LABEL = "우리 3D 미리보기";
export const FALLBACK_MAP_LABEL = "위치 지도";

function normName(s) {
  return String(s || "").replace(/\s+/g, "").replace(/[·・\-()[\]]/g, "");
}

function namedItems(named) {
  return (named && named.items) || [];
}

export function complexPhotosFor(home, named, limit = 6) {
  const out = [];
  const homeId = home && home.id;
  const wantName = normName(home && (home.osm_name || home.name));
  const wantRegion = home && home.region;
  for (const item of namedItems(named)) {
    if (item.kind !== "complex") continue;
    if (!item.thumb_url || !item.page_url) continue;
    const target = String(item.target || "");
    const byId = homeId && target === `home:${homeId}`;
    const byName = !byId && wantName
      && normName(item.complex_name || item.title) === wantName
      && (!item.region || !wantRegion || item.region === wantRegion);
    if (!byId && !byName) continue;
    if (isIrrelevantPhoto(item, "complex")) continue;
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

export function stationPhotosFor(stationName, named, limit = 6) {
  if (!stationName) return [];
  const want = normName(stationName).replace(/역$/, "");
  const out = [];
  for (const item of namedItems(named)) {
    if (item.kind !== "station") continue;
    if (!item.thumb_url || !item.page_url) continue;
    const target = String(item.target || "");
    const name = target.startsWith("station:")
      ? normName(target.slice("station:".length)).replace(/역$/, "")
      : normName(item.station || "");
    if (name !== want) continue;
    if (isIrrelevantPhoto(item, "station")) continue;
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

function photoKey(p) {
  return p.page_url || p.thumb_url || p.title;
}

function toSlot(item, label, slot) {
  return {
    title: item.title || "",
    thumb_url: item.thumb_url || "",
    page_url: item.page_url || "",
    author: item.author || "",
    licence: item.license || item.licence || "",
    credit: `사진: ${item.author || "작자 미상"}, ${item.license || item.licence || "저작권 정보 없음"}, Wikimedia Commons`,
    label,
    slot,
    distance_m: item.distance_m ?? null,
  };
}

// Fill one home's slots (up to limit). usedKeys is shared across the
// list so two cards never show the same photo.
export function selectPhotosForHome(home, deps = {}, usedKeys = new Set()) {
  const limit = deps.limit ?? 5;
  const stationName = home && home.station && home.station.station;
  const slots = [];
  const take = (items, label, slot) => {
    for (const item of items) {
      if (slots.length >= limit) break;
      const key = photoKey(item);
      if (!key || usedKeys.has(key)) continue;
      usedKeys.add(key);
      slots.push(toSlot(item, label, slot));
    }
  };
  take(complexPhotosFor(home, deps.named, limit), COMPLEX_LABEL, "complex");
  if (slots.length < limit) {
    const label = stationName
      ? `${STATION_LABEL_PREFIX} · ${stationName}` : STATION_LABEL_PREFIX;
    take(stationPhotosFor(stationName, deps.named, limit), label, "station");
  }
  if (slots.length < limit && deps.manifest && Number.isFinite(home.lon)
      && Number.isFinite(home.lat)) {
    const near = photosNear(home.lon, home.lat, deps.manifest, { limit: 12 })
      .filter((p) => !isIrrelevantPhoto(p, "street"));
    take(near, STREET_LABEL, "street");
  }
  // Slot 4 is the caller's fallback (3D thumbnail or map): we report
  // which one the card should render, never a foreign photo.
  let fallback = null;
  if (slots.length === 0) {
    fallback = home && home.scene ? "thumbnail-3d" : "map";
  }
  return { slots, fallback };
}

export function fallbackLabelFor(fallback) {
  if (fallback === "thumbnail-3d") return FALLBACK_3D_LABEL;
  if (fallback === "map") return FALLBACK_MAP_LABEL;
  return null;
}

// Run selectPhotosForHome over a candidate list with one shared
// used-set. Returns [{candidate, photos}].
export function selectPhotosForList(candidates, deps = {}) {
  const used = new Set();
  return (candidates || []).map((c) => ({
    candidate: c,
    photos: selectPhotosForHome(c, deps, used),
  }));
}
