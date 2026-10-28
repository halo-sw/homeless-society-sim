// Housing cost per tenure (pure).
//
// Monthly + one-off cost from real data: 월세 = deposit from cash +
// monthly rent; 전세 = (전세금 − cash) × rate / 12 on the shortfall only
// (interest-only, assumption labelled); 매매 = amortised payment on
// (price − cash) over loan_years at loan_rate_pct; 공공임대 = API deposit
// + monthly rent. The app never judges loan eligibility (LTV·DSR) or
// move-in eligibility — the disclaimer says so on screen.

export const TENURES = ["매매", "전세", "월세", "공공임대"];

export const TENURE_DISCLAIMER =
  "대출 가능 여부(LTV·DSR)와 입주 자격은 판단하지 않습니다.";

export const TRADE_TAX_NOTE =
  "취득세·중개수수료 등 세금·수수료는 포함하지 않습니다.";

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

// args: {tenure, price_won (매매가|전세금), deposit_won (월세/공공 보증금),
//        monthly_rent_won, cash_won, loan_rate_pct, loan_years,
//        source}
// Returns {tenure, monthly_won, upfront_won, loan_won, cash_used_won,
//          breakdown, disclaimers[], source}.
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
        ? "보증금은 보유 현금에서 충당하고 월세만 매달 지출합니다."
        : "공공임대 API의 보증금·월임대료 그대로 계산합니다.",
    });
  }
  if (tenure === "전세") {
    const jeonse = Math.max(0, Math.round(Number(args.price_won) || 0));
    const loan = Math.max(0, jeonse - cash);
    const monthly = loan > 0 && rate > 0 ? Math.ceil(loan * (rate / 100) / 12) : 0;
    return out(monthly, jeonse, loan, {
      kind: "jeonse",
      jeonse_won: jeonse,
      note: "전세금 중 현금이 모자란 부분만 대출이자(가정값 금리, 이자만)로 계산합니다.",
    });
  }
  // 매매
  const price = Math.max(0, Math.round(Number(args.price_won) || 0));
  const loan = Math.max(0, price - cash);
  const monthly = amortisedMonthly(loan, rate, years);
  return out(monthly, price, loan, {
    kind: "trade",
    price_won: price,
    note: "대출금 원리금균등상환 월 납입액입니다.",
  }, { notes: [TRADE_TAX_NOTE] });
}
