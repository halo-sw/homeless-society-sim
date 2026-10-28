import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tinyArea, tinyScenario } from "./engine-fixture.js";
import { simulate } from "../src/engine/simulate.js";
import { Router } from "../src/engine/graph.js";
import { qualityCard, convenienceCounts } from "../src/money/quality.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

describe("quality of life card", () => {
  it("shows time/money/convenience with units and sources, no score", () => {
    const area = tinyArea();
    const run = simulate(area, tinyScenario({ days: 7, background: 0, seed: 7 }), "A");
    const card = qualityCard(run, area, new Router(area.graph), {
      monthly_housing_won: 1200000, burden_ratio: 0.25, remaining_won: 2000000,
      monthly_net_won: 4800000, tenure: "전세", source: "rtms",
    });
    assert.equal(card.home.label, "A");
    assert.equal(card.time.unit, "minutes");
    assert.ok(card.time.commute_minutes_per_day >= 0);
    assert.ok(card.time.evening_at_home_minutes_per_day >= 0);
    assert.equal(card.money.monthly_housing_won, 1200000);
    assert.equal(card.money.burden_ratio, 0.25);
    assert.equal(card.convenience.source, "graph");
    assert.ok(card.convenience.grocery >= 1); // 슈퍼1 + 편의점1 within 10 min
    assert.ok(!("score" in card));
    assert.match(card.no_score_note, /종합 점수/);
    // "내 기준" weights are the customer's own, echoed verbatim.
    const mine = qualityCard(run, area, new Router(area.graph), {
      weights: { time: 0.5, money: 0.3, convenience: 0.2, by: "customer" },
    });
    assert.deepEqual(mine.weights.by, "customer");
  });

  it("counts station names once (real data)", async (t) => {
    let area;
    try {
      const dir = join(REPO, "data", "build", "songpa-jamsil");
      area = JSON.parse(await readFile(join(dir, "area.json"), "utf8"));
      for (const [key, value] of Object.entries(area)) {
        if (value && typeof value === "object" && !Array.isArray(value)
            && Object.keys(value).join() === "$ref") {
          area[key] = JSON.parse(await readFile(join(dir, value.$ref), "utf8"));
        }
      }
    } catch {
      return t.skip("no real data");
    }
    const run = simulate(area, JSON.parse(await readFile(
      join(REPO, "scenarios", "demo-two-homes.json"), "utf8")), "A");
    const card = qualityCard(run, area, new Router(area.graph), {
      monthly_housing_won: 2600000, burden_ratio: 0.3, remaining_won: 1000000,
      monthly_net_won: 8000000, tenure: "전세", source: "rtms",
    });
    assert.ok(card.convenience.grocery > 0);
    assert.ok(card.convenience.station_pois >= card.convenience.station);
    assert.ok(card.time.commute_minutes_per_day > 0);
    // 잠실역 is a ~14 min walk from 레이크팰리스, so 10 min holds none —
    // widening the radius must find it (naming still dedupes entrances).
    const { resolveHome } = await import("../src/engine/scenario.js");
    const resolved = resolveHome(area,
      { label: "A", area: "songpa-jamsil", complex_name: "레이크팰리스" },
      new Router(area.graph));
    const wide = convenienceCounts(area, new Router(area.graph), resolved.nodeId, 20);
    assert.ok(wide.station >= 1, JSON.stringify(wide));
    assert.ok(wide.station_pois >= wide.station);
  });
});
