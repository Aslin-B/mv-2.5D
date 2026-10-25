// Aleatoriedad determinista y ruido para generar recursos por código.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hash entero 2D/3D -> [0,1).
export function hash2(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function hash3(x, y, z, seed = 0) {
  return hash2(x + z * 1013, y - z * 7919, seed);
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

// Ruido de valor 2D periódico (period en celdas) para texturas repetibles.
export function valueNoise2(x, y, period = 256, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const p = period;
  const x0 = ((xi % p) + p) % p, y0 = ((yi % p) + p) % p;
  const x1 = (x0 + 1) % p, y1 = (y0 + 1) % p;
  const a = hash2(x0, y0, seed), b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed), d = hash2(x1, y1, seed);
  const u = fade(xf), v = fade(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm2(x, y, octaves = 5, period = 256, seed = 0, lac = 2, gain = 0.5) {
  let sum = 0, amp = 0.5, norm = 0, f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(x * f, y * f, period * f, seed + i * 31);
    norm += amp;
    amp *= gain;
    f *= lac;
  }
  return sum / norm;
}

// Ruido 3D suave (no periódico) para esculpir volúmenes.
export function valueNoise3(x, y, z, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = fade(xf), v = fade(yf), w = fade(zf);
  const n = (i, j, k) => hash3(xi + i, yi + j, zi + k, seed);
  const x00 = n(0, 0, 0) + (n(1, 0, 0) - n(0, 0, 0)) * u;
  const x10 = n(0, 1, 0) + (n(1, 1, 0) - n(0, 1, 0)) * u;
  const x01 = n(0, 0, 1) + (n(1, 0, 1) - n(0, 0, 1)) * u;
  const x11 = n(0, 1, 1) + (n(1, 1, 1) - n(0, 1, 1)) * u;
  const y0 = x00 + (x10 - x00) * v;
  const y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}

// Diagrama de Voronoi periódico (distancias F1, F2 e id de celda) para sillares y empedrados.
export function voronoi2(x, y, period, seed = 0, jitter = 0.85) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 1e9, f2 = 1e9, id = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = xi + i, cy = yi + j;
      const wx = ((cx % period) + period) % period;
      const wy = ((cy % period) + period) % period;
      const px = cx + 0.5 + (hash2(wx, wy, seed) - 0.5) * jitter;
      const py = cy + 0.5 + (hash2(wx, wy, seed + 17) - 0.5) * jitter;
      const dx = px - x, dy = py - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < f1) { f2 = f1; f1 = d; id = hash2(wx, wy, seed + 99); }
      else if (d < f2) f2 = d;
    }
  }
  return { f1, f2, id };
}
