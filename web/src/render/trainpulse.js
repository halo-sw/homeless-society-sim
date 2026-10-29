// Station train-pulse renderer (browser; three.js).
//
// One InstancedMesh ring at the box station: a faint marker that
// brightens and expands as a schedule-derived arrival approaches
// (motion/ trains.stationPulse). Moving trains are never drawn — our
// data has no at-grade/elevated tags and these segments run
// underground. Static under prefers-reduced-motion.

import * as THREE from "three";
import { stationPulse } from "../motion/trains.js";

export function buildTrainPulse(table, { x, y, z, reduced = false } = {}) {
  const group = new THREE.Group();
  const dummy = new THREE.Object3D();
  const mat = new THREE.MeshBasicMaterial({ color: 0xe8a33d,
    transparent: true, opacity: 0.22, side: THREE.DoubleSide,
    depthWrite: false });
  const mesh = new THREE.InstancedMesh(
    new THREE.RingGeometry(2.2, 3.0, 40), mat, 1);
  mesh.frustumCulled = false;
  dummy.position.set(x, y, z);
  dummy.rotation.set(-Math.PI / 2, 0, 0);
  dummy.updateMatrix();
  mesh.setMatrixAt(0, dummy.matrix);
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);

  function update(tMin) {
    const { pulse, arrivals } = stationPulse(table, tMin);
    const p = reduced ? 0 : pulse;
    const s = 1 + p * 1.6;
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    mesh.setMatrixAt(0, dummy.matrix);
    mesh.instanceMatrix.needsUpdate = true;
    mat.opacity = 0.22 + p * 0.55;
    return { pulse: p, arrivals };
  }

  return { group, mesh, update, trains: table.trains, runs: table.runs.length };
}
