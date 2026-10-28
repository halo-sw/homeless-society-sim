import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { jeonseRatio, registerSignals, validateChecklist,
  JEONSE_SPARSE_NOTE, JEONSE_REF_NOTE } from "../src/money/jeonse.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

function trade(won, area = 60, ym = "202603") {
  return { deal: "trade", housing_type: "apt", trade_won: won,
    area_m2: area, contract_ym: ym, complex: "T" };
}
function jeonse(won, area = 60, ym = "202603") {
  return { deal: "rent", rent_kind: "jeonse", housing_type: "apt",
    deposit_won: won, monthly_won: 0, area_m2: area, contract_ym: ym, complex: "T" };
}

describe("jeonse ratio", () => {
  it("median ÷ median with counts", () => {
    const r = jeonseRatio([
      trade(100000000), trade(200000000), trade(300000000),
      jeonse(70000000), jeonse(80000000), jeonse(90000000),
    ], { areaM2: 60 });
    assert.equal(r.computable, true);
    assert.equal(r.ratio_pct, 40);
    assert.equal(r.trade.median, 200000000);
    assert.equal(r.trade.count, 3);
    assert.equal(r.jeonse.median, 80000000);
    assert.equal(r.jeonse.count, 3);
    assert.equal(r.band.key, "below");
    assert.equal(r.band.criterion_id, "C-jeonse-ratio-caution");
    assert.equal(r.ref_note, JEONSE_REF_NOTE);
  });

  it("bands cite their criterion ids", () => {
    const rows75 = [trade(100000000), trade(100000000), trade(100000000),
      jeonse(75000000), jeonse(75000000)];
    const w = jeonseRatio(rows75, { areaM2: 60 });
    assert.equal(w.ratio_pct, 75);
    assert.equal(w.band.key, "watch");
    assert.equal(w.band.criterion_id, "C-jeonse-ratio-caution");
    const rows85 = [trade(100000000), trade(100000000), trade(100000000),
      jeonse(85000000), jeonse(85000000)];
    const hi = jeonseRatio(rows85, { areaM2: 60 });
    assert.equal(hi.ratio_pct, 85);
    assert.equal(hi.band.key, "high");
    assert.equal(hi.band.criterion_id, "C-jeonse-ratio-warning");
    // Band wording never judges.
    for (const b of [w, hi]) {
      assert.ok(!/안전|위험/.test(JSON.stringify(b.band)));
    }
  });

  it("sparse sales render the honest note", () => {
    const r = jeonseRatio([trade(100000000), trade(110000000), jeonse(80000000)], { areaM2: 60 });
    assert.equal(r.computable, false);
    assert.equal(r.ratio_pct, null);
    assert.equal(r.note, JEONSE_SPARSE_NOTE);
    assert.match(JEONSE_SPARSE_NOTE, /매매 거래가 적어 산출이 어렵습니다/);
    const none = jeonseRatio([jeonse(80000000)], { areaM2: 60 });
    assert.equal(none.computable, false);
  });

  it("area bucket and ym window filter", () => {
    const r = jeonseRatio([
      trade(100000000, 60, "202601"), trade(100000000, 60, "202606"),
      trade(100000000, 60, "202612"), trade(999000000, 80, "202606"),
      jeonse(50000000, 60, "202606"), jeonse(50000000, 60, "202001"),
    ], { areaM2: 60, fromYm: "202602", toYm: "202612" });
    assert.equal(r.trade.count, 2); // 202601 and 80㎡ fall out
    assert.equal(r.computable, false); // < 3 trades
  });

  it("real CSVs: 레이크팰리스 and 백현마을 (real data)", async (t) => {
    let songpa;
    let bundang;
    try {
      const { createCsvBackend } = await import("../src/money/rtms.js");
      const backend = createCsvBackend({
        rawDir: join(REPO, "data", "raw", "rtms"), readFile: (p) => readFile(p),
      });
      songpa = await backend.loadAll("songpa");
      bundang = await backend.loadAll("bundang");
    } catch {
      return t.skip("no real data");
    }
    const { rowsForComplex } = await import("../src/money/prices.js");
    const lake = jeonseRatio(rowsForComplex(songpa, { complexName: "레이크팰리스" }), { areaM2: 59.97 });
    assert.equal(lake.computable, true);
    assert.ok(lake.trade.count >= 3 && lake.jeonse.count > 0);
    assert.ok(lake.ratio_pct > 10 && lake.ratio_pct < 90);
    const baekhyun = jeonseRatio(rowsForComplex(bundang, { complexName: "백현마을" }), { areaM2: 84.82 });
    assert.equal(baekhyun.computable, true);
    assert.ok(baekhyun.trade.count >= 3 && baekhyun.jeonse.count > 0);
    assert.ok(baekhyun.ratio_pct > 10 && baekhyun.ratio_pct < 90);
  });

  it("real CSVs: a sparse rowhouse case (real data)", async (t) => {
    let rows;
    try {
      const { createCsvBackend } = await import("../src/money/rtms.js");
      const backend = createCsvBackend({
        rawDir: join(REPO, "data", "raw", "rtms"), readFile: (p) => readFile(p),
      });
      rows = await backend.loadAll("songpa");
    } catch {
      return t.skip("no real data");
    }
    // A rowhouse building with 1–2 sale rows: the sparse path on real data.
    const tradesByComplex = new Map();
    for (const r of rows) {
      if (r.deal !== "trade" || r.housing_type !== "rowhouse" || !r.complex) continue;
      if (!tradesByComplex.has(r.complex)) tradesByComplex.set(r.complex, []);
      tradesByComplex.get(r.complex).push(r);
    }
    const sparse = [...tradesByComplex.entries()].find(([, v]) => v.length >= 1 && v.length < 3);
    if (!sparse) return t.skip("no sparse rowhouse complex");
    const [name, trades] = sparse;
    const areas = trades.map((r) => r.area_m2).filter(Number.isFinite).sort((a, b) => a - b);
    const subset = rows.filter((r) => r.complex === name);
    const r = jeonseRatio(subset, { areaM2: areas[Math.floor(areas.length / 2)] });
    assert.equal(r.computable, false);
    assert.equal(r.note, JEONSE_SPARSE_NOTE);
  });
});

describe("register signals", () => {
  it("shows present fields", () => {
    const s = registerSignals([
      { register: { address: "서울특별시 송파구 잠실동", use: "공동주택",
        approval_date: "2006-12-22", structure: "철근콘크리트구조",
        api: { households: 100, use: "공동주택" } } },
      { register: { address: "서울특별시 송파구 잠실동", use: "공동주택",
        approval_date: "2006-12-22", structure: "철근콘크리트구조",
        api: { households: 50 } } },
    ]);
    assert.equal(s.building_count, 2);
    const by = Object.fromEntries(s.rows.map((r) => [r.field, r]));
    assert.equal(by["건물을 무엇에 쓰는지"].value, "공동주택");
    assert.equal(by["다 짓고 허가받은 날"].value, "2006-12-22");
    assert.equal(by["건물 뼈대"].value, "철근콘크리트구조");
    assert.equal(by["사는 가구 수 합계"].value, 150);
  });

  it("absent fields say so, 위반건축물 is never invented", () => {
    const s = registerSignals([{ register: null }, {}]);
    const by = Object.fromEntries(s.rows.map((r) => [r.field, r]));
    assert.equal(by["건물을 무엇에 쓰는지"].value, null);
    assert.match(by["건물을 무엇에 쓰는지"].note, /해당 정보가 없어요/);
    assert.equal(by["법을 어긴 건물인지"].value, null);
    assert.match(by["법을 어긴 건물인지"].note, /법 위반 건물 정보가 없어요/);
    const empty = registerSignals([]);
    assert.equal(empty.building_count, 0);
    assert.ok(empty.rows.every((r) => r.value === null));
  });
});

describe("jeonse checklist file", () => {
  // Stage 10, Part F: the orchestrator verified the context line (국토교통부
  // data via the 2025-03-10 SBS Biz report: 27,372 victims, 20·30대 20,432
  // ≈ 74.6 %) and checked the official site URLs respond. senior-deposits
  // keeps url: null (no single official page) and stays flagged.
  it("validates with verified links, senior-deposits still flagged", async () => {
    const doc = JSON.parse(await readFile(
      join(REPO, "scenarios", "assumptions", "kr-jeonse-checklist.json"), "utf8"));
    assert.deepEqual(validateChecklist(doc), []);
    assert.match(doc.context.text, /2만 7,372명.*2만 432명.*75 ?%/);
    assert.match(doc.context.source, /국토교통부.*SBS Biz/);
    assert.equal(doc.context.date, "2025-03-10");
    assert.ok(typeof doc.context.url === "string" && doc.context.url.startsWith("https://"));
    assert.equal(doc.context.needs_confirmation, false);
    assert.equal(doc.items.length, 6);
    for (const it of doc.items) {
      if (it.id === "senior-deposits") {
        assert.equal(it.url, null);
        assert.equal(it.needs_confirmation, true);
      } else {
        assert.ok(typeof it.url === "string" && it.url.startsWith("https://"), it.id);
        assert.equal(it.needs_confirmation, false);
      }
    }
    assert.match(doc.support_center.name, /전세피해지원센터/);
    assert.ok(typeof doc.support_center.url === "string"
      && doc.support_center.url.startsWith("https://"));
    assert.match(doc.disclaimer, /법률 자문/);
  });

  it("validation rejects bad shapes", () => {
    assert.ok(validateChecklist(null).length > 0);
    assert.ok(validateChecklist({ context: {}, items: [] }).length > 0);
    assert.ok(validateChecklist({ context: { text: "t", source: "s", date: "d", needs_confirmation: true },
      items: [{ id: "a", what: "w", why: "y", where: "p", url: null, needs_confirmation: false }],
      support_center: { name: "n", url: null }, disclaimer: "d" })
      .some((e) => e.includes("needs_confirmation")));
  });
});
