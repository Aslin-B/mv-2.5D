import * as THREE from 'three';
import { SdfScene, roundCone, ellipsoid, ellipsoidShell, roundBox, orientedEllipsoid, surfaceNets } from './sdf.js';
import {
  defaultProportions, standardBody, assembleCharacter, meshToGeometry, bindPositions, fingerLayout,
  mergeRigidPieces, lin, mixc, mulc, noise3, makeCharMaterial, PATTERN, vec, paintUniform,
} from './humanoid.js';
import { buildClavija } from './heroModel.js';
import { smoothstep, clamp } from '../core/math.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { strandTexture, hairCardGeometry, hairMaterial } from './hairCards.js';

// Aren, mago de sombras (diseño 3, a partir de la lámina «Mago de Sombras» de Aslin).
// Todo se genera por código: escultura SDF, pintura por vértice y relieve procedural.
// - Rostro descubierto: pómulos y mandíbula marcados, nariz recta, barba corta y bigote, mirada serena.
// - Cabello oscuro largo y ondulado, semirrecogido en un moño bajo con coleta; mechones que enmarcan la cara.
// - Abrigo largo de cuero carbón abierto por delante con bordado de volutas plateadas y forro violeta
//   (los faldones son tela simulada, ver cloth.js); cuello alto, capucha caída sobre los hombros.
// - Chaleco violeta con filigrana, tahalí cruzado, cinturones con hebillas y bolsa.
// - Hombreras y brazales de metal oscuro grabado con filetes de plata envejecida; rodilleras.
// - Guantes sin dedos: las falanges son huesos (manos con gestos) y la piel de los dedos queda a la vista.
// - Broche de eclipse en el pecho: disco negro con media luna violeta que late con la carga.

const C = {
  coat: lin('#2b282e'), coatDark: lin('#141216'), coatHi: lin('#45404a'),
  hood: lin('#1d1d27'), hoodDark: lin('#0f0f15'),
  vest: lin('#3a2452'), vestDark: lin('#1d1229'),
  violet: lin('#5b3088'), violetDeep: lin('#2c1744'),
  silver: lin('#a29fa8'), silverDark: lin('#55525b'),
  metal: lin('#4a4850'), metalDark: lin('#24232a'),
  belt: lin('#43302a'), beltDark: lin('#251a16'),
  trousers: lin('#262428'), trousersDark: lin('#17161a'),
  boot: lin('#2e2420'), bootDark: lin('#171210'),
  glove: lin('#221f23'), gloveDark: lin('#141215'),
  shirt: lin('#1b1a20'),
  skin: lin('#8a6d5d'), skinRed: lin('#90594b'), skinDark: lin('#5a4036'), skinLight: lin('#a5836f'),
  lip: lin('#6e4840'), nail: lin('#c79f8c'),
  hair: lin('#221a15'), hairLight: lin('#4a3a30'), beard: lin('#231b15'),
  glow: [1.05, 0.38, 2.3], glowSoft: [0.42, 0.14, 0.95],
};
export const MAGE_GLOW = new THREE.Color(1.3, 0.55, 2.8);

const S_ = (c, r, m, p, w = 0.5) => ({ c, r, m, p, w });
// cuero del abrigo repujado con volutas (escala del adorno en el canal w: celdas por metro / 1000)
const leather = (k = 0, orn = 0.034) => S_(mixc(C.coat, C.coatDark, clamp(k, 0, 1)), 0.66, 0, orn ? PATTERN.embossed : PATTERN.leather, orn || 0.65);
const silver = (k = 0) => S_(mixc(C.silver, C.silverDark, clamp(k, 0, 1)), 0.38, 1, PATTERN.metal, 0.55);
// metal oscuro grabado con hilo de plata incrustado
const metal = (k = 0, orn = 0.07) => S_(mixc(C.metal, C.metalDark, clamp(k, 0, 1)), 0.52, 1, orn ? PATTERN.ornate : PATTERN.metal, orn || 0.75);
const belt = (k = 0) => S_(mixc(C.belt, C.beltDark, clamp(k, 0, 1)), 0.55, 0, PATTERN.leather, 0.7);
const vestC = (k = 0, orn = 0.1) => S_(mixc(C.vest, C.vestDark, clamp(k, 0, 1)), 0.66, 0, orn ? PATTERN.brocade : PATTERN.cloth, orn || 0.4);
const hoodC = (k = 0) => S_(mixc(C.hood, C.hoodDark, clamp(k, 0, 1)), 0.9, 0, PATTERN.cloth, 0.5);
const lining = (k = 0) => S_(mixc(C.violet, C.violetDeep, clamp(k, 0, 1)), 0.75, 0, PATTERN.cloth, 0.3);
const glow = (k = 1) => S_(k >= 1 ? C.glow : C.glowSoft, 0.2, 0, PATTERN.glow, 0);

// Volutas de filigrana (teselas de Truchet con cuartos de círculo): 1 sobre el hilo, 0 fuera.
const hh = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
export function filigree(u, v, w = 0.085) {
  const i = Math.floor(u), j = Math.floor(v);
  let fu = u - i;
  const fv = v - j;
  if (hh(i, j) > 0.5) fu = 1 - fu;
  const d = Math.min(Math.abs(Math.hypot(fu, fv) - 0.5), Math.abs(Math.hypot(fu - 1, fv - 1) - 0.5));
  return 1 - smoothstep(w * 0.55, w, d);
}

const MAGE_PROPORTIONS = { shoulderX: 0.196, chestW: 1.05, armBulk: 1.03, waist: 0.96 };

// Solo la cabeza (estudio de rostro: iteraciones rápidas sin construir el cuerpo).
export function buildMageHead() {
  HI = true;
  const B = bindPositions(defaultProportions(MAGE_PROPORTIONS));
  const rigidMat = makeCharMaterial({ bumpScale: 0.9, envIntensity: 1.1 });
  const head = buildHead(B.pos, rigidMat);
  const group = new THREE.Group();
  group.position.set(...B.pos.head);
  for (const m of head.meshes) if (m.userData.lod !== 'lo') group.add(m);
  return { group, eyes: head.eyes, tris: head.trisHi, headPos: B.pos.head };
}

// hiDetail = false: solo el nivel de detalle de juego (carga mucho más rápida; sin primeros planos finos)
let HI = true;
export function buildShadowMage({ hiDetail = true } = {}) {
  HI = hiDetail;
  const P = defaultProportions(MAGE_PROPORTIONS);
  const B = bindPositions(P);
  const pos = B.pos;
  const mat = makeCharMaterial({ bumpScale: 1.0 });
  const rigidMat = makeCharMaterial({ bumpScale: 0.9, envIntensity: 1.1 });
  const glowMat = new THREE.MeshBasicMaterial({ color: MAGE_GLOW.clone(), fog: false });

  // ---------- Cuerpo deformable ----------
  const body = new SdfScene({ k: 0.016 });
  const mats = { pelvis: 'coat', torso: 'coat', neck: 'neck', arm: 'sleeve', forearm: 'sleeve', thigh: 'trousers', shin: 'trousers', boot: 'boot' };
  standardBody(body, P, B, mats);
  // botas altas de cuero: se sustituye el pie genérico por uno esbelto (talón, empeine, puntera
  // afilada), con suela y tacón; la caña sube hasta bajo la rodilla
  body.prims = body.prims.filter((p) => !(p.bone && (p.bone.startsWith('foot') || p.bone.startsWith('toe'))));
  body.prims = body.prims.map((p) => {
    if (p.mat !== 'boot') return p;
    const K = pos['shin' + (p.a[0] > 0 ? 'L' : 'R')];
    return roundCone(p.a, [p.b[0], K[1] - 0.085, p.b[2]], p.r1, p.r2 * 1.04, { bone: p.bone, mat: 'boot', priority: p.priority });
  });
  for (const L of ['L', 'R']) {
    const A = pos['foot' + L], T = pos['toe' + L], s = L === 'L' ? 1 : -1;
    const f = { bone: 'foot' + L, mat: 'boot', blend: 0.006 }, t = { bone: 'toe' + L, mat: 'boot', blend: 0.006 };
    body.add(ellipsoid([A[0], 0.05, -0.04], [0.035, 0.046, 0.04], f));
    body.add(roundCone([A[0], 0.075, -0.004], [T[0], 0.036, T[2] - 0.008], 0.039, 0.031, f));
    body.add(ellipsoid([T[0], 0.03, T[2] + 0.018], [0.036, 0.025, 0.05], t));
    body.add(roundCone([T[0], 0.028, T[2] + 0.03], [T[0] - 0.004 * s, 0.024, T[2] + 0.066], 0.024, 0.015, t));
    const heelZ = A[2] - 0.062, toeZ = T[2] + 0.08;
    body.add(roundBox([A[0], 0.008, (heelZ + toeZ) / 2], [0.033, 0.006, (toeZ - heelZ) / 2 - 0.01], 0.006, { bone: 'foot' + L, mat: 'sole', blend: 0.003 }));
    body.add(roundBox([A[0], 0.02, heelZ + 0.026], [0.029, 0.018, 0.024], 0.005, { bone: 'foot' + L, mat: 'sole', blend: 0.003 }));
  }
  body.add(ellipsoid([0, 1.02, -0.004], [0.17, 0.075, 0.122], { bone: 'hips', mat: 'coat' }));
  body.relax = 1;
  // Torso aislado: base de las capas que se apoyan sobre él (solapas, tahalí, cinturones, broche).
  const torso = new SdfScene({ k: body.k });
  torso.prims = body.prims.filter((p) => ['hips', 'spine', 'chest'].includes(p.bone) && p.mat === 'coat');
  const surfZ = (x, y, from = 0.3) => { let z = from; while (z > -0.3 && torso.eval(x, y, z) > 0.0005) z -= 0.0015; return z; };
  const surfZb = (x, y) => { let z = -0.35; while (z < 0.3 && torso.eval(x, y, z) > 0.0005) z += 0.0015; return z; };
  const openW = (y) => 0.042 + (1.46 - y) * 0.085;   // media anchura de la abertura del abrigo

  const bodyPaint = (x, y, z, prim) => {
    const n = noise3(x, y, z, 40);
    const m = prim.mat;
    const ax = Math.abs(x);
    if (m === 'neck') {
      if (y > 1.5) return skinPaint(x, y, z, 0.15 + n * 0.2);
      return S_(mulc(C.shirt, 0.9 + n * 0.2), 0.8, 0, PATTERN.cloth, 0.4);
    }
    if (m === 'boot') return bootPaint(x, y, z, n);
    if (m === 'sole') return S_(mulc(C.bootDark, 0.7 + n * 0.2), 0.75, 0, PATTERN.leather, 0.85);
    if (m === 'trousers' || (m === 'coat' && y < 0.985)) {
      // calzas de cuero fino con costura lateral
      const side = Math.abs(ax - 0.1 - (y < 0.5 ? 0.0 : 0.035)) < 0.004 && Math.abs(z) < 0.03;
      return S_(mixc(C.trousers, C.trousersDark, 0.3 + n * 0.4 + (side ? 0.4 : 0)), 0.6, 0, PATTERN.leather, 0.55);
    }
    if (m === 'sleeve') {
      // manga del abrigo: cuero repujado con pespunte en la costura exterior
      const k = 0.15 + n * 0.35 + smoothstep(0.55, 0.85, noise3(x, y, z, 11)) * 0.25;
      return { ...leather(k), aoK: 0.7 };
    }
    // Tronco: abrigo con la abertura delantera que deja ver el chaleco
    const front = z > 0.02;
    const w = openW(y);
    if (front && y > 1.0 && y < 1.47 && ax < w) {
      // escote de la camisa oscura en V
      if (y > 1.35 && ax < 0.012 + (y - 1.35) * 0.42) return S_(mulc(C.shirt, 0.85 + n * 0.2), 0.8, 0, PATTERN.cloth, 0.3);
      // tapeta central con botones de plata
      if (ax < 0.009) {
        const b = Math.abs(((y - 1.0) / 0.046) % 1 - 0.5);
        if (b < 0.16 && ax < 0.0065) return silver(0.15);
        return vestC(0.75);
      }
      // franjas de brocado plateado a ambos lados de la tapeta (el hilo lo dibuja el sombreador)
      if (ax > 0.012 && ax < 0.034) return vestC(0.05 + n * 0.2, 0.16);
      return vestC(0.25 + n * 0.35 + (ax > w - 0.006 ? 0.4 : 0), 0);
    }
    // ribete bordado de las solapas: filete de plata y banda con volutas
    if (front && y > 1.0 && y < 1.5 && ax < w + 0.02) {
      if (ax < w + 0.003) return silver(0.3);
      return { ...metal(0.0, 0.14), c: mixc(C.coat, C.coatDark, 0.3 + n * 0.2), r: 0.6, m: 0 };
    }
    let k = 0.2 + n * 0.3;
    // grandes volutas plateadas en el pecho del abrigo (como en la lámina)
    if (front && y > 1.18 && y < 1.44 && ax > w + 0.022 && ax < w + 0.085) {
      return S_(mixc(C.coat, C.coatDark, k), 0.62, 0, PATTERN.brocade, 0.05);
    }
    // costura central de la espalda y pinzas
    if (z < -0.06 && ax < 0.004 && y < 1.4) k += 0.45;
    return leather(k);
  };

  const skinPaint = (x, y, z, k) => S_(mixc(C.skin, C.skinDark, k), 0.5, 0, PATTERN.skin, 0.3);
  const bootPaint = (x, y, z, n) => {
    const ax = Math.abs(x);
    const scuff = smoothstep(0.7, 0.9, noise3(x, y, z, 30)) * 0.5;
    // dos correas con hebilla de plata en el lado exterior
    for (const yb of [0.2, 0.31]) {
      if (Math.abs(y - yb) < 0.012) {
        const outer = ax > 0.12;
        if (outer && Math.abs(z - 0.0) < 0.016 && Math.abs(y - yb) < 0.01) return silver(0.3);
        return belt(0.55 + n * 0.2);
      }
    }
    if (y < 0.03) return S_(mulc(C.bootDark, 0.8), 0.7, 0, PATTERN.leather, 0.8);
    return S_(mixc(mixc(C.boot, C.bootDark, 0.25 + n * 0.35), lin('#5b4a40'), scuff * 0.4), 0.5 - scuff * 0.1, 0, PATTERN.leather, 0.75);
  };

  const ch = assembleCharacter({
    P, bodyScene: body, bodyPaint, material: mat, bodyCell: 0.0132, fingers: true,
    bodyAO: { dist: [0.012, 0.03], k: 0.55 },
  });
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
  // Pieza rígida esculpida en dos niveles de detalle (el fino solo en planos cortos).
  const lods = { hi: [], lo: [] };
  let trisHi = 0;
  const piece = (bone, scene, paint, cell = 0.005, key = bone, { ao = { dist: [0.008, 0.02], k: 0.5 }, loCell = null } = {}) => {
    const lo = surfaceNets(scene, loCell || Math.max(cell * 2.4, 0.009));
    const ml = addMesh(bone, meshToGeometry(lo, scene, paint, { origin: pos[bone], ao }));
    ml.userData.lod = 'lo'; ml.userData.noMerge = true;
    lods.lo.push(ml);
    if (HI) {
      const hi = surfaceNets(scene, cell);
      const mh = addMesh(bone, meshToGeometry(hi, scene, paint, { origin: pos[bone], ao }));
      tris -= hi.indices.length / 3;
      trisHi += hi.indices.length / 3 - lo.indices.length / 3;
      mh.userData.lod = 'hi'; mh.userData.noMerge = true;
      lods.hi.push(mh);
    }
    breakdown[key] = (breakdown[key] || 0) + lo.indices.length / 3;
    return ml;
  };
  // capa que sigue la superficie del torso a una distancia fija (correas, solapas)
  const layer = (off, th, extra = {}) => {
    const b = torso.bounds(off + th + 0.01);
    return { ...extra, min: b.min, max: b.max, d: (x, y, z) => Math.abs(torso.eval(x, y, z) - off) - th };
  };

  // ---------- Cuello alto del abrigo ----------
  {
    const s = new SdfScene({ k: 0.004 });
    s.add(ellipsoidShell([0, 1.5, -0.024], [0.086, 0.11, 0.084], 0.0055, { mat: 'collar' }));
    const top = (z) => 1.61 - 0.04 * smoothstep(-0.03, 0.07, z);
    s.clip = (x, y, z) => {
      const ax = Math.abs(x);
      const open = z > 0.0 ? (0.02 + (y - 1.45) * 0.3) - ax : -1;
      return Math.max(1.44 - y, y - top(z), open);
    };
    const paint = (x, y, z, prim, nx, ny, nz) => {
      const inner = nx * x + nz * (z + 0.024) < 0;
      const n = noise3(x, y, z, 50);
      if (y > top(z) - 0.005) return silver(0.25);
      if (inner) return lining(0.25 + n * 0.3);
      return leather(0.3 + n * 0.25, 0.05);
    };
    piece('chest', s, paint, 0.0034, 'collar');
  }
  // ---------- Capucha caída sobre los hombros ----------
  // Cuello vuelto de tela gruesa alrededor de la nuca y la capucha vacía colgando sobre la espalda,
  // pegada al cuerpo, con un pliegue central y el borde de forro violeta.
  {
    const s = new SdfScene({ k: 0.014, subK: 0.008 });
    const ring = [];
    for (let i = 0; i <= 12; i++) {
      const a = (-1 + i / 6) * 1.8;  // de un hombro al otro por detrás
      ring.push([Math.sin(a) * 0.122, 1.47 + 0.018 * Math.cos(a), -0.033 - Math.cos(a) * 0.098]);
    }
    for (let i = 0; i < ring.length - 1; i++) {
      const r0 = 0.03 + 0.012 * Math.cos((i / 12 - 0.5) * Math.PI), r1 = 0.03 + 0.012 * Math.cos(((i + 1) / 12 - 0.5) * Math.PI);
      s.add(roundCone(ring[i], ring[i + 1], r0, r1, { mat: 'hood' }));
    }
    const zb = surfZb(0, 1.33);
    s.add(ellipsoid([0, 1.38, zb - 0.026], [0.098, 0.1, 0.03], { mat: 'hood' }));
    s.add(roundCone([0, 1.44, zb - 0.03], [0, 1.25, zb - 0.022], 0.045, 0.016, { mat: 'hood' }));
    s.carve(roundCone([0, 1.4, -0.05], [0, 1.62, -0.03], 0.075, 0.07));
    s.displace = (x, y, z) => {
      // pliegues: ondas que bajan desde el cuello y arrugas sueltas
      const a = Math.atan2(x, -z);
      return 0.004 * Math.sin(a * 6 + y * 18) * smoothstep(1.3, 1.45, y) + 0.003 * Math.sin(x * 70 + y * 25) * smoothstep(1.42, 1.3, y)
        + (noise3(x, y, z, 35) - 0.5) * 0.004;
    };
    const paint = (x, y, z) => {
      const n = noise3(x, y, z, 45);
      // borde de la abertura con forro violeta a la vista
      const rim = Math.hypot(x, z + 0.04) < 0.108 && y > 1.44;
      if (rim) return lining(0.3 + n * 0.3);
      return hoodC(0.2 + n * 0.4 + (y < 1.3 ? 0.25 : 0));
    };
    piece('chest', s, paint, 0.005, 'hood');
  }
  // ---------- Hombreras de metal grabado en capas ----------
  for (const [k, L] of [[1, 'L'], [-1, 'R']]) {
    const J = pos['arm' + L];
    for (let i = 0; i < 3; i++) {
      const s = new SdfScene({ k: 0.003 });
      // láminas bajas y anchas que se solapan como tejas (no cúpulas): la superior cubre el hombro,
      // las otras dos caen sobre el brazo
      const c = vec.add(J, [(0.012 + i * 0.013) * k, 0.012 - i * 0.03, -0.006]);
      const r = [0.088 - i * 0.003, 0.05, 0.09 - i * 0.003];
      s.add(ellipsoidShell(c, r, 0.0055, { mat: 'plate' }));
      const plane = (x, y) => (y - (c[1] - 0.012)) + 0.62 * k * (x - c[0]);
      const lowEdge = i === 0 ? 0 : -0.045;
      s.clip = (x, y) => Math.max(-plane(x, y), i === 0 ? -(k * (x - J[0]) + 0.055) : plane(x, y) + lowEdge - 0.05);
      const paint = (x, y, z) => {
        const e = plane(x, y);
        const n = noise3(x, y, z, 30);
        if (e < 0.0045) return silver(0.35 + n * 0.3);
        // banda lisa bajo el filete y campo grabado con volutas de plata
        if (e < 0.012) return metal(0.55, 0);
        return metal(0.3 + n * 0.35 + (z < c[2] - 0.05 ? 0.2 : 0), 0.12);
      };
      piece(i === 0 ? 'clav' + L : 'arm' + L, s, paint, 0.0046, 'pauldron' + L, { loCell: 0.0105 });
    }
  }
  // ---------- Brazales grabados sobre la manga ----------
  for (const [k, L] of [[1, 'L'], [-1, 'R']]) {
    const d = L === 'L' ? S.dirL : S.dirR;
    const E = pos['fore' + L], W = pos['hand' + L];
    const a = vec.add(E, vec.scl(d, 0.07)), b = vec.add(W, vec.scl(d, -0.006));
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const s = new SdfScene({ k: 0.006 });
    s.add(roundCone(a, b, 0.05, 0.041, { mat: 'plate' }));
    // codera
    s.add(ellipsoid(vec.add(E, [0.006 * k, 0.004, -0.034]), [0.034, 0.04, 0.03], { mat: 'elbow' }));
    const tAt = (x, y, z) => ((x - a[0]) * d[0] + (y - a[1]) * d[1] + (z - a[2]) * d[2]) / len;
    const paint = (x, y, z, prim) => {
      const n = noise3(x, y, z, 30);
      if (prim.mat === 'elbow') return metal(0.4 + n * 0.3);
      const t = tAt(x, y, z);
      if (t < 0.035 || t > 0.965) return silver(0.4);
      // dos correas de cuero
      if (Math.abs(t - 0.3) < 0.045 || Math.abs(t - 0.7) < 0.045) return belt(0.4 + n * 0.3);
      return metal(0.35 + n * 0.3, 0.13);
    };
    piece('fore' + L, s, paint, 0.0042, 'bracer' + L);
  }
  // ---------- Cinturones, tahalí y bolsa ----------
  {
    const s = new SdfScene({ k: 0.004 });
    s.add(layer(0.012, 0.0055, { mat: 'belt' }));
    s.add(roundBox([0, 1.012, surfZ(0, 1.012) + 0.02], [0.022, 0.02, 0.004], 0.004, { mat: 'buckle' }));
    s.clip = (x, y, z) => Math.abs(y - 1.012) - (z > 0.05 && Math.abs(x) < 0.035 ? 0.03 : 0.021);
    const paint = (x, y, z, prim) => {
      const n = noise3(x, y, z, 60);
      if (prim.mat === 'buckle') return Math.hypot(x, y - 1.012) < 0.012 && Math.hypot(x, y - 1.012) > 0.007 ? silver(0.1) : metal(0.5);
      const edge = Math.abs(y - 1.012) > 0.016;
      return belt(0.2 + n * 0.3 + (edge ? 0.35 : 0));
    };
    piece('hips', s, paint, 0.0034, 'belt');
  }
  {
    // segundo cinturón inclinado y bolsa en la cadera derecha
    const s = new SdfScene({ k: 0.004 });
    s.add(layer(0.02, 0.005, { mat: 'belt' }));
    const yb = (x) => 0.968 - x * 0.16;
    s.clip = (x, y) => Math.max(Math.abs(y - yb(x)) - 0.015, y - 1.05);
    piece('hips', s, (x, y, z) => belt(0.3 + noise3(x, y, z, 60) * 0.3), 0.0034, 'belt2');
    const pz = surfZ(-0.135, 0.935) + 0.03;
    const q = new SdfScene({ k: 0.004 });
    q.add(roundBox([-0.135, 0.925, pz], [0.026, 0.032, 0.014], 0.006, { mat: 'pouch' }));
    q.add(roundBox([-0.135, 0.95, pz + 0.004], [0.028, 0.012, 0.014], 0.004, { mat: 'flap' }));
    q.add(ellipsoid([-0.135, 0.945, pz + 0.02], [0.0055, 0.0055, 0.003], { mat: 'stud' }));
    const paint = (x, y, z, prim) => {
      const n = noise3(x, y, z, 60);
      if (prim.mat === 'stud') return silver(0.2);
      return belt((prim.mat === 'flap' ? 0.2 : 0.4) + n * 0.3);
    };
    piece('hips', q, paint, 0.0034, 'pouch');
  }
  {
    // tahalí: correa del hombro derecho a la cadera izquierda, con anilla de plata
    const s = new SdfScene({ k: 0.004 });
    s.add(layer(0.016, 0.0045, { mat: 'strap' }));
    const nP = vec.nrm([0.84, 0.54, 0]);
    const band = (x, y) => (x + 0.125) * nP[0] + (y - 1.47) * nP[1];
    s.clip = (x, y) => Math.max(Math.abs(band(x, y)) - 0.0135, 1.04 - y, y - 1.5);
    const paint = (x, y, z) => (Math.abs(band(x, y)) > 0.0105 ? belt(0.75) : belt(0.25 + noise3(x, y, z, 60) * 0.3));
    piece('chest', s, paint, 0.0034, 'baldric');
    // en la espalda las dos correas se cruzan en X (la segunda solo por detrás)
    const s2 = new SdfScene({ k: 0.004 });
    s2.add(layer(0.017, 0.0045, { mat: 'strap' }));
    const nQ = vec.nrm([-0.84, 0.54, 0]);
    const band2 = (x, y) => (x - 0.125) * nQ[0] + (y - 1.47) * nQ[1];
    s2.clip = (x, y, z) => Math.max(Math.abs(band2(x, y)) - 0.0135, 1.04 - y, y - 1.5, z + 0.02);
    piece('chest', s2, (x, y, z) => (Math.abs(band2(x, y)) > 0.0105 ? belt(0.75) : belt(0.25 + noise3(x, y, z, 60) * 0.3)), 0.0034, 'baldric');
    const rz = surfZ(0.0, 1.235) + 0.022;
    const r = new SdfScene({ k: 0.002 });
    r.add({ min: [-0.03, 1.22, rz - 0.01], max: [0.02, 1.27, rz + 0.01], d: (x, y, z) => Math.hypot(Math.hypot(x + 0.005, y - 1.248) - 0.011, z - rz) - 0.003 });
    piece('chest', r, () => silver(0.2), 0.0016, 'ring', { loCell: 0.004 });
  }
  // ---------- Broche de eclipse ----------
  const brooch = {};
  {
    const bx = 0.03, by = 1.43;
    const bz = surfZ(bx, by) + 0.016;
    const s = new SdfScene({ k: 0.0015 });
    const ring = { mat: 'ring', min: [bx - 0.03, by - 0.03, bz - 0.012], max: [bx + 0.03, by + 0.03, bz + 0.012],
      d: (x, y, z) => Math.hypot(Math.hypot(x - bx, y - by) - 0.0195, z - bz) - 0.0042 };
    s.add(ring);
    s.add(ellipsoid([bx, by, bz - 0.002], [0.0165, 0.0165, 0.0085], { mat: 'gem' }));
    // garras que sujetan la capucha
    for (const a of [0.8, 2.35, 3.95, 5.5]) s.add(roundCone([bx + Math.cos(a) * 0.022, by + Math.sin(a) * 0.022, bz], [bx + Math.cos(a) * 0.031, by + Math.sin(a) * 0.031, bz - 0.006], 0.003, 0.002, { mat: 'ring' }));
    const paint = (x, y, z, prim) => {
      if (prim.mat === 'gem') {
        // disco negro pulido con una media luna violeta (la luz que rodea el eclipse)
        const rx = x - bx - 0.004, ry = y - by + 0.002;
        const rr = Math.hypot(rx, ry);
        if (z > bz + 0.004 && rr > 0.0105 && rr < 0.0145 && Math.hypot(x - bx, y - by) < 0.0158) return glow();
        return S_(lin('#07060a'), 0.08, 0.6, PATTERN.plain, 0);
      }
      const a = Math.atan2(y - by, x - bx);
      return silver(0.15 + 0.4 * Math.abs(Math.sin(a * 6)) * 0.4);
    };
    piece('chest', s, paint, 0.0012, 'brooch', { ao: { dist: [0.003], k: 0.4 }, loCell: 0.0028 });
    brooch.pos = [bx, by, bz];
  }
  // ---------- Rodilleras y vueltas de las botas ----------
  for (const [k, L] of [[1, 'L'], [-1, 'R']]) {
    const K = pos['shin' + L];
    {
      const s = new SdfScene({ k: 0.004 });
      s.add(ellipsoidShell(vec.add(K, [0.002 * k, 0.004, 0.036]), [0.047, 0.056, 0.034], 0.005, { mat: 'plate' }));
      s.add(ellipsoidShell(vec.add(K, [0.002 * k, -0.058, 0.032]), [0.042, 0.032, 0.03], 0.0045, { mat: 'plate' }));
      s.clip = (x, y, z) => K[2] + 0.02 - z;
      const paint = (x, y, z) => {
        const n = noise3(x, y, z, 30);
        const r = Math.hypot(x - K[0], (y - K[1]) * 0.85);
        if (z < K[2] + 0.026) return silver(0.55);
        // rodillera de cuero endurecido con remaches; placa de metal grabado en el centro
        if (r < 0.03) return metal(0.35 + n * 0.3, 0.13);
        if (Math.abs(r - 0.038) < 0.0035 && Math.sin(Math.atan2(y - K[1], x - K[0]) * 8) > 0.85) return silver(0.3);
        return S_(mixc(C.boot, C.bootDark, 0.35 + n * 0.3), 0.55, 0, PATTERN.leather, 0.7);
      };
      piece('shin' + L, s, paint, 0.0036, 'knee' + L);
    }
    {
      const s = new SdfScene({ k: 0.004 });
      const cy = K[1] - 0.075;
      s.add(ellipsoidShell([K[0] + 0.002 * k, cy, K[2] - 0.012], [0.062, 0.04, 0.06], 0.007, { mat: 'cuff' }));
      s.clip = (x, y) => Math.abs(y - cy) - 0.026;
      const paint = (x, y, z) => {
        const n = noise3(x, y, z, 50);
        if (Math.abs(y - cy) > 0.021) return belt(0.6);
        return S_(mixc(C.boot, C.bootDark, 0.4 + n * 0.3), 0.55, 0, PATTERN.leather, 0.7);
      };
      piece('shin' + L, s, paint, 0.0042, 'bootCuff' + L);
    }
  }

  // ---------- Manos: guante sin dedos sobre un esqueleto de falanges ----------
  const hands = buildHands(S, ch, mat);
  for (const m of [hands.hi, hands.lo].filter(Boolean)) {
    ch.root.add(m);
    lods[m.userData.lod].push(m);
  }
  tris += hands.trisLo;
  trisHi += hands.trisHi - hands.trisLo;
  breakdown.hands = hands.trisLo;

  // Marco de cada mano para el poder: origen en el centro de la palma, +Y hacia las yemas y +X normal
  // de la palma (la esfera flota sobre ella).
  const foci = {};
  for (const side of [1, -1]) {
    const lay = fingerLayout(side, S);
    const L = lay.L;
    const Wp = pos['hand' + L];
    const pc = vec.add(vec.add(Wp, vec.scl(lay.d, 0.062)), vec.scl(lay.s, 0.016));
    const group = new THREE.Group();
    group.position.set(pc[0] - Wp[0], pc[1] - Wp[1], pc[2] - Wp[2]);
    const X = new THREE.Vector3(...lay.s), Y = new THREE.Vector3(...lay.d);
    const Z = new THREE.Vector3().crossVectors(X, Y);
    group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
    bones['hand' + L].add(group);
    // hoja de sombra del golpe cuerpo a cuerpo (visible solo al golpear)
    const bladeG = new THREE.PlaneGeometry(1, 1, 1, 8);
    {
      const p = bladeG.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const v = p.getY(i) + 0.5;
        const w = 0.07 * Math.sin(Math.min(1, v * 1.15) * Math.PI) ** 0.6 + 0.004;
        p.setXY(i, p.getX(i) * w * 2, 0.06 + v * 0.8);
      }
    }
    const bladeMat = new THREE.MeshBasicMaterial({ color: MAGE_GLOW.clone().multiplyScalar(0.8), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const blade = new THREE.Mesh(bladeG, bladeMat);
    blade.visible = false;
    blade.renderOrder = 6;
    group.add(blade);
    const flare = new THREE.Sprite(new THREE.SpriteMaterial({ color: MAGE_GLOW.clone(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    flare.position.set(0.05, 0.0, 0);
    flare.scale.setScalar(0.001);
    flare.renderOrder = 7;
    group.add(flare);
    foci[L] = { group, base: new THREE.Vector3(0, 0, 0), tip: new THREE.Vector3(0, 0.86, 0), blade, flare, palm: new THREE.Vector3(1, 0, 0) };
  }

  // ---------- Cabeza ----------
  const head = buildHead(pos, rigidMat);
  for (const m of head.meshes) {
    bones.head.add(m);
    if (m.userData.lod) lods[m.userData.lod].push(m);
  }
  tris += head.trisLo; trisHi += head.trisHi - head.trisLo;
  breakdown.head = head.trisLo;

  // ---------- Clavija de forja (al cinto, oculta hasta adquirirla) ----------
  const clavija = buildClavija();
  clavija.group.position.set(0.17, 0.97 - pos.hips[1], 0.07);
  clavija.group.rotation.set(0.2, 0, -0.25);
  clavija.group.visible = false;
  bones.hips.add(clavija.group);

  // Anclajes de los faldones del abrigo (cadera), en espacio local del hueso. Delante quedan abiertos
  // (se ven las piernas) y detrás se abren en dos por la costura central.
  const local = (list, bone) => list.map((p) => new THREE.Vector3(p[0] - pos[bone][0], p[1] - pos[bone][1], p[2] - pos[bone][2]));
  const ring = (a0, a1, y = 0.992) => {
    const out = [];
    for (let i = 0; i < 4; i++) {
      const a = a0 + (a1 - a0) * (i / 3);
      const x = Math.sin(a) * 0.188, z = Math.cos(a) * 0.142 - 0.004;
      out.push([x, y, z]);
    }
    return out;
  };
  const coatAnchors = {
    front: { L: local(ring(1.66, 0.6), 'hips'), R: local(ring(-0.6, -1.66), 'hips') },
    back: { L: local(ring(3.06, 1.66), 'hips'), R: local(ring(-1.66, -3.06), 'hips') },
  };

  const merged = mergeRigidPieces(ch.root);
  lods.hi.length = 0; lods.lo.length = 0;
  ch.root.traverse((o) => { if (o.userData.lod) lods[o.userData.lod].push(o); });
  const setDetail = (hi) => {
    if (!HI) return;
    for (const o of lods.hi) o.visible = hi;
    for (const o of lods.lo) o.visible = !hi;
  };
  setDetail(false);
  return {
    root: ch.root, skinned: ch.skinned, bones, S, P, eyes: head.eyes, tail: head.tail,
    sword: foci.R, foci, clavija, coatAnchors, brooch,
    fingerRig: S.fingerRig,
    materials: [mat, rigidMat], glowMat,
    triangles: tris, trianglesHi: tris + trisHi, breakdown, setDetail, merged,
  };
}

// Tela del abrigo (faldones): exterior de cuero carbón con bordado plateado, forro violeta.
export const MAGE_COAT = { base: '#29262c', hem: '#151317', line: '#b3b0b8', lining: '#4c2a70', style: 'coat' };

// ---------------------------------------------------------------------------------
// Manos con dedos articulados: una malla con piel (SkinnedMesh) para las dos manos, pesada a la
// muñeca y a las quince falanges de cada una. Guante sin dedos: cuero en palma, dorso y primera
// falange; piel con uñas en el resto.
function buildHands(S, ch, material) {
  const boneList = [];
  const boneIndex = {};
  const reg = (name) => { if (!(name in boneIndex)) { boneIndex[name] = boneList.length; boneList.push(S.bones[name]); } };
  const scenes = [];
  for (const side of [1, -1]) {
    const lay = fingerLayout(side, S);
    const { L, d, f, s, W } = lay;
    const P = (dd, ff, ss) => vec.add(vec.add(vec.add(W, vec.scl(d, dd)), vec.scl(f, ff)), vec.scl(s, ss));
    const hb = 'hand' + L;
    reg(hb);
    const sc = new SdfScene({ k: 0.0017, subK: 0.0012 });
    const frame = [d, f, s];
    // puño del guante y muñeca
    sc.add(roundCone(P(-0.034, 0, 0.0), P(0.014, 0, 0.001), 0.03, 0.026, { bone: hb, mat: 'cuff' }));
    // dorso y palma
    sc.add(orientedEllipsoid(P(0.052, 0.002, -0.003), frame, [0.047, 0.037, 0.0115], { bone: hb, mat: 'palm' }));
    sc.add(orientedEllipsoid(P(0.056, 0.0, 0.0065), frame, [0.042, 0.034, 0.0115], { bone: hb, mat: 'palm' }));
    // eminencia hipotenar (borde del meñique)
    sc.add(orientedEllipsoid(P(0.05, -0.027, 0.008), frame, [0.036, 0.011, 0.0105], { bone: hb, mat: 'palm' }));
    const thumb = lay.fingers[0];
    for (const fg of lay.fingers) {
      for (let i = 0; i < 3; i++) reg(`${fg.name}${i + 1}${L}`);
      if (fg.name !== 'thb') {
        // metacarpiano: nudillo marcado en el dorso
        const j0 = fg.joints[0];
        const kf = (j0[0] - W[0]) * f[0] + (j0[1] - W[1]) * f[1] + (j0[2] - W[2]) * f[2];
        sc.add(roundCone(P(0.02, kf * 0.6, -0.002), j0, 0.011, fg.r[0] * 1.06, { bone: hb, mat: 'palm' }));
      }
      for (let i = 0; i < 3; i++) {
        const bn = `${fg.name}${i + 1}${L}`;
        const ra = fg.r[i], rb = fg.r[i + 1];
        const pr = roundCone(fg.joints[i], fg.joints[i + 1], ra, rb, { bone: bn, mat: 'finger', phal: i, finger: fg.name, side });
        sc.add(pr);
      }
      // dedil del guante: un poco más grueso que el dedo y con el canto vivo (el corte del guante
      // es un escalón, no un borde pintado)
      {
        const gi = fg.name === 'thb' ? 1 : 0;
        const a = fg.joints[gi], b = fg.joints[gi + 1];
        const e = vec.add(a, vec.scl([b[0] - a[0], b[1] - a[1], b[2] - a[2]], fg.name === 'thb' ? 0.38 : 0.58));
        sc.add(roundCone(a, e, fg.r[gi] * 1.12, fg.r[gi] * 1.09, { bone: `${fg.name}${gi + 1}${L}`, mat: 'gloveF', phal: gi, finger: fg.name, side, priority: 0.0006, blend: 0.0006 }));
      }
      // yema
      const tipDir = vec.nrm([fg.joints[3][0] - fg.joints[2][0], fg.joints[3][1] - fg.joints[2][1], fg.joints[3][2] - fg.joints[2][2]]);
      const pad = vec.add(vec.add(fg.joints[3], vec.scl(tipDir, -fg.r[3] * 0.9)), vec.scl(fg.name === 'thb' ? vec.nrm(vec.add(vec.scl(s, 0.75), vec.scl(f, -0.65))) : s, fg.r[3] * 0.25));
      sc.add(ellipsoid(pad, [fg.r[3] * 0.92, fg.r[3] * 0.92, fg.r[3] * 0.92], { bone: `${fg.name}3${L}`, mat: 'finger', phal: 2, finger: fg.name, side }));
    }
    // carne del pulgar (eminencia tenar) entre la palma y el metacarpiano del pulgar
    sc.add(roundCone(P(0.024, 0.008, 0.008), thumb.joints[1], 0.0145, 0.0112, { bone: hb, boneB: `thb1${L}`, blendFrom: 0.2, blendMax: 0.85, mat: 'palm' }));
    scenes.push({ sc, lay });
  }
  // Pintura: el guante cubre la palma y media primera falange; uñas en el dorso de la última.
  const paint = (lay) => (x, y, z, prim) => {
    const n = noise3(x, y, z, 220);
    const { s, f } = lay;
    if (prim.mat === 'cuff' || prim.mat === 'palm') {
      // costuras del guante: alrededor del puño y por el dorso hacia cada nudillo
      const rel = [x - lay.W[0], y - lay.W[1], z - lay.W[2]];
      const along = rel[0] * lay.d[0] + rel[1] * lay.d[1] + rel[2] * lay.d[2];
      if (Math.abs(along - 0.004) < 0.003) return S_(mulc(C.gloveDark, 0.8), 0.7, 0, PATTERN.leather, 0.8);
      if (along < -0.012 && Math.abs(along + 0.022) < 0.0025) return silver(0.4);
      return S_(mixc(C.glove, C.gloveDark, 0.2 + n * 0.4), 0.5, 0, PATTERN.leather, 0.75);
    }
    const fg = lay.fingers.find((q) => q.name === prim.finger);
    if (prim.mat === 'gloveF') return S_(mixc(C.glove, C.gloveDark, 0.25 + n * 0.4), 0.5, 0, PATTERN.leather, 0.75);
    if (!fg || prim.phal == null) return S_(C.skin, 0.5, 0, PATTERN.skin, 0.3);
    const a = fg.joints[prim.phal], b = fg.joints[prim.phal + 1];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const L2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
    const t = clamp(((x - a[0]) * ab[0] + (y - a[1]) * ab[1] + (z - a[2]) * ab[2]) / L2, 0, 1);
    const ax = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
    const off = [x - ax[0], y - ax[1], z - ax[2]];
    const palmDir = fg.name === 'thb' ? vec.nrm(vec.add(vec.scl(s, 0.75), vec.scl(f, -0.65))) : s;
    const back = -(off[0] * palmDir[0] + off[1] * palmDir[1] + off[2] * palmDir[2]) / (fg.r[prim.phal] + 1e-6);
    // guante: primera falange (en el pulgar, metacarpiano y mitad de la falange)
    if (fg.name === 'thb' && prim.phal === 0) return S_(mixc(C.glove, C.gloveDark, 0.25 + n * 0.4), 0.5, 0, PATTERN.leather, 0.75);
    let c = mixc(C.skin, C.skinDark, 0.12 + n * 0.22);
    // nudillos y yemas algo más rojizos; pliegues de las articulaciones en el dorso
    const joint = Math.min(t, 1 - t);
    if (back > 0.2 && joint < 0.12) c = mixc(c, C.skinRed, 0.35);
    if (back > 0.4 && joint < 0.04) c = mulc(c, 0.8);
    if (prim.phal === 2 && t > 0.75) c = mixc(c, C.skinRed, 0.25);
    // uña
    // uña: discreta, del tono de la piel algo más rosada y brillante; borde libre apenas más claro
    if (prim.phal === 2 && back > 0.62 && t > 0.42 && t < 0.97) {
      const nc = mixc(mixc(C.nail, C.skin, 0.55), C.skinRed, 0.12);
      return S_(t > 0.9 ? mixc(nc, lin('#c9b2a4'), 0.35) : nc, 0.3, 0, PATTERN.plain, 0.1);
    }
    return S_(c, 0.48, 0, PATTERN.skin, 0.3);
  };
  const build = (cell) => {
    const geos = [];
    let trisN = 0;
    for (const { sc, lay } of scenes) {
      const m = surfaceNets(sc, cell);
      trisN += m.indices.length / 3;
      const g = meshToGeometry(m, sc, paint(lay), { skin: true, boneIndex, sigma: 0.0011, ao: { dist: [0.004, 0.01], k: 0.55 } });
      geos.push(g);
    }
    // un índice común para las dos manos
    return { g: mergeGeometries(geos, false), trisN };
  };
  ch.root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(boneList);
  const mk = (cell, lod) => {
    const { g, trisN } = build(cell);
    const m = new THREE.SkinnedMesh(g, material);
    m.castShadow = true; m.receiveShadow = true;
    m.frustumCulled = false;
    m.bind(skeleton);
    m.userData.lod = lod;
    m.userData.noMerge = true;
    return { m, trisN };
  };
  const lo = mk(0.0042, 'lo');
  const hi = HI ? mk(0.0017, 'hi') : null;
  return { hi: hi && hi.m, lo: lo.m, trisHi: hi ? hi.trisN : lo.trisN, trisLo: lo.trisN, skeleton };
}

// ---------------------------------------------------------------------------------
// Cabeza: rostro esculpido, ojos con párpados, cejas y barba pintadas sobre relieve, cabello
// semirrecogido con mechones y coleta con muelles.
function buildHead(pos, rigidMat) {
  const meshes = [];
  let trisHi = 0, trisLo = 0;
  const lodPair = (scene, paint, cellHi, cellLo, ao) => {
    const lo = surfaceNets(scene, cellLo);
    const hi = HI ? surfaceNets(scene, cellHi) : lo;
    for (const [msh, lod] of HI ? [[hi, 'hi'], [lo, 'lo']] : [[lo, 'lo']]) {
      const m = new THREE.Mesh(meshToGeometry(msh, scene, paint, { origin: pos.head, ao }), rigidMat);
      m.castShadow = true; m.receiveShadow = true;
      m.userData.lod = lod; m.userData.noMerge = true;
      meshes.push(m);
    }
    trisHi += hi.indices.length / 3; trisLo += lo.indices.length / 3;
  };

  // línea de nacimiento: altura según el ángulo (frente alta, sienes con entradas, nuca baja)
  const hairlineY = (x, z) => {
    const ax = Math.abs(x);
    return 1.765 - 0.125 * smoothstep(0.04, -0.1, z) - 0.024 * smoothstep(0.03, 0.07, ax)
      + 0.009 * Math.exp(-((ax - 0.042) ** 2) / 0.0002) * smoothstep(0.02, 0.06, z);
  };

  // ---- Rostro ----
  // Base lisa con el perfil de un varón adulto (frente, arco superciliar, maxilar, morro, mandíbula y
  // mentón en su sitio respecto a la córnea) y, encima, relieves de pocos milímetros colocados sobre
  // esa superficie: así cada rasgo sobresale lo que debe y no un bulto. Los rasgos finos llevan su
  // propio radio de fundido («blend»).
  const head = new SdfScene({ k: 0.0052, subK: 0.0028 });
  const skin = { mat: 'skin' };
  const baseParts = [
    ellipsoid([0, 1.745, -0.028], [0.0745, 0.095, 0.097], skin),   // cráneo
    ellipsoid([0, 1.71, -0.064], [0.063, 0.068, 0.054], skin),     // nuca
    ellipsoid([0, 1.744, 0.021], [0.061, 0.062, 0.0695], skin),    // frente
    ellipsoid([0, 1.686, 0.03], [0.0655, 0.034, 0.055], skin),      // órbitas y pómulos
    ellipsoid([0, 1.655, 0.041], [0.051, 0.04, 0.051], skin),      // maxilar
    ellipsoid([0, 1.63, 0.061], [0.0305, 0.028, 0.035], skin),     // morro de la boca
    ellipsoid([0, 1.594, 0.073], [0.0205, 0.0175, 0.0168], { mat: 'jaw' }),  // mentón
    ellipsoid([0, 1.613, 0.022], [0.041, 0.021, 0.05], { mat: 'jaw' }),      // suelo de la mandíbula
    roundCone([0, 1.55, -0.024], [0, 1.655, -0.022], 0.05, 0.048, skin),     // cuello
  ];
  for (const s of [1, -1]) {
    baseParts.push(roundCone([0.056 * s, 1.676, -0.02], [0.0475 * s, 1.627, -0.004], 0.0105, 0.011, { mat: 'jaw' }));
    baseParts.push(roundCone([0.0475 * s, 1.627, -0.004], [0.02 * s, 1.5935, 0.065], 0.011, 0.0105, { mat: 'jaw' }));
  }
  for (const p of baseParts) head.add(p);
  // superficie de la base vista de frente: z de la piel en (x, y)
  const fz = (x, y) => {
    let a = 0.2, b = -0.02;
    for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (head.eval(x, y, m) > 0) a = m; else b = m; }
    return (a + b) / 2;
  };
  // relieve (h > 0) o hundimiento (h < 0) de un elipsoide apoyado en la base
  const bump = (x, y, r, h, extra = {}) => head.add(ellipsoid([x, y, fz(x, y) + h - r[2]], r, { mat: 'skin', blend: 0.0032, ...extra }));
  const dent = (x, y, r, depth, extra = {}) => head.carve(ellipsoid([x, y, fz(x, y) - depth + r[2]], r, { blend: 0.003, ...extra }));
  // arco superciliar: más marcado en el centro, se pierde hacia la sien
  for (let i = -4; i <= 4; i++) {
    const x = i * 0.0122, ax = Math.abs(x);
    // sin barra continua: el entrecejo apenas sobresale
    bump(x, 1.7142 - ax * 0.09, [0.011, 0.0062, 0.0085], (0.0052 - ax * 0.05) * (ax < 0.013 ? 0.45 : 1), { mat: 'brow', blend: 0.004 });
  }
  dent(0, 1.7012, [0.0075, 0.0055, 0.006], 0.0018);                    // raíz de la nariz
  for (const s of [1, -1]) {
    dent(0.062 * s, 1.722, [0.012, 0.014, 0.012], 0.0012);             // sienes
    bump(0.052 * s, 1.677, [0.015, 0.009, 0.01], 0.002, { mat: 'cheek' });   // pómulo
    dent(0.052 * s, 1.645, [0.012, 0.016, 0.008], 0.0032);             // hueco bajo el pómulo
  }
  // ojos: la piel envuelve el globo a 2 mm (párpados) y una hendidura almendrada deja ver el ojo;
  // el ángulo externo queda algo más alto que el interno
  const eyeZ = 0.0705, eyeR = 0.0117;
  const slits = [];
  for (const s of [1, -1]) {
    head.add(ellipsoid([0.032 * s, 1.6925, eyeZ], [eyeR + 0.0021, eyeR + 0.0019, eyeR + 0.0021], { mat: 'lid', blend: 0.0032 }));
    const t = 0.085 * s;
    slits.push(head.carve(orientedEllipsoid([0.0325 * s, 1.6912, eyeZ + eyeR - 0.002],
      [[Math.cos(t), Math.sin(t), 0], [-Math.sin(t), Math.cos(t), 0], [0, 0, 1]], [0.0152, 0.0049, 0.0092], { blend: 0.001 })));
    // bolsa suave bajo el párpado inferior
    bump(0.032 * s, 1.6808, [0.012, 0.0036, 0.004], 0.0004);
  }
  // nariz: dorso estrecho y recto, punta definida, aletas, columela y fosas
  const zN0 = fz(0, 1.703) + 0.0018, zTip = fz(0, 1.66) + 0.019;
  head.add(roundCone([0, 1.7035, zN0 - 0.0056], [0, 1.6668, zTip - 0.0072], 0.0056, 0.0071, { mat: 'nose', blend: 0.0032 }));
  head.add(ellipsoid([0, 1.6605, zTip - 0.0082], [0.008, 0.0077, 0.0082], { mat: 'nose', blend: 0.0024 }));
  head.add(ellipsoid([0, 1.6522, zTip - 0.0112], [0.004, 0.0034, 0.0058], { mat: 'nose', blend: 0.0022 }));
  for (const s of [1, -1]) {
    head.add(ellipsoid([0.0118 * s, 1.6555, zTip - 0.0172], [0.0066, 0.0058, 0.0074], { mat: 'nose', blend: 0.0022 }));
    head.carve(ellipsoid([0.0064 * s, 1.6502, zTip - 0.0122], [0.0033, 0.0016, 0.0044], { blend: 0.0011 }));
  }
  // boca: labio superior fino con arco de Cupido, inferior más lleno, comisuras hundidas
  const zUL = fz(0, 1.6316) + 0.0016, zLL = fz(0, 1.6222) + 0.0016;
  head.add(ellipsoid([0, 1.6314, zUL - 0.0062], [0.0172, 0.0042, 0.0062], { mat: 'lip', blend: 0.0022 }));
  head.add(ellipsoid([0, 1.6224, zLL - 0.0068], [0.0125, 0.0052, 0.0068], { mat: 'lip', blend: 0.0022 }));
  for (const s of [1, -1]) head.add(ellipsoid([0.008 * s, 1.6232, zLL - 0.0072], [0.0105, 0.0042, 0.0062], { mat: 'lip', blend: 0.0022 }));
  dent(0, 1.6125, [0.0125, 0.0026, 0.004], 0.0016);                  // surco bajo el labio
  bump(0, 1.596, [0.0165, 0.011, 0.01], 0.0018, { mat: 'jaw' });     // eminencia del mentón
  for (const s of [1, -1]) {
    head.add(ellipsoid([0.0045 * s, 1.6345, zUL - 0.0042], [0.0056, 0.003, 0.0045], { mat: 'lip', blend: 0.0014 }));
    head.add(roundCone([0.0038 * s, 1.6455, fz(0.004, 1.6455) - 0.001], [0.0043 * s, 1.6358, fz(0.004, 1.6358) - 0.001], 0.0016, 0.0018, { mat: 'skin', blend: 0.002 }));
    head.carve(ellipsoid([0.0202 * s, 1.6272, fz(0.0202, 1.6272) + 0.0006], [0.0024, 0.0019, 0.0042], { blend: 0.0014 }));
    // orejas: pabellón con concha hundida
    head.add(ellipsoid([0.0755 * s, 1.687, -0.012], [0.0082, 0.0265, 0.016], { mat: 'ear' }));
    head.carve(ellipsoid([0.0835 * s, 1.684, -0.007], [0.0034, 0.0135, 0.0082], { blend: 0.0018 }));
  }
  head.add(ellipsoid([0, 1.587, 0.0255], [0.0068, 0.011, 0.0068], skin)); // nuez

  // Barba corta y recortada: bigote unido a la perilla y línea de la mandíbula; mejillas con sombra
  // de barba (pintada). El relieve es un desplazamiento de unos milímetros, no un volumen aparte.
  const cheekLine = (ax) => 1.6285 + 0.05 * Math.pow(smoothstep(0.019, 0.07, ax), 0.75);
  const beardMask = (x, y, z) => {
    const ax = Math.abs(x);
    if (z < -0.035) return 0;
    let b = smoothstep(cheekLine(ax) + 0.004, cheekLine(ax) - 0.008, y + (noise3(x, y, z, 260) - 0.5) * 0.006) * smoothstep(-0.032, -0.012, z);
    // patillas delante de la oreja (transiciones suaves: sin escalones en el relieve)
    const sb = smoothstep(0.056, 0.064, ax) * smoothstep(1.707, 1.692, y) * smoothstep(-0.03, -0.018, z) * smoothstep(0.032, 0.016, z);
    b = Math.max(b, sb);
    // bigote: banda sobre el labio superior que sigue su curva y se afina en las comisuras
    if (z > 0.08) {
      const u = ax / 0.0285;
      const mu = 1 - smoothstep(0.7, 1.05, u * u + ((y - 1.6408 + u * u * 0.0045) / 0.0068) ** 2);
      b = Math.max(b, mu);
    }
    // por debajo, la barba se pierde en el cuello
    b *= smoothstep(1.565, 1.59, y + Math.max(0, z - 0.03) * 0.4);
    // labios limpios
    const lipE = (ax / 0.0205) ** 2 + ((y - 1.6268) / 0.0078) ** 2;
    if (z > 0.086 && lipE < 1.25) b *= smoothstep(0.85, 1.25, lipE);
    return clamp(b, 0, 1);
  };
  // grosor/densidad de la barba: 1 en bigote y perilla, menos en la mandíbula y las patillas
  const beardThick = (x, y, z) => {
    const ax = Math.abs(x);
    const goatee = smoothstep(0.034, 0.022, ax) * smoothstep(1.565, 1.585, y);
    const must = ax < 0.03 && y > 1.633 ? 1 : 0;
    return Math.max(goatee, must, 0.45);
  };
  const browMask = (x, y, z) => {
    const ax = Math.abs(x);
    if (z < 0.05 || ax < 0.006 || ax > 0.063) return 0;
    // ceja recta y poblada junto a la nariz, se afina y baja hacia la sien
    const yb = 1.7105 + 0.0028 * Math.exp(-(((ax - 0.034) / 0.014) ** 2)) - Math.max(0, ax - 0.048) * 0.28;
    const th = 0.0062 - (ax - 0.008) * 0.06;
    const e = Math.abs(y - yb) / Math.max(th, 0.0014);
    return (1 - smoothstep(0.5, 1.05, e)) * smoothstep(0.007, 0.012, ax);
  };
  head.displace = (x, y, z) => {
    const b = beardMask(x, y, z);
    const br = browMask(x, y, z);
    return b * beardThick(x, y, z) * (0.0013 + (noise3(x, y, z, 380) - 0.5) * 0.0006) + br * 0.0007;
  };
  head.relax = 1;
  const headPaint = (x, y, z, prim) => {
    const ax = Math.abs(x);
    const n = noise3(x, y, z, 120);
    const n2 = noise3(x, y, z, 420);
    const n3 = noise3(x, y, z, 1400);
    let c = mixc(C.skin, C.skinDark, 0.08 + n * 0.2);
    // luces del relieve óseo (pómulos, puente nasal) y rubor en mejillas, nariz y orejas
    if (prim.mat === 'cheek' || (prim.mat === 'nose' && y > 1.67)) c = mixc(c, C.skinLight, 0.14);
    const red = Math.max(
      Math.exp(-((ax - 0.046) ** 2 + (y - 1.668) ** 2 + (z - 0.068) ** 2) / 0.0004),
      prim.mat === 'nose' && y < 1.668 ? 0.55 : 0, prim.mat === 'ear' ? 0.7 : 0);
    c = mixc(c, C.skinRed, red * 0.3);
    // poros y pecas finas
    c = mulc(c, 0.93 + n2 * 0.08 + n3 * 0.05);
    let r = 0.56, p = PATTERN.skin;
    const isLip = prim.mat === 'lip' && (ax / 0.0205) ** 2 + ((y - 1.6268) / 0.0078) ** 2 < 1.05;
    // línea de la boca (pintada: la escultura mantiene los labios cerrados)
    if (isLip && Math.abs(y - 1.6271 + (ax / 0.02) ** 2 * 0.001) < 0.0007) { c = mulc(C.lip, 0.35); r = 0.6; }
    // labio superior a la sombra del bigote, inferior algo más claro
    else if (isLip) { c = mulc(mixc(mixc(C.lip, C.skin, 0.35), C.skinDark, 0.12 + n * 0.2), y > 1.6272 ? 0.72 : 0.92); r = 0.6; }
    // cuencas: sombra del párpado y ojeras suaves
    const eyeD = Math.hypot((ax - 0.032) / 0.024, (y - 1.692) / 0.017);
    if (z > 0.06 && eyeD < 1.3) c = mixc(c, mulc(C.skinDark, 0.85), (1.3 - eyeD) * 0.3);
    if (prim.mat === 'lid') { c = mixc(c, C.skinRed, 0.12); r = 0.4; }
    // pestañas: borde del párpado superior oscuro y más denso hacia el ángulo externo; el inferior,
    // una línea fina
    if (z > 0.07 && ax > 0.012 && ax < 0.05) {
      let sd = 1;
      for (const sl of slits) sd = Math.min(sd, Math.abs(sl.d(x, y, z)));
      if (sd < 0.0016) {
        const up = y > 1.6912 + (ax - 0.0325) * 0.085;
        const k = (1 - sd / 0.0016) * (up ? 0.95 : 0.45);
        c = mixc(c, mulc(C.beard, 0.6), k);
        if (up && k > 0.5) r = 0.7;
      }
    }
    // raíces junto a la línea de nacimiento: la piel se oscurece hacia el pelo (borde suave)
    const root = smoothstep(-0.006, 0.001, y - hairlineY(x, z)) * (z > -0.03 || y > 1.7 ? 1 : 0);
    if (root > 0) c = mixc(c, mulc(C.hair, 0.9), root * (0.55 + n3 * 0.4));
    // cejas
    const bw = browMask(x, y, z) * (0.7 + n3 * 0.5);
    if (bw > 0.02) {
      c = mixc(c, mulc(C.beard, 0.7 + n3 * 0.5), clamp(bw, 0, 1) * 0.92);
      if (bw > 0.45) { r = 0.78; p = PATTERN.hair; }
    }
    // barba: densidad irregular, más poblada en mentón y bigote; sombra azulada de barba rasurada
    // en las mejillas y el cuello por encima y por debajo de la línea
    const b = isLip ? 0 : beardMask(x, y, z);
    const shadowZone = isLip ? 0 : clamp(smoothstep(cheekLine(ax) + 0.016, cheekLine(ax) + 0.002, y) * smoothstep(-0.02, 0.0, z) * smoothstep(1.54, 1.57, y), 0, 1);
    if (shadowZone > 0.01) c = mixc(c, mixc(C.skinDark, C.beard, 0.5), shadowZone * 0.28 * (0.75 + n3 * 0.5));
    if (b > 0.02) {
      // barba corta: bigote y perilla pobladas; en la mandíbula y las mejillas, de pocos días
      const thick = beardThick(x, y, z);
      const dens = clamp(b * (0.45 + 0.5 * thick) * (0.75 + n2 * 0.25 + n3 * 0.35), 0, 1);
      c = mixc(c, mulc(C.beard, 0.82 + n3 * 0.3), dens * 0.95);
      r = 0.55 + 0.3 * dens; p = dens > 0.4 ? PATTERN.hair : PATTERN.skin;
    }
    return { c, r, m: 0, p, w: 0.3 };
  };
  lodPair(head, headPaint, 0.0021, 0.0058, { dist: [0.004, 0.012], k: 0.5 });

  // ---- Ojos ----
  // párpado superior rozando el borde del iris: mirada despierta y algo intensa
  const LID_OPEN = -0.62;
  const eyes = [];
  const eyeWhite = new THREE.MeshStandardMaterial({ color: '#9c8d82', roughness: 0.12 });
  const irisMat = new THREE.MeshStandardMaterial({ color: '#4a5242', roughness: 0.3 });
  const pupilMat = new THREE.MeshStandardMaterial({ color: '#050404', roughness: 0.08 });
  const lidMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(...mixc(C.skin, C.skinDark, 0.35)), roughness: 0.55 });
  for (const s of [1, -1]) {
    const g = new THREE.Group();
    g.position.set(0.032 * s - pos.head[0], 1.692 - pos.head[1], 0.0705 - pos.head[2]);
    const r = 0.0117;
    const white = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), eyeWhite);
    const irisG = new THREE.SphereGeometry(r * 1.004, 20, 6, 0, Math.PI * 2, 0, 0.69);
    irisG.rotateX(Math.PI / 2);
    const iris = new THREE.Mesh(irisG, irisMat);
    const pupG = new THREE.SphereGeometry(r * 1.008, 14, 4, 0, Math.PI * 2, 0, 0.25);
    pupG.rotateX(Math.PI / 2);
    const pupil = new THREE.Mesh(pupG, pupilMat);
    // párpado para el parpadeo: queda oculto bajo la piel y baja por la hendidura al cerrar
    const lid = new THREE.Mesh(new THREE.SphereGeometry(r * 1.09, 20, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), lidMat);
    lid.rotation.x = LID_OPEN;
    g.add(white, iris, pupil, lid);
    // mirada algo hacia dentro y abajo: serena, no fija al frente
    g.rotation.set(0.04, -0.05 * s, 0);
    eyes.push({ group: g, lid, iris, pupil, open: LID_OPEN });
    meshes.push(g);
  }

  // ---- Cabello ----
  // Casquete con volumen (da el color de fondo y la sombra) y, encima, tarjetas de mechón: la mitad
  // superior peinada hacia atrás hasta un moño bajo, el resto suelto y ondulado hasta los hombros,
  // mechones que enmarcan la cara y algunas hebras sobre la frente.
  const knot = [0, 1.776, -0.126];
  // el casquete sigue el cuero cabelludo: a ras de la piel en la línea de nacimiento (sin escalón)
  // y con volumen hacia la coronilla
  const cap = new SdfScene({ k: 0.008, subK: 0.006 });
  const scalp = new SdfScene({ k: 0.0052 });
  for (const p of baseParts.slice(0, 3)) scalp.add(p);
  cap.add({
    min: [-0.1, 1.55, -0.16], max: [0.1, 1.88, 0.12], mat: 'hair',
    d: (x, y, z) => {
      const up = y - hairlineY(x, z);
      return scalp.eval(x, y, z) - (0.0009 + 0.0105 * smoothstep(-0.004, 0.05, up) + 0.004 * smoothstep(0.04, 0.09, up));
    },
  });
  cap.add(ellipsoid([0, 1.69, -0.086], [0.074, 0.09, 0.05], { mat: 'hair' }));
  cap.add(ellipsoid(knot, [0.03, 0.026, 0.025], { mat: 'knot' }));
  cap.clip = (x, y, z) => {
    const ax = Math.abs(x);
    const hl = hairlineY(x, z);
    let d = hl - y;
    // deja libres las orejas por delante; por detrás el pelo las cubre
    const ear = Math.hypot((ax - 0.08) / 0.026, (y - 1.69) / 0.04, (z - 0.004) / 0.026) - 1;
    d = Math.max(d, -ear * 0.02);
    if (y < 1.7 && z < -0.03) d = Math.min(d, 1.58 - y);
    return d;
  };
  cap.displace = (x, y, z) => {
    // surcos que convergen hacia el moño (nulos en la línea de nacimiento, que va a ras de piel)
    const flow = Math.atan2(x - knot[0], y - knot[1]) * 34;
    const w = noise3(x, y, z, 16);
    const k = smoothstep(0.0, 0.025, y - hairlineY(x, z)) * smoothstep(0.03, 0.045, Math.hypot(x - knot[0], y - knot[1], z - knot[2]));
    return k * (0.0007 * Math.sin(flow + w * 9) + 0.0004 * Math.sin(flow * 2.1 + y * 30) + (noise3(x, y, z, 45) - 0.5) * 0.003);
  };
  cap.relax = 1;
  const hairPaint = (x, y, z) => ({ c: mulc(C.hair, 0.72 + noise3(x, y, z, 300) * 0.25), r: 0.5, m: 0, p: PATTERN.hair, w: 0.4, aoK: 0.7 });
  lodPair(cap, hairPaint, 0.0028, 0.0075, { dist: [0.006, 0.016], k: 0.7 });

  const HC = [0, 1.751, -0.026], HR = [0.0835, 0.104, 0.1065];
  const onScalp = (d, lift = 0) => {
    const l = Math.hypot(d[0], d[1], d[2]);
    const u = [d[0] / l, d[1] / l, d[2] / l];
    const p = [HC[0] + u[0] * HR[0], HC[1] + u[1] * HR[1], HC[2] + u[2] * HR[2]];
    const n = vec.nrm([(p[0] - HC[0]) / (HR[0] * HR[0]), (p[1] - HC[1]) / (HR[1] * HR[1]), (p[2] - HC[2]) / (HR[2] * HR[2])]);
    return vec.add(p, vec.scl(n, lift));
  };
  const sph = (phi, th) => [Math.sin(th) * Math.sin(phi), Math.cos(th), Math.sin(th) * Math.cos(phi)];
  const slerpDir = (a, b, t) => vec.nrm([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
  // normal de las tarjetas: sobre el cráneo, la del elipsoide; por debajo, horizontal hacia fuera
  const nrm = (p) => {
    const dy = p[1] > 1.68 ? (p[1] - HC[1]) / (HR[1] * HR[1]) : 0.25 * (p[1] - 1.68);
    return vec.nrm([p[0] / (HR[0] * HR[0]), dy, (p[2] - HC[2]) / (HR[2] * HR[2])]);
  };
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const guides = [];
  const knotDir = vec.nrm([(knot[0] - HC[0]) / HR[0], (knot[1] - HC[1]) / HR[1], (knot[2] - HC[2]) / HR[2]]);
  // ángulo polar de la línea de nacimiento según el azimut (frente alta, sienes y nuca más bajas)
  const hairline = (phi) => (Math.PI / 180) * (50 + 38 * Math.min(1, Math.abs(phi) / 1.6) ** 1.4);
  // (a) mitad superior peinada hacia atrás con volumen: nace un poco por delante de la línea del
  // casquete (la tapa) y se curva hacia el moño, ahuecada y algo revuelta
  for (let i = 0; i < 140; i++) {
    const phi = (rnd() * 2 - 1) * 1.9;
    const th0 = hairline(phi) * (0.9 + rnd() * 0.12) - (i < 70 ? 0 : rnd() * 0.55);
    const d0 = sph(phi, Math.max(0.1, th0));
    const vol = 0.008 + rnd() * 0.01;
    const wav = (rnd() - 0.5) * 0.6;
    const pts = [];
    for (let k = 0; k <= 7; k++) {
      const t = k / 7;
      const lift = 0.002 + Math.sin(Math.min(1, t * 1.3) * Math.PI) * vol + t * 0.005;
      const dd = slerpDir(d0, knotDir, t * 0.93);
      const side = vec.nrm(vec.cross(dd, [0, 1, 0]));
      pts.push(vec.add(onScalp(dd, lift), vec.scl(side, Math.sin(t * Math.PI * 2.2) * wav * 0.03)));
    }
    guides.push({ pts, w0: 0.02 + rnd() * 0.016, w1: 0.013, nrm, tone: 0.75 + rnd() * 0.4, tilt: 0.35 });
  }
  // (b) melena suelta: de detrás de las orejas y de la nuca; cae ondulada hasta el cuello y los
  // hombros, abriéndose sobre el cuello alto y la capucha
  for (let i = 0; i < 130; i++) {
    const side = rnd() < 0.5 ? -1 : 1;
    const phi = side * (1.42 + rnd() * 1.7);
    const th = (Math.PI / 180) * (84 + rnd() * 34);
    const r0 = onScalp(sph(phi, th), 0.006);
    const out = vec.nrm([r0[0], 0, r0[2] - HC[2]]);
    const tan = [-out[2], 0, out[0]];
    const len = 0.13 + rnd() * 0.1 + (Math.abs(phi) > 2.4 ? 0.03 : 0);
    const ph = rnd() * 6.28, amp = 0.008 + rnd() * 0.01, ph2 = rnd() * 6.28;
    const pts = [r0];
    for (let k = 1; k <= 8; k++) {
      const t = k / 8;
      const yy = r0[1] - len * t;
      // pegada al cráneo al principio; después cae hacia atrás y se abre sobre el cuello
      const spread = 0.008 + t * 0.022 + (yy < 1.63 ? (1.63 - yy) * 0.38 : 0);
      const wave = Math.sin(t * 6.5 + ph) * amp * Math.min(1, t * 2);
      const wz = Math.cos(t * 5 + ph2) * amp * 0.6 * t;
      pts.push([r0[0] + out[0] * spread + tan[0] * wave, yy, r0[2] + out[2] * spread + tan[2] * wave - t * 0.016 + wz]);
    }
    guides.push({ pts, w0: 0.024 + rnd() * 0.016, w1: 0.01 + rnd() * 0.01, nrm, tone: 0.7 + rnd() * 0.4 });
  }
  // (c) mechones que enmarcan la cara: de la raya, por la sien y sobre la oreja (la tapan casi
  // entera) hasta la mandíbula, ondulados en S
  for (const sd of [1, -1]) {
    for (let j = 0; j < 10; j++) {
      const o = j / 9;
      const x0 = sd * (0.078 + o * 0.01), z0 = 0.03 - o * 0.045;
      const yEnd = 1.6 - rnd() * 0.035 + o * 0.012;
      const a = (0.006 + rnd() * 0.006) * sd;
      guides.push({
        pts: [
          onScalp(sph(sd * (0.3 + o * 0.55), 0.6 + o * 0.14), 0.013),
          onScalp(sph(sd * (0.95 + o * 0.4), 1.0 + o * 0.08), 0.014),
          [x0 + sd * 0.008, 1.705 - o * 0.008, z0 + 0.002],
          [x0 + sd * 0.014 + a, 1.668, z0 - 0.004],
          [x0 + sd * 0.01 - a, 1.636, z0 - 0.002],
          [x0 + sd * 0.018 + a, yEnd, z0 - 0.014],
        ],
        w0: 0.018 + rnd() * 0.008, w1: 0.008, nrm, tone: 0.8 + rnd() * 0.3,
      });
    }
  }
  // (d) hebras que caen sobre la frente (más del lado derecho, como en la lámina)
  for (let j = 0; j < 6; j++) {
    const sd = j < 4 ? -1 : 1;
    const o = (j % 4) * 0.011;
    const x1 = sd * (0.012 + o), endY = 1.728 + rnd() * 0.018;
    guides.push({
      pts: [onScalp(sph(sd * (0.1 + o * 4), 0.5), 0.012), [x1, 1.792, 0.088], [x1 + sd * 0.006, 1.762, 0.098], [x1 + sd * 0.01, endY, 0.096]],
      w0: 0.009 + rnd() * 0.005, w1: 0.003, nrm, tone: 0.95 + rnd() * 0.2, twist: 0.4,
    });
  }
  // (e) moño (vueltas cortas) y coleta corta
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const c = Math.cos(a), sn = Math.sin(a);
    guides.push({ pts: [[knot[0] + c * 0.016, knot[1] + sn * 0.014, knot[2] + 0.01], [knot[0] + c * 0.024, knot[1] + sn * 0.021, knot[2] - 0.006], [knot[0] + c * 0.014, knot[1] + sn * 0.013, knot[2] - 0.024]], w0: 0.026, w1: 0.02, nrm: () => vec.nrm([c, sn, -0.4]), tone: 0.8 + rnd() * 0.3 });
  }
  for (let i = 0; i < 16; i++) {
    const ox = (rnd() - 0.5) * 0.034, oz = (rnd() - 0.5) * 0.012;
    guides.push({ pts: [[knot[0] + ox * 0.5, knot[1] - 0.01, knot[2] - 0.02], [knot[0] + ox, knot[1] - 0.055, knot[2] - 0.042 + oz], [knot[0] + ox * 1.3, knot[1] - 0.115, knot[2] - 0.046 + oz], [knot[0] + ox * 1.2, knot[1] - 0.17 - rnd() * 0.04, knot[2] - 0.036 + oz]], w0: 0.02, w1: 0.009, nrm: (p) => vec.nrm([p[0] * 4, 0, -1]), tone: 0.75 + rnd() * 0.35, twist: 1 });
  }
  const strands = strandTexture(128, 512, 11);
  const hairMat = hairMaterial(strands, '#33271f');
  for (const [seg, lod] of HI ? [[12, 'hi'], [6, 'lo']] : [[6, 'lo']]) {
    const g = hairCardGeometry(guides, pos.head, seg);
    const m = new THREE.Mesh(g, hairMat);
    m.castShadow = true; m.receiveShadow = true;
    m.userData.lod = lod; m.userData.noMerge = true; m.userData.hair = true;
    meshes.push(m);
    if (lod === 'hi') trisHi += g.index.count / 3; else trisLo += g.index.count / 3;
  }
  // cinta de cuero del moño
  {
    const tie = new SdfScene({ k: 0.003 });
    tie.add({ min: [knot[0] - 0.04, knot[1] - 0.04, knot[2] - 0.04], max: [knot[0] + 0.04, knot[1] + 0.04, knot[2] + 0.04], d: (x, y, z) => Math.hypot(Math.hypot(x - knot[0], y - knot[1]) - 0.021, z - knot[2] + 0.004) - 0.0045 });
    lodPair(tie, () => belt(0.45), 0.0022, 0.005, null);
  }
  const tail = [];
  // proporción heroica: cabeza algo más pequeña (≈ 7,8 cabezas de altura), escalada desde el cuello
  const HS = 0.96;
  for (const m of meshes) {
    if (m.isMesh) m.geometry.scale(HS, HS, HS);
    else { m.position.multiplyScalar(HS); m.scale.setScalar(HS); }
  }
  return { meshes, eyes, tail, trisHi: HI ? trisHi : trisLo, trisLo };
}
