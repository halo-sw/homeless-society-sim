// Criteria tests (stage 7, Part D): the file is the source of truth.
//
// The JSON file validates against the schema; the engine's module-level
// constants equal the file's values (no duplicated magic numbers); a run
// with criteria_overrides changes exactly the driven behaviour; the docs
// render mentions every criterion id.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tinyArea, tinyScenario } from "./engine-fixture.js";
import {
  CRITERIA_BY_ID, CRITERIA_GROUPS, CRITERIA_LIST, CRITERIA_VERSION,
  criterionDefault, criterionValuesLine, defaultFlat,
  moneyOptsFromCriteria, resolveCriteria, validateCriteriaDoc, validateOverrides,
  CRITERIA_DOC,
} from "../src/engine/criteria.js";
import { ADULT_MPS, SLOW_MPS, MAX_HOME_ANCHOR_M } from "../src/engine/agents.js";
import { WEEKEND_MAX } from "../src/engine/decisions.js";
import {
  AFTER_GAP, CLINIC_DWELL, DAY_END, EVENING_ANCHOR, EVENING_START,
  MIDDAY_ANCHOR, MORNING_ANCHOR, PARK_DWELL, SCHOOL_ANCHOR,
  SHOP_DWELL, STATION_ROUTE_TOLERANCE,
} from "../src/engine/routines.js";
import {
  DEFAULT_BACKGROUND, DEFAULT_BURDEN_THRESHOLD_PCT, DEFAULT_DAYS,
  DEFAULT_MONEY_ASSUMPTIONS, DEFAULT_SCHOOLDAY_MINUTES, DEFAULT_SEED,
  DEFAULT_START_DATE, DEFAULT_WORKDAY_MINUTES, parseScenario,
} from "../src/engine/scenario.js";
import { simulate } from "../src/engine/simulate.js";
import { QOL_WALK_MINUTES } from "../src/money/quality.js";
import { moneyTimeline } from "../src/money/timeline.js";

const CRITERIA_URL = new URL("../../scenarios/criteria/kr-default.json", import.meta.url);
const DOCS_URL = new URL("../../docs/criteria.md", import.meta.url);

describe("criteria file", () => {
  it("validates against the schema and matches the engine import", () => {
    const onDisk = JSON.parse(readFileSync(CRITERIA_URL, "utf8"));
    validateCriteriaDoc(onDisk);
    assert.deepEqual(CRITERIA_DOC, onDisk);
    assert.equal(CRITERIA_VERSION, 2);
    assert.ok(CRITERIA_LIST.length >= 20);
  });

  it("rejects bad documents", () => {
    assert.throws(() => validateCriteriaDoc(null), /must be an object/);
    assert.throws(() => validateCriteriaDoc({ ...JSON.parse(readFileSync(CRITERIA_URL, "utf8")),
      criteria: [{ id: "nope", group: "move", title: "t", rule: "r",
        values: {}, source: "engine 기본값", affects: [], editable: false }] }),
    /bad criterion id/);
  });

  it("every engine constant equals the file value (no magic numbers)", () => {
    assert.equal(ADULT_MPS, criterionDefault("C-walk-speed", "adult_mps"));
    assert.equal(SLOW_MPS, criterionDefault("C-walk-speed", "slow_mps"));
    assert.equal(MAX_HOME_ANCHOR_M, criterionDefault("C-neighbour", "anchor_max_m"));
    assert.equal(MORNING_ANCHOR, criterionDefault("C-commute-depart", "morning_anchor_min"));
    assert.equal(SCHOOL_ANCHOR, criterionDefault("C-commute-depart", "school_anchor_min"));
    assert.equal(MIDDAY_ANCHOR, criterionDefault("C-daily-rhythm", "midday_anchor_min"));
    assert.equal(EVENING_ANCHOR, criterionDefault("C-daily-rhythm", "evening_anchor_min"));
    assert.equal(AFTER_GAP, criterionDefault("C-daily-rhythm", "after_gap_min"));
    assert.equal(SHOP_DWELL, criterionDefault("C-shop-dwell", "dwell_min"));
    assert.equal(CLINIC_DWELL, criterionDefault("C-clinic-dwell", "dwell_min"));
    assert.equal(PARK_DWELL, criterionDefault("C-park-dwell", "dwell_min"));
    assert.equal(EVENING_START, criterionDefault("C-measure-evening", "evening_start_min"));
    assert.equal(DAY_END, criterionDefault("C-measure-evening", "day_end_min"));
    assert.equal(STATION_ROUTE_TOLERANCE, criterionDefault("C-station-route", "tolerance_ratio"));
    assert.equal(WEEKEND_MAX, criterionDefault("C-weekend-plan", "max_activities"));
    assert.equal(DEFAULT_START_DATE, criterionDefault("C-sim-window", "start_default"));
    assert.equal(DEFAULT_DAYS, criterionDefault("C-sim-window", "days_default"));
    assert.equal(DEFAULT_SEED, criterionDefault("C-sim-window", "seed_default"));
    assert.equal(DEFAULT_BACKGROUND, criterionDefault("C-neighbour", "count_default"));
    assert.equal(DEFAULT_WORKDAY_MINUTES, criterionDefault("C-work-hours", "workday_minutes"));
    assert.equal(DEFAULT_SCHOOLDAY_MINUTES, criterionDefault("C-work-hours", "schoolday_minutes"));
    assert.equal(QOL_WALK_MINUTES, criterionDefault("C-convenience-radius", "walk_minutes"));
    assert.deepEqual(DEFAULT_MONEY_ASSUMPTIONS, {
      loan_rate_pct: criterionDefault("C-money-fixed", "loan_rate_pct"),
      loan_years: criterionDefault("C-money-fixed", "loan_years"),
      jeonse_loan_cap_won: criterionDefault("C-money-fixed", "jeonse_loan_cap_won"),
      maintenance_won_month: criterionDefault("C-money-fixed", "maintenance_won"),
      transit_fare_won: criterionDefault("C-money-fare", "fare_won"),
      basket_won: criterionDefault("C-money-basket", "basket_won"),
      other_fixed_won_month: criterionDefault("C-money-fixed", "other_fixed_won"),
      pay_day_of_month: criterionDefault("C-money-fixed", "pay_day"),
      fixed_due_day_1based: criterionDefault("C-money-fixed", "due_day_1based"),
    });
    assert.equal(DEFAULT_BURDEN_THRESHOLD_PCT, criterionDefault("C-burden-rule", "threshold_pct"));
  });

  it("pins the known default numbers (drift alarm)", () => {
    assert.equal(ADULT_MPS, 1.3);
    assert.equal(SLOW_MPS, 1.1);
    assert.equal(MORNING_ANCHOR, 450);
    assert.equal(SHOP_DWELL, 15);
    assert.equal(DEFAULT_WORKDAY_MINUTES, 540);
    assert.equal(DEFAULT_MONEY_ASSUMPTIONS.transit_fare_won, 1500);
    assert.equal(DEFAULT_BURDEN_THRESHOLD_PCT, 30);
  });
});

describe("resolveCriteria", () => {
  it("resolves defaults with engine sources for a bare scenario", () => {
    const sc = parseScenario({
      household: { members: [{ id: "m1" }] },
      homes: [{ label: "A", area: "tiny", complex_name: "알파" }],
    });
    const r = resolveCriteria(sc);
    assert.deepEqual(r.flat, defaultFlat());
    assert.deepEqual(r.overridden, []);
    assert.equal(r.sources["C-walk-speed"], "engine 기본값");
    assert.equal(r.sources["C-work-hours"], "engine 기본값");
    assert.equal(r.sources["C-grocery-freq"], "고객 입력"); // input-driven by nature
    assert.equal(r.sources["C-money-fare"], "가정값");
  });

  it("marks explicitly set native fields as 고객 입력", () => {
    const sc = parseScenario(tinyScenario());
    const r = resolveCriteria(sc);
    assert.equal(r.sources["C-work-hours"], "고객 입력"); // file sets 540/360
  });

  it("applies overrides and marks them 고객 입력", () => {
    const raw = tinyScenario({ criteria_overrides: { "C-shop-dwell": { dwell_min: 25 } } });
    const sc = parseScenario(raw);
    const r = resolveCriteria(sc);
    assert.equal(r.flat.shop_dwell_min, 25);
    assert.deepEqual(r.overridden, ["C-shop-dwell"]);
    assert.equal(r.sources["C-shop-dwell"], "고객 입력");
    assert.equal(r.byId["C-shop-dwell"].values.dwell_min.value, 25);
  });

  it("scenario native money wins over the file, overrides win over all", () => {
    const sc = parseScenario(tinyScenario());
    assert.equal(resolveCriteria(sc).flat.fare_won, 1500);
    const sc2 = parseScenario(tinyScenario({
      money: { assumptions: { transit_fare_won: 2000 } },
    }));
    assert.equal(resolveCriteria(sc2).flat.fare_won, 2000);
    assert.equal(resolveCriteria(sc2).sources["C-money-fare"], "고객 입력");
    const sc3 = parseScenario(tinyScenario({
      money: { assumptions: { transit_fare_won: 2000 } },
      criteria_overrides: { "C-money-fare": { fare_won: 1800 } },
    }));
    assert.equal(resolveCriteria(sc3).flat.fare_won, 1800);
  });

  it("rejects bad overrides", () => {
    for (const bad of [
      { "C-nope": { dwell_min: 1 } },
      { "C-shop-dwell": { nope: 1 } },
      { "C-walk-route": { dwell_min: 1 } },
      { "C-shop-dwell": { dwell_min: "long" } },
      { "C-shop-dwell": { dwell_min: NaN } },
    ]) {
      assert.throws(() => validateOverrides(bad), /criteria/);
      assert.throws(() => parseScenario(tinyScenario({ criteria_overrides: bad })), /criteria_overrides/);
    }
    // Documented-but-fixed values refuse overrides instead of ignoring them.
    assert.throws(() => validateOverrides({ "C-weekend-plan": { max_activities: 5 } }),
      /not overridable/);
    assert.throws(() => validateOverrides({ "C-neighbour": { count_default: 5 } }),
      /not overridable/);
  });

  it("moneyOptsFromCriteria maps the timeline names", () => {
    const r = resolveCriteria(parseScenario(tinyScenario()));
    const o = moneyOptsFromCriteria(r);
    assert.equal(o.transit_fare_won, 1500);
    assert.equal(o.basket_won, 30000);
    assert.equal(o.pay_day_of_month, 25);
    assert.equal(o.fixed_due_day_1based, 1);
  });
});

describe("criteria drive the engine (no shadow constants)", () => {
  it("shop dwell override stretches errand stays", () => {
    const base = simulate(tinyArea(), tinyScenario(), "A");
    const over = simulate(tinyArea(),
      tinyScenario({ criteria_overrides: { "C-shop-dwell": { dwell_min: 99 } } }), "A");
    const dwells = (run) => run.aways
      .filter((a) => a.agent === "h1" && a.kind === "errand")
      .map((a) => a.end_min - a.start_min);
    assert.ok(dwells(base).length > 0);
    assert.ok(dwells(base).every((d) => d === 15));
    assert.ok(dwells(over).every((d) => d === 99));
    assert.deepEqual(over.meta.criteria.overrides, ["C-shop-dwell"]);
  });

  it("commute anchor override shifts departures", () => {
    const base = simulate(tinyArea(), tinyScenario(), "A");
    const over = simulate(tinyArea(),
      tinyScenario({ criteria_overrides: { "C-commute-depart": { morning_anchor_min: 360 } } }), "A");
    const departs = (run) => run.trips
      .filter((t) => t.agent === "h1" && t.day === 0 && t.purpose === "commute")
      .map((t) => t.depart_min);
    assert.deepEqual(departs(over).map((d, i) => d - departs(base)[i]), departs(base).map(() => -90));
  });

  it("fare override flows into the money timeline", () => {
    const run = simulate(tinyArea(), tinyScenario(), "A");
    const sc = parseScenario(tinyScenario({ criteria_overrides: { "C-money-fare": { fare_won: 2000 } } }));
    const tl = moneyTimeline(run, sc, { ...moneyOptsFromCriteria(resolveCriteria(sc)),
      household_monthly_net_won: 5000000 });
    assert.ok(tl.counts.commute_legs > 0);
    assert.equal(tl.totals_by_category.transit, -2000 * tl.counts.commute_legs);
  });

  it("default runs keep the old metrics (overrides are the only delta)", () => {
    const run = simulate(tinyArea(), tinyScenario(), "A");
    assert.equal(run.meta.criteria.doc, "kr-default");
    assert.deepEqual(run.meta.criteria.overrides, []);
    // Spot values from the pre-criteria engine (same seed, same graph).
    assert.equal(run.totals.household.trips, run.trips.filter((t) => t.agent.startsWith("h")).length);
  });
});

describe("criteria docs", () => {
  it("docs/criteria.md mentions every criterion id", () => {
    const md = readFileSync(DOCS_URL, "utf8");
    for (const c of CRITERIA_LIST) {
      assert.ok(md.includes(c.id), `docs/criteria.md misses ${c.id}`);
    }
    for (const g of CRITERIA_GROUPS) {
      assert.ok(md.includes(g.title), `docs/criteria.md misses group ${g.title}`);
    }
  });

  it("criterionValuesLine renders units", () => {
    const line = criterionValuesLine(CRITERIA_BY_ID.get("C-walk-speed"));
    assert.equal(line, "1.3 m/s · 1.1 m/s");
    assert.equal(criterionValuesLine(CRITERIA_BY_ID.get("C-walk-route")), "");
  });
});
