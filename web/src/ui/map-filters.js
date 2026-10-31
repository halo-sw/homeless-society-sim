// Stage 31h — map filter chips + my-location: the pure model.
// mapFilterChips builds the chip row from the profile (labels, set
// flags, menu options); filterPatch turns a picked option into the
// profile patch the intake path merges (applyIntakePatch); a null
// patch value clears its field. locateResult decides whether a
// geolocation fix falls inside the map's current lon/lat extent and
// where it lands in stage px. No DOM, no network, no storage.
import { fmtMoney, currencyOf } from "../money/currency.js";
import { TENURE_KO } from "../profile.js";

// The trade types the search really supports (find_homes runs
// jeonse / wolse / trade; public rentals are not normal homes).
// USD profiles read monthly rent only, so they get no tenure chip.
export const FILTER_TENURES = ["jeonse", "wolse", "trade"];

// Budget scales in profile units (KRW won, USD dollars) — the same
// values the intake budget step writes, passed through unchanged by
// intakeToProfilePatch.
export const BUDGET_SCALES = {
  KRW: {
    jeonse: [100000000, 200000000, 300000000, 400000000, 500000000],
    wolse: [500000, 700000, 1000000, 1500000],
    trade: [300000000, 500000000, 800000000, 1200000000],
  },
  USD: [2500, 3000, 3500, 4000, 4500],
};

export const COMMUTE_OPTIONS = [15, 30, 45, 60];

export const CLEAR_LABEL = "상관없어요";

function tenureOf(profile) {
  return (profile && profile.tenure && profile.tenure.value) || null;
}

function budgetFieldFor(tenure, currency) {
  if (currency === "USD") return "monthlyMax";
  if (tenure === "wolse") return "monthlyMax";
  if (tenure === "trade") return "priceMax";
  return "depositMax";
}

function budgetScaleFor(tenure, currency) {
  if (currency === "USD") return BUDGET_SCALES.USD;
  if (tenure === "wolse") return BUDGET_SCALES.KRW.wolse;
  if (tenure === "trade") return BUDGET_SCALES.KRW.trade;
  return BUDGET_SCALES.KRW.jeonse;
}

// fmtMoney carries the app's " 원" suffix (fmtWon); chips read
// "3억 이하", so the suffix goes before it.
export function budgetLabel(value, currency, { monthly = false } = {}) {
  return `${fmtMoney(value, currency, { monthly }).replace(/ 원$/, "")} 이하`;
}

function profileVal(profile, key) {
  const f = profile ? profile[key] : null;
  return f ? f.value : null;
}

function isSet(v) {
  if (v === null || v === undefined || v === "") return false;
  if (typeof v === "number") return Number.isFinite(v);
  return true;
}

// mapFilterChips(profile, { currency, kindsAvailable }) → chips with
// { key, label, set, options: [{ value, label, selected }] }.
export function mapFilterChips(profile, { currency, kindsAvailable } = {}) {
  const cur = currency || currencyOf(profile || {});
  const tenure = tenureOf(profile);
  const chips = [];
  if (cur !== "USD") {
    const set = FILTER_TENURES.includes(tenure);
    chips.push({
      key: "tenure",
      label: set ? TENURE_KO[tenure] : "거래 방식",
      set,
      options: FILTER_TENURES.map((t) => ({
        value: t, label: TENURE_KO[t], selected: tenure === t,
      })),
    });
  }
  // The budget cap for the current trade type (an undecided tenure
  // shows whichever cap is set; the options follow the jeonse scale).
  const fields = cur === "USD" ? ["monthlyMax"]
    : tenure === "wolse" ? ["monthlyMax"]
      : tenure === "trade" ? ["priceMax"]
        : tenure === "jeonse" ? ["depositMax"]
          : ["depositMax", "monthlyMax", "priceMax"];
  let shownField = null;
  let shownVal = null;
  for (const f of fields) {
    const v = profileVal(profile, f);
    if (isSet(v)) { shownField = f; shownVal = v; break; }
  }
  const optField = budgetFieldFor(tenure, cur);
  const optMonthly = optField === "monthlyMax" && cur !== "USD";
  const scale = budgetScaleFor(tenure, cur);
  chips.push({
    key: "budget",
    label: shownVal !== null
      ? budgetLabel(shownVal, cur, { monthly: shownField === "monthlyMax" && cur !== "USD" })
      : "예산",
    set: shownVal !== null,
    options: scale.map((v) => ({
      value: v, label: budgetLabel(v, cur, { monthly: optMonthly }),
      selected: v === shownVal,
    })),
  });
  const cm = profileVal(profile, "commuteMax");
  const cmSet = isSet(cm) && Number.isFinite(Number(cm));
  chips.push({
    key: "commute",
    label: cmSet ? `출근 ${Math.round(Number(cm))}분 이내` : "출근 시간",
    set: cmSet,
    options: [
      ...COMMUTE_OPTIONS.map((m) => ({
        value: m, label: `${m}분 이내`, selected: cmSet && Number(cm) === m,
      })),
      { value: null, label: CLEAR_LABEL, selected: false },
    ],
  });
  // Home kinds only exist as options when the current candidates
  // carry them; the profile's own home_kinds mark the selection.
  const kinds = Array.isArray(kindsAvailable) ? kindsAvailable.filter(Boolean) : [];
  if (kinds.length > 0) {
    const raw = profileVal(profile, "home_kinds");
    const wants = (Array.isArray(raw) ? raw : []).filter(Boolean);
    chips.push({
      key: "kind",
      label: wants.length > 0 ? wants.join("·") : "집 종류",
      set: wants.length > 0,
      options: kinds.map((k) => ({
        value: k, label: k, selected: wants.includes(k),
      })),
    });
  }
  return chips;
}

// filterPatch(key, option, profile) → the profile patch for the
// intake path. A null option (출근 상관없어요) clears its field.
export function filterPatch(key, option, profile) {
  const cur = currencyOf(profile || {});
  const tenure = tenureOf(profile);
  if (key === "tenure") return { tenure: option };
  if (key === "budget") return { [budgetFieldFor(tenure, cur)]: option };
  if (key === "commute") return { commuteMax: option };
  if (key === "kind") {
    return { home_kinds: option === null || option === undefined ? null : [option] };
  }
  return {};
}

// locateResult(position, extent) → { inside, x, y }. position is a
// GeolocationPosition; extent is the map's current lon/lat extent
// ({ minLon, minLat, maxLon, maxLat, W, H }). Inside, x/y land in
// stage px; outside, x/y are null.
export function locateResult(position, extent) {
  const coords = (position && position.coords) || {};
  const lat = Number(coords.latitude);
  const lon = Number(coords.longitude);
  const e = extent || {};
  const W = Number(e.W);
  const H = Number(e.H);
  const spanLon = Number(e.maxLon) - Number(e.minLon);
  const spanLat = Number(e.maxLat) - Number(e.minLat);
  const inside = Number.isFinite(lat) && Number.isFinite(lon)
    && Number.isFinite(spanLon) && Number.isFinite(spanLat)
    && spanLon > 0 && spanLat > 0
    && lon >= e.minLon && lon <= e.maxLon
    && lat >= e.minLat && lat <= e.maxLat;
  if (!inside) return { inside: false, x: null, y: null };
  return {
    inside: true,
    x: ((lon - e.minLon) / spanLon) * W,
    y: ((e.maxLat - lat) / spanLat) * H,
  };
}
