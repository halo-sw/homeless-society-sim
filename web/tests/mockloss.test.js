import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mockDepositLoss, MOCKLOSS_PATHS, MOCKLOSS_LEGAL_NOTE } from "../src/money/mockloss.js";

const DEFAULTS = { insured_months: 2, insured_pct: 100,
  auction_months: 12, auction_pct: 70, unrecovered_pct: 0 };

describe("mock deposit loss", () => {
  it("insured path recovers in full", () => {
    const r = mockDepositLoss({ depositWon: 500000000,
      monthlyNetWon: 7000000, monthlySpentWon: 4000000,
      path: "insured", assumptions: DEFAULTS });
    assert.equal(r.label, "모의 시나리오");
    assert.equal(r.path_ko, "보증보험 가입");
    assert.equal(r.recovery_month, 2);
    assert.equal(r.recovery_won, 500000000);
    assert.equal(r.short_won, 0);
    assert.match(r.locked_note, /2개월/);
    assert.equal(r.monthly_remainder_won, 3000000);
    assert.equal(r.shortfall_in_remainder_months, 0);
    assert.equal(r.criterion_id, "C-mockloss");
    assert.equal(r.legal_note, MOCKLOSS_LEGAL_NOTE);
  });

  it("auction path recovers part, shortfall in remainder-months", () => {
    const r = mockDepositLoss({ depositWon: 500000000,
      monthlyNetWon: 7000000, monthlySpentWon: 4000000,
      path: "auction", assumptions: DEFAULTS });
    assert.equal(r.path_ko, "보험 없이 경매로 일부만 받음");
    assert.equal(r.recovery_month, 12);
    assert.equal(r.recovery_won, 350000000);
    assert.equal(r.short_won, 150000000);
    assert.equal(r.shortfall_in_remainder_months, 50);
    assert.match(r.shortfall_note, /50개월분/);
    assert.match(r.next_move_note, /모의/);
  });

  it("unrecovered path never recovers", () => {
    const r = mockDepositLoss({ depositWon: 500000000,
      monthlyNetWon: 7000000, monthlySpentWon: 4000000,
      path: "unrecovered", assumptions: DEFAULTS });
    assert.equal(r.recovery_month, null);
    assert.equal(r.recovery_won, 0);
    assert.equal(r.short_won, 500000000);
    assert.match(r.locked_note, /풀리지 않아요/);
    assert.ok(Math.abs(r.shortfall_in_remainder_months - 166.7) < 0.05);
  });

  it("missing remainder asks for input, never invents", () => {
    const r = mockDepositLoss({ depositWon: 500000000,
      path: "auction", assumptions: DEFAULTS });
    assert.equal(r.monthly_remainder_won, null);
    assert.equal(r.shortfall_in_remainder_months, null);
    assert.match(r.shortfall_note, /적으면/);
  });

  it("custom assumptions are honoured", () => {
    const r = mockDepositLoss({ depositWon: 500000000, path: "insured",
      assumptions: { ...DEFAULTS, insured_months: 5, insured_pct: 90 } });
    assert.equal(r.recovery_month, 5);
    assert.equal(r.recovery_won, 450000000);
    assert.equal(r.short_won, 50000000);
  });

  it("deterministic and guarded", () => {
    const args = { depositWon: 500000000, monthlyNetWon: 1, monthlySpentWon: 0,
      path: "auction", assumptions: DEFAULTS };
    assert.deepEqual(mockDepositLoss(args), mockDepositLoss(args));
    assert.deepEqual(MOCKLOSS_PATHS, ["insured", "auction", "unrecovered"]);
    assert.throws(() => mockDepositLoss({ ...args, path: "fire" }), /path wants/);
    assert.throws(() => mockDepositLoss({ ...args, depositWon: 0 }), /depositWon/);
  });
});
