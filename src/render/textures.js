import * as THREE from 'three';
import { fbm2, valueNoise2, voronoi2, hash2 } from '../core/rng.js';

// Texturas procedurales repetibles generadas al arrancar (sin descargas): color, normal (Sobel
// sobre altura) y rugosidad. Las normales Sobel dan relieve aparente, no cambian la silueta (§10.4).

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function heightToNormal(h, size, strength) {
  const out = new Uint8ClampedArray(size * size * 4);
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      let nx = -dx * strength, ny = dy * strength, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y * size + x) * 4;
      out[i] = (nx * 0.5 + 0.5) * 255;
      out[i + 1] = (ny * 0.5 + 0.5) * 255;
      out[i + 2] = (nz * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  return out;
}

function toTexture(pixels, size, srgb) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  img.data.set(pixels);
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

const srgbToByte = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));

// Sillería: hiladas de bloques tallados con juntas de mortero, desconchones y variación por bloque.
export function stoneAshlar(size = 1024, seed = 1, opts = {}) {
  const rows = opts.rows || 4;
  const h = new Float32Array(size * size);
  const col = new Uint8ClampedArray(size * size * 4);
  const rough = new Uint8ClampedArray(size * size * 4);
  const base = opts.base || [0.42, 0.43, 0.42];
  const warm = opts.warm || [0.62, 0.56, 0.46];
  const rowH = size / rows;
  for (let y = 0; y < size; y++) {
    const r = Math.floor(y / rowH);
    const fy = (y % rowH) / rowH;
    const blocksInRow = 2 + Math.floor(hash2(r, 3, seed) * 2);
    const off = hash2(r, 7, seed) * size;
    for (let x = 0; x < size; x++) {
      const xx = (x + off) % size;
      const bw = size / blocksInRow;
      const bi = Math.floor(xx / bw);
      const fx = (xx % bw) / bw;
      const id = hash2(bi, r, seed + 11);
      // distancia al borde del bloque (en px) con irregularidad
      const n1 = fbm2(x / size * 16, y / size * 16, 4, 16, seed + 3);
      const ex = Math.min(fx, 1 - fx) * bw, ey = Math.min(fy, 1 - fy) * rowH;
      const edge = Math.min(ex, ey) + (n1 - 0.5) * 10;
      const mortar = edge < 3.2 ? 1 : 0;
      const bevel = Math.min(1, Math.max(0, (edge - 2) / 14));
      const chip = fbm2(x / size * 40, y / size * 40, 3, 40, seed + 5);
      const grain = fbm2(x / size * 64, y / size * 64, 4, 64, seed + 9);
      const big = fbm2(x / size * 6, y / size * 6, 3, 6, seed + 13);
      let height = mortar ? 0.05 + chip * 0.05 : 0.45 + bevel * 0.4 + (grain - 0.5) * 0.18 + (big - 0.5) * 0.15;
      if (!mortar && chip > 0.68 && edge < 22) height -= (chip - 0.68) * 1.5; // desconchones en aristas
      h[y * size + x] = height;
      const tone = 0.82 + id * 0.3 + (big - 0.5) * 0.25 + (grain - 0.5) * 0.18;
      const w = Math.max(0, Math.min(1, id * 0.9 + (big - 0.5)));
      let cr = (base[0] + (warm[0] - base[0]) * w) * tone;
      let cg = (base[1] + (warm[1] - base[1]) * w) * tone;
      let cb = (base[2] + (warm[2] - base[2]) * w) * tone;
      if (mortar) { cr = 0.33 + chip * 0.08; cg = 0.31 + chip * 0.08; cb = 0.28 + chip * 0.07; }
      // manchas de humedad/hollín verticales
      const streak = fbm2(x / size * 30, y / size * 3, 3, 30, seed + 21);
      const dark = Math.max(0, streak - 0.55) * 0.8;
      cr *= 1 - dark; cg *= 1 - dark; cb *= 1 - dark * 0.9;
      const i = (y * size + x) * 4;
      col[i] = srgbToByte(cr); col[i + 1] = srgbToByte(cg); col[i + 2] = srgbToByte(cb); col[i + 3] = 255;
      const rv = mortar ? 0.95 : 0.7 + (grain - 0.5) * 0.3 - dark * 0.3;
      rough[i] = rough[i + 1] = rough[i + 2] = srgbToByte(rv); rough[i + 3] = 255;
    }
  }
  return {
    map: toTexture(col, size, true),
    normalMap: toTexture(heightToNormal(h, size, opts.strength || 2.4), size, false),
    roughnessMap: toTexture(rough, size, false),
  };
}

// Losas de suelo irregulares (Voronoi) con juntas y desgaste por pisadas.
export function stoneFlags(size = 1024, seed = 7) {
  const h = new Float32Array(size * size);
  const col = new Uint8ClampedArray(size * size * 4);
  const rough = new Uint8ClampedArray(size * size * 4);
  const cells = 5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * cells, v = (y / size) * cells * 1.6;
      const vr = voronoi2(u, v, cells, seed, 0.7);
      const gap = vr.f2 - vr.f1;
      const n = fbm2(x / size * 48, y / size * 48, 4, 48, seed + 1);
      const big = fbm2(x / size * 5, y / size * 5, 3, 5, seed + 4);
      const joint = gap < 0.05 ? 1 : 0;
      const bev = Math.min(1, gap / 0.2);
      h[y * size + x] = joint ? 0.1 : 0.5 + bev * 0.3 + (n - 0.5) * 0.2;
      const tone = 0.78 + vr.id * 0.32 + (big - 0.5) * 0.3;
      let r = 0.47 * tone, g = 0.45 * tone, b = 0.41 * tone;
      if (joint) { r = 0.2; g = 0.2; b = 0.18; }
      const i = (y * size + x) * 4;
      col[i] = srgbToByte(r + (n - 0.5) * 0.06); col[i + 1] = srgbToByte(g + (n - 0.5) * 0.06); col[i + 2] = srgbToByte(b + (n - 0.5) * 0.05); col[i + 3] = 255;
      const rv = joint ? 0.95 : 0.62 + (n - 0.5) * 0.35;
      rough[i] = rough[i + 1] = rough[i + 2] = srgbToByte(rv); rough[i + 3] = 255;
    }
  }
  return {
    map: toTexture(col, size, true),
    normalMap: toTexture(heightToNormal(h, size, 2.0), size, false),
    roughnessMap: toTexture(rough, size, false),
  };
}

// Tablones de madera oscura y húmeda con veta, nudos y clavos.
export function woodPlanks(size = 512, seed = 3) {
  const h = new Float32Array(size * size);
  const col = new Uint8ClampedArray(size * size * 4);
  const rough = new Uint8ClampedArray(size * size * 4);
  const planks = 4;
  for (let y = 0; y < size; y++) {
    const pi = Math.floor((y / size) * planks);
    const fy = ((y / size) * planks) % 1;
    for (let x = 0; x < size; x++) {
      const id = hash2(pi, 1, seed);
      const off = id * 7;
      const grain = Math.sin((x / size) * 3 + fbm2(x / size * 2 + off, y / size * 40, 4, 40, seed) * 9) * 0.5 + 0.5;
      const fine = fbm2(x / size * 120 + off, y / size * 12, 3, 120, seed + 2);
      const gap = Math.min(fy, 1 - fy) < 0.035 ? 1 : 0;
      const endJoint = ((x / size + id) % 0.5) < 0.006 ? 1 : 0;
      const nail = (Math.hypot(((x / size + id) % 0.5) * size - 10, (fy - 0.25) * size / planks) < 3 || Math.hypot(((x / size + id) % 0.5) * size - 10, (fy - 0.75) * size / planks) < 3) ? 1 : 0;
      h[y * size + x] = gap || endJoint ? 0.05 : 0.6 + grain * 0.15 + fine * 0.1 - nail * 0.2;
      const t = 0.7 + id * 0.35 + (grain - 0.5) * 0.3 + (fine - 0.5) * 0.2;
      let r = 0.27 * t, g = 0.19 * t, b = 0.12 * t;
      if (gap || endJoint) { r *= 0.35; g *= 0.35; b *= 0.35; }
      if (nail) { r = 0.22; g = 0.21; b = 0.2; }
      const i = (y * size + x) * 4;
      col[i] = srgbToByte(r); col[i + 1] = srgbToByte(g); col[i + 2] = srgbToByte(b); col[i + 3] = 255;
      const rv = nail ? 0.4 : 0.72 + (fine - 0.5) * 0.2;
      rough[i] = rough[i + 1] = rough[i + 2] = srgbToByte(rv); rough[i + 3] = 255;
    }
  }
  return {
    map: toTexture(col, size, true),
    normalMap: toTexture(heightToNormal(h, size, 2.2), size, false),
    roughnessMap: toTexture(rough, size, false),
  };
}

// Tarjeta de hiedra/musgo colgante con canal alfa (para bordes y arcos).
export function ivyCard(size = 512, seed = 5) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  let rnd = seed;
  const R = () => { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; };
  for (let s = 0; s < 14; s++) {
    let x = R() * size, y = 0;
    const len = size * (0.35 + R() * 0.65);
    ctx.strokeStyle = 'rgba(52,40,26,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, y);
    const pts = [];
    while (y < len) { x += (R() - 0.5) * 10; y += 6; ctx.lineTo(x, y); pts.push([x, y]); }
    ctx.stroke();
    for (const [px, py] of pts) {
      if (R() < 0.55) continue;
      const g = 70 + R() * 60;
      ctx.fillStyle = `rgba(${40 + R() * 30},${g},${30 + R() * 20},0.95)`;
      ctx.beginPath();
      const r = 4 + R() * 7;
      ctx.ellipse(px + (R() - 0.5) * 8, py, r, r * 0.75, R() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Degradado radial suave (partículas, haces de luz, halos).
export function softDot(size = 64) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Haz de luz: degradado vertical con bordes suaves y ruido (tarjeta, no luz volumétrica real).
export function shaftTexture(w = 128, hgt = 512) {
  const c = document.createElement('canvas');
  c.width = w; c.height = hgt;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, hgt);
  for (let y = 0; y < hgt; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / hgt;
      const edge = Math.sin(u * Math.PI) ** 2;
      const fall = (1 - v) ** 1.4 * Math.min(1, v * 8);
      const n = 0.7 + 0.3 * valueNoise2(u * 6, v * 2, 64, 3);
      const a = edge * fall * n;
      const i = (y * w + x) * 4;
      img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255; img.data[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Textura de normales de agua (ondas) repetible.
export function waterNormals(size = 256, seed = 11) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    h[y * size + x] = fbm2(x / size * 8, y / size * 8, 5, 8, seed);
  }
  return toTexture(heightToNormal(h, size, 3.0), size, false);
}

// Cielo de amanecer (para el mapa de entorno y el fondo).
export function skyGradient(w = 1024, hh = 512) {
  const c = document.createElement('canvas');
  c.width = w; c.height = hh;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, hh);
  g.addColorStop(0, '#1d2a44');
  g.addColorStop(0.38, '#4f5f80');
  g.addColorStop(0.58, '#b98a72');
  g.addColorStop(0.7, '#f1b37a');
  g.addColorStop(0.78, '#ffd9a0');
  g.addColorStop(1, '#7a6a62');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, hh);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}

// Roca natural de acantilado: estratos inclinados, grietas Voronoi y líquenes.
export function rockFace(size = 512, seed = 21) {
  const h = new Float32Array(size * size);
  const col = new Uint8ClampedArray(size * size * 4);
  const rough = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const n = fbm2(u * 5, v * 5, 6, 5, seed);
      const n2 = fbm2(u * 22, v * 22, 3, 22, seed + 5);
      // estratos inclinados y deformados
      const sv = v + (n - 0.5) * 0.35 + u * 0.12;
      const strata = Math.abs(Math.sin(sv * Math.PI * 9));
      const ledge = Math.pow(strata, 6);
      const vr = voronoi2(u * 3, v * 6, 3, seed + 3, 0.95);
      const crack = Math.min(1, (vr.f2 - vr.f1) / 0.025);
      h[y * size + x] = n * 0.55 + n2 * 0.2 + (1 - ledge) * 0.2 - (1 - crack) * 0.12;
      const tone = 0.82 + (n - 0.5) * 0.45 + (n2 - 0.5) * 0.12 + vr.id * 0.08;
      const lic = fbm2(u * 9 + 3, v * 9, 3, 9, seed + 9) > 0.64 ? 0.45 : 0;
      let r = 0.45 * tone, g = 0.4 * tone, b = 0.35 * tone;
      r = r * (1 - lic) + 0.46 * lic; g = g * (1 - lic) + 0.45 * lic; b = b * (1 - lic) + 0.33 * lic;
      const dark = 1 - (1 - crack) * 0.35 - ledge * 0.15;
      const i = (y * size + x) * 4;
      col[i] = srgbToByte(r * dark); col[i + 1] = srgbToByte(g * dark); col[i + 2] = srgbToByte(b * dark); col[i + 3] = 255;
      rough[i] = rough[i + 1] = rough[i + 2] = srgbToByte(0.84 + (n2 - 0.5) * 0.2); rough[i + 3] = 255;
    }
  }
  return {
    map: toTexture(col, size, true),
    normalMap: toTexture(heightToNormal(h, size, 3.0), size, false),
    roughnessMap: toTexture(rough, size, false),
  };
}

// Estandarte de tela con el motivo propio de las compuertas (ondas y rueda), canal alfa en el borde.
export function bannerTexture(w = 256, hh = 640, base = '#2f4b4c') {
  const c = document.createElement('canvas');
  c.width = w; c.height = hh;
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, hh);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let y = 0; y < hh; y += 3) ctx.fillRect(0, y, w, 1);
  ctx.strokeStyle = '#a88a57'; ctx.lineWidth = 6;
  ctx.strokeRect(14, 14, w - 28, hh - 120);
  // rueda de compuerta estilizada
  ctx.lineWidth = 7;
  ctx.beginPath(); ctx.arc(w / 2, 200, 70, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(w / 2, 200); ctx.lineTo(w / 2 + Math.cos(a) * 70, 200 + Math.sin(a) * 70); ctx.stroke();
  }
  ctx.lineWidth = 5;
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    for (let x = 30; x <= w - 30; x += 4) ctx.lineTo(x, 330 + k * 34 + Math.sin(x / 14 + k) * 8);
    ctx.stroke();
  }
  // bajo dentado y raído
  ctx.globalCompositeOperation = 'destination-out';
  for (let x = 0; x < w; x += 2) {
    const tri = Math.abs(((x / w) * 4) % 1 - 0.5) * 2;
    ctx.fillRect(x, hh - 100 + tri * 90 + Math.random() * 6, 2, 120);
  }
  ctx.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Mechón de hierba (tarjeta con alfa).
export function grassCard(size = 256, seed = 13) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  let rnd = seed;
  const R = () => { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; };
  for (let i = 0; i < 70; i++) {
    const x = size * (0.1 + R() * 0.8);
    const hgt = size * (0.35 + R() * 0.6);
    const lean = (R() - 0.5) * size * 0.25;
    const g = 70 + R() * 50;
    ctx.strokeStyle = `rgba(${60 + R() * 40},${g},${30 + R() * 20},1)`;
    ctx.lineWidth = 2 + R() * 2;
    ctx.beginPath(); ctx.moveTo(x, size);
    ctx.quadraticCurveTo(x + lean * 0.3, size - hgt * 0.6, x + lean, size - hgt);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
