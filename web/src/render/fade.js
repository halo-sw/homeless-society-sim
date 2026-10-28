// Occluder fade (tour mode): per-vertex alpha on the merged building
// meshes so residual occluders — and the tall host tower of an embedded
// POI stop — dim instead of hiding the stop. Patched once per mesh;
// per-stop updates only rewrite the afade attribute.
//
// The shadow pass gets the same treatment: without a matching depth
// material, faded buildings cast full-strength ghost shadows with no
// visible building above them (the stage-7 torn-shadow report), so the
// depth material discards faded fragments (stage 7, Part C).
import * as THREE from "three";

export const OCCLUDE_FADE = 0.22;

export function makeFadeable(mesh) {
  const count = mesh.geometry.attributes.position.count;
  mesh.geometry.setAttribute("afade", new THREE.BufferAttribute(new Float32Array(count).fill(1), 1));
  mesh.material.transparent = true;
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float afade;\nvarying float vFade;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFade = afade;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vFade;")
      .replace("#include <map_fragment>", "#include <map_fragment>\nif (vFade < 0.5) discard;");
  };
  depth.customProgramCacheKey = () => "occluder-fade-depth";
  mesh.customDepthMaterial = depth;
  // Chain-safe: facade materials already carry the night-emissive patch.
  const prevCompile = mesh.material.onBeforeCompile;
  const prevKey = mesh.material.customProgramCacheKey;
  mesh.material.onBeforeCompile = (shader, renderer) => {
    if (prevCompile) prevCompile.call(mesh.material, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float afade;\nvarying float vFade;")
      .replace("#include <fog_vertex>", "#include <fog_vertex>\nvFade = afade;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vFade;")
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.a *= vFade;");
  };
  // prevKey may be three's prototype method (reads this.onBeforeCompile)
  // or the lit patch above — either way it needs the material as `this`.
  const fadeMaterial = mesh.material;
  fadeMaterial.customProgramCacheKey = function () {
    return `${prevKey ? prevKey.call(fadeMaterial) : "std"}:occluder-fade`;
  };
  mesh.material.needsUpdate = true;
}

export function applyStopFade(fadeMeshes, ids) {
  for (const { mesh, ranges } of fadeMeshes) {
    const attr = mesh.geometry.attributes.afade;
    attr.array.fill(1);
    for (const id of ids) {
      const r = ranges.get(id);
      if (r) attr.array.fill(OCCLUDE_FADE, r.start, r.start + r.count);
    }
    attr.needsUpdate = true;
  }
}
