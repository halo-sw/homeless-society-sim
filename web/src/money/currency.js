// Currency-aware money formatting (26c, pure, no DOM).
//
// fmtMoney(value, currency, { monthly }): KRW renders exactly as
// fmtWon; USD renders whole dollars with en-US grouping ("$4,261",
// monthly "월 $4,261"). Null or non-finite renders "—".

import { fmtWon } from "./format.js";

export function fmtMoney(value, currency = "KRW", { monthly = false } = {}) {
  if (value === null || value === undefined) return "—";
  if (currency === "USD") {
    const v = Number(value);
    if (!Number.isFinite(v)) return "—";
    const body = `$${Math.round(Math.abs(v)).toLocaleString("en-US")}`;
    return `${v < 0 ? "−" : ""}${monthly ? "월 " : ""}${body}`;
  }
  return fmtWon(value, { monthly });
}

// currencyOf(candidateOrProfile): reads .currency (a string on a
// candidate row, or a profile field { value }). Defaults to "KRW".
export function currencyOf(candidateOrProfile) {
  const c = candidateOrProfile ? candidateOrProfile.currency : null;
  if (typeof c === "string") return c;
  if (c && typeof c.value === "string") return c.value;
  return "KRW";
}
