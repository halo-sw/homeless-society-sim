// Customer priorities ("내 기준", stage 9a Part B): the ONLY weighting of
// homes, and it is the customer's own (pure).
//
// Five groups, each 0–5, no defaults beyond "모두 보통" (3). Each group maps
// to named metrics with units, sources and a comparison direction. The
// comparison view shows every group A vs B(/C) side by side with the
// weights labelled as the customer's ("고객님이 정한 비중").
//
// The one-number weighted view exists only with explicit weights and its
// formula visible — and it still never ranks: homes keep their labels, no
// winner is named, no "추천 집". Safety (치안) is shown side by side but
// NEVER summed into the number: occurrence counts are not a risk score.

export const PRIORITY_GROUPS = [
  { id: "edu", title: "교육", question: "아이 교육이 가장 중요하세요?",
    note: "학교·학원까지의 거리와 개수 (질·성적·학군 순위는 다루지 않음)" },
  { id: "life", title: "두 사람/나의 생활", question: "출퇴근과 저녁 시간, 피로도가 중요하세요?",
    note: "통근·저녁 재택·피로도·주말 외출" },
  { id: "safety", title: "치안", question: "동네 치안 통계를 꼼꼼히 보시겠어요?",
    note: "경찰청 발생 건수 (점수·순위 없음, 한 숫자 합산 제외)" },
  { id: "money", title: "돈", question: "월 주거비와 남는 돈이 가장 중요하세요?",
    note: "월 주거비·부담률·남는 돈" },
  { id: "convenience", title: "생활 편의", question: "장보기·병원·역이 가까워야 하세요?",
    note: "10분 도보 편의시설 수" },
];

export const WEIGHT_MIN = 0;
export const WEIGHT_MAX = 5;
export const WEIGHT_DEFAULT = 3; // 모두 보통
export const WEIGHT_DEFAULT_LABEL = "모두 보통";

// direction: which side reads "more of what the customer wants" when two
// homes are set side by side. "lower" (less time/money/fatigue) or
// "higher" (more home-evening, trips, facilities, remaining money).
// Safety metrics carry direction "none": counts, never better/worse.
export const PRIORITY_METRICS = [
  { id: "edu_nearest_school_min", group: "edu", label: "가장 가까운 학교까지",
    unit: "minutes", source: "graph", direction: "lower" },
  { id: "edu_schools_10min", group: "edu", label: "10분 안 학교 수",
    unit: "count", source: "graph", direction: "higher" },
  { id: "edu_academy_10min", group: "edu", label: "10분 안 학원 수",
    unit: "count", source: "graph", direction: "higher", note: "OSM 기준, 실제보다 적을 수 있음" },
  { id: "life_commute_min", group: "life", label: "하루 통근",
    unit: "minutes", source: "graph+scenario", direction: "lower", note: "승차 시간은 가정값" },
  { id: "life_evening_min", group: "life", label: "저녁 재택",
    unit: "minutes", source: "scenario", direction: "higher" },
  { id: "life_fatigue", group: "life", label: "피로도 30일 평균",
    unit: "index", source: "scenario", direction: "lower", note: "가정 모델" },
  { id: "life_trips", group: "life", label: "주말·여가 외출",
    unit: "count", source: "scenario", direction: "higher" },
  { id: "safety_total", group: "safety", label: "전체 발생 건수",
    unit: "count", source: "police", direction: "none", note: "관할 발생 건수, 위험도 아님" },
  { id: "safety_violent", group: "safety", label: "강력·폭력 발생 건수",
    unit: "count", source: "police", direction: "none", note: "관할 발생 건수, 위험도 아님" },
  { id: "money_housing", group: "money", label: "월 주거비",
    unit: "won_month", source: "rtms", direction: "lower" },
  { id: "money_burden", group: "money", label: "주거비 부담률",
    unit: "ratio", source: "rtms", direction: "lower" },
  { id: "money_remaining", group: "money", label: "남는 돈",
    unit: "won_month", source: "rtms", direction: "higher" },
  { id: "conv_grocery", group: "convenience", label: "10분 안 장보기",
    unit: "count", source: "graph", direction: "higher" },
  { id: "conv_clinic", group: "convenience", label: "10분 안 병원",
    unit: "count", source: "graph", direction: "higher" },
  { id: "conv_station", group: "convenience", label: "10분 안 역",
    unit: "count", source: "graph", direction: "higher" },
];

export const METRIC_BY_ID = new Map(PRIORITY_METRICS.map((m) => [m.id, m]));

export const NUMERIC_GROUPS = ["edu", "life", "money", "convenience"];

export function defaultWeights() {
  return { edu: 3, life: 3, safety: 3, money: 3, convenience: 3 };
}

export function validateWeights(weights) {
  const errors = [];
  if (!weights || typeof weights !== "object" || Array.isArray(weights)) {
    return { ok: false, errors: ["weights must be an object keyed by group id"] };
  }
  const out = {};
  for (const g of PRIORITY_GROUPS) {
    const v = weights[g.id];
    if (v === undefined) {
      errors.push(`weights.${g.id}(${g.title})이 필요합니다 (0–5)`);
      continue;
    }
    if (!Number.isInteger(v) || v < WEIGHT_MIN || v > WEIGHT_MAX) {
      errors.push(`weights.${g.id}(${g.title})는 0–5 정수여야 합니다`);
      continue;
    }
    out[g.id] = v;
  }
  for (const key of Object.keys(weights)) {
    if (!PRIORITY_GROUPS.some((g) => g.id === key)) errors.push(`unknown group ${JSON.stringify(key)}`);
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, weights: out };
}

// The customer's weighted view over pre-assembled per-home metric values.
//
// values: {homeLabel: {metricId: number|null}}. homes keep input order.
// Each numeric metric is min-max normalised across the shown homes (best =
// 1 by its direction, worst = 0, ties and single-home views = 0.5);
// missing values are skipped. Group score = mean of its metrics; the home
// score = Σ w·group / Σ w over NUMERIC_GROUPS with weight > 0.
//
// Safety never enters the sum (see module note). Requires explicit
// weights: {explicit: true} — the UI sets it only when the customer asks
// for the one number; the consult agent via set_priorities.
export function weightedView(values, weights, opts = {}) {
  if (!opts.explicit) {
    return { ok: false, error: "명시적 비중 없이 한 숫자를 내지 않습니다 (먼저 비중을 정해 주세요)" };
  }
  const checked = validateWeights(weights);
  if (!checked.ok) return { ok: false, error: checked.errors.join("; ") };
  const w = checked.weights;
  const labels = Object.keys(values || {});
  if (labels.length === 0) return { ok: false, error: "no homes" };
  const norm = {}; // metricId -> {label: 0..1}
  for (const m of PRIORITY_METRICS) {
    if (m.direction === "none") continue;
    const have = labels
      .map((l) => [l, (values[l] || {})[m.id]])
      .filter(([, v]) => Number.isFinite(v));
    if (have.length === 0) continue;
    const nums = have.map(([, v]) => v);
    const lo = Math.min(...nums);
    const hi = Math.max(...nums);
    norm[m.id] = {};
    for (const [l, v] of have) {
      if (hi === lo) norm[m.id][l] = 0.5;
      else if (m.direction === "lower") norm[m.id][l] = (hi - v) / (hi - lo);
      else norm[m.id][l] = (v - lo) / (hi - lo);
    }
  }
  const homes = {};
  for (const l of labels) {
    const groups = {};
    for (const g of NUMERIC_GROUPS) {
      const ids = PRIORITY_METRICS.filter((m) => m.group === g && norm[m.id] && norm[m.id][l] !== undefined);
      groups[g] = ids.length > 0
        ? ids.reduce((a, m) => a + norm[m.id][l], 0) / ids.length : null;
    }
    const used = NUMERIC_GROUPS.filter((g) => w[g] > 0 && groups[g] !== null);
    const denom = used.reduce((a, g) => a + w[g], 0);
    homes[l] = { groups,
      score: denom > 0 ? used.reduce((a, g) => a + w[g] * groups[g], 0) / denom : null };
  }
  const fmtW = NUMERIC_GROUPS.map((g) => `${g}=${w[g]}`).join(" · ");
  return { ok: true, homes, weights: w,
    formula: `가중치(${fmtW}, 고객님이 정한 비중) × 그룹별 0–1 정규값(보이는 집끼리 최소–최대)의 가중평균. 치안은 합산하지 않음.`,
    note: "고객님이 정한 비중으로만 계산한 참고값입니다. 추천 집이 아닙니다 — 직접 결정하세요." };
}
