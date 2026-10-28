// Consult guards: the 상담 agent explains, it never invents numbers.
//
// Reuses the stage-4 judge guards (same rounding rules as 4c): every
// number in the answer must appear in this conversation's tool results.
// Stage 6: price *references* (RTMS medians, living costs) are the
// feature, so price words are allowed when the numbers cite tool
// results — but price *forecasts*, investment advice, loan/eligibility
// judgement, buy/don't-buy verdicts, safety/crime, school quality and
// health/medical topics stay refused, as does any claim that the
// simulation predicts real life. Pure; unit-tested.

import { findInventedNumbers } from "../judge/guards.js";
import { fmtWon, fmtPct, fmtDistance, fmtMinutes } from "../money/format.js";

// Investment advice on top of the judge's price/safety/school/health list.
// Tight on purpose: generic words like 전망 (view) stay allowed.
const INVEST_KO = [
  "투자", "수익", "수익률", "시세차익", "갭투자", "재테크", "전세가율",
  "매수", "매도", "청약당첨", "로또청약",
];
const INVEST_EN = [
  "invest", "investment", "investing", "roi", "appreciation", "capital gain",
  "bull market", "bear market", "price forecast", "forecast prices",
];

const INVEST_EN_RES = INVEST_EN.map((w) => ({
  w, re: new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"),
}));

export function investmentAdvice(text) {
  const s = String(text || "");
  for (const pat of INVEST_KO) {
    if (pat && s.includes(pat)) return pat;
  }
  for (const { w, re } of INVEST_EN_RES) {
    if (re.test(s)) return w;
  }
  return null;
}

// Claims that the simulation predicts real life (as opposed to the honest
// framing: a scenario with stated assumptions).
const PREDICTION_RES = [
  /(실제|현실).{0,10}(그대로|똑같이|정확히|그대로 재현)/,
  /미래를 (예측|알 수 있)/,
  /이대로 (될|일어날|살게 될)/,
  /100% (확실|장담|보장)/,
  /predict(s)? (real life|your future|the future)/i,
  /will (definitely|certainly) happen in real life/i,
];

export function predictionClaim(text) {
  const s = String(text || "");
  for (const re of PREDICTION_RES) {
    const m = re.exec(s);
    if (m) return m[0].slice(0, 60);
  }
  return null;
}

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;

function addVariants(out, n) {
  if (!Number.isFinite(n)) return;
  // Compare deltas can be negative while citations drop the sign
  // ("3.4분 차이" for −3.4), so the magnitude cites too.
  for (const v of n < 0 ? [n, -n] : [n]) {
    out.add(v);
    out.add(round1(v));
    out.add(Math.round(v));
    // metre readings: 10 m rounding and km forms (same as 4c).
    const m = Math.round(v);
    out.add(Math.round(m / 10) * 10);
    out.add(round1(v / 1000));
    out.add(round2(v / 1000));
    // Human minute forms ("35시간 23분" for 2123.4): the hour and minute
    // components cite too (nonzero only — never a bare 0).
    if (Math.abs(v) >= 60) {
      const h = Math.trunc(Math.round(v) / 60);
      const mm = Math.abs(Math.round(v) % 60);
      if (h !== 0) out.add(h);
      if (mm !== 0) out.add(mm);
    }
    // Human won forms ("24억 9,990만 원"): eok/man/rest components
    // cite too (nonzero only). Large money pools many components, but
    // the guard stays a backstop — the prompt carries the real rule.
    if (Math.abs(v) >= 10000) {
      const a = Math.abs(Math.round(v));
      const eok = Math.trunc(a / 100000000);
      const man = Math.trunc((a % 100000000) / 10000);
      const rest = a % 10000;
      if (eok !== 0) out.add(eok);
      if (man !== 0) out.add(man);
      if (rest !== 0) out.add(rest);
    }
  }
}

// Consult topic check: price *references* are allowed (the stage-6
// feature), so only the evaluative topics stay forbidden — safety/crime,
// school quality, health — plus forecasts, loan/eligibility verdicts and
// buy/don't-buy verdicts. Refusal sentences (…판단하지 않습니다,
// …원문에서 확인해 주세요, …알 수 없습니다) are stripped before the
// verdict checks so a polite refusal never trips its own guard.
const CONSULT_KO = [
  // safety / crime
  "안전", "위험", "치안", "조심", "무서", "범죄", "도둑", "절도", "강도", "소매치기",
  // school quality
  "학군", "명문", "진학률",
  // health
  "건강", "의료", "치료", "질병", "증상", "처방", "아프",
];

const CONSULT_EN_RES = [
  "safe", "safety", "unsafe", "danger", "dangerous", "crime", "criminal",
  "theft", "robbery", "thief", "school quality", "good school",
  "top school", "school rating", "school district", "health", "healthy",
  "medical", "sick", "illness", "disease", "treatment", "symptom",
].map((w) => ({ w, re: new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i") }));

export function consultTopic(text) {
  const s = String(text || "");
  for (const pat of CONSULT_KO) {
    if (pat && s.includes(pat)) return pat;
  }
  for (const { w, re } of CONSULT_EN_RES) {
    if (re.test(s)) return w;
  }
  return null;
}

const REFUSAL_RES = [
  /[^.!?\n]*판단하지 않[^.!?\n]*[.!\n]/g,
  /[^.!?\n]*원문에서 확인[^.!?\n]*[.!\n]/g,
  /[^.!?\n]*알 수 없[^.!?\n]*[.!\n]/g,
  /[^.!?\n]*장담할 수 없[^.!?\n]*[.!\n]/g,
  /[^.!?\n]*하지 않습니다[^.!?\n]*[.!\n]/g,
];

export function withoutRefusals(text) {
  let s = String(text || "");
  for (const re of REFUSAL_RES) s = s.replace(re, " ");
  return s;
}

// A forecast *claim* (rise/fall prediction), as opposed to a refusal.
const FORECAST_RES = [
  /(오를|오릅니다|상승|급등|폭등|뛸|뛰어|뛰고|강세)/,
  /(떨어|하락|내릴|내려|약세|조정.{0,4}(올|올 것|예상))/,
  /(전망|예측|예상).{0,8}(밝|좋|나쁩|어둡|긍정|부정)/,
  /(앞으로|향후|내년|내달).{0,12}(오르|상승|하락|떨어|전망)/,
  /will (rise|fall|increase|decrease|go up|go down)/i,
  /price (forecast|prediction|outlook).{0,20}(is|looks)/i,
];

export function forecastClaim(text) {
  const s = withoutRefusals(text);
  for (const re of FORECAST_RES) {
    const m = re.exec(s);
    if (m) return m[0].slice(0, 60);
  }
  return null;
}

// Loan/eligibility *verdicts* ("대출이 나옵니다", "입주 자격이 됩니다").
const LOAN_RES = [
  /대출.{0,10}(가능|나옵|받을 수 있|충분|문제없)/,
  /LTV|DSR/,
  /입주.{0,10}(가능|자격.{0,6}(됩|있|충족|가능))/,
  /청약.{0,10}(당첨|가능|노려)/,
];

export function loanVerdict(text) {
  const s = withoutRefusals(text);
  for (const re of LOAN_RES) {
    const m = re.exec(s);
    if (m) return m[0].slice(0, 60);
  }
  return null;
}

// Buy/don't-buy verdicts (imperative purchase advice). Recommending
// public-rental *candidates* is the feature — only asset verdicts trip.
const BUY_RES = [
  /(사세요|사실 것을|사실 것을 권|매수하시|매도하시)/,
  /(팔고|처분하고).{0,10}(사|이사|갈아타)/,
  /(지금이|지금이 바로).{0,8}(매수|매도|적기|기회)/,
];

export function buyVerdict(text) {
  const s = withoutRefusals(text);
  for (const re of BUY_RES) {
    const m = re.exec(s);
    if (m) return m[0].slice(0, 60);
  }
  return null;
}

// The customer's price-forecast question ("잠실 집값이 오를까?") — the
// reply must refuse politely and offer the last-12-month transactions.
const FORECAST_Q_RES = [
  /(오를까|오를 것 같|오를지|오릅니까|오르나요)/,
  /(떨어질까|내릴까|하락할까|하락할지)/,
  /(집값|가격|시세|전세|월세|매매).{0,10}(전망|예측|예상|어떻게 될|오를|내릴|어떨까)/,
  /(전망|예측).{0,10}(어때|어떻|알려|말해)/,
  /(살 때|살때|매수 타이밍|언제 사)/,
  /(will|going to).{0,15}(rise|fall|increase|decrease|go up|go down)/i,
  /price (forecast|outlook|prediction)/i,
];

export function forecastQuestion(text) {
  const s = String(text || "");
  for (const re of FORECAST_Q_RES) {
    const m = re.exec(s);
    if (m) return m[0].slice(0, 60);
  }
  return null;
}

// Polite 존댓말 refusal + the honest offer. No numbers, no verdicts —
// passes the guard by construction (verified in tests).
export function priceForecastReply(complexName) {
  const where = complexName ? ` ${complexName}의` : "";
  return [
    `죄송합니다. 이 앱은 집값 전망을 하지 않습니다.`,
    `대신${where} 최근 12개월 실거래(매매·전세·월세 중간값과 분포)를 보여드릴 수 있습니다.`,
    `관심 면적을 알려주시면 실거래 기준가를 조회해 드리겠습니다.`,
  ].join("\n");
}

const NUM_RE = /\d+(?:\.\d+)?/g;
const CLOCK_RE = /(\d{1,2}):(\d{2})/g;

// Every number the model may cite: all numbers inside this conversation's
// tool results (with 4c rounding variants), clock components, day numbers,
// label digits and array lengths (e.g. "8 places returned").
export function toolResultNumbers(toolResults) {
  const out = new Set();
  const walk = (value) => {
    if (typeof value === "number") {
      addVariants(out, value);
      return;
    }
    if (typeof value === "string") {
      for (const m of value.matchAll(CLOCK_RE)) {
        const h = Number(m[1]);
        const mm = Number(m[2]);
        if (h !== 0) out.add(h);
        if (mm !== 0) out.add(mm);
      }
      for (const m of value.match(NUM_RE) || []) out.add(Number(m));
      return;
    }
    if (Array.isArray(value)) {
      out.add(value.length);
      for (const v of value) walk(v);
      return;
    }
    if (value && typeof value === "object") {
      for (const v of Object.values(value)) walk(v);
    }
  };
  for (const r of toolResults || []) walk(r);
  return out;
}

// Check one assistant answer against this conversation's tool results.
// Returns {ok:true} or {ok:false, cause, detail, offending}.
export function checkConsultReply(answer, toolResults) {
  const text = String(answer || "");
  const flat = text.replace(/(\d),(?=\d)/g, "$1").replace(/(\d+)개월/g, "$1회");
  const badNums = findInventedNumbers(flat, "", toolResultNumbers(toolResults));
  if (badNums.length > 0) {
    return { ok: false, cause: "invented_number",
      detail: `number ${badNums[0]} appears in no tool result of this conversation`,
      offending: badNums };
  }
  const badTopic = consultTopic(text);
  if (badTopic !== null) {
    return { ok: false, cause: "forbidden_topic",
      detail: `mentions ${badTopic} — refuse and redirect instead`,
      offending: [badTopic] };
  }
  const badInvest = investmentAdvice(text);
  if (badInvest !== null) {
    return { ok: false, cause: "forbidden_topic",
      detail: `investment advice (${badInvest}) — refuse and redirect instead`,
      offending: [badInvest] };
  }
  for (const [fn, cause, detail] of [
    [forecastClaim, "forecast_claim", "predicts prices — refuse and offer the last-12-month transactions instead"],
    [loanVerdict, "loan_verdict", "judges loans/eligibility — the app never does"],
    [buyVerdict, "buy_verdict", "buy/don't-buy verdict — compare numbers only"],
  ]) {
    const hit = fn(text);
    if (hit !== null) {
      return { ok: false, cause, detail, offending: [hit] };
    }
  }
  const badClaim = predictionClaim(text);
  if (badClaim !== null) {
    return { ok: false, cause: "prediction_claim",
      detail: "claims the simulation predicts real life — it is a scenario with stated assumptions",
      offending: [badClaim] };
  }
  return { ok: true };
}

// Last-resort answer when the guard rejects twice: tool numbers only, no
// prose claims. Deterministic formatting from run/compare/day/money
// results (human formats: 억/만 원, 시간/분, km). When the user asked a
// price-forecast question and no tool produced numbers, answer the
// polite refusal instead of the "no numbers" line (which reads broken).
export function numbersOnlyAnswer(toolResults, opts = {}) {
  const lines = ["도구 결과의 수치만 정리합니다 (가정값 포함):"];
  for (const r of toolResults || []) {
    if (!r || typeof r !== "object") continue;
    if (r.compare && Array.isArray(r.compare.metrics)) {
      for (const m of r.compare.metrics) {
        const fmt = m.unit === "minutes" ? fmtMinutes : m.unit === "metres" ? fmtDistance : (n) => `${n}회`;
        const src = m.source === "graph" ? "그래프" : "가정값";
        lines.push(`- ${m.label}: A ${fmt(m.a)} / B ${fmt(m.b)} (Δ ${fmt(m.delta_b_minus_a)}, ${src})`);
      }
    } else if (r.summary && r.summary.totals) {
      const t = r.summary.totals;
      lines.push(`- ${r.home || "홈"} 합계: 도보 ${fmtMinutes(t.walk_minutes)}/${fmtDistance(t.walk_distance_m)}, 장보기 ${t.errands_done}회, 산책 ${t.park_visits}회`);
    } else if (Array.isArray(r.trips)) {
      for (const t of r.trips.slice(0, 12)) {
        lines.push(`- ${t.depart}→${t.arrive} ${t.from}→${t.to} ${fmtMinutes(t.minutes)}(${fmtDistance(t.distance_m)})`);
      }
    } else if (Array.isArray(r.places)) {
      for (const p of r.places.slice(0, 8)) {
        lines.push(`- ${p.name}: ${fmtMinutes(p.minutes)}(${fmtDistance(p.distance_m)}, 그래프)`);
      }
    } else if (r.reference && (r.reference.trade || r.reference.jeonse)) {
      const ref = r.reference;
      if (ref.trade && ref.trade.count > 0) {
        lines.push(`- ${r.complex} 매매 ${r.area_m2}㎡: 중간 ${fmtWon(ref.trade.median)} (${fmtWon(ref.trade.p25)}~${fmtWon(ref.trade.p75)}, ${ref.trade.count}건, 실거래)`);
      }
      if (ref.jeonse && ref.jeonse.count > 0) {
        lines.push(`- ${r.complex} 전세 ${r.area_m2}㎡: 보증금 중간 ${fmtWon(ref.jeonse.deposit.median)} (${ref.jeonse.count}건, 실거래)`);
      }
      if (ref.wolse && ref.wolse.count > 0) {
        lines.push(`- ${r.complex} 월세 ${r.area_m2}㎡: 보증금 중간 ${fmtWon(ref.wolse.deposit.median)} / 월 ${fmtWon(ref.wolse.monthly.median)} (${ref.wolse.count}건, 실거래)`);
      }
    } else if (r.timeline && r.housing) {
      lines.push(`- ${r.home} ${r.tenure}: 실수령 ${fmtWon(r.monthly_net_won, { monthly: true })}, 주거비 ${fmtWon(r.housing.monthly_won, { monthly: true })}, 부담률 ${r.timeline.burden_ratio === null ? "–" : fmtPct(r.timeline.burden_ratio)}, 남는 돈 ${fmtWon(r.timeline.remaining_won, { monthly: true })}`);
    } else if (Number.isFinite(r.monthly_net_won) && r.deductions) {
      lines.push(`- ${r.estimated ? "추정 " : ""}실수령액: ${fmtWon(r.monthly_net_won, { monthly: true })} (세전 ${fmtWon(r.monthly_gross_won, { monthly: true })})`);
    } else if (Array.isArray(r.candidates)) {
      for (const c of r.candidates.slice(0, 5)) {
        lines.push(`- ${c.address}: ${c.exclusive_area_m2}㎡ 보증금 ${fmtWon(c.deposit_won)} / 월 ${fmtWon(c.monthly_rent_won)}${c.commute_minutes !== null ? `, 통근 ${fmtMinutes(c.commute_minutes)}` : ""} (공공임대)`);
      }
    } else if (r.household_monthly_net_preview) {
      const p = r.household_monthly_net_preview;
      lines.push(`- 가구 실수령 합계: ${fmtWon(p.household_monthly_net_won, { monthly: true })}`);
    }
  }
  if (lines.length === 1) {
    if (forecastQuestion(opts.userText || "")) {
      return priceForecastReply(opts.complex || null);
    }
    lines.push("- 이번 대화의 도구 결과에 수치가 없습니다. 조건을 정하고 run_simulation으로 실행해 주세요.");
  }
  return lines.join("\n");
}
