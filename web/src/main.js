// Miniature 3D scene app: loads one area, builds the merged scene, plays
// the residential tour. All data-math lives in the pure src/* modules
// (unit-tested); this file only wires three.js, the DOM, and playback.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import "./style.css";
import { bboxToXY, lonLatToWorld, lonLatToXY } from "./frame.js";
import { buildBuildings } from "./buildings.js";
import { buildGround } from "./ground.js";
import { ARCH_FOV_DEG, GLIDE_FRAME_M, STOP_FRAME_M, TOUR_AZIMUTH, TOUR_FOV_DEG, archLensPose, distanceForWidth, footprintsOf, hostTowerIds, occludingIds, pickStopAzimuth, tourOffset } from "./camera.js";
import { loadArea, originOf } from "./load.js";
import { compare as compareRuns } from "./engine/simulate.js";
import { DECISION_KIND_KO, SIM_TICK_S, SPEEDS, agentLabelOf, chosenLabel, dayDecisions, decisionBadge, followCaption, formatClock, homeOccupancy, indexRun, latestDecision, optionsLine, parseTParam, sampleAgent, shouldAutoplay, simInstant } from "./sim.js";
import { DWELL_S, legGlideDuration, pathWaypoints, seekState, selectTourStops, tourSchedule } from "./tour.js";
import { TREE_CANOPY_R, TREE_CANOPY_Y, TREE_TRUNK_H, TREE_TRUNK_R_BOTTOM, TREE_TRUNK_R_TOP, placeTrees } from "./trees.js";
import { assignWalkers, sampleWalker } from "./walkers.js";
// Stage 5b realistic rendering: the main.js seam is createRenderer /
// renderFrame plus the rig/material builders (5a merges around these).
import { litFractionFor } from "./render/facades.js";
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
const FOG_DAY = 0xcfd8de;

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
  const camera = new THREE.PerspectiveCamera(TOUR_FOV_DEG, innerWidth / innerHeight, 1, span * 8);
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

  renderCtl.attach(scene, camera);
  return {
    origin, cx, cy, span, renderer, renderCtl, rig, scene, camera, controls,
    base, groundMesh, markMesh, waterMesh, wallMeshes, podiumMesh, roofMesh,
    dimMeshes, litMeshes, fadeMeshes,
    trees, trunkMesh, canopyMeshes, streetMeshes, dummy,
  };
}

// Occluder fade (tour mode): per-vertex alpha on the merged building
// meshes so residual occluders — and the tall host tower of an embedded
// POI stop — dim instead of hiding the stop. Patched once per mesh;
// per-stop updates only rewrite the afade attribute.
const OCCLUDE_FADE = 0.22;

function makeFadeable(mesh) {
  const count = mesh.geometry.attributes.position.count;
  mesh.geometry.setAttribute("afade", new THREE.BufferAttribute(new Float32Array(count).fill(1), 1));
  mesh.material.transparent = true;
  // Chain-safe: facade materials already carry the night-emissive patch.
  const prevCompile = mesh.material.onBeforeCompile;
  const prevKey = mesh.material.customProgramCacheKey;
  mesh.material.onBeforeCompile = (shader, renderer) => {
    if (prevCompile) prevCompile(shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float afade;\nvarying float vFade;")
      .replace("#include <fog_vertex>", "#include <fog_vertex>\nvFade = afade;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vFade;")
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.a *= vFade;");
  };
  mesh.material.customProgramCacheKey = () =>
    `${prevKey ? prevKey() : "std"}:occluder-fade`;
  mesh.material.needsUpdate = true;
}

function applyStopFade(fadeMeshes, ids) {
  for (const { mesh, ranges } of fadeMeshes) {
    const attr = mesh.geometry.attributes.afade;
    attr.array.fill(1);
    for (const id of ids) {
      const r = ranges.get(id);
      if (r) attr.array.fill(OCCLUDE_FADE, r.start, r.start + r.count);
    }
    attr.needsUpdate = true;
  }
}

async function bootTour() {
  const area = await fetchArea(areaId);
  const { origin, renderer, renderCtl, rig, scene, camera, controls,
    dimMeshes, fadeMeshes, streetMeshes, trees, dummy } = buildWorld(area);
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

  buildUI(area, plan);
  buildModeSwitch("tour");
  document.getElementById("loading").remove();
  document.getElementById("fade").classList.add("clear");

  // --- tour sun/sky (?time=HH:MM override; static through the tour) ---
  const { date: tourDate, minute: tourMinute } = tourSun();
  let tourBloom = 0;
  function updateTourSky() {
    const p = rig.update({ lat: origin.lat, lon: origin.lon, date: tourDate,
      minute: tourMinute, target: { x: controls.target.x, z: controls.target.z },
      shadowSpan: 240, envKey: "tour" });
    tourBloom = p.bloom;
    setGlobalNight(p.emissive);
    streetMeshes.setLampGlow(p.emissive);
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
  const playBtn = document.getElementById("play");
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
      playBtn.textContent = "재생";
    }
  } else if (tParam !== null && plan.stops.length > 0) {
    const s = Number.parseFloat(tParam);
    if (Number.isFinite(s) && s >= 0) player.seekTime(s);
    if (!shouldAutoplay(params) && player.playing) {
      player.toggle();
      playBtn.textContent = "재생";
    }
  }
  playBtn.addEventListener("click", () => {
    player.toggle();
    playBtn.textContent = player.playing ? "일시정지" : "재생";
  });
  document.getElementById("resOnly").addEventListener("change", (e) => {
    for (const m of dimMeshes) m.material.opacity = e.target.checked ? 0.3 : 1.0;
  });

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

  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderCtl.setSize(innerWidth, innerHeight);
    if (archLens) applyArchLens();
  });
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
  const caption = document.getElementById("caption");
  const capName = document.getElementById("capName");
  const capMeta = document.getElementById("capMeta");
  const capWalk = document.getElementById("capWalk");
  const dots = document.getElementById("dots");
  const stops = plan.stops;
  dots.innerHTML = stops.map(() => "<span></span>").join("");
  const dotEls = [...dots.children];

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
    caption.hidden = false;
    capName.textContent = s.name;
    capMeta.textContent = `${s.label} · ${s.category} · ${Math.abs(s.lat).toFixed(4)}° N ${Math.abs(s.lon).toFixed(4)}° E`;
    capWalk.textContent = i === 0 ? "출발" : `이전 정류장에서 도보 ${s.legMinutes.toFixed(1)}분 (${Math.round(s.legLengthM)} m)`;
    dotEls.forEach((d, j) => d.classList.toggle("on", j === i));
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
        document.getElementById("play").textContent = "재생";
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
          caption.hidden = true;
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
      caption.hidden = true;
      if (onLeg) onLeg(-1);
      return;
    }
    state.leg = st.leg;
    state.legT = st.legT;
    state.dwell = st.dwellLeft;
    state.outro = 0;
    state.done = false;
    if (st.phase === "dwell") showStop(st.leg);
    else if (st.leg === 0) caption.hidden = true;
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
      if (!state.playing) caption.hidden = false;
    },
    update,
    seekStop,
    seekTime,
    schedule,
  };
}

function buildUI(area, plan) {
  const nav = document.getElementById("areas");
  for (const a of AREAS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = a.label;
    if (a.id === areaId) btn.classList.add("active");
    btn.addEventListener("click", () => {
      location.href = `${location.pathname}?area=${a.id}`;
    });
    nav.appendChild(btn);
  }
  const resCounts = {};
  const hCounts = {};
  for (const b of area.buildings) {
    const r = b.residential || "none";
    resCounts[r] = (resCounts[r] || 0) + 1;
    const h = b.height_source || "inferred";
    hCounts[h] = (hCounts[h] || 0) + 1;
  }
  const resEl = document.getElementById("legendRes");
  for (const [key, label] of Object.entries(RES_LABELS)) {
    const row = document.createElement("div");
    row.innerHTML = `<span class="swatch" style="background:${RES_SWATCH[key]}"></span>${label} ${(resCounts[key] || 0).toLocaleString()}`;
    resEl.appendChild(row);
  }
  const namedCx = (area.complexes || []).filter((c) => c.name).length;
  const cxRow = document.createElement("div");
  cxRow.innerHTML = `<span class="swatch" style="background:#b25a33"></span>단지 ${(area.complexes || []).length.toLocaleString()} (이름 ${namedCx.toLocaleString()})`;
  resEl.appendChild(cxRow);
  const hEl = document.getElementById("legendHeight");
  for (const [key, label] of Object.entries(HEIGHT_LABELS)) {
    if (!hCounts[key]) continue;
    const row = document.createElement("div");
    row.innerHTML = `<span class="swatch" style="background:${HEIGHT_SWATCH[key]}"></span>${label} ${hCounts[key].toLocaleString()}`;
    hEl.appendChild(row);
  }
  if (plan.stops.length === 0) {
    const play = document.getElementById("play");
    play.disabled = true;
    play.textContent = "재생";
  }
  document.title = `주거 시뮬레이터 — ${area.label || areaId}`;
}

function buildModeSwitch(mode) {
  const nav = document.getElementById("modeBtns");
  const mk = (label, active, href) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    if (active) btn.classList.add("active");
    btn.addEventListener("click", () => {
      location.href = href;
    });
    nav.appendChild(btn);
  };
  if (mode === "sim") {
    mk("투어", false, `${location.pathname}?area=${simAreaId}`);
    mk("생활 시뮬레이션", true, location.href);
  } else {
    mk("투어", true, location.href);
    mk("생활 시뮬레이션", false, `${location.pathname}?mode=sim&home=A`);
  }
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
  document.getElementById("play").style.display = "none";
  document.getElementById("simbar").hidden = false;
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
    dimMeshes, litMeshes, streetMeshes } = buildWorld(area);

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
  const clockEl = document.getElementById("simClock");
  const simPlayBtn = document.getElementById("simPlay");
  simPlayBtn.textContent = playing ? "일시정지" : "재생";
  const caption = document.getElementById("caption");
  const capName = document.getElementById("capName");
  const capMeta = document.getElementById("capMeta");
  const capWalk = document.getElementById("capWalk");
  document.getElementById("dots").style.display = "none";
  const judgeCap = document.getElementById("judgeCap");
  const judgeBadge = document.getElementById("judgeBadge");
  const judgeText = document.getElementById("judgeText");
  const judgeAsk = document.getElementById("judgeAsk");
  const judgeLive = document.getElementById("judgeLive");
  const judgeLog = document.getElementById("judgeLog");
  const judgeLogBody = document.getElementById("judgeLogBody");
  const hhmmOf = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

  function paintClock() {
    clockEl.textContent = formatClock(run.meta.start_date, day, Math.floor(minute), days);
    document.getElementById("dayJump").value = String(day + 1);
    paintJudgeLog();
  }

  // --- sun/sky follow sim time; facades glow from run occupancy ---
  // The rig owns sun/hemi/Sky/environment; per-building lit fractions
  // (at-home residents / agents housed there — the same stage-3 data the
  // old glow quads used) fill the aLit vertex attributes at 30-minute
  // granularity. Daytime emissive is off (uNight = 0).
  let simBloom = 0;
  let lastLightKey = "";
  let lastLitKey = "";

  function updateLighting() {
    const m = Math.floor(minute);
    const instant = simInstant(run.meta.start_date, day, m);
    const p = rig.update({ lat: origin.lat, lon: origin.lon, date: instant,
      minute: m, target: { x: controls.target.x, z: controls.target.z },
      shadowSpan: 240, envKey: `${day}:${Math.floor(m / 30)}` });
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
    for (const { mesh, ranges } of litMeshes) {
      const attr = mesh.geometry.attributes.aLit;
      for (const [bid, r] of ranges) {
        attr.array.fill(litFractionFor(occ.get(bid)), r.start, r.start + r.count);
      }
      attr.needsUpdate = true;
    }
  }

  // --- follow camera (2b miniature framing) ---
  const stopDist = distanceForWidth(STOP_FRAME_M, TOUR_FOV_DEG, camera.aspect);
  let snapFollow = follow > 0;
  const followBtns = document.getElementById("followBtns");

  function followedSample() {
    if (follow < 1 || follow > household.length) return null;
    const agent = household[follow - 1];
    const s = sampleAgent(agent.key, indexed, day, minute, nodeLonLat,
      homeLonLat.get(agent.key), edgeLen);
    return { agent, s };
  }

  function paintFollow(dt, forceCaption) {
    if (!follow) {
      caption.hidden = true;
      controls.enabled = true;
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
      caption.hidden = false;
      capName.textContent = `${hit.agent.label} 따라가기`;
      capMeta.textContent = "시뮬레이션 주민 · 생활 시뮬레이션";
      capWalk.textContent = followCaption(hit.s, hit.agent.label);
      paintJudgeCaption(hit.agent.key);
    }
  }

  // Branch caption: the followed member's latest decision — options with
  // graph minutes, the chosen one, the Korean reason, and who decided.
  function paintJudgeCaption(agentKey) {
    const d = latestDecision(run, agentKey, day, Math.floor(minute));
    judgeLive.hidden = true;
    if (!d) {
      judgeCap.hidden = true;
      return;
    }
    const v = judgedView(d);
    judgeCap.hidden = false;
    const badge = decisionBadge(v);
    judgeBadge.textContent = badge.text;
    judgeBadge.className = `badge ${badge.cls}`;
    judgeText.textContent =
      `${hhmmOf(v.minute)} ${DECISION_KIND_KO[v.kind] || v.kind} · ${optionsLine(v)} → ✓ ${chosenLabel(v)}` +
      (v.reason_ko ? ` · “${v.reason_ko}”` : "");
    judgeAsk.hidden = !import.meta.env.DEV;
    judgeAsk.disabled = false;
    judgeAsk.textContent = "Muse에게 묻기";
    judgeAsk.onclick = () => askLive(v);
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
  async function askLive(v) {
    judgeAsk.disabled = true;
    judgeAsk.textContent = "묻는 중…";
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
      judgeBadge.textContent = badge.text;
      judgeBadge.className = `badge ${badge.cls}`;
      judgeText.textContent =
        `${hhmmOf(v.minute)} ${DECISION_KIND_KO[v.kind] || v.kind} · ${optionsLine(v)} → ✓ ${chosenLabel(live)}` +
        (live.reason_ko ? ` · “${live.reason_ko}”` : "") +
        ` (${live.provider === "baseten" ? "Muse Spark Open" : "Muse Spark 1.3"})`;
      judgeLive.hidden = false;
    } catch (err) {
      judgeText.textContent += ` (라이브 판단 불가: ${err.message})`;
    }
    judgeAsk.textContent = "Muse에게 묻기";
    judgeAsk.disabled = false;
  }

  // Today's household decisions, latest first.
  function paintJudgeLog() {
    const rows = dayDecisions(run, day).slice(0, 12);
    if (rows.length === 0) {
      judgeLog.hidden = true;
      return;
    }
    judgeLog.hidden = false;
    judgeLogBody.innerHTML = "";
    for (const d of rows) {
      const v = judgedView(d);
      const badge = decisionBadge(v);
      const row = document.createElement("div");
      row.className = "jrow";
      const pill = document.createElement("span");
      pill.className = `badge ${badge.cls}`;
      pill.textContent = badge.text;
      row.append(`${hhmmOf(v.minute)} ${agentLabelOf(run, v.agent)} · ` +
        `${DECISION_KIND_KO[v.kind] || v.kind} → ${chosenLabel(v)} `);
      row.appendChild(pill);
      if (v.reason_ko) {
        const why = document.createElement("div");
        why.className = "jreason";
        why.textContent = `“${v.reason_ko}”`;
        row.appendChild(why);
      }
      judgeLogBody.appendChild(row);
    }
  }

  function paintFollowBtns() {
    followBtns.innerHTML = "";
    const mk = (label, active, value) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      if (active) btn.classList.add("active");
      btn.addEventListener("click", () => {
        follow = value;
        snapFollow = value > 0;
        paintFollowBtns();
        paintFollow(0.016, true);
      });
      followBtns.appendChild(btn);
    };
    mk("자유 시점", follow === 0, 0);
    household.forEach((a, i) => mk(a.label, follow === i + 1, i + 1));
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

  const nav = document.getElementById("areas");
  for (const h of homes) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = h.label;
    btn.title = `${h.complex_name || ""} (${h.area || ""})`;
    if (h.label === homeLabel) btn.classList.add("active");
    btn.addEventListener("click", () => {
      if (h.label !== homeLabel) location.href = simUrl(h.label, day, Math.floor(minute), follow);
    });
    nav.appendChild(btn);
  }
  document.querySelector("#legend .legend-title").textContent =
    `범례 — ${homeLabel} · ${run.meta.complex}`;
  const note = document.createElement("div");
  note.className = "legend-note";
  note.textContent = `시뮬레이션 주민 ${run.meta.agents}명 (가구 ${run.meta.household}명 + 이웃 ${run.meta.background}명) · 엔진 재생`;
  document.getElementById("legend").appendChild(note);
  {
    const resCounts = {};
    const hCounts = {};
    for (const b of area.buildings) {
      const r = b.residential || "none";
      resCounts[r] = (resCounts[r] || 0) + 1;
      const h = b.height_source || "inferred";
      hCounts[h] = (hCounts[h] || 0) + 1;
    }
    const resEl = document.getElementById("legendRes");
    for (const [key, label] of Object.entries(RES_LABELS)) {
      const row = document.createElement("div");
      row.innerHTML = `<span class="swatch" style="background:${RES_SWATCH[key]}"></span>${label} ${(resCounts[key] || 0).toLocaleString()}`;
      resEl.appendChild(row);
    }
  }
  document.title = `주거 시뮬레이터 — ${homeLabel} · ${run.meta.complex}`;
  buildModeSwitch("sim");

  simPlayBtn.addEventListener("click", () => {
    playing = !playing;
    simPlayBtn.textContent = playing ? "일시정지" : "재생";
  });
  const speedBox = document.getElementById("simSpeed");
  for (const s of SPEEDS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = `${s}×`;
    if (s === speed) btn.classList.add("active");
    btn.addEventListener("click", () => {
      speed = s;
      [...speedBox.children].forEach((el, i) => el.classList.toggle("active", SPEEDS[i] === s));
    });
    speedBox.appendChild(btn);
  }
  document.getElementById("dayPrev").addEventListener("click", () => {
    day = Math.max(0, day - 1);
    paintClock();
  });
  document.getElementById("dayNext").addEventListener("click", () => {
    day = Math.min(days - 1, day + 1);
    paintClock();
  });
  document.getElementById("dayJump").max = String(days);
  document.getElementById("dayGo").addEventListener("click", () => {
    const v = Number.parseInt(document.getElementById("dayJump").value, 10);
    if (Number.isInteger(v)) day = Math.min(days - 1, Math.max(0, v - 1));
    paintClock();
  });
  document.getElementById("resOnly").addEventListener("change", (e) => {
    for (const m of dimMeshes) m.material.opacity = e.target.checked ? 0.3 : 1.0;
  });
  paintFollowBtns();

  const compareBox = document.getElementById("compare");
  const compareBody = document.getElementById("compareBody");
  document.getElementById("compareBtn").addEventListener("click", async () => {
    compareBox.hidden = !compareBox.hidden;
    if (!compareBox.hidden) await paintCompare();
  });
  document.getElementById("compareClose").addEventListener("click", () => {
    compareBox.hidden = true;
  });

  const UNIT_KO = { minutes: "분", metres: "m", count: "회" };
  async function paintCompare() {
    compareBody.innerHTML = "<div>불러오는 중…</div>";
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
      compareBody.innerHTML = `<div>비교 데이터를 불러오지 못했습니다.<br><code>node web/scripts/simulate.mjs --scenario scenarios/${scenarioName}.json --home both</code> 실행 후 새로고침하세요.</div>`;
      return;
    }
    const fmt = (v) => (typeof v === "number" ? v.toLocaleString("ko-KR") : v);
    const rows = cmp.metrics.map((m) => {
      const src = m.source === "graph"
        ? '<span class="src">그래프</span>'
        : '<span class="src assumption">가정</span>';
      return `<tr><td>${m.label}${src}</td><td>${fmt(m.a)}</td><td>${fmt(m.b)}</td>` +
        `<td>${m.delta_b_minus_a > 0 ? "+" : ""}${fmt(m.delta_b_minus_a)} ${UNIT_KO[m.unit] || ""}</td></tr>`;
    }).join("");
    compareBody.innerHTML =
      `<table><tr><th>30일 지표 (${cmp.days}일)</th><th>${cmp.home_a.label} · ${cmp.home_a.complex}</th>` +
      `<th>${cmp.home_b.label} · ${cmp.home_b.complex}</th><th>Δ (B−A)</th></tr>${rows}</table>`;
    if (cmp.judgment && (cmp.judgment.a || cmp.judgment.b)) {
      const fmtJ = (side) => {
        const s = (cmp.judgment && cmp.judgment[side]) || {};
        const other = (s.rule || 0) + (s.replay || 0) + (s.hook || 0);
        return `모델 ${s.model || 0} · 폴백 ${s.rule_fallback || 0} · 규칙 ${other}`;
      };
      const div = document.createElement("div");
      div.className = "judge-counts";
      div.textContent = `판단 주체 — A: ${fmtJ("a")} / B: ${fmtJ("b")}`;
      compareBody.appendChild(div);
    }
  }

  loading.remove();
  document.getElementById("fade").classList.add("clear");
  paintClock();
  paintFollow(0.016, true);

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
          simPlayBtn.textContent = "재생";
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
    controls.update();
    renderCtl.renderFrame({ bloom: simBloom }, dt);
    frames++;
    if (frames === 30) {
      console.log(`[sim] area=${run.meta.area} agents=${run.meta.agents} ` +
        `day=${day + 1} t=${Math.floor(minute)}`);
    }
  });

  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderCtl.setSize(innerWidth, innerHeight);
  });
}

if (PARAMS.get("mode") === "sim") bootSim();
else bootTour();
