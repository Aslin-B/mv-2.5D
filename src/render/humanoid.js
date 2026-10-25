import * as THREE from 'three';
import { SdfScene, roundCone, ellipsoid, roundBox, surfaceNets } from './sdf.js';
import { makeCharMaterial, PATTERN } from './charMaterial.js';
import { hash3, valueNoise3 } from '../core/rng.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Esqueleto humanoide común. Espacio del modelo: pies en y=0, frente hacia +Z,
// lado izquierdo del personaje hacia +X. Pose de enlace en "A" (brazos a ~22° del cuerpo).
// Las rotaciones de reposo de todos los huesos son la identidad: los ejes locales coinciden con el modelo.

export const BONE_NAMES = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'clavL', 'armL', 'foreL', 'handL',
  'clavR', 'armR', 'foreR', 'handR',
  'thighL', 'shinL', 'footL', 'toeL',
  'thighR', 'shinR', 'footR', 'toeR',
];

const PARENT = {
  hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  clavL: 'chest', armL: 'clavL', foreL: 'armL', handL: 'foreL',
  clavR: 'chest', armR: 'clavR', foreR: 'armR', handR: 'foreR',
  thighL: 'hips', shinL: 'thighL', footL: 'shinL', toeL: 'footL',
  thighR: 'hips', shinR: 'thighR', footR: 'shinR', toeR: 'footR',
};

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mir = (p) => [-p[0], p[1], p[2]];
export const vec = { add, scl, nrm, cross, mir };

// Proporciones por defecto: adulto de 1,85 m, atlético (biblia §5.1).
export function defaultProportions(over = {}) {
  return {
    hipY: 0.95, hipX: 0.095, kneeY: 0.505, ankleY: 0.085,
    spineY: 1.075, chestY: 1.275, neckY: 1.49, headY: 1.585,
    shoulderX: 0.185, shoulderY: 1.445, clavX: 0.035,
    upperArm: 0.30, foreArm: 0.265, armAngle: 22,
    footLen: 0.27,
    bulk: 1.0, waist: 1.0, chestW: 1.0, legBulk: 1.0, armBulk: 1.0, hunch: 0,
    ...over,
  };
}

export function bindPositions(P) {
  const a = (P.armAngle * Math.PI) / 180;
  const dirL = nrm([Math.sin(a), -Math.cos(a), 0.035]);
  const dirR = mir(dirL);
  const J_L = [P.shoulderX, P.shoulderY, -0.02];
  const E_L = add(J_L, scl(dirL, P.upperArm));
  const W_L = add(E_L, scl(dirL, P.foreArm));
  const pos = {
    hips: [0, P.hipY, 0],
    spine: [0, P.spineY, -0.005],
    chest: [0, P.chestY, -0.01 - P.hunch * 0.03],
    neck: [0, P.neckY, -0.02 - P.hunch * 0.05],
    head: [0, P.headY, -0.005 - P.hunch * 0.06],
    clavL: [P.clavX, P.shoulderY + 0.005, -0.005 - P.hunch * 0.03],
    armL: J_L, foreL: E_L, handL: W_L,
    thighL: [P.hipX, P.hipY - 0.02, 0],
    shinL: [P.hipX + 0.005, P.kneeY, 0.01],
    footL: [P.hipX + 0.01, P.ankleY, -0.02],
    toeL: [P.hipX + 0.01, 0.02, 0.135],
  };
  for (const k of ['clav', 'arm', 'fore', 'hand']) pos[k + 'R'] = mir(pos[k + 'L']);
  for (const k of ['thigh', 'shin', 'foot', 'toe']) pos[k + 'R'] = mir(pos[k + 'L']);
  pos.armR[1] = pos.armL[1];
  return { pos, dirL, dirR };
}

export function buildSkeleton(P, { fingers = false } = {}) {
  const { pos, dirL, dirR } = bindPositions(P);
  const bones = {};
  for (const name of BONE_NAMES) {
    const b = new THREE.Bone();
    b.name = name;
    bones[name] = b;
  }
  for (const name of BONE_NAMES) {
    const p = PARENT[name];
    const wp = pos[name];
    if (p) {
      const pp = pos[p];
      bones[name].position.set(wp[0] - pp[0], wp[1] - pp[1], wp[2] - pp[2]);
      bones[p].add(bones[name]);
    } else {
      bones[name].position.set(wp[0], wp[1], wp[2]);
    }
  }
  const S = { bones, pos, dirL, dirR, fingerRig: null };
  if (fingers) S.fingerRig = addFingerBones(S, fingers === true ? 1 : fingers);
  return S;
}

// --- Dedos articulados ---------------------------------------------------------
// Tres falanges por dedo (el pulgar: metacarpiano, proximal y distal) como huesos hijos de la mano.
// Ejes en el espacio del modelo en la pose de enlace (rotaciones de reposo = identidad):
// d = hacia las yemas, f = hacia delante (lado del pulgar), s = normal de la palma.
export const FINGERS = ['thb', 'idx', 'mid', 'rng', 'pky'];

export function handFrame(side, B) {
  const L = side > 0 ? 'L' : 'R';
  const d = side > 0 ? B.dirL : mir(B.dirL);
  const W = B.pos['hand' + L];
  const f = nrm(add([0, 0, 1], scl(d, -d[2])));
  const s = nrm(cross(f, d)).map((v) => v * (side > 0 ? -1 : 1));
  return { L, d, f, s, W };
}

// Medidas de una mano adulta (m). kd: distancia del nudillo a la muñeca; kf: desplazamiento hacia
// el pulgar; len: falanges; r: radios en cada articulación; fan: abanico natural (rad hacia f).
const FINGER_SPEC = {
  idx: { kd: 0.094, kf: 0.0275, len: [0.043, 0.026, 0.021], r: [0.0087, 0.0079, 0.0071, 0.0063], fan: 0.06 },
  mid: { kd: 0.097, kf: 0.0093, len: [0.047, 0.029, 0.022], r: [0.009, 0.0081, 0.0073, 0.0064], fan: 0.0 },
  rng: { kd: 0.093, kf: -0.0095, len: [0.044, 0.028, 0.021], r: [0.0084, 0.0076, 0.0068, 0.006], fan: -0.05 },
  pky: { kd: 0.085, kf: -0.0268, len: [0.035, 0.021, 0.018], r: [0.0074, 0.0067, 0.006, 0.0054], fan: -0.12 },
};

export function fingerLayout(side, B, k = 1) {
  const H = handFrame(side, B);
  const { d, f, s, W } = H;
  const P = (dd, ff, ss) => add(add(add(W, scl(d, dd * k)), scl(f, ff * k)), scl(s, ss * k));
  const out = [];
  for (const name of ['idx', 'mid', 'rng', 'pky']) {
    const F = FINGER_SPEC[name];
    const dir = nrm(add(scl(d, Math.cos(F.fan)), scl(f, Math.sin(F.fan))));
    const j0 = P(F.kd, F.kf, -0.004);
    const j1 = add(j0, scl(dir, F.len[0] * k));
    const j2 = add(j1, scl(dir, F.len[1] * k));
    const j3 = add(j2, scl(dir, F.len[2] * k));
    // flexión: gira la dirección del dedo hacia la palma (eje = dir × s); abducción: alrededor de s
    out.push({ name, joints: [j0, j1, j2, j3], dir, axis: nrm(cross(dir, s)), spread: s, r: F.r.map((v) => v * k) });
  }
  // Pulgar: nace junto a la muñeca, del lado de la palma, y apunta hacia delante y abajo.
  const tdir = nrm(add(add(scl(d, 0.62), scl(f, 0.62)), scl(s, 0.48)));
  const t0 = P(0.024, 0.021, 0.012);
  const t1 = add(t0, scl(tdir, 0.044 * k));
  const tdir2 = nrm(add(tdir, scl(d, 0.35)));
  const t2 = add(t1, scl(tdir2, 0.033 * k));
  const t3 = add(t2, scl(tdir2, 0.028 * k));
  // el pulgar se opone: se cierra hacia el meñique y la palma
  const taxis = nrm(cross(tdir, nrm(add(scl(s, 0.75), scl(f, -0.65)))));
  out.unshift({ name: 'thb', joints: [t0, t1, t2, t3], dir: tdir, axis: taxis, spread: nrm(cross(tdir, taxis)), r: [0.0128, 0.0108, 0.0094, 0.0082].map((v) => v * k) });
  return { ...H, fingers: out };
}

function addFingerBones(S, k = 1) {
  const rig = {};
  for (const side of [1, -1]) {
    const lay = fingerLayout(side, S, k);
    const L = lay.L;
    const hand = S.bones['hand' + L];
    const hp = S.pos['hand' + L];
    rig[L] = { frame: lay, fingers: [] };
    for (const fg of lay.fingers) {
      const chain = [];
      let parent = hand, pp = hp;
      for (let i = 0; i < 3; i++) {
        const b = new THREE.Bone();
        b.name = `${fg.name}${i + 1}${L}`;
        const wp = fg.joints[i];
        b.position.set(wp[0] - pp[0], wp[1] - pp[1], wp[2] - pp[2]);
        parent.add(b);
        S.bones[b.name] = b;
        S.pos[b.name] = wp;
        chain.push(b);
        parent = b; pp = wp;
      }
      rig[L].fingers.push({
        name: fg.name, bones: chain, joints: fg.joints, r: fg.r,
        axis: new THREE.Vector3(...fg.axis), spread: new THREE.Vector3(...fg.spread), dir: fg.dir,
      });
    }
  }
  return rig;
}

// --- Cuerpo deformable -------------------------------------------------------

export function standardBody(scene, P, B, mats) {
  const { pos, dirL } = B;
  const k = P.bulk, w = P.waist, cw = P.chestW, lb = P.legBulk, ab = P.armBulk;
  const h = P.hunch;
  // Torso
  scene.add(ellipsoid([0, P.hipY + 0.02, -0.005], [0.162 * k, 0.11, 0.112 * k], { bone: 'hips', mat: mats.pelvis }));
  // cintura casi tan ancha como la cadera: tronco recto bajo el acolchado, sin talle de reloj de arena
  scene.add(ellipsoid([0, P.spineY + 0.035, 0.0 - h * 0.02], [0.156 * k * w, 0.11, 0.1 * k * w], { bone: 'spine', mat: mats.torso }));
  scene.add(ellipsoid([0, P.chestY + 0.035, -0.002 - h * 0.04], [0.172 * k * cw, 0.15, 0.108 * k], { bone: 'chest', mat: mats.torso }));
  scene.add(ellipsoid([0, P.chestY + 0.025, -0.045 - h * 0.05], [0.165 * k * cw, 0.13, 0.09 * k], { bone: 'chest', mat: mats.torso }));
  // Pecho: una sola placa ancha y plana (dos volúmenes separados se leían como busto bajo el acolchado)
  scene.add(ellipsoid([0, P.chestY + 0.05, 0.048 - h * 0.03], [0.15 * k * cw, 0.074, 0.064 * k], { bone: 'chest', mat: mats.torso }));
  // relleno bajo el pecho: el frente baja recto hasta la cintura (sin pliegue que dibuje un busto)
  scene.add(ellipsoid([0, P.chestY - 0.085, 0.012 - h * 0.03], [0.158 * k * cw, 0.12, 0.098 * k], { bone: 'spine', mat: mats.torso }));
  for (const s of [1, -1]) {
    // trapecio hacia el hombro
    const clav = pos[s > 0 ? 'clavL' : 'clavR'];
    const J = pos[s > 0 ? 'armL' : 'armR'];
    scene.add(roundCone([0.055 * s, P.shoulderY + 0.02, -0.025 - h * 0.05], [J[0] - 0.02 * s, J[1] + 0.005, J[2]], 0.058 * k, 0.055 * k, { bone: s > 0 ? 'clavL' : 'clavR', mat: mats.torso }));
    void clav;
  }
  // Cuello
  scene.add(roundCone([0, P.neckY - 0.06, -0.015 - h * 0.05], [0, P.headY + 0.04, -0.01 - h * 0.06], 0.062 * k, 0.052 * k, { bone: 'neck', boneB: 'head', blendFrom: 0.55, blendMax: 0.6, mat: mats.neck }));

  // Brazos
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R';
    const d = s > 0 ? dirL : mir(dirL);
    const J = pos['arm' + L], E = pos['fore' + L], W = pos['hand' + L];
    // deltoides algo más contenido: con el brazo en alto ya no sobresale por encima del hombro como una bola
    scene.add(ellipsoid(add(add(J, scl(d, 0.04)), [0.01 * s, 0.002, 0]), [0.061 * ab, 0.071 * ab, 0.068 * ab], { bone: 'arm' + L, mat: mats.arm }));
    scene.add(roundCone(J, E, 0.054 * ab, 0.041 * ab, { bone: 'arm' + L, boneB: 'fore' + L, blendFrom: 0.78, blendMax: 0.5, mat: mats.arm }));
    scene.add(ellipsoid(add(add(J, scl(d, 0.15)), [0, 0, 0.016]), [0.043 * ab, 0.075, 0.046 * ab], { bone: 'arm' + L, mat: mats.arm }));
    scene.add(roundCone(E, W, 0.043 * ab, 0.031 * ab, { bone: 'fore' + L, mat: mats.forearm }));
    scene.add(ellipsoid(add(add(E, scl(d, 0.07)), [0, 0, 0.006]), [0.043 * ab, 0.065, 0.042 * ab], { bone: 'fore' + L, mat: mats.forearm }));
  }

  // Piernas
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R';
    const H = pos['thigh' + L], K = pos['shin' + L], A = pos['foot' + L], T = pos['toe' + L];
    scene.add(ellipsoid([0.075 * s, P.hipY - 0.06, -0.06], [0.086 * lb, 0.095, 0.078 * lb], { bone: 'hips', mat: mats.pelvis, priority: -0.004 }));
    scene.add(roundCone(H, K, 0.088 * lb, 0.054 * lb, { bone: 'thigh' + L, boneB: 'shin' + L, blendFrom: 0.82, blendMax: 0.5, mat: mats.thigh }));
    scene.add(ellipsoid(add(add(H, scl([K[0] - H[0], K[1] - H[1], K[2] - H[2]], 0.42)), [0.008 * s, 0, 0.022]), [0.074 * lb, 0.17, 0.075 * lb], { bone: 'thigh' + L, mat: mats.thigh }));
    scene.add(roundCone(K, A, 0.05 * lb, 0.034 * lb, { bone: 'shin' + L, mat: mats.shin }));
    scene.add(ellipsoid(add(K, [0.004 * s, -0.13, -0.028]), [0.05 * lb, 0.11, 0.05 * lb], { bone: 'shin' + L, mat: mats.shin }));
    // Bota
    scene.add(roundCone(add(A, [0, 0.0, 0.004]), add(K, [0.002 * s, -0.17, -0.006]), 0.046, 0.054 * lb, { bone: 'shin' + L, mat: mats.boot, priority: 0.006 }));
    scene.add(roundBox([A[0], 0.045, 0.045], [0.034, 0.028, 0.075], 0.02, { bone: 'foot' + L, mat: mats.boot }));
    scene.add(ellipsoid([A[0], 0.05, -0.03], [0.04, 0.048, 0.048], { bone: 'foot' + L, mat: mats.boot }));
    scene.add(ellipsoid([T[0], 0.033, T[2] + 0.01], [0.044, 0.031, 0.058], { bone: 'toe' + L, mat: mats.boot }));
  }
}

// --- Manos rígidas (resolución fina) -----------------------------------------
// curl: 0 = relajada, 1 = puño sobre empuñadura. Devuelve también el punto de agarre.
export function buildHand(side, B, opts = {}) {
  const L = side > 0 ? 'L' : 'R';
  const d = side > 0 ? B.dirL : mir(B.dirL);
  const W = B.pos['hand' + L];
  const fwd0 = [0, 0, 1];
  const f = nrm(add(fwd0, scl(d, -(d[2]))));
  const palmN = nrm(cross(f, d)).map((v) => v * (side > 0 ? -1 : 1)); // hacia el cuerpo
  const s = palmN;
  const grip = opts.grip !== false;
  const curl = opts.curl ?? (grip ? 1 : 0.35);
  const scene = new SdfScene({ k: 0.0045, subK: 0.003 });
  const mat = opts.mat;
  const P = (dd, ff, ss) => add(add(add(W, scl(d, dd)), scl(f, ff)), scl(s, ss));
  // Palma y dorso
  scene.add(ellipsoid(P(0.05, 0.002, -0.004), [0.02, 0.046, 0.04].map((v, i) => v), { mat }));
  const palm = roundBox([0, 0, 0], [0.0, 0.0, 0.0], 0.0);
  void palm;
  scene.add(roundCone(P(0.015, 0.0, -0.002), P(0.075, 0.0, -0.004), 0.03, 0.032, { mat }));
  scene.add(roundCone(P(0.02, 0.022, -0.004), P(0.075, 0.026, -0.004), 0.016, 0.015, { mat }));
  scene.add(roundCone(P(0.02, -0.022, -0.004), P(0.075, -0.026, -0.004), 0.016, 0.014, { mat }));
  // Puño de guante
  scene.add(roundCone(P(-0.03, 0, 0), P(0.012, 0, 0), 0.038, 0.033, { mat }));
  // Dedos: tres falanges alrededor del eje de agarre (dirección f).
  const G = P(0.088, 0, 0.026);
  const fingers = [
    { ff: 0.027, len: 1.0 }, { ff: 0.009, len: 1.06 }, { ff: -0.009, len: 1.0 }, { ff: -0.026, len: 0.86 },
  ];
  const R = grip ? 0.0255 : 0.034;
  const arc = (theta, rr, ff) => {
    // ángulo 0: lado del dorso (-s); 90°: hacia d (abajo); 180°: lado de la palma (+s)
    const c = Math.cos(theta), sn = Math.sin(theta);
    return add(add(G, add(scl(s, -c * rr), scl(d, sn * rr))), scl(f, ff));
  };
  for (const fg of fingers) {
    const knuckle = P(0.088, fg.ff, -0.012);
    const t0 = 0, span = (grip ? 215 : 70 + 60 * curl) * (Math.PI / 180) * fg.len;
    const pts = [knuckle];
    const n = 3;
    for (let i = 1; i <= n; i++) {
      const th = t0 + (span * i) / n;
      pts.push(grip ? arc(th, R * (0.98 + 0.06 * (i / n)), fg.ff * (1 - 0.08 * i)) : add(knuckle, add(scl(d, Math.sin(th) * 0.03 * i * 0.6 + 0.022 * i), scl(s, (1 - Math.cos(th)) * 0.02 * i))));
    }
    const radii = [0.0108, 0.0098, 0.0088, 0.0078];
    for (let i = 0; i < n; i++) scene.add(roundCone(pts[i], pts[i + 1], radii[i], radii[i + 1], { mat }));
  }
  // Pulgar
  const tb = P(0.032, 0.03, 0.004);
  const tm = grip ? P(0.07, 0.035, 0.03) : P(0.07, 0.04, 0.012);
  const tt = grip ? P(0.096, 0.024, 0.045) : P(0.1, 0.038, 0.02);
  scene.add(roundCone(tb, tm, 0.015, 0.011, { mat }));
  scene.add(roundCone(tm, tt, 0.011, 0.0092, { mat }));
  const mesh = surfaceNets(scene, opts.cell || 0.0052);
  return { mesh, scene, grip: G, axis: f, palmN: s, down: d, W };
}

// --- Conversión de la malla SDF a geometría Three.js -----------------------

// paint(px,py,pz, prim) -> {c:[r,g,b] lineal, r: rugosidad, m: metal, p: patrón, w: desgaste}
// ao: oclusión horneada en el color de vértice. Mide cuánto espacio libre hay a lo largo de la
// normal (a `dist` metros) dentro de la propia escena SDF: pliegues, comisuras, juntas y el
// interior de las mangas se oscurecen sin coste en tiempo de ejecución.
// Suavizado de pesos de piel por difusión sobre la malla (Laplaciano, vecinos por arista).
// Los pesos que salen de las primitivas cambian de hueso en pocos milímetros: el hombro giraba
// entero con el brazo como una bola y codos y rodillas se doblaban como bisagras. Difundirlos unos
// centímetros reparte la torsión entre los huesos vecinos, como haría un pintado de pesos a mano.
// Cada vértice se acerca a la media de sus vecinos `iters` veces con fuerza `alpha`.
function smoothWeights(W, n, nb, indices, { iters = 10, alpha = 0.5 } = {}) {
  const deg = new Uint32Array(n + 1);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i], b = indices[i + 1], c = indices[i + 2];
    deg[a] += 2; deg[b] += 2; deg[c] += 2;
  }
  const start = new Uint32Array(n + 1);
  for (let v = 0; v < n; v++) start[v + 1] = start[v] + deg[v];
  const nbr = new Uint32Array(start[n]);
  const fill = start.slice(0, n);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i], b = indices[i + 1], c = indices[i + 2];
    nbr[fill[a]++] = b; nbr[fill[a]++] = c;
    nbr[fill[b]++] = a; nbr[fill[b]++] = c;
    nbr[fill[c]++] = a; nbr[fill[c]++] = b;
  }
  let src = W, dst = new Float32Array(W.length);
  for (let it = 0; it < iters; it++) {
    for (let v = 0; v < n; v++) {
      const o = v * nb, k0 = start[v], k1 = start[v + 1];
      if (k1 === k0) { for (let b = 0; b < nb; b++) dst[o + b] = src[o + b]; continue; }
      const f = alpha / (k1 - k0);
      for (let b = 0; b < nb; b++) dst[o + b] = src[o + b] * (1 - alpha);
      for (let k = k0; k < k1; k++) {
        const q = nbr[k] * nb;
        for (let b = 0; b < nb; b++) dst[o + b] += src[q + b] * f;
      }
    }
    const t = src; src = dst; dst = t;
  }
  if (src !== W) W.set(src);
}

export function meshToGeometry(mesh, scene, paint, { skin = false, boneIndex = null, sigma = 0.03, origin = [0, 0, 0], ao = null, smooth = 0 } = {}) {
  const { positions, normals, indices } = mesh;
  const n = positions.length / 3;
  const colors = new Float32Array(n * 3);
  const surf = new Float32Array(n * 4);
  const skinIndex = skin ? new Uint16Array(n * 4) : null;
  const skinWeight = skin ? new Float32Array(n * 4) : null;
  const pos = new Float32Array(positions.length);
  // pesos completos por hueso (antes de quedarse con los 4 mayores), para poder suavizarlos
  const nb = skin ? Math.max(...Object.values(boneIndex)) + 1 : 0;
  const W = skin ? new Float32Array(n * nb) : null;
  for (let v = 0; v < n; v++) {
    const x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
    const an = scene.analyze(x, y, z, sigma);
    const nx = normals[v * 3], ny = normals[v * 3 + 1], nz = normals[v * 3 + 2];
    const pr = paint(x, y, z, an.prim || {}, nx, ny, nz);
    let occ = 1;
    if (ao) {
      let o = 0;
      for (const dd of ao.dist) o += Math.min(Math.max(scene.eval(x + nx * dd, y + ny * dd, z + nz * dd) / dd, 0), 1);
      occ = 1 - (1 - o / ao.dist.length) * (pr.aoK ?? ao.k);
    }
    colors[v * 3] = pr.c[0] * occ; colors[v * 3 + 1] = pr.c[1] * occ; colors[v * 3 + 2] = pr.c[2] * occ;
    surf[v * 4] = pr.r; surf[v * 4 + 1] = pr.m; surf[v * 4 + 2] = pr.p; surf[v * 4 + 3] = pr.w ?? 0.5;
    pos[v * 3] = x - origin[0]; pos[v * 3 + 1] = y - origin[1]; pos[v * 3 + 2] = z - origin[2];
    if (skin) {
      let sum = 0;
      for (const [, w] of an.bones) sum += w;
      for (const [b, w] of an.bones) W[v * nb + boneIndex[b]] += w / sum;
    }
  }
  if (skin) {
    if (smooth) {
      smoothWeights(W, n, nb, indices, smooth);
      // la difusión no debe pasar de una pierna a la otra por la entrepierna (ni de un brazo al otro)
      const side = Object.entries(boneIndex).map(([name, i]) => [i, name.endsWith('L') ? 1 : name.endsWith('R') ? -1 : 0]);
      for (let v = 0; v < n; v++) {
        const sx = Math.sign(pos[v * 3] + origin[0]);
        if (!sx) continue;
        for (const [i, sd] of side) if (sd === -sx) W[v * nb + i] = 0;
      }
    }
    const order = new Int32Array(nb);
    for (let v = 0; v < n; v++) {
      const o = v * nb;
      for (let b = 0; b < nb; b++) order[b] = b;
      const top = Array.from(order).sort((a, b) => W[o + b] - W[o + a]).slice(0, 4);
      let sum = 0;
      for (const b of top) sum += W[o + b];
      for (let i = 0; i < 4; i++) {
        skinIndex[v * 4 + i] = top[i];
        skinWeight[v * 4 + i] = sum > 0 ? W[o + top[i]] / sum : (i === 0 ? 1 : 0);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setAttribute('surf', new THREE.BufferAttribute(surf, 4));
  if (skin) {
    g.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  }
  g.setIndex(n > 65535 ? new THREE.BufferAttribute(new Uint32Array(indices), 1) : new THREE.BufferAttribute(new Uint16Array(indices), 1));
  g.computeBoundingSphere();
  return g;
}

// Color sRGB hexadecimal -> lineal [r,g,b]
export function lin(hex) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}
export const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mulc = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const noise3 = (x, y, z, f, seed = 0) => valueNoise3(x * f, y * f, z * f, seed);
export { hash3 };

// Superficie de una geometría paramétrica de Three.js con atributos `surf` y color uniformes.
export function paintUniform(geo, hex, rough, metal, pattern, wear = 0.5) {
  const n = geo.attributes.position.count;
  const c = lin(hex);
  const colors = new Float32Array(n * 3);
  const surf = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = c[0]; colors[i * 3 + 1] = c[1]; colors[i * 3 + 2] = c[2];
    surf[i * 4] = rough; surf[i * 4 + 1] = metal; surf[i * 4 + 2] = pattern; surf[i * 4 + 3] = wear;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('surf', new THREE.BufferAttribute(surf, 4));
  return geo;
}

// Envoltura sólida con grosor (piezas de armadura): superficie exterior, interior y canto.
export function shellGeometry({ rx, ry, rz, phi0 = 0, phi1 = Math.PI * 2, th0 = 0, th1 = Math.PI / 2, thick = 0.004, seg = 24, rings = 10 }) {
  const outer = [], inner = [];
  for (let j = 0; j <= rings; j++) {
    const th = th0 + ((th1 - th0) * j) / rings;
    for (let i = 0; i <= seg; i++) {
      const ph = phi0 + ((phi1 - phi0) * i) / seg;
      const x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
      outer.push([x * rx, y * ry, z * rz]);
      inner.push([x * (rx - thick), y * (ry - thick), z * (rz - thick)]);
    }
  }
  const pos = [];
  const idx = [];
  const row = seg + 1;
  for (const p of outer) pos.push(...p);
  for (const p of inner) pos.push(...p);
  const off = outer.length;
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, c, b, b, c, d);
      idx.push(off + a, off + b, off + c, off + b, off + d, off + c);
    }
  }
  // Canto inferior
  const j = rings;
  for (let i = 0; i < seg; i++) {
    const a = j * row + i, b = a + 1;
    idx.push(a, b, off + a, b, off + b, off + a);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Ensambla el personaje: SkinnedMesh del cuerpo + piezas rígidas por hueso.
export function assembleCharacter({ P, bodyScene, bodyPaint, bodyCell = 0.0125, material, fingers = false, bodyAO = null, skinSmooth = { iters: 36, alpha: 0.5 } }) {
  const S = buildSkeleton(P, { fingers });
  const root = new THREE.Group();
  const boneList = BONE_NAMES.map((n) => S.bones[n]);
  const boneIndex = Object.fromEntries(BONE_NAMES.map((n, i) => [n, i]));
  root.add(S.bones.hips);
  root.updateMatrixWorld(true);
  const mesh = surfaceNets(bodyScene, bodyCell);
  const geo = meshToGeometry(mesh, bodyScene, bodyPaint, { skin: true, boneIndex, sigma: 0.022, ao: bodyAO, smooth: skinSmooth });
  const skinned = new THREE.SkinnedMesh(geo, material);
  skinned.castShadow = true;
  skinned.receiveShadow = true;
  skinned.frustumCulled = false;
  root.add(skinned);
  const skeleton = new THREE.Skeleton(boneList);
  skinned.bind(skeleton);
  return { root, skinned, skeleton, S, bones: S.bones, triangles: mesh.indices.length / 3 };
}

// Adjunta una malla rígida modelada en espacio del modelo a un hueso (convierte a espacio local del hueso).
export function attachRigid(bone, bindPos, geometry, material, { cast = true } = {}) {
  geometry.translate(-bindPos[0], -bindPos[1], -bindPos[2]);
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = cast;
  m.receiveShadow = true;
  bone.add(m);
  return m;
}

export { PATTERN, makeCharMaterial };

// Une las piezas rígidas que cuelgan directamente de un mismo hueso y comparten material y sombras:
// menos llamadas de dibujo (biblia §11.4) con la misma imagen. Respeta las marcadas con noMerge.
export function mergeRigidPieces(root) {
  const bones = [];
  root.traverse((o) => { if (o.isBone) bones.push(o); });
  let before = 0, after = 0;
  const keep = ['position', 'normal', 'color', 'surf'];
  for (const bone of bones) {
    const groups = new Map();
    for (const c of bone.children) {
      // las piezas con nivel de detalle se fusionan solo con las de su mismo nivel
      const lod = c.userData.lod || '';
      if (!c.isMesh || c.isSkinnedMesh || c.children.length || (c.userData.noMerge && !lod)) continue;
      const key = `${c.material.uuid}|${c.castShadow}|${c.receiveShadow}|${lod}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(c);
    }
    for (const list of groups.values()) {
      before += list.length;
      if (list.length < 2) { after += list.length; continue; }
      // si todas las piezas tienen índice se conserva (las mallas SDF finas triplicarían vértices)
      const indexed = list.every((m) => m.geometry.index);
      const geos = list.map((m) => {
        m.updateMatrix();
        const g = indexed || !m.geometry.index ? m.geometry.clone() : m.geometry.toNonIndexed();
        g.applyMatrix4(m.matrix);
        for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k);
        return g;
      });
      const merged = mergeGeometries(geos, false);
      if (!merged) { after += list.length; continue; }
      const mesh = new THREE.Mesh(merged, list[0].material);
      mesh.castShadow = list[0].castShadow; mesh.receiveShadow = list[0].receiveShadow;
      if (list[0].userData.lod) { mesh.userData.lod = list[0].userData.lod; mesh.userData.noMerge = true; mesh.visible = list[0].visible; }
      for (const m of list) bone.remove(m);
      bone.add(mesh);
      after++;
    }
  }
  return { before, after };
}
