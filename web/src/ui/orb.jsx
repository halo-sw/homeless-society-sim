// Seoul/Gyeonggi orb (13, Part 7): the stage when nothing is
// picked. Regions as softly lit extruded shapes, stations as points,
// homes as dots coloured by tenure fit. Drag to rotate, scroll to
// zoom, hover for facts, click a region to filter. Idle motion is
// slow, stops on interaction, respects reduced motion. three.js is
// lazy-loaded; SSR renders the container only.
import { useEffect, useRef, useState } from "react";
import { Text } from "@astryxdesign/core/Text";
import { fmtWon } from "../money/format.js";

export function OrbView({ data, onRegion, highlightKey }) {
  const mountRef = useRef(null);
  const [tip, setTip] = useState(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const cbRef = useRef(onRegion);
  cbRef.current = onRegion;
  const hiRef = useRef(highlightKey);
  hiRef.current = highlightKey;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || typeof window === "undefined") return undefined;
    let disposed = false;
    let renderer = null;
    let raf = 0;
    let drawCalls = 0;
    const reduced = window.matchMedia
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    import("three").then((THREE) => {
      if (disposed || !mount) return;
      const W = mount.clientWidth || 640;
      const H = mount.clientHeight || 420;
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(W, H, false);
      mount.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x101318);
      const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 100);
      camera.position.set(0, 7.5, 9);
      camera.lookAt(0, 0, 0);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 0.9));
      const sun = new THREE.DirectionalLight(0xffffff, 1.4);
      sun.position.set(6, 10, 4);
      scene.add(sun);
      const root = new THREE.Group();
      scene.add(root);
      // Project lon/lat to a tilted disc.
      const project = (lon, lat) => [(lon - 127.08) * 60, (37.62 - lat) * 60];
      const orb = dataRef.current || { shapes: [], points: [], dots: [] };
      const regionMeshes = [];
      const palette = [0x3b82f6, 0x22c55e, 0xf59e0b, 0xef4444, 0x8b5cf6,
        0x14b8a6, 0xec4899, 0x84cc16, 0x64748b];
      orb.shapes.forEach((s, i) => {
        const b = s.bbox || [127.0, 37.4, 127.16, 37.55];
        const [x0, z0] = project(b[0], b[3]);
        const [x1, z1] = project(b[2], b[1]);
        const w = Math.max(Math.abs(x1 - x0), 0.4);
        const d = Math.max(Math.abs(z1 - z0), 0.4);
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(w, 0.35, d),
          new THREE.MeshLambertMaterial({ color: palette[i % palette.length] }));
        mesh.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
        mesh.userData.region = s;
        root.add(mesh);
        regionMeshes.push(mesh);
      });
      const dotGeo = new THREE.SphereGeometry(0.09, 8, 8);
      const dotMeshes = [];
      for (const p of orb.points || []) {
        const [x, z] = project(p.lon, p.lat);
        const m = new THREE.Mesh(dotGeo,
          new THREE.MeshBasicMaterial({ color: 0xffffff }));
        m.position.set(x, 0.3, z);
        root.add(m);
      }
      for (const dot of (orb.dots || []).slice(0, 4000)) {
        const [x, z] = project(dot.lon, dot.lat);
        const m = new THREE.Mesh(dotGeo,
          new THREE.MeshBasicMaterial({ color: dot.color || 0x868e96 }));
        m.position.set(x, dot.found ? 0.55 : 0.35, z);
        m.scale.setScalar(dot.found ? 1.6 : 0.8);
        m.userData.dot = dot;
        root.add(m);
        dotMeshes.push(m);
      }
      drawCalls = renderer.info.render.calls;
      // eslint-disable-next-line no-console
      console.info(`[orb] draw calls: ${drawCalls}`);
      let rotY = 0.5;
      let zoom = 1;
      let dragging = false;
      let lastX = 0;
      let idle = !reduced;
      const el = renderer.domElement;
      const onDown = (e) => { dragging = true; lastX = e.clientX; idle = false; };
      const onUp = () => { dragging = false; };
      const onMove = (e) => {
        if (dragging) {
          rotY += (e.clientX - lastX) * 0.008;
          lastX = e.clientX;
          return;
        }
        const rect = el.getBoundingClientRect();
        const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        const ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2(nx, ny), camera);
        const hit = ray.intersectObjects(regionMeshes, false)[0];
        if (hit && hit.object.userData.region) {
          const s = hit.object.userData.region;
          setTip({ x: e.clientX - rect.left + 12, y: e.clientY - rect.top + 12,
            region: s });
        } else {
          setTip(null);
        }
      };
      const onClick = (e) => {
        if (Math.abs(e.clientX - lastX) > 4 && dragging) return;
        const rect = el.getBoundingClientRect();
        const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        const ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2(nx, ny), camera);
        const hit = ray.intersectObjects(regionMeshes, false)[0];
        if (hit && cbRef.current) cbRef.current(hit.object.userData.region.id);
      };
      const onWheel = (e) => {
        e.preventDefault();
        idle = false;
        zoom = Math.min(2.2, Math.max(0.6, zoom * (e.deltaY > 0 ? 1.08 : 0.93)));
      };
      el.addEventListener("pointerdown", onDown);
      window.addEventListener("pointerup", onUp);
      el.addEventListener("pointermove", onMove);
      el.addEventListener("click", onClick);
      el.addEventListener("wheel", onWheel, { passive: false });
      let last = performance.now();
      let ft = [];
      const tick = (now) => {
        if (disposed) return;
        const dt = Math.min(now - last, 100);
        last = now;
        ft.push(dt);
        if (ft.length > 120) ft.shift();
        if (idle) rotY += (dt / 1000) * 0.12; // slow drift
        root.rotation.y = rotY;
        camera.position.setLength(11.5 / zoom);
        // Card hover highlight: pulse the matching dot.
        const hi = hiRef.current;
        for (const m of dotMeshes) {
          const on = hi && m.userData.dot && m.userData.dot.key === hi;
          m.scale.setScalar(m.userData.dot.found ? (on ? 2.4 : 1.6) : 0.8);
        }
        const t0 = performance.now();
        renderer.render(scene, camera);
        const ms = performance.now() - t0;
        if (ms > 2 && !tick.warned) {
          tick.warned = true;
          // eslint-disable-next-line no-console
          console.info(`[orb] frame render ${ms.toFixed(2)}ms (budget 2ms)`);
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      const onResize = () => {
        const w = mount.clientWidth || 640;
        const h = mount.clientHeight || 420;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      window.addEventListener("resize", onResize);
      return () => {
        el.removeEventListener("pointerdown", onDown);
        window.removeEventListener("pointerup", onUp);
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("click", onClick);
        el.removeEventListener("wheel", onWheel);
        window.removeEventListener("resize", onResize);
      };
    }).catch(() => {});
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      if (renderer) {
        renderer.dispose();
        if (renderer.domElement.parentNode === mount) {
          mount.removeChild(renderer.domElement);
        }
      }
    });
  }, []);

  const tipFacts = tip && tip.region && tip.region.facts;
  return (
    <div className="ui-orb" ref={mountRef} aria-label="서울·경기 동남부 지역 공">
      {tipFacts && (
        <div className="ui-orb-tip" style={{ left: tip.x, top: tip.y }}>
          <div><strong>{tip.region.label}</strong></div>
          <div className="ui-num">{`집 ${tipFacts.homes}곳 · 전세 60㎡ 중간값 ${tipFacts.jeonse60MedianWon ? fmtWon(tipFacts.jeonse60MedianWon) : "없음"}`}</div>
          <div className="ui-num">{`사진 ${tipFacts.photos}장 · 공공임대 ${tipFacts.publicRental ? "있음" : "자료 없음"}`}</div>
          <div><Text type="supporting">클릭하면 이 지역만 찾아요</Text></div>
        </div>
      )}
    </div>
  );
}
