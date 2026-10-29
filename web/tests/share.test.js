// Stage 11: the share card shows the A/B comparison — header (persona,
// homes with area, 만든 날 vs 시뮬레이션 기간), twelve rows with demo
// numbers, priorities as bars, disclaimer. No verdict, ever.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildCompareRows, resultCardData, shareSourceKo,
  SHARE_DISCLAIMER, SHARE_ROW_IDS, personaTitleFor } from "../src/ui/share.js";
import { BANNED_LABEL_JARGON, ALLOWED_LONG_PHRASES } from "../src/ui/copy.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");

// Fixture with the real demo-two-homes numbers (used when data/build is
// absent — it is gitignored — and as exact-value assertions regardless).
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
      commute_ride_minutes_per_day: o.ride, commute_walk_minutes_per_day: o.walk,
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

const PRIORITIES = { groups: [{ id: "money", title: "돈" }, { id: "edu", title: "교육" }] };
const WEIGHTS = { explicit: true, weights: { money: 5, edu: 2 } };

function demoData() {
  return resultCardData({
    money: MONEY, compare: COMPARE,
    tenures: { A: "전세", B: "전세" },
    priorities: PRIORITIES, weights: WEIGHTS,
    scenarioName: "demo-two-homes",
    householdLine: "구성원 1 (어른) · 구성원 2 (어른)",
    simStart: "2026-11-02", simDays: 30,
    date: "2026-10-29",
  });
}

const rowById = (data, id) => data.rows.find((r) => r.id === id);

describe("result card header", () => {
  it("shows homes, 만든 날 and 시뮬레이션 기간 separately", () => {
    const data = demoData();
    assert.equal(data.title, "우리 집 비교 결과");
    assert.equal(data.createdDay, "2026-10-29");
    assert.equal(data.date, "2026-10-29");
    assert.equal(data.simPeriod.label, "시뮬레이션 기간 2026-11-02부터 30일");
    assert.deepEqual(data.homes.map((h) => h.headline), [
      "A 레이크팰리스 · 59.97㎡ (전세)",
      "B 백현마을 · 84.82㎡ (전세)",
    ]);
    assert.equal(data.household, "구성원 1 (어른) · 구성원 2 (어른)");
    assert.equal(data.disclaimer, SHARE_DISCLAIMER);
  });

  it("resolves persona titles from scenario names", () => {
    assert.equal(personaTitleFor("single-firstjob"), "1인 사회초년생");
    assert.equal(personaTitleFor("persona-newlywed-couple"), "예비·신혼부부");
    assert.equal(personaTitleFor("x_dual-income-child"), "맞벌이 + 초등학생 자녀");
    assert.equal(personaTitleFor("demo-two-homes"), "");
    assert.equal(personaTitleFor(""), "");
    const data = resultCardData({ money: MONEY, scenarioName: "persona-newlywed-couple",
      simStart: "2026-11-02", simDays: 30, date: "2026-10-29" });
    assert.equal(data.persona, "예비·신혼부부");
  });
});

describe("result card comparison rows", () => {
  it("contains all twelve rows with the demo numbers", () => {
    const data = demoData();
    assert.deepEqual(data.rows.map((r) => r.id), SHARE_ROW_IDS);
    const eq = (id, a, b) => {
      const r = rowById(data, id);
      assert.equal(r.a, a, `${id}.a`);
      assert.equal(r.b, b, `${id}.b`);
    };
    eq("commute_mode", "차·지하철 + 도보", "도보");
    eq("commute_day", "2시간 5분", "48분");
    eq("ride_30d", "44시간", "0분");
    eq("walk_30d", "27시간 50분", "38시간 3분");
    eq("fatigue_arrival", "25.3", "5.7");
    eq("peak", "2호선 잠실 혼잡도 93.2%, 서서 감 (실측)", "–");
    eq("housing", "월 260만 원", "월 250만 원");
    eq("burden", "36%", "34.6%");
    eq("remaining", "월 334만 9,468 원", "월 406만 1,468 원");
    eq("jeonse_ratio", "37% (70% 미만 (참고선 아래))", "37.7% (70% 미만 (참고선 아래))");
    eq("convenience", "3곳", "0곳");
    eq("evening_30d", "322시간 56분", "342시간 55분");
  });

  it("marks the lower side neutrally, never a winner", () => {
    const data = demoData();
    const lower = Object.fromEntries(data.rows.map((r) => [r.id, r.lowerSide]));
    assert.deepEqual(lower, {
      commute_mode: null, commute_day: "B", ride_30d: "B", walk_30d: "A",
      fatigue_arrival: "B", peak: null, housing: "B", burden: "B",
      remaining: "A", jeonse_ratio: "A", convenience: "B", evening_30d: "A",
    });
    const blob = JSON.stringify(data);
    for (const word of ["좋음", "나쁨", "좋아요", "나빠요", "추천", "우세",
        "승리", "1등", "최고", "대상입니다", "신청 가능", "지원 가능",
        "받을 수 있", "계약하세요", "사세요", "사지 마", "싸다", "비싸다",
        "안전합니다", "위험합니다"]) {
      assert.ok(!blob.includes(word), `leaked ${word}`);
    }
  });

  it("carries sources and 가정값 marks on every row", () => {
    const data = demoData();
    for (const r of data.rows) {
      assert.ok(r.sources.length > 0, r.id);
      for (const s of r.sources) assert.notEqual(shareSourceKo(s), "–", `${r.id}:${s}`);
    }
    assert.equal(rowById(data, "fatigue_arrival").assumed, true);
    assert.equal(rowById(data, "housing").assumed, false);
    assert.equal(rowById(data, "walk_30d").assumed, false);
  });

  it("falls back honestly without compare metrics", () => {
    const data = resultCardData({ money: MONEY, compare: null,
      tenures: { A: "전세", B: "전세" }, simStart: "2026-11-02", simDays: 30,
      date: "2026-10-29" });
    // Per-day values × 30, marked as estimates.
    assert.equal(rowById(data, "ride_30d").a, "44시간");
    assert.equal(rowById(data, "walk_30d").assumed, true);
    assert.match(rowById(data, "walk_30d").note, /어림/);
  });

  it("degrades honestly without data or weights", () => {
    const data = resultCardData({ money: null, date: "2026-10-29" });
    assert.deepEqual(data.homes, []);
    assert.equal(data.rows.length, 12);
    for (const r of data.rows) {
      if (r.id === "jeonse_ratio") {
        assert.match(r.a, /계산하기 어려워요/, r.id);
        assert.match(r.b, /계산하기 어려워요/, r.id);
      } else {
        assert.equal(r.a, "–", r.id);
        assert.equal(r.b, "–", r.id);
      }
      assert.equal(r.lowerSide, null, r.id);
    }
    assert.deepEqual(data.priorities.lines, ["기본 모두 보통이에요."]);
    assert.deepEqual(data.priorities.bars, []);
  });

  it("renders the customer's priorities as bars", () => {
    const data = demoData();
    assert.deepEqual(data.priorities.bars,
      [{ title: "돈", weight: 5 }, { title: "교육", weight: 2 }]);
    assert.deepEqual(data.priorities.lines, ["돈 5", "교육 2"]);
    assert.match(data.priorities.note, /고객님/);
    const untouched = resultCardData({ money: MONEY, priorities: PRIORITIES,
      weights: null, date: "2026-10-29" });
    assert.deepEqual(untouched.priorities.bars,
      [{ title: "돈", weight: 3 }, { title: "교육", weight: 3 }]);
    assert.match(untouched.priorities.note, /정하지 않았어요/);
  });

  it("notes split tenures instead of mixing them silently", () => {
    const data = resultCardData({ money: MONEY, compare: COMPARE,
      tenures: { A: "전세", B: "월세" }, date: "2026-10-29" });
    assert.match(rowById(data, "housing").note, /B는 월세/);
  });

  it("emits plain labels with no banned jargon", () => {
    const data = demoData();
    const bannedIn = (label) => BANNED_LABEL_JARGON.some((p) =>
      label.includes(p) && !ALLOWED_LONG_PHRASES.some((l) => l.includes(p) && label.includes(l)));
    for (const r of data.rows) assert.equal(bannedIn(r.label), false, r.label);
  });
});

describe("result card on the real demo build", () => {
  const pMoney = join(ROOT, "data/build/sim/demo-two-homes-money.json");
  const pCompare = join(ROOT, "data/build/sim/demo-two-homes-compare.json");
  const hasBuild = existsSync(pMoney) && existsSync(pCompare);

  it("matches the built money/compare docs", { skip: !hasBuild }, () => {
    const money = JSON.parse(readFileSync(pMoney, "utf8"));
    const compare = JSON.parse(readFileSync(pCompare, "utf8"));
    const data = resultCardData({ money, compare,
      tenures: { A: "전세", B: "전세" }, scenarioName: "demo-two-homes",
      simStart: "2026-11-02", simDays: 30, date: "2026-10-29" });
    assert.deepEqual(data.rows.map((r) => r.id), SHARE_ROW_IDS);
    assert.equal(rowById(data, "walk_30d").a, "27시간 50분");
    assert.equal(rowById(data, "walk_30d").b, "38시간 3분");
    assert.equal(rowById(data, "housing").a, "월 260만 원");
    assert.equal(rowById(data, "commute_mode").b, "도보");
    assert.equal(data.homes[0].headline, "A 레이크팰리스 · 59.97㎡ (전세)");
  });
});
