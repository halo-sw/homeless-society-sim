import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extract_profile } from "../src/profile.js";
import { actionConfirmation } from "../src/consult/guards.js";

const STATIONS = ["판교", "강남", "잠실"];

describe("english profile 26x", () => {
  it("reads example card 1: commuting to Pangyo with salary, savings, jeonse cap", () => {
    const text = "New hire commuting to Pangyo: salary 40M won, savings 50M won, jeonse under 200M won";
    const r = extract_profile(text, null, { stations: STATIONS });
    assert.equal(r.ok, true);
    assert.deepEqual(r.errors, []);
    assert.equal(r.profile.workplaces.value[0].text, "Pangyo");
    assert.equal(r.profile.workplaces.value[0].resolved.station, "판교");
    assert.equal(r.profile.depositMax.value, 200000000);
    assert.deepEqual(r.profile.salaryAnnual.value, [40000000]);
    assert.equal(r.profile.cash.value, 50000000);
  });

  it("reads working in Gangnam with a jeonse cap and a size floor", () => {
    const text = "Dual-income engaged couple, working in Gangnam, jeonse under 400M won, 59m² or larger";
    const r = extract_profile(text, null, { stations: STATIONS });
    assert.equal(r.ok, true);
    assert.deepEqual(r.errors, []);
    assert.equal(r.profile.workplaces.value[0].text, "Gangnam");
    assert.equal(r.profile.workplaces.value[0].resolved.station, "강남");
    assert.equal(r.profile.depositMax.value, 400000000);
    assert.equal(r.profile.sizeMin.value, 59);
  });

  it("reads a far-apart jeonse deposit cap in English", () => {
    const text = "I work in Pangyo. Find me a jeonse home to live alone, under 200M won";
    const r = extract_profile(text, null, { stations: STATIONS });
    assert.equal(r.ok, true);
    assert.deepEqual(r.errors, []);
    assert.equal(r.profile.depositMax.value, 200000000);
  });

  it("reads commuting to Jamsil before an every-day phrase", () => {
    const text = "I'm commuting to Jamsil every day, monthly rent";
    const r = extract_profile(text, null, { stations: STATIONS });
    assert.equal(r.ok, true);
    assert.deepEqual(r.errors, []);
    assert.equal(r.profile.workplaces.value[0].resolved.station, "잠실");
  });

  it("keeps the Korean sentence exactly as before", () => {
    const text = "판교로 출근하는 신입, 연봉 4천, 모은 돈 5천, 전세 2억 이하";
    const r = extract_profile(text, null, { stations: STATIONS });
    assert.equal(r.ok, true);
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.profile.workplaces.value,
      [{ member: 0, text: "판교", resolved: { station: "판교" } }]);
    assert.deepEqual(r.profile.members.value, [{ role: "adult" }]);
    assert.equal(r.profile.tenure.value, "jeonse");
    assert.deepEqual(r.profile.salaryAnnual.value, [40000000]);
    assert.equal(r.profile.cash.value, 50000000);
    assert.equal(r.profile.depositMax.value, 200000000);
    assert.equal(r.profile.monthlyMax.value, null);
    assert.equal(r.profile.priceMax.value, null);
    assert.equal(r.profile.sizeMin.value, null);
    assert.equal(r.profile.commuteMax.value, null);
  });

  it("sets no deposit cap from a salary alone without a tenure cue", () => {
    const text = "I work in Pangyo, salary 40M won";
    const r = extract_profile(text, null, { stations: STATIONS });
    assert.equal(r.profile.depositMax.value, null);
  });

  it("names saved homes from an earlier turn's candidate names", () => {
    const out = actionConfirmation(
      [{ ok: true, ui: { action: "pick", ids: ["x1", "x2"] } }],
      { names: { x1: "판교푸르지오", x2: "봇들마을" } });
    assert.ok(out.includes("판교푸르지오"));
    assert.ok(out.includes("봇들마을"));
  });
});
