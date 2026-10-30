// Stage 26c — US chat: Meta HQ workplace, dollars, US homes.
// node --test, no network.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extract_profile, missingQuestions, runGate } from "../src/profile.js";
import { find_homes, commuteSummary } from "../src/homes.js";
import { findUsWorkplace } from "../src/places-us.js";
import { regionsForNames } from "../src/region-names.js";
import { fmtMoney, currencyOf } from "../src/money/currency.js";
import { fmtWon } from "../src/money/format.js";
import { shortPinPrice, buildChatMap } from "../src/chatmap.js";

const META = { id: "meta-hq", name: "Meta HQ (1 Hacker Way)",
  lon: -122.14823, lat: 37.48485 };

function usHome(id, rent, walkMin, bikeMin, station) {
  return {
    id, name: `Home ${id}`, kind: "아파트", region: "us-menlo",
    lon: -122.15, lat: 37.47, build_year: null, scene: "us-menlo",
    pnu: null, match: "osm_name", osm_name: `Home ${id}`,
    station: station === null ? null
      : { station, walk_minutes: walkMin },
    buckets: [{ center_m2: null, range_m2: null, trade: null,
      jeonse: null,
      wolse: { count: 1, deposit: null,
        monthly: { count: 1, median_won: rent, min_won: rent,
          max_won: rent } } }],
    currency: "USD", country: "US",
    price: { source: "zillow_zori_zip", zip: "94025",
      zip_source: "osm_nearest", month: "2026-09",
      label: "Zillow ZORI (typical rent for this ZIP, all home types)" },
    work_targets: { "meta-hq": { walk_m: 2900, walk_minutes: walkMin,
      bike_m: 3100, bike_minutes: bikeMin, bike_speed_kmh: 15,
      bike_speed_source: "assumed" } },
  };
}

function usdProfile(monthlyMax) {
  return {
    tenure: { value: "wolse", source: "customer", note: "" },
    monthlyMax: { value: monthlyMax, source: "customer", note: "" },
    sizeMin: { value: null, source: "asked", note: "" },
    commuteMax: { value: null, source: "asked", note: "" },
    mustHaves: { value: [], source: "asked", note: "" },
    home_kinds: { value: [], source: "asked", note: "" },
    priorities: { value: null, source: "asked", note: "" },
    currency: { value: "USD", source: "customer", note: "" },
    workplaces: { value: [{ member: 0, text: "Meta",
      resolved: { place: { ...META }, region: "us-menlo" } }],
    source: "customer", note: "" },
  };
}

describe("26c extract_profile (US)", () => {
  it("reads the English Meta sentence", () => {
    const r = extract_profile(
      "I work at Meta in Menlo Park, renting alone, up to $4,000 a month");
    assert.equal(r.ok, true);
    const p = r.profile;
    assert.equal(p.currency.value, "USD");
    assert.equal(p.tenure.value, "wolse");
    assert.equal(p.monthlyMax.value, 4000);
    assert.equal(p.members.value.length, 1);
    assert.equal(p.workplaces.value[0].resolved.place.id, "meta-hq");
    assert.equal(runGate(p).ok, true);
  });

  it("reads the Korean Meta sentence the same way", () => {
    const r = extract_profile("멘로파크 메타 본사 출근, 혼자, 월세 4,000달러 이하");
    assert.equal(r.ok, true);
    const p = r.profile;
    assert.equal(p.currency.value, "USD");
    assert.equal(p.tenure.value, "wolse");
    assert.equal(p.monthlyMax.value, 4000);
    assert.equal(p.members.value.length, 1);
    assert.equal(p.workplaces.value[0].resolved.place.id, "meta-hq");
    assert.equal(runGate(p).ok, true);
  });
});

describe("26c dollar money", () => {
  it("$4.5k/mo reads 4500 USD", () => {
    const r = extract_profile("a studio near Meta HQ, $4.5k/mo rent");
    assert.equal(r.profile.currency.value, "USD");
    assert.equal(r.profile.monthlyMax.value, 4500);
  });

  it("4천 달러 reads 4000", () => {
    const r = extract_profile("월세 4천 달러 이하, 메타 본사 출근");
    assert.equal(r.profile.currency.value, "USD");
    assert.equal(r.profile.monthlyMax.value, 4000);
  });

  it("전세 3억 이하 stays KRW 300000000", () => {
    const r = extract_profile("전세 3억 이하");
    assert.equal(r.profile.currency.value, "KRW");
    assert.equal(r.profile.depositMax.value, 300000000);
  });

  it("$4,000 never becomes won with currency KRW", () => {
    const r = extract_profile("Meta HQ commute, rent up to $4,000");
    assert.equal(r.profile.currency.value, "USD");
    assert.equal(r.profile.monthlyMax.value, 4000);
    assert.equal(r.profile.depositMax.value, null);
    assert.equal(r.profile.priceMax.value, null);
    assert.equal(r.profile.salaryAnnual.value, null);
  });
});

describe("26c missingQuestions (USD)", () => {
  it("asks monthlyMax, never deposit/size/station", () => {
    const p = usdProfile(null);
    const qs = missingQuestions(p);
    const fields = qs.map((q) => q.field);
    assert.ok(fields.includes("monthlyMax"));
    assert.ok(!fields.includes("depositMax"));
    assert.ok(!fields.includes("sizeMin"));
    const monthly = qs.find((q) => q.field === "monthlyMax");
    assert.equal(monthly.ask,
      "한 달 월세는 얼마까지 생각하세요? (예: $4,000 이하)");
  });
});

describe("26c find_homes (US fixtures)", () => {
  it("drops the over-budget home and orders by work.minutes", () => {
    const homes = [
      usHome("us-home-0001", 3800, 40, 20, "Menlo Park"),
      usHome("us-home-0002", 4261, 37.2, 8, null),
      usHome("us-home-0003", 5522, 50, 12, "Menlo Park"),
    ];
    const res = find_homes(usdProfile(4500), { homes },
      { sort: "commute" });
    assert.equal(res.candidates.length, 2);
    assert.equal(res.candidates[0].id, "us-home-0002");
    assert.equal(res.candidates[1].id, "us-home-0001");
    for (const c of res.candidates) {
      assert.equal(c.currency, "USD");
      assert.ok(c.commute.work && c.commute.work.mode);
    }
    assert.equal(res.candidates[0].commute.work.minutes, 8);
    assert.equal(res.candidates[1].commute.work.minutes, 20);
  });
});

describe("26c commuteSummary work mode", () => {
  const wp = { resolved: { place: { ...META } } };
  const home = (walk, bike) => ({ work_targets: {
    "meta-hq": { walk_minutes: walk, bike_minutes: bike } } });

  it("walk 22 min reads walk", () => {
    const s = commuteSummary(home(22, 9), wp, null);
    assert.equal(s.work.mode, "walk");
    assert.equal(s.work.minutes, 22);
  });

  it("walk 37 min reads bike with the bike minutes", () => {
    const s = commuteSummary(home(37.2, 12.4), wp, null);
    assert.equal(s.work.mode, "bike");
    assert.equal(s.work.minutes, 12.4);
  });

  it("no target for the place reads work null", () => {
    const s = commuteSummary({ work_targets: {} }, wp, null);
    assert.equal(s.work, null);
  });
});

describe("26c money display", () => {
  it("fmtMoney renders dollars and defers to fmtWon for KRW", () => {
    assert.equal(fmtMoney(4261, "USD"), "$4,261");
    assert.equal(fmtMoney(4261, "USD", { monthly: true }), "월 $4,261");
    assert.equal(fmtMoney(300000000, "KRW"), fmtWon(300000000));
    assert.equal(fmtMoney(null, "USD"), "—");
    assert.equal(currencyOf({}), "KRW");
    assert.equal(currencyOf({ currency: "USD" }), "USD");
    assert.equal(currencyOf({ currency: { value: "USD" } }), "USD");
  });

  it("shortPinPrice renders a USD row in dollars", () => {
    const row = { currency: "USD",
      tenures: [{ tenure: "wolse", median_won: 4261,
        deposit_median_won: null, min_won: 4261, max_won: 4261 }] };
    assert.equal(shortPinPrice(row, "wolse"), "$4,261");
  });
});

describe("26c map + regions", () => {
  it("buildChatMap pins workPlace with no network", () => {
    const m = buildChatMap({ regions: { regions: [] }, network: null,
      tiles: [], green: null, candidates: [], picks: [],
      workPlace: { name: "Meta HQ (1 Hacker Way)", lon: -122.14823,
        lat: 37.48485 } });
    assert.deepEqual(m.workPin, { name: "Meta HQ (1 Hacker Way)",
      lon: -122.14823, lat: 37.48485 });
  });

  it("findUsWorkplace hits Meta aliases", () => {
    const hit = findUsWorkplace("I work at Meta in Menlo Park");
    assert.equal(hit.place.id, "meta-hq");
  });

  it("regionsForNames maps Menlo Park and keeps Gangnam", () => {
    assert.deepEqual(regionsForNames(["Menlo Park"]), ["us-menlo"]);
    assert.deepEqual(regionsForNames(["강남"]), ["gangnam"]);
  });
});
