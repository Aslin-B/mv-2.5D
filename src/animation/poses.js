// Biblioteca de poses (grados, Euler XYZ en el espacio local de cada hueso; reposo = pose A).
// Convenciones (ver humanoid.js): X- flexiona cadera/hombro hacia delante; X+ flexiona la rodilla;
// X- en antebrazo flexiona el codo; X+ en columna inclina hacia delante; Y+ gira el torso hacia
// la izquierda del personaje; para el lado derecho se reflejan Y y Z.

export const ZERO = Object.freeze({});

export function makePose(def = {}) {
  const p = { hip: [0, 0, 0] };
  for (const [k, v] of Object.entries(def)) p[k] = Array.isArray(v) ? v.slice() : v;
  return p;
}

// Refleja una definición L<->R (útil para poses simétricas o alternadas).
export function mirrorDef(def) {
  const out = {};
  for (const [k, v] of Object.entries(def)) {
    if (k === 'hip') { out.hip = [-v[0], v[1], v[2]]; continue; }
    let nk = k;
    if (k.endsWith('L')) nk = k.slice(0, -1) + 'R';
    else if (k.endsWith('R')) nk = k.slice(0, -1) + 'L';
    out[nk] = [v[0], -v[1], -v[2]];
  }
  return out;
}

// out += src * w (suma ponderada; los pesos deben sumar 1 para una mezcla convexa).
export function accumulate(out, src, w) {
  if (w <= 0) return out;
  for (const k in src) {
    const v = src[k];
    if (!Array.isArray(v)) continue;
    const o = out[k] || (out[k] = [0, 0, 0]);
    o[0] += v[0] * w; o[1] += v[1] * w; o[2] += v[2] * w;
  }
  return out;
}

// out = lerp(out, src, w) solo en los huesos presentes en src (máscara implícita).
export function overlay(out, src, w, mask = null) {
  if (w <= 0) return out;
  for (const k in src) {
    const v = src[k];
    if (!Array.isArray(v)) continue;
    const m = mask ? (mask[k] ?? 0) : 1;
    if (!m) continue;
    const ww = w * m;
    const o = out[k] || (out[k] = [0, 0, 0]);
    o[0] += (v[0] - o[0]) * ww; o[1] += (v[1] - o[1]) * ww; o[2] += (v[2] - o[2]) * ww;
  }
  return out;
}

export function addPose(out, src, w = 1) {
  for (const k in src) {
    const v = src[k];
    if (!Array.isArray(v)) continue;
    const o = out[k] || (out[k] = [0, 0, 0]);
    o[0] += v[0] * w; o[1] += v[1] * w; o[2] += v[2] * w;
  }
  return out;
}

export const UPPER_MASK = {
  spine: 0.6, chest: 1, neck: 1, head: 1, clavL: 1, armL: 1, foreL: 1, handL: 1, clavR: 1, armR: 1, foreR: 1, handR: 1,
};

// ---- Poses de cuerpo completo (piernas en FK; en suelo la IK corrige pies) ----

export const POSE = {
  idle: makePose({
    hip: [0, -0.035, 0], hips: [2, 0, 0], spine: [2, -6, 0], chest: [3, -8, 0], neck: [-2, 6, 0], head: [2, 6, 0],
    clavL: [0, 0, -1], armL: [-6, 4, -8], foreL: [-28, 0, 0], handL: [-8, 0, 0],
    clavR: [0, 0, 2],
    thighL: [-4, 0, 2], shinL: [8, 0, 0], thighR: [-4, 0, -2], shinR: [8, 0, 0],
  }),
  run: makePose({
    hip: [0, -0.07, 0], spine: [12, 0, 0], chest: [6, 0, 0], neck: [-8, 0, 0], head: [-6, 0, 0],
    clavL: [0, 0, -2], armL: [0, 0, -10], foreL: [-85, 0, 0], handL: [-10, 0, 0],
  }),
  skid: makePose({
    hip: [0, -0.16, -0.04], hips: [-6, 0, 0], spine: [-8, 0, 0], chest: [-6, 0, 0], neck: [6, 0, 0], head: [4, 0, 0],
    armL: [-35, 0, 25], foreL: [-40, 0, 0],
  }),
  jumpRise: makePose({
    hip: [0, 0, 0], spine: [6, 0, 0], chest: [2, 0, 0], neck: [-6, 0, 0], head: [-8, 0, 0],
    thighL: [-78, 0, 4], shinL: [95, 0, 0], footL: [20, 0, 0],
    thighR: [22, 0, -3], shinR: [70, 0, 0], footR: [35, 0, 0],
    armL: [-55, 0, 20], foreL: [-60, 0, 0],
  }),
  jumpRiseStand: makePose({
    hip: [0, 0.02, 0], spine: [4, 0, 0], neck: [-6, 0, 0], head: [-6, 0, 0],
    thighL: [-48, 0, 6], shinL: [80, 0, 0], footL: [25, 0, 0],
    thighR: [-30, 0, -6], shinR: [85, 0, 0], footR: [25, 0, 0],
    armL: [-40, 0, 25], foreL: [-50, 0, 0],
  }),
  apex: makePose({
    spine: [10, 0, 0], chest: [4, 0, 0], neck: [-6, 0, 0], head: [-4, 0, 0],
    thighL: [-60, 0, 6], shinL: [100, 0, 0], footL: [15, 0, 0],
    thighR: [-28, 0, -6], shinR: [105, 0, 0], footR: [25, 0, 0],
    armL: [-30, 0, 35], foreL: [-55, 0, 0],
  }),
  fall: makePose({
    spine: [0, 0, 0], chest: [-4, 0, 0], neck: [4, 0, 0], head: [6, 0, 0],
    thighL: [-26, 0, 6], shinL: [38, 0, 0], footL: [5, 0, 0],
    thighR: [6, 0, -6], shinR: [30, 0, 0], footR: [12, 0, 0],
    armL: [-20, 0, 48], foreL: [-30, 0, 0],
  }),
  slide: makePose({
    hip: [0, -0.56, 0], hips: [-18, 0, 0], spine: [-20, 0, 0], chest: [-10, 0, 0], neck: [24, 0, 0], head: [10, 0, 0],
    thighL: [-58, 0, 6], shinL: [12, 0, 0], footL: [-10, 0, 0],
    thighR: [-12, 0, -8], shinR: [118, 0, 0], footR: [30, 0, 0],
    armL: [30, 0, 25], foreL: [-15, 0, 0], handL: [40, 0, 0],
  }),
  roll: makePose({
    hip: [0, -0.3, 0], spine: [40, 0, 0], chest: [30, 0, 0], neck: [35, 0, 0], head: [20, 0, 0],
    thighL: [-120, 0, 8], shinL: [140, 0, 0], footL: [30, 0, 0],
    thighR: [-110, 0, -8], shinR: [140, 0, 0], footR: [30, 0, 0],
    armL: [-60, 0, 10], foreL: [-100, 0, 0],
  }),
  backstep: makePose({
    hip: [0, -0.1, -0.05], spine: [-10, 0, 0], chest: [-6, 0, 0], neck: [8, 0, 0], head: [6, 0, 0],
    thighL: [10, 0, 4], shinL: [40, 0, 0], thighR: [-30, 0, -4], shinR: [50, 0, 0],
    armL: [-30, 0, 30], foreL: [-40, 0, 0],
  }),
  airdash: makePose({
    spine: [24, 0, 0], chest: [10, 0, 0], neck: [-18, 0, 0], head: [-12, 0, 0],
    thighL: [-40, 0, 6], shinL: [90, 0, 0], thighR: [20, 0, -6], shinR: [80, 0, 0],
    armL: [40, 0, 20], foreL: [-30, 0, 0],
  }),
  hang: makePose({
    hip: [0, 0, 0], spine: [-4, 0, 0], chest: [-6, 0, 0], neck: [-14, 0, 0], head: [-10, 0, 0],
    thighL: [-20, 0, 4], shinL: [30, 0, 0], footL: [-10, 0, 0], thighR: [-6, 0, -4], shinR: [20, 0, 0], footR: [-10, 0, 0],
  }),
  hit: makePose({
    hip: [0, -0.06, -0.06], spine: [-14, 8, 0], chest: [-10, 6, 0], neck: [12, 0, 0], head: [14, -10, 0],
    armL: [-20, 0, 40], foreL: [-50, 0, 0],
  }),
  dead: makePose({
    hip: [0, -0.62, 0], hips: [-10, 0, 0], spine: [30, 0, 0], chest: [25, 0, 10], neck: [30, 0, 0], head: [20, 0, 0],
    thighL: [-90, 0, 10], shinL: [140, 0, 0], thighR: [-80, 0, -6], shinR: [150, 0, 0],
    armL: [-20, 0, 15], foreL: [-30, 0, 0],
  }),
  kneel: makePose({
    hip: [0, -0.32, 0], spine: [12, 0, 0], chest: [8, 0, 0], neck: [10, 0, 0], head: [10, 0, 0],
    thighL: [-85, 0, 6], shinL: [95, 0, 0], thighR: [10, 0, -4], shinR: [100, 0, 0], footR: [40, 0, 0],
    armL: [-60, 0, 10], foreL: [-40, 0, 0],
  }),
};

// ---- Trayectorias de espada (mano derecha por IK) ----------------------------
// hand: posición de la empuñadura en espacio del personaje (pies en el origen, +Z al frente,
// +X a la izquierda del personaje). blade: dirección de la hoja. body: giros del torso.

export const CARRY = {
  idle: { hand: [-0.235, 1.0, 0.25], blade: [-0.05, -0.32, 0.95] },
  run: { hand: [-0.26, 1.04, -0.05], blade: [-0.22, -0.42, -0.88] },
  jump: { hand: [-0.3, 1.32, -0.08], blade: [-0.3, 0.15, -0.94] },
  fall: { hand: [-0.36, 1.32, 0.12], blade: [-0.45, 0.45, 0.77] },
  slide: { hand: [-0.3, 0.55, -0.22], blade: [-0.25, -0.05, -0.97] },
  roll: { hand: [-0.2, 1.05, 0.18], blade: [-0.1, -0.2, -0.97] },
  hang: { hand: [-0.16, 1.98, 0.18], blade: [-0.1, -0.95, 0.15] },
  hit: { hand: [-0.33, 1.15, 0.05], blade: [-0.4, 0.5, -0.75] },
  kneel: { hand: [-0.3, 0.75, 0.25], blade: [-0.05, -0.85, 0.5] },
  dead: { hand: [-0.45, 0.25, 0.3], blade: [-0.6, -0.1, 0.8] },
};

// Ataques: tiempos en segundos (biblia §14.2). keys = trayectoria; active = ventana de daño.
export const ATTACKS = {
  cut1: {
    duration: 0.42, active: [0.11, 0.2], damage: 24, comboFrom: 0.2, push: 1.6,
    keys: [
      { t: 0.0, hand: [-0.26, 1.22, 0.18], blade: [-0.1, 0.5, 0.86], body: { chest: [0, -8, 0] } },
      { t: 0.09, hand: [-0.3, 1.64, -0.1], blade: [-0.14, 0.86, -0.49], body: { spine: [-2, -10, 0], chest: [-4, -16, 4] } },
      { t: 0.13, hand: [-0.2, 1.56, 0.32], blade: [-0.06, 0.74, 0.67], body: { spine: [6, -4, 0], chest: [2, -6, 0] } },
      { t: 0.165, hand: [-0.05, 1.16, 0.58], blade: [0.08, -0.12, 0.99], body: { spine: [14, 6, 0], chest: [8, 10, -3], hip: [0, -0.03, 0.05] } },
      { t: 0.21, hand: [0.06, 0.86, 0.44], blade: [0.2, -0.86, 0.47], body: { spine: [18, 10, 0], chest: [8, 16, -4], hip: [0, -0.05, 0.06] } },
      { t: 0.27, hand: [0.12, 0.84, 0.18], blade: [0.25, -0.78, -0.57], body: { spine: [16, 12, 0], chest: [6, 18, -3], hip: [0, -0.05, 0.05] } },
      { t: 0.42, hand: [0.0, 0.92, 0.28], blade: [0.1, -0.6, 0.79], body: { spine: [8, 6, 0], chest: [4, 8, 0] } },
    ],
  },
  cut2: {
    duration: 0.47, active: [0.13, 0.23], damage: 28, comboFrom: 0.22, push: 1.8,
    keys: [
      { t: 0.0, hand: [0.1, 0.86, 0.2], blade: [0.22, -0.8, -0.55], body: { spine: [14, 10, 0], chest: [6, 16, 0] } },
      { t: 0.11, hand: [0.12, 0.86, 0.02], blade: [0.18, -0.55, -0.82], body: { spine: [12, 14, 0], chest: [6, 20, -3], hip: [0, -0.04, -0.02] } },
      { t: 0.155, hand: [0.0, 0.98, 0.5], blade: [0.06, -0.6, 0.8], body: { spine: [12, 4, 0], chest: [6, 4, 0], hip: [0, -0.05, 0.04] } },
      { t: 0.2, hand: [-0.14, 1.34, 0.56], blade: [-0.08, 0.5, 0.86], body: { spine: [4, -8, 0], chest: [-2, -14, 3], hip: [0, -0.02, 0.05] } },
      { t: 0.26, hand: [-0.24, 1.62, 0.24], blade: [-0.12, 0.96, -0.24], body: { spine: [-2, -12, 0], chest: [-4, -20, 4], hip: [0, 0, 0.03] } },
      { t: 0.47, hand: [-0.26, 1.3, 0.2], blade: [-0.1, 0.6, 0.79], body: { spine: [2, -6, 0], chest: [0, -10, 0] } },
    ],
  },
  cut3: {
    duration: 0.65, active: [0.22, 0.35], damage: 42, comboFrom: 0.5, push: 3.2, twoHands: true, lunge: 0.45, heavy: true,
    keys: [
      { t: 0.0, hand: [-0.28, 1.4, 0.12], blade: [-0.4, 0.8, 0.3], body: { chest: [0, -15, 0] } },
      { t: 0.19, hand: [-0.06, 1.88, -0.12], blade: [-0.05, 0.55, -0.83], body: { spine: [-10, -6, 0], chest: [-8, -6, 0], hip: [0, 0.02, -0.02] } },
      { t: 0.25, hand: [-0.03, 1.66, 0.42], blade: [0.0, 0.75, 0.66], body: { spine: [6, 0, 0], chest: [4, 0, 0] } },
      { t: 0.3, hand: [0.0, 1.02, 0.62], blade: [0.02, -0.55, 0.83], body: { spine: [24, 0, 0], chest: [12, 0, 0], hip: [0, -0.12, 0.1] } },
      { t: 0.37, hand: [0.0, 0.66, 0.58], blade: [0.02, -0.9, 0.43], body: { spine: [30, 0, 0], chest: [14, 0, 0], hip: [0, -0.16, 0.12] } },
      { t: 0.65, hand: [-0.18, 0.95, 0.35], blade: [-0.05, -0.4, 0.9], body: { spine: [8, -4, 0], chest: [4, -6, 0], hip: [0, -0.04, 0.02] } },
    ],
  },
  runCut: {
    duration: 0.42, active: [0.12, 0.22], damage: 22, comboFrom: 0.24, push: 1.4, keepMomentum: 0.65,
    keys: [
      { t: 0.0, hand: [-0.28, 1.05, -0.1], blade: [-0.15, -0.5, -0.85], body: {} },
      { t: 0.1, hand: [-0.3, 1.0, -0.2], blade: [-0.15, -0.3, -0.94], body: { spine: [14, -6, 0], chest: [6, -10, 0] } },
      { t: 0.145, hand: [-0.16, 0.94, 0.3], blade: [-0.05, -0.95, 0.3], body: { spine: [16, 0, 0], chest: [8, 0, 0] } },
      { t: 0.185, hand: [-0.02, 1.16, 0.56], blade: [0.04, 0.12, 0.99], body: { spine: [10, 6, 0], chest: [4, 8, 0] } },
      { t: 0.24, hand: [-0.1, 1.46, 0.44], blade: [-0.05, 0.86, 0.5], body: { spine: [4, 4, 0], chest: [0, 6, 0] } },
      { t: 0.42, hand: [-0.25, 1.22, 0.1], blade: [-0.2, 0.5, -0.84], body: { spine: [8, 0, 0] } },
    ],
  },
  airCut: {
    duration: 0.46, active: [0.14, 0.24], damage: 26, comboFrom: 0.5, push: 1.6,
    keys: [
      { t: 0.0, hand: [-0.3, 1.35, 0.0], blade: [-0.3, 0.4, -0.86], body: {} },
      { t: 0.12, hand: [-0.2, 1.78, -0.06], blade: [-0.2, 0.92, -0.32], body: { spine: [-6, -8, 0], chest: [-4, -12, 0] } },
      { t: 0.17, hand: [-0.02, 1.56, 0.55], blade: [0.0, 0.48, 0.88], body: { spine: [8, 0, 0], chest: [6, 0, 0] } },
      { t: 0.22, hand: [0.05, 1.02, 0.6], blade: [0.12, -0.7, 0.7], body: { spine: [22, 6, 0], chest: [10, 8, 0] } },
      { t: 0.29, hand: [0.15, 0.86, 0.3], blade: [0.3, -0.92, -0.22], body: { spine: [24, 10, 0], chest: [10, 14, 0] } },
      { t: 0.46, hand: [-0.2, 1.2, 0.2], blade: [-0.3, 0.3, 0.9], body: { spine: [8, 0, 0] } },
    ],
  },
  riposte: {
    duration: 0.52, active: [0.09, 0.22], damage: 70, comboFrom: 0.6, push: 4.0, lunge: 0.6, heavy: true,
    keys: [
      { t: 0.0, hand: [-0.12, 1.32, 0.32], blade: [0.3, 0.85, 0.3], body: {} },
      { t: 0.07, hand: [-0.24, 1.26, -0.02], blade: [-0.05, 0.08, 0.99], body: { spine: [4, -18, 0], chest: [0, -24, 0] } },
      { t: 0.13, hand: [-0.04, 1.3, 0.66], blade: [0.04, -0.02, 1.0], body: { spine: [18, 4, 0], chest: [8, 8, 0], hip: [0, -0.1, 0.16] } },
      { t: 0.2, hand: [0.12, 1.08, 0.56], blade: [0.35, -0.45, 0.82], body: { spine: [22, 12, 0], chest: [10, 16, 0], hip: [0, -0.12, 0.16] } },
      { t: 0.3, hand: [0.24, 0.92, 0.3], blade: [0.7, -0.6, -0.1], body: { spine: [18, 18, 0], chest: [8, 24, 0], hip: [0, -0.08, 0.08] } },
      { t: 0.52, hand: [-0.1, 1.0, 0.28], blade: [0.0, -0.35, 0.94], body: { spine: [6, 0, 0] } },
    ],
  },
  parry: {
    duration: 0.38, active: [0.0, 0.0], damage: 0, comboFrom: 0.38,
    keys: [
      { t: 0.0, hand: [-0.2, 1.2, 0.3], blade: [0.0, 0.5, 0.86], body: {} },
      { t: 0.06, hand: [-0.08, 1.38, 0.36], blade: [0.36, 0.86, 0.36], body: { spine: [-4, 6, 0], chest: [-4, 10, 0], hip: [0, -0.05, -0.03] } },
      { t: 0.22, hand: [-0.1, 1.36, 0.34], blade: [0.34, 0.86, 0.38], body: { spine: [-4, 6, 0], chest: [-4, 10, 0], hip: [0, -0.05, -0.03] } },
      { t: 0.38, hand: [-0.22, 1.05, 0.26], blade: [-0.05, -0.2, 0.97], body: {} },
    ],
  },
};

// Gestos de interacción (mano izquierda por IK hacia un punto del mundo).
export const INTERACT = {
  pickup: { duration: 1.5 },
  socket: { duration: 0.9 },
};
