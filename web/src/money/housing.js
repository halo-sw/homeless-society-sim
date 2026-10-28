// Public-rental adapter: snapshot (tests/dev) + API client (server only).
//
// The snapshot (data/raw/public_housing/snapshot_3districts.json, NOT
// committed, never served) holds LH complexes with `pnu` + `unit_types`
// [unit_type, building_type, exclusive_area_m2, deposit_won,
// monthly_rent_won], youth complexes with lat/lon, and notices with
// `source_url`. The runtime adapter calls the API server-side only
// (HOUSING_API_KEY, Bearer auth); the browser never sees the key.
// Attribution: "LH·마이홈 (공공주택 데이터 API, 스냅샷 시각 표시)".

export const HOUSING_API_BASE = "https://public-housing-map.vercel.app/api/v1";
export const HOUSING_KEY_ENV = "HOUSING_API_KEY";
export const HOUSING_ATTRIBUTION = "LH·마이홈 (공공주택 데이터 API)";

function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

// --- snapshot normalisation (pure) --------------------------------------------

export function normalizeSnapshot(doc) {
  const fetchedAt = (doc && doc.fetched_at) || null;
  const complexes = ((doc && doc.complexes) || []).map((c) => ({
    source: c.source || "",
    id: String(c.id || ""),
    name: c.name || "",
    address: c.address || "",
    pnu: c.pnu || null,
    latitude: num(c.latitude),
    longitude: num(c.longitude),
    snapshot_at: c.snapshot_at || fetchedAt,
    unit_types: ((c.unit_types) || []).map((u) => ({
      unit_type: String(u.unit_type || ""),
      building_type: u.building_type || "",
      exclusive_area_m2: num(u.exclusive_area_m2),
      deposit_won: num(u.deposit_won),
      monthly_rent_won: num(u.monthly_rent_won),
    })).filter((u) => u.exclusive_area_m2 !== null),
    unit_types_truncated: c.unit_types_truncated === true,
  }));
  const notices = ((doc && doc.notices) || []).map((n) => ({
    source: n.source || "",
    id: String(n.id || ""),
    title: n.title || "",
    announced_at: n.announced_at || "",
    address: n.address || "",
    source_url: n.source_url || "",
    snapshot_at: n.snapshot_at || fetchedAt,
  }));
  return { fetched_at: fetchedAt, complexes, notices };
}

export function attributionFor(snapshot) {
  const when = (snapshot && snapshot.fetched_at) || "";
  return `${HOUSING_ATTRIBUTION}${when ? `, 스냅샷 ${when}` : ""}`;
}

function addrTokens(addr) {
  // Dong/road tokens and street numbers only — bare 시도/시군구 names
  // ("서울특별시") would link every notice to every complex.
  return String(addr || "").split(/[\s,()]+/)
    .filter((t) => t.length >= 2 && (/동$/.test(t) || /[로길가]$/.test(t) || /\d/.test(t)));
}

// Notices carry no complex id, so link by address overlap (shared token
// of ≥2 chars, e.g. "마천동" or a road name). Capped; empty is honest.
export function noticesFor(complex, notices, limit = 3) {
  const tokens = new Set(addrTokens(complex && complex.address));
  if (tokens.size === 0) return [];
  const hits = [];
  for (const n of notices || []) {
    if (!n.source_url) continue;
    const nt = addrTokens(n.address || n.title || "");
    if (nt.some((t) => tokens.has(t))) hits.push(n);
    if (hits.length >= limit) break;
  }
  return hits;
}

// --- API client (server-side only; key from env, never logged) ------------------

export function createHousingApi({ base = HOUSING_API_BASE, key, fetchImpl }) {
  if (!fetchImpl) throw new Error("housing api: fetchImpl is required (server-side only)");
  async function get(path) {
    const r = await fetchImpl(`${base}${path}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!r.ok) throw new Error(`housing api ${path}: HTTP ${r.status}`);
    return r.json();
  }
  return {
    base,
    complexes: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return get(`/complexes${q ? `?${q}` : ""}`);
    },
    complex: (source, id) => get(`/complexes/${encodeURIComponent(source)}/${encodeURIComponent(id)}`),
    notices: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return get(`/notices${q ? `?${q}` : ""}`);
    },
  };
}

// --- recommendation (pure) ------------------------------------------------------
// Candidates: monthly housing cost keeps 주거비 부담률 under the
// threshold (default 30%, a common rule of thumb — labelled, editable),
// similar exclusive area (±10 ㎡ of the compared home), ranked by
// shortest commute to the customer's work station. commuteMinutes(pnu)
// resolves graph minutes when the complex is inside a built area, else
// null ("시뮬레이션은 지역 생성 후").

export const DEFAULT_BURDEN_THRESHOLD_PCT = 30;
export const BURDEN_THRESHOLD_NOTE = "30%는 흔히 쓰이는 기준선(가정값)이며 변경할 수 있습니다.";
export const AREA_SIM_NOTE = "시뮬레이션은 지역 생성 후";
export const ELIGIBILITY_NOTE = "입주 자격은 공고 원문에서 확인해 주세요.";

export function recommendPublicRental(snapshot, criteria = {}) {
  const {
    monthlyNetWon = null,
    thresholdPct = DEFAULT_BURDEN_THRESHOLD_PCT,
    targetAreaM2 = null,
    areaTolM2 = 10,
    commuteMinutes = null, // (complex) -> minutes | null
    limit = 5,
  } = criteria;
  const out = [];
  for (const c of (snapshot && snapshot.complexes) || []) {
    for (const u of c.unit_types || []) {
      if (u.monthly_rent_won === null) continue; // unknown monthly: cannot rank (youth complexes carry no unit prices)
      if (targetAreaM2 !== null && u.exclusive_area_m2 !== null
          && Math.abs(u.exclusive_area_m2 - targetAreaM2) > areaTolM2) continue;
      const monthly = u.monthly_rent_won || 0;
      const burden = monthlyNetWon > 0 ? monthly / monthlyNetWon : null;
      if (burden !== null && burden * 100 > thresholdPct) continue;
      let commute = null;
      let simulated = false;
      if (typeof commuteMinutes === "function") {
        commute = commuteMinutes(c);
        simulated = commute !== null && commute !== undefined;
      }
      out.push({
        complex_source: c.source,
        complex_id: c.id,
        complex_name: c.name,
        address: c.address,
        pnu: c.pnu,
        unit_type: u.unit_type,
        building_type: u.building_type,
        exclusive_area_m2: u.exclusive_area_m2,
        deposit_won: u.deposit_won,
        monthly_rent_won: u.monthly_rent_won,
        monthly_housing_won: monthly,
        burden_pct: burden === null ? null : Math.round(burden * 1000) / 10,
        commute_minutes: simulated ? commute : null,
        simulated,
        notices: noticesFor(c, (snapshot && snapshot.notices) || []),
      });
    }
  }
  out.sort((a, b) => {
    const ac = a.commute_minutes === null ? 1e9 : a.commute_minutes;
    const bc = b.commute_minutes === null ? 1e9 : b.commute_minutes;
    if (ac !== bc) return ac - bc;
    const am = a.monthly_housing_won || 0;
    const bm = b.monthly_housing_won || 0;
    if (am !== bm) return am - bm;
    return String(a.complex_id) < String(b.complex_id) ? -1 : 1;
  });
  return {
    candidates: out.slice(0, Math.max(1, limit)),
    total: out.length,
    threshold_pct: thresholdPct,
    threshold_note: BURDEN_THRESHOLD_NOTE,
    eligibility_note: ELIGIBILITY_NOTE,
    attribution: attributionFor(snapshot),
  };
}
