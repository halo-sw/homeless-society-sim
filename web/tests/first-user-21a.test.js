// Stage 21a — a first-time user gets a real answer.
// Pure tests: workplace parsing (으로), home kinds, the run gate,
// the kind filter, the honest commute sentence, lot-number names.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  emptyProfile, extract_profile, missingQuestions, runGate, findHomeKinds,
} from "../src/profile.js";
import { applyKindPreference, displayNameFor } from "../src/homes.js";
import { oneWaySentence, NO_WORKPLACE_COMMUTE_KO } from "../src/verify/numbers.js";

const STATIONS = ["강남", "성수", "판교", "잠실", "제기동", "정자", "미금"];

const FIRST_SENTENCE = "강남역으로 출근해요. 혼자 살고 전세 3억 이하, 역 가까운 오피스텔이면 좋겠어요";

describe("21a workplace parsing (으로)", () => {
  it("강남역으로 출근 resolves to 강남 without 으", () => {
    const { profile, ok, errors } = extract_profile("강남역으로 출근해요", null, { stations: STATIONS });
    assert.equal(ok, true, JSON.stringify(errors));
    const wps = profile.workplaces.value;
    assert.equal(wps[0].text, "강남역");
    assert.equal(wps[0].resolved.station, "강남");
  });
  it("성수역으로, 판교로 resolve", () => {
    for (const [text, station] of [["성수역으로 출근해요", "성수"], ["판교로 출근해요", "판교"]]) {
      const { profile } = extract_profile(text, null, { stations: STATIONS });
      assert.equal(profile.workplaces.value[0].resolved.station, station, text);
    }
  });
  it("잠실에서 일해요 resolves to 잠실", () => {
    const { profile } = extract_profile("잠실에서 일해요", null, { stations: STATIONS });
    assert.equal(profile.workplaces.value[0].text, "잠실");
    assert.equal(profile.workplaces.value[0].resolved.station, "잠실");
  });
  it("제기동으로 출근 keeps 제기동 whole", () => {
    const { profile } = extract_profile("제기동으로 출근해요", null, { stations: STATIONS });
    assert.equal(profile.workplaces.value[0].text, "제기동");
    assert.equal(profile.workplaces.value[0].resolved.station, "제기동");
  });
});

describe("21a first sentence fills the profile", () => {
  it("household 1, 전세, 3억, home_kinds 오피스텔", () => {
    const { profile, ok, errors } = extract_profile(FIRST_SENTENCE, null, { stations: STATIONS });
    assert.equal(ok, true, JSON.stringify(errors));
    assert.equal(profile.members.value.length, 1);
    assert.equal(profile.tenure.value, "jeonse");
    assert.equal(profile.depositMax.value, 300000000);
    assert.ok(profile.home_kinds.value.includes("오피스텔"));
  });
  it("findHomeKinds maps 빌라·아파트·원룸 words", () => {
    assert.deepEqual(findHomeKinds("빌라나 연립 좋아요").kinds, ["연립·다세대"]);
    assert.deepEqual(findHomeKinds("아파트 찾아요").kinds, ["아파트"]);
    assert.deepEqual(findHomeKinds("원룸 구해요").kinds, ["원룸"]);
    assert.equal(findHomeKinds("그냥 집 구해요"), null);
  });
  it("missingQuestions excludes household, workplace, tenure, budget", () => {
    const { profile } = extract_profile(FIRST_SENTENCE, null, { stations: STATIONS });
    const fields = missingQuestions(profile).map((q) => q.field);
    for (const f of ["members", "workplaces", "tenure", "depositMax"]) {
      assert.ok(!fields.includes(f), f);
    }
  });
  it("empty profile still asks household, workplace, tenure", () => {
    const fields = missingQuestions(emptyProfile()).map((q) => q.field);
    for (const f of ["members", "workplaces", "tenure"]) {
      assert.ok(fields.includes(f), f);
    }
  });
});

describe("21a run gate", () => {
  it("unresolved workplace blocks with ask workplace", () => {
    assert.deepEqual(runGate(emptyProfile()), { ok: false, ask: "workplace" });
    const p = emptyProfile();
    p.workplaces = { value: [{ member: 0, text: "화성", resolved: null }], source: "customer" };
    assert.deepEqual(runGate(p), { ok: false, ask: "workplace" });
  });
  it("resolved workplace passes", () => {
    const { profile } = extract_profile(FIRST_SENTENCE, null, { stations: STATIONS });
    assert.deepEqual(runGate(profile), { ok: true });
  });
  it("출근 안 해요 passes with noCommute", () => {
    const p = emptyProfile();
    p.workplaces = { value: [{ member: 0, text: "출근 안 해요", noCommute: true, resolved: null }], source: "customer" };
    assert.deepEqual(runGate(p), { ok: true, noCommute: true });
  });
});

describe("21a kind preference filter", () => {
  const six = (kinds) => kinds.map((kind, i) => ({ id: `h${i}`, name: `집${i}`, kind }));
  it("3 오피스텔 of 6 keeps only the 3", () => {
    const out = applyKindPreference(
      six(["오피스텔", "아파트", "오피스텔", "연립·다세대", "오피스텔", "아파트"]), ["오피스텔"]);
    assert.equal(out.length, 3);
    assert.ok(out.every((c) => c.kind === "오피스텔"));
  });
  it("2 오피스텔 of 6 fills with flagged others", () => {
    const out = applyKindPreference(
      six(["오피스텔", "아파트", "오피스텔", "연립·다세대", "아파트", "아파트"]), ["오피스텔"]);
    assert.equal(out.length, 6);
    assert.ok(out.filter((c) => c.kind === "오피스텔").every((c) => !c.kind_mismatch));
    assert.equal(out.filter((c) => c.kind_mismatch).length, 4);
  });
  it("no preference returns the list untouched", () => {
    const list = six(["아파트", "아파트"]);
    assert.equal(applyKindPreference(list, []).length, 2);
  });
});

describe("21a honest commute sentence", () => {
  it("null/NaN on either side never reads 같아요", () => {
    for (const ow of [null, undefined, {}, { A: null, B: 20 }, { A: 20, B: NaN },
      { A: NaN, B: NaN }, { A: 0, B: 0 }]) {
      const s = oneWaySentence(ow);
      assert.ok(!s.includes("같아요"), JSON.stringify(ow));
      assert.equal(s, NO_WORKPLACE_COMMUTE_KO);
    }
  });
  it("equal nonzero sides still read 같아요", () => {
    assert.ok(oneWaySentence({ A: 20, B: 20 }).includes("같아요"));
    assert.ok(oneWaySentence({ a: 15.5, b: 15.5 }).includes("같아요"));
  });
  it("a real delta names the longer side", () => {
    assert.ok(oneWaySentence({ A: 20, B: 30 }).startsWith("B가"));
  });
});

describe("21a lot-number names", () => {
  it("(242-4) with dong and kind reads 대치동 연립·다세대 (242-4)", () => {
    assert.equal(
      displayNameFor({ name: "(242-4)", dong: "대치동", kind: "연립·다세대" }),
      "대치동 연립·다세대 (242-4)");
  });
  it("falls back to kind, then region, then the raw name", () => {
    assert.equal(
      displayNameFor({ name: "242-4", kind: "오피스텔" }), "오피스텔 (242-4)");
    assert.equal(
      displayNameFor({ name: "(242-4)", region: "gangnam", kind: "오피스텔" }),
      "gangnam 오피스텔 (242-4)");
    assert.equal(displayNameFor({ name: "푸르지오" }), "푸르지오");
  });
});
