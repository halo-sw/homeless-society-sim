// 모의 피해 시나리오: "계약 만료에 보증금을 돌려받지 못하면" (pure).
//
// Clearly labelled 모의, deterministic, driven by the editable C-mockloss
// assumptions (가정값): recovery month and recovery share per path —
// (a) 보증보험 가입, (b) 미가입 + 경매 배당 일부, (c) 미회수. The effect on
// the customer's money is plain arithmetic: months the deposit stays
// locked, won recovered, won short, and the shortfall expressed in months
// of the customer's stated monthly remainder. The next move is described
// as a flow assumption (모의), never advice. Always carries the support
// centre name and "법률 자문이 아닙니다".

export const MOCKLOSS_LABEL = "모의 시나리오";
export const MOCKLOSS_LEGAL_NOTE = "법률 자문이 아닙니다.";
export const MOCKLOSS_PATHS = ["insured", "auction", "unrecovered"];
export const MOCKLOSS_PATH_KO = {
  insured: "보증보험 가입",
  auction: "보험 없이 경매로 일부만 받음",
  unrecovered: "한 푼도 못 받음",
};
export const MOCKLOSS_CRITERION_ID = "C-mockloss";

// assumptions: {insured_months, insured_pct, auction_months, auction_pct,
//   unrecovered_pct} — resolved from C-mockloss (criteria_overrides apply)
//   or passed explicitly. All numbers are 가정값.
export function mockDepositLoss({ depositWon, monthlyNetWon = null,
  monthlySpentWon = null, path, assumptions }) {
  const deposit = Math.round(Number(depositWon));
  if (!(deposit > 0)) throw new Error("depositWon must be > 0");
  if (!MOCKLOSS_PATHS.includes(path)) {
    throw new Error(`path wants one of ${MOCKLOSS_PATHS.join("/")} (got ${JSON.stringify(path)})`);
  }
  const a = assumptions || {};
  const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
  const table = {
    insured: { months: Math.max(0, Math.round(num(a.insured_months, 2))),
      pct: num(a.insured_pct, 100) },
    auction: { months: Math.max(0, Math.round(num(a.auction_months, 12))),
      pct: num(a.auction_pct, 70) },
    unrecovered: { months: null, pct: num(a.unrecovered_pct, 0) },
  };
  const t = table[path];
  const recoveryWanted = Math.round((deposit * t.pct) / 100);
  const recoveryWon = Math.max(0, Math.min(deposit, recoveryWanted));
  const shortWon = deposit - recoveryWon;
  const net = monthlyNetWon === null || monthlyNetWon === undefined ? NaN : Number(monthlyNetWon);
  const spent = monthlySpentWon === null || monthlySpentWon === undefined ? NaN : Number(monthlySpentWon);
  const remainder = Number.isFinite(net) && Number.isFinite(spent) ? net - spent : null;
  const shortfallMonths = remainder !== null && remainder > 0 && shortWon > 0
    ? Math.round((shortWon / remainder) * 10) / 10
    : (shortWon === 0 ? 0 : null);
  const nextMove = {
    insured: "보증보험금으로 다음 보증금을 마련하는 흐름으로 봐요 (모의).",
    auction: "경매 배당을 받을 때까지 다음 보증금은 따로 마련하는 흐름으로 봐요 (모의).",
    unrecovered: "보증금 전부를 새로 마련하는 흐름으로 봐요 (모의).",
  }[path];
  return {
    label: MOCKLOSS_LABEL,
    path,
    path_ko: MOCKLOSS_PATH_KO[path],
    criterion_id: MOCKLOSS_CRITERION_ID,
    assumptions_used: {
      recovery_months: t.months,
      recovery_pct: t.pct,
      source: "가정값 (C-mockloss)",
    },
    deposit_won: deposit,
    recovery_month: t.months,
    recovery_won: recoveryWon,
    short_won: shortWon,
    locked_note: t.months === null
      ? "보증금이 묶인 채로 풀리지 않아요 (모의)."
      : `보증금이 약 ${t.months}개월 묶여요 (모의).`,
    monthly_remainder_won: remainder,
    shortfall_in_remainder_months: shortfallMonths,
    shortfall_note: shortWon === 0
      ? "잃는 돈이 없어요 (모의로 본 가정이에요)."
      : (shortfallMonths !== null
        ? `잃는 돈은 한 달 남는 돈의 약 ${shortfallMonths}개월분이에요 (모의로 본 가정이에요).`
        : "한 달 남는 돈을 적으면 잃는 돈을 개월분으로 보여줘요."),
    next_move_note: nextMove,
    legal_note: MOCKLOSS_LEGAL_NOTE,
  };
}
