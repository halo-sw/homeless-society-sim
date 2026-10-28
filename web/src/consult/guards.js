// Consult guards: the 상담 agent explains, it never invents numbers.
//
// Reuses the stage-4 judge guards (same rounding rules as 4c): every
// number in the answer must appear in this conversation's tool results.
// Additionally refuses price forecasts, investment advice, safety/crime,
// school quality and health/medical topics, and any claim that the
// simulation predicts real life. Pure; unit-tested.

import { findInventedNumbers, forbiddenTopic } from "../judge/guards.js";

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
  }
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
  const badNums = findInventedNumbers(text, "", toolResultNumbers(toolResults));
  if (badNums.length > 0) {
    return { ok: false, cause: "invented_number",
      detail: `number ${badNums[0]} appears in no tool result of this conversation`,
      offending: badNums };
  }
  const badTopic = forbiddenTopic(text, "");
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
  const badClaim = predictionClaim(text);
  if (badClaim !== null) {
    return { ok: false, cause: "prediction_claim",
      detail: "claims the simulation predicts real life — it is a scenario with stated assumptions",
      offending: [badClaim] };
  }
  return { ok: true };
}

// Last-resort answer when the guard rejects twice: tool numbers only, no
// prose claims. Deterministic formatting from run/compare/day results.
export function numbersOnlyAnswer(toolResults) {
  const lines = ["도구 결과의 수치만 정리합니다 (가정값 포함):"];
  for (const r of toolResults || []) {
    if (!r || typeof r !== "object") continue;
    if (r.compare && Array.isArray(r.compare.metrics)) {
      for (const m of r.compare.metrics) {
        const unit = m.unit === "minutes" ? "분" : m.unit === "metres" ? "m" : "회";
        const src = m.source === "graph" ? "그래프" : "가정값";
        lines.push(`- ${m.label}: A ${m.a}${unit} / B ${m.b}${unit} (Δ ${m.delta_b_minus_a}${unit}, ${src})`);
      }
    } else if (r.summary && r.summary.totals) {
      const t = r.summary.totals;
      lines.push(`- ${r.home || "홈"} 합계: 도보 ${t.walk_minutes}분/${t.walk_distance_m}m, 장보기 ${t.errands_done}회, 산책 ${t.park_visits}회`);
    } else if (Array.isArray(r.trips)) {
      for (const t of r.trips.slice(0, 12)) {
        lines.push(`- ${t.depart}→${t.arrive} ${t.from}→${t.to} ${t.minutes}분(${t.distance_m}m)`);
      }
    } else if (Array.isArray(r.places)) {
      for (const p of r.places.slice(0, 8)) {
        lines.push(`- ${p.name}: ${p.minutes}분(${p.distance_m}m, 그래프)`);
      }
    }
  }
  if (lines.length === 1) {
    lines.push("- 이번 대화의 도구 결과에 수치가 없습니다. 조건을 정하고 run_simulation으로 실행해 주세요.");
  }
  return lines.join("\n");
}
