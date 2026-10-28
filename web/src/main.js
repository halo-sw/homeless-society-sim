// Miniature 3D scene app: loads one area, builds the merged scene, plays
// the residential tour. All data-math lives in the pure src/* modules
// (unit-tested); this file only wires three.js, the DOM, and playback.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import "./style.css";
import { bboxToXY, lonLatToWorld, lonLatToXY } from "./frame.js";
import { buildBuildings } from "./buildings.js";
import { buildGround } from "./ground.js";
import { GLIDE_FRAME_M, STOP_FRAME_M, TOUR_AZIMUTH, TOUR_FOV_DEG, distanceForWidth, footprintsOf, pickStopAzimuth, tourOffset } from "./camera.js";
import { loadArea, originOf } from "./load.js";
import { PAPER } from "./palette.js";
import { solarPosition, sunDirection } from "./lighting.js";
import { compare as compareRuns } from "./engine/simulate.js";
import { SIM_TICK_S, SPEEDS, daylightFactor, followCaption, formatClock, homeOccupancy, indexRun, parseTParam, sampleAgent, simInstant } from "./sim.js";
import { DWELL_S, legGlideDuration, pathWaypoints, seekState, selectTourStops, tourSchedule } from "./tour.js";
import { TREE_CANOPY_R, TREE_CANOPY_Y, TREE_TRUNK_H, TREE_TRUNK_R_BOTTOM, TREE_TRUNK_R_TOP, placeTrees } from "./trees.js";
import { assignWalkers, sampleWalker } from "./walkers.js";

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
const SUN_DATE = new Date("2026-10-15T15:00:00+09:00");

const PARAMS = new URLSearchParams(location.search);
const areaId = PARAMS.get("area") || DEFAULT_AREA;

function toGeometry(data) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(data.positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(data.normals, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(data.colors, 3));
  return geo;
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

  // --- renderer / scene / camera ---
  const canvas = document.getElementById("scene");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.Fog(PAPER, span * 1.6, span * 3.2);
  const camera = new THREE.PerspectiveCamera(TOUR_FOV_DEG, innerWidth / innerHeight, 1, span * 8);
  const homeDist = distanceForWidth(span, TOUR_FOV_DEG, camera.aspect);
  const [hox, hoy, hoz] = tourOffset(homeDist);
  camera.position.set(cx + hox, hoy, -cy + hoz);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(cx, 0, -cy);
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.update();

  // --- lights: directional sun + hemisphere fill ---
  const sunDir = sunDirection(origin.lat, origin.lon, SUN_DATE);
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.4);
  sun.position.set(cx + sunDir[0] * span, sunDir[1] * span, -cy + sunDir[2] * span);
  sun.target.position.set(cx, 0, -cy);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -span * 0.75;
  sc.right = span * 0.75;
  sc.top = span * 0.75;
  sc.bottom = -span * 0.75;
  sc.near = span * 0.1;
  sc.far = span * 4;
  sc.updateProjectionMatrix();
  sun.shadow.bias = -0.0004;
  sun.shadow.intensity = 0.32; // soft light shadows, not dark slabs
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xfff8ec, 0xcbbfa8, 1.1);
  scene.add(hemi);

  // --- ground: paper base + merged ground layer ---
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(span * 1.5, span * 1.5),
    new THREE.MeshLambertMaterial({ color: PAPER })
  );
  base.rotation.x = -Math.PI / 2;
  base.position.set(cx, -0.05, -cy);
  base.receiveShadow = true;
  scene.add(base);
  const buildingsById = new Map(area.buildings.map((b) => [b.id, b]));
  const groundData = buildGround(area.roads, area.landuse, area.complexes, buildingsById, origin);
  const groundMesh = new THREE.Mesh(toGeometry(groundData),
    new THREE.MeshLambertMaterial({ vertexColors: true }));
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  // --- buildings: two merged meshes (residential / context) ---
  const built = buildBuildings(area.buildings, area.complexes, origin);
  const resMesh = new THREE.Mesh(toGeometry(built.residential),
    new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  const nonMesh = new THREE.Mesh(toGeometry(built.nonResidential),
    new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true }));
  resMesh.castShadow = true;
  resMesh.receiveShadow = true;
  nonMesh.castShadow = true;
  nonMesh.receiveShadow = true;
  scene.add(resMesh, nonMesh);

  // --- decorative trees (instanced trunk + canopy) ---
  const { trees, trunkColor } = placeTrees(area, origin);
  const dummy = new THREE.Object3D();
  const trunkMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(TREE_TRUNK_R_TOP, TREE_TRUNK_R_BOTTOM, TREE_TRUNK_H, 5),
    new THREE.MeshLambertMaterial({ color: trunkColor }), Math.max(trees.length, 1));
  const canopyMesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(TREE_CANOPY_R, 1),
    new THREE.MeshLambertMaterial({ color: 0xffffff }), Math.max(trees.length, 1));
  trees.forEach((t, i) => {
    dummy.position.set(t.x, (TREE_TRUNK_H / 2) * t.scale, -t.y);
    dummy.scale.setScalar(t.scale);
    dummy.rotation.set(0, t.phase, 0);
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(i, dummy.matrix);
    dummy.position.set(t.x, TREE_CANOPY_Y * t.scale, -t.y);
    dummy.scale.set(t.scale, t.scale * 1.05, t.scale);
    dummy.updateMatrix();
    canopyMesh.setMatrixAt(i, dummy.matrix);
    canopyMesh.setColorAt(i, new THREE.Color(t.color));
  });
  trunkMesh.count = trees.length;
  canopyMesh.count = trees.length;
  canopyMesh.castShadow = true;
  if (canopyMesh.instanceColor) canopyMesh.instanceColor.needsUpdate = true;
  scene.add(trunkMesh, canopyMesh);
  const resBaseColors = new Float32Array(built.residential.colors);
  return {
    origin, cx, cy, span, renderer, scene, camera, controls, sun, hemi,
    base, groundMesh, resMesh, nonMesh, resBaseColors,
    resRanges: built.residential.ranges, trees, trunkMesh, canopyMesh, dummy,
  };
}

async function bootTour() {
  const area = await fetchArea(areaId);
  const { origin, renderer, scene, camera, controls, nonMesh, trees, dummy } = buildWorld(area);

  // --- preview walkers (instanced capsules, simulated) ---
  const walkers = assignWalkers(area.buildings, area.graph);
  const walkerMesh = new THREE.InstancedMesh(
    new THREE.CapsuleGeometry(0.32, 1.0, 3, 8),
    new THREE.MeshLambertMaterial({ color: 0xffffff }), Math.max(walkers.length, 1));
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
  // stop to look around towers between the camera and the target.
  const stopDist0 = distanceForWidth(STOP_FRAME_M, TOUR_FOV_DEG, camera.aspect);
  const footprints = footprintsOf(area.buildings, origin);
  const stopAzimuths = plan.stops.map((s, i) => {
    const wp = legPaths[i].length > 1
      ? legPaths[i][legPaths[i].length - 1]
      : lonLatToWorld(s.lon, s.lat, origin, 2);
    // Clear the view toward both the named stop anchor and the settled
    // path end (the camera centres on the latter).
    const anchor = lonLatToXY(s.lon, s.lat, origin);
    const picked = pickStopAzimuth([anchor, [wp[0], -wp[2]]], footprints, stopDist0);
    const moved = picked.azimuth !== TOUR_AZIMUTH;
    console.log(`[occlusion] stop=${i} ${s.name} azimuth=[${picked.azimuth}] ` +
      `occluders=${picked.occluders}${moved ? " (moved)" : ""}`);
    return picked.azimuth;
  });

  buildUI(area, plan);
  buildModeSwitch("tour");
  document.getElementById("loading").remove();
  document.getElementById("fade").classList.add("clear");

  // --- tour playback ---
  const player = createPlayer(plan, legPaths, camera, controls, origin, stopAzimuths);
  const playBtn = document.getElementById("play");
  // Debug flags for deterministic captures: ?shot=<stopIndex> jumps to
  // that stop and pauses; ?t=<seconds> jumps the tour clock.
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
  }
  playBtn.addEventListener("click", () => {
    player.toggle();
    playBtn.textContent = player.playing ? "일시정지" : "재생";
  });
  document.getElementById("resOnly").addEventListener("change", (e) => {
    nonMesh.material.opacity = e.target.checked ? 0.3 : 1.0;
  });

  // --- loop ---
  const clock = new THREE.Clock();
  let frames = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;
    player.update(dt);
    updateWalkers(walkerMesh, walkers, area.graph.nodes, origin, t, dummy);
    controls.update();
    renderer.render(scene, camera);
    frames++;
    if (frames === 30) {
      const info = renderer.info.render;
      console.log(`[scene] area=${areaId} drawCalls=${info.calls} triangles=${info.triangles} ` +
        `buildings=${area.buildings.length} trees=${trees.length} walkers=${walkers.length}`);
    }
  });

  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
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
function createPlayer(plan, legPaths, camera, controls, origin, stopAzimuths = []) {
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
  // default azimuth keeps the move readable.
  function poseFor(i, t) {
    const path = legPaths[i].length > 1 ? legPaths[i] : [stopPoint(i)];
    const fi = t * (path.length - 1);
    const i0 = Math.floor(fi);
    const i1 = Math.min(path.length - 1, i0 + 1);
    const f = fi - i0;
    const wp = [0, 1, 2].map((k) => path[i0][k] + (path[i1][k] - path[i0][k]) * f);
    const ahead = path[Math.min(path.length - 1, i1 + 2)];
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
  const area = await fetchArea(run.meta.area);
  simAreaId = run.meta.area;
  const homes = scenario && Array.isArray(scenario.homes) && scenario.homes.length > 0
    ? scenario.homes
    : [{ label: homeLabel, area: run.meta.area, complex_name: run.meta.complex }];
  const { origin, cx, cy, span, renderer, scene, camera, controls, sun, hemi,
    resMesh, nonMesh, resBaseColors, resRanges } = buildWorld(area);

  // --- run indexes ---
  const indexed = indexRun(run);
  const nodeLonLat = new Map(Object.entries(area.graph.nodes));
  const edgeLen = new Map(area.graph.edges.walk.map((e) => [`${e.from}>${e.to}`, e.length_m]));
  const homeLonLat = new Map(run.agents.map((a) => [a.key, nodeLonLat.get(a.home_node) || [origin.lon, origin.lat]]));
  const household = run.agents.filter((a) => a.household);
  const background = run.agents.filter((a) => !a.household);
  const rangeById = new Map(resRanges.map((r) => [r.id, r]));

  // --- agent meshes: household large + highlighted, neighbours small ---
  const dummy = new THREE.Object3D();
  const hhMesh = new THREE.InstancedMesh(
    new THREE.CapsuleGeometry(0.5, 1.4, 3, 10),
    new THREE.MeshLambertMaterial({ color: 0xffffff }), Math.max(household.length, 1));
  const hhColors = [0xc0392b, 0x2471a3, 0x1e8449, 0x8e44ad];
  household.forEach((a, i) => hhMesh.setColorAt(i, new THREE.Color(hhColors[i % hhColors.length])));
  hhMesh.count = household.length;
  hhMesh.castShadow = true;
  if (hhMesh.instanceColor) hhMesh.instanceColor.needsUpdate = true;
  const bgMesh = new THREE.InstancedMesh(
    new THREE.CapsuleGeometry(0.3, 0.9, 3, 8),
    new THREE.MeshLambertMaterial({ color: 0xffffff }), Math.max(background.length, 1));
  const coatColors = [0x5a6e8c, 0x8c5a5a, 0x5a8c6e, 0x777788, 0x3d5a5a];
  background.forEach((a, i) => bgMesh.setColorAt(i, new THREE.Color(coatColors[i % coatColors.length])));
  bgMesh.count = background.length;
  if (bgMesh.instanceColor) bgMesh.instanceColor.needsUpdate = true;
  scene.add(hhMesh, bgMesh);

  function placeAgents(day, minute) {
    for (const [mesh, list, height] of [[hhMesh, household, 1.35], [bgMesh, background, 1.0]]) {
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
  }

  // --- sim clock ---
  const days = run.meta.days;
  let day = Math.min(days - 1, Math.max(0, (Number.parseInt(PARAMS.get("day") || "1", 10) || 1) - 1));
  let minute = parseTParam(PARAMS.get("t")) ?? 420;
  let playing = true;
  let speed = 1;
  let follow = Math.min(household.length, Math.max(0, Number.parseInt(PARAMS.get("follow") || "0", 10) || 0));
  const clockEl = document.getElementById("simClock");
  const simPlayBtn = document.getElementById("simPlay");
  const caption = document.getElementById("caption");
  const capName = document.getElementById("capName");
  const capMeta = document.getElementById("capMeta");
  const capWalk = document.getElementById("capWalk");
  document.getElementById("dots").style.display = "none";

  function paintClock() {
    clockEl.textContent = formatClock(run.meta.start_date, day, Math.floor(minute), days);
    document.getElementById("dayJump").value = String(day + 1);
  }

  // --- sun/sky follow sim time; night window glow per building ---
  const daySky = new THREE.Color(PAPER);
  const nightSky = new THREE.Color(0x141a26);
  const warm = [1.0, 0.87, 0.64];
  let lastLightKey = "";
  let lastGlowKey = "";
  let glowDirty = false;

  function updateLighting() {
    const m = Math.floor(minute);
    const key = `${day}:${m}`;
    if (key === lastLightKey) return;
    lastLightKey = key;
    const instant = simInstant(run.meta.start_date, day, m);
    const { altitude } = solarPosition(origin.lat, origin.lon, instant);
    const f = daylightFactor(altitude);
    const dir = sunDirection(origin.lat, origin.lon, instant);
    sun.position.set(cx + dir[0] * span, Math.max(dir[1], 0.06) * span, -cy + dir[2] * span);
    sun.intensity = 0.05 + 2.35 * f;
    hemi.intensity = 0.45 + 0.65 * f;
    scene.background.lerpColors(nightSky, daySky, f);
    scene.fog.color.copy(scene.background);
    updateGlow(m, 1 - f);
  }

  function updateGlow(m, nightF) {
    const key = `${day}:${Math.floor(m / 30)}:${nightF.toFixed(2)}`;
    if (key === lastGlowKey) return;
    lastGlowKey = key;
    const colors = resMesh.geometry.attributes.color;
    if (nightF <= 0.01) {
      if (!glowDirty) return;
      colors.array.set(resBaseColors);
      colors.needsUpdate = true;
      glowDirty = false;
      return;
    }
    const occ = homeOccupancy(run, indexed, day, m);
    const arr = colors.array;
    for (const [bid, slot] of occ) {
      const range = rangeById.get(bid);
      if (!range) continue;
      const k = (slot.home / slot.total) * nightF * 0.85;
      for (let v = range.start; v < range.start + range.count; v++) {
        arr[v * 3] = resBaseColors[v * 3] + (warm[0] - resBaseColors[v * 3]) * k;
        arr[v * 3 + 1] = resBaseColors[v * 3 + 1] + (warm[1] - resBaseColors[v * 3 + 1]) * k;
        arr[v * 3 + 2] = resBaseColors[v * 3 + 2] + (warm[2] - resBaseColors[v * 3 + 2]) * k;
      }
    }
    colors.needsUpdate = true;
    glowDirty = true;
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
    if (snapFollow) {
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
    nonMesh.material.opacity = e.target.checked ? 0.3 : 1.0;
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
  }

  loading.remove();
  document.getElementById("fade").classList.add("clear");
  paintClock();
  paintFollow(0.016, true);

  // --- loop ---
  const clock = new THREE.Clock();
  let frames = 0;
  let lastMinuteShown = -1;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.5);
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
    updateLighting();
    paintFollow(dt, false);
    controls.update();
    renderer.render(scene, camera);
    frames++;
    if (frames === 30) {
      const info = renderer.info.render;
      console.log(`[sim] area=${run.meta.area} drawCalls=${info.calls} triangles=${info.triangles} ` +
        `agents=${run.meta.agents} day=${day + 1} t=${Math.floor(minute)}`);
    }
  });

  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
}

if (PARAMS.get("mode") === "sim") bootSim();
else bootTour();
