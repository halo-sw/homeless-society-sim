// Guided intake (13, Part 2). After the first message the agent runs
// six inline answer cards inside the chat — chips, steppers, range
// sliders and a place picker. Pure state machine; the JSX lives in
// ui/intake.jsx. Tested in intake-13.test.js.
import { fmtWon } from "./money/format.js";
import { TENURE_KO } from "./profile.js";

export const INTAKE_STEPS = [
  "income", // 연봉 (세후 월급 or 연봉)
  "current", // 지금 사는 곳
  "areas", // 이사 희망 지역 (multi-select 11 areas + 상관없음)
  "living", // 평균 생활비 (월)
  "commute", // 통근 가능 범위 (최대 분, 수단)
  "budget", // 원하는 가격 범위 (월세/전세/매매, 아직 모름)
];

export const INTAKE_KO = {
  income: "연봉",
  current: "지금 사는 곳",
  areas: "이사 희망 지역",
  living: "평균 생활비",
  commute: "통근 가능 범위",
  budget: "원하는 가격 범위",
};

export const SAID_VALUE_BADGE = "내가 말한 값";

// The 11 areas the search covers (9 regions + 2 place aliases kept
// for the picker; "anywhere" = 상관없음).
export const INTAKE_AREAS = [
  { id: "seongdong", label: "서울 성동구" },
  { id: "songpa-gu", label: "서울 송파구" },
  { id: "gangnam", label: "서울 강남구" },
  { id: "gangdong", label: "서울 강동구" },
  { id: "bundang", label: "성남 분당구" },
  { id: "sujeong", label: "성남 수정구" },
  { id: "jungwon", label: "성남 중원구" },
  { id: "suji", label: "용인 수지구" },
  { id: "wirye", label: "위례" },
  { id: "pangyo", label: "판교", aliasOf: "bundang" },
  { id: "hanam-wirye", label: "하남 위례", aliasOf: "wirye" },
];

export const COMMUTE_MODES = [
  { id: "transit", label: "지하철·버스" },
  { id: "walk", label: "도보" },
  { id: "bike", label: "자전거" },
  { id: "car", label: "자동차" },
  { id: "any", label: "상관없음" },
];

export function intakeState0() {
  return {
    stepIndex: 0,
    values: {}, // step -> value (see below)
    said: {}, // step -> true when pre-filled from the first message
    skipped: [], // steps the user skipped with 나중에
    done: false,
  };
}

export function currentStep(state) {
  if (!state || state.done) return null;
  return INTAKE_STEPS[state.stepIndex] || null;
}

// Values found in the first message are pre-filled and marked
// SAID_VALUE_BADGE. extract is the profile.js extract_profile result
// ({profile} with {value, source} fields).
export function prefillFromExtract(state, extract) {
  const next = {
    ...state,
    values: { ...state.values },
    said: { ...state.said },
  };
  const profile = (extract && extract.profile) || {};
  const take = (key) => {
    const f = profile[key];
    return f && f.value !== null && f.value !== undefined ? f.value : null;
  };
  const salary = take("salaryAnnual") ?? take("takehomeMonthly");
  if (salary !== null) {
    next.values.income = profile.salaryAnnual && profile.salaryAnnual.value !== null
      ? { kind: "annual", amount: profile.salaryAnnual.value }
      : { kind: "monthly", amount: profile.takehomeMonthly.value };
    next.said.income = true;
  }
  const current = take("currentHome");
  if (current) {
    next.values.current = current;
    next.said.current = true;
  }
  const regions = take("regions");
  if (Array.isArray(regions) && regions.length > 0) {
    next.values.areas = regions;
    next.said.areas = true;
  }
  const living = take("livingMonthly");
  if (living !== null) {
    next.values.living = living;
    next.said.living = true;
  }
  const commuteMax = take("commuteMax");
  if (commuteMax !== null) {
    next.values.commute = { maxMin: commuteMax, mode: "transit" };
    next.said.commute = true;
  }
  const tenure = take("tenure");
  const depositMax = take("depositMax");
  const monthlyMax = take("monthlyMax");
  const priceMax = take("priceMax");
  if (tenure || depositMax !== null || monthlyMax !== null || priceMax !== null) {
    next.values.budget = {
      tenure: tenure || "undecided",
      depositMax, monthlyMax, priceMax,
      unknown: false,
    };
    next.said.budget = true;
  }
  // 18: never ask what the customer already said — start past every
  // pre-filled step (done when nothing is left).
  let i = 0;
  while (i < INTAKE_STEPS.length
    && (next.values[INTAKE_STEPS[i]] !== undefined
      || next.skipped.includes(INTAKE_STEPS[i]))) i++;
  next.stepIndex = Math.min(i, INTAKE_STEPS.length - 1);
  next.done = INTAKE_STEPS.every(
    (s) => next.values[s] !== undefined || next.skipped.includes(s),
  );
  return next;
}

export function answerStep(state, step, value, said = false) {
  if (!INTAKE_STEPS.includes(step)) return state;
  const idx = INTAKE_STEPS.indexOf(step);
  const next = {
    ...state,
    values: { ...state.values, [step]: value },
    said: { ...state.said },
    skipped: state.skipped.filter((s) => s !== step),
  };
  if (said) next.said[step] = true;
  else delete next.said[step];
  // Advance past answered steps.
  let i = Math.max(state.stepIndex, idx + 1);
  while (i < INTAKE_STEPS.length && next.values[INTAKE_STEPS[i]] !== undefined) i++;
  next.stepIndex = Math.min(i, INTAKE_STEPS.length - 1);
  next.done = INTAKE_STEPS.every(
    (s) => next.values[s] !== undefined || next.skipped.includes(s),
  );
  if (next.done) next.stepIndex = INTAKE_STEPS.length - 1;
  return next;
}

export function skipStep(state, step) {
  if (!INTAKE_STEPS.includes(step)) return state;
  if (state.values[step] !== undefined) return state;
  const next = {
    ...state,
    values: { ...state.values },
    said: { ...state.said },
    skipped: state.skipped.includes(step) ? state.skipped : [...state.skipped, step],
  };
  let i = state.stepIndex + 1;
  while (i < INTAKE_STEPS.length
    && (next.values[INTAKE_STEPS[i]] !== undefined || next.skipped.includes(INTAKE_STEPS[i]))) i++;
  next.stepIndex = Math.min(i, INTAKE_STEPS.length - 1);
  next.done = INTAKE_STEPS.every(
    (s) => next.values[s] !== undefined || next.skipped.includes(s),
  );
  return next;
}

// Skipped essentials stay as chips on the profile card.
export function skippedChips(state) {
  return (state.skipped || []).map((s) => ({
    step: s,
    label: `${INTAKE_KO[s]} 정하기`,
  }));
}

// --- 18: say what the sentence already gave --------------------------------------
// intakeTookLine lists every extracted value (연봉, 모은 돈, 출근지,
// 보증금 상한, 크기, 인원) so the customer sees nothing is asked twice.
export function intakeTookLine(profile) {
  const v = (k) => (profile && profile[k] ? profile[k].value : null);
  // Null/blank values never reach the sentence: Number(null) is 0, so
  // an unguarded isFinite check prints "null㎡" / "null분".
  const numVal = (x) => {
    const n = Array.isArray(x) ? x[0] : x;
    if (n === null || n === undefined || n === "") return null;
    const asNum = Number(n);
    return Number.isFinite(asNum) ? asNum : null;
  };
  const bits = [];
  const members = v("members");
  if (Array.isArray(members) && members.length > 0) bits.push(`${members.length}인`);
  const wps = v("workplaces");
  if (Array.isArray(wps) && wps.length > 0 && wps[0]) {
    const where = (wps[0].resolved && wps[0].resolved.station) || wps[0].text;
    if (where) bits.push(`${where} 출근`);
  }
  const salary = numVal(v("salaryAnnual"));
  if (salary !== null) {
    bits.push(`연봉 ${fmtWon(salary)}`);
  }
  const takehome = numVal(v("takehomeMonthly"));
  if (takehome !== null && salary === null) {
    bits.push(`월 실수령 ${fmtWon(takehome)}`);
  }
  const cash = numVal(v("cash"));
  if (cash !== null && cash > 0) bits.push(`모은 돈 ${fmtWon(cash)}`);
  const tenure = v("tenure");
  if (tenure && TENURE_KO[tenure]) {
    const budget = tenure === "jeonse" ? v("depositMax")
      : tenure === "wolse" ? v("monthlyMax")
        : tenure === "trade" ? v("priceMax") : null;
    bits.push(budget !== null && budget !== undefined
      ? `${TENURE_KO[tenure]} ${fmtWon(budget)} 이하` : TENURE_KO[tenure]);
  }
  const size = numVal(v("sizeMin"));
  if (size !== null) bits.push(`${size}㎡ 이상`);
  const commute = numVal(v("commuteMax"));
  if (commute !== null) bits.push(`출퇴근 ${commute}분 이내`);
  return bits.length > 0 ? `문장에서 가져왔어요: ${bits.join(" · ")}` : "";
}

// householdHint nudges extra-member entry when the sentence named N>1
// people but fewer are added yet (relations are never guessed).
export function householdHint(profile, household) {
  const members = profile && profile.members ? profile.members.value : null;
  const extra = (household && household.members) || [];
  if (!Array.isArray(members) || members.length <= 1) return "";
  const missing = members.length - 1 - extra.length;
  if (missing <= 0) return "";
  return `${members.length}인이라고 하셨어요. 함께 사는 사람 ${missing}명을 아래에서 추가해 주세요.`;
}

// --- household ---------------------------------------------------------------
// "+ 함께 사는 사람" adds up to 4 members. Each: relation, age band,
// workplace (place picker or 모름), income (optional), commute
// tolerance. Members feed scenarioFromProfile (multi-member engine).

export const HOUSEHOLD_MAX = 4;

export const RELATIONS = ["배우자", "자녀", "부모", "형제자매", "동거인", "기타"];
export const AGE_BANDS = ["미취학", "초등", "중·고등", "20대", "30대", "40대", "50대", "60대 이상"];

export function household0() {
  return { members: [] };
}

export function addMember(hh, member) {
  const list = (hh && hh.members) || [];
  if (list.length >= HOUSEHOLD_MAX) {
    return { ok: false, household: hh, error: `함께 사는 사람은 ${HOUSEHOLD_MAX}명까지 추가할 수 있어요` };
  }
  const clean = {
    relation: member.relation || "동거인",
    ageBand: member.ageBand || "20대",
    workplace: member.workplace || { known: false }, // {known:true, station} | {known:false}
    incomeMonthly: member.incomeMonthly ?? null,
    commuteMax: member.commuteMax ?? null,
  };
  return { ok: true, household: { members: [...list, clean] }, error: null };
}

export function removeMember(hh, index) {
  const list = (hh && hh.members) || [];
  return { members: list.filter((_, i) => i !== index) };
}

// Fold intake + household into profile.js field patches.
export function intakeToProfilePatch(intake, household) {
  const patch = {};
  const v = (intake && intake.values) || {};
  if (v.income) {
    if (v.income.kind === "annual") patch.salaryAnnual = v.income.amount;
    else patch.takehomeMonthly = v.income.amount;
  }
  if (v.current) patch.currentHome = v.current;
  if (v.areas) patch.regions = v.areas;
  if (v.living !== undefined) patch.livingMonthly = v.living;
  if (v.commute) patch.commuteMax = v.commute.maxMin ?? null;
  if (v.budget) {
    if (v.budget.tenure) patch.tenure = v.budget.tenure;
    if (v.budget.depositMax !== undefined && v.budget.depositMax !== null) {
      patch.depositMax = v.budget.depositMax;
    }
    if (v.budget.monthlyMax !== undefined && v.budget.monthlyMax !== null) {
      patch.monthlyMax = v.budget.monthlyMax;
    }
    if (v.budget.priceMax !== undefined && v.budget.priceMax !== null) {
      patch.priceMax = v.budget.priceMax;
    }
  }
  const members = (household && household.members) || [];
  if (members.length > 0) {
    // 18: school-age bands ride the school path (role child), so the
    // engine plans schooldays and the money doc draws school routes.
    const CHILD_BANDS = new Set(["미취학", "초등", "중·고등"]);
    patch.members = [{ role: "self" }, ...members.map((m) => ({
      role: CHILD_BANDS.has(m.ageBand) ? "child" : "member",
      relation: m.relation,
      ageBand: m.ageBand,
      workplace: m.workplace,
      incomeMonthly: m.incomeMonthly,
      commuteMax: m.commuteMax,
    }))];
  }
  return patch;
}
