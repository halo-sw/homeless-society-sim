// Stage 13e2-3: profile card source labels — unknown sources show no
// badge, blanks are "물어볼 값", only stated values are "내가 말한 값".
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emptyProfile, extract_profile } from "../src/profile.js";
import { fieldRows, sourceKo } from "../src/chat/engine.js";

const SAID = "내가 말한 값";
const ASKED = "물어볼 값";

describe("13e2 profile card labels", () => {
  it("sourceKo is empty for unknown or empty sources", () => {
    assert.equal(sourceKo(""), "");
    assert.equal(sourceKo(undefined), "");
    assert.equal(sourceKo("bogus"), "");
    assert.equal(sourceKo("customer"), SAID);
    assert.equal(sourceKo("asked"), ASKED);
  });

  it("empty profile shows no '내가 말한 값'", () => {
    const rows = fieldRows(emptyProfile());
    assert.ok(rows.length > 0, "has rows");
    for (const r of rows) {
      assert.notEqual(sourceKo(r.source), SAID, r.key);
      assert.equal(r.text, "아직 몰라요", r.key);
      assert.equal(r.note, "", r.key);
    }
  });

  it("'연봉 4천' shows exactly one '내가 말한 값'", () => {
    const profile = extract_profile("연봉 4천").profile;
    const rows = fieldRows(profile);
    const said = rows.filter((r) => sourceKo(r.source) === SAID);
    assert.equal(said.length, 1);
    assert.equal(said[0].key, "salaryAnnual");
    for (const r of rows) {
      if (r === said[0]) continue;
      assert.equal(sourceKo(r.source), ASKED, r.key);
    }
  });
});
