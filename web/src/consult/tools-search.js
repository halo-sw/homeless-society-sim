// Consult search tools (12a, D): the agent's find-a-home flow.
//
// extract_profile(text, current) — fill only values present in the
//   customer's words (evidence-guarded); returns the profile plus at
//   most 2 plain-word questions for the missing essentials.
// find_homes(profile, {sort, limit, regions, kind}) — 3–6 candidates
//   from homes-index.json. Sorting is the customer's choice; no score,
//   no "추천 1위".
// find_public_rentals(profile, {limit, regions}) — same budget rules
//   on the public-rental snapshot, with per-region coverage.
// build_scenario(profile, home_ids) — scenarioFromProfile over the
//   picked 2 (or 3) homes becomes the working scenario for
//   run_simulation.
//
// Flow: extract_profile → ask missing → find_homes → customer picks 2
// → build_scenario → run_simulation → results in plain words.

import {
  PROFILE_FIELDS, extract_profile as extractProfileCore, missingQuestions,
  scenarioFromProfile, TENURE_KO,
} from "../profile.js";
import {
  DEFAULT_HOME_SORT, HOME_SORTS, find_homes as findHomesCore,
  find_public_rentals as findPublicCore, publicRentalCoverage,
  NO_PUBLIC_RENTAL_NOTE,
} from "../homes.js";
import { parseScenario } from "../engine/scenario.js";

function fail(message) {
  return { ok: false, error: String(message).slice(0, 500) };
}

function clone(value) {
  return structuredClone(value);
}

// Customer region words -> region ids (regions.json ids).
export const REGION_NAME_ALIASES = {
  seongdong: ["성동", "성동구", "seongdong"],
  "songpa-gu": ["송파", "송파구", "songpa-gu", "잠실"],
  gangnam: ["강남", "강남구", "gangnam"],
  gangdong: ["강동", "강동구", "gangdong", "천호"],
  bundang: ["분당", "분당구", "bundang", "서현", "수내"],
  sujeong: ["수정", "수정구", "sujeong"],
  jungwon: ["중원", "중원구", "jungwon", "모란"],
  suji: ["수지", "수지구", "suji"],
  wirye: ["위례", "wirye", "남위례"],
  pangyo: ["판교"],
  jeongja: ["정자"],
  migeum: ["미금"],
};

const PLACE_TO_REGION = { pangyo: "bundang", jeongja: "bundang", migeum: "bundang" };

export function regionsForNames(names) {
  const out = [];
  for (const raw of names || []) {
    const word = String(raw || "").trim();
    if (!word) continue;
    for (const [id, aliases] of Object.entries(REGION_NAME_ALIASES)) {
      if (id === word || aliases.includes(word)) {
        const region = PLACE_TO_REGION[id] || id;
        if (!out.includes(region)) out.push(region);
      }
    }
  }
  return out;
}

const KIND_ALIASES = {
  "아파트": "아파트", "apt": "아파트",
  "연립": "연립·다세대", "다세대": "연립·다세대", "빌라": "연립·다세대",
  "연립·다세대": "연립·다세대", "rowhouse": "연립·다세대",
  "오피스텔": "오피스텔", "오피": "오피스텔", "officetel": "오피스텔",
};

export function kindForName(name) {
  if (!name) return null;
  return KIND_ALIASES[String(name).trim()] || null;
}

function profileFromArgs(args) {
  const profile = args && args.profile;
  if (!profile || typeof profile !== "object") return null;
  const out = {};
  for (const key of PROFILE_FIELDS) {
    out[key] = profile[key] && typeof profile[key] === "object"
      ? clone(profile[key]) : { value: null, source: "customer", note: "" };
  }
  return out;
}

async function needHomes(session) {
  if (!session.loadHomes) throw new Error("homes index is unavailable on this server");
  return session.loadHomes();
}

async function needNetwork(session) {
  if (!session.loadRegion) return null;
  try {
    const region = await session.loadRegion();
    return (region && region.network) || null;
  } catch {
    return null;
  }
}

async function needPhotos(session) {
  if (!session.loadPhotos) return null;
  try {
    return await session.loadPhotos();
  } catch {
    return null;
  }
}

function stationNames(network) {
  const names = new Set();
  for (const line of (network && network.lines) || []) {
    for (const s of line.stops || []) {
      if (s.name) names.add(String(s.name).replace(/역$/, ""));
    }
  }
  return [...names];
}

async function extract_profile(session, args) {
  const text = String(args.text || "");
  if (!text.trim()) return fail("text must be a non-empty string");
  const network = await needNetwork(session);
  const current = profileFromArgs(args) || undefined;
  const r = extractProfileCore(text, current,
    { stations: stationNames(network) });
  if (!r.ok) return fail(`profile values must appear in the text: ${r.errors.join("; ")}`);
  return {
    ok: true,
    profile: r.profile,
    asked: r.asked,
    missing: r.missing,
    note: r.asked.length > 0
      ? `ask the customer (at most 2): ${r.asked.map((q) => q.ask).join(" ")}`
      : "essentials present — call find_homes",
  };
}

async function boxesForHomes(session, homes) {
  // Load box areas for candidates with scenes (bounded: ≤12 areas).
  const boxes = new Map();
  const ids = [...new Set(homes.map((h) => h.scene).filter(Boolean))].slice(0, 12);
  for (const id of ids) {
    try {
      const area = await session.loadArea(id);
      boxes.set(id, { graph: area.graph || null, pois: area.pois || [] });
    } catch {
      // Unloadable box: must-have minutes stay null (honest unknown).
    }
  }
  return boxes;
}

async function find_homes(session, args) {
  const profile = profileFromArgs(args);
  if (!profile) return fail("profile must be the extract_profile result object");
  const sort = args.sort || DEFAULT_HOME_SORT;
  if (!HOME_SORTS.includes(sort)) {
    return fail(`sort wants one of ${HOME_SORTS.join(", ")} (default ${DEFAULT_HOME_SORT})`);
  }
  const index = await needHomes(session);
  const network = await needNetwork(session);
  const manifest = await needPhotos(session);
  const regions = args.regions ? regionsForNames(args.regions) : null;
  const kind = kindForName(args.kind);
  if (args.kind && !kind) {
    return fail(`kind wants one of 아파트/연립·다세대(빌라)/오피스텔 (got ${JSON.stringify(args.kind)})`);
  }
  const limit = args.limit !== undefined ? args.limit : 6;
  // Two passes: prelim without box graphs, then reload with boxes so
  // must-have minutes filter honestly.
  const prelim = findHomesCore(profile, index, {
    sort, limit: 12, regions, kind, network, boxes: null, photos: manifest,
  });
  const boxes = await boxesForHomes(session, prelim.candidates);
  const final = findHomesCore(profile, index, {
    sort, limit, regions, kind, network, boxes, photos: manifest,
  });
  return {
    ok: true,
    ...final,
    asked_for: { regions: regions || "all", kind: kind || "all" },
    next: final.candidates.length > 0
      ? "show 3–6 candidates with numbers + source badges; the customer picks 2 (or 3), then build_scenario"
      : "no candidates under these conditions — loosen budget/size/regions with the customer",
  };
}

async function find_public_rentals(session, args) {
  const profile = profileFromArgs(args);
  if (!profile) return fail("profile must be the extract_profile result object");
  if (!session.loadHousing) {
    return fail("public-rental data is unavailable on this server");
  }
  const snapshot = await session.loadHousing();
  const regions = args.regions ? regionsForNames(args.regions) : null;
  const r = findPublicCore(profile, snapshot, {
    limit: args.limit !== undefined ? args.limit : 6,
    regions,
  });
  const coverage = publicRentalCoverage(snapshot, regions || [
    "seongdong", "songpa-gu", "gangnam", "gangdong", "bundang",
    "sujeong", "jungwon", "suji", "wirye",
  ]);
  const absent = Object.entries(coverage)
    .filter(([, c]) => !c.present).map(([id]) => id);
  return {
    ok: true,
    ...r,
    coverage_note: absent.length > 0
      ? `${absent.join(", ")}: ${NO_PUBLIC_RENTAL_NOTE}` : null,
  };
}

async function build_scenario(session, args) {
  const profile = profileFromArgs(args);
  if (!profile) return fail("profile must be the extract_profile result object");
  const ids = args.home_ids;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 3) {
    return fail("home_ids must be the 1–3 home ids the customer picked");
  }
  const index = await needHomes(session);
  const homes = (index.homes || []).filter((h) => ids.includes(h.id));
  if (homes.length !== ids.length) {
    const have = new Set(homes.map((h) => h.id));
    return fail(`unknown home ids: ${ids.filter((id) => !have.has(id)).join(", ")}`);
  }
  for (const h of homes) {
    if (!h.scene) {
      return fail(`home ${h.name} has no scene box yet — pick a candidate with 3D로 살아 보기`);
    }
  }
  const areas = new Map();
  for (const h of homes) {
    try {
      areas.set(h.scene, await session.loadArea(h.scene));
    } catch (err) {
      return fail(`cannot load scene ${h.scene}: ${String((err && err.message) || err).slice(0, 200)}`);
    }
  }
  let scenario;
  try {
    scenario = scenarioFromProfile(profile, homes, { areas });
  } catch (err) {
    return fail(String((err && err.message) || err).slice(0, 300));
  }
  let parsed;
  try {
    parsed = parseScenario(clone(scenario));
  } catch (err) {
    return fail(`scenario invalid: ${String((err && err.message) || err).slice(0, 300)}`);
  }
  session.scenario = parsed;
  return {
    ok: true,
    scenario: clone(parsed),
    note: "working scenario replaced — run_simulation with home A/B (or both)",
  };
}

export const SEARCH_TOOL_DEFS = [
  { type: "function", function: { name: "extract_profile",
    description: "Read the customer's situation text into a profile (household, workplace, salary, cash, tenure, budget, size, commute ceiling). Fills only values present in the text; every number must appear in the customer's words. Returns the profile plus at most 2 plain-word questions for the missing essentials.",
    parameters: { type: "object", additionalProperties: false,
      properties: {
        text: { type: "string", description: "The customer's words (Korean)." },
        profile: { type: "object", additionalProperties: true,
          description: "Current profile to extend (omit for a fresh one)." },
      }, required: ["text"] } } },
  { type: "function", function: { name: "find_homes",
    description: "Candidate homes from real transactions for the profile: tenure+budget medians, size, commute (graph walk where known, network path; unknown walk/ride are labelled, never guessed), must-haves inside built boxes. Sorting is the customer's choice (default 출퇴근 짧은 순, shown). No score, no ranking. Each result carries numbers, source badges, scene (box id or null) and up to 6 nearby photos.",
    parameters: { type: "object", additionalProperties: false,
      properties: {
        profile: { type: "object", additionalProperties: true },
        sort: { type: "string",
          description: "One of: commute, monthly, deals, priority (default commute)." },
        limit: { type: "integer", description: "How many (1..12, default 6)." },
        regions: { type: "array", description: "Region ids/words, only when the customer named any.",
          items: { type: "string" } },
        kind: { type: "string", description: "아파트, 연립·다세대(빌라) or 오피스텔 (omit for all)." },
      }, required: ["profile"] } } },
  { type: "function", function: { name: "find_public_rentals",
    description: "Public-rental candidates for the profile (same budget/size rules). Reports per-region coverage; regions without data read 이 지역 공공임대 자료 없음. Never an eligibility verdict — 입주 자격은 공고 원문에서 확인.",
    parameters: { type: "object", additionalProperties: false,
      properties: {
        profile: { type: "object", additionalProperties: true },
        limit: { type: "integer", description: "How many (1..12, default 6)." },
        regions: { type: "array", description: "Region ids/words, only when the customer named any.",
          items: { type: "string" } },
      }, required: ["profile"] } } },
  { type: "function", function: { name: "build_scenario",
    description: "Build the working scenario from the profile + the 1–3 home ids the customer picked (homes need a scene box). Replaces the session scenario; call run_simulation next.",
    parameters: { type: "object", additionalProperties: false,
      properties: {
        profile: { type: "object", additionalProperties: true },
        home_ids: { type: "array", description: "The picked home ids (1–3).",
          items: { type: "string" } },
      }, required: ["profile", "home_ids"] } } },
];

export const SEARCH_HANDLERS = {
  extract_profile, find_homes, find_public_rentals, build_scenario,
};

export { TENURE_KO, missingQuestions };
