// Official education sources: adapter seam (stage 9a, Part D.3 — pure).
//
// OSM covers school *locations* well and academies poorly. The official
// rosters (학교알리미 school info, NEIS school/academy info) need API keys,
// so this stage ships the seam, not the calls: an OfficialEducationSource
// interface plus a fixture source shaped like the real payloads. When keys
// arrive, a keyed source implements the same interface server-side (keys
// never reach the browser) and the views below keep working.
//
// Documented in docs/education-official.md. Fixtures live beside the
// tests (web/tests/fixtures/education-official-*.json).

// source = {
//   id: "hakgyo-alrimi" | "neis" | "fixture:...",
//   needsKey: bool,
//   async listSchools({region, level}) -> [{name, level, address, lon, lat}],
//   async listAcademies({region}) -> [{name, address, lon, lat}],
// }
//
// Levels: "elementary" | "middle" | "high" | "unknown" (same vocabulary
// as education.js schoolLevel). Coordinates are WGS84 lon/lat or null
// when the source has no coordinates (caller geocodes or skips).
export function checkOfficialSource(source) {
  const errors = [];
  if (!source || typeof source !== "object") return ["source must be an object"];
  if (typeof source.id !== "string" || !source.id) errors.push("source.id must be a non-empty string");
  if (typeof source.needsKey !== "boolean") errors.push("source.needsKey must be a boolean");
  for (const fn of ["listSchools", "listAcademies"]) {
    if (typeof source[fn] !== "function") errors.push(`source.${fn} must be a function`);
  }
  return errors;
}

// Fixture source: serves caller-provided rows through the interface (no
// network, no key). Used by tests and by the UI's "official source" demo
// until a keyed source lands.
export function fixtureOfficialSource({ id = "fixture:demo", schools = [], academies = [] } = {}) {
  const rows = {
    schools: schools.map((r) => ({ ...r })),
    academies: academies.map((r) => ({ ...r })),
  };
  return {
    id,
    needsKey: false,
    async listSchools() {
      return rows.schools.map((r) => ({ ...r }));
    },
    async listAcademies() {
      return rows.academies.map((r) => ({ ...r }));
    },
  };
}

// Merge official rows with the OSM view: official rows that carry
// coordinates are anchored to the graph like POIs and counted with the
// OSM facilities; rows without coordinates are listed separately (never
// placed by guessing). Pure over the inputs.
export function mergeOfficialEducation(osmView, officialRows, router, opts = {}) {
  const speed = opts.speed_mps || 1.3;
  const homeNodeId = opts.homeNodeId;
  const anchored = [];
  const unplaced = [];
  for (const row of officialRows || []) {
    if (!Number.isFinite(row.lon) || !Number.isFinite(row.lat) || !router || homeNodeId === undefined) {
      unplaced.push({ ...row });
      continue;
    }
    const near = router.nearestNode(row.lon, row.lat);
    if (near.id === null || near.distM > 500) {
      unplaced.push({ ...row });
      continue;
    }
    const route = router.route(homeNodeId, near.id);
    if (!route) {
      unplaced.push({ ...row });
      continue;
    }
    anchored.push({ ...row, nodeId: near.id,
      minutes: Math.round((route.lengthM / speed / 60) * 10) / 10,
      distance_m: Math.round(route.lengthM * 100) / 100 });
  }
  return {
    source: "official+osm",
    official_count: (officialRows || []).length,
    anchored,
    unplaced,
    unplaced_note: unplaced.length > 0 ? "좌표가 없어 지도에 두지 못한 곳 (개수로만 표시)" : "",
    osm_note: (osmView && osmView.academy_note) || "",
  };
}
