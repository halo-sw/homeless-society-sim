// 지원 제도 한눈에: condition-by-condition comparison (pure).
//
// Each programme (scenarios/assumptions/kr-support-programs.json) lists
// its conditions; compareProgram lays the customer's input next to the
// published condition, row by row: 충족 / 미충족 / 확인 필요. A null or
// unconfirmed published value, or a missing customer input, always reads
// 확인 필요 ("공식 확인 필요" on screen). Verified values (from the
// official 주택도시기금 pages, 2026-10-29, with per-condition notes and
// per-programme source_url + as_of) compare for real; the comparison
// still NEVER emits a final eligibility verdict — no "대상입니다"
// anywhere in this module's output (pinned by tests).

export const SUPPORT_COMPARE_RESULTS = ["충족", "미충족", "확인 필요"];
export const SUPPORT_NOTE = "공고 원문에서 조건을 확인해 주세요.";
export const SUPPORT_NEEDS_OFFICIAL = "공식 확인 필요";
export const SUPPORT_NOT_ENTERED = "미입력";

const CONDITION_KINDS = new Set(["max", "min", "equals", "one_of"]);

export function validateSupportPrograms(doc) {
  const errors = [];
  if (!doc || typeof doc !== "object") return ["support file must be an object"];
  if (!Array.isArray(doc.programs) || doc.programs.length === 0) {
    return ["programs needs ≥ 1 entry"];
  }
  for (const p of doc.programs) {
    if (!p || typeof p !== "object") {
      errors.push("each program must be an object");
      continue;
    }
    for (const f of ["id", "name", "org"]) {
      if (typeof p[f] !== "string" || !p[f]) errors.push(`program ${p.id || "?"}.${f} must be a non-empty string`);
    }
    if (!Array.isArray(p.conditions) || p.conditions.length === 0) {
      errors.push(`program ${p.id}.conditions needs ≥ 1 entry`);
    }
    for (const c of p.conditions || []) {
      if (!c || typeof c !== "object") {
        errors.push(`program ${p.id}: each condition must be an object`);
        continue;
      }
      for (const f of ["id", "label", "profile_key"]) {
        if (typeof c[f] !== "string" || !c[f]) errors.push(`program ${p.id} condition ${c.id || "?"}: ${f} must be a non-empty string`);
      }
      if (!CONDITION_KINDS.has(c.kind)) {
        errors.push(`program ${p.id} condition ${c.id}: kind must be max/min/equals/one_of`);
      }
      if (c.kind === "one_of" && c.value !== null && !Array.isArray(c.value)) {
        errors.push(`program ${p.id} condition ${c.id}: one_of value must be an array or null`);
      }
      if (typeof c.needs_confirmation !== "boolean") {
        errors.push(`program ${p.id} condition ${c.id}: needs_confirmation must be a boolean`);
      }
    }
    for (const f of ["rate_range_pct", "limit_won"]) {
      if (p[f] === undefined) errors.push(`program ${p.id}.${f} is required (nulls allowed)`);
    }
    if (p.source_url !== null && p.source_url !== undefined && typeof p.source_url !== "string") {
      errors.push(`program ${p.id}.source_url must be a string or null`);
    }
    if (typeof p.needs_confirmation !== "boolean") {
      errors.push(`program ${p.id}.needs_confirmation must be a boolean`);
    }
  }
  return errors;
}

function fmtVal(value, unit) {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? "예" : "아니요";
  if (Array.isArray(value)) return value.map((v) => String(v)).join(" / ") || null;
  if (Number.isFinite(value)) return unit ? `${value.toLocaleString("ko-KR")}${unit}` : String(value);
  return String(value);
}

function compareOne(condition, input) {
  // Unpublished or unconfirmed rule, or no customer input: cannot judge.
  if (condition.needs_confirmation || condition.value === null || condition.value === undefined) {
    return "확인 필요";
  }
  if (input === null || input === undefined || input === "") return "확인 필요";
  const rule = condition.value;
  switch (condition.kind) {
    case "max":
      return Number(input) <= Number(rule) ? "충족" : "미충족";
    case "min":
      return Number(input) >= Number(rule) ? "충족" : "미충족";
    case "equals":
      return input === rule ? "충족" : "미충족";
    case "one_of":
      return Array.isArray(rule) && rule.includes(input) ? "충족" : "미충족";
    default:
      return "확인 필요";
  }
}

// profile: {age, household_type, married, marriage_years, annual_income_won,
//   assets_won, owns_home, has_newborn, deposit_won, price_won} — any subset;
//   missing keys read 미입력 → 확인 필요.
export function compareProgram(program, profile = {}) {
  const rows = (program.conditions || []).map((c) => {
    const input = profile[c.profile_key];
    const published = (c.needs_confirmation || c.value === null || c.value === undefined)
      ? SUPPORT_NEEDS_OFFICIAL
      : (fmtVal(c.value, c.unit) ?? SUPPORT_NEEDS_OFFICIAL);
    const customer = fmtVal(input, c.unit) ?? SUPPORT_NOT_ENTERED;
    return {
      condition: c.label,
      condition_id: `${program.id}.${c.id}`,
      customer,
      published,
      result: compareOne(c, input),
      // The condition's own exception note (verified file only; shown
      // under the row in plain words on screen).
      note: typeof c.note === "string" && c.note ? c.note : null,
    };
  });
  const rate = program.rate_range_pct || {};
  const rateText = rate.needs_confirmation || (rate.min === null && rate.max === null)
    ? SUPPORT_NEEDS_OFFICIAL
    : `${rate.min ?? "?"} ~ ${rate.max ?? "?"} %`;
  const limit = program.limit_won || {};
  const limitText = limit.needs_confirmation || limit.value === null || limit.value === undefined
    ? SUPPORT_NEEDS_OFFICIAL
    : fmtVal(limit.value, "원");
  return {
    program_id: program.id,
    name: program.name,
    org: program.org,
    rows,
    rate_range: rateText,
    limit: limitText,
    as_of: program.as_of ?? null,
    source_url: program.source_url ?? null,
    source_note: program.source_url ? null : SUPPORT_NEEDS_OFFICIAL,
    note: SUPPORT_NOTE,
  };
}

export function compareAllSupport(doc, profile = {}) {
  return {
    programs: (doc.programs || []).map((p) => compareProgram(p, profile)),
    note: SUPPORT_NOTE,
  };
}
