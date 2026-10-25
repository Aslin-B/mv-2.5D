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
import { hairStrandGeometry, hairStrandMaterial } from './hairStrands.js';

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
  hood: lin('#262230'), hoodDark: lin('#100e15'),
  vest: lin('#35273f'), vestDark: lin('#1b1322'),
  violet: lin('#4f3768'), violetDeep: lin('#291c37'),
  silver: lin('#a29fa8'), silverDark: lin('#55525b'),
  metal: lin('#4a4850'), metalDark: lin('#24232a'),
  belt: lin('#43302a'), beltDark: lin('#251a16'),
  trousers: lin('#262428'), trousersDark: lin('#17161a'),
  boot: lin('#2e2420'), bootDark: lin('#171210'),
  glove: lin('#221f23'), gloveDark: lin('#141215'),
  shirt: lin('#1b1a20'),
  skin: lin('#8f7466'), skinRed: lin('#8e6052'), skinDark: lin('#634d44'), skinLight: lin('#a88a7c'),
  lip: lin('#6e4840'), nail: lin('#c79f8c'),
  hair: lin('#2c221c'), hairLight: lin('#5a473b'), beard: lin('#2a2019'),
  glow: [0.62, 0.3, 1.25], glowSoft: [0.3, 0.12, 0.6],
};
export const MAGE_GLOW = new THREE.Color(1.3, 0.55, 2.8);

const S_ = (c, r, m, p, w = 0.5) => ({ c, r, m, p, w });
// cuero del abrigo repujado con volutas (escala del adorno en el canal w: celdas por metro / 1000)
const leather = (k = 0, orn = 0.034) => S_(mixc(C.coat, C.coatDark, clamp(k, 0, 1)), 0.8, 0, orn ? PATTERN.embossed : PATTERN.leather, orn || 0.65);
const silver = (k = 0) => S_(mixc(C.silver, C.silverDark, clamp(k, 0, 1)), 0.44, 1, PATTERN.metal, 0.55);
// metal oscuro grabado con hilo de plata incrustado
const metal = (k = 0, orn = 0.07) => S_(mixc(C.metal, C.metalDark, clamp(k, 0, 1)), 0.6, 1, orn ? PATTERN.ornate : PATTERN.metal, orn || 0.75);
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

const MAGE_PROPORTIONS = { shoulderX: 0.19, chestW: 1.04, armBulk: 1.0, legBulk: 1.04, waist: 0.95 };

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
  // Pliegues de la ropa (milímetros, en la pose de enlace): el cuero se frunce bajo el cinturón y en
  // las axilas, las mangas se arrugan en el codo y se amontonan sobre los brazales, y las calzas
  // forman pliegues detrás de la rodilla y sobre la caña de las botas.
  const segD = (p, a, b) => {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    const t = clamp((ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2), 0, 1);
    return [Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t), t];
  };
  body.displace = (x, y, z) => {
    const p = [x, y, z], ax = Math.abs(x), L = x > 0 ? 'L' : 'R';
    const n = noise3(x, y, z, 22), n2 = noise3(x, y, z, 70);
    let h = 0;
    const [dArm, tA] = segD(p, pos['arm' + L], pos['fore' + L]);
    const [dFore, tF] = segD(p, pos['fore' + L], pos['hand' + L]);
    const onArm = Math.min(dArm, dFore) < 0.075 && ax > 0.17;
    if (onArm) {
      // codo: pliegues en anillo inclinados; antebrazo: tela amontonada sobre el brazal
      const e = dArm < dFore ? tA - 1 : tF;
      const elbow = Math.exp(-((e / 0.18) ** 2));
      h += elbow * 0.0024 * Math.sin((e * 0.27 + n * 0.012) * 520 + x * 40);
      h += (dArm < dFore ? 1 : 0) * 0.0009 * Math.sin(y * 210 + z * 120 + n * 6) * smoothstep(0.2, 0.6, tA);
      return h;
    }
    if (y > 0.88 && y < 1.5 && ax < 0.2) {
      // fruncido horizontal junto al cinturón y pliegues en diagonal desde las axilas
      const belt = Math.exp(-(((y - 1.012) / 0.07) ** 2));
      h += belt * 0.0016 * Math.sin(y * 480 + n * 9) * (0.6 + n2 * 0.6);
      const pit = smoothstep(0.08, 0.15, ax) * Math.exp(-(((y - 1.3) / 0.09) ** 2));
      h += pit * 0.0018 * Math.sin((y + ax * 0.9) * 260 + n * 5);
      return h;
    }
    if (y < 0.95) {
      const K = pos['shin' + L];
      const knee = Math.exp(-(((y - K[1]) / 0.06) ** 2)) * smoothstep(0.0, -0.04, z - K[2]);
      h += knee * 0.002 * Math.sin(y * 330 + n * 6);
      const cuff = Math.exp(-(((y - (K[1] - 0.06)) / 0.04) ** 2));
      h += cuff * 0.0018 * Math.sin(y * 300 + Math.atan2(x - K[0], z - K[2]) * 3 + n * 6);
      h += 0.0008 * Math.sin(y * 90 + n * 7) * smoothstep(0.45, 0.6, y);
      // arrugas del cuero de la bota sobre el tobillo
      h += 0.0011 * Math.sin(y * 260 + n * 4) * smoothstep(0.08, 0.1, y) * smoothstep(0.18, 0.15, y);
    }
    return h;
  };
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
      // camisa oscura de cuello alto: por delante sube hasta media garganta
      if (y > (z > 0.0 ? 1.535 : 1.5)) return skinPaint(x, y, z, 0.15 + n * 0.2);
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
    // espalda: paño central de brocado violeta desde la capucha hasta el cinturón, más ancho arriba,
    // con filete de plata a los lados (como la espalda de la lámina)
    if (z < -0.05 && y > 1.03 && y < 1.4) {
      const pw = 0.032 + (y - 1.03) * 0.12;
      if (ax < pw - 0.004) return vestC(0.15 + n * 0.35, 0.1);
      if (ax < pw) return silver(0.35 + n * 0.3);
    }
    // costura central de la espalda y pinzas
    if (z < -0.06 && ax < 0.004 && y < 1.4) k += 0.45;
    return leather(k);
  };

  const skinPaint = (x, y, z, k) => S_(mixc(C.skin, C.skinDark, k), 0.5, 0, PATTERN.skin, 0.3);
  const bootPaint = (x, y, z, n) => {
    const scuff = smoothstep(0.7, 0.9, noise3(x, y, z, 30)) * 0.5;
    if (y < 0.03) return S_(mulc(C.bootDark, 0.8), 0.7, 0, PATTERN.leather, 0.8);
    // costura trasera y pespunte del empeine; arrugas del tobillo más oscuras en el fondo
    const seam = (z < -0.02 && Math.abs(Math.abs(x) - 0.1) < 0.0035) || (y < 0.11 && y > 0.1 && z > 0.0);
    const crease = y > 0.09 && y < 0.17 ? Math.max(0, Math.sin(y * 260 + n * 4)) * 0.35 : 0;
    const k = 0.25 + n * 0.35 + (seam ? 0.35 : 0) + crease;
    return S_(mixc(mixc(C.boot, C.bootDark, clamp(k, 0, 1)), lin('#5b4a40'), scuff * 0.4), 0.62 - scuff * 0.1, 0, PATTERN.leather, 0.75);
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
  // Cuello de cuero rígido que se levanta detrás de la nuca hasta la altura de las orejas y se abre
  // hacia fuera como un embudo; por delante baja y queda abierto (se ve la garganta). Forro violeta
  // por dentro y filete de plata en el canto.
  {
    const s = new SdfScene({ k: 0.004 });
    const zc = -0.026, y0 = 1.44, y1 = 1.675;
    const Rr = (y) => 0.075 + (y - y0) * 0.15;
    s.add({ mat: 'collar', min: [-0.16, y0 - 0.01, -0.17], max: [0.16, y1 + 0.01, 0.13],
      d: (x, y, z) => (Math.abs(Math.hypot(x / 1.1, z - zc) - Rr(y)) - 0.0048) * 0.9 });
    // canto superior: alto en la nuca y bajando hacia la abertura delantera
    const top = (x, z) => y1 - 0.105 * smoothstep(1.0, 2.5, Math.atan2(Math.abs(x), zc - z));
    s.clip = (x, y, z) => {
      const ax = Math.abs(x);
      const open = z > 0.0 ? (0.026 + (y - 1.45) * 0.32) - ax : -1;
      return Math.max(y0 - y, y - top(x, z), open);
    };
    // pliegue suave del cuero donde el cuello se dobla
    s.displace = (x, y, z) => 0.0012 * Math.sin(Math.atan2(x, zc - z) * 7 + y * 30) * smoothstep(1.5, 1.6, y);
    const paint = (x, y, z) => {
      const rho = Math.hypot(x / 1.1, z - zc);
      const inner = rho < Rr(y);
      const n = noise3(x, y, z, 50);
      if (y > top(x, z) - 0.005) return silver(0.55 + n * 0.25);
      if (inner) return lining(0.2 + n * 0.3);
      return leather(0.3 + n * 0.25, 0.05);
    };
    piece('chest', s, paint, 0.0034, 'collar');
  }
  // ---------- Solapas del abrigo ----------
  // Paño vuelto a cada lado de la abertura delantera, ancho en el pecho y estrecho en el talle, con
  // grosor propio (proyecta sombra sobre el chaleco) y el canto ribeteado de plata.
  {
    const lapW = (y) => 0.014 + smoothstep(1.02, 1.42, y) * 0.04;
    const s = new SdfScene({ k: 0.003 });
    s.add(layer(0.0075, 0.0032, { mat: 'lapel' }));
    s.clip = (x, y, z) => {
      const ax = Math.abs(x), w = openW(y);
      return Math.max(0.03 - z, 1.02 - y, y - 1.465, w - 0.004 - ax, ax - (w + lapW(y)));
    };
    // el canto exterior se levanta y el paño se ondula un poco (cuero grueso doblado)
    s.displace = (x, y) => {
      const ax = Math.abs(x), u = (ax - openW(y)) / lapW(y);
      return 0.0022 * smoothstep(0.55, 1, u) + 0.0012 * smoothstep(0.25, 0, u) + 0.0006 * Math.sin(y * 90 + ax * 60);
    };
    const paint = (x, y, z) => {
      const ax = Math.abs(x), w = openW(y), u = (ax - w) / lapW(y);
      const n = noise3(x, y, z, 50);
      if (u < 0.09 || u > 0.92) return silver(0.25 + n * 0.3);
      if (u > 0.16 && u < 0.84) return leather(0.15 + n * 0.3, 0.06);
      return leather(0.45 + n * 0.2, 0);
    };
    piece('chest', s, paint, 0.0034, 'lapel');
  }
  // ---------- Capucha caída sobre los hombros ----------
  // Cuello vuelto de tela gruesa alrededor de la nuca y la capucha vacía colgando sobre la espalda,
  // pegada al cuerpo, con un pliegue central y el borde de forro violeta.
  {
    const s = new SdfScene({ k: 0.014, subK: 0.008 });
    // rollo continuo de tela alrededor de la base del cuello: grueso en la nuca, se afina y baja
    // hacia las clavículas (sin cerrarse delante, donde queda la garganta)
    const zc = -0.035;
    s.add({
      mat: 'hood', min: [-0.21, 1.37, -0.22], max: [0.21, 1.56, 0.12],
      d: (x, y, z) => {
        const th = Math.atan2(x, zc - z), at = Math.abs(th);
        const taper = smoothstep(2.3, 1.4, at);
        const Rc = 0.13 - 0.016 * smoothstep(1.4, 2.3, at);
        const Yc = 1.47 + 0.014 * Math.cos(th) - 0.05 * smoothstep(1.4, 2.3, at);
        const a = 0.011 + 0.032 * taper, b = 0.016 + 0.034 * taper;
        const rho = Math.hypot(x / 1.06, z - zc);
        const e = (Math.hypot((rho - Rc) / a, (y - Yc) / b) - 1) * Math.min(a, b);
        return Math.max(e, (at - 2.32) * rho);
      },
    });
    const zb = surfZb(0, 1.33);
    // la capucha vacía: un saco de tela que cae hasta media espalda, más ancho arriba
    s.add(ellipsoid([0, 1.375, zb - 0.03], [0.118, 0.11, 0.036], { mat: 'hood' }));
    s.add(ellipsoid([0, 1.29, zb - 0.022], [0.075, 0.07, 0.026], { mat: 'hood' }));
    s.add(roundCone([0, 1.44, zb - 0.036], [0, 1.23, zb - 0.02], 0.05, 0.018, { mat: 'hood' }));
    s.carve(roundCone([0, 1.4, -0.05], [0, 1.62, -0.03], 0.075, 0.07));
    s.displace = (x, y, z) => {
      // pliegues: ondas que bajan desde el cuello y arrugas sueltas
      const a = Math.atan2(x, -z);
      return 0.005 * Math.sin(a * 6 + y * 18) * smoothstep(1.3, 1.45, y) + 0.0045 * Math.sin(x * 62 + y * 25 + Math.sin(y * 40) * 0.8) * smoothstep(1.42, 1.28, y)
        + (noise3(x, y, z, 35) - 0.5) * 0.005;
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
  // Láminas concéntricas alrededor de la articulación del hombro, como una hombrera articulada: la
  // superior (cubrehombro) cubre la parte alta del deltoides y tres bandas más estrechas bajan por el
  // brazo solapándose como tejas; cada banda tiene el filo de plata levantado y el campo grabado.
  for (const [k, L] of [[1, 'L'], [-1, 'R']]) {
    const J = pos['arm' + L];
    const C0 = vec.add(J, [0.006 * k, -0.004, -0.004]);
    // ángulo de inclinación desde la vertical, medido en el plano frontal hacia fuera
    const tilt = (x, y) => Math.atan2(k * (x - C0[0]), y - C0[1]);
    const bands = [[-0.55, 0.62], [0.5, 0.95], [0.84, 1.24]];
    bands.forEach(([a0, a1], i) => {
      const s = new SdfScene({ k: 0.003 });
      const R = 0.066 + i * 0.004;
      s.add(ellipsoidShell(C0, [R, R * 0.92, R * 1.08], 0.005, { mat: 'plate' }));
      // por dentro no pasa del cuello; por delante y por detrás se recorta en curva
      s.clip = (x, y, z) => {
        const t = tilt(x, y);
        return Math.max(a0 - t, t - a1, (i === 0 ? -0.03 : -0.005) - k * (x - C0[0]) * (i === 0 ? 1 : 0), Math.abs(z - C0[2]) - R * (0.98 - i * 0.06));
      };
      const paint = (x, y, z) => {
        const t = tilt(x, y);
        const e = Math.min(t - a0, a1 - t) * R;
        const n = noise3(x, y, z, 30);
        if (e < 0.0042 || Math.abs(Math.abs(z - C0[2]) - R * (0.98 - i * 0.06)) < 0.004) return silver(0.3 + n * 0.3);
        if (e < 0.009) return metal(0.6, 0);
        return metal(0.3 + n * 0.35, 0.12);
      };
      // filo levantado del borde inferior de cada banda
      s.displace = (x, y, z) => {
        const t = tilt(x, y);
        return 0.0018 * smoothstep(0.012, 0.0, (a1 - t) * R);
      };
      piece(i === 0 ? 'clav' + L : 'arm' + L, s, paint, 0.0042, 'pauldron' + L, { loCell: 0.0105 });
    });
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
      // rodillera articulada: copa abombada de metal grabado con ala exterior, una lama encima y dos
      // debajo que bajan sobre la caña de la bota; filos de plata y remaches
      const s = new SdfScene({ k: 0.004 });
      const cup = vec.add(K, [0.003 * k, 0.006, 0.034]);
      s.add(ellipsoidShell(cup, [0.054, 0.062, 0.04], 0.0055, { mat: 'plate' }));
      s.add(ellipsoidShell(vec.add(K, [0.026 * k, 0.0, 0.016]), [0.03, 0.05, 0.036], 0.005, { mat: 'wing' }));
      s.add(ellipsoidShell(vec.add(K, [0.002 * k, 0.07, 0.03]), [0.05, 0.026, 0.034], 0.0045, { mat: 'lame' }));
      s.add(ellipsoidShell(vec.add(K, [0.002 * k, -0.062, 0.03]), [0.046, 0.03, 0.032], 0.0045, { mat: 'lame' }));
      s.add(ellipsoidShell(vec.add(K, [0.002 * k, -0.1, 0.026]), [0.042, 0.026, 0.03], 0.0045, { mat: 'lame' }));
      s.clip = (x, y, z) => K[2] + 0.012 - z;
      s.displace = (x, y, z) => {
        // costilla central en la copa y filos levantados
        const ax = Math.abs(x - cup[0]);
        return 0.0014 * smoothstep(0.006, 0.0, ax) * smoothstep(K[1] - 0.05, K[1] - 0.02, y) * smoothstep(K[1] + 0.06, K[1] + 0.03, y);
      };
      const paint = (x, y, z, prim) => {
        const n = noise3(x, y, z, 30);
        if (z < K[2] + 0.02) return silver(0.45);
        const r = Math.hypot(x - cup[0], (y - cup[1]) * 0.86);
        if (prim.mat === 'lame' || prim.mat === 'wing') {
          if (z < K[2] + 0.028) return silver(0.35);
          return metal(0.45 + n * 0.3, 0.1);
        }
        if (r > 0.047) return silver(0.3 + n * 0.3);
        if (Math.abs(r - 0.041) < 0.0032 && Math.sin(Math.atan2(y - cup[1], x - cup[0]) * 7) > 0.8) return silver(0.15);
        return metal(0.3 + n * 0.35, 0.13);
      };
      piece('shin' + L, s, paint, 0.0036, 'knee' + L);
    }
    {
      // correas de la caña: tres vueltas con hebilla de plata en el lado exterior
      const s = new SdfScene({ k: 0.003 });
      const straps = [K[1] - 0.15, K[1] - 0.24, K[1] - 0.33];
      // cada correa sigue la superficie de la caña (a 3 mm), y la hebilla se apoya en su cara exterior
      const shaft = { min: [K[0] - 0.09, straps[2] - 0.03, K[2] - 0.1], max: [K[0] + 0.09, straps[0] + 0.03, K[2] + 0.1], mat: 'strap',
        d: (x, y, z) => Math.abs(body.eval(x, y, z) - 0.0032) - 0.0026 };
      s.add(shaft);
      for (const yb of straps) {
        let xo = K[0] + 0.03 * k;
        while (Math.abs(xo - K[0]) < 0.12 && body.eval(xo, yb, K[2] - 0.006) < 0) xo += 0.001 * k;
        s.add(roundBox([xo + 0.004 * k, yb, K[2] - 0.006], [0.003, 0.0105, 0.0085], 0.0018, { mat: 'buckle' }));
      }
      s.clip = (x, y) => Math.min(...straps.map((yb) => Math.abs(y - yb) - 0.0085));
      const paint = (x, y, z, prim) => {
        if (prim.mat === 'buckle') return silver(0.2);
        return belt(0.35 + noise3(x, y, z, 60) * 0.3);
      };
      piece('shin' + L, s, paint, 0.003, 'bootStrap' + L);
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
    front: { L: local(ring(1.7, 0.4), 'hips'), R: local(ring(-0.4, -1.7), 'hips') },
    back: { L: local(ring(3.06, 1.66), 'hips'), R: local(ring(-1.66, -3.06), 'hips') },
  };
  // Telas de los faldones (juego y estudio): hasta media caña, como en la lámina; los delanteros se
  // abren en V invertida desde el cinturón y dejan ver las piernas y el forro.
  const coatBase = { cols: 9, rows: 16, flare: 0.45, gather: 1.5, palette: MAGE_COAT, bone: 'hips', drag: 0.88, air: 0.014 };
  const coatCloth = {
    front: { ...coatBase, length: 0.8, anchors: coatAnchors.front, outward: -0.03, open: 0.3 },
    back: { ...coatBase, length: 0.84, anchors: coatAnchors.back, outward: 0.03, liningFlip: true },
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
    sword: foci.R, foci, clavija, coatAnchors, coatCloth, brooch,
    fingerRig: S.fingerRig,
    materials: [mat, rigidMat], glowMat,
    triangles: tris, trianglesHi: tris + trisHi, breakdown, setDetail, merged,
  };
}

// Tela del abrigo (faldones): exterior de cuero carbón con bordado plateado, forro violeta.
export const MAGE_COAT = { base: '#29262c', hem: '#151317', line: '#b3b0b8', lining: '#45305a', style: 'coat' };

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

// Textura del iris en coordenadas (ángulo, radio): fila 0 = centro (pupila), última fila = limbo.
function irisTexture() {
  const W = 256, H = 64;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  let sd = 3;
  const rnd = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; };
  const fib = Array.from({ length: W }, () => 0.75 + rnd() * 0.5);
  for (let i = 0; i < 3; i++) for (let x = 0; x < W; x++) fib[x] = (fib[x] + fib[(x + 1) % W] + fib[(x + W - 1) % W]) / 3 * 0.6 + fib[x] * 0.4;
  const lerp3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const r = y / (H - 1);
    let col = r < 0.38 ? lerp3([118, 86, 50], [112, 112, 92], smoothstep(0.22, 0.38, r)) : lerp3([112, 112, 92], [74, 80, 72], smoothstep(0.38, 0.85, r));
    const f = fib[x] * (0.85 + 0.3 * Math.sin(x * 0.9 + r * 7) * 0.3);
    col = col.map((v) => v * f);
    col = lerp3(col, [34, 34, 30], smoothstep(0.82, 0.97, r));           // anillo límbico
    col = lerp3(col, [40, 30, 22], smoothstep(0.12, 0.0, r - 0.18) * 0.5); // borde de la pupila
    const i = (y * W + x) * 4;
    img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
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
    ellipsoid([0, 1.745, -0.022], [0.0745, 0.095, 0.09], skin),    // cráneo
    ellipsoid([0, 1.708, -0.058], [0.062, 0.066, 0.05], skin),     // nuca
    ellipsoid([0, 1.744, 0.021], [0.061, 0.062, 0.0695], skin),    // frente
    ellipsoid([0, 1.686, 0.03], [0.0655, 0.034, 0.055], skin),      // órbitas y pómulos
    ellipsoid([0, 1.655, 0.041], [0.051, 0.04, 0.051], skin),      // maxilar
    ellipsoid([0, 1.63, 0.0555], [0.0305, 0.028, 0.035], skin),    // morro de la boca
    ellipsoid([0, 1.598, 0.0745], [0.021, 0.0172, 0.0168], { mat: 'jaw' }),  // mentón
    ellipsoid([0, 1.616, 0.022], [0.04, 0.02, 0.05], { mat: 'jaw' }),        // suelo de la mandíbula
    roundCone([0, 1.5, -0.026], [0, 1.635, -0.03], 0.05, 0.046, { ...skin, blend: 0.009 }),     // cuello
  ];
  for (const s of [1, -1]) {
    baseParts.push(roundCone([0.0515 * s, 1.676, -0.024], [0.0458 * s, 1.623, -0.008], 0.0098, 0.0105, { mat: 'jaw' }));
    baseParts.push(roundCone([0.0458 * s, 1.623, -0.008], [0.019 * s, 1.5975, 0.064], 0.0105, 0.0102, { mat: 'jaw' }));
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
  // ojos: la piel envuelve el globo (párpados) y una hendidura almendrada deja ver el ojo; el
  // ángulo externo queda algo más alto que el interno. El globo va hundido bajo el arco
  // superciliar: una regla del arco al pómulo apenas roza la córnea.
  const eyeZ = 0.0675, eyeR = 0.0117;
  const slits = [];
  for (const s of [1, -1]) {
    head.add(ellipsoid([0.032 * s, 1.6925, eyeZ], [eyeR + 0.0012, eyeR + 0.0012, eyeR + 0.0013], { mat: 'lid', blend: 0.0032 }));
    const t = 0.085 * s;
    slits.push(head.carve(orientedEllipsoid([0.0325 * s, 1.6906, eyeZ + eyeR - 0.002],
      [[Math.cos(t), Math.sin(t), 0], [-Math.sin(t), Math.cos(t), 0], [0, 0, 1]], [0.0152, 0.0039, 0.0092], { blend: 0.001 })));
  }
  // nariz: dorso estrecho y recto, punta definida, aletas, columela y fosas (abiertas hacia abajo)
  const zN0 = fz(0, 1.703) + 0.0018, zTip = fz(0, 1.66) + 0.019;
  head.add(roundCone([0, 1.7035, zN0 - 0.0056], [0, 1.6668, zTip - 0.0072], 0.0054, 0.0068, { mat: 'nose', blend: 0.0032 }));
  head.add(ellipsoid([0, 1.6605, zTip - 0.0082], [0.0066, 0.007, 0.0076], { mat: 'nose', blend: 0.0024 }));
  head.add(ellipsoid([0, 1.6522, zTip - 0.0112], [0.0038, 0.0032, 0.0056], { mat: 'nose', blend: 0.0022 }));
  for (const s of [1, -1]) {
    head.add(ellipsoid([0.0105 * s, 1.6552, zTip - 0.0178], [0.0054, 0.0052, 0.0066], { mat: 'nose', blend: 0.0022 }));
    head.carve(ellipsoid([0.0058 * s, 1.6482, zTip - 0.0142], [0.0027, 0.0011, 0.0036], { blend: 0.001 }));
  }
  // boca: labio superior fino con arco de Cupido, inferior más lleno, comisuras hundidas
  const zUL = fz(0, 1.6316) + 0.0016, zLL = fz(0, 1.6222) + 0.0016;
  head.add(ellipsoid([0, 1.6314, zUL - 0.0062], [0.0172, 0.0042, 0.0062], { mat: 'lip', blend: 0.0022 }));
  head.add(ellipsoid([0, 1.6224, zLL - 0.0068], [0.0125, 0.0052, 0.0068], { mat: 'lip', blend: 0.0022 }));
  for (const s of [1, -1]) head.add(ellipsoid([0.008 * s, 1.6232, zLL - 0.0072], [0.0105, 0.0042, 0.0062], { mat: 'lip', blend: 0.0022 }));
  for (const s of [1, -1]) {
    head.add(ellipsoid([0.0045 * s, 1.6345, zUL - 0.0042], [0.0056, 0.003, 0.0045], { mat: 'lip', blend: 0.0014 }));
    head.add(roundCone([0.0038 * s, 1.6455, fz(0.004, 1.6455) - 0.001], [0.0043 * s, 1.6358, fz(0.004, 1.6358) - 0.001], 0.0016, 0.0018, { mat: 'skin', blend: 0.002 }));
    head.carve(ellipsoid([0.0202 * s, 1.6272, fz(0.0202, 1.6272) + 0.0012], [0.002, 0.0016, 0.0036], { blend: 0.0016 }));
  }
  // orejas: pabellón casi plano contra el cráneo, con el borde trasero más separado; hélice en el
  // contorno, concha poco profunda (sin perforar), trago y lóbulo
  for (const s of [1, -1]) {
    const a = 0.32;                                    // apertura del pabellón respecto al cráneo
    const nx = Math.cos(a) * s, nz = -Math.sin(a);     // normal exterior del pabellón
    const ux = Math.sin(a) * s, uz = Math.cos(a);      // eje hacia la cara, en el plano del pabellón
    const ec = [0.0705 * s, 1.684, -0.019];
    const P = (u, v, n = 0) => [ec[0] + ux * u + nx * n, ec[1] + v, ec[2] + uz * u + nz * n];
    head.add(orientedEllipsoid(P(0, 0, 0.002), [[nx, 0, nz], [0, 1, 0], [ux, 0, uz]], [0.0042, 0.028, 0.0165], { mat: 'ear', blend: 0.0035 }));
    // hélice: borde enrollado desde la raíz (arriba, delante) por detrás hasta el lóbulo
    const rim = [];
    for (let i = 0; i <= 9; i++) {
      const th = -0.35 + (i / 9) * 3.3;
      rim.push(P(Math.cos(th + Math.PI / 2) * 0.0148 + 0.001, Math.sin(th + Math.PI / 2) * 0.0262, 0.0048));
    }
    for (let i = 0; i < rim.length - 1; i++) head.add(roundCone(rim[i], rim[i + 1], 0.0027, 0.0027, { mat: 'ear', blend: 0.0016 }));
    head.add(ellipsoid(P(0.002, -0.0255, 0.0028), [0.0055, 0.0065, 0.0072], { mat: 'ear', blend: 0.002 }));   // lóbulo
    head.add(ellipsoid(P(0.0125, -0.006, 0.0042), [0.0028, 0.004, 0.0026], { mat: 'ear', blend: 0.0015 }));  // trago
    head.carve(orientedEllipsoid(P(0.0035, -0.004, 0.0078), [[nx, 0, nz], [0, 1, 0], [ux, 0, uz]], [0.0045, 0.0105, 0.0072], { blend: 0.0016 }));  // concha
    head.carve(orientedEllipsoid(P(-0.002, 0.012, 0.0072), [[nx, 0, nz], [0, 1, 0], [ux, 0, uz]], [0.0028, 0.0085, 0.0055], { blend: 0.0012 }));  // fosa triangular
  }
  head.add(ellipsoid([0, 1.587, 0.0255], [0.0068, 0.011, 0.0068], skin)); // nuez

  // Barba corta y recortada: bigote unido a la perilla y línea de la mandíbula; mejillas con sombra
  // de barba (pintada). El relieve es un desplazamiento de unos milímetros, no un volumen aparte.
  const cheekLine = (ax) => 1.631 + 0.056 * Math.pow(smoothstep(0.019, 0.07, ax), 0.75);
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
    return Math.max(goatee, must, 0.62);
  };
  const browMask = (x, y, z) => {
    const ax = Math.abs(x);
    if (z < 0.05 || ax < 0.006 || ax > 0.063) return 0;
    // ceja recta y poblada junto a la nariz, se afina y baja hacia la sien
    const yb = 1.7105 + 0.0028 * Math.exp(-(((ax - 0.034) / 0.014) ** 2)) - Math.max(0, ax - 0.048) * 0.28;
    const th = 0.0074 - (ax - 0.008) * 0.065;
    const e = Math.abs(y - yb) / Math.max(th, 0.0014);
    return (1 - smoothstep(0.5, 1.05, e)) * smoothstep(0.007, 0.012, ax);
  };
  // Relieve anatómico como desplazamiento suave de la base (milímetros): arco superciliar continuo
  // que sobresale sobre el ojo, surco del párpado superior bajo la ceja, sienes, pómulos y su arco,
  // mejilla hundida bajo el pómulo, pliegue nasogeniano, surco mentolabial y mentón.
  const G = (x, y, cx, cy, sx, sy) => Math.exp(-(((x - cx) / sx) ** 2) - (((y - cy) / sy) ** 2));
  const relief = (x, y, z) => {
    const ax = Math.abs(x);
    const wF = smoothstep(0.03, 0.062, z), wS = smoothstep(-0.02, 0.03, z);
    let h = 0;
    h += (0.0058 * G(ax, y, 0.021, 1.7128, 0.022, 0.0062) + 0.0034 * G(ax, y, 0.047, 1.7105, 0.013, 0.0058) + 0.002 * G(ax, y, 0, 1.7115, 0.008, 0.0068)) * wF;
    h -= 0.0032 * G(ax, y, 0.033, 1.7022, 0.0125, 0.0032) * wF;     // surco del párpado superior
    h -= 0.0008 * G(ax, y, 0.061, 1.724, 0.011, 0.015) * wS;        // sienes
    h += 0.0026 * G(ax, y, 0.058, 1.668, 0.018, 0.0075) * wS;   // pómulo
    h += 0.0016 * G(ax, y, 0.064, 1.6815, 0.009, 0.0065) * wS;       // arco cigomático
    h -= 0.0034 * G(ax, y, 0.049, 1.643, 0.013, 0.016) * wS;         // mejilla hundida
    // surco nasogeniano: del ala de la nariz a fuera de la comisura, con el carrillo algo abultado
    {
      const ux = 0.0285 - 0.0175, uy = 1.618 - 1.656, ll = ux * ux + uy * uy;
      const t = clamp(((ax - 0.0175) * ux + (y - 1.656) * uy) / ll, 0, 1);
      const dd = Math.hypot(ax - 0.0175 - ux * t, y - 1.656 - uy * t);
      const side = (ax - 0.0175 - ux * t) * -uy + (y - 1.656 - uy * t) * ux;   // > 0 hacia el carrillo
      h += (-0.0011 * Math.exp(-((dd / 0.0022) ** 2)) + 0.0007 * Math.exp(-(((dd - 0.004) / 0.003) ** 2)) * (side > 0 ? 1 : 0)) * wF * Math.sin(Math.PI * Math.min(1, t * 1.15));
    }
    h += 0.0011 * G(ax, y, 0.031, 1.646, 0.0065, 0.012) * wF;        // carrillo junto al surco nasogeniano
    h -= 0.0015 * G(ax, y, 0, 1.6135, 0.012, 0.0028) * wF;           // surco mentolabial
    h += 0.0019 * G(ax, y, 0, 1.6, 0.0135, 0.0095) * wF;             // mentón
    h += 0.0012 * G(ax, y, 0.044, 1.612, 0.012, 0.007) * smoothstep(-0.03, 0.01, z);   // borde de la mandíbula
    return h;
  };
  head.displace = (x, y, z) => {
    const b = beardMask(x, y, z);
    const br = browMask(x, y, z);
    // el vello corto apenas levanta la piel (bigote y perilla algo más)
    return relief(x, y, z) + b * (beardThick(x, y, z) > 0.9 ? 0.0007 : 0.0003) + br * 0.0005;
  };
  head.relax = 1;
  const headPaint = (x, y, z, prim) => {
    const ax = Math.abs(x);
    const n = noise3(x, y, z, 120);
    const n2 = noise3(x, y, z, 420);
    const n3 = noise3(x, y, z, 1400);
    // tez morena olivácea: frente algo más clara y amarilla, rubor en mejillas, nariz y orejas,
    // sombra violácea bajo los ojos
    let c = mixc(C.skin, C.skinDark, 0.06 + n * 0.18);
    c = mixc(c, C.skinLight, 0.18 * smoothstep(1.7, 1.75, y) * smoothstep(0.04, 0.07, z));
    if (prim.mat === 'cheek' || (prim.mat === 'nose' && y > 1.67)) c = mixc(c, C.skinLight, 0.12);
    const red = Math.max(
      Math.exp(-((ax - 0.045) ** 2 + (y - 1.666) ** 2 + (z - 0.066) ** 2) / 0.00035),
      prim.mat === 'nose' && y < 1.668 ? 0.5 : 0, prim.mat === 'ear' ? 0.65 : 0);
    c = mixc(c, C.skinRed, red * 0.28);
    // poros y pecas finas
    c = mulc(c, 0.94 + n2 * 0.07 + n3 * 0.05);
    let r = 0.6, p = PATTERN.skin, hair = 0;
    // zona T algo más brillante
    if (ax < 0.02 && y > 1.65 && z > 0.06) r = 0.5;
    const isLip = prim.mat === 'lip' && (ax / 0.0205) ** 2 + ((y - 1.6268) / 0.0078) ** 2 < 1.05;
    // línea de la boca (pintada: la escultura mantiene los labios cerrados)
    if (isLip && Math.abs(y - 1.6271 + (ax / 0.02) ** 2 * 0.001) < 0.0007) { c = mulc(C.lip, 0.38); r = 0.6; }
    else if (isLip) { c = mulc(mixc(mixc(C.lip, C.skin, 0.45), C.skinDark, 0.12 + n * 0.2), y > 1.6272 ? 0.78 : 0.95); r = 0.5; }
    // cuencas: sombra del párpado y ojeras suaves
    const eyeD = Math.hypot((ax - 0.032) / 0.022, (y - 1.69) / 0.016);
    if (z > 0.055 && eyeD < 1.3) c = mixc(c, mixc(C.skinDark, [0.07, 0.045, 0.05], 0.3), (1.3 - eyeD) * 0.32);
    if (prim.mat === 'lid') { c = mixc(c, C.skinRed, 0.1); r = 0.38; }
    // pestañas: borde del párpado superior oscuro y más denso hacia el ángulo externo; el inferior,
    // una línea fina
    if (z > 0.068 && ax > 0.012 && ax < 0.05) {
      let sd = 1;
      for (const sl of slits) sd = Math.min(sd, Math.abs(sl.d(x, y, z)));
      if (sd < 0.0017) {
        const up = y > 1.6906 + (ax - 0.0325) * 0.085;
        const k = (1 - sd / 0.0017) * (up ? 1 : 0.4);
        c = mixc(c, mulc(C.beard, 0.45), k);
        if (up && k > 0.5) r = 0.7;
      }
    }
    // raíces junto a la línea de nacimiento: la piel se oscurece hacia el pelo (borde suave)
    const root = smoothstep(-0.006, 0.001, y - hairlineY(x, z)) * (z > -0.03 || y > 1.7 ? 1 : 0);
    if (root > 0) { c = mixc(c, mulc(C.hair, 0.9), root * 0.35); hair = Math.max(hair, root * 0.9); }
    // cejas: vello denso (trazos en el sombreador) sobre una sombra suave
    const bw = clamp(browMask(x, y, z) * (0.75 + n3 * 0.4), 0, 1);
    if (bw > 0.02) { c = mixc(c, mulc(C.skinDark, 0.55), bw * 0.6); hair = Math.max(hair, bw); }
    // barba de pocos días: densidad irregular, plena en bigote y perilla; la piel bajo el vello toma
    // un tono gris azulado (sombra de barba) y los pelos los dibuja el sombreador
    const b = isLip ? 0 : beardMask(x, y, z);
    const shadowZone = isLip ? 0 : clamp(smoothstep(cheekLine(ax) + 0.016, cheekLine(ax) + 0.002, y) * smoothstep(-0.02, 0.0, z) * smoothstep(1.54, 1.57, y), 0, 1);
    if (shadowZone > 0.01) c = mixc(c, mixc(C.skinDark, [0.05, 0.045, 0.05], 0.5), shadowZone * 0.3 * (0.75 + n3 * 0.5));
    if (b > 0.02) {
      const thick = beardThick(x, y, z);
      const dens = clamp(b * (0.55 + 0.45 * thick) * (0.8 + n2 * 0.3), 0, 1);
      c = mixc(c, mixc(C.skinDark, [0.045, 0.035, 0.03], 0.55), dens * 0.62);
      hair = Math.max(hair, dens);
    }
    return { c, r, m: 0, p, w: hair > 0.01 ? 1 + hair : 0.3 };
  };
  lodPair(head, headPaint, 0.0021, 0.0058, { dist: [0.004, 0.012], k: 0.5 });

  // ---- Ojos ----
  // párpado superior rozando el borde del iris: mirada despierta y algo intensa
  const LID_OPEN = -0.53;
  const eyes = [];
  const eyeWhite = new THREE.MeshPhysicalMaterial({ color: '#86766c', roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.04 });
  // iris avellanado gris verdoso con fibras radiales, collarete ámbar y anillo límbico oscuro;
  // capa de barniz como la córnea húmeda (reflejo puntual de la luz)
  const irisMat = new THREE.MeshPhysicalMaterial({ map: irisTexture(), roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.03 });
  const pupilMat = new THREE.MeshStandardMaterial({ color: '#050404', roughness: 0.08 });
  const lidMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(...mixc(C.skin, C.skinDark, 0.35)), roughness: 0.55 });
  for (const s of [1, -1]) {
    const g = new THREE.Group();
    g.position.set(0.032 * s - pos.head[0], 1.692 - pos.head[1], eyeZ - pos.head[2]);
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
  const knot = [0, 1.776, -0.116];
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
  cap.add(ellipsoid([0, 1.69, -0.074], [0.072, 0.088, 0.047], { mat: 'hair' }));
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
    return k * (0.0003 * Math.sin(flow + w * 9) + (noise3(x, y, z, 45) - 0.5) * 0.003);
  };
  cap.relax = 1;
  const hairPaint = (x, y, z) => ({ c: mulc(C.hair, 0.55 + noise3(x, y, z, 300) * 0.3), r: 0.62, m: 0, p: PATTERN.hair, w: 0.5, aoK: 0.7 });
  lodPair(cap, hairPaint, 0.0028, 0.0075, { dist: [0.006, 0.016], k: 0.7 });

  const HC = [0, 1.751, -0.021], HR = [0.0835, 0.104, 0.1];
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
  // (a) mitad superior recogida hacia atrás con volumen, en dos capas: una interior pegada al
  // cráneo (cubre el casquete) y otra exterior ahuecada y ondulada, revuelta en la coronilla
  for (let i = 0; i < 300; i++) {
    const outer = i >= 110;
    const phi = (rnd() * 2 - 1) * 1.95;
    const th0 = hairline(phi) * (0.88 + rnd() * 0.14) - (outer ? rnd() * 0.5 : rnd() * 0.15);
    const d0 = sph(phi, Math.max(0.08, th0));
    const vol = outer ? 0.012 + rnd() * 0.02 : 0.004 + rnd() * 0.006;
    const wav = (rnd() - 0.5) * (outer ? 1.2 : 0.5);
    const ph = rnd() * 6.28, per = 1.6 + rnd() * 1.4;
    const pts = [];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      const lift = 0.002 + Math.sin(Math.min(1, t * 1.25) * Math.PI) * vol + t * 0.006;
      const dd = slerpDir(d0, knotDir, t * 0.92);
      const side = vec.nrm(vec.cross(dd, [0, 1, 0]));
      const wave = Math.sin(t * Math.PI * per + ph) * wav * 0.028 * Math.min(1, t * 3);
      pts.push(vec.add(onScalp(dd, lift + Math.cos(t * Math.PI * per + ph) * 0.003 * (outer ? 1 : 0)), vec.scl(side, wave)));
    }
    guides.push({ pts, w0: (outer ? 0.016 : 0.026) + rnd() * 0.012, w1: 0.008, nrm, tone: outer ? 0.75 + rnd() * 0.45 : 0.45 + rnd() * 0.25, tilt: outer ? 0.6 : 0.3, density: outer ? 1.3 : 2 });
  }
  // (b) melena suelta: de las sienes, detrás de las orejas y de la nuca; cae en ondas amplias hasta
  // el cuello y los hombros, con las puntas que se abren y se rizan hacia fuera
  for (let i = 0; i < 260; i++) {
    const side = rnd() < 0.5 ? -1 : 1;
    const phi = side * (1.25 + rnd() * 1.85);
    const th = (Math.PI / 180) * (72 + rnd() * 44);
    const r0 = onScalp(sph(phi, th), 0.007 + rnd() * 0.008);
    const out = vec.nrm([r0[0], 0, r0[2] - HC[2]]);
    const tan = [-out[2], 0, out[0]];
    const len = 0.11 + rnd() * 0.1 + (Math.abs(phi) > 2.4 ? 0.04 : 0);
    const ph = rnd() * 6.28, amp = 0.016 + rnd() * 0.02, ph2 = rnd() * 6.28, per = 7 + rnd() * 5;
    const curl = (rnd() - 0.2) * 0.045;
    const pts = [r0];
    for (let k = 1; k <= 10; k++) {
      const t = k / 10;
      const yy = r0[1] - len * t;
      // pegada al cráneo al principio; después cae y se abre sobre el cuello alto
      const spread = 0.012 + t * 0.034 + (yy < 1.63 ? (1.63 - yy) * 0.35 : 0) + Math.max(0, t - 0.7) * curl * 4;
      const wave = Math.sin(t * per + ph) * amp * Math.min(1, t * 2.2);
      const wz = Math.cos(t * per * 0.8 + ph2) * amp * 0.7 * t;
      pts.push([r0[0] + out[0] * spread + tan[0] * wave, yy + Math.max(0, t - 0.8) * curl * 2, r0[2] + out[2] * spread + tan[2] * wave - t * 0.014 + wz]);
    }
    guides.push({ pts, w0: 0.018 + rnd() * 0.014, w1: 0.006 + rnd() * 0.008, nrm, tone: 0.55 + rnd() * 0.8, tilt: 0.8 });
  }
  // (c) mechones que enmarcan la cara: de la raya, por la sien y sobre la oreja (la tapan casi
  // entera) hasta la mandíbula, ondulados en S
  for (const sd of [1, -1]) {
    for (let j = 0; j < 14; j++) {
      const o = j / 13;
      const x0 = sd * (0.078 + o * 0.012), z0 = 0.032 - o * 0.05;
      const yEnd = 1.595 - rnd() * 0.04 + o * 0.012;
      const a = (0.008 + rnd() * 0.008) * sd;
      guides.push({
        pts: [
          onScalp(sph(sd * (0.25 + o * 0.6), 0.6 + o * 0.14), 0.016),
          onScalp(sph(sd * (0.95 + o * 0.4), 1.0 + o * 0.08), 0.018),
          [x0 + sd * 0.01, 1.705 - o * 0.008, z0 + 0.002],
          [x0 + sd * 0.016 + a, 1.668, z0 - 0.004],
          [x0 + sd * 0.012 - a, 1.634, z0 - 0.002],
          [x0 + sd * 0.022 + a, yEnd, z0 - 0.016],
        ],
        w0: 0.02 + rnd() * 0.01, w1: 0.007, nrm, tone: 0.75 + rnd() * 0.4, tilt: 0.7,
      });
    }
  }
  // (d) mechones sueltos que caen sobre la frente y la sien (más del lado derecho, como en la
  // lámina): nacen en la raya, se arquean hacia delante y caen ondulados hasta la ceja
  for (let j = 0; j < 9; j++) {
    const sd = j < 6 ? 1 : -1;
    const o = (j % 6) * 0.009 + rnd() * 0.005;
    const x1 = sd * (0.012 + o), endY = 1.7 + rnd() * 0.035;
    const sw = sd * (0.01 + rnd() * 0.014);
    guides.push({
      pts: [onScalp(sph(sd * (0.08 + o * 3), 0.4 + rnd() * 0.1), 0.016), [x1, 1.8, 0.086], [x1 + sw * 0.9, 1.772, 0.101], [x1 + sw * 0.2, 1.745, 0.103], [x1 + sw * 1.4, endY, 0.098]],
      w0: 0.007 + rnd() * 0.006, w1: 0.003, nrm, tone: 1.0 + rnd() * 0.4, tilt: 1,
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
  const strandMat = hairStrandMaterial('#3f2e23');
  // planos cortos: hebras finas generadas a partir de las guías; en juego, tarjetas de mechón
  for (const lod of HI ? ['hi', 'lo'] : ['lo']) {
    const g = lod === 'hi' ? hairStrandGeometry(guides, pos.head, { perGuide: 18, seg: 12 }) : hairCardGeometry(guides, pos.head, 6);
    const m = new THREE.Mesh(g, lod === 'hi' ? strandMat : hairMat);
    m.castShadow = lod === 'lo'; m.receiveShadow = true;
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
