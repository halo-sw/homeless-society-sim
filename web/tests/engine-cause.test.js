// Cause tests (stage 7, Part A): every trip and stay says why.
//
// Each trip/away carries cause {type, criterion_ids, decision_id?,
// text} built where it was scheduled. Decision causes join real
// decision records; the ids cited always exist in the criteria file;
// causes are deterministic (same seed → byte-identical).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { tinyArea, tinyScenario } from "./engine-fixture.js";
import { CRITERIA_BY_ID } from "../src/engine/criteria.js";
import { canon } from "../src/engine/canonical.js";
import { simulate } from "../src/engine/simulate.js";

const sha = (run) => createHash("sha256").update(canon(run)).digest("hex");
const TYPES = new Set(["routine", "decision", "input"]);

function checkCause(run, item, where) {
  const c = item.cause;
  assert.ok(c, `${where}: missing cause`);
  assert.ok(TYPES.has(c.type), `${where}: bad cause type ${JSON.stringify(c.type)}`);
  assert.ok(Array.isArray(c.criterion_ids) && c.criterion_ids.length > 0,
    `${where}: cause needs ≥ 1 criterion id`);
  for (const id of c.criterion_ids) {
    assert.ok(CRITERIA_BY_ID.has(id), `${where}: unknown criterion ${id}`);
  }
  assert.equal(typeof c.text, "string");
  assert.ok(c.text.length > 0, `${where}: cause text is empty`);
  if (c.type === "decision") {
    assert.equal(typeof c.decision_id, "string", `${where}: decision cause needs decision_id`);
    assert.ok(run.decisions.some((d) => d.id === c.decision_id),
      `${where}: decision_id ${c.decision_id} not in the run`);
  }
}

describe("trip and stay causes", () => {
  for (const home of ["A", "B"]) {
    it(`every trip/stay on home ${home} carries a valid cause`, () => {
      const run = simulate(tinyArea(), tinyScenario(), home);
      assert.ok(run.trips.length > 0);
      assert.ok(run.aways.length > 0);
      for (const t of run.trips) checkCause(run, t, `trip ${t.id}`);
      for (const a of run.aways) checkCause(run, a, `away ${a.agent}:d${a.day}:${a.kind}`);
    });
  }

  it("commutes read as routine, errands with a branch as decision", () => {
    const run = simulate(tinyArea(), tinyScenario(), "A");
    const commutes = run.trips.filter((t) => t.agent === "h1" && t.purpose === "commute");
    assert.ok(commutes.length > 0);
    for (const t of commutes) {
      assert.equal(t.cause.type, "routine");
      assert.ok(t.cause.text.includes("근무일"), t.cause.text);
      assert.ok(t.cause.criterion_ids.includes("C-commute-depart"));
    }
    const errands = run.trips.filter((t) => t.agent === "h1" && t.purpose === "errand"
      && t.from.kind === "home");
    assert.ok(errands.length > 0);
    const judged = errands.filter((t) => t.cause.type === "decision");
    assert.ok(judged.length > 0, "tiny h1 errands should branch at least once");
    for (const t of judged) {
      const d = run.decisions.find((x) => x.id === t.cause.decision_id);
      assert.equal(d.kind, "shop_choice");
      assert.ok(t.cause.text.includes(d.options.find((o) => o.key === d.chosen_key).label));
    }
    const plain = errands.filter((t) => t.cause.type !== "decision");
    for (const t of plain) {
      assert.equal(t.cause.type, "input");
      assert.ok(t.cause.text.includes("고객 입력"), t.cause.text);
    }
  });

  it("weekend legs cite the weekend_plan decision", () => {
    const run = simulate(tinyArea(), tinyScenario(), "A");
    const wk = run.decisions.filter((d) => d.agent === "h1" && d.kind === "weekend_plan");
    assert.ok(wk.length > 0);
    for (const d of wk) {
      const legs = run.trips.filter((t) => t.agent === "h1" && t.day === d.day
        && t.cause.decision_id === d.id);
      assert.equal(legs.length, d.plan.length * 2); // out + back per activity
      for (const t of legs) {
        assert.equal(t.cause.type, "decision");
        assert.ok(t.cause.criterion_ids.includes("C-weekend-plan"));
      }
    }
  });

  it("causes are deterministic with the seed", () => {
    const a = simulate(tinyArea(), tinyScenario(), "A");
    const b = simulate(tinyArea(), tinyScenario(), "A");
    assert.equal(sha(a), sha(b));
    assert.deepEqual(a.trips.map((t) => t.cause), b.trips.map((t) => t.cause));
  });

  it("replays reproduce byte-identical causes with zero hook calls", () => {
    const area = tinyArea();
    const hook = (shell) => (shell.kind === "weekend_plan"
      ? ["park"] : shell.options[shell.options.length - 1].key);
    const hooked = simulate(area, tinyScenario(), "A", { decide: hook });
    const replayed = simulate(area, tinyScenario(), "A", { decisions: hooked.decisions });
    assert.deepEqual(replayed.trips, hooked.trips);
    assert.deepEqual(replayed.aways, hooked.aways);
  });
});
