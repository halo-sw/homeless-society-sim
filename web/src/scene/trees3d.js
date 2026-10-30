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
import { resamplePoints, roadMaterialClass, roadOrder } from "./roads.js";

export const TREE_SHADOW_M = 150;
export const TREE_TINT = 0.08;

export const TRUNK_COLOR = 0x7a5c42;
export const LEAF_COLORS = { conifer: 0x3a5f47, broadleaf: 0x7ba05b,
                             shrub: 0x5f7f43 };

// Painted per-instance leaf palette (stage 14e): seeded greens, plus an
// autumn share from mid-October through November (by sim date).
export const LEAF_GREENS = [0x4a7c43, 0x6b8f3e, 0x7ba05b];
export const LEAF_AUTUMN = [0xd9b13b, 0xc8742f, 0xa84232];
export const AUTUMN_SHARE = 0.55;

// Rule-filled street trees (labeled 가정값 in the legend): one tree per
// 9 m on both sidewalks of residential-and-larger roads that have none
// in the data, past the kerb, skipping buildings and nearby trees.
export const FILL_SPACING_M = 9;
export const FILL_SIDE_OFF_M = 2.0;
export const FILL_CLEAR_M = 3;
export const FILL_ROAD_EMPTY_M = 5;
export const MAX_FILL_TREES = 4000;

export function treeRotation(x, z) {
  return hashUnit(hashString(`${x.toFixed(1)},${z.toFixed(1)}`), 5) * Math.PI * 2;
}

export function treeTint(x, z) {
  const k = hashUnit(hashString(`${x.toFixed(1)},${z.toFixed(1)}`), 9);
  return 1 - TREE_TINT + k * TREE_TINT * 2;
}

// Mid-October (15th) through November, from a YYYY-MM-DD (or MM-DD) date.
export function inAutumnWindow(dateISO) {
  const m = /(\d{1,2})-(\d{1,2})$/.exec(String(dateISO || "").trim());
  if (!m) return false;
  const mo = Number(m[1]);
  const day = Number(m[2]);
  if (mo < 1 || mo > 12 || day < 1 || day > 31) return false;
  return (mo === 10 && day >= 15) || mo === 11;
}

// Seeded per-instance leaf colour: greens outside autumn, a 55 % autumn
// share (yellow/orange/red) inside the window. Pure and deterministic.
export function treeColour(seed, dateISO = null) {
  const key = String(seed ?? "0");
  const k = hashUnit(hashString(key), 7);
  if (inAutumnWindow(dateISO) && k < AUTUMN_SHARE) {
    const j = hashUnit(hashString(`${key}:autumn`), 3);
    return LEAF_AUTUMN[Math.min(LEAF_AUTUMN.length - 1, Math.floor(j * 3))];
  }
  return LEAF_GREENS[Math.min(LEAF_GREENS.length - 1, Math.floor(k * 3))];
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
  // 14e: two overlapping spheres read as a round cluster (50 triangles:
  // 10 trunk + 2 × 20 crowns, under the 60-triangle budget).
  const parts = [trunk(3.0, 0.18, 0.28)];
  const crown = new THREE.IcosahedronGeometry(2.6, 0);
  crown.scale(1, 0.85, 1);
  crown.translate(0, 4.8, 0);
  parts.push(painted(crown, LEAF_COLORS.broadleaf));
  const crown2 = new THREE.IcosahedronGeometry(1.8, 0);
  crown2.scale(1, 0.9, 1);
  crown2.translate(1.5, 3.9, 0.9);
  parts.push(painted(crown2, LEAF_COLORS.broadleaf));
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

// --- rule-filled street trees (pure; main.js lifts them via heightAt) ---

function cellKey(cx, cy) {
  return `${cx},${cy}`;
}

function pointInRingXZ(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function distToSegXZ(x, z, a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz || 1;
  const t = Math.min(1, Math.max(0, ((x - a[0]) * dx + (z - a[1]) * dz) / len2));
  return Math.hypot(x - (a[0] + t * dx), z - (a[1] + t * dz));
}

// Fill street trees along residential-and-larger roads (class order ≤ 5,
// at grade) that have no tree within w/2 + 5 m in the data: one tree per
// 9 m on both sidewalks, w/2 + 2 m out. Skips spots inside (or within
// 3 m of) a building footprint ring or within 3 m of another tree.
// roads: scene format [{k, w, br, p}]; trees: [[x, z, scale, species]];
// rings: footprint rings in scene coords. Returns {trees, stats} with
// new trees as [x, z, scale, 1] broadleaf entries in input order.
export function fillStreetTrees(roads, trees, rings, opts = {}) {
  const spacing = opts.spacing ?? FILL_SPACING_M;
  const sideOff = opts.sideOff ?? FILL_SIDE_OFF_M;
  const clear = opts.clear ?? FILL_CLEAR_M;
  const emptyPad = opts.emptyPad ?? FILL_ROAD_EMPTY_M;
  const maxTrees = opts.maxTrees ?? MAX_FILL_TREES;
  const stats = { roads: 0, emptyRoads: 0, placed: 0, skippedBuilding: 0,
    skippedTree: 0 };
  // Tree spatial hash (existing + placed as we go), 4 m cells.
  const tcells = new Map();
  const tkey = (x, z) => cellKey(Math.floor(x / 4), Math.floor(z / 4));
  const rememberTree = (x, z) => {
    const k = tkey(x, z);
    if (!tcells.has(k)) tcells.set(k, []);
    tcells.get(k).push([x, z]);
  };
  for (const t of trees || []) rememberTree(t[0], t[1]);
  const treeNear = (x, z, r) => {
    const cx = Math.floor(x / 4);
    const cy = Math.floor(z / 4);
    const reach = Math.ceil(r / 4);
    for (let ix = cx - reach; ix <= cx + reach; ix++) {
      for (let iz = cy - reach; iz <= cy + reach; iz++) {
        for (const [tx, tz] of tcells.get(cellKey(ix, iz)) || []) {
          if (Math.hypot(tx - x, tz - z) < r) return true;
        }
      }
    }
    return false;
  };
  // Footprint bbox index, 25 m cells.
  const bcells = new Map();
  for (const ring of rings || []) {
    if (!ring || ring.length < 3) continue;
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (const [x, z] of ring) {
      if (x < minX) minX = x;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (z > maxZ) maxZ = z;
    }
    const entry = { ring, minX, minZ, maxX, maxZ };
    for (let cx = Math.floor((minX - clear) / 25); cx <= Math.floor((maxX + clear) / 25); cx++) {
      for (let cy = Math.floor((minZ - clear) / 25); cy <= Math.floor((maxZ + clear) / 25); cy++) {
        const k = cellKey(cx, cy);
        if (!bcells.has(k)) bcells.set(k, []);
        bcells.get(k).push(entry);
      }
    }
  }
  const blockedByBuilding = (x, z) => {
    const list = bcells.get(cellKey(Math.floor(x / 25), Math.floor(z / 25))) || [];
    for (const e of list) {
      if (x < e.minX - clear || x > e.maxX + clear
          || z < e.minZ - clear || z > e.maxZ + clear) continue;
      if (pointInRingXZ(x, z, e.ring)) return true;
      for (let i = 0; i < e.ring.length; i++) {
        if (distToSegXZ(x, z, e.ring[i], e.ring[(i + 1) % e.ring.length]) < clear) {
          return true;
        }
      }
    }
    return false;
  };
  const out = [];
  for (const road of roads || []) {
    if (roadMaterialClass(road.k) !== "road" || roadOrder(road.k) > 5) continue;
    if (road.br !== 0 || !road.p || road.p.length < 2) continue;
    stats.roads++;
    // Roads that already have trees in the data keep them; only empty
    // roads get the rule fill.
    const probe = resamplePoints(road.p, 8);
    let hasTrees = false;
    for (const [px, pz] of probe) {
      if (treeNear(px, pz, road.w / 2 + emptyPad)) {
        hasTrees = true;
        break;
      }
    }
    if (hasTrees) continue;
    stats.emptyRoads++;
    const pts = resamplePoints(road.p, 2);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0],
        pts[i][1] - pts[i - 1][1]));
    }
    const total = cum[cum.length - 1];
    const at = (s) => {
      let i = 0;
      while (i < cum.length - 2 && cum[i + 1] < s) i++;
      const span = cum[i + 1] - cum[i] || 1;
      const t = (s - cum[i]) / span;
      const ax = pts[i][0];
      const az = pts[i][1];
      const bx = pts[i + 1][0];
      const bz = pts[i + 1][1];
      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.hypot(dx, dz) || 1;
      return { x: ax + dx * t, z: az + dz * t,
        px: -dz / len, pz: dx / len };
    };
    for (let s = spacing / 2; s < total && out.length < maxTrees; s += spacing) {
      const f = at(s);
      for (const side of [-1, 1]) {
        if (out.length >= maxTrees) break;
        const x = f.x + f.px * side * (road.w / 2 + sideOff);
        const z = f.z + f.pz * side * (road.w / 2 + sideOff);
        if (blockedByBuilding(x, z)) {
          stats.skippedBuilding++;
          continue;
        }
        if (treeNear(x, z, clear)) {
          stats.skippedTree++;
          continue;
        }
        const scale = 0.9 + hashUnit(hashString(
          `${x.toFixed(1)},${z.toFixed(1)}`), 13) * 0.2;
        out.push([x, z, scale, 1]);
        rememberTree(x, z);
        stats.placed++;
      }
    }
  }
  return { trees: out, stats };
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
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.9, metalness: 0,
  });
  // 14b: procedural sway — vertex shader driven by t and a
  // per-instance seed (≤ 2 % of tree height; calm at night).
  const uniforms = { uSwayTime: { value: 0 }, uSwayAmp: { value: 1 } };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSwayTime = uniforms.uSwayTime;
    shader.uniforms.uSwayAmp = uniforms.uSwayAmp;
    shader.vertexShader = patchSwayVertex(shader.vertexShader);
  };
  mat.customProgramCacheKey = () => "treeSway1";
  mat.userData.sway = uniforms;
  return mat;
}

export function setSway(material, tSec, amp) {
  const u = material && material.userData && material.userData.sway;
  if (!u) return;
  u.uSwayTime.value = tSec;
  u.uSwayAmp.value = amp;
}

// Pure string transform (tested): sway displacement after begin_vertex.
export function patchSwayVertex(src) {
  return src
    .replace("#include <common>",
      "#include <common>\nuniform float uSwayTime;\nuniform float uSwayAmp;")
    .replace("#include <begin_vertex>", `#include <begin_vertex>
{
  float swayH = clamp( transformed.y / 7.0, 0.0, 1.0 );
  float swayK = uSwayAmp * 0.12 * swayH * swayH;
  #ifdef USE_INSTANCING
    vec2 swaySeed = vec2( instanceMatrix[3][0], instanceMatrix[3][2] );
  #else
    vec2 swaySeed = vec2( 0.0 );
  #endif
  float swayPhase = fract( sin( dot( swaySeed, vec2( 12.9898, 78.233 ) ) )
    * 43758.5453 ) * 6.2831853;
  transformed.x += sin( uSwayTime * 1.1 + swayPhase ) * swayK;
  transformed.z += cos( uSwayTime * 0.9 + swayPhase * 1.7 ) * swayK * 0.6;
}`);
}
