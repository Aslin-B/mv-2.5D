import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Cadena de posproceso (biblia §9.2): escena HDR con MSAA -> oclusión ambiental (alto) ->
// bloom físico moderado -> mapeo tonal ACES y sRGB -> etapa final con viñeta, bandas
// cinematográficas, destello de impacto y grano fino. Los perfiles reducen costes antes que la
// tasa de simulación (§11.6).

export const QUALITY = {
  alto: { pixelRatio: 1.0, msaa: 4, shadowSize: 4096, ao: true, bloom: true, label: 'Alto' },
  medio: { pixelRatio: 1.0, msaa: 4, shadowSize: 2048, ao: false, bloom: true, label: 'Medio' },
  bajo: { pixelRatio: 0.75, msaa: 0, shadowSize: 1024, ao: false, bloom: false, label: 'Bajo' },
};

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    vignette: { value: 0.32 },
    letterbox: { value: 0 },
    flash: { value: 0 },
    flashColor: { value: new THREE.Color(1, 0.95, 0.85) },
    fade: { value: 0 },
    grain: { value: 0.035 },
    time: { value: 0 },
    aspect: { value: 16 / 9 },
    lift: { value: new THREE.Vector3(0.012, 0.01, 0.016) },
    sat: { value: 1.04 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float vignette, letterbox, flash, fade, grain, time, aspect, sat;
    uniform vec3 flashColor, lift;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + time * 61.0) * 43758.5453); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      // gradación suave: sombras ligeramente frías, saturación contenida
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, sat);
      c = c + lift * (1.0 - l);
      vec2 q = vUv - 0.5; q.x *= aspect * 0.75;
      float v = smoothstep(0.95, 0.25, length(q));
      c *= mix(1.0, v, vignette);
      c = mix(c, flashColor, flash);
      c += (h(vUv * 911.0) - 0.5) * grain;
      c *= 1.0 - fade;
      float bar = letterbox * 0.12;
      if (vUv.y < bar || vUv.y > 1.0 - bar) c = vec3(0.0);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export class PostFX {
  constructor(renderer, scene, camera, qualityName = 'medio') {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.build(qualityName);
  }

  build(qualityName) {
    this.qualityName = qualityName;
    const q = QUALITY[qualityName];
    this.q = q;
    if (this.composer) this.composer.dispose?.();
    const size = this.renderer.getSize(new THREE.Vector2());
    const pr = this.renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: q.msaa });
    const composer = new EffectComposer(this.renderer, rt);
    composer.addPass(new RenderPass(this.scene, this.camera));
    this.ao = null;
    if (q.ao) {
      const ao = new GTAOPass(this.scene, this.camera, size.x * pr, size.y * pr);
      ao.output = GTAOPass.OUTPUT.Default;
      ao.blendIntensity = 0.85;
      ao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.6, thickness: 1.2, scale: 1.0, samples: 12 });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      composer.addPass(ao);
      this.ao = ao;
    }
    this.bloom = null;
    if (q.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x * pr, size.y * pr), 0.4, 0.42, 0.95);
      composer.addPass(this.bloom);
    }
    composer.addPass(new OutputPass());
    this.final = new ShaderPass(FinalShader);
    composer.addPass(this.final);
    this.composer = composer;
  }

  setSize(w, h) {
    this.composer.setSize(w, h);
    this.final.uniforms.aspect.value = w / h;
  }

  render(dt, p) {
    const u = this.final.uniforms;
    u.time.value += dt;
    u.letterbox.value = p.letterbox ?? 0;
    u.flash.value = p.flash ?? 0;
    u.fade.value = p.fade ?? 0;
    u.vignette.value = p.vignette ?? 0.32;
    if (this.bloom) this.bloom.strength = p.bloom ?? 0.55;
    this.composer.render(dt);
  }
}
