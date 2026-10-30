// Stage 20f: follow-mode polish (pure helper + main.js source pins).
//
// - The commute walk to the station reads "{label}역 · 지하철 타는 곳"
//   (decided by the trip — a ride follows within 30 min — never "역역").
// - Every follow branch applies the follow offset; OrbitControls zoom /
//   rotate are off while following and restored in free mode + overview.
// - The old destPin pill is gone from the trip branch (the 20b label
//   carries it); only the ride-away boarding pill still uses destPin.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { destPillText, destSuffixFor, isStationBoundCommute } from "../src/labels3d.js";
import { followZoomAfterWheel } from "../src/camera.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const mainSrc = readFileSync(join(HERE, "../src/main.js"), "utf8");

const walkToJamsil = { id: "t1", agent: "h1", day: 1, purpose: "commute",
  depart_min: 480, arrive_min: 500,
  to: { kind: "poi", id: "s1", label: "잠실" } };
const rideAfter = [{ agent: "h1", day: 1, start_min: 510, kind: "ride" }];

describe("20f destination pill", () => {
  it("a commute to 잠실 followed by a ride gives 잠실역 · 지하철 타는 곳", () => {
    assert.ok(isStationBoundCommute(walkToJamsil, rideAfter));
    assert.equal(destPillText("잠실", walkToJamsil, rideAfter), "잠실역 · 지하철 타는 곳");
    assert.equal(destSuffixFor(walkToJamsil, rideAfter), "지하철 타는 곳");
  });

  it("강남역 gives 강남역 · 지하철 타는 곳, not 역역", () => {
    const t = { ...walkToJamsil, to: { kind: "poi", id: "s2", label: "강남역" } };
    assert.equal(destPillText("강남역", t, rideAfter), "강남역 · 지하철 타는 곳");
    assert.equal(destSuffixFor(t, rideAfter), "지하철 타는 곳");
  });

  it("a station-node destination reads 지하철 타는 곳 even without aways", () => {
    const t = { ...walkToJamsil,
      to: { kind: "station", id: "st9", label: "잠실" } };
    assert.equal(destPillText("잠실", t, []), "잠실역 · 지하철 타는 곳");
  });

  it("an errand to GS25 gives GS25 · 장보기 가는 곳", () => {
    const t = { id: "t2", agent: "h1", day: 1, purpose: "errand",
      depart_min: 600, arrive_min: 610,
      to: { kind: "poi", id: "g", label: "GS25" } };
    assert.equal(destPillText("GS25", t, rideAfter), "GS25 · 장보기 가는 곳");
    assert.equal(destSuffixFor(t, rideAfter), "장보기 가는 곳");
  });

  it("a commute with no ride after it keeps 출근 가는 곳", () => {
    assert.equal(destPillText("직장", walkToJamsil, []), "직장 · 출근 가는 곳");
    assert.equal(destSuffixFor(walkToJamsil, []), "출근 가는 곳");
  });
});

describe("20f follow camera source pins", () => {
  it("no raw pose copy is left inside the follow code", () => {
    assert.ok(!/camera\.position\.copy\(pose\.pos\)/.test(mainSrc),
      "every follow branch goes through the follow offset");
    assert.match(mainSrc, /applyFollowOffset\([\s\S]*?followZoom/);
  });

  it("enableZoom = false is set when following", () => {
    assert.ok(mainSrc.includes("controls.enableZoom = false"),
      "following hands zoom to the follow wheel handler");
    assert.ok(mainSrc.includes("controls.enableRotate = false"));
  });

  it("free mode and overview restore OrbitControls zoom/rotate", () => {
    assert.ok(mainSrc.includes("controls.enableZoom = true"));
  });

  it("the trip branch no longer paints destPin (one destination pill)", () => {
    const paints = mainSrc.match(/paintTagPin\(destPin/g) || [];
    assert.equal(paints.length, 1, "only the ride-away boarding pill uses destPin");
  });

  it("the wheel handler scales with delta via followZoomAfterWheel", () => {
    assert.match(mainSrc, /followZoomAfterWheel\(followZoom,\s*e\.deltaY,\s*e\.deltaMode\)/);
    assert.ok(!/1\.12/.test(mainSrc), "no fixed per-event factor remains");
  });
});

describe("20g followZoomAfterWheel", () => {
  it("wheel down 500px zooms out ~2.1x", () => {
    const z = followZoomAfterWheel(1, 500, 0);
    assert.ok(z > 2.0 && z < 2.2, `got ${z}`);
  });

  it("wheel up 500px clamps at 0.5", () => {
    const z = followZoomAfterWheel(1, -500, 0);
    assert.ok(z >= 0.45 && z <= 0.5, `got ${z}`);
  });

  it("line mode scales x16", () => {
    assert.equal(followZoomAfterWheel(1, 3, 1), followZoomAfterWheel(1, 48, 0));
  });

  it("a huge wheel-down clamps at 6", () => {
    assert.equal(followZoomAfterWheel(5, 5000, 0), 6);
  });

  it("a trackpad nudge stays small", () => {
    assert.ok(followZoomAfterWheel(1, 4, 0) < 1.01);
  });
});
