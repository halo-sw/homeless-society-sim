// Consult guards: the 상담 agent explains, it never invents numbers.
//
// Reuses the stage-4 judge guards (same rounding rules as 4c): every
// number in the answer must appear in this conversation's tool results.
// Stage 6: price *references* (RTMS medians, living costs) are the
// feature, so price words are allowed when the numbers cite tool
// results — but price *forecasts*, investment advice, loan/eligibility
// judgement, buy/don't-buy verdicts, school quality and health/medical
// topics stay refused, as does any claim that the simulation predicts
// real life. Stage 9a: official safety counts and school-access numbers
// are citable from tool results (every figure needs its source, period,
// unit and level), but safety verdicts, safety/school scores and
// rankings, and "recommended home" language trip the no-score guard.
// Pure; unit-tested.

import { findInventedNumbers } from "../judge/guards.js";
import { fmtWon, fmtPct, fmtDistance, fmtMinutes } from "../money/format.js";

// Investment advice on top of the judge's price/safety/school/health list.
// Tight on purpose: generic words like 전망 (view) stay allowed.
const INVEST_KO = [
  "투자", "수익", "수익률", "시세차익", "갭투자", "재테크",
  "매수", "매도", "청약당첨", "로또청약",
];
const INVEST_EN = [
  "invest", "investment", "investing", "roi", "appreciation", "capital gain",
  "bull market", "bear market", "price forecast", "forecast prices",
  "good investment", "invest in",
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
  /will (?:definitely|certainly) happen/i,
  /this predicts/i,
];

export function predictionClaim(text) {
  const s = String(text || "");
  for (const re of PREDICTION_RES) {
    const m = re.exec(s);
    if (m) return m[0].slice(0, 60);
  }
  return null;
}

// 26u: true when the reply reads as mostly Korean. Parenthesised
// segments (romanized names carry the Korean in parentheses),
// [[…]] suggestion markers, URLs and digits are dropped first; then
// true when Hangul letters are more than 20 % of the remaining letters.
export function isMostlyKorean(text) {
  let s = String(text || "");
  s = s.replace(/\[\[[^\]]*\]\]/g, " ");
  s = s.replace(/\([^)]*\)/g, " ");
  s = s.replace(/https?:\/\/\S+/g, " ");
  s = s.replace(/www\.\S+/g, " ");
  s = s.replace(/[0-9]/g, " ");
  const hangul = (s.match(/[\uAC00-\uD7A3\u3131-\u318E\u1100-\u11FF]/g) || []).length;
  const letters = (s.match(/\p{L}/gu) || []).length;
  if (letters === 0) return false;
  return hangul / letters > 0.2;
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

// Consult topic check: price *references* are the stage-6 feature and
// official safety counts + school-access numbers are the stage-9a
// feature, so only the evaluative topics stay forbidden — school
// quality, health, and non-stat crime talk — plus forecasts,
// loan/eligibility verdicts and buy/don't-buy verdicts. Safety *verdicts*
// and safety/school scores or rankings trip the separate no-score guard
// (scoreVerdict). Refusal sentences (…판단하지 않습니다, …원문에서
// 확인해 주세요, …알 수 없습니다) are stripped before the verdict checks
// so a polite refusal never trips its own guard.
const CONSULT_KO = [
  // non-stat crime talk (official counts are cited from tool results)
  "조심", "무서", "도둑", "소매치기",
  // school quality
  "학군", "명문", "진학률",
  // health
  "건강", "의료", "치료", "질병", "증상", "처방", "아프",
];

const CONSULT_EN_RES = [
  "thief", "pickpocket", "school quality", "good school",
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

// The fatigue model note and health-advice refusals name the topic only
// to disclaim it ("가정 모델이며 건강·의학적 판단이 아닙니다",
// "건강·의학적 판단이 아니에요", "건강 조언은 하지 않습니다") — strip
// those sentences before the topic check so the disclaimer never trips
// its own guard. Genuine health claims ("건강에 좋은 동네입니다") still
// trip.
const HEALTH_NOTE_RES = [
  /피로도 지수[^.!?\n]*가정 모델이며 건강·의학적 판단이 아닙니다[^.!?\n]*[.!\n]/g,
  /가정 모델이며 건강·의학적 판단이 아닙니다[^.!?\n]*[.!\n]/g,
  /[^.!?\n]*건강·의학적 판단이 아니[^.!?\n]*[.!\n]/g,
  /[^.!?\n]*건강 (조언|판단|상담)[^.!?\n]*(하지 않|아닙니다|드리지 않)[^.!?\n]*[.!\n]/g,
];

export function withoutHealthNotes(text) {
  let s = String(text || "");
  for (const re of HEALTH_NOTE_RES) s = s.replace(re, " ");
  return s;
}

// The honest safety framing names the topic only to disclaim it ("기록된
// 곳 기준 발생 건수이며 거주자의 위험도가 아닙니다", "점수·순위·등급을
// 매기지 않습니다") — strip those sentences before the no-score check so
// the caveat never trips its own guard. Genuine verdicts ("안전합니다",
// "1위입니다") still trip.
const SAFETY_NOTE_RES = [
  /[^.!?\n]*기록된 곳 기준[^.!?\n]*[.!\n]/g,
  /[^.!?\n]*거주자의 위험도[^.!?\n]*[.!\n]/g,
  /[^.!?\n]*점수·순위·등급을 매기지 않[^.!?\n]*[.!\n]/g,
  /[^.!?\n]*직접 비교할 수 없[^.!?\n]*[.!\n]/g,
  /[^.!?\n]*분리할 수 없[^.!?\n]*[.!\n]/g,
];

export function withoutSafetyNotes(text) {
  let s = String(text || "");
  for (const re of SAFETY_NOTE_RES) s = s.replace(re, " ");
  return s;
}

// No-score guard (stage 9a): safety verdicts ("안전합니다"), safety or
// school scores/rankings ("치안 점수 80점", "학교 순위 1위"), and
// "recommended home" language ("이 집을 추천합니다"). Plain occurrence
// counts and access numbers with their caveats pass; polite refusals are
// stripped first like every other verdict check. The customer's own
// "내 기준 점수" phrases (stage 17) pass with a number.
const SCORE_KO_RES = [
  /안전합/, /위험합/,
  /안전한 (동네|집|지역|곳|매물|아파트)/, /위험한 (동네|집|지역|곳|매물|아파트)/,
  /치안이 (좋|나쁩|괜찮|최고|최악|양호|불량)/,
  /살기 (좋|나쁩|안전|위험|괜찮)/,
  /더 안전/, /덜 안전/, /더 위험/, /덜 위험/, /가장 안전/, /가장 위험/,
  /치안 (점수|순위|등급)/, /안전 (점수|순위|등급)/,
  /학교.{0,8}(순위|점수|등급)/, /(순위|점수).{0,8}학교/,
  /범죄.{0,4}(순위|1위)/,
  /집을 추천/, /추천.{0,4}(집|매물|동네|지역|아파트)/,
  /가장 (좋은|나은) 집/,
  /[0-9]+\s*위/,
];

const SCORE_EN_RES = [
  "safest", "most dangerous", "more dangerous", "less safe", "safer area",
  "safer neighborhood", "safety score", "safety rating", "crime rank",
  "school rank", "best home", "recommended home",
  "safe area", "safe neighborhood", "dangerous area", "dangerous neighborhood",
  "I recommend", "best choice", "best option",
].map((w) => ({ w, re: new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i") }));

// "내 기준 점수" allowlist (stage 17): the customer's own subjective
// score may carry a number without tripping the no-score guard. Only
// the phrase tokens are stripped — the rest of the sentence is still
// checked, so a genuine verdict in the same sentence still trips.
const MYSCORE_PHRASES = ["내 기준 점수", "내가 정한 비중", "주관적인 점수"];

export function withoutMyScore(text) {
  let s = String(text || "");
  for (const p of MYSCORE_PHRASES) s = s.split(p).join(" ");
  return s;
}

export function scoreVerdict(text) {
  const s = withoutMyScore(withoutRefusals(withoutSafetyNotes(text)));
  for (const re of SCORE_KO_RES) {
    const m = re.exec(s);
    if (m) return m[0].slice(0, 60);
  }
  for (const { w, re } of SCORE_EN_RES) {
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
  /prices? will (?:rise|fall|go up|go down)/i,
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
// Bare LTV/DSR mentions are definitions (the 9a glossary), not verdicts —
// only verdict contexts trip.
const LOAN_RES = [
  /대출.{0,10}(가능|나옵|받을 수 있|충분|문제없)/,
  /(LTV|DSR).{0,12}(가능|나옵|충분|문제없|통과|여유|괜찮)/,
  /(가능|충분|여유).{0,12}(LTV|DSR)/,
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
  /you should (?:buy|not buy)|(?:don't|do not) buy/i,
];

export function buyVerdict(text) {
  const s = withoutRefusals(text);
  for (const re of BUY_RES) {
    const m = re.exec(s);
    if (m) return m[0].slice(0, 60);
  }
  return null;
}

// Sign/don't-sign verdicts (stage 9b): imperative contract advice, the
// rental-side sibling of buyVerdict. Comparing numbers passes; telling the
// customer to sign (or walk away) trips.
const SIGN_RES = [
  /(계약하세|서명하세|도장을 찍으세)/,
  /(계약해도 (돼|됩|되|괜찮|좋|안전|문제없))/,
  /(계약하지 마세|계약하면 안됩|서명하지 마세)/,
  /(지금 (바로 )?계약하)/,
  /(계약이 (적기|기회|좋은 때))/,
];

const SIGN_EN_RES = [
  "sign the contract", "sign the lease", "sign it", "go ahead and sign",
].map((w) => ({ w, re: new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i") }));

const SIGN_EN_RE = [
  /you should (?:sign|not sign)|(?:don't|do not) sign/i,
];

export function signVerdict(text) {
  const s = withoutRefusals(text);
  for (const re of SIGN_RES) {
    const m = re.exec(s);
    if (m) return m[0].slice(0, 60);
  }
  for (const { w, re } of SIGN_EN_RES) {
    if (re.test(s)) return w;
  }
  for (const re of SIGN_EN_RE) {
    const m = re.exec(s);
    if (m) return m[0].slice(0, 60);
  }
  return null;
}

// Eligibility verdicts (stage 9b): final "you qualify / you don't"
// judgements on support programmes. Condition-by-condition comparisons
// ("연소득 상한 충족") pass; the verdict sentence trips. The mission copy
// "받을 수 있는 지원" (relative clause) passes — only the declarative
// verdict forms trip.
const SUPPORT_RES = [
  /대상입니다/, /대상자에 해당/, /대상자로 보입/,
  /(지원|신청|대출).{0,6}(가능합니다|받으실 수 있습니다)/,
  /자격.{0,6}(충족합|됩니|있으십)/,
  /받을 수 있습니다/, /받으실 수 있습니다/,
  /신청하세/, /넣으세/,
];

const SUPPORT_EN_RES = [
  "you are eligible", "you're eligible", "you qualify", "you are qualified",
].map((w) => ({ w, re: new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i") }));

export function supportVerdict(text) {
  const s = withoutRefusals(text);
  for (const re of SUPPORT_RES) {
    const m = re.exec(s);
    if (m) return m[0].slice(0, 60);
  }
  for (const { w, re } of SUPPORT_EN_RES) {
    if (re.test(s)) return w;
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
    `죄송해요. 이 앱은 집값을 미리 맞히지 않아요.`,
    `대신${where} 최근 12개월에 실제로 거래된 값(매매·전세·월세 한가운데 값과 퍼진 정도)을 보여드릴 수 있어요.`,
    `관심 있는 면적을 알려주시면 실제로 거래된 값을 찾아 드릴게요.`,
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

// 26t: list indices the customer used or the candidate list shows
// ("1번", "#1", "numbers 1 and 3", "1번이랑 3번") are allowed numbers when
// the turn's tools include a pick/save or the candidate list. They name
// positions, not measurements, so they are stripped before the
// invented-number check (topic and verdict checks still see full text).
function hasPickOrCandidates(toolResults) {
  for (const r of toolResults || []) {
    if (!r || typeof r !== "object") continue;
    if (r.ui && (r.ui.action === "pick" || r.ui.action === "save")) return true;
    if (Array.isArray(r.candidates)) return true;
  }
  return false;
}

function withoutListIndices(text) {
  return String(text || "")
    .replace(/#\d+/g, " ")
    .replace(/\d+\s*번/g, " ")
    .replace(/\bnumbers?\s+\d+(?:\s*(?:,|and|&|와|과)\s*\d+)*/gi, " ");
}

// Check one assistant answer against this conversation's tool results.
// Returns {ok:true} or {ok:false, cause, detail, offending}.
export function checkConsultReply(answer, toolResults, opts = {}) {
  const text = String(answer || "");
  const allowIndices = opts.allowListIndices ?? hasPickOrCandidates(toolResults);
  const numText = allowIndices ? withoutListIndices(text) : text;
  const flat = numText.replace(/(\d),(?=\d)/g, "$1").replace(/(\d+)개월/g, "$1회");
  // English money reads as full won so the number check sees citations:
  // ₩300M / 300M won / 1.2 billion won / ₩260,000,000.
  const flatMoney = flat
    .replace(/₩?\s*(\d+(?:\.\d+)?)\s*(M|million)\b/g,
      (_, n) => String(Math.round(parseFloat(n) * 1e6)))
    .replace(/₩?\s*(\d+(?:\.\d+)?)\s*(B|billion)\b/g,
      (_, n) => String(Math.round(parseFloat(n) * 1e9)))
    .replace(/₩(\d[\d,]*)/g, (_, d) => d.replace(/,/g, ""));
  const badNums = findInventedNumbers(flatMoney, "", toolResultNumbers(toolResults));
  if (badNums.length > 0) {
    return { ok: false, cause: "invented_number",
      detail: `number ${badNums[0]} appears in no tool result of this conversation`,
      offending: badNums };
  }
  const badTopic = consultTopic(withoutHealthNotes(withoutSafetyNotes(text)));
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
    [signVerdict, "sign_verdict", "sign/don't-sign verdict — compare numbers only"],
    [supportVerdict, "support_verdict", "eligibility verdict — compare conditions row by row, never judge"],
    [scoreVerdict, "score_verdict", "safety verdict, safety/school score or ranking — cite counts only, never judge"],
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

// 26t: action-only turns (pick/save, open_panel, start_life_run) carry no
// numbers, so the numbers-only fallback reads broken ("수치가 없어요").
// Confirm what was done instead, built from this turn's tool results.
// Deterministic Korean (stays translatable: never marked data-no-i18n).
// Returns null unless the turn holds at least one action result and no
// result carries report numbers (candidate lists are selection context and
// double as the id→name map for the pick sentence).
const ACTION_UI = new Set(["pick", "save", "panel", "run"]);

const REPORT_DATA_KEYS = [
  "compare", "trips", "places", "reference", "timeline", "monthly_net_won",
  "groups", "access", "term", "totals", "rides", "summary_30d", "persona",
  "weights", "household_monthly_net_preview", "listing_check", "ratio",
  "path_ko", "run_ids", "programs", "metrics", "day_fatigue",
];

function hasReportData(r) {
  return REPORT_DATA_KEYS.some((k) => r[k] !== undefined && r[k] !== null);
}

function eulReul(word) {
  const last = String(word || "").slice(-1);
  const code = last.charCodeAt(0);
  if (/[0-9]/.test(last)) return "을";
  if (code >= 0xac00 && code <= 0xd7a3) {
    return (code - 0xac00) % 28 === 0 ? "를" : "을";
  }
  return "를";
}

export function actionConfirmation(toolResults) {
  const list = (toolResults || []).filter((r) => r && typeof r === "object");
  if (list.length === 0) return null;
  if (!list.some((r) => r.ui && ACTION_UI.has(r.ui.action))) return null;
  if (list.some(hasReportData)) return null;
  const namesById = new Map();
  for (const r of list) {
    for (const c of r.candidates || []) {
      if (c && typeof c.id === "string" && typeof c.name === "string") {
        namesById.set(c.id, c.name);
      }
    }
  }
  const picks = [];
  for (const r of list) {
    if (r.ui && (r.ui.action === "pick" || r.ui.action === "save") && Array.isArray(r.ui.ids)) {
      for (const id of r.ui.ids) {
        if (typeof id === "string" && !picks.includes(id)) picks.push(id);
      }
    }
  }
  const ran = list.some((r) => r.ui && r.ui.action === "run");
  const parts = [];
  if (picks.length > 0) {
    const labels = "ABC";
    const bits = picks.slice(0, 3).map((id, i) => {
      const name = namesById.get(id);
      return `${labels[i]}${name ? ` ${name}` : ""}`;
    });
    const joined = bits.join(", ");
    parts.push(`${joined}${eulReul(joined)} 찜했어요.`);
    if (!ran) {
      parts.push(picks.length >= 2
        ? `"두 집에서 살아 봐 줘"라고 말하면 30일을 살아 봐요.`
        : `한 곳을 더 찜하면 두 집에서 30일씩 살아 봐요.`);
    }
  }
  if (ran) parts.push(`30일 살아 보기를 시작했어요. 다 살면 일기로 알려 드릴게요.`);
  if (parts.length === 0) parts.push(`화면을 열었어요.`);
  return parts.join(" ");
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
        const fmt = m.unit === "minutes" ? fmtMinutes : m.unit === "metres" ? fmtDistance
          : m.unit === "index" ? ((n) => (n === null ? "–" : String(n))) : (n) => `${n}회`;
        const src = m.source === "graph" ? "그래프" : "가정값";
        lines.push(`- ${m.label}: A ${fmt(m.a)} / B ${fmt(m.b)} (Δ ${fmt(m.delta_b_minus_a)}, ${src})`);
      }
    } else if (r.summary && r.summary.totals) {
      const t = r.summary.totals;
      lines.push(`- ${r.home || "홈"} 합계: 걸어서 ${fmtMinutes(t.walk_minutes)}/${fmtDistance(t.walk_distance_m)}, 장보기 ${t.errands_done}번, 산책 ${t.park_visits}번`);
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
      lines.push(`- ${r.home} ${r.tenure}: 실수령 ${fmtWon(r.monthly_net_won, { monthly: true })}, 매달 집에 드는 돈 ${fmtWon(r.housing.monthly_won, { monthly: true })}, 월급에서 집에 나가는 비율 ${r.timeline.burden_ratio === null ? "–" : fmtPct(r.timeline.burden_ratio)}, 집값과 생활비를 내고 남는 돈 ${fmtWon(r.timeline.remaining_won, { monthly: true })}`);
    } else if (Number.isFinite(r.monthly_net_won) && r.deductions) {
      lines.push(`- ${r.estimated ? "추정 " : ""}실수령액: ${fmtWon(r.monthly_net_won, { monthly: true })} (세전 ${fmtWon(r.monthly_gross_won, { monthly: true })})`);
    } else if (Array.isArray(r.candidates) && r.candidates[0] && r.candidates[0].tenures) {
      for (const c of r.candidates.slice(0, 5)) {
        const t = c.tenures[0] || {};
        lines.push(`- ${c.name}(${c.kind} ${t.bucket_center_m2 || "?"}㎡): 중간 ${fmtWon(t.median_won)} (${t.deals || 0}건, 실거래) · ${c.commute_ko || ""}`);
      }
    } else if (Array.isArray(r.candidates)) {
      for (const c of r.candidates.slice(0, 5)) {
        lines.push(`- ${c.address}: ${c.exclusive_area_m2}㎡ 보증금 ${fmtWon(c.deposit_won)} / 월 ${fmtWon(c.monthly_rent_won)}${c.commute_minutes !== null ? `, 통근 ${fmtMinutes(c.commute_minutes)}` : ""} (공공임대)`);
      }
    } else if (r.household_monthly_net_preview) {
      const p = r.household_monthly_net_preview;
      lines.push(`- 가구 실수령 합계: ${fmtWon(p.household_monthly_net_won, { monthly: true })}`);
    } else if (Array.isArray(r.rides)) {
      for (const ride of r.rides.slice(0, 2)) {
        if (!ride.out) {
          lines.push(`- ${ride.stay || "승차"}: ${ride.note || ""} (${ride.ride_minutes}분 가정값)`.trim());
          continue;
        }
        for (const [dir, ride_] of [["출근", ride.out], ["퇴근", ride.back]]) {
          const legs = (ride_.legs || []).map((l) =>
            `${l.line} ${l.from}→${l.to} ${fmtMinutes(l.minutes)} (붐비는 정도 ${l.congestion_pct}%, ${l.congestion_source})`).join(" · ");
          lines.push(`- ${dir}: ${legs} (합계 ${fmtMinutes(ride_.minutes_total)} 고객님이 정한 값)`);
        }
      }
    } else if (r.summary_30d) {
      const s = r.summary_30d;
      lines.push(`- 피곤한 정도 30일: 회사 도착할 때 ${s.arrival_work_avg ?? "–"}, 퇴근해서 집에 왔을 때 ${s.after_home_avg ?? "–"}, 하루 평균 (쉬는 시간 포함) ${s.avg_30d ?? "–"}, 만원 지하철에 탄 시간 ${fmtMinutes(s.crowded_min)} (가정으로 계산한 값)`);
      if (r.day_fatigue) {
        const d = r.day_fatigue;
        lines.push(`- ${r.day}일차: 시작 ${d.start} → 끝 ${d.end}, 최고 ${d.peak} (가정으로 계산한 값)`);
      }
    } else if (r.persona && r.summary) {
      lines.push(`- 상황: ${r.summary} (가정값)`);
    } else if (r.weights && typeof r.weights === "object") {
      const w = r.weights;
      lines.push(`- 고객님이 정한 비중: 교육 ${w.edu} · 생활 ${w.life} · 치안 ${w.safety} · 돈 ${w.money} · 생활 편의 ${w.convenience} (0–5)`);
    } else if (Array.isArray(r.groups) && r.column) {
      lines.push(`- ${r.column} 발생 ${r.total}건 (${r.source}, ${r.period}, ${r.geo_level_ko})`);
      for (const g of r.groups.slice(0, 15)) {
        lines.push(`  · ${g.cat1} ${g.count}건`);
      }
      lines.push("  · 기록된 곳 기준 발생 건수이며 거주자의 위험도가 아닙니다. 점수·순위·등급을 매기지 않습니다.");
    } else if (r.access && r.access.counts) {
      const c10 = r.access.counts.within_10min || {};
      lines.push(`- ${r.complex} 10분 안: 초등 ${c10.school_elementary ?? 0} · 중 ${c10.school_middle ?? 0} · 고 ${c10.school_high ?? 0} · 유치원 ${c10.kindergarten ?? 0} · 학원 ${c10.academy ?? 0} (그래프, OSM)`);
      for (const [bucket, ko] of [["school", "학교"], ["academy", "학원"], ["library", "도서관"]]) {
        const near = (r.access.nearest || {})[bucket] || [];
        if (near[0]) lines.push(`  · 가장 가까운 ${ko}: ${near[0].name} ${fmtMinutes(near[0].minutes)} (그래프)`);
      }
      for (const s of (r.school_routes || []).slice(0, 2)) {
        if (s.route === null) lines.push(`  · 등교 이동 없음 (${s.note})`);
        else lines.push(`  · 등교: ${s.school} ${fmtMinutes(s.minutes)} (${fmtDistance(s.distance_m)}, primary 구간 ${s.primary_ways})`);
      }
    } else if (r.term && r.def) {
      lines.push(`- ${r.term}: ${r.def}`);
    } else if (r.totals && r.breakeven_year && r.horizon_years) {
      lines.push(`- ${r.home || ""} 살 만한가(${r.horizon_years}년, 가정 시나리오):`);
      for (const [name, t] of Object.entries(r.totals)) {
        lines.push(`  · ${name}: 쓴 돈 ${fmtWon(t.cash_out_won)} · 이자 ${fmtWon(t.interest_won)} · 집에 묶여 있는 돈 ${fmtWon(t.locked_won)}`);
      }
      for (const [name, per] of Object.entries(r.breakeven_year)) {
        const parts = Object.entries(per)
          .map(([g, y]) => `${g}% ${y === null ? "기간 안에 없음" : `${y}년차`}`)
          .join(" / ");
        lines.push(`  · 매매가 ${name}보다 적게 드는 해: ${parts}`);
      }
      if (r.dsr) lines.push(`  · 대출 갚는 부담 ${r.dsr.ratio_pct}% (보여주기만, 대출 가능 여부는 금융기관이 판단합니다)`);
    } else if (r.listing_check === true) {
      // Before the jeonse branch: a listing check embeds a ratio plus positions.
      if (r.computable === false) {
        lines.push(`- ${r.complex || r.address || "매물"}: ${r.note || "비교할 실거래가 없어요."}`);
      } else {
        for (const [key, pos] of Object.entries(r.positions || {})) {
          if (!pos || pos.computable !== true) {
            lines.push(`- ${key}: ${pos && pos.note ? pos.note : "비교할 실거래가 적어요."}`);
          } else {
            lines.push(`- ${key} ${fmtWon(pos.asking_won)}: ${pos.band_text} (한가운데 ${fmtWon(pos.median_won)}, ${pos.n}건)`);
          }
        }
        if (r.ratio && r.ratio.computable) {
          lines.push(`- 보증금이 집값의 ${r.ratio.ratio_pct}% (${r.ratio.band.label})`);
        }
        lines.push("- 값이 싼지 비싼지는 말하지 않아요. 계약 판단도 하지 않아요.");
      }
    } else if (r.ratio && (r.ratio.computable === true || r.ratio.computable === false)) {
      if (!r.ratio.computable) {
        lines.push(`- ${r.complex} 보증금이 집값의 몇 %인지: 매매 거래가 적어 계산하기 어려워요 (매매 ${r.ratio.trade.count}건 · 전세 ${r.ratio.jeonse.count}건)`);
      } else {
        lines.push(`- ${r.complex} 보증금이 집값의 ${r.ratio.ratio_pct}% (${r.ratio.band.label}, 매매 ${r.ratio.trade.count}건 · 전세 ${r.ratio.jeonse.count}건, 실거래)`);
      }
    } else if (r.path_ko && r.deposit_won && r.label === "모의 시나리오") {
      lines.push(`- 모의(${r.path_ko}): 보증금 ${fmtWon(r.deposit_won)} 중 ${fmtWon(r.recovery_won)} 돌려받고, ${fmtWon(r.short_won)} 못 받음 (${r.locked_note}) 법률 자문이 아닙니다.`);
    } else if (Array.isArray(r.programs) && r.programs.length > 0 && r.programs[0].rows) {
      for (const p of r.programs.slice(0, 5)) {
        lines.push(`- ${p.name} (${p.org}):`);
        for (const row of p.rows.slice(0, 8)) {
          lines.push(`  · ${row.condition}: 내가 쓴 값 ${row.customer} / 공고에 나온 값 ${row.published} → ${row.result}`);
        }
      }
      lines.push("  · 공고 원문에서 조건을 확인해 주세요.");
    } else if (r.fields && Array.isArray(r.missing)) {
      const bits = Object.entries(r.fields)
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([k, v]) => `${k} ${typeof v === "number" ? fmtWon(v) : v}`).join(" · ");
      lines.push(`- 매물에서 읽은 값: ${bits || "없음"}`);
      for (const m of r.missing.slice(0, 4)) lines.push(`- 물어볼 것: ${m.ask}`);
    }
  }
  if (lines.length === 1) {
    if (forecastQuestion(opts.userText || "")) {
      return priceForecastReply(opts.complex || null);
    }
    lines.push("- 이번 대화의 도구 결과에 수치가 없어요. 조건을 정하면 상담이 다시 실행해 드려요.");
  }
  return lines.join("\n");
}
