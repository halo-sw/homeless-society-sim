import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ENGINE_DEFAULTS, PROFILE_FIELDS, TENURE_KO, emptyProfile, exampleProfile,
  extract_profile, field, guardProfileValues, missingQuestions,
  parseKoreanMoney, scenarioFromProfile, complexNameForHome,
  EXAMPLE_PROFILE_LABEL,
} from "../src/profile.js";
import { parseInterstationCsv } from "../src/transit/schedule.js";

const STATIONS = ["판교", "정자", "미금", "서현", "수내", "강남", "잠실", "모란"];

describe("profile money words", () => {
  it("parses 4천, 2억 5천, 월 80", () => {
    assert.equal(parseKoreanMoney("4천"), 40000000);
    assert.equal(parseKoreanMoney("2억 5천"), 250000000);
    assert.equal(parseKoreanMoney("2억"), 200000000);
    assert.equal(parseKoreanMoney("5천"), 50000000);
    assert.equal(parseKoreanMoney("80"), 800000);
    assert.equal(parseKoreanMoney("1억2000"), 120000000);
    assert.equal(parseKoreanMoney(""), null);
  });
});

describe("extract_profile", () => {
  const TEXT = "판교로 출근하는 신입, 연봉 4천, 모은 돈 5천, 전세 2억 이하";

  it("reads the example sentence with evidence", () => {
    const r = extract_profile(TEXT, null, { stations: STATIONS });
    assert.equal(r.ok, true);
    assert.deepEqual(r.errors, []);
    assert.equal(r.profile.tenure.value, "jeonse");
    assert.deepEqual(r.profile.salaryAnnual.value, [40000000]);
    assert.equal(r.profile.cash.value, 50000000);
    assert.equal(r.profile.depositMax.value, 200000000);
    assert.deepEqual(r.profile.members.value, [{ role: "adult" }]);
    assert.equal(r.profile.workplaces.value[0].text, "판교");
    assert.deepEqual(r.profile.workplaces.value[0].resolved, { station: "판교" });
    for (const f of Object.values(r.profile)) {
      if (f && typeof f === "object" && f.value !== null && f.source === "customer") {
        assert.equal(f.source, "customer");
      }
    }
  });

  it("guards: no number not in the text", () => {
    const r = extract_profile(TEXT, null, { stations: STATIONS });
    assert.equal(r.ok, true);
    // Every filled field carries verbatim evidence from the text.
    for (const [key, f] of Object.entries(r.profile)) {
      if (!f || typeof f !== "object" || f.value === null) continue;
      if (key === "mustHaves" && Array.isArray(f.value) && f.value.length === 0) continue;
      assert.ok(typeof f.evidence === "string" && TEXT.includes(f.evidence),
        `${key} evidence ${JSON.stringify(f.evidence)}`);
    }
    // Tampered evidence fails the guard.
    const bad = {
      depositMax: { value: 999, source: "customer", evidence: "9억" },
    };
    assert.deepEqual(guardProfileValues(bad, TEXT).length, 1);
  });

  it("never defaults salaries, cash, budget or workplace", () => {
    const r = extract_profile("그냥 구경 중이에요", null, { stations: STATIONS });
    assert.equal(r.ok, true);
    for (const key of ["salaryAnnual", "cash", "depositMax", "monthlyMax",
      "priceMax", "workplaces", "members", "tenure"]) {
      assert.equal(r.profile[key].value, null, key);
      assert.equal(r.profile[key].source, "customer", key);
    }
    assert.ok(r.asked.length <= 2);
    assert.ok(r.asked.length >= 1);
  });

  it("unresolved workplaces stay honest", () => {
    const r = extract_profile("제주로 출근해요", null, { stations: STATIONS });
    assert.equal(r.profile.workplaces.value[0].resolved, null);
    assert.match(r.profile.workplaces.value[0].text, /제주/);
  });

  it("monthly money and commute ceiling parse", () => {
    const r = extract_profile("월세 월 80, 출퇴근 30분 이내", null, { stations: STATIONS });
    assert.equal(r.profile.tenure.value, "wolse");
    assert.equal(r.profile.monthlyMax.value, 800000);
    assert.equal(r.profile.commuteMax.value, 30);
  });
});

describe("missingQuestions", () => {
  it("orders household, workplace, tenure+budget first", () => {
    const qs = missingQuestions(emptyProfile());
    assert.deepEqual(qs.slice(0, 3).map((q) => q.field),
      ["members", "workplaces", "tenure"]);
    assert.ok(qs.every((q) => typeof q.ask === "string" && q.ask.length > 5));
  });

  it("asks deposit after jeonse, price after trade", () => {
    const p = emptyProfile();
    p.tenure = field("jeonse", "customer", "");
    assert.equal(missingQuestions(p)[0].field, "members");
    p.members = field([{ role: "adult" }], "customer", "");
    p.workplaces = field([{ member: 0, text: "판교", resolved: { station: "판교" } }],
      "customer", "");
    assert.equal(missingQuestions(p)[0].field, "depositMax");
  });
});

describe("scenarioFromProfile", () => {
  const profile = () => {
    const p = emptyProfile();
    p.members = field([{ role: "adult" }], "customer", "");
    p.workplaces = field([{ member: 0, text: "판교", resolved: { station: "판교" } }],
      "customer", "");
    return p;
  };
  const home = (id, scene, station) => ({
    id, name: `집${id}`, pnu: `pnu${id}`, scene,
    station: station ? { station, walk_minutes: 8 } : null,
  });

  it("is deterministic for the same profile + homes", () => {
    const homes = [home("home-000001", "st-정자", "정자"),
      home("home-000002", "st-미금", "미금")];
    const a = scenarioFromProfile(profile(), homes);
    const b = scenarioFromProfile(profile(), homes);
    assert.deepEqual(a, b);
    assert.equal(a.homes.length, 2);
    assert.equal(a.homes[0].area, "st-정자");
    assert.deepEqual(a.household.members[0].work.ride_minutes, {});
    assert.equal(a.household.members[0].work.needs_user_input, true);
  });

  it("refuses homes without a scene or station", () => {
    assert.throws(() => scenarioFromProfile(profile(), [home("h1", null, "정자")]),
      /no scene box/);
    assert.throws(() => scenarioFromProfile(profile(), [home("h1", "st-정자", null)]),
      /no station walk time/);
  });

  it("joins the verbatim complex name via PNU", () => {
    const area = {
      buildings: [{ id: "b1", register: { pnu: "pnux" } }],
      complexes: [{ id: "cx1", name: "대장단지명", building_ids: ["b1"] }],
    };
    assert.equal(complexNameForHome({ pnu: "pnux", name: "실거래명" }, area), "대장단지명");
    assert.equal(complexNameForHome({ pnu: "nope", name: "실거래명" }, area), null);
    const homes = [{ id: "h1", name: "실거래명", pnu: "pnux",
      scene: "st-정자", station: { station: "정자", walk_minutes: 5 } }];
    const s = scenarioFromProfile(profile(), homes,
      { areas: new Map([["st-정자", area]]) });
    assert.equal(s.homes[0].complex_name, "대장단지명");
  });
});

describe("example profile", () => {
  it("is labelled 예시 and covers every field", () => {
    assert.equal(EXAMPLE_PROFILE_LABEL, "예시");
    const p = exampleProfile();
    for (const key of PROFILE_FIELDS) {
      assert.ok(p[key] && typeof p[key] === "object", key);
      assert.ok(["customer", "default", "derived"].includes(p[key].source), key);
    }
    assert.equal(TENURE_KO[p.tenure.value], "전세");
  });

  it("engine defaults are labelled constants only", () => {
    assert.equal(ENGINE_DEFAULTS.walk_mps.value, 1.3);
    assert.match(ENGINE_DEFAULTS.walk_mps.note, /엔진 기본값/);
  });
});

describe("scenarioFromProfile ride minutes (12a2)", () => {
  const LINE2 = { lines: [{ id: "line2", name: "2호선",
    stops: [
      { id: "a", key: "A", name: "A" },
      { id: "b", key: "B", name: "B" },
      { id: "c", key: "C", name: "C" },
    ],
    patterns: [{ id: "p", stops: ["a", "b", "c"], chainage_km: [0, 1.0, 1.8] }],
  }] };
  const SCHEDULE = parseInterstationCsv([
    "연번,호선,역명,소요시간,역간거리(km),호선별누계(km)",
    "1,2,A,00:00,0,0",
    "2,2,B,02:00,1.0,1.0",
    "3,2,C,01:30,0.8,1.8",
  ].join("\n"));
  const profile = (rideMinutes) => {
    const p = emptyProfile();
    p.members = field([{ role: "adult" }], "customer", "");
    const wp = { member: 0, text: "C", resolved: { station: "C" } };
    if (rideMinutes !== undefined) wp.ride_minutes = rideMinutes;
    p.workplaces = field([wp], "customer", "");
    return p;
  };
  const home = (id, station) => ({
    id, name: `집${id}`, pnu: `pnu${id}`, scene: `st-${id}`, station: { station, walk_minutes: 5 },
  });

  it("fills schedule-derived minutes and records the derived source", () => {
    const s = scenarioFromProfile(profile(), [home("h1", "A"), home("h2", "B")],
      { network: LINE2, schedule: SCHEDULE });
    const work = s.household.members[0].work;
    assert.deepEqual(work.ride_minutes, { A: 3.5, B: 1.5 });
    assert.equal(work.ride_minutes_source, "derived");
    assert.equal(work.needs_user_input, false);
    assert.equal(work.destination_station, "C");
  });

  it("lets the customer's number fill every home", () => {
    const s = scenarioFromProfile(profile(25), [home("h1", "A"), home("h2", "B")],
      { network: LINE2, schedule: SCHEDULE });
    const work = s.household.members[0].work;
    assert.deepEqual(work.ride_minutes, { A: 25, B: 25 });
    assert.equal(work.ride_minutes_source, "user_input");
    assert.equal(work.needs_user_input, false);
  });

  it("keeps needs_user_input for homes without a path", () => {
    const s = scenarioFromProfile(profile(), [home("h1", "A"), home("h2", "ZZZ")],
      { network: LINE2, schedule: SCHEDULE });
    const work = s.household.members[0].work;
    assert.deepEqual(work.ride_minutes, { A: 3.5 });
    assert.equal(work.ride_minutes_source, "derived");
    assert.equal(work.needs_user_input, true);
  });
});
