// Housing cost per tenure (pure).
//
// Monthly + one-off cost from real data: 월세 = deposit from cash +
// monthly rent; 전세 = interest-only on min(loan, jeonse_loan_cap_won)
// (the rest is a separately-arranged shortfall amount, never a lending
// verdict); 매매 = amortised payment on (price − cash) over loan_years
// at loan_rate_pct; 공공임대 = API deposit + monthly rent. The app never
// judges loan eligibility (LTV·DSR) or move-in eligibility — the
// disclaimer says so on screen.

export const TENURES = ["매매", "전세", "월세", "공공임대"];

export const JEONSE_LOAN_CAP_DEFAULT_WON = 500000000;

export const TENURE_DISCLAIMER =
  "돈을 빌릴 수 있는지와 입주 자격은 판단하지 않아요.";

export const TRADE_TAX_NOTE =
  "집을 살 때 내는 세금·중개수수료는 포함하지 않아요.";

// Standard amortised monthly payment (원리금균등상환).
export function amortisedMonthly(principalWon, annualRatePct, years) {
  const p = Number(principalWon);
  if (!Number.isFinite(p) || p <= 0) return 0;
  const n = Math.max(1, Math.round(Number(years) * 12));
  const r = Number(annualRatePct) / 100 / 12;
  if (!(r > 0)) return Math.ceil(p / n);
  const f = (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  return Math.ceil(p * f);
}

// Short Korean won label for notes (5억 원, 2억 8,000만 원).
export function wonShort(v) {
  const n = Math.max(0, Math.round(Number(v) || 0));
  const eok = Math.floor(n / 100000000);
  const man = Math.round((n - eok * 100000000) / 10000);
  if (eok > 0 && man > 0) return `${eok}억 ${man.toLocaleString("ko-KR")}만 원`;
  if (eok > 0) return `${eok}억 원`;
  if (man > 0) return `${man.toLocaleString("ko-KR")}만 원`;
  return `${n.toLocaleString("ko-KR")}원`;
}

// args: {tenure, price_won (매매가|전세금), deposit_won (월세/공공 보증금),
//        monthly_rent_won, cash_won, loan_rate_pct, loan_years,
//        jeonse_loan_cap_won, source}
// Returns {tenure, monthly_won, upfront_won, loan_won, cash_used_won,
//          loan_shortfall_won, flags, breakdown, disclaimers[], source}.
export function tenureCost(args = {}) {
  const tenure = args.tenure || "월세";
  if (!TENURES.includes(tenure)) throw new Error(`tenure: unknown ${JSON.stringify(tenure)}`);
  const cash = Math.max(0, Math.round(Number(args.cash_won) || 0));
  const rate = Number(args.loan_rate_pct);
  const years = Number(args.loan_years);
  const source = args.source || "rtms";
  const disclaimers = [TENURE_DISCLAIMER];
  const out = (monthly, upfront, loan, breakdown, extra = {}) => ({
    tenure, monthly_won: Math.round(monthly), upfront_won: Math.round(upfront),
    loan_won: Math.round(loan), cash_used_won: Math.min(cash, Math.round(upfront)),
    cash_shortfall_won: Math.max(0, Math.round(upfront) - cash),
    loan_shortfall_won: 0, flags: {},
    breakdown, disclaimers: [...disclaimers, ...(extra.notes || [])],
    source, rate_pct: rate, years,
  });

  if (tenure === "월세" || tenure === "공공임대") {
    const deposit = Math.max(0, Math.round(Number(args.deposit_won) || 0));
    const monthly = Math.max(0, Math.round(Number(args.monthly_rent_won) || 0));
    return out(monthly, deposit, 0, {
      kind: tenure === "월세" ? "wolse" : "public",
      deposit_won: deposit,
      monthly_rent_won: monthly,
      note: tenure === "월세"
        ? "보증금은 가진 돈에서 먼저 내고, 월세만 매달 내는 것으로 계산해요."
        : "공공임대 공식 자료의 보증금·월 임대료 그대로 계산해요.",
    });
  }
  if (tenure === "전세") {
    const jeonse = Math.max(0, Math.round(Number(args.price_won) || 0));
    const loan = Math.max(0, jeonse - cash);
    const capRaw = Number(args.jeonse_loan_cap_won);
    const cap = Number.isFinite(capRaw) && capRaw > 0
      ? Math.round(capRaw) : JEONSE_LOAN_CAP_DEFAULT_WON;
    const priced = Math.min(loan, cap);
    const shortfall = loan - priced;
    const monthly = priced > 0 && rate > 0 ? Math.ceil(priced * (rate / 100) / 12) : 0;
    const rec = out(monthly, jeonse, loan, {
      kind: "jeonse",
      jeonse_won: jeonse,
      repayment: "이자만",
      loan_years: null,
      loan_cap_won: cap,
      note: "보증금에서 가진 돈을 뺀 나머지는 빌리는 것으로 두고, 그 이자만 매달 내는 것으로 계산해요 (금리는 정해 둔 값).",
    });
    rec.years = null; // only 매매 amortises over loan_years
    rec.loan_shortfall_won = shortfall;
    rec.flags = { loan_shortfall: shortfall > 0 };
    if (shortfall > 0) {
      rec.breakdown.note += ` 상한 ${wonShort(cap)}까지만 빌리는 것으로 두고, 나머지 ${wonShort(shortfall)}는 따로 마련하는 것으로 둡니다.`;
    }
    return rec;
  }
  // 매매
  const price = Math.max(0, Math.round(Number(args.price_won) || 0));
  const loan = Math.max(0, price - cash);
  const monthly = amortisedMonthly(loan, rate, years);
  return out(monthly, price, loan, {
    kind: "trade",
    price_won: price,
    note: "빌린 돈을 매달 같은 금액씩 갚을 때 한 달에 내는 돈이에요.",
  }, { notes: [TRADE_TAX_NOTE] });
}
