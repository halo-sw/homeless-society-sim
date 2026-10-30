// Stage 20b: building / complex / place labels for the 3D view (pure, no DOM).
//
// labelItemsFor(area, opts) builds the label items for one frame from the
// already-loaded `area` doc (complexes, buildings, pois). placeLabels picks
// the screen-space winners with a greedy priority pass. buildingCard builds
// the hover-card data for one building. main.js projects anchors with the
// same helper the station labels use and renders into the #tags layer.

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

// Items: { id, level, title, sub, glyph, accent, lon, lat }.
// Order: home pill first, then destination, then complexes / POIs / dongs.
export function labelItemsFor(area, opts = {}) {
  const { homeBuildingId = null, destination = null, cameraDistM = 600 } = opts;
  const items = [];
  const buildings = area?.buildings || [];
  const byId = new Map(buildings.map((b) => [b.id, b]));

  if (homeBuildingId !== null && homeBuildingId !== undefined) {
    const b = byId.get(homeBuildingId);
    const complex = complexOfBuilding(area, homeBuildingId);
    const name = (b && buildingNameOf(b, complex)) || String(homeBuildingId);
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
      title: `${destLabel} · 가는 곳`,
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
export function placeLabels(items, viewW, viewH) {
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
    const x = item.x ?? 0;
    const y = item.y ?? 0;
    if (x + w < 0 || y + h < 0 || x > viewW || y > viewH) continue;
    const box = { left: x, top: y, right: x + w, bottom: y + h };
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
    placed.push(item);
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
