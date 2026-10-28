// Judge guards: the model chooses, it never changes numbers (pure).
//
// checkOutput(shell, output) accepts a model reply or rejects it with
// a fallback cause. Rejection (rule_fallback, logged with the rule's
// reason) happens when:
//   - the key/plan is not among the options ("bad_key"),
//   - a number in either reason does not appear in the options
//     ("invented_number"),
//   - a reason mentions price, safety, crime, school quality or health
//     ("forbidden_topic").
// Malformed replies ("bad_json") and provider failures
// ("provider_error") also fall back to the rule. Reasons are truncated
// to the schema limits before validation, so the stored text is what
// was checked.

import { WEEKEND_HOME } from "../engine/decisions.js";
import { REASON_EN_MAX, REASON_KO_MAX } from "./context.js";

export const FALLBACK_CAUSES = new Set([
  "bad_key", "invented_number", "forbidden_topic", "bad_json", "provider_error",
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

// Every number the model may cite: option minutes, distances, and any
// digits inside option labels (e.g. "슈퍼1", "2호점").
export function optionNumbers(options) {
  const out = new Set();
  for (const o of options || []) {
    if (Number.isFinite(o.minutes)) out.add(o.minutes);
    if (Number.isFinite(o.distance_m)) out.add(o.distance_m);
    for (const m of String(o.label || "").match(NUMBER_RE) || []) out.add(Number(m));
  }
  return out;
}

export function inventedNumber(reasonKo, reasonEn, options) {
  const allowed = optionNumbers(options);
  for (const text of [reasonKo, reasonEn]) {
    for (const m of String(text || "").match(NUMBER_RE) || []) {
      if (!allowed.has(Number(m))) return m;
    }
  }
  return null;
}

function checkPlan(shell, plan) {
  const keys = new Set(shell.options.map((o) => o.key));
  if (!Array.isArray(plan)) return "plan must be an array";
  if (plan.length === 0 || (plan.length === 1 && plan[0] === WEEKEND_HOME)) return null;
  if (plan.length > 3) return "at most 3 activities";
  const seen = new Set();
  for (const key of plan) {
    if (!keys.has(key)) return `unknown key ${JSON.stringify(key)}`;
    if (key === WEEKEND_HOME) return '"home" cannot mix with activities';
    if (seen.has(key)) return `duplicate key ${JSON.stringify(key)}`;
    seen.add(key);
  }
  return null;
}

export function checkOutput(shell, output) {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return { ok: false, cause: "bad_json", detail: "reply is not an object" };
  }
  const weekend = shell.kind === "weekend_plan";
  let chosen_key;
  let plan = null;
  if (weekend) {
    const err = checkPlan(shell, output.plan);
    if (err) return { ok: false, cause: "bad_key", detail: err };
    plan = output.plan.length === 0 || (output.plan.length === 1 && output.plan[0] === WEEKEND_HOME)
      ? []
      : [...output.plan];
    chosen_key = plan.length === 0 ? WEEKEND_HOME : plan.join("+");
  } else {
    if (typeof output.chosen_key !== "string"
        || !shell.options.some((o) => o.key === output.chosen_key)) {
      return { ok: false, cause: "bad_key", detail: `unknown key ${JSON.stringify(output.chosen_key)}` };
    }
    chosen_key = output.chosen_key;
  }
  if (typeof output.reason_ko !== "string" || typeof output.reason_en !== "string") {
    return { ok: false, cause: "bad_json", detail: "reason_ko/reason_en must be strings" };
  }
  const reason_ko = truncateReason(output.reason_ko, REASON_KO_MAX);
  const reason_en = truncateReason(output.reason_en, REASON_EN_MAX);
  const badNum = inventedNumber(reason_ko, reason_en, shell.options);
  if (badNum !== null) {
    return { ok: false, cause: "invented_number", detail: `number ${badNum} is not in the options` };
  }
  const badTopic = forbiddenTopic(reason_ko, reason_en);
  if (badTopic !== null) {
    return { ok: false, cause: "forbidden_topic", detail: `mentions ${badTopic}` };
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
