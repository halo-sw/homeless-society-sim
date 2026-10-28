// UI store: the state bridge between the three.js scene and the React UI.
//
// The scene publishes (clock, area, mode, homes, current decision, follow
// target, captions, compare data, legend counts) via set(); the UI
// subscribes via subscribe() and re-renders. UI actions call scene
// functions through the action registry (registerActions/act) — no React
// inside scene code, no three.js inside UI code. Pure: no DOM, no React,
// no three.js; unit-tested.

export const INITIAL_STATE = {
  mode: "tour", // "tour" | "sim"
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
  legend: null, // {title, resRows, heightRows, note, simNote?}
  loading: "지역을 불러오는 중…",
  ready: false,
  viewChip: "", // "화면 이동: B · 3일차 08:18"
  consultOpen: false,
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

// One shared store for the running page. Tests create their own via
// createStore() so page state never leaks between cases.
export const store = createStore();
