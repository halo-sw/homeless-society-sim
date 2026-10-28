// Shared tiny fixture for the engine tests (not a test itself).
//
// Directed walk graph a<->b<->c<->d (100/10/200 m legs) plus an isolated
// island x<->y. Home complex 알파 sits near a; 베타 near d. POIs cover
// every routine category; the two 중앙역 entrances (100 vs 110 m from
// the 알파 entrance) force a station_route branch.

export const NODES = {
  a: [127.0, 37.5],
  b: [127.001, 37.5],
  c: [127.0011, 37.5],
  d: [127.003, 37.5],
  x: [127.1, 37.6],
  y: [127.101, 37.6],
};

const E = (from, to, len) => ({ from, to, way: 1, highway: "residential", name: null, length_m: len });

export const WALK = [
  E("a", "b", 100), E("b", "a", 100),
  E("b", "c", 10), E("c", "b", 10),
  E("c", "d", 200), E("d", "c", 200),
  E("x", "y", 100), E("y", "x", 100),
];

function square(lon, lat, s = 0.0001) {
  return { type: "Polygon", coordinates: [[[lon, lat], [lon + s, lat], [lon + s, lat + s], [lon, lat + s], [lon, lat]]] };
}

function building(id, residential, lon, lat, extra = {}) {
  return {
    id, origin: "joined", building: residential === "apartment" ? "apartments" : "house",
    name: null, height_m: 30, height_source: "register_height", levels: 10, area_m2: 500,
    residential, residential_source: "osm:apartments", register: null,
    geometry: square(lon, lat), ...extra,
  };
}

function poi(id, name, category, lon, lat) {
  return { id, name, category, osm_kind: "node", osm_id: 1,
    geometry: { type: "Point", coordinates: [lon, lat] } };
}

export function tinyArea() {
  return {
    area: "tiny",
    label: "Tiny",
    crs: { local: { origin: { lon: 127.0, lat: 37.5 } } },
    buildings: [
      building("b-home", "apartment", 127.0, 37.5001, {
        register: { pnu: null, use: "공동주택", api: { households: 50 } },
      }),
      building("b-far", "apartment", 127.003, 37.5001),
      building("b-house", "house", 127.001, 37.5002, { levels: 2, height_m: 6 }),
      building("b-shop", "none", 127.002, 37.5002),
    ],
    complexes: [
      { id: "cx1", name: "알파", name_source: "register", building_ids: ["b-home"],
        centroid: [127.0, 37.5001], households_hint: null, max_floors: 10 },
      { id: "cx2", name: "베타", name_source: "register", building_ids: ["b-far"],
        centroid: [127.003, 37.5001], households_hint: null, max_floors: 10 },
    ],
    pois: [
      poi("st1", "중앙역", "railway:station", 127.001, 37.5),
      poi("st2", "중앙역", "railway:station", 127.0011, 37.5),
      poi("sup1", "슈퍼1", "shop:supermarket", 127.001, 37.5001),
      poi("sup2", "슈퍼2", "shop:supermarket", 127.0011, 37.5001),
      poi("sup3", "슈퍼3", "shop:supermarket", 127.003, 37.5001),
      poi("conv1", "편의점1", "shop:convenience", 127.0011, 37.5),
      poi("sch1", "초등학교", "amenity:school", 127.003, 37.5),
      poi("cli1", "약국", "amenity:pharmacy", 127.0011, 37.5002),
      poi("park1", "공원", "leisure:park", 127.001, 37.5002),
      poi("iso1", "섬약국", "amenity:pharmacy", 127.1, 37.6),
    ],
    landuse: [],
    roads: [],
    trees: [],
    graph: { nodes: NODES, edges: { walk: WALK, bike: [], drive: [] } },
  };
}

// Fake region for journey/fatigue tests (hand-written toy numbers, never
// copied from the real network or the congestion xlsx).
export function tinyRegion() {
  const stopsA = ["중앙역", "시청", "환승역"].map((name, i) => ({
    id: `a:${name}`, name, key: name.replace(/역$/, ""),
    lon: 127.0 + i * 0.01, lat: 37.5,
  }));
  const stopsB = ["환승역", "직장역"].map((name, i) => ({
    id: `b:${name}`, name, key: name.replace(/역$/, ""),
    lon: 127.02 + i * 0.02, lat: 37.5,
  }));
  const geomA = [[127.0, 37.5], [127.01, 37.5], [127.02, 37.5]];
  const geomB = [[127.02, 37.5], [127.03, 37.5], [127.04, 37.5]];
  const network = {
    lines: [
      { id: "a", name: "A호선", circle: false, stops: stopsA,
        patterns: [
          { id: "a:down:1", direction: "down", direction_label: "하선",
            stops: stopsA.map((s) => s.id), chainage_km: [0, 1, 2],
            geometry: geomA },
          { id: "a:up:2", direction: "up", direction_label: "상선",
            stops: stopsA.map((s) => s.id).reverse(), chainage_km: [0, 1, 2],
            geometry: [...geomA].reverse() },
        ] },
      { id: "b", name: "B호선", circle: false, stops: stopsB,
        patterns: [
          { id: "b:down:3", direction: "down", direction_label: "하선",
            stops: stopsB.map((s) => s.id), chainage_km: [0, 4],
            geometry: geomB },
          { id: "b:up:4", direction: "up", direction_label: "상선",
            stops: stopsB.map((s) => s.id).reverse(), chainage_km: [0, 4],
            geometry: [...geomB].reverse() },
        ] },
    ],
    transfers: [{ station: "환승역", key: "환승", lines: ["a", "b"] }],
  };
  // 30-minute slots from 05:30: fake values with one >100 % column.
  const slots = [330, 480, 510, 1080, 1110];
  const congestion = {
    slots,
    slot_labels: ["05:30~06:00", "08:00~08:30", "08:30~09:00", "18:00~18:30", "18:30~19:00"],
    days: {
      weekday: { A호선: { 중앙역: { 하선: [10, 90, 120, 80, 70] } } },
      saturday: { A호선: { 중앙역: { 하선: [10, 40, 45, 50, 40] } } },
      sunday: { A호선: { 중앙역: { 하선: [10, 30, 35, 40, 30] } } },
    },
    station_numbers: { A호선: { 중앙역: 101 } },
  };
  return { network, congestion };
}

export function tinyScenario(over = {}) {
  return {
    name: "tiny",
    start_date: "2026-11-02",
    days: 7,
    seed: 42,
    background: 5,
    workday_minutes: 540,
    schoolday_minutes: 360,
    household: {
      members: [
        { id: "m1", label: "구성원 1", role: "adult", workdays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
          work: { type: "station_ride", station_name: "중앙역", ride_minutes: 20,
            ride_minutes_source: "user_assumption" },
          errands_per_week: { supermarket: 1, convenience: 1 },
          park_walks_per_week: 2, clinic_visits_per_month: 1 },
        { id: "m2", label: "구성원 2", role: "child", school: true,
          errands_per_week: { supermarket: 0, convenience: 0 },
          park_walks_per_week: 1, clinic_visits_per_month: 0 },
      ],
    },
    homes: [
      { label: "A", area: "tiny", complex_name: "알파" },
      { label: "B", area: "tiny", complex_name: "베타" },
    ],
    ...over,
  };
}
