// Renderer seam (browser; three.js) — the one integration point with
// main.js (stage 5a merges around it).
//
// createRenderer({canvas, params}) builds the WebGLRenderer (AgX tone
// mapping, sRGB output, PCFSoft shadows) plus the post chain;
// renderFrame({bloom}, dt) draws one frame, gathers stats, and
// auto-drops to low when the first 60 frames average below 25 fps.

import * as THREE from "three";
import { createPost } from "./post.js";
import {
  AUTO_DROP_FPS, AUTO_DROP_FRAMES, parseQuality, qualitySettings, shouldDropToLow,
} from "./quality.js";

export const STAT_FRAMES = [30, 120];

export function createRenderer({ canvas, params }) {
  const search = params instanceof URLSearchParams ? params : new URLSearchParams(params || "");
  let quality = parseQuality(search);
  const tilt = search.get("tilt") !== "0";
  const grain = search.get("grain") === "1";

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  let scene = null;
  let camera = null;
  let post = null;
  const frameTimes = [];
  let dropped = quality === "low";
  let frames = 0;
  let emaMs = 0;
  const ctl = {
    renderer,
    onQuality: null, // (level) => void — main rewires rig shadows etc.
    get quality() {
      return quality;
    },
    get level() {
      return qualitySettings(quality);
    },
    attach(nextScene, nextCamera) {
      scene = nextScene;
      camera = nextCamera;
      post = createPost(renderer, scene, camera, { quality, tilt, grain });
      ctl.setSize(window.innerWidth, window.innerHeight);
    },
    setSize(w, h) {
      renderer.setSize(w, h);
      if (post) post.setSize(w, h);
    },
    applyPixelRatio() {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, ctl.level.pixelRatio));
      if (scene && camera) ctl.setSize(window.innerWidth, window.innerHeight);
    },
    setQuality(level, reason = "") {
      if (level === quality) return;
      quality = level;
      ctl.applyPixelRatio();
      if (post) post.setQuality(level, { tilt, grain });
      console.log(`[render] quality=${level}${reason ? ` (${reason})` : ""}`);
      if (ctl.onQuality) ctl.onQuality(level);
    },
    // Scene-only draw calls/triangles (the composer would add its own
    // passes to renderer.info, so measure with one direct render).
    measureScene() {
      renderer.info.reset();
      renderer.render(scene, camera);
      const info = renderer.info.render;
      return { calls: info.calls, triangles: info.triangles };
    },
    renderFrame({ bloom = 0 } = {}, dt = 0.016) {
      const t0 = performance.now();
      if (post) {
        post.update({ bloom }, dt);
        post.render();
      } else if (scene && camera) {
        renderer.render(scene, camera);
      }
      const ms = performance.now() - t0;
      frames++;
      emaMs = frames === 1 ? ms : emaMs * 0.95 + ms * 0.05;
      if (!dropped && frameTimes.length < AUTO_DROP_FRAMES) {
        frameTimes.push(ms);
        if (frameTimes.length === AUTO_DROP_FRAMES) {
          if (shouldDropToLow(frameTimes)) {
            dropped = true;
            ctl.setQuality("low", `auto: first ${AUTO_DROP_FRAMES} frames below ${AUTO_DROP_FPS} fps`);
          } else {
            dropped = true; // decided; never upgrades
            const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
            console.log(`[render] quality holds at ${quality} (${(1000 / avg).toFixed(1)} fps over ${AUTO_DROP_FRAMES} frames)`);
          }
        }
      }
      if (STAT_FRAMES.includes(frames) && scene && camera) {
        const m = ctl.measureScene();
        console.log(`[render] frame=${frames} q=${quality} drawCalls=${m.calls} ` +
          `triangles=${m.triangles} frameMs=${emaMs.toFixed(1)} (scene only)`);
      }
    },
  };

  ctl.applyPixelRatio();
  console.log(`[render] initial quality=${quality} tilt=${tilt} grain=${grain}`);
  return ctl;
}
