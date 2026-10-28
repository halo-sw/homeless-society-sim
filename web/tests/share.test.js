import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resultCardData, shareSourceKo, SHARE_DISCLAIMER } from "../src/ui/share.js";
import { BANNED_LABEL_JARGON, ALLOWED_LONG_PHRASES } from "../src/ui/copy.js";

function homeFixture(complex) {
  return {
    complex_name: complex, area: "songpa-jamsil",
    by_tenure: {
      "전세": {
        housing: { monthly_won: 2600000, source: "rtms" },
        remaining_won: 1200000, burden_ratio: 0.36,
      },
    },
    qol_time: { commute_minutes_per_day: 75, evening_at_home_minutes_per_day: 180 },
    qol_fatigue: { avg_30d: 25.3 },
    qol_convenience: { grocery: 3, clinic: 1, station: 1 },
    jeonse_check: { computable: true, ratio_pct: 37,
      band: { key: "below", label: "70% 미만 (참고선 아래)" } },
  };
}

const MONEY = { homes: { A: homeFixture("레이크팰리스"), B: homeFixture("백현마을") } };

describe("result card data builder", () => {
  it("builds persona, homes, priorities, date and disclaimer", () => {
    const data = resultCardData({
      money: MONEY,
      tenures: { A: "전세", B: "전세" },
      priorities: { groups: [{ id: "money", title: "돈" }, { id: "edu", title: "교육" }] },
      weights: { explicit: true, weights: { money: 5, edu: 2 } },
      scenarioName: "demo-two-homes",
      date: "2026-10-29",
    });
    assert.equal(data.date, "2026-10-29");
    assert.equal(data.scenario, "demo-two-homes");
    assert.equal(data.homes.length, 2);
    const labels = data.homes[0].rows.map((r) => r.label);
    assert.ok(labels.includes("하루 출퇴근에 쓰는 시간"));
    assert.ok(labels.includes("전세로 살면 매달 집에 드는 돈"));
    assert.ok(labels.some((l) => l.includes("집값과 생활비를 내고 남는 돈")));
    assert.ok(labels.includes("30일 평균 피곤한 정도"));
    assert.ok(labels.includes("걸어서 10분 안에 갈 수 있는 곳"));
    assert.ok(labels.includes("보증금이 집값의 몇 %인지"));
    // Every row carries sources; 가정값 rows are marked.
    for (const h of data.homes) {
      for (const r of h.rows) {
        assert.ok(r.sources.length > 0, r.label);
        for (const s of r.sources) assert.notEqual(shareSourceKo(s), "–");
      }
    }
    const fatigue = data.homes[0].rows.find((r) => r.label === "30일 평균 피곤한 정도");
    assert.equal(fatigue.assumed, true);
    const housing = data.homes[0].rows.find((r) => r.label === "전세로 살면 매달 집에 드는 돈");
    assert.equal(housing.assumed, false);
    assert.deepEqual(data.priorities.lines, ["돈 5", "교육 2"]);
    assert.match(data.priorities.note, /고객님/);
    assert.equal(data.disclaimer, SHARE_DISCLAIMER);
  });

  it("degrades honestly without data or weights", () => {
    const data = resultCardData({ money: null, date: "2026-10-29" });
    assert.deepEqual(data.homes, []);
    assert.deepEqual(data.priorities.lines, ["기본 모두 보통이에요."]);
    const sparse = resultCardData({
      money: { homes: { A: { complex_name: "x", by_tenure: {},
        jeonse_check: { computable: false } } } },
      tenures: { A: "전세" }, date: "2026-10-29",
    });
    assert.equal(sparse.homes[0].rows.length, 1);
    assert.match(sparse.homes[0].rows[0].value, /계산하기 어려워요/);
  });

  it("emits plain labels and never a verdict", () => {
    const data = resultCardData({ money: MONEY, tenures: { A: "전세", B: "전세" },
      date: "2026-10-29" });
    const bannedIn = (label) => BANNED_LABEL_JARGON.some((p) =>
      label.includes(p) && !ALLOWED_LONG_PHRASES.some((l) => l.includes(p) && label.includes(l)));
    for (const h of data.homes) {
      for (const r of h.rows) assert.equal(bannedIn(r.label), false, r.label);
    }
    const blob = JSON.stringify(data);
    for (const word of ["대상입니다", "신청 가능", "지원 가능", "받을 수 있",
        "계약하세요", "사세요", "사지 마", "싸다", "비싸다", "안전합니다", "위험합니다"]) {
      assert.ok(!blob.includes(word), `leaked ${word}`);
    }
  });
});
