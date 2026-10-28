// Miniature 3D scene app: loads one area, builds the merged scene, plays
// the residential tour. All data-math lives in the pure src/* modules
// (unit-tested); this file only wires three.js, the DOM, and playback.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import "./style.css";
import { bboxToXY, lonLatToWorld, lonLatToXY } from "./frame.js";
import { buildBuildings } from "./buildings.js";
import { buildGround } from "./ground.js";
import { ARCH_FOV_DEG, GLIDE_FRAME_M, STOP_FRAME_M, TOUR_AZIMUTH, TOUR_FOV_DEG, archLensPose, distanceForWidth, footprintsOf, frameWidthFor, hostTowerIds, occludingIds, pickStopAzimuth, tourOffset } from "./camera.js";
import { loadArea, originOf } from "./load.js";
import { compare as compareRuns } from "./engine/simulate.js";
import { CRITERIA_GROUPS, criterionDefault, criterionValuesLine, resolveCriteria } from "./engine/criteria.js";
import { parseScenario } from "./engine/scenario.js";
import { highlightFor } from "./highlight.js";
import { corridorFor, journeyBanner, journeyPhase, rideStateFor, trainPosition } from "./journey.js";
import { createJourneyLayer } from "./journey-scene.js";
import { dayKindFor } from "./engine/journey.js";
import { householdNow, nowCardFor, simMetaFor, tickerFor } from "./nowcard.js";
import { DECISION_KIND_KO, SIM_TICK_S, SPEEDS, agentLabelOf, chosenLabel, dayDecisions, decisionBadge, formatClock, homeOccupancy, indexRun, latestDecision, optionsLine, parseTParam, sampleAgent, shouldAutoplay, simInstant, tripFractions } from "./sim.js";
import { DWELL_S, legGlideDuration, pathWaypoints, seekState, selectTourStops, tourSchedule } from "./tour.js";
import { TREE_CANOPY_R, TREE_CANOPY_Y, TREE_TRUNK_H, TREE_TRUNK_R_BOTTOM, TREE_TRUNK_R_TOP, placeTrees } from "./trees.js";
import { assignWalkers, sampleWalker } from "./walkers.js";
import { store } from "./ui/store.js";
import { mountUI } from "./ui/main.jsx";
// Stage 5b realistic rendering seam: createRenderer / renderFrame plus
// the rig/material builders (night emissive via aLit, not glow quads).
import { eveningHomeFraction, globalHomeFraction, litFractionWithFallback } from "./render/facades.js";
import { hashString, hashUnit } from "./palette.js";
import { applyStopFade, makeFadeable } from "./render/fade.js";
import { createRenderer } from "./render/renderer.js";
import { createSkyRig } from "./render/rig.js";
import { placeStreetlife } from "./render/streetlife.js";
import { buildStreetMeshes } from "./render/streetmeshes.js";
import { agentMaterial, facadeMaterial, groundMaterial, markingMaterial, roofMaterial, setGlobalNight, trunkMaterial, vegetationMaterial, waterMaterial } from "./render/textures.js";

const AREAS = [
  { id: "pangyo", label: "판교" },
  { id: "seongsu", label: "성수" },
  { id: "songpa", label: "송파구" },
  { id: "songpa-jamsil", label: "잠실" },
];
const DEFAULT_AREA = "songpa-jamsil";
const HEIGHT_LABELS = {
  osm_height: "OSM 높이", osm_levels: "OSM 층수", register_height: "대장 높이",
  register_floors: "대장 층수", inferred: "추정", api_height: "API 높이", api_floors: "API 층수",
};
const RES_LABELS = { apartment: "아파트", house: "단독주택", mixed: "복합", none: "비주거" };
const RES_SWATCH = { apartment: "#d9a878", house: "#f3ead9", mixed: "#e3d3b8", none: "#cfc8bb" };
const HEIGHT_SWATCH = { osm_height: "#7ba05b", osm_levels: "#a9bf8e", register_height: "#b25a33",
  register_floors: "#d9a878", inferred: "#cfc8bb", api_height: "#4a7ba7", api_floors: "#9fc4d8" };
// Fixed autumn-afternoon sun (KST); the solar math itself is unit-tested.
// ?time=HH:MM overrides the tour sun for day/golden/blue/night captures.
const SUN_DATE = new Date("2026-10-15T15:00:00+09:00");
const SUN_MINUTE = 15 * 60;
const BASE_GROUND = 0xa9a79b; // unmapped fringe under the ground layer
const FOG_DAY = 0xd9dee2;

const PARAMS = new URLSearchParams(location.search);
const areaId = PARAMS.get("area") || DEFAULT_AREA;

// Tour sun from ?time=HH:MM (validated) or the fixed afternoon default.
function tourSun() {
  const m = /^(\d{1,2}):(\d{2})$/.exec(PARAMS.get("time") || "");
  if (m) {
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (hh <= 23 && mm <= 59) {
      const stamp = `2026-10-15T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+09:00`;
      const date = new Date(stamp);
      if (!Number.isNaN(date.getTime())) return { date, minute: hh * 60 + mm };
    }
  }
  return { date: SUN_DATE, minute: SUN_MINUTE };
}

function toGeometry(data) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(data.positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(data.normals, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(data.colors, 3));
  if (data.uvs) geo.setAttribute("uv", new THREE.Float32BufferAttribute(data.uvs, 2));
  return geo;
}

// Per-vertex night lit fraction for facade meshes (filled from run
// occupancy; 0 = dark). The emissive shader patch reads this.
function addLitAttr(mesh) {
  const count = mesh.geometry.attributes.position.count;
  mesh.geometry.setAttribute("aLit", new THREE.BufferAttribute(new Float32Array(count), 1));
}

// Fill every facade mesh's aLit from an occupancy map (or null in tour
// mode) plus the run-wide at-home share: buildings with simulated
// residents use their exact share, other residential buildings with real
// households use the fallback estimate, the rest stay dark.
function makeLitFiller(litMeshes, householdsById) {
  return (occ, globalFrac) => {
    for (const { mesh, ranges } of litMeshes) {
      const attr = mesh.geometry.attributes.aLit;
      for (const [bid, r] of ranges) {
        const v = litFractionWithFallback(occ ? occ.get(bid) : null, {
          households: householdsById.get(bid) || 0,
          globalHomeFrac: globalFrac,
          hash01: hashUnit(hashString(bid), 3),
        });
        attr.array.fill(v, r.start, r.start + r.count);
      }
      attr.needsUpdate = true;
    }
  };
}

async function fetchArea(wantId) {
  const loading = document.getElementById("loading");
  try {
    return await loadArea(wantId, async (url) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      return r.json();
    });
  } catch (err) {
    loading.textContent = `지역을 불러오지 못했습니다 (${wantId}): ${err.message}`;
    throw err;
  }
}

// Static world shared by tour and sim modes: renderer, camera, lights,
// ground, buildings, trees. Returns every handle the modes need.
function buildWorld(area) {
  const origin = originOf(area);
  const box = bboxToXY(area.bbox, origin);
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const span = Math.max(box.maxX - box.minX, box.maxY - box.minY);

  // --- renderer / scene / camera (5b seam: createRenderer/renderFrame) ---
  const canvas = document.getElementById("scene");
  const renderCtl = createRenderer({ canvas, params: PARAMS });
  const renderer = renderCtl.renderer;
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(FOG_DAY, span * 1.6, span * 3.2);
  const wrap0 = document.getElementById("scene-wrap");
  const aspect0 = wrap0 && wrap0.clientHeight > 0
    ? wrap0.clientWidth / wrap0.clientHeight : innerWidth / innerHeight;
  const camera = new THREE.PerspectiveCamera(TOUR_FOV_DEG, aspect0, 1, span * 8);
  const homeDist = distanceForWidth(span, TOUR_FOV_DEG, camera.aspect);
  const [hox, hoy, hoz] = tourOffset(homeDist);
  camera.position.set(cx + hox, hoy, -cy + hoz);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(cx, 0, -cy);
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.update();

  // --- sky rig: sun + hemi + Sky dome + PMREM environment ---
  const rig = createSkyRig(scene, renderer, { span });
  rig.setShadowSize(renderCtl.level.shadowMapSize);
  renderCtl.onQuality = (level) => {
    const px = level === "low" ? 1024 : 2048;
    rig.setShadowSize(px);
  };
  // The 2b paper vignette overlay would sit over the realistic grade;
  // the post chain owns the vignette now (5a owns the overlay itself).
  document.getElementById("vignette").style.display = "none";

  // --- ground: base plane + merged layer + paint + water skin ---
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(span * 1.5, span * 1.5),
    new THREE.MeshStandardMaterial({ color: BASE_GROUND, roughness: 1, metalness: 0 })
  );
  base.rotation.x = -Math.PI / 2;
  base.position.set(cx, -0.05, -cy);
  base.receiveShadow = true;
  scene.add(base);
  const buildingsById = new Map(area.buildings.map((b) => [b.id, b]));
  const groundData = buildGround(area.roads, area.landuse, area.complexes, buildingsById, origin);
  const groundMesh = new THREE.Mesh(toGeometry(groundData), groundMaterial({ aniso: maxAniso }));
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);
  let markMesh = null;
  if (groundData.markings.triangles > 0) {
    markMesh = new THREE.Mesh(toGeometry(groundData.markings), markingMaterial());
    markMesh.receiveShadow = true;
    scene.add(markMesh);
  }
  let waterMesh = null;
  if (groundData.water.triangles > 0) {
    waterMesh = new THREE.Mesh(toGeometry(groundData.water), waterMaterial());
    scene.add(waterMesh);
  }

  // --- buildings: one PBR wall mesh per facade class + podium + roofs ---
  const built = buildBuildings(area.buildings, area.complexes, origin);
  const dummy = new THREE.Object3D();
  const wallMeshes = {};
  const litMeshes = []; // {mesh, ranges} for night occupancy + tour fade
  const fadeMeshes = [];
  const trackRanges = (mesh, data) => {
    mesh.userData.ranges = data.ranges;
    fadeMeshes.push({ mesh, ranges: new Map(data.ranges.map((r) => [r.id, r])) });
  };
  for (const [cls, data] of Object.entries(built.detail.walls)) {
    if (data.triangles === 0) continue;
    const mesh = new THREE.Mesh(toGeometry(data), facadeMaterial(cls, { aniso: maxAniso }));
    addLitAttr(mesh);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    wallMeshes[cls] = mesh;
    trackRanges(mesh, data);
    litMeshes.push({ mesh, ranges: new Map(data.ranges.map((r) => [r.id, r])) });
  }
  let podiumMesh = null;
  if (built.detail.podium.triangles > 0) {
    podiumMesh = new THREE.Mesh(toGeometry(built.detail.podium),
      facadeMaterial("podium", { aniso: maxAniso }));
    addLitAttr(podiumMesh);
    podiumMesh.castShadow = true;
    podiumMesh.receiveShadow = true;
    scene.add(podiumMesh);
    trackRanges(podiumMesh, built.detail.podium);
    litMeshes.push({ mesh: podiumMesh,
      ranges: new Map(built.detail.podium.ranges.map((r) => [r.id, r])) });
  }
  const roofMesh = new THREE.Mesh(toGeometry(built.detail.roofs), roofMaterial({ aniso: maxAniso }));
  roofMesh.castShadow = true;
  roofMesh.receiveShadow = true;
  scene.add(roofMesh);
  trackRanges(roofMesh, built.detail.roofs);
  // "주거만 강조" dims the non-residential walls + podium.
  const dimMeshes = [wallMeshes.none, podiumMesh].filter(Boolean);

  // --- decorative trees: one trunk mesh + one canopy mesh per species ---
  const { trees, trunkColor } = placeTrees(area, origin);
  const bySpecies = { zelkova: [], ginkgo: [], pine: [] };
  for (const t of trees) (bySpecies[t.species] || bySpecies.zelkova).push(t);
  const trunkMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(TREE_TRUNK_R_TOP, TREE_TRUNK_R_BOTTOM, TREE_TRUNK_H, 5),
    trunkMaterial(trunkColor), Math.max(trees.length, 1));
  trees.forEach((t, i) => {
    dummy.position.set(t.x, (TREE_TRUNK_H / 2) * t.scale, -t.y);
    dummy.scale.setScalar(t.scale);
    dummy.rotation.set(0, t.phase, 0);
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(i, dummy.matrix);
  });
  trunkMesh.count = trees.length;
  scene.add(trunkMesh);
  const canopyMaterial = vegetationMaterial();
  const canopyMeshes = [];
  const canopyGeo = {
    // Zelkova: broad vase crown; ginkgo: narrower upright crown.
    zelkova: new THREE.IcosahedronGeometry(TREE_CANOPY_R, 1),
    ginkgo: new THREE.IcosahedronGeometry(TREE_CANOPY_R * 0.8, 1),
    pine: new THREE.ConeGeometry(TREE_CANOPY_R * 0.85, TREE_CANOPY_R * 2.4, 7),
  };
  for (const [species, list] of Object.entries(bySpecies)) {
    const mesh = new THREE.InstancedMesh(canopyGeo[species], canopyMaterial, Math.max(list.length, 1));
    list.forEach((t, i) => {
      if (species === "pine") {
        dummy.position.set(t.x, (TREE_TRUNK_H + TREE_CANOPY_R * 1.1) * t.scale, -t.y);
        dummy.scale.setScalar(t.scale);
      } else if (species === "ginkgo") {
        dummy.position.set(t.x, TREE_CANOPY_Y * t.scale, -t.y);
        dummy.scale.set(t.scale, t.scale * 1.25, t.scale);
      } else {
        dummy.position.set(t.x, TREE_CANOPY_Y * t.scale, -t.y);
        dummy.scale.set(t.scale * 1.15, t.scale * 1.0, t.scale * 1.15);
      }
      dummy.rotation.set(0, t.phase, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, new THREE.Color(t.color));
    });
    mesh.count = list.length;
    mesh.castShadow = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
    canopyMeshes.push(mesh);
  }

  // --- decorative street life: parked/moving cars + lamps (see legend) ---
  const streetMeshes = buildStreetMeshes(
    placeStreetlife(area.roads, origin, { seed: area.area || areaId }));
  scene.add(streetMeshes.group);

  // Real household counts per building (register API) for the night
  // lighting fallback (buildings without simulated residents).
  const householdsById = new Map();
  for (const b of area.buildings || []) {
    const hh = b.register && b.register.api && b.register.api.households;
    householdsById.set(b.id, Number(hh) || 0);
  }

  // Tallest building top (from data) for the shadow-frustum fit.
  let maxH = 0;
  for (const b of area.buildings || []) {
    const h = Number(b.height_m) || (Number(b.levels) || 0) * 3 || 0;
    if (h > maxH) maxH = h;
  }
  const maxHeightM = maxH > 0 ? Math.min(600, maxH) : 250;

  renderCtl.attach(scene, camera, document.getElementById("scene-wrap"));
  return {
    origin, cx, cy, span, renderer, renderCtl, rig, scene, camera, controls,
    base, groundMesh, markMesh, waterMesh, wallMeshes, podiumMesh, roofMesh,
    dimMeshes, litMeshes, fadeMeshes, householdsById, maxHeightM,
    trees, trunkMesh, canopyMeshes, streetMeshes, dummy,
  };
}

// Refit the camera + renderer to the (docked-panel-shrunk) canvas.
function refitToWrap(camera, renderCtl) {
  const wrap = document.getElementById("scene-wrap");
  const w = wrap ? wrap.clientWidth : innerWidth;
  const h = wrap ? wrap.clientHeight : innerHeight;
  camera.aspect = Math.max(0.2, w / Math.max(1, h));
  camera.updateProjectionMatrix();
  renderCtl.fitContainer();
}

async function bootTour() {
  const area = await fetchArea(areaId);
  const { origin, renderer, renderCtl, rig, scene, camera, controls,
    dimMeshes, fadeMeshes, litMeshes, householdsById, maxHeightM,
    streetMeshes, trees, dummy } = buildWorld(area);
  for (const { mesh } of fadeMeshes) makeFadeable(mesh);

  // --- preview walkers (instanced capsules, simulated) ---
  const walkers = assignWalkers(area.buildings, area.graph);
  const walkerMesh = new THREE.InstancedMesh(
    new THREE.CapsuleGeometry(0.32, 1.0, 3, 8),
    agentMaterial(), Math.max(walkers.length, 1));
  const coatColors = [0x5a6e8c, 0x8c5a5a, 0x5a8c6e, 0x777788, 0xb25a33, 0x3d5a5a];
  walkers.forEach((w, i) => walkerMesh.setColorAt(i, new THREE.Color(coatColors[i % coatColors.length])));
  walkerMesh.count = walkers.length;
  walkerMesh.castShadow = true;
  if (walkerMesh.instanceColor) walkerMesh.instanceColor.needsUpdate = true;
  scene.add(walkerMesh);

  // --- tour plan + route line ---
  const plan = selectTourStops(area);
  const w2w = (lon, lat) => lonLatToWorld(lon, lat, origin);
  const legPaths = plan.stops.map((s) =>
    pathWaypoints(s.pathNodeIds, area.graph.nodes, origin,
      (lon, lat) => lonLatToWorld(lon, lat, origin, 2)));
  if (legPaths.some((p) => p.length > 1)) {
    const pts = legPaths.flat().map(([x, y, z]) => new THREE.Vector3(x, y, z));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0xb25a33, transparent: true, opacity: 0.55 }));
    scene.add(line);
  }

  // --- per-stop camera azimuth (tower occlusion, stage 3) ---
  // Same 2b framing (FOV/pitch/distance); only the azimuth varies per
  // stop to look around towers between the camera and the target. The
  // test uses the actual building heights (same clamp as the renderer)
  // and the settled camera pose (same offset/aspect/pitch as poseFor);
  // when no azimuth is clear, the occluders fade instead (stage 4).
  const stopDist0 = distanceForWidth(STOP_FRAME_M, TOUR_FOV_DEG, camera.aspect);
  const footprints = footprintsOf(area.buildings, origin);
  const stopTargets = plan.stops.map((s, i) => {
    const wp = legPaths[i].length > 1
      ? legPaths[i][legPaths[i].length - 1]
      : lonLatToWorld(s.lon, s.lat, origin, 2);
    // Clear the view toward both the named stop anchor and the settled
    // path end (the camera centres on the latter).
    return { anchor: lonLatToXY(s.lon, s.lat, origin), end: [wp[0], -wp[2]] };
  });
  const stopAzimuths = plan.stops.map((s, i) => {
    const picked = pickStopAzimuth([stopTargets[i].anchor, stopTargets[i].end], footprints, stopDist0);
    const moved = picked.azimuth !== TOUR_AZIMUTH;
    console.log(`[occlusion] stop=${i} ${s.name} azimuth=[${picked.azimuth}] ` +
      `occluders=${picked.occluders}${moved ? " (moved)" : ""}`);
    return picked.azimuth;
  });
  // Fade fallback: residual occluders at the picked azimuth, plus the
  // tall host tower when a POI stop sits inside one.
  const stopFades = plan.stops.map((s, i) => {
    const targets = [stopTargets[i].anchor, stopTargets[i].end];
    const ids = new Set(occludingIds(targets, footprints, stopDist0, stopAzimuths[i]));
    if (s.kind === "poi") {
      for (const id of hostTowerIds(stopTargets[i].anchor, footprints)) ids.add(id);
    }
    const list = [...ids].sort();
    if (list.length > 0) {
      console.log(`[occlusion] stop=${i} ${s.name} fade=${list.length} ${list.join(",")}`);
    }
    return list;
  });
  const applyFade = (i) => applyStopFade(fadeMeshes,
    i >= 0 && i < stopFades.length ? stopFades[i] : []);

  mountUI();
  registerCommonActions();
  store.set({ mode: "tour" });
  buildUI(area, plan);
  document.getElementById("loading").remove();
  document.getElementById("fade").classList.add("clear");

  // --- tour sun/sky (?time=HH:MM override; static through the tour) ---
  const { date: tourDate, minute: tourMinute } = tourSun();
  const fillTourLit = makeLitFiller(litMeshes, householdsById);
  let tourBloom = 0;
  let tourLitDone = false;
  function updateTourSky() {
    const framedWidth = frameWidthFor(
      camera.position.distanceTo(controls.target), TOUR_FOV_DEG, camera.aspect);
    const p = rig.update({ lat: origin.lat, lon: origin.lon, date: tourDate,
      minute: tourMinute, target: { x: controls.target.x, z: controls.target.z },
      shadowSpan: 240, envKey: "tour", framedWidth, maxHeightM });
    tourBloom = p.bloom;
    setGlobalNight(p.emissive);
    streetMeshes.setLampGlow(p.emissive);
    // No run in tour mode: light residential windows from the evening
    // estimate (once — the tour sun is static).
    if (!tourLitDone) {
      tourLitDone = true;
      fillTourLit(null, p.emissive > 0 ? eveningHomeFraction(tourMinute) : 0);
    }
  }
  updateTourSky();

  // --- architectural lens (?lens=arch): level sensor + shifted crop ---
  const archLens = PARAMS.get("lens") === "arch";
  function applyArchLens() {
    const pose = archLensPose(); // crop fractions are pure angles
    const db = renderer.getDrawingBufferSize(new THREE.Vector2());
    camera.fov = ARCH_FOV_DEG;
    camera.updateProjectionMatrix();
    const fullH = db.y / pose.viewH;
    camera.setViewOffset(db.x, fullH, 0, pose.yFrac * fullH, db.x, db.y);
  }
  function levelCamera() {
    const dx = controls.target.x - camera.position.x;
    const dz = controls.target.z - camera.position.z;
    camera.lookAt(camera.position.x + dx, camera.position.y, camera.position.z + dz);
  }
  if (archLens) applyArchLens();

  // --- tour playback ---
  const player = createPlayer(plan, legPaths, camera, controls, origin,
    stopAzimuths, applyFade, archLens);
  if (plan.stops.length > 0) applyFade(0);
  store.registerActions({
    toggleTourPlay: () => {
      if (plan.stops.length === 0) return;
      player.toggle();
      store.set({ tourPlaying: player.playing });
    },
    setResOnly: (next) => {
      // Dimmed meshes stop casting: a faded mesh with a full-strength
      // shadow reads as a floating ghost shadow (stage 7, Part C).
      for (const m of dimMeshes) {
        m.material.opacity = next ? 0.3 : 1.0;
        m.castShadow = !next;
      }
      store.set({ resOnly: next });
    },
    applyView: (view) => {
      // Tour has no clock: a consult set_view always navigates to sim.
      const p = new URLSearchParams({
        mode: "sim", home: (view && view.home) || "A",
        day: String((view && view.day) || 1), t: (view && view.time) || "07:30",
      });
      if (view && view.follow) p.set("follow", String(view.follow));
      location.href = `${location.pathname}?${p}`;
    },
  });
  // Debug flags for deterministic captures: ?shot=<stopIndex> jumps to
  // that stop and pauses; ?t=<seconds> jumps the tour clock and pauses
  // unless ?play=1 opts into playing.
  const params = new URLSearchParams(location.search);
  const shot = params.get("shot");
  const tParam = params.get("t");
  if (shot !== null && plan.stops.length > 0) {
    const k = Number.parseInt(shot, 10);
    if (Number.isInteger(k) && k >= 0 && k < plan.stops.length) {
      player.seekStop(k);
    }
  } else if (tParam !== null && plan.stops.length > 0) {
    const s = Number.parseFloat(tParam);
    if (Number.isFinite(s) && s >= 0) player.seekTime(s);
    if (!shouldAutoplay(params) && player.playing) player.toggle();
  }
  store.set({ tourPlaying: player.playing, ready: true });

  // --- loop ---
  const clock = new THREE.Clock();
  let frames = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;
    player.update(dt);
    updateWalkers(walkerMesh, walkers, area.graph.nodes, origin, t, dummy);
    streetMeshes.updateMovers(t);
    updateTourSky(); // follows the camera target (shadow frustum)
    controls.update();
    if (archLens) levelCamera();
    renderCtl.renderFrame({ bloom: tourBloom }, dt);
    frames++;
    if (frames === 30) {
      console.log(`[scene] area=${areaId} buildings=${area.buildings.length} ` +
        `trees=${trees.length} walkers=${walkers.length} cars=${streetMeshes.parked}+${streetMeshes.moverCount} ` +
        `lamps=${streetMeshes.lampCount} arch=${archLens}`);
    }
  });

  const refitTour = () => {
    refitToWrap(camera, renderCtl);
    if (archLens) applyArchLens();
  };
  addEventListener("resize", refitTour);
  new ResizeObserver(refitTour).observe(document.getElementById("scene-wrap"));
}

function updateWalkers(mesh, walkers, nodes, origin, t, dummy) {
  walkers.forEach((w, i) => {
    const s = sampleWalker(w, nodes, t);
    const [x, y] = lonLatToXY(s.lon, s.lat, origin);
    dummy.position.set(x, 0.95, -y);
    dummy.rotation.set(0, Math.atan2(Math.cos(s.heading), Math.sin(s.heading)), 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
}

// --- tour player: glide legs, 3 s dwell per stop, outro pull-back ---
// onLeg(i) fires whenever the current leg view changes (fade updates).
// archLens composes level-sensor poses (the loop re-levels each frame).
function createPlayer(plan, legPaths, camera, controls, origin, stopAzimuths = [], onLeg = null, archLens = false) {
  const stops = plan.stops;

  const schedule = tourSchedule(plan);
  const stopDist = distanceForWidth(STOP_FRAME_M, TOUR_FOV_DEG, camera.aspect);
  const glideDist = distanceForWidth(GLIDE_FRAME_M, TOUR_FOV_DEG, camera.aspect);
  const state = { playing: stops.length > 0, leg: 0, legT: 0, dwell: 0, outro: 0, done: false };
  controls.enabled = !state.playing;

  function stopPoint(i) {
    if (legPaths[i].length > 1) return legPaths[i][legPaths[i].length - 1];
    return lonLatToWorld(stops[i].lon, stops[i].lat, origin, 2);
  }

  // Camera pose along leg i at eased progress t: the frame widens during
  // the glide and settles on the stop, target centred. The per-stop
  // azimuth (tower occlusion) applies at the settled end; mid-glide the
  // default azimuth keeps the move readable. With the architectural lens
  // the pose is a level-sensor two-point frame at the same widths.
  function poseFor(i, t) {
    const path = legPaths[i].length > 1 ? legPaths[i] : [stopPoint(i)];
    const fi = t * (path.length - 1);
    const i0 = Math.floor(fi);
    const i1 = Math.min(path.length - 1, i0 + 1);
    const f = fi - i0;
    const wp = [0, 1, 2].map((k) => path[i0][k] + (path[i1][k] - path[i0][k]) * f);
    const ahead = path[Math.min(path.length - 1, i1 + 2)];
    if (archLens) {
      const frameW = STOP_FRAME_M + (GLIDE_FRAME_M - STOP_FRAME_M) * (1 - t);
      const ap = archLensPose(frameW, camera.aspect, stopAzimuths[i] || TOUR_AZIMUTH);
      return { pos: new THREE.Vector3(wp[0] + ap.dirX * ap.horiz, wp[1] + ap.vert, wp[2] + ap.dirZ * ap.horiz),
               look: new THREE.Vector3(wp[0], 2, wp[2]) };
    }
    const dist = stopDist + (glideDist - stopDist) * (1 - t);
    const [dox, doy, doz] = tourOffset(dist, undefined, TOUR_AZIMUTH);
    const [sox, soy, soz] = tourOffset(dist, undefined, stopAzimuths[i] || TOUR_AZIMUTH);
    const k = t * t; // ease the azimuth in towards the settled stop
    const ox = dox + (sox - dox) * k;
    const oy = doy + (soy - doy) * k;
    const oz = doz + (soz - doz) * k;
    return { pos: new THREE.Vector3(wp[0] + ox, wp[1] + oy, wp[2] + oz),
             look: new THREE.Vector3(ahead[0], 2, ahead[2]) };
  }

  function showStop(i) {
    const s = stops[i];
    store.set({ caption: {
      name: s.name,
      meta: `${s.label} · ${s.category} · ${Math.abs(s.lat).toFixed(4)}° N ${Math.abs(s.lon).toFixed(4)}° E`,
      walk: i === 0 ? "출발" : `이전 정류장에서 도보 ${s.legMinutes.toFixed(1)}분 (${Math.round(s.legLengthM)} m)`,
      dots: { count: stops.length, active: i },
    } });
  }

  function legDuration(i) {
    return legGlideDuration(stops[i], i); // cinematic glide, not walking pace
  }

  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);

  function snap(i, t) {
    const { pos, look } = poseFor(i, t);
    camera.position.copy(pos);
    controls.target.copy(look);
  }

  function update(dt) {
    if (!state.playing || state.done || stops.length === 0) return;
    if (state.outro > 0) {
      state.outro += dt;
      const k = Math.min(1, state.outro / 6);
      camera.position.y += dt * 28 * (1 - k * 0.5);
      camera.position.x += dt * 10;
      if (k >= 1) {
        state.done = true;
        state.playing = false;
        controls.enabled = true;
        store.set({ tourPlaying: false });
      }
      return;
    }
    if (state.dwell > 0) {
      state.dwell -= dt;
      // Gentle drift while dwelling.
      camera.position.y += dt * 1.2;
      if (state.dwell <= 0) {
        state.leg++;
        state.legT = 0;
        if (onLeg) onLeg(state.leg);
        if (state.leg >= stops.length) {
          state.outro = 0.001;
          store.set({ caption: null });
          return;
        }
      } else return;
    }
    const i = state.leg;
    const dur = legDuration(i);
    state.legT += dt / dur;
    const t = ease(Math.min(1, state.legT));
    const { pos, look } = poseFor(i, t);
    camera.position.lerp(pos, 1 - Math.pow(0.001, dt));
    controls.target.lerp(look, 1 - Math.pow(0.001, dt));
    if (state.legT >= 1) {
      showStop(i);
      state.dwell = DWELL_S;
    }
  }

  function seekStop(k) {
    const i = Math.max(0, Math.min(stops.length - 1, k));
    state.leg = i;
    state.legT = 1;
    state.dwell = DWELL_S;
    state.outro = 0;
    state.done = false;
    state.playing = false;
    showStop(i);
    snap(i, 1);
    if (onLeg) onLeg(i);
    controls.enabled = true;
  }

  function seekTime(s) {
    const st = seekState(schedule, s);
    if (st.phase === "outro") {
      state.leg = stops.length;
      state.legT = 1;
      state.dwell = 0;
      state.outro = 0.001;
      state.done = false;
      store.set({ caption: null });
      if (onLeg) onLeg(-1);
      return;
    }
    state.leg = st.leg;
    state.legT = st.legT;
    state.dwell = st.dwellLeft;
    state.outro = 0;
    state.done = false;
    if (st.phase === "dwell") showStop(st.leg);
    else if (st.leg === 0) store.set({ caption: null });
    else showStop(st.leg - 1);
    snap(st.leg, ease(Math.min(1, st.legT)));
    if (onLeg) onLeg(st.leg);
  }

  return {
    get playing() {
      return state.playing;
    },
    toggle() {
      if (state.done) {
        // Restart from the first stop.
        state.done = false;
        state.leg = 0;
        state.legT = 0;
        state.dwell = 0;
        state.outro = 0;
        state.playing = true;
      } else {
        state.playing = !state.playing;
      }
      controls.enabled = !state.playing;
    },
    update,
    seekStop,
    seekTime,
    schedule,
  };
}

function legendRows(area) {
  const resCounts = {};
  const hCounts = {};
  for (const b of area.buildings) {
    const r = b.residential || "none";
    resCounts[r] = (resCounts[r] || 0) + 1;
    const h = b.height_source || "inferred";
    hCounts[h] = (hCounts[h] || 0) + 1;
  }
  const resRows = Object.entries(RES_LABELS).map(([key, label]) => ({
    label, color: RES_SWATCH[key], count: resCounts[key] || 0,
  }));
  const namedCx = (area.complexes || []).filter((c) => c.name).length;
  resRows.push({ label: "단지", color: "#b25a33", count: (area.complexes || []).length });
  resRows.push({ label: "이름 있는 단지", color: "#b25a33", count: namedCx });
  const heightRows = Object.entries(HEIGHT_LABELS)
    .filter(([key]) => hCounts[key])
    .map(([key, label]) => ({ label, color: HEIGHT_SWATCH[key], count: hCounts[key] }));
  return { resRows, heightRows };
}

function buildUI(area, plan) {
  const { resRows, heightRows } = legendRows(area);
  store.set({
    areaOptions: AREAS.map((a) => ({ value: a.id, label: a.label })),
    area: { id: areaId, label: area.label || areaId },
    legend: {
      title: "범례",
      resRows,
      heightRows,
      note: "나무·인물은 장식용 모의 표시입니다",
    },
  });
  if (plan.stops.length === 0) store.set({ tourPlaying: false });
  document.title = `주거 시뮬레이터 — ${area.label || areaId}`;
}

// Shared UI actions (both modes); mode-specific boots add their own.
function registerCommonActions() {
  store.registerActions({
    selectArea: (id) => {
      location.href = `${location.pathname}?area=${id}`;
    },
    selectMode: (mode) => {
      location.href = mode === "sim"
        ? `${location.pathname}?mode=sim&home=A`
        : `${location.pathname}?area=${simAreaId}`;
    },
    selectHome: (label) => {
      location.href = `${location.pathname}?mode=sim&home=${label}`;
    },
    setConsultOpen: (next) => store.set({ consultOpen: next }),
  });
}

// Set by bootSim for the tour-mode link target.
let simAreaId = DEFAULT_AREA;

// ---------- sim mode (?mode=sim) ----------

async function loadRunFile(scenarioName, homeLabel) {
  const r = await fetch(`/data/sim/${scenarioName}-${homeLabel}.json`);
  if (!r.ok) return null;
  return r.json();
}

function workerRuns(scenarioName, labels) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(new URL("./sim-worker.js", import.meta.url), { type: "module" });
    } catch (err) {
      reject(err);
      return;
    }
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error("sim worker timed out"));
    }, 180000);
    worker.onmessage = (e) => {
      clearTimeout(timer);
      worker.terminate();
      if (e.data && e.data.ok) resolve(e.data.runs);
      else reject(new Error((e.data && e.data.error) || "sim worker failed"));
    };
    worker.onerror = (err) => {
      clearTimeout(timer);
      worker.terminate();
      reject(err);
    };
    worker.postMessage({ scenario: scenarioName, labels });
  });
}

async function bootSim() {
  document.body.classList.add("sim");
  mountUI();
  registerCommonActions();
  store.set({ mode: "sim" });
  const loading = document.getElementById("loading");
  const scenarioName = PARAMS.get("scenario") || "demo-two-homes";
  const homeLabel = PARAMS.get("home") || "A";
  let scenario = null;
  try {
    const r = await fetch(`/scenarios/${scenarioName}.json`);
    if (r.ok) scenario = await r.json();
  } catch {
    scenario = null;
  }
  loading.textContent = `생활 시뮬레이션 불러오는 중… (홈 ${homeLabel})`;
  let run = await loadRunFile(scenarioName, homeLabel).catch(() => null);
  let runSource = "file";
  if (!run) {
    loading.textContent = `엔진 실행 중… (시나리오 ${scenarioName}, 홈 ${homeLabel})`;
    try {
      run = (await workerRuns(scenarioName, [homeLabel]))[homeLabel];
      runSource = "worker";
    } catch (err) {
      loading.textContent = `실행 결과를 불러오지 못했습니다: ${err.message} — ` +
        "`node web/scripts/simulate.mjs --scenario scenarios/" + scenarioName + ".json --home both`를 먼저 실행하세요.";
      throw err;
    }
  }
  console.log(`[sim] home=${homeLabel} source=${runSource} agents=${run.meta.agents} ` +
    `trips=${run.trips.length} decisions=${run.decisions.length}`);
  // Committed decision file overlay (?provider=meta|baseten): extras apply
  // only when the file's choice matches the run's (a rule fallback run
  // may choose differently — its own provenance then stands).
  const judgeProvider = PARAMS.get("provider") || "meta";
  const judgeExtras = new Map();
  try {
    const r = await fetch(`/scenarios/decisions/${scenarioName}-${homeLabel}-${judgeProvider}.json`);
    if (r.ok) {
      const doc = await r.json();
      for (const d of doc.decisions || []) judgeExtras.set(d.id, d);
      console.log(`[sim] judge overlay: ${judgeExtras.size} records (${judgeProvider})`);
    }
  } catch {
    // No committed decisions: the run's own provenance stands.
  }
  function judgedView(d) {
    const e = judgeExtras.get(d.id);
    if (e && e.chosen_key === d.chosen_key) {
      return {
        ...d,
        chosen_by: e.chosen_by || d.chosen_by,
        reason_ko: e.reason_ko, reason_en: e.reason_en,
        provider: e.provider, model: e.model,
      };
    }
    return d;
  }
  const area = await fetchArea(run.meta.area);
  simAreaId = run.meta.area;
  const homes = scenario && Array.isArray(scenario.homes) && scenario.homes.length > 0
    ? scenario.homes
    : [{ label: homeLabel, area: run.meta.area, complex_name: run.meta.complex }];
  const { origin, renderer, renderCtl, rig, scene, camera, controls,
    dimMeshes, litMeshes, householdsById, maxHeightM, streetMeshes,
    wallMeshes, podiumMesh, roofMesh } = buildWorld(area);
  const fillSimLit = makeLitFiller(litMeshes, householdsById);
  // Calm highlighting (stage 7, Part B): no flashing anywhere, and no
  // pulse animation when the OS asks for reduced motion.
  const REDUCED = typeof matchMedia === "function"
    && matchMedia("(prefers-reduced-motion: reduce)").matches;

  // --- run indexes ---
  const indexed = indexRun(run);
  const nodeLonLat = new Map(Object.entries(area.graph.nodes));
  const edgeLen = new Map(area.graph.edges.walk.map((e) => [`${e.from}>${e.to}`, e.length_m]));
  const homeLonLat = new Map(run.agents.map((a) => [a.key, nodeLonLat.get(a.home_node) || [origin.lon, origin.lat]]));
  const household = run.agents.filter((a) => a.household);
  const background = run.agents.filter((a) => !a.household);

  // --- agent meshes: household large + highlighted, neighbours small ---
  const dummy = new THREE.Object3D();
  const hhMesh = new THREE.InstancedMesh(
    new THREE.CapsuleGeometry(0.9, 2.4, 3, 10),
    agentMaterial(), Math.max(household.length, 1));
  const hhColors = [0xc0392b, 0x2471a3, 0x1e8449, 0x8e44ad];
  household.forEach((a, i) => hhMesh.setColorAt(i, new THREE.Color(hhColors[i % hhColors.length])));
  hhMesh.count = household.length;
  hhMesh.castShadow = true;
  if (hhMesh.instanceColor) hhMesh.instanceColor.needsUpdate = true;
  // Ground rings + name tags keep the household readable at miniature
  // scale, including while they wait at home.
  const ringMeshes = household.map((a, i) => {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.8, 2.6, 40),
      new THREE.MeshBasicMaterial({ color: hhColors[i % hhColors.length],
        transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.3;
    scene.add(ring);
    return ring;
  });
  const tagsLayer = document.getElementById("tags");
  const tagEls = household.map((a) => {
    const el = document.createElement("div");
    el.className = "hhtag";
    el.textContent = a.label;
    tagsLayer.appendChild(el);
    return el;
  });
  const tagV = new THREE.Vector3();
  function paintTag(el, x, y, z, show) {
    if (!show) {
      el.style.display = "none";
      return;
    }
    tagV.set(x, y, z).project(camera);
    if (tagV.z > 1) {
      el.style.display = "none";
      return;
    }
    el.style.display = "block";
    el.style.left = `${(tagV.x * 0.5 + 0.5) * innerWidth}px`;
    el.style.top = `${(-tagV.y * 0.5 + 0.5) * innerHeight}px`;
  }
  const bgMesh = new THREE.InstancedMesh(
    new THREE.CapsuleGeometry(0.3, 0.9, 3, 8),
    agentMaterial(), Math.max(background.length, 1));
  const coatColors = [0x5a6e8c, 0x8c5a5a, 0x5a8c6e, 0x777788, 0x3d5a5a];
  background.forEach((a, i) => bgMesh.setColorAt(i, new THREE.Color(coatColors[i % coatColors.length])));
  bgMesh.count = background.length;
  if (bgMesh.instanceColor) bgMesh.instanceColor.needsUpdate = true;
  scene.add(hhMesh, bgMesh);

  // --- highlight furniture (stage 7, Part B) ---
  // Route: one bright line ahead of the followed resident, one faded
  // line behind. Destination: a pin label + a small ground marker. The
  // ride stub is a dashed line for off-area station rides.
  const routeAhead = new THREE.Line(new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ transparent: true, opacity: 0.95, depthTest: false }));
  const routeDone = new THREE.Line(new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0x8a8a8a, transparent: true, opacity: 0.3 }));
  routeAhead.renderOrder = 998;
  routeAhead.frustumCulled = false;
  routeDone.frustumCulled = false;
  routeAhead.visible = false;
  routeDone.visible = false;
  scene.add(routeAhead, routeDone);
  const destPin = document.createElement("div");
  destPin.className = "hopin";
  destPin.style.display = "none";
  tagsLayer.appendChild(destPin);
  const destMark = new THREE.Mesh(
    new THREE.ConeGeometry(2.2, 5, 12),
    new THREE.MeshBasicMaterial({ depthTest: false, transparent: true, opacity: 0.9 }));
  destMark.renderOrder = 998;
  destMark.visible = false;
  scene.add(destMark);
  const rideStub = new THREE.Line(new THREE.BufferGeometry(),
    new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 4, gapSize: 3,
      transparent: true, opacity: 0.9, depthTest: false }));
  rideStub.renderOrder = 998;
  rideStub.frustumCulled = false;
  rideStub.visible = false;
  scene.add(rideStub);
  const qolGroup = new THREE.Group();
  scene.add(qolGroup);
  const poiById = new Map((area.pois || []).map((p) => [p.id, p]));

  // Per-building tint over the merged meshes (home + destination):
  // lerp the vertex colours toward the tint, restore the exact
  // originals on change. Ranges come from buildBuildings.
  const tintMeshes = [...Object.values(wallMeshes), podiumMesh, roofMesh].filter(Boolean);
  const tintState = { home: null, dest: null }; // slot -> {id, hex} | null
  function setTint(buildingId, slot, hex) {
    const cur = tintState[slot];
    if ((cur && cur.id) === buildingId && (!buildingId || (cur && cur.hex) === hex)) return;
    tintState[slot] = buildingId ? { id: buildingId, hex } : null;
    for (const mesh of tintMeshes) {
      const attr = mesh.geometry.attributes.color;
      if (!attr) continue;
      if (!mesh.userData.origColors) mesh.userData.origColors = attr.array.slice();
      const orig = mesh.userData.origColors;
      const ranges = mesh.userData.ranges || [];
      const apply = (slotState) => {
        if (!slotState) return;
        const tint = new THREE.Color(slotState.hex);
        const k = 0.45;
        for (const r of ranges) {
          if (r.id !== slotState.id) continue;
          for (let v = r.start; v < r.start + r.count; v++) {
            const o = v * 3;
            attr.array[o] = orig[o] * (1 - k) + tint.r * k;
            attr.array[o + 1] = orig[o + 1] * (1 - k) + tint.g * k;
            attr.array[o + 2] = orig[o + 2] * (1 - k) + tint.b * k;
          }
        }
      };
      const clear = (id) => {
        if (!id) return;
        for (const r of ranges) {
          if (r.id !== id) continue;
          for (let v = r.start; v < r.start + r.count; v++) {
            const o = v * 3;
            attr.array[o] = orig[o];
            attr.array[o + 1] = orig[o + 1];
            attr.array[o + 2] = orig[o + 2];
          }
        }
      };
      // Rebuild from the originals: clear the previous id when it is no
      // longer tinted by either slot, then apply both slots (each slot
      // keeps its own colour; home and destination may coincide).
      if (cur && cur.id !== (tintState.home && tintState.home.id)
          && cur.id !== (tintState.dest && tintState.dest.id)) {
        clear(cur.id);
      }
      apply(tintState.home);
      apply(tintState.dest);
      attr.needsUpdate = true;
    }
  }

  function paintTagPin(el, x, y, z, text) {
    if (!text) {
      el.style.display = "none";
      return;
    }
    el.textContent = text;
    paintTag(el, x, y, z, true);
  }

  function nodeWorld(nodeId, lift = 1.5) {
    const p = nodeLonLat.get(nodeId);
    if (!p) return null;
    const [x, y] = lonLatToXY(p[0], p[1], origin);
    return new THREE.Vector3(x, lift, -y);
  }

  // Split a trip path at the travelled fraction into behind/ahead
  // polylines (world space), sharing the interpolated current point.
  function splitRoute(trip, frac) {
    const fracs = tripFractions(trip, edgeLen);
    const pts = trip.path.map((id) => nodeWorld(id)).filter(Boolean);
    if (pts.length === 0) return { behind: [], ahead: [] };
    const f = Math.min(1, Math.max(0, frac));
    let i = 0;
    while (i < fracs.length - 2 && fracs[i + 1] < f) i++;
    const span = fracs[i + 1] - fracs[i] || 1;
    const k = Math.min(1, Math.max(0, (f - fracs[i]) / span));
    const cur = pts[i].clone().lerp(pts[Math.min(pts.length - 1, i + 1)], k);
    return { behind: [...pts.slice(0, i + 1), cur], ahead: [cur, ...pts.slice(i + 1)] };
  }

  function setLine(line, pts) {
    line.geometry.setFromPoints(pts.length > 0 ? pts : [new THREE.Vector3(0, -100, 0)]);
    if (line.computeLineDistances) line.computeLineDistances();
  }

  function placeAgents(day, minute) {
    for (const [mesh, list, height] of [[hhMesh, household, 2.2], [bgMesh, background, 1.0]]) {
      list.forEach((a, i) => {
        const s = sampleAgent(a.key, indexed, day, minute, nodeLonLat,
          homeLonLat.get(a.key), edgeLen);
        const [x, y] = lonLatToXY(s.lon, s.lat, origin);
        dummy.position.set(x, height, -y);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(s.visible ? 1 : 0.0001);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
    // Rings + tags mark the household whenever they are out or at home
    // (hidden only while away out of the area, e.g. at work).
    household.forEach((a, i) => {
      const s = sampleAgent(a.key, indexed, day, minute, nodeLonLat,
        homeLonLat.get(a.key), edgeLen);
      const [x, y] = lonLatToXY(s.lon, s.lat, origin);
      const marked = s.visible || s.state === "home";
      ringMeshes[i].position.set(x, 0.3, -y);
      ringMeshes[i].visible = marked;
      paintTag(tagEls[i], x, 6, -y, marked);
    });
  }

  // --- sim clock ---
  // ?t= pauses the clock at that time; ?play=1 opts into playing.
  const days = run.meta.days;
  let day = Math.min(days - 1, Math.max(0, (Number.parseInt(PARAMS.get("day") || "1", 10) || 1) - 1));
  let minute = parseTParam(PARAMS.get("t")) ?? 420;
  let playing = shouldAutoplay(PARAMS);
  let speed = 1;
  let follow = Math.min(household.length, Math.max(0, Number.parseInt(PARAMS.get("follow") || "0", 10) || 0));
  const hhmmOf = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

  function paintClock() {
    store.set({ clock: {
      day, minute: Math.floor(minute), days,
      startDate: run.meta.start_date,
      label: formatClock(run.meta.start_date, day, Math.floor(minute), days),
    } });
    paintJudgeLog();
  }

  // --- Now card + highlight state (stage 7, Parts A/B) ---
  // paintNow publishes the Now card, ticker, ticks and flash (minute
  // granularity); the per-frame loop only moves the route split, pins
  // and the pulse from the cached hiState.
  const tripById = new Map(run.trips.map((t) => [t.id, t]));
  let hiState = null;
  let pulse = null; // {ring, t0} active decision pulse or null
  let lastPulseId = "";
  let lastRouteKey = "";
  const qolGeo = new THREE.SphereGeometry(2.2, 10, 8);
  const qolMat = new THREE.MeshBasicMaterial({ color: 0x7fd4ff,
    depthTest: false, transparent: true, opacity: 0.9 });

  function spendingEvents() {
    const money = store.getState().money;
    const home = money && !money.error && money.homes && money.homes[homeLabel];
    return (home && home.spending_events) || [];
  }

  function paintNow() {
    const m = Math.floor(minute);
    paintJourneyMinute();
    if (!follow) {
      store.set({ now: { free: true,
        rows: householdNow({ run, indexed, day, minute: m }) }, ticker: [] });
    } else {
      const agent = household[follow - 1];
      store.set({
        now: nowCardFor({ run, indexed, agentKey: agent.key, day, minute: m }),
        ticker: tickerFor({ run, indexed, agentKey: agent.key, day, minute: m,
          moneyEvents: spendingEvents() }),
      });
    }
    refreshHighlight();
  }

  let lastQolKey = "";
  function rebuildQolMarkers(ids) {
    const key = (ids || []).join(",");
    if (key === lastQolKey) return;
    lastQolKey = key;
    while (qolGroup.children.length > 0) qolGroup.remove(qolGroup.children[0]);
    for (const id of (ids || []).slice(0, 250)) {
      const p = poiById.get(id);
      const c = p && p.geometry && p.geometry.coordinates;
      if (!c) continue;
      const [x, y] = lonLatToXY(c[0], c[1], origin);
      const s = new THREE.Mesh(qolGeo, qolMat);
      s.position.set(x, 4, -y);
      s.renderOrder = 997;
      qolGroup.add(s);
    }
  }

  function refreshHighlight() {
    const m = Math.floor(minute);
    hiState = highlightFor({ run, indexed, follow, day, minute: m,
      qualityHover: store.getState().qualityHover,
      moneyDoc: store.getState().money, area, homeLabel });
    store.set({ simTicks: hiState.ticks, judgeFlash: hiState.pulseDecisionId || "" });
    setTint(hiState.homeBuildingId, "home", 0xffc978);
    const memberHex = follow > 0 ? hhColors[(follow - 1) % hhColors.length] : 0xffffff;
    setTint(hiState.destBuildingId, "dest", memberHex);
    rebuildQolMarkers(hiState.qualityPoiIds);
    if (!REDUCED && hiState.pulseDecisionId && hiState.pulseDecisionId !== lastPulseId && follow > 0) {
      pulse = { ring: ringMeshes[follow - 1], t0: performance.now() };
    }
    lastPulseId = hiState.pulseDecisionId || "";
    return hiState;
  }

  function applyFollowDim() {
    const tmp = new THREE.Color();
    const grey = new THREE.Color(0x555555);
    household.forEach((a, i) => {
      const on = follow === 0 || follow === i + 1;
      tmp.setHex(hhColors[i % hhColors.length]);
      if (!on) tmp.lerp(grey, 0.6);
      hhMesh.setColorAt(i, tmp);
      const ring = ringMeshes[i];
      if (follow === i + 1) {
        ring.material.opacity = 0.95;
        ring.material.depthTest = false;
        ring.renderOrder = 999;
      } else {
        ring.material.opacity = follow === 0 ? 0.9 : 0.22;
        ring.material.depthTest = true;
        ring.renderOrder = 0;
      }
    });
    if (hhMesh.instanceColor) hhMesh.instanceColor.needsUpdate = true;
    bgMesh.material.transparent = follow > 0;
    bgMesh.material.opacity = follow > 0 ? 0.45 : 1.0;
    bgMesh.material.needsUpdate = true;
  }

  function paintHighlightFrame() {
    if (pulse) {
      const k = (performance.now() - pulse.t0) / 700;
      if (k >= 1) {
        pulse.ring.scale.setScalar(1);
        pulse.ring.material.opacity = 0.95;
        pulse = null;
      } else {
        pulse.ring.scale.setScalar(1 + k * 0.8);
        pulse.ring.material.opacity = 0.95 * (1 - k * 0.6);
      }
    }
    const h = hiState;
    const trip = h && h.trip ? tripById.get(h.trip.id) : null;
    if (trip && follow > 0) {
      const dur = Math.max(1, trip.arrive_min - trip.depart_min);
      const frac = Math.min(1, Math.max(0, (minute - trip.depart_min) / dur));
      const rkey = `${trip.id}:${Math.round(frac * 64)}`;
      if (rkey !== lastRouteKey) {
        lastRouteKey = rkey;
        const { behind, ahead } = splitRoute(trip, frac);
        setLine(routeAhead, ahead);
        setLine(routeDone, behind);
        routeAhead.material.color.setHex(hhColors[(follow - 1) % hhColors.length]);
      }
      routeAhead.visible = true;
      routeDone.visible = true;
      const dp = h.destNodeId ? nodeWorld(h.destNodeId, 0) : null;
      if (dp && h.destLabel) {
        paintTagPin(destPin, dp.x, 10, dp.z, h.destLabel);
        destMark.position.set(dp.x, 3, dp.z);
        destMark.material.color.setHex(hhColors[(follow - 1) % hhColors.length]);
        destMark.visible = true;
      } else {
        destPin.style.display = "none";
        destMark.visible = false;
      }
      rideStub.visible = false;
    } else if (h && h.rideAway && follow > 0) {
      routeAhead.visible = false;
      routeDone.visible = false;
      lastRouteKey = "";
      destMark.visible = false;
      const sp = h.rideAway.stationNodeId ? nodeWorld(h.rideAway.stationNodeId, 1) : null;
      if (sp) {
        setLine(rideStub, [sp, new THREE.Vector3(sp.x, 30, sp.z)]);
        rideStub.visible = true;
        paintTagPin(destPin, sp.x, 34, sp.z, `지하철 탑승 (가정값 ${h.rideAway.rideMinutes}분)`);
      } else {
        rideStub.visible = false;
        destPin.style.display = "none";
      }
    } else {
      routeAhead.visible = false;
      routeDone.visible = false;
      rideStub.visible = false;
      destMark.visible = false;
      destPin.style.display = "none";
      lastRouteKey = "";
    }
  }

  // --- sun/sky follow sim time; facades glow from run occupancy ---
  // The rig owns sun/hemi/Sky/environment; per-building lit fractions
  // (at-home residents / agents housed there — the same stage-3 data the
  // old glow quads used — plus the fallback estimate for other residential
  // buildings with real households) fill the aLit vertex attributes at
  // 30-minute granularity. Daytime emissive is off (uNight = 0).
  let simBloom = 0;
  let lastLightKey = "";
  let lastLitKey = "";

  function updateLighting() {
    const m = Math.floor(minute);
    const instant = simInstant(run.meta.start_date, day, m);
    const framedWidth = frameWidthFor(
      camera.position.distanceTo(controls.target), TOUR_FOV_DEG, camera.aspect);
    const p = rig.update({ lat: origin.lat, lon: origin.lon, date: instant,
      minute: m, target: { x: controls.target.x, z: controls.target.z },
      shadowSpan: 240, envKey: `${day}:${Math.floor(m / 30)}`, framedWidth, maxHeightM });
    simBloom = p.bloom;
    const key = `${day}:${m}`;
    if (key === lastLightKey) return;
    lastLightKey = key;
    setGlobalNight(p.emissive);
    streetMeshes.setLampGlow(p.emissive);
    updateLit(m);
  }

  function updateLit(m) {
    const key = `${day}:${Math.floor(m / 30)}`;
    if (key === lastLitKey) return;
    lastLitKey = key;
    const occ = homeOccupancy(run, indexed, day, m);
    fillSimLit(occ, globalHomeFraction(occ));
  }

  // --- follow camera (2b miniature framing) ---
  const stopDist = distanceForWidth(STOP_FRAME_M, TOUR_FOV_DEG, camera.aspect);
  let snapFollow = follow > 0;

  function followedSample() {
    if (follow < 1 || follow > household.length) return null;
    const agent = household[follow - 1];
    const s = sampleAgent(agent.key, indexed, day, minute, nodeLonLat,
      homeLonLat.get(agent.key), edgeLen);
    return { agent, s };
  }

  function paintFollow(dt, forceCaption) {
    if (!follow) {
      if (forceCaption) {
        store.set({ caption: null, judge: null });
        paintNow();
      }
      controls.enabled = true;
      return;
    }
    // The journey camera owns follow mode while a station ride plays.
    if (paintJourney(dt)) {
      destPin.style.display = "none";
      rideStub.visible = false;
      if (forceCaption) {
        paintNow();
        const agent = household[follow - 1];
        if (agent) paintJudgeCaption(agent.key);
      }
      return;
    }
    const hit = followedSample();
    if (!hit) return;
    const [x, y] = lonLatToXY(hit.s.lon, hit.s.lat, origin);
    const [ox, oy, oz] = tourOffset(stopDist);
    const pos = new THREE.Vector3(x + ox, oy, -y + oz);
    const look = new THREE.Vector3(x, 2, -y);
    // Snap when far (a fast clock would lag behind); otherwise glide,
    // so the followed member stays in frame at any speed.
    if (snapFollow || controls.target.distanceTo(look) > 60) {
      camera.position.copy(pos);
      controls.target.copy(look);
      snapFollow = false;
    } else {
      const k = 1 - Math.pow(0.001, dt);
      camera.position.lerp(pos, k);
      controls.target.lerp(look, k);
    }
    controls.enabled = false;
    if (forceCaption) {
      paintNow();
      paintJudgeCaption(hit.agent.key);
    }
  }

  // Branch caption: the followed member's latest decision — options with
  // graph minutes, the chosen one, the Korean reason, and who decided.
  // The captioned decision id, so askLive judges what is shown.
  let captionedId = null;

  function paintJudgeCaption(agentKey) {
    const d = latestDecision(run, agentKey, day, Math.floor(minute));
    captionedId = d ? d.id : null;
    store.set({ judgeLive: false, judgeAskState: "idle" });
    if (!d) {
      store.set({ judge: null });
      return;
    }
    const v = judgedView(d);
    const badge = decisionBadge(v);
    store.set({ judge: {
      badgeText: badge.text,
      badgeCls: badge.cls,
      text: `${hhmmOf(v.minute)} ${DECISION_KIND_KO[v.kind] || v.kind} · ${optionsLine(v)} → ✓ ${chosenLabel(v)}` +
        (v.reason_ko ? ` · “${v.reason_ko}”` : ""),
      canAsk: import.meta.env.DEV,
    } });
  }

  function liveRequestBody(v) {
    const idx = Math.max(0, Number.parseInt(String(v.agent).slice(1), 10) - 1);
    const member = (scenario && scenario.household && scenario.household.members[idx])
      || { role: "adult", preferences: "" };
    const tripsToday = run.trips
      .filter((t) => t.agent === v.agent && t.day === v.day && t.depart_min < v.minute)
      .map((t) => ({
        depart_min: t.depart_min, arrive_min: t.arrive_min, purpose: t.purpose,
        from_label: (t.from && (t.from.label || t.from.id)) || "",
        to_label: (t.to && (t.to.label || t.to.id)) || "",
        minutes: t.minutes, distance_m: t.distance_m,
      }));
    const mem = run.decisions
      .filter((d) => d.agent === v.agent && (d.day < v.day || (d.day === v.day && d.minute < v.minute)))
      .slice(-3)
      .map((d) => {
        const dv = judgedView(d);
        return {
          day: dv.day, minute: dv.minute, kind: dv.kind,
          chosen: dv.kind === "weekend_plan"
            ? (dv.plan && dv.plan.length > 0 ? dv.plan.join("+") : "home")
            : dv.chosen_key,
          reason_ko: dv.reason_ko || "",
        };
      });
    const dayInfo = ((run.daily.find((dd) => dd.agent === v.agent) || {}).days || [])[v.day] || {};
    return {
      provider: judgeProvider,
      shell: { kind: v.kind, options: v.options, default_key: v.default_key },
      member: { role: member.role || "adult", preferences: member.preferences || "" },
      agentLabel: agentLabelOf(run, v.agent),
      date: dayInfo.date || run.meta.start_date, weekday: dayInfo.weekday || "Mon",
      minute: v.minute, tripsToday, memory: mem,
    };
  }

  // Dev-only live judgment: ask Muse about the captioned decision. The
  // key stays on the dev server (/api/judge); production has no button.
  async function askLive() {
    const v = judgedView(run.decisions.find((d) => d.id === captionedId) || {});
    if (!v || !v.kind) return;
    store.set({ judgeAskState: "asking", askError: "" });
    try {
      const r = await fetch("/api/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(liveRequestBody(v)),
      });
      const payload = await r.json();
      if (!payload.ok) throw new Error(payload.error || `HTTP ${r.status}`);
      const live = { ...v, ...payload.entry };
      const badge = decisionBadge(live);
      store.set({
        judge: {
          badgeText: badge.text,
          badgeCls: badge.cls,
          text: `${hhmmOf(v.minute)} ${DECISION_KIND_KO[v.kind] || v.kind} · ${optionsLine(v)} → ✓ ${chosenLabel(live)}` +
            (live.reason_ko ? ` · “${live.reason_ko}”` : "") +
            ` (${live.provider === "baseten" ? "Muse Spark Open" : "Muse Spark 1.3"})`,
          canAsk: true,
        },
        judgeLive: true,
        judgeAskState: "live",
      });
    } catch (err) {
      store.set({ judgeAskState: "error", askError: String((err && err.message) || err).slice(0, 200) });
    }
  }

  // Today's household decisions, latest first.
  function paintJudgeLog() {
    const rows = dayDecisions(run, day).slice(0, 12).map((d) => {
      const v = judgedView(d);
      const badge = decisionBadge(v);
      return {
        id: v.id,
        minute: hhmmOf(v.minute),
        agent: agentLabelOf(run, v.agent),
        kind: DECISION_KIND_KO[v.kind] || v.kind,
        choice: chosenLabel(v),
        badgeText: badge.text,
        badgeCls: badge.cls,
        reason: v.reason_ko || "",
      };
    });
    store.set({ judgeLog: rows });
  }

  // --- journey view + corridor + itinerary areas (stage 8) ---
  // The journey layer draws the travelled line (per-hop congestion
  // colours), station dots, the train marker and the lazy corridor
  // tiles. A second detailed area loads when the followed member's day
  // touches one (itinerary-driven). All phasing derives from the sim
  // minute, so ?t= captures are deterministic at any speed.
  const journeyLayer = createJourneyLayer(scene, origin);
  let regionNetwork = null;
  let regionCongestion = null; // lazy: 1.2 MB, fetched on first journey
  let corridorsIndex = null;
  let journeyView = "auto"; // auto | low (거리 보기) | high (전체 경로)
  let journeyRideKey = ""; // rebuilt path identity (agent+day+dir+depart)
  let secondAreas = new Map(); // areaId -> {group, origin}
  let areaBboxes = new Map(); // areaId -> bbox (for station containment)
  const maxAniso2 = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const baseFog = { near: scene.fog.near, far: scene.fog.far };
  const baseClip = { near: camera.near, far: camera.far };
  // Regional base plane (the home plane only spans ~1.8 km).
  const regionalBase = new THREE.Mesh(
    new THREE.PlaneGeometry(120000, 120000),
    new THREE.MeshStandardMaterial({ color: BASE_GROUND, roughness: 1, metalness: 0 }));
  regionalBase.rotation.x = -Math.PI / 2;
  regionalBase.position.y = -0.4;
  regionalBase.visible = false;
  scene.add(regionalBase);

  async function fetchJson(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return r.json();
  }

  async function ensureRegion() {
    if (regionNetwork !== null || corridorsIndex !== null) return;
    try {
      regionNetwork = await fetchJson("/data/region/network.json");
    } catch {
      regionNetwork = null;
    }
    try {
      corridorsIndex = await fetchJson("/data/region/corridors.json");
    } catch {
      corridorsIndex = null;
    }
    store.set({ region: {
      network: !!regionNetwork,
      congestion: run.meta.region ? !!run.meta.region.congestion : false,
      corridors: (corridorsIndex && corridorsIndex.corridors.length) || 0,
    } });
  }

  async function ensureCongestion() {
    if (regionCongestion !== null) return regionCongestion;
    try {
      regionCongestion = await fetchJson("/data/region/congestion.json");
    } catch {
      regionCongestion = null;
    }
    return regionCongestion;
  }

  function networkStopCoords() {
    const out = new Map();
    for (const line of (regionNetwork && regionNetwork.lines) || []) {
      for (const s of line.stops || []) out.set(s.id, [s.lon, s.lat]);
    }
    return out;
  }

  function ridesOf(agentKey, dayNum) {
    const out = [];
    for (const a of indexed.awaysByAgent.get(agentKey) || []) {
      if (a.day === dayNum && a.kind === "work" && a.detail && a.detail.rides) {
        out.push({ away: a, rides: a.detail.rides });
      }
    }
    return out;
  }

  async function areaBbox(areaId) {
    if (areaBboxes.has(areaId)) return areaBboxes.get(areaId);
    try {
      const doc = await fetchJson(`/data/${areaId}/area.json`);
      areaBboxes.set(areaId, doc.bbox || null);
      return doc.bbox || null;
    } catch {
      areaBboxes.set(areaId, null);
      return null;
    }
  }

  // Smallest built area containing the station (songpa contains jamsil —
  // the smallest wins). Built areas only; null → corridor level + note.
  async function areaForStation(lon, lat) {
    let best = null;
    let bestArea = Infinity;
    for (const { id } of AREAS) {
      const bbox = await areaBbox(id);
      if (!bbox) continue;
      const [x0, y0, x1, y1] = bboxToXY(bbox, origin);
      const [x, y] = lonLatToXY(lon, lat, origin);
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const size = (x1 - x0) * (y1 - y0);
      if (size < bestArea) {
        bestArea = size;
        best = id;
      }
    }
    return best;
  }

  // Lite second world: ground + buildings + water under an offset group
  // (no trees/streetlife/lit — the journey camera never lingers there).
  function buildAreaLite(areaData) {
    const liteOrigin = originOf(areaData);
    const g = new THREE.Group();
    const byId = new Map((areaData.buildings || []).map((b) => [b.id, b]));
    const gd = buildGround(areaData.roads, areaData.landuse, areaData.complexes, byId, liteOrigin);
    const gm = new THREE.Mesh(toGeometry(gd), groundMaterial({ aniso: maxAniso2 }));
    gm.receiveShadow = true;
    g.add(gm);
    if (gd.water.triangles > 0) {
      g.add(new THREE.Mesh(toGeometry(gd.water), waterMaterial()));
    }
    const built = buildBuildings(areaData.buildings, areaData.complexes, liteOrigin);
    for (const [cls, data] of Object.entries(built.detail.walls)) {
      if (data.triangles === 0) continue;
      const mesh = new THREE.Mesh(toGeometry(data), facadeMaterial(cls, { aniso: maxAniso2 }));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
    }
    if (built.detail.podium.triangles > 0) {
      const mesh = new THREE.Mesh(toGeometry(built.detail.podium),
        facadeMaterial("podium", { aniso: maxAniso2 }));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
    }
    g.add(new THREE.Mesh(toGeometry(built.detail.roofs), roofMaterial({ aniso: maxAniso2 })));
    const [ox, oy] = lonLatToXY(liteOrigin.lon, liteOrigin.lat, origin);
    g.position.set(ox, 0, -oy);
    scene.add(g);
    return { group: g, origin: liteOrigin };
  }

  async function ensureSecondArea(areaId) {
    if (areaId === run.meta.area || secondAreas.has(areaId)) return secondAreas.get(areaId) || null;
    if (secondAreas.size >= 2) {
      const oldest = secondAreas.keys().next().value;
      const slot = secondAreas.get(oldest);
      if (slot) scene.remove(slot.group);
      secondAreas.delete(oldest);
    }
    const label = (AREAS.find((a) => a.id === areaId) || {}).label || areaId;
    store.set({ journeyLoading: `${label} 지도 불러오는 중…` });
    try {
      const data = await fetchArea(areaId);
      const lite = buildAreaLite(data);
      secondAreas.set(areaId, lite);
      return lite;
    } catch {
      return null;
    } finally {
      store.set({ journeyLoading: "" });
    }
  }

  // Itinerary preload for the followed member's day: work-area detail +
  // the corridor manifest (tiles stay lazy around the train).
  let itineraryKey = "";
  async function ensureItinerary() {
    await ensureRegion();
    if (follow < 1 || !regionNetwork) return;
    const key = `${follow}:${day}`;
    if (key === itineraryKey) return;
    itineraryKey = key;
    const agent = household[follow - 1];
    if (!agent) return;
    const coords = networkStopCoords();
    for (const { rides } of ridesOf(agent.key, day)) {
      for (const ride of [rides.out, rides.back]) {
        const lastLeg = ride.legs[ride.legs.length - 1];
        const sid = lastLeg.stopIds[lastLeg.stopIds.length - 1];
        const c = coords.get(sid);
        if (!c) continue;
        const areaId = await areaForStation(c[0], c[1]);
        if (areaId && areaId !== run.meta.area) await ensureSecondArea(areaId);
      }
      const first = rides.out.legs[0];
      const last = rides.out.legs[rides.out.legs.length - 1];
      const corridor = corridorFor(corridorsIndex, first.from, last.to);
      if (corridor) {
        try {
          journeyLayer.setManifest(
            await fetchJson(`/data/region/corridor/${corridor.id}/manifest.json`));
        } catch {
          // The line still draws; tiles just stay empty.
        }
      }
    }
  }

  function currentWorkAway(agentKey, dayNum, m) {
    for (const a of indexed.awaysByAgent.get(agentKey) || []) {
      if (a.day === dayNum && a.kind === "work" && a.detail && a.detail.ride_minutes > 0
          && m >= a.start_min && m < a.end_min) {
        return a;
      }
    }
    return null;
  }

  function weekdayOfDay(dayNum) {
    const entry = (run.daily || []).find((d) => d.agent === (household[0] && household[0].key));
    return (entry && entry.days[dayNum] && entry.days[dayNum].weekday) || "Mon";
  }

  // The dest station's detailed scene is loaded (sync: cached bboxes
  // from the itinerary preload; back-rides always return home).
  function destDetailLoaded(destLonLat, backHome) {
    if (backHome) return true;
    if (!destLonLat) return false;
    const [x, y] = lonLatToXY(destLonLat[0], destLonLat[1], origin);
    for (const [id] of secondAreas) {
      const bbox = areaBboxes.get(id);
      if (!bbox) continue;
      const [x0, y0, x1, y1] = bboxToXY(bbox, origin);
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return true;
    }
    return false;
  }

  // Full journey frame state (pure of wall time — minute only).
  function journeyFrame() {
    const idle = { phase: "idle", riding: null, away: null, ride: null,
      dir: null, elapsed: 0, progress: 0, banner: null, hasDetailDest: false,
      detailNote: "", destLonLat: null, boardLonLat: null };
    if (follow < 1 || !regionNetwork) return idle;
    const agent = household[follow - 1];
    if (!agent) return idle;
    const m = Math.floor(minute);
    const away = currentWorkAway(agent.key, day, m);
    if (!away || !away.detail.rides) return idle;
    const riding = rideStateFor(away, m);
    if (!riding) return idle;
    const coords = networkStopCoords();
    const stopPos = (sid) => coords.get(sid) || null;
    if (riding.dir === "work") {
      // Arrival hold: stay at the destination while they work.
      const ride = away.detail.rides.out;
      const lastLeg = ride.legs[ride.legs.length - 1];
      const dest = stopPos(lastLeg.stopIds[lastLeg.stopIds.length - 1]);
      const hasDetail = destDetailLoaded(dest, false);
      return { ...idle, phase: "hold", riding, away, ride,
        dir: "work", elapsed: 0, progress: 1,
        hasDetailDest: hasDetail, destLonLat: dest,
        detailNote: hasDetail ? "" : "상세 지도는 지역 생성 후",
        banner: { where: `${lastLeg.to} 도착 · 근무 중`, legIndex: -1,
          inTransfer: false, minutesLeft: 0,
          legs: ride.legs.map((l) => ({ line: l.lineName, from: l.from,
            to: l.to, minutes: l.minutes, valuePct: l.congestion.valuePct,
            source: l.congestion.source })) } };
    }
    const ride = away.detail.rides[riding.dir];
    const firstLeg = ride.legs[0];
    const lastLeg = ride.legs[ride.legs.length - 1];
    const board = stopPos(firstLeg.stopIds[0]);
    const dest = stopPos(lastLeg.stopIds[lastLeg.stopIds.length - 1]);
    const backHome = riding.dir === "back";
    const hasDetail = destDetailLoaded(dest, backHome);
    const phase = journeyPhase({ riding: { progress: riding.progress },
      view: journeyView, hasDetailDest: hasDetail });
    return { phase, riding, away, ride, dir: riding.dir,
      elapsed: riding.elapsed, progress: riding.progress,
      hasDetailDest: hasDetail,
      detailNote: (!hasDetail && !backHome) ? "상세 지도는 지역 생성 후" : "",
      destLonLat: dest, boardLonLat: board,
      banner: journeyBanner({ ride, dir: riding.dir, elapsed: riding.elapsed,
        rideMinutes: riding.rideMinutes }) };
  }

  function streetPose(lonLat) {
    const [x, y] = lonLatToXY(lonLat[0], lonLat[1], origin);
    const [ox, oy, oz] = tourOffset(stopDist);
    return { pos: new THREE.Vector3(x + ox, oy, -y + oz),
      look: new THREE.Vector3(x, 2, -y) };
  }

  function regionalPose() {
    const box3 = journeyLayer.pathBounds();
    if (!box3) return null;
    const center = box3.getCenter(new THREE.Vector3());
    const size = box3.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.z) / 2;
    const dist = Math.max(4000, radius * 2.6);
    const [ox, oy, oz] = tourOffset(dist);
    return { pos: new THREE.Vector3(center.x + ox, oy, center.z + oz),
      look: new THREE.Vector3(center.x, 0, center.z), dist };
  }

  const smooth = (t) => t * t * (3 - 2 * t);

  // Journey camera: progress-driven (speed-independent). Returns true
  // when it placed the camera (paintFollow skips its own follow then).
  function paintJourney(dt) {
    const jf = journeyFrame();
    const active = jf.phase === "rising" || jf.phase === "cruise"
      || jf.phase === "descending" || jf.phase === "hold" || jf.phase === "street";
    regionalBase.visible = active && jf.phase !== "hold";
    journeyLayer.setVisible(active);
    if (!active) {
      restoreClipFog(dt);
      return false;
    }
    if (jf.phase === "hold") {
      if (jf.destLonLat) {
        const pose = streetPose(jf.destLonLat);
        camera.position.copy(pose.pos);
        controls.target.copy(pose.look);
      }
      controls.enabled = false;
      restoreClipFog(dt);
      return true;
    }
    if (jf.phase === "street") {
      if (jf.boardLonLat) {
        const pose = streetPose(jf.boardLonLat);
        camera.position.copy(pose.pos);
        controls.target.copy(pose.look);
      }
      controls.enabled = false;
      restoreClipFog(dt);
      return true;
    }
    const regional = regionalPose();
    if (!regional || !jf.boardLonLat || !jf.destLonLat) return false;
    const streetA = streetPose(jf.boardLonLat);
    const streetB = streetPose(jf.destLonLat);
    const p = jf.progress;
    let pos;
    let look;
    if (jf.phase === "rising") {
      const k = smooth(Math.min(1, p / 0.15));
      pos = streetA.pos.clone().lerp(regional.pos, k);
      look = streetA.look.clone().lerp(regional.look, k);
    } else if (jf.phase === "descending") {
      const k = smooth(Math.min(1, Math.max(0, (p - 0.85) / 0.15)));
      pos = regional.pos.clone().lerp(streetB.pos, k);
      look = regional.look.clone().lerp(streetB.look, k);
    } else {
      pos = regional.pos;
      look = regional.look;
    }
    camera.position.copy(pos);
    controls.target.copy(look);
    controls.enabled = false;
    // Regional depth range + fog (the street fit only spans ~1 km).
    camera.near = Math.max(2, regional.dist / 200);
    camera.far = Math.max(30000, regional.dist * 4);
    camera.updateProjectionMatrix();
    scene.fog.near += ((regional.dist * 1.1) - scene.fog.near) * Math.min(1, dt * 3);
    scene.fog.far += ((regional.dist * 3.2) - scene.fog.far) * Math.min(1, dt * 3);
    return true;
  }

  function restoreClipFog(dt) {
    if (Math.abs(camera.far - baseClip.far) > 1) {
      camera.near = baseClip.near;
      camera.far = baseClip.far;
      camera.updateProjectionMatrix();
    }
    const k = Math.min(1, dt * 3);
    scene.fog.near += (baseFog.near - scene.fog.near) * k;
    scene.fog.far += (baseFog.far - scene.fog.far) * k;
  }

  // Per-minute journey maintenance: path rebuilds, banner, tile pacing.
  async function paintJourneyMinute() {
    const jf = journeyFrame();
    const active = jf.phase === "rising" || jf.phase === "cruise"
      || jf.phase === "descending" || jf.phase === "hold" || jf.phase === "street";
    if (!active || !jf.ride) {
      if (store.getState().journey) store.set({ journey: null });
      return;
    }
    const key = `${follow}:${day}:${jf.dir}:${jf.away.start_min}`;
    if (key !== journeyRideKey) {
      journeyRideKey = key;
      const cong = await ensureCongestion();
      journeyLayer.setPath({ ride: jf.ride, network: regionNetwork,
        congestion: cong, dayKind: dayKindFor(weekdayOfDay(day)),
        minute: jf.away.start_min + (jf.dir === "back"
          ? (jf.away.end_min - jf.away.start_min - jf.riding.rideMinutes) : 0),
        fallback: criterionDefault("C-congestion", "fallback_pct") });
    }
    store.set({ journey: { ...jf.banner, dir: jf.dir,
      elapsedMin: Math.floor(jf.elapsed),
      totalMin: jf.riding ? jf.riding.rideMinutes : 0,
      hasDetailDest: jf.hasDetailDest, detailNote: jf.detailNote,
      corridorLabel: "간략 지도 (건물 높이 추정)",
      congestionSource: "서울교통공사 지하철혼잡도정보 (2026-09-30 기준)" } });
    const pos = trainPosition(regionNetwork, jf.ride, jf.elapsed);
    const focus = pos || (jf.phase === "hold" && jf.destLonLat
      ? { lon: jf.destLonLat[0], lat: jf.destLonLat[1] } : null);
    if (focus) {
      const { loaded, pending } = await journeyLayer.updateTiles(focus, fetchJson);
      if (pending > 0 || loaded > 0) {
        console.log(`[journey] tiles loaded=${loaded} pending=${pending} ` +
          `drawCalls=${renderer.info.render.calls}`);
      }
    }
  }

  // --- sim UI: A/B homes, speeds, day jump, compare ---
  function simUrl(home, d, m, f) {
    const p = new URLSearchParams({
      mode: "sim", scenario: scenarioName, home,
      day: String(d + 1),
      t: `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.floor(m % 60)).padStart(2, "0")}`,
    });
    if (f) p.set("follow", String(f));
    return `${location.pathname}?${p}`;
  }

  // --- sim UI state (published) + actions (UI calls scene) ---
  const { resRows, heightRows } = legendRows(area);
  store.set({
    home: homeLabel,
    homes,
    scenarioName,
    area: { id: run.meta.area, label: run.meta.area },
    legend: {
      title: `범례 — ${homeLabel} · ${run.meta.complex}`,
      resRows: resRows.filter((r) => Object.values(RES_LABELS).includes(r.label)),
      heightRows: [],
      simNote: `시뮬레이션 주민 ${run.meta.agents}명 (가구 ${run.meta.household}명 + 이웃 ${run.meta.background}명) · 엔진 재생`,
      note: "나무·인물은 장식용 모의 표시입니다",
    },
    follow,
    followOptions: [{ value: "0", label: "자유 시점" },
      ...household.map((a, i) => ({ value: String(i + 1), label: a.label }))],
    playing,
    speed,
    simMeta: simMetaFor({ household, scenario, run, homes }),
    // The purpose card opens on arrival, but stays out of the way of
    // deterministic captures (?t= / ?day=) and ?intro=0.
    introOpen: !PARAMS.has("t") && !PARAMS.has("day") && PARAMS.get("intro") !== "0",
  });
  applyFollowDim();
  document.title = `주거 시뮬레이터 — ${homeLabel} · ${run.meta.complex}`;

  async function paintCompare() {
    store.set({ compareLoading: true });
    let cmp = await fetch(`/data/sim/${scenarioName}-compare.json`)
      .then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!cmp && homes.length >= 2) {
      try {
        const others = {};
        for (const h of homes.slice(0, 2)) {
          others[h.label] = h.label === homeLabel ? run : await loadRunFile(scenarioName, h.label);
          if (!others[h.label]) throw new Error(`home ${h.label} run missing`);
        }
        cmp = compareRuns(others[homes[0].label], others[homes[1].label]);
      } catch {
        cmp = null;
      }
    }
    if (!cmp) {
      store.set({ compareLoading: false,
        compare: { error: `node web/scripts/simulate.mjs --scenario scenarios/${scenarioName}.json --home both 실행 후 새로고침하세요.` } });
      return;
    }
    store.set({ compareLoading: false, compare: cmp });
  }

  async function paintMoney() {
    if (store.getState().money) return;
    store.set({ moneyLoading: true });
    const doc = await fetch(`/data/sim/${scenarioName}-money.json`)
      .then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!doc) {
      store.set({ moneyLoading: false,
        money: { error: `node web/scripts/money.mjs --scenario scenarios/${scenarioName}.json 실행 후 새로고침하세요.` } });
      return;
    }
    // The agent may already have merged home C while we fetched.
    const merged = store.getState().money;
    if (merged && !merged.error && merged.homes && merged.homes.C && !doc.homes.C) {
      doc.homes.C = merged.homes.C;
    }
    store.set({ moneyLoading: false, money: doc,
      moneyTenure: { ...(doc.default_tenure || {}), ...store.getState().moneyTenure } });
    refreshHighlight(); // QoL hover ids ride on the money doc
  }

  async function paintCriteria() {
    if (store.getState().criteria || store.getState().criteriaLoading) return;
    store.set({ criteriaLoading: true });
    try {
      const r = await fetch("/scenarios/criteria/kr-default.json");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const doc = await r.json();
      // Resolve the working scenario against the same criteria the
      // engine ran with (values + 고객 입력 sources); the file above
      // proves what the browser read.
      let resolved = null;
      try {
        resolved = scenario ? resolveCriteria(parseScenario(structuredClone(scenario))) : null;
      } catch {
        resolved = null;
      }
      const byId = resolved ? resolved.byId
        : Object.fromEntries((doc.criteria || []).map((c) => [c.id, c]));
      store.set({ criteriaLoading: false, criteria: {
        doc: doc.name, version: doc.version,
        groups: doc.groups || CRITERIA_GROUPS,
        overrides: resolved ? resolved.overridden : [],
        items: (doc.criteria || []).map((c) => {
          const row = byId[c.id] || c;
          return { id: row.id, group: row.group, title: row.title, rule: row.rule,
            values: row.values || {}, valuesLine: criterionValuesLine(row),
            source: row.source, affects: row.affects || [], editable: !!row.editable };
        }),
      } });
    } catch (err) {
      store.set({ criteriaLoading: false,
        criteria: { error: `기준 파일을 불러오지 못했습니다: ${err.message}` } });
    }
  }

  function jumpToCriterionUse(id) {
    const tripHit = run.trips.find((t) => t.cause && (t.cause.criterion_ids || []).includes(id));
    const awayHit = !tripHit
      ? run.aways.find((a) => a.cause && (a.cause.criterion_ids || []).includes(id)) : null;
    if (!tripHit && !awayHit) {
      store.set({ viewChip: `기준 ${id}을 쓴 순간이 없습니다 (${run.meta.days}일)` });
      return;
    }
    const hit = tripHit || awayHit;
    day = hit.day;
    minute = tripHit ? tripHit.depart_min : awayHit.start_min;
    if (String(hit.agent).startsWith("h")) {
      const idx = household.findIndex((a) => a.key === hit.agent);
      if (idx >= 0) {
        follow = idx + 1;
        snapFollow = true;
        store.set({ follow });
        applyFollowDim();
      }
    }
    paintClock();
    paintFollow(0.016, true);
    store.set({ viewChip: `기준 ${id}: ${hit.day + 1}일차 ${hhmmOf(Math.floor(minute))}으로 이동` });
  }

  store.registerActions({
    toggleSimPlay: () => {
      playing = !playing;
      store.set({ playing });
    },
    setSpeed: (next) => {
      if (SPEEDS.includes(next)) {
        speed = next;
        store.set({ speed });
      }
    },
    setDay: (next) => {
      day = Math.min(days - 1, Math.max(0, next));
      paintClock();
      paintFollow(0.016, true);
      ensureItinerary();
    },
    setMinute: (next) => {
      minute = Math.min(1439, Math.max(0, next));
      paintClock();
      paintFollow(0.016, true);
    },
    setFollow: (next) => {
      follow = Math.min(household.length, Math.max(0, next));
      snapFollow = follow > 0;
      store.set({ follow });
      applyFollowDim();
      paintFollow(0.016, true);
      ensureItinerary();
    },
    setJourneyView: (next) => {
      if (["auto", "low", "high"].includes(next)) {
        journeyView = next;
        store.set({ journeyView: next });
        paintFollow(0.016, true);
      }
    },
    setResOnly: (next) => {
      // Dimmed meshes stop casting (stage 7, Part C): no ghost shadows.
      for (const m of dimMeshes) {
        m.material.opacity = next ? 0.3 : 1.0;
        m.castShadow = !next;
      }
      store.set({ resOnly: next });
    },
    setIntroOpen: (next) => store.set({ introOpen: next }),
    openCriterion: async (id) => {
      store.set({ compareOpen: true, compareTab: "criteria", criteriaFocus: id });
      await paintCompare();
      await paintCriteria();
    },
    jumpToCriterionUse: (id) => jumpToCriterionUse(id),
    setQualityHover: (category) => {
      store.set({ qualityHover: category ? { category } : null });
      refreshHighlight();
    },
    selectHome: (label) => {
      if (label !== homeLabel) location.href = simUrl(label, day, Math.floor(minute), follow);
    },
    toggleCompare: async () => {
      const open = !store.getState().compareOpen;
      store.set({ compareOpen: open });
      if (open) {
        await paintCompare();
        await paintMoney();
      }
    },
    setCompareTab: async (tab) => {
      if (!["compare", "money", "quality", "criteria"].includes(tab)) return;
      store.set({ compareTab: tab });
      if (tab === "criteria") await paintCriteria();
      else if (tab !== "compare") await paintMoney();
    },
    setMoneyTenure: (label, tenure) => {
      store.set({ moneyTenure: { ...store.getState().moneyTenure, [label]: tenure } });
    },
    askLive: () => askLive(),
    applyView: (view) => {
      const targetHome = (view && view.home) || homeLabel;
      const targetMode = (view && view.mode) || "sim";
      if (targetMode !== "sim") {
        location.href = `${location.pathname}?area=${simAreaId}`;
        return;
      }
      if (targetHome !== homeLabel) {
        const d = view && view.day ? view.day - 1 : day;
        const t = view && view.time ? parseTParam(view.time) : Math.floor(minute);
        location.href = simUrl(targetHome, d, t ?? Math.floor(minute), view && view.follow ? view.follow : follow);
        return;
      }
      if (view && view.day) day = Math.min(days - 1, Math.max(0, view.day - 1));
      if (view && view.time) {
        const t = parseTParam(view.time);
        if (t !== null) minute = t;
      }
      if (view && view.follow !== undefined && view.follow !== null) {
        follow = Math.min(household.length, Math.max(0, view.follow));
        snapFollow = follow > 0;
        store.set({ follow });
        applyFollowDim();
      }
      paintClock();
      paintFollow(0.016, true);
    },
  });

  loading.remove();
  document.getElementById("fade").classList.add("clear");
  paintClock();
  paintFollow(0.016, true);
  store.set({ ready: true });
  // Itinerary preload: the followed member's work-area detail + corridor.
  ensureItinerary();
  // The money doc feeds the ticker + QoL hover even with the card shut.
  paintMoney();
  // ?tab=money|quality|criteria opens the compare card on that tab.
  const wantTab = PARAMS.get("tab");
  if (wantTab === "money" || wantTab === "quality" || wantTab === "compare"
      || wantTab === "criteria") {
    store.set({ compareOpen: true, compareTab: wantTab });
    paintCompare();
    paintMoney();
    if (wantTab === "criteria") paintCriteria();
  }

  // --- loop ---
  updateLighting();
  const clock = new THREE.Clock();
  let frames = 0;
  let lastMinuteShown = -1;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.5);
    const t = clock.elapsedTime;
    if (playing) {
      minute += (dt / SIM_TICK_S) * speed;
      if (minute >= 1440) {
        minute -= 1440;
        day++;
        if (day >= days) {
          day = days - 1;
          minute = 1439;
          playing = false;
          store.set({ playing: false });
        }
      }
      const m = Math.floor(minute);
      if (m !== lastMinuteShown) {
        lastMinuteShown = m;
        paintClock();
        paintFollow(dt, true);
      }
    }
    placeAgents(day, minute);
    streetMeshes.updateMovers(t);
    updateLighting();
    paintFollow(dt, false);
    paintHighlightFrame();
    const jfTrain = journeyFrame();
    if (jfTrain.ride && (jfTrain.phase === "rising" || jfTrain.phase === "cruise"
        || jfTrain.phase === "descending" || jfTrain.phase === "street")) {
      journeyLayer.setTrain(jfTrain.ride, minute - Math.floor(minute) + jfTrain.elapsed);
    }
    controls.update();
    renderCtl.renderFrame({ bloom: simBloom }, dt);
    frames++;
    if (frames === 30) {
      console.log(`[sim] area=${run.meta.area} agents=${run.meta.agents} ` +
        `day=${day + 1} t=${Math.floor(minute)}`);
    }
  });

  const refitSim = () => refitToWrap(camera, renderCtl);
  addEventListener("resize", refitSim);
  new ResizeObserver(refitSim).observe(document.getElementById("scene-wrap"));
}

if (PARAMS.get("mode") === "sim") bootSim();
else bootTour();
