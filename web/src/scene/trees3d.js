// OSM-driven instanced trees (three.js geometry + pure placement math).
//
// Three InstancedMesh — conifer / broadleaf / shrub — each ≤ 200
// triangles, trunk + leaves merged with vertex colours (spec §5.4).
// Per-instance tint (±8 %), scale (scene value) and rotation (hashed from
// the position, so it is stable without storing it) are deterministic.
// Shadows cut off past TREE_SHADOW_M via a patched depth material.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { hashString, hashUnit } from "../palette.js";

export const TREE_SHADOW_M = 150;
export const TREE_TINT = 0.08;

export const TRUNK_COLOR = 0x7a5c42;
export const LEAF_COLORS = { conifer: 0x3a5f47, broadleaf: 0x7ba05b,
                             shrub: 0x5f7f43 };

export function treeRotation(x, z) {
  return hashUnit(hashString(`${x.toFixed(1)},${z.toFixed(1)}`), 5) * Math.PI * 2;
}

export function treeTint(x, z) {
  const k = hashUnit(hashString(`${x.toFixed(1)},${z.toFixed(1)}`), 9);
  return 1 - TREE_TINT + k * TREE_TINT * 2;
}

function painted(geo, hex) {
  const color = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = color.r;
    arr[i * 3 + 1] = color.g;
    arr[i * 3 + 2] = color.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return geo;
}

function trunk(h, rTop, rBottom) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, 5, 1, true);
  g.translate(0, h / 2, 0);
  return painted(g, TRUNK_COLOR);
}

// mergeGeometries needs all-indexed or all-non-indexed parts;
// the icosahedron crown is non-indexed, so flatten everything.
function mergeParts(parts) {
  return mergeGeometries(parts.map((g) => (g.getIndex() ? g.toNonIndexed() : g)));
}

export function coniferGeometry() {
  const parts = [trunk(2.2, 0.16, 0.26)];
  const low = new THREE.ConeGeometry(2.0, 3.4, 8, 1, true);
  low.translate(0, 3.4, 0);
  parts.push(painted(low, LEAF_COLORS.conifer));
  const high = new THREE.ConeGeometry(1.35, 2.8, 8, 1, true);
  high.translate(0, 5.4, 0);
  parts.push(painted(high, LEAF_COLORS.conifer));
  return mergeParts(parts);
}

export function broadleafGeometry() {
  const parts = [trunk(3.0, 0.18, 0.28)];
  const crown = new THREE.IcosahedronGeometry(2.6, 1);
  crown.scale(1, 0.85, 1);
  crown.translate(0, 4.8, 0);
  parts.push(painted(crown, LEAF_COLORS.broadleaf));
  return mergeParts(parts);
}

export function shrubGeometry() {
  const g = new THREE.SphereGeometry(1.4, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  g.translate(0, 0.2, 0);
  return painted(g, LEAF_COLORS.shrub);
}

export function treeGeometry(species) {
  if (species === 0) return coniferGeometry();
  if (species === 2) return shrubGeometry();
  return broadleafGeometry();
}

export function treeTriangleCount(geo) {
  const index = geo.getIndex();
  return (index ? index.count : geo.attributes.position.count) / 3;
}

// --- shadow cutoff (past 150 m trees skip the shadow map) ---
// Pure string transforms (tested) applied to a MeshDepthMaterial.

export function patchDepthVertex(src) {
  return src
    .replace("#include <common>", "#include <common>\nvarying vec3 vTreeWorld;")
    .replace("#include <begin_vertex>", `#include <begin_vertex>
{
  vec4 twp = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    twp = instanceMatrix * twp;
  #endif
  vTreeWorld = ( modelMatrix * twp ).xyz;
}`);
}

export function patchDepthFragment(src) {
  return src
    .replace("#include <common>",
      "#include <common>\nvarying vec3 vTreeWorld;")
    .replace("#include <clipping_planes_fragment>",
      `#include <clipping_planes_fragment>
  if ( distance( vTreeWorld, cameraPosition ) > ${TREE_SHADOW_M.toFixed(1)} ) discard;`);
}

export function treeShadowMaterial() {
  const mat = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
  });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = patchDepthVertex(shader.vertexShader);
    shader.fragmentShader = patchDepthFragment(shader.fragmentShader);
  };
  mat.customProgramCacheKey = () => "treeShadow150";
  return mat;
}

export function treeMaterial() {
  return new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.9, metalness: 0,
  });
}
