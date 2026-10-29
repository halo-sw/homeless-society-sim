import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseInterstationCsv } from "../src/transit/schedule.js";
import { allocTrainState, buildTrainTable, stationPulse, trainsAt,
  PULSE_WINDOW_MIN } from "../src/motion/trains.js";

const CSV = [
  "호선,역명,소요시간,역간거리(km)",
  "2,A역,0:00,0.0",
  "2,B역,2:00,1.0",
  "2,C역,3:00,1.5",
].join("\n");
const SCHEDULE = parseInterstationCsv(CSV);

const P_DOWN = { id: "p-down", stops: ["line2:A", "line2:B", "line2:C"],
  chainage_km: [0, 1.0, 2.5],
  geometry: [[127.0, 37.5], [127.01, 37.5], [127.025, 37.5]] };
const P_UP = { id: "p-up", stops: ["line2:C", "line2:B", "line2:A"],
  chainage_km: [0, 1.5, 2.5],
  geometry: [[127.025, 37.5], [127.01, 37.5], [127.0, 37.5]] };
const LINE2 = { id: "line2", name: "2호선", circle: false,
  stops: [{ id: "line2:A", name: "A" }, { id: "line2:B", name: "B" },
    { id: "line2:C", name: "C" }],
  patterns: [P_DOWN, P_UP] };
const LINE9 = { id: "line9", name: "9호선", circle: false,
  stops: [{ id: "line9:B", name: "B" }, { id: "line9:D", name: "D" }],
  patterns: [{ id: "p9", stops: ["line9:B", "line9:D"], chainage_km: [0, 2.0],
    geometry: [[127.01, 37.5], [127.03, 37.5]] }] };

function bytes(arr, count, stride = 3) {
  return Buffer.from(arr.buffer, 0, count * stride * arr.BYTES_PER_ELEMENT);
}

describe("14b trains from schedule", () => {
  it("builds runs from official gap minutes", () => {
    const table = buildTrainTable({ network: { lines: [LINE2] },
      schedule: SCHEDULE, station: "B", seed: "box" });
    assert.equal(table.runs.length, 2);
    const down = table.runs.find((r) => r.patternId === "p-down");
    assert.deepEqual(down.cumMin, [0, 2, 5]);
    assert.equal(down.oneWayMin, 5);
    assert.equal(down.method, "schedule");
    assert.equal(down.stationMin, 2);
    assert.equal(down.cycleMin, 2 * (5 + 4));
    assert.ok(down.trains.length >= 2);
    // "B역" normalizes to the same stop.
    const alt = buildTrainTable({ network: { lines: [LINE2] },
      schedule: SCHEDULE, station: "B역", seed: "box" });
    assert.equal(alt.runs.length, 2);
  });
  it("estimates gaps the schedule does not cover", () => {
    const table = buildTrainTable({ network: { lines: [LINE9] },
      schedule: SCHEDULE, station: "B", seed: "box" });
    assert.equal(table.runs.length, 1);
    // Median 2.0 min/km × 2.0 km.
    assert.equal(table.runs[0].method, "estimate");
    assert.equal(table.runs[0].oneWayMin, 4);
  });
  it("pulses exactly at schedule-derived arrivals", () => {
    const table = buildTrainTable({ network: { lines: [LINE2] },
      schedule: SCHEDULE, station: "B", seed: "box" });
    // Single run in isolation for exact timing.
    const solo = { ...table, runs: [table.runs[0]] };
    const run = solo.runs[0];
    const tArr = run.trains[0] + run.stationMin;
    const hit = stationPulse(solo, tArr);
    assert.ok(hit.pulse > 0.999);
    assert.equal(hit.arrivals[0].inMin, 0);
    const miss = stationPulse(solo, tArr + run.cycleMin / run.trains.length / 2);
    assert.equal(miss.pulse, 0);
    // Window edge: half strength at ±window/2…±window.
    const edge = stationPulse(solo, tArr + PULSE_WINDOW_MIN / 2);
    assert.ok(Math.abs(edge.pulse - 0.5) < 1e-9);
  });
  it("gives byte-equal positions and scrub equality", () => {
    const a = buildTrainTable({ network: { lines: [LINE2, LINE9] },
      schedule: SCHEDULE, station: "B", seed: "box" });
    const b = buildTrainTable({ network: { lines: [LINE2, LINE9] },
      schedule: SCHEDULE, station: "B", seed: "box" });
    const sa = allocTrainState(a.trains);
    const sb = allocTrainState(b.trains);
    for (let t = 0; t < 530; t += 10) trainsAt(a, t, sa); // play up
    const na = trainsAt(a, 530, sa);
    const nb = trainsAt(b, 530, sb); // jump
    assert.equal(na, nb);
    assert.ok(na > 0);
    assert.ok(bytes(sa.data, na).equals(bytes(sb.data, nb)));
  });
  it("shows a pulse, never train meshes (no grade data)", () => {
    const table = buildTrainTable({ network: { lines: [LINE2] },
      schedule: SCHEDULE, station: "B", seed: "box" });
    assert.equal(table.hasGradeData, false);
    assert.equal(table.display, "pulse");
  });
});
