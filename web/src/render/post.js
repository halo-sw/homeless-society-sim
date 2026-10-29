// Post-processing chain (browser; three.js EffectComposer).
//
// high:   Render → SAO → Bloom → Tilt-shift → Grade → Output
// medium: Render → Bloom → Tilt-shift → Grade → Output
// low:    direct render (no composer).
// Bloom strength follows the sky (lit windows / lamps at night and
// dusk, off by day). Tilt-shift is the mild vertical-DOF
// miniature-photo feel (?tilt=0 disables); grain is off by default
// (?grain=1 enables). CSM was considered for the large spans and
// rejected: one target-following shadow frustum (render/rig.js) is
// cheaper and robust under SwiftShader.

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { SAOPass } from "three/addons/postprocessing/SAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { qualitySettings } from "./quality.js";
import { DEFAULT_LOOK } from "./look.js";

const TiltShiftShader = {
  uniforms: {
    tDiffuse: { value: null },
    focus: { value: 0.5 },
    range: { value: 0.42 },
    maxBlur: { value: 0.0035 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float focus;
    uniform float range;
    uniform float maxBlur;
    varying vec2 vUv;
    void main() {
      float d = clamp(abs(vUv.y - focus) / range, 0.0, 1.0);
      float blur = maxBlur * d * d;
      vec3 col = texture2D(tDiffuse, vUv).rgb * 0.227;
      vec2 o1 = vec2(0.0, blur * 1.384);
      vec2 o2 = vec2(0.0, blur * 3.230);
      col += texture2D(tDiffuse, vUv + o1).rgb * 0.316;
      col += texture2D(tDiffuse, vUv - o1).rgb * 0.316;
      col += texture2D(tDiffuse, vUv + o2).rgb * 0.0703;
      col += texture2D(tDiffuse, vUv - o2).rgb * 0.0703;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    vignette: { value: 0.22 },
    grain: { value: 0.0 },
    time: { value: 0.0 },
    saturation: { value: DEFAULT_LOOK.gradeSaturation },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float vignette;
    uniform float grain;
    uniform float time;
    uniform float saturation;
    varying vec2 vUv;
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7)) + time * 13.0) * 43758.5453);
    }
    float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      // Gentle colour grade (stage 6): warm highlights, neutral shadows,
      // a touch more saturation. Shadows keep their hue (no split-tone).
      // Saturation from the look table (stage 11: 1.12 default).
      float l = luma(c.rgb);
      float hi = smoothstep(0.45, 1.0, l);
      c.rgb *= mix(vec3(1.0), vec3(1.045, 1.005, 0.955), hi);
      c.rgb = mix(vec3(l), c.rgb, saturation);
      vec2 q = vUv - 0.5;
      c.rgb *= 1.0 - vignette * dot(q, q) * 2.2;
      if (grain > 0.0) {
        c.rgb += (hash(vUv * vec2(1920.0, 1080.0)) - 0.5) * grain;
      }
      gl_FragColor = c;
    }
  `,
};

// Pure chain spec: the single source of truth for pass order, mirrored
// by build() below and asserted in tests (output last, SAO before bloom,
// SAO only with zero MSAA samples — the ANGLE Metal black-frame fix).
export function postChainSpec(level, { saoOff = false } = {}) {
  const s = qualitySettings(level);
  if (!s.composer) return ["render"];
  const chain = ["render"];
  if (s.sao && !saoOff) chain.push("sao");
  chain.push("bloom", "tilt", "grade", "output");
  return chain;
}

// Pure framebuffer uniformity check for the black-frame guard: true when
// every sampled pixel is within eps of the first AND the frame is dark.
// A healthy frame always varies (buildings, sky, lamps at night).
export function frameIsUniform(pixels, { eps = 2, darkBelow = 14 } = {}) {
  const n = pixels ? pixels.length : 0;
  if (n < 4) return false;
  const r0 = pixels[0];
  const g0 = pixels[1];
  const b0 = pixels[2];
  let sum = 0;
  for (let i = 0; i + 3 < n; i += 4) {
    const dr = Math.abs(pixels[i] - r0);
    const dg = Math.abs(pixels[i + 1] - g0);
    const db = Math.abs(pixels[i + 2] - b0);
    if (dr > eps || dg > eps || db > eps) return false;
    sum += pixels[i] + pixels[i + 1] + pixels[i + 2];
  }
  const mean = sum / (Math.floor(n / 4) * 3);
  return mean < darkBelow;
}

// Night bloom ceiling (stage 9c): the sky rig asks up to 1.0 at night,
// but anything past 0.45 blows lit towers into white blocks and hazes
// the scene. Clamped here so the pure sky params keep their 0..1 scale.
export const BLOOM_MAX = 0.45;

export function clampBloom(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, BLOOM_MAX);
}

export function createPost(renderer, scene, camera, opts = {}) {
  const state = {
    level: opts.quality || "medium",
    tilt: opts.tilt !== false,
    grain: opts.grain === true,
    saoOff: opts.sao === false, // ?sao=0 escape hatch
    // Stage 11: bloom threshold above window brightness (only lamps
    // bloom) and grade saturation, both from the look table (?look=).
    bloomThreshold: Number.isFinite(opts.bloomThreshold)
      ? opts.bloomThreshold : DEFAULT_LOOK.bloomThreshold,
    gradeSaturation: Number.isFinite(opts.gradeSaturation)
      ? opts.gradeSaturation : DEFAULT_LOOK.gradeSaturation,
    composer: null,
    sao: null,
    bloom: null,
    tiltPass: null,
    grade: null,
    time: 0,
  };

  function build() {
    const s = qualitySettings(state.level);
    const spec = postChainSpec(state.level, { saoOff: state.saoOff });
    state.spec = spec;
    if (!s.composer) {
      state.composer = null;
      state.sao = null;
      state.bloom = null;
      state.tiltPass = null;
      state.grade = null;
      return;
    }
    const composer = new EffectComposer(renderer);
    if (s.composerSamples > 0 && renderer.capabilities.isWebGL2) {
      for (const rt of [composer.renderTarget1, composer.renderTarget2]) {
        rt.samples = s.composerSamples;
      }
    }
    composer.addPass(new RenderPass(scene, camera));
    if (spec.includes("sao")) {
      const sao = new SAOPass(scene, camera);
      sao.params.saoIntensity = 0.35;
      sao.params.saoScale = 2.5;
      sao.params.saoKernelRadius = 60;
      sao.params.saoBlurRadius = 6;
      state.sao = sao;
      composer.addPass(sao);
    } else {
      state.sao = null;
    }
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const bloom = new UnrealBloomPass(size.clone().multiplyScalar(0.5), 0.0, 0.55,
      state.bloomThreshold);
    state.bloom = bloom;
    composer.addPass(bloom);
    const tiltPass = new ShaderPass(TiltShiftShader);
    tiltPass.enabled = state.tilt && s.tiltShift;
    state.tiltPass = tiltPass;
    composer.addPass(tiltPass);
    const grade = new ShaderPass(GradeShader);
    grade.uniforms.grain.value = state.grain ? 0.045 : 0.0;
    grade.uniforms.saturation.value = state.gradeSaturation;
    state.grade = grade;
    composer.addPass(grade);
    composer.addPass(new OutputPass());
    state.composer = composer;
  }

  build();

  return {
    get level() {
      return state.level;
    },
    get hasComposer() {
      return !!state.composer;
    },
    get spec() {
      return state.spec || [];
    },
    setQuality(level, flags = {}) {
      state.level = level;
      if (flags.tilt !== undefined) state.tilt = flags.tilt;
      if (flags.grain !== undefined) state.grain = flags.grain;
      if (flags.sao !== undefined) state.saoOff = flags.sao === false;
      const old = state.composer;
      build();
      if (old && old !== state.composer) old.dispose();
    },
    setSize(w, h) {
      if (state.composer) state.composer.setSize(w, h);
    },
    update({ bloom = 0 } = {}, dt = 0.016) {
      state.time += dt;
      if (!state.composer) return;
      if (state.bloom) {
        const clamped = clampBloom(bloom);
        state.bloom.strength = clamped;
        state.bloom.enabled = clamped > 0.01;
      }
      if (state.grade) state.grade.uniforms.time.value = state.time % 100;
    },
    render() {
      if (state.composer) state.composer.render();
      else renderer.render(scene, camera);
    },
  };
}
