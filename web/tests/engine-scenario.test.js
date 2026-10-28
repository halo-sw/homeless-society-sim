import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Router } from "../src/engine/graph.js";
import { homeOf, nameForHome, parseScenario, resolveHome, weekdayOf, dateOf } from "../src/engine/scenario.js";
import { tinyArea, tinyScenario } from "./engine-fixture.js";

describe("engine scenario", () => {
  it("fills documented defaults", () => {
    const s = parseScenario({
      household: { members: [{ role: "adult" }] },
      homes: [{ label: "A", area: "tiny", complex_name: "알파" }],
    });
    assert.equal(s.start_date, "2026-11-02");
    assert.equal(s.days, 30);
    assert.equal(s.background, 60);
    assert.equal(s.workday_minutes, 540);
    assert.equal(s.schoolday_minutes, 360);
    assert.deepEqual(s.household.members[0].workdays, ["Mon", "Tue", "Wed", "Thu", "Fri"]);
    assert.deepEqual(s.household.members[0].work, { type: "none" });
  });

  it("rejects bad shapes", () => {
    const good = tinyScenario();
    assert.throws(() => parseScenario({ ...good, household: { members: [] } }), /members/);
    assert.throws(() => parseScenario({
      ...good,
      household: { members: [{ role: "adult", workdays: ["Funday"] }] },
    }), /weekday/);
    assert.throws(() => parseScenario({
      ...good,
      household: { members: [{ role: "adult", work: { type: "teleport" } }] },
    }), /unknown type/);
    assert.throws(() => parseScenario({
      ...good,
      homes: [{ label: "A", area: "t", complex_name: "x" }, { label: "A", area: "t", complex_name: "y" }],
    }), /duplicate home label/);
    assert.throws(() => homeOf(parseScenario(good), "Z"), /unknown home label/);
  });

  it("computes KST weekdays and dates without Date", () => {
    assert.equal(weekdayOf("2026-11-02", 0), 0); // Monday
    assert.equal(weekdayOf("2026-11-02", 6), 6); // Sunday
    assert.equal(weekdayOf("2026-11-02", 7), 0);
    assert.equal(dateOf("2026-11-02", 0), "2026-11-02");
    assert.equal(dateOf("2026-11-02", 28), "2026-11-30");
    assert.equal(dateOf("2026-11-02", 29), "2026-12-01");
    assert.equal(dateOf("2026-11-02", 365), "2027-11-02");
  });

  it("resolves per-home names", () => {
    assert.equal(nameForHome("잠실", "A"), "잠실");
    assert.equal(nameForHome({ A: "잠실", B: "판교" }, "B"), "판교");
    assert.throws(() => nameForHome({ A: "잠실" }, "B"), /no name for home/);
  });

  it("resolves the home entrance deterministically by verbatim name", () => {
    const area = tinyArea();
    const router = new Router(area.graph);
    const scenario = parseScenario(tinyScenario());
    const home = homeOf(scenario, "A");
    const r1 = resolveHome(area, home, router);
    const r2 = resolveHome(area, home, router);
    assert.equal(r1.complex.name, "알파");
    assert.equal(r1.buildingId, "b-home");
    assert.equal(r1.nodeId, "a");
    assert.deepEqual(r1, r2);
    assert.throws(() => resolveHome(area, { label: "X", complex_name: "없는단지" }, router), /no complex named/);
  });
});
