import * as THREE from 'three';

// Capa corta dividida (dos paneles) simulada con Verlet: gravedad, viento, amortiguación,
// restricciones de distancia y colisión con cápsulas del cuerpo. Se actualiza en el paso fijo
// y la sombra usa la misma geometría que el pase principal (§9.4).

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
// canal verde lineal del color base (normaliza la variación del forro)
const b2s = (hex) => new THREE.Color(hex).g.toFixed(4);

function capeTexture({ base = '#365456', hem = '#3d2c1f', line = '#9a7a4e', ragged = false } = {}) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 512);
  const img = ctx.getImageData(0, 0, 256, 512);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 256; x++) {
    const i = (y * 256 + x) * 4;
    const weave = ((x + y) % 4 < 2 ? 1 : 0.94) * (0.9 + Math.random() * 0.1);
    const wear = y > 440 ? 0.8 + Math.random() * 0.15 : 1;
    img.data[i] *= weave * wear; img.data[i + 1] *= weave * wear; img.data[i + 2] *= weave * wear;
  }
  ctx.putImageData(img, 0, 0);
  // ribete de cuero y línea de ondas bordada (motivo propio del agua)
  ctx.fillStyle = hem;
  ctx.fillRect(0, 0, 256, 18);
  if (ragged) {
    // borde deshilachado y remiendos (lona del saqueador)
    ctx.globalCompositeOperation = 'destination-out';
    for (let x = 0; x < 256; x += 6) ctx.fillRect(x, 470 + Math.random() * 30, 4 + Math.random() * 4, 60);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(84,92,74,0.85)';
    ctx.fillRect(40, 180, 60, 70);
    ctx.fillRect(150, 320, 50, 56);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  ctx.strokeStyle = line;
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = 0; x <= 256; x += 4) ctx.lineTo(x, 470 + Math.sin(x / 12) * 6);
  ctx.stroke();
  ctx.beginPath();
  for (let x = 0; x <= 256; x += 4) ctx.lineTo(x, 486 + Math.sin(x / 12 + Math.PI) * 4);
  ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Faldones de abrigo: cuero carbón con veteado y repujado tono sobre tono; bordado de plata en
// los dos cantos de cada faldón, una enredadera de volutas que baja por el centro y una cenefa en el
// bajo (como los faldones de la lámina). Devuelve color, relieve (bordado en alto) y
// rugosidad/metal (canales G/B). Cada faldón ocupa media textura (u 0–0,5 y 0,5–1).
function coatTextures({ base = '#29262c', line = '#b3b0b8' } = {}) {
  const W = 512, H = 1024;
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const col = mk(), bump = mk(), orm = mk(), mask = mk();
  const cc = col.getContext('2d'), bc = bump.getContext('2d'), oc = orm.getContext('2d');
  // máscara del bordado dibujada con trazos (blanco = hilo de plata)
  const m = mask.getContext('2d');
  m.strokeStyle = '#fff'; m.fillStyle = '#fff'; m.lineCap = 'round'; m.lineJoin = 'round';
  let seed = 3;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const hemTop = H * (1 - 0.1), hemBot = H * (1 - 0.018);
  // voluta: espiral que se enrosca desde (x, y) hacia un lado
  const curl = (x, y, ang, r, dir, w) => {
    m.lineWidth = w;
    m.beginPath();
    for (let i = 0; i <= 28; i++) {
      const t = i / 28, a = ang + dir * t * Math.PI * 2.2, rr = r * (1 - t * 0.78);
      const px = x + Math.cos(ang) * r * t * 0.6 + Math.cos(a) * rr * t, py = y + Math.sin(ang) * r * t * 0.6 + Math.sin(a) * rr * t;
      if (i === 0) m.moveTo(px, py); else m.lineTo(px, py);
    }
    m.stroke();
  };
  // cantos: doble filete y cadena de volutas pequeñas entre ellos, a ambos lados de cada costura
  for (const ex of [0, W / 2, W]) {
    for (const sd of [-1, 1]) {
      const x1 = ex + sd * 7, x2 = ex + sd * 30;
      if (x1 < 0 || x1 > W) continue;
      m.lineWidth = 2;
      for (const xx of [x1, x2]) { m.beginPath(); m.moveTo(xx, 40); m.lineTo(xx, hemTop); m.stroke(); }
      for (let y = 52; y < hemTop - 20; y += 26) curl((x1 + x2) / 2, y, sd > 0 ? -Math.PI / 2 : Math.PI / 2, 10, (y / 26) % 2 ? 1 : -1, 1.6);
    }
  }
  // enredadera central de cada faldón: tallo ondulado con volutas y hojas alternas
  for (const cx of [W / 4, (3 * W) / 4]) {
    const ph = rnd() * 6.28;
    const sx = (y) => cx + Math.sin(y * 0.011 + ph) * 22;
    m.lineWidth = 3;
    m.beginPath();
    for (let y = 90; y <= hemTop - 30; y += 4) { if (y === 90) m.moveTo(sx(y), y); else m.lineTo(sx(y), y); }
    m.stroke();
    let side = 1;
    for (let y = 120; y < hemTop - 60; y += 70 + rnd() * 20) {
      const x = sx(y);
      // rama que se abre y termina en voluta
      const bx = x + side * (34 + rnd() * 12), by = y + 22;
      m.lineWidth = 2.2;
      m.beginPath(); m.moveTo(x, y); m.quadraticCurveTo(x + side * 20, y - 6, bx, by); m.stroke();
      curl(bx, by, side > 0 ? 0.3 : Math.PI - 0.3, 16 + rnd() * 6, side, 2);
      // hoja apuntada al otro lado
      m.beginPath();
      m.moveTo(x, y + 10);
      m.quadraticCurveTo(x - side * 16, y + 4, x - side * 26, y + 18);
      m.quadraticCurveTo(x - side * 12, y + 22, x, y + 10);
      m.fill();
      side = -side;
    }
  }
  // cenefa del bajo: dos filetes y una onda de volutas encadenadas
  m.lineWidth = 2.5;
  for (const y of [hemTop, hemBot]) { m.beginPath(); m.moveTo(0, y); m.lineTo(W, y); m.stroke(); }
  for (let x = 10; x < W; x += 30) curl(x, (hemTop + hemBot) / 2 + 4, -Math.PI / 2, 11, (x / 30) % 2 ? 1 : -1, 1.8);
  const md = m.getImageData(0, 0, W, H).data;

  const ci = cc.createImageData(W, H), bi = bc.createImageData(W, H), oi = oc.createImageData(W, H);
  const b = new THREE.Color(base), l = new THREE.Color(line);
  const hh = (i, j) => { const s2 = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s2 - Math.floor(s2); };
  const fil = (u, v, w) => {
    const i = Math.floor(u), j = Math.floor(v);
    let fu = u - i; const fv = v - j;
    if (hh(i, j) > 0.5) fu = 1 - fu;
    const d = Math.min(Math.abs(Math.hypot(fu, fv) - 0.5), Math.abs(Math.hypot(fu - 1, fv - 1) - 0.5));
    return Math.max(0, Math.min(1, (w - d) / (w * 0.45)));
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    // grano y manchas del cuero; repujado tono sobre tono (volutas grandes, solo relieve y sombra)
    const g = 0.86 + 0.14 * Math.random() * Math.random() + 0.06 * Math.sin(x * 0.11 + Math.sin(y * 0.025) * 3) * Math.sin(y * 0.045);
    const rep = fil(x / 46, y / 46, 0.07) * (y > 60 && y < hemTop - 10 ? 1 : 0);
    const k = g * (1 - rep * 0.12);
    let r = b.r * k, gg = b.g * k, bb = b.b * k;
    const emb = md[i] / 255;
    const u = x / (W - 1);
    const du = Math.min(Math.abs(u), Math.abs(u - 0.5), Math.abs(u - 1));
    if (du < 0.006 || y > H - 12) { r *= 0.55; gg *= 0.55; bb *= 0.55; }   // canto oscuro
    const sh = 0.72 + Math.random() * 0.28;
    r = r * (1 - emb) + l.r * emb * sh;
    gg = gg * (1 - emb) + l.g * emb * sh;
    bb = bb * (1 - emb) + l.b * emb * sh;
    ci.data[i] = Math.min(255, r * 255); ci.data[i + 1] = Math.min(255, gg * 255); ci.data[i + 2] = Math.min(255, bb * 255); ci.data[i + 3] = 255;
    const h = 0.35 + emb * 0.5 + rep * 0.12 + (Math.random() - 0.5) * 0.08;
    bi.data[i] = bi.data[i + 1] = bi.data[i + 2] = h * 255; bi.data[i + 3] = 255;
    oi.data[i] = 255; oi.data[i + 1] = (0.66 - emb * 0.3 - rep * 0.08) * 255; oi.data[i + 2] = emb * 255; oi.data[i + 3] = 255;
  }
  cc.putImageData(ci, 0, 0); bc.putImageData(bi, 0, 0); oc.putImageData(oi, 0, 0);
  const tex = (c, srgb) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  return { map: tex(col, true), bumpMap: tex(bump, false), orm: tex(orm, false) };
}

export class Cape {
  constructor(model, scene, { cols = 5, rows = 10, length = 0.74, palette = null, anchors = null, bone = 'chest', drag = 0.965, liningFlip = false, outward = 0.02, flare = 0.13, gather = 1, open = 0 } = {}) {
    // flare: ensanche del bajo respecto al talle (vuelo de la falda del abrigo); gather: tela de más
    // entre anclajes, que se recoge en pliegues verticales; open: separación hacia fuera del canto
    // delantero en el bajo (faldones abiertos en V invertida)
    this.flare = flare;
    this.open = open;
    this.gather = gather;
    this.model = model;
    this.bone = bone;
    this.drag = drag;
    this.outward = outward;
    this.cols = cols; this.rows = rows; this.length = length;
    this.panels = [];
    const ragged = palette && palette.ragged;
    let mat;
    if (palette && palette.style === 'coat') {
      const T = coatTextures(palette);
      mat = new THREE.MeshStandardMaterial({ map: T.map, bumpMap: T.bumpMap, bumpScale: 1.6, roughnessMap: T.orm, metalnessMap: T.orm, roughness: 1, metalness: 1, side: THREE.DoubleSide, envMapIntensity: 0.8 });
      // Forro: la cara interior es violeta, mate y sin bordado.
      const lin = new THREE.Color(palette.lining || '#4c2a70');
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uLining = { value: lin };
        sh.uniforms.uFlip = { value: liningFlip ? 1 : 0 };
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform vec3 uLining;\nuniform float uFlip;')
          .replace('#include <map_fragment>', `#include <map_fragment>
bool clothOuter = gl_FrontFacing;
if (!clothOuter) diffuseColor.rgb = uLining * (0.75 + 0.5 * diffuseColor.g / max(0.02, ${b2s(palette.base || '#29262c')}));`)
          .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
if (!clothOuter) roughnessFactor = 0.8;`)
          .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
if (!clothOuter) metalnessFactor = 0.0;`);
      };
      mat.customProgramCacheKey = () => 'coat-v1-' + (liningFlip ? 1 : 0);
    } else {
      mat = new THREE.MeshStandardMaterial({ map: capeTexture(palette || {}), roughness: 0.92, side: THREE.DoubleSide, envMapIntensity: 0.5, alphaTest: ragged ? 0.5 : 0 });
    }
    this.material = mat;
    for (const side of ['L', 'R']) {
      const n = cols * rows;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
      const uv = new Float32Array(n * 2);
      const idx = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        uv[i * 2] = (side === 'L' ? c : cols - 1 - c) / (cols - 1) * 0.5 + (side === 'L' ? 0 : 0.5);
        uv[i * 2 + 1] = 1 - r / (rows - 1);
        if (r < rows - 1 && c < cols - 1) idx.push(i, i + cols, i + 1, i + 1, i + cols, i + cols + 1);
      }
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(idx);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      scene.add(mesh);
      const pos = Array.from({ length: n }, () => new THREE.Vector3());
      const prev = Array.from({ length: n }, () => new THREE.Vector3());
      const A = (anchors || model.capeAnchors)[side];
      // canto delantero: la columna cuyo anclaje queda más cerca del centro del cuerpo
      const inner = Math.abs(A[0].x) < Math.abs(A[A.length - 1].x) ? 0 : cols - 1;
      const sgn = Math.sign(A[inner ? A.length - 1 : 0].x) || 1;
      this.panels.push({ side, geo, mesh, pos, prev, anchors: A, init: false, inner, sgn });
    }
    this.colliders = [];
    this.wind = 0;
  }

  anchorWorld(panel, c, out) {
    // interpolar entre los 4 anclajes del pecho
    const A = panel.anchors;
    const t = (c / (this.cols - 1)) * (A.length - 1);
    const i = Math.min(Math.floor(t), A.length - 2);
    out.copy(A[i]).lerp(A[i + 1], t - i);
    return this.model.bones[this.bone].localToWorld(out);
  }

  updateColliders() {
    const b = this.model.bones;
    const cap = (a, bb, r, ea = 0, eb = 0) => {
      const p0 = a.getWorldPosition(new THREE.Vector3());
      const p1 = bb.getWorldPosition(new THREE.Vector3());
      if (ea) p0.y += ea;
      if (eb) p1.y += eb;
      return { a: p0, b: p1, r };
    };
    this.colliders = [
      cap(b.hips, b.chest, 0.19, -0.05, 0.12),
      cap(b.hips, b.spine, 0.2, -0.1, 0),
      cap(b.thighL, b.shinL, 0.1), cap(b.thighR, b.shinR, 0.1),
      cap(b.shinL, b.footL, 0.07), cap(b.shinR, b.footR, 0.07),
    ];
  }

  reset() { for (const p of this.panels) p.init = false; }

  step(dt, windX = 0) {
    this.clock = (this.clock || 0) + dt;
    this.updateColliders();
    const segV = this.length / (this.rows - 1);
    const g = -9.8 * dt * dt;
    for (const P of this.panels) {
      const { pos, prev } = P;
      const C = this.cols, R = this.rows;
      if (!P.init) {
        const o = this.model.bones[this.bone].getWorldPosition(new THREE.Vector3());
        for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
          const i = r * C + c;
          this.anchorWorld(P, c, pos[i]);
          // arranca ya abierta en cono (el vuelo del bajo) para que la tela no se aplane al asentarse
          _a.set(pos[i].x - o.x, 0, pos[i].z - o.z);
          const rad = _a.length() || 1;
          pos[i].addScaledVector(_a, (this.flare * 0.6 * r) / (R - 1));
          // pliegues alternos hacia dentro y hacia fuera (la tela recogida empieza ya plegada)
          if (this.gather > 1 && r > 0) pos[i].addScaledVector(_a, ((c % 2 ? 1 : -1) * 0.028 * Math.min(1, r / 3)) / rad);
          pos[i].y -= r * segV;
          pos[i].z -= this.outward * r;
          prev[i].copy(pos[i]);
        }
        P.init = true;
        // cara delantera = exterior: si la normal geométrica mira hacia el cuerpo, invertir el orden
        if (!P.oriented) {
          const C2 = this.cols;
          const a = pos[C2 + 1], b = pos[2 * C2 + 1], c = pos[C2 + 2];
          _a.subVectors(b, a); _b.subVectors(c, a);
          const n = _p.crossVectors(_a, _b);
          const o = this.model.bones[this.bone].getWorldPosition(new THREE.Vector3());
          const out = new THREE.Vector3().subVectors(a, o); out.y = 0;
          if (n.dot(out) < 0) {
            const ix = P.geo.index.array;
            for (let k = 0; k < ix.length; k += 3) { const t2 = ix[k + 1]; ix[k + 1] = ix[k + 2]; ix[k + 2] = t2; }
            P.geo.index.needsUpdate = true;
          }
          P.oriented = true;
        }
      }
      // Integración
      const t = this.clock;
      for (let r = 1; r < R; r++) for (let c = 0; c < C; c++) {
        const i = r * C + c;
        const p = pos[i];
        _a.subVectors(p, prev[i]).multiplyScalar(this.drag);
        prev[i].copy(p);
        p.add(_a);
        p.y += g;
        const gust = windX * (0.6 + 0.4 * Math.sin(t * 2.3 + r * 0.7 + c)) * dt * dt * (r / R);
        p.x += gust;
        p.z += Math.sin(t * 1.7 + c * 1.3) * 0.15 * dt * dt * (r / R);
      }
      // Restricciones
      const segH = [], segH2 = [];
      for (let c = 0; c < C - 1; c++) {
        this.anchorWorld(P, c, _a); this.anchorWorld(P, c + 1, _b);
        segH.push(_a.distanceTo(_b) * (1 + 0.04));
        if (c < C - 2) { this.anchorWorld(P, c + 2, _b); segH2.push(_a.distanceTo(_b) * (1 + 0.04)); }
      }
      for (let it = 0; it < 6; it++) {
        for (let c = 0; c < C; c++) this.anchorWorld(P, c, pos[c]);
        for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
          const i = r * C + c;
          if (r < R - 1) this.constrain(pos, i, i + C, segV, r === 0);
          const wide = (r === 0 ? 1 : this.gather) + this.flare * r / (R - 1);
          if (c < C - 1) this.constrain(pos, i, i + 1, segH[c] * wide, r === 0);
          if (r < R - 1 && c < C - 1) this.constrain(pos, i, i + C + 1, Math.hypot(segV, segH[c] * (wide + this.flare * 0.5 / (R - 1))), r === 0);
          if (r < R - 2) this.constrain(pos, i, i + 2 * C, segV * 2, r === 0, 0.5);
          // flexión horizontal: conserva la curvatura del talle a lo largo de la falda (cono, no tabla)
          if (c < C - 2 && r > 0) this.constrain(pos, i, i + 2, segH2[c] * wide * (this.gather > 1 ? 0.86 : 1), false, 0.4);
        }
        // Canto delantero abierto: se aparta hacia su lado conforme baja (rigidez del ribete)
        if (this.open) {
          const lat = _b.set(P.sgn, 0, 0).applyQuaternion(this.model.bones[this.bone].getWorldQuaternion(_q));
          for (let r = 1; r < R; r++) {
            const want = this.open * Math.pow(r / (R - 1), 1.15);
            for (const [c, k] of [[P.inner, 0.8], [P.inner + (P.inner ? -1 : 1), 0.4]]) {
              this.anchorWorld(P, P.inner, _a);
              const p = pos[r * C + c];
              const cur = _p.subVectors(p, _a).dot(lat);
              const w2 = want * (c === P.inner ? 1 : 0.8);
              if (cur < w2) p.addScaledVector(lat, (w2 - cur) * k);
            }
          }
        }
        // Colisión con cápsulas
        for (let i = C; i < pos.length; i++) this.collide(pos[i]);
      }
      // Volcar a la geometría
      const arr = P.geo.attributes.position.array;
      for (let i = 0; i < pos.length; i++) { arr[i * 3] = pos[i].x; arr[i * 3 + 1] = pos[i].y; arr[i * 3 + 2] = pos[i].z; }
      P.geo.attributes.position.needsUpdate = true;
      P.geo.computeVertexNormals();
      P.geo.computeBoundingSphere();
    }
  }

  constrain(pos, i, j, rest, pinI, stiff = 1) {
    const a = pos[i], b = pos[j];
    _p.subVectors(b, a);
    const d = _p.length() || 1e-6;
    const diff = ((d - rest) / d) * stiff;
    if (pinI) { b.addScaledVector(_p, -diff); }
    else { a.addScaledVector(_p, diff * 0.5); b.addScaledVector(_p, -diff * 0.5); }
  }

  collide(p) {
    for (const c of this.colliders) {
      _a.subVectors(c.b, c.a);
      const l2 = _a.lengthSq() || 1e-6;
      const t = Math.max(0, Math.min(1, _p.subVectors(p, c.a).dot(_a) / l2));
      _b.copy(c.a).addScaledVector(_a, t);
      _p.subVectors(p, _b);
      const d = _p.length();
      const r = c.r + 0.025;
      if (d < r && d > 1e-5) p.addScaledVector(_p, (r - d) / d);
    }
  }

  setVisible(v) { for (const p of this.panels) p.mesh.visible = v; }
}
