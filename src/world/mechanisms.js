import * as THREE from 'three';
import { buildClavija } from '../render/heroModel.js';
import { buildWheel, mergeByMaterial } from '../render/architecture.js';
import { clamp, smoothstep, easeInOutSine } from '../core/math.js';

// Mecanismos del nivel: estados explícitos y datos de colisión separados de la malla (biblia §20.4).
// Cada mecanismo expone update(dt), y opcionalmente prompt() para la interfaz y onInteract().

const tmpV = new THREE.Vector3();

function glowSprite(color, size, tex) {
  const m = new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const s = new THREE.Sprite(m);
  s.scale.setScalar(size);
  return s;
}

// ---------------------------------------------------------------------------
// Sello rúnico: bloques de sillería sellados con un glifo de éter. Solo una saeta los disuelve
// (el filo rebota); al romper uno, el resto del mismo sello se deshace en cascada. Es el lenguaje
// de «bloque que se dispara» del género, contado con piedra y runas.
let glyphTex = null;
function runeGlyphTexture() {
  if (glyphTex) return glyphTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.strokeStyle = '#fff'; x.lineCap = 'round'; x.lineJoin = 'round';
  x.shadowColor = '#fff'; x.shadowBlur = 6;
  x.lineWidth = 5;
  x.beginPath(); x.arc(64, 64, 46, 0, Math.PI * 2); x.stroke();
  x.lineWidth = 7;
  x.beginPath();
  x.moveTo(64, 28); x.lineTo(64, 100);
  x.moveTo(40, 46); x.lineTo(64, 64); x.lineTo(88, 46);
  x.moveTo(44, 88); x.lineTo(64, 76); x.lineTo(84, 88);
  x.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    x.beginPath(); x.moveTo(64 + Math.cos(a) * 52, 64 + Math.sin(a) * 52); x.lineTo(64 + Math.cos(a) * 60, 64 + Math.sin(a) * 60); x.stroke();
  }
  glyphTex = new THREE.CanvasTexture(c);
  glyphTex.colorSpace = THREE.SRGBColorSpace;
  return glyphTex;
}

export class RuneBlock {
  constructor(game, { x0, y0, size = 1, depth = 2.8, mats, seal = null, color = [0.35, 1.9, 2.4] }) {
    this.game = game;
    this.box = { x0, x1: x0 + size, y0, y1: y0 + size };
    this.seal = seal;
    this.broken = false;
    this.delay = -1;      // cuenta atrás de la cascada (−1: sin programar)
    this.dissolveT = -1;  // tiempo disolviéndose (−1: intacto)
    this.flashT = 0;
    this.solid = game.physics.addSolid({ ...this.box, surface: 'stone', grab: false, id: 'runeBlock' });
    this.group = new THREE.Group();
    const cube = new THREE.Mesh(new THREE.BoxGeometry(size - 0.03, size - 0.03, depth), mats.stone);
    cube.castShadow = cube.receiveShadow = true;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(size - 0.12, size - 0.12, 0.04), new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.6, metalness: 0.3 }));
    frame.position.z = depth / 2 + 0.005;
    this.color = new THREE.Color(...color);
    this.glyphMat = new THREE.MeshBasicMaterial({ map: runeGlyphTexture(), color: this.color.clone().multiplyScalar(0.5), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const glyph = new THREE.Mesh(new THREE.PlaneGeometry(size * 0.72, size * 0.72), this.glyphMat);
    glyph.position.z = depth / 2 + 0.03;
    glyph.renderOrder = 3;
    this.group.add(cube, frame, glyph);
    this.group.position.set(x0 + size / 2, y0 + size / 2, 0);
    this.phase = Math.random() * 6;
    game.scene.add(this.group);
  }
  hurtbox() { return this.broken || this.dissolveT >= 0 ? null : this.box; }
  hit(dmg, heavy, src) {
    if (this.broken || this.dissolveT >= 0) return;
    if (src !== 'bolt') {
      // el filo no rompe el sello: chispa y aviso
      this.flashT = 0.25;
      this.game.events.emit('runeResist', { x: (this.box.x0 + this.box.x1) / 2, y: (this.box.y0 + this.box.y1) / 2 });
      return;
    }
    this.dissolveT = 0;
    if (this.seal) {
      // cascada: los bloques del mismo sello se deshacen por orden de distancia
      const cy = this.box.y0;
      for (const m of this.game.level.mechanisms) {
        if (m instanceof RuneBlock && m !== this && m.seal === this.seal && !m.broken && m.dissolveT < 0 && m.delay < 0) m.delay = 0.06 + Math.abs(m.box.y0 - cy) * 0.11;
      }
    }
  }
  break() {
    this.broken = true;
    this.solid.enabled = false;
    this.group.visible = false;
    this.game.events.emit('runeBreak', { x: (this.box.x0 + this.box.x1) / 2, y: (this.box.y0 + this.box.y1) / 2, box: this.box, color: this.color });
  }
  update(dt) {
    if (this.broken) return;
    if (this.delay >= 0) { this.delay -= dt; if (this.delay <= 0) { this.delay = -1; this.dissolveT = 0; } }
    if (this.dissolveT >= 0) {
      this.dissolveT += dt;
      this.glyphMat.color.copy(this.color).multiplyScalar(0.5 + this.dissolveT * 14);
      this.group.position.x = (this.box.x0 + this.box.x1) / 2 + (Math.random() - 0.5) * 0.04;
      if (this.dissolveT > 0.08) this.break();
      return;
    }
    this.flashT = Math.max(0, this.flashT - dt);
    const t = this.game.simTime || 0;
    const k = 0.42 + 0.12 * Math.sin(t * 2.2 + this.phase) + this.flashT * 3;
    this.glyphMat.color.copy(this.color).multiplyScalar(k);
  }
}

// ---------------------------------------------------------------------------
// Pedestal con la clavija de forja (herramienta del capítulo, §16.2).
export class ClavijaPedestal {
  constructor(game, { x, y, mats, tex }) {
    this.game = game;
    this.x = x; this.y = y;
    this.taken = false;
    this.group = new THREE.Group();
    this.group.position.set(x, y, -0.35);
    // pedestal de piedra con cuna de bronce
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.95, 12), mats.stone);
    ped.position.y = 0.475; ped.castShadow = ped.receiveShadow = true;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.08, 14), mats.bronze);
    top.position.y = 0.99; top.castShadow = true;
    const cradle = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.014, 6, 16, Math.PI), mats.bronze);
    cradle.position.y = 1.12; cradle.rotation.x = Math.PI; cradle.castShadow = true;
    this.group.add(ped, top, cradle);
    this.item = buildClavija();
    this.item.group.scale.setScalar(2.2);
    this.item.group.position.set(0, 1.28, 0);
    this.group.add(this.item.group);
    this.glow = glowSprite('#ffc27a', 0.9, tex.dot);
    this.glow.position.set(0, 1.3, 0.05);
    this.group.add(this.glow);
    this.light = new THREE.PointLight('#ffb36b', 1.6, 4.5, 2);
    this.light.position.set(0, 1.5, 0.6);
    this.group.add(this.light);
    game.scene.add(this.group);
    this.t = 0;
  }
  near(h) { return !this.taken && Math.abs(h.x - this.x) < 0.9 && Math.abs(h.y - this.y) < 0.6; }
  prompt(h) { return this.near(h) && h.mode === 'ground' ? { key: 'E', text: 'Recoger', at: new THREE.Vector3(this.x, this.y + 2.0, 0) } : null; }
  onInteract(h) {
    if (!this.near(h) || h.mode !== 'ground') return false;
    h.setMode('interact', 1.5);
    h.vx = 0;
    h.facing = Math.sign(this.x - h.x) || h.facing;
    h.interact = { kind: 'pickup', point: new THREE.Vector3(this.x, this.y + 1.25, -0.2), t: 0 };
    this.pending = 0.75;
    this.game.events.emit('pickupStart', { what: 'clavija' });
    return true;
  }
  update(dt) {
    this.t += dt;
    if (!this.taken) {
      this.item.group.position.y = 1.28 + Math.sin(this.t * 1.6) * 0.02;
      this.item.group.rotation.y = this.t * 0.6;
      this.glow.material.opacity = 0.55 + 0.25 * Math.sin(this.t * 2.3);
    }
    if (this.pending !== undefined && this.pending > 0) {
      this.pending -= dt;
      if (this.pending <= 0) {
        this.taken = true;
        this.item.group.visible = false;
        this.glow.visible = false;
        this.light.intensity = 0;
        this.game.hero.hasClavija = true;
        this.game.events.emit('acquire', { what: 'clavija', x: this.x, y: this.y + 1.3 });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Fragmento de caudal (secreto): vial de bronce y vidrio con agua luminosa. +1 de vida máxima.
export class CaudalFragment {
  constructor(game, { x, y, tex }) {
    this.game = game;
    this.x = x; this.y = y;
    this.taken = false;
    this.group = new THREE.Group();
    this.group.position.set(x, y + 0.9, 0);
    const glass = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 14), new THREE.MeshPhysicalMaterial({ color: '#9fd8d2', roughness: 0.05, transmission: 0.0, transparent: true, opacity: 0.55, emissive: '#2d8c86', emissiveIntensity: 1.6 }));
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.08, 10), new THREE.MeshStandardMaterial({ color: '#8b6746', metalness: 1, roughness: 0.35 }));
    cap.position.y = 0.15;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.012, 6, 24), cap.material);
    ring.rotation.x = Math.PI / 2;
    this.group.add(glass, cap, ring);
    this.glow = glowSprite('#7fe3d8', 1.2, tex.dot);
    this.group.add(this.glow);
    this.light = new THREE.PointLight('#7fe3d8', 1.4, 4, 2);
    this.light.position.set(0, 0, 0.5);
    this.group.add(this.light);
    game.scene.add(this.group);
    this.t = 0;
  }
  update(dt) {
    if (this.taken) return;
    this.t += dt;
    this.group.position.y = this.y + 0.9 + Math.sin(this.t * 2) * 0.06;
    this.group.rotation.y = this.t;
    const h = this.game.hero;
    if (Math.abs(h.x - this.x) < 0.6 && h.y < this.y + 1.4 && h.y + h.body.h > this.y + 0.4) {
      this.taken = true;
      this.group.visible = false;
      this.light.intensity = 0;
      h.maxHp += 1; h.hp = h.maxHp;
      this.game.events.emit('secret', { what: 'caudal', x: this.x, y: this.y + 0.9 });
    }
  }
}

// ---------------------------------------------------------------------------
// Fuente de descanso: punto de control y recuperación de vida visible (§17.4).
export class RestFountain {
  constructor(game, { x, y, mats, tex, id }) {
    this.game = game;
    this.x = x; this.y = y; this.id = id;
    this.active = false;
    const g = new THREE.Group();
    g.position.set(x, y, -1.15);
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.5, 0.5, 18, 1, true), mats.stone);
    basin.position.y = 0.25; basin.castShadow = basin.receiveShadow = true;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.07, 8, 24), mats.stone);
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.5; rim.castShadow = true;
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.58, 20), new THREE.MeshStandardMaterial({ color: '#1f3b39', roughness: 0.08, metalness: 0.2, emissive: '#000000' }));
    water.rotation.x = -Math.PI / 2; water.position.y = 0.42;
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 1.25, 10), mats.stone);
    spout.position.set(0, 0.95, -0.35); spout.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), mats.bronze);
    head.position.set(0, 1.62, -0.3); head.castShadow = true;
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.03, 0.95, 6, 1, true), new THREE.MeshBasicMaterial({ color: '#cfe7e6', transparent: true, opacity: 0.55, depthWrite: false }));
    jet.position.set(0, 1.05, -0.12); jet.rotation.x = -0.35;
    g.add(basin, rim, water, spout, head, jet);
    this.water = water;
    this.glow = glowSprite('#9ff0e6', 1.6, tex.dot);
    this.glow.position.set(0, 0.7, 0.2);
    this.glow.material.opacity = 0.0;
    g.add(this.glow);
    this.light = new THREE.PointLight('#8fe0d6', 0, 5, 2);
    this.light.position.set(0, 1.2, 0.8);
    g.add(this.light);
    game.scene.add(g);
    this.t = 0;
  }
  update(dt) {
    this.t += dt;
    const h = this.game.hero;
    if (Math.abs(h.x - this.x) < 1.0 && Math.abs(h.y - this.y) < 1.0) {
      if (!this.active || h.hp < h.maxHp) {
        const first = !this.active;
        this.active = true;
        h.hp = h.maxHp;
        this.game.setCheckpoint(this);
        this.game.events.emit('checkpoint', { id: this.id, first, x: this.x, y: this.y + 0.8 });
        this.pulse = 1;
      }
    }
    if (this.pulse > 0) this.pulse = Math.max(0, this.pulse - dt * 0.8);
    const a = this.active ? 0.35 + 0.1 * Math.sin(this.t * 2) : 0;
    this.glow.material.opacity = a + (this.pulse || 0) * 0.6;
    this.light.intensity = (this.active ? 1.2 : 0) + (this.pulse || 0) * 3;
    this.water.material.emissive.setRGB(0.05 * (this.active ? 1 : 0) + (this.pulse || 0) * 0.3, 0.16 * (this.active ? 1 : 0) + (this.pulse || 0) * 0.5, 0.15 * (this.active ? 1 : 0) + (this.pulse || 0) * 0.45);
  }
}

// ---------------------------------------------------------------------------
// Muro agrietado: secreto visible (polvo que cae y juntas abiertas), se rompe con la espada.
export class CrackedWall {
  constructor(game, { x0, x1, y0, y1, mats, hp = 3 }) {
    this.game = game;
    this.box = { x0, x1, y0, y1 };
    this.hp = hp;
    this.broken = false;
    this.solid = game.physics.addSolid({ x0, y0, x1, y1, surface: 'stone', grab: false, id: 'crackedWall' });
    this.group = new THREE.Group();
    // bloques individuales (luego salen despedidos)
    this.blocks = [];
    const rows = Math.round((y1 - y0) / 0.42);
    const crackMat = mats.crack;
    for (let r = 0; r < rows; r++) {
      const by0 = y0 + (r * (y1 - y0)) / rows, by1 = y0 + ((r + 1) * (y1 - y0)) / rows;
      const off = r % 2 ? 0.0 : (x1 - x0) * 0.5;
      const cuts = [x0, x0 + off * 0.9 + 0.05, x1].filter((v, i, a) => i === 0 || v > a[i - 1] + 0.1);
      for (let i = 0; i < cuts.length - 1; i++) {
        const w = cuts[i + 1] - cuts[i] - 0.025, h = by1 - by0 - 0.025;
        const g = new THREE.BoxGeometry(w, h, 2.2);
        const m = new THREE.Mesh(g, mats.stone);
        m.position.set((cuts[i] + cuts[i + 1]) / 2, (by0 + by1) / 2, -0.4);
        m.rotation.z = (Math.random() - 0.5) * 0.03;
        m.castShadow = m.receiveShadow = true;
        this.group.add(m);
        this.blocks.push(m);
      }
    }
    // grietas: líneas oscuras en la cara frontal
    const pts = [];
    let cx = (x0 + x1) / 2, cy = y1 - 0.1;
    while (cy > y0 + 0.1) { const nx = cx + (Math.random() - 0.5) * 0.35, ny = cy - 0.12 - Math.random() * 0.15; pts.push(cx, cy, 0.72, nx, ny, 0.72); cx = Math.max(x0 + 0.08, Math.min(x1 - 0.08, nx)); cy = ny; }
    for (let k = 0; k < 4; k++) { const sy = y0 + Math.random() * (y1 - y0); pts.push(x0 + 0.05, sy, 0.72, x0 + 0.3 + Math.random() * 0.3, sy + (Math.random() - 0.5) * 0.4, 0.72); }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.cracks = new THREE.LineSegments(lg, crackMat);
    this.group.add(this.cracks);
    game.scene.add(this.group);
    this.dustT = 0;
  }
  hurtbox() { return this.broken ? null : this.box; }
  hit(dmg, heavy) {
    if (this.broken) return;
    this.hp -= heavy ? 3 : 1;
    this.shake = 0.2;
    this.game.events.emit('wallHit', { x: (this.box.x0 + this.box.x1) / 2, y: (this.box.y0 + this.box.y1) / 2 });
    if (this.hp <= 0) this.break();
  }
  break() {
    this.broken = true;
    this.solid.enabled = false;
    this.group.visible = false;
    const b = this.box;
    this.game.events.emit('wallBreak', { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, box: b });
  }
  update(dt) {
    if (this.broken) return;
    this.dustT -= dt;
    if (this.dustT <= 0) {
      // hilo de polvo por las juntas: indicio visible del secreto (§16.5)
      this.dustT = 0.35 + Math.random() * 0.5;
      const b = this.box;
      this.game.fx.dust.emit({ x: b.x0 + Math.random() * (b.x1 - b.x0), y: b.y1 - 0.2 - Math.random() * 1.2, z: 0.75, vx: (Math.random() - 0.5) * 0.1, vy: -0.4, life: 1.6, size: 0.05, grow: 0.06, drag: 0.6, color: [0.75, 0.68, 0.58], alpha: 0.5 });
    }
    if (this.shake > 0) {
      this.shake -= dt;
      this.group.position.x = Math.sin(this.shake * 120) * 0.02 * (this.shake / 0.2);
    } else this.group.position.x = 0;
  }
}

// ---------------------------------------------------------------------------
// Compuerta con encaje: sin la clavija el encaje está vacío; con ella, la rueda gira y la reja sube.
export class SocketGate {
  constructor(game, { gateX0, gateX1, y0, y1, socketX, socketY, mats, tex, wheelZ = -1.6 }) {
    this.game = game;
    this.gate = { x0: gateX0, x1: gateX1, y0, y1 };
    this.socket = { x: socketX, y: socketY };
    this.state = 'closed'; // closed -> turning -> open
    this.t = 0;
    this.solid = game.physics.addSolid({ x0: gateX0, y0, x1: gateX1, y1, surface: 'wood', grab: false, id: 'gate' });
    // Reja de madera reforzada con bronce
    this.gateGroup = new THREE.Group();
    const w = gateX1 - gateX0, h = y1 - y0;
    for (let i = 0; i < 5; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.16, h, 0.22), mats.wood);
      bar.position.set(gateX0 + (i + 0.5) * (w / 5), y0 + h / 2, (i % 2 ? 0.08 : -0.08) - 0.2);
      bar.castShadow = bar.receiveShadow = true;
      this.gateGroup.add(bar);
    }
    for (let j = 0; j < 4; j++) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.12, 0.4), mats.bronze);
      band.position.set((gateX0 + gateX1) / 2, y0 + 0.4 + j * (h - 0.8) / 3, -0.2);
      band.castShadow = true;
      this.gateGroup.add(band);
    }
    for (let i = 0; i < 5; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.25, 6), mats.bronze);
      spike.rotation.x = Math.PI;
      spike.position.set(gateX0 + (i + 0.5) * (w / 5), y0 - 0.1, -0.2);
      this.gateGroup.add(spike);
    }
    mergeByMaterial(this.gateGroup);
    game.scene.add(this.gateGroup);
    // Rueda dentada y encaje en el muro
    this.wheel = buildWheel(1.15, 0.35, { woodUV: mats.woodUV, bronze: mats.bronze }, 8);
    this.wheel.position.set(socketX - 0.2, socketY + 1.6, wheelZ);
    game.scene.add(this.wheel);
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.1, 16), mats.bronze);
    plate.rotation.x = Math.PI / 2;
    plate.position.set(socketX, socketY, -1.05);
    plate.castShadow = true;
    game.scene.add(plate);
    this.hole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 10), new THREE.MeshBasicMaterial({ color: '#0b0908' }));
    this.hole.rotation.x = Math.PI / 2;
    this.hole.position.set(socketX, socketY, -0.99);
    game.scene.add(this.hole);
    this.key = buildClavija();
    this.key.group.scale.setScalar(2.2);
    this.key.group.rotation.x = Math.PI / 2;
    this.key.group.position.set(socketX, socketY, -0.85);
    this.key.group.visible = false;
    game.scene.add(this.key.group);
    // Cadenas que suben con la reja
    this.chainMat = mats.iron;
    this.glow = glowSprite('#ffcf8a', 0.55, tex.dot);
    this.glow.position.set(socketX, socketY, -0.8);
    this.glow.material.opacity = 0;
    game.scene.add(this.glow);
    this.hinted = false;
  }
  near(h) { return Math.abs(h.x - this.socket.x) < 1.0 && Math.abs(h.y - (this.socket.y - 1.2)) < 0.8; }
  prompt(h) {
    if (this.state !== 'closed' || !this.near(h) || h.mode !== 'ground') return null;
    const at = new THREE.Vector3(this.socket.x, this.socket.y + 0.75, 0);
    if (!h.hasClavija) return { key: '', text: 'Encaje vacío: falta una pieza', at, muted: true };
    return { key: 'Q', text: 'Usar la clavija', at };
  }
  onTool(h) {
    if (this.state !== 'closed' || !this.near(h) || !h.hasClavija || h.mode !== 'ground') return false;
    h.setMode('interact', 0.9);
    h.vx = 0;
    h.facing = Math.sign(this.socket.x - h.x) || h.facing;
    h.interact = { kind: 'socket', point: new THREE.Vector3(this.socket.x, this.socket.y, -0.85), t: 0 };
    this.state = 'inserting'; this.t = 0;
    this.game.events.emit('socketInsert', { x: this.socket.x, y: this.socket.y });
    return true;
  }
  update(dt) {
    this.t += dt;
    if (this.state === 'inserting' && this.t > 0.45) {
      this.key.group.visible = true;
      this.state = 'turning'; this.t = 0;
      this.game.events.emit('gateOpening', { x: (this.gate.x0 + this.gate.x1) / 2, y: this.gate.y0 });
    }
    if (this.state === 'turning') {
      const k = clamp(this.t / 2.6, 0, 1);
      const e = easeInOutSine(k);
      const lift = e * (this.gate.y1 - this.gate.y0 - 0.2);
      this.gateGroup.position.y = lift;
      this.key.group.rotation.z = -e * Math.PI * 4;
      this.wheel.rotation.z = -e * Math.PI * 2.5;
      this.glow.material.opacity = 0.6 * (1 - k);
      this.game.cameraShake(0.04 * (1 - smoothstep(0.85, 1, k)));
      if (lift > 1.95) this.solid.enabled = false;
      if (k >= 1) { this.state = 'open'; this.game.events.emit('gateOpen', {}); }
    }
  }
}

// ---------------------------------------------------------------------------
// Disparadores (pistas, títulos de zona, final): volúmenes lógicos sin malla.
export class Trigger {
  constructor({ x0, x1, y0 = -100, y1 = 100, once = true, cond = null, fire }) {
    Object.assign(this, { x0, x1, y0, y1, once, cond, fire });
    this.done = false;
    this.inside = false;
  }
  update(game) {
    const h = game.hero;
    const inside = h.x > this.x0 && h.x < this.x1 && h.y > this.y0 && h.y < this.y1;
    if (inside && !this.inside && !(this.once && this.done) && (!this.cond || this.cond(game))) {
      this.done = true;
      this.fire(game);
    }
    this.inside = inside;
  }
}

export { tmpV };
