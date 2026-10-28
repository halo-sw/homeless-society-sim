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
  it("ships structure and names only, all numbers null + flagged", async () => {
    const doc = await realSupportDoc();
    assert.deepEqual(validateSupportPrograms(doc), []);
    assert.deepEqual(doc.programs.map((p) => p.id),
      ["beotimmok-jeonse", "youth-beotimmok", "newlywed-jeonse", "didimdol", "newborn-special"]);
    for (const p of doc.programs) {
      assert.ok(p.conditions.length >= 4);
      for (const c of p.conditions) {
        assert.equal(c.value, null);
        assert.equal(c.needs_confirmation, true);
      }
      assert.equal(p.rate_range_pct.min, null);
      assert.equal(p.limit_won.value, null);
      assert.equal(p.source_url, null);
      assert.equal(p.as_of, null);
      assert.equal(p.needs_confirmation, true);
    }
  });

  it("shipped comparisons are all 확인 필요", async () => {
    const doc = await realSupportDoc();
    const out = compareAllSupport(doc, { age: 30, annual_income_won: 50000000,
      owns_home: false, deposit_won: 200000000 });
    assert.equal(out.programs.length, 5);
    for (const p of out.programs) {
      assert.ok(p.rows.length > 0);
      assert.ok(p.rows.every((r) => r.result === "확인 필요"));
      assert.ok(p.rows.every((r) => r.published === "공식 확인 필요"));
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
