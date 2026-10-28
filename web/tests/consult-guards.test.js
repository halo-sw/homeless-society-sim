import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findInventedNumbers, forbiddenTopic } from "../src/judge/guards.js";
import {
  checkConsultReply, investmentAdvice, predictionClaim, toolResultNumbers,
  numbersOnlyAnswer,
} from "../src/consult/guards.js";

const RESULTS = [
  { minutes: 16.3, distance_m: 1274, time: "08:18", day: 3,
    places: [{ name: "슈퍼1" }, { name: "슈퍼2" }] },
];

describe("consult guards", () => {
  it("accepts exact, rounded and converted citations (4c rules)", () => {
    for (const text of [
      "도보 16.3분", // exact
      "도보 16분", // integer-rounded
      "1274m", // exact metres
      "1270m", // 10 m-rounded
      "1.27km", // 2-decimal km
      "1.3km", // 1-decimal km
      "8시 18분에 출발", // clock components
      "3일차 일정", // day number
      "슈퍼1이 가장 가깝다", // label digit
      "2곳을 찾았다", // array length
      "1번째로 가까운 곳", // ordinals are skipped
      "3회 방문", // Korean counters are skipped
    ]) {
      assert.deepEqual(checkConsultReply(text, RESULTS), { ok: true }, text);
    }
  });

  it("accepts a negative delta cited without its sign", () => {
    assert.deepEqual(
      checkConsultReply("B가 3.4분 더 걸린다", [{ delta_b_minus_a: -3.4 }]),
      { ok: true });
  });

  it("rejects numbers in no tool result", () => {
    const r = checkConsultReply("도보 17분 거리입니다", RESULTS);
    assert.equal(r.ok, false);
    assert.equal(r.cause, "invented_number");
    assert.deepEqual(r.offending, ["17"]);
  });

  it("refuses price, safety, school and health topics", () => {
    for (const text of [
      "이 동네 집값이 오를 것 같습니다",
      "밤길이 안전합니다",
      "학군이 좋습니다",
      "건강에 좋은 동네입니다",
    ]) {
      const r = checkConsultReply(text, RESULTS);
      assert.equal(r.ok, false, text);
      assert.equal(r.cause, "forbidden_topic", text);
    }
    assert.ok(forbiddenTopic("안전", ""));
    assert.deepEqual(findInventedNumbers("1번째", "", new Set()), []);
  });

  it("refuses investment advice", () => {
    assert.equal(investmentAdvice("투자 가치가 높습니다"), "투자");
    assert.equal(investmentAdvice("ROI가 높을 것입니다"), "roi");
    assert.equal(investmentAdvice("전망이 좋은 거실입니다"), null);
    const r = checkConsultReply("갭투자로 수익을 노려보세요", RESULTS);
    assert.equal(r.ok, false);
    assert.equal(r.cause, "forbidden_topic");
  });

  it("rejects real-life prediction claims, allows the honest framing", () => {
    assert.notEqual(predictionClaim("실제 생활도 그대로 재현됩니다"), null);
    assert.notEqual(predictionClaim("이대로 될 것입니다"), null);
    const r = checkConsultReply("실제 생활이 그대로 될 것입니다", RESULTS);
    assert.equal(r.ok, false);
    assert.equal(r.cause, "prediction_claim");
    assert.deepEqual(
      checkConsultReply("이 시뮬레이션은 현실을 예측하지 않습니다. 가정한 조건의 시나리오입니다.", RESULTS),
      { ok: true });
  });

  it("builds a numbers-only fallback from tool results", () => {
    const text = numbersOnlyAnswer([
      { compare: { metrics: [
        { key: "walk_minutes", label: "도보 이동 시간 합계", unit: "minutes", source: "graph", a: 10, b: 20, delta_b_minus_a: 10 },
      ] } },
      { home: "A", summary: { totals: { walk_minutes: 10, walk_distance_m: 800, errands_done: 3, park_visits: 1 } } },
      { trips: [{ depart: "08:00", arrive: "08:10", from: "집", to: "슈퍼1", minutes: 10, distance_m: 780 }] },
      { places: [{ name: "슈퍼1", minutes: 3.2, distance_m: 251 }] },
    ]);
    assert.match(text, /도보 이동 시간 합계: A 10분 \/ B 20분/);
    assert.match(text, /A 합계: 도보 10분\/800m/);
    assert.match(text, /08:00→08:10/);
    assert.match(text, /슈퍼1: 3\.2분\(251m/);
    assert.match(numbersOnlyAnswer([]), /수치가 없습니다/);
    assert.ok(toolResultNumbers(null) instanceof Set);
  });
});
