import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  decodeRtms, parseRtmsCsv, normalizeTradeRow, normalizeRentRow,
  createCsvBackend, createApiBackend, mapApiItem, rtmsFileName,
  RTMS_DISCLAIMER,
} from "../src/money/rtms.js";
import { referencePrice, quantileSorted, statsOf } from "../src/money/prices.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const RAW = join(REPO, "data", "raw", "rtms");

async function hasRaw() {
  try {
    await readFile(join(RAW, rtmsFileName("apt", "trade", "songpa")));
    return true;
  } catch {
    return false;
  }
}

describe("rtms csv loader", () => {
  it("names all 18 files", () => {
    assert.equal(rtmsFileName("apt", "trade", "songpa"), "apt_trade_songpa_2510-2610.csv");
    assert.equal(rtmsFileName("officetel", "rent", "bundang"), "officetel_rent_bundang_2510-2610.csv");
    assert.equal(rtmsFileName("rowhouse", "trade", "seongdong"), "rowhouse_trade_seongdong_2510-2610.csv");
    assert.match(RTMS_DISCLAIMER, /법적 효력/);
  });

  it("parses quoted thousands separators + skips disclaimer lines", () => {
    const text = [
      '"□ 본 서비스에서 제공하는 정보는 법적인 효력이 없으므로 참고용으로만 활용하시기 바랍니다."',
      '"NO","시군구","번지","본번","부번","단지명","전용면적(㎡)","계약년월","계약일","거래금액(만원)","해제사유발생일"',
      '"1","서울특별시 송파구 잠실동","44","0044","0000","레이크팰리스","59.9700","202610","24","249,990","-"',
      '"2","서울특별시 송파구 잠실동","44","0044","0000","레이크팰리스","59.9700","202610","23","250,000","2026.10.25"',
      "",
    ].join("\n");
    const { header, rows } = parseRtmsCsv(text);
    assert.ok(header.includes("단지명"));
    assert.equal(rows.length, 2);
    const keep = normalizeTradeRow(rows[0], "apt");
    assert.equal(keep.trade_won, 2499900000); // "249,990" 만원
    assert.equal(keep.area_m2, 59.97);
    assert.equal(keep.bonbun, "0044");
    assert.equal(normalizeTradeRow(rows[1], "apt"), null); // cancelled row excluded
  });

  it("splits rent into jeonse vs wolse", () => {
    const j = normalizeRentRow({ "시군구": "a", "본번": "1", "부번": "0", "단지명": "b",
      "전용면적(㎡)": "59.97", "계약년월": "202610", "계약일": "27",
      "보증금(만원)": "99,700", "월세금(만원)": "0", "전월세구분": "전세" }, "apt");
    assert.equal(j.rent_kind, "jeonse");
    assert.equal(j.deposit_won, 997000000);
    const w = normalizeRentRow({ "시군구": "a", "본번": "1", "부번": "0", "단지명": "b",
      "전용면적(㎡)": "59.97", "계약년월": "202610", "계약일": "27",
      "보증금(만원)": "15,000", "월세금(만원)": "300", "전월세구분": "월세" }, "apt");
    assert.equal(w.rent_kind, "wolse");
    assert.equal(w.monthly_won, 3000000);
  });

  it("reads 건물명 rowhouse headers too", () => {
    const text = [
      '"NO","시군구","번지","본번","부번","건물명","전용면적(㎡)","대지권면적(㎡)","계약년월","계약일","거래금액(만원)","해제사유발생일"',
      '"1","서울특별시 송파구 방이동","10","0010","0000","방이빌라","49.5","30.0","202610","01","30,000","-"',
    ].join("\n");
    const { rows } = parseRtmsCsv(text);
    assert.equal(normalizeTradeRow(rows[0], "rowhouse").complex, "방이빌라");
  });

  it("loads the real files (cp949, all 18)", async (t) => {
    if (!await hasRaw()) return t.skip("no data/raw/rtms");
    const backend = createCsvBackend({ rawDir: RAW, readFile: (p) => readFile(p) });
    let total = 0;
    for (const district of ["songpa", "seongdong", "bundang"]) {
      const rows = await backend.loadAll(district);
      assert.ok(rows.length > 1000, `${district}: ${rows.length}`);
      total += rows.length;
      // Cancelled trade rows are gone; every row has a parcel + area.
      for (const r of rows.slice(0, 200)) {
        assert.ok(r.sigungu && r.bonbun !== undefined);
      }
    }
    assert.ok(total > 50000, `total ${total}`);
    // cp949 check: no replacement chars in a raw decode.
    const raw = await readFile(join(RAW, rtmsFileName("apt", "trade", "songpa")));
    assert.equal(decodeRtms(raw).includes("�"), false);
  });

  it("computes medians/p25-p75/count/period per area bucket", () => {
    const rows = [];
    for (let i = 0; i < 9; i++) {
      rows.push({ deal: "trade", area_m2: 59.97, trade_won: (20 + i) * 100000000,
        contract_ym: `20260${(i % 9) + 1}` });
    }
    rows.push({ deal: "trade", area_m2: 84.0, trade_won: 999, contract_ym: "202601" }); // outside ±5㎡
    const ref = referencePrice(rows, { areaM2: 60 });
    assert.equal(ref.trade.count, 9);
    assert.equal(ref.trade.median, 2400000000); // nearest-rank of 20..28
    assert.equal(ref.trade.p25, 2200000000);
    assert.equal(ref.trade.p75, 2600000000);
    assert.deepEqual(ref.period, { from: "202601", to: "202609" });
    assert.deepEqual(statsOf([]), { count: 0, median: null, p25: null, p75: null });
    assert.equal(quantileSorted([], 0.5), null);
  });
});

describe("rtms api backend (stubbed)", () => {
  it("maps API items through the same normaliser", async () => {
    const payload = { response: { body: { items: { item: [
      { aptNm: "레이크팰리스", excluUseAr: "59.97", dealYear: "2026", dealMonth: "10", dealDay: "24",
        dealAmount: "249,990", bonbun: "0044", bubun: "0000",
        sidoNm: "서울특별시", sggNm: "송파구", umdNm: "잠실동", aptSeq: "123", "해제여부": "" },
      { aptNm: "레이크팰리스", excluUseAr: "59.97", dealYear: "2026", dealMonth: "10", dealDay: "23",
        dealAmount: "250,000", "해제여부": "O" },
    ] } } } };
    const backend = createApiBackend({
      fetchImpl: async () => ({ ok: true, json: async () => payload }),
      serviceKey: "stub",
      endpoints: { "apt|trade|songpa": "https://example.invalid/rtms" },
    });
    const rows = await backend.load("apt", "trade", "songpa");
    assert.equal(rows.length, 1); // 해제여부=O excluded
    assert.equal(rows[0].trade_won, 2499900000);
    assert.equal(rows[0].apt_seq, "123");
    const rent = mapApiItem({ aptNm: "x", excluUseAr: "10", dealYear: "2026", dealMonth: "1",
      dealDay: "1", deposit: "1,000", monthlyAmount: "50" }, "rent");
    assert.equal(rent.rent_kind, "wolse");
    const noFetch = createApiBackend({ fetchImpl: null });
    await assert.rejects(() => noFetch.load("apt", "trade", "songpa"), /no fetch/);
  });
});
