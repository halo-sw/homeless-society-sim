// Journey 3D layer: line, stations, train marker, corridor tiles.
//
// Owns every journey object under one THREE.Group: the travelled line
// (per-segment congestion colours), station dots, the moving train
// marker, and the lazy-loaded corridor tiles (3 merged meshes each).
// Pure picking/math lives in journey.js and corridor.js; this module
// only builds, positions and disposes meshes. main.js drives it from
// the sim clock and publishes the banner itself.

import * as THREE from "three";
import { lonLatToXY } from "./frame.js";
import { BAND_COLORS, patternById, tilesFor, trainPosition } from "./journey.js";
import { sliceGeometry, tileBuildings, tileLines, tileWater } from "./corridor.js";
import { congestionBand } from "./engine/journey.js";

// Visible-tile cap: 12 tiles × 3 meshes + line + dots + train ≈ 40
// added draw calls (the corridor budget; main.js logs the measured
// renderer.info count while a journey plays).
export const TILE_CAP = 12;
export const TILE_LOAD_PACE = 3; // fetches per clock tick

function soupGeometry(soup) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(soup.positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(soup.normals, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(soup.colors, 3));
  return geo;
}

export function stopCoords(network) {
  const out = new Map();
  for (const line of (network && network.lines) || []) {
    for (const s of line.stops || []) out.set(s.id, [s.lon, s.lat]);
  }
  return out;
}

export function createJourneyLayer(scene, origin) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);
  const tileGroup = new THREE.Group();
  group.add(tileGroup);

  const buildingMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  const lineMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 });
  const waterMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 });
  const trainMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.95 });
  const dotGeo = new THREE.SphereGeometry(18, 10, 8);

  let lineMesh = null;
  let dotMesh = null;
  let trainMesh = null;
  let tiles = new Map(); // tile id -> {meshes, bytes}
  let rideKey = "";
  let manifest = null;
  let network = null;
  let congestion = null;
  let dayKind = "weekday";
  let slotMinute = 0;
  let fallbackPct = 70;

  const toWorld = ([lon, lat], lift = 0) => {
    const [x, y] = lonLatToXY(lon, lat, origin);
    return new THREE.Vector3(x, lift, -y);
  };

  function clearPath() {
    for (const mesh of [lineMesh, dotMesh, trainMesh]) {
      if (mesh) {
        group.remove(mesh);
        if (mesh.geometry && mesh.geometry !== dotGeo) mesh.geometry.dispose();
        if (mesh.material && mesh.material !== trainMat) mesh.material.dispose();
      }
    }
    lineMesh = dotMesh = trainMesh = null;
    rideKey = "";
  }

  function unloadTile(id) {
    const slot = tiles.get(id);
    if (!slot) return;
    for (const m of slot.meshes) {
      tileGroup.remove(m);
      m.geometry.dispose();
    }
    tiles.delete(id);
  }

  function unloadAllTiles() {
    for (const id of [...tiles.keys()]) unloadTile(id);
  }

  // Per-hop congestion: the hop origin station's own reading for the
  // ride's slot (same table the engine used for the leg boarding).
  // Without the table, every hop inherits its leg's reading.
  function hopCongestion(leg, stopName, pattern) {
    if (!congestion || !congestion.days) {
      return { valuePct: leg.congestion.valuePct, source: leg.congestion.source };
    }
    const table = congestion.days[dayKind];
    const rows = table && table[leg.lineName] && table[leg.lineName][stopName];
    const value = rows && rows[pattern.direction_label];
    const slots = (congestion && congestion.slots) || [];
    let idx = 0;
    for (let i = 0; i < slots.length; i++) {
      if (slotMinute >= slots[i]) idx = i;
      else break;
    }
    if (Array.isArray(value) && idx < value.length && value[idx] !== null) {
      return { valuePct: value[idx], source: "서울교통공사" };
    }
    return { valuePct: fallbackPct, source: "가정값" };
  }

  function setPath({ ride, network: net, congestion: cong, dayKind: dk, minute, fallback }) {
    network = net;
    congestion = cong || null;
    dayKind = dk;
    slotMinute = minute;
    fallbackPct = fallback;
    clearPath();
    if (!ride || !network) return;
    const coords = stopCoords(network);
    const positions = [];
    const colors = [];
    const dotPositions = [];
    const c = new THREE.Color();
    for (const leg of ride.legs) {
      const pattern = patternById(network, leg.patternId);
      const geom = pattern && pattern.geometry;
      if (!geom || geom.length < 2) continue;
      for (let i = 0; i + 1 < leg.stops.length; i++) {
        const a = coords.get(leg.stopIds[i]);
        const b = coords.get(leg.stopIds[i + 1]);
        if (!a || !b) continue;
        const slice = sliceGeometry(geom, a, b);
        if (slice.length < 2) continue;
        const cong = hopCongestion(leg, leg.stops[i], pattern);
        const band = congestionBand(cong.valuePct).key;
        c.setHex(BAND_COLORS[band]);
        for (let k = 0; k + 1 < slice.length; k++) {
          const p0 = toWorld(slice[k], 60);
          const p1 = toWorld(slice[k + 1], 60);
          positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
          colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
        }
      }
      for (const sid of leg.stopIds) {
        const s = coords.get(sid);
        if (s) dotPositions.push(s);
      }
    }
    if (positions.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      lineMesh = new THREE.LineSegments(geo,
        new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false,
          transparent: true, opacity: 0.95 }));
      lineMesh.renderOrder = 990;
      lineMesh.frustumCulled = false;
      group.add(lineMesh);
    }
    if (dotPositions.length > 0) {
      dotMesh = new THREE.InstancedMesh(dotGeo,
        new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false,
          transparent: true, opacity: 0.9 }), dotPositions.length);
      const dummy = new THREE.Object3D();
      dotPositions.forEach(([lon, lat], i) => {
        const p = toWorld([lon, lat], 60);
        dummy.position.copy(p);
        dummy.updateMatrix();
        dotMesh.setMatrixAt(i, dummy.matrix);
      });
      dotMesh.renderOrder = 991;
      dotMesh.frustumCulled = false;
      group.add(dotMesh);
    }
    trainMesh = new THREE.Mesh(new THREE.ConeGeometry(30, 90, 10), trainMat);
    trainMesh.renderOrder = 992;
    trainMesh.visible = false;
    group.add(trainMesh);
    rideKey = `${ride.legs.map((l) => `${l.line}:${l.from}>${l.to}`).join("+")}`;
    group.visible = true;
  }

  function setTrain(ride, elapsed) {
    if (!trainMesh || !ride || !network) return null;
    const pos = trainPosition(network, ride, elapsed);
    if (!pos) {
      trainMesh.visible = false;
      return null;
    }
    const p = toWorld([pos.lon, pos.lat], 90);
    trainMesh.position.copy(p);
    trainMesh.visible = true;
    return pos;
  }

  function setManifest(m) {
    if ((m && m.id) !== (manifest && manifest.id)) unloadAllTiles();
    manifest = m || null;
  }

  // Load/unload around the focus (paced); returns {loaded, pending}.
  async function updateTiles(focus, fetchJson) {
    if (!manifest || !focus) return { loaded: tiles.size, pending: 0 };
    const loaded = [...tiles.keys()];
    const { load, unload } = tilesFor({ manifest, focus, loaded });
    for (const id of unload) unloadTile(id);
    // Cap: keep the nearest TILE_CAP (drop the farthest loaded first).
    let pending = load;
    if (tiles.size + pending.length > TILE_CAP) {
      pending = pending.slice(0, Math.max(0, TILE_CAP - tiles.size));
    }
    let fetched = 0;
    for (const id of pending.slice(0, TILE_LOAD_PACE)) {
      try {
        const tile = await fetchJson(`/data/region/corridor/${manifest.id}/tiles/${id}.json`);
        addTile(tile);
        fetched++;
      } catch {
        // A missing tile never breaks the journey; the line still draws.
      }
    }
    return { loaded: tiles.size, pending: Math.max(0, pending.length - fetched) };
  }

  function addTile(tile) {
    if (!tile || tiles.has(tile.id)) return;
    const meshes = [];
    const soup = tileBuildings(tile, origin);
    if (soup.triangles > 0) {
      const mesh = new THREE.Mesh(soupGeometry(soup), buildingMat);
      mesh.frustumCulled = false;
      meshes.push(mesh);
    }
    const lines = tileLines(tile, origin);
    if (lines.segments > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(lines.positions, 3));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(lines.colors, 3));
      const mesh = new THREE.LineSegments(geo, lineMat);
      mesh.frustumCulled = false;
      meshes.push(mesh);
    }
    const water = tileWater(tile, origin);
    if (water.triangles > 0) {
      const mesh = new THREE.Mesh(soupGeometry(water), waterMat);
      mesh.frustumCulled = false;
      meshes.push(mesh);
    }
    for (const m of meshes) tileGroup.add(m);
    tiles.set(tile.id, { meshes });
  }

  function pathBounds() {
    if (!lineMesh) return null;
    lineMesh.geometry.computeBoundingBox();
    return lineMesh.geometry.boundingBox;
  }

  function counts() {
    return { tiles: tiles.size, rideKey, visible: group.visible };
  }

  function setVisible(v) {
    group.visible = v;
  }

  function dispose() {
    clearPath();
    unloadAllTiles();
    scene.remove(group);
  }

  return { setPath, setTrain, setManifest, updateTiles, pathBounds,
    counts, setVisible, dispose, group };
}
