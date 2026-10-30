// Customer profile: the customer's own numbers, never demo values (12a, C).
//
// A profile is a set of fields; every field is {value, source, note} with
// source "customer" | "default" | "derived":
//   - customer: the customer said it (extract_profile evidence-guarded).
//   - default: an engine constant only (walking speed etc.), labelled.
//   - derived: computed from customer values (labelled, reproducible).
// Salaries, cash, budget and workplace are NEVER defaulted: when missing,
// the UI asks (missingQuestions, at most 2 at a time).
//
// extract_profile(text, current) fills only values present in the text:
// every number must appear in the customer's words (same guard as
// parse_listing). Korean money words: 4천, 2억 5천, 월 80.
// scenarioFromProfile(profile, homes, {areas, network, schedule})
// builds a runnable scenario from the profile + chosen homes
// (deterministic). Ride minutes per home: the customer's number when
// given, else derived from the operator schedule (labelled derived);
// homes without either keep needs_user_input (never a guess).

import { findPath } from "./engine/journey.js";
import { rideMinutes as derivedRideMinutes } from "./transit/schedule.js";

export const PROFILE_SOURCES = ["customer", "default", "derived", "asked"];

// Engine constants allowed as defaults (labelled wherever shown).
export const ENGINE_DEFAULTS = {
  walk_mps: { value: 1.3, note: "C-walk-speed 성인 도보 속도 (엔진 기본값)" },
  commute_sort: { value: "commute", note: "기본 정렬: 출퇴근 짧은 순" },
};

export const TENURES = ["jeonse", "wolse", "trade", "public", "undecided"];
export const TENURE_KO = {
  jeonse: "전세", wolse: "월세", trade: "매매", public: "공공임대",
  undecided: "아직 모름",
};

export const PROFILE_FIELDS = [
  "members", "workplaces", "salaryAnnual", "takehomeMonthly", "cash",
  "debts", "tenure", "depositMax", "monthlyMax", "priceMax", "sizeMin",
  "commuteMax", "priorities", "mustHaves",
];

export function field(value, source, note = "") {
  if (!PROFILE_SOURCES.includes(source)) {
    throw new Error(`profile: bad source ${JSON.stringify(source)}`);
  }
  return { value, source, note };
}

export function emptyProfile() {
  const blank = () => field(null, "asked", "");
  return {
    members: blank(), workplaces: blank(), salaryAnnual: blank(),
    takehomeMonthly: blank(), cash: blank(), debts: blank(), tenure: blank(),
    depositMax: blank(), monthlyMax: blank(), priceMax: blank(),
    sizeMin: blank(), commuteMax: blank(),
    priorities: blank(), mustHaves: field([], "asked", ""),
  };
}

function clone(value) {
  return structuredClone(value);
}

// --- Korean money words ------------------------------------------------------
// 만=1e4, 억=1e8, 천(만)=1e7. "4천"=4e7, "2억 5천"=2.5e8, "월 80"=80e4/월.

const WON_MAN = 10000;
const WON_EOK = 100000000;

function parseMoneyChunk(chunk) {
  // One chunk like "2억 5천", "4천", "5000", "1억2000", "80".
  const s = String(chunk || "").replace(/,/g, "").replace(/\s+/g, "");
  if (s === "") return null;
  let total = 0;
  let rest = s;
  const eok = rest.match(/(\d+(?:\.\d+)?)억/);
  if (eok) {
    total += Number(eok[1]) * WON_EOK;
    rest = rest.replace(eok[0], "");
  }
  const cheon = rest.match(/(\d+(?:\.\d+)?)천/);
  if (cheon) {
    total += Number(cheon[1]) * 1000 * WON_MAN;
    rest = rest.replace(cheon[0], "");
  }
  const man = rest.match(/(\d+(?:\.\d+)?)만/);
  if (man) {
    total += Number(man[1]) * WON_MAN;
    rest = rest.replace(man[0], "");
  }
  if (/^\d+(?:\.\d+)?$/.test(rest) && rest !== "") {
    // Bare digits: 만원 when the chunk had a unit context (억/천/만 seen
    // or the caller passes 만원 context), else 만원 by real-estate
    // convention only when explicitly marked — here: plain 만원.
    total += Number(rest) * WON_MAN;
  } else if (rest !== "") {
    return null;
  }
  return total > 0 ? Math.round(total) : null;
}

export function parseKoreanMoney(text) {
  return parseMoneyChunk(text);
}

// Find money expressions with their evidence spans. Returns
// [{won, evidence}] in text order.
function findMoney(text) {
  const out = [];
  const re = /\d[\d,]*\s*억(?:\s*\d[\d,]*\s*(?:천|만))?|\d[\d,]*\s*천(?:\s*만)?|\d[\d,]*\s*만\s*원?/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const won = parseMoneyChunk(m[0]);
    if (won !== null) out.push({ won, evidence: m[0] });
  }
  return out;
}

// --- extract_profile -----------------------------------------------------------

const TENURE_WORDS = [
  ["공공임대", "public"], ["전세", "jeonse"], ["월세", "wolse"], ["매매", "trade"],
];

function findTenure(text) {
  for (const [word, key] of TENURE_WORDS) {
    if (text.includes(word)) return { key, evidence: word };
  }
  if (text.includes("아직 모름") || text.includes("아직 몰라")) {
    return { key: "undecided", evidence: "아직 모름" };
  }
  return null;
}

function findMembers(text) {
  const two = ["부부", "신혼", "둘이", "2인", "두 사람", "맞벌이"];
  const child = ["아이", "자녀", "초등", "어린이", "애기", "아기"];
  const one = ["혼자", "신입", "1인", "나 혼자", "자취"];
  const members = [];
  let evidence = null;
  if (two.some((w) => text.includes(w))) {
    evidence = two.find((w) => text.includes(w));
    members.push({ role: "adult" }, { role: "adult" });
  } else if (one.some((w) => text.includes(w))) {
    evidence = one.find((w) => text.includes(w));
    members.push({ role: "adult" });
  }
  if (child.some((w) => text.includes(w))) {
    const cw = child.find((w) => text.includes(w));
    evidence = evidence ? `${evidence}·${cw}` : cw;
    if (members.length === 0) members.push({ role: "adult" });
    members.push({ role: "child" });
  }
  if (members.length === 0) return null;
  return { members, evidence };
}

function normStationWord(s) {
  return String(s || "").trim().replace(/역$/, "").trim();
}

// Resolve a workplace mention to a station in our data (exact normalised
// match only — never a guess). stations: array of names.
function resolveWorkplace(mention, stations) {
  const want = normStationWord(mention);
  if (!want) return null;
  for (const s of stations || []) {
    if (normStationWord(s) === want) return normStationWord(s);
  }
  return null;
}

function findWorkplace(text, stations) {
  // "판교로 출근", "판교 출근", "직장이 판교", "회사 판교", "판교에 다녀".
  const pats = [
    /([가-힣A-Za-z0-9·]+?)(?:로|에|에서)\s*출근/,
    /출근(?:지|은|이)\s*([가-힣A-Za-z0-9·]+)/,
    /(?:직장|회사)(?:이|은|는)?\s*([가-힣A-Za-z0-9·]+)/,
    /([가-힣A-Za-z0-9·]+?)\s*출근/,
  ];
  for (const re of pats) {
    const m = re.exec(text);
    if (m && m[1] && m[1].length >= 2) {
      // Never strip leading syllables: 제주/제기동 are real places.
      const mention = m[1].trim();
      return {
        text: mention, evidence: m[0],
        resolved: resolveWorkplace(mention, stations),
      };
    }
  }
  return null;
}

// Guard: every extracted number must appear in the customer's words.
// Evidence substrings must be verbatim slices of the text.
export function guardProfileValues(fields, text) {
  const errors = [];
  for (const [key, f] of Object.entries(fields || {})) {
    if (!f || typeof f !== "object") continue;
    const ev = f.evidence;
    if (f.value === null || f.value === undefined) continue;
    if (Array.isArray(f.value) && f.value.length === 0) continue;
    if (typeof ev !== "string" || ev === "") {
      errors.push(`${key}: missing evidence`);
    } else {
      // 18: "·"-joined multi-evidence (members from two cues) — every
      // part must be a verbatim slice.
      const parts = ev.includes("·") ? ev.split("·") : [ev];
      for (const part of parts) {
        if (!part || !text.includes(part)) {
          errors.push(`${key}: evidence ${JSON.stringify(ev)} not in the text`);
          break;
        }
      }
    }
  }
  return errors;
}

function nearMoney(text, anchorRe, monies, window = 14) {
  // Money mention closest AFTER the anchor word (Korean word order:
  // "연봉 4천", "모은 돈 5천"); a mention just before the anchor
  // ("2억 이하 전세") counts only when nothing follows it.
  const m = anchorRe.exec(text);
  if (!m) return null;
  const at = m.index;
  const end = at + m[0].length;
  let best = null;
  let bestDist = Infinity;
  for (const money of monies) {
    let from = 0;
    let idx = -1;
    let dist = Infinity;
    for (;;) {
      const hit = text.indexOf(money.evidence, from);
      if (hit < 0) break;
      const d = hit >= end ? hit - end : at - (hit + money.evidence.length);
      if (d >= 0 && d < dist) {
        dist = d;
        idx = hit;
      }
      from = hit + 1;
    }
    if (idx < 0 || dist > window) continue;
    // After-anchor beats before-anchor at any distance.
    const after = idx >= end ? 0 : 1;
    const key = after * 10000 + dist;
    if (key < bestDist) {
      bestDist = key;
      best = money;
    }
  }
  return best ? { ...best, anchor: m[0] } : null;
}

export function extract_profile(text, current = null, opts = {}) {
  const src = String(text || "");
  const profile = current ? clone(current) : emptyProfile();
  const stations = opts.stations || [];
  const monies = findMoney(src);
  const set = (key, value, evidence, note = "") => {
    profile[key] = {
      value: clone(value), source: "customer", note,
      evidence,
    };
  };

  const tenure = findTenure(src);
  const salaryHit = nearMoney(src, /연봉|세전|급여/, monies)
    || (/(신입|초봉).*?(4천|3천|5천)/.test(src) ? null : null);
  const cashHit = nearMoney(src, /모은\s*돈|모은돈|보유|현금|수중|마련|종잣돈/, monies, 20);
  const depositHit = nearMoney(src, /전세/, monies)
    || nearMoney(src, /보증금/, monies);
  const monthlyHit = nearMoney(src, /월\s*\d|월세/, monies)
    || (() => {
      const m = /월\s*(\d[\d,]*)/.exec(src);
      if (!m) return null;
      const won = Number(m[1].replace(/,/g, "")) * WON_MAN;
      return { won, evidence: m[0] };
    })();
  const priceHit = nearMoney(src, /매매|매매가|집값/, monies);
  const sizeHit = (() => {
    const m = /(\d+(?:\.\d+)?)\s*(?:㎡|평|제곱)/.exec(src);
    if (!m) return null;
    return { value: Number(m[1]), evidence: m[0] };
  })();
  const commuteHit = (() => {
    const m = /(\d+)\s*분\s*(?:이내|안에|까지|컷)/.exec(src);
    if (!m) return null;
    return { value: Number(m[1]), evidence: m[0] };
  })();
  const membersHit = findMembers(src);
  const workHit = findWorkplace(src, stations);

  // Salary: "연봉 4천" anchor; bare "4천" with 연봉 nearby also counts
  // because nearMoney already requires the anchor word.
  if (salaryHit && profile.salaryAnnual.value === null) {
    const n = (profile.members.value || []).length || 1;
    set("salaryAnnual",
      Array.from({ length: n }, () => salaryHit.won),
      salaryHit.evidence, "세전 연봉이에요. 실수령은 따로 계산해요.");
  }
  if (cashHit && profile.cash.value === null) {
    set("cash", cashHit.won, cashHit.evidence, "모은 돈");
  }
  if (tenure && profile.tenure.value === null) {
    set("tenure", tenure.key, tenure.evidence, TENURE_KO[tenure.key]);
  }
  const tenureNow = profile.tenure.value;
  if (depositHit && (tenureNow === "jeonse" || tenureNow === "wolse" || tenureNow === "public")
      && profile.depositMax.value === null) {
    set("depositMax", depositHit.won, depositHit.evidence,
      `${TENURE_KO[tenureNow] || ""} 보증금 상한`);
  }
  if (monthlyHit && profile.monthlyMax.value === null) {
    set("monthlyMax", monthlyHit.won, monthlyHit.evidence, "월 지출 상한");
  }
  if (priceHit && profile.priceMax.value === null) {
    set("priceMax", priceHit.won, priceHit.evidence, "매매가 상한");
  } else if (!priceHit && tenureNow === "trade" && monies.length > 0
      && profile.priceMax.value === null && !salaryHit) {
    // "매매 5억" without the price anchor nearby is still the price
    // when no other money reading consumed it — but only with the
    // 매매 anchor present (guarded by evidence below).
    const fallback = nearMoney(src, /매매/, monies, 20);
    if (fallback) set("priceMax", fallback.won, fallback.evidence, "매매가 상한");
  }
  if (sizeHit && profile.sizeMin.value === null) {
    set("sizeMin", sizeHit.value, sizeHit.evidence, "최소 면적(㎡)");
  }
  if (commuteHit && profile.commuteMax.value === null) {
    set("commuteMax", commuteHit.value, commuteHit.evidence, "출퇴근 상한(분)");
  }
  if (membersHit && profile.members.value === null) {
    set("members", membersHit.members, membersHit.evidence, "함께 사는 사람");
  }
  if (workHit) {
    const workplaces = [{
      member: 0, text: workHit.text,
      resolved: workHit.resolved ? { station: workHit.resolved } : null,
    }];
    set("workplaces", workplaces, workHit.evidence,
      workHit.resolved ? `직장 근처역: ${workHit.resolved}` : "우리 자료에 없는 곳(모름)");
  }

  const errors = guardProfileValues(profile, src);
  const missing = missingQuestions(profile);
  return {
    ok: errors.length === 0,
    errors,
    profile: stripEvidence(profile),
    asked: missing.slice(0, 2),
    missing,
  };
}

function stripEvidence(profile) {
  const out = {};
  for (const [k, f] of Object.entries(profile)) {
    if (f && typeof f === "object" && "value" in f) {
      out[k] = { value: f.value, source: f.source, note: f.note || "" };
      if (f.evidence !== undefined) out[k].evidence = f.evidence;
    } else {
      out[k] = f;
    }
  }
  return out;
}

// Missing essentials that matter for the next step, in plain words.
// Order: household → workplace → tenure+budget → size/commute.
export function missingQuestions(profile) {
  const p = profile || {};
  const v = (k) => (p[k] && p[k].value !== null && p[k].value !== undefined)
    ? p[k].value : null;
  const out = [];
  if (!v("members")) {
    out.push({ field: "members", ask: "함께 사는 분이 어떻게 되세요? (예: 혼자, 둘이, 아이와 함께)" });
  }
  if (!v("workplaces")) {
    out.push({ field: "workplaces", ask: "직장은 어디쯤이세요? (가까운 역 이름으로 알려주세요)" });
  }
  const tenure = v("tenure");
  if (!tenure) {
    out.push({ field: "tenure", ask: "전세·월세·매매·공공임대 중 어떻게 살고 싶으세요?" });
  } else if (tenure === "jeonse" || tenure === "wolse" || tenure === "public") {
    if (v("depositMax") === null) {
      out.push({ field: "depositMax", ask: "보증금은 얼마까지 생각하세요? (예: 2억 이하)" });
    }
    if (tenure === "wolse" && v("monthlyMax") === null) {
      out.push({ field: "monthlyMax", ask: "월세는 매달 얼마까지 내실 수 있어요?" });
    }
  } else if (tenure === "trade") {
    if (v("priceMax") === null) {
      out.push({ field: "priceMax", ask: "집값은 얼마까지 보세요? (예: 5억 이하)" });
    }
  }
  if (v("sizeMin") === null) {
    out.push({ field: "sizeMin", ask: "집 크기는 몇 ㎡ 이상이면 좋겠어요? (모르면 넘어가도 돼요)" });
  }
  if (v("commuteMax") === null) {
    out.push({ field: "commuteMax", ask: "출퇴근은 편도 몇 분까지 괜찮으세요?" });
  }
  return out;
}

// --- scenarioFromProfile (deterministic) -----------------------------------------

function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Map a home to the area's verbatim complex name via the shared PNU
// (RTMS 단지명 and register names often differ). Null when the area
// has no building carrying the home's PNU.
export function complexNameForHome(home, area) {
  if (!home || !area) return null;
  const pnu = home.pnu;
  if (!pnu) return home.name || null;
  const ids = new Set();
  for (const b of area.buildings || []) {
    if (b && b.register && b.register.pnu === pnu) ids.add(b.id);
  }
  if (ids.size === 0) return null;
  const hits = (area.complexes || [])
    .filter((c) => (c.building_ids || []).some((id) => ids.has(id)))
    .sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1));
  return hits.length > 0 ? hits[0].name : null;
}

const HOME_LABELS = ["A", "B", "C", "D"];

// 18: household role names. The customer named these members, so the
// sim, drawer, labels and share card call them 나 / 배우자 / 아이 … —
// never "구성원 1". Explicit labels win; intake relations map
// (자녀 → 아이); the first member defaults to 나.
const RELATION_LABEL = {
  배우자: "배우자", 자녀: "아이", 아이: "아이", 부모: "부모",
  형제자매: "형제자매", 동거인: "동거인",
};

export function memberLabelFor(m, index) {
  const mem = m || {};
  if (typeof mem.label === "string" && mem.label && !/^구성원 \d+$/.test(mem.label)) {
    return mem.label;
  }
  if (mem.role === "self") return "나";
  if (mem.relation && RELATION_LABEL[mem.relation]) return RELATION_LABEL[mem.relation];
  if (mem.role === "child") return "아이";
  if (index === 0) return "나";
  if (mem.role === "member" || mem.role === "adult") {
    return index === 1 ? "배우자" : `함께 사는 사람 ${index + 1}`;
  }
  return `구성원 ${index + 1}`;
}

export function scenarioFromProfile(profile, homes, opts = {}) {
  const p = profile || {};
  const v = (k) => (p[k] ? p[k].value : null);
  const list = Array.isArray(homes) ? homes : [];
  if (list.length === 0) throw new Error("scenarioFromProfile: pick at least 1 home");
  if (list.length > 4) throw new Error("scenarioFromProfile: at most 4 homes");
  const members = v("members") || [{ role: "adult" }];
  const workplaces = v("workplaces") || [];
  const areas = opts.areas || null; // Map areaId -> area doc (for PNU join)
  const network = opts.network || null;
  const schedule = opts.schedule || null;

  const scenarioHomes = list.map((home, i) => {
    const label = HOME_LABELS[i];
    if (!home.scene) {
      throw new Error(`scenarioFromProfile: home ${home.name} has no scene box yet`
        + " — pick a candidate with 3D로 살아 보기");
    }
    let complexName = home.name;
    if (areas && typeof areas.get === "function" && areas.get(home.scene)) {
      complexName = complexNameForHome(home, areas.get(home.scene)) || home.name;
    }
    const out = { label, area: home.scene, complex_name: complexName };
    // 12b: footprint centroid for the coordinate anchor (officetels
    // and villas often form no named complex in the scene).
    if (Number.isFinite(home.lon) && Number.isFinite(home.lat)) {
      out.lon = home.lon;
      out.lat = home.lat;
    }
    return out;
  });

  const stationName = {};
  for (const h of scenarioHomes) {
    const home = list[scenarioHomes.indexOf(h)];
    if (home.station && home.station.station) {
      stationName[h.label] = home.station.station;
    } else {
      throw new Error(`scenarioFromProfile: home ${home.name} has no station walk time`
        + " — pick a candidate with a scene and a station");
    }
  }
  // Operator-schedule ride minutes for one home→workplace pair, or
  // null when either end is unknown or the network has no path.
  const derivedRideFor = (fromStation, destStation) => {
    if (!network || !schedule || !fromStation || !destStation) return null;
    const path = findPath(network, fromStation, destStation, 2.0);
    if (!path) return null;
    const d = derivedRideMinutes(fromStation, destStation, path, schedule);
    return d ? d.minutes : null;
  };
  const commuteKnown = v("commuteMax");
  const membersOut = members.map((m, i) => {
    const wp = workplaces[i] || workplaces[0] || null;
    const dest = wp && wp.resolved && wp.resolved.station ? wp.resolved.station : null;
    const out = {
      id: `m${i + 1}`,
      label: memberLabelFor(m, i),
      role: m.role || "adult",
      workdays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
      work: { type: "none" },
      errands_per_week: { supermarket: 1, convenience: 1 },
      park_walks_per_week: 1,
      clinic_visits_per_month: 0,
    };
    if ((m.role || "adult") === "child") {
      out.work = { type: "none" };
      out.schooldays = ["Mon", "Tue", "Wed", "Thu", "Fri"];
      return out;
    }
    if (Object.keys(stationName).length > 0) {
      // Precedence: the customer's number for this workplace fills
      // every home; else the schedule-derived number per home; homes
      // with neither keep needs_user_input (the engine then records
      // unavailable, never a guess).
      const custRide = wp && Number.isFinite(wp.ride_minutes)
        ? wp.ride_minutes : null;
      const rideMap = {};
      for (const h of scenarioHomes) {
        if (custRide !== null) {
          rideMap[h.label] = custRide;
          continue;
        }
        const d = derivedRideFor(stationName[h.label], dest);
        if (d !== null) rideMap[h.label] = d;
      }
      const filled = Object.keys(rideMap).length;
      const work = {
        type: "station_ride",
        station_name: { ...stationName },
        ride_minutes: rideMap,
        ride_minutes_source: custRide !== null ? "user_input"
          : filled > 0 ? "derived" : "user_input",
        needs_user_input: filled < scenarioHomes.length,
      };
      if (dest) {
        work.destination_station = dest;
        work.place = { name: `직장 (가정: ${dest}역 인근)`, station: dest };
      }
      if (commuteKnown !== null && Number.isFinite(commuteKnown)) {
        // The customer's ceiling is not a ride time — keep the map
        // empty (unavailable per home) and let run_simulation ask.
      }
      out.work = work;
    }
    return out;
  });

  const seed = hashSeed(JSON.stringify({
    members, workplaces, homes: list.map((h) => h.id),
  }));
  return {
    name: "from-profile",
    _note: "고객 프로필 + 고른 집에서 만든 시나리오. 승차 시간은 고객님이 말한 값, 없으면 운행시간표·추정(derived)으로 채우고 출처를 기록합니다.",
    start_date: "2026-11-02",
    days: 30,
    seed,
    background: 60,
    workday_minutes: 540,
    schoolday_minutes: 360,
    household: { members: membersOut },
    homes: scenarioHomes,
  };
}

// --- example profile (the demo scenario, labelled 예시) ---------------------------

export const EXAMPLE_PROFILE_LABEL = "예시";

export function exampleProfile() {
  // demo-two-homes as one example profile (values are illustrative).
  return {
    members: field([{ role: "adult" }, { role: "adult" }], "customer", "예시: 두 사람"),
    workplaces: field([{ member: 0, text: "판교", resolved: { station: "판교" } }],
      "customer", "예시: 판교로 출근"),
    salaryAnnual: field([40000000, 36000000], "customer", "예시 연봉(세전)"),
    takehomeMonthly: field(null, "asked", ""),
    cash: field(50000000, "customer", "예시: 모은 돈 5천"),
    debts: field(0, "customer", "예시: 빚 없음"),
    tenure: field("jeonse", "customer", "예시: 전세"),
    depositMax: field(300000000, "customer", "예시: 전세 3억 이하"),
    monthlyMax: field(null, "asked", ""),
    priceMax: field(null, "asked", ""),
    sizeMin: field(59, "customer", "예시: 59㎡ 이상"),
    commuteMax: field(60, "customer", "예시: 편도 60분까지"),
    priorities: field({ edu: 3, life: 3, safety: 3, money: 3, convenience: 3 },
      "customer", "예시: 모두 보통"),
    mustHaves: field([], "customer", "예시: 없음"),
    _example: true,
  };
}
