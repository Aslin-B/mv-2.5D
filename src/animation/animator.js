import * as THREE from 'three';
import { POSE, CARRY, ATTACKS, makePose, accumulate, overlay, addPose } from './poses.js';
import { solveTwoBone, setBoneWorldQuaternion } from './ik.js';
import { clamp, lerp, smoothstep, damp, springStep, DEG, easeInOutSine } from '../core/math.js';

// Animador procedural del humanoide:
// - Locomoción in-place conducida por la física (biblia §13.5): la fase del ciclo avanza con la
//   distancia recorrida y los pies de apoyo quedan fijos en el mundo (sin patinaje, §12.4).
// - IK de piernas con ajuste de pelvis; IK del brazo de la espada siguiendo trayectorias de ataque.
// - Capas: base de locomoción + superposición de torso + aditivos (respiración, inclinación, mirada).

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
// Evalúa una curva Catmull-Rom uniforme por puntos (arrays de números) en s ∈ [0,1].
function curve(points, s) {
  const n = points.length - 1;
  const f = clamp(s, 0, 1) * n;
  const i = Math.min(Math.floor(f), n - 1);
  const t = f - i;
  const p0 = points[Math.max(i - 1, 0)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(i + 2, n)];
  return catmull(p0, p1, p2, p3, t);
}

export class Animator {
  constructor(model, opts = {}) {
    this.m = model;
    this.b = model.bones;
    this.root = model.root;
    this.opts = {
      yawSide: 1.36, turnTime: 0.16, legLen: 0.845, ankleH: 0.085, footFwd: 0.055, stanceW: 0.095,
      cadence: 1.55, hasSword: true, twoHandOffset: 0.1, restRel: { L: -0.11, R: 0.13 }, ...opts,
    };
    this.POSE = opts.poses ? { ...POSE, ...opts.poses } : POSE;
    this.CARRY = opts.carry ? { ...CARRY, ...opts.carry } : CARRY;
    this.ATTACKS = opts.attacks ? { ...ATTACKS, ...opts.attacks } : ATTACKS;
    this.bind = {};
    for (const k in this.b) this.bind[k] = this.b[k].position.clone();
    this.yaw = this.opts.yawSide;
    this.phase = 0;
    this.mode = 'ground';
    this.prevMode = 'ground';
    this.feet = {
      L: { side: 1, pos: new THREE.Vector3(), planted: true, swing: null, liftRel: 0, pitch: 0, init: false },
      R: { side: -1, pos: new THREE.Vector3(), planted: true, swing: null, liftRel: 0, pitch: 0, init: false },
    };
    this.gait = false;
    this.landSpring = { x: 0, v: 0 };
    this.leanSpring = { x: 0, v: 0 };
    this.prevVx = 0;
    this.time = 0;
    this.events = [];
    this.bladeBase = new THREE.Vector3();
    this.bladeTip = new THREE.Vector3();
    this.prevTip = new THREE.Vector3();
    this.edge = new THREE.Vector3(0, -1, 0);
    this.blink = { t: 0, next: 2 };
    this.tail = model.tail ? model.tail.map(() => ({ p: new THREE.Vector3(), prev: new THREE.Vector3(), init: false })) : null;
    this.skidW = 0;
    this.handIK = { w: 1, hand: new THREE.Vector3(), blade: new THREE.Vector3(0, -0.3, 1) };
    this.lookYaw = 0; this.lookPitch = 0;
    this.trailActive = false;
    this.rollAngle = 0;
    // Ejes locales de la espada respecto a la mano derecha.
    if (model.sword) {
      const g = model.sword.group;
      this.swordAxisL = new THREE.Vector3(0, 1, 0).applyQuaternion(g.quaternion);
      this.swordEdgeL = new THREE.Vector3(1, 0, 0).applyQuaternion(g.quaternion);
      this.gripL = g.position.clone();
    }
  }

  // ---- Utilidades de espacio ----
  toWorldDir(v, out) { return out.copy(v).applyQuaternion(this.root.quaternion); }
  toWorldPoint(v, out) { return this.root.localToWorld(out.copy(v)); }

  update(dt, s) {
    this.time += dt;
    this.events.length = 0;
    const b = this.b, o = this.opts;
    const dir = s.facing >= 0 ? 1 : -1;
    const speed = Math.abs(s.vx);
    const modeChanged = s.mode !== this.mode;
    this.prevMode = this.mode;
    this.mode = s.mode;

    // 1) Orientación: giro animado a través del lado de cámara (sin espejo instantáneo, §6.5).
    const yTarget = dir * o.yawSide;
    const maxStep = (2 * o.yawSide / o.turnTime) * dt;
    this.yaw += clamp(yTarget - this.yaw, -maxStep, maxStep);
    this.root.position.set(s.x, s.y, 0);
    this.root.rotation.set(0, this.yaw, 0);

    // 2) Restablecer huesos a la pose de enlace.
    for (const k in b) { b[k].quaternion.identity(); b[k].position.copy(this.bind[k]); }

    // 3) Pose base según el modo.
    const pose = makePose();
    const accel = (s.vx - this.prevVx) / Math.max(dt, 1e-4);
    this.prevVx = s.vx;
    springStep(this.leanSpring, clamp(accel * dir * 0.6, -14, 14), 2.2, 0.7, dt);
    if (s.landImpact) {
      this.landSpring.v -= clamp(s.landImpact, 0, 22) * 0.055;
      this.events.push({ type: 'land', impact: s.landImpact });
    }
    springStep(this.landSpring, 0, 4.2, 0.55, dt);

    const ground = s.mode === 'ground' || s.mode === 'attackGround' || s.mode === 'interact' || s.mode === 'parry';
    let carry = this.CARRY.idle;
    let runW = 0;
    if (ground) {
      runW = smoothstep(0.3, 2.4, speed);
      this.skidW = damp(this.skidW, s.skid ? 1 : 0, 0.05, dt);
      accumulate(pose, this.POSE.idle, 1 - runW);
      if (runW > 0) accumulate(pose, this.runPose(speed), runW);
      if (this.skidW > 0.01) overlay(pose, this.POSE.skid, this.skidW);
      carry = this.blendCarry(this.CARRY.idle, this.runCarry(speed), runW);
      // respiración
      const br = Math.sin(this.time * 2.1);
      addPose(pose, { chest: [br * 1.2, 0, 0], spine: [br * 0.5, 0, 0], clavL: [0, 0, br * 0.8], clavR: [0, 0, -br * 0.8] }, 1 - runW);
      pose.hip[1] += br * 0.004 * (1 - runW);
      addPose(pose, { spine: [this.leanSpring.x * 0.6, 0, 0], chest: [this.leanSpring.x * 0.4, 0, 0] });
    } else if (s.mode === 'air' || s.mode === 'attackAir') {
      const vy = s.vy;
      const running = smoothstep(1.5, 4.5, speed);
      const rise = smoothstep(0.5, 5, vy), fall = smoothstep(-0.5, -6, vy);
      const apex = clamp(1 - rise - fall, 0, 1);
      const risePose = {};
      accumulate(risePose, this.POSE.jumpRise, running);
      accumulate(risePose, this.POSE.jumpRiseStand, 1 - running);
      accumulate(pose, risePose, rise);
      accumulate(pose, this.POSE.apex, apex);
      accumulate(pose, this.POSE.fall, fall);
      carry = this.blendCarry(this.CARRY.jump, this.CARRY.fall, fall);
    } else if (s.mode === 'slide') {
      const t = clamp(s.modeT / 0.12, 0, 1);
      accumulate(pose, this.POSE.slide, 1);
      overlay(pose, this.POSE.run, 1 - easeInOutSine(t));
      carry = this.CARRY.slide;
    } else if (s.mode === 'roll') {
      const t = clamp(s.modeT / s.modeDur, 0, 1);
      const env = smoothstep(0, 0.15, t) * (1 - smoothstep(0.82, 1, t));
      accumulate(pose, this.POSE.roll, env);
      accumulate(pose, this.POSE.idle, 1 - env);
      pose.hip[1] = lerp(-0.05, -0.6, env);
      this.rollAngle = easeInOutSine(clamp((t - 0.05) / 0.85, 0, 1)) * Math.PI * 2;
      carry = this.CARRY.roll;
    } else if (s.mode === 'backstep') {
      const t = clamp(s.modeT / s.modeDur, 0, 1);
      accumulate(pose, this.POSE.backstep, Math.sin(t * Math.PI));
      accumulate(pose, this.POSE.idle, 1 - Math.sin(t * Math.PI));
      carry = this.blendCarry(this.CARRY.idle, this.CARRY.fall, Math.sin(t * Math.PI) * 0.6);
    } else if (s.mode === 'airdash') {
      accumulate(pose, this.POSE.airdash, 1);
      carry = this.CARRY.jump;
    } else if (s.mode === 'hang' || s.mode === 'mantle') {
      accumulate(pose, this.POSE.hang, 1);
      carry = this.CARRY.hang;
      if (s.mode === 'mantle') {
        const t = clamp(s.modeT / s.modeDur, 0, 1);
        const k1 = smoothstep(0.0, 0.55, t), k2 = smoothstep(0.45, 1, t);
        overlay(pose, { spine: [30, 0, 0], chest: [20, 0, 0], thighL: [-95, 0, 6], shinL: [120, 0, 0], thighR: [-30, 0, -4], shinR: [60, 0, 0], hip: [0, 0, 0] }, k1 * (1 - k2));
        overlay(pose, this.POSE.idle, k2);
      }
    } else if (s.mode === 'hit') {
      const t = clamp(s.modeT / s.modeDur, 0, 1);
      const w = Math.sin(Math.min(t * 1.6, 1) * Math.PI * 0.5) * (1 - smoothstep(0.6, 1, t));
      accumulate(pose, this.POSE.idle, 1);
      overlay(pose, this.POSE.hit, w);
      carry = this.blendCarry(this.CARRY.idle, this.CARRY.hit, w);
    } else if (s.mode === 'dead') {
      const t = clamp(s.modeT / 0.9, 0, 1);
      accumulate(pose, this.POSE.idle, 1);
      overlay(pose, this.POSE.kneel, smoothstep(0, 0.4, t));
      overlay(pose, this.POSE.dead, smoothstep(0.4, 1, t));
      carry = this.blendCarry(this.CARRY.kneel, this.CARRY.dead, smoothstep(0.4, 1, t));
    }
    if (s.mode !== 'roll') this.rollAngle = 0;

    // Interacción (recoger / insertar clavija): arrodillarse a medias.
    if (s.mode === 'interact' && s.interact) {
      const t = clamp(s.modeT / s.modeDur, 0, 1);
      const w = smoothstep(0, 0.25, t) * (1 - smoothstep(0.75, 1, t));
      overlay(pose, s.interact.kind === 'pickup' ? this.POSE.kneel : { hip: [0, -0.08, 0], spine: [14, 0, 0], chest: [6, 0, 0], neck: [8, 0, 0] }, w);
      carry = this.blendCarry(carry, this.CARRY.kneel, w * 0.8);
    }

    // Ataque o parada: superposición de torso y trayectoria de espada.
    let atk = null, atkW = 0, atkKey = null;
    if (s.attack) {
      atk = this.ATTACKS[s.attack.id];
      const t = s.attack.t;
      atkW = smoothstep(0, 0.05, t) * (1 - smoothstep(atk.duration - 0.13, atk.duration, t));
      atkKey = this.sampleAttack(atk, t);
      if (atkKey.body) {
        const body = {};
        for (const k in atkKey.body) if (k !== 'hip') body[k] = atkKey.body[k];
        addPose(pose, body, atkW);
        if (atkKey.body.hip) { pose.hip[0] += atkKey.body.hip[0] * atkW; pose.hip[1] += atkKey.body.hip[1] * atkW; pose.hip[2] += atkKey.body.hip[2] * atkW; }
      }
      // piernas en guardia amplia durante el corte en suelo
      if (ground) addPose(pose, { hip: [0, -0.04 * atkW, 0] });
    }

    // Mirada hacia el objetivo
    if (s.look) {
      this.root.worldToLocal(_v.copy(s.look));
      _v.y -= 1.65;
      const yawL = clamp(Math.atan2(_v.x, _v.z), -0.7, 0.7);
      const pitL = clamp(-Math.atan2(_v.y, Math.hypot(_v.x, _v.z)), -0.4, 0.4);
      this.lookYaw = damp(this.lookYaw, yawL, 0.12, dt);
      this.lookPitch = damp(this.lookPitch, pitL, 0.12, dt);
    } else {
      this.lookYaw = damp(this.lookYaw, 0, 0.25, dt);
      this.lookPitch = damp(this.lookPitch, 0, 0.25, dt);
    }
    addPose(pose, { neck: [this.lookPitch / DEG * 0.4, this.lookYaw / DEG * 0.4, 0], head: [this.lookPitch / DEG * 0.6, this.lookYaw / DEG * 0.6, 0] });

    // 4) Aplicar pose a los huesos.
    for (const k in pose) {
      if (k === 'hip' || !b[k]) continue;
      const v = pose[k];
      _e.set(v[0] * DEG, v[1] * DEG, v[2] * DEG, 'XYZ');
      b[k].quaternion.setFromEuler(_e);
    }
    const hp = b.hips.position;
    hp.x += pose.hip[0];
    hp.y += pose.hip[1] + (ground ? this.landSpring.x : 0);
    hp.z += pose.hip[2];
    if (this.rollAngle) {
      _q.setFromAxisAngle(_v.set(1, 0, 0), this.rollAngle);
      // girar alrededor del centro del ovillo (por encima y delante de la cadera), no de la
      // articulación: la espalda rueda sobre el suelo y la cabeza queda recogida
      const off = _v4.set(0, 0.2, 0.07);
      const py = hp.y + off.y, pz = hp.z + off.z;
      off.negate().applyQuaternion(_q);
      hp.y = py + off.y; hp.z = pz + off.z;
      b.hips.quaternion.premultiply(_q);
    }
    this.root.updateMatrixWorld(true);

    // 5) Pies: marcha / pasos de ajuste / IK.
    if (ground) {
      this.updateFeet(dt, s, dir, speed, modeChanged || !this.groundPrev);
    } else {
      this.feet.L.init = false; this.feet.R.init = false;
      this.gait = false;
    }
    this.groundPrev = ground;

    // 6) Brazo de la espada (IK + orientación de la hoja).
    if (this.opts.hasSword && this.m.sword) {
      const target = { hand: carry.hand.slice(), blade: carry.blade.slice() };
      // seguir el desplazamiento de la pelvis
      target.hand[0] += pose.hip[0]; target.hand[1] += pose.hip[1] + (ground ? this.landSpring.x : 0); target.hand[2] += pose.hip[2];
      if (atkKey) {
        const ah = atkKey.hand.slice();
        if (atkKey.body && atkKey.body.hip) { ah[1] += atkKey.body.hip[1] * 0.5; ah[2] += atkKey.body.hip[2]; }
        for (let i = 0; i < 3; i++) {
          target.hand[i] = lerp(target.hand[i], ah[i], atkW);
          target.blade[i] = lerp(target.blade[i], atkKey.blade[i], atkW);
        }
      }
      if (this.rollAngle) {
        // la espada acompaña el giro del cuerpo
        _v.fromArray(target.hand).sub(b.hips.position).applyAxisAngle(_v2.set(1, 0, 0), this.rollAngle).add(b.hips.position);
        target.hand = _v.toArray();
        _v.fromArray(target.blade).applyAxisAngle(_v2.set(1, 0, 0), this.rollAngle);
        target.blade = _v.toArray();
      }
      const both = this.opts.alwaysTwoHands && s.mode !== 'dead' && s.mode !== 'hit' ? 1 : 0;
      this.solveSwordArm(target, dt, Math.max(both, atk && atk.twoHands ? atkW : 0));
    }
    if (s.mode === 'hang' || s.mode === 'mantle') this.solveHang(s);
    if (s.mode === 'interact' && s.interact && s.interact.point) this.solveReach(s);

    // 7) Secundarios: parpadeo y coleta.
    this.updateBlink(dt);
    this.updateTail(dt);
  }

  runPose(speed) {
    const sp = smoothstep(2.5, 8, speed);
    const ph = this.phase * Math.PI * 2;
    const A = lerp(22, 52, sp);
    const f = this.stanceFrac(speed);
    const bob = lerp(0.018, 0.045, sp);
    const p = makePose({
      hip: [0, -lerp(0.05, 0.085, sp) - bob * Math.cos(Math.PI * 2 * (2 * this.phase - f)), 0],
      hips: [4 + sp * 4, -8 * Math.cos(ph), 3 * Math.sin(ph)],
      spine: [lerp(8, 16, sp), 4 * Math.cos(ph), 0],
      chest: [lerp(4, 8, sp), 9 * Math.cos(ph), -2 * Math.sin(ph)],
      neck: [-lerp(6, 12, sp), -4 * Math.cos(ph), 0],
      head: [-lerp(4, 8, sp), -3 * Math.cos(ph), 0],
      clavL: [0, 0, -2],
      armL: [A * Math.cos(ph) - 6, 0, -8],
      foreL: [-lerp(70, 95, sp) - 14 * Math.max(0, -Math.cos(ph)), 0, 0],
      handL: [-12, 0, 0],
      clavR: [0, 0, 2],
      thighL: [-10, 0, 2], shinL: [25, 0, 0], thighR: [-10, 0, -2], shinR: [25, 0, 0],
    });
    return p;
  }

  runCarry(speed) {
    const ph = this.phase * Math.PI * 2;
    const c = this.CARRY.run;
    const sp = smoothstep(2.5, 8, speed);
    return {
      hand: [c.hand[0], c.hand[1] + 0.02 * Math.sin(2 * ph), c.hand[2] - 0.13 * Math.cos(ph) * lerp(0.5, 1, sp)],
      blade: c.blade,
    };
  }

  blendCarry(a, bb, t) {
    return {
      hand: [lerp(a.hand[0], bb.hand[0], t), lerp(a.hand[1], bb.hand[1], t), lerp(a.hand[2], bb.hand[2], t)],
      blade: [lerp(a.blade[0], bb.blade[0], t), lerp(a.blade[1], bb.blade[1], t), lerp(a.blade[2], bb.blade[2], t)],
    };
  }

  sampleAttack(atk, t) {
    const keys = atk.keys;
    let i = 0;
    while (i < keys.length - 2 && t > keys[i + 1].t) i++;
    const k1 = keys[i], k2 = keys[i + 1];
    const u = clamp((t - k1.t) / Math.max(k2.t - k1.t, 1e-4), 0, 1);
    const k0 = keys[Math.max(i - 1, 0)], k3 = keys[Math.min(i + 2, keys.length - 1)];
    const hand = [0, 1, 2].map((j) => catmull(k0.hand[j], k1.hand[j], k2.hand[j], k3.hand[j], u));
    const blade = [0, 1, 2].map((j) => lerp(k1.blade[j], k2.blade[j], u));
    const body = {};
    const keysB = new Set([...Object.keys(k1.body || {}), ...Object.keys(k2.body || {})]);
    const ue = easeInOutSine(u);
    for (const k of keysB) {
      const a = (k1.body && k1.body[k]) || [0, 0, 0], c = (k2.body && k2.body[k]) || [0, 0, 0];
      body[k] = [lerp(a[0], c[0], ue), lerp(a[1], c[1], ue), lerp(a[2], c[2], ue)];
    }
    return { hand, blade, body };
  }

  stanceFrac(speed) { return lerp(0.3, 0.19, smoothstep(2.5, 8, speed)); }
  cycleLen(speed) {
    const cad = lerp(1.25, this.opts.cadence + 0.12, smoothstep(1.5, 8, speed));
    return Math.max(speed / cad, 0.9);
  }

  // ---- Pies -------------------------------------------------------------------
  footLateral(side, out) {
    // eje lateral (izquierda del personaje) en el mundo según la orientación actual
    out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(side * this.opts.stanceW);
    return out;
  }

  updateFeet(dt, s, dir, speed, entered) {
    const o = this.opts;
    const b = this.b;
    const hipX = s.x + b.hips.position.z * Math.sin(this.yaw) * 0; // la raíz ya es la x física
    const gy = s.groundY ?? s.y;
    const feet = this.feet;
    if (entered || !feet.L.init) {
      // Posar los pies donde estén (aterrizaje, fin de esquiva, inicio).
      for (const k of ['L', 'R']) {
        const f = feet[k];
        b['foot' + k].getWorldPosition(_v);
        const lat = this.footLateral(f.side, _v2);
        f.pos.set(clamp(_v.x, s.x - 0.32, s.x + 0.32), gy, lat.z);
        f.planted = true; f.swing = null; f.init = true; f.pitch = 0;
      }
      this.gait = false;
    }
    const running = speed > 0.9 && !s.skid;
    // Marcha hacia atrás (retirada de cara al rival): los pies se colocan según el movimiento.
    const mdir = speed > 0.3 ? Math.sign(s.vx) : dir;
    const back = mdir !== dir;
    if (running) {
      const cyc = this.cycleLen(speed);
      const fr = this.stanceFrac(speed);
      if (!this.gait) {
        // Empezar la marcha con el pie que queda atrás.
        const relL = (feet.L.pos.x - s.x) * mdir, relR = (feet.R.pos.x - s.x) * mdir;
        this.phase = relL < relR ? fr : (fr + 0.5) % 1;
        this.gait = true;
      }
      this.phase = (this.phase + (speed * this.dtScale(dt)) / cyc) % 1;
      const L = fr * cyc;
      const sp = smoothstep(2.5, 8, speed);
      for (const k of ['L', 'R']) {
        const f = feet[k];
        const u = (this.phase + (k === 'L' ? 0 : 0.5)) % 1;
        const lat = this.footLateral(f.side, _v2);
        if (u < fr) {
          if (!f.planted) {
            f.planted = true;
            f.pos.set(s.x + mdir * (L / 2), gy, lat.z);
            this.events.push({ type: 'step', side: k, speed });
          }
          f.pos.y = gy;
          const st = u / fr;
          f.pitch = smoothstep(0.55, 1, st) * (back ? -12 : 34);
          f.target = _v3.copy(f.pos);
        } else {
          const st = (u - fr) / (1 - fr);
          if (f.planted) { f.planted = false; f.liftRel = (f.pos.x - s.x) * mdir; }
          const hs = lerp(0.45, 1, sp);
          const xs = [f.liftRel, f.liftRel - 0.06 * hs, -0.12, L / 2 + 0.14 * hs, L / 2];
          const ys = [0, 0.22 * hs, 0.42 * hs, 0.17 * hs, 0];
          const rel = curve(xs, st);
          const h = Math.max(0, curve(ys, st));
          f.target = _v3.set(s.x + mdir * rel, gy + h, lat.z);
          f.pos.copy(f.target);
          f.pitch = lerp(45, -18, smoothstep(0.1, 0.85, st)) * (1 - smoothstep(0.85, 1, st)) * (back ? -0.5 : 1);
        }
      }
    } else {
      // Reposo: pasos cortos para recolocar los pies (§12.5 frenado y apoyo).
      if (this.gait) {
        for (const k of ['L', 'R']) {
          const f = feet[k];
          if (!f.planted) { f.swing = { from: f.pos.clone(), t: 0, dur: 0.14 }; }
        }
        this.gait = false;
      }
      const restRel = o.restRel;
      const anySwing = feet.L.swing || feet.R.swing;
      for (const k of ['L', 'R']) {
        const f = feet[k];
        const lat = this.footLateral(f.side, _v2);
        const rx = s.x + dir * restRel[k];
        if (f.swing) {
          f.swing.t += dt;
          const t = clamp(f.swing.t / f.swing.dur, 0, 1);
          const e = easeInOutSine(t);
          f.pos.set(lerp(f.swing.from.x, rx, e), gy + Math.sin(t * Math.PI) * 0.07, lerp(f.swing.from.z, lat.z, e));
          f.pitch = Math.sin(t * Math.PI) * 15;
          if (t >= 1) { f.swing = null; f.planted = true; f.pos.y = gy; this.events.push({ type: 'step', side: k, speed: 1 }); }
        } else {
          f.pos.y = gy;
          f.pitch = damp(f.pitch, 0, 0.05, dt);
          const off = Math.abs(f.pos.x - rx) + Math.abs(f.pos.z - lat.z) * 0.5;
          if (!anySwing && off > 0.09 && !s.attack) {
            f.swing = { from: f.pos.clone(), t: 0, dur: 0.17 };
            f.planted = false;
          } else if (s.skid) {
            // el patinazo arrastra los pies con la inercia
            f.pos.x += s.vx * dt * 0.85;
          }
        }
      }
    }
    this.solveLegs(dir);
  }

  dtScale(dt) { return dt; }

  // Calcula el tobillo objetivo de cada pie, baja la pelvis si hace falta y resuelve ambas piernas.
  solveLegs(dir) {
    const b = this.b, o = this.opts;
    const targets = {};
    let drop = 0;
    for (const k of ['L', 'R']) {
      const f = this.feet[k];
      const p = f.pitch * DEG;
      const ballF = 0.15, ballD = 0.065;
      const ax = -ballF, ay = ballD;
      const rx = ax * Math.cos(p) + ay * Math.sin(p);
      const ry = -ax * Math.sin(p) + ay * Math.cos(p);
      const t = new THREE.Vector3(f.pos.x + dir * (ballF + rx) - dir * 0.02, f.pos.y + ry + (o.ankleH - ballD), f.pos.z);
      targets[k] = t;
      b['thigh' + k].getWorldPosition(_v);
      const reach = o.legLen * 0.985;
      const dx = Math.hypot(t.x - _v.x, t.z - _v.z);
      const needY = t.y + Math.sqrt(Math.max(reach * reach - dx * dx, 0.01));
      drop = Math.min(drop, needY - _v.y);
    }
    if (drop < -0.0005) {
      b.hips.position.y += Math.max(drop, -0.35);
      this.root.updateMatrixWorld(true);
    }
    const fwd = this.toWorldDir(new THREE.Vector3(0, -0.15, 1), new THREE.Vector3());
    for (const k of ['L', 'R']) {
      const f = this.feet[k];
      b['thigh' + k].getWorldPosition(_v);
      const pole = _v.clone().add(fwd);
      solveTwoBone(b['thigh' + k], b['shin' + k], b['foot' + k], targets[k], pole, 1);
      const p = f.pitch * DEG;
      _q.setFromAxisAngle(UP, this.yaw);
      _q2.setFromAxisAngle(_v2.set(1, 0, 0), p);
      _q.multiply(_q2);
      setBoneWorldQuaternion(b['foot' + k], _q);
      b['toe' + k].quaternion.setFromAxisAngle(_v2.set(1, 0, 0), -p * 0.75);
      b['toe' + k].updateMatrixWorld(true);
    }
  }

  // ---- Espada -----------------------------------------------------------------
  solveSwordArm(target, dt, twoHands) {
    const b = this.b;
    const gripW = this.toWorldPoint(_v.fromArray(target.hand), new THREE.Vector3());
    const bladeW = this.toWorldDir(_v.fromArray(target.blade).normalize(), new THREE.Vector3());
    // Filo orientado hacia el movimiento de la punta.
    const tipPred = gripW.clone().addScaledVector(bladeW, 0.85);
    const mv = tipPred.clone().sub(this.prevTip);
    this.prevTip.copy(tipPred);
    // Legibilidad 2.5D: el filo se mantiene en el plano de pantalla (la cara plana mira a cámara)
    // y apunta hacia donde avanza la punta.
    const edgeT = new THREE.Vector3(-bladeW.y, bladeW.x, 0);
    if (edgeT.lengthSq() < 1e-4) edgeT.copy(this.edge);
    edgeT.normalize();
    if (mv.length() > 0.012) { if (edgeT.dot(mv) < 0) edgeT.negate(); }
    else if (edgeT.dot(this.edge) < 0) edgeT.negate();
    if (this.edge.dot(edgeT) < -0.3) this.edge.copy(edgeT); // espada de doble filo: invertir es simétrico
    else this.edge.lerp(edgeT, clamp(dt * 22, 0, 1));
    this.edge.addScaledVector(bladeW, -this.edge.dot(bladeW)).normalize();
    const E = this.edge;
    const aL = this.swordAxisL, eL = this.swordEdgeL;
    const cL = new THREE.Vector3().crossVectors(aL, eL);
    const cW = new THREE.Vector3().crossVectors(bladeW, E);
    _m1.makeBasis(aL, eL, cL);
    _m2.makeBasis(bladeW, E, cW);
    _m2.multiply(_m1.transpose());
    const handQ = new THREE.Quaternion().setFromRotationMatrix(_m2);
    const wrist = gripW.clone().sub(this.gripL.clone().applyQuaternion(handQ));
    b.armR.getWorldPosition(_v);
    const pole = _v.clone().add(this.toWorldDir(new THREE.Vector3(-0.5, -0.5, -0.35), new THREE.Vector3()));
    solveTwoBone(b.armR, b.foreR, b.handR, wrist, pole, 1);
    setBoneWorldQuaternion(b.handR, handQ);
    // Posiciones de la hoja para combate y estela.
    const sw = this.m.sword;
    sw.group.updateMatrixWorld(true);
    this.bladeBase.copy(sw.base).applyMatrix4(sw.group.matrixWorld);
    this.bladeTip.copy(sw.tip).applyMatrix4(sw.group.matrixWorld);
    if (twoHands > 0.05) {
      const lgrip = gripW.clone().addScaledVector(bladeW, -this.opts.twoHandOffset);
      const lw = lgrip.clone().sub(this.gripL.clone().applyQuaternion(handQ));
      b.armL.getWorldPosition(_v);
      const poleL = _v.clone().add(this.toWorldDir(new THREE.Vector3(0.5, -0.5, -0.35), new THREE.Vector3()));
      solveTwoBone(b.armL, b.foreL, b.handL, lw, poleL, twoHands);
      setBoneWorldQuaternion(b.handL, handQ);
    }
  }

  solveHang(s) {
    const b = this.b;
    if (!s.ledge) return;
    const t = s.mode === 'mantle' ? clamp(s.modeT / s.modeDur, 0, 1) : 0;
    const w = 1 - smoothstep(0.5, 0.85, t);
    if (w <= 0) return;
    const dir = s.facing >= 0 ? 1 : -1;
    const lat = this.footLateral(1, new THREE.Vector3());
    const target = new THREE.Vector3(s.ledge.x + dir * 0.02, s.ledge.y + 0.02, 0).add(lat.clone().multiplyScalar(1.4));
    b.armL.getWorldPosition(_v);
    const pole = _v.clone().add(new THREE.Vector3(-dir * 0.4, -0.6, 0));
    solveTwoBone(b.armL, b.foreL, b.handL, target, pole, w);
  }

  solveReach(s) {
    const b = this.b;
    const t = clamp(s.modeT / s.modeDur, 0, 1);
    const w = smoothstep(0.15, 0.4, t) * (1 - smoothstep(0.6, 0.9, t));
    if (w <= 0) return;
    const p = s.interact.point;
    b.armL.getWorldPosition(_v);
    const pole = _v.clone().add(new THREE.Vector3(0, -0.6, -0.3));
    solveTwoBone(b.armL, b.foreL, b.handL, new THREE.Vector3(p.x, p.y, p.z ?? 0.1), pole, w);
  }

  updateBlink(dt) {
    const eyes = this.m.eyes;
    if (!eyes) return;
    this.blink.t += dt;
    let c = 0;
    if (this.blink.t > this.blink.next) {
      const u = (this.blink.t - this.blink.next) / 0.13;
      c = u < 1 ? Math.sin(u * Math.PI) : 0;
      if (u >= 1) { this.blink.t = 0; this.blink.next = 2.2 + Math.random() * 3.2; }
    }
    for (const e of eyes) e.lid.rotation.x = -0.35 + c * 0.95;
  }

  updateTail(dt) {
    if (!this.tail) return;
    const head = this.b.head;
    const anchor = head.localToWorld(_v.set(0, 0.195, -0.118));
    let prev = anchor.clone();
    const segLen = 0.045;
    for (let i = 0; i < this.tail.length; i++) {
      const n = this.tail[i];
      if (!n.init) { n.p.copy(prev).y -= segLen; n.prev.copy(n.p); n.init = true; }
      const vel = n.p.clone().sub(n.prev).multiplyScalar(0.86);
      n.prev.copy(n.p);
      n.p.add(vel).add(new THREE.Vector3(0, -9.8 * dt * dt, 0));
      const d = n.p.clone().sub(prev);
      const len = d.length() || 1e-4;
      n.p.copy(prev).addScaledVector(d, segLen / len);
      const mesh = this.m.tail[i];
      if (!mesh.parent) this.root.parent && this.root.parent.add(mesh);
      mesh.position.copy(prev);
      _q.setFromUnitVectors(new THREE.Vector3(0, -1, 0), d.normalize());
      mesh.quaternion.copy(_q);
      prev = n.p.clone();
    }
  }

  // Reinicia estados físicos secundarios (teletransporte / reaparición, §12.10).
  reset() {
    this.feet.L.init = false; this.feet.R.init = false;
    this.landSpring.x = 0; this.landSpring.v = 0;
    if (this.tail) for (const n of this.tail) n.init = false;
    this.prevTip.set(0, 0, 0);
  }
}
