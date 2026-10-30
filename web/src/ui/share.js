// Shareable result card (pure data builder + canvas renderer, no React).
//
// resultCardData assembles the header (persona or household line, homes
// A / B with area, 만든 날 vs 시뮬레이션 기간) and twelve A-vs-B rows in
// plain words — commute, monthly housing, remaining money, fatigue,
// 10-minute convenience, jeonse signals — each with value + unit, source
// badges and 가정값 marks, the customer's own priorities (내 기준 점수
// first, same caption as the drawer), and the disclaimer. No verdict:
// which side is numerically lower is marked
// neutrally ("낮음"), never 좋음/나쁨, and the card shows while the
// customer decides. The PNG renders locally via <canvas> (1080 px wide)
// and downloads in the browser (no upload).

import { fmtWon, fmtMinutes, fmtIndex } from "../money/format.js";
import { monthlyHousingOf } from "../money/monthly.js";
import { priorityValues, myScore } from "../priorities.js";
import { congestionPeakLine } from "../engine/journey.js";
import { monthlyHousingLabel, BURDEN_PLAIN_LABEL,
  REMAINING_PLAIN_LABEL } from "./copy.js";

export const SHARE_TITLE = "우리 집 비교 결과";
export const SHARE_DISCLAIMER =
  "보여주기만 해요. 살지 말지는 고객님이 직접 정하세요. 가정값(정해 둔 값)이 섞여 있어요.";

// Persona titles mirror web/src/consult/tools.js PERSONAS (kept local so
// the browser bundle stays free of server tool code).
export const PERSONA_TITLES = {
  "single-firstjob": "1인 사회초년생",
  "newlywed-couple": "예비·신혼부부",
  "dual-income-child": "맞벌이 + 초등학생 자녀",
};

export function personaTitleFor(scenarioName) {
  const name = String(scenarioName || "");
  for (const [id, title] of Object.entries(PERSONA_TITLES)) {
    if (name === id || name.endsWith(`-${id}`) || name.endsWith(`_${id}`)) return title;
  }
  return "";
}

const SRC_KO = {
  graph: "걸어서 잰 시간", rtms: "실거래", scenario: "가정값",
  payroll_estimate: "추정", user_input: "고객 입력", police: "경찰청",
  register: "관청 자료", housing_api: "공공임대", mixed: "섞임",
  customer_listing: "붙여넣은 매물", run: "30일 살아 보기",
};

export function shareSourceKo(source) {
  return SRC_KO[source] || "가정값";
}

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function metricByKey(compare, key) {
  const metrics = (compare && compare.metrics) || [];
  return metrics.find((m) => m.key === key) || null;
}

function fmtBurden(ratio) {
  const r = num(ratio);
  return r === null ? "–" : `${Math.round(r * 1000) / 10}%`;
}

function commuteMode(home) {
  const ride = num(home && home.qol_time && home.qol_time.commute_ride_minutes_per_day);
  if (ride === null) return null;
  return ride > 0 ? "차·지하철 + 도보" : "도보";
}

// Twelve comparison rows for homes A and B. `compare` (the engine's A/B
// metrics) wins for 30-day sums; per-day money-doc values × days are the
// honest fallback when it is absent. Each row: {id, label, a, b,
// raw: {a, b} | null, lowerSide: "A" | "B" | null, sources, assumed,
// note}. lowerSide marks the numerically lower side only, neutrally.
export function buildCompareRows({ money, compare = null, tenures = {}, days = 30 } = {}) {
  const homes = (money && money.homes) || {};
  const A = homes.A || null;
  const B = homes.B || null;
  const simDays = Number.isFinite(Number(days)) && Number(days) > 0 ? Number(days) : 30;
  const rows = [];
  const push = (row) => {
    const ra = row.raw && num(row.raw.a);
    const rb = row.raw && num(row.raw.b);
    rows.push({ ...row,
      lowerSide: ra !== null && rb !== null && ra !== rb ? (ra < rb ? "A" : "B") : null });
  };

  const modeA = A ? commuteMode(A) : null;
  const modeB = B ? commuteMode(B) : null;
  push({ id: "commute_mode", label: "출근 방법",
    a: modeA === null ? "–" : modeA, b: modeB === null ? "–" : modeB,
    raw: null, sources: ["scenario"], assumed: true, note: "" });

  // 18d: one 출퇴근 편도 per home, the same C01 number as the result
  // card and the compare table. Older compares without runs keep the
  // per-day fallback under its old label.
  const ow = compare && compare.one_way;
  const owA = ow ? num(ow.A) : null;
  const owB = ow ? num(ow.B) : null;
  const dayA = num(A && A.qol_time && A.qol_time.commute_minutes_per_day);
  const dayB = num(B && B.qol_time && B.qol_time.commute_minutes_per_day);
  push(owA !== null && owB !== null
    ? { id: "commute_day", label: "출퇴근 편도 (문 앞→회사)",
      a: fmtMinutes(owA), b: fmtMinutes(owB),
      raw: { a: owA, b: owB }, sources: ["run"], assumed: false, note: "" }
    : { id: "commute_day", label: "하루 출퇴근 시간",
      a: dayA === null ? "–" : fmtMinutes(dayA),
      b: dayB === null ? "–" : fmtMinutes(dayB),
      raw: { a: dayA, b: dayB }, sources: ["graph", "scenario"], assumed: true,
      note: "차·지하철을 탄 시간은 정해 둔 값이에요" });

  const rideM = metricByKey(compare, "commute_ride_minutes");
  const rideA = rideM ? num(rideM.a) : null;
  const rideB = rideM ? num(rideM.b) : null;
  const rideFallA = num(A && A.qol_time && A.qol_time.commute_ride_minutes_per_day);
  const rideFallB = num(B && B.qol_time && B.qol_time.commute_ride_minutes_per_day);
  const rideValA = rideA !== null ? rideA
    : (rideFallA !== null ? rideFallA * simDays : null);
  const rideValB = rideB !== null ? rideB
    : (rideFallB !== null ? rideFallB * simDays : null);
  push({ id: "ride_30d", label: "30일 동안 차·지하철을 탄 시간",
    a: rideValA === null ? "–" : fmtMinutes(rideValA),
    b: rideValB === null ? "–" : fmtMinutes(rideValB),
    raw: { a: rideValA, b: rideValB }, sources: ["scenario"], assumed: true,
    note: rideM ? "" : "하루 값에 일수를 곱했어요" });

  const walkM = metricByKey(compare, "walk_minutes");
  const walkA = walkM ? num(walkM.a) : null;
  const walkB = walkM ? num(walkM.b) : null;
  const walkFallA = num(A && A.qol_time && A.qol_time.commute_walk_minutes_per_day);
  const walkFallB = num(B && B.qol_time && B.qol_time.commute_walk_minutes_per_day);
  const walkValA = walkA !== null ? walkA
    : (walkFallA !== null ? walkFallA * simDays : null);
  const walkValB = walkB !== null ? walkB
    : (walkFallB !== null ? walkFallB * simDays : null);
  push({ id: "walk_30d", label: "30일 동안 걸은 시간",
    a: walkValA === null ? "–" : fmtMinutes(walkValA),
    b: walkValB === null ? "–" : fmtMinutes(walkValB),
    raw: { a: walkValA, b: walkValB }, sources: ["graph"],
    assumed: !walkM,
    note: walkM ? "" : "출퇴근 걸음만으로 어림했어요" });

  const fatA = num(A && A.qol_fatigue && A.qol_fatigue.arrival_work_avg);
  const fatB = num(B && B.qol_fatigue && B.qol_fatigue.arrival_work_avg);
  push({ id: "fatigue_arrival", label: "회사 도착할 때 피곤한 정도",
    a: fatA === null ? "–" : fmtIndex(fatA),
    b: fatB === null ? "–" : fmtIndex(fatB),
    raw: { a: fatA, b: fatB }, sources: ["scenario"], assumed: true,
    note: "가정으로 계산한 값이에요" });

  const peakText = (home) => {
    if (!home || !home.qol_fatigue) return { text: "–", measured: false, known: false };
    const pct = num(home.qol_fatigue.peak_congestion_pct);
    const ctx = home.qol_fatigue.peak_congestion_ctx || {};
    if (pct === null) return { text: "–", measured: false, known: false };
    const measured = ctx.source === "서울교통공사";
    return { text: `${congestionPeakLine({ ...ctx, pct })} (${measured ? "실측" : "가정값"})`,
      measured, known: true };
  };
  const peakA = peakText(A);
  const peakB = peakText(B);
  push({ id: "peak", label: "가장 붐빈 구간", a: peakA.text, b: peakB.text,
    raw: null, sources: ["scenario"],
    assumed: !(peakA.measured || peakB.measured),
    note: peakA.known || peakB.known ? "" : "탄 기록이 없어요" });

  const tenureA = tenures.A || "전세";
  const tenureB = tenures.B || "전세";
  const selA = A && A.by_tenure && A.by_tenure[tenureA];
  const selB = B && B.by_tenure && B.by_tenure[tenureB];
  push({ id: "housing", label: monthlyHousingLabel(tenureA),
    a: selA ? fmtWon(selA.housing.monthly_won, { monthly: true }) : "–",
    b: selB ? fmtWon(selB.housing.monthly_won, { monthly: true }) : "–",
    raw: { a: selA ? num(selA.housing.monthly_won) : null,
      b: selB ? num(selB.housing.monthly_won) : null },
    sources: [((selA && selA.housing.source) || (selB && selB.housing.source) || "rtms")],
    assumed: false,
    note: tenureA === tenureB ? "" : `B는 ${tenureB}로 계산했어요` });

  // 18d: 월 주거비 — the same full-monthly number as the result
  // card (주거비 + 관리비 + 교통비), via the shared helper.
  const mhA = monthlyHousingOf(money, "A", simDays);
  const mhB = monthlyHousingOf(money, "B", simDays);
  push({ id: "monthly_housing", label: "한 달에 집에 드는 돈",
    a: mhA.missing ? "–" : fmtWon(mhA.monthly, { monthly: true }),
    b: mhB.missing ? "–" : fmtWon(mhB.monthly, { monthly: true }),
    raw: { a: mhA.missing ? null : mhA.monthly,
      b: mhB.missing ? null : mhB.monthly },
    sources: ["rtms", "scenario"], assumed: true, note: "" });

  const burdenA = selA ? num(selA.burden_ratio) : null;
  const burdenB = selB ? num(selB.burden_ratio) : null;
  push({ id: "burden", label: BURDEN_PLAIN_LABEL,
    a: fmtBurden(burdenA), b: fmtBurden(burdenB),
    raw: { a: burdenA, b: burdenB },
    sources: [((selA && selA.housing.source) || "rtms")], assumed: false, note: "" });

  const remA = selA ? num(selA.remaining_won) : null;
  const remB = selB ? num(selB.remaining_won) : null;
  push({ id: "remaining", label: REMAINING_PLAIN_LABEL,
    a: remA === null ? "–" : fmtWon(remA, { monthly: true }),
    b: remB === null ? "–" : fmtWon(remB, { monthly: true }),
    raw: { a: remA, b: remB },
    sources: [((selA && selA.housing.source) || "rtms")], assumed: false, note: "" });

  const jeonseText = (home) => {
    const check = home && home.jeonse_check;
    if (check && check.computable) {
      return { text: `${check.ratio_pct}% (${check.band.label})`,
        raw: num(check.ratio_pct) };
    }
    return { text: "실거래가 적어서 계산하기 어려워요", raw: null };
  };
  const jA = jeonseText(A);
  const jB = jeonseText(B);
  push({ id: "jeonse_ratio", label: "보증금이 집값의 몇 %인지",
    a: jA.text, b: jB.text, raw: { a: jA.raw, b: jB.raw },
    sources: ["rtms"], assumed: false, note: "" });

  const convText = (home) => {
    const c = home && home.qol_convenience;
    if (!c) return { text: "–", raw: null, note: "" };
    const g = num(c.grocery) || 0;
    const cl = num(c.clinic) || 0;
    const st = num(c.station) || 0;
    return { text: `${g + cl + st}곳`, raw: g + cl + st,
      note: `장보기 ${g} · 병원 ${cl} · 역 ${st}` };
  };
  const cA = convText(A);
  const cB = convText(B);
  push({ id: "convenience", label: "걸어서 10분 안 편의시설 수",
    a: cA.text, b: cB.text, raw: { a: cA.raw, b: cB.raw },
    sources: ["graph"], assumed: false,
    note: [cA.note && `A ${cA.note}`, cB.note && `B ${cB.note}`].filter(Boolean).join(" / ") });

  const eveM = metricByKey(compare, "home_evening_minutes");
  const eveA = eveM ? num(eveM.a) : null;
  const eveB = eveM ? num(eveM.b) : null;
  const eveFallA = num(A && A.qol_time && A.qol_time.evening_at_home_minutes_per_day);
  const eveFallB = num(B && B.qol_time && B.qol_time.evening_at_home_minutes_per_day);
  const eveValA = eveA !== null ? eveA
    : (eveFallA !== null ? eveFallA * simDays : null);
  const eveValB = eveB !== null ? eveB
    : (eveFallB !== null ? eveFallB * simDays : null);
  push({ id: "evening_30d", label: "30일 동안 저녁에 집에 머문 시간",
    a: eveValA === null ? "–" : fmtMinutes(eveValA),
    b: eveValB === null ? "–" : fmtMinutes(eveValB),
    raw: { a: eveValA, b: eveValB }, sources: ["scenario"], assumed: true,
    note: eveM ? "" : "하루 값에 일수를 곱했어요" });

  return rows;
}

export const SHARE_ROW_IDS = ["commute_mode", "commute_day", "ride_30d",
  "walk_30d", "fatigue_arrival", "peak", "housing", "monthly_housing",
  "burden", "remaining", "jeonse_ratio", "convenience", "evening_30d"];

// 18d: one small 계산 방법 footnote in plain customer Korean replaces
// the per-row 출처 lines (which duplicated 가정값 and leaked internal
// phrasing). (낮음) stays as a neutral lower-side mark.
export function buildMethodNote({ money = null, compare = null } = {}) {
  const lines = [
    "출근 방법에 ‘도보’라고 적힌 집은 차·지하철을 탄 기록이 없어요.",
  ];
  if (compare && !compare.error) {
    lines.push("출퇴근 편도와 차·지하철 탄 시간은 고른 두 집에서 같은 식구가 30일 산 결과예요. 걸은 시간은 도보 그래프로 잰 값이고, 차·지하철을 탄 시간과 횟수는 미리 정해 둔 값이에요.");
  } else {
    lines.push("아직 30일 살아 보기 전이라 하루 값으로 적었어요. 걸은 시간은 도보 그래프로 잰 값이고, 차·지하철을 탄 시간과 횟수는 미리 정해 둔 값이에요.");
  }
  if (money && !money.error) {
    lines.push("돈은 국토교통부 실거래가 중간값과 고객님이 말한 상황으로 계산했어요.");
  }
  lines.push("치안·공공임대 내용은 경찰청·공공임대 공식 자료를 바탕으로 했어요.");
  lines.push("붐빔에 실측 표시가 없으면 가정값이에요.");
  lines.push("(낮음)은 금액·시간이 작은 쪽을 가리킬 뿐, 좋다는 뜻이 아니에요.");
  return lines;
}

// Which share docs are still missing? Pure over the store state: the
// dialog (and the tour's share step) shows a short loading state until
// both the compare and the money doc are present and clean.
export function shareLoadPlan(state = {}) {
  const compareMissing = !state.compare;
  const moneyMissing = !state.money;
  const compareBad = compareMissing || !!state.compare.error;
  const moneyBad = moneyMissing || !!state.money.error;
  const fetching = !!(state.compareLoading || state.moneyLoading);
  const failed = !!((state.compare && state.compare.error)
    || (state.money && state.money.error));
  return {
    needsCompare: compareBad && !state.compareLoading,
    needsMoney: moneyBad && !state.moneyLoading,
    // A short loading state until both docs are there; a failed load
    // renders what it has (with the error noted) instead of spinning.
    loading: (fetching || compareMissing || moneyMissing) && !failed,
    ready: !compareBad && !moneyBad,
    failed,
  };
}

// Ask the scene for the missing share docs (no-op when everything is
// there, already loading, or the scene action is not registered — e.g.
// tour boot). Returns the plan. Takes the store so tests pass a fake.
export function requestShareLoads(st) {
  const plan = shareLoadPlan(st ? st.getState() : {});
  if ((plan.needsCompare || plan.needsMoney)
      && st && typeof st.hasAction === "function" && st.hasAction("ensureShareData")) {
    st.act("ensureShareData");
  }
  return plan;
}

export function resultCardData({ money, compare = null, tenures = {},
    priorities = null, weights = null, scenarioName = "", personaTitle = "",
    householdLine = "", simStart = "", simDays = 0, date = null } = {}) {
  const createdDay = date || new Date().toISOString().slice(0, 10);
  const homes = [];
  for (const label of ["A", "B"]) {
    const h = money && money.homes && money.homes[label];
    if (!h) continue;
    const tenure = tenures[label] || "전세";
    const area = num(h.area_m2);
    homes.push({
      label, complex_name: h.complex_name || "", area_m2: area, tenure,
      headline: `${label} ${h.complex_name || ""}${area !== null ? ` · ${area}㎡` : ""} (${tenure})`,
    });
  }
  const days = Number.isFinite(Number(simDays)) && Number(simDays) > 0
    ? Number(simDays)
    : (money && num(money.days)) || 30;
  let priorityLines = ["기본 모두 보통이에요."];
  let priorityNote = "비중을 정하지 않았어요. 내 기준 탭에서 정할 수 있어요.";
  if (priorities && weights && weights.explicit) {
    priorityLines = (priorities.groups || []).map((g) =>
      `${g.title} ${weights.weights[g.id] ?? 3}`);
    priorityNote = "고객님이 직접 정한 비중이에요.";
  }
  const bars = (priorities && priorities.groups ? priorities.groups : []).map((g) => ({
    title: g.title,
    weight: priorities && weights && weights.explicit ? (weights.weights[g.id] ?? 3) : 3,
  }));
  // 17-2: 내 기준 점수, the card's first row (same caption as the
  // drawer). Null when the money doc or explicit weights are unusable.
  let score = null;
  if (money && !money.error) {
    const scoreTenures = {};
    for (const label of Object.keys(money.homes || {})) {
      scoreTenures[label] = tenures[label] || "전세";
    }
    const s = myScore(priorityValues(money, compare, scoreTenures),
      weights ? weights.weights : null,
      { explicit: !!(weights && weights.explicit) });
    if (s.ok) {
      score = { basis: s.basis, scores: s.scores, caption: s.caption };
    }
  }
  return {
    title: SHARE_TITLE,
    date: createdDay,
    createdDay,
    simPeriod: {
      start: simStart || "",
      days,
      label: simStart ? `시뮬레이션 기간 ${simStart}부터 ${days}일` : `시뮬레이션 기간 ${days}일`,
    },
    scenario: scenarioName,
    persona: personaTitle || personaTitleFor(scenarioName),
    household: householdLine || "",
    homes,
    score,
    rows: buildCompareRows({ money, compare, tenures, days }),
    method: buildMethodNote({ money, compare }),
    priorities: { lines: priorityLines, note: priorityNote, bars },
    disclaimer: SHARE_DISCLAIMER,
  };
}

// --- canvas renderer ------------------------------------------------------------
// Draws the card on a 2D canvas (browser only), 1080 px wide so it stays
// legible at phone size. Same layout as the dialog preview. Returns
// {width, height}.

const INK = "#2b2620";
const FAINT = "#6b6257";
const ACCENT = "#7a5c3e";
const BAR_TRACK = "#e5ddcc";
const BAR_FILL = "#8a6f4d";

export function renderShareCard(canvas, data) {
  const ctx = canvas.getContext("2d");
  const W = 1080;
  const pad = 52;
  const maxW = W - pad * 2;
  const lines = [];
  const bars = [];
  const push = (text, opts = {}) => lines.push({ text, ...opts });

  push(data.title, { size: 54, bold: true, gapAfter: 8 });
  const who = [data.persona, data.household].filter(Boolean).join(" · ");
  if (who) push(who, { size: 30, gapAfter: 2 });
  for (const h of data.homes) push(h.headline, { size: 30 });
  push(`만든 날 ${data.createdDay}`, { size: 28, color: FAINT });
  push(data.simPeriod.label, { size: 28, color: FAINT, gapAfter: 14 });
  if (data.score) {
    const line = Object.entries(data.score.scores)
      .map(([l, v]) => `${l} ${v === null || v === undefined ? "–" : v}`).join(" · ");
    push("내 기준 점수", { size: 36, bold: true, gapBefore: 16 });
    push(line, { size: 30 });
    push(data.score.caption, { color: FAINT, size: 24, gapAfter: 8 });
  }
  for (const r of data.rows) {
    push(r.label, { size: 30, bold: true, gapBefore: 12 });
    const markA = r.lowerSide === "A" ? " (낮음)" : "";
    const markB = r.lowerSide === "B" ? " (낮음)" : "";
    push(`A ${r.a}${markA} · B ${r.b}${markB}`, { size: 30, wrap: true });
    if (r.note) push(r.note, { color: FAINT, size: 24, wrap: true });
  }
  push("계산 방법", { size: 30, bold: true, gapBefore: 12 });
  for (const l of data.method || []) push(l, { color: FAINT, size: 24, wrap: true });
  push("내가 정한 비중", { size: 36, bold: true, gapBefore: 16 });
  for (const b of (data.priorities.bars || [])) {
    bars.push({ title: b.title, weight: b.weight });
    push(`· ${b.title} ${b.weight}`, { size: 28, bar: bars.length - 1 });
  }
  if (bars.length === 0) {
    for (const l of data.priorities.lines) push(`· ${l}`, { size: 28 });
  }
  push(data.priorities.note, { color: FAINT, size: 24, gapAfter: 8 });
  push(data.disclaimer, { size: 28, wrap: true, gapBefore: 8 });

  // Wrap pass.
  ctx.textBaseline = "top";
  const wrapped = [];
  for (const l of lines) {
    ctx.font = `${l.bold ? "700 " : ""}${l.size || 28}px system-ui, "Noto Sans KR", sans-serif`;
    if (!l.wrap) {
      wrapped.push({ ...l, parts: [l.text] });
      continue;
    }
    const parts = [];
    let cur = "";
    for (const ch of l.text) {
      if (ctx.measureText(`${cur}${ch}`).width > maxW && cur) {
        parts.push(cur);
        cur = "";
      }
      cur += ch;
    }
    if (cur) parts.push(cur);
    wrapped.push({ ...l, parts });
  }
  const rowH = (l) => {
    if (l.size === 54) return 72;
    if (l.size === 36) return 50;
    if (l.bar !== undefined) return 44;
    if (l.size === 24) return 34;
    if (l.size === 28) return 40;
    return 42;
  };
  const H = pad * 2 + wrapped.reduce((a, l) =>
    a + (l.gapBefore || 0) + l.parts.length * rowH(l) + (l.gapAfter || 0), 0);
  canvas.width = W;
  canvas.height = Math.ceil(H);
  ctx.fillStyle = "#fffdf8";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = "top";
  let y = pad;
  for (const l of wrapped) {
    y += l.gapBefore || 0;
    ctx.font = `${l.bold ? "700 " : ""}${l.size || 28}px system-ui, "Noto Sans KR", sans-serif`;
    ctx.fillStyle = l.color || INK;
    if (l.size === 54) {
      ctx.fillStyle = ACCENT;
      ctx.fillRect(pad, y + 6, 8, 52);
    }
    for (const part of l.parts) {
      ctx.fillStyle = l.color || INK;
      ctx.fillText(part, l.size === 54 ? pad + 22 : pad, y);
      if (l.bar !== undefined) {
        const b = bars[l.bar];
        const frac = Math.max(0, Math.min(1, (Number(b.weight) || 0) / 5));
        const bx = pad + 420;
        const bw = 420;
        const bh = 22;
        const by = y + 8;
        ctx.fillStyle = BAR_TRACK;
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = BAR_FILL;
        ctx.fillRect(bx, by, Math.round(bw * frac), bh);
      }
      y += rowH(l);
    }
    y += l.gapAfter || 0;
  }
  ctx.fillStyle = FAINT;
  ctx.font = "24px system-ui, sans-serif";
  ctx.fillText("Ithaca · 파일은 이 브라우저에만 저장돼요", pad, canvas.height - pad + 12);
  return { width: canvas.width, height: canvas.height };
}
