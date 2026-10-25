import * as THREE from 'three';
import { segAABB, expand } from '../core/geom2d.js';
import { EclipseOrb } from '../render/eclipseOrb.js';

// Proyectiles arcanos (dardos y orbes del eclipse del mago, contraconjuro y orbes enemigos).
// Simulación en el plano de juego dentro del paso fijo: barrido de segmento contra cajas de daño,
// mecanismos y sólidos (los suelos de un solo sentido se atraviesan). El aspecto (núcleo blanco,
// halo de color, estela de partículas y luz puntual) se dibuja aparte y nunca decide el impacto.

// orb: radio visual de la esfera del eclipse (núcleo de obsidiana con estela de sombras) en lugar
// de la cápsula luminosa; pierce: atraviesa enemigos hasta derribar uno.
const KINDS = {
  bolt: { len: 0.72, wid: 0.11, glow: 0.5, color: [1.25, 0.5, 2.7], core: 1.9, light: 2.2, sparks: 10, heavy: false, radius: 0.08 },
  seed: { orb: 0.06, len: 0.5, wid: 0.16, glow: 0.42, color: [1.1, 0.45, 2.4], core: 1.4, light: 2.4, sparks: 16, heavy: false, radius: 0.1 },
  condense: { orb: 0.105, len: 0.7, wid: 0.26, glow: 0.75, color: [1.2, 0.5, 2.6], core: 1.6, light: 4.2, sparks: 28, heavy: true, radius: 0.17 },
  eclipse: { orb: 0.17, len: 1.0, wid: 0.4, glow: 1.15, color: [1.35, 0.6, 2.9], core: 1.8, light: 6.5, sparks: 46, heavy: true, radius: 0.27, pierce: true },
  counter: { len: 1.7, wid: 0.4, glow: 1.7, color: [3.2, 2.2, 0.75], core: 3.4, light: 8, sparks: 44, heavy: true, radius: 0.24, pierce: true },
  orb: { len: 0.42, wid: 0.42, glow: 1.0, color: [3.0, 0.85, 0.35], core: 2.2, light: 3, sparks: 14, heavy: false, radius: 0.16 },
};
export const BOLT_KINDS = KINDS;

function boltTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 32;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(128, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 128; x++) {
    // cápsula: cabeza redonda a la derecha, cola que se afila hacia la izquierda
    const u = x / 127, v = (y - 15.5) / 15.5;
    const head = Math.hypot((u - 0.82) / 0.18, v);
    const tailW = 0.15 + 0.85 * Math.pow(Math.min(1, u / 0.82), 1.4);
    const body = u < 0.82 ? Math.abs(v) / tailW : head;
    let a = Math.max(0, 1 - body);
    a = Math.pow(a, 1.6) * (0.25 + 0.75 * Math.min(1, u * 1.6));
    const i = (y * 128 + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = Math.round(a * 255);
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Projectiles {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.flashes = [];
    const scene = game.scene;
    const tex = boltTexture();
    this.pool = [];
    for (let i = 0; i < 24; i++) {
      const outer = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      const inner = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: game.tex.dot, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      for (const o of [outer, inner, glow]) { o.visible = false; o.renderOrder = 8; scene.add(o); }
      this.pool.push({ outer, inner, glow, used: false });
    }
    // luces puntuales fijas (el número de luces no cambia: sin recompilar sombreadores)
    this.lights = [];
    for (let i = 0; i < 3; i++) {
      const L = new THREE.PointLight('#7ff3ff', 0, 5, 2);
      L.position.set(0, -50, 0);
      scene.add(L);
      this.lights.push(L);
    }
    // esferas del eclipse en vuelo (sin luz propia: usan las luces compartidas de arriba)
    this.orbs = [];
    for (let i = 0; i < 3; i++) this.orbs.push({ orb: new EclipseOrb(scene, { dot: game.tex.dot, light: false }), used: false });
    this._c = new THREE.Color();
    this._p = new THREE.Vector3(); this._v = new THREE.Vector3();
  }

  fire({ x, y, dx, dy, kind = 'bolt', speed = 26, damage = 10, life = 0.8, owner = 'hero', source = null }) {
    const K = KINDS[kind];
    const vis = this.pool.find((p) => !p.used);
    if (vis) vis.used = true;
    let ov = null;
    if (K.orb) { ov = this.orbs.find((o) => !o.used) || null; if (ov) { ov.used = true; ov.orb.hide(); } }
    const p = { x, y, px: x, py: y, vx: dx * speed, vy: dy * speed, kind, K, damage, life, age: 0, owner, source, vis, ov, hits: new Set(), alive: true, z: 0.25 };
    this.list.push(p);
    this.flash(x, y, K.color, K.light * 0.9, 0.07);
    return p;
  }

  flash(x, y, color, intensity, dur) {
    this.flashes.push({ x, y, color, intensity, t: dur, dur });
  }

  clear() {
    for (const p of this.list) this.release(p);
    this.list.length = 0;
    this.flashes.length = 0;
  }

  release(p) {
    if (p.ov) { p.ov.orb.hide(); p.ov.used = false; p.ov = null; }
    if (!p.vis) return;
    p.vis.used = false;
    p.vis.outer.visible = p.vis.inner.visible = p.vis.glow.visible = false;
    p.vis = null;
  }

  impact(p, x, y, what) {
    const g = this.game;
    p.alive = false;
    const K = p.K;
    const col = [Math.min(1, K.color[0] * 0.4), Math.min(1, K.color[1] * 0.4), Math.min(1, K.color[2] * 0.4)];
    g.burst(g.fx.arcane, x, y, K.sparks, col.map((v) => v * 2.2), K.heavy ? 6 : 3.4, K.heavy ? 0.5 : 0.3);
    if (what === 'solid') g.burst(g.fx.dust, x, y, K.heavy ? 10 : 4, [0.62, 0.57, 0.5], 1.4, 0.6);
    this.flash(x, y, K.color, K.light * 1.4, K.heavy ? 0.16 : 0.09);
    g.glint(new THREE.Vector3(x, y, 0.4), K.heavy ? 0.24 : 0.14, K.heavy ? 1.3 : 0.55);
    g.events.emit('boltImpact', { x, y, kind: p.kind, what, heavy: K.heavy });
  }

  update(dt) {
    const g = this.game, phys = g.physics;
    for (const p of this.list) {
      if (!p.alive) continue;
      p.age += dt;
      p.px = p.x; p.py = p.y;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const r = p.K.radius;
      if (p.owner === 'hero') {
        // enemigos
        for (const e of g.hostiles) {
          if (!e.alive || p.hits.has(e)) continue;
          const box = expand(e.hurtbox(), r);
          if (!segAABB(p.px, p.py, p.x, p.y, box)) continue;
          p.hits.add(e);
          const res = e.takeHit(p.damage, p.px, { heavy: p.K.heavy, light: !p.K.heavy, ranged: true });
          g.onBoltHitEnemy(p, e, res);
          if (!p.K.pierce || res === 'dead') { this.impact(p, Math.min(Math.max(p.x, box.x0), box.x1), p.y, 'enemy'); break; }
        }
        if (!p.alive) continue;
        for (const m of g.level.mechanisms) {
          if (!m.hurtbox) continue;
          const hb = m.hurtbox();
          if (!hb) continue;
          const box = expand(hb, r * 0.5);
          if (!segAABB(p.px, p.py, p.x, p.y, box)) continue;
          m.hit(p.damage, p.K.heavy, 'bolt');
          this.impact(p, p.vx > 0 ? box.x0 : box.x1, p.y, 'mechanism');
          break;
        }
        if (!p.alive) continue;
      } else {
        const h = g.hero;
        if (h.mode !== 'dead' && segAABB(p.px, p.py, p.x, p.y, expand(h.hurtbox(), r * 0.5))) {
          if (h.parryActive()) {
            // devolver el orbe con el golpe de éter
            // vuelve hacia quien lo lanzó (si sigue en pie): desviar a tiempo siempre castiga
            const sp = Math.hypot(p.vx, p.vy) * 1.6;
            let dx = -p.vx, dy = -p.vy;
            if (p.source && p.source.alive) { const hb = p.source.hurtbox(); dx = (hb.x0 + hb.x1) / 2 - p.x; dy = (hb.y0 + hb.y1) / 2 - p.y; }
            const l = Math.hypot(dx, dy) || 1;
            p.owner = 'hero'; p.vx = (dx / l) * sp; p.vy = (dy / l) * sp; p.damage *= 3; p.kind = 'counter'; p.K = KINDS.counter; p.age = 0; p.life = 1.4;
            g.events.emit('reflect', { x: p.x, y: p.y });
            continue;
          }
          if (!h.isInvulnerable()) { h.takeHit(1, p.px, { knock: 3.5 }); this.impact(p, p.x, p.y, 'hero'); continue; }
        }
      }
      const s = phys.segmentBlocked(p.px, p.py, p.x, p.y);
      if (s) {
        // retroceder hasta la cara del sólido (bisección)
        let a = 0, b = 1;
        for (let i = 0; i < 6; i++) {
          const m = (a + b) / 2;
          if (phys.segmentBlocked(p.px, p.py, p.px + (p.x - p.px) * m, p.py + (p.y - p.py) * m)) b = m; else a = m;
        }
        this.impact(p, p.px + (p.x - p.px) * a, p.py + (p.y - p.py) * a, 'solid');
        continue;
      }
      if (p.age >= p.life) { p.alive = false; this.flash(p.x, p.y, p.K.color, p.K.light * 0.4, 0.06); }
    }
    for (const p of this.list) if (!p.alive) this.release(p);
    this.list = this.list.filter((p) => p.alive);
    for (const f of this.flashes) f.t -= dt;
    this.flashes = this.flashes.filter((f) => f.t > 0);
  }

  // Aspecto: orientación, estela, halo y reparto de luces (fuera del paso fijo).
  render(dt, t) {
    const g = this.game;
    for (const p of this.list) {
      const v = p.vis;
      if (!v) continue;
      const K = p.K;
      const ang = Math.atan2(p.vy, p.vx);
      if (p.ov) {
        // esfera de obsidiana con estela de sombras; la cápsula queda como halo tenue detrás
        const o = p.ov.orb;
        const grow = Math.min(1, 0.6 + p.age / 0.08 * 0.4);
        o.fly(this._p.set(p.x, p.y, p.z), this._v.set(p.vx, p.vy, 0), K.orb * grow, 1, dt, Math.min(1, p.age / 0.3));
        o.render(g.camera.cam, dt);
      }
      const grow = Math.min(1, p.age / 0.05);
      const pulse = 1 + 0.12 * Math.sin(t * 40 + p.x);
      const len = K.len * (0.5 + 0.5 * grow);
      const cx = p.x - Math.cos(ang) * len * 0.3, cy = p.y - Math.sin(ang) * len * 0.3;
      v.outer.position.set(cx, cy, p.z);
      v.outer.rotation.z = ang;
      v.outer.scale.set(len, K.wid * 2.1 * pulse, 1);
      v.outer.material.color.setRGB(K.color[0] * 0.55, K.color[1] * 0.55, K.color[2] * 0.55);
      v.inner.position.set(cx + Math.cos(ang) * len * 0.06, cy + Math.sin(ang) * len * 0.06, p.z + 0.01);
      v.inner.rotation.z = ang;
      v.inner.scale.set(len * 0.82, K.wid * 0.7, 1);
      v.inner.material.color.setRGB(K.core, K.core, K.core);
      v.glow.position.set(p.x, p.y, p.z - 0.02);
      v.glow.scale.setScalar(K.glow * pulse);
      v.glow.material.color.setRGB(K.color[0] * 0.35, K.color[1] * 0.35, K.color[2] * 0.35);
      v.outer.visible = v.inner.visible = v.glow.visible = true;
      if (p.ov) { v.inner.visible = false; v.outer.material.color.multiplyScalar(0.5); }
      // estela de motas
      const n = K.heavy ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const k = Math.random();
        const ox = p.px + (p.x - p.px) * k, oy = p.py + (p.y - p.py) * k;
        const sp = K.heavy ? 1.2 : 0.4;
        g.fx.arcane.emit({ x: ox + (Math.random() - 0.5) * K.wid, y: oy + (Math.random() - 0.5) * K.wid, z: p.z, vx: (Math.random() - 0.5) * sp - p.vx * 0.02, vy: (Math.random() - 0.5) * sp, life: 0.18 + Math.random() * 0.2, size: K.heavy ? 0.07 : 0.045, grow: -0.1, drag: 0.4, color: [K.color[0] * 0.45, K.color[1] * 0.45, K.color[2] * 0.45], alpha: 0.9 });
      }
    }
    // luces: saetas vivas primero, luego destellos de disparo e impacto
    const cands = [];
    for (const p of this.list) cands.push({ x: p.x, y: p.y, c: p.K.color, i: p.K.light });
    for (const f of this.flashes) cands.push({ x: f.x, y: f.y, c: f.color, i: f.intensity * (f.t / f.dur) });
    cands.sort((a, b) => b.i - a.i);
    for (let i = 0; i < this.lights.length; i++) {
      const L = this.lights[i], c = cands[i];
      if (!c) { L.intensity = 0; continue; }
      L.position.set(c.x, c.y, 0.7);
      const m = Math.max(c.c[0], c.c[1], c.c[2]);
      L.color.setRGB(c.c[0] / m, c.c[1] / m, c.c[2] / m);
      L.intensity = c.i;
    }
  }
}
