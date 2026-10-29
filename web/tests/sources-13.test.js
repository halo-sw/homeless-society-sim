import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SOURCES, sourceById, miniCreditFor } from "../src/sources.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("sources page data", () => {
  it("covers every source named in ATTRIBUTION.md", () => {
    const attr = readFileSync(join(ROOT, "ATTRIBUTION.md"), "utf8");
    const need = ["OpenStreetMap", "Geofabrik", "GIS건물통합정보",
      "건축물대장", "실거래가", "공공주택", "경찰청",
      "혼잡도", "역간거리", "Commons", "주택도시기금", "전세사기"];
    for (const word of need) {
      assert.ok(attr.includes(word), `ATTRIBUTION.md mentions ${word}`);
      const covered = SOURCES.some((s) =>
        `${s.name} ${s.use} ${s.version}`.includes(word.slice(0, 4)));
      assert.ok(covered, `sources.js covers ${word}`);
    }
  });
  it("covers the app-level sources (fonts, skills, personas, design)", () => {
    for (const id of ["pretendard", "emil-skills", "nemotron-personas", "astryx"]) {
      assert.ok(sourceById(id), `has ${id}`);
    }
  });
  it("gives every source a use, licence, version, link and must-not", () => {
    for (const s of SOURCES) {
      for (const k of ["name", "use", "licence", "version", "url", "mustNot"]) {
        assert.ok(s[k] && s[k].length > 0, `${s.id}.${k} present`);
      }
      assert.match(s.url, /^https:\/\//);
    }
  });
  it("keeps mini credits next to the numbers they explain", () => {
    assert.match(miniCreditFor("rtms"), /국토교통부/);
    assert.match(miniCreditFor("photos"), /Commons/);
    assert.ok(miniCreditFor("nope") === "");
  });
});
