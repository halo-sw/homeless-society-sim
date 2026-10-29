// Decorative street meshes (browser; three.js).
//
// Instanced parked cars + slow movers and street lamps from the pure
// render/streetlife.js placement. Movers ping-pong along their road
// segments (update(t) rewrites only their instances); lamp heads glow
// at night via setLampGlow (driven by the sky emissive gate).

import * as THREE from "three";
import { sampleMover } from "./streetlife.js";
import { carBodyMaterial, carGlassMaterial, lampHeadMaterial, lampPoleMaterial } from "./textures.js";

export const LAMP_POLE_H = 8;

// Lamp glow response (pure, stage 9c): small warm points, not flares —
// the head gain drops from 3.2 and the halo stays compact under the
// clamped night bloom.
export const LAMP_HEAD_GAIN = 1.8;
export const LAMP_HALO_SIZE = 1.8;
export const LAMP_HALO_OPACITY = 0.6;

export function lampGlowFor(v) {
  const n = Number(v);
  const k = !Number.isFinite(n) || n <= 0 ? 0 : Math.min(n, 1);
  return { head: k * LAMP_HEAD_GAIN, haloOpacity: k * LAMP_HALO_OPACITY, visible: k > 0.01 };
}

export function buildStreetMeshes(streetlife, { heightAt = null } = {}) {
  const group = new THREE.Group();
  const dummy = new THREE.Object3D();
  const { cars, movers, lamps } = streetlife;
  const groundY = (x, z) => (heightAt ? heightAt(x, z) : 0);

  // --- cars: body + glass cabin share instance matrices ---
  const bodyGeo = new THREE.BoxGeometry(4.4, 0.9, 1.9);
  bodyGeo.translate(0, 0.75, 0);
  const glassGeo = new THREE.BoxGeometry(2.3, 0.62, 1.7);
  glassGeo.translate(-0.2, 1.45, 0);
  const total = cars.length + movers.length;
  const bodyMesh = new THREE.InstancedMesh(bodyGeo, carBodyMaterial(), Math.max(total, 1));
  const glassMesh = new THREE.InstancedMesh(glassGeo, carGlassMaterial(), Math.max(total, 1));
  const col = new THREE.Color();
  const place = (mesh, i, x, z, rotY) => {
    dummy.position.set(x, groundY(x, z), z);
    dummy.rotation.set(0, rotY, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  };
  cars.forEach((c, i) => {
    place(bodyMesh, i, c.x, -c.y, c.angle);
    place(glassMesh, i, c.x, -c.y, c.angle);
    bodyMesh.setColorAt(i, col.setHex(c.color));
  });
  bodyMesh.count = total;
  glassMesh.count = total;
  bodyMesh.castShadow = true;
  if (bodyMesh.instanceColor) bodyMesh.instanceColor.needsUpdate = true;
  movers.forEach((m, k) => {
    bodyMesh.setColorAt(cars.length + k, col.setHex(m.color));
  });
  if (bodyMesh.instanceColor) bodyMesh.instanceColor.needsUpdate = true;
  group.add(bodyMesh, glassMesh);

  function updateMovers(t) {
    if (movers.length === 0) return;
    movers.forEach((m, k) => {
      const s = sampleMover(m, t);
      const i = cars.length + k;
      place(bodyMesh, i, s.x, -s.y, s.angle);
      place(glassMesh, i, s.x, -s.y, s.angle);
    });
    bodyMesh.instanceMatrix.needsUpdate = true;
    glassMesh.instanceMatrix.needsUpdate = true;
  }
  updateMovers(0);

  // --- street lamps: pole + glowing head + halo points ---
  // Heads alone are sub-pixel at stop framing, so each lamp also gets an
  // additive halo point that reads as a small warm point from far away
  // and feeds the night bloom.
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.14, LAMP_POLE_H, 6);
  poleGeo.translate(0, LAMP_POLE_H / 2, 0);
  const headGeo = new THREE.SphereGeometry(0.5, 8, 6);
  headGeo.translate(0, LAMP_POLE_H + 0.1, 0);
  const poleMesh = new THREE.InstancedMesh(poleGeo, lampPoleMaterial(), Math.max(lamps.length, 1));
  const headMat = lampHeadMaterial();
  const headMesh = new THREE.InstancedMesh(headGeo, headMat, Math.max(lamps.length, 1));
  lamps.forEach((l, i) => {
    place(poleMesh, i, l.x, -l.y, 0);
    place(headMesh, i, l.x, -l.y, 0);
  });
  poleMesh.count = lamps.length;
  headMesh.count = lamps.length;
  group.add(poleMesh, headMesh);

  const haloGeo = new THREE.BufferGeometry();
  const haloPos = new Float32Array(Math.max(lamps.length, 1) * 3);
  lamps.forEach((l, i) => {
    haloPos[i * 3] = l.x;
    haloPos[i * 3 + 1] = groundY(l.x, -l.y) + LAMP_POLE_H + 0.1;
    haloPos[i * 3 + 2] = -l.y;
  });
  haloGeo.setAttribute("position", new THREE.BufferAttribute(haloPos, 3));
  const haloMat = new THREE.PointsMaterial({
    color: 0xffc37a, size: LAMP_HALO_SIZE, sizeAttenuation: true,
    transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, map: glowTexture(),
  });
  const halo = new THREE.Points(haloGeo, haloMat);
  halo.frustumCulled = false;
  group.add(halo);

  return {
    group, bodyMesh, glassMesh, poleMesh, headMesh, halo,
    parked: cars.length, moverCount: movers.length, lampCount: lamps.length,
    updateMovers,
    setLampGlow(v) {
      const g = lampGlowFor(v);
      headMat.emissiveIntensity = g.head;
      haloMat.opacity = g.haloOpacity;
      halo.visible = g.visible;
    },
  };
}

// Soft round sprite for the lamp halos (browser canvas; null without a
// DOM — points still render, as squares).
function glowTexture() {
  try {
    if (typeof document === "undefined") return null;
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    return tex;
  } catch {
    return null;
  }
}
