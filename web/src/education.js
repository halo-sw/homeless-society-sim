// Education access from OSM: counts, graph minutes, school routes (pure).
//
// Everything here is *access* (where facilities are, how long the walk
// is) — never quality. School quality, test scores and 학군 rankings are
// out of scope by AGENTS.md and stay unrepresentable: this module has no
// score, rank or verdict field anywhere.
//
// Sources: the built area's POIs (OSM, name-tagged) + the walk graph.
// Completeness is honest: OSM coverage of academies (학원) is partial,
// so every academy reading carries the note below.

import { ADULT_MPS } from "./engine/agents.js";

export const EDU_SPEED_MPS = ADULT_MPS;
export const EDU_MINUTES_BANDS = [10, 15];
export const EDU_SOURCE = "OSM";
export const EDU_ACADEMY_NOTE = "OSM 기준, 실제보다 적을 수 있음";
export const EDU_NO_QUALITY_NOTE = "학교의 질·성적·학군 순위는 다루지 않습니다.";

// POI categories that count as academies (학습 학원). office:* is accepted
// so a future rebuild picks office-tagged academies up; the current four
// extracts carry no named office features of this kind (verified 9a).
const ACADEMY_CATS = new Set([
  "amenity:prep_school",
  "amenity:language_school",
  "amenity:music_school",
  "amenity:arts_school",
  "amenity:college",
]);

function isAcademyCategory(category) {
  if (ACADEMY_CATS.has(category)) return true;
  return typeof category === "string" && category.startsWith("office:");
}

function isDrivingSchool(poi) {
  if (poi.category === "amenity:driving_school") return true;
  return typeof poi.name === "string"
    && (poi.name.includes("운전") || poi.name.includes("자동차운전"));
}

// School level from the Korean name. 초등/중학/고등 substrings cover the
// standard names (…초등학교, …중학교, …고등학교) and typo variants like
// …초등교; anything else reads "unknown" rather than guessed.
export function schoolLevel(name) {
  const s = String(name || "");
  if (s.includes("초등")) return "elementary";
  if (s.includes("중학")) return "middle";
  if (s.includes("고등")) return "high";
  return "unknown";
}

export const EDU_LEVEL_KO = {
  elementary: "초등학교",
  middle: "중학교",
  high: "고등학교",
  unknown: "기타·미분류",
};

// Classify one area POI into an education bucket, or null when it is not
// an education facility. Buckets: school (with level), kindergarten,
// childcare, library, academy.
export function classifyEducation(poi) {
  if (!poi || typeof poi.name !== "string" || !poi.name) return null;
  const cat = poi.category;
  if (cat === "amenity:school") return { bucket: "school", level: schoolLevel(poi.name) };
  if (cat === "amenity:kindergarten") return { bucket: "kindergarten", level: null };
  if (cat === "amenity:childcare") return { bucket: "childcare", level: null };
  if (cat === "amenity:library") return { bucket: "library", level: null };
  if (isDrivingSchool(poi)) return null;
  if (isAcademyCategory(cat)) return { bucket: "academy", level: null };
  if (typeof cat === "string" && cat.startsWith("amenity:") && poi.name.includes("학원")) {
    return { bucket: "academy", level: null };
  }
  return null;
}

const EMPTY_COUNTS = () => ({
  school_elementary: 0, school_middle: 0, school_high: 0, school_unknown: 0,
  kindergarten: 0, childcare: 0, library: 0, academy: 0,
});

// Education access from one home node: counts within each band (graph
// minutes at adult speed) plus the nearest facility per bucket with its
// graph minutes/metres. Takes the engine's anchored places index
// (buildPlaces, same ≤500 m reach rule and node anchors the routines
// use) — no separate anchoring, no straight lines.
export function educationCounts(places, router, homeNodeId, opts = {}) {
  const bands = opts.bands || EDU_MINUTES_BANDS;
  const speed = opts.speed_mps || EDU_SPEED_MPS;
  const nearestK = opts.nearestK || 3;
  const { dist } = router.distFrom(homeNodeId);
  const hits = [];
  for (const entry of (places && places.education) || []) {
    const d = dist.get(entry.place.nodeId);
    if (d === undefined) continue;
    hits.push({ place: entry.place, bucket: entry.bucket, level: entry.level,
      lengthM: d, minutes: d / speed / 60 });
  }
  const byBand = {};
  for (const band of bands) {
    const counts = EMPTY_COUNTS();
    const maxM = band * 60 * speed;
    for (const h of hits) {
      if (h.lengthM > maxM) continue;
      if (h.bucket === "school") counts[`school_${h.level}`] += 1;
      else counts[h.bucket] += 1;
    }
    byBand[`within_${band}min`] = counts;
  }
  const nearest = {};
  const buckets = ["school", "kindergarten", "childcare", "library", "academy"];
  for (const bucket of buckets) {
    nearest[bucket] = hits
      .filter((h) => h.bucket === bucket)
      .sort((a, b) => (a.lengthM - b.lengthM) || (a.place.id < b.place.id ? -1 : 1))
      .slice(0, nearestK)
      .map((h) => ({ id: h.place.id, name: h.place.name, category: h.place.category,
        level: h.level, minutes: Math.round(h.minutes * 10) / 10,
        distance_m: Math.round(h.lengthM * 100) / 100 }));
  }
  return {
    bands, speed_mps: speed, source: "graph",
    counts: byBand, nearest,
    academy_note: EDU_ACADEMY_NOTE,
    no_quality_note: EDU_NO_QUALITY_NOTE,
  };
}

// Graph edges ridden on primary-class roads. The walk-graph edge carries
// the OSM highway class, so the count below is data, not a guess. One way
// can contribute several edges — distinct way ids are counted, consecutive
// edges on the same way once.
export const PRIMARY_HIGHWAYS = new Set(["primary", "primary_link"]);

export function primaryWaysOnPath(router, nodeIds) {
  if (!router || !router.adj || !Array.isArray(nodeIds) || nodeIds.length < 2) return 0;
  const ways = new Set();
  for (let i = 0; i + 1 < nodeIds.length; i++) {
    const outs = router.adj.get(nodeIds[i]) || [];
    const edge = outs.find((e) => e.to === nodeIds[i + 1]);
    if (edge && PRIMARY_HIGHWAYS.has(edge.highway) && edge.way !== undefined) {
      ways.add(edge.way);
    }
  }
  return ways.size;
}

// A household child's simulated school route from a stored run: the first
// schoolday with school trips, out leg only (home -> school). Minutes and
// metres are the engine's recorded graph values at child speed; primary
// roads count the distinct primary-class ways on the path. Returns null
// with a note when the member has no school trips.
export function schoolRoute(run, router, memberKey) {
  const trips = (run.trips || []).filter((t) => t.agent === memberKey && t.purpose === "school");
  if (trips.length === 0) {
    return { member: memberKey, route: null,
      note: "등교 이동 없음 (도달 가능한 학교가 없거나 등교일이 아님)" };
  }
  const day = Math.min(...trips.map((t) => t.day));
  const out = trips.filter((t) => t.day === day)
    .sort((a, b) => a.depart_min - b.depart_min)[0];
  return {
    member: memberKey,
    day: day + 1,
    school: (out.to && (out.to.label || out.to.id)) || "",
    depart: out.depart_min,
    arrive: out.arrive_min,
    minutes: out.minutes,
    distance_m: out.distance_m,
    primary_ways: primaryWaysOnPath(router, out.path || []),
    primary_note: "primary 구간 수 (횡단 여부 아님)",
    speed_note: "어린이 속도 1.1 m/s (C-walk-speed)",
    source: "graph",
  };
}
