import * as THREE from 'three';
import { clamp, damp, lerp, smoothstep, easeInOutSine } from '../core/math.js';
import { valueNoise2 } from '../core/rng.js';

// Cámara lateral en perspectiva (biblia §8): eje óptico horizontal y perpendicular al plano de
// juego, sin balanceo ni inclinación durante el control, para que las distancias se lean igual en
// toda la pantalla. Sigue con anticipación hacia donde mira el héroe, zona muerta vertical en el
// aire y límites por sala. Los planos cinematográficos solo se usan en momentos sin control (§17.5).

export class GameCamera {
  constructor(aspect) {
    this.cam = new THREE.PerspectiveCamera(32, aspect, 0.15, 1600);
    this.x = 0; this.y = 2; this.dist = 14;
    this.lead = 0;
    this.groundY = 0;
    this.trauma = 0;
    this.shakeScale = 1;
    this.t = 0;
    this.cine = null;      // { pos, look, fov, blend }
    this.cineW = 0;
    this.height = 1.75;    // centro de la vista por encima de los pies
    this._look = new THREE.Vector3();
    this._pos = new THREE.Vector3();
  }

  snap(focus, zone) {
    this.x = clamp(focus.x, zone.minX, zone.maxX);
    this.groundY = focus.y;
    this.y = focus.y + this.height;
    this.dist = zone.dist;
    this.lead = focus.facing * 1.4;
  }

  addTrauma(a) { this.trauma = Math.min(1, this.trauma + a); }

  update(dt, focus, zone) {
    this.t += dt;
    // Anticipación horizontal: hacia la mirada y un poco hacia la velocidad.
    const leadT = clamp(focus.facing * 1.5 + focus.vx * 0.12, -2.4, 2.4);
    this.lead = damp(this.lead, leadT, 0.45, dt);
    const tx = clamp(focus.x + this.lead, zone.minX, zone.maxX);
    this.x = damp(this.x, tx, 0.12, dt);
    // Vertical: seguir el suelo al aterrizar; en el aire solo si sale de la banda (sin balanceo).
    if (focus.grounded || focus.hang) this.groundY = damp(this.groundY, focus.y, 0.1, dt);
    else {
      if (focus.y < this.groundY - 0.6) this.groundY = damp(this.groundY, focus.y + 0.6, 0.06, dt);
      if (focus.y > this.groundY + 2.4) this.groundY = damp(this.groundY, focus.y - 2.4, 0.08, dt);
    }
    const ty = this.groundY + this.height;
    this.y = damp(this.y, ty, 0.14, dt);
    this.dist = damp(this.dist, zone.dist, 0.6, dt);

    // Sacudida breve basada en "trauma" (configurable, §14.6)
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma * this.shakeScale;
    const ox = (valueNoise2(this.t * 22, 1.3, 1e4, 1) - 0.5) * 0.35 * s;
    const oy = (valueNoise2(this.t * 22, 7.1, 1e4, 2) - 0.5) * 0.35 * s;

    const pos = this._pos.set(this.x + ox, this.y + oy, this.dist);
    const look = this._look.set(this.x + ox, this.y + oy, 0);
    let fov = 32;
    // Mezcla con el plano cinematográfico
    const target = this.cine ? 1 : 0;
    this.cineW = damp(this.cineW, target, this.cine ? (this.cine.blend || 0.5) : 0.35, dt);
    if (this.cineW > 0.002 && (this.cine || this.lastCine)) {
      const c = this.cine || this.lastCine;
      if (this.cine) this.lastCine = this.cine;
      const w = easeInOutSine(clamp(this.cineW, 0, 1));
      pos.lerp(c.pos, w);
      look.lerp(c.look, w);
      fov = lerp(fov, c.fov || 32, w);
    }
    this.cam.position.copy(pos);
    this.cam.lookAt(look);
    if (Math.abs(this.cam.fov - fov) > 1e-3) { this.cam.fov = fov; this.cam.updateProjectionMatrix(); }
    return this.cam;
  }

  setAspect(a) { this.cam.aspect = a; this.cam.updateProjectionMatrix(); }
}

// Zonas de cámara ordenadas por x con transición suave de distancia.
export function sampleCameraZone(list, x) {
  let i = 0;
  while (i < list.length - 1 && x >= list[i + 1].x) i++;
  const a = list[i], b = list[Math.min(i + 1, list.length - 1)];
  const t = a === b ? 0 : smoothstep(b.x - 3, b.x + 1, x);
  return { dist: lerp(a.dist, b.dist, t), minX: a.minX, maxX: lerp(a.maxX, b.maxX, t) };
}
