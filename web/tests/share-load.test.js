// Stage 11b share card: opening the dialog (or landing on the tour's
// share step) loads the compare + money docs first, shows a short
// loading state, then renders numbers — never a column of "—".

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createStore } from "../src/ui/store.js";
import { resultCardData, requestShareLoads,
  shareLoadPlan } from "../src/ui/share.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");

function homeFixture(o) {
  return {
    complex_name: o.complex, area_m2: o.area,
    by_tenure: {
      "전세": {
        housing: { monthly_won: o.monthly, source: "rtms" },
        remaining_won: o.remaining, burden_ratio: o.burden,
      },
    },
    qol_time: { commute_minutes_per_day: o.day,
      commute_ride_minutes_per_day: o.ride,
      commute_walk_minutes_per_day: o.walk,
      evening_at_home_minutes_per_day: o.eve },
    qol_fatigue: { arrival_work_avg: o.fatigue,
      peak_congestion_pct: o.peakPct ?? null,
      peak_congestion_ctx: o.peakCtx ?? null },
    qol_convenience: { grocery: o.grocery, clinic: o.clinic, station: o.station },
    jeonse_check: o.jeonseRatio === null
      ? { computable: false }
      : { computable: true, ratio_pct: o.jeonseRatio,
        band: { key: "below", label: "70% 미만 (참고선 아래)" } },
  };
}

const MONEY = {
  days: 30,
  homes: {
    A: homeFixture({ complex: "레이크팰리스", area: 59.97,
      monthly: 2600000, remaining: 3349468, burden: 0.36,
      day: 125.3, ride: 88, walk: 37.3, eve: 645.9, fatigue: 25.3,
      peakPct: 93.2,
      peakCtx: { pct: 93.2, line: "2호선", station: "잠실", source: "서울교통공사" },
      grocery: 2, clinic: 1, station: 0, jeonseRatio: 37 }),
    B: homeFixture({ complex: "백현마을", area: 84.82,
      monthly: 2500000, remaining: 4061468, burden: 0.346,
      day: 48.4, ride: 0, walk: 48.4, eve: 685.8, fatigue: 5.7,
      grocery: 0, clinic: 0, station: 0, jeonseRatio: 37.7 }),
  },
};

const COMPARE = {
  metrics: [
    { key: "walk_minutes", a: 1669.8, b: 2282.6 },
    { key: "commute_ride_minutes", a: 2640, b: 0 },
    { key: "home_evening_minutes", a: 19376, b: 20575 },
  ],
};

describe("share load plan (stage 11b)", () => {
  it("needs both docs from an empty store", () => {
    const plan = shareLoadPlan(createStore().getState());
    assert.equal(plan.needsCompare, true);
    assert.equal(plan.needsMoney, true);
    assert.equal(plan.loading, true);
    assert.equal(plan.ready, false);
  });

  it("waits while a load is in flight, then renders", () => {
    const flying = shareLoadPlan({ compareLoading: true });
    assert.equal(flying.needsCompare, false);
    assert.equal(flying.needsMoney, true);
    assert.equal(flying.loading, true);
    assert.equal(flying.ready, false);
    const ready = shareLoadPlan({ compare: COMPARE, money: MONEY });
    assert.equal(ready.needsCompare, false);
    assert.equal(ready.needsMoney, false);
    assert.equal(ready.loading, false);
    assert.equal(ready.ready, true);
  });

  it("a failed load renders instead of spinning", () => {
    const plan = shareLoadPlan({ compare: COMPARE, money: { error: "boom" } });
    assert.equal(plan.failed, true);
    assert.equal(plan.loading, false);
    assert.equal(plan.ready, false);
    assert.equal(plan.needsMoney, true);
  });

  it("open-share with an empty store triggers the scene loads", () => {
    const s = createStore();
    let calls = 0;
    s.registerActions({ ensureShareData: () => { calls++; } });
    const plan = requestShareLoads(s);
    assert.equal(calls, 1);
    assert.equal(plan.needsCompare, true);
    assert.equal(plan.needsMoney, true);
    // With both docs present, opening triggers nothing.
    s.set({ compare: COMPARE, money: MONEY });
    requestShareLoads(s);
    assert.equal(calls, 1);
  });

  it("is a safe no-op without the scene action", () => {
    const s = createStore(); // no actions registered (tour boot)
    const plan = requestShareLoads(s);
    assert.equal(plan.needsCompare, true);
    assert.equal(requestShareLoads(null).needsMoney, true);
  });
});

describe("share rows with the demo fixtures (stage 11b)", () => {
  const data = resultCardData({ money: MONEY, compare: COMPARE,
    tenures: { A: "전세", B: "전세" },
    scenarioName: "demo-two-homes", simStart: "2026-11-02", simDays: 30,
    date: "2026-10-29" });
  const blank = (v) => v === "–" || v === "—";

  it("has A and B values wherever the data has a value", () => {
    // 18d item 7 added the 월 주거비 (monthly_housing) row: 12 -> 13.
    assert.equal(data.rows.length, 13);
    for (const r of data.rows) {
      if (r.id === "peak") {
        // B never rides: only this cell is honestly blank.
        assert.equal(blank(r.a), false, `${r.id}.a`);
        assert.equal(r.b, "–", "peak.b has no B ride to describe");
        continue;
      }
      assert.equal(blank(r.a), false, `${r.id}.a should show a number`);
      assert.equal(blank(r.b), false, `${r.id}.b should show a number`);
    }
  });

  it("wires the dialog, the loaders and the loading state", () => {
    const dialog = readFileSync(join(ROOT, "web/src/ui/share.jsx"), "utf8");
    assert.ok(dialog.includes("requestShareLoads(store)"),
      "open triggers the missing loads");
    assert.ok(dialog.includes("selectShareData(store.getState())"),
      "card re-renders when the docs arrive");
    assert.ok(dialog.includes("비교 숫자 불러오는 중"),
      "short loading state before the numbers");
    const main = readFileSync(join(ROOT, "web/src/main.js"), "utf8");
    assert.ok(main.includes("ensureShareData"),
      "scene reuses the compare/money loaders for the dialog");
  });
});
