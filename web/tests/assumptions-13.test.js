import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  EDITABLE_ASSUMPTIONS, assumptionById, defaultOverrides, setOverride,
  resetOverride, resetAllOverrides, currentValue, changedCount,
  encodeOverrides, decodeOverrides,
} from "../src/assumptions.js";

describe("assumption overrides", () => {
  it("exposes the human-reasonable constants with source and help", () => {
    const ids = EDITABLE_ASSUMPTIONS.map((a) => a.id);
    assert.ok(ids.includes("C-walk-speed.adult_mps"));
    assert.ok(ids.includes("C-ride-split.transfer_walk_min"));
    assert.ok(ids.includes("C-commute-depart.morning_anchor_min"));
    for (const a of EDITABLE_ASSUMPTIONS) {
      assert.ok(a.label && a.source && a.help);
      assert.ok(Number.isFinite(a.def));
    }
    assert.equal(assumptionById("C-ride-split.transfer_walk_min").def, 4);
  });
  it("sets, resets and counts overrides", () => {
    let o = defaultOverrides();
    o = setOverride(o, "C-ride-split.transfer_walk_min", 6);
    assert.equal(currentValue(o, "C-ride-split.transfer_walk_min"), 6);
    assert.equal(changedCount(o), 1);
    o = resetOverride(o, "C-ride-split.transfer_walk_min");
    assert.equal(currentValue(o, "C-ride-split.transfer_walk_min"), 4);
    assert.equal(changedCount(o), 0);
    o = setOverride(o, "C-walk-speed.adult_mps", 1.1);
    assert.deepEqual(resetAllOverrides(), {});
    assert.equal(changedCount(o), 1);
  });
  it("records overrides in the share link and reads them back", () => {
    let o = setOverride(defaultOverrides(), "C-ride-split.transfer_walk_min", 6);
    o = setOverride(o, "C-money-maint.monthly_won", 200000);
    const enc = encodeOverrides(o);
    assert.ok(enc.length > 0);
    assert.deepEqual(decodeOverrides(enc), o);
    assert.equal(encodeOverrides({}), "");
    assert.deepEqual(decodeOverrides(""), {});
    assert.deepEqual(decodeOverrides("%%%bad"), {});
  });
});
