// Renderer seam (browser; three.js) — the one integration point with
// main.js (stage 5a merges around it).
//
// createRenderer({canvas, params}) builds the WebGLRenderer (AgX tone
// mapping, sRGB output, PCFSoft shadows) plus the post chain;
// renderFrame({bloom}, dt) draws one frame, gathers stats, and
// auto-drops to low when the first 60 frames average below 25 fps.

import * as THREE from "three";
import { createPost, frameIsUniform } from "./post.js";
import {
  AUTO_DROP_FPS, AUTO_DROP_FRAMES, parseQuality, qualitySettings, shouldDropToLow,
} from "./quality.js";
import { resolveLook } from "./look.js";
import { resolvePostDebug } from "./post.js";
import { resolveStyle } from "../camera.js";

// Output transform per style (pure): photo keeps the filmic AgX curve,
// painted uses a linear (exposure-gain-only) transform — 17c found AgX
// darkening every flat ~10 % and compressing the roof/ground albedo gap
// (19 levels → 8) on the GPU capture, so the painted palette never
// survived to the screen. The palette IS the painted picture.
export function toneMappingFor(style) {
  return style === "painted" ? THREE.LinearToneMapping : THREE.AgXToneMapping;
}

export const STAT_FRAMES = [30, 120];
// Black-frame guard sample points (checked only on high, where the SAO
// path runs): two early frames, then done.
export const GUARD_FRAMES = [10, 45];
export const GUARD_SAMPLE = 8; // 8×8 centre pixels

export function createRenderer({ canvas, params }) {
  const search = params instanceof URLSearchParams ? params : new URLSearchParams(params || "");
  const viewportWidth = typeof window === "undefined" ? null : window.innerWidth;
  let quality = parseQuality(search, { viewportWidth });
  const tilt = search.get("tilt") !== "0";
  const grain = search.get("grain") === "1";
  const sao = search.get("sao") !== "0";
  const style = resolveStyle(search); // ?style=painted (default) | photo
  const debug = resolvePostDebug(search, style); // ?debug= painted-only view
  const px = search.get("px"); // ?px= painted pixel-factor override
  const kuwa = search.get("kuwa"); // ?kuwa=0 drops the Kuwahara pass
  const look = resolveLook(search); // ?look=key:value,… (stage 11)

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.toneMapping = toneMappingFor(style);
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  let scene = null;
  let camera = null;
  let post = null;
  let container = null; // docked-panel layout: canvas fills this, not the window
  const frameTimes = [];
  let dropped = quality === "low";
  let frames = 0;
  let emaMs = 0;
  let guardDone = false;
  const ctl = {
    renderer,
    onQuality: null, // (level) => void — main rewires rig shadows etc.
    get quality() {
      return quality;
    },
    get level() {
      return qualitySettings(quality);
    },
    get chainSpec() {
      return post ? post.spec : [];
    },
    attach(nextScene, nextCamera, nextContainer = null) {
      scene = nextScene;
      camera = nextCamera;
      container = nextContainer;
      post = createPost(renderer, scene, camera, { quality, tilt, grain, sao,
        style, debug, px, kuwa, bloomThreshold: look.bloomThreshold,
        gradeSaturation: look.gradeSaturation });
      ctl.fitContainer();
    },
    fitContainer() {
      const w = container ? container.clientWidth : window.innerWidth;
      const h = container ? container.clientHeight : window.innerHeight;
      ctl.setSize(Math.max(2, w), Math.max(2, h));
    },
    setSize(w, h) {
      renderer.setSize(w, h);
      if (post) post.setSize(w, h);
    },
    applyPixelRatio() {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, ctl.level.pixelRatio));
      if (scene && camera) ctl.fitContainer();
    },
    setQuality(level, reason = "") {
      if (level === quality) return;
      quality = level;
      ctl.applyPixelRatio();
      if (post) post.setQuality(level, { tilt, grain, sao });
      console.log(`[render] quality=${level}${reason ? ` (${reason})` : ""}`);
      if (ctl.onQuality) ctl.onQuality(level);
    },
    // Synchronous centre-pixel readback for the black-frame guard. Must
    // run in the same task as the render (no preserveDrawingBuffer).
    sampleFrame() {
      try {
        const gl = renderer.getContext();
        const size = renderer.getDrawingBufferSize(new THREE.Vector2());
        const w = GUARD_SAMPLE;
        const h = GUARD_SAMPLE;
        const x = Math.max(0, Math.floor(size.x / 2 - w / 2));
        const y = Math.max(0, Math.floor(size.y / 2 - h / 2));
        const buf = new Uint8Array(w * h * 4);
        gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        return buf;
      } catch {
        return null;
      }
    },
    // Scene-only draw calls/triangles (the composer would add its own
    // passes to renderer.info, so measure with one direct render).
    measureScene() {
      renderer.info.reset();
      renderer.render(scene, camera);
      const info = renderer.info.render;
      return { calls: info.calls, triangles: info.triangles };
    },
    renderFrame({ bloom = 0, framedWidthM = null } = {}, dt = 0.016) {
      const t0 = performance.now();
      if (post) {
        post.update({ bloom, framedWidthM }, dt);
        post.render();
      } else if (scene && camera) {
        renderer.render(scene, camera);
      }
      const ms = performance.now() - t0;
      frames++;
      emaMs = frames === 1 ? ms : emaMs * 0.95 + ms * 0.05;
      if (!guardDone && quality === "high" && GUARD_FRAMES.includes(frames)) {
        const px = ctl.sampleFrame();
        if (px && frameIsUniform(px)) {
          guardDone = true;
          ctl.setQuality("medium", "auto: uniform (black) framebuffer on high — SAO path disabled");
        } else if (frames === GUARD_FRAMES[GUARD_FRAMES.length - 1]) {
          guardDone = true;
          console.log("[render] frame guard: framebuffer varies, high holds");
        }
      }
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
  console.log(`[render] initial quality=${quality} style=${style} debug=${debug ?? "off"} px=${px ?? "auto"} tilt=${tilt} grain=${grain} sao=${sao}`);
  return ctl;
}
