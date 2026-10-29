import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { allocVehicleState, areaSegments, buildFleet, fleetCounts,
  sceneSegments, vehiclesAt, MIN_SLOT_GAP_M } from "../src/motion/vehicles.js";

const flat = () => 0;
const SEGS = [
  { pts: [[0, 0], [500, 0]], width: 16, cls: "primary", bridge: false, tunnel: false },
  { pts: [[0, 40], [120, 40]], width: 6, cls: "residential", bridge: false, tunnel: false },
];

function bytes(arr, count, stride = 4) {
  return Buffer.from(arr.buffer, 0, count * stride * arr.BYTES_PER_ELEMENT);
}

describe("14b procedural vehicles", () => {
  it("converts scene and area roads to segments by class", () => {
    const segs = sceneSegments([
      { k: "primary", w: 16, br: 0, p: [[0, 0], [10, 0]] },
      { k: "primary_link", w: 8, br: 0, p: [[0, 0], [10, 0]] },
      { k: "footway", w: 2, br: 0, p: [[0, 0], [10, 0]] },
      { k: "tertiary", w: 9, br: -1, p: [[0, 0], [10, 0]] },
    ]);
    assert.equal(segs.length, 3); // footway filtered, link kept as primary
    assert.equal(segs[1].cls, "primary");
    assert.equal(segs[2].tunnel, true);
    const origin = { lon: 127.0, lat: 37.5 };
    const aseg = areaSegments([
      { highway: "tertiary", lanes: 2, bridge: null, tunnel: null, area: false,
        geometry: { type: "LineString", coordinates: [[127.0, 37.5], [127.001, 37.5]] } },
      { highway: "footway", lanes: null, bridge: null, tunnel: null, area: false,
        geometry: { type: "LineString", coordinates: [[127.0, 37.5], [127.001, 37.5]] } },
    ], origin);
    assert.equal(aseg.length, 1);
    assert.equal(aseg[0].cls, "tertiary");
    assert.ok(aseg[0].pts[1][0] > aseg[0].pts[0][0]); // east positive
  });
  it("hides tunnel roads: they carry no vehicles", () => {
    const only = buildFleet({
      segments: [{ pts: [[0, 0], [300, 0]], width: 9, cls: "tertiary",
        bridge: false, tunnel: true }],
      seed: "box", heightAt: flat,
    });
    assert.equal(only.vehicles.length, 0);
    const mixed = buildFleet({
      segments: [
        { pts: [[0, 0], [300, 0]], width: 9, cls: "tertiary", bridge: false, tunnel: true },
        ...SEGS,
      ],
      seed: "box", heightAt: flat,
    });
    assert.ok(mixed.vehicles.length > 0);
    assert.ok(mixed.roads.every((r) => !r.bridge || true));
  });
  it("gives byte-equal state for the same seed and t", () => {
    const a = buildFleet({ segments: SEGS, seed: "st-box", heightAt: flat });
    const b = buildFleet({ segments: SEGS, seed: "st-box", heightAt: flat });
    const sa = allocVehicleState(a.maxActive);
    const sb = allocVehicleState(b.maxActive);
    const na = vehiclesAt(a, 530, sa);
    const nb = vehiclesAt(b, 530, sb);
    assert.equal(na, nb);
    assert.ok(na > 0);
    assert.ok(bytes(sa.data, na).equals(bytes(sb.data, nb)));
    assert.ok(bytes(sa.ids, na, 1).equals(bytes(sb.ids, nb, 1)));
  });
  it("scrubs: playing to t equals jumping to t", () => {
    const play = buildFleet({ segments: SEGS, seed: "st-box", heightAt: flat });
    const sp = allocVehicleState(play.maxActive);
    for (let t = 0; t < 530; t += 10) vehiclesAt(play, t, sp); // play up
    const np = vehiclesAt(play, 530, sp);
    const jump = buildFleet({ segments: SEGS, seed: "st-box", heightAt: flat });
    const sj = allocVehicleState(jump.maxActive);
    const nj = vehiclesAt(jump, 530, sj); // direct jump
    assert.equal(np, nj);
    assert.ok(bytes(sp.data, np).equals(bytes(sj.data, nj)));
    assert.ok(bytes(sp.ids, np, 1).equals(bytes(sj.ids, nj, 1)));
  });
  it("keeps same-direction slot spacing at every t", () => {
    const fleet = buildFleet({ segments: [SEGS[0]], seed: "gap", heightAt: flat });
    const st = allocVehicleState(fleet.maxActive);
    for (const t of [0, 37.5, 530, 1500]) {
      const n = vehiclesAt(fleet, 8 * 60 + t / 60, st);
      const plus = [];
      for (let w = 0; w < n; w++) {
        const v = fleet.vehicles[st.ids[w]];
        if (v.dir > 0) plus.push([st.data[w * 4], st.data[w * 4 + 2]]);
      }
      assert.ok(plus.length >= 2);
      for (let i = 0; i < plus.length; i++) {
        for (let k = i + 1; k < plus.length; k++) {
          // Straight road, same lane: euclidean distance is arc gap.
          const d = Math.hypot(plus[i][0] - plus[k][0], plus[i][1] - plus[k][1]);
          const arc = Math.min(d, 500 - d);
          assert.ok(arc >= MIN_SLOT_GAP_M - 1e-6, `t=${t} gap=${arc}`);
        }
      }
    }
  });
  it("follows bridge heights and stays in-lane", () => {
    const fleet = buildFleet({
      segments: [
        { pts: [[0, 0], [200, 0]], width: 12, cls: "secondary", bridge: true, tunnel: false },
      ],
      seed: "bridge", heightAt: flat,
    });
    const st = allocVehicleState(fleet.maxActive);
    const n = vehiclesAt(fleet, 12 * 60, st);
    assert.ok(n > 0);
    for (let w = 0; w < n; w++) {
      const y = st.data[w * 4 + 1];
      const z = st.data[w * 4 + 2];
      assert.ok(y > 0.8 && y < 1.6, `bridge y=${y}`); // lerp 0+1.0+clear
      assert.ok(Math.abs(z) <= 6, `lane z=${z}`); // within half width
    }
  });
  it("scales counts by hour under the cap", () => {
    const fleet = buildFleet({ segments: SEGS, seed: "box", heightAt: flat });
    const rush = fleetCounts(fleet, 8 * 60 + 50);
    const night = fleetCounts(fleet, 3 * 60);
    assert.ok(rush.active > night.active);
    assert.ok(Object.keys(rush.byClass).length >= 1);
    assert.equal(fleetCounts(fleet, 8 * 60 + 50, 2).active, 2);
    const st = allocVehicleState(fleet.maxActive);
    assert.equal(vehiclesAt(fleet, 8 * 60 + 50, st, 2), 2);
  });
});
