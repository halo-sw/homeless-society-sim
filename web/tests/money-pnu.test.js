import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parsePnu, buildPnuIndex, matchRtmsRow, complexOfBuildings, 단지명Matches,
  rtmsToPnuCandidates,
} from "../src/money/pnu.js";
import { createCsvBackend } from "../src/money/rtms.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

async function loadArea(areaId) {
  const dir = join(REPO, "data", "build", areaId);
  const area = JSON.parse(await readFile(join(dir, "area.json"), "utf8"));
  for (const [key, value] of Object.entries(area)) {
    if (value && typeof value === "object" && !Array.isArray(value)
        && Object.keys(value).join() === "$ref") {
      area[key] = JSON.parse(await readFile(join(dir, value.$ref), "utf8"));
    }
  }
  return area;
}

async function hasReal() {
  try {
    await readFile(join(REPO, "data", "build", "songpa-jamsil", "area.json"), "utf8");
    await readFile(join(REPO, "data", "raw", "rtms", "apt_trade_songpa_2510-2610.csv"));
    return true;
  } catch {
    return false;
  }
}

describe("pnu matching", () => {
  it("parses 19-digit PNUs", () => {
    const p = parsePnu("1171010100100240000");
    assert.equal(p.bjdong, "1171010100");
    assert.equal(p.landType, "1");
    assert.equal(p.bon, "0024");
    assert.equal(p.bu, "0000");
    assert.equal(parsePnu("short"), null);
    assert.deepEqual(rtmsToPnuCandidates({ bonbun: "44", bubun: "0" }, ["1171010100"]),
      ["1171010100100440000"]);
    assert.deepEqual(rtmsToPnuCandidates({ bonbun: "", bubun: "" }, ["1171010100"]), []);
  });

  it("checks complex names loosely", () => {
    assert.equal(단지명Matches("레이크팰리스", "레이크팰리스"), true);
    assert.equal(단지명Matches("백현마을 3단지", "백현마을"), true);
    assert.equal(단지명Matches("리센츠", "레이크팰리스"), false);
    assert.equal(단지명Matches("", "x"), false);
  });

  it("matches 레이크팰리스 rows by parcel + name (real data)", async (t) => {
    if (!await hasReal()) return t.skip("no real data");
    const area = await loadArea("songpa-jamsil");
    const backend = createCsvBackend({
      rawDir: join(REPO, "data", "raw", "rtms"), readFile: (p) => readFile(p),
    });
    const rows = await backend.loadAll("songpa");
    const idx = buildPnuIndex(area.buildings);
    assert.ok(idx.byPnu.size > 500, `pnu entries ${idx.byPnu.size}`);
    const lake = rows.filter((r) => 단지명Matches(r.complex, "레이크팰리스"));
    assert.ok(lake.length > 100, `lake rows ${lake.length}`);
    let parcel = 0;
    for (const r of lake) {
      const m = matchRtmsRow(r, idx);
      if (m.buildings.length === 0) continue;
      assert.ok(m.pnu);
      const names = complexOfBuildings(m.buildings, area.complexes);
      if (names.some((c) => c.name === "레이크팰리스")) parcel++;
    }
    assert.ok(parcel > 100, `parcel rows ${parcel}`);
  });

  it("matches 백현마을 rows by parcel + name (real data)", async (t) => {
    if (!await hasReal()) return t.skip("no real data");
    const area = await loadArea("pangyo");
    const backend = createCsvBackend({
      rawDir: join(REPO, "data", "raw", "rtms"), readFile: (p) => readFile(p),
    });
    const rows = await backend.loadAll("bundang");
    const idx = buildPnuIndex(area.buildings);
    const paek = rows.filter((r) => 단지명Matches(r.complex, "백현마을"));
    assert.ok(paek.length > 100, `paek rows ${paek.length}`);
    let parcel = 0;
    for (const r of paek) {
      const m = matchRtmsRow(r, idx);
      if (m.buildings.length === 0) continue;
      if (complexOfBuildings(m.buildings, area.complexes).some((c) => c.name === "백현마을")) parcel++;
    }
    assert.ok(parcel > 100, `parcel rows ${parcel}`);
  });
});
