// Simulation criteria: the single source of every rule the engine uses.
//
// The table lives in scenarios/criteria/kr-default.json (human-readable,
// served to the browser for the 기준 tab); this module imports it and is
// the only place engine constants come from. Engine modules must not hold
// literal defaults — they read them here (module-level for the defaults,
// per-run resolved values via resolveCriteria for overrides).
//
// Precedence for a resolved value: scenario.criteria_overrides (per
// criterion, shown as 고객 입력) > the scenario's own native field
// (workday_minutes, money.assumptions, …) > this file's default.
// Pure: no DOM, no three.js; unit-tested.
//
// NOTE on JSON import: Node ≥ 22 and Vite 6 both accept
// `with { type: "json" }`. If a future toolchain rejects it, the fallback
// is embedding the table here and asserting byte-equality with the file
// in the criteria tests — the tests pin the contract either way.

import CRITERIA_DOC from "../../../scenarios/criteria/kr-default.json" with { type: "json" };

export const CRITERIA_DOC_NAME = "kr-default";

export const CRITERIA_SOURCES = new Set([
  "engine 기본값",
  "고객 입력",
  "데이터: OSM",
  "데이터: 실거래가",
  "데이터: 서울교통공사",
  "가정값",
]);

const ID_RE = /^C-[a-z0-9-]+$/;

function fail(msg) {
  throw new Error(`criteria: ${msg}`);
}

// Full schema check of a criteria document (the shipped file is checked
// once at import; the consult tools and tests reuse this for overrides).
export function validateCriteriaDoc(doc) {
  if (!doc || typeof doc !== "object") fail("document must be an object");
  if (doc.name !== CRITERIA_DOC_NAME) fail(`name wants ${JSON.stringify(CRITERIA_DOC_NAME)}`);
  if (!Number.isInteger(doc.version)) fail("version wants an int");
  if (!Array.isArray(doc.groups) || doc.groups.length === 0) fail("groups needs ≥ 1 group");
  const groupIds = new Set();
  for (const g of doc.groups) {
    if (!g || typeof g.id !== "string" || typeof g.title !== "string") fail("groups need {id, title} strings");
    if (groupIds.has(g.id)) fail(`duplicate group ${JSON.stringify(g.id)}`);
    groupIds.add(g.id);
  }
  if (!Array.isArray(doc.criteria) || doc.criteria.length === 0) fail("criteria needs ≥ 1 entry");
  const ids = new Set();
  for (const c of doc.criteria) {
    if (!c || typeof c !== "object") fail("criterion must be an object");
    if (typeof c.id !== "string" || !ID_RE.test(c.id)) fail(`bad criterion id ${JSON.stringify(c.id)}`);
    if (ids.has(c.id)) fail(`duplicate criterion ${c.id}`);
    ids.add(c.id);
    if (!groupIds.has(c.group)) fail(`${c.id}: unknown group ${JSON.stringify(c.group)}`);
    if (typeof c.title !== "string" || c.title.length === 0) fail(`${c.id}: title wants a non-empty string`);
    if (typeof c.rule !== "string" || c.rule.length === 0) fail(`${c.id}: rule wants a non-empty string`);
    if (!c.values || typeof c.values !== "object" || Array.isArray(c.values)) fail(`${c.id}: values wants an object`);
    for (const [key, v] of Object.entries(c.values)) {
      if (!v || typeof v !== "object") fail(`${c.id}.${key}: wants {value, unit, overridable}`);
      if (typeof v.unit !== "string" || v.unit.length === 0) fail(`${c.id}.${key}: unit wants a non-empty string`);
      if (typeof v.overridable !== "boolean") fail(`${c.id}.${key}: overridable wants a bool`);
      const val = v.value;
      const okVal = Number.isFinite(val) || typeof val === "string" || Array.isArray(val);
      if (!okVal) fail(`${c.id}.${key}: value wants a number, string or array`);
      if (v.overridable && !Number.isFinite(val)) {
        fail(`${c.id}.${key}: only numeric values are overridable`);
      }
    }
    if (!CRITERIA_SOURCES.has(c.source)) fail(`${c.id}: unknown source ${JSON.stringify(c.source)}`);
    if (!Array.isArray(c.affects) || !c.affects.every((a) => typeof a === "string")) {
      fail(`${c.id}: affects wants an array of strings`);
    }
    if (typeof c.editable !== "boolean") fail(`${c.id}: editable wants a bool`);
  }
  return doc;
}

validateCriteriaDoc(CRITERIA_DOC);

export { CRITERIA_DOC };
export const CRITERIA_LIST = CRITERIA_DOC.criteria;
export const CRITERIA_GROUPS = CRITERIA_DOC.groups;
export const CRITERIA_BY_ID = new Map(CRITERIA_LIST.map((c) => [c.id, c]));
export const CRITERIA_VERSION = CRITERIA_DOC.version;

// 13e4: customer-facing chip label for a criterion id — the Korean
// title from the same table the 기준 tab renders. Unknown ids fall
// back to the id itself (callers keep it in a `title` attribute).
export function criterionTitle(id) {
  const c = CRITERIA_BY_ID.get(id);
  return (c && c.title) || id;
}

// Engine-consumed values: criterion id -> { jsonKey: flatName }.
// Every entry must exist in the JSON (checked at import, so the file and
// the engine can never drift); every overridable JSON value must be
// mapped (an override that changes nothing would be a lie).
const FLAT_MAP = {
  "C-walk-speed": { adult_mps: "adult_mps", slow_mps: "slow_mps" },
  "C-commute-depart": {
    morning_anchor_min: "morning_anchor_min",
    school_anchor_min: "school_anchor_min",
    jitter_min: "jitter_min",
    jitter_max: "jitter_max",
  },
  "C-work-hours": { workday_minutes: "workday_minutes", schoolday_minutes: "schoolday_minutes" },
  "C-station-route": { tolerance_ratio: "station_tolerance" },
  "C-journey-path": { transfer_penalty_km: "journey_transfer_penalty_km" },
  "C-ride-split": { transfer_walk_min: "ride_transfer_min" },
  "C-walk-commute-max": { max_min: "walk_commute_max_min" },
  "C-congestion": { fallback_pct: "congestion_fallback_pct" },
  "C-fatigue-load": {
    walk_per_min: "fatigue_walk_per_min",
    ride_seated_per_min: "fatigue_ride_seated_per_min",
    ride_stand_per_min: "fatigue_ride_stand_per_min",
    crowd_extra_per_min: "fatigue_crowd_extra_per_min",
    per_transfer: "fatigue_per_transfer",
    wait_per_min: "fatigue_wait_per_min",
  },
  "C-fatigue-recovery": {
    home_per_min: "fatigue_home_per_min",
    seated_stay_per_min: "fatigue_seated_per_min",
    overnight_base: "fatigue_overnight_base",
  },
  "C-shop-dwell": { dwell_min: "shop_dwell_min" },
  "C-park-dwell": { dwell_min: "park_dwell_min" },
  "C-clinic-dwell": { dwell_min: "clinic_dwell_min" },
  "C-daily-rhythm": {
    midday_anchor_min: "midday_anchor_min",
    evening_anchor_min: "evening_anchor_min",
    after_gap_min: "after_gap_min",
  },
  "C-weekend-plan": { max_activities: "weekend_max" },
  "C-neighbour": {
    anchor_max_m: "anchor_max_m",
    commuter_p: "commuter_p",
    adult_p: "bg_adult_p",
    senior_p: "bg_senior_p",
    bg_supermarket_min: "bg_supermarket_min",
    bg_supermarket_max: "bg_supermarket_max",
    bg_convenience_max: "bg_convenience_max",
    bg_park_max: "bg_park_max",
    bg_clinic_max: "bg_clinic_max",
  },
  "C-measure-evening": { evening_start_min: "evening_start_min", day_end_min: "day_end_min" },
  "C-convenience-radius": { walk_minutes: "convenience_minutes" },
  "C-money-fare": { fare_won: "fare_won" },
  "C-money-basket": { basket_won: "basket_won" },
  "C-money-fixed": {
    maintenance_won: "maintenance_won",
    other_fixed_won: "other_fixed_won",
    due_day_1based: "due_day_1based",
    pay_day: "pay_day",
    loan_rate_pct: "loan_rate_pct",
    loan_years: "loan_years",
  },
  "C-burden-rule": { threshold_pct: "burden_threshold_pct" },
  "C-jeonse-ratio-caution": { threshold_pct: "jeonse_caution_pct" },
  "C-jeonse-ratio-warning": { threshold_pct: "jeonse_warning_pct" },
  "C-mockloss": {
    insured_recovery_months: "mockloss_insured_months",
    insured_recovery_pct: "mockloss_insured_pct",
    auction_recovery_months: "mockloss_auction_months",
    auction_recovery_pct: "mockloss_auction_pct",
    unrecovered_recovery_pct: "mockloss_unrecovered_pct",
  },
};

function defaultValue(id, key) {
  const c = CRITERIA_BY_ID.get(id);
  const v = c && c.values[key];
  if (!v) fail(`engine wants unknown value ${id}.${key} — add it to ${CRITERIA_DOC_NAME}.json`);
  return v.value;
}

// One default for engine module-level constants (they alias this, never
// literals). Per-run code uses resolveCriteria(scenario).flat instead.
export function criterionDefault(id, key) {
  return defaultValue(id, key);
}

// Import-time drift guard: every mapped value exists in the JSON, and
// every overridable JSON value is mapped (else an override would be
// silently ignored).
for (const [id, keys] of Object.entries(FLAT_MAP)) {
  for (const key of Object.keys(keys)) defaultValue(id, key);
}
for (const c of CRITERIA_LIST) {
  for (const [key, v] of Object.entries(c.values)) {
    if (v.overridable && !(FLAT_MAP[c.id] && FLAT_MAP[c.id][key])) {
      fail(`overridable value ${c.id}.${key} is not engine-mapped — overrides would be ignored`);
    }
  }
}

// Default flat values (no scenario, no overrides). Engine module-level
// constants alias these — never literals.
export function defaultFlat() {
  const flat = {};
  for (const [id, keys] of Object.entries(FLAT_MAP)) {
    for (const [key, name] of Object.entries(keys)) flat[name] = defaultValue(id, key);
  }
  return flat;
}

const DEFAULT_FLAT = defaultFlat();

// Native scenario fields that double as criterion values (the scenario
// file's own numbers win over the JSON defaults; explicit ones read as
// 고객 입력). [flatName, scenarioPath...]
function nativeValue(scenario, flatName) {
  const money = (scenario.money && scenario.money.assumptions) || {};
  switch (flatName) {
    case "workday_minutes": return scenario.workday_minutes;
    case "schoolday_minutes": return scenario.schoolday_minutes;
    case "fare_won": return money.transit_fare_won;
    case "basket_won": return money.basket_won;
    case "maintenance_won": return money.maintenance_won_month;
    case "other_fixed_won": return money.other_fixed_won_month;
    case "due_day_1based": return money.fixed_due_day_1based;
    case "pay_day": return money.pay_day_of_month;
    case "loan_rate_pct": return money.loan_rate_pct;
    case "loan_years": return money.loan_years;
    case "burden_threshold_pct":
      return scenario.money ? scenario.money.burden_threshold_pct : undefined;
    default: return undefined;
  }
}

function isExplicit(scenario, flatName) {
  const ex = (scenario && scenario._explicit) || {};
  switch (flatName) {
    case "workday_minutes": return ex.workday_minutes === true;
    case "schoolday_minutes": return ex.schoolday_minutes === true;
    case "fare_won": return ex.money_transit_fare_won === true;
    case "basket_won": return ex.money_basket_won === true;
    case "maintenance_won": return ex.money_maintenance_won_month === true;
    case "other_fixed_won": return ex.money_other_fixed_won_month === true;
    case "due_day_1based": return ex.money_fixed_due_day_1based === true;
    case "pay_day": return ex.money_pay_day_of_month === true;
    case "loan_rate_pct": return ex.money_loan_rate_pct === true;
    case "loan_years": return ex.money_loan_years === true;
    case "burden_threshold_pct": return ex.money_burden_threshold_pct === true;
    default: return false;
  }
}

// Criterion ids whose native scenario fields were explicitly set (their
// resolved source reads 고객 입력 even without criteria_overrides).
function nativeExplicitIds(scenario) {
  const out = new Set();
  const flatToId = {};
  for (const [id, keys] of Object.entries(FLAT_MAP)) {
    for (const name of Object.values(keys)) flatToId[name] = id;
  }
  for (const name of Object.keys(flatToId)) {
    if (isExplicit(scenario, name)) out.add(flatToId[name]);
  }
  return out;
}

export function validateOverrides(overrides) {
  if (overrides === undefined || overrides === null) return {};
  if (typeof overrides !== "object" || Array.isArray(overrides)) {
    fail("criteria_overrides must be an object keyed by criterion id");
  }
  for (const [id, patch] of Object.entries(overrides)) {
    const c = CRITERIA_BY_ID.get(id);
    if (!c) fail(`criteria_overrides has unknown criterion ${JSON.stringify(id)}`);
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      fail(`criteria_overrides[${id}] must be an object`);
    }
    for (const [key, value] of Object.entries(patch)) {
      const v = c.values[key];
      if (!v) fail(`criteria_overrides[${id}] has unknown value ${JSON.stringify(key)}`);
      if (!v.overridable) fail(`criteria_overrides[${id}].${key} is not overridable`);
      if (!Number.isFinite(value)) fail(`criteria_overrides[${id}].${key} wants a finite number`);
    }
  }
  return overrides;
}

// Resolve every engine value for one parsed scenario:
// { flat, byId, sources, overridden }.
// flat: engine-ready numbers. byId: display rows with resolved values.
// sources: criterion id -> resolved source badge. overridden: sorted ids.
export function resolveCriteria(scenario) {
  const sc = scenario || {};
  const overrides = validateOverrides(sc.criteria_overrides);
  const flat = { ...DEFAULT_FLAT };
  for (const name of Object.keys(flat)) {
    const nv = nativeValue(sc, name);
    if (nv !== undefined) flat[name] = nv;
  }
  const overridden = new Set();
  for (const [id, patch] of Object.entries(overrides)) {
    const mapping = FLAT_MAP[id] || {};
    for (const [key, value] of Object.entries(patch)) {
      const name = mapping[key];
      if (!name) fail(`criteria_overrides[${id}].${key} has no engine mapping`);
      flat[name] = value;
    }
    overridden.add(id);
  }
  const nativeExplicit = nativeExplicitIds(sc);
  const sources = {};
  const byId = {};
  for (const c of CRITERIA_LIST) {
    sources[c.id] = overridden.has(c.id) || nativeExplicit.has(c.id) ? "고객 입력" : c.source;
    const mapping = FLAT_MAP[c.id] || {};
    const values = {};
    for (const [key, v] of Object.entries(c.values)) {
      const name = mapping[key];
      values[key] = { ...v, value: name ? flat[name] : v.value };
    }
    byId[c.id] = {
      id: c.id, group: c.group, title: c.title, rule: c.rule,
      values, source: sources[c.id], affects: [...c.affects], editable: c.editable,
    };
  }
  return { flat, byId, sources, overridden: [...overridden].sort() };
}

// Money-timeline option names from resolved criteria (money.mjs and the
// living_cost tool): criteria_overrides flow into the timelines through
// here, so file and consult runs agree.
export function moneyOptsFromCriteria(resolved) {
  const f = resolved.flat;
  return {
    transit_fare_won: f.fare_won,
    basket_won: f.basket_won,
    maintenance_won_month: f.maintenance_won,
    other_fixed_won_month: f.other_fixed_won,
    pay_day_of_month: f.pay_day,
    fixed_due_day_1based: f.due_day_1based,
    loan_rate_pct: f.loan_rate_pct,
    loan_years: f.loan_years,
    burden_threshold_pct: f.burden_threshold_pct,
  };
}

// One-line display of a criterion's values ("15분", "1.3 m/s · 1.1 m/s").
export function criterionValuesLine(criterion) {
  const bits = [];
  for (const v of Object.values((criterion && criterion.values) || {})) {
    const val = Array.isArray(v.value) ? v.value.join("·") : String(v.value);
    bits.push(v.unit ? `${val} ${v.unit}` : val);
  }
  return bits.join(" · ");
}
