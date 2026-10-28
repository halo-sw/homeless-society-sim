import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseScenario } from "../src/engine/scenario.js";
import { compare, simulate } from "../src/engine/simulate.js";
import { canon } from "../src/engine/canonical.js";
import { nowCardFor, householdNow, simMetaFor } from "../src/nowcard.js";
import { indexRun } from "../src/sim.js";
import { householdMonthlyNet } from "../src/money/payroll.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PERSONAS = ["single-firstjob", "newlywed-couple", "dual-income-child"];

function personaRaw(id) {
  return JSON.parse(readFileSync(join(ROOT, "scenarios", "personas", `${id}.json`), "utf8"));
}

function hasRealArea(areaId) {
  return existsSync(join(ROOT, "data", "build", areaId, "area.json"));
}

function loadRealArea(areaId) {
  const dir = join(ROOT, "data", "build", areaId);
  const area = JSON.parse(readFileSync(join(dir, "area.json"), "utf8"));
  for (const [k, v] of Object.entries(area)) {
    if (v && typeof v === "object" && !Array.isArray(v)
        && Object.keys(v).join() === "$ref") {
      area[k] = JSON.parse(readFileSync(join(dir, v.$ref), "utf8"));
    }
  }
  return area;
}

describe("personas", () => {
  it("templates validate with the documented household shapes", () => {
    const shapes = {
      "single-firstjob": ["adult"],
      "newlywed-couple": ["adult", "adult"],
      "dual-income-child": ["adult", "adult", "child"],
    };
    for (const id of PERSONAS) {
      const raw = personaRaw(id);
      assert.match(raw._note || "", /가정값/, id);
      const s = parseScenario(structuredClone(raw));
      assert.deepEqual(s.household.members.map((m) => m.role), shapes[id], id);
      assert.deepEqual(s.homes.map((h) => h.label), ["A", "B"], id);
      assert.ok(s.money && s.money.cash_won > 0, id);
    }
    const child = parseScenario(personaRaw("dual-income-child"));
    const kid = child.household.members[2];
    assert.equal(kid.school, true);
    assert.deepEqual(kid.schooldays, ["Mon", "Tue", "Wed", "Thu", "Fri"]);
  });

  it("runs deterministically on the real areas (1-person and child cases)", (t) => {
    if (!hasRealArea("songpa-jamsil") || !hasRealArea("pangyo")) {
      t.skip("missing built areas — data/ is gitignored; build them to run this check");
      return;
    }
    const area = loadRealArea("songpa-jamsil");
    for (const id of PERSONAS) {
      const raw = personaRaw(id);
      raw.days = 3;
      raw.background = 0;
      const a = simulate(area, structuredClone(raw), "A");
      const b = simulate(area, structuredClone(raw), "A");
      assert.equal(canon(a), canon(b), `${id} determinism`);
      assert.ok(a.trips.length > 0, `${id} trips`);
    }
  });

  it("sends the child to school at the slow walking speed (C-walk-speed)", (t) => {
    if (!hasRealArea("songpa-jamsil")) {
      t.skip("missing built areas — data/ is gitignored; build them to run this check");
      return;
    }
    const area = loadRealArea("songpa-jamsil");
    const raw = personaRaw("dual-income-child");
    raw.days = 3;
    raw.background = 0;
    const run = simulate(area, raw, "A");
    const school = run.trips.filter((tr) => tr.purpose === "school");
    assert.ok(school.length > 0, "child makes school trips");
    for (const tr of school.slice(0, 4)) {
      // Child speed 1.1 m/s: minutes == round1(dist / 1.1 / 60).
      const expect = Math.round((tr.distance_m / 1.1 / 60) * 10) / 10;
      assert.equal(tr.minutes, expect, `${tr.id} at child speed`);
    }
    const away = run.aways.find((a) => a.kind === "school");
    assert.ok(away, "school stay exists");
    assert.equal(away.end_min - away.start_min, 360); // schoolday 가정값
    assert.ok(run.unavailable.filter((u) => u.activity === "school").length === 0);
  });

  it("works end-to-end with one adult: compare, money, Now card, fatigue", (t) => {
    if (!hasRealArea("songpa-jamsil") || !hasRealArea("pangyo")) {
      t.skip("missing built areas — data/ is gitignored; build them to run this check");
      return;
    }
    const raw = personaRaw("single-firstjob");
    raw.days = 3;
    raw.background = 0;
    const runA = simulate(loadRealArea("songpa-jamsil"), structuredClone(raw), "A");
    const runB = simulate(loadRealArea("pangyo"), structuredClone(raw), "B");
    assert.equal(runA.meta.household, 1);
    // Compare across homes.
    const cmp = compare(runA, runB);
    assert.ok(cmp.metrics.length >= 8);
    assert.equal(cmp.members.length, 1);
    // Fatigue series + summaries for the single member.
    const fat = runA.totals.per_member.h1.fatigue;
    assert.ok(fat && Number.isFinite(fat.avg_30d), "fatigue summary");
    const dayFat = runA.daily.find((d) => d.agent === "h1").days[0].fatigue;
    assert.ok(dayFat && dayFat.series.length > 1, "fatigue series");
    // Now card + household rows + intro meta for one member.
    const indexed = indexRun(runA);
    const card = nowCardFor({ run: runA, indexed, agentKey: "h1", day: 0, minute: 510 });
    assert.ok(card && card.now, "now card text");
    const rows = householdNow({ run: runA, indexed, day: 0, minute: 510 });
    assert.equal(rows.length, 1);
    const meta = simMetaFor({ household: runA.agents.filter((a) => a.household),
      scenario: parseScenario(personaRaw("single-firstjob")), run: runA,
      homes: [{ label: "A" }, { label: "B" }] });
    assert.match(meta.members.join(" "), /나/);
    // Money inputs for one adult (payroll table is committed).
    const table = JSON.parse(readFileSync(
      join(ROOT, "scenarios", "assumptions", "kr-payroll.json"), "utf8"));
    const scenario = parseScenario(personaRaw("single-firstjob"));
    const net = householdMonthlyNet(scenario.money, scenario.household.members, table);
    assert.ok(net.household_monthly_net_won > 0, "1-person net pay");
    assert.equal(Object.keys(net.per_member).length, 1);
  });
});
