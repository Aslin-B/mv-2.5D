import * as THREE from 'three';
import { SdfScene, roundCone, ellipsoid, ellipsoidShell, roundBox, surfaceNets } from './sdf.js';
import {
  defaultProportions, standardBody, assembleCharacter, buildHand, meshToGeometry, bindPositions,
  mergeRigidPieces, lin, mixc, mulc, noise3, makeCharMaterial, PATTERN, vec,
} from './humanoid.js';
import { buildClavija } from './heroModel.js';
import { smoothstep, clamp } from '../core/math.js';

// Aren, hechicero del Alba (diseño 2). Original y generado por código.
// Lectura a 100 px de alto: bloques de color grandes y un acento luminoso por zona.
// - Placas de esmalte marfil con filetes de oro (hombreras en capas, peto con sigilo, grebas).
// - Capucha y manto carmesí; máscara de porcelana con rendijas luminosas (sin rostro visible).
// - Brazales arcanos gemelos con runas cian: el brazo que mira a cámara lanza los conjuros.
// - Malla interior azul noche en las juntas (separa las placas a distancia).

const C = {
  suit: lin('#1f2738'), suitDark: lin('#121722'), boot: lin('#1a1c22'),
  ivory: lin('#bcb098'), ivoryShade: lin('#978c74'), seam: lin('#3e382e'),
  gold: lin('#d0a548'), goldDark: lin('#8c6a2a'),
  crimson: lin('#8a1828'), crimsonDark: lin('#55101b'),
  glow: [0.22, 1.55, 1.95],   // emisión lineal (>1: alimenta el bloom)
  glowSoft: [0.1, 0.7, 0.9],
};
export const GLOW_COLOR = new THREE.Color(0.35, 2.3, 2.8);

const plate = (shade = 0, w = 0.25) => ({ c: mixc(C.ivory, C.ivoryShade, shade), r: 0.47 + shade * 0.2, m: 0, p: PATTERN.enamel, w });
const seam = () => ({ c: C.seam, r: 0.7, m: 0, p: PATTERN.plain, w: 0.5 });
const gold = (k = 0) => ({ c: mixc(C.gold, C.goldDark, k), r: 0.28, m: 1, p: PATTERN.metal, w: 0.35 });
const glow = (k = 1) => ({ c: k >= 1 ? C.glow : C.glowSoft, r: 0.2, m: 0, p: PATTERN.glow, w: 0 });
const suit = (k = 0) => ({ c: mixc(C.suit, C.suitDark, k), r: 0.72, m: 0, p: PATTERN.cloth, w: 0.4 });
const cloth = (k = 0) => ({ c: mixc(C.crimson, C.crimsonDark, k), r: 0.86, m: 0, p: PATTERN.cloth, w: 0.5 });

export function buildSorcerer() {
  const P = defaultProportions({ shoulderX: 0.19, armBulk: 1.04, chestW: 1.02 });
  const B = bindPositions(P);
  const pos = B.pos;
  const mat = makeCharMaterial({ bumpScale: 1.0 });
  const rigidMat = makeCharMaterial({ bumpScale: 0.8, envIntensity: 1.2 });
  const glowMat = new THREE.MeshBasicMaterial({ color: GLOW_COLOR.clone(), fog: false });
  const goldMat = new THREE.MeshStandardMaterial({ color: '#d6ab52', metalness: 1, roughness: 0.3, envMapIntensity: 1.3 });

  // ---------- Cuerpo deformable: malla interior ----------
  const body = new SdfScene({ k: 0.016 });
  const mats = { pelvis: 'suit', torso: 'suit', neck: 'suit', arm: 'suit', forearm: 'suit', thigh: 'suit', shin: 'suit', boot: 'boot' };
  standardBody(body, P, B, mats);
  body.relax = 1;
  const bodyPaint = (x, y, z, prim) => {
    const n = noise3(x, y, z, 40);
    if (prim.mat === 'boot') return { c: mulc(C.boot, 0.9 + n * 0.2), r: 0.55, m: 0, p: PATTERN.leather, w: 0.6 };
    // malla acolchada con costuras finas: se lee como tejido técnico, no como piel
    const seam = Math.abs(((y * 18) % 1) - 0.5) < 0.06 ? 0.5 : 0;
    return { ...suit(0.2 + n * 0.3 + seam * 0.4), p: PATTERN.quilt };
  };
  const ch = assembleCharacter({ P, bodyScene: body, bodyPaint, material: mat, bodyCell: 0.0142 });
  const { bones, S } = ch;
  let tris = ch.triangles;
  const breakdown = { body: ch.triangles };

  const addMesh = (bone, geo, material = rigidMat, cast = true) => {
    const m = new THREE.Mesh(geo, material);
    m.castShadow = cast; m.receiveShadow = true;
    bones[bone].add(m);
    tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
    return m;
  };
  // Pieza rígida esculpida: escena SDF -> malla -> hueso, en dos niveles de detalle (el fino solo
  // en planos cortos; en juego el personaje mide ~100 px y basta la malla gruesa).
  const lods = { hi: [], lo: [] };
  let trisHi = 0;
  const piece = (bone, scene, paint, cell = 0.0055, key = bone) => {
    const hi = surfaceNets(scene, cell * 1.1);
    const lo = surfaceNets(scene, Math.max(cell * 2.5, 0.0095));
    const mh = addMesh(bone, meshToGeometry(hi, scene, paint, { origin: pos[bone] }));
    const ml = addMesh(bone, meshToGeometry(lo, scene, paint, { origin: pos[bone] }));
    tris -= hi.indices.length / 3;
    trisHi += hi.indices.length / 3 - lo.indices.length / 3;
    mh.userData.noMerge = true; ml.userData.noMerge = true;
    mh.userData.lod = 'hi'; ml.userData.lod = 'lo';
    lods.hi.push(mh); lods.lo.push(ml);
    breakdown[key] = (breakdown[key] || 0) + lo.indices.length / 3;
    return ml;
  };
  const glowGem = (bone, at, size, dir = [0, 1, 0], stretch = 1.6) => {
    const g = new THREE.OctahedronGeometry(size, 0);
    g.scale(1, stretch, 0.7);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...dir).normalize()));
    g.translate(at[0] - pos[bone][0], at[1] - pos[bone][1], at[2] - pos[bone][2]);
    const m = addMesh(bone, g, glowMat, false);
    m.userData.noMerge = true;
    return m;
  };

  // ---------- Peto con sigilo del Alba ----------
  {
    const s = new SdfScene({ k: 0.012, subK: 0.006 });
    s.add(ellipsoid([0, 1.3, -0.006], [0.19, 0.166, 0.134], { mat: 'plate' }));
    s.add(ellipsoid([0, 1.335, 0.05], [0.16, 0.1, 0.094], { mat: 'plate' }));
    s.add(ellipsoid([0, 1.215, 0.036], [0.152, 0.092, 0.1], { mat: 'plate' }));
    for (const k of [1, -1]) s.add(roundCone([0.06 * k, 1.468, -0.022], [0.165 * k, 1.452, -0.02], 0.064, 0.06, { mat: 'plate' }));
    s.carve(roundCone([0, 1.43, -0.02], [0, 1.64, -0.03], 0.071, 0.071));
    for (const k of [1, -1]) s.carve(ellipsoid([0.215 * k, 1.36, -0.01], [0.064, 0.118, 0.094]));
    const yb = (x) => 1.112 + 0.3 * Math.abs(x);
    s.clip = (x, y) => yb(x) - y;
    const paint = (x, y, z) => {
      const ax = Math.abs(x);
      const edgeB = y - yb(x);
      const neck = Math.hypot(x, z + 0.02) - 0.071;
      const arm = Math.hypot((ax - 0.215) / 0.064, (y - 1.36) / 0.118, (z + 0.01) / 0.094) - 1;
      if (edgeB < 0.016 || (neck < 0.017 && y > 1.4) || (arm < 0.2 && arm > -0.5)) return gold(edgeB < 0.006 ? 0.35 : 0);
      if (z > 0.06) {
        // sigilo: sol naciente (anillo + rayos) y quilla central
        const r = Math.hypot(x, y - 1.31);
        if (Math.abs(r - 0.034) < 0.0048) return glow();
        if (r < 0.012) return glow();
        const ang = Math.atan2(y - 1.31, x);
        if (r > 0.045 && r < 0.075 && y > 1.31 && Math.abs(((ang / (Math.PI / 6)) % 1 + 1) % 1 - 0.5) > 0.42) return glow(0);
        if (ax < 0.009 && y < 1.27) return gold(0.15);
      }
      // juntas del peto: bajo el pectoral y a los lados (lectura de placas, no de cáscara)
      if (Math.abs(y - (1.24 - ax * 0.25)) < 0.0045 && z > 0.02 && ax > 0.03) return seam();
      if (Math.abs(ax - 0.118) < 0.004 && y > 1.25 && y < 1.43 && z > 0.0) return seam();
      const n = noise3(x, y, z, 25);
      return plate(0.08 + n * 0.18 + (z < -0.06 ? 0.15 : 0));
    };
    piece('chest', s, paint, 0.0052, 'cuirass');
  }
  // ---------- Fajas del abdomen ----------
  {
    const s = new SdfScene({ k: 0.01 });
    s.add(ellipsoid([0, 1.105, 0.002], [0.17, 0.09, 0.124], { mat: 'plate' }));
    s.clip = (x, y) => Math.max(1.045 - y, y - 1.17);
    const paint = (x, y, z) => {
      if (y < 1.056) return gold(0.2);
      if (Math.abs(y - 1.092) < 0.0055 || Math.abs(y - 1.132) < 0.0055) return suit(0.6);
      return plate(0.12 + noise3(x, y, z, 30) * 0.15);
    };
    piece('spine', s, paint, 0.0055, 'abdomen');
  }
  // ---------- Cinturón con hebilla de gema ----------
  {
    const s = new SdfScene({ k: 0.008 });
    s.add(ellipsoid([0, 1.006, -0.002], [0.18, 0.05, 0.132], { mat: 'belt' }));
    s.add(roundBox([0, 1.006, 0.128], [0.03, 0.024, 0.008], 0.006, { mat: 'buckle' }));
    s.clip = (x, y, z) => (z > 0.11 && Math.abs(x) < 0.05 ? Math.abs(y - 1.006) - 0.036 : Math.abs(y - 1.006) - 0.022);
    const paint = (x, y, z) => {
      if (z > 0.13 && Math.hypot(x, y - 1.006) < 0.012) return glow();
      return gold(z > 0.11 && Math.abs(x) < 0.05 ? 0 : 0.45);
    };
    piece('hips', s, paint, 0.0045, 'belt');
  }
  // ---------- Escarcelas (placas de muslo) ----------
  for (const [k, L] of [[1, 'L'], [-1, 'R']]) {
    const s = new SdfScene({ k: 0.004 });
    s.add(ellipsoidShell([0.1 * k, 0.86, 0.008], [0.098, 0.16, 0.096], 0.009, { mat: 'plate' }));
    s.clip = (x, y, z) => Math.max(0.715 - y, y - 0.985, -0.03 - z, (0.035 - x * k));
    const paint = (x, y, z) => {
      if (y < 0.726 || x * k < 0.05) return gold(0.1);
      if (Math.abs(y - 0.86) < 0.005) return suit(0.5);
      return plate(0.1 + noise3(x, y, z, 30) * 0.15);
    };
    piece('thigh' + L, s, paint, 0.0042, 'tasset' + L);
  }
  // ---------- Grebas, rodilleras y escarpes ----------
  for (const [k, L] of [[1, 'L'], [-1, 'R']]) {
    const K = pos['shin' + L], A = pos['foot' + L], T = pos['toe' + L];
    {
      const s = new SdfScene({ k: 0.012 });
      s.add(roundCone(vec.add(K, [0.002 * k, -0.045, 0.016]), vec.add(A, [0, 0.11, 0.022]), 0.062, 0.05, { mat: 'plate' }));
      s.add(ellipsoid(vec.add(K, [0, -0.13, 0.02]), [0.062, 0.12, 0.058], { mat: 'plate' }));
      const paint = (x, y, z) => {
        if (y < A[1] + 0.075) return gold(0.2);
        if (z > K[2] + 0.04 && Math.abs(x - K[0]) < 0.006 && y < K[1] - 0.08) return glow(0);
        return plate(0.1 + noise3(x, y, z, 30) * 0.15 + (z < -0.02 ? 0.2 : 0));
      };
      piece('shin' + L, s, paint, 0.0058, 'greave' + L);
    }
    {
      const s = new SdfScene({ k: 0.008 });
      s.add(ellipsoid(vec.add(K, [0, 0.005, 0.052]), [0.05, 0.05, 0.034], { mat: 'gold' }));
      s.add(roundCone(vec.add(K, [0, 0.02, 0.075]), vec.add(K, [0, -0.03, 0.082]), 0.012, 0.008, { mat: 'gold' }));
      piece('shin' + L, s, (x, y, z) => gold(z > K[2] + 0.07 ? 0 : 0.25), 0.0045, 'knee' + L);
    }
    {
      const s = new SdfScene({ k: 0.01 });
      s.add(ellipsoid([A[0], 0.07, 0.055], [0.047, 0.04, 0.075], { mat: 'plate' }));
      s.clip = (x, y) => 0.034 - y;
      piece('foot' + L, s, (x, y, z) => (y < 0.045 ? gold(0.3) : plate(0.12)), 0.005, 'sabaton' + L);
      const t = new SdfScene({ k: 0.008 });
      t.add(ellipsoid([T[0], 0.04, T[2] + 0.022], [0.043, 0.032, 0.056], { mat: 'plate' }));
      t.clip = (x, y) => 0.014 - y;
      piece('toe' + L, t, (x, y, z) => (y < 0.024 ? gold(0.3) : plate(0.1)), 0.005, 'toe' + L);
    }
  }
  // ---------- Hombreras en capas ----------
  for (const [k, L] of [[1, 'L'], [-1, 'R']]) {
    const J = pos['arm' + L];
    const d = L === 'L' ? S.dirL : S.dirR;
    // cúpula sobre la clavícula: no sigue la elevación del brazo (bisagra en el hombro)
    {
      // lámina gruesa (canto visible) en lugar de un volumen macizo: lectura de metal forjado
      const s = new SdfScene({ k: 0.004 });
      const c = vec.add(J, [0.022 * k, 0.012, -0.006]);
      s.add(ellipsoidShell(c, [0.118, 0.085, 0.118], 0.0095, { mat: 'plate' }));
      // arista con remate en punta hacia atrás: silueta angulosa reconocible a distancia
      s.add(roundCone(vec.add(c, [-0.05 * k, 0.088, 0.035]), vec.add(c, [0.09 * k, 0.055, -0.025]), 0.011, 0.007, { mat: 'ridge' }));
      const plane = (x, y) => (y - (J[1] - 0.025)) + 0.55 * k * (x - J[0]);
      s.clip = (x, y) => -plane(x, y);
      const paint = (x, y, z, prim) => {
        if (prim.mat === 'ridge') return gold(0);
        const e = plane(x, y);
        if (e < 0.016) return gold(e < 0.006 ? 0.3 : 0);
        // banda grabada a media altura con un nodo rúnico en la cara frontal
        if (Math.abs(e - 0.05) < 0.005) return gold(0.2);
        if (z > c[2] + 0.07 && Math.hypot(x - (c[0] + 0.035 * k), y - (J[1] + 0.035)) < 0.011) return glow();
        return plate(0.05 + noise3(x, y, z, 25) * 0.15 + (z < -0.05 ? 0.12 : 0));
      };
      piece('clav' + L, s, paint, 0.0042, 'pauldron' + L);
    }
    // dos lamas articuladas que acompañan al brazo
    for (let i = 0; i < 1; i++) {
      const s = new SdfScene({ k: 0.004 });
      const c = vec.add(vec.add(J, vec.scl(d, 0.06)), [0.02 * k, 0.0, 0]);
      s.add(ellipsoidShell(c, [0.105, 0.085, 0.106], 0.009, { mat: 'plate' }));
      const pl = (x, y) => (y - c[1]) + 0.55 * k * (x - c[0]);
      s.clip = (x, y) => Math.max(-0.075 - pl(x, y), pl(x, y) + 0.005);
      const paint = (x, y, z) => (pl(x, y) < -0.062 ? gold(0.15) : plate(0.14 + noise3(x, y, z, 25) * 0.15));
      piece('arm' + L, s, paint, 0.0042, 'lame' + L + i);
    }
  }
  // ---------- Brazales arcanos (gemelos) ----------
  for (const [k, L] of [[1, 'L'], [-1, 'R']]) {
    const d = L === 'L' ? S.dirL : S.dirR;
    const E = pos['fore' + L], W = pos['hand' + L];
    const a = vec.add(E, vec.scl(d, 0.045)), b = vec.add(W, vec.scl(d, -0.012));
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const s = new SdfScene({ k: 0.01 });
    s.add(roundCone(a, b, 0.058, 0.05, { mat: 'plate' }));
    s.add(roundCone(vec.add(W, vec.scl(d, -0.05)), vec.add(W, vec.scl(d, -0.01)), 0.06, 0.064, { mat: 'cuff' }));
    // codal de oro
    s.add(ellipsoid(vec.add(E, [0.012 * k, 0.0, -0.035]), [0.04, 0.045, 0.036], { mat: 'elbow' }));
    const tAt = (x, y, z) => ((x - a[0]) * d[0] + (y - a[1]) * d[1] + (z - a[2]) * d[2]) / len;
    const paint = (x, y, z, prim) => {
      if (prim.mat === 'elbow') return gold(0.2);
      const t = tAt(x, y, z);
      if (prim.mat === 'cuff' || t > 0.9) return gold(0.05);
      if (t < 0.1) return gold(0.25);
      if (Math.abs(t - 0.38) < 0.03 || Math.abs(t - 0.62) < 0.03) return glow();
      // línea de runas en la cara exterior
      const out = (x - (a[0] + d[0] * t * len)) * k;
      if (out > 0.048 && t > 0.42 && t < 0.58 && Math.abs(((t * 40) % 1) - 0.5) < 0.3) return glow(0);
      return plate(0.08 + noise3(x, y, z, 30) * 0.15);
    };
    piece('fore' + L, s, paint, 0.0048, 'bracer' + L);
  }

  // ---------- Manos: guantelete cerrado con cristal focal ----------
  const foci = {};
  for (const [k, L] of [[1, 'L'], [-1, 'R']]) {
    const h = buildHand(k, S, { grip: true, curl: 1, mat: 'glove' });
    const Wp = pos['hand' + L];
    const handPaint = (x, y, z) => {
      // dorso con placa de esmalte; dedos en malla oscura
      const rel = [x - Wp[0], y - Wp[1], z - Wp[2]];
      const along = rel[0] * h.down[0] + rel[1] * h.down[1] + rel[2] * h.down[2];
      const back = -(rel[0] * h.palmN[0] + rel[1] * h.palmN[1] + rel[2] * h.palmN[2]);
      if (back > 0.012 && along < 0.085 && along > -0.01) return plate(0.1);
      if (along < 0.0) return gold(0.2);
      return suit(0.35);
    };
    const m = new THREE.Mesh(meshToGeometry(h.mesh, h.scene, handPaint, { origin: Wp }), rigidMat);
    m.castShadow = true;
    bones['hand' + L].add(m);
    tris += h.mesh.indices.length / 3;
    breakdown['hand' + L] = h.mesh.indices.length / 3;
    // cristal focal sobre el dorso, alineado con el puño
    const backC = vec.add(vec.add(Wp, vec.scl(h.down, 0.045)), vec.scl(h.palmN, -0.036));
    glowGem('hand' + L, backC, 0.012, h.down, 2.2);
    // marco del foco: grupo con +Y = dirección del puño, +X = normal de la palma
    const group = new THREE.Group();
    group.position.set(h.grip[0] - Wp[0], h.grip[1] - Wp[1], h.grip[2] - Wp[2]);
    const X = new THREE.Vector3(...h.palmN), Y = new THREE.Vector3(...h.down);
    const Z = new THREE.Vector3().crossVectors(X, Y);
    group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
    bones['hand' + L].add(group);
    // hoja de éter para el golpe cuerpo a cuerpo (visible solo al golpear)
    const bladeG = new THREE.PlaneGeometry(1, 1, 1, 8);
    {
      const p = bladeG.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const v = p.getY(i) + 0.5;           // 0..1 a lo largo
        const w = 0.07 * Math.sin(Math.min(1, v * 1.15) * Math.PI) ** 0.6 + 0.004;
        p.setXY(i, p.getX(i) * w * 2, 0.06 + v * 0.8);
      }
    }
    const bladeMat = new THREE.MeshBasicMaterial({ color: GLOW_COLOR.clone().multiplyScalar(0.9), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const blade = new THREE.Mesh(bladeG, bladeMat);
    blade.visible = false;
    blade.renderOrder = 6;
    group.add(blade);
    // destello del foco (carga y disparo)
    const flare = new THREE.Sprite(new THREE.SpriteMaterial({ color: GLOW_COLOR.clone(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    flare.position.set(0, 0.035, 0);
    flare.scale.setScalar(0.001);
    flare.renderOrder = 7;
    group.add(flare);
    foci[L] = { group, base: new THREE.Vector3(0, 0.035, 0), tip: new THREE.Vector3(0, 0.86, 0), blade, flare, gem: null };
  }

  // ---------- Cabeza: máscara de porcelana, capucha carmesí ----------
  {
    const s = new SdfScene({ k: 0.008 });
    s.add(ellipsoid([0, 1.7, -0.018], [0.082, 0.1, 0.098], { mat: 'under' }));
    s.add(roundCone([0, 1.55, -0.022], [0, 1.66, -0.02], 0.053, 0.05, { mat: 'under' }));
    s.add(ellipsoid([0, 1.628, 0.022], [0.06, 0.05, 0.064], { mat: 'under' }));
    piece('head', s, (x, y, z) => suit(0.6), 0.0065, 'headUnder');
  }
  {
    // máscara: rostro estilizado, cejas en arista, rendijas que brillan
    const s = new SdfScene({ k: 0.006, subK: 0.003 });
    s.add(ellipsoid([0, 1.684, 0.044], [0.071, 0.091, 0.066], { mat: 'mask' }));
    s.add(roundCone([-0.05, 1.716, 0.09], [0.05, 1.716, 0.09], 0.011, 0.011, { mat: 'brow' }));
    s.add(roundCone([0, 1.71, 0.104], [0, 1.66, 0.116], 0.008, 0.012, { mat: 'mask' }));
    for (const k of [1, -1]) s.add(ellipsoid([0.04 * k, 1.668, 0.088], [0.026, 0.017, 0.022], { mat: 'mask' }));
    s.add(ellipsoid([0, 1.606, 0.07], [0.03, 0.026, 0.03], { mat: 'mask' }));
    const slits = [];
    for (const k of [1, -1]) {
      const sl = roundCone([0.013 * k, 1.689, 0.13], [0.052 * k, 1.701, 0.104], 0.0072, 0.0058);
      s.carve(sl); slits.push(sl);
    }
    s.clip = (x, y, z) => 0.028 - z;
    const paint = (x, y, z, prim) => {
      for (const sl of slits) if (sl.d(x, y, z) < 0.0045) return glow();
      if (z < 0.04) return gold(0.15);
      if (prim.mat === 'brow' && y > 1.712) return gold(0);
      if (Math.abs(y - 1.628) < 0.0028 && Math.abs(x) < 0.02 && z > 0.09) return gold(0.4);
      // filigrana: dos líneas que bajan de las rendijas por las mejillas
      const ax = Math.abs(x);
      if (z > 0.07 && y < 1.68 && y > 1.62 && Math.abs(ax - (0.044 - (1.68 - y) * 0.25)) < 0.0032) return gold(0.1);
      const n = noise3(x, y, z, 60);
      return { c: mixc(C.ivory, lin('#e8e0cf'), 0.45 + n * 0.2), r: 0.26, m: 0, p: PATTERN.enamel, w: 0.1 };
    };
    piece('head', s, paint, 0.0036, 'mask');
    glowGem('head', [0, 1.744, 0.097], 0.009, [0, 1, 0.2], 1.8);
  }
  {
    // capucha: concha con abertura frontal, punta caída y cuello drapeado
    const s = new SdfScene({ k: 0.014, subK: 0.008 });
    s.add(ellipsoid([0, 1.722, -0.035], [0.12, 0.137, 0.136], { mat: 'hood' }));
    s.add(roundCone([0, 1.8, -0.1], [0, 1.69, -0.215], 0.058, 0.012, { mat: 'hood' }));
    s.add(ellipsoid([0, 1.585, -0.035], [0.135, 0.075, 0.122], { mat: 'cowl' }));
    s.carve(ellipsoid([0, 1.7, -0.012], [0.092, 0.112, 0.106]));
    const open = s.carve(ellipsoid([0, 1.676, 0.118], [0.084, 0.118, 0.1]));
    s.carve(roundCone([0, 1.5, -0.02], [0, 1.62, -0.02], 0.06, 0.06));
    s.clip = (x, y) => 1.53 - y;
    s.displace = (x, y, z) => 0.0025 * Math.sin(Math.atan2(x, z) * 9 + y * 30) * smoothstep(1.75, 1.6, y);
    const paint = (x, y, z) => {
      const e = open.d(x, y, z);
      if (e < 0.012 && e > -0.03 && z > 0.0) return gold(0.15);
      if (y < 1.545) return gold(0.3);
      const n = noise3(x, y, z, 45);
      return cloth(0.15 + n * 0.3 + (z < -0.1 ? 0.15 : 0) + (e < 0.03 && z > 0.02 ? 0.35 : 0));
    };
    piece('head', s, paint, 0.0055, 'hood');
  }

  // ---------- Clavija de forja (al cinto, oculta hasta adquirirla) ----------
  const clavija = buildClavija();
  clavija.group.position.set(-0.17, 0.99 - pos.hips[1], 0.06);
  clavija.group.rotation.set(0.2, 0, 0.25);
  clavija.group.visible = false;
  bones.hips.add(clavija.group);

  // Anclajes del manto (pecho) y de los faldones delanteros (cadera), en espacio local del hueso.
  const local = (list, bone) => list.map((p) => new THREE.Vector3(p[0] - pos[bone][0], p[1] - pos[bone][1], p[2] - pos[bone][2]));
  const capeAnchors = {
    L: local([[0.185, 1.468, -0.09], [0.13, 1.48, -0.13], [0.075, 1.474, -0.145], [0.016, 1.46, -0.15]], 'chest'),
    R: local([[-0.016, 1.46, -0.15], [-0.075, 1.474, -0.145], [-0.13, 1.48, -0.13], [-0.185, 1.468, -0.09]], 'chest'),
  };
  const robeAnchors = {
    L: local([[0.172, 0.99, 0.045], [0.135, 0.99, 0.1], [0.075, 0.99, 0.134], [0.012, 0.985, 0.142]], 'hips'),
    R: local([[-0.012, 0.985, 0.142], [-0.075, 0.99, 0.134], [-0.135, 0.99, 0.1], [-0.172, 0.99, 0.045]], 'hips'),
  };

  const merged = mergeRigidPieces(ch.root);
  // tras fusionar por hueso, las listas de detalle apuntan a las mallas fusionadas
  lods.hi.length = 0; lods.lo.length = 0;
  ch.root.traverse((o) => { if (o.userData.lod) lods[o.userData.lod].push(o); });
  const setDetail = (hi) => {
    for (const o of lods.hi) o.visible = hi;
    for (const o of lods.lo) o.visible = !hi;
  };
  setDetail(false);
  return {
    root: ch.root, skinned: ch.skinned, bones, S, P, eyes: null, tail: [],
    sword: foci.R, foci, clavija, capeAnchors, robeAnchors,
    materials: [mat, rigidMat], glowMat, goldMat,
    triangles: tris, trianglesHi: tris + trisHi, breakdown, setDetail, merged,
  };
}

// Paleta de tela del hechicero (manto y faldones).
export const SORCERER_CLOTH = { base: '#7c1424', hem: '#4a0c16', line: '#d2a64e' };
void clamp;
