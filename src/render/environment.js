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
        vec3 mid = vec3(0.24, 0.29, 0.5);
        vec3 horizon = vec3(1.25, 0.72, 0.42);
        // la franja cálida se queda pegada al horizonte; encima, el cielo vira pronto a azul violáceo
        vec3 col = mix(horizon, mid, smoothstep(0.0, 0.17, y));
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
  sky.userData.noAO = true;
  return sky;
}

// Cordilleras en capas: silueta por ruido fractal, color hacia la niebla con la distancia.
export function buildMountains() {
  const group = new THREE.Group();
  const layers = [
    // Siluetas oscuras a contraluz con perspectiva aérea: cada capa más cercana es más oscura y
    // recibe menos neblina. (Antes el AO las oscurecía por accidente y solo en calidad alta.)
    { z: -420, base: -30, amp: 120, freq: 0.004, color: '#6c5a62', top: '#b98b76', seed: 1, hz: 0.5 },
    { z: -260, base: -30, amp: 70, freq: 0.008, color: '#4a404b', top: '#8f6a59', seed: 2, hz: 0.36 },
    { z: -150, base: -30, amp: 42, freq: 0.014, color: '#2f2933', top: '#6a4f42', seed: 3, hz: 0.22 },
    { z: -90, base: -25, amp: 22, freq: 0.03, color: '#1c1820', top: '#46352d', seed: 4, hz: 0.1 },
  ];
  // Cada capa es una banda con varias filas: la arista recibe luz rasante del sol (contraluz),
  // las laderas orientadas al sol se aclaran, las cárcavas verticales rompen la superficie y la
  // base se funde con la neblina del valle (perspectiva aérea).
  const ROWS = 7;
  for (const L of layers) {
    const pos = [], col = [], idx = [];
    const x0 = -500, x1 = 700, n = 900;
    const ct = new THREE.Color(L.top), cb = new THREE.Color(L.color), haze = new THREE.Color('#b8a2a0');
    const shade = cb.clone().multiplyScalar(0.78).lerp(new THREE.Color('#5a5a78'), 0.18);
    const heightAt = (x) => {
      const r = fbm2(x * L.freq, L.seed * 10, 6, 1e6, L.seed);
      const ridge = 1 - Math.abs(r * 2 - 1);
      const detail = (fbm2(x * L.freq * 9, L.seed * 3, 3, 1e6, L.seed + 7) - 0.5) * 0.12;
      return L.base + 12 + L.amp * (0.25 + 0.75 * Math.pow(ridge, 1.6) + detail);
    };
    const c = new THREE.Color();
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const dx = (x1 - x0) / n;
      const yTop = heightAt(x);
      // pendiente medida en una ventana ancha: con la de un solo paso, el ruido fino alternaba
      // columnas iluminadas y en sombra y las laderas parecían una cortina de franjas verticales
      const w = 7 * dx;
      const slope = (heightAt(x + w) - heightAt(x - w)) / (2 * w);
      const toSun = Math.min(1, Math.max(0, -slope * 1.4 + 0.15));
      const gully = fbm2(x * L.freq * 38, L.seed * 5, 3, 1e6, L.seed + 11) - 0.5;
      for (let j = 0; j <= ROWS; j++) {
        const v = j / ROWS;
        const y = lerp(yTop, L.base, Math.pow(v, 1.25));
        const rim = j === 0 ? 1 : 0;
        const lit = toSun * Math.pow(1 - v, 2.2) * 0.75 + rim * (0.35 + 0.5 * toSun);
        c.copy(shade).lerp(ct, Math.min(1, lit));
        c.multiplyScalar(1 + gully * 0.28 * Math.sin(Math.PI * Math.min(1, v * 1.6)));
        c.lerp(haze, Math.pow(v, 0.9) * L.hz);
        pos.push(x, y, L.z);
        col.push(c.r, c.g, c.b);
        if (i < n && j < ROWS) {
          const a = i * (ROWS + 1) + j, b = a + ROWS + 1;
          idx.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
    m.renderOrder = -5;
    m.userData.noAO = true;
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
  // Media ponderada de cinco muestras entre x - hw y x + hw (más peso en el centro).
  sampleView(x, hw) {
    const out = {};
    const fog = new THREE.Color(0, 0, 0);
    for (const [o, w] of [[-1, 0.15], [-0.5, 0.2], [0, 0.3], [0.5, 0.2], [1, 0.15]]) {
      const s = this.sample(x + o * hw);
      for (const k of Object.keys(s)) if (k !== 'fog') out[k] = (out[k] || 0) + s[k] * w;
      fog.r += s.fog.r * w; fog.g += s.fog.g * w; fog.b += s.fog.b * w;
    }
    out.fog = fog;
    return out;
  }
}

// Banda de neblina del valle: plano vertical con degradado (denso abajo) y deriva lenta. Separa
// las capas de fondo (plano de juego, acueducto lejano, cordilleras) como perspectiva aérea.
export function buildMistBand({ x0, x1, y0, y1, z, color = '#c9b2a6', alpha = 0.5, seed = 0 }) {
  const geo = new THREE.PlaneGeometry(x1 - x0, y1 - y0, 1, 1);
  geo.translate((x0 + x1) / 2, (y0 + y1) / 2, z);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { time: { value: 0 }, color: { value: new THREE.Color(color) }, alpha: { value: alpha }, seed: { value: seed }, width: { value: x1 - x0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float time, alpha, seed, width; uniform vec3 color; varying vec2 vUv;
      float hh(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1)) + seed) * 43758.5453); }
      float nn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hh(i),hh(i+vec2(1,0)),f.x),mix(hh(i+vec2(0,1)),hh(i+vec2(1,1)),f.x),f.y); }
      void main(){
        vec2 p = vec2(vUv.x * width * 0.035 + time * 0.012, vUv.y * 2.2);
        float n = nn(p) * 0.55 + nn(p * 2.7 + vec2(time * 0.02, 0.0)) * 0.3 + nn(p * 7.0) * 0.15;
        float g = pow(1.0 - vUv.y, 1.6);
        float a = alpha * g * smoothstep(0.15, 0.75, n + g * 0.35);
        a *= smoothstep(0.0, 0.04, vUv.x) * smoothstep(1.0, 0.96, vUv.x);
        gl_FragColor = vec4(color, a);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -2;
  mesh.userData.noAO = true;
  return { mesh, mat };
}

// Ruinas góticas en la bruma (pintura mate procedural, como el fondo de la lámina del mago): torres
// con agujas y almenas, muros quebrados con arcadas apuntadas, hastiales con ventanal y rosetón. Son
// siluetas a contraluz con el filo encendido por el sol (que queda detrás, a la derecha) y la base
// fundida en la neblina del valle. Dos bandas a distinta distancia dan paralaje; los vanos dejan ver
// el cielo, que es lo que da lectura de detalle a distancia.
export function buildRuins() {
  const group = new THREE.Group();
  const bands = [
    { z: -140, x0: -180, x1: 340, y0: -10, h: 66, W: 4096, color: '#574a52', rim: '#dcae94', haze: '#bba5a3', hz: 0.6, seed: 11, gap: 1.5, scale: 1.2 },
    { z: -76, x0: -110, x1: 250, y0: -17, h: 60, W: 4096, color: '#3a3038', rim: '#cc9679', haze: '#a99291', hz: 0.45, seed: 23, gap: 1.3, scale: 0.95 },
  ];
  for (const B of bands) {
    const ppm = B.W / (B.x1 - B.x0);
    const H = Math.round(B.h * ppm);
    const c = document.createElement('canvas'); c.width = B.W; c.height = H;
    const g = c.getContext('2d');
    let s = B.seed;
    const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    const M = (m) => m * ppm * (B.scale || 1);
    // colinas sobre las que se asientan las ruinas
    const ground = (x) => H - M(9 + 5 * Math.sin(x / M(37) + B.seed) + 3 * Math.sin(x / M(13) + B.seed * 2));
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= B.W; x += 8) g.lineTo(x, ground(x));
    g.lineTo(B.W, H); g.closePath(); g.fill();
    const lancet = (cx, yb, w, h) => {
      const ys = yb - h + w * 0.9;
      g.beginPath();
      g.moveTo(cx - w / 2, yb); g.lineTo(cx - w / 2, ys);
      g.quadraticCurveTo(cx - w / 2, yb - h + w * 0.15, cx, yb - h);
      g.quadraticCurveTo(cx + w / 2, yb - h + w * 0.15, cx + w / 2, ys);
      g.lineTo(cx + w / 2, yb); g.closePath(); g.fill();
    };
    const hole = (fn) => { g.globalCompositeOperation = 'destination-out'; fn(); g.globalCompositeOperation = 'source-over'; };
    const jagged = (x0, x1, y, amp) => {
      // borde superior roto de la mampostería
      g.beginPath(); g.moveTo(x0, y + amp * 3);
      for (let x = x0; x <= x1; x += M(0.6)) g.lineTo(x, y + (rnd() - 0.3) * amp * (1 + Math.sin(x * 0.05) * 0.5));
      g.lineTo(x1, y + amp * 3); g.closePath(); g.fill();
    };
    let x = M(4);
    while (x < B.W - M(12)) {
      const base = ground(x) + M(1.5);
      const kind = rnd();
      if (kind < 0.38) {
        // torre: contrafuertes en las esquinas, ventanas en lanceta en dos o tres pisos y remate
        const w = M(4 + rnd() * 3.5), h = M(16 + rnd() * 20);
        g.fillRect(x, base - h, w, h);
        g.fillRect(x - M(0.7), base - h * 0.55, M(0.9), h * 0.55);
        g.fillRect(x + w - M(0.2), base - h * 0.45, M(0.9), h * 0.45);
        const top = rnd();
        if (top < 0.4) {
          // aguja con pináculos
          g.beginPath(); g.moveTo(x - M(0.3), base - h); g.lineTo(x + w / 2, base - h - w * (1.6 + rnd())); g.lineTo(x + w + M(0.3), base - h); g.closePath(); g.fill();
          for (const px of [x - M(0.2), x + w - M(0.4)]) { g.beginPath(); g.moveTo(px, base - h); g.lineTo(px + M(0.3), base - h - M(2.4)); g.lineTo(px + M(0.6), base - h); g.fill(); }
        } else if (top < 0.75) {
          // almenas
          for (let mx = x - M(0.3); mx < x + w; mx += M(1.1)) g.fillRect(mx, base - h - M(1.2), M(0.6), M(1.2));
          g.fillRect(x - M(0.4), base - h - M(0.2), w + M(0.8), M(0.5));
        } else jagged(x, x + w, base - h, M(1.2));
        hole(() => {
          const floors = 2 + Math.floor(rnd() * 2);
          for (let f = 0; f < floors; f++) {
            const yb = base - h * (0.25 + f * 0.27);
            const n = w > M(6) ? 2 : 1;
            for (let k = 0; k < n; k++) lancet(x + w * (k + 0.5) / n, yb, M(0.9 + rnd() * 0.5), M(2.6 + rnd() * 1.6));
          }
        });
        x += w + M(3 + rnd() * 10) * B.gap;
      } else if (kind < 0.72) {
        // muro con arcada apuntada y contrafuertes, coronación quebrada
        const L = M(10 + rnd() * 18), h = M(7 + rnd() * 8);
        g.fillRect(x, base - h * 0.7, L, h * 0.7);
        jagged(x, x + L, base - h * (0.7 + rnd() * 0.3), M(1.6));
        for (let bx = x; bx < x + L; bx += M(4)) {
          g.beginPath(); g.moveTo(bx, base); g.lineTo(bx, base - h * 0.75); g.lineTo(bx + M(0.9), base - h * 0.62); g.lineTo(bx + M(1.4), base); g.fill();
        }
        hole(() => { for (let ax = x + M(2.4); ax < x + L - M(1.6); ax += M(4)) lancet(ax, base - M(0.6), M(2.2), h * 0.55); });
        x += L + M(2 + rnd() * 8) * B.gap;
      } else {
        // hastial de una nave: piñón, gran ventanal apuntado con parteluz y rosetón calado
        const w = M(10 + rnd() * 5), h = M(14 + rnd() * 10);
        g.fillRect(x, base - h, w, h);
        g.beginPath(); g.moveTo(x - M(0.4), base - h); g.lineTo(x + w / 2, base - h - w * 0.55); g.lineTo(x + w + M(0.4), base - h); g.closePath(); g.fill();
        g.fillRect(x - M(1.2), base - h * 0.8, M(1.4), h * 0.8);
        g.fillRect(x + w - M(0.2), base - h * 0.8, M(1.4), h * 0.8);
        const rr = w * 0.17, ry = base - h - w * 0.12;
        hole(() => {
          lancet(x + w / 2, base - M(1), w * 0.36, h * 0.62);
          g.beginPath(); g.arc(x + w / 2, ry, rr, 0, Math.PI * 2); g.fill();
        });
        // parteluz y tracería del rosetón
        g.fillRect(x + w / 2 - M(0.18), base - M(1) - h * 0.5, M(0.36), h * 0.5);
        g.lineWidth = M(0.28); g.strokeStyle = '#fff';
        for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; g.beginPath(); g.moveTo(x + w / 2, ry); g.lineTo(x + w / 2 + Math.cos(a) * rr, ry + Math.sin(a) * rr); g.stroke(); }
        g.beginPath(); g.arc(x + w / 2, ry, rr * 0.35, 0, Math.PI * 2); g.stroke();
        // derrumbe: una esquina del piñón se ha caído
        if (rnd() < 0.5) hole(() => { g.beginPath(); g.moveTo(x + w * 0.7, base - h - w * 0.6); g.lineTo(x + w + M(1), base - h - w * 0.2); g.lineTo(x + w + M(1), base - h * 0.7); g.lineTo(x + w * 0.82, base - h * 0.95); g.closePath(); g.fill(); });
        x += w + M(4 + rnd() * 12) * B.gap;
      }
    }
    // color: silueta a contraluz, filo encendido a la derecha y arriba, neblina hacia la base
    const img = g.getImageData(0, 0, B.W, H), d = img.data;
    const a = new Uint8Array(B.W * H);
    for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3] > 127 ? 1 : 0;
    const cb = new THREE.Color(B.color), cr = new THREE.Color(B.rim), ch = new THREE.Color(B.haze), cc = new THREE.Color();
    for (let y = 0; y < H; y++) for (let xx = 0; xx < B.W; xx++) {
      const i = y * B.W + xx;
      if (!a[i]) { d[i * 4 + 3] = 0; continue; }
      const right = xx + 2 < B.W && !a[i + 2], up = y > 1 && !a[i - 2 * B.W];
      const rim = right ? 0.85 : up ? 0.4 : 0;
      cc.copy(cb).multiplyScalar(0.93 + Math.random() * 0.1 - ((y % Math.round(M(0.7))) === 0 ? 0.05 : 0));
      cc.lerp(cr, rim);
      cc.lerp(ch, B.hz * Math.pow(y / H, 1.6) + B.hz * 0.25);
      d[i * 4] = cc.r * 255; d[i * 4 + 1] = cc.g * 255; d[i * 4 + 2] = cc.b * 255; d[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const geo = new THREE.PlaneGeometry(B.x1 - B.x0, B.h);
    geo.translate((B.x0 + B.x1) / 2, B.y0 + B.h / 2, B.z);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, fog: false }));
    m.renderOrder = -4;
    m.userData.noAO = true;
    group.add(m);
  }
  return group;
}
