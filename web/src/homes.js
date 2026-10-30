// Candidate-home search over homes-index.json (12a, D).
//
// find_homes(profile, index, opts) filters by tenure + budget (median
// of the matching area bucket within budget, with the deals count and
// an all/none/partial budget fit), size, kind, regions, commute and
// must-haves. Sorting is the customer's choice (commute | monthly |
// deals | priority); the default "출퇴근 짧은 순" is shown as the sort.
// No score, no "추천 1위" — the output is a plain ordered list.
//
// Commute honesty: walk minutes come from the built-box graph when the
// home is inside one (else "도보 미확인"); the ride path (lines,
// transfers, km) comes from the stage-8 network; ride minutes are the
// customer's number when given, else derived from the operator's
// schedule (서울교통공사 표준 운행시간) or the 1–8-line average-speed
// estimate, labelled per leg (C-ride-minutes). Only a missing path
// stays "승차 미확인". Nothing is guessed, never straight-line.
//
// find_public_rentals(profile, snapshot, opts) applies the same
// budget/size rules to the public-rental snapshot (stage 6/10 rules)
// and reports per-region coverage ("이 지역 공공임대 자료 없음").

import { findPath } from "./engine/journey.js";
import { rideMinutes } from "./transit/schedule.js";
import { photosNear, PHOTOS_DISCLAIMER } from "./places/photos.js";
import { nearestStationByWalk } from "./walkgraph.js";

export const HOME_SORTS = ["commute", "monthly", "deals", "priority"];
export const DEFAULT_HOME_SORT = "commute";
export const HOME_SORT_KO = {
  commute: "출퇴근 짧은 순",
  monthly: "매달 드는 돈 적은 순",
  deals: "거래 많은 순",
  priority: "내 우선순위 순",
};

export const SOURCE_BADGES = {
  rtms: "실거래(국토교통부 25.10–26.10)",
  graph: "도보(그래프)",
  network: "노선도(OSM)",
  schedule: "서울교통공사 표준 운행시간",
  estimate: "추정 · 1~8호선 평균 속도",
  photos: "주변 사진",
  public: "공공임대(LH·마이홈)",
};

const TENURE_BUCKET = { jeonse: "jeonse", wolse: "wolse", trade: "trade" };

// --- 18: candidate honesty ------------------------------------------------------
// Public-rental complexes (register names carrying 임대/공공임대) never
// appear in 전세·월세·매매 results — they belong to the 공공임대 path
// (find_public_rentals over the LH snapshot, or tenure=public here).
export function isPublicRentalHome(home) {
  const name = String((home && (home.name || home.osm_name)) || "");
  if (!name) return false;
  if (name.includes("공공임대")) return true;
  if (name.includes("영구임대")) return true;
  // Register names mark rentals with an 임대 suffix in parentheses,
  // e.g. "백현마을3단지(주공)임대". A bare 임대 elsewhere in the name
  // (street/area words) must not match.
  return /임대\)?\s*$/.test(name) || /\(.*임대.*\)\s*$/.test(name);
}

// A reference price resting on a single trade far below the local
// market is not marked "예산 안 ✓": it shows a check note and sorts
// after the others. "Far below" = under 50 % of the median reference
// for the same kind + size band in the same region (시군구-level id).
// Pure over one shown tenure entry + the full index home list.
export const THIN_DEAL_NOTE = "실거래 1건 · 시세보다 크게 낮아 확인이 필요해요";

export function groupMedianFor({ kind, region, centerM2, tenureKey }, homes) {
  const meds = [];
  for (const h of homes || []) {
    if (!h || h.kind !== kind || h.region !== region) continue;
    if (isPublicRentalHome(h)) continue;
    for (const b of h.buckets || []) {
      if (!b || b.center_m2 !== centerM2) continue;
      const stat = tenureKey === "wolse" ? b.wolse && b.wolse.monthly : b[tenureKey];
      const med = stat ? stat.median_won : null;
      if (Number.isFinite(med) && med > 0) meds.push(med);
    }
  }
  if (meds.length === 0) return null;
  meds.sort((a, b) => a - b);
  const mid = Math.floor(meds.length / 2);
  return meds.length % 2 === 1 ? meds[mid] : Math.round((meds[mid - 1] + meds[mid]) / 2);
}

export function thinDealNote({ medianWon, deals, kind, region, centerM2, tenureKey }, homes) {
  if (deals !== 1) return null;
  if (!Number.isFinite(medianWon) || medianWon <= 0) return null;
  const group = groupMedianFor({ kind, region, centerM2, tenureKey }, homes);
  if (group === null || !(group > 0)) return null;
  return medianWon < group * 0.5 ? THIN_DEAL_NOTE : null;
}

// Most deals first when no size floor is set; else the smallest bucket
// whose top (center+5) reaches the floor.
export function pickBucket(buckets, tenureKey, sizeMin) {
  const cands = (buckets || [])
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => b && b[TENURE_BUCKET[tenureKey]]);
  if (cands.length === 0) return null;
  if (sizeMin === null || sizeMin === undefined) {
    cands.sort((x, y) => {
      const cx = x.b[TENURE_BUCKET[tenureKey]].count || 0;
      const cy = y.b[TENURE_BUCKET[tenureKey]].count || 0;
      if (cy !== cx) return cy - cx;
      return (x.b.center_m2 ?? 0) - (y.b.center_m2 ?? 0);
    });
    return cands[0].b;
  }
  // 26c: a bucket with no size (center_m2 null, e.g. US ZIP rents)
  // is always eligible, ignoring sizeMin.
  const fits = cands.filter(({ b }) => b.center_m2 === null
    || b.center_m2 === undefined || b.center_m2 + 5 >= sizeMin);
  if (fits.length === 0) return null;
  fits.sort((x, y) => x.b.center_m2 - y.b.center_m2);
  return fits[0].b;
}

function bucketMedian(bucket, tenureKey) {
  if (tenureKey === "wolse") {
    const m = bucket.wolse && bucket.wolse.monthly;
    return m ? m.median_won : null;
  }
  const s = bucket[tenureKey];
  return s ? s.median_won : null;
}

function bucketCount(bucket, tenureKey) {
  const s = bucket[tenureKey];
  return s ? s.count || 0 : 0;
}

// Budget fit from the bucket range: all deals fit / none fit / mixed
// (the index keeps medians and ranges, not per-deal prices).
export function budgetFit(bucket, tenureKey, budgetWon) {
  if (budgetWon === null || budgetWon === undefined) return "unknown";
  const stat = tenureKey === "wolse"
    ? bucket.wolse && bucket.wolse.monthly
    : bucket[tenureKey];
  if (!stat) return "none";
  if (stat.max_won !== null && stat.max_won <= budgetWon) return "all";
  if (stat.min_won !== null && stat.min_won > budgetWon) return "none";
  return "partial";
}

export function monthlyCostOf(bucket, tenureKey) {
  // Comparable "매달 드는 돈" for sorting: wolse monthly median;
  // jeonse/trade have no monthly figure here (null sorts last).
  if (tenureKey === "wolse") return bucketMedian(bucket, "wolse");
  return null;
}

function profileValue(profile, key) {
  const f = profile && profile[key];
  return f ? f.value : null;
}

export const SAME_STATION_KO = "직장역과 같은 역 · 지하철 안 타요";

// 26c: when the workplace resolves to a place (Meta HQ) and the home
// carries work_targets for it, the commute is the assumed-speed
// walk/bike estimate: walk when walk_minutes <= 25 (C-walk-commute-max),
// else bike. `walk` keeps the station walk as today; `ride` stays
// unknown. Exported for tests.
export function commuteSummary(home, workplace, network, schedule = null, walkgraphs = null, walkMps = null) {
  let walk = home.station && Number.isFinite(home.station.walk_minutes)
    ? { minutes: home.station.walk_minutes, station: home.station.station, known: true }
    : { minutes: null, station: null, known: false };
  // 13: homes outside the 3D boxes walk on the region walk graph.
  if (!walk.known && walkgraphs && typeof walkgraphs.get === "function"
      && Number.isFinite(home.lon) && Number.isFinite(home.lat)) {
    const graph = walkgraphs.get(home.region);
    if (graph) {
      const best = nearestStationByWalk(graph, home.lon, home.lat,
        Number.isFinite(walkMps) ? walkMps : undefined);
      if (best) {
        walk = { minutes: best.minutes, station: best.station, known: true, via: "walkgraph" };
      }
    }
  }
  let ride = {
    known: false, lines: [], transfers: [], distanceKm: null,
    minutes: null, source: null, note: null,
  };
  const dest = workplace && workplace.resolved && workplace.resolved.station;
  if (walk.station && dest && network) {
    const path = findPath(network, walk.station, dest, 2.0);
    if (path) {
      ride = {
        known: false,
        lines: (path.legs || []).map((l) => l.lineName || l.line),
        transfers: path.transfers || [],
        distanceKm: path.distanceKm,
        minutes: null, source: null, note: null,
      };
      if (schedule) {
        const derived = rideMinutes(walk.station, dest, path, schedule);
        if (derived) {
          ride = {
            ...ride, known: true, minutes: derived.minutes,
            source: "derived", note: derived.note, derived,
          };
        }
      }
    }
  }
  // The customer's own number beats every derivation, with or without
  // a path (a path only adds the lines/transfers/km description).
  const customerRide = workplace && Number.isFinite(workplace.ride_minutes)
    ? workplace.ride_minutes : null;
  if (customerRide !== null) {
    ride = {
      ...ride, known: true, minutes: customerRide, source: "customer",
      note: "고객님이 알려주신 값", derived: null,
    };
  }
  // 13: a home at the workplace station needs no subway at all.
  const destStation = dest || null;
  const sameStation = Boolean(walk.station && destStation && walk.station === destStation)
    || (ride.distanceKm === 0 && walk.station && destStation);
  if (sameStation) {
    ride = {
      ...ride, known: true, minutes: 0, source: ride.source || "derived",
      note: SAME_STATION_KO, sameStation: true,
      lines: [], transfers: [], distanceKm: 0,
    };
  }
  // 26c: a resolved place (not a station) commutes by assumed walk/bike
  // speed from the home's work_targets. No target for that place means
  // work: null. Korean summaries keep their shape (no work key).
  const place = workplace && workplace.resolved && workplace.resolved.place;
  if (place && place.id) {
    const wt = home.work_targets && home.work_targets[place.id];
    let work = null;
    if (wt && Number.isFinite(wt.walk_minutes) && Number.isFinite(wt.bike_minutes)) {
      const mode = wt.walk_minutes <= 25 ? "walk" : "bike";
      work = {
        target: place.id, name: place.name,
        walk_minutes: wt.walk_minutes, bike_minutes: wt.bike_minutes,
        mode, minutes: mode === "walk" ? wt.walk_minutes : wt.bike_minutes,
        source: "assumed_speed",
      };
    }
    return { walk, ride, destStation, sameStation, work };
  }
  return { walk, ride, destStation, sameStation };
}

export function commuteLine(summary) {
  const bits = [];
  const walkText = !summary.walk.known ? "도보 미확인"
    : summary.walk.minutes < 1
      ? `집에서 ${summary.walk.station}까지 도보 1분 이내 (그래프)`
      : `집에서 ${summary.walk.station}까지 도보 ${summary.walk.minutes}분 (그래프)`;
  bits.push(walkText);
  // 13: never print "0분 (0km)" — a home at the workplace station
  // says so in words.
  if (summary.sameStation || summary.ride.sameStation) {
    bits.push(SAME_STATION_KO);
    return bits.join(" · ");
  }
  if (summary.ride.lines.length > 0) {
    const route = summary.ride.lines.join(" → ");
    const xfer = summary.ride.transfers.length > 0
      ? ` (환승 ${summary.ride.transfers.length}회: ${summary.ride.transfers.join(", ")})` : "";
    bits.push(`${route}${xfer} · 노선 ${summary.ride.distanceKm} km`);
  }
  if (summary.ride.source === "customer") {
    bits.push(`승차 ${summary.ride.minutes}분 (고객님이 알려주신 값)`);
  } else if (summary.ride.source === "derived" && summary.ride.note) {
    bits.push(`승차 약 ${summary.ride.minutes}분 (${summary.ride.note})`);
  } else if (summary.ride.known) {
    bits.push(`승차 ${summary.ride.minutes}분`);
  } else {
    bits.push("승차 미확인 — 노선도에 경로가 없어요");
  }
  return bits.join(" · ");
}

function mustHaveMatcher(text) {
  // "초등학교 도보 10분" -> {category: "school", minutes: 10}.
  const s = String(text || "");
  const m = s.match(/(\d+)\s*분/);
  const minutes = m ? Number(m[1]) : 10;
  const cats = [
    [/초등|중학교|고등학교|학교|학원|유치원|어린이집/, "school"],
    [/공원|산책|놀이터/, "park"],
    [/병원|의원|약국|보건/, "clinic"],
    [/마트|시장|장보기|편의점|슈퍼/, "shop"],
    [/역|지하철/, "station"],
  ];
  for (const [re, cat] of cats) {
    if (re.test(s)) return { category: cat, minutes, text: s };
  }
  return null;
}

// Shortest walk minutes from (lon, lat) to any POI of a category in a
// built box (Dijkstra over the walk graph; null when uncheckable).
export function amenityMinutes(lon, lat, category, box) {
  if (!box || !box.graph) return null;
  const nodes = box.graph.nodes || {};
  const ids = Object.keys(nodes);
  if (ids.length === 0) return null;
  // POI matching mirrors engine/places.js + education.js category sets.
  const CATS = {
    school: new Set(["amenity:school", "amenity:kindergarten", "amenity:childcare",
      "amenity:library", "amenity:prep_school", "amenity:language_school",
      "amenity:music_school", "amenity:arts_school", "amenity:college"]),
    park: new Set(["leisure:park", "leisure:playground"]),
    clinic: new Set(["amenity:clinic", "amenity:pharmacy", "amenity:doctors",
      "amenity:dentist", "amenity:hospital"]),
    shop: new Set(["shop:supermarket", "shop:convenience", "amenity:marketplace"]),
    station: new Set(["railway:station", "railway:subway_station", "public_transport:station"]),
  };
  const want = CATS[category] || new Set();
  const pois = (box.pois || []).filter((p) => want.has(p.category));
  if (pois.length === 0) return null;
  const nearest = (x, y) => {
    let best = null;
    let bestD = Infinity;
    for (const id of ids) {
      const c = nodes[id];
      const d = (c[0] - x) ** 2 + (c[1] - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return best;
  };
  const edges = box.graph.edges || {};
  const walks = edges.walk || [];
  const adj = new Map();
  for (const e of walks) {
    if (!e.from || !e.to || !Number.isFinite(e.length_m)) continue;
    if (!adj.has(e.from)) adj.set(e.from, []);
    if (!adj.has(e.to)) adj.set(e.to, []);
    adj.get(e.from).push([e.to, e.length_m]);
    adj.get(e.to).push([e.from, e.length_m]);
  }
  const start = nearest(lon, lat);
  if (!start) return null;
  const dist = new Map([[start, 0]]);
  const heap = [[0, start]];
  const pop = () => {
    heap.sort((a, b) => a[0] - b[0]);
    return heap.shift();
  };
  while (heap.length > 0) {
    const [d, node] = pop();
    if (d > dist.get(node)) continue;
    for (const [nxt, w] of adj.get(node) || []) {
      const nd = d + w;
      if (nd < (dist.get(nxt) ?? Infinity)) {
        dist.set(nxt, nd);
        heap.push([nd, nxt]);
      }
    }
  }
  let best = null;
  for (const p of pois) {
    const g = p.geometry || {};
    if (g.type !== "Point" || !Array.isArray(g.coordinates)) continue;
    const node = nearest(g.coordinates[0], g.coordinates[1]);
    if (node === null || !dist.has(node)) continue;
    const mins = dist.get(node) / 1.3 / 60;
    if (best === null || mins < best) best = mins;
  }
  return best === null ? null : Math.round(best * 10) / 10;
}

function sortResults(rows, sort, profile, boxes) {
  const prio = profileValue(profile, "priorities") || {};
  const prioEntries = Object.entries(prio)
    .filter(([, w]) => Number.isFinite(w))
    .sort((a, b) => b[1] - a[1]);
  const topPrio = prioEntries.length > 0 ? prioEntries[0][0] : null;
  let note = `정렬: ${HOME_SORT_KO[sort] || sort}`;
  if (sort === "commute" && rows.length > 0
      && !rows.some((r) => r.commute.walk.known)) {
    note = "정렬: 출퇴근 짧은 순 (도보 확인된 집이 없어 거래 많은 순으로 보여드려요)";
  }
  if (sort === "priority" && rows.length > 0
      && (topPrio === "edu" || topPrio === "life" || topPrio === "convenience")) {
    const cat = topPrio === "edu" ? "school" : topPrio === "life" ? "shop" : "park";
    const anyMeasured = rows.some((r) => {
      const m = r.must_have_minutes && r.must_have_minutes[cat];
      return m !== null && m !== undefined;
    });
    if (!anyMeasured) {
      note = "정렬: 내 우선순위 순 (잴 수 있는 집이 없어 거래 많은 순으로 보여드려요)";
    }
  }
  const key = (r) => {
    if (sort === "monthly") {
      return r.monthly_cost_won === null ? Infinity : r.monthly_cost_won;
    }
    if (sort === "deals") {
      return -(r.deals_in_bucket || 0);
    }
    if (sort === "priority") {
      if (topPrio === "money") {
        return r.monthly_cost_won === null ? Infinity : r.monthly_cost_won;
      }
      if (topPrio === "edu" || topPrio === "life" || topPrio === "convenience") {
        const cat = topPrio === "edu" ? "school" : topPrio === "life" ? "shop" : "park";
        const m = r.must_have_minutes && r.must_have_minutes[cat];
        return m === null || m === undefined ? Infinity : m;
      }
      if (!topPrio) {
        note = "정렬: 우선순위를 아직 안 정해서 출퇴근 짧은 순으로 보여드려요";
        return commuteKey(r);
      }
      // safety (or none): no score, no ranking — fall back to commute.
      note = "정렬: 치안은 순위를 매기지 않으므로 출퇴근 짧은 순으로 보여드려요";
      return commuteKey(r);
    }
    return commuteKey(r);
  };
  const commuteKey = (r) => {
    // 26c: a work estimate sorts by its minutes (known before unknown).
    if (r.commute && r.commute.work) {
      const m = r.commute.work.minutes;
      return Number.isFinite(m) ? m : Infinity;
    }
    // Known walk first, then known ride minutes, then the shortest
    // walk+ride total; fewer transfers and shorter line km break ties.
    // Unknown walk sorts after known.
    const w = r.commute.walk.known ? 0 : 1;
    const mins = r.commute.ride.minutes;
    const rk = Number.isFinite(mins) ? 0 : 1;
    const total = (r.commute.walk.known ? r.commute.walk.minutes : 0)
      + (Number.isFinite(mins) ? mins : 0);
    const t = (r.commute.ride.transfers || []).length;
    const km = r.commute.ride.distanceKm === null ? 1e9 : r.commute.ride.distanceKm;
    return w * 1e12 + rk * 1e11 + total * 1e6 + t * 1e4 + km;
  };
  const rowsOut = [...rows].sort((a, b) => {
    // 18: thin-deal rows (lone trade far below market) sort after the
    // others whatever the customer's sort is.
    const ta = a.thin_deal ? 1 : 0;
    const tb = b.thin_deal ? 1 : 0;
    if (ta !== tb) return ta - tb;
    const ka = key(a);
    const kb = key(b);
    if (ka !== kb) return ka - kb;
    if ((b.deals_in_bucket || 0) !== (a.deals_in_bucket || 0)) {
      return (b.deals_in_bucket || 0) - (a.deals_in_bucket || 0);
    }
    return String(a.id) < String(b.id) ? -1 : 1;
  });
  return { rows: rowsOut, sort_note: note };
}

function rideSourceBadges(ride) {
  if (!ride || ride.source !== "derived" || !ride.derived) return [];
  const methods = ride.derived.methodsUsed || [];
  const out = [];
  if (methods.includes("schedule")) out.push(SOURCE_BADGES.schedule);
  if (methods.includes("estimate")) out.push(SOURCE_BADGES.estimate);
  return out;
}

// --- 21a: housing-type preference ------------------------------------------------
// The customer's own words (profile.home_kinds, e.g. [오피스텔]).
// Keeps only those kinds when at least 3 remain; otherwise fills with
// the others and flags them kind_mismatch (labelled
// "원하신 유형이 아니에요" on the card). Pure.
export const KIND_MISMATCH_KO = "원하신 유형이 아니에요";

export function applyKindPreference(candidates, homeKinds) {
  const list = Array.isArray(candidates) ? candidates : [];
  const wants = (Array.isArray(homeKinds) ? homeKinds : []).filter(Boolean);
  if (wants.length === 0) return list;
  const matching = list.filter((c) => wants.includes(c && c.kind));
  if (matching.length >= 3) return matching;
  return list.map((c) => (wants.includes(c && c.kind)
    ? c : { ...c, kind_mismatch: true }));
}

// --- 21a: lot-number names ------------------------------------------------------
// A bare lot number ("(242-4)", "242-4") is not a name: show
// "{동} {유형} ({지번})", e.g. "대치동 연립·다세대 (242-4)". Pure.
const LOT_NAME_RE = /^\(?\d+(-\d+)?\)?$/;

export function displayNameFor(candidate) {
  const name = candidate ? String(candidate.name || "").trim() : "";
  if (!name || !LOT_NAME_RE.test(name)) return candidate ? candidate.name : name;
  const lot = name.replace(/^\(/, "").replace(/\)$/, "");
  const place = (candidate.dong || candidate.region || "").trim();
  const kind = (candidate.kind || "").trim();
  if (place && kind) return `${place} ${kind} (${lot})`;
  if (kind) return `${kind} (${lot})`;
  if (place) return `${place} (${lot})`;
  return candidate.name;
}

export function find_homes(profile, index, opts = {}) {
  const tenure = profileValue(profile, "tenure");
  const sizeMin = profileValue(profile, "sizeMin");
  const commuteMax = profileValue(profile, "commuteMax");
  const workplaces = profileValue(profile, "workplaces") || [];
  const workplace = workplaces[0] || null;
  const regions = opts.regions || null; // customer-named region ids
  const kind = opts.kind || null; // 아파트 | 연립·다세대 | 오피스텔
  const mustHaves = (profileValue(profile, "mustHaves") || [])
    .map(mustHaveMatcher).filter(Boolean);
  const sort = opts.sort || DEFAULT_HOME_SORT;
  const limit = Math.max(1, Math.min(12, opts.limit || 6));
  const network = opts.network || null;
  const schedule = opts.schedule || null; // parsed interstation schedule
  const boxes = opts.boxes || null; // Map boxId -> {graph, pois}
  const manifest = opts.photos || null;
  const walkgraphs = opts.walkgraphs || null; // Map region -> walk graph
  const walkMps = Number.isFinite(opts.walkMps) ? opts.walkMps : null; // 가정 바꾸기 override

  const budgets = {
    jeonse: profileValue(profile, "depositMax"),
    wolse: profileValue(profile, "monthlyMax"),
    trade: profileValue(profile, "priceMax"),
  };
  // 18: tenure=public lists only public-rental complexes (all their
  // buckets); every other tenure skips them — they are not normal
  // 전세·월세·매매 homes.
  const publicOnly = tenure === "public";
  const tenureKeys = tenure === "undecided" || !tenure
    ? ["jeonse", "wolse", "trade"]
    : publicOnly ? ["jeonse", "wolse", "trade"] : [tenure];
  const homes = (index && index.homes) || [];
  const rows = [];
  for (const home of homes) {
    if (regions && !regions.includes(home.region)) continue;
    if (kind && home.kind !== kind) continue;
    if (isPublicRentalHome(home) !== publicOnly) continue;
    const commute = commuteSummary(home, workplace, network, schedule, walkgraphs, walkMps);
    // 26c: with a work estimate the commuteMax filter compares its minutes.
    const commuteMins = commute.work ? commute.work.minutes
      : (commute.walk.known ? commute.walk.minutes : null);
    if (commuteMax !== null && Number.isFinite(commuteMins) && commuteMins > commuteMax) continue;
    // Tenure buckets: median within budget (or no budget set).
    const shown = [];
    for (const key of tenureKeys) {
      const bucket = pickBucket(home.buckets, key, sizeMin);
      if (!bucket) continue;
      const median = bucketMedian(bucket, key);
      const budget = budgets[key];
      if (budget !== null && median !== null && median > budget) continue;
      const deals = bucketCount(bucket, key);
      // 18: a lone trade far below the local market is never "예산 안 ✓".
      const thin = thinDealNote({ medianWon: median, deals,
        kind: home.kind, region: home.region, centerM2: bucket.center_m2,
        tenureKey: key }, homes);
      const fit = budgetFit(bucket, key, budget);
      shown.push({
        tenure: key, bucket_center_m2: bucket.center_m2,
        range_m2: bucket.range_m2,
        median_won: median,
        min_won: key === "wolse"
          ? bucket.wolse.monthly && bucket.wolse.monthly.min_won
          : bucket[key].min_won,
        max_won: key === "wolse"
          ? bucket.wolse.monthly && bucket.wolse.monthly.max_won
          : bucket[key].max_won,
        deals,
        budget_fit: thin && fit === "all" ? "unknown" : fit,
        thin_deal: thin,
        deposit_median_won: key === "wolse" && bucket.wolse.deposit
          ? bucket.wolse.deposit.median_won : null,
      });
    }
    if (shown.length === 0) continue;
    // Must-haves where data exists (inside built boxes only).
    const mustHaveMinutes = {};
    let mustFail = false;
    const box = home.scene && boxes && typeof boxes.get === "function"
      ? boxes.get(home.scene) : null;
    for (const mh of mustHaves) {
      const mins = box ? amenityMinutes(home.lon, home.lat, mh.category, box) : null;
      mustHaveMinutes[mh.category] = mins;
      if (mins !== null && mins > mh.minutes) mustFail = true;
    }
    if (mustFail) continue;
    const thinRow = shown.map((s) => s.thin_deal).find(Boolean) || null;
    const dealCount = shown.reduce((a, s) => a + (s.deals || 0), 0);
    const monthly = shown
      .filter((s) => s.tenure === "wolse" && s.median_won !== null)
      .map((s) => s.median_won);
    rows.push({
      id: home.id,
      name: home.name,
      kind: home.kind,
      region: home.region,
      dong: home.dong || null,
      lon: home.lon,
      lat: home.lat,
      build_year: home.build_year,
      // 12b: match (register|osm_name) for the card's 위치 line, pnu
      // for the scene-complex join (same as build_scenario).
      match: home.match || "register",
      pnu: home.pnu || null,
      osm_name: home.osm_name || (home.osm && home.osm.name) || null,
      tenures: shown,
      // 26c: a USD home carries its currency and ZIP price through.
      ...(home.currency ? { currency: home.currency } : {}),
      ...(home.price ? { price: home.price } : {}),
      thin_deal: thinRow,
      deals_in_bucket: dealCount,
      monthly_cost_won: monthly.length > 0 ? Math.min(...monthly) : null,
      commute,
      commute_ko: commuteLine(commute),
      // 13: sceneless homes with graph-measured walks run the 2D map sim.
      walkgraph: !home.scene && commute.walk.known && commute.walk.via === "walkgraph",
      must_have_minutes: mustHaveMinutes,
      scene: home.scene || null,
      photos: manifest ? photosNear(home.lon, home.lat, manifest, { limit: 6 }) : [],
      photos_note: PHOTOS_DISCLAIMER,
      sources: [
        SOURCE_BADGES.rtms,
        ...(commute.walk.known ? [SOURCE_BADGES.graph] : []),
        ...(commute.ride.lines.length > 0 ? [SOURCE_BADGES.network] : []),
        ...rideSourceBadges(commute.ride),
      ],
    });
  }
  const { rows: sorted, sort_note } = sortResults(rows, sort, profile, boxes);
  return {
    ok: true,
    count: sorted.length,
    total_matching: rows.length,
    sort,
    sort_note,
    candidates: sorted.slice(0, limit),
    tenure: tenure || "undecided",
  };
}

// --- public rentals --------------------------------------------------------------

// Address -> region id via the 시군구 segment (not substring: road
// names like 위례성대로/강동대로 must not fake coverage). Returns null
// when the address names no covered area.
export function regionOfAddress(addr) {
  const s = String(addr || "");
  const gu = (s.match(/(성동구|송파구|강남구|강동구|분당구|수정구|중원구|수지구)/) || [])[1];
  const GU_REGION = { 성동구: "seongdong", 송파구: "songpa-gu", 강남구: "gangnam",
    강동구: "gangdong", 분당구: "bundang", 수정구: "sujeong",
    중원구: "jungwon", 수지구: "suji" };
  if (gu) return GU_REGION[gu];
  if (/(^|[\s,])위례동/.test(s)) return "wirye";
  return null;
}

export function publicRentalCoverage(snapshot, regionIds) {
  // Per-region presence from parsed 시군구 segments.
  const complexes = (snapshot && snapshot.complexes) || [];
  const out = {};
  for (const region of regionIds || []) {
    const id = typeof region === "string" ? region : region.id;
    out[id] = { present: false, complexes: 0 };
  }
  for (const c of complexes) {
    const hit = regionOfAddress(c.address);
    if (hit && out[hit]) {
      out[hit].present = true;
      out[hit].complexes += 1;
    }
  }
  return out;
}

export const NO_PUBLIC_RENTAL_NOTE = "이 지역 공공임대 자료 없음";

export function find_public_rentals(profile, snapshot, opts = {}) {
  const depositMax = profileValue(profile, "depositMax");
  const monthlyMax = profileValue(profile, "monthlyMax");
  const sizeMin = profileValue(profile, "sizeMin");
  const limit = Math.max(1, Math.min(12, opts.limit || 6));
  const regions = opts.regions || null; // region ids (customer-named)
  const out = [];
  for (const c of (snapshot && snapshot.complexes) || []) {
    if (regions) {
      const hit = regionOfAddress(c.address);
      if (!regions.includes(hit)) continue;
    }
    for (const u of c.unit_types || []) {
      if (depositMax !== null && u.deposit_won !== null && u.deposit_won > depositMax) continue;
      if (monthlyMax !== null && u.monthly_rent_won !== null && u.monthly_rent_won > monthlyMax) continue;
      if (sizeMin !== null && u.exclusive_area_m2 !== null && u.exclusive_area_m2 + 5 < sizeMin) continue;
      out.push({
        complex_name: c.name,
        address: c.address,
        unit_type: u.unit_type,
        building_type: u.building_type,
        exclusive_area_m2: u.exclusive_area_m2,
        deposit_won: u.deposit_won,
        monthly_rent_won: u.monthly_rent_won,
        sources: [SOURCE_BADGES.public],
      });
    }
  }
  out.sort((a, b) => {
    const am = a.monthly_rent_won === null ? Infinity : a.monthly_rent_won;
    const bm = b.monthly_rent_won === null ? Infinity : b.monthly_rent_won;
    if (am !== bm) return am - bm;
    const ad = a.deposit_won === null ? Infinity : a.deposit_won;
    const bd = b.deposit_won === null ? Infinity : b.deposit_won;
    if (ad !== bd) return ad - bd;
    return String(a.complex_name) < String(b.complex_name) ? -1 : 1;
  });
  return {
    ok: true,
    count: Math.min(out.length, limit),
    total_matching: out.length,
    sort_note: "정렬: 매달 드는 돈 적은 순",
    candidates: out.slice(0, limit),
    eligibility_note: "입주 자격은 공고 원문에서 확인해 주세요.",
  };
}
