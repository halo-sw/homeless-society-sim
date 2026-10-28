// Miniature 3D scene app: loads one area, builds the merged scene, plays
// the residential tour. All data-math lives in the pure src/* modules
// (unit-tested); this file only wires three.js, the DOM, and playback.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import "./style.css";
import { bboxToXY, lonLatToWorld, lonLatToXY } from "./frame.js";
import { buildBuildings } from "./buildings.js";
import { buildGround } from "./ground.js";
import { GLIDE_FRAME_M, STOP_FRAME_M, TOUR_FOV_DEG, distanceForWidth, tourOffset } from "./camera.js";
import { loadArea, originOf } from "./load.js";
import { PAPER } from "./palette.js";
import { sunDirection } from "./lighting.js";
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

const areaId = new URLSearchParams(location.search).get("area") || DEFAULT_AREA;

function toGeometry(data) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(data.positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(data.normals, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(data.colors, 3));
  return geo;
}

async function boot() {
  const loading = document.getElementById("loading");
  let area;
  try {
    area = await loadArea(areaId, async (url) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      return r.json();
    });
  } catch (err) {
    loading.textContent = `지역을 불러오지 못했습니다 (${areaId}): ${err.message}`;
    throw err;
  }
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
  scene.add(new THREE.HemisphereLight(0xfff8ec, 0xcbbfa8, 1.1));

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

  buildUI(area, plan);
  loading.remove();
  document.getElementById("fade").classList.add("clear");

  // --- tour playback ---
  const player = createPlayer(plan, legPaths, camera, controls, origin);
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
function createPlayer(plan, legPaths, camera, controls, origin) {
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
  // the glide and settles on the stop, target centred.
  function poseFor(i, t) {
    const path = legPaths[i].length > 1 ? legPaths[i] : [stopPoint(i)];
    const fi = t * (path.length - 1);
    const i0 = Math.floor(fi);
    const i1 = Math.min(path.length - 1, i0 + 1);
    const f = fi - i0;
    const wp = [0, 1, 2].map((k) => path[i0][k] + (path[i1][k] - path[i0][k]) * f);
    const ahead = path[Math.min(path.length - 1, i1 + 2)];
    const dist = stopDist + (glideDist - stopDist) * (1 - t);
    const [ox, oy, oz] = tourOffset(dist);
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

boot();
