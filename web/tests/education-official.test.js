import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "../src/engine/graph.js";
import {
  checkOfficialSource, fixtureOfficialSource, mergeOfficialEducation,
} from "../src/education-official.js";
import { tinyArea } from "./engine-fixture.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const schools = JSON.parse(readFileSync(
  join(HERE, "fixtures", "education-official-schools.json"), "utf8"));
const academies = JSON.parse(readFileSync(
  join(HERE, "fixtures", "education-official-academies.json"), "utf8"));

describe("official education seam", () => {
  it("validates the source interface", () => {
    const src = fixtureOfficialSource({ schools, academies });
    assert.deepEqual(checkOfficialSource(src), []);
    assert.equal(src.needsKey, false);
    assert.deepEqual(checkOfficialSource(null), ["source must be an object"]);
    assert.ok(checkOfficialSource({ id: "x", needsKey: true }).length >= 2);
    assert.ok(checkOfficialSource({ id: "", needsKey: false,
      listSchools: async () => [], listAcademies: async () => [] })
      .some((e) => e.includes("id")));
  });

  it("serves fixture rows through the interface (no network)", async () => {
    const src = fixtureOfficialSource({ id: "fixture:demo", schools, academies });
    assert.equal(src.id, "fixture:demo");
    const gotSchools = await src.listSchools();
    assert.equal(gotSchools.length, 2);
    assert.equal(gotSchools[0].level, "elementary");
    const gotAcademies = await src.listAcademies();
    assert.equal(gotAcademies.length, 2);
    // Copies, not aliases.
    gotSchools[0].name = "MUTATED";
    assert.equal((await src.listSchools())[0].name, "가나초등학교");
  });

  it("merges official rows: anchored with graph minutes, unplaced listed", async () => {
    const area = tinyArea();
    const router = new Router(area.graph);
    const src = fixtureOfficialSource({ schools, academies });
    const rows = [...(await src.listSchools()), ...(await src.listAcademies())];
    const merged = mergeOfficialEducation({ academy_note: "OSM 기준" }, rows, router,
      { homeNodeId: "a" });
    assert.equal(merged.official_count, 4);
    assert.equal(merged.anchored.length, 2);
    assert.ok(merged.anchored.every((r) => r.minutes > 0 && r.distance_m > 0));
    assert.deepEqual(merged.unplaced.map((r) => r.name).sort(),
      ["다라중학교", "좌표없는학원"]);
    assert.match(merged.unplaced_note, /좌표가 없어/);
    assert.equal(merged.osm_note, "OSM 기준");
  });
});
