// Stage 13e2-2: pure orb geometry — camera fit (8 % margin, centred),
// label centroids, thin slabs.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fitOrbView, labelCentroids, projectLonLat, shapeCentroid,
  slabDepth, ORB_FIT_MARGIN } from "../src/orb.js";

const SHAPES = [
  { id: "seongdong", label: "성동", bbox: [127.0, 37.5, 127.08, 37.55] },
  { id: "songpa", label: "송파", bbox: [127.08, 37.45, 127.16, 37.52] },
];

describe("13e2 orb camera fit", () => {
  it("projects lon/lat with the documented origin", () => {
    assert.deepEqual(projectLonLat(127.08, 37.62), [0, 0]);
    const [x, z] = projectLonLat(127.0, 37.5);
    assert.ok(Math.abs(x - -4.8) < 1e-9, `x=${x}`);
    assert.ok(Math.abs(z - 7.2) < 1e-9, `z=${z}`);
  });

  it("centres on the shapes' bounds with 8 % margin", () => {
    assert.equal(ORB_FIT_MARGIN, 0.08);
    const view = fitOrbView(SHAPES, 16 / 9, 42);
    // Raw bounds: lon 127.0..127.16 -> x -4.8..4.8 (width 9.6);
    // lat 37.45..37.55 -> z 4.2..10.2 (depth 6, centre 7.2).
    assert.ok(Math.abs(view.center[0] - 0) < 1e-9, `cx=${view.center[0]}`);
    assert.ok(Math.abs(view.center[1] - 7.2) < 1e-9, `cz=${view.center[1]}`);
    assert.ok(Math.abs(view.width - 9.6 * 1.08) < 1e-9, `w=${view.width}`);
    assert.ok(Math.abs(view.depth - 6 * 1.08) < 1e-9, `d=${view.depth}`);
    assert.ok(Number.isFinite(view.distance) && view.distance > 0, "distance");
  });

  it("frames wider viewports from closer", () => {
    const narrow = fitOrbView(SHAPES, 1, 42);
    const wide = fitOrbView(SHAPES, 16 / 9, 42);
    assert.ok(wide.distance < narrow.distance, `${wide.distance} < ${narrow.distance}`);
  });

  it("falls back to the default bbox with no shapes", () => {
    const view = fitOrbView([], 1, 42);
    assert.ok(Number.isFinite(view.center[0]) && Number.isFinite(view.center[1]));
    assert.ok(view.width > 0 && view.depth > 0 && view.distance > 0);
  });
});

describe("13e2 orb labels and slabs", () => {
  it("puts each label at its projected bbox centroid", () => {
    const labels = labelCentroids(SHAPES);
    assert.equal(labels.length, 2);
    assert.equal(labels[0].id, "seongdong");
    assert.equal(labels[0].label, "성동");
    // 성동 lon centre 127.04 -> x -2.4; lat centre 37.525 -> z 5.7.
    assert.ok(Math.abs(labels[0].x - -2.4) < 1e-9, `x=${labels[0].x}`);
    assert.ok(Math.abs(labels[0].z - 5.7) < 1e-9, `z=${labels[0].z}`);
    assert.deepEqual([labels[1].x, labels[1].z], shapeCentroid(SHAPES[1]));
  });

  it("keeps extrusion depth at most 2 % of the map width", () => {
    assert.ok(Math.abs(slabDepth(9.6) - 0.192) < 1e-9);
    assert.ok(slabDepth(20) <= 20 * 0.02);
    assert.ok(slabDepth(0) > 0, "never zero");
  });
});
