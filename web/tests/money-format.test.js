import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  fmtDistance, fmtMinutes, fmtMinutesTable, fmtWon, fmtPct, fmtCount,
  fmtArea, badgeFor,
} from "../src/money/format.js";

describe("money format", () => {
  it("formats long walks as km", () => {
    assert.equal(fmtDistance(165425.57), "165.4 km");
    assert.equal(fmtDistance(800), "800 m");
    assert.equal(fmtDistance(165.4), "165.4 m");
    assert.equal(fmtDistance(NaN), "–");
  });

  it("formats minute sums as hours+minutes", () => {
    assert.equal(fmtMinutes(2123.4), "35시간 23분");
    assert.equal(fmtMinutes(180), "3시간");
    assert.equal(fmtMinutes(45), "45분");
    assert.equal(fmtMinutesTable(2123.4), "2,123분");
  });

  it("formats won as eok/man", () => {
    assert.equal(fmtWon(2499900000), "24억 9,990만 원");
    assert.equal(fmtWon(3000000, { monthly: true }), "월 300만 원");
    assert.equal(fmtWon(980000000), "9억 8,000만 원");
    assert.equal(fmtWon(1500), "1,500 원");
    assert.equal(fmtWon(0), "0 원");
    assert.equal(fmtWon(-50000), "−5만 원");
  });

  it("formats pct, counts, areas and source badges", () => {
    assert.equal(fmtPct(0.284), "28.4%");
    assert.equal(fmtCount(1234), "1,234회");
    assert.equal(fmtArea(59.97), "59.97 ㎡");
    assert.equal(badgeFor("graph"), "그래프");
    assert.equal(badgeFor("rtms"), "실거래");
    assert.equal(badgeFor("housing_api"), "공공임대");
    assert.equal(badgeFor("scenario"), "가정값");
    assert.equal(badgeFor("payroll_estimate"), "추정");
  });
});
