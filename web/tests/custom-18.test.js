// 18-1: custom runs use their own data. Candidate honesty (public
// rental exclusion, thin-deal rule), member role names, the browser
// money builder (+ parity with money.mjs on demo-two-homes), stable
// scores, and custom share-card names.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

import { find_homes, isPublicRentalHome, thinDealNote, groupMedianFor,
  THIN_DEAL_NOTE } from "../src/homes.js";
import { memberLabelFor, scenarioFromProfile } from "../src/profile.js";
import { intakeToProfilePatch } from "../src/intake.js";
import { priorityValues, myScore } from "../src/priorities.js";
import { resultCardData } from "../src/ui/share.js";
import { simMomentUrl } from "../src/chat/urls.js";
// chat.jsx loads dynamically (the jsx loader registers above; static
// imports would resolve before it).
import { buildCustomMoneyDoc, referenceFromCandidate,
  priceInputsFromCandidate, jeonseCheckFromMedians, leisureTripsFromRun,
  moneyMembersFromProfile } from "../src/chat/custom-money.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

function bucket(center, tenureKey, stat) {
  const b = { center_m2: center, range_m2: [center - 5, center + 5],
    trade: null, jeonse: null, wolse: null };
  b[tenureKey] = stat;
  return b;
}

function home(id, name, kind, region, buckets) {
  return { id, name, kind, region, lon: 127.1, lat: 37.5,
    build_year: 2000, buckets, station: null, scene: null,
    pnu: null, match: "register", osm_name: null };
}

const stat = (median, count = 5) => ({ count, median_won: median,
  min_won: median - 10, max_won: median + 10 });

function profile(tenure = "jeonse", budget = null) {
  const p = { tenure: { value: tenure, source: "customer" } };
  if (budget !== null) p.depositMax = { value: budget, source: "customer" };
  return p;
}

describe("18-1 public rentals never appear in jeonse/wolse/trade results", () => {
  const pubNames = ["하얀마을(6단지)(공공임대)", "백현마을3단지(주공)임대",
    "한솔마을(7단지영구임대)(주공701-710)"];
  for (const name of pubNames) {
    it(`marks ${name}`, () => {
      assert.equal(isPublicRentalHome({ name }), true);
    });
  }
  it("does not match normal complexes", () => {
    assert.equal(isPublicRentalHome({ name: "레이크팰리스" }), false);
    assert.equal(isPublicRentalHome({ name: "(173-1)" }), false);
    assert.equal(isPublicRentalHome({}), false);
  });

  it("excludes them from jeonse results", () => {
    const index = { homes: [
      home("h1", "하얀마을(6단지)(공공임대)", "아파트", "bundang",
        [bucket(60, "jeonse", stat(150000000))]),
      home("h2", "일반아파트", "아파트", "bundang",
        [bucket(60, "jeonse", stat(400000000))]),
    ] };
    const r = find_homes(profile("jeonse", 500000000), index, { limit: 6 });
    assert.deepEqual(r.candidates.map((c) => c.id), ["h2"]);
  });

  it("lists only them for tenure=public", () => {
    const index = { homes: [
      home("h1", "하얀마을(6단지)(공공임대)", "아파트", "bundang",
        [bucket(60, "jeonse", stat(150000000))]),
      home("h2", "일반아파트", "아파트", "bundang",
        [bucket(60, "jeonse", stat(400000000))]),
    ] };
    const r = find_homes(profile("public"), index, { limit: 6 });
    assert.deepEqual(r.candidates.map((c) => c.id), ["h1"]);
  });
});

describe("18-1 thin-deal rule (1 trade far below market)", () => {
  const index = { homes: [
    home("thin", "진격의빌딩", "오피스텔", "bundang",
      [bucket(30, "jeonse", stat(50000000, 1))]),
    home("a", "보통오피스텔A", "오피스텔", "bundang",
      [bucket(30, "jeonse", stat(200000000, 6))]),
    home("b", "보통오피스텔B", "오피스텔", "bundang",
      [bucket(30, "jeonse", stat(220000000, 4))]),
  ] };

  it("flags the lone low trade", () => {
    const note = thinDealNote({ medianWon: 50000000, deals: 1,
      kind: "오피스텔", region: "bundang", centerM2: 30,
      tenureKey: "jeonse" }, index.homes);
    assert.equal(note, THIN_DEAL_NOTE);
  });

  it("group median spans the same kind + size band + region", () => {
    assert.equal(groupMedianFor({ kind: "오피스텔", region: "bundang",
      centerM2: 30, tenureKey: "jeonse" }, index.homes), 200000000);
    assert.equal(groupMedianFor({ kind: "오피스텔", region: "bundang",
      centerM2: 60, tenureKey: "jeonse" }, index.homes), null);
  });

  it("does not flag 2+ trades or near-market singles", () => {
    const base = { kind: "오피스텔", region: "bundang", centerM2: 30,
      tenureKey: "jeonse" };
    assert.equal(thinDealNote({ ...base, medianWon: 50000000, deals: 2 },
      index.homes), null);
    assert.equal(thinDealNote({ ...base, medianWon: 150000000, deals: 1 },
      index.homes), null);
  });

  it("withholds 예산 안 ✓ and sorts the flagged home last", () => {
    const r = find_homes(profile("jeonse", 500000000), index, { limit: 6 });
    const ids = r.candidates.map((c) => c.id);
    assert.equal(ids[ids.length - 1], "thin");
    const thin = r.candidates.find((c) => c.id === "thin");
    assert.equal(thin.tenures[0].budget_fit, "unknown");
    assert.equal(thin.tenures[0].thin_deal, THIN_DEAL_NOTE);
    assert.equal(thin.thin_deal, THIN_DEAL_NOTE);
    const normal = r.candidates.find((c) => c.id === "a");
    assert.equal(normal.tenures[0].budget_fit, "all");
    assert.equal(normal.thin_deal, null);
  });
});

describe("18-1 member role names", () => {
  it("names self/relations, 자녀 → 아이", () => {
    assert.equal(memberLabelFor({ role: "self" }, 0), "나");
    assert.equal(memberLabelFor({ role: "adult" }, 0), "나");
    assert.equal(memberLabelFor({ role: "adult" }, 1), "배우자");
    assert.equal(memberLabelFor({ role: "member", relation: "배우자" }, 1), "배우자");
    assert.equal(memberLabelFor({ role: "child", relation: "자녀" }, 2), "아이");
    assert.equal(memberLabelFor({ role: "child" }, 1), "아이");
    assert.equal(memberLabelFor({ role: "member", relation: "부모" }, 2), "부모");
  });

  it("keeps explicit labels, rewrites 구성원 N", () => {
    assert.equal(memberLabelFor({ label: "민지", role: "adult" }, 0), "민지");
    assert.equal(memberLabelFor({ label: "구성원 1", role: "adult" }, 0), "나");
  });

  it("scenarioFromProfile labels the household", () => {
    const prof = {
      members: { value: [{ role: "adult" }, { role: "adult" }, { role: "child" }], source: "customer" },
      workplaces: { value: [], source: "customer" },
    };
    const sc = scenarioFromProfile(prof,
      [{ id: "h1", name: "집A", scene: "box-a",
        station: { station: "판교", walk_minutes: 5 } }]);
    assert.deepEqual(sc.household.members.map((m) => m.label),
      ["나", "배우자", "아이"]);
  });

  it("intake maps school-age bands to the child role", () => {
    const patch = intakeToProfilePatch({ values: {} }, { members: [
      { relation: "자녀", ageBand: "초등" },
      { relation: "배우자", ageBand: "30대" },
    ] });
    assert.deepEqual(patch.members.map((m) => m.role),
      ["self", "child", "member"]);
  });
});

describe("18-1 custom money builder (pure parts)", () => {
  const cand = {
    tenures: [
      { tenure: "trade", median_won: 500000000, min_won: 490000000,
        max_won: 510000000, deals: 5, bucket_center_m2: 59 },
      { tenure: "jeonse", median_won: 300000000, min_won: 290000000,
        max_won: 310000000, deals: 8, bucket_center_m2: 59 },
      { tenure: "wolse", median_won: 1000000, min_won: 900000,
        max_won: 1100000, deals: 4, bucket_center_m2: 59,
        deposit_median_won: 50000000 },
    ],
  };

  it("builds price inputs per tenure from the candidate", () => {
    assert.deepEqual(priceInputsFromCandidate(cand, "매매").inputs,
      { price_won: 500000000, source: "rtms" });
    assert.deepEqual(priceInputsFromCandidate(cand, "전세").inputs,
      { price_won: 300000000, source: "rtms" });
    assert.deepEqual(priceInputsFromCandidate(cand, "월세").inputs,
      { deposit_won: 50000000, monthly_rent_won: 1000000, source: "rtms" });
    assert.equal(priceInputsFromCandidate(cand, "공공임대").entry, null);
    assert.equal(priceInputsFromCandidate({ tenures: [] }, "전세").entry, null);
  });

  it("shapes the reference like referencePrice output", () => {
    const ref = referenceFromCandidate(cand, 59);
    assert.equal(ref.trade.median, 500000000);
    assert.equal(ref.trade.count, 5);
    assert.equal(ref.jeonse.deposit.median, 300000000);
    assert.equal(ref.jeonse.count, 8);
    assert.equal(ref.wolse.monthly.median, 1000000);
    assert.equal(ref.wolse.deposit.median, 50000000);
  });

  it("computes the jeonse band from medians, sparse when thin", () => {
    const ok = jeonseCheckFromMedians({ areaM2: 59, tradeMedian: 500000000,
      tradeCount: 5, jeonseMedian: 300000000, jeonseCount: 8 });
    assert.equal(ok.computable, true);
    assert.equal(ok.ratio_pct, 60);
    assert.equal(ok.band.key, "below");
    const sparse = jeonseCheckFromMedians({ areaM2: 59, tradeMedian: 500000000,
      tradeCount: 2, jeonseMedian: 300000000, jeonseCount: 8 });
    assert.equal(sparse.computable, false);
  });

  it("sums leisure from the run's own household totals", () => {
    assert.equal(leisureTripsFromRun(
      { totals: { household: { errands_done: 33, park_visits: 10 } } }), 43);
    assert.equal(leisureTripsFromRun({ totals: {} }), null);
  });

  it("maps profile money to member ids", () => {
    const out = moneyMembersFromProfile(
      { salaryAnnual: { value: [60000000, 50000000] },
        cash: { value: 100000 } },
      [{ id: "m1" }, { id: "m2" }]);
    assert.deepEqual(out, { m1: { annual_salary_won: 60000000 },
      m2: { annual_salary_won: 50000000 } });
  });
});

describe("18-1 stable score (money doc wins, compare is a stale shim)", () => {
  const money = (leisure) => ({ homes: {
    A: { area_m2: 60, leisure_trips_30d: leisure,
      by_tenure: { 전세: { housing: { monthly_won: 100 }, remaining_won: 10,
        burden_ratio: 0.1 } },
      qol_time: { commute_minutes_per_day: 10,
        evening_at_home_minutes_per_day: 20 },
      qol_fatigue: { avg_30d: 1 }, qol_convenience: {},
      qol_education: null, qol_safety: {} },
    B: { area_m2: 60, leisure_trips_30d: leisure === null ? null : leisure + 10,
      by_tenure: { 전세: { housing: { monthly_won: 200 }, remaining_won: 5,
        burden_ratio: 0.2 } },
      qol_time: { commute_minutes_per_day: 30,
        evening_at_home_minutes_per_day: 10 },
      qol_fatigue: { avg_30d: 5 }, qol_convenience: {},
      qol_education: null, qol_safety: {} },
  } });
  const hostile = { home_a: { label: "A" }, home_b: { label: "B" },
    metrics: [{ key: "errands_done", a: 1, b: 999 },
      { key: "park_visits", a: 1, b: 999 }] };

  it("ignores compare once the money doc embeds leisure", () => {
    const a = priorityValues(money(5), null, { A: "전세", B: "전세" });
    const b = priorityValues(money(5), hostile, { A: "전세", B: "전세" });
    assert.deepEqual(a, b);
    assert.equal(a.A.life_trips, 5);
    assert.equal(a.B.life_trips, 15);
    const sa = myScore(a, null, {});
    const sb = myScore(b, null, {});
    assert.deepEqual(sa.scores, sb.scores);
  });

  it("falls back to compare for docs built before the field", () => {
    const v = priorityValues(money(null), hostile, { A: "전세", B: "전세" });
    assert.equal(v.A.life_trips, 2);
    assert.equal(v.B.life_trips, 1998);
  });
});

describe("18-1 custom share card reads the custom record", () => {
  const customDoc = () => ({ custom: true, days: 30, homes: {
    A: { complex_name: "천사의도시Ⅱ오피스텔", area_m2: 30,
      leisure_trips_30d: 20,
      by_tenure: { 전세: { housing: { monthly_won: 100000, source: "rtms" },
        remaining_won: 1000, burden_ratio: 0.1 } },
      qol_time: { commute_minutes_per_day: 40,
        evening_at_home_minutes_per_day: 100 },
      qol_fatigue: { avg_30d: 2 }, qol_convenience: {},
      qol_education: null, qol_safety: {} },
    B: { complex_name: "시그마 3", area_m2: 45, leisure_trips_30d: 30,
      by_tenure: { 전세: { housing: { monthly_won: 200000, source: "rtms" },
        remaining_won: 500, burden_ratio: 0.2 } },
      qol_time: { commute_minutes_per_day: 60,
        evening_at_home_minutes_per_day: 80 },
      qol_fatigue: { avg_30d: 4 }, qol_convenience: {},
      qol_education: null, qol_safety: {} },
  } });

  it("names the picked homes and scores from the record", () => {
    const doc = customDoc();
    const data = resultCardData({ money: doc, compare: null,
      tenures: { A: "전세", B: "전세" }, weights: null });
    assert.match(data.homes[0].headline, /천사의도시Ⅱ오피스텔 · 30㎡/);
    assert.match(data.homes[1].headline, /시그마 3 · 45㎡/);
    const want = myScore(priorityValues(doc, null, { A: "전세", B: "전세" }),
      null, {});
    assert.deepEqual(data.score.scores, want.scores);
    assert.ok(!JSON.stringify(data).includes("레이크팰리스"));
    assert.ok(!JSON.stringify(data).includes("백현마을"));
  });
});

describe("18-1 stage header + sim URL", () => {
  it("shows the customer context, never a fixed scene", async () => {
    const { stageContextLine } = await import("../src/ui/chat.jsx");
    assert.equal(stageContextLine(
      { workplaces: { value: [{ text: "판교", resolved: { station: "판교" } }] } },
      { result: { candidates: [{}, {}, {}, {}, {}, {}] } }),
    "판교 출근 · 후보 6곳");
    assert.equal(stageContextLine(null, null), "");
  });

  it("simMomentUrl carries style when given", () => {
    assert.match(simMomentUrl({ custom: "c1", style: "photo" }), /style=photo/);
    assert.ok(!simMomentUrl({ custom: "c1" }).includes("style="));
  });
});

describe("18-1 parity: browser builder vs money.mjs on demo-two-homes", () => {
  const scenPath = join(REPO, "scenarios", "demo-two-homes.json");
  const moneyPath = join(REPO, "data", "build", "sim", "demo-two-homes-money.json");
  const runAPath = join(REPO, "data", "build", "sim", "demo-two-homes-A.json");
  const runBPath = join(REPO, "data", "build", "sim", "demo-two-homes-B.json");
  const payrollPath = join(REPO, "scenarios", "assumptions", "kr-payroll.json");
  const schedPath = join(REPO, "scenarios", "transit", "seoul-metro-interstation.csv");
  const netPath = join(REPO, "data", "build", "region", "network.json");
  const have = [scenPath, moneyPath, runAPath, runBPath, payrollPath]
    .every((p) => existsSync(p));

  it("same monthly totals per home (±1원)", { skip: !have }, async () => {
    const scen = JSON.parse(await readFile(scenPath, "utf8"));
    const built = JSON.parse(await readFile(moneyPath, "utf8"));
    const runs = {
      A: JSON.parse(await readFile(runAPath, "utf8")),
      B: JSON.parse(await readFile(runBPath, "utf8")),
    };
    const payroll = JSON.parse(await readFile(payrollPath, "utf8"));
    let fareSchedule = null;
    let network = null;
    try {
      const { parseInterstationCsv } = await import("../src/transit/schedule.js");
      fareSchedule = parseInterstationCsv(await readFile(schedPath, "utf8"));
      network = JSON.parse(await readFile(netPath, "utf8"));
    } catch {
      fareSchedule = null;
      network = null;
    }
    // Candidates rebuilt from the doc's own reference medians (the
    // same numbers money.mjs priced from).
    const candFor = (label) => {
      const h = built.homes[label];
      const ref = h.reference;
      const tenures = [];
      if (ref.trade && ref.trade.count > 0) {
        tenures.push({ tenure: "trade", median_won: ref.trade.median,
          min_won: ref.trade.p25, max_won: ref.trade.p75,
          deals: ref.trade.count, bucket_center_m2: h.area_m2 });
      }
      if (ref.jeonse && ref.jeonse.count > 0) {
        tenures.push({ tenure: "jeonse", median_won: ref.jeonse.deposit.median,
          min_won: ref.jeonse.deposit.p25, max_won: ref.jeonse.deposit.p75,
          deals: ref.jeonse.count, bucket_center_m2: h.area_m2 });
      }
      if (ref.wolse && ref.wolse.count > 0) {
        tenures.push({ tenure: "wolse", median_won: ref.wolse.monthly.median,
          min_won: ref.wolse.monthly.p25, max_won: ref.wolse.monthly.p75,
          deals: ref.wolse.count, bucket_center_m2: h.area_m2,
          deposit_median_won: ref.wolse.deposit.median });
      }
      return { id: `cand-${label}`, name: h.complex_name, tenures };
    };
    const salaries = scen.household.members.map((m) =>
      (scen.money.members[m.id] || {}).annual_salary_won || 0);
    const profile = {
      tenure: { value: "jeonse", source: "customer" },
      cash: { value: scen.money.cash_won, source: "customer" },
      salaryAnnual: { value: salaries, source: "customer" },
    };
    const doc = buildCustomMoneyDoc({
      scenario: scen, runs, profile,
      picked: ["A", "B"].map((label) => {
        const sh = scen.homes.find((x) => x.label === label);
        return { label, candidate: candFor(label),
          complexName: sh.complex_name, areaId: sh.area };
      }),
      payrollTable: payroll, areas: new Map(), network, fareSchedule,
    });
    assert.equal(doc.custom, true);
    assert.equal(doc.household_monthly_net_won, built.household_monthly_net_won);
    for (const label of ["A", "B"]) {
      for (const [tenure, sel] of Object.entries(built.homes[label].by_tenure)) {
        if (!sel) continue;
        const got = doc.homes[label].by_tenure[tenure];
        assert.ok(got, `${label} ${tenure} must build`);
        assert.ok(Math.abs(got.housing.monthly_won - sel.housing.monthly_won) <= 1,
          `${label} ${tenure}: ${got.housing.monthly_won} vs ${sel.housing.monthly_won}`);
      }
      assert.equal(doc.homes[label].complex_name,
        built.homes[label].complex_name);
    }
  });
});
