import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "../src/engine/graph.js";
import { buildPlaces } from "../src/engine/places.js";
import { resolveHome } from "../src/engine/scenario.js";
import { simulate } from "../src/engine/simulate.js";
import {
  EDU_ACADEMY_NOTE, EDU_NO_QUALITY_NOTE, schoolLevel, classifyEducation,
  educationCounts, primaryWaysOnPath, schoolRoute,
} from "../src/education.js";
import { NODES, tinyArea, tinyScenario } from "./engine-fixture.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function eduArea() {
  const area = tinyArea();
  const at = (lon, lat) => ({ type: "Point", coordinates: [lon, lat] });
  area.pois.push(
    { id: "k1", name: "햇살유치원", category: "amenity:kindergarten",
      osm_kind: "node", osm_id: 11, geometry: at(127.001, 37.5001) },
    { id: "c1", name: "푸른어린이집", category: "amenity:childcare",
      osm_kind: "node", osm_id: 12, geometry: at(127.0011, 37.5001) },
    { id: "l1", name: "마을도서관", category: "amenity:library",
      osm_kind: "node", osm_id: 13, geometry: at(127.003, 37.5001) },
    { id: "a1", name: "수학학원", category: "amenity:prep_school",
      osm_kind: "node", osm_id: 14, geometry: at(127.001, 37.5) },
    { id: "a2", name: "영어학원", category: "office:educational_institution",
      osm_kind: "node", osm_id: 15, geometry: at(127.0011, 37.5) },
    { id: "d1", name: "운전학원", category: "amenity:driving_school",
      osm_kind: "node", osm_id: 16, geometry: at(127.001, 37.5) },
  );
  return area;
}

describe("education access", () => {
  it("reads school levels from Korean names", () => {
    assert.equal(schoolLevel("서울신천초등학교"), "elementary");
    assert.equal(schoolLevel("남천초등교"), "elementary"); // typo variant
    assert.equal(schoolLevel("보평중학교"), "middle");
    assert.equal(schoolLevel("보평고등학교"), "high");
    assert.equal(schoolLevel("초등학교"), "elementary");
    assert.equal(schoolLevel("국제학교"), "unknown"); // never guessed
    assert.equal(schoolLevel(""), "unknown");
  });

  it("classifies buckets (school levels, kindergarten, library, academies)", () => {
    assert.deepEqual(
      classifyEducation({ name: "보평중학교", category: "amenity:school" }),
      { bucket: "school", level: "middle" });
    assert.deepEqual(
      classifyEducation({ name: "햇살유치원", category: "amenity:kindergarten" }),
      { bucket: "kindergarten", level: null });
    assert.deepEqual(
      classifyEducation({ name: "푸른어린이집", category: "amenity:childcare" }),
      { bucket: "childcare", level: null });
    assert.deepEqual(
      classifyEducation({ name: "마을도서관", category: "amenity:library" }),
      { bucket: "library", level: null });
    assert.deepEqual(
      classifyEducation({ name: "수학학원", category: "amenity:prep_school" }),
      { bucket: "academy", level: null });
    assert.deepEqual(
      classifyEducation({ name: "영어학원", category: "office:educational_institution" }),
      { bucket: "academy", level: null });
    assert.deepEqual(
      classifyEducation({ name: "피아노학원", category: "amenity:music_school" }),
      { bucket: "academy", level: null });
    // Driving schools are not learning academies.
    assert.equal(
      classifyEducation({ name: "운전학원", category: "amenity:driving_school" }), null);
    assert.equal(
      classifyEducation({ name: "슈퍼1", category: "shop:supermarket" }), null);
    assert.equal(classifyEducation({ name: "", category: "amenity:school" }), null);
    assert.equal(classifyEducation(null), null);
  });

  it("counts within 10/15 graph minutes with nearest lists (tiny graph)", () => {
    const area = eduArea();
    const router = new Router(area.graph);
    const places = buildPlaces(area, router);
    // Home entrance: node a (the 알파 complex anchors there).
    const view = educationCounts(places, router, "a");
    assert.deepEqual(view.bands, [10, 15]);
    assert.equal(view.speed_mps, 1.3);
    assert.equal(view.source, "graph");
    // Distances from a: b=100 m, c=110 m, d=310 m. Everything above sits
    // within ~4 graph minutes, so 10- and 15-minute counts agree here.
    const c10 = view.counts.within_10min;
    assert.equal(c10.school_elementary, 1); // sch1 "초등학교" at d
    assert.equal(c10.kindergarten, 1);
    assert.equal(c10.childcare, 1);
    assert.equal(c10.library, 1);
    assert.equal(c10.academy, 2); // prep_school + office-tagged; driving excluded
    assert.deepEqual(view.counts.within_15min, c10);
    assert.equal(view.nearest.school[0].name, "초등학교");
    assert.ok(view.nearest.school[0].minutes > 0);
    assert.equal(view.nearest.academy.length, 2);
    assert.equal(view.academy_note, EDU_ACADEMY_NOTE);
    assert.equal(view.no_quality_note, EDU_NO_QUALITY_NOTE);
  });

  it("is honest when nothing is reachable", () => {
    const area = tinyArea();
    const router = new Router(area.graph);
    const places = buildPlaces(area, router);
    const view = educationCounts(places, router, "x"); // isolated island
    const c10 = view.counts.within_10min;
    assert.ok(Object.values(c10).every((n) => n === 0));
    assert.deepEqual(view.nearest.school, []);
  });

  it("counts distinct primary ways on a path (consecutive edges once)", () => {
    const graph = {
      nodes: { ...NODES },
      edges: { walk: [
        { from: "a", to: "b", way: 11, highway: "primary", name: null, length_m: 100 },
        { from: "b", to: "a", way: 11, highway: "primary", name: null, length_m: 100 },
        { from: "b", to: "c", way: 11, highway: "primary", name: null, length_m: 10 },
        { from: "c", to: "b", way: 11, highway: "primary", name: null, length_m: 10 },
        { from: "c", to: "d", way: 22, highway: "residential", name: null, length_m: 200 },
        { from: "d", to: "c", way: 22, highway: "residential", name: null, length_m: 200 },
      ], bike: [], drive: [] },
    };
    const router = new Router(graph);
    assert.equal(primaryWaysOnPath(router, ["a", "b", "c"]), 1);
    assert.equal(primaryWaysOnPath(router, ["a", "b", "c", "d"]), 1);
    assert.equal(primaryWaysOnPath(router, ["c", "d"]), 0);
    assert.equal(primaryWaysOnPath(router, ["a"]), 0);
  });

  it("reports the child's school route from a run (minutes, crossings)", () => {
    const area = eduArea();
    const scenario = tinyScenario({
      days: 2, background: 0, seed: 7,
      homes: [{ label: "A", area: "tiny", complex_name: "알파" }],
    });
    const run = simulate(area, scenario, "A");
    const route = schoolRoute(run, new Router(area.graph), "h2");
    assert.equal(route.school, "초등학교");
    assert.ok(route.minutes > 0 && route.distance_m > 0);
    assert.equal(route.primary_ways, 0); // tiny fixture has no primary roads
    assert.equal(route.source, "graph");
    const none = schoolRoute(run, new Router(area.graph), "h1");
    assert.equal(none.route, null);
    assert.match(none.note, /등교 이동 없음/);
  });

  it("measures real homes: OSM counts and graph minutes (built areas)", (t) => {
    const need = ["songpa-jamsil", "pangyo"].map((a) =>
      join(ROOT, "data", "build", a, "area.json"));
    if (need.some((p) => !existsSync(p))) {
      t.skip("missing built areas — data/ is gitignored; build them to run this check");
      return;
    }
    const load = (areaId) => {
      const dir = join(ROOT, "data", "build", areaId);
      const area = JSON.parse(readFileSync(join(dir, "area.json"), "utf8"));
      for (const [k, v] of Object.entries(area)) {
        if (v && typeof v === "object" && !Array.isArray(v)
            && Object.keys(v).join() === "$ref") {
          area[k] = JSON.parse(readFileSync(join(dir, v.$ref), "utf8"));
        }
      }
      return area;
    };
    const cases = [
      ["songpa-jamsil", "레이크팰리스", "송전초등학교", 88.26],
      ["pangyo", "백현마을", "화랑초등학교", 446.01],
    ];
    for (const [areaId, complex, nearestSchool, distM] of cases) {
      const area = load(areaId);
      const router = new Router(area.graph);
      const places = buildPlaces(area, router);
      const nodeId = resolveHome(area,
        { label: "T", area: areaId, complex_name: complex }, router).nodeId;
      assert.ok(nodeId, areaId);
      const view = educationCounts(places, router, nodeId);
      assert.ok(view.nearest.school.length > 0, areaId);
      assert.equal(view.nearest.school[0].name, nearestSchool, areaId);
      assert.ok(Math.abs(view.nearest.school[0].distance_m - distM) < 0.01, areaId);
      assert.ok(view.nearest.school[0].minutes > 0, areaId);
      const c10 = view.counts.within_10min;
      assert.ok(c10.school_elementary >= 1, areaId);
    }
  });
});
