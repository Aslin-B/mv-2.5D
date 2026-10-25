import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mulberry32 } from '../core/rng.js';

// Kit modular de arquitectura (biblia §7.3): sillares, arcos de dovelas, columnas, vigas, barandas.
// Todo se acumula por material y se fusiona en pocas llamadas de dibujo.
// Convención: z = 0 es el plano de juego; z negativo hacia el fondo.

export class StaticBatch {
  constructor() { this.groups = new Map(); }
  push(material, geo, { cast = true, receive = true } = {}) {
    const key = material.uuid + (cast ? 'c' : 'n');
    if (!this.groups.has(key)) this.groups.set(key, { material, geos: [], cast, receive });
    // Normalizar atributos para poder fusionar
    if (geo.index) geo = geo.toNonIndexed();
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    this.groups.get(key).geos.push(geo);
  }
  build(parent) {
    const meshes = [];
    for (const { material, geos, cast, receive } of this.groups.values()) {
      const merged = mergeGeometries(geos, false);
      const m = new THREE.Mesh(merged, material);
      m.castShadow = cast; m.receiveShadow = receive;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      parent.add(m);
      meshes.push(m);
    }
    this.groups.clear();
    return meshes;
  }
}

export class Kit {
  constructor(batch, mats, seed = 1) {
    this.batch = batch;
    this.m = mats;
    this.rnd = mulberry32(seed);
  }
  r(a = 0, b = 1) { return a + (b - a) * this.rnd(); }

  box(x0, y0, x1, y1, z0, z1, mat = this.m.stone, opts = {}) {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    const rad = opts.radius ?? Math.min(0.05, w * 0.2, h * 0.2, d * 0.2);
    const g = rad > 0.005 ? new RoundedBoxGeometry(w, h, d, 2, rad) : new THREE.BoxGeometry(w, h, d);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.batch.push(mat, g, opts);
    return g;
  }

  // Muro de sillares con bloques individuales en las aristas (lectura de borde, §7.3).
  wall(x0, x1, y0, y1, z0, z1, mat = this.m.stone, opts = {}) {
    this.box(x0, y0, x1, y1, z0, z1, mat, { radius: 0.03, ...opts });
  }

  // Plataforma: núcleo + bordillo de bloques con irregularidad controlada.
  platform(x0, x1, top, bottom, z0 = -2.2, z1 = 1.3, mat = this.m.stone, opts = {}) {
    this.box(x0, bottom, x1, top - 0.28, z0, z1 - 0.12, mat, { radius: 0.02, ...opts });
    // fila de bloques de coronación
    let x = x0;
    while (x < x1 - 0.05) {
      const w = Math.min(this.r(0.7, 1.3), x1 - x);
      const inset = this.r(0, 0.03);
      this.box(x + 0.01, top - 0.3, x + w - 0.01, top - inset * 0.3, z0, z1 + this.r(-0.04, 0.06), opts.capMat || mat, { radius: 0.035 });
      x += w;
    }
  }

  // Arco de medio punto con dovelas extruidas y clave destacada.
  arch(cx, springY, span, z, depth = 0.9, ring = 0.42, mat = this.m.stone, opts = {}) {
    const R = span / 2;
    const n = opts.voussoirs || Math.max(7, Math.round((Math.PI * R) / 0.45) | 1);
    const gap = 0.012;
    for (let i = 0; i < n; i++) {
      const a0 = Math.PI - (i / n) * Math.PI - gap, a1 = Math.PI - ((i + 1) / n) * Math.PI + gap;
      const key = i === Math.floor(n / 2);
      const ro = R + ring + (key ? 0.08 : 0);
      const shape = new THREE.Shape();
      shape.moveTo(Math.cos(a0) * R, Math.sin(a0) * R);
      shape.lineTo(Math.cos(a0) * ro, Math.sin(a0) * ro);
      shape.absarc(0, 0, ro, a0, a1, true);
      shape.lineTo(Math.cos(a1) * R, Math.sin(a1) * R);
      shape.absarc(0, 0, R, a1, a0, false);
      const g = new THREE.ExtrudeGeometry(shape, { depth: depth - 0.04, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1, curveSegments: 3 });
      g.translate(cx, springY, z - depth / 2);
      this.batch.push(mat, g, opts);
    }
  }

  // Pilar de bloques apilados.
  pier(cx, y0, y1, z, w = 0.9, d = 0.9, mat = this.m.stone, opts = {}) {
    let y = y0;
    while (y < y1 - 0.05) {
      const h = Math.min(this.r(0.45, 0.65), y1 - y);
      const jw = this.r(-0.02, 0.02);
      this.box(cx - w / 2 + jw, y + 0.008, cx + w / 2 + jw, y + h - 0.008, z - d / 2, z + d / 2, mat, { radius: 0.035, ...opts });
      y += h;
    }
  }

  // Columna de tambores con basa y capitel.
  column(cx, y0, y1, z, r = 0.32, mat = this.m.stone, opts = {}) {
    this.box(cx - r * 1.35, y0, cx + r * 1.35, y0 + 0.28, z - r * 1.35, z + r * 1.35, mat, { radius: 0.04, ...opts });
    let y = y0 + 0.28;
    const top = y1 - 0.34;
    while (y < top - 0.05) {
      const h = Math.min(this.r(0.55, 0.85), top - y);
      const rr = r * this.r(0.97, 1.03);
      const g = new THREE.CylinderGeometry(rr, rr * 1.01, h - 0.02, 20, 1);
      g.translate(cx, y + h / 2, z);
      this.batch.push(mat, g, opts);
      y += h;
    }
    this.box(cx - r * 1.4, top, cx + r * 1.4, y1, z - r * 1.4, z + r * 1.4, mat, { radius: 0.05, ...opts });
  }

  beam(x0, x1, y, z, h = 0.32, d = 0.32, mat = this.m.wood, opts = {}) {
    this.box(x0, y - h / 2, x1, y + h / 2, z - d / 2, z + d / 2, mat, { radius: 0.025, ...opts });
  }

  post(x, y0, y1, z, w = 0.22, mat = this.m.wood, opts = {}) {
    this.box(x - w / 2, y0, x + w / 2, y1, z - w / 2, z + w / 2, mat, { radius: 0.02, ...opts });
  }

  // Pasarela de tablones sobre vigas y postes.
  walkway(x0, x1, top, z0, z1, postBottom, mat = this.m.wood) {
    let x = x0;
    while (x < x1 - 0.05) {
      const w = Math.min(0.3, x1 - x);
      this.box(x + 0.01, top - 0.09, x + w - 0.012, top, z0 + this.r(-0.05, 0.05), z1 + this.r(-0.05, 0.05), mat, { radius: 0.012 });
      x += w;
    }
    this.beam(x0, x1, top - 0.2, z0 + 0.2, 0.2, 0.22, mat);
    this.beam(x0, x1, top - 0.2, z1 - 0.2, 0.2, 0.22, mat);
    for (let px = x0 + 0.3; px < x1; px += 2.2) {
      this.post(px, postBottom, top - 0.1, z0 + 0.2, 0.22, mat);
      this.post(px, postBottom, top - 0.1, z1 - 0.2, 0.22, mat);
      // riostra diagonal
      const g = new THREE.BoxGeometry(0.1, 1.6, 0.1);
      g.rotateZ(0.7);
      g.translate(px + 0.5, top - 0.9, z0 + 0.2);
      this.batch.push(mat, g);
    }
  }

  // Baranda de madera con balaústres.
  railing(x0, x1, y, z, mat = this.m.wood) {
    this.beam(x0, x1, y + 0.95, z, 0.08, 0.1, mat);
    for (let x = x0 + 0.1; x < x1; x += 0.55) this.post(x, y, y + 0.95, z, 0.07, mat);
  }

  // Cadena colgante (eslabones toroidales).
  chain(x, y0, y1, z, mat) {
    const n = Math.floor((y0 - y1) / 0.07);
    for (let i = 0; i < n; i++) {
      const g = new THREE.TorusGeometry(0.035, 0.011, 5, 10);
      if (i % 2) g.rotateY(Math.PI / 2);
      g.translate(x, y0 - i * 0.07, z);
      this.batch.push(mat, g, { cast: true });
    }
  }
}

// Rueda hidráulica de madera y bronce (devuelve un grupo para animar su giro).
// Usa material con UV (no triplanar) para que la textura gire con la pieza.
export function buildWheel(radius, width, mats, spokes = 10) {
  const group = new THREE.Group();
  const parts = [];
  const rim = new THREE.TorusGeometry(radius, 0.09, 8, 48);
  const rim2 = rim.clone();
  rim.translate(0, 0, width / 2);
  rim2.translate(0, 0, -width / 2);
  parts.push(rim, rim2);
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    for (const zz of [width / 2, -width / 2]) {
      const s = new THREE.BoxGeometry(radius * 2 - 0.1, 0.12, 0.1);
      s.rotateZ(a);
      s.translate(0, 0, zz);
      if (i < spokes / 2) parts.push(s);
    }
    const p = new THREE.BoxGeometry(0.06, radius * 0.32, width + 0.1);
    p.translate(radius + 0.05, 0, 0);
    p.rotateZ(a + 0.15);
    parts.push(p);
  }
  const wood = new THREE.Mesh(mergeGeometries(parts.map((g) => g.toNonIndexed())), mats.woodUV);
  wood.castShadow = true; wood.receiveShadow = true;
  group.add(wood);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, width + 0.4, 16).rotateX(Math.PI / 2), mats.bronze);
  hub.castShadow = true;
  group.add(hub);
  return group;
}
