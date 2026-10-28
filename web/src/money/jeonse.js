// 전세 안전 점검: signals from public data, never a verdict (pure).
//
// 1. 전세가율 신호: median 전세 ÷ median 매매 over the same complex/area
//    bucket in the last 12 months, with counts. Sparse sale history
//    (연립다세대/오피스텔) renders the honest sparse note — the missing
//    market price is itself shown as a caution signal.
// 2. Register signals we already have: 주용도, 사용승인일, 구조, 세대수 from
//    the building register; 위반건축물 is absent from our data and says so.
// 3. The checklist itself lives in scenarios/assumptions/
//    kr-jeonse-checklist.json (validated here, nulls allowed and flagged).
//
// Band wording is deliberately neutral ("70% 이상", never 안전/위험) and
// every band cites its criterion id. Reference thresholds come from
// C-jeonse-ratio-caution / C-jeonse-ratio-warning.

import { statsOf, AREA_BUCKET_TOL_M2 } from "./prices.js";

export const JEONSE_MIN_TRADES = 3;
export const JEONSE_SPARSE_NOTE =
  "매매 거래가 적어 산출이 어렵습니다 — 시세 확인이 어려운 것 자체가 주의 신호일 수 있어요";
export const JEONSE_REF_NOTE = "참고 기준(통상 언급되는 값), 법적 기준 아님";
export const JEONSE_CAUTION_ID = "C-jeonse-ratio-caution";
export const JEONSE_WARNING_ID = "C-jeonse-ratio-warning";

// rows: normalised RTMS rows already matched to the complex (parcel+name
// or name-only — the caller states the method). areaM2 centres the ±5㎡
// bucket; contract_ym bounds the last-12-month window when given.
export function jeonseRatio(rows, { areaM2, tolM2 = AREA_BUCKET_TOL_M2,
  fromYm = null, toYm = null, cautionPct = 70, warningPct = 80 } = {}) {
  const inBucket = (rows || []).filter((r) =>
    Number.isFinite(r.area_m2) && Number.isFinite(areaM2) && Math.abs(r.area_m2 - areaM2) <= tolM2);
  const inWindow = inBucket.filter((r) => {
    if (!r.contract_ym) return true;
    if (fromYm && r.contract_ym < fromYm) return false;
    if (toYm && r.contract_ym > toYm) return false;
    return true;
  });
  const trades = inWindow.filter((r) => r.deal === "trade" && Number.isFinite(r.trade_won));
  const jeonses = inWindow.filter((r) => r.deal === "rent"
    && (r.rent_kind === "jeonse" || (r.rent_kind === "other" && !(r.monthly_won > 0)))
    && Number.isFinite(r.deposit_won));
  const tradeStats = statsOf(trades.map((r) => r.trade_won));
  const jeonseStats = statsOf(jeonses.map((r) => r.deposit_won));
  const yms = inWindow.map((r) => r.contract_ym).filter(Boolean).sort();
  const period = yms.length > 0 ? { from: yms[0], to: yms[yms.length - 1] } : { from: fromYm, to: toYm };
  const base = {
    area_m2: areaM2,
    bucket_m2: tolM2,
    period,
    trade: { ...tradeStats, unit: "won" },
    jeonse: { ...jeonseStats, unit: "won" },
    housing_types: [...new Set(inWindow.map((r) => r.housing_type).filter(Boolean))],
  };
  if (tradeStats.count < JEONSE_MIN_TRADES || jeonseStats.count === 0
      || !(tradeStats.median > 0)) {
    return { ...base, computable: false, ratio_pct: null, band: null, note: JEONSE_SPARSE_NOTE };
  }
  const ratio = Math.round((jeonseStats.median / tradeStats.median) * 1000) / 10;
  let band;
  if (ratio >= warningPct) {
    band = { key: "high", label: `80% 이상 (${JEONSE_WARNING_ID} 이상)`, criterion_id: JEONSE_WARNING_ID };
  } else if (ratio >= cautionPct) {
    band = { key: "watch", label: `70% 이상 (${JEONSE_CAUTION_ID} 이상)`, criterion_id: JEONSE_CAUTION_ID };
  } else {
    band = { key: "below", label: "70% 미만 (참고선 아래)", criterion_id: JEONSE_CAUTION_ID };
  }
  return { ...base, computable: true, ratio_pct: ratio, band,
    ref_note: JEONSE_REF_NOTE, caution_pct: cautionPct, warning_pct: warningPct };
}

// Register signals for one complex's buildings (built area `register`
// objects). Present fields show values; absent fields say so — in
// particular 위반건축물, which our register extract does not carry.
export const REGISTER_ABSENT_NOTE = "이 자료에는 해당 정보가 없어요";

export function registerSignals(buildings) {
  const list = Array.isArray(buildings) ? buildings : [];
  const regs = list.map((b) => (b && b.register) || {});
  const uses = [...new Set(regs.map((r) => r.use || (r.api && r.api.use)).filter(Boolean))];
  const approvals = regs
    .map((r) => r.approval_date || (r.api && r.api.approval_date))
    .filter(Boolean)
    .sort();
  const structures = [...new Set(regs.map((r) => r.structure).filter(Boolean))];
  let households = 0;
  let householdsKnown = false;
  for (const r of regs) {
    const h = r.api && r.api.households;
    if (Number.isFinite(h)) {
      householdsKnown = true;
      households += h;
    }
  }
  const addresses = [...new Set(regs.map((r) => r.address).filter(Boolean))];
  const row = (field, value, note = null) => ({ field, value: value ?? null, note });
  return {
    building_count: list.length,
    rows: [
      row("건물을 무엇에 쓰는지", uses.length > 0 ? uses.join(" · ") : null,
        uses.length > 0 ? null : REGISTER_ABSENT_NOTE),
      row("다 짓고 허가받은 날", approvals.length > 0
        ? (approvals[0] === approvals[approvals.length - 1] ? approvals[0] : `${approvals[0]} ~ ${approvals[approvals.length - 1]}`)
        : null,
        approvals.length > 0 ? null : REGISTER_ABSENT_NOTE),
      row("건물 뼈대", structures.length > 0 ? structures.join(" · ") : null,
        structures.length > 0 ? null : REGISTER_ABSENT_NOTE),
      row("사는 가구 수 합계", householdsKnown ? households : null,
        householdsKnown ? "건축HUB 표제부 합계" : REGISTER_ABSENT_NOTE),
      row("주소", addresses.length > 0 ? addresses.join(" · ") : null,
        addresses.length > 0 ? null : REGISTER_ABSENT_NOTE),
      row("법을 어긴 건물인지", null, "이 자료에는 법 위반 건물 정보가 없어요. 건축물대장·등기부등본에서 직접 확인해 주세요."),
    ],
  };
}

// Checklist file schema: urls may be null, but then needs_confirmation
// must be true (the UI renders 공식 확인 필요).
export function validateChecklist(doc) {
  const errors = [];
  if (!doc || typeof doc !== "object") return ["checklist must be an object"];
  const ctx = doc.context || {};
  if (typeof ctx.text !== "string" || !ctx.text) errors.push("context.text must be a non-empty string");
  if (typeof ctx.source !== "string" || !ctx.source) errors.push("context.source must be a non-empty string");
  if (typeof ctx.date !== "string" || !ctx.date) errors.push("context.date must be a non-empty string");
  if (typeof ctx.needs_confirmation !== "boolean") errors.push("context.needs_confirmation must be a boolean");
  if (!Array.isArray(doc.items) || doc.items.length === 0) errors.push("items needs ≥ 1 entry");
  for (const it of doc.items || []) {
    if (!it || typeof it !== "object") {
      errors.push("each item must be an object");
      continue;
    }
    for (const f of ["id", "what", "why", "where"]) {
      if (typeof it[f] !== "string" || !it[f]) errors.push(`item ${it.id || "?"}.${f} must be a non-empty string`);
    }
    if (it.url !== null && typeof it.url !== "string") errors.push(`item ${it.id}.url must be a string or null`);
    if (typeof it.needs_confirmation !== "boolean") errors.push(`item ${it.id}.needs_confirmation must be a boolean`);
    if (it.url === null && it.needs_confirmation !== true) {
      errors.push(`item ${it.id}: null url requires needs_confirmation: true`);
    }
  }
  const sc = doc.support_center || {};
  if (typeof sc.name !== "string" || !sc.name) errors.push("support_center.name must be a non-empty string");
  if (sc.url !== null && typeof sc.url !== "string") errors.push("support_center.url must be a string or null");
  if (typeof doc.disclaimer !== "string" || !doc.disclaimer) errors.push("disclaimer must be a non-empty string");
  return errors;
}
