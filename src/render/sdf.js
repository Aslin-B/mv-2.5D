// Escultura por campos de distancia con signo (SDF) + extracción de superficie (Surface Nets).
// Permite generar mallas continuas y orgánicas por código, sin recursos de terceros.
// Cada primitiva puede llevar hueso y material: de ahí salen pesos de skinning y regiones de pintura.

export const V = (x, y, z) => [x, y, z];

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.sqrt(dot(a, a));

// --- Primitivas -------------------------------------------------------------

// Cono redondeado (cápsula de radios variables) entre a y b. Inigo Quilez.
export function roundCone(a, b, r1, r2, extra = {}) {
  const ba = sub(b, a);
  const l2 = dot(ba, ba);
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const minB = [Math.min(a[0] - r1, b[0] - r2), Math.min(a[1] - r1, b[1] - r2), Math.min(a[2] - r1, b[2] - r2)];
  const maxB = [Math.max(a[0] + r1, b[0] + r2), Math.max(a[1] + r1, b[1] + r2), Math.max(a[2] + r1, b[2] + r2)];
  return {
    ...extra, a, b, r1, r2, min: minB, max: maxB,
    d(px, py, pz) {
      const pax = px - a[0], pay = py - a[1], paz = pz - a[2];
      const y = pax * ba[0] + pay * ba[1] + paz * ba[2];
      const z = y - l2;
      const xx = (pax * l2 - ba[0] * y) ** 2 + (pay * l2 - ba[1] * y) ** 2 + (paz * l2 - ba[2] * y) ** 2;
      const y2 = y * y * l2;
      const z2 = z * z * l2;
      const k = Math.sign(rr) * rr * rr * xx;
      if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(xx + z2) * il2 - r2;
      if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(xx + y2) * il2 - r1;
      return (Math.sqrt(xx * a2 * il2) + y * rr) * il2 - r1;
    },
    // Parámetro a lo largo del segmento [0,1] (para degradados de peso).
    t(px, py, pz) {
      const v = ((px - a[0]) * ba[0] + (py - a[1]) * ba[1] + (pz - a[2]) * ba[2]) * il2;
      return v < 0 ? 0 : v > 1 ? 1 : v;
    },
  };
}

// Elipsoide (aproximación con distancia acotada).
export function ellipsoid(c, r, extra = {}) {
  return {
    ...extra, c, r,
    min: [c[0] - r[0], c[1] - r[1], c[2] - r[2]],
    max: [c[0] + r[0], c[1] + r[1], c[2] + r[2]],
    d(px, py, pz) {
      const x = (px - c[0]) / r[0], y = (py - c[1]) / r[1], z = (pz - c[2]) / r[2];
      const k0 = Math.sqrt(x * x + y * y + z * z);
      const x1 = x / r[0], y1 = y / r[1], z1 = z / r[2];
      const k1 = Math.sqrt(x1 * x1 + y1 * y1 + z1 * z1);
      return k1 === 0 ? -Math.min(r[0], r[1], r[2]) : (k0 * (k0 - 1)) / k1;
    },
  };
}

// Caja redondeada orientada a ejes.
export function roundBox(c, h, rad, extra = {}) {
  return {
    ...extra, c, h,
    min: [c[0] - h[0] - rad, c[1] - h[1] - rad, c[2] - h[2] - rad],
    max: [c[0] + h[0] + rad, c[1] + h[1] + rad, c[2] + h[2] + rad],
    d(px, py, pz) {
      const qx = Math.abs(px - c[0]) - h[0], qy = Math.abs(py - c[1]) - h[1], qz = Math.abs(pz - c[2]) - h[2];
      const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
      return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - rad;
    },
  };
}

// --- Composición ------------------------------------------------------------

// Escena SDF: unión suave exponencial (independiente del orden) de primitivas positivas,
// menos primitivas sustractivas, más deformación opcional.
export class SdfScene {
  constructor({ k = 0.018, subK = 0.006 } = {}) {
    this.k = k;
    this.subK = subK;
    this.prims = [];
    this.subs = [];
    this.displace = null; // (x,y,z,prim) -> desplazamiento (m), positivo hacia fuera
    this.clip = null;     // (x,y,z) -> distancia de recorte (intersección)
  }
  add(p) { this.prims.push(p); return p; }
  carve(p) { this.subs.push(p); return p; }

  bounds(margin = 0.02) {
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (const p of this.prims) {
      for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], p.min[i]); mx[i] = Math.max(mx[i], p.max[i]); }
    }
    return { min: mn.map((v) => v - margin), max: mx.map((v) => v + margin) };
  }

  // Distancia en un punto con lista de primitivas activas (subconjunto cercano).
  evalWith(px, py, pz, prims, subs) {
    const k = this.k;
    let s = 0, dmin = 1e9;
    for (let i = 0; i < prims.length; i++) {
      const d = prims[i].d(px, py, pz);
      if (d < dmin) dmin = d;
      s += Math.exp(-d / k);
    }
    let d = s > 0 ? -k * Math.log(s) : dmin;
    if (!isFinite(d)) d = dmin;
    for (let i = 0; i < subs.length; i++) {
      // Sustracción suave (IQ): mezcla(d, -dc, h) con h según la cercanía de ambas superficies.
      const dc = subs[i].d(px, py, pz);
      const h = Math.min(Math.max(0.5 - 0.5 * (d + dc) / this.subK, 0), 1);
      d = d + (-dc - d) * h + this.subK * h * (1 - h);
    }
    if (this.clip) d = Math.max(d, this.clip(px, py, pz));
    return d;
  }

  eval(px, py, pz) { return this.evalWith(px, py, pz, this.prims, this.subs); }

  // Primitiva más cercana y pesos por hueso en un punto de la superficie.
  analyze(px, py, pz, sigma) {
    let best = null, bd = 1e9;
    const ds = new Float64Array(this.prims.length);
    for (let i = 0; i < this.prims.length; i++) {
      const d = this.prims[i].d(px, py, pz);
      ds[i] = d;
      const pd = d - (this.prims[i].priority || 0);
      if (pd < bd) { bd = pd; best = this.prims[i]; }
    }
    let dmin = 1e9;
    for (let i = 0; i < ds.length; i++) dmin = Math.min(dmin, ds[i]);
    const bones = new Map();
    for (let i = 0; i < this.prims.length; i++) {
      const p = this.prims[i];
      if (p.bone == null) continue;
      const w = Math.exp(-(ds[i] - dmin) / sigma);
      if (w < 1e-4) continue;
      if (p.boneB != null) {
        // Degradado de peso a lo largo del segmento (articulación suave).
        const t = p.t ? p.t(px, py, pz) : 0;
        const f = Math.min(Math.max((t - (p.blendFrom ?? 0.7)) / (1 - (p.blendFrom ?? 0.7)), 0), 1) * (p.blendMax ?? 0.5);
        bones.set(p.bone, (bones.get(p.bone) || 0) + w * (1 - f));
        bones.set(p.boneB, (bones.get(p.boneB) || 0) + w * f);
      } else {
        bones.set(p.bone, (bones.get(p.bone) || 0) + w);
      }
    }
    return { prim: best, bones };
  }
}

// --- Surface Nets -----------------------------------------------------------
// Extrae una malla de la isosuperficie 0 en una rejilla de celda `cell`.
export function surfaceNets(scene, cell, boundsIn) {
  const b = boundsIn || scene.bounds(cell * 3);
  const nx = Math.ceil((b.max[0] - b.min[0]) / cell) + 1;
  const ny = Math.ceil((b.max[1] - b.min[1]) / cell) + 1;
  const nz = Math.ceil((b.max[2] - b.min[2]) / cell) + 1;
  const ox = b.min[0], oy = b.min[1], oz = b.min[2];
  const field = new Float32Array(nx * ny * nz);
  const idx = (i, j, k) => i + nx * (j + ny * k);

  // Evaluación por bloques con primitivas filtradas por caja (acelera ~10x).
  const B = 8;
  const margin = scene.k * 6 + cell * 2;
  for (let bk = 0; bk < nz; bk += B) {
    for (let bj = 0; bj < ny; bj += B) {
      for (let bi = 0; bi < nx; bi += B) {
        const x0 = ox + bi * cell, y0 = oy + bj * cell, z0 = oz + bk * cell;
        const x1 = x0 + B * cell, y1 = y0 + B * cell, z1 = z0 + B * cell;
        const act = scene.prims.filter((p) =>
          p.max[0] + margin > x0 && p.min[0] - margin < x1 &&
          p.max[1] + margin > y0 && p.min[1] - margin < y1 &&
          p.max[2] + margin > z0 && p.min[2] - margin < z1);
        const subs = scene.subs.filter((p) =>
          p.max[0] + margin > x0 && p.min[0] - margin < x1 &&
          p.max[1] + margin > y0 && p.min[1] - margin < y1 &&
          p.max[2] + margin > z0 && p.min[2] - margin < z1);
        for (let k = bk; k < Math.min(bk + B, nz); k++) {
          for (let j = bj; j < Math.min(bj + B, ny); j++) {
            for (let i = bi; i < Math.min(bi + B, nx); i++) {
              const px = ox + i * cell, py = oy + j * cell, pz = oz + k * cell;
              let d = act.length ? scene.evalWith(px, py, pz, act, subs) : 1;
              if (scene.displace && d < cell * 3 && d > -cell * 3) d -= scene.displace(px, py, pz);
              field[idx(i, j, k)] = d;
            }
          }
        }
      }
    }
  }

  const vertIndex = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cidx = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const positions = [];
  const corners = [
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
  ];
  const edges = [
    [0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const vals = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const v = field[idx(i + corners[c][0], j + corners[c][1], k + corners[c][2])];
          vals[c] = v;
          if (v < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, cnt = 0;
        for (const [e0, e1] of edges) {
          const a = vals[e0], bb = vals[e1];
          if ((a < 0) === (bb < 0)) continue;
          const t = a / (a - bb);
          sx += corners[e0][0] + (corners[e1][0] - corners[e0][0]) * t;
          sy += corners[e0][1] + (corners[e1][1] - corners[e0][1]) * t;
          sz += corners[e0][2] + (corners[e1][2] - corners[e0][2]) * t;
          cnt++;
        }
        vertIndex[cidx(i, j, k)] = positions.length / 3;
        positions.push(ox + (i + sx / cnt) * cell, oy + (j + sy / cnt) * cell, oz + (k + sz / cnt) * cell);
      }
    }
  }

  const indices = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) indices.push(a, c, b, a, d, c);
    else indices.push(a, b, c, a, c, d);
  };
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const v0 = field[idx(i, j, k)];
        // Aristas en +x, +y, +z desde el vértice (i,j,k) de la rejilla.
        if (i < nx - 1 && j > 0 && k > 0) {
          const v1 = field[idx(i + 1, j, k)];
          if ((v0 < 0) !== (v1 < 0)) {
            quad(vertIndex[cidx(i, j - 1, k - 1)], vertIndex[cidx(i, j, k - 1)], vertIndex[cidx(i, j, k)], vertIndex[cidx(i, j - 1, k)], v0 < 0);
          }
        }
        if (j < ny - 1 && i > 0 && k > 0) {
          const v1 = field[idx(i, j + 1, k)];
          if ((v0 < 0) !== (v1 < 0)) {
            quad(vertIndex[cidx(i - 1, j, k - 1)], vertIndex[cidx(i - 1, j, k)], vertIndex[cidx(i, j, k)], vertIndex[cidx(i, j, k - 1)], v0 < 0);
          }
        }
        if (k < nz - 1 && i > 0 && j > 0) {
          const v1 = field[idx(i, j, k + 1)];
          if ((v0 < 0) !== (v1 < 0)) {
            quad(vertIndex[cidx(i - 1, j - 1, k)], vertIndex[cidx(i, j - 1, k)], vertIndex[cidx(i, j, k)], vertIndex[cidx(i - 1, j, k)], v0 < 0);
          }
        }
      }
    }
  }

  const pos = new Float32Array(positions);
  if (scene.relax) relax({ positions: pos, indices }, scene.relax, 0.3);
  const normals = gradientNormals(scene, pos, cell * 0.5);
  // Orientar cada triángulo según el gradiente (robusto ante cualquier convención de recorrido).
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, bI = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const positions = pos;
    const e1x = positions[bI] - positions[a], e1y = positions[bI + 1] - positions[a + 1], e1z = positions[bI + 2] - positions[a + 2];
    const e2x = positions[c] - positions[a], e2y = positions[c + 1] - positions[a + 1], e2z = positions[c + 2] - positions[a + 2];
    const fx = e1y * e2z - e1z * e2y, fy = e1z * e2x - e1x * e2z, fz = e1x * e2y - e1y * e2x;
    const nx2 = normals[a] + normals[bI] + normals[c], ny2 = normals[a + 1] + normals[bI + 1] + normals[c + 1], nz2 = normals[a + 2] + normals[bI + 2] + normals[c + 2];
    if (fx * nx2 + fy * ny2 + fz * nz2 < 0) { const tmp = indices[t + 1]; indices[t + 1] = indices[t + 2]; indices[t + 2] = tmp; }
  }
  return { positions: pos, normals, indices };
}

export function gradientNormals(scene, positions, h) {
  const normals = new Float32Array(positions.length);
  const f = (x, y, z) => {
    let d = scene.eval(x, y, z);
    if (scene.displace) d -= scene.displace(x, y, z);
    return d;
  };
  for (let v = 0; v < positions.length; v += 3) {
    const x = positions[v], y = positions[v + 1], z = positions[v + 2];
    const gx = f(x + h, y, z) - f(x - h, y, z);
    const gy = f(x, y + h, z) - f(x, y - h, z);
    const gz = f(x, y, z + h) - f(x, y, z - h);
    const l = Math.hypot(gx, gy, gz) || 1;
    normals[v] = gx / l; normals[v + 1] = gy / l; normals[v + 2] = gz / l;
  }
  return normals;
}

// Suavizado laplaciano ligero (reduce el escalonado de la rejilla sin perder volumen notable).
export function relax(mesh, iterations = 1, amount = 0.35) {
  const { positions, indices } = mesh;
  const n = positions.length / 3;
  const neighbors = Array.from({ length: n }, () => new Set());
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i], b = indices[i + 1], c = indices[i + 2];
    neighbors[a].add(b); neighbors[a].add(c);
    neighbors[b].add(a); neighbors[b].add(c);
    neighbors[c].add(a); neighbors[c].add(b);
  }
  const tmp = new Float32Array(positions.length);
  for (let it = 0; it < iterations; it++) {
    for (let v = 0; v < n; v++) {
      let sx = 0, sy = 0, sz = 0, c = 0;
      for (const w of neighbors[v]) { sx += positions[w * 3]; sy += positions[w * 3 + 1]; sz += positions[w * 3 + 2]; c++; }
      if (!c) { tmp[v * 3] = positions[v * 3]; tmp[v * 3 + 1] = positions[v * 3 + 1]; tmp[v * 3 + 2] = positions[v * 3 + 2]; continue; }
      tmp[v * 3] = positions[v * 3] + (sx / c - positions[v * 3]) * amount;
      tmp[v * 3 + 1] = positions[v * 3 + 1] + (sy / c - positions[v * 3 + 1]) * amount;
      tmp[v * 3 + 2] = positions[v * 3 + 2] + (sz / c - positions[v * 3 + 2]) * amount;
    }
    positions.set(tmp);
  }
  return mesh;
}

export { len, sub, dot };
