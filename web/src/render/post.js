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
    vignette: { value: 0.26 },
    grain: { value: 0.0 },
    time: { value: 0.0 },
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
    varying vec2 vUv;
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7)) + time * 13.0) * 43758.5453);
    }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 q = vUv - 0.5;
      c.rgb *= 1.0 - vignette * dot(q, q) * 2.2;
      if (grain > 0.0) {
        c.rgb += (hash(vUv * vec2(1920.0, 1080.0)) - 0.5) * grain;
      }
      gl_FragColor = c;
    }
  `,
};

export function createPost(renderer, scene, camera, opts = {}) {
  const state = {
    level: opts.quality || "medium",
    tilt: opts.tilt !== false,
    grain: opts.grain === true,
    composer: null,
    sao: null,
    bloom: null,
    tiltPass: null,
    grade: null,
    time: 0,
  };

  function build() {
    const s = qualitySettings(state.level);
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
    if (s.sao) {
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
    const bloom = new UnrealBloomPass(size.clone().multiplyScalar(0.5), 0.0, 0.55, 0.82);
    state.bloom = bloom;
    composer.addPass(bloom);
    const tiltPass = new ShaderPass(TiltShiftShader);
    tiltPass.enabled = state.tilt && s.tiltShift;
    state.tiltPass = tiltPass;
    composer.addPass(tiltPass);
    const grade = new ShaderPass(GradeShader);
    grade.uniforms.grain.value = state.grain ? 0.045 : 0.0;
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
    setQuality(level, flags = {}) {
      state.level = level;
      if (flags.tilt !== undefined) state.tilt = flags.tilt;
      if (flags.grain !== undefined) state.grain = flags.grain;
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
        state.bloom.strength = bloom;
        state.bloom.enabled = bloom > 0.01;
      }
      if (state.grade) state.grade.uniforms.time.value = state.time % 100;
    },
    render() {
      if (state.composer) state.composer.render();
      else renderer.render(scene, camera);
    },
  };
}
