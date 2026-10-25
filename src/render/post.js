import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { HDR_SAFE } from './hdrSafe.js';

// Cadena de posproceso (biblia §9.2): escena HDR con MSAA -> oclusión ambiental (alto) ->
// bloom físico moderado -> mapeo tonal ACES y sRGB -> etapa final con viñeta, bandas
// cinematográficas, destello de impacto y grano fino. Los perfiles reducen costes antes que la
// tasa de simulación (§11.6).

export const MASK_LAYER = 4;

export const QUALITY = {
  alto: { pixelRatio: 1.0, msaa: 4, shadowSize: 4096, ao: true, bloom: true, sharpen: 0.4, label: 'Alto' },
  medio: { pixelRatio: 1.0, msaa: 4, shadowSize: 2048, ao: false, bloom: true, sharpen: 0.35, label: 'Medio' },
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
    // gradación por sala: tinte de sombras y de luces (multiplicativo) y curva de contraste
    shadowTint: { value: new THREE.Vector3(1, 1, 1) },
    highTint: { value: new THREE.Vector3(1, 1, 1) },
    contrast: { value: 0 },
    blackPoint: { value: 0 },
    sharpen: { value: 0 },
    texel: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
    // silueta de Aren (máscara a media resolución) para el contraste figura-fondo
    tMask: { value: null },
    maskOn: { value: 0 },
    maskTexel: { value: new THREE.Vector2(1 / 640, 1 / 360) },
    sepRim: { value: new THREE.Color(1, 0.86, 0.72) },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float vignette, letterbox, flash, fade, grain, time, aspect, sat, contrast, blackPoint, sharpen;
    uniform vec3 flashColor, lift, shadowTint, highTint;
    uniform vec2 texel;
    uniform sampler2D tMask; uniform float maskOn; uniform vec2 maskTexel; uniform vec3 sepRim;
    varying vec2 vUv;
    ${HDR_SAFE}
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + time * 61.0) * 43758.5453); }
    void main(){
      vec3 c = hdrSafe(texture2D(tDiffuse, vUv).rgb);
      // enfoque suave (máscara de desenfoque en cruz): recupera la nitidez del detalle de media escala
      if (sharpen > 0.0) {
        vec3 n4 = hdrSafe(texture2D(tDiffuse, vUv + vec2(texel.x, 0.0)).rgb) + hdrSafe(texture2D(tDiffuse, vUv - vec2(texel.x, 0.0)).rgb)
                + hdrSafe(texture2D(tDiffuse, vUv + vec2(0.0, texel.y)).rgb) + hdrSafe(texture2D(tDiffuse, vUv - vec2(0.0, texel.y)).rgb);
        c = max(c + (c - n4 * 0.25) * sharpen, 0.0);
      }
      // gradación suave: sombras ligeramente frías, saturación contenida
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, sat);
      // tono dominante de la sala: sombras y luces teñidas por separado
      c *= mix(shadowTint, highTint, smoothstep(0.04, 0.55, l));
      // curva en S suave y punto negro: negros profundos sin aplastar los medios
      c = max(c - blackPoint, 0.0) / (1.0 - blackPoint);
      c = mix(c, c * c * (3.0 - 2.0 * c), contrast);
      c = c + lift * (1.0 - l);
      // Contraste figura-fondo: donde el borde de Aren y el fondo inmediato tienen casi la misma luz,
      // el borde interior de la silueta se aclara (contorno de luz) si el fondo es oscuro o se oscurece
      // si el fondo es claro. Solo actúa dentro de la silueta y solo donde falta contraste: no dibuja
      // una línea de contorno ni un halo sobre el escenario.
      if (maskOn > 0.5) {
        float m0 = texture2D(tMask, vUv).r;
        if (m0 > 0.01) {
          const vec2 D0 = vec2(1.0, 0.0), D1 = vec2(0.7071, 0.7071), D2 = vec2(0.0, 1.0), D3 = vec2(-0.7071, 0.7071);
          vec2 R = maskTexel * 2.2;
          float r0 = texture2D(tMask, vUv + D0 * R).r, r1 = texture2D(tMask, vUv - D0 * R).r;
          float r2 = texture2D(tMask, vUv + D1 * R).r, r3 = texture2D(tMask, vUv - D1 * R).r;
          float r4 = texture2D(tMask, vUv + D2 * R).r, r5 = texture2D(tMask, vUv - D2 * R).r;
          float r6 = texture2D(tMask, vUv + D3 * R).r, r7 = texture2D(tMask, vUv - D3 * R).r;
          float ring = (r0 + r1 + r2 + r3 + r4 + r5 + r6 + r7) * 0.125;
          float e = m0 * smoothstep(0.98, 0.55, ring);
          if (e > 0.001) {
            // luz del fondo justo fuera del borde y de la figura justo dentro (antes de la gradación)
            vec2 Q = maskTexel * 4.5;
            float lb = 0.0, wb = 0.0, lh = 0.0, wh = 0.0;
            vec2 dirs[8];
            dirs[0] = D0; dirs[1] = -D0; dirs[2] = D1; dirs[3] = -D1; dirs[4] = D2; dirs[5] = -D2; dirs[6] = D3; dirs[7] = -D3;
            for (int i = 0; i < 8; i++) {
              vec2 uv = vUv + dirs[i] * Q;
              float mk = texture2D(tMask, uv).r;
              float lk = dot(hdrSafe(texture2D(tDiffuse, uv).rgb), vec3(0.2126, 0.7152, 0.0722));
              lb += lk * (1.0 - mk); wb += 1.0 - mk;
              lh += lk * mk; wh += mk;
            }
            if (wb > 0.5 && wh > 0.5) {
              lb /= wb; lh /= wh;
              float lc = dot(hdrSafe(texture2D(tDiffuse, vUv).rgb), vec3(0.2126, 0.7152, 0.0722));
              float dl = mix(lh, lc, 0.5) - lb;
              float need = clamp((0.16 - abs(dl)) / 0.16, 0.0, 1.0) * e;
              // se empuja en el sentido que ya separa; si están igualados, según el fondo
              bool up = dl > 0.02 || (dl > -0.02 && lb < 0.3);
              if (up) c += sepRim * need * 0.16;
              else c *= 1.0 - need * 0.42;
            }
          }
        }
      }
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
      // El pase de normales de GTAO solo excluye puntos y líneas: los sprites, tarjetas aditivas,
      // estelas y velos transparentes generaban recuadros oscuros. Se excluyen también, igual que las
      // tarjetas con recorte alfa (el pase de normales no recorta: la hierba dejaba recuadros) y el
      // cielo y las cordilleras (con su profundidad, el AO oscurecía el cielo visto entre arcos).
      ao._overrideVisibility = function () {
        const cache = this._visibilityCache;
        this.scene.traverse((o) => {
          if (!o.visible) return;
          const m = o.material;
          const skip = o.isPoints || o.isLine || o.isLine2 || o.isSprite || o.userData.noAO ||
            (m && !Array.isArray(m) && (m.transparent || m.depthWrite === false || m.blending === THREE.AdditiveBlending || m.alphaTest > 0));
          if (skip) { o.visible = false; cache.push(o); }
        });
      };
      composer.addPass(ao);
      this.ao = ao;
    }
    this.bloom = null;
    if (q.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x * pr, size.y * pr), 0.4, 0.42, 0.95);
      // el filtro de luces del bloom lee la escena saneada: un píxel no finito ya no se esparce
      const hp = this.bloom.materialHighPassFilter;
      hp.fragmentShader = HDR_SAFE + hp.fragmentShader.replace(
        'vec4 texel = texture2D( tDiffuse, vUv );', 'vec4 texel = texture2D( tDiffuse, vUv ); texel.rgb = hdrSafe( texel.rgb );');
      if (!hp.fragmentShader.includes('hdrSafe( texel.rgb )')) console.warn('bloom: no se pudo sanear el filtro de luces');
      hp.needsUpdate = true;
      composer.addPass(this.bloom);
    }
    // la salida (mapeo tonal y sRGB) también lee la escena acotada: en Metal pow() de un valor
    // negativo da NaN. Es un sombreador GLSL ES 1.0 (sin acceso a los bits); clamp() en Metal
    // descarta el NaN (fmax devuelve el operando que no lo es) y recorta infinitos y negativos.
    const out = new OutputPass();
    out.material.fragmentShader = out.material.fragmentShader.replace(
      'gl_FragColor = texture2D( tDiffuse, vUv );', 'gl_FragColor = texture2D( tDiffuse, vUv ); gl_FragColor.rgb = clamp( gl_FragColor.rgb, 0.0, 512.0 );');
    if (!out.material.fragmentShader.includes('clamp( gl_FragColor.rgb')) console.warn('salida: no se pudo acotar');
    out.material.needsUpdate = true;
    composer.addPass(out);
    this.final = new ShaderPass(FinalShader);
    this.final.uniforms.sharpen.value = q.sharpen ?? 0;
    this.final.uniforms.texel.value.set(1 / (size.x * pr), 1 / (size.y * pr));
    if (this.maskRT) this.maskRT.dispose();
    this.maskRT = new THREE.WebGLRenderTarget(Math.max(1, Math.round(size.x * pr / 2)), Math.max(1, Math.round(size.y * pr / 2)), { depthBuffer: false });
    this.maskMat = this.maskMat || new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, side: THREE.DoubleSide });
    this.final.uniforms.tMask.value = this.maskRT.texture;
    this.final.uniforms.maskTexel.value.set(1 / this.maskRT.width, 1 / this.maskRT.height);
    composer.addPass(this.final);
    this.composer = composer;
  }

  setSize(w, h) {
    this.composer.setSize(w, h);
    this.final.uniforms.aspect.value = w / h;
    const pr = this.renderer.getPixelRatio();
    this.final.uniforms.texel.value.set(1 / (w * pr), 1 / (h * pr));
    this.maskRT.setSize(Math.max(1, Math.round(w * pr / 2)), Math.max(1, Math.round(h * pr / 2)));
    this.final.uniforms.maskTexel.value.set(1 / this.maskRT.width, 1 / this.maskRT.height);
  }

  // Silueta del héroe: los objetos con la capa MASK_LAYER se dibujan en blanco plano sobre negro a
  // media resolución (sin sombras ni luces: es solo una máscara).
  renderMask(on) {
    const u = this.final.uniforms;
    u.maskOn.value = on ? 1 : 0;
    if (!on) return;
    const r = this.renderer, sc = this.scene, cam = this.camera;
    const bg = sc.background, ov = sc.overrideMaterial, lm = cam.layers.mask, au = r.shadowMap.autoUpdate;
    const cc = r.getClearColor(this._cc || (this._cc = new THREE.Color())).clone(), ca = r.getClearAlpha();
    sc.background = null; sc.overrideMaterial = this.maskMat; cam.layers.set(MASK_LAYER); r.shadowMap.autoUpdate = false;
    r.setRenderTarget(this.maskRT);
    r.setClearColor(0x000000, 1); r.clear(true, false, false);
    r.render(sc, cam);
    r.setRenderTarget(null);
    sc.background = bg; sc.overrideMaterial = ov; cam.layers.mask = lm; r.shadowMap.autoUpdate = au;
    r.setClearColor(cc, ca);
  }

  render(dt, p) {
    const u = this.final.uniforms;
    u.time.value += dt;
    u.letterbox.value = p.letterbox ?? 0;
    u.flash.value = p.flash ?? 0;
    u.fade.value = p.fade ?? 0;
    u.vignette.value = p.vignette ?? 0.32;
    if (this.bloom) this.bloom.strength = p.bloom ?? 0.55;
    if (p.grade) {
      const g = p.grade;
      u.shadowTint.value.set(g.shR, g.shG, g.shB);
      u.highTint.value.set(g.hiR, g.hiG, g.hiB);
      u.contrast.value = g.con;
      u.blackPoint.value = g.bp;
      u.sat.value = g.sat;
    }
    this.composer.render(dt);
  }
}
