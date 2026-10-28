// Customer-pasted private listings + public notice filtering (pure).
//
// There is no open API for private listings, so the customer pastes the
// listing text they see (or types it). parseListingText extracts fields
// with regular expressions — every returned value carries the exact
// substring it came from (evidence), and guardListingValues rejects any
// value whose evidence is not in the pasted text, so nothing is ever
// invented. Missing fields come back as plain ask-back questions.
//
// listingPosition places one asking price among the same complex/area
// bucket's real transactions (median, range, cheaper/pricier counts —
// never "싸다/비싸다"). filterPublicListings slices the public-housing
// snapshot (complexes + notices) by region, recency, area and distance
// to the workplace.

import { statsOf, AREA_BUCKET_TOL_M2 } from "./prices.js";

export const LISTING_TEXT_MAX = 2000;
export const PYEONG_M2 = 3.3058;
export const LISTING_MIN_TRADES = 3;

// --- money parsing -----------------------------------------------------------
// "9억 8000만" / "9억8000" / "9.8억" / "4억/200" / "200만원" / "200만".

function parseEokMan(s, startAt = 0) {
  // Returns [{value, evidence, index}] for 억 amounts with optional 만 tail.
  const out = [];
  const re = /(\d+(?:\.\d+)?)\s*억/g;
  re.lastIndex = startAt;
  for (const m of s.matchAll(re)) {
    const eok = Number(m[1]);
    const rest = s.slice(m.index + m[0].length);
    const strict = /^(\s*)(\d[\d,]*)\s*만/.exec(rest);
    // Bare tail ("9억8000" = 9억 8000만): digits not followed by more
    // digits, Korean, or 원 (so "5층" and years never attach).
    const bare = strict ? null : /^(\s*)(\d{1,4})\s*(?![\d가-힣a-zA-Z원])/.exec(rest);
    let won = Math.round(eok * 100000000);
    let evidence = m[0];
    const tail = strict || bare;
    if (tail) {
      won += Number(tail[2].replace(/,/g, "")) * 10000;
      evidence += tail[0];
    }
    out.push({ value: won, evidence, index: m.index });
  }
  return out;
}

function parseManOnly(s) {
  // Standalone 만 amounts (monthly rent, maintenance): "200만원" / "200만".
  const out = [];
  for (const m of s.matchAll(/(\d[\d,]*)\s*만\s*원?/g)) {
    const before = s.slice(Math.max(0, m.index - 6), m.index);
    if (/억\s*$/.test(before)) continue; // belongs to an 억 amount
    out.push({ value: Number(m[1].replace(/,/g, "")) * 10000,
      evidence: m[0], index: m.index });
  }
  return out;
}

function nearestAfter(matches, keywordIdx, window = 18) {
  let best = null;
  for (const m of matches || []) {
    if (m.index < keywordIdx) continue;
    if (m.index - keywordIdx > window) break;
    if (!best) best = m;
  }
  return best;
}

function firstMatch(re, s) {
  const m = re.exec(s);
  return m ? { value: m[0], index: m.index, groups: m } : null;
}

// --- main parser ---------------------------------------------------------------

export function parseListingText(input) {
  const text = String(input || "");
  if (!text.trim()) {
    return { ok: false, error: "매물 글을 붙여 넣어 주세요.", fields: null, missing: [] };
  }
  if (text.length > LISTING_TEXT_MAX) {
    return { ok: false, error: `매물 글은 ${LISTING_TEXT_MAX}자까지 읽어요.`, fields: null, missing: [] };
  }
  const eoks = parseEokMan(text);
  const mans = parseManOnly(text);

  // Deal type from explicit words (월세 wins when both deposit and
  // monthly words appear).
  const hasWolse = /월세/.test(text);
  const hasJeonse = /전세/.test(text);
  const hasTrade = /매매|분양가|매매가/.test(text);
  let dealType = null;
  if (hasWolse) dealType = "월세";
  else if (hasJeonse) dealType = "전세";
  else if (hasTrade) dealType = "매매";
  else if (/보증금/.test(text) && mans.length > 0) dealType = "월세";
  else if (/보증금/.test(text)) dealType = "전세";

  const dealEvidence = dealType === "월세" ? (firstMatch(/월세/, text) || {}).value
    : dealType === "전세" ? (firstMatch(/전세|보증금/, text) || {}).value
    : dealType === "매매" ? (firstMatch(/매매|분양가|매매가/, text) || {}).value
    : null;

  const field = (value, evidence) =>
    (value === null || value === undefined || !evidence ? null : { value, evidence });

  // Prices: prefer amounts right after the keyword, else the first amount.
  const kwIdx = (re) => {
    const m = firstMatch(re, text);
    return m ? m.index : -1;
  };
  let priceWon = null;
  let depositWon = null;
  let monthlyWon = null;
  if (dealType === "매매") {
    const near = nearestAfter(eoks, Math.max(0, kwIdx(/매매가|매매|분양가/))) || eoks[0];
    if (near) priceWon = field(near.value, near.evidence);
  } else if (dealType === "전세") {
    const near = nearestAfter(eoks, Math.max(0, kwIdx(/전세|보증금/))) || eoks[0];
    if (near) depositWon = field(near.value, near.evidence);
  } else if (dealType === "월세") {
    const depNear = nearestAfter(eoks, Math.max(0, kwIdx(/보증금|월세/))) || eoks[0];
    if (depNear) depositWon = field(depNear.value, depNear.evidence);
    // Monthly: a 만 amount after 월/월세, else after a slash, else any 만.
    const slashMan = /\/\s*(\d[\d,]*)\s*(만\s*원?)?/.exec(text);
    const monNear = nearestAfter(mans, Math.max(0, kwIdx(/월세|월\s*\d|월$/m)));
    if (monNear && monNear !== undefined) monthlyWon = field(monNear.value, monNear.evidence);
    else if (slashMan) {
      const raw = Number(slashMan[1].replace(/,/g, ""));
      const won = slashMan[2] ? raw * 10000 : (raw < 10000 ? raw * 10000 : raw);
      monthlyWon = field(won, slashMan[0]);
    } else if (mans[0]) {
      monthlyWon = field(mans[0].value, mans[0].evidence);
    }
    // A lone 만 amount with no 억 deposit is the monthly rent of a
    // small monthly listing ("월 1000만 보증금" patterns stay deposit-less
    // rather than invented).
    if (!depositWon && mans.length > 0 && eoks.length === 0) {
      const big = mans.find((m) => m.value >= 50000000);
      if (big && big !== (monthlyWon && mans.find((m) => m.evidence === monthlyWon.evidence))) {
        depositWon = field(big.value, big.evidence);
      }
    }
  }

  // Area: ㎡ first, 평 converts with the stated factor.
  let areaM2 = null;
  let areaNote = null;
  const m2 = firstMatch(/(\d+(?:\.\d+)?)\s*(㎡|m2|제곱미터)/, text);
  const pyeong = firstMatch(/(\d+(?:\.\d+)?)\s*평/, text);
  if (m2) {
    areaM2 = field(Number(m2.groups[1]), m2.value);
  } else if (pyeong) {
    areaM2 = field(Math.round(Number(pyeong.groups[1]) * PYEONG_M2 * 100) / 100, pyeong.value);
    areaNote = `평을 ㎡로 바꾼 값이에요 (1평 = ${PYEONG_M2}㎡ 가정)`;
  }

  // Floor: numeric only ("3층"); 저층/고층 words stay missing.
  const floorM = firstMatch(/(\d+)\s*층/, text);
  const floor = floorM ? field(Number(floorM.groups[1]), floorM.value) : null;

  // Complex name: the longest "...아파트/마을/..." match (no spaces, so
  // a street address never glues itself to the name).
  let complexName = null;
  const complexRes = [...text.matchAll(/([가-힣a-zA-Z0-9·ㆍ\-]+?)(아파트|마을|타운|타워|빌라|오피스텔|주상복합|연립|다세대|팰리스|파크|하이츠|맨션|캐슬|리버|센트럴|포레스트|힐스테이트|자이|푸르지오|래미안|e편한세상)/g)];
  if (complexRes.length > 0) {
    complexRes.sort((a, b) => b[0].length - a[0].length);
    const name = `${complexRes[0][1]}${complexRes[0][2]}`;
    complexName = field(name, complexRes[0][0]);
  }

  // Address: "송파구 잠실동 123-45" style.
  const addrM = firstMatch(
    /([가-힣]+[시도])?\s*([가-힣]+[시군구])\s+([가-힣0-9]+[동읍면로길])\s*([\d\-]+)?(가)?/, text);
  const address = addrM ? field(addrM.value.trim(), addrM.value.trim()) : null;

  // Maintenance: "관리비 15만" / "관리비 150000".
  let maintenance = null;
  const maintM = firstMatch(/관리비\s*(\d[\d,]*)\s*(만\s*원?|원)?/, text);
  if (maintM) {
    const raw = Number(maintM.groups[1].replace(/,/g, ""));
    maintenance = field(maintM.groups[2] && maintM.groups[2].includes("만") ? raw * 10000 : raw, maintM.value);
  }

  const fields = {
    deal_type: dealType ? { value: dealType, evidence: dealEvidence } : null,
    price_won: priceWon,
    deposit_won: depositWon,
    monthly_won: monthlyWon,
    area_m2: areaM2,
    area_note: areaNote,
    floor,
    complex_name: complexName,
    address,
    maintenance_won_month: maintenance,
  };

  const missing = [];
  if (!dealType) missing.push({ field: "deal_type", ask: "어떤 거래예요? (전세/월세/매매)" });
  if (dealType === "매매" && !priceWon) missing.push({ field: "price_won", ask: "집값을 적어주세요." });
  if ((dealType === "전세" || dealType === "월세") && !depositWon) {
    missing.push({ field: "deposit_won", ask: "보증금을 적어주세요." });
  }
  if (dealType === "월세" && !monthlyWon) missing.push({ field: "monthly_won", ask: "한 달 월세를 적어주세요." });
  if (!areaM2) missing.push({ field: "area_m2", ask: "집 크기를 적어주세요. (예: 59㎡)" });
  if (!complexName && !address) {
    missing.push({ field: "complex_name", ask: "단지 이름이나 주소를 적어주세요." });
  }

  return { ok: true, fields, missing, note: "붙여 넣은 글에 있는 값만 읽어요. 없는 값은 물어봐요." };
}

// Every extracted value must appear verbatim in the pasted text.
export function guardListingValues(fields, text) {
  const errors = [];
  const s = String(text || "");
  for (const [key, f] of Object.entries(fields || {})) {
    if (!f || typeof f !== "object" || f.value === null || f.value === undefined) continue;
    if (typeof f.evidence !== "string" || !f.evidence || !s.includes(f.evidence)) {
      errors.push(`${key}: 글에 없는 값이에요`);
    }
  }
  return errors;
}

export function plainListingFields(fields) {
  const out = {};
  for (const [key, f] of Object.entries(fields || {})) {
    if (key === "area_note") {
      out[key] = f || null;
      continue;
    }
    out[key] = (f && typeof f === "object" && f.value !== undefined) ? f.value : null;
  }
  return out;
}

// --- price position ------------------------------------------------------------

// Rows within the last 12 months of their own range (contract_ym "YYYYMM").
export function last12Months(rows) {
  const yms = (rows || []).map((r) => r.contract_ym).filter((y) => /^\d{6}$/.test(y || ""));
  if (yms.length === 0) return rows || [];
  const max = yms.sort()[yms.length - 1];
  const y = Number(max.slice(0, 4));
  const m = Number(max.slice(4, 6));
  const cut = y * 12 + m - 12;
  const cutYm = `${Math.floor(cut / 12)}${String(cut % 12 || 12).padStart(2, "0")}`;
  return (rows || []).filter((r) => String(r.contract_ym || "") >= cutYm);
}

export function listingPosition(askingWon, values, { label = "최근 거래", tolNote = "" } = {}) {
  const nums = (values || []).filter(Number.isFinite).sort((a, b) => a - b);
  const asking = Number(askingWon);
  if (!(asking > 0)) return { computable: false, note: "매물 값을 먼저 확인해 주세요." };
  if (nums.length < LISTING_MIN_TRADES) {
    return { computable: false, n: nums.length,
      note: `같은 단지 ${label}가 ${nums.length}건뿐이라서 어디쯤인지 말하기 어려워요.` };
  }
  const stats = statsOf(nums);
  const cheaper = nums.filter((v) => v < asking).length;
  const pricier = nums.filter((v) => v > asking).length;
  let bandText;
  if (pricier === 0) bandText = `같은 단지 ${label} 가운데 가장 비싼 수준이에요`;
  else if (cheaper === 0) bandText = `같은 단지 ${label} 가운데 가장 싼 수준이에요`;
  else {
    const topPct = Math.round((pricier / nums.length) * 100);
    bandText = `같은 단지 ${label}의 비싼 쪽에서 상위 ${topPct}% 수준이에요`;
  }
  return {
    computable: true, asking_won: asking, n: nums.length,
    median_won: stats.median, min_won: nums[0], max_won: nums[nums.length - 1],
    cheaper, pricier, band_text: bandText,
    detail: `${nums.length}건 가운데 이 값보다 싼 거래가 ${cheaper}건, 비싼 거래가 ${pricier}건이에요 (한가운데 ${stats.median.toLocaleString("ko-KR")}원)${tolNote}`,
  };
}

// --- public listings -------------------------------------------------------------

export function haversineKm(lon1, lat1, lon2, lat2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180)
      * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function parseAnnouncedAt(s) {
  // "2024.09.20" or ISO; null when unparseable.
  const t = String(s || "").trim();
  let m = /^(\d{4})\.(\d{2})\.(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

function daysBetween(aIso, bIso) {
  const a = Date.parse(`${aIso}T00:00:00Z`);
  const b = Date.parse(`${bIso}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

// snapshot: normalized {fetched_at, complexes, notices}.
// filters: {region, recent_only, recent_days, min_area_m2, max_area_m2,
//   near: {lon, lat, max_km}, limit}
export function filterPublicListings(snapshot, filters = {}) {
  const {
    region = "", recent_only = false, recent_days = 90,
    min_area_m2 = null, max_area_m2 = null, near = null, limit = 20,
  } = filters;
  const fetchedDay = parseAnnouncedAt((snapshot && snapshot.fetched_at) || "") || "2026-10-28";
  const notes = [
    "마감일은 이 자료에 없어요. 모집 중인지 공고 원문에서 확인해 주세요.",
  ];
  const regionTokens = String(region || "").trim().split(/\s+/).filter(Boolean);

  const complexes = [];
  for (const c of (snapshot && snapshot.complexes) || []) {
    const addr = c.address || "";
    if (regionTokens.length > 0 && !regionTokens.every((t) => addr.includes(t))) continue;
    const units = c.unit_types || [];
    const areas = units.map((u) => u.exclusive_area_m2).filter(Number.isFinite);
    if ((min_area_m2 !== null && areas.length > 0 && Math.max(...areas) < min_area_m2)
        || (max_area_m2 !== null && areas.length > 0 && Math.min(...areas) > max_area_m2)) continue;
    let distanceKm = null;
    if (near && Number.isFinite(near.lon) && Number.isFinite(near.lat)
        && Number.isFinite(c.longitude) && Number.isFinite(c.latitude)) {
      distanceKm = Math.round(haversineKm(near.lon, near.lat, c.longitude, c.latitude) * 10) / 10;
      if (near.max_km !== null && near.max_km !== undefined && distanceKm > near.max_km) continue;
    }
    const deposits = units.map((u) => u.deposit_won).filter(Number.isFinite);
    const monthlies = units.map((u) => u.monthly_rent_won).filter(Number.isFinite);
    complexes.push({
      source: c.source, id: c.id, name: c.name, address: addr,
      latitude: Number.isFinite(c.latitude) ? c.latitude : null,
      longitude: Number.isFinite(c.longitude) ? c.longitude : null,
      distance_km: distanceKm,
      unit_count: units.length,
      area_min_m2: areas.length > 0 ? Math.min(...areas) : null,
      area_max_m2: areas.length > 0 ? Math.max(...areas) : null,
      deposit_min_won: deposits.length > 0 ? Math.min(...deposits) : null,
      monthly_min_won: monthlies.length > 0 ? Math.min(...monthlies) : null,
      has_prices: monthlies.length > 0,
    });
  }
  complexes.sort((a, b) => {
    if (a.distance_km !== null || b.distance_km !== null) {
      return (a.distance_km ?? 1e9) - (b.distance_km ?? 1e9);
    }
    return String(a.id) < String(b.id) ? -1 : 1;
  });

  const notices = [];
  for (const n of (snapshot && snapshot.notices) || []) {
    const hay = `${n.address || ""} ${n.title || ""}`;
    if (regionTokens.length > 0 && !regionTokens.every((t) => hay.includes(t))) continue;
    const day = parseAnnouncedAt(n.announced_at);
    const age = day ? daysBetween(day, fetchedDay) : null;
    const recent = age !== null && age >= 0 && age <= recent_days;
    if (recent_only && !recent) continue;
    notices.push({
      source: n.source, id: n.id, title: n.title,
      announced_at: n.announced_at || "", announced_day: day,
      address: n.address || "", source_url: n.source_url || "",
      recent,
    });
  }
  notices.sort((a, b) => String(b.announced_day || "") < String(a.announced_day || "") ? -1 : 1);

  const lim = Math.max(1, Number(limit) || 20);
  return {
    complexes: complexes.slice(0, lim),
    complex_total: complexes.length,
    notices: notices.slice(0, lim),
    notice_total: notices.length,
    notes,
    attribution: "LH·마이홈 (공공주택 데이터 API)",
    fetched_at: (snapshot && snapshot.fetched_at) || null,
  };
}

// Same filters over the compact shaped block money.mjs ships
// (complexes carry area ranges + workplace distance, not unit rows).
export function filterShapedListings(shaped, filters = {}) {
  const {
    region = "", recent_only = false,
    min_area_m2 = null, max_area_m2 = null,
    near_work_max_m = null, limit = 20,
  } = filters;
  const regionTokens = String(region || "").trim().split(/\s+/).filter(Boolean);
  const complexes = [];
  for (const c of (shaped && shaped.complexes) || []) {
    const addr = c.address || "";
    if (regionTokens.length > 0 && !regionTokens.every((t) => addr.includes(t))) continue;
    const lo = c.area_min_m2;
    const hi = c.area_max_m2;
    const known = Number.isFinite(lo) && Number.isFinite(hi);
    if (known && min_area_m2 !== null && hi < min_area_m2) continue;
    if (known && max_area_m2 !== null && lo > max_area_m2) continue;
    if (near_work_max_m !== null) {
      if (!Number.isFinite(c.distance_to_work_m)) continue;
      if (c.distance_to_work_m > near_work_max_m) continue;
    }
    complexes.push(c);
  }
  complexes.sort((a, b) => {
    const da = Number.isFinite(a.distance_to_work_m) ? a.distance_to_work_m : 1e12;
    const db = Number.isFinite(b.distance_to_work_m) ? b.distance_to_work_m : 1e12;
    if (da !== db) return da - db;
    return String(a.id) < String(b.id) ? -1 : 1;
  });
  const notices = [];
  for (const n of (shaped && shaped.notices) || []) {
    const hay = `${n.address || ""} ${n.title || ""}`;
    if (regionTokens.length > 0 && !regionTokens.every((t) => hay.includes(t))) continue;
    if (recent_only && !n.recent) continue;
    notices.push(n);
  }
  const lim = Math.max(1, Number(limit) || 20);
  return {
    complexes: complexes.slice(0, lim),
    complex_total: complexes.length,
    notices: notices.slice(0, lim),
    notice_total: notices.length,
  };
}

export { AREA_BUCKET_TOL_M2 };
