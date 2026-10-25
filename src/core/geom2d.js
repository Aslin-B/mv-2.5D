// Pruebas geométricas 2D (plano de juego XY) para combate y percepción.

// ¿Cruza el segmento (ax,ay)-(bx,by) la caja {x0,y0,x1,y1}? Prueba de franjas (slabs).
export function segAABB(ax, ay, bx, by, box) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dy = by - ay;
  const clip = (p, q) => {
    if (Math.abs(p) < 1e-9) return q >= 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  return clip(-dx, ax - box.x0) && clip(dx, box.x1 - ax) && clip(-dy, ay - box.y0) && clip(dy, box.y1 - ay) && t0 <= t1;
}

// Barrido de la hoja entre dos instantes: se prueban la hoja actual, la anterior, la trayectoria
// de la punta y la del centro (cubre cortes rápidos sin depender de la tasa de fotogramas, §14.3).
export function sweepHits(prev, cur, box) {
  const mid = (s) => ({ x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 });
  const pm = mid(prev), cm = mid(cur);
  return segAABB(cur.a.x, cur.a.y, cur.b.x, cur.b.y, box)
    || segAABB(prev.a.x, prev.a.y, prev.b.x, prev.b.y, box)
    || segAABB(prev.b.x, prev.b.y, cur.b.x, cur.b.y, box)
    || segAABB(pm.x, pm.y, cm.x, cm.y, box);
}

export function expand(box, m) { return { x0: box.x0 - m, y0: box.y0 - m, x1: box.x1 + m, y1: box.y1 + m }; }
