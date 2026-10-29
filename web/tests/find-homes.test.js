import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  find_homes, find_public_rentals, pickBucket, budgetFit, commuteLine,
  amenityMinutes, publicRentalCoverage, regionOfAddress, NO_PUBLIC_RENTAL_NOTE,
  DEFAULT_HOME_SORT, HOME_SORT_KO,
} from "../src/homes.js";
import { field, emptyProfile } from "../src/profile.js";
import { parseInterstationCsv } from "../src/transit/schedule.js";

function bucket(center, trade, jeonse, wolse) {
  const stat = (count, median, min, max) => count === null ? null
    : { count, median_won: median, min_won: min, max_won: max };
  return {
    center_m2: center, range_m2: [center - 5, center + 5],
    trade: trade ? stat(...trade) : null,
    jeonse: jeonse ? stat(...jeonse) : null,
    wolse: wolse ? {
      count: wolse.count,
      deposit: wolse.deposit ? stat(wolse.count, ...wolse.deposit) : null,
      monthly: wolse.monthly ? stat(wolse.count, ...wolse.monthly) : null,
    } : null,
  };
}

function home(over = {}) {
  return {
    id: "home-000001", name: "테스트아파트", kind: "아파트",
    region: "bundang", lon: 127.1, lat: 37.39, build_year: 2010,
    buckets: [bucket(60, [8, 600000000, 550000000, 650000000],
      [5, 300000000, 280000000, 320000000], null)],
    station: { station: "정자", walk_minutes: 8, source: "graph" },
    scene: "st-정자", photos_700m: 3,
    ...over,
  };
}

function profile(over = {}) {
  const p = emptyProfile();
  p.tenure = field("jeonse", "customer", "");
  p.depositMax = field(300000000, "customer", "");
  p.workplaces = field([{ member: 0, text: "판교", resolved: { station: "판교" } }],
    "customer", "");
  for (const [k, v] of Object.entries(over)) p[k] = v;
  return p;
}

const NETWORK = {
  lines: [{
    id: "bundang", name: "수인·분당선",
    stops: [
      { id: "s1", key: "정자", name: "정자" },
      { id: "s2", key: "미금", name: "미금" },
      { id: "s3", key: "판교", name: "판교" },
    ],
    patterns: [{ id: "p1", stops: ["s1", "s2", "s3"], chainage_km: [0, 1.5, 3.0] }],
  }],
};

describe("pickBucket and budgetFit", () => {
  it("picks most deals without a floor, smallest fit with one", () => {
    const buckets = [
      bucket(40, [2, 1, 1, 1], [2, 200000000, 1, 300000000], null),
      bucket(60, [9, 1, 1, 1], [9, 300000000, 1, 400000000], null),
    ];
    assert.equal(pickBucket(buckets, "jeonse", null).center_m2, 60);
    assert.equal(pickBucket(buckets, "jeonse", 50).center_m2, 60);
    assert.equal(pickBucket(buckets, "jeonse", 30).center_m2, 40);
    assert.equal(pickBucket(buckets, "jeonse", 90), null);
    assert.equal(pickBucket(buckets, "trade", null).center_m2, 60);
  });

  it("fits all/none/partial from the range", () => {
    const b = bucket(60, null, [5, 300000000, 280000000, 320000000], null);
    assert.equal(budgetFit(b, "jeonse", 320000000), "all");
    assert.equal(budgetFit(b, "jeonse", 200000000), "none");
    assert.equal(budgetFit(b, "jeonse", 300000000), "partial");
    assert.equal(budgetFit(b, "jeonse", null), "unknown");
  });
});

describe("find_homes filters", () => {
  const INDEX = {
    homes: [
      home({ id: "home-000001" }),
      home({ id: "home-000002", name: "비싼집", region: "gangnam",
        kind: "오피스텔",
        buckets: [bucket(60, null, [3, 900000000, 800000000, 950000000], null)],
        station: null, scene: null }),
      home({ id: "home-000003", name: "먼집", station: null, scene: null,
        buckets: [bucket(60, null, [4, 250000000, 200000000, 290000000], null)] }),
    ],
  };

  it("filters by budget median and reports deals + fit", () => {
    const r = find_homes(profile(), INDEX, { network: NETWORK });
    assert.equal(r.ok, true);
    assert.equal(r.total_matching, 2);
    const first = r.candidates[0];
    assert.equal(first.tenures[0].median_won, 300000000);
    assert.equal(first.deals_in_bucket, 5);
    assert.equal(first.tenures[0].budget_fit, "partial");
    assert.ok(first.sources.some((s) => s.includes("실거래")));
  });

  it("filters by kind and regions", () => {
    const byKind = find_homes(profile(), INDEX, { kind: "오피스텔" });
    assert.deepEqual(byKind.candidates.map((c) => c.id), []);
    const byRegion = find_homes(profile(), INDEX, { regions: ["gangnam"] });
    assert.equal(byRegion.total_matching, 0);
    const bundang = find_homes(profile(), INDEX, { regions: ["bundang"] });
    assert.equal(bundang.total_matching, 2);
  });

  it("respects the commute ceiling only when walk is known", () => {
    const p = profile({ commuteMax: field(10, "customer", "") });
    const r = find_homes(p, INDEX, { network: NETWORK });
    // 먼집 has unknown walk: kept (never filtered on a guess).
    assert.equal(r.total_matching, 2);
  });

  it("labels unknown walk and ride, never guesses", () => {
    const r = find_homes(profile(), INDEX, { network: NETWORK });
    const far = r.candidates.find((c) => c.id === "home-000003");
    assert.match(far.commute_ko, /도보 미확인/);
    assert.match(far.commute_ko, /승차 미확인/);
    assert.equal(far.scene, null);
    const near = r.candidates.find((c) => c.id === "home-000001");
    assert.match(near.commute_ko, /도보 8분/);
    assert.match(near.commute_ko, /수인·분당선/);
    assert.match(near.commute_ko, /승차 미확인/);
    // commuteLine is stable over serialisation.
    assert.equal(commuteLine(near.commute), near.commute_ko);
    assert.match(commuteLine({ walk: { known: true, station: "역", minutes: 0.2 }, ride: { lines: [] } }),
      /도보 1분 이내/);
  });

  it("uses the customer's ride minutes when given", () => {
    const p = profile({
      workplaces: field([{ member: 0, text: "판교",
        resolved: { station: "판교" }, ride_minutes: 25 }], "customer", ""),
    });
    const r = find_homes(p, INDEX, { network: NETWORK });
    const near = r.candidates.find((c) => c.id === "home-000001");
    assert.match(near.commute_ko, /승차 25분/);
    assert.match(near.commute_ko, /고객님/);
  });
});

describe("find_homes sorting and no-score contract", () => {
  const INDEX = {
    homes: [
      home({ id: "home-a", station: { station: "정자", walk_minutes: 15, source: "graph" },
        buckets: [bucket(60, null, [9, 300000000, 1, 400000000], null)] }),
      home({ id: "home-b", station: { station: "정자", walk_minutes: 5, source: "graph" },
        buckets: [bucket(60, null, [2, 300000000, 1, 400000000], null)] }),
    ],
  };

  it("defaults to 출퇴근 짧은 순 and shows the sort", () => {
    assert.equal(DEFAULT_HOME_SORT, "commute");
    const r = find_homes(profile(), INDEX, { network: NETWORK });
    assert.equal(r.sort, "commute");
    assert.match(r.sort_note, /출퇴근 짧은 순/);
    assert.deepEqual(r.candidates.map((c) => c.id), ["home-b", "home-a"]);
  });

  it("says so when no walk is known (deals order)", () => {
    const unknown = {
      homes: [home({ id: "u1", station: null, scene: null })],
    };
    const r = find_homes(profile(), unknown, {});
    assert.match(r.sort_note, /도보 확인된 집이 없어/);
  });

  it("sorts by deals count on request", () => {
    const r = find_homes(profile(), INDEX, { sort: "deals" });
    assert.deepEqual(r.candidates.map((c) => c.id), ["home-a", "home-b"]);
    assert.match(r.sort_note, new RegExp(HOME_SORT_KO.deals));
  });

  it("carries no score, no rank, no 추천", () => {
    const r = find_homes(profile(), INDEX, { network: NETWORK });
    const blob = JSON.stringify(r);
    for (const key of ["score", "rank", "추천", "1위", "베스트", "rating"]) {
      assert.ok(!blob.includes(key), `contract leak: ${key}`);
    }
    for (const c of r.candidates) {
      assert.ok(!("score" in c) && !("rank" in c));
    }
  });

  it("safety-first priority falls back to commute with a note", () => {
    const p = profile({
      priorities: field({ edu: 1, life: 1, safety: 5, money: 1, convenience: 1 },
        "customer", ""),
    });
    const r = find_homes(p, INDEX, { sort: "priority", network: NETWORK });
    assert.match(r.sort_note, /순위를 매기지 않/);
    assert.deepEqual(r.candidates.map((c) => c.id), ["home-b", "home-a"]);
  });
});

describe("must-haves on the graph", () => {
  const BOX = {
    graph: {
      nodes: { n1: [127.1, 37.39], n2: [127.1005, 37.3905] },
      edges: { walk: [{ from: "n1", to: "n2", length_m: 390 }] },
    },
    pois: [{ category: "amenity:school", name: "가상초",
      geometry: { type: "Point", coordinates: [127.1005, 37.3905] } }],
  };

  it("measures school minutes and filters over the limit", () => {
    const mins = amenityMinutes(127.1, 37.39, "school", BOX);
    assert.equal(mins, Math.round((390 / 1.3 / 60) * 10) / 10);
    assert.equal(amenityMinutes(127.1, 37.39, "park", BOX), null);
    const p = profile({
      mustHaves: field(["초등학교 도보 10분"], "customer", ""),
    });
    const boxes = new Map([["st-정자", BOX]]);
    const ok = find_homes(p, { homes: [home()] }, { boxes });
    assert.equal(ok.total_matching, 1);
    assert.equal(ok.candidates[0].must_have_minutes.school, mins);
    const strict = profile({
      mustHaves: field(["초등학교 도보 3분"], "customer", ""),
    });
    assert.equal(find_homes(strict, { homes: [home()] }, { boxes }).total_matching, 0);
  });
});

describe("find_public_rentals", () => {
  const SNAP = {
    complexes: [
      { name: "행복주택", address: "서울특별시 송파구 문정동",
        unit_types: [{ unit_type: "26A", building_type: "아파트",
          exclusive_area_m2: 26, deposit_won: 30000000, monthly_rent_won: 200000 }] },
      { name: "먼행복", address: "경기도 하남시 망월동",
        unit_types: [{ unit_type: "36A", building_type: "아파트",
          exclusive_area_m2: 36, deposit_won: 900000000, monthly_rent_won: 500000 }] },
    ],
  };

  it("applies budget rules and sorts by monthly", () => {
    const p = profile({
      tenure: field("public", "customer", ""),
      monthlyMax: field(300000, "customer", ""),
    });
    const r = find_public_rentals(p, SNAP);
    assert.equal(r.total_matching, 1);
    assert.equal(r.candidates[0].complex_name, "행복주택");
    assert.match(r.sort_note, /매달 드는 돈/);
    assert.match(r.eligibility_note, /공고 원문/);
  });

  it("reports per-region coverage honestly", () => {
    const cov = publicRentalCoverage(SNAP, ["songpa-gu", "gangnam"]);
    assert.equal(cov["songpa-gu"].present, true);
    assert.equal(cov["gangnam"].present, false);
    assert.equal(NO_PUBLIC_RENTAL_NOTE, "이 지역 공공임대 자료 없음");
  });

  it("parses 시군구 segments, not road-name substrings", () => {
    assert.equal(regionOfAddress("서울특별시 송파구 위례성대로8길 46"), "songpa-gu");
    assert.equal(regionOfAddress("서울특별시 송파구 강동대로5길 14"), "songpa-gu");
    assert.equal(regionOfAddress("강남구 삼성동 140-32"), "gangnam");
    assert.equal(regionOfAddress("경기도 성남시 분당구 정자일로 1"), "bundang");
    assert.equal(regionOfAddress("경기도 하남시 위례동"), "wirye");
    assert.equal(regionOfAddress("부산광역시 해운대구"), null);
  });
});

describe("find_homes derived ride minutes (12a2)", () => {
  const SCHEDULE = parseInterstationCsv([
    "연번,호선,역명,소요시간,역간거리(km),호선별누계(km)",
    "1,2,A,00:00,0,0",
    "2,2,B,02:00,1.0,1.0",
    "3,2,C,01:30,0.8,1.8",
  ].join("\n"));
  const LINE2 = { lines: [{ id: "line2", name: "2호선",
    stops: [
      { id: "a", key: "A", name: "A" },
      { id: "b", key: "B", name: "B" },
      { id: "c", key: "C", name: "C" },
    ],
    patterns: [{ id: "p", stops: ["a", "b", "c"], chainage_km: [0, 1.0, 1.8] }],
  }] };
  const lineProfile = (extra = {}) => profile({
    workplaces: field([{ member: 0, text: "C",
      resolved: { station: "C" } }], "customer", ""),
    ...extra,
  });
  const lineHome = (id, station, walk) => home({ id,
    station: station ? { station, walk_minutes: walk, source: "graph" } : null });

  it("derives schedule minutes on covered lines with the source label", () => {
    const r = find_homes(lineProfile(), { homes: [lineHome("h1", "A", 5)] },
      { network: LINE2, schedule: SCHEDULE });
    const c = r.candidates[0];
    assert.equal(c.commute.ride.source, "derived");
    assert.equal(c.commute.ride.minutes, 3.5);
    assert.match(c.commute_ko, /승차 약 3\.5분/);
    assert.match(c.commute_ko, /서울교통공사 표준 운행시간/);
    assert.match(c.commute_ko, /대기 시간 제외/);
    assert.ok(c.sources.includes("서울교통공사 표준 운행시간"));
  });

  it("estimates non-covered lines from the file median and labels it", () => {
    const r = find_homes(profile(), { homes: [lineHome("h1", "정자", 8)] },
      { network: NETWORK, schedule: SCHEDULE });
    const c = r.candidates[0];
    // 3.0 km × median((2/1, 1.5/0.8)) = 3 × 1.9375 = 5.8125 → 5.8.
    assert.equal(c.commute.ride.source, "derived");
    assert.equal(c.commute.ride.minutes, 5.8);
    assert.match(c.commute_ko, /추정 · 1~8호선 평균 속도 적용/);
    assert.ok(c.sources.includes("추정 · 1~8호선 평균 속도"));
  });

  it("lets the customer's number override every derivation", () => {
    const p = lineProfile({
      workplaces: field([{ member: 0, text: "C",
        resolved: { station: "C" }, ride_minutes: 25 }], "customer", ""),
    });
    const r = find_homes(p, { homes: [lineHome("h1", "A", 5)] },
      { network: LINE2, schedule: SCHEDULE });
    const c = r.candidates[0];
    assert.equal(c.commute.ride.source, "customer");
    assert.equal(c.commute.ride.minutes, 25);
    assert.match(c.commute_ko, /승차 25분 \(고객님이 알려주신 값\)/);
  });

  it("sorts the default commute by walk+ride total, unknown walk last", () => {
    const index = { homes: [
      lineHome("far", "A", 5), // ride 3.5 → total 8.5
      lineHome("near", "B", 5), // ride 1.5 → total 6.5
      lineHome("unknown", null, null),
    ] };
    const r = find_homes(lineProfile(), index,
      { network: LINE2, schedule: SCHEDULE });
    assert.deepEqual(r.candidates.map((c) => c.id), ["near", "far", "unknown"]);
  });
});
