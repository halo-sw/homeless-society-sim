// Stage 16a part 3: deterministic claim checks (pure, no DOM / network).
//
// For verify:"deterministic" items with engine supported|partial, a
// report claim's value is recomputed from the run and compared within
// the item's rule tolerance. A sentence whose text carries numbers but
// has no claim fails as "근거 없는 숫자". Number extraction is imported
// from the judge guards (not copied): ordinals, list markers and Korean
// counters are skipped there.
//
// Engine values (all from the run, except C02 which sums the report
// home's listing fields — the run carries no money):
//   C01       mean minutes of purpose=commute trips (all members)
//   N01       mean minutes of purpose=commute trips for claim.member
//   C05/F01/F03/P02/F05/M02  mean minutes of purpose=errand/school/park/park/clinic/clinic
//   C02       home.monthly_won + maintenance_won_month + utilities_won_month
// Items with engine:"none" are never checked here (미지원, handled by
// loop.js) — never failed, never passed.

import { findInventedNumbers } from "../judge/guards.js";

export const MINUTE_TOLERANCE = {
  C01: 5, N01: 5, C05: 2, F01: 2, F03: 2, P02: 2, F05: 3, M02: 3,
};

const ITEM_PURPOSE = {
  C01: "commute", N01: "commute", C05: "errand", F01: "school",
  F03: "park", P02: "park", F05: "clinic", M02: "clinic",
};

const round1 = (n) => Math.round(n * 10) / 10;
const fmtWon = (n) => Number(n).toLocaleString("ko-KR");

export function meanMinutes(trips, purpose, member = null) {
  const mins = (trips || [])
    .filter((t) => t && t.purpose === purpose
      && (member === null || t.agent === member)
      && Number.isFinite(t.minutes))
    .map((t) => t.minutes);
  if (mins.length === 0) return null;
  return round1(mins.reduce((a, b) => a + b, 0) / mins.length);
}

export function monthlyTotal(home) {
  if (!home || typeof home !== "object") return null;
  const parts = ["monthly_won", "maintenance_won_month", "utilities_won_month"]
    .map((f) => Number(home[f]))
    .filter((n) => Number.isFinite(n));
  if (parts.length === 0) return null;
  return Math.round(parts.reduce((a, b) => a + b, 0));
}

// Engine value for one deterministic item, or null when the run/home
// has nothing to check against. Returns { value, unit }.
export function engineValue(itemId, run, opts = {}) {
  const { member = null, home = null } = opts;
  if (itemId === "C02") {
    const total = monthlyTotal(home);
    return total === null ? null : { value: total, unit: "원" };
  }
  const purpose = ITEM_PURPOSE[itemId];
  if (!purpose) return null;
  const mean = meanMinutes(run && run.trips, purpose,
    itemId === "N01" ? member : null);
  return mean === null ? null : { value: mean, unit: "분" };
}

// Every number cited in the text (via the judge guards' extraction).
export function textNumbers(textKo) {
  return findInventedNumbers(textKo, "", new Set());
}

// Check every deterministic, engine-backed sentence of the report.
// `loaded` is loadGroundTruth's return ({ items }). Returns { failures }
// with failures of { sentence_id, item_id, kind: "number", reason_ko }.
export function checkNumberClaims(report, run, loaded) {
  const failures = [];
  const byId = new Map((loaded.items || []).map((it) => [it.id, it]));
  for (const s of (report && report.sentences) || []) {
    const item = byId.get(s.item_id);
    if (!item) {
      failures.push({ sentence_id: s.id, item_id: s.item_id, kind: "number",
        reason_ko: `알 수 없는 항목 ${s.item_id}예요` });
      continue;
    }
    if (item.engine === "none" || item.verify !== "deterministic") continue;
    const claims = s.claims || [];
    if (claims.length === 0 && textNumbers(s.text_ko).length > 0) {
      failures.push({ sentence_id: s.id, item_id: s.item_id, kind: "number",
        reason_ko: "근거 없는 숫자" });
      continue;
    }
    for (const claim of claims) {
      if (item.id === "N01" && (claim.member === undefined || claim.member === null)) {
        failures.push({ sentence_id: s.id, item_id: s.item_id, kind: "number",
          reason_ko: "두 사람의 통근 시간은 구성원별(member)로 보고해야 해요" });
        continue;
      }
      const engine = engineValue(item.id, run,
        { member: claim.member ?? null, home: report.home });
      if (!engine) {
        failures.push({ sentence_id: s.id, item_id: s.item_id, kind: "number",
          reason_ko: "엔진 기록으로 확인할 수 없어요" });
        continue;
      }
      if (item.id === "C02") {
        if (Number(claim.value) !== engine.value) {
          failures.push({ sentence_id: s.id, item_id: s.item_id, kind: "number",
            reason_ko: `보고한 ${fmtWon(claim.value)}원이 계산 ${fmtWon(engine.value)}원과 달라요` });
        }
        continue;
      }
      const tol = MINUTE_TOLERANCE[item.id] ?? 0;
      if (Math.abs(Number(claim.value) - engine.value) > tol + 1e-9) {
        failures.push({ sentence_id: s.id, item_id: s.item_id, kind: "number",
          reason_ko: `보고한 ${claim.value}분이 엔진 계산 ${engine.value}분과 달라요 (허용 ±${tol}분)` });
      }
    }
  }
  return { failures };
}
