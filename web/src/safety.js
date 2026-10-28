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

// One area's safety reading, or {missing} when the build artifact (or the
// area inside it) is absent. Pure over the parsed safety.json doc.
export function safetyView(safetyDoc, areaId) {
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
