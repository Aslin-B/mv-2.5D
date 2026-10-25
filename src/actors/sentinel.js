import * as THREE from 'three';
import { clamp, sign, damp } from '../core/math.js';

// Vigía de bronce: autómata volador del acueducto. Flota a media distancia, avisa con el ojo
// (carga visible de 0,65 s) y lanza un orbe lento que se puede esquivar con el paso etéreo o
// devolver con el golpe de éter. Enseña el ritmo «leer, desviar, castigar» a distancia.
// Su color de acento es magenta: el lenguaje cromático separa lo hostil del cian de Aren.

const EYE = new THREE.Color(2.6, 0.45, 1.5);
const TUNE = { hp: 45, speed: 2.6, accel: 5, sight: 13, keep: 5.8, windup: 0.65, cooldown: 2.1, orbSpeed: 7.5, orbDamage: 15 };

function buildSentinelModel(mats, tex) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const bronze = mats.bronze;
  const dark = new THREE.MeshStandardMaterial({ color: '#17141a', metalness: 0.6, roughness: 0.35 });
  // campana de bronce con nervios (perfil torneado) y núcleo de obsidiana
  const prof = [[0.0, -0.46], [0.07, -0.44], [0.12, -0.34], [0.2, -0.24], [0.3, -0.08], [0.34, 0.06], [0.33, 0.16], [0.26, 0.26], [0.14, 0.32], [0.0, 0.34]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const bell = new THREE.Mesh(new THREE.LatheGeometry(prof, 20), bronze);
  body.add(bell);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.5, 0.05), bronze);
    rib.position.set(Math.cos(a) * 0.31, -0.06, Math.sin(a) * 0.31);
    rib.rotation.y = -a;
    rib.rotation.z = Math.cos(a) * 0.25;
    body.add(rib);
  }
  const crown = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 6), dark);
  crown.position.y = 0.44;
  body.add(crown);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 6), dark);
  tip.position.y = -0.56; tip.rotation.x = Math.PI;
  body.add(tip);
  // ojo: lente oscura con iris luminoso
  const socket = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.03, 8, 20), dark);
  const irisMat = new THREE.MeshBasicMaterial({ color: EYE.clone().multiplyScalar(0.5), fog: false });
  const iris = new THREE.Mesh(new THREE.CircleGeometry(0.1, 20), irisMat);
  const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12), new THREE.MeshBasicMaterial({ color: '#fff4fb', fog: false }));
  const eye = new THREE.Group();
  socket.position.z = 0.01; pupil.position.z = 0.012;
  eye.add(socket, iris, pupil);
  eye.position.set(0, 0.04, 0.335);
  body.add(eye);
  // anillos giroscópicos y aletas
  const ringA = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.022, 6, 36), bronze);
  const ringB = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.018, 6, 32), dark);
  root.add(ringA, ringB);
  const fins = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.012), bronze);
    f.geometry.translate(0.42, 0, 0);
    f.rotation.z = (i / 3) * Math.PI * 2;
    fins.add(f);
  }
  fins.position.z = -0.32;
  body.add(fins);
  // esquirlas de piedra en órbita
  const shards = [];
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.TetrahedronGeometry(0.07 + (i % 2) * 0.03, 0), mats.stone);
    root.add(s);
    shards.push(s);
  }
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.dot, color: EYE.clone().multiplyScalar(0.14), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  halo.scale.setScalar(1.6);
  root.add(halo);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.renderOrder = 3; } });
  return { root, body, eye, irisMat, ringA, ringB, fins, shards, halo, materials: [bronze, dark] };
}

export class Sentinel {
  constructor(game, { x, y, x0, x1, name = 'vigía' }) {
    this.game = game;
    this.name = name;
    this.home = { x, y };
    this.range = { x0, x1 };
    this.model = buildSentinelModel(game.level.mats, game.tex);
    game.scene.add(this.model.root);
    this.reset();
  }

  reset() {
    this.px = this.home.x; this.py = this.home.y;
    this.vx = 0; this.vy = 0;
    this.hp = TUNE.hp;
    this.state = 'idle';
    this.alerted = false;
    this.t = Math.random() * 10;
    this.cool = 0.9;
    this.wind = 0;
    this.flash = 0;
    this.facing = -1;
    this.deadT = 0;
    this.model.root.visible = true;
    this.model.root.scale.setScalar(1);
    // colocado ya en su puesto: animate() solo corre cerca de la cámara
    this.model.root.position.set(this.px, this.py, 0.2);
    this.model.halo.visible = true;
  }

  get x() { return this.px; }
  get y() { return this.py; }
  get alive() { return this.state !== 'dead'; }
  hurtbox() { return { x0: this.px - 0.4, x1: this.px + 0.4, y0: this.py - 0.48, y1: this.py + 0.42 }; }
  eyePos() { return { x: this.px + this.facing * 0.3, y: this.py + 0.04 }; }

  takeHit(dmg, fromX, { heavy = false } = {}) {
    if (!this.alive) return null;
    this.hp -= dmg;
    this.flash = 1;
    const dir = sign(this.px - fromX) || -this.facing;
    this.vx += dir * (heavy ? 5 : 1.6);
    this.vy += heavy ? 1.2 : 0.4;
    if (!this.alerted) { this.alerted = true; this.game.events.emit('enemyAlert', { who: this }); }
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = 'dead';
      this.deadT = 0;
      this.game.events.emit('enemyDead', { who: this, x: this.px, y: this.py - 0.4 });
      const g = this.game;
      g.burst(g.fx.arcane, this.px, this.py, 40, [EYE.r, EYE.g, EYE.b], 5, 0.5);
      g.burst(g.fx.sparks, this.px, this.py, 26, [1, 0.75, 0.45], 6, 0.45);
      g.glint(new THREE.Vector3(this.px, this.py, 0.4), 0.4, 1.4);
      return 'dead';
    }
    // un golpe pesado corta la carga del ojo
    if (heavy && this.state === 'windup') { this.state = 'hunt'; this.wind = 0; this.cool = 1.2; return 'stagger'; }
    return heavy ? 'stagger' : 'light';
  }

  update(dt) {
    const g = this.game, hero = g.hero;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 4);
    if (!this.alive) { this.deadT += dt; return; }
    const hx = hero.x, hy = hero.y + 1.0;
    const dx = hx - this.px, dy = hy - this.py;
    const dist = Math.hypot(dx, dy);
    const sees = hero.mode !== 'dead' && dist < TUNE.sight && !g.physics.segmentBlocked(this.px, this.py, hx, hy);
    if (sees && !this.alerted) { this.alerted = true; g.events.emit('enemyAlert', { who: this }); }
    if (this.alerted && dist > TUNE.sight * 1.5) { this.alerted = false; this.state = 'idle'; }
    // posición deseada: a distancia de tiro del héroe, dentro de su tramo; en reposo, vuelve a casa
    let tx = this.home.x, ty = this.home.y + Math.sin(this.t * 1.3) * 0.25;
    if (this.alerted) {
      const side = this.px < hx ? -1 : 1;
      tx = clamp(hx + side * TUNE.keep, this.range.x0, this.range.x1);
      ty = this.home.y + Math.sin(this.t * 1.7) * 0.35;
      this.facing = sign(dx) || this.facing;
    }
    const slow = this.state === 'windup' ? 0.25 : 1;
    const ax = clamp((tx - this.px) * 2.2 - this.vx * 1.6, -TUNE.accel, TUNE.accel);
    const ay = clamp((ty - this.py) * 2.6 - this.vy * 1.8, -TUNE.accel, TUNE.accel);
    this.vx = clamp(this.vx + ax * dt, -TUNE.speed * slow, TUNE.speed * slow);
    this.vy = clamp(this.vy + ay * dt, -TUNE.speed, TUNE.speed);
    this.px += this.vx * dt; this.py += this.vy * dt;
    // disparo
    if (this.alerted && sees) {
      if (this.state !== 'windup') {
        this.state = 'hunt';
        this.cool -= dt;
        if (this.cool <= 0) { this.state = 'windup'; this.wind = 0; g.events.emit('enemyWindup', { who: this }); }
      } else {
        this.wind += dt;
        if (Math.random() < 0.6) {
          const e = this.eyePos(), a = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * 0.3;
          g.fx.arcane.emit({ x: e.x + Math.cos(a) * r, y: e.y + Math.sin(a) * r, z: 0.35, vx: -Math.cos(a) * r * 4, vy: -Math.sin(a) * r * 4, life: 0.22, size: 0.05, grow: -0.1, drag: 0, gravity: 0, color: [EYE.r, EYE.g, EYE.b], alpha: 0.85 });
        }
        if (this.wind >= TUNE.windup) this.fire();
      }
    } else if (this.state === 'windup') {
      this.state = 'hunt'; this.wind = 0; this.cool = 0.8;
    }
  }

  fire() {
    const g = this.game, hero = g.hero;
    const e = this.eyePos();
    let dx = hero.x - e.x, dy = hero.y + 1.0 - e.y;
    const l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    g.projectiles.fire({ x: e.x, y: e.y, dx, dy, kind: 'orb', speed: TUNE.orbSpeed, damage: TUNE.orbDamage, life: 3.2, owner: 'enemy', source: this });
    g.audio.play('orb');
    this.state = 'hunt';
    this.wind = 0;
    this.cool = TUNE.cooldown + Math.random() * 0.5;
    this.vx -= dx * 1.2;
  }

  animate(dt) {
    const m = this.model;
    if (!this.alive) {
      // se apaga y cae girando antes de desaparecer
      const k = Math.min(1, this.deadT / 0.5);
      m.root.position.set(this.px, this.py - k * k * 1.2, 0.2);
      m.root.rotation.z += dt * 9;
      m.root.scale.setScalar(Math.max(0.01, 1 - k));
      m.irisMat.color.setRGB(0.05, 0.02, 0.04);
      m.halo.visible = false;
      if (k >= 1) m.root.visible = false;
      return;
    }
    m.halo.visible = true;
    m.root.position.set(this.px, this.py, 0.2);
    m.root.rotation.z = damp(m.root.rotation.z, -this.vx * 0.12, 0.15, dt);
    // el ojo mira hacia el héroe: la campana gira sobre Y (de perfil a tres cuartos)
    const yaw = this.facing > 0 ? 0.95 : -0.95;
    m.body.rotation.y = damp(m.body.rotation.y, yaw, 0.12, dt);
    m.ringA.rotation.set(this.t * 1.1, this.t * 0.7, 0);
    m.ringB.rotation.set(-this.t * 0.6, 0, this.t * 1.3);
    m.fins.rotation.z += dt * (this.state === 'windup' ? 14 : 4);
    m.shards.forEach((s, i) => {
      const a = this.t * (0.9 + i * 0.17) + (i * Math.PI) / 2;
      s.position.set(Math.cos(a) * 0.72, Math.sin(a * 1.3) * 0.18 - 0.1, Math.sin(a) * 0.5);
      s.rotation.set(a * 2, a, 0);
    });
    const w = this.state === 'windup' ? this.wind / TUNE.windup : 0;
    const glow = 0.5 + w * 1.6 + this.flash * 0.8;
    m.irisMat.color.copy(EYE).multiplyScalar(glow);
    if (this.flash > 0) m.irisMat.color.lerp(new THREE.Color(3, 3, 3), this.flash * 0.6);
    m.halo.material.color.copy(EYE).multiplyScalar(0.12 + w * 0.3);
    m.halo.scale.setScalar(1.5 + w * 1.3);
  }
}
