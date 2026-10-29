// Painted-look post passes (stage 14e, browser; three.js EffectComposer).
//
// Painted chain: render → outline+AO → kuwahara → bloom → grade → output.
// The outline/AO pass renders its own packed-depth prepass (RGBADepthPacking
// override, no MSAA — the ANGLE Metal black-frame rule), then darkens
// silhouette/roof edges (35 %, never black) and occluded pixels (≤40 %).
// Kuwahara flattens texture noise into brush-like patches; the pixel step
// renders the main pass below full resolution and upscales with nearest
// filtering (?px=1 disables). Photo style never touches this file.

import * as THREE from "three";
import { Pass, FullScreenQuad } from "three/addons/postprocessing/Pass.js";

// Outlines fade with distance: full strength at high zoom, gone once the
// framed width passes 3 km so the wide view does not turn to noise.
export const OUTLINE_FADE_START_M = 1500;
export const OUTLINE_FADE_END_M = 3000;

// Main-pass downscale on painted high (?px= overrides; ?px=1 disables).
export const PAINTED_PIXEL_HIGH = 1.5;

export function outlineStrengthFor(framedWidthM) {
  const w = Number(framedWidthM);
  if (!Number.isFinite(w)) return 1;
  if (w <= OUTLINE_FADE_START_M) return 1;
  if (w >= OUTLINE_FADE_END_M) return 0;
  return 1 - (w - OUTLINE_FADE_START_M) / (OUTLINE_FADE_END_M - OUTLINE_FADE_START_M);
}

// Kuwahara radius by quality (low has no composer; value unused there).
export function kuwaharaRadiusFor(level) {
  if (level === "high") return 3;
  return 2;
}

// Main-pass pixel factor: explicit ?px= wins when finite and ≥ 1
// (?px=1 is full resolution = disabled), else 1.5 on high, 1 below.
export function paintedPixelFactor(level, pxParam = null) {
  const n = pxParam === null || pxParam === undefined || pxParam === ""
    ? NaN : Number(pxParam);
  if (Number.isFinite(n)) return Math.max(1, n);
  return level === "high" ? PAINTED_PIXEL_HIGH : 1;
}

const PaintedVert = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  }
`;

// Combined depth-outline + screen-space AO over the colour buffer.
// Depth comes from the pass's own packed prepass (tDepth), linearised to
// view metres; edges use the Laplacian (second derivative), so smooth
// slopes stay clean while silhouettes and roof edges pop.
export const OutlineAOShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    cameraNear: { value: 1 },
    cameraFar: { value: 1000 },
    resolution: { value: new THREE.Vector2(1024, 1024) },
    outlineStrength: { value: 1 },
  },
  vertexShader: PaintedVert,
  fragmentShader: /* glsl */`
    #include <packing>
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform float cameraNear;
    uniform float cameraFar;
    uniform vec2 resolution;
    uniform float outlineStrength;
    varying vec2 vUv;

    // View-space depth in metres (positive distance from the camera).
    float viewDepth(vec2 uv) {
      float d = unpackRGBAToDepth(texture2D(tDepth, uv));
      return -perspectiveDepthToViewZ(d, cameraNear, cameraFar);
    }

    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      vec2 px = 1.0 / resolution;
      float c = viewDepth(vUv);
      // Sky (cleared depth) takes neither outline nor AO.
      float sky = step(0.999999, unpackRGBAToDepth(texture2D(tDepth, vUv)));
      float shape = 1.0 - sky;
      // Outlines: |Laplacian| of view depth, relative to the distance so
      // near eaves and far towers edge alike. 35 % darker, never black.
      float n = viewDepth(vUv + vec2(0.0, px.y));
      float s = viewDepth(vUv - vec2(0.0, px.y));
      float e = viewDepth(vUv + vec2(px.x, 0.0));
      float w = viewDepth(vUv - vec2(px.x, 0.0));
      float lap = abs(4.0 * c - n - s - e - w) / max(c, 1.0);
      float edge = smoothstep(0.02, 0.12, lap) * outlineStrength * shape;
      col *= 1.0 - 0.35 * edge;
      // AO: 8 directions x 2 radii (3 px, 6 px); a nearer neighbour
      // occludes, scaled by distance. Darkens at most 40 %.
      float occ = 0.0;
      float eps = 0.05 + c * 0.005;
      float scl = 1.0 + c * 0.02;
      for (int i = 0; i < 8; i++) {
        float a = float(i) * 0.7853982;
        vec2 dir = vec2(cos(a), sin(a));
        float d3 = viewDepth(vUv + dir * 3.0 * px);
        float d6 = viewDepth(vUv + dir * 6.0 * px);
        occ += 0.6 * clamp((c - d3 - eps) / scl, 0.0, 1.0);
        occ += 0.4 * clamp((c - d6 - eps) / scl, 0.0, 1.0);
      }
      occ = clamp(occ / 8.0, 0.0, 1.0) * shape;
      col *= 1.0 - 0.40 * occ;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

// Small Kuwahara filter: each pixel takes the mean of the least-variance
// of four overlapping (r+1)^2 quadrants — texture noise flattens into
// brush-like patches. Radius is baked into the loop bounds (2/3).
export function KuwaharaShader(radius) {
  const r = Math.max(1, Math.min(4, Math.round(radius) || 2));
  const n = ((r + 1) * (r + 1)).toFixed(1);
  const quads = [
    [-r, 0, -r, 0], [0, r, -r, 0], [-r, 0, 0, r], [0, r, 0, r],
  ];
  const taps = quads.map(([x0, x1, y0, y1]) => `
    {
      vec3 sum = vec3(0.0);
      vec3 sq = vec3(0.0);
      for (int x = ${x0}; x <= ${x1}; x++) {
        for (int y = ${y0}; y <= ${y1}; y++) {
          vec3 c = texture2D(tDiffuse, vUv + vec2(float(x), float(y)) * px).rgb;
          sum += c;
          sq += c * c;
        }
      }
      vec3 mean = sum / ${n};
      vec3 varr = abs(sq / ${n} - mean * mean);
      float v = varr.r + varr.g + varr.b;
      if (v < best) { best = v; outc = mean; }
    }`).join("\n");
  return {
    uniforms: {
      tDiffuse: { value: null },
      resolution: { value: new THREE.Vector2(1024, 1024) },
    },
    vertexShader: PaintedVert,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse;
      uniform vec2 resolution;
      varying vec2 vUv;
      void main() {
        vec2 px = 1.0 / resolution;
        vec3 outc = texture2D(tDiffuse, vUv).rgb;
        float best = 1e9;
        ${taps}
        gl_FragColor = vec4(outc, 1.0);
      }
    `,
  };
}

// Outline+AO as one composer pass: packed-depth prepass (override material,
// shadows skipped — the colour pass already solved them this frame), then
// the fullscreen outline/AO shader. Objects flagged userData.noPaintedDepth
// (lamp halos, aviation dots) sit out of the depth render.
export class PaintedPass extends Pass {
  constructor(scene, camera) {
    super();
    this.needsSwap = true;
    this.scene = scene;
    this.camera = camera;
    this.depthTarget = new THREE.WebGLRenderTarget(2, 2, { samples: 0 });
    this.depthOverride = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
    });
    this.uniforms = THREE.UniformsUtils.clone(OutlineAOShader.uniforms);
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: OutlineAOShader.vertexShader,
      fragmentShader: OutlineAOShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.fsQuad = new FullScreenQuad(this.material);
    this.hidden = [];
  }

  setSize(w, h) {
    const W = Math.max(2, Math.round(w));
    const H = Math.max(2, Math.round(h));
    this.depthTarget.setSize(W, H);
    this.uniforms.resolution.value.set(W, H);
  }

  setOutlineStrength(k) {
    this.uniforms.outlineStrength.value = k;
  }

  render(renderer, writeBuffer, readBuffer) {
    const scene = this.scene;
    const camera = this.camera;
    // Depth prepass (packed RGBA, no shadow-map work).
    const shadows = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    const prevOverride = scene.overrideMaterial;
    const prevBackground = scene.background;
    scene.overrideMaterial = this.depthOverride;
    scene.background = null;
    this.hidden.length = 0;
    scene.traverse((o) => {
      if (o.userData && o.userData.noPaintedDepth && o.visible) {
        o.visible = false;
        this.hidden.push(o);
      }
    });
    // Sky/background must read back as far depth: packDepthToRGBA(1) is
    // white, so the prepass clears to white (the default black clear
    // would unpack to the near plane and edge the whole sky).
    const prevClear = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    renderer.setClearColor(0xffffff, 1);
    renderer.setRenderTarget(this.depthTarget);
    renderer.render(scene, camera);
    renderer.setClearColor(prevClear, prevAlpha);
    for (const o of this.hidden) o.visible = true;
    scene.overrideMaterial = prevOverride;
    scene.background = prevBackground;
    renderer.shadowMap.autoUpdate = shadows;
    // Outline + AO over the colour buffer.
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.tDepth.value = this.depthTarget.texture;
    this.uniforms.cameraNear.value = camera.near;
    this.uniforms.cameraFar.value = camera.far;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.fsQuad.render(renderer);
  }

  dispose() {
    this.depthTarget.dispose();
    this.depthOverride.dispose();
    this.material.dispose();
    this.fsQuad.dispose();
  }
}
