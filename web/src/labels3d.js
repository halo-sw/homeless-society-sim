// Stage 20b: building / complex / place labels for the 3D view (pure, no DOM).
//
// labelItemsFor(area, opts) builds the label items for one frame from the
// already-loaded `area` doc (complexes, buildings, pois). placeLabels picks
// the screen-space winners with a greedy priority pass. buildingCard builds
// the hover-card data for one building. main.js projects anchors with the
// same helper the station labels use and renders into the #tags layer.

import { displayNameFor } from "./homes.js";

export const OVERVIEW_MIN_M = 400;
export const DONG_MAX_M = 250;
export const MAX_LABELS = 40;

const RANK = { always: 0, complex: 1, poi: 2, dong: 3 };

// Daily-life POI groups shown in the close view. Restaurants / bars / pubs
// are only added when fewer than 8 daily-life labels show.
const DAILY_GROUPS = new Set([
  "convenience",
  "mart",
  "pharmacy",
  "medical",
  "school",
  "park",
  "cafe",
  "bank",
]);

const FILLER_GROUPS = new Set(["restaurant", "bar", "pub"]);

export function poiGroupFor(category) {
  const c = String(category || "").toLowerCase();
  if (c.includes("convenience")) return "convenience";
  if (c.includes("supermarket") || c.includes("super") || c.includes("mart") || c.includes("grocery")) return "mart";
  if (c.includes("pharmacy") || c.includes("drug")) return "pharmacy";
  if (c.includes("hospital") || c.includes("clinic") || c.includes("dentist") || c.includes("doctor")) return "medical";
  if (c.includes("school") || c.includes("kindergarten") || c.includes("university") || c.includes("college")) return "school";
  if (c.includes("park") || c.includes("playground") || c.includes("garden")) return "park";
  if (c.includes("cafe") || c.includes("coffee")) return "cafe";
  if (c.includes("bank") || c.includes("atm")) return "bank";
  if (c.includes("restaurant")) return "restaurant";
  if (c.includes("bar") && !c.includes("barber")) return "bar";
  if (c.includes("pub")) return "pub";
  return "";
}

export function poiGlyphFor(category) {
  const g = poiGroupFor(category);
  if (g === "convenience") return "편";
  if (g === "mart") return "마";
  if (g === "pharmacy") return "약";
  if (g === "medical") return "병";
  if (g === "school") return "학";
  if (g === "park") return "공";
  if (g === "cafe") return "카";
  if (g === "bank") return "은";
  if (g === "restaurant") return "식";
  if (g === "bar" || g === "pub") return "주";
  return "•";
}

const KIND_KO = {
  apartments: "공동주택",
  apartment: "공동주택",
  residential: "주거용 건물",
  house: "주택",
  detached: "단독주택",
  school: "학교",
  commercial: "상업용 건물",
  retail: "상업용 건물",
  office: "업무용 건물",
  hospital: "병원",
  civic: "공공 건물",
};

export function kindKoFor(building) {
  if (!building) return "건물";
  const raw = building.kind || building.building || building.use || "";
  const key = String(raw).toLowerCase();
  if (KIND_KO[key]) return KIND_KO[key];
  if (raw && /[\u3131-\u318e\uac00-\ud7a3]/.test(String(raw))) return String(raw);
  return "건물";
}

function ringCentroid(ring) {
  let x = 0;
  let y = 0;
  let n = 0;
  for (const p of ring || []) {
    if (!Array.isArray(p) || p.length < 2) continue;
    x += p[0];
    y += p[1];
    n++;
  }
  return n > 0 ? [x / n, y / n] : null;
}

function geometryCentroid(geometry) {
  if (!geometry) return null;
  if (geometry.type === "Point" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.slice(0, 2);
  }
  const polys =
    geometry.type === "Polygon"
      ? [geometry.coordinates]
      : geometry.type === "MultiPolygon"
        ? geometry.coordinates
        : [];
  for (const poly of polys) {
    const c = ringCentroid(poly && poly[0]);
    if (c) return c;
  }
  return null;
}

export function anchorOf(entry) {
  if (!entry) return null;
  if (Array.isArray(entry.centroid) && entry.centroid.length >= 2) {
    return [entry.centroid[0], entry.centroid[1]];
  }
  if (Array.isArray(entry.lonlat) && entry.lonlat.length >= 2) {
    return [entry.lonlat[0], entry.lonlat[1]];
  }
  if (Number.isFinite(entry.lon) && Number.isFinite(entry.lat)) {
    return [entry.lon, entry.lat];
  }
  return geometryCentroid(entry.geometry);
}

function complexOfBuilding(area, buildingId) {
  for (const c of area?.complexes || []) {
    if ((c.building_ids || []).includes(buildingId)) return c;
  }
  return null;
}

function buildingNameOf(building, complex) {
  const reg = building?.register;
  if (reg && reg.name) {
    return reg.sub_name ? `${reg.name} ${reg.sub_name}` : String(reg.name);
  }
  if (building?.name) return String(building.name);
  if (complex?.name) return String(complex.name);
  return "";
}

function clean(parts) {
  return parts.filter((p) => p !== undefined && p !== null && String(p).trim() !== "");
}

// 26i: US complexes can carry an OSM id as their name (e.g.
// "w112348084"). Then the pill shows the run's home name instead
// ("10 Coleman Place"); Korean names are never replaced.
// 30g: when the label's raw name is a candidate's bare lot number,
// the candidate's readable name (동 / station 근처 + kind) shows
// instead — via the optional candidate (displayNameFor passes real
// names through, so they never change).
const OSM_ID_RE = /^[wnr]\d+$/;

export function homeDisplayName(name, runHomeName, candidate = null) {
  const n = name === undefined || name === null ? "" : String(name);
  if (runHomeName && OSM_ID_RE.test(n.trim())) return String(runHomeName);
  if (candidate && candidate.name !== undefined
    && String(candidate.name).trim() === n.trim()) {
    return displayNameFor(candidate);
  }
  return n;
}

// Items: { id, level, title, sub, glyph, accent, lon, lat }.
// Order: home pill first, then destination, then complexes / POIs / dongs.
export function labelItemsFor(area, opts = {}) {
  const { homeBuildingId = null, destination = null, destinationSuffix = "",
    cameraDistM = 600, homeName = null, homeCandidate = null } = opts;
  const items = [];
  const buildings = area?.buildings || [];
  const byId = new Map(buildings.map((b) => [b.id, b]));

  if (homeBuildingId !== null && homeBuildingId !== undefined) {
    const b = byId.get(homeBuildingId);
    const complex = complexOfBuilding(area, homeBuildingId);
    const raw = (b && buildingNameOf(b, complex)) || String(homeBuildingId);
    const name = homeDisplayName(raw, homeName, homeCandidate) || raw;
    const anchor = (b && anchorOf(b)) || (complex && anchorOf(complex)) || null;
    items.push({
      id: `home:${String(homeBuildingId)}`,
      level: "always",
      title: `우리 집 · ${name}`,
      sub: "",
      accent: true,
      lon: anchor ? anchor[0] : null,
      lat: anchor ? anchor[1] : null,
    });
  }

  const destLabel =
    typeof destination === "string"
      ? destination
      : destination?.label || destination?.to?.label || "";
  const destLonLat =
    (destination && (anchorOf(destination) || anchorOf(destination?.to))) || null;
  if (destLabel) {
    items.push({
      id: `dest:${destLabel}`,
      level: "always",
      title: destinationSuffix ? `${destLabel} · ${destinationSuffix}` : `${destLabel} · 가는 곳`,
      sub: "",
      glyph: "",
      lon: destLonLat ? destLonLat[0] : null,
      lat: destLonLat ? destLonLat[1] : null,
    });
  }

  if (cameraDistM > OVERVIEW_MIN_M) {
    for (const c of area?.complexes || []) {
      if (!c.name) continue;
      const anchor = anchorOf(c);
      if (!anchor) continue;
      const sub = clean([
        c.households ? `${c.households}세대` : "",
        c.max_floors ? `최고 ${c.max_floors}층` : "",
      ]).join(" · ");
      items.push({
        id: `complex:${c.id || c.name}`,
        level: "complex",
        title: String(c.name),
        sub,
        lon: anchor[0],
        lat: anchor[1],
      });
    }
    return items;
  }

  // Close view: daily-life POIs, plus restaurants/bars/pubs only to fill up.
  const daily = [];
  const filler = [];
  for (const p of area?.pois || []) {
    const group = poiGroupFor(p.category);
    if (!group || !p.name) continue;
    const anchor = anchorOf(p);
    if (!anchor) continue;
    const item = {
      id: `poi:${p.id || `${p.category}:${p.name}`}`,
      level: "poi",
      title: String(p.name),
      sub: "",
      glyph: poiGlyphFor(p.category),
      lon: anchor[0],
      lat: anchor[1],
    };
    if (DAILY_GROUPS.has(group)) daily.push(item);
    else if (FILLER_GROUPS.has(group)) filler.push(item);
  }
  const pois = daily.length >= 8 ? daily : [...daily, ...filler];
  items.push(...pois);

  if (cameraDistM <= DONG_MAX_M) {
    for (const b of buildings) {
      const subName = b?.register?.sub_name || b?.sub_name || "";
      if (!subName) continue;
      const anchor = anchorOf(b);
      if (!anchor) continue;
      items.push({
        id: `dong:${b.id}`,
        level: "dong",
        title: String(subName),
        sub: "",
        lon: anchor[0],
        lat: anchor[1],
      });
    }
  }
  return items;
}

// Greedy screen-space collision: priority always > complex > poi > dong,
// skip boxes intersecting an already placed one, at most 40 per frame.
// Items carry screen px boxes { x, y, w, h }; items without a box get a
// text-length estimate so labelItemsFor output can flow straight through.
export function placeLabels(items, viewW, viewH, reserved = []) {
  const zones = (reserved || []).map((r) => ({
    left: r.left ?? r.x ?? 0,
    top: r.top ?? r.y ?? 0,
    right: r.right ?? (r.left ?? r.x ?? 0) + (r.width ?? r.w ?? 0),
    bottom: r.bottom ?? (r.top ?? r.y ?? 0) + (r.height ?? r.h ?? 0),
  }));
  const hitsZone = (box) => zones.some((z) =>
    box.left < z.right && box.right > z.left
    && box.top < z.bottom && box.bottom > z.top);
  const ranked = (items || [])
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const r = (RANK[a.item.level] ?? 99) - (RANK[b.item.level] ?? 99);
      return r !== 0 ? r : a.index - b.index;
    });
  const placed = [];
  const boxes = [];
  for (const { item } of ranked) {
    if (placed.length >= MAX_LABELS) break;
    const w = item.w ?? estimateW(item);
    const h = item.h ?? (item.sub ? 30 : 22);
    let x = item.x ?? 0;
    let y = item.y ?? 0;
    if (x + w < 0 || y + h < 0 || x > viewW || y > viewH) continue;
    const always = item.level === "always";
    let box = { left: x, top: y, right: x + w, bottom: y + h };
    if (hitsZone(box)) {
      if (!always) continue;
      const zone = zones.find((z) =>
        box.left < z.right && box.right > z.left
        && box.top < z.bottom && box.bottom > z.top);
      const below = zone.bottom + 4;
      const above = zone.top - h - 4;
      if (below + h <= viewH) {
        y = below;
      } else if (above >= 0) {
        y = above;
      } else {
        continue;
      }
      box = { left: x, top: y, right: x + w, bottom: y + h };
      if (hitsZone(box)) continue;
    }
    let hit = false;
    for (const other of boxes) {
      if (
        box.left < other.right &&
        box.right > other.left &&
        box.top < other.bottom &&
        box.bottom > other.top
      ) {
        hit = true;
        break;
      }
    }
    if (hit) continue;
    placed.push(always && (box.top !== (item.y ?? 0)) ? { ...item, x, y } : item);
    boxes.push(box);
  }
  return placed;
}

function estimateW(item) {
  const title = String(item.title || "");
  const glyph = item.glyph ? 20 : 0;
  return [...title].length * 13 + 24 + glyph;
}

// Hover card for one building. Never emits "undefined" / "null": missing
// fields are left out, and buildings without a register fall back to the
// OSM kind line.
export function buildingCard(building) {
  const b = building || {};
  const reg = b.register;
  if (reg && (reg.name || reg.sub_name || reg.use)) {
    const title = clean(
      reg.name && reg.sub_name
        ? [`${reg.name} ${reg.sub_name}`]
        : [reg.name || reg.sub_name],
    ).join("");
    let year = "";
    const m = String(reg.approval_date || "").match(/^(\d{4})/);
    if (m) year = m[1];
    const meta = clean([
      reg.use || "",
      Number.isFinite(reg.floors_above) ? `${reg.floors_above}층` : "",
      year ? `${year}년 사용승인` : "",
    ]).join(" · ");
    return {
      title: title || b.name || kindKoFor(b),
      meta,
      source: "건축물대장 (국토교통부)",
    };
  }
  const kindKo = kindKoFor(b);
  const title = b.name ? String(b.name) : kindKo;
  return {
    title,
    meta: `${kindKo} · 층수 미확인 · 출처 OpenStreetMap`,
    source: "OpenStreetMap",
  };
}

// Stage 20f: destination pill wording (pure, no DOM).
//
// The walk leg of a commute ends at the station ("잠실", not "잠실역"),
// so the pill is decided by the trip — not by the name: a commute walk
// followed by a ride reads "{label}역 · 지하철 타는 곳". The 역 is never
// doubled ("강남역" stays "강남역").
const TRIP_VERB_20F = { commute: "출근", school: "등교",
  errand: "장보기", clinic: "병원", park: "산책" };

export function stationNameFor(base) {
  const b = String(base || "");
  return /역$/.test(b) ? b : `${b}역`;
}

function tripToOf(trip) {
  return (trip && trip.to) || {};
}

// A commute walk is station-bound when the trip's destination is a
// station node, when the destination name already ends in 역, or when a
// ride away for the same agent and day starts within 30 min of arrival.
// aways is the run's away list (filtered inside by agent and day).
export function isStationBoundCommute(trip, aways) {
  if (!trip || trip.purpose !== "commute") return false;
  const to = tripToOf(trip);
  const toLabel = to.label || to.id || "";
  if (/역$/.test(toLabel)) return true;
  if (to.kind === "station") return true;
  if (/station|railway/i.test(String(to.category || ""))) return true;
  if (Number.isFinite(trip.arrive_min) && Array.isArray(aways)) {
    for (const a of aways) {
      if (!a || a.agent !== trip.agent || a.day !== trip.day) continue;
      if (!Number.isFinite(a.start_min)) continue;
      const dt = a.start_min - trip.arrive_min;
      if (dt >= 0 && dt <= 30) return true;
    }
  }
  return false;
}

// "{to} · {출근|장보기|병원|산책} 가는 곳" — the station-bound commute
// walk reads "지하철 타는 곳" instead.
export function destPillText(destLabel, trip, aways) {
  const base = destLabel || "";
  if (!base) return "";
  if (isStationBoundCommute(trip, aways)) {
    return `${stationNameFor(base)} · 지하철 타는 곳`;
  }
  const verb = trip ? TRIP_VERB_20F[trip.purpose] : "";
  return verb ? `${base} · ${verb} 가는 곳` : `${base} · 가는 곳`;
}

export function destSuffixFor(trip, aways) {
  if (!trip) return "";
  if (isStationBoundCommute(trip, aways)) return "지하철 타는 곳";
  if (trip.purpose === "commute") return "출근 가는 곳";
  const verb = TRIP_VERB_20F[trip.purpose];
  return verb ? `${verb} 가는 곳` : "";
}
