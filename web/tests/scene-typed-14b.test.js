import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toTypedMesh } from "../src/scene/load.js";
import { buildRoadMeshes, buildWaterRibbons } from "../src/scene/roads.js";
import { buildTerrainMesh } from "../src/scene/terrain.js";
import { DEFAULT_LOOK } from "../src/render/look.js";

const LOOK = { ...DEFAULT_LOOK };

describe("14b typed scene meshes", () => {
  it("converts plain arrays to typed arrays", () => {
    const t = toTypedMesh({
      positions: [0, 0, 0, 1, 0, 0, 0, 0, 1],
      colors: [1, 1, 1, 1, 1, 1, 1, 1, 1],
      uvs: [0, 0, 1, 0, 0, 1],
      indices: [0, 1, 2],
      triangles: 1,
    });
    assert.ok(t.positions instanceof Float32Array);
    assert.ok(t.colors instanceof Float32Array);
    assert.ok(t.uvs instanceof Float32Array);
    assert.ok(t.indices instanceof Uint16Array);
    assert.equal(t.triangles, 1);
    assert.deepEqual([...t.indices], [0, 1, 2]);
  });
  it("uses Uint32Array once an index exceeds 65535", () => {
    const t = toTypedMesh({
      positions: [], colors: [], uvs: [], indices: [0, 70000],
    });
    assert.ok(t.indices instanceof Uint32Array);
    assert.deepEqual([...t.indices], [0, 70000]);
  });
  it("passes already-typed input through untouched", () => {
    const src = {
      positions: new Float32Array([0, 0, 0]),
      colors: new Float32Array([1, 1, 1]),
      uvs: new Float32Array([0, 0]),
      indices: new Uint32Array([0]),
    };
    const t = toTypedMesh(src);
    assert.equal(t.positions, src.positions);
    assert.equal(t.indices, src.indices);
  });
  it("road and water builders return typed arrays", () => {
    const { meshes } = buildRoadMeshes(
      [{ k: "tertiary", n: null, w: 9, br: 0, p: [[0, 0], [10, 0]] }],
      () => 10, LOOK);
    for (const m of Object.values(meshes)) {
      assert.ok(m.positions instanceof Float32Array);
      assert.ok(m.colors instanceof Float32Array);
      assert.ok(m.uvs instanceof Float32Array);
      assert.ok(m.indices instanceof Uint16Array
        || m.indices instanceof Uint32Array);
    }
    const w = buildWaterRibbons(
      [{ k: "stream", w: 4, p: [[0, 0], [6, 0]] }], () => 20, LOOK);
    assert.ok(w.positions instanceof Float32Array);
    assert.ok(w.indices instanceof Uint16Array
      || w.indices instanceof Uint32Array);
  });
  it("terrain mesh stays typed", () => {
    const t = buildTerrainMesh({ x0: 0, z0: 0, step: 5, nx: 3, nz: 3,
      dm: new Array(9).fill(100) }, LOOK);
    assert.ok(t.positions instanceof Float32Array);
    assert.ok(t.indices instanceof Uint32Array);
  });
});
