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
import { loadDestArea } from "../engine/destload.js";
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
import { SEARCH_TOOL_DEFS, SEARCH_HANDLERS } from "./tools-search.js";
import { PRIORITY_GROUPS, PRIORITY_METRICS, validateWeights } from "../priorities.js";
import { safetyView } from "../safety.js";
import { educationCounts, schoolRoute } from "../education.js";
import { glossDef, glossaryTerms } from "../ui/glossary.js";

export const CONSULT_AREAS = [
  { id: "pangyo", label: "판교" },
  { id: "seongsu", label: "성수" },
  { id: "songpa", label: "송파구" },
  { id: "songpa-jamsil", label: "잠실" },
];

export const CONSULT_CATEGORIES = [
  "supermarket", "convenience", "park", "clinic", "school", "station",
];

// Stage-9a persona templates (scenarios/personas/<id>.json): runnable
// starting points with placeholder 가정값 the customer replaces.
export const PERSONAS = [
  { id: "single-firstjob", title: "1인 사회초년생",
    desc: "혼자 사는 첫 직장인 (성인 1명, 작은 예산)" },
  { id: "newlywed-couple", title: "예비·신혼부부",
    desc: "맞벌이 두 사람 (성인 2명, 둘 다 출근)" },
  { id: "dual-income-child", title: "맞벌이 + 초등학생 자녀",
    desc: "맞벌이 두 사람 + 등교하는 아이 1명" },
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
    description: "The explicit simulation criteria (rules, values, sources). Filter by group: 이동, 일상, 판단, 측정, 피로도, 돈.",
    parameters: { type: "object", additionalProperties: false,
      properties: {
        group: str("Optional group id: move, daily, judge, measure, fatigue, money."),
      } } } },
  { type: "function", function: { name: "explain_criterion",
    description: "One criterion in full: the rule sentence, values with units, source, affected metrics, and whether the customer can change it.",
    parameters: { type: "object", additionalProperties: false,
      properties: {
        id: str("Criterion id, e.g. C-shop-dwell (see list_criteria)."),
      }, required: ["id"] } } },
  { type: "function", function: { name: "list_areas",
    description: "The built scene boxes available today (from the built areas index).",
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
  { type: "function", function: { name: "neighborhood",
    description: "후보 집 주변 생활 장소까지 실제 걷는 길로 몇 분인지.",
    parameters: { type: "object", additionalProperties: false,
      properties: {
        candidate_id: str("Candidate id from the context candidates."),
      }, required: ["candidate_id"] } } },
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
  { type: "function", function: { name: "get_journey",
    description: "One member's station rides on one day: lines, split minutes (the total is the customer's number), and congestion per leg with its source (서울교통공사 measured or 가정값).",
    parameters: { type: "object", additionalProperties: false,
      properties: {
        run: str("Run id from run_simulation."),
        day: { type: "integer", description: "1-based day number (1일차 = 1)." },
        member: str("Agent key (h1), member id (m1) or label (구성원 1)."),
      }, required: ["run", "day", "member"] } } },
  { type: "function", function: { name: "get_fatigue",
    description: "One member's fatigue index (the stated 가정 모델 — never health advice): 30-day summary plus, with day, the day's series and event values.",
    parameters: { type: "object", additionalProperties: false,
      properties: {
        run: str("Run id from run_simulation."),
        member: str("Agent key (h1), member id (m1) or label (구성원 1)."),
        day: { type: "integer", description: "Optional 1-based day number for the day's series." },
      }, required: ["run", "member"] } } },
  { type: "function", function: { name: "apply_persona",
    description: "Start from a household template: single-firstjob (1인 사회초년생), newlywed-couple (예비·신혼부부), dual-income-child (맞벌이 + 초등학생 자녀). Replaces the working scenario with the template (placeholder 가정값 the customer then replaces). Ask priorities next.",
    parameters: { type: "object", additionalProperties: false,
      properties: {
        persona: str("One of: single-firstjob, newlywed-couple, dual-income-child."),
      }, required: ["persona"] } } },
  { type: "function", function: { name: "get_priorities",
    description: "The five customer priority groups (교육·생활·치안·돈·생활 편의) with the named metrics, units and sources each one uses, plus the current weights.",
    parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "set_priorities",
    description: "Record the customer's own priority weights (0–5 per group: edu, life, safety, money, convenience). These are the only weighting of homes and are always shown as the customer's.",
    parameters: { type: "object", additionalProperties: false,
      properties: {
        weights: { type: "object", additionalProperties: true,
          description: 'E.g. {"edu": 5, "life": 3, "safety": 4, "money": 2, "convenience": 3}.' },
      }, required: ["weights"] } } },
  { type: "function", function: { name: "get_safety",
    description: "Official police occurrence counts for an area (경찰청 범죄 발생 지역별 통계 2025, counts by category with source/period/unit/level). Counts are where crimes were recorded, not a resident's risk. Never a score, ranking or safe/unsafe verdict.",
    parameters: { type: "object", additionalProperties: false,
      properties: {
        area: str("Area id from list_areas."),
      }, required: ["area"] } } },
  { type: "function", function: { name: "get_education",
    description: "Education access for a home: schools by level, kindergartens/childcare, libraries, academies (OSM, partial for academies) with graph walk minutes, plus the simulated school route with an optional run id. Access only — never quality, scores or rankings.",
    parameters: { type: "object", additionalProperties: false,
      properties: {
        area: str("Area id from list_areas."),
        home: str("Home label from the scenario (default: the scenario home in this area)."),
        run: str("Optional run id from run_simulation for the child's school route."),
      }, required: ["area"] } } },
  { type: "function", function: { name: "define_term",
    description: "Plain-Korean definition of a housing term, shared with the UI glossary (전세, 월세, 매매, 전세가율, LTV, DSR, 확정일자, 전입신고, 전세보증보험, 공공임대, 주거비 부담률, 혼잡도, 등기부등본).",
    parameters: { type: "object", additionalProperties: false,
      properties: {
        term: str("The term to define."),
      }, required: ["term"] } } },
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
  { type: "function", function: { name: "open_panel",
    description: "고객이 요청한 것을 오른쪽 작업판에 연다.",
    parameters: { type: "object", additionalProperties: false,
      properties: {
        panel: str('One of: map, compare, tour, commute, result, money, jeonse, support, priorities.'),
        home: str('Optional home label: A, B or C.'),
        candidate_id: str("Optional candidate id to focus."),
        day: { type: "integer", description: "Optional 1-based day number (1-30)." },
        time: str('Optional "HH:MM", e.g. "08:18".'),
      }, required: ["panel"] } } },
  { type: "function", function: { name: "pick_homes",
    description: "고객이 고른 후보 2–3곳을 찜한다.",
    parameters: { type: "object", additionalProperties: false,
      properties: {
        candidate_ids: { type: "array", description: "Chosen candidate ids (1-3).",
          items: { type: "string" } },
      }, required: ["candidate_ids"] } } },
  { type: "function", function: { name: "start_life_run",
    description: "고객이 '살아 봐 줘'처럼 요청했을 때만, 찜한 집들로 30일 살아 보기를 시작한다.",
    parameters: { type: "object", properties: {}, additionalProperties: false } } },
];

for (const def of MONEY_TOOL_DEFS) TOOL_DEFS.push(def);
for (const def of SEARCH_TOOL_DEFS) TOOL_DEFS.push(def);

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
//   loadAreaMeta(areaId),async {bbox} loader or null (dest-area discovery)
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
    loadAreaMeta: opts.loadAreaMeta || null,
    loadRegion: opts.loadRegion || null,
    loadDecisions: opts.loadDecisions || null,
    judgeHome: opts.judgeHome || null,
    loadPayroll: opts.loadPayroll || null,
    loadRtms: opts.loadRtms || null,
    loadHousing: opts.loadHousing || null,
    loadSafety: opts.loadSafety || null,
    loadPersona: opts.loadPersona || null,
    loadAssumption: opts.loadAssumption || null,
    loadHomes: opts.loadHomes || null,
    loadPhotos: opts.loadPhotos || null,
    loadAreasIndex: opts.loadAreasIndex || null,
    loadStationBoxes: opts.loadStationBoxes || null,
    loadTransit: opts.loadTransit || null,
    provider: opts.provider || "meta",
    fetchImpl: opts.fetchImpl || null,
    museRunsPrior: opts.museRunsPrior || 0,
    context: opts.context || null,
  };
}

function areaLabel(areaId) {
  return (CONSULT_AREAS.find((a) => a.id === areaId) || {}).label || areaId;
}

async function cachedIndexAreas(session) {
  if (session.loadAreasIndex && !session._areasIndex) {
    try {
      const doc = await session.loadAreasIndex();
      session._areasIndex = (doc && doc.areas) || [];
    } catch {
      session._areasIndex = [];
    }
  }
  return session._areasIndex || [];
}

async function knownArea(session, areaId) {
  if (CONSULT_AREAS.some((a) => a.id === areaId)) return true;
  if (session.loadAreasIndex) {
    return (await cachedIndexAreas(session)).some((a) => a.id === areaId);
  }
  // No index loader (tests, old servers): station boxes load directly.
  return typeof areaId === "string" && areaId.startsWith("st-");
}

async function needArea(session, areaId) {
  if (!(await knownArea(session, areaId))) {
    throw new Error(`unknown area ${JSON.stringify(areaId)} — call list_areas first`);
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
  const rm = work.ride_minutes;
  if (rm === undefined || rm === null) {
    errors.push(`${where}.work.ride_minutes가 필요합니다 — 반드시 고객이 말한 숫자여야 합니다. 앱은 대중교통 시간을 알 수 없으니 고객에게 물어보고 그 값을 그대로 쓰세요 (가정값으로 표시됨)`);
  } else if (typeof rm === "number") {
    if (!Number.isFinite(rm) || rm < 0) {
      errors.push(`${where}.work.ride_minutes는 0 이상의 숫자여야 합니다`);
    }
  } else if (rm && typeof rm === "object" && !Array.isArray(rm)) {
    for (const [label, v] of Object.entries(rm)) {
      if (!Number.isFinite(v) || v < 0) {
        errors.push(`${where}.work.ride_minutes[${label}]는 0 이상의 숫자여야 합니다`);
      }
    }
  } else {
    errors.push(`${where}.work.ride_minutes는 0 이상의 숫자(또는 집별 숫자)여야 합니다`);
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
    const rm = m.work && m.work.type === "station_ride" ? m.work.ride_minutes : undefined;
    const hasRide = Number.isFinite(rm) || (rm && typeof rm === "object" && !Array.isArray(rm)
      && Object.values(rm).some((v) => Number.isFinite(v)));
    if (hasRide) {
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
    if (!(await knownArea(session, h.area))) {
      return { ok: false, errors: [`homes: unknown area ${JSON.stringify(h.area)} — call list_areas to pick a real one`] };
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

async function list_areas(session) {
  // 12a: the built areas index when the server has it, else the four
  // legacy areas (tests, old servers).
  if (session && session.loadAreasIndex) {
    const areas = await cachedIndexAreas(session);
    if (areas.length > 0) {
      return { ok: true,
        areas: areas.map((a) => ({ id: a.id, label: a.label })),
        note: "3D로 살아 볼 수 있는 상자(1.2 km 역세권) 목록이다." };
    }
  }
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

const NEIGHBORHOOD_CATEGORIES = [
  ["station", "역"],
  ["supermarket", "마트"],
  ["convenience", "편의점"],
  ["park", "공원"],
  ["clinic", "병원·약국"],
  ["school", "학교"],
];

async function neighborhood(session, args) {
  const cands = (session.context && session.context.candidates) || [];
  const cand = cands.find((c) => c && c.id === String((args || {}).candidate_id));
  if (!cand) {
    return fail(`unknown candidate ${JSON.stringify((args || {}).candidate_id)} — the context lists today's candidates`);
  }
  if (!cand.scene || !Number.isFinite(cand.lon) || !Number.isFinite(cand.lat)) {
    return fail("이 집은 아직 3D 동네 자료가 없어요");
  }
  const area = await needArea(session, cand.scene).catch((err) => ({ __error: err }));
  if (area.__error) return fail(area.__error.message);
  let router;
  try {
    router = new Router(area.graph);
  } catch (err) {
    return fail(`graph failed: ${err.message}`);
  }
  const places = buildPlaces(area, router);
  let resolved;
  try {
    resolved = resolveHome(area,
      { label: "X", area: cand.scene, lon: cand.lon, lat: cand.lat }, router);
  } catch (err) {
    return fail(err.message);
  }
  const nearest = [];
  for (const [category, category_ko] of NEIGHBORHOOD_CATEGORIES) {
    const hits = nearestReachable(router, resolved.nodeId,
      placesOfCategory(places, category), 1);
    if (!hits || hits.length === 0) continue;
    const h = hits[0];
    nearest.push({ category, category_ko,
      name: h.place.name,
      minutes: round1(h.route.lengthM / ADULT_MPS / 60),
      distance_m: round1(h.route.lengthM) });
  }
  return { ok: true, candidate_id: cand.id, name: cand.name,
    area: cand.scene, area_label: areaLabel(cand.scene), nearest,
    speed_note: "minutes assume adult speed 1.3 m/s",
    source: "OSM 장소 + 보행 그래프" };
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
  let region = null;
  if (session.loadRegion) {
    region = await session.loadRegion().catch(() => null);
  }
  // Destination graph for place commutes (stage 9c): same resolution as
  // the CLIs (server: cheap bbox reads; fixtures: the tiny areas).
  const destArea = await loadDestArea({ scenario, network: region && region.network,
    homeArea: area,
    listAreas: async () => CONSULT_AREAS.map((a) => a.id),
    readAreaMeta: session.loadAreaMeta
      || (async (id) => ({ bbox: (await needArea(session, id)).bbox || null })),
    loadArea: (id) => needArea(session, id) }).catch(() => null);
  const simOpts = { ...(region ? { region } : {}), ...(destArea ? { destArea } : {}) };
  const t0 = Date.now();
  let run;
  let note = "";
  if (decisionsMode === "muse") {
    if (!session.judgeHome) return { error: "muse judging is unavailable on this server" };
    const judged = await session.judgeHome({
      area, scenarioRaw: clone(session.scenario), homeLabel: label,
      provider: session.provider, fetchImpl: session.fetchImpl,
      region, destArea,
    });
    run = judged.run;
    note = `judged live (${session.provider}, ${judged.usage.calls} calls, $${(costUsd(session.provider, judged.usage) || 0).toFixed(3)})`;
  } else if (decisionsMode === "recorded") {
    let doc = null;
    if (session.loadDecisions) {
      doc = await session.loadDecisions(session.scenarioName, label).catch(() => null);
    }
    if (doc) {
      run = simulate(area, clone(session.scenario), label, { ...simOpts, decisions: doc });
      note = `replayed committed decisions (${session.scenarioName}-${label})`;
    } else {
      run = simulate(area, clone(session.scenario), label, simOpts);
      note = "no committed decisions found — ran with rules instead";
    }
  } else {
    run = simulate(area, clone(session.scenario), label, simOpts);
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

function needMemberKey(run, ref) {
  const key = agentKeyOf(run.agents, ref);
  if (!key) {
    const known = run.agents.filter((a) => a.household).map((a) => `${a.key}/${a.label}`).join(", ");
    throw new Error(`unknown member ${JSON.stringify(ref)} (household: ${known})`);
  }
  return key;
}

function get_journey(session, args) {
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
  let key;
  try {
    key = needMemberKey(run, args.member);
  } catch (err) {
    return fail(err.message);
  }
  const label = (run.agents.find((a) => a.key === key) || {}).label || key;
  const slim = (r) => ({
    depart: hhmm(r.departMin),
    minutes_total: r.minutesTotal,
    legs: r.legs.map((l) => ({
      line: l.lineName, from: l.from, to: l.to,
      stops: [...l.stops], distance_km: l.distanceKm, minutes: l.minutes,
      congestion_pct: l.congestion.valuePct,
      congestion_source: l.congestion.source === "서울교통공사" ? "서울교통공사" : "가정값",
      congestion_slot: l.congestion.slotLabel,
      direction: l.congestion.direction,
      fatigue_delta: l.fatigueDelta,
    })),
    transfers: r.transfers.map((t) => ({ station: t.station, minutes: t.minutes })),
    transfer_minutes: r.transferMinutes,
    fatigue_delta: r.fatigueDelta,
    crowded_min: r.crowdedMin,
  });
  const rides = [];
  for (const a of run.aways) {
    if (a.agent !== key || a.day !== day1 - 1 || a.kind !== "work") continue;
    const detail = a.detail || {};
    if (detail.rides) {
      rides.push({ stay: a.label, out: slim(detail.rides.out), back: slim(detail.rides.back) });
    } else if (detail.ride_minutes) {
      rides.push({ stay: a.label,
        note: detail.journey_note || "경로 없음 (승차 시간 숫자만)",
        ride_minutes: detail.ride_minutes,
        ride_minutes_source: detail.ride_minutes_source || "user_assumption",
        fallback: detail.ride_fallback || null });
    }
  }
  // New form (stage 9c): the day's ride aways pair under the work stay's
  // label, in the same shape (plus the destination walk when recorded).
  const dayRides = (run.aways || []).filter((a) => a.agent === key
    && a.day === day1 - 1 && a.kind === "ride");
  if (dayRides.length > 0) {
    const stay = ((run.aways || []).find((a) => a.agent === key
      && a.day === day1 - 1 && a.kind === "work") || {}).label || "근무";
    const out = dayRides.find((a) => !a.detail || a.detail.direction !== "back");
    const back = dayRides.find((a) => a.detail && a.detail.direction === "back");
    const outRide = out && out.detail && out.detail.ride;
    const backRide = back && back.detail && back.detail.ride;
    if (outRide || backRide) {
      rides.push({ stay, out: outRide ? slim(outRide) : null,
        back: backRide ? slim(backRide) : null,
        dest_walk: (out && out.detail && out.detail.dest_walk) || null });
    } else {
      const first = (out || back).detail || {};
      const fb = first.ride_fallback || null;
      rides.push({ stay,
        note: first.journey_note || "경로 없음 (승차 시간 숫자만)",
        ride_minutes: first.ride_minutes,
        ride_minutes_source: first.ride_minutes_source || "user_assumption",
        fallback: fb ? { out_delta: fb.delta, back_delta: fb.delta,
          ride_minutes: fb.ride_minutes, congestion_pct: fb.congestion_pct,
          source: fb.source } : null,
        dest_walk: first.dest_walk || null });
    }
  }
  return { ok: true, run: hit.id, home: hit.home, day: day1, member: key, label,
    journey_note: rides.length === 0 ? "이 날 통근 승차 없음" : undefined,
    rides,
    sources: { measured: "서울교통공사 지하철혼잡도정보 (2026-09-30 기준)",
      fallback: "C-congestion fallback_pct (가정값)" } };
}

const FATIGUE_MODEL_NOTE = "피곤한 정도는 가정으로 계산한 값이에요. 건강·의학적 판단이 아니에요";

function get_fatigue(session, args) {
  let hit;
  try {
    hit = needRun(session, args.run);
  } catch (err) {
    return fail(err.message);
  }
  const run = hit.run;
  let key;
  try {
    key = needMemberKey(run, args.member);
  } catch (err) {
    return fail(err.message);
  }
  const label = (run.agents.find((a) => a.key === key) || {}).label || key;
  const summary = (run.totals.per_member[key] || {}).fatigue || null;
  const out = { ok: true, run: hit.id, home: hit.home, member: key, label,
    model_note: FATIGUE_MODEL_NOTE,
    criteria: ["C-congestion", "C-fatigue-load", "C-fatigue-recovery"],
    summary_30d: summary };
  if (args.day !== undefined && args.day !== null) {
    const day1 = args.day;
    if (!Number.isInteger(day1) || day1 < 1 || day1 > run.meta.days) {
      return fail(`day must be 1..${run.meta.days} (1-based: 1 = 1일차)`);
    }
    const entry = (run.daily || []).find((d) => d.agent === key);
    const dayFat = entry && entry.days[day1 - 1] && entry.days[day1 - 1].fatigue;
    if (!dayFat) return fail(`no fatigue series for ${key} on day ${day1}`);
    out.day = day1;
    out.day_fatigue = {
      start: dayFat.start, end: dayFat.end, peak: dayFat.peak,
      arrival_work: dayFat.arrival_work, after_home: dayFat.after_home,
      crowded_min: dayFat.crowded_min,
      series: dayFat.series.map((p) => ({ minute: hhmm(p.m), value: p.v,
        marker: p.label || undefined })),
    };
  }
  return out;
}

async function apply_persona(session, args) {
  const id = String(args.persona || "");
  const meta = PERSONAS.find((p) => p.id === id);
  if (!meta) {
    return fail(`unknown persona ${JSON.stringify(id)} (want ${PERSONAS.map((p) => p.id).join(", ")})`);
  }
  if (!session.loadPersona) return fail("persona templates are unavailable on this server");
  let raw;
  try {
    raw = await session.loadPersona(id);
  } catch (err) {
    return fail(`cannot load persona ${id}: ${String((err && err.message) || err).slice(0, 200)}`);
  }
  let parsed;
  try {
    parsed = parseScenario(clone(raw));
  } catch (err) {
    return fail(`persona ${id} failed validation: ${String((err && err.message) || err).slice(0, 300)}`);
  }
  for (const h of parsed.homes) {
    if (!CONSULT_AREAS.some((a) => a.id === h.area)) {
      return fail(`persona ${id}: unknown area ${JSON.stringify(h.area)}`);
    }
    try {
      const area = await needArea(session, h.area);
      const names = new Set((area.complexes || []).map((c) => c.name));
      if (!names.has(h.complex_name)) {
        return fail(`persona ${id}: no complex named ${JSON.stringify(h.complex_name)} in ${h.area}`);
      }
    } catch (err) {
      return fail(`persona ${id}: cannot verify ${h.area}: ${String((err && err.message) || err).slice(0, 200)}`);
    }
  }
  session.scenario = parsed;
  session.scenarioName = parsed.name;
  const members = parsed.household.members
    .map((m) => `${m.label}(${m.role}${m.school ? "·등교" : ""})`).join(", ");
  return { ok: true, persona: id, title: meta.title, scenario: clone(parsed),
    summary: `${meta.title}: ${members}; 홈 ${parsed.homes.map((h) => `${h.label} ${h.complex_name}`).join(" / ")}`,
    placeholders_note: "연봉·현금·승차 시간·이용 습관은 가정값입니다. 고객에게 물어 update_scenario/set_money로 바꾸세요.",
    next: "다음으로 우선순위(교육·생활·치안·돈·생활 편의, 각 0–5)를 쉽게 물어보세요 (get_priorities가 쓰는 지표를 알려준다)." };
}

function get_priorities(session) {
  const current = (session.scenario && session.scenario.priorities)
    || { weights: null, explicit: false };
  return {
    ok: true,
    groups: PRIORITY_GROUPS.map((g) => ({
      id: g.id, title: g.title, question: g.question, note: g.note,
      metrics: PRIORITY_METRICS.filter((m) => m.group === g.id).map((m) => ({
        id: m.id, label: m.label, unit: m.unit, source: m.source,
        direction: m.direction, note: m.note || undefined,
      })),
    })),
    weights: current.weights ? clone(current.weights) : null,
    explicit: current.explicit === true,
    scale_note: "각 0–5 (0 = 안 봄, 5 = 가장 중요). 기본은 모두 보통(3). 이 비중이 집을 비교하는 유일한 가중치이며, 항상 고객의 것으로 표시된다.",
  };
}

function set_priorities(session, args) {
  const checked = validateWeights(args.weights);
  if (!checked.ok) return { ok: false, errors: checked.errors };
  const next = clone(session.scenario);
  next.priorities = { weights: checked.weights, explicit: true };
  let parsed;
  try {
    parsed = parseScenario(next);
  } catch (err) {
    return fail(String((err && err.message) || err));
  }
  session.scenario = parsed;
  return { ok: true, weights: checked.weights, explicit: true,
    note: "고객님이 정한 비중으로 기록했다. 비교 화면의 내 기준으로 보기에 그대로 보인다." };
}

async function safetyKeyFor(session, areaId) {
  // Legacy areas and region ids pass through; station boxes resolve to
  // their region via station-boxes.json.
  if (CONSULT_AREAS.some((a) => a.id === areaId)) return areaId;
  if (session.loadStationBoxes && String(areaId).startsWith("st-")) {
    try {
      const doc = await session.loadStationBoxes();
      const hit = (doc.boxes || []).find(
        (b) => `st-${b.station}` === areaId);
      if (hit && hit.region) return hit.region;
    } catch {
      // fall through to the region-id attempt below
    }
  }
  return areaId;
}

async function get_safety(session, args) {
  const areaId = String(args.area || "");
  if (!areaId) return fail("area is required — call list_areas first");
  if (!session.loadSafety) {
    return fail("safety statistics are unavailable on this server (pipeline safety not built)");
  }
  let doc;
  try {
    doc = await session.loadSafety();
  } catch (err) {
    return fail(`cannot load safety statistics: ${String((err && err.message) || err).slice(0, 200)}`);
  }
  const key = await safetyKeyFor(session, areaId);
  const view = safetyView(doc, key);
  if (view.missing) return fail(view.missing);
  return { ok: true, ...view };
}

async function get_education(session, args) {
  const area = await needArea(session, args.area).catch((err) => ({ __error: err }));
  if (area.__error) return fail(area.__error.message);
  const homes = session.scenario.homes || [];
  const home = args.home ? homes.find((h) => h.label === args.home)
    : homes.find((h) => h.area === args.area);
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
  const access = educationCounts(places, router, resolved.nodeId);
  const out = { ok: true, area: args.area, home: home.label,
    complex: resolved.complex.name, access };
  if (args.run !== undefined && args.run !== null) {
    let hit;
    try {
      hit = needRun(session, args.run);
    } catch (err) {
      return fail(err.message);
    }
    const children = hit.run.agents.filter((a) => a.household && a.role === "child");
    out.school_routes = children.map((c) => schoolRoute(hit.run, router, c.key));
    if (children.length === 0) out.school_routes_note = "이 가구에는 등교하는 아이가 없습니다";
  }
  return out;
}

function define_term(session, args) {
  const hit = glossDef(args.term);
  if (!hit) {
    return fail(`unknown term ${JSON.stringify(args.term)} (glossary: ${glossaryTerms().join(", ")})`);
  }
  return { ok: true, term: hit.term, def: hit.def, source_url: hit.source_url };
}

const PANELS = ["map", "compare", "tour", "commute", "result",
  "money", "jeonse", "support", "priorities"];
const HOMES = ["A", "B", "C"];

function open_panel(session, args) {
  const a = args || {};
  if (!PANELS.includes(a.panel)) {
    return fail(`unknown panel ${JSON.stringify(a.panel)} (panels: ${PANELS.join(", ")})`);
  }
  if (a.home !== undefined && !HOMES.includes(a.home)) {
    return fail(`unknown home ${JSON.stringify(a.home)} (homes: ${HOMES.join(", ")})`);
  }
  if (a.candidate_id !== undefined && typeof a.candidate_id !== "string") {
    return fail("candidate_id must be a string");
  }
  if (a.day !== undefined && (!Number.isInteger(a.day) || a.day < 1 || a.day > 30)) {
    return fail(`day must be an integer 1-30 (got ${JSON.stringify(a.day)})`);
  }
  if (a.time !== undefined && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(a.time)) {
    return fail(`time must be "HH:MM" (got ${JSON.stringify(a.time)})`);
  }
  const ui = { action: "panel", panel: a.panel };
  if (a.home !== undefined) ui.home = a.home;
  if (a.candidate_id !== undefined) ui.candidate_id = a.candidate_id;
  if (a.day !== undefined) ui.day = a.day;
  if (a.time !== undefined) ui.time = a.time;
  return { ok: true, ui };
}

function pick_homes(session, args) {
  const ids = (args || {}).candidate_ids;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 3
      || !ids.every((id) => typeof id === "string")) {
    return fail("candidate_ids must be 1-3 candidate id strings");
  }
  return { ok: true, ui: { action: "pick", ids: [...ids] } };
}

function start_life_run(session, args) {
  return { ok: true, ui: { action: "run" } };
}

const HANDLERS = {
  get_scenario, update_scenario, list_areas, list_complexes, find_places,
  neighborhood,
  list_stations, run_simulation, compare, get_day, explain_decision, set_view,
  open_panel, pick_homes, start_life_run,
  list_criteria, explain_criterion, get_journey, get_fatigue,
  apply_persona, get_priorities, set_priorities, get_safety, get_education,
  define_term,
  ...MONEY_HANDLERS,
  ...SEARCH_HANDLERS,
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
