// Mundo físico 2D: rectángulos alineados a ejes en metros (X derecha, Y arriba).
// La colisión es una superficie simplificada y predecible, separada de la malla visible (biblia §7.5).

import { segAABB } from '../core/geom2d.js';

const EPS = 1e-4;

export class PhysicsWorld {
  constructor() {
    this.solids = [];
    this.volumes = []; // agua, peligros, disparadores: nunca inferidos de una textura
  }

  addSolid(s) {
    const rect = {
      kind: 'solid', surface: 'stone', grab: true, enabled: true, id: null,
      ...s,
    };
    this.solids.push(rect);
    return rect;
  }

  addVolume(v) {
    const vol = { enabled: true, ...v };
    this.volumes.push(vol);
    return vol;
  }

  overlaps(x0, y0, x1, y1, includeOneway = false, ignore = null) {
    for (const s of this.solids) {
      if (!s.enabled || s === ignore) continue;
      if (s.kind === 'oneway' && !includeOneway) continue;
      if (x1 > s.x0 + EPS && x0 < s.x1 - EPS && y1 > s.y0 + EPS && y0 < s.y1 - EPS) return s;
    }
    return null;
  }

  isFree(x0, y0, x1, y1) { return !this.overlaps(x0, y0, x1, y1); }

  volumesAt(x0, y0, x1, y1, type) {
    const out = [];
    for (const v of this.volumes) {
      if (!v.enabled || (type && v.type !== type)) continue;
      if (x1 > v.x0 && x0 < v.x1 && y1 > v.y0 && y0 < v.y1) out.push(v);
    }
    return out;
  }

  // Superficie bajo un punto (para enemigos y sondeo de bordes).
  groundBelow(x, y, maxDrop = 50) {
    let best = null;
    for (const s of this.solids) {
      if (!s.enabled) continue;
      if (x <= s.x0 || x >= s.x1) continue;
      if (s.y1 <= y + EPS && s.y1 >= y - maxDrop) {
        if (!best || s.y1 > best.y1) best = s;
      }
    }
    return best;
  }

  // ¿Bloquea algún sólido la línea entre dos puntos? (línea de visión de enemigos)
  segmentBlocked(ax, ay, bx, by) {
    for (const s of this.solids) {
      if (!s.enabled || s.kind !== 'solid' || s.seeThrough) continue;
      if (segAABB(ax, ay, bx, by, s)) return s;
    }
    return null;
  }

  // Raycast horizontal/vertical simple contra sólidos (devuelve distancia o Infinity).
  raySolid(x, y, dx, dy, maxDist) {
    let best = Infinity;
    for (const s of this.solids) {
      if (!s.enabled || s.kind !== 'solid') continue;
      if (dx !== 0) {
        if (y <= s.y0 || y >= s.y1) continue;
        const edge = dx > 0 ? s.x0 : s.x1;
        const d = (edge - x) * Math.sign(dx);
        if (d >= -EPS && d < best && d <= maxDist) best = Math.max(0, d);
      } else if (dy !== 0) {
        if (x <= s.x0 || x >= s.x1) continue;
        const edge = dy > 0 ? s.y0 : s.y1;
        const d = (edge - y) * Math.sign(dy);
        if (d >= -EPS && d < best && d <= maxDist) best = Math.max(0, d);
      }
    }
    return best;
  }
}

// Desplaza un cuerpo AABB (x = centro, y = pies) resolviendo eje por eje.
// body: { x, y, w, h, dropThrough } -> devuelve contactos del paso.
export function moveBody(world, body, dx, dy, opts = {}) {
  const res = { left: false, right: false, ceil: false, ground: false, groundSolid: null, stepped: 0 };
  const stepUp = opts.stepUp || 0;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 0.18));
  const sx = dx / n, sy = dy / n;
  for (let i = 0; i < n; i++) {
    moveX(world, body, sx, res, stepUp && opts.grounded ? stepUp : 0);
    moveY(world, body, sy, res);
  }
  return res;
}

function moveX(world, body, dx, res, stepUp) {
  if (dx === 0) return;
  const hw = body.w / 2;
  const oldL = body.x - hw, oldR = body.x + hw;
  let nx = body.x + dx;
  for (const s of world.solids) {
    if (!s.enabled || s.kind !== 'solid') continue;
    if (body.y + body.h <= s.y0 + EPS || body.y >= s.y1 - EPS) continue;
    if (dx > 0 && oldR <= s.x0 + EPS && nx + hw > s.x0) {
      // Escalón bajo: subir sin exigir salto.
      if (stepUp > 0 && s.y1 - body.y <= stepUp && world.isFree(s.x0, s.y1, s.x0 + body.w, s.y1 + body.h)) {
        res.stepped = Math.max(res.stepped, s.y1 - body.y);
        body.y = s.y1;
        continue;
      }
      nx = s.x0 - hw; res.right = true;
    } else if (dx < 0 && oldL >= s.x1 - EPS && nx - hw < s.x1) {
      if (stepUp > 0 && s.y1 - body.y <= stepUp && world.isFree(s.x1 - body.w, s.y1, s.x1, s.y1 + body.h)) {
        res.stepped = Math.max(res.stepped, s.y1 - body.y);
        body.y = s.y1;
        continue;
      }
      nx = s.x1 + hw; res.left = true;
    }
  }
  body.x = nx;
}

function moveY(world, body, dy, res) {
  if (dy === 0) return;
  const hw = body.w / 2;
  const x0 = body.x - hw, x1 = body.x + hw;
  const oldB = body.y, oldT = body.y + body.h;
  let ny = body.y + dy;
  for (const s of world.solids) {
    if (!s.enabled) continue;
    if (x1 <= s.x0 + EPS || x0 >= s.x1 - EPS) continue;
    if (dy < 0) {
      if (s.kind === 'oneway' && body.dropThrough) continue;
      if (oldB >= s.y1 - EPS && ny < s.y1) { ny = s.y1; res.ground = true; res.groundSolid = s; }
    } else if (s.kind === 'solid') {
      if (oldT <= s.y0 + EPS && ny + body.h > s.y0) { ny = s.y0 - body.h; res.ceil = true; }
    }
  }
  body.y = ny;
}

// Sondeo de suelo sin moverse (para mantener contacto en bordes y plataformas móviles).
export function probeGround(world, body, dist = 0.04) {
  const hw = body.w / 2;
  for (const s of world.solids) {
    if (!s.enabled) continue;
    if (s.kind === 'oneway' && body.dropThrough) continue;
    if (body.x + hw <= s.x0 + EPS || body.x - hw >= s.x1 - EPS) continue;
    if (body.y >= s.y1 - EPS && body.y - s.y1 <= dist) return s;
  }
  return null;
}

// Expulsa un cuerpo atrapado dentro de un sólido (p. ej. una compuerta que baja) hacia el lado libre más cercano.
export function depenetrate(world, body) {
  const hw = body.w / 2;
  const s = world.overlaps(body.x - hw, body.y, body.x + hw, body.y + body.h);
  if (!s) return false;
  const pushL = body.x + hw - s.x0;
  const pushR = s.x1 - (body.x - hw);
  const pushUp = s.y1 - body.y;
  const opts = [
    { d: pushUp, f: () => { body.y = s.y1; } },
    { d: pushL, f: () => { body.x = s.x0 - hw - 0.001; } },
    { d: pushR, f: () => { body.x = s.x1 + hw + 0.001; } },
  ].sort((a, b) => a.d - b.d);
  for (const o of opts) {
    const sx = body.x, sy = body.y;
    o.f();
    if (!world.overlaps(body.x - hw, body.y, body.x + hw, body.y + body.h)) return true;
    body.x = sx; body.y = sy;
  }
  opts[0].f();
  return true;
}
