// Reference prices from normalised RTMS rows (pure).
//
// Per complex and area bucket (±5 ㎡): median, p25–p75, count, period.
// Rent splits into 전세 (monthly == 0) vs 월세 (monthly > 0), each with
// 보증금 and (for 월세) 월세금 stats. Quantiles are nearest-rank on the
// sorted values — deterministic, no interpolation surprises. Only the
// reference window counts (the 12 months ending at the latest contract
// month in the data, computed per call), and every median ships its
// period, count, floors and bucket centre alongside.

import { RTMS_DISCLAIMER } from "./rtms.js";

export const AREA_BUCKET_TOL_M2 = 5;
export const REFERENCE_WINDOW_MONTHS = 12;

export function quantileSorted(sorted, q) {
  if (!sorted.length) return null;
  const rank = Math.ceil(q * sorted.length) - 1;
  const v = sorted[Math.min(sorted.length - 1, Math.max(0, rank))];
  return v;
}

export function statsOf(values) {
  const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (nums.length === 0) return { count: 0, median: null, p25: null, p75: null };
  return {
    count: nums.length,
    median: quantileSorted(nums, 0.5),
    p25: quantileSorted(nums, 0.25),
    p75: quantileSorted(nums, 0.75),
  };
}

// Latest contract month (yyyymm) in the rows, or null.
export function latestContractYm(rows) {
  let best = null;
  for (const r of rows || []) {
    const ym = String(r.contract_ym || "");
    if (/^\d{6}$/.test(ym) && (best === null || ym > best)) best = ym;
  }
  return best;
}

// yyyymm shifted by months (negative allowed) → yyyymm.
export function shiftYm(ym, months) {
  const y = Math.floor(Number(ym) / 100);
  const m = Number(ym) % 100;
  const total = y * 12 + (m - 1) + months;
  const yy = Math.floor(total / 12);
  const mm = total - yy * 12 + 1;
  return `${yy}${String(mm).padStart(2, "0")}`;
}

// The reference window: the 12 months ending at the latest contract
// month in the data (computed per call, never a fixed constant).
export function referenceWindow(rows, months = REFERENCE_WINDOW_MONTHS) {
  const to = latestContractYm(rows);
  if (!to) return { from: null, to: null };
  return { from: shiftYm(to, -(months - 1)), to };
}

function floorsOf(rows) {
  const fs = (rows || []).map((r) => r.floor).filter((f) => Number.isFinite(f));
  if (fs.length === 0) return { min: null, max: null };
  return { min: Math.min(...fs), max: Math.max(...fs) };
}

// rows: normalised RTMS rows already matched to the complex (PNU + 단지명
// check done by the caller). areaM2 centres the ±5 ㎡ bucket. Only rows
// inside the reference window count; rows without a valid contract
// month are excluded.
export function referencePrice(rows, { areaM2, tolM2 = AREA_BUCKET_TOL_M2 } = {}) {
  const window = referenceWindow(rows);
  const inWindow = (rows || []).filter((r) => {
    const ym = String(r.contract_ym || "");
    return window.to !== null && ym >= window.from && ym <= window.to;
  });
  const inBucket = inWindow.filter((r) =>
    Number.isFinite(r.area_m2) && Number.isFinite(areaM2) && Math.abs(r.area_m2 - areaM2) <= tolM2);
  const trades = inBucket.filter((r) => r.deal === "trade" && Number.isFinite(r.trade_won));
  const rents = inBucket.filter((r) => r.deal === "rent");
  const jeonse = rents.filter((r) => r.rent_kind === "jeonse" || (r.rent_kind === "other" && !(r.monthly_won > 0)));
  const wolse = rents.filter((r) => r.rent_kind === "wolse" || (r.rent_kind === "other" && r.monthly_won > 0));
  return {
    area_m2: areaM2,
    bucket_m2: tolM2,
    disclaimer: RTMS_DISCLAIMER,
    period: window,
    trade: { ...statsOf(trades.map((r) => r.trade_won)), unit: "won",
      period: window, floors: floorsOf(trades), area_bucket_m2: areaM2 },
    jeonse: {
      deposit: { ...statsOf(jeonse.map((r) => r.deposit_won)), unit: "won" },
      count: jeonse.length,
      period: window, floors: floorsOf(jeonse), area_bucket_m2: areaM2,
    },
    wolse: {
      deposit: { ...statsOf(wolse.map((r) => r.deposit_won)), unit: "won" },
      monthly: { ...statsOf(wolse.map((r) => r.monthly_won)), unit: "won" },
      count: wolse.length,
      period: window, floors: floorsOf(wolse), area_bucket_m2: areaM2,
    },
  };
}

// Same-size matching (stage 15.4): keep the home's own area unless a
// real-transaction bucket (a distinct area_m2 in its matched rows) sits
// closer to the anchor within ±tol. Returns {area_m2, area_match} with
// area_match null when the own area is kept.
export function matchAreaBucket(rows, anchorM2, ownM2, tolM2 = AREA_BUCKET_TOL_M2) {
  const areas = [...new Set((rows || []).map((r) => r.area_m2).filter(Number.isFinite))]
    .sort((a, b) => a - b);
  let best = null;
  for (const a of areas) {
    if (best === null || Math.abs(a - anchorM2) < Math.abs(best - anchorM2)
        || (Math.abs(a - anchorM2) === Math.abs(best - anchorM2) && a < best)) best = a;
  }
  if (best !== null && Number.isFinite(anchorM2)
      && Math.abs(best - anchorM2) <= tolM2 && best !== ownM2) {
    return { area_m2: best, area_match: { from: ownM2, to: best, basis: "실거래" } };
  }
  return { area_m2: ownM2, area_match: null };
}

// Filter helper: rows whose complex name matches (loose contains both
// ways — register names carry suffixes) and whose parcel matches the
// complex's building ids when a matcher is supplied.
export function rowsForComplex(rows, { complexName, matchRow = null } = {}) {
  const want = String(complexName || "").replace(/\s+/g, "");
  return (rows || []).filter((r) => {
    const got = String(r.complex || "").replace(/\s+/g, "");
    if (!want || !got) return false;
    if (!(got.includes(want) || want.includes(got))) return false;
    if (matchRow) return matchRow(r);
    return true;
  });
}
