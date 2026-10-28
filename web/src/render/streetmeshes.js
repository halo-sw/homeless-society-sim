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

export function buildStreetMeshes(streetlife) {
  const group = new THREE.Group();
  const dummy = new THREE.Object3D();
  const { cars, movers, lamps } = streetlife;

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
    dummy.position.set(x, 0, z);
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

  // --- street lamps: pole + glowing head ---
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.14, LAMP_POLE_H, 6);
  poleGeo.translate(0, LAMP_POLE_H / 2, 0);
  const headGeo = new THREE.SphereGeometry(0.34, 8, 6);
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

  return {
    group, bodyMesh, glassMesh, poleMesh, headMesh,
    parked: cars.length, moverCount: movers.length, lampCount: lamps.length,
    updateMovers,
    setLampGlow(v) {
      headMat.emissiveIntensity = v * 3.2;
    },
  };
}
