import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseInterstationCsv, scheduleLineOf, gapMinutes, rideMinutes,
  unmatchedScheduleStations, SCHEDULE_SOURCE_LABEL, ESTIMATE_LABEL,
  NO_WAIT_NOTE,
} from "../src/transit/schedule.js";
import { findPath } from "../src/engine/journey.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

async function realSchedule() {
  const text = await readFile(
    join(REPO, "scenarios", "transit", "seoul-metro-interstation.csv"), "utf8");
  return parseInterstationCsv(text);
}

async function realNetwork() {
  try {
    return JSON.parse(await readFile(
      join(REPO, "data", "build", "region", "network.json"), "utf8"));
  } catch {
    return null;
  }
}

const TINY_CSV = [
  "연번,호선,역명,소요시간,역간거리(km),호선별누계(km)",
  "1,2,A,00:00,0,0",
  "2,2,B,02:00,1.0,1.0",
  "3,2,C,01:30,0.8,1.8",
].join("\n");

describe("interstation schedule parsing", () => {
  it("parses gaps and the file-computed median rate", () => {
    const s = parseInterstationCsv(TINY_CSV);
    assert.equal(s.gapCount, 2);
    assert.deepEqual(gapMinutes(s, "2", "A", "B"), { minutes: 2, km: 1.0 });
    // Symmetric in travel direction.
    assert.deepEqual(gapMinutes(s, "2", "B", "A"), { minutes: 2, km: 1.0 });
    assert.deepEqual(gapMinutes(s, "2", "B", "C"), { minutes: 1.5, km: 0.8 });
    assert.equal(gapMinutes(s, "2", "A", "C"), null);
    // Median of (2/1, 1.5/0.8) = (2 + 1.875) / 2.
    assert.equal(s.medianMinPerKm, (2 + 1.875) / 2);
    assert.deepEqual(s.lineCounts, { 2: 3 });
  });

  it("maps network lines to schedule lines 1–8 only", () => {
    assert.equal(scheduleLineOf("line2", "2호선"), "2");
    assert.equal(scheduleLineOf("line7", "7호선"), "7");
    assert.equal(scheduleLineOf("sinbundang", "신분당선"), null);
    assert.equal(scheduleLineOf("bundang", "수인·분당선"), null);
    assert.equal(scheduleLineOf("line9", "9호선"), null);
    assert.equal(scheduleLineOf("gyeonggang", "경강선"), null);
  });

  it("reads the committed schedule: lines, gaps, junction branches", async () => {
    const s = await realSchedule();
    assert.deepEqual(s.lineCounts,
      { 1: 10, 2: 52, 3: 34, 4: 26, 5: 56, 6: 40, 7: 42, 8: 19 });
    assert.ok(s.gapCount > 250);
    // The median is computed from the file, never typed in.
    assert.ok(s.medianMinPerKm > 1.0 && s.medianMinPerKm < 2.0);
    // Branch junctions measure from the junction station (verified
    // against OSM geometry): no gap across file neighbours that are
    // not adjacent stations.
    assert.ok(gapMinutes(s, "5", "강동", "둔촌동") !== null);
    assert.ok(gapMinutes(s, "2", "성수", "용답") !== null);
    assert.ok(gapMinutes(s, "2", "신도림", "도림천") !== null);
    assert.equal(gapMinutes(s, "5", "하남검단산", "둔촌동"), null);
    assert.equal(gapMinutes(s, "2", "시청", "용답"), null);
    assert.equal(gapMinutes(s, "2", "신설동", "도림천"), null);
    // Line 2's loop closes: 충정로→시청 is a real gap.
    assert.ok(gapMinutes(s, "2", "충정로", "시청") !== null);
  });
});

describe("rideMinutes over a network path", () => {
  const jamsilGangnam = {
    from: "잠실", to: "강남",
    legs: [{
      line: "line2", lineName: "2호선",
      stops: ["잠실", "잠실새내", "종합운동장", "삼성", "선릉", "역삼", "강남"],
      stopIds: ["a", "b", "c", "d", "e", "f", "g"],
      distanceKm: 6.6,
    }],
    transfers: [], distanceKm: 6.6,
  };

  it("잠실→강남 on 2호선 equals the CSV gap sum", async () => {
    const s = await realSchedule();
    const r = rideMinutes("잠실", "강남", jamsilGangnam, s);
    // Independent expectation: sum the file's per-gap times along the
    // ride (each gap read back through the same parser).
    const stops = jamsilGangnam.legs[0].stops;
    let expect = 0;
    for (let i = 0; i + 1 < stops.length; i++) {
      expect += gapMinutes(s, "2", stops[i], stops[i + 1]).minutes;
    }
    assert.equal(r.source, "derived");
    assert.equal(r.minutes, Math.round(expect * 10) / 10);
    assert.deepEqual(r.methodsUsed, ["schedule"]);
    assert.equal(r.legs[0].method, "schedule");
    assert.equal(r.legs[0].gapsKnown, 6);
    assert.match(r.note, new RegExp(SCHEDULE_SOURCE_LABEL));
    assert.match(r.note, new RegExp(NO_WAIT_NOTE));
    assert.doesNotMatch(r.note, new RegExp(ESTIMATE_LABEL));
  });

  it("estimates non-covered lines from the file median and labels it", async () => {
    const s = await realSchedule();
    const path = {
      from: "강남", to: "판교",
      legs: [{
        line: "sinbundang", lineName: "신분당선",
        stops: ["강남", "판교"], stopIds: ["a", "b"], distanceKm: 10.0,
      }],
      transfers: [], distanceKm: 10.0,
    };
    const r = rideMinutes("강남", "판교", path, s);
    assert.equal(r.source, "derived");
    assert.equal(r.minutes, Math.round(10.0 * s.medianMinPerKm * 10) / 10);
    assert.deepEqual(r.methodsUsed, ["estimate"]);
    assert.equal(r.legs[0].method, "estimate");
    assert.match(r.note, new RegExp(ESTIMATE_LABEL));
    assert.match(r.note, /분\/km × 10km/);
    assert.match(r.note, new RegExp(NO_WAIT_NOTE));
  });

  it("adds the 4분 transfer assumption and labels it", async () => {
    const s = await realSchedule();
    const path = {
      from: "A", to: "D",
      legs: [
        { line: "line2", lineName: "2호선", stops: ["잠실", "잠실새내"],
          stopIds: ["a", "b"], distanceKm: 1.2 },
        { line: "line8", lineName: "8호선", stops: ["잠실", "몽촌토성"],
          stopIds: ["c", "d"], distanceKm: 1.0 },
      ],
      transfers: ["잠실"], distanceKm: 2.2,
    };
    const r = rideMinutes("A", "D", path, s);
    assert.equal(r.transferCount, 1);
    assert.equal(r.transferMinutes, 4);
    assert.equal(r.minutes, Math.round((r.rideMinutes + 4) * 10) / 10);
    assert.match(r.note, /환승 1회 × 4분\(C-ride-split 가정\)/);
    const custom = rideMinutes("A", "D", path, s, { transferMin: 5 });
    assert.equal(custom.transferMinutes, 5);
  });

  it("returns null without a path or a schedule", async () => {
    const s = await realSchedule();
    assert.equal(rideMinutes("a", "b", null, s), null);
    assert.equal(rideMinutes("a", "b", { legs: [] }, s), null);
    assert.equal(rideMinutes("a", "b", jamsilGangnam, null), null);
  });

  it("finds real paths across the new lines", async (t) => {
    const network = await realNetwork();
    const s = await realSchedule();
    if (!network) {
      t.skip("data/build/region/network.json absent (operator rebuilds it)");
      return;
    }
    for (const [from, to] of [["고덕", "판교"], ["대치", "삼성"]]) {
      const path = findPath(network, from, to, 2.0);
      assert.ok(path, `${from}→${to} has a path`);
      const r = rideMinutes(from, to, path, s);
      assert.ok(r, `${from}→${to} has a derived ride total`);
      assert.equal(r.source, "derived");
      assert.ok(r.minutes > 0);
    }
    // The briefed transfers resolve on the lines that meet there.
    const byStation = new Map((network.transfers || [])
      .map((x) => [x.station, x.lines]));
    assert.ok((byStation.get("잠실") || []).length >= 2);
    assert.ok((byStation.get("천호") || []).length >= 2);
    assert.ok((byStation.get("가락시장") || []).length >= 2);
    assert.ok((byStation.get("수서") || []).length >= 2);
    assert.ok((byStation.get("건대입구") || []).length >= 2);
    assert.ok((byStation.get("강남구청") || []).length >= 2);
    assert.ok((byStation.get("판교") || []).length >= 2);
  });

  it("reports schedule/network name mismatches for lines 1–8", async (t) => {
    const network = await realNetwork();
    const s = await realSchedule();
    if (!network) {
      t.skip("data/build/region/network.json absent (operator rebuilds it)");
      return;
    }
    const { scheduleOnly, networkOnly } = unmatchedScheduleStations(s, network);
    // Spot facts: the Seoul Metro-only section ends (Korail/Incheon
    // sections have no schedule rows) and OSM-only names are reported.
    const only = (list) => list.map((x) => `${x.line}:${x.station}`);
    assert.ok(only(networkOnly).some((x) => x.startsWith("3:")),
      `line 3 OSM-only stations reported (got ${networkOnly.length})`);
    assert.ok(scheduleOnly.length > 0 && networkOnly.length > 0);
  });
});
