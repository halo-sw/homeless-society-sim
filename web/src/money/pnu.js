// PNU matching: RTMS rows (시군구 + 본번/부번) to our buildings (pure).
//
// A parcel number (PNU) is 19 digits: 시도(2) 시군구(3) 법정동(3) 리(2)
// 지번구분(1) 본번(4) 부번(4). Our register buildings carry the full PNU
// plus a coarse address ("서울특별시 송파구 잠실동"); RTMS rows carry the
// same address text plus 본번/부번. The match is: address text equal, and
// 본번/부번 equal to the PNU's last 8 digits. The bjdong prefix (first 10
// digits) always comes from our register data, never guessed.

export function parsePnu(pnu) {
  const s = String(pnu || "");
  if (!/^\d{19}$/.test(s)) return null;
  return {
    full: s,
    sido: s.slice(0, 2),
    sgg: s.slice(2, 5),
    bjdong: s.slice(0, 10),
    li: s.slice(8, 10),
    landType: s.slice(10, 11),
    bon: s.slice(11, 15),
    bu: s.slice(15, 19),
  };
}

function normBonBu(v) {
  const digits = String(v === null || v === undefined ? "" : v).replace(/\D/g, "");
  if (digits === "") return null;
  return digits.padStart(4, "0").slice(-4);
}

function normAddr(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

// Candidate full PNUs for an RTMS row, given the bjdong prefix(es) our
// register data holds for that address text. Land-type digit "1" (대지)
// first, then any land type present in our data.
export function rtmsToPnuCandidates(row, bjdongPrefixes) {
  const bon = normBonBu(row.bonbun);
  const bu = normBonBu(row.bubun);
  if (!bon || !bu) return [];
  const out = [];
  for (const prefix of bjdongPrefixes || []) {
    const p = parsePnu(`${prefix}100000000`);
    if (!p) continue;
    out.push(`${prefix}1${bon}${bu}`);
  }
  return out;
}

// Index over buildings carrying register.pnu + register.address:
//   byPnu: full PNU -> [building]
//   bjdongByAddress: address text -> [bjdong10...]
//   keyOf(address, bon, bu): `${address}|${bon}|${bu}` -> [building]
export function buildPnuIndex(buildings) {
  const byPnu = new Map();
  const bjdongByAddress = new Map();
  const byKey = new Map();
  const list = Array.isArray(buildings) ? buildings
    : (buildings && Array.isArray(buildings.buildings)) ? buildings.buildings : [];
  for (const b of list) {
    const reg = (b && b.register) || {};
    const p = parsePnu(reg.pnu);
    if (!p) continue;
    if (!byPnu.has(p.full)) byPnu.set(p.full, []);
    byPnu.get(p.full).push(b);
    const addr = normAddr(reg.address);
    if (addr) {
      if (!bjdongByAddress.has(addr)) bjdongByAddress.set(addr, new Set());
      bjdongByAddress.get(addr).add(p.bjdong);
      const key = `${addr}|${p.bon}|${p.bu}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(b);
    }
  }
  for (const [k, v] of bjdongByAddress) bjdongByAddress.set(k, [...v].sort());
  return { byPnu, bjdongByAddress, byKey };
}

// Match one RTMS row to our buildings: exact address + 본번/부번 first
// (land-type agnostic), else the constructed 대지 PNU.
export function matchRtmsRow(row, index) {
  const addr = normAddr(row.sigungu);
  const bon = normBonBu(row.bonbun);
  const bu = normBonBu(row.bubun);
  if (!addr || !bon || !bu || !index) return { buildings: [], pnu: null };
  const direct = index.byKey.get(`${addr}|${bon}|${bu}`);
  if (direct && direct.length > 0) {
    const p = parsePnu(((direct[0].register) || {}).pnu);
    return { buildings: direct, pnu: p ? p.full : null };
  }
  const prefixes = index.bjdongByAddress.get(addr) || [];
  for (const cand of rtmsToPnuCandidates(row, prefixes)) {
    const hit = index.byPnu.get(cand);
    if (hit && hit.length > 0) return { buildings: hit, pnu: cand };
  }
  return { buildings: [], pnu: null };
}

// Building ids -> complex names (brief: match by PNU, check with 단지명).
export function complexOfBuildings(buildings, complexes) {
  const ids = new Set((buildings || []).map((b) => b.id));
  if (ids.size === 0) return [];
  return (complexes || [])
    .filter((c) => (c.building_ids || []).some((id) => ids.has(id)))
    .map((c) => ({ id: c.id, name: c.name }));
}

// Loose 단지명 check: either string contains the other (register names
// carry suffixes like "아파트" that RTMS rows omit, and vice versa).
export function 단지명Matches(rtmsName, complexName) {
  const a = String(rtmsName || "").replace(/\s+/g, "");
  const b = String(complexName || "").replace(/\s+/g, "");
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}
