import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canon, canonNumber } from "../src/engine/canonical.js";
import { compare, simulate } from "../src/engine/simulate.js";
import { tinyArea, tinyScenario, WALK } from "./engine-fixture.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const sha = (run) => createHash("sha256").update(canon(run)).digest("hex");
const speedOf = (run, key) => {
  const a = run.agents.find((x) => x.key === key);
  return a.role === "adult" ? 1.3 : 1.1;
};

describe("engine simulate (fixture)", () => {
  it("runs the household + background with recorded paths", () => {
    const run = simulate(tinyArea(), tinyScenario(), "A");
    assert.equal(run.meta.agents, 7);
    assert.equal(run.meta.household, 2);
    assert.equal(run.meta.background, 5);
    assert.equal(run.meta.home_node, "a");
    assert.ok(run.trips.length > 50);
    assert.ok(run.decisions.length > 20);
    const kinds = new Set(run.decisions.map((d) => d.kind));
    assert.deepEqual([...kinds].sort(), ["park_or_home", "shop_choice", "station_route"]);
    // Background labels are never real names.
    for (const a of run.agents.filter((x) => !x.household)) {
      assert.match(a.label, /^주민 \d\d$/);
    }
  });

  it("derives trip times from graph length / speed", () => {
    const run = simulate(tinyArea(), tinyScenario(), "A");
    const edgeLen = new Map(WALK.map((e) => [`${e.from}>${e.to}`, e.length_m]));
    for (const t of run.trips) {
      const speed = speedOf(run, t.agent);
      let sum = 0;
      for (let i = 0; i < t.path.length - 1; i++) {
        const k = `${t.path[i]}>${t.path[i + 1]}`;
        assert.ok(edgeLen.has(k), `trip ${t.id} step ${k} must be a walk edge`);
        sum += edgeLen.get(k);
      }
      assert.ok(Math.abs(sum - t.distance_m) < 0.011, `trip ${t.id}: path sum ${sum} vs ${t.distance_m}`);
      const wantMin = Math.round((sum / speed / 60) * 10) / 10;
      assert.ok(Math.abs(wantMin - t.minutes) < 1e-9, `trip ${t.id}: ${t.minutes} vs ${wantMin}`);
      assert.ok(t.depart_min < t.arrive_min);
      assert.ok(["home", "poi"].includes(t.from.kind) && ["home", "poi"].includes(t.to.kind));
    }
  });

  it("builds decision records with graph-backed options", () => {
    const run = simulate(tinyArea(), tinyScenario(), "A");
    // station_route: 100 m vs 110 m entrances, within 20 %.
    const sr = run.decisions.filter((d) => d.kind === "station_route" && d.agent === "h1");
    assert.equal(sr.length, 5); // Mon–Fri commutes
    assert.deepEqual(sr[0].options.map((o) => o.minutes), [1.3, 1.4]);
    assert.deepEqual(sr[0].options.map((o) => o.distance_m), [100, 110]);
    assert.equal(sr[0].default_key, "s0");
    assert.equal(sr[0].chosen_by, "rule");
    // shop_choice: 3 supermarkets by graph time.
    const sc = run.decisions.find((d) => d.kind === "shop_choice" && d.agent === "h1");
    assert.equal(sc.options.length, 3);
    assert.deepEqual(sc.options.map((o) => o.key), ["s0", "s1", "s2"]);
    // park_or_home: scheduled defaults (m1: 2 park days, m2: 1).
    const parks = (agent) => run.decisions.filter((d) => d.kind === "park_or_home" && d.agent === agent);
    assert.equal(parks("h1").length, 7);
    assert.equal(parks("h1").filter((d) => d.default_key === "park").length, 2);
    assert.equal(parks("h2").filter((d) => d.default_key === "park").length, 1);
    assert.deepEqual(parks("h1")[0].options.map((o) => o.key).sort(), ["home", "park"]);
  });

  it("summarises per-day per-member numbers", () => {
    const run = simulate(tinyArea(), tinyScenario(), "A");
    const h1 = run.daily.find((d) => d.agent === "h1");
    assert.equal(h1.days.length, 7);
    assert.equal(h1.days[0].weekday, "Mon");
    assert.equal(h1.days[0].date, "2026-11-02");
    for (const s of h1.days) {
      for (const k of ["walk_minutes", "commute_away_minutes", "errands_done", "home_evening_minutes", "trips"]) {
        assert.ok(Number.isFinite(s[k]), `daily.${k}`);
      }
      assert.ok(s.home_evening_minutes >= 0 && s.home_evening_minutes <= 360);
    }
    // A workday commute is away 20 + 540 + 20 minutes.
    assert.equal(h1.days[0].commute_away_minutes, 580);
    assert.equal(h1.days[5].commute_away_minutes, 0); // Saturday
    assert.ok(run.totals.household.walk_minutes > 0);
  });

  it("skips unreachable categories as unavailable (never invented)", () => {
    // Unknown station name.
    const s1 = tinyScenario();
    s1.household.members[0].work.station_name = "없는역";
    const r1 = simulate(tinyArea(), s1, "A");
    const un1 = r1.unavailable.filter((u) => u.agent === "h1" && u.category === "station");
    assert.equal(un1.length, 5);
    assert.equal(un1[0].detail, "없는역");
    assert.equal(r1.trips.filter((t) => t.agent === "h1" && t.purpose === "commute").length, 0);
    // No reachable clinic.
    const area2 = tinyArea();
    area2.pois = area2.pois.filter((p) => p.id !== "cli1" && p.id !== "iso1");
    const r2 = simulate(area2, tinyScenario(), "A");
    assert.ok(r2.unavailable.some((u) => u.agent === "h1" && u.category === "clinic"));
    // No supermarket at all.
    const area3 = tinyArea();
    area3.pois = area3.pois.filter((p) => p.category !== "shop:supermarket");
    const r3 = simulate(area3, tinyScenario(), "A");
    assert.ok(r3.unavailable.some((u) => u.agent === "h1" && u.category === "supermarket"));
  });

  it("supports local_poi and no-commute work", () => {
    const s = tinyScenario();
    s.household.members[0].work = { type: "local_poi", name: "슈퍼1" };
    s.household.members[1].work = { type: "none" };
    const run = simulate(tinyArea(), s, "A");
    const trips = run.trips.filter((t) => t.agent === "h1" && t.purpose === "commute");
    assert.ok(trips.length > 0);
    assert.ok(trips.every((t) => t.to.id === "sup1" || t.from.id === "sup1"));
    assert.ok(!run.unavailable.some((u) => u.agent === "h1" && u.activity === "commute"));
  });

  it("replays decision files with zero hook calls", () => {
    let calls1 = 0;
    const hook1 = (rec) => {
      calls1++;
      return rec.options[rec.options.length - 1].key; // always the last option
    };
    const run1 = simulate(tinyArea(), tinyScenario(), "A", { decide: hook1 });
    assert.ok(calls1 > 0);
    assert.ok(run1.decisions.every((d) => d.chosen_by === "hook"));
    let calls2 = 0;
    const run2 = simulate(tinyArea(), tinyScenario(), "A", {
      decisions: run1.decisions,
      decide: () => {
        calls2++;
        return "s0";
      },
    });
    assert.equal(calls2, 0);
    assert.ok(run2.decisions.every((d) => d.chosen_by === "replay"));
    assert.deepEqual(run2.trips, run1.trips);
    assert.deepEqual(run2.aways, run1.aways);
    assert.throws(() => simulate(tinyArea(), tinyScenario(), "A", {
      decisions: [{ id: "bogus", chosen_key: "s0" }],
    }), /not in the decisions file/);
  });

  it("is byte-identical across runs (sha256 of canonical JSON)", () => {
    const a = simulate(tinyArea(), tinyScenario(), "A");
    const b = simulate(tinyArea(), tinyScenario(), "A");
    assert.equal(sha(a), sha(b));
  });

  it("changes background routines but not graph distances with the seed", () => {
    const s1 = tinyScenario();
    const s2 = tinyScenario();
    s2.seed = 43;
    const r1 = simulate(tinyArea(), s1, "A");
    const r2 = simulate(tinyArea(), s2, "A");
    const homes = (r) => r.agents.filter((x) => !x.household).map((x) => x.home_building).join();
    assert.notEqual(homes(r1), homes(r2));
    const dist = (r) => {
      const m = new Map();
      for (const t of r.trips.filter((x) => x.agent === "h1" || x.agent === "h2")) {
        m.set(`${t.agent}:${t.from.id}>${t.to.id}`, t.distance_m);
      }
      return m;
    };
    const m1 = dist(r1);
    const m2 = dist(r2);
    assert.ok(m1.size > 0);
    for (const [k, v] of m1) {
      if (m2.has(k)) assert.equal(m2.get(k), v, `OD ${k} keeps its graph distance`);
    }
  });

  it("compares homes with numbers + units only", () => {
    const runA = simulate(tinyArea(), tinyScenario(), "A");
    const runB = simulate(tinyArea(), tinyScenario(), "B");
    const cmp = compare(runA, runB);
    assert.equal(cmp.home_a.complex, "알파");
    assert.equal(cmp.home_b.complex, "베타");
    for (const m of cmp.metrics) {
      assert.ok(typeof m.key === "string" && typeof m.label === "string");
      assert.ok(["minutes", "metres", "count"].includes(m.unit), m.unit);
      assert.ok(["graph", "scenario"].includes(m.source), m.source);
      assert.ok(Number.isFinite(m.a) && Number.isFinite(m.b));
      assert.equal(m.delta_b_minus_a, Math.round((m.b - m.a) * 10) / 10);
    }
    // No forbidden keys anywhere (price, score, safety, rank).
    const bad = [];
    const walk = (v) => {
      if (Array.isArray(v)) return v.forEach(walk);
      if (v && typeof v === "object") {
        for (const k of Object.keys(v)) {
          if (/price|score|safety|rank/i.test(k)) bad.push(k);
          walk(v[k]);
        }
      }
    };
    walk(cmp);
    assert.deepEqual(bad, []);
  });
});

describe("canonical json", () => {
  it("sorts keys and formats numbers", () => {
    assert.equal(canon({ b: 1, a: { d: 2, c: 1 } }), '{"a":{"c":1,"d":2},"b":1}');
    assert.equal(canonNumber(0.1 + 0.2), "0.3");
    assert.equal(canonNumber(7), "7");
    assert.equal(canon([3.14159, 2]), "[3.142,2]");
  });
});

describe("engine (real data)", () => {
  async function loadArea(areaId) {
    const dir = join(HERE, "..", "..", "data", "build", areaId);
    const area = JSON.parse(await readFile(join(dir, "area.json"), "utf-8"));
    for (const [key, value] of Object.entries(area)) {
      if (value && typeof value === "object" && !Array.isArray(value) && value.$ref) {
        area[key] = JSON.parse(await readFile(join(dir, value.$ref), "utf-8"));
      }
    }
    return area;
  }

  function demo(days = 2, background = 5) {
    return {
      name: "demo-test", start_date: "2026-11-02", days, seed: 20261102, background,
      workday_minutes: 540, schoolday_minutes: 360,
      household: {
        members: [
          { id: "m1", role: "adult", workdays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
            work: { type: "station_ride", station_name: { A: "잠실", B: "판교" },
              ride_minutes: 30, ride_minutes_source: "user_assumption", needs_user_input: true },
            errands_per_week: { supermarket: 1, convenience: 1 }, park_walks_per_week: 1,
            clinic_visits_per_month: 1 },
        ],
      },
      homes: [
        { label: "A", area: "songpa-jamsil", complex_name: "레이크팰리스" },
        { label: "B", area: "pangyo", complex_name: "백현마을" },
      ],
    };
  }

  it("runs home A on real jamsil data", async () => {
    const area = await loadArea("songpa-jamsil");
    const run = simulate(area, demo(), "A");
    assert.equal(run.meta.agents, 6);
    assert.equal(run.meta.complex, "레이크팰리스");
    assert.ok(run.trips.length > 20);
    assert.ok(run.decisions.length > 10);
    const edgeSet = new Set(area.graph.edges.walk.map((e) => `${e.from}>${e.to}`));
    for (const t of run.trips) {
      for (let i = 0; i < t.path.length - 1; i++) {
        assert.ok(edgeSet.has(`${t.path[i]}>${t.path[i + 1]}`), "trip follows walk edges");
      }
    }
    assert.ok(run.trips.some((t) => t.agent === "h1" && t.purpose === "commute" && t.to.label === "잠실"));
  });

  it("branches station entrances on real pangyo data", async () => {
    const area = await loadArea("pangyo");
    const run = simulate(area, demo(), "B");
    assert.equal(run.meta.complex, "백현마을");
    const sr = run.decisions.filter((d) => d.kind === "station_route" && d.agent === "h1");
    assert.equal(sr.length, 2); // two workdays, two 판교 entrances
    assert.ok(sr.every((d) => d.options.length === 2));
  });
});
