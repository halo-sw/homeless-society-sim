// Consult tools: what the "시뮬레이션 상담" agent can do (Node-side).
//
// Every handler returns plain JSON for the model. All numbers come from
// data or the engine: graph minutes/metres from the walk graph, totals
// from simulate()/compare(), assumptions verbatim from the scenario
// (labelled 가정값 / user_input). Nothing is invented: unknown complexes,
// stations or run ids are errors the model must surface, never fill in.
//
// Sessions are stateless across HTTP turns: the browser keeps the
// conversation + working scenario, the server keeps only derived run
// artifacts in an in-memory cache (no disk, no conversation storage).

import { simulate, compare as compareRuns } from "../engine/simulate.js";
import {
  CRITERIA_BY_ID, CRITERIA_GROUPS, CRITERIA_LIST, criterionValuesLine, resolveCriteria,
} from "../engine/criteria.js";
import {
  parseScenario, homeOf, resolveHome, nameForHome,
} from "../engine/scenario.js";
import { Router } from "../engine/graph.js";
import { buildPlaces, stationsByName, nearestReachable } from "../engine/places.js";
import { ADULT_MPS } from "../engine/agents.js";
import { costUsd } from "../judge/run.js";
import { MONEY_TOOL_DEFS, MONEY_HANDLERS } from "./tools-money.js";

export const CONSULT_AREAS = [
  { id: "pangyo", label: "판교" },
  { id: "seongsu", label: "성수" },
  { id: "songpa", label: "송파구" },
  { id: "songpa-jamsil", label: "잠실" },
];

export const CONSULT_CATEGORIES = [
  "supermarket", "convenience", "park", "clinic", "school", "station",
];

export const MAX_TOOL_ROUNDS = 6;
export const RUN_CACHE_MAX = 20;

const round1 = (n) => Math.round(n * 10) / 10;

function clone(value) {
  return structuredClone(value);
}

function fail(message) {
  return { ok: false, error: String(message).slice(0, 500) };
}

function hhmm(minute) {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// tool schemas (OpenAI-style function definitions)
// ---------------------------------------------------------------------------

function str(desc) {
  return { type: "string", description: desc };
}

export const TOOL_DEFS = [
  { type: "function", function: { name: "get_scenario",
    description: "Show the current working scenario (household, homes, assumptions).",
    parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "update_scenario",
    description: "Patch the working scenario (members, work, errands, habits, homes, days, criterion overrides). Returns the updated scenario or validation errors. For station_ride work you MUST have the customer's own ride_minutes number; without it the call fails and you must ask.",
    parameters: { type: "object", additionalProperties: false,
      properties: {
        members: { type: "array", description: "Per-member patches matched by index, id or label.",
          items: { type: "object", additionalProperties: true } },
        add_member: { type: "object", description: "A new member object to append.", additionalProperties: true },
        remove_member: { type: "string", description: "Member id or label to remove." },
        homes: { type: "array", description: "Replace the homes list [{label, area, complex_name}].",
          items: { type: "object", additionalProperties: true } },
        days: { type: "integer" }, seed: { type: "integer" }, background: { type: "integer" },
        workday_minutes: { type: "integer" }, schoolday_minutes: { type: "integer" },
        criteria_overrides: { type: "object", additionalProperties: true,
          description: 'Per-criterion value overrides, e.g. {"C-shop-dwell": {"dwell_min": 25}}. Only overridable numeric values; use list_criteria/explain_criterion to see them. Overridden values read as 고객 입력.' },
      } } } },
  { type: "function", function: { name: "list_criteria",
    description: "The explicit simulation criteria (rules, values, sources). Filter by group: 이동, 일상, 판단, 측정, 돈.",
    parameters: { type: "object", additionalProperties: false,
      properties: {
        group: str("Optional group id: move, daily, judge, measure, money."),
      } } } },
  { type: "function", function: { name: "explain_criterion",
    description: "One criterion in full: the rule sentence, values with units, source, affected metrics, and whether the customer can change it.",
    parameters: { type: "object", additionalProperties: false,
      properties: {
        id: str("Criterion id, e.g. C-shop-dwell (see list_criteria)."),
      }, required: ["id"] } } },
  { type: "function", function: { name: "list_areas",
    description: "The built areas available today (only these four).",
    parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "list_complexes",
    description: "Named apartment complexes in an area, with building counts.",
    parameters: { type: "object", additionalProperties: false,
      properties: {
        area: str("Area id from list_areas."),
        query: str("Optional substring filter on the complex name."),
      }, required: ["area"] } } },
  { type: "function", function: { name: "find_places",
    description: "Real POIs of a category with graph walk minutes/metres from a home entrance. Minutes assume adult speed (1.3 m/s) unless the run says otherwise.",
    parameters: { type: "object", additionalProperties: false,
      properties: {
        area: str("Area id from list_areas."),
        category: str("One of: supermarket, convenience, park, clinic, school, station."),
        home: str("Home label from the scenario (default: the scenario home in this area)."),
        limit: { type: "integer", description: "How many places (1..12, default 8)." },
      }, required: ["area", "category"] } } },
  { type: "function", function: { name: "list_stations",
    description: "Real station POIs in an area (names the commute can use verbatim).",
    parameters: { type: "object", additionalProperties: false,
      properties: { area: str("Area id from list_areas.") }, required: ["area"] } } },
  { type: "function", function: { name: "run_simulation",
    description: "Run the life engine in-process and return the summary plus run id(s). decisions=rules (fast default), recorded (replay committed judge decisions when present), muse (judge every branch live: slow and costly, at most once per conversation, warn the customer first).",
    parameters: { type: "object", additionalProperties: false,
      properties: {
        home: str('Home label, or "both" for the A/B comparison.'),
        decisions: str('One of: rules, recorded, muse (default rules).'),
      }, required: ["home"] } } },
  { type: "function", function: { name: "compare",
    description: "Compare two stored runs (household 30-day numbers with units and sources).",
    parameters: { type: "object", additionalProperties: false,
      properties: {
        run_a: str("First run id from run_simulation."),
        run_b: str("Second run id from run_simulation."),
      }, required: ["run_a", "run_b"] } } },
  { type: "function", function: { name: "get_day",
    description: "One member's day from a stored run: trips with minutes/metres plus stays.",
    parameters: { type: "object", additionalProperties: false,
      properties: {
        run: str("Run id from run_simulation."),
        day: { type: "integer", description: "1-based day number (1일차 = 1)." },
        member: str("Agent key (h1), member id (m1) or label (구성원 1)."),
      }, required: ["run", "day", "member"] } } },
  { type: "function", function: { name: "explain_decision",
    description: "One branch decision from a stored run: options with graph numbers, the choice, the reason and who decided.",
    parameters: { type: "object", additionalProperties: false,
      properties: {
        run: str("Run id from run_simulation."),
        decision_id: str("Decision id, e.g. h1:d2:478:shop_choice:0."),
      }, required: ["run", "decision_id"] } } },
  { type: "function", function: { name: "set_view",
    description: "Show the customer what you explain: the UI moves the 3D view and shows a chip. Returns the chip text.",
    parameters: { type: "object", additionalProperties: false,
      properties: {
        home: str("Home label, or null to keep the current home."),
        day: { type: "integer", description: "1-based day number." },
        time: str('"HH:MM", e.g. "08:18".'),
        follow: { type: "integer", description: "Followed member 1-based index (0 = free camera)." },
        mode: str('"sim" or "tour".'),
      } } } },
];

for (const def of MONEY_TOOL_DEFS) TOOL_DEFS.push(def);

export const TOOL_NAMES = new Set(TOOL_DEFS.map((t) => t.function.name));

// ---------------------------------------------------------------------------
// session
// ---------------------------------------------------------------------------

export function createRunCache() {
  return { seq: 0, runs: new Map() };
}

function cacheRun(cache, record) {
  cache.seq += 1;
  const id = `run${cache.seq}`;
  cache.runs.set(id, { id, ...record });
  while (cache.runs.size > RUN_CACHE_MAX) {
    cache.runs.delete(cache.runs.keys().next().value);
  }
  return id;
}

// session: {
//   scenario,            working copy (handlers mutate via update_scenario)
//   cache,               run cache (shared across turns, memory only)
//   loadArea(areaId),    async area loader (server: fs; tests: fixtures)
//   loadDecisions(name), async committed-decisions loader or null
//   judgeHome,           async judge runner for decisions=muse or null
//   provider, fetchImpl, museRunsPrior (count of muse runs earlier in this
//                       conversation, scanned from the message history)
// }
export function createSession(opts) {
  return {
    scenario: clone(opts.scenario),
    scenarioName: (opts.scenario && opts.scenario.name) || "scenario",
    cache: opts.cache || createRunCache(),
    loadArea: opts.loadArea,
    loadDecisions: opts.loadDecisions || null,
    judgeHome: opts.judgeHome || null,
    loadPayroll: opts.loadPayroll || null,
    loadRtms: opts.loadRtms || null,
    loadHousing: opts.loadHousing || null,
    provider: opts.provider || "meta",
    fetchImpl: opts.fetchImpl || null,
    museRunsPrior: opts.museRunsPrior || 0,
  };
}

function areaLabel(areaId) {
  return (CONSULT_AREAS.find((a) => a.id === areaId) || {}).label || areaId;
}

async function needArea(session, areaId) {
  if (!CONSULT_AREAS.some((a) => a.id === areaId)) {
    throw new Error(`unknown area ${JSON.stringify(areaId)} — call list_areas first (only the four built areas exist today)`);
  }
  return session.loadArea(areaId);
}

function matchMember(members, ref) {
  const s = String(ref);
  return members.find((m, i) =>
    m.id === s || m.label === s || `h${i + 1}` === s || `m${i + 1}` === s
    || String(i + 1) === s || String(i) === s);
}

function agentKeyOf(members, ref) {
  const idx = members.findIndex((m, i) =>
    m.id === String(ref) || m.label === String(ref) || `h${i + 1}` === String(ref)
    || `m${i + 1}` === String(ref));
  return idx >= 0 ? `h${idx + 1}` : null;
}

// ---------------------------------------------------------------------------
// handlers
// ---------------------------------------------------------------------------

function get_scenario(session) {
  return { ok: true, scenario: clone(session.scenario) };
}

function checkStationRide(work, where, errors) {
  if (!work || work.type !== "station_ride") return;
  if (work.station_name === undefined || work.station_name === null || work.station_name === "") {
    errors.push(`${where}.work.station_name이 필요합니다 — 고객에게 이용 역을 물어보세요`);
  }
  if (work.ride_minutes === undefined || work.ride_minutes === null) {
    errors.push(`${where}.work.ride_minutes가 필요합니다 — 반드시 고객이 말한 숫자여야 합니다. 앱은 대중교통 시간을 알 수 없으니 고객에게 물어보고 그 값을 그대로 쓰세요 (가정값으로 표시됨)`);
  } else if (!Number.isFinite(work.ride_minutes) || work.ride_minutes < 0) {
    errors.push(`${where}.work.ride_minutes는 0 이상의 숫자여야 합니다`);
  }
}

async function update_scenario(session, patch) {
  const errors = [];
  if (!patch || typeof patch !== "object") return fail("patch must be an object");
  const next = clone(session.scenario);
  next.household = next.household || {};
  next.household.members = next.household.members || [];

  if (patch.remove_member !== undefined) {
    const before = next.household.members.length;
    next.household.members = next.household.members.filter((m) =>
      m.id !== patch.remove_member && m.label !== patch.remove_member);
    if (next.household.members.length === before) {
      errors.push(`remove_member: no member ${JSON.stringify(patch.remove_member)}`);
    }
  }
  if (patch.add_member !== undefined) {
    if (!patch.add_member || typeof patch.add_member !== "object") {
      errors.push("add_member must be an object");
    } else {
      next.household.members.push(clone(patch.add_member));
    }
  }
  if (patch.members !== undefined) {
    if (!Array.isArray(patch.members)) {
      errors.push("members must be an array");
    } else {
      for (const pm of patch.members) {
        if (!pm || typeof pm !== "object") {
          errors.push("members entries must be objects"); continue;
        }
        const ref = pm.index ?? pm.id ?? pm.label;
        const hit = ref === undefined ? null : matchMember(next.household.members, ref);
        if (!hit) {
          errors.push(`members: no member matches ${JSON.stringify(ref === undefined ? pm : ref)} — call get_scenario first`);
          continue;
        }
        for (const [k, v] of Object.entries(pm)) {
          if (k === "index") continue;
          hit[k] = clone(v);
        }
      }
    }
  }
  const markedExplicit = [];
  for (const key of ["days", "seed", "background", "workday_minutes", "schoolday_minutes"]) {
    if (patch[key] !== undefined) {
      next[key] = patch[key];
      markedExplicit.push(key);
    }
  }
  if (patch.criteria_overrides !== undefined) {
    if (!patch.criteria_overrides || typeof patch.criteria_overrides !== "object"
        || Array.isArray(patch.criteria_overrides)) {
      errors.push("criteria_overrides must be an object keyed by criterion id");
    } else {
      next.criteria_overrides = next.criteria_overrides || {};
      for (const [id, pv] of Object.entries(patch.criteria_overrides)) {
        if (!pv || typeof pv !== "object" || Array.isArray(pv)) {
          errors.push(`criteria_overrides[${id}] must be an object of value overrides`);
          continue;
        }
        next.criteria_overrides[id] = { ...(next.criteria_overrides[id] || {}), ...clone(pv) };
      }
    }
  }
  if (patch.homes !== undefined) {
    if (!Array.isArray(patch.homes) || patch.homes.length === 0) {
      errors.push("homes must be a non-empty array of {label, area, complex_name}");
    } else {
      next.homes = clone(patch.homes);
    }
  }
  // station_ride needs the customer's own numbers, stamped as user input.
  for (const [i, m] of next.household.members.entries()) {
    checkStationRide(m.work, `household.members[${i}]`, errors);
    if (m.work && m.work.type === "station_ride" && Number.isFinite(m.work.ride_minutes)) {
      m.work.ride_minutes_source = "user_input";
      m.work.needs_user_input = false;
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  let parsed;
  try {
    parsed = parseScenario(clone(next));
  } catch (err) {
    return { ok: false, errors: [String((err && err.message) || err)] };
  }
  // Homes must resolve against real data: known area + verbatim complex.
  const warnings = [];
  for (const h of parsed.homes) {
    if (!CONSULT_AREAS.some((a) => a.id === h.area)) {
      return { ok: false, errors: [`homes: unknown area ${JSON.stringify(h.area)} — only ${CONSULT_AREAS.map((a) => a.id).join(", ")} exist today`] };
    }
    try {
      const area = await needArea(session, h.area);
      const names = new Set((area.complexes || []).map((c) => c.name));
      if (!names.has(h.complex_name)) {
        return { ok: false, errors: [`homes: no complex named ${JSON.stringify(h.complex_name)} in ${h.area} — call list_complexes to pick a real one`] };
      }
    } catch (err) {
      return { ok: false, errors: [`homes: cannot verify ${h.area}: ${String((err && err.message) || err).slice(0, 200)}`] };
    }
  }
  // Station names: warn (not fail) when no verbatim station POI matches,
  // so the model confirms the spelling with the customer.
  for (const [i, m] of parsed.household.members.entries()) {
    if (!m.work || m.work.type !== "station_ride") continue;
    for (const h of parsed.homes) {
      let want;
      try {
        want = nameForHome(m.work.station_name, h.label);
      } catch {
        warnings.push(`member ${i + 1}: no station name for home ${h.label}`);
        continue;
      }
      try {
        const area = await needArea(session, h.area);
        const router = new Router(area.graph);
        const places = buildPlaces(area, router);
        if (stationsByName(places, want).length === 0) {
          warnings.push(`member ${i + 1}: no station named ${JSON.stringify(want)} in ${h.area} — confirm the spelling (list_stations)`);
        }
      } catch { /* area errors already reported above */ }
    }
  }
  for (const key of markedExplicit) parsed._explicit[key] = true;
  session.scenario = parsed;
  return { ok: true, scenario: clone(parsed), warnings };
}

function list_criteria(session, args) {
  const group = args.group !== undefined && args.group !== null ? String(args.group) : null;
  if (group && !CRITERIA_GROUPS.some((g) => g.id === group)) {
    return fail(`unknown group ${JSON.stringify(group)} (want ${CRITERIA_GROUPS.map((g) => g.id).join(", ")})`);
  }
  const resolved = resolveCriteria(session.scenario);
  const list = CRITERIA_LIST
    .filter((c) => !group || c.group === group)
    .map((c) => {
      const row = resolved.byId[c.id];
      return {
        id: row.id, group: row.group, title: row.title,
        values: criterionValuesLine(row) || "(값 없음: 규칙 문장 참조)",
        source: row.source, editable: row.editable,
      };
    });
  return { ok: true, groups: clone(CRITERIA_GROUPS), count: list.length, criteria: list };
}

function explain_criterion(session, args) {
  const c = CRITERIA_BY_ID.get(String(args.id || ""));
  if (!c) {
    return fail(`unknown criterion ${JSON.stringify(args.id)} — call list_criteria first`);
  }
  const resolved = resolveCriteria(session.scenario);
  const row = resolved.byId[c.id];
  const groupTitle = (CRITERIA_GROUPS.find((g) => g.id === row.group) || {}).title || row.group;
  return {
    ok: true,
    id: row.id, group: row.group, group_title: groupTitle, title: row.title,
    rule: row.rule,
    values: Object.fromEntries(Object.entries(row.values).map(([k, v]) => [k, {
      value: v.value, unit: v.unit, overridable: v.overridable,
    }])),
    values_line: criterionValuesLine(row) || "(값 없음: 규칙 문장 참조)",
    source: row.source,
    overridden: resolved.overridden.includes(row.id),
    affects: [...row.affects],
    editable: row.editable,
    how_to_change: row.editable
      ? "update_scenario의 criteria_overrides(수치 기준) 또는 members/money 패치(입력 기준)로 바꾸고 run_simulation으로 다시 실행한다."
      : "엔진 계약이라 바꿀 수 없다.",
  };
}

function list_areas() {
  return { ok: true, areas: clone(CONSULT_AREAS),
    note: "오늘 고를 수 있는 지역은 이 4곳뿐이다. 전국 생성은 다음 단계다." };
}

async function list_complexes(session, args) {
  const areaId = args.area;
  const area = await needArea(session, areaId).catch((err) => ({ __error: err }));
  if (area.__error) return fail(area.__error.message);
  const q = String(args.query || "").trim();
  let list = (area.complexes || [])
    .filter((c) => c.name)
    .map((c) => ({ name: c.name, id: c.id, buildings: (c.building_ids || []).length }));
  if (q) list = list.filter((c) => c.name.includes(q));
  list.sort((a, b) => (a.name < b.name ? -1 : 1));
  return { ok: true, area: areaId, area_label: areaLabel(areaId),
    count: list.length, complexes: list.slice(0, 100),
    truncated: list.length > 100 };
}

function placesOfCategory(places, category) {
  if (category === "supermarket" || category === "convenience") return places.shops[category] || [];
  if (category === "park") return places.parks || [];
  if (category === "clinic") return places.clinics || [];
  if (category === "school") return places.schools || [];
  if (category === "station") return places.stations || [];
  return null;
}

async function find_places(session, args) {
  const category = String(args.category || "");
  if (!CONSULT_CATEGORIES.includes(category)) {
    return fail(`unknown category ${JSON.stringify(category)} (want ${CONSULT_CATEGORIES.join(", ")})`);
  }
  const area = await needArea(session, args.area).catch((err) => ({ __error: err }));
  if (area.__error) return fail(area.__error.message);
  const homes = session.scenario.homes || [];
  let home = args.home ? homes.find((h) => h.label === args.home) : homes.find((h) => h.area === args.area);
  if (!home) {
    return fail(args.home
      ? `unknown home label ${JSON.stringify(args.home)} — call get_scenario first`
      : `the scenario has no home in ${args.area} — pass "home" or set one via update_scenario`);
  }
  let router;
  try {
    router = new Router(area.graph);
  } catch (err) {
    return fail(`graph failed: ${err.message}`);
  }
  const places = buildPlaces(area, router);
  let resolved;
  try {
    resolved = resolveHome(area, home, router);
  } catch (err) {
    return fail(err.message);
  }
  const list = placesOfCategory(places, category);
  const limit = Math.min(12, Math.max(1, Number.isInteger(args.limit) ? args.limit : 8));
  const hits = nearestReachable(router, resolved.nodeId, list, limit);
  return {
    ok: true, area: args.area, home: home.label, complex: resolved.complex.name,
    category, speed_mps: ADULT_MPS, speed_note: "minutes assume adult speed 1.3 m/s",
    places: hits.map((h) => ({
      name: h.place.name, id: h.place.id, category: h.place.category,
      minutes: round1(h.route.lengthM / ADULT_MPS / 60),
      distance_m: round1(h.route.lengthM), source: "graph",
    })),
  };
}

async function list_stations(session, args) {
  const area = await needArea(session, args.area).catch((err) => ({ __error: err }));
  if (area.__error) return fail(area.__error.message);
  let router;
  try {
    router = new Router(area.graph);
  } catch (err) {
    return fail(`graph failed: ${err.message}`);
  }
  const places = buildPlaces(area, router);
  const byName = new Map();
  for (const p of places.stations) {
    if (!byName.has(p.name)) byName.set(p.name, { name: p.name, pois: 0, categories: new Set() });
    const slot = byName.get(p.name);
    slot.pois++;
    slot.categories.add(p.category);
  }
  const stations = [...byName.values()]
    .map((s) => ({ ...s, categories: [...s.categories].sort() }))
    .sort((a, b) => (a.name < b.name ? -1 : 1));
  return { ok: true, area: args.area, area_label: areaLabel(args.area),
    count: stations.length, stations };
}

function slimCompare(cmp) {
  return {
    scenario: cmp.scenario,
    home_a: cmp.home_a, home_b: cmp.home_b, days: cmp.days, seed: cmp.seed,
    metrics: cmp.metrics, unavailable: cmp.unavailable, judgment: cmp.judgment,
  };
}

function householdTotals(run) {
  return { totals: run.totals.household, agents: run.meta.agents,
    trips: run.trips.length, decisions: run.decisions.length,
    unavailable: run.unavailable.length, choices: run.meta.choices };
}

async function runOne(session, label, decisionsMode) {
  const scenario = parseScenario(clone(session.scenario));
  homeOf(scenario, label);
  const home = scenario.homes.find((h) => h.label === label);
  const area = await needArea(session, home.area);
  const t0 = Date.now();
  let run;
  let note = "";
  if (decisionsMode === "muse") {
    if (!session.judgeHome) return { error: "muse judging is unavailable on this server" };
    const judged = await session.judgeHome({
      area, scenarioRaw: clone(session.scenario), homeLabel: label,
      provider: session.provider, fetchImpl: session.fetchImpl,
    });
    run = judged.run;
    note = `judged live (${session.provider}, ${judged.usage.calls} calls, $${(costUsd(session.provider, judged.usage) || 0).toFixed(3)})`;
  } else if (decisionsMode === "recorded") {
    let doc = null;
    if (session.loadDecisions) {
      doc = await session.loadDecisions(session.scenarioName, label).catch(() => null);
    }
    if (doc) {
      run = simulate(area, clone(session.scenario), label, { decisions: doc });
      note = `replayed committed decisions (${session.scenarioName}-${label})`;
    } else {
      run = simulate(area, clone(session.scenario), label);
      note = "no committed decisions found — ran with rules instead";
    }
  } else {
    run = simulate(area, clone(session.scenario), label);
  }
  return { run, ms: Date.now() - t0, note };
}

async function run_simulation(session, args) {
  const mode = args.decisions || "rules";
  if (!["rules", "recorded", "muse"].includes(mode)) {
    return fail(`unknown decisions ${JSON.stringify(mode)} (want rules|recorded|muse)`);
  }
  if (mode === "muse" && session.museRunsPrior >= 1) {
    return fail("muse judging is capped at 1 run per conversation and one already ran — report from the stored runs instead");
  }
  const homes = (session.scenario.homes || []).map((h) => h.label);
  const want = String(args.home || "");
  const labels = want === "both" ? homes.slice(0, 2) : [want];
  if (labels.length === 0 || labels.some((l) => !homes.includes(l))) {
    return fail(`unknown home ${JSON.stringify(want)} (scenario homes: ${homes.join(", ") || "(none)"}; use "both" for the comparison)`);
  }
  if (want === "both" && labels.length < 2) {
    return fail("the scenario has only one home — add a second home via update_scenario to compare");
  }
  if (mode === "muse" && !session.judgeHome) {
    return fail("muse judging is unavailable on this server — use rules or recorded");
  }
  const ids = {};
  const notes = [];
  let totalMs = 0;
  for (const label of labels) {
    let one;
    try {
      one = await runOne(session, label, mode);
    } catch (err) {
      return fail(`run failed for home ${label}: ${String((err && err.message) || err).slice(0, 300)}`);
    }
    if (one.error) return fail(one.error);
    totalMs += one.ms;
    if (one.note) notes.push(`${label}: ${one.note}`);
    ids[label] = cacheRun(session.cache, {
      run: one.run, home: label, decisionsMode: mode,
      scenarioName: session.scenarioName,
    });
  }
  if (mode === "muse") session.museRunsPrior += 1;
  if (labels.length === 2) {
    const a = session.cache.runs.get(ids[labels[0]]).run;
    const b = session.cache.runs.get(ids[labels[1]]).run;
    return { ok: true, run_ids: ids, decisions: mode, ms: totalMs,
      compare: slimCompare(compareRuns(a, b)), notes,
      warn: mode === "muse" ? "This live judge run cost provider tokens and took a while; further questions should reuse these runs." : undefined };
  }
  const run = session.cache.runs.get(ids[labels[0]]).run;
  return { ok: true, run_ids: ids, decisions: mode, ms: totalMs,
    home: labels[0], area: run.meta.area, complex: run.meta.complex,
    summary: householdTotals(run), notes };
}

function needRun(session, id) {
  const hit = session.cache.runs.get(String(id));
  if (!hit) throw new Error(`unknown run ${JSON.stringify(id)} — call run_simulation first (runs live in this conversation only)`);
  return hit;
}

function compare(session, args) {
  let a;
  let b;
  try {
    a = needRun(session, args.run_a);
    b = needRun(session, args.run_b);
  } catch (err) {
    return fail(err.message);
  }
  return { ok: true, run_a: a.id, run_b: b.id, compare: slimCompare(compareRuns(a.run, b.run)) };
}

function get_day(session, args) {
  let hit;
  try {
    hit = needRun(session, args.run);
  } catch (err) {
    return fail(err.message);
  }
  const run = hit.run;
  const day1 = args.day;
  if (!Number.isInteger(day1) || day1 < 1 || day1 > run.meta.days) {
    return fail(`day must be 1..${run.meta.days} (1-based: 1 = 1일차)`);
  }
  const day = day1 - 1;
  const key = agentKeyOf(run.agents, args.member);
  if (!key) {
    const known = run.agents.filter((a) => a.household).map((a) => `${a.key}/${a.label}`).join(", ");
    return fail(`unknown member ${JSON.stringify(args.member)} (household: ${known})`);
  }
  const label = (run.agents.find((a) => a.key === key) || {}).label || key;
  const trips = run.trips
    .filter((t) => t.agent === key && t.day === day)
    .map((t) => ({ depart: hhmm(t.depart_min), arrive: hhmm(t.arrive_min),
      purpose: t.purpose, from: (t.from && (t.from.label || t.from.id)) || "",
      to: (t.to && (t.to.label || t.to.id)) || "",
      minutes: t.minutes, distance_m: t.distance_m, source: "graph",
      cause: t.cause || null }));
  const aways = run.aways
    .filter((a) => a.agent === key && a.day === day)
    .map((a) => ({ start: hhmm(a.start_min), end: hhmm(a.end_min),
      kind: a.kind, label: a.label || "",
      ride_minutes: (a.detail && a.detail.ride_minutes) || undefined,
      ride_note: (a.detail && a.detail.ride_minutes) ? "가정값 (user_input)" : undefined,
      cause: a.cause || null }));
  return { ok: true, run: hit.id, home: hit.home, day: day1, member: key, label,
    trips, aways, date_note: `day ${day1} of ${run.meta.days}` };
}

const KIND_KO = { shop_choice: "장보기", park_or_home: "공원/귀가",
  station_route: "역 출구", weekend_plan: "주말 계획" };

function explain_decision(session, args) {
  let hit;
  try {
    hit = needRun(session, args.run);
  } catch (err) {
    return fail(err.message);
  }
  const d = hit.run.decisions.find((x) => x.id === args.decision_id);
  if (!d) {
    const sample = hit.run.decisions
      .filter((x) => x.agent.startsWith("h")).slice(0, 3).map((x) => x.id);
    return fail(`unknown decision ${JSON.stringify(args.decision_id)}${sample.length > 0 ? ` (e.g. ${sample.join(", ")})` : ""}`);
  }
  const label = (hit.run.agents.find((a) => a.key === d.agent) || {}).label || d.agent;
  const badge = d.chosen_by === "model" && d.provider === "baseten" ? "Muse Spark Open"
    : d.chosen_by === "model" ? "Muse Spark 1.3" : "규칙";
  return { ok: true, run: hit.id, id: d.id, agent: d.agent, agent_label: label,
    day: d.day + 1, time: hhmm(d.minute), kind: d.kind,
    kind_ko: KIND_KO[d.kind] || d.kind,
    options: (d.options || []).map((o) => ({ key: o.key, label: o.label || o.key,
      minutes: o.minutes, distance_m: o.distance_m, source: "graph" })),
    default_key: d.default_key, chosen_key: d.chosen_key,
    plan: d.plan, chosen_by: d.chosen_by, badge,
    reason_ko: d.reason_ko || "", reason_en: d.reason_en || "",
    provider: d.provider, model: d.model,
    fallback_cause: d.fallback_cause };
}

function set_view(session, args) {
  const homes = (session.scenario.homes || []).map((h) => h.label);
  const days = session.scenario.days || 30;
  const out = {};
  if (args.home !== undefined && args.home !== null) {
    if (!homes.includes(args.home)) {
      return fail(`unknown home ${JSON.stringify(args.home)} (scenario homes: ${homes.join(", ")})`);
    }
    out.home = args.home;
  }
  if (args.day !== undefined && args.day !== null) {
    if (!Number.isInteger(args.day) || args.day < 1 || args.day > days) {
      return fail(`day must be 1..${days}`);
    }
    out.day = args.day;
  }
  if (args.time !== undefined && args.time !== null) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(args.time));
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) {
      return fail(`time must be "HH:MM" (got ${JSON.stringify(args.time)})`);
    }
    out.time = `${m[1].padStart(2, "0")}:${m[2]}`;
  }
  if (args.follow !== undefined && args.follow !== null) {
    const n = Number(args.follow);
    const members = (session.scenario.household || {}).members || [];
    if (!Number.isInteger(n) || n < 0 || n > members.length) {
      return fail(`follow must be 0..${members.length} (0 = free camera)`);
    }
    out.follow = n;
  }
  if (args.mode !== undefined && args.mode !== null) {
    if (args.mode !== "sim" && args.mode !== "tour") {
      return fail(`mode must be "sim" or "tour" (got ${JSON.stringify(args.mode)})`);
    }
    out.mode = args.mode;
  }
  const bits = [];
  if (out.home) bits.push(String(out.home));
  if (out.day && out.time) bits.push(`${out.day}일차 ${out.time}`);
  else if (out.day) bits.push(`${out.day}일차`);
  else if (out.time) bits.push(out.time);
  return { ok: true, view: out, chip: bits.length > 0 ? `화면 이동: ${bits.join(" · ")}` : "화면 이동" };
}

const HANDLERS = {
  get_scenario, update_scenario, list_areas, list_complexes, find_places,
  list_stations, run_simulation, compare, get_day, explain_decision, set_view,
  list_criteria, explain_criterion,
  ...MONEY_HANDLERS,
};

export async function callTool(session, name, args) {
  const fn = HANDLERS[name];
  if (!fn) return fail(`unknown tool ${JSON.stringify(name)}`);
  try {
    return await fn(session, args || {});
  } catch (err) {
    return fail(`tool ${name} failed: ${String((err && err.message) || err).slice(0, 300)}`);
  }
}
