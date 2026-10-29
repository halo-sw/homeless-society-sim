// Ambient crowd renderer (browser; three.js).
//
// One InstancedMesh of capsules driven by the pure motion/ crowd:
// update(tMin) evaluates pedsAt and rewrites the active instances.
// Household members (sim.js sampleAgent) render separately and are
// never replaced by this crowd.

import * as THREE from "three";
import { lonLatToXY } from "../frame.js";
import { allocPedState, pedsAt } from "../motion/pedestrians.js";
import { agentMaterial } from "./textures.js";

const nowMs = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export function buildCrowdMeshes(crowd, { origin, heightAt = null } = {}) {
  const group = new THREE.Group();
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const mesh = new THREE.InstancedMesh(
    new THREE.CapsuleGeometry(0.32, 1.0, 3, 8),
    agentMaterial(), Math.max(crowd.maxActive, 1));
  mesh.count = 0;
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  group.add(mesh);
  const state = allocPedState(Math.max(crowd.maxActive, 1));
  const groundY = (x, z) => (heightAt ? heightAt(x, z) : 0);

  function update(tMin, { congScale = 1, cap = Infinity } = {}) {
    const t0 = nowMs();
    const n = pedsAt(crowd, tMin, state, { congScale, cap });
    for (let w = 0; w < n; w++) {
      const [x, y] = lonLatToXY(state.data[w * 3], state.data[w * 3 + 1], origin);
      dummy.position.set(x, groundY(x, -y) + 0.95, -y);
      // Walker heading is CCW in the lon/lat plane; yaw matches the
      // old tour-walker convention (east = +x, north = −z).
      dummy.rotation.set(0,
        Math.atan2(Math.cos(state.data[w * 3 + 2]), Math.sin(state.data[w * 3 + 2])), 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mesh.setMatrixAt(w, dummy.matrix);
      mesh.setColorAt(w, col.setHex(crowd.walkers[state.ids[w]].color));
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return { active: n, ms: nowMs() - t0 };
  }

  return { group, mesh, slots: crowd.maxActive, stationCount: crowd.stationCount, update };
}
