// RTMS (국토교통부 실거래가 공개시스템) loader (Node-side file reads;
// parsing itself is pure and tested).
//
// Two backends behind one interface:
//   - CSV now: data/raw/rtms/*.csv (cp949, disclaimer lines, quoted
//     thousands separators). Decoded with TextDecoder("euc-kr") —
//     byte-identical to cp949 over the real files (0 U+FFFD on all 18).
//   - data.go.kr API later: same fields plus 법정동 codes / aptSeq /
//     해제여부 (see data/raw/docs/TransactionPrice.md). Not callable
//     today (services unregistered); the backend maps API items through
//     the same normaliser and is tested with a stub fetch.
// Cancelled deals (해제사유발생일 non-empty, API 해제여부=O) are excluded.

export const RTMS_DISTRICTS = ["songpa", "seongdong", "bundang", "gangnam",
  "gangdong", "sujeong", "jungwon", "suji", "hanam"];
export const RTMS_TYPES = ["apt", "rowhouse", "officetel"];
export const RTMS_DEALS = ["trade", "rent"];

export const RTMS_DISCLAIMER =
  "국토교통부 실거래가 공개시스템 참고용 자료로 법적 효력이 없으며 계약일 기준입니다.";

export function rtmsFileName(type, deal, district) {
  return `${type}_${deal}_${district}_2510-2610.csv`;
}

// --- decoding (pure over bytes) -------------------------------------------

export function decodeRtms(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return new TextDecoder("euc-kr").decode(bytes);
}

// --- CSV parsing (pure over text) -------------------------------------------

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function numManwon(text) {
  const t = String(text === undefined || text === null ? "" : text).replace(/,/g, "").trim();
  if (t === "" || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 10000) : null;
}

function numPlain(text) {
  const t = String(text === undefined || text === null ? "" : text).replace(/,/g, "").trim();
  if (t === "" || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// Returns {header, rows} with raw string cells. The header is the first
// line containing 단지명 (apartments/officetels) or 건물명 (rowhouses);
// disclaimer lines precede it.
export function parseRtmsCsv(text) {
  const lines = String(text || "").split(/\r?\n/);
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("단지명") || lines[i].includes("건물명")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) throw new Error("rtms: no header line containing 단지명/건물명");
  const header = splitCsvLine(lines[headerIdx]);
  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (lines[i].trim() === "") continue;
    const cells = splitCsvLine(lines[i]);
    if (cells.length < header.length) continue; // ragged tail line
    const rec = {};
    for (let k = 0; k < header.length; k++) rec[header[k]] = cells[k];
    rows.push(rec);
  }
  return { header, rows };
}

function cancelledTrade(rec) {
  const v = String(rec["해제사유발생일"] || "").trim();
  return v !== "" && v !== "-";
}

// Normalised row (all backends converge here):
// {sigungu, bonbun, bubun, complex, area_m2, contract_ym, contract_day,
//  floor, deal, housing_type,
//  trade_won | deposit_won, monthly_won, rent_kind}
export function normalizeTradeRow(rec, housingType) {
  if (cancelledTrade(rec)) return null;
  return {
    sigungu: (rec["시군구"] || "").trim(),
    bonbun: (rec["본번"] || "").trim(),
    bubun: (rec["부번"] || "").trim(),
    complex: (rec["단지명"] || rec["건물명"] || "").trim(),
    area_m2: numPlain(rec["전용면적(㎡)"]),
    contract_ym: (rec["계약년월"] || "").trim(),
    contract_day: numPlain(rec["계약일"]),
    floor: numPlain(rec["층"]),
    deal: "trade",
    housing_type: housingType,
    trade_won: numManwon(rec["거래금액(만원)"]),
  };
}

export function normalizeRentRow(rec, housingType) {
  const deposit = numManwon(rec["보증금(만원)"]);
  const monthly = numManwon(rec["월세금(만원)"]);
  const kind = (rec["전월세구분"] || "").trim();
  return {
    sigungu: (rec["시군구"] || "").trim(),
    bonbun: (rec["본번"] || "").trim(),
    bubun: (rec["부번"] || "").trim(),
    complex: (rec["단지명"] || rec["건물명"] || "").trim(),
    area_m2: numPlain(rec["전용면적(㎡)"]),
    contract_ym: (rec["계약년월"] || "").trim(),
    contract_day: numPlain(rec["계약일"]),
    floor: numPlain(rec["층"]),
    deal: "rent",
    housing_type: housingType,
    rent_kind: kind === "전세" ? "jeonse" : kind === "월세" ? "wolse" : "other",
    deposit_won: deposit,
    monthly_won: monthly,
  };
}

// --- backends ----------------------------------------------------------------

function keyOf(type, deal, district) {
  return `${type}|${deal}|${district}`;
}

// CSV backend: readFile(path) -> bytes (injectable; fs in production).
export function createCsvBackend({ rawDir, readFile }) {
  const cache = new Map();
  async function load(type, deal, district) {
    const key = keyOf(type, deal, district);
    if (cache.has(key)) return cache.get(key);
    const file = rtmsFileName(type, deal, district);
    const text = decodeRtms(await readFile(`${rawDir}/${file}`));
    const { rows } = parseRtmsCsv(text);
    const norm = deal === "trade"
      ? rows.map((r) => normalizeTradeRow(r, type))
      : rows.map((r) => normalizeRentRow(r, type));
    const out = norm.filter((r) => r !== null);
    cache.set(key, out);
    return out;
  }
  return {
    kind: "csv",
    disclaimer: RTMS_DISCLAIMER,
    load,
    async loadAll(district) {
      const out = [];
      for (const type of RTMS_TYPES) {
        for (const deal of RTMS_DEALS) {
          out.push(...(await load(type, deal, district)));
        }
      }
      return out;
    },
  };
}

// API backend (data.go.kr, per data/raw/docs/TransactionPrice.md): same
// normaliser, items mapped from the XML/JSON `item` list. Services are
// unregistered today, so this path only runs in tests with a stub fetch.
export function mapApiItem(item, deal) {
  const s = (v) => String(v === undefined || v === null ? "" : v).trim();
  if (deal === "trade") {
    if (s(item["해제여부"]) === "O" || s(item["cdealType"]) === "O") return null;
    return {
      sigungu: `${s(item["sidoNm"] || item["sido"])} ${s(item["sggNm"] || item["sgg"])} ${s(item["umdNm"] || item["umd"])}`.trim(),
      bonbun: s(item["bonbun"] || item["bonbunNo"]),
      bubun: s(item["bubun"] || item["bubunNo"]),
      complex: s(item["aptNm"] || item["단지명"]),
      area_m2: numPlain(item["excluUseAr"] || item["전용면적"]),
      contract_ym: s(item["dealYear"] || "") + s(item["dealMonth"] || "").padStart(2, "0"),
      contract_day: numPlain(item["dealDay"]),
      deal: "trade",
      housing_type: s(item["houseType"] || "apt"),
      trade_won: numManwon(item["dealAmount"] || item["거래금액"]),
      floor: numPlain(item["floor"] || item["flrNo"] || item["층"]),
      apt_seq: s(item["aptSeq"] || ""),
    };
  }
  const monthly = numManwon(item["monthlyAmount"] || item["월세금"]);
  return {
    sigungu: `${s(item["sidoNm"] || item["sido"])} ${s(item["sggNm"] || item["sgg"])} ${s(item["umdNm"] || item["umd"])}`.trim(),
    bonbun: s(item["bonbun"] || item["bonbunNo"]),
    bubun: s(item["bubun"] || item["bubunNo"]),
    complex: s(item["aptNm"] || item["단지명"]),
    area_m2: numPlain(item["excluUseAr"] || item["전용면적"]),
    contract_ym: s(item["dealYear"] || "") + s(item["dealMonth"] || "").padStart(2, "0"),
    contract_day: numPlain(item["dealDay"]),
    deal: "rent",
    housing_type: s(item["houseType"] || "apt"),
    rent_kind: (monthly || 0) > 0 ? "wolse" : "jeonse",
    deposit_won: numManwon(item["deposit"] || item["보증금"]),
    monthly_won: monthly,
    floor: numPlain(item["floor"] || item["flrNo"] || item["층"]),
    apt_seq: s(item["aptSeq"] || ""),
  };
}

export function createApiBackend({ fetchImpl, serviceKey, endpoints }) {
  return {
    kind: "api",
    disclaimer: RTMS_DISCLAIMER,
    async load(type, deal, district) {
      if (!fetchImpl) throw new Error("rtms api backend: no fetch (services unregistered today)");
      const url = (endpoints || {})[keyOf(type, deal, district)];
      if (!url) throw new Error(`rtms api backend: no endpoint for ${type}/${deal}/${district} (service key unregistered)`);
      const r = await fetchImpl(`${url}${url.includes("?") ? "&" : "?"}serviceKey=${encodeURIComponent(serviceKey || "")}`);
      const payload = await r.json();
      const items = (((payload.response || {}).body || {}).items || {}).item || [];
      const list = Array.isArray(items) ? items : [items];
      return list.map((it) => mapApiItem(it, deal)).filter((r) => r !== null);
    },
  };
}
