// Miniature 3D scene app: loads one area, builds the merged scene, plays
// the residential tour. All data-math lives in the pure src/* modules
// (unit-tested); this file only wires three.js, the DOM, and playback.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import "./style.css";
import { bboxToXY, lonLatToWorld, lonLatToXY } from "./frame.js";
import { buildBuildings } from "./buildings.js";
import { buildGround } from "./ground.js";
import { ARCH_FOV_DEG, GLIDE_FRAME_M, STOP_FRAME_M, TOUR_AZIMUTH, archLensPose, cameraStyle, distanceForWidth, footprintsOf, frameWidthFor, hostTowerIds, journeyCruisePose, occludingIds, pickStopAzimuth, resolveStyle, tourFrameWidths, tourOffset, zoomClampDistances } from "./camera.js";
import { loadArea, originOf } from "./load.js";
import { compare as compareRuns } from "./engine/simulate.js";
import { CRITERIA_GROUPS, criterionDefault, criterionValuesLine, resolveCriteria } from "./engine/criteria.js";
import { parseScenario } from "./engine/scenario.js";
import { highlightFor } from "./highlight.js";
import { placeTag, simViewOffset, tagBoxBlocked } from "./stage-tags.js";
import { commuteSegments, corridorFor, journeyBanner, journeyCameraState, trainPosition } from "./journey.js";
import { createJourneyLayer } from "./journey-scene.js";
import { dayKindFor } from "./engine/journey.js";
import { householdNow, nowCardFor, simMetaFor, tickerFor } from "./nowcard.js";
import { destInLoadedAreas, pickStationArea } from "./station-areas.js";
import { DECISION_KIND_KO, SIM_TICK_S, SPEEDS, agentLabelOf, chosenLabel, dayDecisions, decisionBadge, formatClock, homeOccupancy, indexRun, latestDecision, optionsLine, parseTParam, sampleAgent, shouldAutoplay, simInstant, tripFractions } from "./sim.js";
import { DWELL_S, legGlideDuration, pathWaypoints, seekState, selectTourStops, tourSchedule } from "./tour.js";
import { TREE_CANOPY_R, TREE_CANOPY_Y, TREE_TRUNK_H, TREE_TRUNK_R_BOTTOM, TREE_TRUNK_R_TOP, placeTrees } from "./trees.js";

import { areasOrFallback, FALLBACK_AREAS } from "./areas-index.js";
import { store } from "./ui/store.js";
import { mountUI } from "./ui/main.jsx";
import { VALID_COMPARE_TABS, resolveTabId } from "./ui/compare-tabs.js";
// 12b: landing/chat routing, timeline builders + activity colours,
// custom-run store (?custom=<id>).
import { routeForSearch, chatUrl, chatReopenUrl } from "./chat/urls.js";
import { ACTIVITIES, daySegments, monthStrip, outingStepsFor } from "./timeline.js";
import { customRunId, loadCustomRun } from "./chat/idb.js";
// Stage 5b realistic rendering seam: createRenderer / renderFrame plus
// the rig/material builders (night emissive via aLit, not glow quads).
import { aviationBlink, eveningHomeFraction, facadeTintFor, globalHomeFraction, litFractionWithFallback, needsAviationLight } from "./render/facades.js";
import { hashString, hashUnit } from "./palette.js";
import { PAINTED_NIGHT_GROUND, PAINTED_WATER, capLitFraction, lerpHex, nightTint, paintedFogRange, regionalFogRange, resolveLook, streetFogRange } from "./render/look.js";
import { applyStopFade, makeFadeable } from "./render/fade.js";
import { createRenderer } from "./render/renderer.js";
import { createSkyRig } from "./render/rig.js";
import { placeStreetlife } from "./render/streetlife.js";
import { buildStreetMeshes } from "./render/streetmeshes.js";
import { agentMaterial, facadeMaterial, groundMaterial, markingMaterial, roofMaterial, setGlobalNight, setNightGain, setWaterTime, trunkMaterial, vegetationMaterial, waterMaterial } from "./render/textures.js";
// Stage 14: terrain + OSM road/forest/tree scene layers.
import { flatHeightAt, makeHeightAt, seatOnTerrain } from "./scene/height.js";
import { loadScene, toTypedMesh } from "./scene/load.js";
import { MASK_SIZE, buildTerrainMesh, paintLandMask } from "./scene/terrain.js";
import { MARKINGS_HIDE_M, buildRoadMarkings, buildRoadMeshes, buildWaterRibbons } from "./scene/roads.js";
import { fillStreetTrees, setSway, treeColour, treeGeometry, treeMaterial, treeRotation, treeShadowMaterial, treeTint } from "./scene/trees3d.js";
// Stage 14b: procedural motion — pure state (motion/) evaluated at sim time.
import { areaSegments, buildFleet, sceneSegments, vehicleCapFor, MAX_VEHICLES_HIGH } from "./motion/vehicles.js";
import { MAX_PEDS_HIGH, buildCrowd, pedCapFor, stationCongestionScale } from "./motion/pedestrians.js";
import { buildCrowdMeshes } from "./render/crowd.js";
import { buildTrainTable } from "./motion/trains.js";
import { buildTrainPulse } from "./render/trainpulse.js";
import { INTERSTATION_CSV_URL, parseInterstationCsv } from "./transit/schedule.js";
import { swayDayFactor } from "./motion/nature.js";

// 12a: the area list comes from the built data/build/areas-index.json
// (id, label, center, bbox, station, size) — never a hard-coded array.
// The scene still loads only the selected box (fetchArea below).
// Loaded at boot (no top-level await: the build target forbids it).
let AREAS = FALLBACK_AREAS;
async function loadAreasList() {
  const loaded = await areasOrFallback((url) =>
    fetch(url).then((r) => {
      if (!r.ok) throw new Error(`areas-index ${r.status}`);
      return r.json();
    }));
  AREAS = loaded.areas;
  return loaded;
}
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
// Painted leaf colours (14e) read the sim date: the tour's fixed day is
// 2026-10-15 (inside the autumn window); sim runs use scenario start.
const TOUR_DATE_ISO = "2026-10-15";
function simDateISO(startDate, day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate || "");
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    + (Number(day) || 0) * 86400000);
  return d.toISOString().slice(0, 10);
}
// Building footprint exterior rings in scene coords ([x, z] plan) for
// the rule-filled street trees (skip spots on/near footprints).
function footprintRings(buildings, origin) {
  const rings = [];
  for (const b of buildings || []) {
    const g = b.geometry;
    if (!g) continue;
    const polys = g.type === "Polygon" ? [g.coordinates]
      : g.type === "MultiPolygon" ? g.coordinates : [];
    for (const poly of polys) {
      const ring = (poly[0] || []).map(([lon, lat]) => {
        const [x, y] = lonLatToXY(lon, lat, origin);
        return [x, -y];
      });
      if (ring.length >= 3) rings.push(ring);
    }
  }
  return rings;
}
const BASE_GROUND = 0x969488; // unmapped fringe under the ground layer (stage 11: darker)
const FOG_DAY = 0xd9dee2;
// 12b: map-route colours shared with the day strip (timeline.js).
const WALK_ROUTE_CSS = ACTIVITIES.walk.color;
const SUBWAY_ROUTE_CSS = ACTIVITIES.subway.color;

const PARAMS = new URLSearchParams(location.search);
// Stage 14e: ?style=painted (default, near-isometric) vs ?style=photo
// (today's look, unchanged pixels). CAM carries fov/pitch/azimuth/rotate.
const STYLE = resolveStyle(PARAMS);
const CAM = cameraStyle(STYLE);
// Stage-11 look table (?look=key:value,… retunes without a rebuild).
const LOOK = resolveLook(PARAMS, STYLE);
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

// Indexed scene geometry (terrain, road/water ribbons): normals follow
// the terrain via computeVertexNormals. Accepts plain or typed arrays.
function toIndexedGeometry(data) {
  const t = toTypedMesh(data);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(t.positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(t.colors, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(t.uvs, 2));
  geo.setIndex(new THREE.BufferAttribute(t.indices, 1));
  geo.computeVertexNormals();
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
        const v = capLitFraction(litFractionWithFallback(occ ? occ.get(bid) : null, {
          households: householdsById.get(bid) || 0,
          globalHomeFrac: globalFrac,
          hash01: hashUnit(hashString(bid), 3),
        }), LOOK);
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
// scene14 is the box's scene.json (or null → flat fallback).
// opts.treeDateISO (YYYY-MM-DD) drives the painted autumn leaf window.
function buildWorld(area, scene14, opts = {}) {
  const treeDateISO = opts.treeDateISO ?? null;
  const origin = originOf(area);
  const box = bboxToXY(area.bbox, origin);
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const span = Math.max(box.maxX - box.minX, box.maxY - box.minY);
  // One height function for terrain, roads, buildings, trees, walkers,
  // route lines and the rig (flat 0 without scene.json).
  const heightAt = scene14 ? makeHeightAt(scene14.terrain) : flatHeightAt();
  const ground0 = heightAt(cx, -cy);
  const demMin = scene14 ? scene14.meta.dem.min_m : 0;
  const demMax = scene14 ? scene14.meta.dem.max_m : 0;

  // --- renderer / scene / camera (5b seam: createRenderer/renderFrame) ---
  const canvas = document.getElementById("scene");
  const renderCtl = createRenderer({ canvas, params: PARAMS });
  const renderer = renderCtl.renderer;
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const scene = new THREE.Scene();
  setNightGain(LOOK.nightGain);
  const wrap0 = document.getElementById("scene-wrap");
  const aspect0 = wrap0 && wrap0.clientHeight > 0
    ? wrap0.clientWidth / wrap0.clientHeight : innerWidth / innerHeight;
  const camera = new THREE.PerspectiveCamera(CAM.fovDeg, aspect0, 1, span * 8);
  const homeDist = distanceForWidth(span, CAM.fovDeg, camera.aspect);
  // The narrow painted FOV needs a much longer distance; the far plane
  // must cover at least 2× that distance.
  camera.far = Math.max(span * 8, homeDist * 2);
  camera.updateProjectionMatrix();
  // 14f: painted fog measures from the camera distance (the narrow FOV
  // parks the camera ~3.6× the framed width away); photo keeps multiples.
  const streetFog0 = STYLE === "painted"
    ? paintedFogRange(homeDist, span)
    : streetFogRange(span, LOOK);
  scene.fog = new THREE.Fog(FOG_DAY, streetFog0.near, streetFog0.far);
  const [hox, hoy, hoz] = tourOffset(homeDist, CAM.pitchDeg, CAM.azimuth);
  camera.position.set(cx + hox, hoy + ground0, -cy + hoz);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(cx, ground0, -cy);
  controls.maxPolarAngle = Math.PI * 0.49;
  // Painted: fixed azimuth (no rotate); pan and zoom stay, zoom clamped
  // to 150 m…span framed width. Photo keeps today's free controls.
  controls.enableRotate = CAM.rotate;
  if (STYLE === "painted") {
    const clamp = zoomClampDistances(span, CAM.fovDeg, camera.aspect);
    controls.minDistance = clamp.min;
    controls.maxDistance = clamp.max;
    camera.userData.clampSpan = span;
  }
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
  // Painted: the fringe matches the warm ground so the box edge never
  // shows a grey ring; photo keeps today's darker fringe.
  const baseDayColor = STYLE === "painted" ? LOOK.terrainBase : BASE_GROUND;
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(span * 1.5, span * 1.5),
    new THREE.MeshStandardMaterial({ color: baseDayColor, roughness: 1, metalness: 0 })
  );
  base.rotation.x = -Math.PI / 2;
  base.position.set(cx, scene14 ? demMin - 1 : -0.05, -cy);
  base.receiveShadow = true;
  scene.add(base);
  // Stage-14 terrain: full-res grid + canvas land mask (one draw call).
  let terrainMesh = null;
  if (scene14) {
    const t = buildTerrainMesh(scene14.terrain, LOOK);
    const canvas = document.createElement("canvas");
    canvas.width = MASK_SIZE;
    canvas.height = MASK_SIZE;
    paintLandMask(canvas.getContext("2d"), scene14.lands, scene14.terrain, LOOK);
    const mask = new THREE.CanvasTexture(canvas);
    mask.colorSpace = THREE.SRGBColorSpace;
    mask.anisotropy = maxAniso;
    terrainMesh = new THREE.Mesh(toIndexedGeometry(t),
      new THREE.MeshStandardMaterial({ map: mask, vertexColors: true,
        roughness: 1, metalness: 0 }));
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);
  }
  const buildingsById = new Map(area.buildings.map((b) => [b.id, b]));
  const groundData = buildGround(area.roads, area.landuse, area.complexes, buildingsById, origin,
    scene14 ? { heightAt, sceneRoads: true, specWidths: true } : {});
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
    if (STYLE === "painted") waterMesh.material.color.setHex(PAINTED_WATER);
    scene.add(waterMesh);
  }
  // Stage-14 road ribbons + waterway ribbons (≤ 4 + 1 draw calls).
  const sceneRoadMeshes = [];
  let sceneWaterMesh = null;
  if (scene14) {
    const { meshes } = buildRoadMeshes(scene14.roads, heightAt, LOOK);
    const offsets = { road: 1, rail: 1, foot: 2, cycle: 2 };
    for (const [cls, data] of Object.entries(meshes)) {
      if (data.triangles === 0) continue;
      const mesh = new THREE.Mesh(toIndexedGeometry(data),
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95,
          metalness: 0, polygonOffset: true,
          polygonOffsetFactor: -offsets[cls], polygonOffsetUnits: -offsets[cls] }));
      mesh.receiveShadow = true;
      mesh.userData.roadCls = cls;
      scene.add(mesh);
      sceneRoadMeshes.push(mesh);
    }
    const w = buildWaterRibbons(scene14.water, heightAt, LOOK);
    if (w.triangles > 0) {
      sceneWaterMesh = new THREE.Mesh(toIndexedGeometry(w), waterMaterial());
      if (STYLE === "painted") sceneWaterMesh.material.color.setHex(PAINTED_WATER);
      scene.add(sceneWaterMesh);
    }
  }
  // Painted road paint (14e, one merged mesh): dashes + yellow centre +
  // zebras from the ribbon stations. The ground lane paint would double
  // it, so it sits out in painted scene mode (flat mode keeps it).
  let sceneMarkingsMesh = null;
  if (scene14 && STYLE === "painted") {
    if (markMesh) markMesh.visible = false;
    const mk = buildRoadMarkings(scene14.roads, heightAt);
    if (mk.mesh.triangles > 0) {
      const mat = markingMaterial();
      mat.polygonOffset = true; // paint wins over ribbons at any range
      mat.polygonOffsetFactor = -4;
      mat.polygonOffsetUnits = -4;
      sceneMarkingsMesh = new THREE.Mesh(toIndexedGeometry(mk.mesh), mat);
      sceneMarkingsMesh.receiveShadow = true;
      scene.add(sceneMarkingsMesh);
    }
  }

  // --- buildings: one PBR wall mesh per facade class + podium + roofs ---
  const built = buildBuildings(area.buildings, area.complexes, origin,
    scene14 ? { baseAt: (rings) => seatOnTerrain(heightAt, rings) } : {});
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
    // Painted: warm concrete walls (photo keeps white = today's pixels).
    mesh.material.color.setRGB(...facadeTintFor(cls, STYLE));
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
    podiumMesh.material.color.setRGB(...facadeTintFor("podium", STYLE));
    addLitAttr(podiumMesh);
    podiumMesh.castShadow = true;
    podiumMesh.receiveShadow = true;
    scene.add(podiumMesh);
    trackRanges(podiumMesh, built.detail.podium);
    litMeshes.push({ mesh: podiumMesh,
      ranges: new Map(built.detail.podium.ranges.map((r) => [r.id, r])) });
  }
  const roofMesh = new THREE.Mesh(toGeometry(built.detail.roofs), roofMaterial({ aniso: maxAniso }));
  roofMesh.material.color.setRGB(...facadeTintFor("roof", STYLE));
  roofMesh.castShadow = true;
  roofMesh.receiveShadow = true;
  scene.add(roofMesh);
  trackRanges(roofMesh, built.detail.roofs);
  // "주거만 강조" dims the non-residential walls + podium.
  const dimMeshes = [wallMeshes.none, podiumMesh].filter(Boolean);

  // --- trees: OSM forest/park placements (scene) or decorative (flat) ---
  const treeMeshes = [];
  let trees = [];
  let fillTrees = 0;
  const tintColor = new THREE.Color();
  if (scene14) {
    trees = scene14.trees;
    // Painted: rule-fill street trees along empty roads (가정값, see the
    // legend note) and seed per-instance leaf colours by sim date.
    const paintedTrees = STYLE === "painted";
    if (paintedTrees) {
      const fill = fillStreetTrees(scene14.roads, scene14.trees,
        footprintRings(area.buildings, origin));
      fillTrees = fill.trees.length;
      if (fillTrees > 0) trees = [...scene14.trees, ...fill.trees];
    }
    const bySpecies = [[], [], []];
    for (const t of trees) bySpecies[t[3]].push(t);
    bySpecies.forEach((list, species) => {
      if (list.length === 0) return;
      const mesh = new THREE.InstancedMesh(treeGeometry(species),
        treeMaterial(), list.length);
      list.forEach((t, i) => {
        const [x, z, scale] = t;
        dummy.position.set(x, heightAt(x, z), z);
        dummy.scale.setScalar(scale);
        dummy.rotation.set(0, treeRotation(x, z), 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        // Conifers stay evergreen (greens only); broadleaf/shrub follow
        // the sim date into the autumn window. Photo keeps the grey tint.
        const seed = `${x.toFixed(1)},${z.toFixed(1)}`;
        if (paintedTrees) {
          mesh.setColorAt(i, tintColor.setHex(
            treeColour(seed, species === 0 ? null : treeDateISO)));
        } else {
          mesh.setColorAt(i, tintColor.setScalar(treeTint(x, z)));
        }
      });
      mesh.count = list.length;
      mesh.castShadow = true;
      mesh.customDepthMaterial = treeShadowMaterial();
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      scene.add(mesh);
      treeMeshes.push(mesh);
    });
  } else {
    // Flat fallback: the old decorative street + complex trees.
    const placed = placeTrees(area, origin);
    trees = placed.trees;
    const bySpecies = { zelkova: [], ginkgo: [], pine: [] };
    for (const t of trees) (bySpecies[t.species] || bySpecies.zelkova).push(t);
    const trunkMesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(TREE_TRUNK_R_TOP, TREE_TRUNK_R_BOTTOM, TREE_TRUNK_H, 5),
      trunkMaterial(placed.trunkColor), Math.max(trees.length, 1));
    trees.forEach((t, i) => {
      dummy.position.set(t.x, (TREE_TRUNK_H / 2) * t.scale, -t.y);
      dummy.scale.setScalar(t.scale);
      dummy.rotation.set(0, t.phase, 0);
      dummy.updateMatrix();
      trunkMesh.setMatrixAt(i, dummy.matrix);
    });
    trunkMesh.count = trees.length;
    scene.add(trunkMesh);
    treeMeshes.push(trunkMesh);
    const canopyMaterial = vegetationMaterial();
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
      treeMeshes.push(mesh);
    }
  }

  // --- street life: parked cars + lamps (decorative) + fleet (motion) ---
  const fleet = buildFleet({
    segments: scene14 ? sceneSegments(scene14.roads)
      : areaSegments(area.roads, origin),
    seed: area.area || areaId, heightAt, maxVehicles: MAX_VEHICLES_HIGH,
  });
  const streetMeshes = buildStreetMeshes(
    placeStreetlife(area.roads, origin,
      { seed: area.area || areaId, maxMovers: 0 }),
    { heightAt, fleet });
  scene.add(streetMeshes.group);
  // 14e: additive lamp halos sit out of the painted depth prepass (they
  // would punch depth blobs under the override material). Photo ignores it.
  if (streetMeshes.halo) streetMeshes.halo.userData.noPaintedDepth = true;

  // --- ambient crowd: seeded OD pairs on the walk graph (motion) ---
  // Household agents render separately; this crowd never replaces them.
  const crowd = buildCrowd({ graph: area.graph, buildings: area.buildings,
    pois: area.pois, station: area.station, seed: area.area || areaId,
    maxPeds: MAX_PEDS_HIGH });
  const crowdMeshes = buildCrowdMeshes(crowd, { origin, heightAt });
  scene.add(crowdMeshes.group);

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
  const relief = scene14 ? demMax - demMin : 0;
  const maxHeightM = maxH > 0 || relief > 0
    ? Math.min(600, Math.max(maxH, relief)) : 250;

  // Red aviation beacons (14e) on roof tips ≥ 60 m: one Points cloud,
  // blinking hard once per 1.5 s, procedural in t. Both styles.
  let aviationMat = null;
  {
    const pts = [];
    for (const b of area.buildings || []) {
      const h = Number(b.height_m) || (Number(b.levels) || 0) * 3 || 0;
      if (!needsAviationLight(h)) continue;
      const g = b.geometry;
      if (!g) continue;
      const polys = g.type === "Polygon" ? [g.coordinates]
        : g.type === "MultiPolygon" ? g.coordinates : [];
      const ring = (polys[0] && polys[0][0]) || [];
      if (ring.length === 0) continue;
      let sx = 0;
      let sy = 0;
      for (const [lon, lat] of ring) {
        const [x, y] = lonLatToXY(lon, lat, origin);
        sx += x;
        sy += y;
      }
      const px = sx / ring.length;
      const py = sy / ring.length;
      pts.push(px, heightAt(px, -py) + h + 2.5, -py);
    }
    if (pts.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      aviationMat = new THREE.PointsMaterial({ color: 0xff2a1e, size: 4,
        sizeAttenuation: false, transparent: true, opacity: 0,
        depthWrite: false });
      const aviation = new THREE.Points(geo, aviationMat);
      aviation.frustumCulled = false;
      aviation.userData.noPaintedDepth = true;
      scene.add(aviation);
    }
  }

  // Painted night (14e): ground-plane surfaces lerp toward navy after
  // dusk; carriageways keep their day asphalt so they read a little
  // lighter than the ground and lit windows pop. Photo: untouched.
  const nightMats = [];
  if (STYLE === "painted") {
    nightMats.push({ mat: base.material, day: baseDayColor, direct: true });
    if (terrainMesh) {
      nightMats.push({ mat: terrainMesh.material, day: LOOK.terrainBase, direct: false });
    }
    nightMats.push({ mat: groundMesh.material, day: LOOK.terrainBase, direct: false });
    for (const m of sceneRoadMeshes) {
      const cls = m.userData.roadCls;
      if (cls === "road" || cls === "rail") continue;
      const day = cls === "foot" ? LOOK.sceneFoot
        : cls === "cycle" ? LOOK.sceneCycle : LOOK.terrainBase;
      nightMats.push({ mat: m.material, day, direct: false });
    }
  }
  let lastNightT = -1;
  function applyPaintedNight(nightF) {
    if (STYLE !== "painted") return;
    const t = Math.min(1, Math.max(0, Number(nightF) || 0));
    if (Math.abs(t - lastNightT) < 0.005) return;
    lastNightT = t;
    for (const { mat, day, direct } of nightMats) {
      if (direct) mat.color.setHex(lerpHex(day, PAINTED_NIGHT_GROUND, t));
      else mat.color.setRGB(...nightTint(day, PAINTED_NIGHT_GROUND, t));
    }
  }

  renderCtl.attach(scene, camera, document.getElementById("scene-wrap"));
  // Stage-14 perf log, once per box load (scene-only draw calls/tris).
  const sceneMeasure = renderCtl.measureScene();
  console.log(`[scene14] area=${areaId} scene=${scene14 ? "terrain" : "flat"} ` +
    `drawCalls=${sceneMeasure.calls} triangles=${sceneMeasure.triangles}`);
  return {
    origin, cx, cy, span, renderer, renderCtl, rig, scene, camera, controls,
    base, groundMesh, markMesh, waterMesh, wallMeshes, podiumMesh, roofMesh,
    dimMeshes, litMeshes, fadeMeshes, householdsById, maxHeightM,
    trees, treeMeshes, fillTrees, streetMeshes, crowd, crowdMeshes,
    dummy, heightAt,
    ground0, terrainMesh, sceneRoadMeshes, sceneWaterMesh, sceneMarkingsMesh,
    nightMats, applyPaintedNight, aviationMat,
  };
}

// Refit the camera + renderer to the (docked-panel-shrunk) canvas.
function refitToWrap(camera, renderCtl, controls = null) {
  const wrap = document.getElementById("scene-wrap");
  const w = wrap ? wrap.clientWidth : innerWidth;
  const h = wrap ? wrap.clientHeight : innerHeight;
  camera.aspect = Math.max(0.2, w / Math.max(1, h));
  camera.updateProjectionMatrix();
  // Painted: the zoom clamp is aspect-dependent, so refresh it on refit.
  if (controls && STYLE === "painted" && camera.userData.clampSpan) {
    const clamp = zoomClampDistances(camera.userData.clampSpan, CAM.fovDeg, camera.aspect);
    controls.minDistance = clamp.min;
    controls.maxDistance = clamp.max;
  }
  renderCtl.fitContainer();
}

// 13e5: keep the sim camera's projection centred on the STAGE (the
// canvas minus the right-drawer overlap) instead of the full canvas,
// so nothing important renders under the drawer. Same drawer probe
// as paintTag; cached so updateProjectionMatrix runs only when the
// layout actually changes (drawer mounts after boot, hence per-frame
// tracking instead of a one-shot refit).
// 14b: motion heartbeat — counts + eval ms, once a second in dev.
let lastMotionLog = 0;
function logMotion(tMin, { cars = 0, peds = 0, trains = 0, ms = 0 } = {}) {
  if (!import.meta.env.DEV) return;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (now - lastMotionLog < 1000) return;
  lastMotionLog = now;
  const hh = String(Math.floor(tMin / 60) % 24).padStart(2, "0");
  const mm = String(Math.floor(tMin % 60)).padStart(2, "0");
  console.log(`[motion] t=${hh}:${mm} cars=${cars} peds=${peds} trains=${trains} ms=${ms.toFixed(1)}`);
}

let simViewCache = null;
function trackSimViewOffset(camera) {
  const canvasEl = document.getElementById("scene");
  const drawerEl = document.querySelector(".ui-sim13-drawer")
    || document.querySelector('.ui-chat-drawer[data-open="true"]');
  const c = canvasEl ? canvasEl.getBoundingClientRect() : null;
  let overlap = 0;
  if (drawerEl && c) {
    const dr = drawerEl.getBoundingClientRect();
    if (dr.width > 0 && dr.height > 0 && dr.right >= c.right - 1 && dr.left > c.left) {
      overlap = Math.min(c.right - dr.left, c.width);
    }
  }
  const w = c ? c.width : innerWidth;
  const h = c ? c.height : innerHeight;
  const key = `${w}x${h}+${overlap}`;
  if (key === simViewCache) return;
  simViewCache = key;
  const off = simViewOffset(w, overlap);
  if (off.overlap > 0) {
    camera.setViewOffset(off.fullW, h, off.x, 0, off.width, h);
  } else {
    camera.clearViewOffset();
  }
  camera.updateProjectionMatrix();
}

async function fetchScene(wantId) {
  return loadScene(wantId, async (url) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return r.json();
  });
}

async function bootTour(uiMode = "tour") {
  const [area, scene14] = await Promise.all([fetchArea(areaId), fetchScene(areaId)]);
  const { origin, renderer, renderCtl, rig, scene, camera, controls,
    dimMeshes, fadeMeshes, litMeshes, householdsById, maxHeightM,
    streetMeshes, crowdMeshes, trees, treeMeshes, fillTrees, waterMesh,
    sceneWaterMesh, sceneMarkingsMesh, dummy, heightAt,
    applyPaintedNight, aviationMat } = buildWorld(area, scene14,
      { treeDateISO: TOUR_DATE_ISO });
  // World position with terrain height (tour route + stops ride +2 m).
  const w2hg = (lon, lat, lift = 2) => {
    const [x, y] = lonLatToXY(lon, lat, origin);
    return [x, heightAt(x, -y) + lift, -y];
  };
  for (const { mesh } of fadeMeshes) makeFadeable(mesh);

  // --- tour plan + route line ---
  const plan = selectTourStops(area);
  const legPaths = plan.stops.map((s) =>
    pathWaypoints(s.pathNodeIds, area.graph.nodes, origin,
      (lon, lat) => w2hg(lon, lat)));
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
  const stopDist0 = distanceForWidth(tourFrameWidths(STYLE).stop, CAM.fovDeg, camera.aspect);
  const footprints = footprintsOf(area.buildings, origin);
  const stopTargets = plan.stops.map((s, i) => {
    const wp = legPaths[i].length > 1
      ? legPaths[i][legPaths[i].length - 1]
      : w2hg(s.lon, s.lat);
    // Clear the view toward both the named stop anchor and the settled
    // path end (the camera centres on the latter).
    return { anchor: lonLatToXY(s.lon, s.lat, origin), end: [wp[0], -wp[2]] };
  });
  const stopAzimuths = plan.stops.map((s, i) => {
    const picked = pickStopAzimuth([stopTargets[i].anchor, stopTargets[i].end], footprints, stopDist0,
      undefined, CAM.pitchDeg);
    const moved = picked.azimuth !== TOUR_AZIMUTH;
    console.log(`[occlusion] stop=${i} ${s.name} azimuth=[${picked.azimuth}] ` +
      `occluders=${picked.occluders}${moved ? " (moved)" : ""}`);
    return picked.azimuth;
  });
  // Fade fallback: residual occluders at the picked azimuth, plus the
  // tall host tower when a POI stop sits inside one.
  const stopFades = plan.stops.map((s, i) => {
    const targets = [stopTargets[i].anchor, stopTargets[i].end];
    const ids = new Set(occludingIds(targets, footprints, stopDist0, stopAzimuths[i], CAM.pitchDeg));
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
  store.set({ mode: uiMode });
  // The landing and the chat reuse the tour scene as a backdrop; only
  // the tour shows captions, the legend and the area switcher.
  if (uiMode === "tour") {
    buildUI(area, plan, !!scene14, fillTrees);
  } else {
    store.set({ area: { id: areaId, label: area.label || areaId } });
    document.title = uiMode === "chat" ? "주거 시뮬레이터 — 대화" : "주거 시뮬레이터";
  }
  if (uiMode === "chat") registerChatActions();
  document.getElementById("loading").remove();
  document.getElementById("fade").classList.add("clear");

  // --- tour sun/sky (?time=HH:MM override; static through the tour) ---
  const { date: tourDate, minute: tourMinute } = tourSun();
  const fillTourLit = makeLitFiller(litMeshes, householdsById);
  let tourEmissive = 0;
  let tourBloom = 0;
  let tourFramedWidth = null;
  let tourLitDone = false;
  function updateTourSky() {
    const camDist = camera.position.distanceTo(controls.target);
    const framedWidth = frameWidthFor(camDist, CAM.fovDeg, camera.aspect);
    tourFramedWidth = framedWidth;
    const p = rig.update({ lat: origin.lat, lon: origin.lon, date: tourDate,
      minute: tourMinute,
      target: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
      shadowSpan: 240, envKey: "tour", framedWidth, camDistM: camDist,
      style: STYLE, maxHeightM, look: LOOK });
    tourBloom = p.bloom;
    tourEmissive = p.emissive;
    setGlobalNight(p.emissive);
    applyPaintedNight(p.nightF);
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
  // Landing/chat reuse the glide as a backdrop (quiet: no captions);
  // the chat pauses it so the customer orbits freely.
  const player = createPlayer(plan, legPaths, camera, controls, origin,
    stopAzimuths, applyFade, archLens, uiMode !== "tour", heightAt);
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
  const REDUCED_TOUR = typeof matchMedia === "function"
    && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (uiMode === "chat" && player.playing) player.toggle();
  if (uiMode === "landing" && REDUCED_TOUR && player.playing) player.toggle();
  store.set({ tourPlaying: player.playing, ready: true });

  // --- loop ---
  const clock = new THREE.Clock();
  let frames = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;
    player.update(dt);
    const tourTMin = tourMinute + t / 60;
    const tourVeh = streetMeshes.updateVehicles(tourTMin, vehicleCapFor(renderCtl.quality));
    const tourPed = crowdMeshes.update(tourTMin, { cap: pedCapFor(renderCtl.quality) });
    for (const tm of treeMeshes) setSway(tm.material, tourTMin * 60, swayDayFactor(tourEmissive));
    if (waterMesh) setWaterTime(waterMesh.material, tourTMin * 60);
    if (sceneWaterMesh) setWaterTime(sceneWaterMesh.material, tourTMin * 60);
    logMotion(tourTMin, { cars: tourVeh.active, peds: tourPed.active,
      ms: tourVeh.ms + tourPed.ms });
    updateTourSky(); // follows the camera target (shadow frustum)
    controls.update();
    if (archLens) levelCamera();
    if (sceneMarkingsMesh) {
      sceneMarkingsMesh.visible = (tourFramedWidth ?? 0) <= MARKINGS_HIDE_M;
    }
    if (aviationMat) aviationMat.opacity = aviationBlink(tourTMin * 60);
    renderCtl.renderFrame({ bloom: tourBloom, framedWidthM: tourFramedWidth }, dt);
    frames++;
    if (frames === 30) {
      console.log(`[scene] area=${areaId} buildings=${area.buildings.length} ` +
        `trees=${trees.length} peds=${crowdMeshes.slots} cars=${streetMeshes.parked}+${streetMeshes.moverCount} ` +
        `lamps=${streetMeshes.lampCount} arch=${archLens}`);
    }
  });

  const refitTour = () => {
    refitToWrap(camera, renderCtl, controls);
    if (archLens) applyArchLens();
  };
  addEventListener("resize", refitTour);
  new ResizeObserver(refitTour).observe(document.getElementById("scene-wrap"));
}

// --- tour player: glide legs, 3 s dwell per stop, outro pull-back ---
// onLeg(i) fires whenever the current leg view changes (fade updates).
// archLens composes level-sensor poses (the loop re-levels each frame).
function createPlayer(plan, legPaths, camera, controls, origin, stopAzimuths = [], onLeg = null, archLens = false, quiet = false, heightAt = null) {
  const stops = plan.stops;

  const schedule = tourSchedule(plan);
  const frameW = tourFrameWidths(STYLE); // painted: 450 m stops, 700 m glide
  const stopDist = distanceForWidth(frameW.stop, CAM.fovDeg, camera.aspect);
  const glideDist = distanceForWidth(frameW.glide, CAM.fovDeg, camera.aspect);
  const state = { playing: stops.length > 0, leg: 0, legT: 0, dwell: 0, outro: 0, done: false };
  controls.enabled = !state.playing;

  function stopPoint(i) {
    if (legPaths[i].length > 1) return legPaths[i][legPaths[i].length - 1];
    const [x, y] = lonLatToXY(stops[i].lon, stops[i].lat, origin);
    return [x, (heightAt ? heightAt(x, -y) : 0) + 2, -y];
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
      const archW = frameW.stop + (frameW.glide - frameW.stop) * (1 - t);
      const ap = archLensPose(archW, camera.aspect, stopAzimuths[i] || TOUR_AZIMUTH);
      return { pos: new THREE.Vector3(wp[0] + ap.dirX * ap.horiz, wp[1] + ap.vert, wp[2] + ap.dirZ * ap.horiz),
               look: new THREE.Vector3(wp[0], wp[1], wp[2]) };
    }
    const dist = stopDist + (glideDist - stopDist) * (1 - t);
    const [dox, doy, doz] = tourOffset(dist, CAM.pitchDeg, TOUR_AZIMUTH);
    const [sox, soy, soz] = tourOffset(dist, CAM.pitchDeg, stopAzimuths[i] || TOUR_AZIMUTH);
    const k = t * t; // ease the azimuth in towards the settled stop
    const ox = dox + (sox - dox) * k;
    const oy = doy + (soy - doy) * k;
    const oz = doz + (soz - doz) * k;
    return { pos: new THREE.Vector3(wp[0] + ox, wp[1] + oy, wp[2] + oz),
             look: new THREE.Vector3(ahead[0], ahead[1], ahead[2]) };
  }

  function showStop(i) {
    if (quiet) return; // landing/chat backdrop: the glide, no captions
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

// 14b: ambient movers are rule-made mock motion (가정값), never
// observed traffic. Near-station crowds add the 실측 suffix when the
// congestion table backs them (sim only; tour loads no region data).
export const MOTION_NOTE_TOUR_SCENE = "나무는 OSM 숲·공원 자료 기반 절차 배치, 차량·인물은 규칙으로 만든 모의 움직임(가정값)입니다";
export const MOTION_NOTE_TOUR_FLAT = "나무는 장식용 모의 표시, 차량·인물은 규칙으로 만든 모의 움직임(가정값)입니다";
export const MOTION_NOTE_SIM_SCENE = "나무는 OSM 숲·공원 자료 기반 절차 배치, 차량·인물·열차는 규칙으로 만든 모의 움직임(가정값)입니다";
export const MOTION_NOTE_SIM_FLAT = "나무는 장식용 모의 표시, 차량·인물·열차는 규칙으로 만든 모의 움직임(가정값)입니다";
export const MOTION_CONG_SUFFIX = " 역 주변 인파는 실측 혼잡도 기반입니다.";
// 14e: rule-filled street trees are assumption values, like mock motion.
export const FILL_TREES_SUFFIX = " 가로수 위치 일부는 규칙으로 채운 값(가정값)입니다.";

function buildUI(area, plan, sceneOn = false, fillCount = 0) {
  const { resRows, heightRows } = legendRows(area);
  store.set({
    areaOptions: AREAS.map((a) => ({ value: a.id, label: a.label })),
    area: { id: areaId, label: area.label || areaId },
    legend: {
      title: "범례",
      resRows,
      heightRows,
      note: (sceneOn ? MOTION_NOTE_TOUR_SCENE : MOTION_NOTE_TOUR_FLAT)
        + (fillCount > 0 ? FILL_TREES_SUFFIX : ""),
    },
  });
  if (plan.stops.length === 0) store.set({ tourPlaying: false });
  document.title = `주거 시뮬레이터 — ${area.label || areaId}`;
}

// Shared UI actions (all modes); mode-specific boots add their own.
function registerCommonActions() {
  store.registerActions({
    // 12b: tab buttons that used to whisper to the floating agent now
    // open the chat with their question (transcript kept in memory).
    consultSend: (text) => {
      location.href = chatUrl(String(text || ""));
    },
    // The chat reopens from every screen, at any hour.
    openChat: () => {
      location.href = chatReopenUrl();
    },
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

// Chat work-area actions: the compare tabs render from store data the
// chat put there (no sim clock, no scene pins here — those stay in
// the sim view and say so instead of failing silently).
function registerChatActions() {
  store.registerActions({
    setCompareTab: (tab) => {
      if (!VALID_COMPARE_TABS.includes(tab)) return;
      store.set({ compareTab: tab });
    },
    toggleCompare: () => {
      store.set({ compareOpen: !store.getState().compareOpen });
    },
    setMoneyTenure: (label, tenure) => {
      store.set({ moneyTenure: { ...store.getState().moneyTenure, [label]: tenure } });
    },
    showListingPin: () => {
      store.set({ viewChip: "핀은 시뮬레이션 화면에서 보여요" });
    },
    clearListingPin: () => {},
    jumpToCriterionUse: () => {
      store.set({ viewChip: "그 순간은 시뮬레이션 화면에서 보여요" });
    },
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
      // 12b: per-home progress posts carry no runs — ignore them.
      if (e.data && e.data.progress) return;
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
  // 12b: ?custom=<id> loads a chat-run simulation (scenario + runs)
  // from IndexedDB instead of /data + /scenarios.
  const customId = customRunId(location.search);
  let customRecord = null;
  if (customId) {
    customRecord = await loadCustomRun(customId).catch(() => null);
    if (!customRecord) {
      loading.textContent = "저장된 살아 보기를 찾지 못했어요. 대화에서 다시 실행해 주세요.";
      throw new Error(`custom run ${customId} not found`);
    }
    if (!customRecord.runs[homeLabel]) {
      loading.textContent = `저장된 살아 보기에 홈 ${homeLabel}이(가) 없어요.`;
      throw new Error(`custom run ${customId} has no home ${homeLabel}`);
    }
  }
  let scenario = customRecord ? customRecord.scenario : null;
  if (!scenario) {
    try {
      const r = await fetch(`/scenarios/${scenarioName}.json`);
      if (r.ok) scenario = await r.json();
    } catch {
      scenario = null;
    }
  }
  loading.textContent = `생활 시뮬레이션 불러오는 중… (홈 ${homeLabel})`;
  let run = customRecord ? customRecord.runs[homeLabel]
    : await loadRunFile(scenarioName, homeLabel).catch(() => null);
  let runSource = customRecord ? "custom" : "file";
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
  const scene14 = await fetchScene(run.meta.area);
  const homes = scenario && Array.isArray(scenario.homes) && scenario.homes.length > 0
    ? scenario.homes
    : [{ label: homeLabel, area: run.meta.area, complex_name: run.meta.complex }];
  const { origin, renderer, renderCtl, rig, scene, camera, controls,
    dimMeshes, litMeshes, householdsById, maxHeightM, streetMeshes,
    crowd, crowdMeshes, treeMeshes, fillTrees, waterMesh, sceneWaterMesh,
    sceneMarkingsMesh, wallMeshes, podiumMesh, roofMesh, heightAt,
    nightMats, applyPaintedNight, aviationMat } = buildWorld(area, scene14,
      { treeDateISO: simDateISO(run.meta.start_date, 0) });
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
    // 13e2: position in the canvas/stage rect, never innerWidth /
    // innerHeight — and hide tags sliding under the right drawer.
    const canvasEl = document.getElementById("scene");
    const wrapEl = document.getElementById("scene-wrap");
    const c = canvasEl ? canvasEl.getBoundingClientRect() : null;
    const w = wrapEl ? wrapEl.getBoundingClientRect() : null;
    const full = c || { left: 0, top: 0, width: innerWidth, height: innerHeight };
    const drawerEl = document.querySelector(".ui-sim13-drawer")
      || document.querySelector('.ui-chat-drawer[data-open="true"]');
    let overlap = 0;
    if (drawerEl && c) {
      const dr = drawerEl.getBoundingClientRect();
      if (dr.width > 0 && dr.height > 0 && dr.right >= c.right - 1 && dr.left > c.left) {
        overlap = Math.min(c.right - dr.left, c.width);
      }
    }
    const placed = placeTag(tagV.x, tagV.y,
      { left: full.left - (w ? w.left : 0), top: full.top - (w ? w.top : 0),
        width: full.width, height: full.height },
      { drawerOpen: overlap > 0, drawerWidth: overlap });
    if (!placed.visible) {
      el.style.display = "none";
      return;
    }
    el.style.display = "block";
    el.style.left = `${placed.x}px`;
    el.style.top = `${placed.y}px`;
    // 13e4: hide when the tag BOX — not just its anchor — intersects
    // the drawer or the top bar. All rects are viewport px read live
    // here, so layout timing cannot skew them; zero-area rects
    // (hidden elements) never block.
    const blockers = [];
    if (drawerEl) {
      const dr = drawerEl.getBoundingClientRect();
      blockers.push({ left: dr.left, top: dr.top, width: dr.width, height: dr.height });
    }
    const topEl = document.querySelector(".ui-sim13-top");
    if (topEl) {
      const tr = topEl.getBoundingClientRect();
      blockers.push({ left: tr.left, top: tr.top, width: tr.width, height: tr.height });
    }
    if (blockers.length > 0) {
      const tb = el.getBoundingClientRect();
      if (tagBoxBlocked(
        { left: tb.left, top: tb.top, width: tb.width, height: tb.height }, blockers)) {
        el.style.display = "none";
      }
    }
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
  // Public-listing pin (매물 tab "지도에 핀"): one reusable tag + cone.
  const listingPin = document.createElement("div");
  listingPin.className = "hopin";
  listingPin.style.display = "none";
  tagsLayer.appendChild(listingPin);
  const listingMark = new THREE.Mesh(
    new THREE.ConeGeometry(2.2, 5, 12),
    new THREE.MeshBasicMaterial({ color: 0xb78bff, depthTest: false,
      transparent: true, opacity: 0.9 }));
  listingMark.renderOrder = 997;
  listingMark.visible = false;
  scene.add(listingMark);
  let listingPinTarget = null; // {x, z, label} in world coords
  const rideStub = new THREE.Line(new THREE.BufferGeometry(),
    // 12b: the ride stub shares the day strip's 지하철 colour.
    new THREE.LineDashedMaterial({ color: SUBWAY_ROUTE_CSS, dashSize: 4, gapSize: 3,
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
    return new THREE.Vector3(x, heightAt(x, -y) + lift, -y);
  }

  // Absolute tag/mark heights ride the terrain too (else hill boxes bury them).
  const tagY = (x, z, lift) => heightAt(x, z) + lift;

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
        dummy.position.set(x, heightAt(x, -y) + height, -y);
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
      ringMeshes[i].position.set(x, heightAt(x, -y) + 0.3, -y);
      ringMeshes[i].visible = marked;
      paintTag(tagEls[i], x, tagY(x, -y, 6), -y, marked);
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
      s.position.set(x, tagY(x, -y, 4), -y);
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
        // 12b: the walked route shares the day strip's 걷기 colour.
        routeAhead.material.color.set(WALK_ROUTE_CSS);
      }
      routeAhead.visible = true;
      routeDone.visible = true;
      const dp = h.destNodeId ? nodeWorld(h.destNodeId, 0) : null;
      if (dp && h.destLabel) {
        paintTagPin(destPin, dp.x, tagY(dp.x, dp.z, 10), dp.z, h.destLabel);
        destMark.position.set(dp.x, tagY(dp.x, dp.z, 3), dp.z);
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
        setLine(rideStub, [sp, new THREE.Vector3(sp.x, tagY(sp.x, sp.z, 30), sp.z)]);
        rideStub.visible = true;
        paintTagPin(destPin, sp.x, tagY(sp.x, sp.z, 34), sp.z, `지하철 탑승 (가정값 ${h.rideAway.rideMinutes}분)`);
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
    if (listingPinTarget) {
      paintTagPin(listingPin, listingPinTarget.x, tagY(listingPinTarget.x, listingPinTarget.z, 14), listingPinTarget.z, listingPinTarget.label);
      listingMark.position.set(listingPinTarget.x, tagY(listingPinTarget.x, listingPinTarget.z, 3), listingPinTarget.z);
      listingMark.visible = true;
    } else {
      listingPin.style.display = "none";
      listingMark.visible = false;
    }
  }

  // --- sun/sky follow sim time; facades glow from run occupancy ---
  // The rig owns sun/hemi/Sky/environment; per-building lit fractions
  // (at-home residents / agents housed there — the same stage-3 data the
  // old glow quads used — plus the fallback estimate for other residential
  // buildings with real households) fill the aLit vertex attributes at
  // 30-minute granularity. Daytime emissive is off (uNight = 0).
  let simBloom = 0;
  let simEmissive = 0;
  let simFramedWidth = null;
  let lastLightKey = "";
  let lastLitKey = "";

  function updateLighting() {
    const m = Math.floor(minute);
    const instant = simInstant(run.meta.start_date, day, m);
    const camDist = camera.position.distanceTo(controls.target);
    const framedWidth = frameWidthFor(camDist, CAM.fovDeg, camera.aspect);
    simFramedWidth = framedWidth;
    const p = rig.update({ lat: origin.lat, lon: origin.lon, date: instant,
      minute: m,
      target: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
      shadowSpan: 240, envKey: `${day}:${Math.floor(m / 30)}`, framedWidth,
      camDistM: camDist, style: STYLE, maxHeightM, look: LOOK });
    simBloom = p.bloom;
    simEmissive = p.emissive;
    const key = `${day}:${m}`;
    if (key === lastLightKey) return;
    lastLightKey = key;
    setGlobalNight(p.emissive);
    applyPaintedNight(p.nightF);
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
  const stopDist = distanceForWidth(STOP_FRAME_M, CAM.fovDeg, camera.aspect);
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
    const [ox, oy, oz] = tourOffset(stopDist, CAM.pitchDeg, CAM.azimuth);
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
  const journeyLayer = createJourneyLayer(scene, origin,
    { look: LOOK, tags: document.getElementById("tags") });
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
  // Regional base plane (the home plane only spans ~1.8 km), in the
  // look table's land colour so it meets the corridor base map seamlessly.
  const regionalBase = new THREE.Mesh(
    new THREE.PlaneGeometry(120000, 120000),
    new THREE.MeshStandardMaterial({ color: LOOK.regionalGround, roughness: 1, metalness: 0 }));
  regionalBase.rotation.x = -Math.PI / 2;
  regionalBase.position.y = -0.4;
  regionalBase.visible = false;
  scene.add(regionalBase);
  if (STYLE === "painted") {
    nightMats.push({ mat: regionalBase.material, day: LOOK.regionalGround, direct: true });
  }

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
  // 14b: near-station crowd scaling wants the table even off-journey.
  ensureCongestion();

  // 14b: congestion scale for the crowd, refreshed per 30-minute slot.
  let congKey = "";
  let congScale = 1;
  let congLabel = "가정값";
  let simLegendBase = "";
  let congNoteBacked = false;
  function refreshCongestion() {
    const key = `${day}:${Math.floor(minute / 30)}:${regionCongestion ? 1 : 0}`;
    if (key === congKey) return;
    congKey = key;
    const hit = stationCongestionScale(regionCongestion, {
      dayKind: dayKindFor(weekdayOfDay(day)),
      station: area.station && area.station.name, minute });
    congScale = hit.scale;
    congLabel = hit.hasData ? "실측 혼잡도 기반" : "가정값";
    if (hit.hasData !== congNoteBacked && simLegendBase) {
      congNoteBacked = hit.hasData;
      const cur = store.getState().legend;
      if (cur) {
        store.set({ legend: { ...cur,
          note: simLegendBase + (hit.hasData ? MOTION_CONG_SUFFIX : "") } });
      }
    }
  }

  // 14b: schedule-driven train pulse (sim only). Network + schedule
  // load lazily; the marker appears once both arrive.
  let regionSchedule = null;
  let trainTable = null;
  let trainPulse = null;
  async function ensureSchedule() {
    if (regionSchedule !== null) return regionSchedule;
    try {
      const r = await fetch(INTERSTATION_CSV_URL);
      if (!r.ok) throw new Error(`schedule ${r.status}`);
      regionSchedule = parseInterstationCsv(await r.text());
    } catch {
      regionSchedule = null;
    }
    return regionSchedule;
  }
  async function ensureTrains() {
    if (trainPulse || !area.station) return;
    await ensureRegion();
    const sched = await ensureSchedule();
    if (!regionNetwork || !sched) return;
    trainTable = buildTrainTable({ network: regionNetwork, schedule: sched,
      station: area.station.name, seed: run.meta.area });
    if (trainTable.runs.length === 0) {
      trainTable = null;
      return;
    }
    const [sx, sy] = lonLatToXY(area.station.lon, area.station.lat, origin);
    trainPulse = buildTrainPulse(trainTable,
      { x: sx, y: heightAt(sx, -sy) + 0.4, z: -sy, reduced: REDUCED });
    scene.add(trainPulse.group);
  }
  ensureRegion();
  ensureTrains();

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
      if (a.day !== dayNum) continue;
      if (a.kind === "work" && a.detail && a.detail.rides) {
        out.push({ away: a, rides: a.detail.rides });
      } else if (a.kind === "ride" && a.detail && a.detail.ride) {
        const dir = a.detail.direction === "back" ? "back" : "out";
        out.push({ away: a, rides: { [dir]: a.detail.ride } });
      }
    }
    return out;
  }

  async function areaBbox(areaId) {
    if (areaBboxes.has(areaId)) return areaBboxes.get(areaId);
    // 12a: bboxes ride on the areas index — no area.json fetch needed.
    const indexed = AREAS.find((a) => a.id === areaId);
    if (indexed && indexed.bbox) {
      areaBboxes.set(areaId, indexed.bbox);
      return indexed.bbox;
    }
    try {
      const doc = await fetchJson(`/data/${areaId}/area.json`);
      areaBboxes.set(areaId, doc.bbox || null);
      return doc.bbox || null;
    } catch {
      areaBboxes.set(areaId, null);
      return null;
    }
  }

  // Smallest built area containing the station (pure lookup in
  // station-areas.js; null → corridor level + note).
  async function areaForStation(lon, lat) {
    const entries = [];
    for (const { id } of AREAS) {
      const bbox = await areaBbox(id);
      if (bbox) entries.push([id, bbox]);
    }
    return pickStationArea(lon, lat, entries, origin);
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
      mesh.material.color.setRGB(...facadeTintFor(cls, STYLE));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
    }
    if (built.detail.podium.triangles > 0) {
      const mesh = new THREE.Mesh(toGeometry(built.detail.podium),
        facadeMaterial("podium", { aniso: maxAniso2 }));
      mesh.material.color.setRGB(...facadeTintFor("podium", STYLE));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
    }
    const liteRoof = new THREE.Mesh(toGeometry(built.detail.roofs), roofMaterial({ aniso: maxAniso2 }));
    liteRoof.material.color.setRGB(...facadeTintFor("roof", STYLE));
    g.add(liteRoof);
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
  // the corridor manifest (tiles then preload in full, in the background).
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
      const dirs = [rides.out, rides.back].filter(Boolean);
      for (const ride of dirs) {
        const lastLeg = ride.legs[ride.legs.length - 1];
        const sid = lastLeg.stopIds[lastLeg.stopIds.length - 1];
        const c = coords.get(sid);
        if (!c) continue;
        const areaId = await areaForStation(c[0], c[1]);
        if (areaId && areaId !== run.meta.area) await ensureSecondArea(areaId);
      }
      const first = dirs[0];
      if (first) {
        const firstLeg = first.legs[0];
        const lastLeg = first.legs[first.legs.length - 1];
        const corridor = corridorFor(corridorsIndex, firstLeg.from, lastLeg.to);
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
    // The boot paint ran before the network arrived: repaint the journey
    // now, so static ?t= loads engage it without a minute tick.
    paintJourneyMinute();
  }

  // The drawn ride for one direction of a member-day, either engine
  // form (old: the work away's pair; new: the ride away). Null when the
  // ride stays numeric (nothing to draw).
  function drawnRide(dayAways, dir) {
    for (const a of dayAways) {
      if (a.kind === "ride" && a.detail && a.detail.ride
          && (a.detail.direction || "out") === dir) {
        return a.detail.ride;
      }
      if (a.kind === "work" && a.detail && a.detail.rides && a.detail.rides[dir]) {
        return a.detail.rides[dir];
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
    const loaded = [];
    for (const [id] of secondAreas) {
      const bbox = areaBboxes.get(id);
      if (bbox) loaded.push(bbox);
    }
    return destInLoadedAreas(destLonLat, loaded, origin);
  }

  // Full journey frame state (pure of wall time — minute only). The phase
  // comes from journeyCameraState, so static ?t= loads, slider drags and
  // playback all engage the same way.
  function journeyFrame() {
    const idle = { phase: "idle", riding: null, away: null, ride: null,
      dir: null, elapsed: 0, progress: 0, spanStart: 0, rideMinutes: 0,
      banner: null, hasDetailDest: false,
      detailNote: "", destLonLat: null, boardLonLat: null };
    if (follow < 1 || !regionNetwork) return idle;
    const agent = household[follow - 1];
    if (!agent) return idle;
    const m = Math.floor(minute);
    const dayAways = (indexed.awaysByAgent.get(agent.key) || []).filter((a) => a.day === day);
    const segments = commuteSegments(dayAways);
    if (!segments) return idle;
    const outRide = drawnRide(dayAways, "out");
    const backRide = drawnRide(dayAways, "back");
    if (!outRide && !backRide) return idle;
    const coords = networkStopCoords();
    const stopPos = (sid) => coords.get(sid) || null;
    // The phase needs the destination load state, which needs the
    // direction: probe unloaded, then decide with the real gate.
    const probe = journeyCameraState({ segments, minute: m, view: journeyView,
      hasDetailDest: false });
    if (probe.phase === "street") return idle;
    const backHome = probe.dir === "back";
    const ride = backHome ? (backRide || outRide) : (outRide || backRide);
    const firstLeg = ride.legs[0];
    const lastLeg = ride.legs[ride.legs.length - 1];
    const board = stopPos(firstLeg.stopIds[0]);
    const dest = stopPos(lastLeg.stopIds[lastLeg.stopIds.length - 1]);
    const hasDetail = destDetailLoaded(dest, backHome);
    const state = journeyCameraState({ segments, minute: m, view: journeyView,
      hasDetailDest: hasDetail });
    if (state.phase === "street") return idle;
    const span = state.dir === "back" ? segments.back
      : state.dir === "out" ? segments.out : segments.work;
    const away = state.dir === "work"
      ? dayAways.find((a) => a.kind === "work") || null
      : dayAways.find((a) => a.kind === "ride"
        && (a.detail && a.detail.direction || "out") === state.dir)
        || dayAways.find((a) => a.kind === "work") || null;
    const frame = { ...idle, phase: state.phase, away, ride,
      dir: state.dir, elapsed: state.elapsed, progress: state.progress,
      spanStart: span ? span.start : 0, rideMinutes: ride.minutesTotal,
      riding: { rideMinutes: ride.minutesTotal },
      hasDetailDest: hasDetail, destLonLat: dest, boardLonLat: board };
    if (state.phase === "hold") {
      // Arrival hold: stay at the destination while they work (or walk
      // the last stretch there).
      const atWork = segments.work && m >= segments.work.start && m < segments.work.end;
      frame.detailNote = hasDetail ? "" : "상세 지도는 지역 생성 후";
      frame.banner = { where: atWork ? `${lastLeg.to} 도착 · 근무 중`
        : `${lastLeg.to} 도착 · 도보 이동 중`, legIndex: -1,
      inTransfer: false, minutesLeft: 0,
      legs: ride.legs.map((l) => ({ line: l.lineName, from: l.from,
        to: l.to, minutes: l.minutes, valuePct: l.congestion.valuePct,
        source: l.congestion.source })) };
      return frame;
    }
    frame.detailNote = (!hasDetail && !backHome) ? "상세 지도는 지역 생성 후" : "";
    frame.banner = journeyBanner({ ride, dir: state.dir, elapsed: state.elapsed,
      rideMinutes: ride.minutesTotal });
    return frame;
  }

  function streetPose(lonLat) {
    const [x, y] = lonLatToXY(lonLat[0], lonLat[1], origin);
    const [ox, oy, oz] = tourOffset(stopDist, CAM.pitchDeg, CAM.azimuth);
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
    const [ox, oy, oz] = tourOffset(dist, CAM.pitchDeg, CAM.azimuth);
    return { pos: new THREE.Vector3(center.x + ox, oy, center.z + oz),
      look: new THREE.Vector3(center.x, 0, center.z), dist };
  }

  // Oblique train-following cruise (stage 11b): ~3–4 km of corridor in
  // frame at 55° from vertical, so buildings read as blocks. Falls back
  // to the boarding/destination street when the marker has no geometry.
  function cruisePose(jf) {
    const pos = jf.ride ? trainPosition(regionNetwork, jf.ride, jf.elapsed) : null;
    const lonLat = pos ? [pos.lon, pos.lat]
      : (jf.phase === "descending" ? jf.destLonLat : jf.boardLonLat);
    if (!lonLat) return regionalPose();
    const [x, y] = lonLatToXY(lonLat[0], lonLat[1], origin);
    const pose = journeyCruisePose([x, -y], camera.aspect,
      { fovDeg: CAM.fovDeg, pitchDeg: CAM.cruisePitchDeg, azimuth: CAM.azimuth });
    return { pos: new THREE.Vector3(...pose.pos),
      look: new THREE.Vector3(...pose.look), dist: pose.dist };
  }

  const smooth = (t) => t * t * (3 - 2 * t);

  // Journey camera: progress-driven (speed-independent). Returns true
  // when it placed the camera (paintFollow skips its own follow then).
  function paintJourney(dt) {
    const jf = journeyFrame();
    const active = jf.phase === "rising" || jf.phase === "cruise"
      || jf.phase === "descending" || jf.phase === "hold" || jf.phase === "boarding";
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
      journeyLayer.updateStationLabels(null);
      restoreClipFog(dt);
      return true;
    }
    if (jf.phase === "boarding") {
      if (jf.boardLonLat) {
        const pose = streetPose(jf.boardLonLat);
        camera.position.copy(pose.pos);
        controls.target.copy(pose.look);
      }
      controls.enabled = false;
      journeyLayer.updateStationLabels(null);
      restoreClipFog(dt);
      return true;
    }
    // Auto: the oblique train-following cruise. The 전체 경로 override
    // keeps the whole-path overview instead.
    const regional = journeyView === "high" ? regionalPose() : cruisePose(jf);
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
    // Fog follows the live camera-to-target distance (not altitude): the
    // line, the train and the stations stay clear of the haze. Far ≥ 6×.
    camera.near = Math.max(2, regional.dist / 200);
    camera.far = Math.max(30000, regional.dist * 4);
    camera.updateProjectionMatrix();
    const camDist = camera.position.distanceTo(controls.target);
    const rfog = regionalFogRange(camDist, LOOK);
    scene.fog.near += (rfog.near - scene.fog.near) * Math.min(1, dt * 3);
    scene.fog.far += (rfog.far - scene.fog.far) * Math.min(1, dt * 3);
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

  // Corridor tile progress chip (one stable listener: the preload
  // dedupes it, so minute ticks never pile listeners up).
  function onTileProgress({ loaded, total }) {
    if (total > 0 && loaded < total) {
      store.set({ journeyLoading: `지도 불러오는 중 ${loaded}/${total}` });
    } else if (store.getState().journeyLoading.startsWith("지도 불러오는 중")) {
      store.set({ journeyLoading: "" });
    }
  }
  const corridorMeasured = new Set(); // ride keys with stats logged

  // Per-minute journey maintenance: path rebuilds, banner, and the
  // background full-corridor preload (clock-independent: it starts when
  // a ride starts or a static load lands inside one, and a paused clock
  // never stalls it).
  async function paintJourneyMinute() {
    const jf = journeyFrame();
    const active = jf.phase === "rising" || jf.phase === "cruise"
      || jf.phase === "descending" || jf.phase === "hold" || jf.phase === "boarding";
    if (!active || !jf.ride) {
      if (store.getState().journey) store.set({ journey: null });
      return;
    }
    const key = `${follow}:${day}:${jf.dir}:${jf.spanStart}`;
    if (key !== journeyRideKey) {
      journeyRideKey = key;
      const cong = await ensureCongestion();
      journeyLayer.setPath({ ride: jf.ride, network: regionNetwork,
        congestion: cong, dayKind: dayKindFor(weekdayOfDay(day)),
        minute: jf.spanStart,
        fallback: criterionDefault("C-congestion", "fallback_pct") });
    }
    store.set({ journey: { ...jf.banner, dir: jf.dir,
      elapsedMin: Math.floor(jf.elapsed),
      totalMin: jf.rideMinutes,
      hasDetailDest: jf.hasDetailDest, detailNote: jf.detailNote,
      corridorLabel: "간략 지도 (건물 높이 추정)",
      congestionSource: "서울교통공사 지하철혼잡도정보 (2026-09-30 기준)" } });
    journeyLayer.preloadCorridor(fetchJson, onTileProgress).then((done) => {
      // Finished (every tile attempted): the map is final, so the chip
      // clears even if a tile 404'd. Cancelled: a new corridor owns it.
      if (!done.cancelled
          && store.getState().journeyLoading.startsWith("지도 불러오는 중")) {
        store.set({ journeyLoading: "" });
      }
      if (done.cancelled || corridorMeasured.has(key)) return;
      corridorMeasured.add(key);
      // One frame later, so the measured render includes the new tiles.
      requestAnimationFrame(() => {
        console.log(`[journey] corridor tiles=${done.loaded}/${done.total} ` +
          `triangles=${done.triangles} ` +
          `drawCalls=${renderer.info.render.calls} ` +
          `renderTriangles=${renderer.info.render.triangles}`);
      });
    });
  }

  // --- sim UI: A/B homes, speeds, day jump, compare ---
  function simUrl(home, d, m, f) {
    const p = new URLSearchParams({
      mode: "sim", home,
      day: String(d + 1),
      t: `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.floor(m % 60)).padStart(2, "0")}`,
    });
    // A custom run carries its scenario in IndexedDB, not /scenarios.
    if (customId) p.set("custom", customId);
    else p.set("scenario", scenarioName);
    if (f) p.set("follow", String(f));
    return `${location.pathname}?${p}`;
  }

  // --- sim UI state (published) + actions (UI calls scene) ---
  simLegendBase = (scene14 ? MOTION_NOTE_SIM_SCENE : MOTION_NOTE_SIM_FLAT)
    + (fillTrees > 0 ? FILL_TREES_SUFFIX : "");
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
      note: simLegendBase,
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

  // --- 12b day-at-a-glance timeline -------------------------------------------
  // Published once per day/follow/home change (the UI moves the
  // playhead underneath from clock.minute). Member 1 stands in when
  // the camera is free, so the strip never goes blank.
  let otherRun = null;
  let otherRunLabel = null;

  function timelineMember(r, followIdx) {
    const hh = (r.agents || []).filter((a) => a.household);
    if (hh.length === 0) return null;
    const i = followIdx > 0 ? Math.min(followIdx - 1, hh.length - 1) : 0;
    return hh[i].key;
  }

  async function ensureOtherRun() {
    if (homes.length < 2) return null;
    const other = (homes.find((h) => h.label !== homeLabel) || {}).label;
    if (!other) return null;
    if (otherRun && otherRunLabel === other) return otherRun;
    if (customRecord && customRecord.runs[other]) {
      otherRun = customRecord.runs[other];
      otherRunLabel = other;
      return otherRun;
    }
    try {
      const file = await loadRunFile(scenarioName, other);
      if (file) {
        otherRun = file;
        otherRunLabel = other;
        return otherRun;
      }
      const via = await workerRuns(scenarioName, [other]);
      if (via && via[other]) {
        otherRun = via[other];
        otherRunLabel = other;
        return otherRun;
      }
    } catch {
      // The B strip stays empty (honest gap, never a guess).
    }
    return null;
  }

  async function paintStripB() {
    if (!store.getState().stripCompare) {
      if (store.getState().dayStripB) store.set({ dayStripB: null });
      return;
    }
    const other = await ensureOtherRun();
    if (!other) {
      if (store.getState().dayStripB) store.set({ dayStripB: null });
      return;
    }
    const key = timelineMember(other, follow);
    const otherDay = Math.min(day, (other.meta.days || days) - 1);
    store.set({ dayStripB: key === null ? null : {
      home: other.meta.home || otherRunLabel,
      segments: daySegments({ run: other, agentKey: key, day: otherDay }),
    } });
  }

  function paintTimeline() {
    const key = timelineMember(run, follow);
    if (key === null) {
      store.set({ dayStrip: null, routeSteps: null, monthStrip: null });
    } else {
      store.set({
        dayStrip: { segments: daySegments({ run, agentKey: key, day }) },
        routeSteps: { outings: outingStepsFor({ run, agentKey: key, day }) },
        monthStrip: monthStrip({ run, agentKey: key }),
      });
    }
    paintStripB();
  }

  async function paintCompare() {
    store.set({ compareLoading: true });
    // A custom run compares its in-memory runs (no CLI files exist).
    if (customRecord) {
      const labs = (customRecord.labels || []).slice(0, 2);
      if (labs.length === 2 && customRecord.runs[labs[0]] && customRecord.runs[labs[1]]) {
        store.set({ compareLoading: false,
          compare: compareRuns(customRecord.runs[labs[0]], customRecord.runs[labs[1]]) });
        return;
      }
    }
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

  // The share dialog (and the tour's share step) needs both docs even
  // when the A·B 비교 tab never opened: reuse the same loaders, skipping
  // what is already there. Errors retry (the money loader's early return
  // covers only a present doc, so a stale error is cleared first).
  async function ensureShareData() {
    const s = store.getState();
    if (!s.compare || s.compare.error) {
      await paintCompare();
    }
    const m = store.getState().money;
    if (!m || m.error) {
      if (m && m.error) store.set({ money: null });
      await paintMoney();
    }
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
      paintTimeline();
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
      paintTimeline();
    },
    toggleStripCompare: async () => {
      store.set({ stripCompare: !store.getState().stripCompare });
      await paintStripB();
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
    ensureShareData: () => ensureShareData(),
    setCompareTab: async (tab) => {
      if (!VALID_COMPARE_TABS.includes(tab)) return;
      store.set({ compareTab: tab });
      if (tab === "criteria") await paintCriteria();
      else if (tab !== "compare") await paintMoney();
    },
    setMoneyTenure: (label, tenure) => {
      store.set({ moneyTenure: { ...store.getState().moneyTenure, [label]: tenure } });
    },
    showListingPin: async ({ lon, lat, label } = {}) => {
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
      const [x, y] = lonLatToXY(lon, lat, origin);
      listingPinTarget = { x, z: -y, label: String(label || "공공 매물") };
    },
    clearListingPin: async () => {
      listingPinTarget = null;
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
  paintTimeline();
  store.set({ ready: true });
  // Itinerary preload: the followed member's work-area detail + corridor.
  ensureItinerary();
  // The money doc feeds the ticker + QoL hover even with the card shut.
  paintMoney();
  // 12b: the floating agent is gone — ?agent=1 (incl. the tour's agent
  // step) shows the tour card, and the chat answers from there on.
  // ?share=1 opens the result card.
  if (PARAMS.get("share") === "1") store.set({ shareOpen: true });
  // ?tab=<id> opens the compare card on that tab (old ids keep working).
  const wantTab = resolveTabId(PARAMS.get("tab"));
  if (wantTab) {
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
        } else {
          paintTimeline();
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
    const simTMin = day * 1440 + minute;
    const simVeh = streetMeshes.updateVehicles(simTMin, vehicleCapFor(renderCtl.quality));
    refreshCongestion();
    const simPed = crowdMeshes.update(simTMin,
      { congScale, cap: pedCapFor(renderCtl.quality) });
    if (trainPulse) trainPulse.update(simTMin);
    for (const tm of treeMeshes) setSway(tm.material, simTMin * 60, swayDayFactor(simEmissive));
    if (waterMesh) setWaterTime(waterMesh.material, simTMin * 60);
    if (sceneWaterMesh) setWaterTime(sceneWaterMesh.material, simTMin * 60);
    logMotion(simTMin, { cars: simVeh.active, peds: simPed.active,
      trains: trainTable ? trainTable.trains : 0,
      ms: simVeh.ms + simPed.ms });
    updateLighting();
    paintFollow(dt, false);
    paintHighlightFrame();
    const jfTrain = journeyFrame();
    if (jfTrain.ride && (jfTrain.phase === "rising" || jfTrain.phase === "cruise"
        || jfTrain.phase === "descending" || jfTrain.phase === "boarding")) {
      journeyLayer.setTrain(jfTrain.ride, minute - Math.floor(minute) + jfTrain.elapsed);
    }
    // Station names ride along the line during the regional phases only.
    if (jfTrain.ride && (jfTrain.phase === "rising" || jfTrain.phase === "cruise"
        || jfTrain.phase === "descending")) {
      journeyLayer.updateStationLabels(camera);
    }
    trackSimViewOffset(camera); // 13e5: stage centre, not canvas centre
    controls.update();
    if (sceneMarkingsMesh) {
      sceneMarkingsMesh.visible = (simFramedWidth ?? 0) <= MARKINGS_HIDE_M;
    }
    if (aviationMat) aviationMat.opacity = aviationBlink(simTMin * 60);
    renderCtl.renderFrame({ bloom: simBloom, framedWidthM: simFramedWidth }, dt);
    frames++;
    if (frames === 30) {
      console.log(`[sim] area=${run.meta.area} agents=${run.meta.agents} ` +
        `day=${day + 1} t=${Math.floor(minute)}`);
    }
  });

  const refitSim = () => refitToWrap(camera, renderCtl, controls);
  addEventListener("resize", refitSim);
  new ResizeObserver(refitSim).observe(document.getElementById("scene-wrap"));
}

loadAreasList().then(() => {
  // 12b: / (no routing params) is the landing, ?chat= the
  // conversation; ?mode=sim… / ?tour=demo deep links keep working.
  const route = routeForSearch(location.search);
  if (route === "sim") bootSim();
  else bootTour(route); // tour | landing | chat (same scene, own UI)
});
