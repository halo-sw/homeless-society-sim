import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tinyArea, tinyScenario } from "./engine-fixture.js";
import { TOOL_DEFS, createSession, callTool } from "../src/consult/tools.js";
import { runTurn, SYSTEM_PROMPT } from "../src/consult/agent.js";
import { checkConsultReply, signVerdict, supportVerdict,
  numbersOnlyAnswer } from "../src/consult/guards.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

async function realTable() {
  return JSON.parse(await readFile(join(REPO, "scenarios", "assumptions", "kr-payroll.json"), "utf8"));
}

async function realAssumption(name) {
  return JSON.parse(await readFile(join(REPO, "scenarios", "assumptions", name), "utf8"));
}

// Fixture RTMS rows for complex 알파 (name-only match on tinyArea).
function fixtureRtms() {
  const rows = [];
  for (const [i, won] of [900000000, 1000000000, 1100000000].entries()) {
    rows.push({ sigungu: "경기도 성남시 분당구", bonbun: "1", bubun: "",
      complex: "알파", area_m2: 55, contract_ym: `20260${i + 1}`, contract_day: 5,
      deal: "trade", housing_type: "apt", trade_won: won });
  }
  for (const [i, won] of [380000000, 400000000].entries()) {
    rows.push({ sigungu: "경기도 성남시 분당구", bonbun: "1", bubun: "",
      complex: "알파", area_m2: 55, contract_ym: `20260${i + 4}`, contract_day: 5,
      deal: "rent", housing_type: "apt", rent_kind: "jeonse",
      deposit_won: won, monthly_won: 0 });
  }
  rows.push({ sigungu: "경기도 성남시 분당구", bonbun: "1", bubun: "",
    complex: "알파", area_m2: 55, contract_ym: "202606", contract_day: 5,
    deal: "rent", housing_type: "apt", rent_kind: "wolse",
    deposit_won: 50000000, monthly_won: 1500000 });
  return rows;
}

function session9b(over = {}) {
  return createSession({
    scenario: tinyScenario({ days: 7, background: 0, seed: 7,
      homes: [
        { label: "A", area: "pangyo", complex_name: "알파" },
        { label: "B", area: "pangyo", complex_name: "베타" },
      ] }),
    loadArea: async () => tinyArea(),
    loadPayroll: realTable,
    loadRtms: async () => fixtureRtms(),
    loadAssumption: realAssumption,
    ...over,
  });
}

describe("stage 9b tool registration", () => {
  it("exposes the four tools", () => {
    const names = new Set(TOOL_DEFS.map((t) => t.function.name));
    for (const name of ["worth_it", "jeonse_check", "mock_deposit_loss", "support_programs"]) {
      assert.ok(names.has(name), `missing tool ${name}`);
    }
  });

  it("system prompt covers the 9b flows and guards", () => {
    assert.match(SYSTEM_PROMPT, /worth_it/);
    assert.match(SYSTEM_PROMPT, /jeonse_check/);
    assert.match(SYSTEM_PROMPT, /mock_deposit_loss/);
    assert.match(SYSTEM_PROMPT, /support_programs/);
    assert.match(SYSTEM_PROMPT, /가정 시나리오/);
    assert.match(SYSTEM_PROMPT, /금융기관이 판단/);
    assert.match(SYSTEM_PROMPT, /법률 자문/);
    assert.match(SYSTEM_PROMPT, /대상입니다/);
  });
});

describe("worth_it tool", () => {
  it("compares from RTMS medians with explicit money", async () => {
    const s = session9b();
    await callTool(s, "set_money", { patch: {
      members: { m1: { monthly_net_won: 4000000 } },
      cash_won: 200000000,
    } });
    const run = await callTool(s, "run_simulation", { home: "A" });
    assert.equal(run.ok, true);
    const r = await callTool(s, "worth_it", { run: run.run_ids.A, horizon_years: 10 });
    assert.equal(r.ok, true);
    assert.equal(r.horizon_years, 10);
    assert.equal(r.inputs.buy_price_won, 1000000000);
    assert.equal(r.inputs.jeonse_won, 380000000); // nearest-rank median of [380M, 400M]
    assert.ok(r.totals["매매"].cash_out_won > 200000000); // down + 10y payments
    assert.ok(r.totals["매매"].cash_out_won < 1000000000); // loan not repaid yet
    assert.equal(r.totals["매매"].locked_won, 200000000);
    assert.ok(r.totals["전세"].interest_won > 0);
    assert.equal(r.scenario_label, "가정 시나리오, 전망 아님");
    assert.ok(r.breakeven_year["전세"]["0"] === null
      || Number.isInteger(r.breakeven_year["전세"]["0"]));
    assert.ok(r.dsr.ratio_pct > 0);
    assert.match(r.lender_note, /금융기관/);
    assert.equal(r.loan_schedule.loan_won, 800000000);
    assert.equal(r.loan_schedule.yearly.length, 30);
    assert.equal(r.loan_schedule.yearly[29].balance_won, 0);
    assert.ok(r.ownership_excluded.includes("취득세"));
    assert.match(r.note, /판단/);
  });

  it("rejects off-menu horizons", async () => {
    const s = session9b();
    const run = await callTool(s, "run_simulation", { home: "A" });
    const r = await callTool(s, "worth_it", { run: run.run_ids.A, horizon_years: 7 });
    assert.equal(r.ok, false);
    assert.match(r.error, /5\/10\/20/);
  });
});

describe("jeonse_check tool", () => {
  it("reports ratio, register and checklist", async () => {
    const s = session9b();
    const r = await callTool(s, "jeonse_check", { area: "pangyo", complex: "알파", area_m2: 55 });
    assert.equal(r.ok, true);
    assert.equal(r.match_method, "name-only");
    assert.equal(r.ratio.computable, true);
    assert.equal(r.ratio.ratio_pct, 38); // 380M ÷ 1000M
    assert.equal(r.ratio.trade.count, 3);
    assert.equal(r.ratio.jeonse.count, 2);
    assert.equal(r.ratio.band.criterion_id, "C-jeonse-ratio-caution");
    const by = Object.fromEntries(r.register.rows.map((row) => [row.field, row]));
    assert.equal(by["건물을 무엇에 쓰는지"].value, "공동주택");
    assert.equal(by["법을 어긴 건물인지"].value, null);
    assert.equal(r.checklist.items.length, 6);
    assert.match(r.note, /판정/);
  });

  it("sparse sales stay sparse", async () => {
    const s = session9b({ loadRtms: async () => fixtureRtms().slice(0, 1) });
    const r = await callTool(s, "jeonse_check", { area: "pangyo", complex: "알파", area_m2: 55 });
    assert.equal(r.ok, true);
    assert.equal(r.ratio.computable, false);
    assert.match(r.ratio.note, /매매 거래가 적어/);
  });
});

describe("mock_deposit_loss tool", () => {
  it("runs all three paths with criteria assumptions", async () => {
    const s = session9b();
    for (const [path, ko] of [["insured", "보증보험 가입"],
        ["auction", "보험 없이 경매로 일부만 받음"], ["unrecovered", "한 푼도 못 받음"]]) {
      const r = await callTool(s, "mock_deposit_loss", { path,
        deposit_won: 400000000, monthly_net_won: 7000000, monthly_spent_won: 4000000 });
      assert.equal(r.ok, true);
      assert.equal(r.label, "모의 시나리오");
      assert.equal(r.path_ko, ko);
      assert.equal(r.criterion_id, "C-mockloss");
      assert.match(r.legal_note, /법률 자문/);
      assert.match(r.support_center.name, /전세피해지원센터/);
    }
  });

  it("requires a path and a deposit", async () => {
    const s = session9b();
    assert.equal((await callTool(s, "mock_deposit_loss", { path: "fire", deposit_won: 1 })).ok, false);
    assert.equal((await callTool(s, "mock_deposit_loss", { path: "insured" })).ok, false);
  });
});

describe("support_programs tool", () => {
  it("compares row by row, never a verdict", async () => {
    const s = session9b();
    const r = await callTool(s, "support_programs", {
      age: 30, household_type: "세대주", annual_income_won: 40000000,
      assets_won: 100000000, owns_home: false, deposit_won: 200000000,
      include_public_rental: false,
    });
    assert.equal(r.ok, true);
    assert.equal(r.programs.length, 5);
    // Verified file: filled rows judge for real (Part F contract).
    const beotimmok = r.programs.find((p) => p.program_id === "beotimmok-jeonse");
    const by = Object.fromEntries(beotimmok.rows.map((row) => [row.condition, row]));
    assert.equal(by["나이 하한"].result, "충족");
    assert.equal(by["연소득 상한"].result, "충족");
    assert.equal(by["무주택 여부"].result, "충족");
    assert.ok(beotimmok.rows.every((row) => typeof row.note === "string" && row.note));
    const fresh = await callTool(s, "support_programs", { include_public_rental: false });
    assert.ok(fresh.programs.every((p) => p.rows.every((row) => row.result === "확인 필요")));
    assert.equal(r.public_rentals, null);
    const blob = JSON.stringify(r);
    for (const word of ["대상입니다", "대상자", "신청 가능", "지원 가능", "받을 수 있", "자격"]) {
      assert.ok(!blob.includes(word), `leaked ${word}`);
    }
  });

  it("reuses the stage-6 public-rental recommend", async () => {
    const { normalizeSnapshot } = await import("../src/money/housing.js");
    const snapDoc = { fetched_at: "2026-10-01T00:00:00Z",
      complexes: [{ source: "lh", id: "c1", name: "N", address: "경기 성남시 분당구 돌마로 1",
        pnu: "no-such-pnu", latitude: 37.3, longitude: 127.1,
        unit_types: [{ unit_type: "51", building_type: "아파트", exclusive_area_m2: 51,
          deposit_won: 5000000, monthly_rent_won: 200000 }] }],
      notices: [] };
    const s = session9b({ loadHousing: async () => normalizeSnapshot(snapDoc) });
    await callTool(s, "set_money", { patch: { members: { m1: { monthly_net_won: 4000000 } } } });
    const r = await callTool(s, "support_programs", { target_area_m2: 55 });
    assert.equal(r.ok, true);
    assert.equal(r.public_rentals.ok, true);
    assert.equal(r.public_rentals.total, 1);
    assert.match(r.public_rentals.candidates[0].eligibility_note, /공고 원문/);
  });
});

describe("stage 9b guards", () => {
  it("signVerdict trips contract advice, passes comparisons", () => {
    assert.ok(signVerdict("이 집 계약하세요.") !== null);
    assert.ok(signVerdict("계약해도 됩니다.") !== null);
    assert.ok(signVerdict("계약하지 마세요.") !== null);
    assert.ok(signVerdict("Please sign the contract.") !== null);
    assert.equal(signVerdict("계약 조건을 숫자로 비교합니다."), null);
    assert.equal(signVerdict("계약서류를 확인하세요."), null);
    assert.equal(signVerdict("지금 계약 조건이 궁금하세요?"), null);
  });

  it("supportVerdict trips eligibility verdicts, passes comparisons", () => {
    assert.ok(supportVerdict("지원 대상입니다.") !== null);
    assert.ok(supportVerdict("신청 가능합니다.") !== null);
    assert.ok(supportVerdict("버팀목 대상자에 해당합니다.") !== null);
    assert.ok(supportVerdict("You are eligible for this loan.") !== null);
    assert.equal(supportVerdict("받을 수 있는 지원을 보여줍니다."), null);
    assert.equal(supportVerdict("연소득 상한 충족, 자산 상한 확인 필요."), null);
    assert.equal(supportVerdict("공고 원문에서 조건을 확인해 주세요."), null);
  });

  it("checkConsultReply names the new causes", () => {
    assert.equal(checkConsultReply("이 집 계약하세요. 5년이면 충분합니다.",
      [{ horizon_years: 5 }]).cause, "sign_verdict");
    assert.equal(checkConsultReply("지원 대상입니다. 5년이 기준입니다.",
      [{ horizon_years: 5 }]).cause, "support_verdict");
  });

  it("numbers-only fallback covers the 9b shapes", () => {
    const out = numbersOnlyAnswer([
      { home: "A", horizon_years: 10,
        totals: { "매매": { cash_out_won: 1, interest_won: 2, locked_won: 3 },
          "전세": { cash_out_won: 4, interest_won: 5, locked_won: 6 } },
        breakeven_year: { "전세": { "0": 7, "-2": null } },
        dsr: { ratio_pct: 33.3 } },
      { complex: "알파", ratio: { computable: true, ratio_pct: 40,
        band: { label: "70% 미만" }, trade: { count: 3 }, jeonse: { count: 2 } } },
      { label: "모의 시나리오", path_ko: "보증보험 가입", deposit_won: 100,
        recovery_won: 100, short_won: 0, locked_note: "2개월" },
      { programs: [{ name: "버팀목 전세자금", org: "주택도시기금",
        rows: [{ condition: "연소득 상한", customer: "5,000만원", published: "공식 확인 필요", result: "확인 필요" }] }] },
    ]);
    assert.match(out, /가정 시나리오/);
    assert.match(out, /보증금이 집값의 40%/);
    assert.match(out, /모의\(보증보험 가입\)/);
    assert.match(out, /버팀목 전세자금/);
    assert.match(out, /공고 원문/);
    for (const word of ["계약하세요", "대상입니다", "안전합니다"]) {
      assert.ok(!out.includes(word), `leaked ${word}`);
    }
  });

  it("fake provider insisting on a verdict falls back to 9b numbers", async () => {
    let n = 0;
    const completeFn = async ({ messages }) => {
      n++;
      if (n === 1) {
        return { message: { content: "", tool_calls: [
          { id: "c1", name: "mock_deposit_loss",
            args: { path: "insured", deposit_won: 400000000 } },
        ] }, usage: { prompt_tokens: 10, completion_tokens: 10 } };
      }
      return { message: { content: "이 집 계약하세요. 400000000원이면 충분합니다.", tool_calls: [] },
        usage: { prompt_tokens: 10, completion_tokens: 10 } };
    };
    const out = await runTurn({
      provider: "meta",
      messages: [{ role: "user", content: "보증금 못 받으면 어쩌죠?" }],
      scenario: tinyScenario({ days: 2, background: 0 }),
      loadArea: async () => tinyArea(),
      loadAssumption: realAssumption,
      completeFn,
    });
    assert.equal(out.ok, true);
    assert.equal(out.fallback, true);
    assert.match(out.reply, /모의/);
    assert.ok(!out.reply.includes("계약하세요"));
  });
});
