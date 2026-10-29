// Operator-schedule ride times (12a2, part 1).
//
// The network path (lines, transfers, km) comes from OSM; the minutes a
// train spends moving come from the operator's published per-gap schedule:
// `scenarios/transit/seoul-metro-interstation.csv` (서울교통공사 역간거리
// 및 소요시간, OA-12034, 공공누리 1유형, 기준일 2024-03-25), lines 1–8.
//
// Precedence for a ride total: customer's own number > schedule > estimate.
//   - Lines 1–8: sum the schedule's per-gap times along the path.
//   - Other lines (9호선, 신분당선, 수인·분당선, 경강선): leg km × the
//     median minutes-per-km of the schedule's lines 1–8, computed from
//     the file (never typed in).
//   - Transfers: the stage-8 4분/회 assumption (C-ride-split), labelled.
//   - Waiting: half the headway is unknown, so nothing is added and the
//     note always says "대기 시간 제외".
//
// `source` is "customer" (the customer's number, kept in profile.js and
// homes.js) or "derived" (everything computed here, with the method in
// the note). Gaps are symmetric: the file publishes one number per gap,
// used in both travel directions.

import { normalizeStation } from "../engine/journey.js";

export const SCHEDULE_SOURCE_LABEL = "서울교통공사 표준 운행시간";
export const SCHEDULE_FILE_NOTE =
  "서울교통공사 역간거리 및 소요시간 (OA-12034, 공공누리 1유형, 기준일 2024-03-25)";
export const ESTIMATE_LABEL = "추정 · 1~8호선 평균 속도 적용";
export const TRANSFER_ASSUMPTION_NOTE = "C-ride-split 가정";
export const NO_WAIT_NOTE = "대기 시간 제외";

// File-consecutive rows that are NOT adjacent stations: line 2's loop
// row is followed by the Seongsu-branch run (용답…신설동) and then the
// Sinjeong-branch run (도림천…까치산); line 5's 하남검단산 row is
// followed by the Macheon-branch run (둔촌동…마천). Each run-first row's
// 소요시간/역간거리 measures from the junction station — verified
// against OSM station geometry (straight-line ≈ file km: 성수→용답
// ~2.0/2.3, 신도림→도림천 ~0.97/1.0, 강동→둔촌동 ~0.95/1.2).
const JUNCTION_PREDECESSOR = {
  "용답": "성수",
  "도림천": "신도림",
  "둔촌동": "강동",
};

function parseMmSs(text) {
  const m = /^(\d+):(\d{2})$/.exec(String(text || "").trim());
  if (!m) return null;
  return Number(m[1]) + Number(m[2]) / 60;
}

function gapKey(line, a, b) {
  const [x, y] = a < b ? [a, b] : [b, a];
  return `${line}|${x}|${y}`;
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  if (s.length === 0) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Parse the interstation CSV text into a schedule object:
// { gaps, stationsByLine, medianMinPerKm, gapCount, lineCounts, note }.
export function parseInterstationCsv(text) {
  const clean = String(text || "").replace(/^\uFEFF/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) throw new Error("schedule: empty interstation csv");
  const header = lines[0].split(",").map((c) => c.trim());
  const col = (name) => header.indexOf(name);
  const iLine = col("호선");
  const iName = col("역명");
  const iTime = col("소요시간");
  const iKm = col("역간거리(km)");
  if (iLine < 0 || iName < 0 || iTime < 0 || iKm < 0) {
    throw new Error("schedule: missing columns (호선, 역명, 소요시간, 역간거리(km))");
  }
  const gaps = new Map(); // gapKey -> {minutes, km}
  const stationsByLine = new Map(); // line -> [normalised names in file order]
  const lineCounts = {};
  let prev = null; // {line, name}
  for (const rawLine of lines.slice(1)) {
    const cells = rawLine.split(",");
    const line = (cells[iLine] || "").trim();
    const name = normalizeStation(cells[iName] || "");
    if (!line || !name) {
      prev = null;
      continue;
    }
    if (!stationsByLine.has(line)) stationsByLine.set(line, []);
    stationsByLine.get(line).push(name);
    lineCounts[line] = (lineCounts[line] || 0) + 1;
    const minutes = parseMmSs(cells[iTime]);
    const km = Number(String(cells[iKm] || "").trim());
    const junctionFrom = JUNCTION_PREDECESSOR[name] || null;
    if (prev && prev.line === line && minutes !== null && !junctionFrom
        && prev.name !== name) {
      // Line 2's loop closes at the second 시청 row (충정로→시청 is a
      // real gap); the only non-adjacent file pairs lead into a
      // junction row, handled by the branch below.
      gaps.set(gapKey(line, prev.name, name), {
        minutes,
        km: Number.isFinite(km) ? km : null,
      });
    } else if (junctionFrom && minutes !== null && prev && prev.line === line) {
      gaps.set(gapKey(line, junctionFrom, name), {
        minutes,
        km: Number.isFinite(km) ? km : null,
      });
    }
    prev = { line, name };
  }
  const rates = [];
  for (const g of gaps.values()) {
    if (g.km !== null && g.km > 0 && g.minutes >= 0) rates.push(g.minutes / g.km);
  }
  return {
    gaps,
    stationsByLine,
    medianMinPerKm: median(rates),
    gapCount: gaps.size,
    lineCounts,
    note: SCHEDULE_FILE_NOTE,
  };
}

// Network line id/name -> schedule 호선 ("1".."8"), or null when the
// schedule does not cover the line (9호선, 신분당선, 수인·분당선, 경강선).
export function scheduleLineOf(lineId, lineName) {
  const idHit = /^line([1-8])$/.exec(String(lineId || ""));
  if (idHit) return idHit[1];
  const nameHit = /([1-8])호선/.exec(String(lineName || ""));
  if (nameHit && !/9호선/.test(String(lineName || ""))) return nameHit[1];
  return null;
}

// One gap's schedule minutes, or null (symmetric in travel direction).
export function gapMinutes(schedule, lineNum, stationA, stationB) {
  if (!schedule || !lineNum) return null;
  const a = normalizeStation(stationA);
  const b = normalizeStation(stationB);
  if (!a || !b || a === b) return null;
  return schedule.gaps.get(gapKey(lineNum, a, b)) || null;
}

const round1 = (x) => Math.round(x * 10) / 10;

// Station names in the schedule (lines 1–8) that no network line with
// the same 호선 carries, and vice versa — for the RESULT report.
export function unmatchedScheduleStations(schedule, network) {
  const scheduleOnly = [];
  const networkOnly = [];
  if (!schedule || !network) return { scheduleOnly, networkOnly };
  const netByLine = new Map();
  for (const line of network.lines || []) {
    const num = scheduleLineOf(line.id, line.name);
    if (!num) continue;
    if (!netByLine.has(num)) netByLine.set(num, new Set());
    for (const s of line.stops || []) {
      const n = normalizeStation(s.name);
      if (n) netByLine.get(num).add(n);
    }
  }
  for (const [num, names] of schedule.stationsByLine) {
    if (!/^[1-8]$/.test(num)) continue;
    const have = netByLine.get(num) || new Set();
    for (const n of new Set(names)) {
      if (!have.has(n)) scheduleOnly.push({ line: num, station: n });
    }
  }
  for (const [num, have] of netByLine) {
    const names = new Set(schedule.stationsByLine.get(num) || []);
    for (const n of have) {
      if (!names.has(n)) networkOnly.push({ line: num, station: n });
    }
  }
  const byLine = (a, b) => (a.line < b.line ? -1 : a.line > b.line ? 1
    : String(a.station) < String(b.station) ? -1 : 1);
  scheduleOnly.sort(byLine);
  networkOnly.sort(byLine);
  return { scheduleOnly, networkOnly };
}

// Derived ride total for a findPath path. Returns null without a path
// or a schedule. Every leg records its method; the note carries the
// source labels, the transfer assumption and the no-waiting caveat.
export function rideMinutes(fromStation, toStation, path, schedule,
  { transferMin = 4 } = {}) {
  if (!path || !Array.isArray(path.legs) || path.legs.length === 0) return null;
  if (!schedule || !(schedule.medianMinPerKm > 0)) return null;
  const from = normalizeStation(fromStation);
  const to = normalizeStation(toStation);
  const legs = [];
  let rideExact = 0;
  const methodsUsed = new Set();
  for (const leg of path.legs) {
    const stops = (leg.stops || []).map(normalizeStation);
    const lineNum = scheduleLineOf(leg.line, leg.lineName);
    const edgeKm = Array.isArray(leg.edgeKm) && leg.edgeKm.length === stops.length - 1
      ? leg.edgeKm
      : stops.length > 1
        ? new Array(stops.length - 1).fill(leg.distanceKm / (stops.length - 1))
        : [];
    let legExact = 0;
    let gapsKnown = 0;
    const gapsTotal = Math.max(0, stops.length - 1);
    if (lineNum === null) {
      legExact = (leg.distanceKm || 0) * schedule.medianMinPerKm;
    } else {
      for (let i = 0; i + 1 < stops.length; i++) {
        const gap = gapMinutes(schedule, lineNum, stops[i], stops[i + 1]);
        if (gap) {
          legExact += gap.minutes;
          gapsKnown += 1;
        } else {
          legExact += (edgeKm[i] || 0) * schedule.medianMinPerKm;
        }
      }
    }
    const method = lineNum === null || gapsKnown === 0 ? "estimate"
      : gapsKnown === gapsTotal ? "schedule" : "mixed";
    methodsUsed.add(method === "mixed" ? "schedule" : method);
    if (method === "mixed") methodsUsed.add("estimate");
    rideExact += legExact;
    legs.push({
      line: leg.line,
      lineName: leg.lineName,
      from: stops[0] || null,
      to: stops[stops.length - 1] || null,
      stops: [...stops],
      minutes: round1(legExact),
      km: leg.distanceKm,
      method,
      gapsKnown,
      gapsTotal,
    });
  }
  const transferCount = Math.max(0, legs.length - 1);
  const transferMinutes = round1(transferCount * transferMin);
  const minutes = round1(rideExact + transferCount * transferMin);
  const rate = Math.round(schedule.medianMinPerKm * 100) / 100;
  const bits = [];
  const schedLegs = legs.filter((l) => l.method !== "estimate");
  const estLegs = legs.filter((l) => l.method !== "schedule");
  if (schedLegs.length > 0) {
    const m = round1(schedLegs.reduce((a, l) => a + l.minutes, 0));
    bits.push(`${SCHEDULE_SOURCE_LABEL} ${m}분`);
  }
  if (estLegs.length > 0) {
    const m = round1(estLegs.reduce((a, l) => a + l.minutes, 0));
    const km = round1(estLegs.reduce((a, l) => a + (l.km || 0), 0));
    bits.push(`${ESTIMATE_LABEL} ${m}분(${rate}분/km × ${km}km)`);
  }
  if (transferCount > 0) {
    bits.push(`환승 ${transferCount}회 × ${transferMin}분(${TRANSFER_ASSUMPTION_NOTE})`);
  }
  bits.push(NO_WAIT_NOTE);
  return {
    from,
    to,
    minutes,
    source: "derived",
    rideMinutes: round1(rideExact),
    transferMinutes,
    transferCount,
    transferMin,
    legs,
    methodsUsed: [...methodsUsed].sort(),
    medianMinPerKm: schedule.medianMinPerKm,
    note: bits.join(" · "),
  };
}
