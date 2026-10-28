// Highlight state selector (pure, no three.js, no DOM).
//
// One function decides what the 3D scene emphasises at (day, minute):
// the followed resident, their current route and destination, the home
// and destination buildings, ride-away stubs, hovered convenience POIs,
// the decision pulse, and the time-slider ticks. main.js only renders
// what this returns. Tested with the engine fixture.

function currentTrip(indexed, agentKey, day, minute) {
  for (const t of indexed.tripsByAgent.get(agentKey) || []) {
    if (t.day === day && minute >= t.depart_min && minute < t.arrive_min) {
      // Remote trips walk another area's graph (reused node ids) — the
      // home map highlights nothing for them; the journey view owns that
      // period instead.
      if (t.remote) return null;
      return t;
    }
  }
  return null;
}

function currentAway(indexed, agentKey, day, minute) {
  for (const a of indexed.awaysByAgent.get(agentKey) || []) {
    if (a.day === day && minute >= a.start_min && minute < a.end_min) return a;
  }
  return null;
}

function lastArrivedNode(indexed, agentKey, day, minute) {
  let node = null;
  for (const t of indexed.tripsByAgent.get(agentKey) || []) {
    if (t.day === day && t.arrive_min <= minute && !t.remote) node = t.path[t.path.length - 1];
  }
  return node;
}

// Ray-cast point-in-ring on [lon, lat] pairs (outer ring only).
export function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function outerRings(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates[0]];
  if (geometry.type === "MultiPolygon") return geometry.coordinates.map((p) => p[0]);
  return [];
}

function centroidOf(ring) {
  let x = 0;
  let y = 0;
  for (const [lon, lat] of ring) {
    x += lon;
    y += lat;
  }
  return [x / ring.length, y / ring.length];
}

// The building a POI sits in (containment), else the nearest centroid
// within ~60 m, else null (the scene falls back to a ground ring).
export function buildingForPoi(buildings, lon, lat) {
  let best = null;
  let bestD2 = Infinity;
  const kx = 111320 * Math.cos((lat * Math.PI) / 180);
  for (const b of buildings || []) {
    const rings = outerRings(b.geometry);
    if (rings.length === 0) continue;
    for (const ring of rings) {
      if (pointInRing(lon, lat, ring)) return b.id;
    }
    const [cx, cy] = centroidOf(rings[0]);
    const dx = (cx - lon) * kx;
    const dy = (cy - lat) * 111320;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = b.id;
    }
  }
  return bestD2 <= 60 * 60 ? best : null;
}

function poiLonLat(area, poiId) {
  const p = (area.pois || []).find((x) => x.id === poiId);
  const c = p && p.geometry && p.geometry.coordinates;
  return Array.isArray(c) ? c : null;
}

// Full highlight state. follow: 0 = free camera, else 1-based household
// index. qualityHover: {category} | null. moneyDoc: <scenario>-money.json
// payload (for the hovered convenience POI ids) or null. area:
// {pois, buildings} or null (destination-building lookup).
export function highlightFor({ run, indexed, follow, day, minute, qualityHover = null, moneyDoc = null, area = null, homeLabel = null }) {
  const household = (run.agents || []).filter((a) => a.household);
  const followed = follow >= 1 && follow <= household.length ? household[follow - 1] : null;
  const key = followed ? followed.key : null;
  const m = Math.floor(minute);
  const out = {
    followedKey: key,
    dimOthers: key !== null,
    trip: null,
    destLabel: null,
    destNodeId: null,
    homeBuildingId: (run.meta && run.meta.home_building) || null,
    destBuildingId: null,
    rideAway: null,
    qualityPoiIds: [],
    pulseDecisionId: null,
    ticks: [],
  };
  if (qualityHover && qualityHover.category && moneyDoc && homeLabel
      && moneyDoc.homes && moneyDoc.homes[homeLabel]
      && moneyDoc.homes[homeLabel].qol_convenience
      && moneyDoc.homes[homeLabel].qol_convenience.poi_ids) {
    out.qualityPoiIds = [
      ...(moneyDoc.homes[homeLabel].qol_convenience.poi_ids[qualityHover.category] || []),
    ];
  }
  if (!key) return out;

  const trip = currentTrip(indexed, key, day, m);
  if (trip) {
    const dur = Math.max(1, trip.arrive_min - trip.depart_min);
    out.trip = { id: trip.id,
      frac: Math.min(1, Math.max(0, (m - trip.depart_min) / dur)) };
    out.destLabel = (trip.to && (trip.to.label || trip.to.id)) || null;
    out.destNodeId = trip.path[trip.path.length - 1];
    if (area && trip.to && trip.to.kind === "poi") {
      const c = poiLonLat(area, trip.to.id);
      if (c) out.destBuildingId = buildingForPoi(area.buildings, c[0], c[1]);
    }
  } else {
    const away = currentAway(indexed, key, day, m);
    if (away && (away.kind === "work" || away.kind === "ride") && away.detail && away.detail.ride_minutes) {
      out.rideAway = { stationNodeId: lastArrivedNode(indexed, key, day, m),
        rideMinutes: away.detail.ride_minutes };
      out.destLabel = away.label;
    } else if (away) {
      out.destLabel = away.label;
      out.destNodeId = lastArrivedNode(indexed, key, day, m);
    }
  }

  for (const d of run.decisions || []) {
    if (d.agent !== key || d.day !== day) continue;
    out.ticks.push({ minute: d.minute, kind: "decision", id: d.id });
    if (d.minute === m && !out.pulseDecisionId) out.pulseDecisionId = d.id;
  }
  for (const t of indexed.tripsByAgent.get(key) || []) {
    if (t.day !== day) continue;
    out.ticks.push({ minute: t.depart_min, kind: "depart", id: t.id });
  }
  out.ticks.sort((a, b) => a.minute - b.minute);
  return out;
}
