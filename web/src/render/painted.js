// Painted-look post passes (stage 14e, browser; three.js EffectComposer).
//
// Painted chain: render → AO → kuwahara → outline → bloom → grade → output.
// The outline/AO pass renders its own packed-depth prepass (RGBADepthPacking
// override, no MSAA — the ANGLE Metal black-frame rule), then darkens
// silhouette/roof edges (35 %, never black) and occluded pixels (≤40 %).
// Kuwahara (radius 1) flattens texture noise into brush-like patches;
// the main pass renders at full resolution (20a) with linear filtering
// unless ?px=2+ opts into a coarse pixel look. Photo style never touches
// this file.

import * as THREE from "three";
import { Pass, FullScreenQuad } from "three/addons/postprocessing/Pass.js";

// Outlines fade with distance: full strength at high zoom, gone once the
// framed width passes 5 km. The regional journey view (~3.5 km) keeps
// ~45 % edges so corridor blocks still separate (14f; was 3 km = none).
export const OUTLINE_FADE_START_M = 1500;
export const OUTLINE_FADE_END_M = 5000;

// Edge + AO response (14f, single source of truth — the GLSL below
// interpolates these, and the pure mirrors underneath are unit-tested).
// Edges start at a 0.8 % depth step (a 10 m silhouette step at 1 km) and
// saturate at 6 %; facade detail (a 0.3 m slab at 535 m ≈ 0.06 %) stays
// far below. AO eps/scale track the pixel footprint, not the distance —
// the 14e eps (0.05 + c×0.005) sat at 5 m+ in tour range and swallowed
// every ~1 m contact shadow, so AO read as zero everywhere.
export const EDGE_LO = 0.008;
export const EDGE_HI = 0.06;
export const EDGE_DARKEN = 0.35;
export const AO_DARKEN = 0.4;
export const AO_EPS_BASE = 0.05;
export const AO_EPS_K = 0.0006;
export const AO_SCL_BASE = 0.5;
export const AO_SCL_K = 0.002;

// Relative |Laplacian| of view depth (metres over metres).
export function lapDepth(c, n, s, e, w) {
  return Math.abs(4 * c - n - s - e - w) / Math.max(c, 1);
}

function smoothstepJS(lo, hi, x) {
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

// Outline strength 0..1 for a centre depth + 4 neighbours (mirrors GLSL).
export function outlineEdge(c, n, s, e, w) {
  return smoothstepJS(EDGE_LO, EDGE_HI, lapDepth(c, n, s, e, w));
}

// AO tolerance/scale at view depth c (metres), and one occlusion tap.
export function aoEps(c) {
  return AO_EPS_BASE + c * AO_EPS_K;
}

export function aoScale(c) {
  return AO_SCL_BASE + c * AO_SCL_K;
}

export function aoTap(c, d) {
  return Math.min(1, Math.max(0, (c - d - aoEps(c)) / aoScale(c)));
}

// Main-pass scale on painted high (?px= overrides). 20a: full resolution
// by default (the 1/1.5 nearest upscale crawled whenever the camera
// moved); ?px=2 etc. still opts back into a coarse pixel look.
export const PAINTED_PIXEL_HIGH = 1;

export function outlineStrengthFor(framedWidthM) {
  const w = Number(framedWidthM);
  if (!Number.isFinite(w)) return 1;
  if (w <= OUTLINE_FADE_START_M) return 1;
  if (w >= OUTLINE_FADE_END_M) return 0;
  return 1 - (w - OUTLINE_FADE_START_M) / (OUTLINE_FADE_END_M - OUTLINE_FADE_START_M);
}

// Kuwahara radius by quality (low has no composer; value unused there).
// 20a: radius 1 everywhere — the least-variance selector boils under
// sub-pixel camera motion at larger radii. ?kuwa=0 removes the pass
// (radius 0); the painted look is carried by the 1 px outline + grade.
export function kuwaharaRadiusFor(level, kuwaParam = null) {
  if (kuwaParam === "0" || kuwaParam === 0 || kuwaParam === false) return 0;
  if (level === "high") return 1;
  return 1;
}

// Motion-stable Kuwahara radius (20a): the value the chain actually uses.
// Always ≤ 1 by default so the frame stays still when the camera moves.
export function temporalStableKuwahara(level, kuwaParam = null) {
  return kuwaharaRadiusFor(level, kuwaParam);
}

// Main-pass pixel factor: explicit ?px= wins when finite and ≥ 1,
// else 1 on every level (20a: full-res default — see PAINTED_PIXEL_HIGH).
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
//
// 14f: the chain runs this shader TWICE — AO before Kuwahara, edges
// after (outlineStrength/aoStrength gate each term). A 1 px dark line is
// a high-variance outlier to the least-variance Kuwahara selector, so
// edges drawn before it weaken ~4× (axis-aligned) or vanish (diagonal);
// AO is low-frequency and survives. Thresholds/constants come from the
// JS consts above (single source of truth).
export const OutlineAOShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    cameraNear: { value: 1 },
    cameraFar: { value: 1000 },
    resolution: { value: new THREE.Vector2(1024, 1024) },
    outlineStrength: { value: 1 },
    aoStrength: { value: 1 },
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
    uniform float aoStrength;
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
      float edge = smoothstep(${EDGE_LO}, ${EDGE_HI}, lap) * outlineStrength * shape;
      col *= 1.0 - ${EDGE_DARKEN} * edge;
      // AO: 8 directions x 2 radii (3 px, 6 px); a nearer neighbour
      // occludes. Footprint-scaled eps/scale (see aoEps/aoScale), so
      // contact shadows read at any camera distance. Darkens ≤ 40 %.
      float occ = 0.0;
      float eps = ${AO_EPS_BASE} + c * ${AO_EPS_K};
      float scl = ${AO_SCL_BASE} + c * ${AO_SCL_K};
      for (int i = 0; i < 8; i++) {
        float a = float(i) * 0.7853982;
        vec2 dir = vec2(cos(a), sin(a));
        float d3 = viewDepth(vUv + dir * 3.0 * px);
        float d6 = viewDepth(vUv + dir * 6.0 * px);
        occ += 0.6 * clamp((c - d3 - eps) / scl, 0.0, 1.0);
        occ += 0.4 * clamp((c - d6 - eps) / scl, 0.0, 1.0);
      }
      occ = clamp(occ / 8.0, 0.0, 1.0) * shape * aoStrength;
      col *= 1.0 - ${AO_DARKEN} * occ;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

// Fullscreen debug views (?debug=depth|outline, 14f): the linear depth
// the outlines read (near black → far white), and the edge mask itself
// (white edges on black, occluded pixels red-tinted). Both run the same
// packed prepass as the main shader, straight to the screen.
const DebugDepthGLSL = /* glsl */`
  #include <packing>
  uniform sampler2D tDepth;
  uniform float cameraNear;
  uniform float cameraFar;
  varying vec2 vUv;
  float viewDepth(vec2 uv) {
    float d = unpackRGBAToDepth(texture2D(tDepth, uv));
    return -perspectiveDepthToViewZ(d, cameraNear, cameraFar);
  }
`;

export const DebugDepthShader = {
  uniforms: {
    tDepth: { value: null },
    cameraNear: { value: 1 },
    cameraFar: { value: 1000 },
  },
  vertexShader: PaintedVert,
  fragmentShader: DebugDepthGLSL + /* glsl */`
    void main() {
      float c = viewDepth(vUv);
      float t = clamp((c - cameraNear) / max(cameraFar - cameraNear, 1.0), 0.0, 1.0);
      gl_FragColor = vec4(vec3(t), 1.0);
    }
  `,
};

export const DebugEdgeShader = {
  uniforms: {
    tDepth: { value: null },
    cameraNear: { value: 1 },
    cameraFar: { value: 1000 },
    resolution: { value: new THREE.Vector2(1024, 1024) },
    outlineStrength: { value: 1 },
  },
  vertexShader: PaintedVert,
  fragmentShader: DebugDepthGLSL + /* glsl */`
    uniform vec2 resolution;
    uniform float outlineStrength;
    void main() {
      vec2 px = 1.0 / resolution;
      float c = viewDepth(vUv);
      float sky = step(0.999999, unpackRGBAToDepth(texture2D(tDepth, vUv)));
      float shape = 1.0 - sky;
      float n = viewDepth(vUv + vec2(0.0, px.y));
      float s = viewDepth(vUv - vec2(0.0, px.y));
      float e = viewDepth(vUv + vec2(px.x, 0.0));
      float w = viewDepth(vUv - vec2(px.x, 0.0));
      float lap = abs(4.0 * c - n - s - e - w) / max(c, 1.0);
      float edge = smoothstep(${EDGE_LO}, ${EDGE_HI}, lap) * outlineStrength * shape;
      float occ = 0.0;
      float eps = ${AO_EPS_BASE} + c * ${AO_EPS_K};
      float scl = ${AO_SCL_BASE} + c * ${AO_SCL_K};
      for (int i = 0; i < 8; i++) {
        float a = float(i) * 0.7853982;
        vec2 dir = vec2(cos(a), sin(a));
        float d3 = viewDepth(vUv + dir * 3.0 * px);
        float d6 = viewDepth(vUv + dir * 6.0 * px);
        occ += 0.6 * clamp((c - d3 - eps) / scl, 0.0, 1.0);
        occ += 0.4 * clamp((c - d6 - eps) / scl, 0.0, 1.0);
      }
      occ = clamp(occ / 8.0, 0.0, 1.0) * shape;
      gl_FragColor = vec4(vec3(edge) + vec3(occ * 0.7, 0.0, 0.0), 1.0);
    }
  `,
};

// Small Kuwahara filter: each pixel takes the mean of the least-variance
// of four overlapping (r+1)^2 quadrants — texture noise flattens into
// brush-like patches. Radius is baked into the loop bounds (20a default
// r=1; larger radii boil under camera motion).
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
//
// 14f: the painted chain holds TWO instances — AO before Kuwahara, edges
// after (see the shader note). The edge instance shares the AO pass's
// depth target ({ shareDepthFrom }) so the prepass still runs once per
// frame; outlineStrength/aoStrength gate each term per instance.
export class PaintedPass extends Pass {
  constructor(scene, camera, { shareDepthFrom = null } = {}) {
    super();
    this.needsSwap = true;
    this.scene = scene;
    this.camera = camera;
    if (shareDepthFrom) {
      this.depthTarget = shareDepthFrom.depthTarget;
      this.ownsDepth = false;
    } else {
      this.depthTarget = new THREE.WebGLRenderTarget(2, 2, { samples: 0 });
      this.ownsDepth = true;
    }
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
    // Fullscreen debug quads (?debug=depth|outline), one material each.
    this.depthDebug = {
      uniforms: THREE.UniformsUtils.clone(DebugDepthShader.uniforms),
      quad: null,
    };
    this.depthDebug.quad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: this.depthDebug.uniforms,
      vertexShader: DebugDepthShader.vertexShader,
      fragmentShader: DebugDepthShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    }));
    this.edgeDebug = {
      uniforms: THREE.UniformsUtils.clone(DebugEdgeShader.uniforms),
      quad: null,
    };
    this.edgeDebug.quad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: this.edgeDebug.uniforms,
      vertexShader: DebugEdgeShader.vertexShader,
      fragmentShader: DebugEdgeShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    }));
  }

  setSize(w, h) {
    const W = Math.max(2, Math.round(w));
    const H = Math.max(2, Math.round(h));
    // The shared target is the owner's to resize (same size either way).
    if (this.ownsDepth) this.depthTarget.setSize(W, H);
    this.uniforms.resolution.value.set(W, H);
  }

  setOutlineStrength(k) {
    this.uniforms.outlineStrength.value = k;
  }

  setAOStrength(k) {
    this.uniforms.aoStrength.value = k;
  }

  renderDepthPrepass(renderer) {
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
  }

  render(renderer, writeBuffer, readBuffer) {
    const camera = this.camera;
    // The edge instance reuses the AO pass's prepass (same frame, same
    // camera — the composer runs the AO instance first).
    if (this.ownsDepth) this.renderDepthPrepass(renderer);
    // Outline + AO over the colour buffer.
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.tDepth.value = this.depthTarget.texture;
    this.uniforms.cameraNear.value = camera.near;
    this.uniforms.cameraFar.value = camera.far;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.fsQuad.render(renderer);
  }

  // Fullscreen debug view (?debug=depth|outline): own prepass at the live
  // drawing-buffer size, then the debug shader straight to the screen —
  // no composer, so it works at every quality level.
  renderDebug(renderer, mode) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.setSize(size.x, size.y);
    this.renderDepthPrepass(renderer);
    const dbg = mode === "outline" ? this.edgeDebug : this.depthDebug;
    dbg.uniforms.tDepth.value = this.depthTarget.texture;
    dbg.uniforms.cameraNear.value = this.camera.near;
    dbg.uniforms.cameraFar.value = this.camera.far;
    if (dbg.uniforms.resolution) {
      dbg.uniforms.resolution.value.set(size.x, size.y);
    }
    if (dbg.uniforms.outlineStrength) {
      dbg.uniforms.outlineStrength.value = this.uniforms.outlineStrength.value;
    }
    renderer.setRenderTarget(null);
    dbg.quad.render(renderer);
  }

  dispose() {
    if (this.ownsDepth) this.depthTarget.dispose();
    this.depthOverride.dispose();
    this.material.dispose();
    this.fsQuad.dispose();
    this.depthDebug.quad.dispose();
    this.edgeDebug.quad.dispose();
  }
}
