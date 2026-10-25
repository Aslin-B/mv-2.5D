import * as THREE from 'three';

// Maquinaria hidráulica arcana del acueducto: tuberías de bronce con bridas, válvulas de volante,
// depósitos de éter y manómetros rúnicos. Es la versión medieval de la densidad técnica de fondo del
// género (tuberías, paneles, luces de estado): rompe los paños lisos de muro con detalle a media
// escala y siembra acentos fríos que contrastan con la luz cálida de cada sala.

const UP = new THREE.Vector3(0, 1, 0);

function along(geo, a, b) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
  geo.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return len;
}

// Recorrido de tubería por una polilínea [[x, y, z], ...]: tramos, codos esféricos y bridas cada `flange` m.
export function pipeRun(batch, mat, pts, { r = 0.085, flange = 1.7, flangeMat = mat, cast = false } = {}) {
  const P = pts.map((p) => new THREE.Vector3(...p));
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1];
    const len = a.distanceTo(b);
    const g = new THREE.CylinderGeometry(r, r, len, 10, 1, true);
    along(g, a, b);
    batch.push(mat, g, { cast });
    const n = Math.max(1, Math.floor(len / flange));
    for (let k = 1; k < n; k++) {
      const t = k / n;
      const c = new THREE.Vector3().lerpVectors(a, b, t);
      const dir = new THREE.Vector3().subVectors(b, a).normalize();
      const f = new THREE.CylinderGeometry(r * 1.5, r * 1.5, 0.07, 12);
      along(f, c.clone().addScaledVector(dir, -0.035), c.clone().addScaledVector(dir, 0.035));
      batch.push(flangeMat, f, { cast });
    }
  }
  for (let i = 0; i < P.length; i++) {
    const s = new THREE.SphereGeometry(r * (i === 0 || i === P.length - 1 ? 1.35 : 1.18), 10, 8);
    s.translate(P[i].x, P[i].y, P[i].z);
    batch.push(i === 0 || i === P.length - 1 ? flangeMat : mat, s, { cast });
  }
}

// Volante de válvula mirando a la cámara (+Z).
export function valveWheel(batch, mats, x, y, z, r = 0.24) {
  const ring = new THREE.TorusGeometry(r, r * 0.11, 6, 20);
  ring.translate(x, y, z + 0.05);
  batch.push(mats.iron, ring);
  for (let i = 0; i < 3; i++) {
    const s = new THREE.BoxGeometry(r * 2, r * 0.12, r * 0.12);
    s.rotateZ((i / 3) * Math.PI);
    s.translate(x, y, z + 0.05);
    batch.push(mats.iron, s);
  }
  const hub = new THREE.CylinderGeometry(r * 0.22, r * 0.22, 0.14, 10);
  hub.rotateX(Math.PI / 2);
  hub.translate(x, y, z);
  batch.push(mats.bronze, hub);
}

// Depósito de éter: cuerpo de vidrio con columna luminosa, aros y costillas de bronce.
export function etherTank(scene, batch, mats, tex, updaters, x, y, z, { h = 1.8, r = 0.32, color = [0.25, 1.55, 1.9], seed = 0 } = {}) {
  const base = new THREE.CylinderGeometry(r * 1.25, r * 1.35, 0.22, 16);
  base.translate(x, y + 0.11, z);
  batch.push(mats.bronze, base);
  const cap = new THREE.CylinderGeometry(r * 0.7, r * 1.25, 0.26, 16);
  cap.translate(x, y + h - 0.13, z);
  batch.push(mats.bronze, cap);
  for (const t of [0.36, 0.66]) {
    const band = new THREE.TorusGeometry(r * 1.04, 0.025, 6, 22);
    band.rotateX(Math.PI / 2);
    band.translate(x, y + h * t, z);
    batch.push(mats.bronze, band);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const rib = new THREE.BoxGeometry(0.045, h - 0.4, 0.045);
    rib.translate(x + Math.cos(a) * r * 1.02, y + h / 2, z + Math.sin(a) * r * 1.02);
    batch.push(mats.bronze, rib);
  }
  // vidrio: casi negro y muy pulido (reflejos del entorno) con la columna de éter dentro
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h - 0.46, 18, 1, true),
    new THREE.MeshStandardMaterial({ color: '#0d1a1e', roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.55, depthWrite: false }));
  glass.position.set(x, y + h / 2, z);
  const c = new THREE.Color(...color);
  const coreMat = new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(0.55), fog: false });
  const core = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.62, h - 0.5, 14), coreMat);
  core.position.copy(glass.position);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.dot, color: c.clone().multiplyScalar(0.16), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  halo.scale.set(r * 6, h * 1.5, 1);
  halo.position.set(x, y + h / 2, z + 0.4);
  scene.add(core, glass, halo);
  // el éter late despacio (desfasado por depósito)
  updaters.push((dt, t) => {
    const k = 0.8 + 0.2 * Math.sin(t * 1.7 + seed * 2.1) + 0.06 * Math.sin(t * 6.3 + seed);
    coreMat.color.copy(c).multiplyScalar(0.55 * k);
  });
  return { core, halo };
}

// Manómetro rúnico: esfera oscura con aro de bronce, escala luminosa y aguja.
export function runeGauge(scene, batch, mats, x, y, z, { r = 0.16, color = [2.2, 1.0, 0.25] } = {}) {
  const ring = new THREE.TorusGeometry(r, r * 0.16, 6, 20);
  ring.translate(x, y, z + 0.03);
  batch.push(mats.bronze, ring);
  const face = new THREE.CylinderGeometry(r, r, 0.04, 20);
  face.rotateX(Math.PI / 2);
  face.translate(x, y, z);
  batch.push(mats.iron, face);
  const c = new THREE.Color(...color);
  const arc = new THREE.Mesh(new THREE.RingGeometry(r * 0.62, r * 0.78, 18, 1, Math.PI * 1.15, Math.PI * 1.2), new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(0.6), fog: false, side: THREE.DoubleSide }));
  arc.rotation.z = -Math.PI * 0.07;
  arc.position.set(x, y, z + 0.03);
  const needle = new THREE.Mesh(new THREE.BoxGeometry(r * 0.08, r * 0.7, 0.01), new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(0.9), fog: false }));
  needle.geometry.translate(0, r * 0.32, 0);
  needle.position.set(x, y, z + 0.04);
  needle.rotation.z = -0.5;
  scene.add(arc, needle);
  return needle;
}

// Estante de pared con tarros, frascos y crisoles: detalle de pequeña escala para los interiores.
const CLUTTER = {};
function clutterMats() {
  if (CLUTTER.clay) return CLUTTER;
  CLUTTER.clay = new THREE.MeshStandardMaterial({ color: '#7a4a32', roughness: 0.85 });
  CLUTTER.glaze = new THREE.MeshStandardMaterial({ color: '#2f4a44', roughness: 0.3, metalness: 0.1 });
  CLUTTER.glass = new THREE.MeshStandardMaterial({ color: '#3d5a3a', roughness: 0.12, metalness: 0.3 });
  return CLUTTER;
}
export function wallShelf(batch, mats, rnd, x0, x1, y, z, { depth = 0.32 } = {}) {
  const cm = clutterMats();
  const plank = new THREE.BoxGeometry(x1 - x0, 0.05, depth);
  plank.translate((x0 + x1) / 2, y, z + depth / 2);
  batch.push(mats.wood, plank);
  for (const bx of [x0 + 0.15, x1 - 0.15]) {
    const br = new THREE.BoxGeometry(0.04, 0.22, depth * 0.8);
    br.translate(bx, y - 0.13, z + depth * 0.4);
    batch.push(mats.iron, br);
  }
  let x = x0 + 0.12;
  while (x < x1 - 0.12) {
    const k = rnd();
    const r = 0.045 + rnd() * 0.05;
    const h = 0.1 + rnd() * 0.2;
    const zc = z + depth * (0.35 + rnd() * 0.3);
    let g, m;
    if (k < 0.45) {        // tarro de barro con boca estrecha
      const prof = [[0, 0], [r * 0.8, 0], [r, h * 0.35], [r * 0.9, h * 0.75], [r * 0.45, h * 0.88], [r * 0.5, h]].map(([a, b]) => new THREE.Vector2(a, b));
      g = new THREE.LatheGeometry(prof, 10); m = rnd() < 0.5 ? cm.clay : cm.glaze;
    } else if (k < 0.75) { // frasco de vidrio
      g = new THREE.CylinderGeometry(r * 0.7, r * 0.8, h, 8); g.translate(0, h / 2, 0); m = cm.glass;
    } else {               // crisol de bronce
      g = new THREE.CylinderGeometry(r * 1.1, r * 0.8, h * 0.55, 10); g.translate(0, h * 0.27, 0); m = mats.bronze;
    }
    g.translate(x + r, y + 0.025, zc);
    batch.push(m, g, { cast: false });
    x += r * 2 + 0.03 + rnd() * 0.12;
  }
}

// Panoplia de herramientas colgadas (martillos, tenazas, limas) en una barra de hierro.
export function toolRack(batch, mats, rnd, x0, x1, y, z) {
  const bar = new THREE.CylinderGeometry(0.02, 0.02, x1 - x0, 6);
  bar.rotateZ(Math.PI / 2);
  bar.translate((x0 + x1) / 2, y, z + 0.06);
  batch.push(mats.iron, bar);
  for (let x = x0 + 0.18; x < x1 - 0.1; x += 0.24 + rnd() * 0.1) {
    const len = 0.35 + rnd() * 0.25;
    const handle = new THREE.BoxGeometry(0.035, len, 0.035);
    handle.translate(x, y - len / 2 - 0.03, z + 0.08);
    batch.push(mats.wood, handle);
    const kind = rnd();
    if (kind < 0.5) {
      const head = new THREE.BoxGeometry(0.16, 0.06, 0.06);
      head.translate(x, y - len - 0.03, z + 0.08);
      batch.push(mats.iron, head);
    } else if (kind < 0.8) {
      for (const s of [-1, 1]) {
        const jaw = new THREE.BoxGeometry(0.022, 0.16, 0.022);
        jaw.rotateZ(s * 0.18);
        jaw.translate(x + s * 0.025, y - len - 0.08, z + 0.08);
        batch.push(mats.iron, jaw);
      }
    }
  }
}

// ---- Taller del maestro (iteración 13) ------------------------------------------------------
// Rueda dentada: perfil extruido con dientes trapezoidales y, si es grande, ventanas entre radios.
// El centro de cada diente cae en la fracción 0,285 de su paso angular (lo usa gearTrain para engranar).
export function gearGeometry(r, teeth, { th = 0.07, tooth = 0.06, spokes = 0 } = {}) {
  const s = new THREE.Shape();
  const da = (Math.PI * 2) / teeth;
  const P = (a, rr) => [Math.cos(a) * rr, Math.sin(a) * rr];
  for (let i = 0; i < teeth; i++) {
    const a = i * da;
    const pts = [P(a, r), P(a + da * 0.15, r + tooth), P(a + da * 0.42, r + tooth), P(a + da * 0.57, r)];
    pts.forEach(([x, y], k) => (i === 0 && k === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
  }
  s.closePath();
  if (spokes) {
    const r0 = r * 0.34, r1 = r * 0.76, sw = r * 0.09;
    for (let j = 0; j < spokes; j++) {
      const b0 = (j / spokes) * Math.PI * 2, b1 = ((j + 1) / spokes) * Math.PI * 2;
      const h = new THREE.Path();
      h.absarc(0, 0, r1, b0 + sw / r1, b1 - sw / r1, false);
      h.absarc(0, 0, r0, b1 - sw / r0, b0 + sw / r0, true);
      h.closePath();
      s.holes.push(h);
    }
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: th, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 1, curveSegments: 5 });
  g.translate(0, 0, -th / 2);
  return g;
}

// Tren de engranajes que gira en la pared: paso común, cada rueda engrana con la anterior en la
// dirección `dir` (rad), gira al revés que ella y a una velocidad inversa a su número de dientes.
export function gearTrain(scene, batch, mats, updaters, { x, y, z, pitch = 0.1, speed = 0.35, gears }) {
  const tooth = pitch * 0.62;
  const list = [];
  for (const G of gears) {
    const pr = G.r + tooth / 2;
    const n = Math.max(8, Math.round((Math.PI * 2 * pr) / pitch));
    const da = (Math.PI * 2) / n;
    const mesh = new THREE.Mesh(gearGeometry(G.r, n, { th: G.th ?? 0.07, tooth, spokes: G.spokes ?? (G.r > 0.3 ? 5 : 0) }), mats.bronze);
    mesh.castShadow = true; mesh.receiveShadow = true;
    const p = list[list.length - 1];
    const it = { mesh, pr, n, da, cx: x, cy: y, z: z + (G.dz ?? 0), theta0: G.phase ?? 0, omega: speed };
    if (p) {
      const d = p.pr + pr + tooth * 0.12;
      it.cx = p.cx + Math.cos(G.dir) * d; it.cy = p.cy + Math.sin(G.dir) * d;
      it.omega = -p.omega * p.n / n;
      // con un diente de la anterior apuntando a la nueva, la nueva presenta un hueco
      const thP = G.dir - 0.285 * p.da, th = G.dir + Math.PI - 0.785 * da;
      it.theta0 = th - (p.n / n) * (p.theta0 - thP);
    }
    mesh.position.set(it.cx, it.cy, it.z);
    mesh.rotation.z = it.theta0;
    scene.add(mesh);
    // eje de hierro con su chaveta y cubo de bronce (estáticos: son de revolución)
    const axle = new THREE.CylinderGeometry(0.035, 0.035, 0.36, 8);
    axle.rotateX(Math.PI / 2); axle.translate(it.cx, it.cy, it.z - 0.08);
    batch.push(mats.iron, axle);
    const hub = new THREE.CylinderGeometry(Math.max(0.06, G.r * 0.22), Math.max(0.06, G.r * 0.22), (G.th ?? 0.07) + 0.06, 12);
    hub.rotateX(Math.PI / 2); hub.translate(it.cx, it.cy, it.z);
    batch.push(mats.bronze, hub);
    list.push(it);
  }
  updaters.push((dt, t) => { for (const it of list) it.mesh.rotation.z = it.theta0 + it.omega * t; });
  return list;
}

const ROPE = {};
function ropeMat() {
  return ROPE.m || (ROPE.m = new THREE.MeshStandardMaterial({ color: '#7d6a4f', roughness: 1 }));
}
function rope(batch, a, b, r = 0.014) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const g = new THREE.CylinderGeometry(r, r, A.distanceTo(B), 5, 1, true);
  along(g, A, B);
  batch.push(ropeMat(), g, { cast: true });
}

// Polipasto: motón colgado de una viga, cuerda tensa hasta una cornamusa y una caja de piezas
// colgada del gancho con eslinga.
export function hoist(batch, mats, { x, top, z, loadY, tie, side = -1 }) {
  const strap = new THREE.BoxGeometry(0.05, 0.22, 0.05);
  strap.translate(x, top - 0.11, z);
  batch.push(mats.iron, strap);
  const block = new THREE.BoxGeometry(0.15, 0.32, 0.12);
  block.translate(x, top - 0.36, z);
  batch.push(mats.wood, block);
  const sheave = new THREE.CylinderGeometry(0.11, 0.11, 0.05, 14);
  sheave.rotateX(Math.PI / 2); sheave.translate(x, top - 0.36, z + 0.07);
  batch.push(mats.iron, sheave);
  const lx = x + side * 0.11;
  rope(batch, [lx, top - 0.36, z + 0.07], [lx, loadY + 0.62, z + 0.07]);
  rope(batch, [x - side * 0.11, top - 0.36, z + 0.07], tie);
  const cleat = new THREE.BoxGeometry(0.05, 0.16, 0.05);
  cleat.translate(tie[0], tie[1], tie[2]);
  batch.push(mats.iron, cleat);
  const hook = new THREE.TorusGeometry(0.07, 0.016, 5, 10, Math.PI * 1.5);
  hook.rotateZ(Math.PI * 0.75); hook.translate(lx, loadY + 0.55, z + 0.07);
  batch.push(mats.iron, hook);
  // eslinga en V hasta las esquinas de la caja
  for (const s of [-1, 1]) rope(batch, [lx, loadY + 0.5, z + 0.07], [lx + s * 0.24, loadY + 0.32, z + 0.07], 0.011);
  const crate = new THREE.BoxGeometry(0.52, 0.32, 0.36);
  crate.translate(lx, loadY + 0.16, z + 0.07);
  batch.push(mats.wood, crate);
  for (const yy of [0.04, 0.28]) {
    const band = new THREE.BoxGeometry(0.54, 0.035, 0.38);
    band.translate(lx, loadY + yy, z + 0.07);
    batch.push(mats.iron, band);
  }
  // un engranaje a medio montar asoma de la caja
  const gear = gearGeometry(0.17, 12, { th: 0.04, tooth: 0.04 });
  gear.rotateY(0.3); gear.translate(lx + 0.09, loadY + 0.38, z + 0.05);
  batch.push(mats.bronze, gear);
}

// Planos del maestro: pergamino envejecido con dibujos a tinta (alzado del acueducto o despiece de
// una rueda dentada y una noria), notas en una escritura inventada, cotas y trazas a compás.
const SHEETS = {};
function sheetTexture(kind) {
  if (SHEETS[kind]) return SHEETS[kind];
  const W = 512, H = 640;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  let sd = kind === 'acueducto' ? 7 : 19;
  const rnd = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; };
  g.fillStyle = '#cdb994'; g.fillRect(0, 0, W, H);
  // manchas, fibras y borde tostado
  for (let i = 0; i < 60; i++) {
    const x = rnd() * W, y = rnd() * H, r = 20 + rnd() * 90;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = rnd() < 0.6;
    gr.addColorStop(0, dark ? 'rgba(120,88,52,0.12)' : 'rgba(235,222,190,0.14)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  g.strokeStyle = 'rgba(110,84,56,0.18)'; g.lineWidth = 1;
  for (let i = 0; i < 400; i++) { const x = rnd() * W, y = rnd() * H; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 14, y + (rnd() - 0.5) * 3); g.stroke(); }
  const edge = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.62);
  edge.addColorStop(0, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(84,52,26,0.6)');
  g.fillStyle = edge; g.fillRect(0, 0, W, H);
  const ink = (a = 0.85, w = 2) => { g.strokeStyle = `rgba(48,32,22,${a})`; g.fillStyle = `rgba(48,32,22,${a})`; g.lineWidth = w; };
  const line = (x0, y0, x1, y1) => { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
  // escritura inventada: palabras de trazos ondulados con astas, sin letras reales
  const write = (x, y, w, s = 7) => {
    let cx = x;
    while (cx < x + w - 10) {
      const len = 14 + rnd() * 40;
      g.beginPath(); g.moveTo(cx, y);
      for (let t = 0; t < len; t += 1.5) {
        const asc = rnd() < 0.05 ? -s * 1.4 : 0;
        g.lineTo(cx + t, y + Math.sin(t * 0.9 + cx) * s * 0.35 + asc);
      }
      g.stroke();
      cx += len + 6 + rnd() * 6;
    }
  };
  const dim = (x0, x1, y) => {
    ink(0.7, 1.2); line(x0, y, x1, y); line(x0, y - 6, x0, y + 6); line(x1, y - 6, x1, y + 6);
    write((x0 + x1) / 2 - 12, y - 6, 24, 4);
  };
  ink(0.85, 2); write(40, 52, 300, 9); ink(0.6, 1.4); write(40, 80, 200, 5);
  if (kind === 'acueducto') {
    // alzado de dos órdenes de arcos con su dovelaje y el canal
    const gy = 400, x0 = 46, span = 120;
    ink(0.9, 2.2); line(20, gy, W - 20, gy);
    ink(0.45, 1); for (let x = 24; x < W - 24; x += 10) line(x, gy + 2, x - 10, gy + 14);
    ink(0.9, 2);
    for (let k = 0; k < 4; k++) {
      const px = x0 + k * span;
      g.strokeRect(px - 12, gy - 170, 24, 170);
      if (k < 3) {
        const cx = px + span / 2, ry = gy - 120, rr = (span - 24) / 2;
        g.beginPath(); g.arc(cx, ry, rr, Math.PI, 0); g.stroke();
        ink(0.6, 1); for (let a = 0; a <= 8; a++) { const t = Math.PI + (a / 8) * Math.PI; line(cx + Math.cos(t) * rr, ry + Math.sin(t) * rr, cx + Math.cos(t) * (rr + 14), ry + Math.sin(t) * (rr + 14)); }
        ink(0.9, 2);
        const ux = cx, uy = gy - 210, ur = rr * 0.55;
        g.beginPath(); g.arc(ux, uy, ur, Math.PI, 0); g.stroke();
      }
    }
    g.strokeRect(34, gy - 252, 3 * span + 24, 24);
    g.strokeRect(34, gy - 186, 3 * span + 24, 14);
    ink(0.5, 1); for (let x = 40; x < 34 + 3 * span + 20; x += 7) line(x, gy - 250, x + 5, gy - 230);
    dim(x0, x0 + span, gy + 34); dim(x0 + span, x0 + 2 * span, gy + 34);
    // sección del canal con el agua
    ink(0.9, 2); const sx = 330, sy = 470;
    g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx, sy + 90); g.lineTo(sx + 140, sy + 90); g.lineTo(sx + 140, sy); g.stroke();
    g.beginPath(); g.moveTo(sx + 16, sy); g.lineTo(sx + 16, sy + 74); g.lineTo(sx + 124, sy + 74); g.lineTo(sx + 124, sy); g.stroke();
    ink(0.6, 1.2); for (let k = 0; k < 3; k++) { g.beginPath(); for (let t = 0; t <= 108; t += 4) g.lineTo(sx + 16 + t, sy + 30 + k * 12 + Math.sin(t * 0.25) * 2.5); g.stroke(); }
    ink(0.7, 1.2); write(40, 500, 250, 5); write(40, 528, 230, 5); write(40, 556, 260, 5);
    ink(0.35, 1); g.beginPath(); g.arc(250, 260, 210, 0, Math.PI * 2); g.stroke();
  } else {
    // rueda dentada en planta con circunferencia primitiva, radios y una piñón engranado
    const cx = 210, cy = 280, r = 130, n = 24, da = (Math.PI * 2) / n;
    ink(0.9, 2); g.beginPath();
    for (let i = 0; i < n; i++) {
      const a = i * da;
      for (const [f, rr] of [[0, r], [0.15, r + 16], [0.42, r + 16], [0.57, r]]) g.lineTo(cx + Math.cos(a + da * f) * rr, cy + Math.sin(a + da * f) * rr);
    }
    g.closePath(); g.stroke();
    g.beginPath(); g.arc(cx, cy, r * 0.76, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(cx, cy, r * 0.3, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(cx, cy, 9, 0, Math.PI * 2); g.stroke();
    for (let j = 0; j < 6; j++) { const a = (j / 6) * Math.PI * 2; for (const s of [-1, 1]) line(cx + Math.cos(a + s * 0.12) * r * 0.3, cy + Math.sin(a + s * 0.12) * r * 0.3, cx + Math.cos(a + s * 0.05) * r * 0.76, cy + Math.sin(a + s * 0.05) * r * 0.76); }
    ink(0.45, 1); g.setLineDash([8, 5]); g.beginPath(); g.arc(cx, cy, r + 8, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    for (let j = 0; j < 12; j++) { const a = (j / 12) * Math.PI * 2; line(cx, cy, cx + Math.cos(a) * (r + 40), cy + Math.sin(a) * (r + 40)); }
    g.beginPath(); g.arc(cx, cy, r * 0.5, -0.4, 0.4); g.stroke();
    // piñón
    const px = cx + r + 62, py = cy - 30, pr = 40, pn = 8, pda = (Math.PI * 2) / pn;
    ink(0.9, 2); g.beginPath();
    for (let i = 0; i < pn; i++) { const a = i * pda; for (const [f, rr] of [[0, pr], [0.15, pr + 16], [0.42, pr + 16], [0.57, pr]]) g.lineTo(px + Math.cos(a + pda * f) * rr, py + Math.sin(a + pda * f) * rr); }
    g.closePath(); g.stroke(); g.beginPath(); g.arc(px, py, 7, 0, Math.PI * 2); g.stroke();
    // noria de cangilones en alzado
    const wx = 360, wy = 520, wr = 62;
    ink(0.85, 1.8); g.beginPath(); g.arc(wx, wy, wr, 0, Math.PI * 2); g.stroke();
    for (let j = 0; j < 12; j++) { const a = (j / 12) * Math.PI * 2; line(wx, wy, wx + Math.cos(a) * wr, wy + Math.sin(a) * wr); g.strokeRect(wx + Math.cos(a) * wr - 6, wy + Math.sin(a) * wr - 6, 12, 12); }
    ink(0.6, 1.2); for (let k = 0; k < 2; k++) { g.beginPath(); for (let t = 0; t <= 200; t += 5) g.lineTo(260 + t, 590 + k * 10 + Math.sin(t * 0.18) * 3); g.stroke(); }
    // notas con líneas de referencia
    ink(0.7, 1.2); write(40, 470, 200, 5); write(40, 498, 180, 5); write(40, 526, 210, 5);
    ink(0.5, 1); line(150, 470, cx - 40, cy + 70); line(250, 498, px - 30, py + 30);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return (SHEETS[kind] = new THREE.MeshStandardMaterial({ map: t, roughness: 0.92, side: THREE.DoubleSide }));
}

export function blueprint(batch, mats, { x, y, z, w, h, kind, rot = 0 }) {
  const g = new THREE.PlaneGeometry(w, h, 6, 6);
  // esquinas inferiores levantadas: el papel no está plano
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / w + 0.5, v = p.getY(i) / h + 0.5;
    p.setZ(i, 0.05 * Math.pow(1 - v, 3) * (Math.pow(Math.abs(u - 0.5) * 2, 2)) + 0.012 * Math.sin(u * 9 + v * 4));
  }
  g.computeVertexNormals();
  g.rotateZ(rot);
  g.translate(x, y, z);
  batch.push(sheetTexture(kind), g, { cast: false });
  for (const s of [-1, 1]) {
    const nail = new THREE.SphereGeometry(0.018, 6, 4);
    nail.translate(x + s * (w / 2 - 0.06) - Math.sin(rot) * (h / 2 - 0.05), y + h / 2 - 0.05 + s * Math.sin(rot) * (w / 2), z + 0.015);
    batch.push(mats.iron, nail);
  }
}
