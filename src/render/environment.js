import * as THREE from 'three';
import { fbm2 } from '../core/rng.js';
import { smoothstep, lerp } from '../core/math.js';

// Atmósfera de amanecer: cielo procedural, montañas en capas con perspectiva aérea, sol direccional
// con sombras, luz hemisférica y niebla exponencial. Las "zonas" ajustan la luz en interiores.

export const SUN_DIR = new THREE.Vector3(0.44, 0.3, -0.85).normalize(); // hacia el sol: bajo, detrás y a la derecha (contraluz de amanecer)

export function buildSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sunDir: { value: SUN_DIR.clone() }, time: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir; uniform float time;
      varying vec3 vDir;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
      float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<5;i++){ s+=a*n(p); p*=2.02; a*=0.5;} return s; }
      void main(){
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 zenith = vec3(0.045, 0.075, 0.16);
        vec3 mid = vec3(0.32, 0.36, 0.52);
        vec3 horizon = vec3(1.25, 0.72, 0.42);
        vec3 col = mix(horizon, mid, smoothstep(0.0, 0.25, y));
        col = mix(col, zenith, smoothstep(0.2, 0.75, y));
        float sd = max(dot(d, sunDir), 0.0);
        // halo cálido alrededor del sol, más fuerte cerca del horizonte
        col += vec3(1.6, 0.85, 0.42) * pow(sd, 10.0) * 0.55;
        col += vec3(1.0, 0.6, 0.35) * pow(sd, 3.0) * 0.22 * (1.0 - smoothstep(0.0, 0.5, y));
        col += vec3(28.0, 20.0, 12.0) * smoothstep(0.9993, 0.99965, sd);
        // nubes estratificadas iluminadas desde abajo
        vec2 uv = d.xz / max(y + 0.12, 0.05) * 1.4 + vec2(time * 0.004, 0.0);
        float c = smoothstep(0.48, 0.78, fbm(uv * vec2(1.0, 2.6)));
        float band = smoothstep(0.02, 0.1, y) * (1.0 - smoothstep(0.22, 0.5, y));
        vec3 cloudCol = mix(vec3(0.5, 0.42, 0.48), vec3(1.6, 0.9, 0.55), pow(sd, 3.0) + 0.15);
        col = mix(col, cloudCol, c * band * 0.75);
        // bajo el horizonte: neblina del valle
        col = mix(col, vec3(0.62, 0.5, 0.46), smoothstep(0.02, -0.12, y));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), mat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  return sky;
}

// Cordilleras en capas: silueta por ruido fractal, color hacia la niebla con la distancia.
export function buildMountains() {
  const group = new THREE.Group();
  const layers = [
    { z: -420, base: -30, amp: 120, freq: 0.004, color: '#b7aab2', top: '#ecc6ae', seed: 1 },
    { z: -260, base: -30, amp: 70, freq: 0.008, color: '#9d93a0', top: '#dbb19c', seed: 2 },
    { z: -150, base: -30, amp: 42, freq: 0.014, color: '#7f7886', top: '#c09584', seed: 3 },
    { z: -90, base: -25, amp: 22, freq: 0.03, color: '#635f69', top: '#9a7a6c', seed: 4 },
  ];
  for (const L of layers) {
    const pos = [], col = [], idx = [];
    const x0 = -500, x1 = 700, n = 900;
    const ct = new THREE.Color(L.top), cb = new THREE.Color(L.color), haze = new THREE.Color('#b8a2a0');
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const r = fbm2(x * L.freq, L.seed * 10, 6, 1e6, L.seed);
      const ridge = 1 - Math.abs(r * 2 - 1);
      const detail = (fbm2(x * L.freq * 9, L.seed * 3, 3, 1e6, L.seed + 7) - 0.5) * 0.12;
      const y = L.base + 12 + L.amp * (0.25 + 0.75 * Math.pow(ridge, 1.6) + detail);
      pos.push(x, y, L.z, x, L.base, L.z);
      const lit = 0.55 + 0.45 * Math.max(0, fbm2(x * L.freq * 3, 2, 3, 1e6, L.seed + 5));
      const top = cb.clone().lerp(ct, lit * 0.6);
      col.push(top.r, top.g, top.b, haze.r, haze.g, haze.b);
      if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
    m.renderOrder = -5;
    group.add(m);
  }
  return group;
}

export function buildLights(scene, quality) {
  const hemi = new THREE.HemisphereLight('#a8bad0', '#5e4632', 1.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffc98f', 3.4);
  sun.castShadow = true;
  const size = quality.shadowSize;
  sun.shadow.mapSize.set(size, size);
  const cam = sun.shadow.camera;
  cam.left = -26; cam.right = 26; cam.top = 17; cam.bottom = -17; cam.near = 1; cam.far = 120;
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = 3;
  scene.add(sun);
  scene.add(sun.target);
  // Relleno suave cercano al personaje (rebote cálido), sin sombras.
  const fill = new THREE.PointLight('#ffd2a8', 3.0, 10, 2);
  scene.add(fill);
  return { hemi, sun, fill };
}

// Sigue el encuadre con la cámara de sombras ajustada a la vista y alineada a texel (sin parpadeo).
export function updateSun(lights, focus) {
  const { sun } = lights;
  const d = 50;
  const texel = (sun.shadow.camera.right - sun.shadow.camera.left) / sun.shadow.mapSize.x;
  const fx = Math.round(focus.x / texel) * texel, fy = Math.round(focus.y / texel) * texel;
  sun.target.position.set(fx, fy, -2);
  sun.position.set(fx + SUN_DIR.x * d, fy + SUN_DIR.y * d, -2 + SUN_DIR.z * d);
  sun.target.updateMatrixWorld();
}

// Zonas de iluminación a lo largo del nivel (interiores más oscuros, braseros más presentes).
export class Zones {
  constructor(list) { this.list = list; }
  sample(x) {
    const L = this.list;
    let i = 0;
    while (i < L.length - 1 && x >= L[i + 1].x) i++;
    const a = L[i], b = L[Math.min(i + 1, L.length - 1)];
    const blend = b.blend || 4;
    const t = a === b ? 0 : smoothstep(b.x - blend, b.x + 0.001, x);
    const out = {};
    for (const k of Object.keys(a)) if (typeof a[k] === 'number' && k !== 'x') out[k] = lerp(a[k], b[k] ?? a[k], t);
    out.fog = new THREE.Color(a.fogColor).lerp(new THREE.Color(b.fogColor), t);
    return out;
  }
}
