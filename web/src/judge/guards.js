// Judge guards: the model chooses, it never changes numbers (pure).
//
// checkOutput(shell, output, extra) accepts a model reply or rejects it
// with a fallback cause. Rejection (rule_fallback, logged with the
// rule's reason) happens when:
//   - the key/plan is not among the options ("bad_key"),
//   - a number in either reason matches nothing in the context actually
//     sent to the model ("invented_number"),
//   - a reason mentions price, safety, crime, school quality or health
//     ("forbidden_topic").
// Malformed replies ("bad_json"), token-budget cutoffs ("truncated":
// finish_reason "length" or null content, usage kept) and provider
// failures ("provider_error") also fall back to the rule. Reasons are
// truncated to the schema limits before validation, so the stored text
// is what was checked.
//
// Number fairness: a cited number is accepted when it matches, after
// normal rounding, a number the model actually saw — option minutes
// (exact, 1-decimal, integer-rounded), option distances (exact or
// 10 m-rounded metres, 1–2 decimal km), clock times and day numbers
// from the prompt (current time, trip times, memory times/days, date),
// label digits, and numbers verbatim in the member's role/preferences
// (plus the member label). The home option sends no minutes/distance,
// so its numbers are not citable. Trip minutes/distances and the text
// of remembered reasons are visible but NOT citable — the former
// belong to other legs, the latter is model text, not data. Ordinals
// ("1st", "2번째"), list markers ("1.", "(2)") and Korean counters
// ("1번", "3회") are not data citations and are skipped, as are
// digit-free counters ("한 번") by construction. A 00 clock component
// or day 0 never licenses a bare 0: citing "0분"/"0 m" needs a real
// option, label or profile zero.
//
// Every guard rejection carries a `rejected` audit object
// ({chosen_key|plan, reason_ko, reason_en, offending}) built from the
// parsed fields only — raw provider responses and headers are never
// stored. Transport failures (provider_error, truncated, unparseable
// replies) have no parsed output, so they carry no `rejected`.

import { WEEKEND_HOME } from "../engine/decisions.js";
import { REASON_EN_MAX, REASON_KO_MAX } from "./context.js";

export const FALLBACK_CAUSES = new Set([
  "bad_key", "invented_number", "forbidden_topic", "bad_json", "truncated", "provider_error",
]);

export function truncateReason(text, max) {
  const s = String(text || "");
  return s.length > max ? s.slice(0, max) : s;
}

// Korean substrings (no word boundaries in Korean) and English whole
// words. Place vocabulary (clinic, school, ...) is NOT forbidden —
// only evaluative claims about price, safety, crime, school quality
// and health.
const KO_PATTERNS = [
  // price
  "가격", "요금", "비싸", "비싼", "저렴", "할인", "싼값", "집값", "월세", "전세",
  // safety / crime
  "안전", "위험", "치안", "조심", "무서", "범죄", "도둑", "절도", "강도", "소매치기",
  // school quality
  "학군", "명문", "진학률",
  // health
  "건강", "의료", "치료", "질병", "증상", "처방", "아프",
];

const EN_WORDS = [
  // price
  "price", "prices", "cost", "costs", "expensive", "cheap", "cheaper", "discount",
  // safety / crime
  "safe", "safety", "unsafe", "danger", "dangerous", "crime", "criminal", "theft", "robbery", "thief",
  // school quality
  "school quality", "good school", "top school", "school rating", "school district",
  // health
  "health", "healthy", "medical", "sick", "illness", "disease", "treatment", "symptom",
];

const EN_RES = EN_WORDS.map((w) => ({ w, re: new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i") }));

export function forbiddenTopic(reasonKo, reasonEn) {
  const ko = String(reasonKo || "");
  for (const pat of KO_PATTERNS) {
    if (pat && ko.includes(pat)) return pat;
  }
  const en = String(reasonEn || "");
  for (const { w, re } of EN_RES) {
    if (re.test(en)) return w;
  }
  return null;
}

const NUMBER_RE = /\d+(?:\.\d+)?/g;
const ORDINAL_RE = /^(?:st|nd|rd|th)\b/i;
// A digit run followed immediately by one of these is an ordinal,
// a list marker or a Korean counter — not a data citation.
const KO_COUNTERS = ["번째", "번", "회", "차", "등", "위"];

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;

// Digit runs in a reason that need a context match; ordinals, list
// markers and counters are skipped. matchAll on a fresh pattern (the
// shared NUMBER_RE keeps its state for the simple .match() uses).
function citedNumbers(text) {
  const out = [];
  const s = String(text || "");
  for (const m of s.matchAll(/\d+(?:\.\d+)?/g)) {
    const token = m[0];
    const rest = s.slice(m.index + token.length);
    if (ORDINAL_RE.test(rest)) continue;
    if (KO_COUNTERS.some((c) => rest.startsWith(c))) continue;
    if (!token.includes(".") && (rest.startsWith(".") || rest.startsWith(")"))) continue;
    out.push(token);
  }
  return out;
}

// Every number the model may cite: option minutes, distances, and any
// digits inside option labels (e.g. "슈퍼1", "2호점"). The home option
// is sent without minutes/distance, so only its label digits count.
export function optionNumbers(options) {
  const out = new Set();
  for (const o of options || []) {
    if (o.key !== WEEKEND_HOME) {
      if (Number.isFinite(o.minutes)) out.add(o.minutes);
      if (Number.isFinite(o.distance_m)) out.add(o.distance_m);
    }
    for (const m of String(o.label || "").match(NUMBER_RE) || []) out.add(Number(m));
  }
  return out;
}

function addTimeComponents(out, mins) {
  if (!Number.isFinite(mins)) return;
  // Same split the prompt renders (context.js hhmm): a 00 component
  // contributes nothing, so "10:00" never licenses a bare 0.
  const h = Math.floor(mins / 60);
  const m = Math.floor(mins % 60);
  if (h !== 0) out.add(h);
  if (m !== 0) out.add(m);
}

// Full citable set for one judged decision: rounding-tolerant option
// numbers plus the clock times, day numbers and profile numbers the
// prompt actually shows. scope = {shell, member, agentLabel, date,
// minute, tripsToday, memory}; shell alone suffices for a legacy
// options-only scope.
export function contextNumbers(scope) {
  const out = new Set();
  const shell = scope && (scope.shell || scope);
  const options = (shell && shell.options) || (scope && scope.options) || [];
  for (const o of options) {
    if (o.key !== WEEKEND_HOME) {
      if (Number.isFinite(o.minutes)) {
        out.add(o.minutes);
        out.add(round1(o.minutes));
        out.add(Math.round(o.minutes));
      }
      if (Number.isFinite(o.distance_m)) {
        const m = Math.round(o.distance_m); // as sent: metres round
        out.add(m);
        out.add(Math.round(m / 10) * 10);
        out.add(round1(o.distance_m / 1000));
        out.add(round2(o.distance_m / 1000));
      }
    }
    for (const m of String(o.label || "").match(NUMBER_RE) || []) out.add(Number(m));
  }
  if (!scope || Array.isArray(scope)) return out;
  addTimeComponents(out, scope.minute ?? shell.minute);
  for (const t of scope.tripsToday || []) {
    addTimeComponents(out, t.depart_min);
    addTimeComponents(out, t.arrive_min);
  }
  for (const mem of scope.memory || []) {
    addTimeComponents(out, mem.minute);
    if (Number.isInteger(mem.day) && mem.day !== 0) out.add(mem.day);
  }
  if (Number.isInteger(shell.day) && shell.day !== 0) out.add(shell.day);
  for (const m of String(scope.date || "").match(NUMBER_RE) || []) {
    const n = Number(m); // year, month, day-of-month as shown
    if (n !== 0) out.add(n);
  }
  const member = scope.member || {};
  for (const text of [member.role, member.preferences, scope.agentLabel]) {
    for (const m of String(text || "").match(NUMBER_RE) || []) out.add(Number(m));
  }
  return out;
}

// All cited numbers with no context match, in order, deduplicated.
export function findInventedNumbers(reasonKo, reasonEn, allowed) {
  const bad = [];
  for (const text of [reasonKo, reasonEn]) {
    for (const token of citedNumbers(text)) {
      if (!allowed.has(Number(token)) && !bad.includes(token)) bad.push(token);
    }
  }
  return bad;
}

export function inventedNumber(reasonKo, reasonEn, options) {
  const bad = findInventedNumbers(reasonKo, reasonEn, contextNumbers({ shell: { options } }));
  return bad.length > 0 ? bad[0] : null;
}

function checkPlan(shell, plan) {
  const keys = new Set(shell.options.map((o) => o.key));
  if (!Array.isArray(plan)) return { err: "plan must be an array", offending: [] };
  if (plan.length === 0 || (plan.length === 1 && plan[0] === WEEKEND_HOME)) return null;
  if (plan.length > 3) {
    return { err: "at most 3 activities", offending: plan.slice(3).map((k) => String(k)) };
  }
  const seen = new Set();
  for (const key of plan) {
    if (!keys.has(key)) return { err: `unknown key ${JSON.stringify(key)}`, offending: [String(key)] };
    if (key === WEEKEND_HOME) return { err: '"home" cannot mix with activities', offending: [WEEKEND_HOME] };
    if (seen.has(key)) return { err: `duplicate key ${JSON.stringify(key)}`, offending: [String(key)] };
    seen.add(key);
  }
  return null;
}

function rejectedText(value, max) {
  if (typeof value === "string") return truncateReason(value, max);
  if (value === undefined || value === null) return undefined;
  return truncateReason(String(value), max);
}

// Audit copy of a refused reply: parsed fields only, reasons within
// the schema limits. offending names the tokens that failed the guard.
function buildRejected(output, weekend, offending) {
  const r = {};
  if (weekend) {
    if (Array.isArray(output.plan)) {
      r.plan = output.plan.map((k) => (typeof k === "string" ? k : String(k)));
    }
  } else if (typeof output.chosen_key === "string") {
    r.chosen_key = output.chosen_key;
  }
  const ko = rejectedText(output.reason_ko, REASON_KO_MAX);
  const en = rejectedText(output.reason_en, REASON_EN_MAX);
  if (ko !== undefined) r.reason_ko = ko;
  if (en !== undefined) r.reason_en = en;
  r.offending = [...offending];
  return r;
}

export function checkOutput(shell, output, extra = null) {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return { ok: false, cause: "bad_json", detail: "reply is not an object" };
  }
  const weekend = shell.kind === "weekend_plan";
  const fail = (cause, detail, offending) => ({
    ok: false, cause, detail, offending,
    rejected: buildRejected(output, weekend, offending),
  });
  let chosen_key;
  let plan = null;
  if (weekend) {
    const checked = checkPlan(shell, output.plan);
    if (checked) return fail("bad_key", checked.err, checked.offending);
    plan = output.plan.length === 0 || (output.plan.length === 1 && output.plan[0] === WEEKEND_HOME)
      ? []
      : [...output.plan];
    chosen_key = plan.length === 0 ? WEEKEND_HOME : plan.join("+");
  } else if (typeof output.chosen_key !== "string"
      || !shell.options.some((o) => o.key === output.chosen_key)) {
    const offending = output.chosen_key === undefined
      ? ["(missing)"]
      : [truncateReason(String(output.chosen_key), 60)];
    return fail("bad_key", `unknown key ${JSON.stringify(output.chosen_key)}`, offending);
  } else {
    chosen_key = output.chosen_key;
  }
  if (typeof output.reason_ko !== "string" || typeof output.reason_en !== "string") {
    const fields = [];
    if (typeof output.reason_ko !== "string") fields.push("reason_ko");
    if (typeof output.reason_en !== "string") fields.push("reason_en");
    return fail("bad_json", "reason_ko/reason_en must be strings", fields);
  }
  const reason_ko = truncateReason(output.reason_ko, REASON_KO_MAX);
  const reason_en = truncateReason(output.reason_en, REASON_EN_MAX);
  const badNums = findInventedNumbers(
    reason_ko, reason_en, contextNumbers({ ...(extra || {}), shell }));
  if (badNums.length > 0) {
    return fail("invented_number", `number ${badNums[0]} is not in the sent context`, badNums);
  }
  const badTopic = forbiddenTopic(reason_ko, reason_en);
  if (badTopic !== null) {
    return fail("forbidden_topic", `mentions ${badTopic}`, [badTopic]);
  }
  return { ok: true, chosen_key, plan, reason_ko, reason_en };
}

// The rule's own reasons, logged on fallback (within schema limits).
export function ruleReason(shell) {
  if (shell.kind === "park_or_home" && shell.default_key !== "park") {
    return { reason_ko: "집에서 쉬는 날", reason_en: "Rest day at home" };
  }
  if (shell.kind === "park_or_home") {
    return { reason_ko: "산책 예정일이라 공원으로", reason_en: "Scheduled park day" };
  }
  if (shell.kind === "weekend_plan") {
    return { reason_ko: "가까운 순서대로 계획", reason_en: "Planned nearest-first" };
  }
  return { reason_ko: "가장 가까운 곳으로 결정", reason_en: "Chose the nearest option" };
}
