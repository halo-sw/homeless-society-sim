// UI store: the state bridge between the three.js scene and the React UI.
//
// The scene publishes (clock, area, mode, homes, current decision, follow
// target, captions, compare data, legend counts) via set(); the UI
// subscribes via subscribe() and re-renders. UI actions call scene
// functions through the action registry (registerActions/act) — no React
// inside scene code, no three.js inside UI code. Pure: no DOM, no React,
// no three.js; unit-tested.

export const INITIAL_STATE = {
  mode: "tour", // "tour" | "sim" | "landing" | "chat"
  area: { id: "", label: "" },
  areaOptions: [], // [{value, label}] (tour mode)
  home: "",
  homes: [], // [{label, area, complex_name}]
  clock: { day: 0, minute: 420, days: 30, startDate: "", label: "–" },
  playing: true,
  speed: 1,
  follow: 0, // 0 = free camera, else 1-based household index
  followOptions: [], // [{value, label}]
  resOnly: false,
  caption: null, // {name, meta, walk, dots?: {count, active}} | null
  judge: null, // {badgeText, badgeCls, text, canAsk} | null
  judgeAskState: "idle", // idle | asking | live | error
  judgeLive: false,
  judgeLog: [], // [{minute, agent, kind, choice, badgeText, badgeCls, reason}]
  tourPlaying: true,
  compareOpen: false,
  compareTab: "compare", // "compare" | "money" | "quality"
  compare: null, // compare() payload, or {error}
  compareLoading: false,
  money: null, // <scenario>-money.json payload + agent C merges, or {error}
  moneyLoading: false,
  moneyTenure: {}, // {A: "전세", ...} UI-selected tenure per home
  moneyCandidates: [], // recommend_public_rental results (agent) for "C로 추가"
  priorityWeights: null, // {explicit, weights} published by the 내 기준 tab (share card bars)
  legend: null, // {title, resRows, heightRows, note, simNote?}
  loading: "지역을 불러오는 중…",
  ready: false,
  viewChip: "", // "화면 이동: B · 3일차 08:18"
  consultOpen: false,
  agentNudges: true, // floating-agent Toast nudges (off with reduced motion too)
  listingCheck: null, // last check_listing result (매물 tab)
  shareOpen: false, // result-card share dialog
  askError: "",
  scenarioName: "demo-two-homes",
  // Stage 7: Now card + ticker + intro + criteria + highlight state.
  now: null, // nowCardFor() payload, or {free: true, rows} for the free camera
  ticker: [], // tickerFor() rows for the followed member
  introOpen: false,
  simMeta: null, // intro card facts {members, neighbours, days, startDate, homes, assumptions}
  criteria: null, // resolved criteria {groups, items, overrides} or {error}
  criteriaLoading: false,
  criteriaFocus: "", // criterion id to scroll to in the 기준 tab
  qualityHover: null, // {category} while hovering a convenience row, else null
  simTicks: [], // [{minute, kind, id}] for the followed member today
  judgeFlash: "", // pulsing decision id ("" when none)
  // Stage 8: journey banner + view override + itinerary loading + region.
  journey: null, // journeyBanner() payload + {hasDetailDest, detailNote, corridorLabel} | null
  journeyView: "auto", // "auto" | "low" (거리 보기) | "high" (전체 경로)
  journeyLoading: "", // "판교 지도 불러오는 중…" while preloading, else ""
  region: null, // {network, congestion, corridors} presence flags | null
  // Stage 12b: day-at-a-glance timeline (published once per day/follow/
  // home change; the playhead minute moves underneath in the UI).
  dayStrip: null, // {segments} for the followed member (or member 1) today
  dayStripB: null, // {home, segments} for the other home (stripCompare) | null
  monthStrip: null, // [{day, date, weekday, weekend, commuteMin, fatigueMean, trips}]
  routeSteps: null, // {steps, outing, outings} for the followed member today
  stripCompare: false, // A·B day strips stacked
  chatSummary: "", // top-bar profile chip in chat mode ("판교 출근 · 1인 · …")
};

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export function createStore(initial = {}) {
  let state = { ...clone(INITIAL_STATE), ...clone(initial) };
  const listeners = new Set();
  const actions = new Map();

  function getState() {
    return state;
  }

  function set(patch) {
    if (!patch || typeof patch !== "object") return state;
    const next = { ...state };
    let changed = false;
    for (const [key, value] of Object.entries(patch)) {
      if (!(key in INITIAL_STATE)) continue; // unknown keys never enter state
      if (next[key] !== value) {
        next[key] = value;
        changed = true;
      }
    }
    if (!changed) return state;
    state = next;
    for (const fn of [...listeners]) fn(state);
    return state;
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function registerActions(table) {
    for (const [name, fn] of Object.entries(table || {})) {
      if (typeof fn === "function") actions.set(name, fn);
    }
  }

  function act(name, ...args) {
    const fn = actions.get(name);
    if (!fn) throw new Error(`ui store: unknown action ${JSON.stringify(name)}`);
    return fn(...args);
  }

  function hasAction(name) {
    return actions.has(name);
  }

  return { getState, set, subscribe, registerActions, act, hasAction };
}

// --- Referentially stable selectors for useSyncExternalStore (stage 10b).
//
// React requires getSnapshot to return a cached (===) result while the
// store state is unchanged. A getSnapshot that builds a fresh object per
// call retriggers renders forever ("The result of getSnapshot should be
// cached" → "Maximum update depth exceeded"), unmounting the whole UI
// and leaving only the 3D canvas. Every component getSnapshot below is
// one of these selectors: primitives are trivially stable, and the one
// object selector memoises on state identity (set() replaces the state
// object, so identity tracks freshness exactly). Tests enumerate every
// `select*` export and require === across repeated calls.
function memoizeByState(pick) {
  let lastState = null;
  let lastResult;
  let hasResult = false;
  return (state) => {
    if (hasResult && state === lastState) return lastResult;
    lastState = state;
    lastResult = pick(state);
    hasResult = true;
    return lastResult;
  };
}

export const selectState = (s) => s;
export const selectCompareTab = (s) => s.compareTab;
export const selectCompareOpen = (s) => s.compareOpen;
export const selectAgentNudges = (s) => s.agentNudges;
export const selectConsultOpen = (s) => s.consultOpen;
export const selectScenarioName = (s) => s.scenarioName;
export const selectShareOpen = (s) => s.shareOpen;
export const selectShareData = memoizeByState((s) => ({
  shareOpen: s.shareOpen,
  money: s.money,
  compare: s.compare,
  moneyLoading: s.moneyLoading,
  compareLoading: s.compareLoading,
  moneyTenure: s.moneyTenure,
  priorityWeights: s.priorityWeights,
  simMeta: s.simMeta,
  scenarioName: s.scenarioName,
}));
export const selectAgentNudge = memoizeByState((s) => ({
  journey: s.journey,
  judgeLog: s.judgeLog,
  money: s.money,
  home: s.home,
  on: s.agentNudges,
}));

// One shared store for the running page. Tests create their own via
// createStore() so page state never leaks between cases.
export const store = createStore();
