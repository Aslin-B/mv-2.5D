import * as THREE from 'three';
import { moveBody, probeGround, depenetrate } from '../physics2d/world.js';
import { Animator } from '../animation/animator.js';
import { makePose } from '../animation/poses.js';
import { Cape } from '../render/cloth.js';
import { approach, sign } from '../core/math.js';

// Saqueador del puente: máquina de estados de la biblia §15.2 (patrulla, aviso, aproximación,
// reposición, preparación, ataque, recuperación, aturdimiento, búsqueda, regreso, derrota).
// La percepción solo produce información; la decisión elige una intención; el controlador la
// ejecuta con las mismas colisiones que el héroe. No abandona su zona (no persigue por todo el mapa)
// y nunca camina hacia un borde sin suelo.

export const MARAUDER = {
  w: 0.5, h: 1.7, hp: 100,
  patrolSpeed: 1.3, approachSpeed: 2.6, retreatSpeed: 3.4,
  sightFront: 9, sightBack: 3.5, sightY: 2.4,
  prefer: 2.0, tooClose: 1.15, attackMin: 1.2, attackMax: 2.6,
  reaction: 0.45, forget: 2.5,
  thrustDamage: 1,
};

// Guardia baja con la lanza nivelada, hombro izquierdo adelantado.
export const MARAUDER_POSES = {
  idle: makePose({
    hip: [0, -0.085, 0], hips: [4, -10, 0], spine: [16, -12, 0], chest: [8, -16, 0], neck: [-10, 14, 0], head: [-8, 12, 0],
    clavL: [0, 0, -2], armL: [-40, -10, -10], foreL: [-60, 0, 0], clavR: [0, 0, 2],
    thighL: [-8, 0, 3], shinL: [14, 0, 0], thighR: [-4, 0, -3], shinR: [14, 0, 0],
  }),
};

// Mano trasera (derecha) y dirección del asta hacia la punta, en espacio del personaje.
export const MARAUDER_CARRY = {
  idle: { hand: [-0.13, 1.0, 0.06], blade: [0.14, 0.2, 0.97] },
  run: { hand: [-0.15, 1.02, 0.0], blade: [0.12, 0.32, 0.94] },
  jump: { hand: [-0.13, 1.05, 0.06], blade: [0.14, 0.3, 0.94] },
  fall: { hand: [-0.13, 1.05, 0.06], blade: [0.14, 0.3, 0.94] },
  hit: { hand: [-0.2, 1.12, -0.06], blade: [0.12, 0.72, 0.68] },
  kneel: { hand: [-0.25, 0.7, 0.2], blade: [0.12, 0.15, 0.98] },
  dead: { hand: [-0.42, 0.3, 0.22], blade: [0.25, -0.05, 0.97] },
};

// Estocada con preparación larga y legible (postura, sonido y destello en la punta, §14.5).
export const MARAUDER_ATTACKS = {
  thrust: {
    duration: 1.22, active: [0.66, 0.8], damage: MARAUDER.thrustDamage, comboFrom: 9,
    keys: [
      { t: 0.0, hand: [-0.13, 1.0, 0.06], blade: [0.14, 0.2, 0.97], body: {} },
      { t: 0.25, hand: [-0.22, 1.16, -0.22], blade: [0.1, 0.06, 0.99], body: { spine: [-4, -22, 0], chest: [-6, -22, 0], hip: [0, -0.04, -0.08] } },
      { t: 0.56, hand: [-0.24, 1.18, -0.3], blade: [0.08, 0.02, 1.0], body: { spine: [-6, -28, 0], chest: [-8, -26, 0], neck: [6, 18, 0], hip: [0, -0.09, -0.12] } },
      { t: 0.66, hand: [-0.12, 1.12, 0.3], blade: [0.05, -0.02, 1.0], body: { spine: [16, 6, 0], chest: [10, 12, 0], hip: [0, -0.11, 0.12] } },
      { t: 0.75, hand: [-0.06, 1.1, 0.62], blade: [0.03, -0.04, 1.0], body: { spine: [22, 14, 0], chest: [12, 18, 0], hip: [0, -0.13, 0.2] } },
      { t: 0.92, hand: [-0.08, 1.08, 0.55], blade: [0.04, -0.02, 1.0], body: { spine: [20, 12, 0], chest: [10, 16, 0], hip: [0, -0.12, 0.17] } },
      { t: 1.22, hand: [-0.13, 1.0, 0.06], blade: [0.14, 0.2, 0.97], body: {} },
    ],
  },
  // Retroceso tras una parada precisa: el asta sale despedida hacia arriba y el cuerpo cede.
  recoil: {
    duration: 1.05, active: [0, 0], damage: 0, comboFrom: 9,
    keys: [
      { t: 0.0, hand: [-0.06, 1.1, 0.55], blade: [0.03, -0.04, 1.0], body: {} },
      { t: 0.1, hand: [-0.26, 1.45, -0.04], blade: [0.12, 0.92, -0.37], body: { spine: [-18, 10, 0], chest: [-14, 12, 0], neck: [12, 0, 0], hip: [0, -0.07, -0.13] } },
      { t: 0.75, hand: [-0.25, 1.38, 0.0], blade: [0.12, 0.86, -0.3], body: { spine: [-12, 8, 0], chest: [-10, 8, 0], neck: [8, 0, 0], hip: [0, -0.1, -0.1] } },
      { t: 1.05, hand: [-0.13, 1.0, 0.06], blade: [0.14, 0.2, 0.97], body: {} },
    ],
  },
};

export class Marauder {
  constructor(game, model, { x, y, x0, x1, facing = -1, name = 'saqueador' }) {
    this.game = game;
    this.name = name;
    this.model = model;
    this.body = { x, y, w: MARAUDER.w, h: MARAUDER.h, dropThrough: false };
    this.home = { x, y, x0, x1 };
    this.vx = 0; this.vy = 0;
    this.facing = facing;
    this.grounded = false;
    this.hp = MARAUDER.hp;
    this.state = 'patrol'; this.stateT = 0;
    this.mode = 'ground'; this.modeT = 0; this.modeDur = 1;
    this.attack = null;
    this.cooldown = 0.6;
    this.seen = false; this.unseenT = 99;
    this.lastSeenX = x;
    this.patrolDir = facing;
    this.flash = 0;
    this.alerted = false;
    this.tellDone = false;
    this.hitThisAttack = false;
    this.deadT = 0;
    game.scene.add(model.root);
    this.anim = new Animator(model, {
      yawSide: 1.36, turnTime: 0.2, hasSword: true, alwaysTwoHands: true, twoHandOffset: -0.36,
      carry: MARAUDER_CARRY, attacks: MARAUDER_ATTACKS, poses: MARAUDER_POSES,
      restRel: { L: 0.16, R: -0.14 }, stanceW: 0.12, cadence: 1.75,
    });
    this.cape = new Cape(model, game.scene, { cols: 5, rows: 8, length: 0.58, palette: { base: '#5a1d17', hem: '#2c0f0c', ragged: true } });
    // Pose inicial resuelta antes del primer fotograma
    this.anim.update(1 / 60, this.animState());
  }

  get x() { return this.body.x; }
  get y() { return this.body.y; }
  get alive() { return this.state !== 'dead'; }

  hurtbox() {
    const b = this.body;
    return { x0: b.x - 0.3, x1: b.x + 0.3, y0: b.y, y1: b.y + b.h };
  }

  setState(s) { this.state = s; this.stateT = 0; }

  // ---- Percepción -----------------------------------------------------------
  perceive() {
    const hero = this.game.hero;
    const dx = hero.x - this.body.x, dy = hero.y - this.body.y;
    const front = sign(dx) === this.facing || Math.abs(dx) < 0.3;
    const range = front ? MARAUDER.sightFront : MARAUDER.sightBack;
    let seen = hero.mode !== 'dead' && Math.abs(dx) < range && Math.abs(dy) < MARAUDER.sightY;
    if (seen) {
      const ey = this.body.y + 1.6;
      if (this.game.physics.segmentBlocked(this.body.x, ey, hero.x, hero.y + 1.2)) seen = false;
    }
    this.seen = seen;
    if (seen) { this.unseenT = 0; this.lastSeenX = hero.x; }
    return { dx, dy };
  }

  // ¿Hay suelo y zona propia en la dirección indicada?
  canStep(dir) {
    const b = this.body;
    const ahead = b.x + dir * (b.w / 2 + 0.35);
    if (ahead < this.home.x0 || ahead > this.home.x1) return false;
    const g = this.game.physics.groundBelow(ahead, b.y + 0.3, 0.9);
    return !!g;
  }

  update(dt) {
    const M = MARAUDER;
    this.stateT += dt;
    this.modeT += dt;
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 10);
    for (const m of this.model.materials) m.userData.rimColor.value.setRGB(this.flash * 0.62, this.flash * 0.36, this.flash * 0.18);

    if (this.state === 'dead') {
      this.deadT += dt;
      this.vx = approach(this.vx, 0, 10 * dt);
      this.physics(dt);
      return;
    }
    this.unseenT += dt;
    const { dx, dy } = this.perceive();
    const hero = this.game.hero;
    let want = 0; // velocidad horizontal deseada
    const faceHero = () => { if (Math.abs(dx) > 0.2) this.facing = sign(dx); };

    switch (this.state) {
      case 'idle':
        if (this.seen) { this.setState('notice'); break; }
        if (this.stateT > 1.2) { this.patrolDir = -this.patrolDir; this.setState('patrol'); }
        break;
      case 'patrol': {
        if (this.seen) { this.setState('notice'); break; }
        this.facing = this.patrolDir;
        if (!this.canStep(this.patrolDir) || (this.patrolDir > 0 ? this.body.x > this.home.x1 - 1 : this.body.x < this.home.x0 + 1)) {
          this.setState('idle');
        } else want = this.patrolDir * M.patrolSpeed;
        break;
      }
      case 'notice':
        faceHero();
        if (!this.alerted) { this.alerted = true; this.game.events.emit('enemyAlert', { who: this }); }
        if (this.stateT > M.reaction) this.setState('approach');
        break;
      case 'approach': {
        faceHero();
        const d = Math.abs(dx);
        if (this.unseenT > M.forget) { this.setState('search'); break; }
        if (!this.seen) { want = sign(this.lastSeenX - this.body.x) * M.patrolSpeed; break; }
        if (d < M.tooClose && this.cooldown < 0.8) { this.setState('reposition'); break; }
        if (d >= M.attackMin && d <= M.attackMax && Math.abs(dy) < 0.9 && this.cooldown <= 0 && hero.mode !== 'dead') {
          this.startThrust(); break;
        }
        if (d > M.prefer + 0.25) want = this.facing * M.approachSpeed;
        else if (d < M.prefer - 0.45) want = -this.facing * M.patrolSpeed;
        break;
      }
      case 'reposition':
        faceHero();
        want = -this.facing * M.retreatSpeed;
        if (this.stateT > 0.42) this.setState('approach');
        break;
      case 'attack': {
        const a = this.attack;
        a.t += dt;
        const A = MARAUDER_ATTACKS.thrust;
        if (!this.tellDone && a.t >= 0.4) {
          this.tellDone = true;
          this.game.events.emit('enemyTell', { who: this, tip: this.anim.bladeTip.clone() });
        }
        // embestida: el cuerpo acompaña la estocada (respeta bordes)
        if (a.t >= 0.6 && a.t <= 0.78) want = this.facing * 5.2;
        if (a.t >= A.duration) {
          this.attack = null;
          this.cooldown = 1.0 + this.game.rng() * 0.7;
          this.setState('approach');
        }
        break;
      }
      case 'parried':
        this.attack.t += dt;
        want = -this.facing * 0.6 * Math.max(0, 1 - this.stateT * 3);
        if (this.attack.t >= MARAUDER_ATTACKS.recoil.duration) { this.attack = null; this.cooldown = 0.5; this.setState('approach'); }
        break;
      case 'stagger':
        if (this.modeT >= this.modeDur) { this.mode = 'ground'; this.cooldown = Math.max(this.cooldown, 0.35); this.setState('approach'); }
        break;
      case 'search':
        if (this.seen) { this.setState('notice'); break; }
        if (Math.floor(this.stateT / 0.8) % 2 === 1) this.facing = -sign(this.lastSeenX - this.body.x || 1);
        else this.facing = sign(this.lastSeenX - this.body.x || 1);
        if (this.stateT > 2.0) this.setState('return');
        break;
      case 'return': {
        if (this.seen) { this.setState('notice'); break; }
        const hd = this.home.x - this.body.x;
        this.facing = sign(hd) || this.facing;
        want = sign(hd) * M.patrolSpeed;
        if (Math.abs(hd) < 0.3) { this.alerted = false; this.setState('patrol'); }
        break;
      }
      default: break;
    }

    // Controlador: aceleración limitada, nunca hacia un borde sin suelo ni fuera de su zona.
    if (want !== 0 && !this.canStep(sign(want))) want = 0;
    if (this.state === 'stagger') this.vx = approach(this.vx, 0, 9 * dt);
    else this.vx = approach(this.vx, want, (Math.abs(want) > Math.abs(this.vx) ? 16 : 22) * dt);
    if (this.vx !== 0 && !this.canStep(sign(this.vx)) && this.grounded) this.vx = 0;
    this.physics(dt);
  }

  physics(dt) {
    const b = this.body, world = this.game.physics;
    if (!this.grounded) this.vy = Math.max(this.vy - 24 * 1.3 * dt, -17);
    const res = moveBody(world, b, this.vx * dt, this.grounded ? -0.02 : this.vy * dt, { stepUp: 0.3, grounded: this.grounded });
    if (res.left || res.right) this.vx = 0;
    if (res.ground) { this.grounded = true; this.vy = 0; }
    else if (this.grounded) {
      const g = probeGround(world, b, 0.05);
      if (g) b.y = g.y1; else this.grounded = false;
    }
    depenetrate(world, b);
  }

  startThrust() {
    this.setState('attack');
    this.attack = { id: 'thrust', t: 0 };
    this.tellDone = false;
    this.hitThisAttack = false;
    this.game.events.emit('enemyWindup', { who: this });
  }

  attackActive() {
    if (this.state !== 'attack' || !this.attack || this.hitThisAttack) return false;
    const A = MARAUDER_ATTACKS.thrust;
    return this.attack.t >= A.active[0] && this.attack.t <= A.active[1];
  }

  spearSegment() { return { a: this.anim.bladeBase, b: this.anim.bladeTip }; }

  // Devuelve 'dead' | 'armor' | 'stagger'
  takeHit(dmg, fromX, { heavy = false, light = false } = {}) {
    if (this.state === 'dead') return null;
    this.hp -= dmg;
    this.flash = light ? 0.6 : 1;
    const dir = sign(this.body.x - fromX) || -this.facing;
    if (this.hp <= 0) {
      this.hp = 0;
      this.attack = null;
      this.setState('dead');
      this.mode = 'dead'; this.modeT = 0; this.modeDur = 1.6;
      this.vx = dir * 3.5;
      this.game.events.emit('enemyDead', { who: this, x: this.body.x, y: this.body.y });
      return 'dead';
    }
    // Saetas ligeras: duelen y avisan, pero no aturden (solo la carga o el cuerpo a cuerpo lo hacen).
    if (light) {
      this.vx += dir * 0.7;
      if (!this.alerted) { this.alerted = true; this.game.events.emit('enemyAlert', { who: this }); }
      if (this.state === 'patrol' || this.state === 'idle' || this.state === 'search' || this.state === 'return') this.setState('notice');
      this.unseenT = 0; this.lastSeenX = fromX;
      if (this.state !== 'attack' && this.state !== 'stagger') this.facing = -dir;
      return 'light';
    }
    // Compromiso: a mitad de la preparación solo un golpe pesado interrumpe la estocada.
    if (this.state === 'attack' && this.attack && this.attack.t > 0.3 && this.attack.t < 0.82 && !heavy) {
      this.vx += dir * 0.6;
      return 'armor';
    }
    this.attack = null;
    this.facing = -dir;
    this.setState('stagger');
    this.mode = 'hit'; this.modeT = 0; this.modeDur = heavy ? 0.62 : 0.38;
    this.vx = dir * (heavy ? 5 : 3.2);
    if (!this.alerted) { this.alerted = true; this.game.events.emit('enemyAlert', { who: this }); }
    this.unseenT = 0; this.lastSeenX = fromX;
    return 'stagger';
  }

  onParried() {
    this.hitThisAttack = true;
    this.attack = { id: 'recoil', t: 0 };
    this.setState('parried');
    this.mode = 'ground';
  }

  animState() {
    const b = this.body;
    let mode = 'ground';
    if (this.state === 'dead') mode = 'dead';
    else if (this.mode === 'hit') mode = 'hit';
    else if (!this.grounded) mode = 'air';
    const hero = this.game.hero;
    const look = this.state !== 'patrol' && this.state !== 'idle' && this.state !== 'dead' && hero
      ? new THREE.Vector3(hero.x, hero.y + 1.5, 0) : null;
    return {
      x: b.x, y: b.y, vx: this.vx, vy: this.vy, facing: this.facing, mode,
      modeT: this.state === 'dead' ? this.deadT : this.modeT, modeDur: this.modeDur, groundY: b.y,
      attack: this.attack ? { id: this.attack.id, t: this.attack.t } : null,
      skid: false, landImpact: 0, ledge: null, interact: null, look,
    };
  }

  // Visuales: animador y tela, dentro del paso fijo.
  animate(dt, windX) {
    if (this.state === 'dead' && this.deadT > 3) return; // cuerpo en reposo: congelar
    this.anim.update(dt, this.animState());
    this.cape.step(dt, windX);
  }
}

