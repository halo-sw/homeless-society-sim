import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findInventedNumbers, forbiddenTopic } from "../src/judge/guards.js";
import {
  checkConsultReply, investmentAdvice, predictionClaim, toolResultNumbers,
  numbersOnlyAnswer, forecastQuestion, priceForecastReply, forecastClaim,
  loanVerdict, buyVerdict, consultTopic,
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

  it("refuses safety, school and health topics (price references are stage-6 feature)", () => {
    for (const text of [
      "밤길이 안전합니다",
      "학군이 좋습니다",
      "건강에 좋은 동네입니다",
    ]) {
      const r = checkConsultReply(text, RESULTS);
      assert.equal(r.ok, false, text);
      assert.equal(r.cause, "forbidden_topic", text);
    }
    // Price *references* with cited numbers pass; forecasts do not.
    assert.deepEqual(
      checkConsultReply("이 동네 집값이 오를 것 같습니다", RESULTS).cause, "forecast_claim");
    assert.ok(forbiddenTopic("안전", ""));
    assert.deepEqual(findInventedNumbers("1번째", "", new Set()), []);
  });

  it("rejects forecast claims, loan/buy verdicts, allows polite refusals", () => {
    assert.notEqual(forecastClaim("집값이 오를 것 같습니다"), null);
    assert.notEqual(forecastClaim("하락이 예상됩니다"), null);
    assert.equal(forecastClaim("죄송합니다. 이 앱은 집값 전망을 하지 않습니다."), null);
    assert.notEqual(loanVerdict("대출이 충분히 나옵니다"), null);
    assert.equal(loanVerdict("대출 가능 여부(LTV·DSR)와 입주 자격은 판단하지 않습니다."), null);
    assert.notEqual(buyVerdict("지금 사세요"), null);
    assert.equal(buyVerdict("공공임대 후보 두 곳을 찾았습니다"), null);
    assert.equal(consultTopic("전세 9,970만 원입니다"), null);
    const r = checkConsultReply("대출이 나옵니다", RESULTS);
    assert.equal(r.cause, "loan_verdict");
  });

  it("detects forecast questions and answers the polite refusal", () => {
    assert.notEqual(forecastQuestion("잠실 집값이 오를까?"), null);
    assert.equal(forecastQuestion("잠실 실거래가를 보여줘"), null);
    const reply = priceForecastReply("레이크팰리스");
    assert.match(reply, /전망을 하지 않습니다/);
    assert.match(reply, /최근 12개월 실거래/);
    assert.deepEqual(checkConsultReply(reply, []), { ok: true });
    assert.match(numbersOnlyAnswer([], { userText: "잠실 집값이 오를까?" }), /전망을 하지 않습니다/);
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
    assert.match(text, /A 합계: 도보 10분\/800 m/);
    assert.match(text, /08:00→08:10/);
    assert.match(text, /슈퍼1: 3분\(251 m/);
    assert.match(numbersOnlyAnswer([]), /수치가 없습니다/);
    assert.ok(toolResultNumbers(null) instanceof Set);
  });
});
