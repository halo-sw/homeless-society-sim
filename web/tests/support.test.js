import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateSupportPrograms, compareProgram, compareAllSupport,
  SUPPORT_NOTE } from "../src/money/support.js";
import { checkSupportSource, fixtureSupportSource, checkPolicyRow } from "../src/support-official.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

async function realSupportDoc() {
  return JSON.parse(await readFile(join(REPO, "scenarios", "assumptions", "kr-support-programs.json"), "utf8"));
}

// Verdict language that must never appear in comparison output.
const BANNED = ["대상입니다", "대상자", "신청 가능", "지원 가능", "받을 수 있",
  "받으실 수 있", "자격", "eligible", "qualify"];

describe("support programmes file", () => {
  // Stage 10, Part F: the orchestrator verified the file against the
  // official 주택도시기금 product pages (2026-10-29). Values may be
  // filled when needs_confirmation is false and source_url/as_of are
  // present; anything else still reads 공식 확인 필요.
  it("ships verified values with source_url + as_of", async () => {
    const doc = await realSupportDoc();
    assert.deepEqual(validateSupportPrograms(doc), []);
    assert.deepEqual(doc.programs.map((p) => p.id),
      ["beotimmok-jeonse", "youth-beotimmok", "newlywed-jeonse", "didimdol", "newborn-special"]);
    for (const p of doc.programs) {
      assert.ok(p.conditions.length >= 4);
      assert.equal(p.needs_confirmation, false);
      assert.ok(typeof p.source_url === "string" && p.source_url.startsWith("https://nhuf.molit.go.kr/"));
      assert.ok(typeof p.as_of === "string" && p.as_of);
      for (const c of p.conditions) {
        assert.equal(c.needs_confirmation, false);
        assert.ok(c.value !== null && c.value !== undefined, `${p.id}.${c.id} value`);
        assert.ok(typeof c.note === "string" && c.note.length > 0, `${p.id}.${c.id} note`);
      }
      assert.ok(Number.isFinite(p.rate_range_pct.min) && Number.isFinite(p.rate_range_pct.max));
      assert.ok(Number.isFinite(p.limit_won.value));
    }
    // The 신혼 income-ceiling exception the brief calls out.
    const newlywed = doc.programs.find((p) => p.id === "newlywed-jeonse");
    const income = newlywed.conditions.find((c) => c.id === "income-max");
    assert.equal(income.value, 75000000);
    assert.match(income.note, /5,000만 원 이하/);
  });

  it("shipped comparisons judge filled rows, flag the rest, never a verdict", async () => {
    const doc = await realSupportDoc();
    const full = { age: 30, household_type: "세대주", marriage_years: 2,
      annual_income_won: 40000000, assets_won: 100000000, owns_home: false,
      has_newborn: false, deposit_won: 200000000, price_won: 400000000 };
    const out = compareAllSupport(doc, full);
    assert.equal(out.programs.length, 5);
    const beotimmok = out.programs.find((p) => p.program_id === "beotimmok-jeonse");
    const by = Object.fromEntries(beotimmok.rows.map((r) => [r.condition, r]));
    assert.equal(by["나이 하한"].result, "충족");
    assert.equal(by["연소득 상한"].result, "충족");
    assert.equal(by["무주택 여부"].result, "충족");
    assert.ok(beotimmok.rows.every((r) => typeof r.note === "string" && r.note.length > 0));
    assert.ok(beotimmok.source_url.startsWith("https://nhuf.molit.go.kr/"));
    assert.ok(beotimmok.as_of);
    // Over the ceiling on one row: only that row reads 미충족.
    const rich = compareAllSupport(doc, { ...full, annual_income_won: 90000000 });
    const richRows = Object.fromEntries(
      rich.programs.find((p) => p.program_id === "beotimmok-jeonse").rows.map((r) => [r.condition, r]));
    assert.equal(richRows["연소득 상한"].result, "미충족");
    assert.equal(richRows["무주택 여부"].result, "충족");
    // Missing inputs still read 확인 필요 + 미입력.
    const empty = compareAllSupport(doc, {});
    for (const p of empty.programs) {
      assert.ok(p.rows.every((r) => r.result === "확인 필요"));
      assert.ok(p.rows.every((r) => r.customer === "미입력"));
    }
    assert.equal(out.note, SUPPORT_NOTE);
    const blob = JSON.stringify(out);
    for (const word of BANNED) assert.ok(!blob.includes(word), `leaked ${word}`);
  });

  it("validation rejects bad shapes", () => {
    assert.ok(validateSupportPrograms(null).length > 0);
    assert.ok(validateSupportPrograms({ programs: [] }).length > 0);
    assert.ok(validateSupportPrograms({ programs: [{ id: "p" }] })
      .some((e) => e.includes("name")));
  });
});

describe("condition comparison", () => {
  // Fixture programme with filled values (tests the logic; the shipped
  // file carries nulls until the orchestrator verifies them).
  const filled = {
    id: "fx", name: "모의 제도", org: "모의 기관",
    conditions: [
      { id: "age-max", label: "나이 상한", kind: "max", profile_key: "age",
        value: 34, unit: "세", needs_confirmation: false },
      { id: "income-max", label: "연소득 상한", kind: "max", profile_key: "annual_income_won",
        value: 70000000, unit: "원/년", needs_confirmation: false },
      { id: "age-min", label: "나이 하한", kind: "min", profile_key: "age",
        value: 19, unit: "세", needs_confirmation: false },
      { id: "owns-home", label: "무주택 여부", kind: "equals", profile_key: "owns_home",
        value: false, unit: null, needs_confirmation: false },
      { id: "household", label: "세대 구성", kind: "one_of", profile_key: "household_type",
        value: ["1인", "신혼부부"], unit: null, needs_confirmation: false },
      { id: "assets-max", label: "자산 상한", kind: "max", profile_key: "assets_won",
        value: 300000000, unit: "원", needs_confirmation: true },
      { id: "deposit-max", label: "전세보증금 상한", kind: "max", profile_key: "deposit_won",
        value: null, unit: "원", needs_confirmation: true },
    ],
    rate_range_pct: { min: 1.5, max: 2.5, needs_confirmation: false },
    limit_won: { value: 200000000, needs_confirmation: false },
    as_of: "2026-01", source_url: "https://example.invalid/fx", needs_confirmation: false,
  };

  it("compares each kind", () => {
    const out = compareProgram(filled, { age: 30, annual_income_won: 50000000,
      owns_home: false, household_type: "신혼부부" });
    const by = Object.fromEntries(out.rows.map((r) => [r.condition, r]));
    assert.equal(by["나이 상한"].result, "충족");
    assert.equal(by["연소득 상한"].result, "충족");
    assert.equal(by["나이 하한"].result, "충족");
    assert.equal(by["무주택 여부"].result, "충족");
    assert.equal(by["세대 구성"].result, "충족");
    const old = compareProgram(filled, { age: 40, annual_income_won: 90000000,
      owns_home: true, household_type: "4인" });
    const byOld = Object.fromEntries(old.rows.map((r) => [r.condition, r]));
    assert.equal(byOld["나이 상한"].result, "미충족");
    assert.equal(byOld["연소득 상한"].result, "미충족");
    assert.equal(byOld["무주택 여부"].result, "미충족");
    assert.equal(byOld["세대 구성"].result, "미충족");
  });

  it("unconfirmed, null or missing inputs read 확인 필요", () => {
    const out = compareProgram(filled, { age: 30, annual_income_won: 50000000,
      owns_home: false, household_type: "신혼부부", assets_won: 100 });
    const by = Object.fromEntries(out.rows.map((r) => [r.condition, r]));
    assert.equal(by["자산 상한"].result, "확인 필요"); // needs_confirmation
    assert.equal(by["전세보증금 상한"].result, "확인 필요"); // null rule
    const missing = compareProgram(filled, {});
    assert.ok(missing.rows.every((r) => r.result === "확인 필요"));
    assert.ok(missing.rows.every((r) => r.customer === "미입력"));
  });

  it("never outputs an eligibility verdict", () => {
    const out = compareProgram(filled, { age: 30, annual_income_won: 50000000,
      owns_home: false, household_type: "신혼부부" });
    const blob = JSON.stringify(out);
    for (const word of BANNED) assert.ok(!blob.includes(word), `leaked ${word}`);
    assert.equal(out.note, SUPPORT_NOTE);
  });
});

describe("support adapter seam", () => {
  it("checks sources and serves fixtures", async () => {
    assert.deepEqual(checkSupportSource(fixtureSupportSource({})), []);
    assert.ok(checkSupportSource(null).length > 0);
    assert.ok(checkSupportSource({ id: "x", needsKey: true }).length > 0);
    const src = fixtureSupportSource({ id: "fixture:t", policies: [
      { title: "A", org: "O", min_age: 19, max_age: 34, summary: "s", source_url: null },
      { title: "B", org: "O", min_age: null, max_age: null, summary: "s", source_url: null },
    ] });
    assert.equal(src.needsKey, false);
    assert.equal((await src.listPolicies({})).length, 2);
    assert.equal((await src.listPolicies({ maxAge: 40 })).length, 1);
    assert.equal((await src.listPolicies({ maxAge: 30 })).length, 2);
  });

  it("fixture files validate", async () => {
    for (const file of ["support-official-youth.json", "support-official-bokjiro.json"]) {
      const rows = JSON.parse(await readFile(join(HERE, "fixtures", file), "utf8"));
      assert.ok(rows.length >= 2);
      for (const r of rows) assert.deepEqual(checkPolicyRow(r), []);
      const src = fixtureSupportSource({ id: `fixture:${file}`, policies: rows });
      assert.deepEqual(checkSupportSource(src), []);
      assert.equal((await src.listPolicies({})).length, rows.length);
    }
    assert.ok(checkPolicyRow(null).length > 0);
    assert.ok(checkPolicyRow({ title: "t" }).length > 0);
  });
});
