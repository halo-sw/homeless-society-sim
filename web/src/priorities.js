// Customer priorities ("내 기준", stage 9a Part B): the ONLY weighting of
// homes, and it is the customer's own (pure).
//
// Five groups, each 0–5, no defaults beyond "모두 보통" (3). Each group maps
// to named metrics with units, sources and a comparison direction. The
// comparison view shows every group A vs B(/C) side by side with the
// weights labelled as the customer's ("고객님이 정한 비중").
//
// The one-number weighted view ("내 기준 점수", stage 17) is always shown
// with its basis labelled — the customer's explicit weights (basis
// "customer") or 모두 보통 until they set them (basis "default") — and
// its formula visible. It still never ranks: homes keep their labels, no
// winner is named, no "추천 집". Safety (치안) is shown side by side but
// NEVER summed into the number: occurrence counts are not a risk score.

export const PRIORITY_GROUPS = [
  { id: "edu", title: "교육", question: "아이 교육이 가장 중요하세요?",
    note: "학교·학원까지의 거리와 개수 (질·성적·학군 순위는 다루지 않음)" },
  { id: "life", title: "두 사람/나의 생활", question: "출퇴근과 저녁 시간, 피곤한 정도가 중요하세요?",
    note: "출퇴근 시간·저녁에 집에 머무는 시간·피곤한 정도·주말 외출" },
  { id: "safety", title: "치안", question: "동네 치안 통계를 꼼꼼히 보시겠어요?",
    note: "경찰청 발생 건수 (점수·순위 없음, 한 숫자 합산 제외)" },
  { id: "money", title: "돈", question: "매달 집에 드는 돈과 집값과 생활비를 내고 남는 돈이 가장 중요하세요?",
    note: "매달 집에 드는 돈·월급에서 집에 나가는 비율·집값과 생활비를 내고 남는 돈" },
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
  { id: "edu_nearest_school_min", group: "edu", label: "가장 가까운 학교까지 걸어서",
    unit: "minutes", source: "graph", direction: "lower" },
  { id: "edu_schools_10min", group: "edu", label: "걸어서 10분 안 학교 수",
    unit: "count", source: "graph", direction: "higher" },
  { id: "edu_academy_10min", group: "edu", label: "걸어서 10분 안 학원 수",
    unit: "count", source: "graph", direction: "higher", note: "OSM 기준, 실제보다 적을 수 있어요" },
  { id: "life_commute_min", group: "life", label: "하루 출퇴근에 쓰는 시간",
    unit: "minutes", source: "graph+scenario", direction: "lower", note: "차·지하철을 탄 시간은 정해 둔 값이에요" },
  { id: "life_evening_min", group: "life", label: "저녁에 집에서 보내는 시간",
    unit: "minutes", source: "scenario", direction: "higher" },
  { id: "life_fatigue", group: "life", label: "30일 평균 피곤한 정도",
    unit: "index", source: "scenario", direction: "lower", note: "가정으로 계산한 값이에요" },
  { id: "life_trips", group: "life", label: "주말·여가 외출",
    unit: "count", source: "scenario", direction: "higher" },
  { id: "safety_total", group: "safety", label: "1년 동안 기록된 전체 건수",
    unit: "count", source: "police", direction: "none", note: "관할 발생 건수이며, 사는 사람의 위험도가 아니에요" },
  { id: "safety_violent", group: "safety", label: "1년 동안 기록된 강력·폭력 건수",
    unit: "count", source: "police", direction: "none", note: "관할 발생 건수이며, 사는 사람의 위험도가 아니에요" },
  { id: "money_housing", group: "money", label: "매달 집에 드는 돈",
    unit: "won_month", source: "rtms", direction: "lower" },
  { id: "money_burden", group: "money", label: "월급에서 집에 나가는 비율",
    unit: "ratio", source: "rtms", direction: "lower" },
  { id: "money_remaining", group: "money", label: "집값과 생활비를 내고 남는 돈",
    unit: "won_month", source: "rtms", direction: "higher" },
  { id: "conv_grocery", group: "convenience", label: "걸어서 10분 안 장보기",
    unit: "count", source: "graph", direction: "higher" },
  { id: "conv_clinic", group: "convenience", label: "걸어서 10분 안 병원",
    unit: "count", source: "graph", direction: "higher" },
  { id: "conv_station", group: "convenience", label: "걸어서 10분 안 역",
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
// Safety never enters the sum (see module note). Without explicit
// weights ({explicit: true} from the UI stepper or the consult agent's
// set_priorities) it computes with defaultWeights() and reports
// basis "default" instead of refusing — the caller labels it.
export function weightedView(values, weights, opts = {}) {
  const explicit = !!opts.explicit;
  const basis = explicit ? "customer" : "default";
  const checked = explicit
    ? validateWeights(weights)
    : { ok: true, weights: defaultWeights() };
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
  const formula = explicit
    ? `가중치(${fmtW}, 고객님이 정한 비중) × 그룹별 0–1 정규값(보이는 집끼리 최소–최대)의 가중평균. 치안은 합산하지 않음.`
    : "가중치(모두 보통 3) × 그룹별 0–1 정규값(보이는 집끼리 최소–최대)의 가중평균. 치안은 합산하지 않음.";
  const note = explicit
    ? "고객님이 정한 비중으로만 계산한 참고값입니다. 추천 집이 아닙니다 — 직접 결정하세요."
    : "아직 비중을 안 정해서 모두 보통으로 계산한 참고값입니다. 추천 집이 아닙니다 — 직접 결정하세요.";
  return { ok: true, basis, homes, weights: w, formula, note };
}

// Per-home metric values from the money doc (18: leisure comes from
// each home's embedded run totals, so the score never shifts when
// another panel loads. compareDoc fills leisure ONLY for money docs
// built before the field existed — a stale-file shim; fresh docs and
// custom runs never read it).
// Returns {homeLabel: {metricId: number|null}}. Pure: the drawer score
// row, the 내 기준 tab and the share card all read this.
export function priorityValues(moneyDoc, compareDoc, tenures) {
  const out = {};
  const staleLeisure = {};
  if (compareDoc && Array.isArray(compareDoc.metrics)) {
    const errands = compareDoc.metrics.find((m) => m.key === "errands_done");
    const parks = compareDoc.metrics.find((m) => m.key === "park_visits");
    if (errands && parks) {
      const homeA = compareDoc.home_a && compareDoc.home_a.label;
      const homeB = compareDoc.home_b && compareDoc.home_b.label;
      if (homeA) staleLeisure[homeA] = (errands.a || 0) + (parks.a || 0);
      if (homeB) staleLeisure[homeB] = (errands.b || 0) + (parks.b || 0);
    }
  }
  for (const [label, h] of Object.entries((moneyDoc && moneyDoc.homes) || {})) {
    const v = {};
    const edu = h.qol_education;
    if (!edu) {
      // Agent-merged homes (C) carry money only — no invented zeros.
      v.edu_nearest_school_min = null;
      v.edu_schools_10min = null;
      v.edu_academy_10min = null;
    } else {
      const c10 = (edu.counts || {}).within_10min || {};
      const nearSchool = ((edu.nearest || {}).school || [])[0];
      v.edu_nearest_school_min = nearSchool ? nearSchool.minutes : null;
      v.edu_schools_10min = (c10.school_elementary || 0) + (c10.school_middle || 0)
        + (c10.school_high || 0) + (c10.school_unknown || 0);
      v.edu_academy_10min = c10.academy ?? null;
    }
    const time = h.qol_time || {};
    v.life_commute_min = time.commute_minutes_per_day ?? null;
    v.life_evening_min = time.evening_at_home_minutes_per_day ?? null;
    v.life_fatigue = (h.qol_fatigue || {}).avg_30d ?? null;
    v.life_trips = h.leisure_trips_30d ?? staleLeisure[label] ?? null;
    const safety = h.qol_safety || {};
    v.safety_total = safety.total ?? null;
    if (Array.isArray(safety.groups)) {
      const pick = (name) => (safety.groups.find((g) => g.cat1 === name) || {}).count;
      const a = pick("강력범죄");
      const b = pick("폭력범죄");
      v.safety_violent = a !== undefined && b !== undefined ? a + b : null;
    } else {
      v.safety_violent = null;
    }
    const tenure = (tenures && tenures[label]) || "전세";
    const sel = h.by_tenure && h.by_tenure[tenure];
    v.money_housing = sel ? sel.housing.monthly_won : null;
    v.money_burden = sel ? sel.burden_ratio : null;
    v.money_remaining = sel ? sel.remaining_won : null;
    const conv = h.qol_convenience || {};
    v.conv_grocery = conv.grocery ?? null;
    v.conv_clinic = conv.clinic ?? null;
    v.conv_station = conv.station ?? null;
    out[label] = v;
  }
  return out;
}

// 내 기준 점수 (stage 17): one 0–100 number per home for the drawer
// row and the share card. Score = round(100 × weighted mean). Homes
// keep input order; safety never enters (weightedView excludes it).
export const MYSCORE_CAPTIONS = {
  customer: "내가 정한 비중으로 계산한 주관적인 점수예요",
  default: "아직 비중을 안 정해서 모두 보통으로 계산했어요",
};

export function myScore(values, weights, opts = {}) {
  const v = weightedView(values, weights, opts);
  if (!v.ok) return { ok: false, error: v.error };
  const scores = {};
  const groups = {};
  for (const label of Object.keys(values || {})) {
    const h = v.homes[label];
    scores[label] = h && h.score !== null ? Math.round(100 * h.score) : null;
    groups[label] = h ? h.groups : null;
  }
  return {
    ok: true,
    basis: v.basis,
    scores,
    groups,
    caption: MYSCORE_CAPTIONS[v.basis],
    formula_ko: "각 값을 보이는 집끼리 0–1로 맞춘 뒤 비중으로 평균해 100점으로 바꾼 상대 점수예요. 화면의 집끼리만 비교한 값이라 절대 등급이 아니고, 치안 건수는 합산하지 않았어요.",
  };
}
