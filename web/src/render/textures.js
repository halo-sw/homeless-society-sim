// PBR materials + procedural texture upload (browser; three.js).
//
// Uploads the pure pixel buffers from render/facades.js to CanvasTextures
// (generated once, cached) and builds the MeshStandardMaterial set:
// per-class facades with night emissive driven by the run's occupancy,
// roof membrane, ground detail, lane paint, water, vegetation, street.
//
// Night emissive: the emissive map holds R=window mask, G=per-window lit
// threshold; a per-vertex aLit attribute carries each building's lit
// fraction (at-home residents / agents housed there, 0 by day via the
// uNight uniform). See render/facades.js.

import * as THREE from "three";
import { FACADE_TILES, TEX_SIZE, synthFacade, synthGroundDetail } from "./facades.js";
import { WATER_PBR } from "../palette.js";

const cache = new Map();
const litMaterials = new Set();
let pendingNight = 0; // shaders compile lazily; new programs start here

function canvasFrom(buf, size) {
  if (typeof document === "undefined") {
    throw new Error("facade textures need a DOM canvas (browser-only)");
  }
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.putImageData(new ImageData(buf, size, size), 0, 0);
  return canvas;
}

function toTexture(buf, size, { srgb, rx, ry, aniso }) {
  const tex = new THREE.CanvasTexture(canvasFrom(buf, size));
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(rx, ry);
  tex.anisotropy = aniso;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// One facade texture set (map + packed rough/metal + emissive), cached.
export function facadeSet(facadeClass, { seed = 1, aniso = 4 } = {}) {
  const key = `${facadeClass}:${seed}`;
  if (!cache.has(key)) {
    const { map, rough, emissive } = synthFacade(facadeClass, seed);
    const tile = FACADE_TILES[facadeClass];
    const rx = 1 / tile.w;
    const ry = 1 / tile.h;
    cache.set(key, {
      map: toTexture(map, TEX_SIZE, { srgb: true, rx, ry, aniso }),
      roughMetal: toTexture(rough, TEX_SIZE, { srgb: false, rx, ry, aniso }),
      emissive: toTexture(emissive, TEX_SIZE, { srgb: false, rx, ry, aniso }),
    });
  }
  return cache.get(key);
}

export function groundDetailTexture({ seed = 1, aniso = 4 } = {}) {
  if (!cache.has("ground")) {
    const { size, data } = synthGroundDetail(seed);
    cache.set("ground", toTexture(data, size,
      { srgb: true, rx: 1 / 8, ry: 1 / 8, aniso }));
  }
  return cache.get("ground");
}

// Patch a facade material: per-vertex lit fraction + night gate.
// aLit attribute + uNight uniform; chain-safe (composes with the
// occlusion-fade patch main.js applies later — see makeFadeable).
export function patchLitMaterial(material) {
  const prevCompile = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    if (prevCompile) prevCompile(shader, renderer);
    shader.uniforms.uNight = { value: pendingNight };
    shader.uniforms.uLampColor = { value: new THREE.Color(1.0, 0.72, 0.42) };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aLit;\nvarying float vLit;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLit = aLit;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uNight;\nuniform vec3 uLampColor;\nvarying float vLit;")
      .replace("#include <emissivemap_fragment>",
        "#ifdef USE_EMISSIVEMAP\n" +
        "\tvec4 litTex = texture2D( emissiveMap, vEmissiveMapUv );\n" +
        "\tfloat litOn = step( litTex.g, vLit ) * litTex.r;\n" +
        "\ttotalEmissiveRadiance = uLampColor * ( litOn * uNight * 2.4 );\n" +
        "#endif\n");
    material.userData.shader = shader;
  };
  material.customProgramCacheKey = () => `${prevKey ? prevKey() : "std"}:lit`;
  material.needsUpdate = true;
  litMaterials.add(material);
  return material;
}

// uNight across every lit facade material (0 by day).
export function setGlobalNight(v) {
  pendingNight = v;
  for (const m of litMaterials) {
    const shader = m.userData.shader;
    if (shader) shader.uniforms.uNight.value = v;
  }
}

export function clearTextureCache() {
  for (const set of cache.values()) {
    for (const tex of Object.values(set)) {
      if (tex && tex.dispose) tex.dispose();
    }
  }
  cache.clear();
  litMaterials.clear();
}

export function facadeMaterial(facadeClass, opts = {}) {
  const set = facadeSet(facadeClass, opts);
  const mat = new THREE.MeshStandardMaterial({
    map: set.map,
    roughnessMap: set.roughMetal,
    metalnessMap: set.roughMetal,
    emissiveMap: set.emissive,
    emissive: 0xffffff,
    emissiveIntensity: 1,
    roughness: 1,
    metalness: 1,
    vertexColors: true,
    side: THREE.DoubleSide,
    transparent: true, // occlusion fade + 주거만 강조 need alpha
  });
  return patchLitMaterial(mat);
}

export function roofMaterial(opts = {}) {
  const set = facadeSet("roof", opts);
  return new THREE.MeshStandardMaterial({
    map: set.map,
    roughnessMap: set.roughMetal,
    roughness: 1,
    metalness: 0,
    vertexColors: true,
    side: THREE.DoubleSide,
    transparent: true, // occlusion fade needs alpha
  });
}

export function groundMaterial(opts = {}) {
  return new THREE.MeshStandardMaterial({
    map: groundDetailTexture(opts),
    roughness: 0.95,
    metalness: 0,
    vertexColors: true,
  });
}

export function markingMaterial() {
  return new THREE.MeshStandardMaterial({
    roughness: 0.55,
    metalness: 0,
    vertexColors: true,
  });
}

export function waterMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: WATER_PBR,
    roughness: 0.07,
    metalness: 0.05,
    envMapIntensity: 1.6,
  });
}

export function vegetationMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
}

export function trunkMaterial(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0 });
}

export function carBodyMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.35, metalness: 0.6,
  });
}

export function carGlassMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x2a3540, roughness: 0.12, metalness: 0.4,
  });
}

export function lampPoleMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x3c4148, roughness: 0.6, metalness: 0.5 });
}

export function lampHeadMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x444444, roughness: 0.4, metalness: 0,
    emissive: 0xffb377, emissiveIntensity: 0,
  });
}

export function agentMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0 });
}
