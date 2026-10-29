// Stage 15, part 1: paired runs, 10 repeats, route-independent draws.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tinyArea, tinyScenario } from "./engine-fixture.js";
import { buildAgents, planSchedule, WEEKEND_WISH_KEYS } from "../src/engine/agents.js";
import { Router } from "../src/engine/graph.js";
import { homeOf, parseScenario, resolveHome } from "../src/engine/scenario.js";
import { simulate } from "../src/engine/simulate.js";
import { canon } from "../src/engine/canonical.js";
import { aggregateSummaries, defaultSeeds, runPaired, summarizeValues } from "../src/engine/paired.js";

const sorted = (set) => [...set].sort((a, b) => a - b);

function schedulesFor(homeLabel) {
  const sc = parseScenario(tinyScenario({ background: 0 }));
  const area = tinyArea();
  const router = new Router(area.graph);
  const home = resolveHome(area, homeOf(sc, homeLabel), router);
  const agents = buildAgents(area, sc, home, home.nodeId, router);
  return { sc, agents };
}

describe("paired schedules (stage 15.1)", () => {
  it("draws identical schedules for A and B with the same seed", () => {
    const a = schedulesFor("A");
    const b = schedulesFor("B");
    for (const key of ["h1", "h2"]) {
      const sa = planSchedule(a.agents.find((x) => x.key === key), a.sc);
      const sb = planSchedule(b.agents.find((x) => x.key === key), b.sc);
      assert.deepEqual(sorted(sa.errands.supermarket), sorted(sb.errands.supermarket));
      assert.deepEqual(sorted(sa.errands.convenience), sorted(sb.errands.convenience));
      assert.deepEqual(sorted(sa.parkDays), sorted(sb.parkDays));
      assert.deepEqual(sorted(sa.clinicDays), sorted(sb.clinicDays));
      assert.deepEqual(sa.departJitter, sb.departJitter);
      assert.deepEqual([...sa.weekendWishes.entries()], [...sb.weekendWishes.entries()]);
    }
    // The 7-day fixture starts on a Monday: wishes on Sat + Sun only.
    const s = planSchedule(a.agents[0], a.sc);
    assert.deepEqual([...s.weekendWishes.keys()], [5, 6]);
    for (const w of s.weekendWishes.values()) assert.ok(WEEKEND_WISH_KEYS.includes(w));
  });

  it("keeps jitter and wishes independent of errand frequencies", () => {
    const sc = parseScenario(tinyScenario({ background: 0 }));
    const mk = (supermarket, convenience) => ({
      key: "h1", errands_per_week: { supermarket, convenience },
      park_walks_per_week: 2, clinic_visits_per_month: 1,
    });
    const s1 = planSchedule(mk(1, 1), sc);
    const s2 = planSchedule(mk(5, 4), sc);
    assert.deepEqual(s1.departJitter, s2.departJitter);
    assert.deepEqual([...s1.weekendWishes.entries()], [...s2.weekendWishes.entries()]);
    assert.deepEqual(sorted(s1.parkDays), sorted(s2.parkDays));
  });

  it("records the wish on weekend_plan decisions", () => {
    const run = simulate(tinyArea(), tinyScenario({ background: 0 }), "A");
    const wk = run.decisions.filter((d) => d.kind === "weekend_plan");
    assert.ok(wk.length > 0);
    for (const d of wk) assert.ok(WEEKEND_WISH_KEYS.includes(d.wish), `wish ${d.wish}`);
  });
});

describe("runPaired (stage 15.1)", () => {
  it("defaults to 10 seeds from scenario.seed", () => {
    assert.deepEqual(defaultSeeds({ seed: 100 }),
      [100, 101, 102, 103, 104, 105, 106, 107, 108, 109]);
  });

  it("summarises 10 runs with n == 10 and min <= mean <= max", () => {
    const paired = runPaired({ A: tinyArea(), B: tinyArea() },
      tinyScenario({ days: 7, background: 0 }));
    assert.equal(paired.seeds.length, 10);
    assert.equal(paired.runs.length, 10);
    assert.deepEqual(paired.seeds, defaultSeeds({ seed: 42 }));
    for (const label of ["A", "B"]) {
      for (const metric of ["commute_minutes_per_day", "fatigue"]) {
        const s = paired.summary[label][metric];
        assert.equal(s.n, 10, `${label}.${metric}.n`);
        assert.ok(s.min <= s.mean && s.mean <= s.max, `${label}.${metric} order`);
      }
      // Same seed, same household: every run carries both homes.
      for (const pair of paired.runs) {
        assert.equal(pair[label].meta.seed, pair.seed);
        assert.equal(pair[label].meta.home, label);
      }
    }
  });

  it("uses the decider only for run 1; runs 2+ are rule runs (일정)", () => {
    let calls = 0;
    const decide = (shell) => {
      calls++;
      return shell.default_key;
    };
    const paired = runPaired({ A: tinyArea() },
      tinyScenario({ days: 7, background: 0 }), { decide, seeds: [11, 12, 13] });
    const run1 = paired.runs[0].A;
    assert.ok(run1.decisions.length > 0);
    assert.ok(run1.decisions.every((d) => d.chosen_by === "hook"));
    assert.ok(run1.decisions.every((d) => d.decided_by === "에이전트"));
    assert.equal(calls, run1.decisions.length);
    for (const pair of paired.runs.slice(1)) {
      assert.ok(pair.A.decisions.length > 0);
      assert.ok(pair.A.decisions.every((d) => d.chosen_by === "rule"));
      assert.ok(pair.A.decisions.every((d) => d.decided_by === "일정"));
    }
  });

  it("keeps a judged run byte-identical to its replay", () => {
    const modelHook = (shell) => ({
      ...(shell.kind === "weekend_plan" ? { plan: [shell.default_key] } : { chosen_key: shell.default_key }),
      chosen_by: "model",
      reason_ko: "판단 기록", reason_en: "judged",
      provider: "meta", model: "muse-spark-test",
      usage: { prompt_tokens: 3, completion_tokens: 1 }, latency_ms: 5,
    });
    const judged = simulate(tinyArea(), tinyScenario({ background: 0 }), "A", { decide: modelHook });
    assert.ok(judged.decisions.every((d) => d.chosen_by === "model"));
    assert.ok(judged.decisions.every((d) => d.decided_by === "에이전트"));
    const replayed = simulate(tinyArea(), tinyScenario({ background: 0 }), "A",
      { decisions: judged.decisions });
    assert.equal(canon(replayed), canon(judged));
  });

  it("replays entries without decided_by by inferring it", () => {
    const strip = (decisions) => structuredClone(decisions).map((d) => {
      delete d.decided_by;
      return d;
    });
    const ruled = simulate(tinyArea(), tinyScenario({ background: 0 }), "A");
    const r1 = simulate(tinyArea(), tinyScenario({ background: 0 }), "A",
      { decisions: strip(ruled.decisions) });
    assert.ok(r1.decisions.every((d) => d.decided_by === "일정"));
    const modelHook = (shell) => ({
      ...(shell.kind === "weekend_plan" ? { plan: [shell.default_key] } : { chosen_key: shell.default_key }),
      chosen_by: "model", reason_ko: "판단 기록",
    });
    const judged = simulate(tinyArea(), tinyScenario({ background: 0 }), "A", { decide: modelHook });
    const r2 = simulate(tinyArea(), tinyScenario({ background: 0 }), "A",
      { decisions: strip(judged.decisions) });
    assert.ok(r2.decisions.every((d) => d.decided_by === "에이전트"));
  });

  it("aggregates per-tenure sub-metrics", () => {
    const perRun = [
      { A: { grocery_won: 100, remaining_won_per_month: { 전세: 10, 매매: 5 } } },
      { A: { grocery_won: 200, remaining_won_per_month: { 전세: 30, 매매: 15 } } },
    ];
    const s = aggregateSummaries(perRun, ["A"]);
    assert.deepEqual(s.A.grocery_won, { mean: 150, min: 100, max: 200, n: 2 });
    assert.deepEqual(s.A.remaining_won_per_month.전세, { mean: 20, min: 10, max: 30, n: 2 });
    assert.deepEqual(summarizeValues([], "x"), { mean: null, min: null, max: null, n: 0 });
  });
});
