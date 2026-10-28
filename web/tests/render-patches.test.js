// Stage 5d: the lit (textures.js) and occluder-fade (fade.js) shader
// patches must chain on a real MeshStandardMaterial. Each patch wraps
// material.customProgramCacheKey, which on an unpatched material is
// three's prototype method reading this.onBeforeCompile — calling the
// captured previous key unbound throws on first render (5a+5b merge).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { patchLitMaterial } from "../src/render/textures.js";
import { OCCLUDE_FADE, applyStopFade, makeFadeable } from "../src/render/fade.js";

function litMesh() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  return new THREE.Mesh(geo, patchLitMaterial(new THREE.MeshStandardMaterial()));
}

describe("lit + occluder-fade patch chain", () => {
  it("calls customProgramCacheKey() without throwing, distinct key per chain", () => {
    const litOnly = litMesh();
    const chained = litMesh();
    makeFadeable(chained);
    const fadeOnly = new THREE.Mesh(
      (() => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position",
          new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
        return geo;
      })(),
      new THREE.MeshStandardMaterial(),
    );
    makeFadeable(fadeOnly);

    // Regression: the unbound prevKey() call threw
    // "Cannot read properties of undefined (reading 'onBeforeCompile')".
    const litKey = litOnly.material.customProgramCacheKey();
    const chainedKey = chained.material.customProgramCacheKey();
    const fadeKey = fadeOnly.material.customProgramCacheKey();
    for (const key of [litKey, chainedKey, fadeKey]) {
      assert.equal(typeof key, "string");
      assert.ok(key.length > 0);
    }
    assert.ok(litKey.endsWith(":lit"), litKey);
    assert.ok(chainedKey.endsWith(":lit:occluder-fade"), chainedKey);
    assert.ok(fadeKey.endsWith(":occluder-fade"), fadeKey);
    assert.equal(new Set([litKey, chainedKey, fadeKey]).size, 3);
  });

  it("runs both onBeforeCompile patches in chain order", () => {
    const mesh = litMesh();
    makeFadeable(mesh);
    const shader = {
      uniforms: {},
      vertexShader: "#include <common>\n#include <begin_vertex>\n#include <fog_vertex>\n",
      fragmentShader: "#include <common>\n#include <emissivemap_fragment>\n#include <color_fragment>\n",
    };
    mesh.material.onBeforeCompile(shader, {});
    assert.ok(shader.vertexShader.includes("attribute float aLit;"));
    assert.ok(shader.vertexShader.includes("attribute float afade;"));
    assert.ok(shader.fragmentShader.includes("uniform float uNight;"));
    assert.ok(shader.fragmentShader.includes("diffuseColor.a *= vFade;"));
    assert.ok("uNight" in shader.uniforms);
  });

  it("applyStopFade dims only the listed ranges", () => {
    const mesh = litMesh();
    makeFadeable(mesh);
    const ranges = new Map([{ id: "b1", start: 0, count: 2 }].map((r) => [r.id, r]));
    applyStopFade([{ mesh, ranges }], ["b1"]);
    const attr = mesh.geometry.attributes.afade;
    const faded = Math.fround(OCCLUDE_FADE); // afade is a Float32 attribute
    assert.equal(attr.array[0], faded);
    assert.equal(attr.array[1], faded);
    assert.equal(attr.array[2], 1);
    applyStopFade([{ mesh, ranges }], []);
    assert.deepEqual([...attr.array], [1, 1, 1]);
  });
});
