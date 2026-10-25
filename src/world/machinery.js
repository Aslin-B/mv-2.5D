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
