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
import { skyParams } from "./sky.js";

// Fixed moon direction when the sun is down (unit-ish, y-up world).
const MOON_DIR = (() => {
  const v = new THREE.Vector3(0.55, 0.75, 0.35);
  return v.normalize();
})();

export function createSkyRig(scene, renderer, { span = 1000 } = {}) {
  const sun = new THREE.DirectionalLight(0xfff2dd, 3.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 1.5;
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

  function syncSkyUniforms(skyMesh, p, dir) {
    const u = skyMesh.material.uniforms;
    u.turbidity.value = p.turbidity;
    u.rayleigh.value = p.rayleigh;
    u.sunPosition.value.copy(dir);
  }

  function update({ lat, lon, date, minute, target = { x: 0, z: 0 }, shadowSpan = 240, envKey = null }) {
    const p = skyParams(lat, lon, date, minute);
    // Sun above the horizon; moonlight below it.
    if (p.altitude > -1) {
      const [x, y, z] = sunDirection(lat, lon, date);
      sunDir.set(x, Math.max(y, 0.03), z).normalize();
    } else {
      sunDir.copy(MOON_DIR);
    }
    const dist = Math.max(800, span * 1.2);
    sun.position.set(target.x + sunDir.x * dist, sunDir.y * dist, target.z + sunDir.z * dist);
    sun.target.position.set(target.x, 0, target.z);
    sun.color.setHex(p.sunColor);
    sun.intensity = p.sunIntensity;
    const sc = sun.shadow.camera;
    sc.left = -shadowSpan;
    sc.right = shadowSpan;
    sc.top = shadowSpan;
    sc.bottom = -shadowSpan;
    sc.near = 1;
    sc.far = dist * 2 + 600;
    sc.updateProjectionMatrix();

    hemi.color.setHex(p.hemiSky);
    hemi.groundColor.setHex(p.hemiGround);
    hemi.intensity = p.hemiIntensity;

    sky.visible = p.skyVisible;
    if (p.skyVisible) {
      syncSkyUniforms(sky, p, sunDir);
      scene.background = null;
    } else {
      bg.setHex(p.skyColor);
      scene.background = bg;
    }
    if (scene.fog) scene.fog.color.setHex(p.fogColor);
    renderer.toneMappingExposure = p.exposure;
    if ("environmentIntensity" in scene) scene.environmentIntensity = p.envIntensity;

    // Environment capture, throttled by key (day/golden only).
    const key = envKey !== null ? envKey : `${p.phase}:${Math.round(p.altitude)}:${Math.round(p.azimuth)}`;
    if (p.skyVisible && key !== lastEnvKey) {
      lastEnvKey = key;
      syncSkyUniforms(envSky, p, sunDir);
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
