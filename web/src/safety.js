// Safety view: official police counts with their caveats, never a verdict (pure).
//
// Reads the pipeline artifact `data/build/region/safety.json` (built by
// `pipeline/safety.py` from the National Police CSV, gitignored) and shapes
// one area's numbers for the UI and the consult agent. Every reading carries
// source, period, unit and geographic level; the caveats travel with it.
//
// Forbidden by design: scores, rankings, colour-coded "danger", and any
// safe/unsafe verdict. Counts are where crimes were *recorded*, not a
// resident's risk.

export const SAFETY_SOURCE = "경찰청 범죄 발생 지역별 통계 (2025년)";
export const SAFETY_PERIOD = "2025-01-01…2025-12-31";
export const SAFETY_UNIT = "건";

// Built area -> statistics column. songpa-jamsil shares the 송파구 district
// column (whole district, not just Jamsil); pangyo shares the 성남시 city
// column (판교/분당 not separable). Mirrors pipeline/safety.py AREA_COLUMNS.
export const SAFETY_AREA_COLUMNS = {
  songpa: { column: "서울 송파구", geo_level: "district", geo_level_ko: "자치구 단위" },
  "songpa-jamsil": { column: "서울 송파구", geo_level: "district", geo_level_ko: "자치구 단위" },
  seongsu: { column: "서울 성동구", geo_level: "district", geo_level_ko: "자치구 단위" },
  pangyo: { column: "경기도 성남시", geo_level: "city", geo_level_ko: "시 단위" },
};

// The 중분류 rows shown under each 대분류 (the JSON ships every row; the
// view keeps a readable subset). Keys not present in a build are skipped.
export const SAFETY_SELECTED_MID = {
  강력범죄: ["살인기수", "강도", "강간", "강제추행", "방화"],
  절도범죄: ["절도범죄"],
  폭력범죄: ["상해", "폭행"],
  지능범죄: [],
  풍속범죄: [],
  교통범죄: [],
};

export const SAFETY_CAVEATS = [
  "수치는 범죄가 기록된 곳(관할) 기준 발생 건수이며, 거주자의 위험도가 아닙니다.",
  "성남시는 시 단위 통계라 판교/분당을 분리할 수 없습니다.",
  "관할 단위가 다른 지역(구 vs 시)의 건수는 직접 비교할 수 없습니다.",
  "점수·순위·등급을 매기지 않습니다.",
];

// 12a region columns (mirrors pipeline/regions.py REGION_SPECS safety).
// wirye has one view per 관할, never merged.
export const SAFETY_REGION_COLUMNS = {
  seongdong: [{ column: "서울 성동구", geo_level: "district", geo_level_ko: "자치구 단위" }],
  "songpa-gu": [{ column: "서울 송파구", geo_level: "district", geo_level_ko: "자치구 단위" }],
  gangnam: [{ column: "서울 강남구", geo_level: "district", geo_level_ko: "자치구 단위" }],
  gangdong: [{ column: "서울 강동구", geo_level: "district", geo_level_ko: "자치구 단위" }],
  bundang: [{ column: "경기도 성남시", geo_level: "city", geo_level_ko: "시 단위" }],
  sujeong: [{ column: "경기도 성남시", geo_level: "city", geo_level_ko: "시 단위" }],
  jungwon: [{ column: "경기도 성남시", geo_level: "city", geo_level_ko: "시 단위" }],
  suji: [{ column: "경기도 용인시", geo_level: "city", geo_level_ko: "시 단위" }],
  wirye: [
    { column: "서울 송파구", geo_level: "district", geo_level_ko: "자치구 단위" },
    { column: "경기도 성남시", geo_level: "city", geo_level_ko: "시 단위" },
    { column: "경기도 하남시", geo_level: "city", geo_level_ko: "시 단위" },
  ],
};

export const CITY_LEVEL_NOTE = "시 단위 통계라 구·동 단위로 분리할 수 없습니다.";

// One area's or region's safety reading, or {missing} when the build
// artifact (or the key inside it) is absent. Pure over safety.json.
export function safetyView(safetyDoc, areaId) {
  const regionCols = SAFETY_REGION_COLUMNS[areaId];
  if (regionCols) return safetyRegionView(safetyDoc, areaId, regionCols);
  const mapping = SAFETY_AREA_COLUMNS[areaId];
  if (!mapping) return { missing: `unknown area ${JSON.stringify(areaId)}` };
  const entry = safetyDoc && safetyDoc.areas && safetyDoc.areas[areaId];
  if (!entry) {
    return { missing: "안전 통계가 아직 빌드되지 않았습니다 (pipeline safety 실행 필요)",
      area: areaId, column: mapping.column, geo_level: mapping.geo_level,
      geo_level_ko: mapping.geo_level_ko };
  }
  const midByCat = new Map();
  for (const row of entry.by_cat2 || []) {
    if (!midByCat.has(row.cat1)) midByCat.set(row.cat1, []);
    midByCat.get(row.cat1).push({ cat2: row.cat2, count: row.count });
  }
  const groups = Object.entries(entry.by_cat1 || {}).map(([cat1, count]) => {
    const want = SAFETY_SELECTED_MID[cat1];
    const mids = (midByCat.get(cat1) || [])
      .filter((r) => !want || want.length === 0 || want.includes(r.cat2));
    return { cat1, count, mid: want && want.length > 0 ? mids : [] };
  });
  return {
    area: areaId,
    column: entry.column || mapping.column,
    geo_level: entry.geo_level || mapping.geo_level,
    geo_level_ko: mapping.geo_level_ko,
    source: (safetyDoc && safetyDoc.source) || SAFETY_SOURCE,
    period: (safetyDoc && safetyDoc.period) || SAFETY_PERIOD,
    unit: (safetyDoc && safetyDoc.unit) || SAFETY_UNIT,
    total: entry.total ?? null,
    groups,
    population_note: (safetyDoc && safetyDoc.population_note) || "",
    caveats: (safetyDoc && safetyDoc.caveats) || SAFETY_CAVEATS,
  };
}

function groupsFor(entry) {
  const midByCat = new Map();
  for (const row of entry.by_cat2 || []) {
    if (!midByCat.has(row.cat1)) midByCat.set(row.cat1, []);
    midByCat.get(row.cat1).push({ cat2: row.cat2, count: row.count });
  }
  return Object.entries(entry.by_cat1 || {}).map(([cat1, count]) => {
    const want = SAFETY_SELECTED_MID[cat1];
    const mids = (midByCat.get(cat1) || [])
      .filter((r) => !want || want.length === 0 || want.includes(r.cat2));
    return { cat1, count, mid: want && want.length > 0 ? mids : [] };
  });
}

function regionView(safetyDoc, regionId, entry, mapping) {
  return {
    area: regionId,
    column: entry.column || mapping.column,
    geo_level: entry.geo_level || mapping.geo_level,
    geo_level_ko: mapping.geo_level_ko,
    level_note: mapping.geo_level === "city" ? CITY_LEVEL_NOTE : null,
    source: (safetyDoc && safetyDoc.source) || SAFETY_SOURCE,
    period: (safetyDoc && safetyDoc.period) || SAFETY_PERIOD,
    unit: (safetyDoc && safetyDoc.unit) || SAFETY_UNIT,
    total: entry.total ?? null,
    groups: groupsFor(entry),
    population_note: (safetyDoc && safetyDoc.population_note) || "",
    caveats: (safetyDoc && safetyDoc.caveats) || SAFETY_CAVEATS,
  };
}

// Region reading: single 관할 regions return the flat view; 위례
// returns one view per 관할 under `parts` (never merged, never summed).
export function safetyRegionView(safetyDoc, regionId, columns) {
  const cols = columns || SAFETY_REGION_COLUMNS[regionId] || [];
  if (cols.length === 0) return { missing: `unknown area ${JSON.stringify(regionId)}` };
  const entry = safetyDoc && safetyDoc.regions && safetyDoc.regions[regionId];
  if (!entry) {
    return { missing: "안전 통계가 아직 빌드되지 않았습니다 (pipeline safety 실행 필요)",
      area: regionId, columns: cols.map((c) => c.column) };
  }
  if (cols.length === 1) return regionView(safetyDoc, regionId, entry, cols[0]);
  const parts = {};
  for (const mapping of cols) {
    const part = (entry.parts || {})[mapping.column];
    if (!part) {
      return { missing: `관할 ${mapping.column} 통계가 빌드에 없습니다`, area: regionId };
    }
    parts[mapping.column] = regionView(safetyDoc, regionId, part, mapping);
  }
  return {
    area: regionId, parts,
    note: entry.note || "관할이 여러 개라 통계를 합치지 않습니다.",
    source: (safetyDoc && safetyDoc.source) || SAFETY_SOURCE,
    period: (safetyDoc && safetyDoc.period) || SAFETY_PERIOD,
    unit: (safetyDoc && safetyDoc.unit) || SAFETY_UNIT,
    caveats: (safetyDoc && safetyDoc.caveats) || SAFETY_CAVEATS,
  };
}
