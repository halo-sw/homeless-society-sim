import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tinyArea, tinyScenario } from "./engine-fixture.js";
import { createSession, callTool, TOOL_DEFS } from "../src/consult/tools.js";
import { createCsvBackend } from "../src/money/rtms.js";
import { normalizeSnapshot } from "../src/money/housing.js";
import { rowsForComplex } from "../src/money/prices.js";
import { numbersOnlyAnswer } from "../src/consult/guards.js";
import { parseListingText, guardListingValues, plainListingFields,
  listingPosition, last12Months, filterPublicListings,
  filterShapedListings, haversineKm, parseAnnouncedAt } from "../src/money/listing.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

// Briefed fixtures: apartment 전세, officetel 월세, villa 매매 (area missing).
const APT_JEONSE = [
  "송파구 잠실동 레이크팰리스 101동 5층",
  "전세 9억 8000만, 전용 59.97㎡, 관리비 15만",
].join("\n");
const OFFICETEL_WOLSE = [
  "성동구 성수동2가 아크로서울타워 12층",
  "월세 보증금 1억, 월 250만원, 28평, 관리비 20만원",
].join("\n");
const VILLA_TRADE = [
  "분당구 백현동 백현마을 3단지",
  "매매 26억 5000, 3층",
].join("\n");

function assertEvidenceInText(fields, text) {
  for (const [key, f] of Object.entries(fields)) {
    if (!f || typeof f !== "object" || f.value === null || f.value === undefined) continue;
    assert.ok(typeof f.evidence === "string" && f.evidence.length > 0, `${key} evidence`);
    assert.ok(text.includes(f.evidence), `${key} evidence ${JSON.stringify(f.evidence)} not in text`);
  }
}

describe("parse_listing guard", () => {
  it("reads the apartment 전세 fixture, every value in the text", () => {
    const r = parseListingText(APT_JEONSE);
    assert.equal(r.ok, true);
    assert.deepEqual(plainListingFields(r.fields), {
      deal_type: "전세", price_won: null, deposit_won: 980000000,
      monthly_won: null, area_m2: 59.97, area_note: null, floor: 5,
      complex_name: "레이크팰리스", address: "송파구 잠실동",
      maintenance_won_month: 150000,
    });
    assert.deepEqual(r.missing, []);
    assertEvidenceInText(r.fields, APT_JEONSE);
    assert.deepEqual(guardListingValues(r.fields, APT_JEONSE), []);
  });

  it("reads the officetel 월세 fixture, 평 converts with a stated factor", () => {
    const r = parseListingText(OFFICETEL_WOLSE);
    assert.equal(r.ok, true);
    const plain = plainListingFields(r.fields);
    assert.equal(plain.deal_type, "월세");
    assert.equal(plain.deposit_won, 100000000);
    assert.equal(plain.monthly_won, 2500000);
    assert.equal(plain.area_m2, 92.56);
    assert.match(r.fields.area_note, /3\.3058/);
    assert.equal(plain.floor, 12);
    assert.equal(plain.complex_name, "아크로서울타워");
    assert.equal(plain.maintenance_won_month, 200000);
    assert.deepEqual(r.missing, []);
    assertEvidenceInText(r.fields, OFFICETEL_WOLSE);
  });

  it("asks back the missing area on the villa 매매 fixture", () => {
    const r = parseListingText(VILLA_TRADE);
    assert.equal(r.ok, true);
    const plain = plainListingFields(r.fields);
    assert.equal(plain.deal_type, "매매");
    assert.equal(plain.price_won, 2650000000);
    assert.equal(plain.area_m2, null);
    assert.deepEqual(r.missing, [{ field: "area_m2", ask: "집 크기를 적어주세요. (예: 59㎡)" }]);
    assertEvidenceInText(r.fields, VILLA_TRADE);
  });

  it("rejects values whose evidence is not in the text", () => {
    const r = parseListingText(APT_JEONSE);
    const tampered = {
      ...r.fields,
      deposit_won: { value: 100, evidence: "10억" },
      floor: { value: 99, evidence: "" },
    };
    const errors = guardListingValues(tampered, APT_JEONSE);
    assert.equal(errors.length, 2);
    assert.ok(errors.every((e) => e.includes("글에 없는 값")));
  });

  it("refuses empty and oversized texts", () => {
    assert.equal(parseListingText("  ").ok, false);
    assert.equal(parseListingText("x".repeat(2001)).ok, false);
    assert.match(parseListingText("x".repeat(2001)).error, /2000자/);
  });
});

describe("listing price position", () => {
  it("does the percentile maths on synthetic values", () => {
    const p = listingPosition(100, [80, 90, 100, 110, 120]);
    assert.equal(p.computable, true);
    assert.equal(p.n, 5);
    assert.equal(p.median_won, 100);
    assert.equal(p.min_won, 80);
    assert.equal(p.max_won, 120);
    assert.equal(p.cheaper, 2);
    assert.equal(p.pricier, 2);
    assert.match(p.band_text, /상위 40% 수준/);
    assert.match(p.detail, /싼 거래가 2건, 비싼 거래가 2건/);
    const top = listingPosition(130, [80, 90, 100]);
    assert.match(top.band_text, /가장 비싼 수준/);
    const bottom = listingPosition(70, [80, 90, 100]);
    assert.match(bottom.band_text, /가장 싼 수준/);
  });

  it("stays honest with too few trades", () => {
    const p = listingPosition(100, [90, 110]);
    assert.equal(p.computable, false);
    assert.match(p.note, /2건뿐/);
    assert.equal(listingPosition(null, [1, 2, 3]).computable, false);
  });

  it("last12Months cuts to the rows' own range", () => {
    const rows = [{ contract_ym: "202401" }, { contract_ym: "202412" }, { contract_ym: "202506" }];
    assert.deepEqual(last12Months(rows).map((r) => r.contract_ym), ["202412", "202506"]);
    assert.deepEqual(last12Months([{ contract_ym: null }]).length, 1);
  });

  it("places a 레이크팰리스 asking among real CSV rows", async (t) => {
    let rows;
    try {
      const backend = createCsvBackend({
        rawDir: join(REPO, "data", "raw", "rtms"), readFile: (p) => readFile(p),
      });
      rows = await backend.loadAll("songpa");
    } catch {
      return t.skip("no real data");
    }
    const lake = rowsForComplex(rows, { complexName: "레이크팰리스" })
      .filter((r) => r.deal === "rent" && !(r.monthly_won > 0)
        && Number.isFinite(r.area_m2) && Math.abs(r.area_m2 - 59.97) <= 5);
    const recent = last12Months(lake);
    if (recent.length < 3) return t.skip("sparse bucket");
    const p = listingPosition(980000000, recent.map((r) => r.deposit_won));
    assert.equal(p.computable, true);
    assert.equal(p.n, recent.length);
    assert.ok(p.median_won > 0);
    assert.ok(p.cheaper + p.pricier <= p.n);
    assert.match(p.band_text, /수준이에요/);
    assert.ok(!JSON.stringify(p).includes("싸다") && !JSON.stringify(p).includes("비싸다"));
  });
});

describe("public listing filters", () => {
  const snap = {
    fetched_at: "2026-10-28T19:19:15+0900",
    complexes: [
      { source: "lh-complexes", id: "c1", name: "송파 A", address: "서울특별시 송파구 성내천로 1",
        latitude: 37.51, longitude: 127.12, pnu: null, snapshot_at: "",
        unit_types: [
          { unit_type: "29", building_type: "아파트", exclusive_area_m2: 29.2,
            deposit_won: 4183000, monthly_rent_won: 253960 },
          { unit_type: "44", building_type: "아파트", exclusive_area_m2: 44.37,
            deposit_won: 5685000, monthly_rent_won: 319310 },
        ] },
      { source: "youth-complexes", id: "c2", name: "성수 B", address: "성동구 성수동 2",
        latitude: 37.54, longitude: 127.05, pnu: null, snapshot_at: "", unit_types: [] },
    ],
    notices: [
      { source: "lh-notices", id: "n1", title: "송파 공고", announced_at: "2026.09.20",
        address: "서울특별시 송파구", source_url: "https://example.com/1", snapshot_at: "" },
      { source: "lh-notices", id: "n2", title: "옛 공고", announced_at: "2020.01.01",
        address: "", source_url: "https://example.com/2", snapshot_at: "" },
    ],
  };

  it("filters by region, recency, area and distance", () => {
    const region = filterPublicListings(snap, { region: "송파구" });
    assert.equal(region.complex_total, 1);
    assert.equal(region.complexes[0].id, "c1");
    assert.equal(region.notice_total, 1);
    const recent = filterPublicListings(snap, { recent_only: true });
    assert.deepEqual(recent.notices.map((n) => n.id), ["n1"]);
    assert.equal(recent.notices[0].announced_day, "2026-09-20");
    assert.equal(recent.notices[0].recent, true);
    const area = filterPublicListings(snap, { min_area_m2: 40 });
    assert.equal(area.complex_total, 2); // c2's area is unknown: kept, flagged by nulls
    assert.equal(area.complexes.find((c) => c.id === "c2").area_min_m2, null);
    const tiny = filterPublicListings(snap, { max_area_m2: 20 });
    assert.deepEqual(tiny.complexes.map((c) => c.id), ["c2"]);
    const near = filterPublicListings(snap,
      { near: { lon: 127.12, lat: 37.51, max_km: 3 } });
    assert.deepEqual(near.complexes.map((c) => c.id), ["c1"]);
    assert.equal(near.complexes[0].distance_km, 0);
    assert.ok(region.notes.some((n) => n.includes("마감일")));
  });

  it("filters the shaped money.mjs block the same way", () => {
    const shaped = {
      fetched_at: "2026-10-28T19:19:15+0900",
      complexes: [
        { id: "c1", address: "서울특별시 송파구 성내천로 1",
          area_min_m2: 29.2, area_max_m2: 44.37, distance_to_work_m: 9600 },
        { id: "c2", address: "성동구 성수동 2",
          area_min_m2: null, area_max_m2: null, distance_to_work_m: null },
      ],
      notices: [
        { id: "n1", title: "송파 공고", address: "서울특별시 송파구",
          announced_day: "2026-09-20", recent: true },
        { id: "n2", title: "옛 공고", address: "",
          announced_day: "2020-01-01", recent: false },
      ],
    };
    const region = filterShapedListings(shaped, { region: "송파구" });
    assert.deepEqual(region.complexes.map((c) => c.id), ["c1"]);
    assert.deepEqual(region.notices.map((n) => n.id), ["n1"]);
    const recent = filterShapedListings(shaped, { recent_only: true });
    assert.deepEqual(recent.notices.map((n) => n.id), ["n1"]);
    const area = filterShapedListings(shaped, { min_area_m2: 40 });
    assert.equal(area.complex_total, 2); // unknown range kept
    const small = filterShapedListings(shaped, { max_area_m2: 20 });
    assert.deepEqual(small.complexes.map((c) => c.id), ["c2"]);
    const near = filterShapedListings(shaped, { near_work_max_m: 10000 });
    assert.deepEqual(near.complexes.map((c) => c.id), ["c1"]);
  });

  it("parses announced dates and measures distance", () => {
    assert.equal(parseAnnouncedAt("2024.09.20"), "2024-09-20");
    assert.equal(parseAnnouncedAt("2026-08-25T00:00:00"), "2026-08-25");
    assert.equal(parseAnnouncedAt("soon"), null);
    const km = haversineKm(127.0, 37.5, 127.01, 37.5);
    assert.ok(km > 0.8 && km < 1.0);
  });

  it("runs the same filters on the real snapshot when present", async () => {
    let raw;
    try {
      raw = JSON.parse(await readFile(
        join(REPO, "data", "raw", "public_housing", "snapshot_3districts.json"), "utf8"));
    } catch {
      return; // raw data absent: skip
    }
    const normalized = normalizeSnapshot(raw);
    assert.ok(normalized.complexes.length > 0 && normalized.notices.length > 0);
    const out = filterPublicListings(normalized,
      { region: "송파구", recent_only: true, limit: 50 });
    assert.ok(out.notices.every((n) => n.recent));
    assert.ok(out.notices.every((n) =>
      `${n.address} ${n.title}`.includes("송파구") || !n.address));
    assert.ok(out.complexes.every((c) => c.address.includes("송파구")));
  });
});

function fixtureRtms() {
  const rows = [];
  for (const [i, won] of [900000000, 1000000000, 1100000000].entries()) {
    rows.push({ sigungu: "경기도 성남시 분당구", bonbun: "1", bubun: "",
      complex: "알파", area_m2: 55, contract_ym: `20260${i + 1}`, contract_day: 5,
      deal: "trade", housing_type: "apt", trade_won: won });
  }
  for (const [i, won] of [380000000, 400000000, 420000000].entries()) {
    rows.push({ sigungu: "경기도 성남시 분당구", bonbun: "1", bubun: "",
      complex: "알파", area_m2: 55, contract_ym: `20260${i + 4}`, contract_day: 5,
      deal: "rent", housing_type: "apt", rent_kind: "jeonse",
      deposit_won: won, monthly_won: 0 });
  }
  return rows;
}

function sessionListing(over = {}) {
  return createSession({
    scenario: tinyScenario({ days: 7, background: 0, seed: 7,
      homes: [
        { label: "A", area: "pangyo", complex_name: "알파" },
        { label: "B", area: "pangyo", complex_name: "베타" },
      ] }),
    loadArea: async () => tinyArea(),
    loadRtms: async () => fixtureRtms(),
    loadAssumption: async (name) => JSON.parse(await readFile(
      join(REPO, "scenarios", "assumptions", name), "utf8")),
    ...over,
  });
}

describe("listing tools", () => {
  it("registers parse_listing, check_listing, add_listing_c", () => {
    const names = TOOL_DEFS.map((d) => d.function.name);
    for (const name of ["parse_listing", "check_listing", "add_listing_c"]) {
      assert.ok(names.includes(name), name);
    }
  });

  it("parse_listing reads text and asks back", async () => {
    const s = sessionListing();
    const full = await callTool(s, "parse_listing", { text: APT_JEONSE });
    assert.equal(full.ok, true);
    assert.equal(full.fields.deposit_won, 980000000);
    assert.deepEqual(full.missing, []);
    assert.match(full.next, /check_listing/);
    const villa = await callTool(s, "parse_listing", { text: VILLA_TRADE });
    assert.equal(villa.ok, true);
    assert.equal(villa.missing.length, 1);
    assert.match(villa.next, /집 크기/);
    assert.equal((await callTool(s, "parse_listing", { text: "  " })).ok, false);
  });

  it("check_listing places the asking value, never 싼지/비싼지", async () => {
    const s = sessionListing();
    const r = await callTool(s, "check_listing", {
      area: "pangyo", deal_type: "전세", deposit_won: 410000000,
      area_m2: 55, complex_name: "알파", address: "분당구",
    });
    assert.equal(r.ok, true);
    assert.equal(r.listing_check, true);
    assert.equal(r.complex, "알파");
    const pos = r.positions.deposit;
    assert.equal(pos.computable, true);
    assert.equal(pos.n, 3);
    assert.equal(pos.median_won, 400000000);
    assert.equal(pos.cheaper, 2);
    assert.equal(pos.pricier, 1);
    assert.match(pos.band_text, /상위 33% 수준/);
    assert.equal(r.address_match, true);
    assert.ok(r.ratio && r.ratio.computable);
    assert.ok(r.register && Array.isArray(r.register.rows));
    const blob = JSON.stringify(r);
    for (const word of ["싸다", "비싸다", "계약하세요", "계약해도", "사세요", "사지 마"]) {
      assert.ok(!blob.includes(word), `leaked ${word}`);
    }
  });

  it("check_listing asks for what's missing and stays honest off-region", async () => {
    const s = sessionListing();
    const noArea = await callTool(s, "check_listing",
      { deal_type: "매매", price_won: 100, complex_name: "알파" });
    assert.equal(noArea.ok, false);
    assert.match(noArea.error, /area_m2/);
    const unknown = await callTool(s, "check_listing",
      { deal_type: "전세", deposit_won: 400000000, area_m2: 55, complex_name: "없는단지" });
    assert.equal(unknown.ok, true);
    assert.equal(unknown.computable, false);
    assert.match(unknown.note, /지은 지역/);
    const blob = JSON.stringify(unknown);
    for (const word of ["싸다", "비싸다", "계약하세요"]) {
      assert.ok(!blob.includes(word), `leaked ${word}`);
    }
  });

  it("add_listing_c adds home C with the listing's deal", async () => {
    const s = sessionListing();
    const r = await callTool(s, "add_listing_c", {
      area: "pangyo", complex: "알파", deal_type: "전세",
      area_m2: 55, deposit_won: 410000000,
    });
    assert.equal(r.ok, true);
    assert.equal(r.home.label, "C");
    assert.equal(r.home.complex_name, "알파");
    assert.equal(s.scenario.homes.find((h) => h.label === "C").area, "pangyo");
    assert.equal(s.scenario.money.tenure.C, "전세");
    assert.equal(s.scenario.money.home_c.source, "customer_listing");
    assert.match(r.next, /living_cost/);
    const bad = await callTool(s, "add_listing_c",
      { complex: "없는단지", deal_type: "전세", area_m2: 55, deposit_won: 1 });
    assert.equal(bad.ok, false);
  });

  it("numbers-only fallback narrates listing results", () => {
    const out = numbersOnlyAnswer([{ ok: true, listing_check: true,
      complex: "알파",
      positions: { deposit: { computable: true, asking_won: 410000000,
        median_won: 400000000, n: 3, band_text: "가장 비싼 수준이에요" } },
      ratio: { computable: true, ratio_pct: 40, band: { label: "70% 미만" } } }]);
    assert.match(out, /410,000,000|4억 1,000만/);
    assert.match(out, /가장 비싼 수준/);
    assert.match(out, /보증금이 집값의 40%/);
    assert.match(out, /계약 판단도 하지 않아요/);
    const parsed = numbersOnlyAnswer([{ ok: true,
      fields: { deal_type: "전세", deposit_won: 100 },
      missing: [{ field: "area_m2", ask: "집 크기를 적어주세요." }] }]);
    assert.match(parsed, /매물에서 읽은 값/);
    assert.match(parsed, /집 크기를 적어주세요/);
  });
});
