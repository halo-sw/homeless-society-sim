// Reference prices from normalised RTMS rows (pure).
//
// Per complex and area bucket (±5 ㎡): median, p25–p75, count, period.
// Rent splits into 전세 (monthly == 0) vs 월세 (monthly > 0), each with
// 보증금 and (for 월세) 월세금 stats. Quantiles are nearest-rank on the
// sorted values — deterministic, no interpolation surprises.

import { RTMS_DISCLAIMER } from "./rtms.js";

export const AREA_BUCKET_TOL_M2 = 5;

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

function periodOf(rows) {
  const yms = rows.map((r) => r.contract_ym).filter(Boolean).sort();
  if (!yms.length) return { from: null, to: null };
  return { from: yms[0], to: yms[yms.length - 1] };
}

// rows: normalised RTMS rows already matched to the complex (PNU + 단지명
// check done by the caller). areaM2 centres the ±5 ㎡ bucket.
export function referencePrice(rows, { areaM2, tolM2 = AREA_BUCKET_TOL_M2 } = {}) {
  const inBucket = (rows || []).filter((r) =>
    Number.isFinite(r.area_m2) && Number.isFinite(areaM2) && Math.abs(r.area_m2 - areaM2) <= tolM2);
  const trades = inBucket.filter((r) => r.deal === "trade" && Number.isFinite(r.trade_won));
  const rents = inBucket.filter((r) => r.deal === "rent");
  const jeonse = rents.filter((r) => r.rent_kind === "jeonse" || (r.rent_kind === "other" && !(r.monthly_won > 0)));
  const wolse = rents.filter((r) => r.rent_kind === "wolse" || (r.rent_kind === "other" && r.monthly_won > 0));
  return {
    area_m2: areaM2,
    bucket_m2: tolM2,
    disclaimer: RTMS_DISCLAIMER,
    period: periodOf(inBucket),
    trade: { ...statsOf(trades.map((r) => r.trade_won)), unit: "won" },
    jeonse: {
      deposit: { ...statsOf(jeonse.map((r) => r.deposit_won)), unit: "won" },
      count: jeonse.length,
    },
    wolse: {
      deposit: { ...statsOf(wolse.map((r) => r.deposit_won)), unit: "won" },
      monthly: { ...statsOf(wolse.map((r) => r.monthly_won)), unit: "won" },
      count: wolse.length,
    },
  };
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
