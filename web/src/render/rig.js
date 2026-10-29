// Sun/sky/environment rig (browser; three.js).
//
// Driven by the sim clock through the pure render/sky.js parameters:
// directional sun (+moonlight at night) with a shadow frustum that
// follows the camera target, hemisphere fill, a Preetham Sky dome for
// day/golden hour, and a PMREM environment captured from that dome so
// PBR materials (glass, water, cars) pick up the sky. The environment
// refreshes only when the lighting key changes (per sim minute at most;
// once for the fixed tour sun).

import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { sunDirection } from "../lighting.js";
import { skyParams, fogRangeFor } from "./sky.js";
import { DEFAULT_LOOK } from "./look.js";
import { SHADOW_BIAS, shadowFit, shadowHalfExtent, snapTargetToTexel } from "./shadows.js";

// Fixed moon direction when the sun is down (unit-ish, y-up world).
const MOON_DIR = (() => {
  const v = new THREE.Vector3(0.55, 0.75, 0.35);
  return v.normalize();
})();

export function createSkyRig(scene, renderer, { span = 1000 } = {}) {
  const sun = new THREE.DirectionalLight(0xfff2dd, 3.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = SHADOW_BIAS;
  sun.shadow.normalBias = 0.3; // per-frame fit below overwrites this
  sun.shadow.intensity = 1.0;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xbfd6e8, 0x9a8f7a, 1.0);
  scene.add(hemi);

  const sky = new Sky();
  sky.scale.setScalar(Math.max(2000, span * 3));
  sky.material.uniforms.mieCoefficient.value = 0.006;
  sky.material.uniforms.mieDirectionalG.value = 0.8;
  scene.add(sky);

  // Offscreen twin for the PMREM capture (main-sky uniforms are copied).
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = new Sky();
  envSky.scale.setScalar(100);
  envScene.add(envSky);
  let envRT = null;
  let lastEnvKey = "";

  const sunDir = new THREE.Vector3();
  const bg = new THREE.Color();

  function syncSkyUniforms(skyMesh, p, dir, look) {
    const u = skyMesh.material.uniforms;
    u.turbidity.value = p.turbidity;
    u.rayleigh.value = p.rayleigh * (look.rayleighGain || 1);
    u.sunPosition.value.copy(dir);
  }

  function update({ lat, lon, date, minute, target = { x: 0, z: 0 }, shadowSpan = 240, envKey = null, framedWidth = null, maxHeightM = 250, look = null }) {
    const p = skyParams(lat, lon, date, minute);
    const l = look || DEFAULT_LOOK;
    // Sun above the horizon; moonlight below it.
    if (p.altitude > -1) {
      const [x, y, z] = sunDirection(lat, lon, date);
      sunDir.set(x, Math.max(y, 0.03), z).normalize();
    } else {
      sunDir.copy(MOON_DIR);
    }
    // Shadow frustum fit (stage 7, Part C): the ortho extent follows
    // the framed area, near/far hug the scene depth along the light,
    // and the target snaps to the texel grid — no more torn bands from
    // a 1..2200 m depth range or a swimming map.
    const dist = Math.max(800, span * 1.2);
    const half = shadowHalfExtent({ framedWidthM: framedWidth === null ? span : framedWidth,
      spanMaxM: shadowSpan });
    const fit = shadowFit({ halfM: half, distM: dist, maxHeightM,
      mapSize: sun.shadow.mapSize.x });
    const snapped = snapTargetToTexel({ x: target.x, z: target.z,
      sunDir: [sunDir.x, sunDir.y, sunDir.z], texelM: fit.texelM });
    sun.position.set(snapped.x + sunDir.x * dist, snapped.y + sunDir.y * dist,
      snapped.z + sunDir.z * dist);
    sun.target.position.set(snapped.x, snapped.y, snapped.z);
    sun.color.setHex(p.sunColor);
    sun.intensity = p.sunIntensity * (l.sunGain || 1);
    sun.shadow.bias = fit.bias;
    sun.shadow.normalBias = fit.normalBias;
    const sc = sun.shadow.camera;
    sc.left = -fit.half;
    sc.right = fit.half;
    sc.top = fit.half;
    sc.bottom = -fit.half;
    sc.near = fit.near;
    sc.far = fit.far;
    sc.updateProjectionMatrix();

    hemi.color.setHex(p.hemiSky);
    hemi.groundColor.setHex(p.hemiGround);
    hemi.intensity = p.hemiIntensity * (l.hemiGain || 1);

    sky.visible = p.skyVisible;
    if (p.skyVisible) {
      syncSkyUniforms(sky, p, sunDir, l);
      scene.background = null;
    } else {
      bg.setHex(p.skyColor);
      scene.background = bg;
    }
    if (scene.fog) {
      scene.fog.color.setHex(p.fogColor);
      // Distance cueing follows the framing (stage 6): crisp stops, haze
      // only far beyond the frame. Factors from the look table.
      const range = fogRangeFor(framedWidth === null ? span : framedWidth, l);
      scene.fog.near = range.near;
      scene.fog.far = range.far;
    }
    renderer.toneMappingExposure = p.exposure * (l.exposureGain || 1);
    if ("environmentIntensity" in scene) scene.environmentIntensity = p.envIntensity;

    // Environment capture, throttled by key (day/golden only).
    const key = envKey !== null ? envKey : `${p.phase}:${Math.round(p.altitude)}:${Math.round(p.azimuth)}`;
    if (p.skyVisible && key !== lastEnvKey) {
      lastEnvKey = key;
      syncSkyUniforms(envSky, p, sunDir, l);
      const rt = pmrem.fromScene(envScene);
      if (envRT) envRT.dispose();
      envRT = rt;
      scene.environment = rt.texture;
    }
    return p;
  }

  function setShadowSize(px) {
    if (sun.shadow.mapSize.x === px) return;
    sun.shadow.mapSize.set(px, px);
    if (sun.shadow.map) {
      sun.shadow.map.dispose();
      sun.shadow.map = null;
    }
  }

  function dispose() {
    if (envRT) envRT.dispose();
    pmrem.dispose();
  }

  return { sun, hemi, sky, update, setShadowSize, dispose };
}
