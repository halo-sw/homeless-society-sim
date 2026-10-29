// "가정 바꾸기" panel (13, Part 3). The engine constants from
// scenarios/criteria/kr-default.json that a person can reason about,
// each with current value, source, reset and plain-word help. Changes
// apply to the next simulation run and are recorded in the share link
// (criteria_overrides). Pure; tested in assumptions-13.test.js.

export const EDITABLE_ASSUMPTIONS = [
  {
    id: "C-walk-speed.adult_mps",
    criterion: "C-walk-speed",
    key: "adult_mps",
    label: "걷는 속도 (어른)",
    unit: "m/s",
    def: 1.3, min: 0.8, max: 2.0, step: 0.1,
    source: "engine 기본값",
    help: "도보 시간 = 그래프 거리 ÷ 이 속도. 느리게 잡으면 출퇴근 시간이 길어져요.",
  },
  {
    id: "C-walk-speed.slow_mps",
    criterion: "C-walk-speed",
    key: "slow_mps",
    label: "걷는 속도 (어린이·노인)",
    unit: "m/s",
    def: 1.1, min: 0.6, max: 1.6, step: 0.1,
    source: "engine 기본값",
    help: "어린이·노인과 함께 이동할 때 쓰는 속도예요.",
  },
  {
    id: "C-ride-split.transfer_walk_min",
    criterion: "C-ride-split",
    key: "transfer_walk_min",
    label: "환승 1회 시간",
    unit: "분/회",
    def: 4, min: 1, max: 10, step: 1,
    source: "가정값",
    help: "갈아탈 때 걷기+기다리기에 쓰는 시간. 합계에서 먼저 빼고 나머지를 구간별로 나눠요.",
  },
  {
    id: "C-commute-depart.morning_anchor_min",
    criterion: "C-commute-depart",
    key: "morning_anchor_min",
    label: "출근 출발 시각",
    unit: "시각",
    def: 450, min: 360, max: 600, step: 10,
    source: "engine 기본값",
    help: "07:30이 450분이에요. 0–59분 지터가 더해져요 (도착 역산 안 함).",
  },
  {
    id: "C-work-hours.workday_minutes",
    criterion: "C-work-hours",
    key: "workday_minutes",
    label: "근무 체류 시간",
    unit: "분",
    def: 540, min: 240, max: 720, step: 30,
    source: "engine 기본값",
    help: "9시간(540분) 일하고 귀가하는 걸로 쳐요.",
  },
  {
    id: "C-shop-trip.weekly_count",
    criterion: "C-shop-trip",
    key: "weekly_count",
    label: "장보기 횟수",
    unit: "회/주",
    def: 2, min: 0, max: 7, step: 1,
    source: "가정값",
    help: "일주일에 며칠 장보러 가는지. 돈 계산의 장보기 횟수에 반영돼요.",
  },
  {
    id: "C-shop-trip.basket_won",
    criterion: "C-shop-trip",
    key: "basket_won",
    label: "장보기 1회 금액",
    unit: "원",
    def: 30000, min: 10000, max: 100000, step: 5000,
    source: "가정값",
    help: "한 번 장볼 때 쓰는 돈. 영수증이 아니라 가정이에요.",
  },
  {
    id: "C-money-maint.monthly_won",
    criterion: "C-money-maint",
    key: "monthly_won",
    label: "관리비 가정",
    unit: "원/월",
    def: 150000, min: 0, max: 400000, step: 10000,
    source: "가정값",
    help: "단지마다 다르지만 모를 때 쓰는 한 달 관리비예요.",
  },
];

export function assumptionById(id) {
  return EDITABLE_ASSUMPTIONS.find((a) => a.id === id) || null;
}

export function defaultOverrides() {
  return {};
}

// overrides: {criterionId: {key: value}}. Set one cell.
export function setOverride(overrides, id, value) {
  const def = assumptionById(id);
  if (!def) return overrides;
  const next = { ...(overrides || {}) };
  const group = { ...(next[def.criterion] || {}) };
  if (value === def.def) {
    delete group[def.key];
    if (Object.keys(group).length === 0) delete next[def.criterion];
    else next[def.criterion] = group;
  } else {
    group[def.key] = value;
    next[def.criterion] = group;
  }
  return next;
}

export function resetOverride(overrides, id) {
  const def = assumptionById(id);
  if (!def) return overrides;
  return setOverride(overrides, id, def.def);
}

export function resetAllOverrides() {
  return {};
}

export function currentValue(overrides, id) {
  const def = assumptionById(id);
  if (!def) return null;
  const group = (overrides || {})[def.criterion] || {};
  return group[def.key] ?? def.def;
}

export function changedCount(overrides) {
  return Object.values(overrides || {}).reduce(
    (n, g) => n + Object.keys(g || {}).length, 0,
  );
}

// Share-link encoding: criteria_overrides as compact JSON in one
// query param (?assume=<encoded>). Recorded in the share link.
export function encodeOverrides(overrides) {
  if (!overrides || Object.keys(overrides).length === 0) return "";
  return encodeURIComponent(JSON.stringify(overrides));
}

export function decodeOverrides(encoded) {
  if (!encoded) return {};
  try {
    const parsed = JSON.parse(decodeURIComponent(encoded));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out = {};
    for (const def of EDITABLE_ASSUMPTIONS) {
      const group = parsed[def.criterion];
      const v = group && group[def.key];
      if (typeof v === "number" && Number.isFinite(v)) {
        if (!out[def.criterion]) out[def.criterion] = {};
        out[def.criterion][def.key] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}
