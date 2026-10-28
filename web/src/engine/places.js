// Places index for the life engine (pure).
//
// Every place the engine may send an agent is a real POI (or a named
// park polygon) anchored to the walk graph. Nothing is invented: when a
// needed category has no reachable place, the routine records
// `unavailable` and skips the activity.
//
// The `education` list (stage 9a) classifies the same anchored POIs into
// school/kindergarten/childcare/library/academy buckets for the access
// views; it changes no routing.

import { classifyEducation } from "../education.js";

export const STATION_CATS = new Set(["railway:station", "railway:subway_station", "public_transport:station"]);
export const SCHOOL_CAT = "amenity:school";
export const SHOP_CATS = { supermarket: "shop:supermarket", convenience: "shop:convenience" };
export const CLINIC_CATS = new Set(["amenity:clinic", "amenity:pharmacy", "amenity:doctors", "amenity:dentist"]);
export const PARK_CAT = "leisure:park";
export const EATERY_CATS = new Set(["amenity:restaurant", "amenity:cafe", "amenity:fast_food"]);
export const MAX_ANCHOR_M = 500; // same reach rule as the tour planner

function polygonCentroid(geometry) {
  let ring = null;
  if (geometry.type === "Polygon") ring = geometry.coordinates[0];
  else if (geometry.type === "MultiPolygon") {
    ring = geometry.coordinates.reduce((a, b) => (a[0].length >= b[0].length ? a : b))[0];
  }
  if (!ring || ring.length === 0) return null;
  let x = 0;
  let y = 0;
  for (const [lon, lat] of ring) {
    x += lon;
    y += lat;
  }
  return [x / ring.length, y / ring.length];
}

function anchor(router, lon, lat) {
  const n = router.nearestNode(lon, lat);
  if (n.id === null || n.distM > MAX_ANCHOR_M) return null;
  return n.id;
}

export function buildPlaces(area, router) {
  const stations = [];
  const shops = { supermarket: [], convenience: [] };
  const schools = [];
  const clinics = [];
  const parks = [];
  const eateries = [];
  const education = [];
  const byName = new Map(); // name -> [{place}]
  const pushName = (place) => {
    if (!byName.has(place.name)) byName.set(place.name, []);
    byName.get(place.name).push(place);
  };
  for (const poi of area.pois || []) {
    const [lon, lat] = poi.geometry.coordinates;
    const nodeId = anchor(router, lon, lat);
    if (nodeId === null) continue;
    const place = { id: poi.id, name: poi.name, category: poi.category, lon, lat, nodeId };
    pushName(place);
    if (STATION_CATS.has(poi.category)) stations.push(place);
    if (poi.category === SHOP_CATS.supermarket) shops.supermarket.push(place);
    if (poi.category === SHOP_CATS.convenience) shops.convenience.push(place);
    if (poi.category === SCHOOL_CAT) schools.push(place);
    if (CLINIC_CATS.has(poi.category)) clinics.push(place);
    if (poi.category === PARK_CAT) parks.push(place);
    if (EATERY_CATS.has(poi.category)) eateries.push(place);
    const edu = classifyEducation(place);
    if (edu) education.push({ place, bucket: edu.bucket, level: edu.level });
  }
  // Named park polygons without a POI node (same fallback as the tour).
  const parkNames = new Set(parks.map((p) => p.name));
  for (const feat of area.landuse || []) {
    if (feat.kind !== PARK_CAT || !feat.name || parkNames.has(feat.name)) continue;
    const c = polygonCentroid(feat.geometry);
    if (!c) continue;
    const nodeId = anchor(router, c[0], c[1]);
    if (nodeId === null) continue;
    const place = { id: `landuse:${feat.id}`, name: feat.name, category: PARK_CAT, lon: c[0], lat: c[1], nodeId };
    parks.push(place);
    pushName(place);
  }
  const sortPlaces = (list) => list.sort((a, b) => (a.id < b.id ? -1 : 1));
  return {
    stations: sortPlaces(stations),
    shops: { supermarket: sortPlaces(shops.supermarket), convenience: sortPlaces(shops.convenience) },
    schools: sortPlaces(schools),
    clinics: sortPlaces(clinics),
    parks: sortPlaces(parks),
    eateries: sortPlaces(eateries),
    education: education.sort((a, b) => (a.place.id < b.place.id ? -1 : 1)),
    byName,
  };
}

// Verbatim-name lookup within station categories (stable id order).
export function stationsByName(places, name) {
  return (places.byName.get(name) || [])
    .filter((p) => STATION_CATS.has(p.category))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

// Verbatim-name lookup across all POIs (stable id order).
export function poisByName(places, name) {
  return [...(places.byName.get(name) || [])].sort((a, b) => (a.id < b.id ? -1 : 1));
}

// k nearest reachable places by graph metres from nodeId (Dijkstra once
// from the source). Stable order: (lengthM, place id). Each hit carries
// the route for trip recording.
export function nearestReachable(router, nodeId, list, k) {
  const { dist } = router.distFrom(nodeId);
  const hits = [];
  for (const place of list) {
    const d = dist.get(place.nodeId);
    if (d === undefined) continue;
    hits.push({ place, lengthM: d });
  }
  hits.sort((a, b) => (a.lengthM - b.lengthM) || (a.place.id < b.place.id ? -1 : 1));
  return hits.slice(0, k).map((h) => ({ ...h, route: router.route(nodeId, h.place.nodeId) }));
}

// Round-trip variant: the walk graph is directed (one-ways), so an
// out-and-back needs the return leg too. Candidates run nearest-first
// and only the winners pay for a return Dijkstra; each hit carries the
// out route plus the back route. Places without a return are skipped.
export function nearestRoundTrip(router, nodeId, list, k) {
  const { dist } = router.distFrom(nodeId);
  const cands = [];
  for (const place of list) {
    const d = dist.get(place.nodeId);
    if (d === undefined) continue;
    cands.push({ place, lengthM: d });
  }
  cands.sort((a, b) => (a.lengthM - b.lengthM) || (a.place.id < b.place.id ? -1 : 1));
  const out = [];
  for (const c of cands) {
    if (out.length >= k) break;
    const back = router.route(c.place.nodeId, nodeId);
    if (back === null) continue;
    out.push({ place: c.place, lengthM: c.lengthM,
      route: router.route(nodeId, c.place.nodeId), back });
  }
  return out;
}
