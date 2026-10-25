import * as THREE from 'three';
import { moveBody, probeGround, depenetrate } from '../physics2d/world.js';
import { ATTACKS } from '../animation/poses.js';
import { clamp, approach, sign } from '../core/math.js';

// Controlador de Aren: velocidad, colisiones, estados físicos y combate (biblia §12, §14, §20.2).
// La física decide dónde está el personaje; el animador explica cómo llegó allí.

export const TUNING = {
  w: 0.48, h: 1.72, hLow: 0.88,
  run: 5.6, sprint: 7.6, accel: 34, brake: 44, airAccel: 18, airBrake: 10,
  jumpV: 9.6, gravity: 24, fallMul: 1.38, maxFall: 17, jumpCut: 0.45,
  coyote: 0.1, jumpBuffer: 0.12,
  rollDur: 0.34, rollDist: 2.3, iframes: [0.03, 0.26],
  backDur: 0.26, backDist: 1.5,
  airDashDur: 0.2, airDashSpeed: 10.5,
  slideDur: 0.5, slideSpeed: 9.4,
  attackBuffer: 0.2, dodgeCooldown: 0.18,
  hitDur: 0.4, invuln: 1.1,
  parryWindow: 0.16,
};

export class Hero {
  constructor(game, x, y) {
    this.game = game;
    this.body = { x, y, w: TUNING.w, h: TUNING.h, dropThrough: false };
    this.vx = 0; this.vy = 0;
    this.facing = 1;
    this.grounded = false;
    this.groundSolid = null;
    this.coyote = 0;
    this.mode = 'ground';
    this.modeT = 0; this.modeDur = 1;
    this.attack = null;
    this.comboNext = null;
    this.jumpHeld = false;
    this.jumpCutDone = false;
    this.airDashUsed = false;
    this.dodgeCd = 0;
    this.invuln = 0;
    this.maxHp = 6; this.hp = 6;
    this.hasClavija = false;
    this.riposteWindow = 0;
    this.landImpact = 0;
    this.lastSafe = { x, y };
    this.safeTimer = 0;
    this.ledge = null;
    this.noGrab = 0;
    this.interact = null;
    this.skid = false;
    this.prevBlade = null;
    this.stats = { hits: 0, damageTaken: 0, parries: 0 };
    this.locked = false; // control retirado (cinemáticas)
    this.slideLowTime = 0;
  }

  get x() { return this.body.x; }
  get y() { return this.body.y; }
  get center() { return new THREE.Vector3(this.body.x, this.body.y + this.body.h * 0.55, 0); }

  hurtbox() {
    const b = this.body;
    return { x0: b.x - 0.26, x1: b.x + 0.26, y0: b.y, y1: b.y + b.h };
  }

  setMode(m, dur = 1) {
    this.mode = m; this.modeT = 0; this.modeDur = dur;
  }

  isInvulnerable() {
    if (this.invuln > 0) return true;
    if (this.mode === 'roll') return this.modeT >= TUNING.iframes[0] && this.modeT <= TUNING.iframes[1];
    if (this.mode === 'airdash') return this.modeT < 0.14;
    if (this.mode === 'dead' || this.mode === 'interact') return true;
    return false;
  }

  update(dt, input) {
    const T = TUNING, b = this.body, world = this.game.physics;
    this.modeT += dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.dodgeCd > 0) this.dodgeCd -= dt;
    if (this.noGrab > 0) this.noGrab -= dt;
    if (this.riposteWindow > 0) this.riposteWindow -= dt;
    this.landImpact = 0;
    const ax = this.locked ? 0 : input.axisX();
    const ctl = !this.locked;
    const wasGrounded = this.grounded;

    // ---- Estados que retiran el control ----
    if (this.mode === 'dead') { this.vx *= 0.9; this.applyGravity(dt); this.integrate(dt); return; }
    if (this.mode === 'interact') {
      this.vx = approach(this.vx, 0, T.brake * dt);
      this.applyGravity(dt); this.integrate(dt);
      if (this.modeT >= this.modeDur) { this.setMode('ground'); this.interact = null; }
      return;
    }
    if (this.mode === 'hit') {
      this.vx = approach(this.vx, 0, 12 * dt);
      this.applyGravity(dt); this.integrate(dt);
      if (this.modeT >= this.modeDur) this.setMode(this.grounded ? 'ground' : 'air');
      return;
    }
    if (this.mode === 'hang') { this.updateHang(dt, input); return; }
    if (this.mode === 'mantle') { this.updateMantle(dt); return; }

    // ---- Esquiva / voltereta / paso atrás / impulso aéreo ----
    if (ctl && input.pressed('dodge', 0.1) && this.dodgeCd <= 0 && ['ground', 'air'].includes(this.mode) && this.canCancelAttack()) {
      input.consume('dodge');
      this.attack = null;
      if (this.grounded) {
        if (ax !== 0 || Math.abs(this.vx) > 2) {
          if (ax !== 0) this.facing = ax;
          this.setMode('roll', T.rollDur);
          this.vx = this.facing * (T.rollDist / T.rollDur);
          this.game.events.emit('dodge', { kind: 'roll' });
        } else {
          this.setMode('backstep', T.backDur);
          this.vx = -this.facing * (T.backDist / T.backDur);
          this.vy = 2.2; this.grounded = false;
          this.game.events.emit('dodge', { kind: 'back' });
        }
      } else if (!this.airDashUsed) {
        if (ax !== 0) this.facing = ax;
        this.airDashUsed = true;
        this.setMode('airdash', T.airDashDur);
        this.vx = this.facing * T.airDashSpeed; this.vy = 0;
        this.game.events.emit('dodge', { kind: 'air' });
      }
    }

    if (this.mode === 'roll' || this.mode === 'backstep') {
      const t = this.modeT / this.modeDur;
      if (this.mode === 'roll') { b.h = T.hLow; this.vx = this.facing * (T.rollDist / T.rollDur) * (1 - 0.35 * t); }
      this.applyGravity(dt);
      this.integrate(dt);
      if (this.modeT >= this.modeDur) {
        if (this.mode === 'roll' && !this.tryStand()) { this.setMode('slide', 0.25); }
        else { this.setMode(this.grounded ? 'ground' : 'air'); this.dodgeCd = T.dodgeCooldown; }
      }
      return;
    }
    if (this.mode === 'airdash') {
      this.vy = 0;
      this.integrate(dt);
      if (this.modeT >= this.modeDur) { this.setMode('air'); this.vx *= 0.55; this.dodgeCd = T.dodgeCooldown; }
      return;
    }

    // ---- Deslizamiento bajo pasos estrechos (§12.8) ----
    if (this.mode === 'slide') {
      b.h = T.hLow;
      const t = this.modeT / this.modeDur;
      this.vx = this.facing * Math.max(T.slideSpeed * (1 - t * 0.75), 2.4);
      this.applyGravity(dt);
      this.integrate(dt);
      if (!this.grounded) { if (this.tryStand()) this.setMode('air'); }
      else if (this.modeT >= this.modeDur) {
        if (this.tryStand()) this.setMode('ground');
        else this.modeT = this.modeDur * 0.85; // seguir agachado hasta tener espacio
      }
      if (ctl && input.pressed('jump', T.jumpBuffer) && this.tryStand()) { input.consume('jump'); this.setMode('ground'); this.doJump(); }
      return;
    }
    if (ctl && this.grounded && input.isDown('down') && Math.abs(this.vx) > 2.5 && input.pressed('down', 0.12) && !this.attack) {
      input.consume('down');
      this.setMode('slide', T.slideDur);
      this.game.events.emit('slide', {});
      return;
    }

    // ---- Locomoción horizontal (§12.5) ----
    const attacking = this.attack && !(ATTACKS[this.attack.id] || {}).keepMomentum;
    const target = ctl ? ax * (input.isDown('run') ? T.sprint : T.run) : 0;
    this.skid = false;
    if (this.grounded) {
      if (attacking) {
        this.vx = approach(this.vx, 0, T.brake * 0.9 * dt);
      } else if (ax !== 0) {
        const reversing = sign(this.vx) !== 0 && sign(this.vx) !== ax;
        if (reversing && Math.abs(this.vx) > 4.2) this.skid = true;
        this.vx = approach(this.vx, target, (reversing ? T.brake * 1.25 : T.accel) * dt);
        if (!this.attack) this.facing = ax;
      } else {
        if (Math.abs(this.vx) > 4.5) this.skid = true;
        this.vx = approach(this.vx, 0, T.brake * dt);
      }
    } else {
      if (ax !== 0) {
        this.vx = approach(this.vx, target, T.airAccel * dt);
        if (!this.attack) this.facing = ax;
      } else this.vx = approach(this.vx, 0, T.airBrake * dt);
    }

    // ---- Salto con margen de borde, memoria de entrada y altura variable (§12.6) ----
    if (this.grounded) { this.coyote = T.coyote; this.airDashUsed = false; }
    else this.coyote -= dt;
    if (ctl && input.pressed('jump', T.jumpBuffer)) {
      if (this.grounded && input.isDown('down') && this.groundSolid && this.groundSolid.kind === 'oneway') {
        input.consume('jump');
        b.dropThrough = true; this.dropTimer = 0.25; this.grounded = false;
      } else if (this.coyote > 0 && !attacking) {
        input.consume('jump');
        this.doJump();
      }
    }
    if (this.dropTimer > 0) { this.dropTimer -= dt; if (this.dropTimer <= 0) b.dropThrough = false; }
    if (!this.grounded && this.vy > 0 && !input.isDown('jump') && !this.jumpCutDone && this.jumped) {
      this.vy *= T.jumpCut; this.jumpCutDone = true;
    }

    // ---- Combate ----
    if (ctl) this.updateCombat(dt, input);

    this.applyGravity(dt);
    this.integrate(dt);

    // ---- Agarre de bordes (§12.9) ----
    if (!this.grounded && this.vy <= 2.5 && this.noGrab <= 0 && !this.attack && ctl) this.tryLedge(ax);

    this.mode = this.grounded ? 'ground' : 'air';
    if (!wasGrounded && this.grounded) this.onLand();
    if (this.grounded) this.trackSafe(dt);
  }

  doJump() {
    this.vy = TUNING.jumpV;
    this.grounded = false;
    this.coyote = 0;
    this.jumped = true;
    this.jumpCutDone = false;
    this.game.events.emit('jump', { x: this.body.x, y: this.body.y });
  }

  applyGravity(dt) {
    const T = TUNING;
    if (this.grounded) return;
    const g = this.vy < 0 ? T.gravity * T.fallMul : T.gravity;
    this.vy = Math.max(this.vy - g * dt, -T.maxFall);
  }

  integrate(dt) {
    const b = this.body, world = this.game.physics;
    const preVy = this.vy;
    const res = moveBody(world, b, this.vx * dt, this.grounded ? -0.02 : this.vy * dt, { stepUp: 0.3, grounded: this.grounded });
    if (res.left || res.right) {
      if (this.mode !== 'roll' && this.mode !== 'slide') this.vx = 0;
      else this.vx *= 0.2;
    }
    if (res.ceil && this.vy > 0) this.vy = 0;
    if (res.ground) {
      if (!this.grounded) this.landImpactPending = -preVy;
      this.grounded = true; this.vy = 0; this.groundSolid = res.groundSolid;
      this.jumped = false;
    } else if (this.grounded) {
      const g = probeGround(world, b, 0.05);
      if (g) { b.y = g.y1; this.groundSolid = g; }
      else { this.grounded = false; this.groundSolid = null; }
    }
    depenetrate(world, b);
  }

  onLand() {
    const impact = this.landImpactPending || 0;
    this.landImpactPending = 0;
    this.landImpact = impact;
    if (impact > 3) this.game.events.emit('land', { x: this.body.x, y: this.body.y, impact, surface: this.groundSolid && this.groundSolid.surface });
    // aterrizaje fuerte: breve pérdida de velocidad, nunca una pausa en saltos pequeños (§12.7)
    if (impact > 15) this.vx *= 0.5;
    if (this.attack && this.attack.id === 'airCut') this.attack = null;
  }

  tryStand() {
    const b = this.body, world = this.game.physics;
    const hw = b.w / 2;
    if (world.isFree(b.x - hw, b.y, b.x + hw, b.y + TUNING.h)) { b.h = TUNING.h; return true; }
    return false;
  }

  trackSafe(dt) {
    this.safeTimer -= dt;
    const g = this.groundSolid;
    if (!g || this.safeTimer > 0) return;
    if (this.body.x > g.x0 + 0.8 && this.body.x < g.x1 - 0.8 && !g.unsafe) {
      this.lastSafe = { x: this.body.x, y: this.body.y };
      this.safeTimer = 0.4;
    }
  }

  tryLedge(ax) {
    const b = this.body, world = this.game.physics;
    const dir = ax !== 0 ? ax : this.facing;
    if (ax === 0) return; // solo si se empuja hacia la pared
    const hw = b.w / 2;
    const edgeX = b.x + dir * hw;
    for (const s of world.solids) {
      if (!s.enabled || s.kind !== 'solid' || s.grab === false) continue;
      const face = dir > 0 ? s.x0 : s.x1;
      if (Math.abs(edgeX - face) > 0.1) continue;
      const top = s.y1;
      const rel = top - b.y;
      if (rel < 1.3 || rel > 2.1) continue;
      const cx = dir > 0 ? s.x0 + 0.02 : s.x1 - 0.6;
      if (!world.isFree(cx, top + 0.02, cx + 0.58, top + TUNING.h)) continue;
      // Agarrar
      this.ledge = { x: face, y: top, dir };
      this.facing = dir;
      b.x = face - dir * (hw + 0.01);
      b.y = top - 2.0;
      this.vx = 0; this.vy = 0;
      this.attack = null;
      this.setMode('hang', 1);
      this.game.events.emit('ledge', { x: face, y: top });
      return;
    }
  }

  updateHang(dt, input) {
    const T = TUNING;
    const L = this.ledge;
    const toward = input.axisX() === L.dir;
    if (input.pressed('jump', 0.12) || input.isDown('up') || (toward && this.modeT > 0.12)) {
      input.consume('jump');
      this.setMode('mantle', 0.42);
      this.mantleFrom = { x: this.body.x, y: this.body.y };
      this.game.events.emit('mantle', {});
    } else if (input.isDown('down') || (input.axisX() === -L.dir)) {
      this.setMode('air'); this.noGrab = 0.3; this.grounded = false; this.vy = 0;
      if (input.axisX() === -L.dir && input.pressed('jump', 0.12)) { this.vy = 7; this.vx = -L.dir * 4; this.facing = -L.dir; }
    }
  }

  updateMantle() {
    const L = this.ledge, b = this.body;
    const t = clamp(this.modeT / this.modeDur, 0, 1);
    const k1 = Math.min(1, t / 0.6);
    const k2 = Math.max(0, (t - 0.45) / 0.55);
    const ex = L.x + L.dir * 0.36;
    b.x = this.mantleFrom.x + (ex - this.mantleFrom.x) * (k2 * k2 * (3 - 2 * k2));
    b.y = this.mantleFrom.y + (L.y - this.mantleFrom.y) * (1 - (1 - k1) * (1 - k1));
    if (t >= 1) {
      b.y = L.y; this.grounded = true; this.vx = 0; this.vy = 0;
      this.setMode('ground');
      this.groundSolid = probeGround(this.game.physics, b, 0.05);
    }
  }

  // ---- Combate ------------------------------------------------------------
  canCancelAttack() {
    if (!this.attack) return true;
    const a = ATTACKS[this.attack.id];
    // la esquiva interrumpe parte de la recuperación, no cualquier instante (§14.4)
    return this.attack.t > a.active[1] || this.attack.t < a.active[0] * 0.5;
  }

  updateCombat(dt, input) {
    const T = TUNING;
    if (this.attack) {
      const a = ATTACKS[this.attack.id];
      this.attack.t += dt;
      // empuje de avance en cortes pesados (pasa por colisiones)
      if (a.lunge && this.attack.t > a.active[0] - 0.08 && this.attack.t < a.active[0] + 0.06 && this.grounded) {
        this.vx = this.facing * a.lunge / 0.14;
      }
      if (input.pressed('attack', T.attackBuffer) && this.attack.t >= a.comboFrom - T.attackBuffer) {
        if (this.attack.t >= a.comboFrom) { input.consume('attack'); this.startAttack(this.nextCombo()); return; }
      }
      if (this.attack.t >= a.duration) this.attack = null;
    }
    if (!this.attack && input.pressed('attack', T.attackBuffer)) {
      input.consume('attack');
      let id = 'cut1';
      if (this.riposteWindow > 0) id = 'riposte';
      else if (!this.grounded) id = 'airCut';
      else if (Math.abs(this.vx) > 4.0) id = 'runCut';
      this.startAttack(id);
    }
    if (!this.attack && input.pressed('parry', 0.08) && this.grounded) {
      input.consume('parry');
      this.startAttack('parry');
    }
  }

  nextCombo() {
    const id = this.attack.id;
    if (this.riposteWindow > 0) return 'riposte';
    if (!this.grounded) return 'airCut';
    if (id === 'cut1' || id === 'runCut') return 'cut2';
    if (id === 'cut2') return 'cut3';
    return 'cut1';
  }

  startAttack(id) {
    const ax = this.game.input.axisX();
    if (ax !== 0 && id !== 'airCut') this.facing = ax;
    this.attack = { id, t: 0, hits: new Set() };
    if (id === 'riposte') this.riposteWindow = 0;
    if (id === 'airCut' && this.vy < 1) this.vy = Math.max(this.vy, 1.2); // breve sostén, sin suspender indefinidamente
    this.game.events.emit('attack', { id });
  }

  parryActive() {
    return this.attack && this.attack.id === 'parry' && this.attack.t <= TUNING.parryWindow;
  }

  // Segmentos de la hoja (actual y anterior) para el barrido de impacto.
  bladeSweep(anim) {
    const cur = { a: anim.bladeBase.clone(), b: anim.bladeTip.clone() };
    const prev = this.prevBlade || cur;
    this.prevBlade = cur;
    return { prev, cur };
  }

  activeWindow() {
    if (!this.attack) return false;
    const a = ATTACKS[this.attack.id];
    return this.attack.t >= a.active[0] && this.attack.t <= a.active[1] + 1e-6 && a.damage > 0;
  }

  takeHit(dmg, fromX, opts = {}) {
    if (this.isInvulnerable() || this.mode === 'dead') return false;
    this.hp = Math.max(0, this.hp - dmg);
    this.stats.damageTaken += dmg;
    this.invuln = TUNING.invuln;
    this.attack = null;
    const dir = Math.sign(this.body.x - fromX) || -this.facing;
    this.vx = dir * (opts.knock || 4.5);
    if (!opts.noLift) { this.vy = 3.2; this.grounded = false; }
    if (this.mode === 'hang' || this.mode === 'mantle') this.noGrab = 0.4;
    this.body.h = TUNING.h;
    if (this.hp <= 0) { this.setMode('dead', 1.6); this.game.events.emit('heroDead', {}); }
    else this.setMode('hit', TUNING.hitDur);
    this.game.events.emit('heroHit', { dmg, x: this.body.x, y: this.body.y + 1.2 });
    return true;
  }

  respawn(x, y, full = false) {
    this.body.x = x; this.body.y = y; this.body.h = TUNING.h;
    this.vx = 0; this.vy = 0; this.attack = null; this.grounded = false;
    this.setMode('air');
    this.invuln = 1.0;
    if (full) this.hp = this.maxHp;
  }

  // Estado para el animador.
  animState() {
    let mode = this.mode;
    return {
      x: this.body.x, y: this.body.y, vx: this.vx, vy: this.vy, facing: this.facing,
      mode, modeT: this.modeT, modeDur: this.modeDur, groundY: this.body.y,
      attack: this.attack ? { id: this.attack.id, t: this.attack.t } : null,
      skid: this.skid, landImpact: this.landImpact, ledge: this.ledge,
      interact: this.interact, look: this.lookTarget || null,
    };
  }
}
