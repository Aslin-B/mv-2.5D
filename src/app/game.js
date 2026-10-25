import * as THREE from 'three';
import { Input } from '../core/input.js';
import { mulberry32 } from '../core/rng.js';
import { clamp, damp, lerp } from '../core/math.js';
import { segAABB, sweepHits, expand } from '../core/geom2d.js';
import { PhysicsWorld, moveBody } from '../physics2d/world.js';
import { Hero, TUNING } from '../actors/hero.js';
import { Marauder } from '../actors/marauder.js';
import { ATTACKS, MAGE_CARRY } from '../animation/poses.js';
import { Projectiles } from '../actors/projectiles.js';
import { Sentinel } from '../actors/sentinel.js';
import { RestFountain, CaudalFragment, ClavijaPedestal } from '../world/mechanisms.js';
import { buildShadowMage, MAGE_GLOW } from '../render/shadowMageModel.js';
import { EclipseOrb, ORB_PHASES } from '../render/eclipseOrb.js';
import { Animator } from '../animation/animator.js';
import { buildMarauder, cloneMarauder } from '../render/marauderModel.js';
import { Cape } from '../render/cloth.js';
import { CHAR_EDGE } from '../render/charMaterial.js';
import { SwordTrail } from '../render/trail.js';
import { Particles, Debris } from '../render/particles.js';
import { buildSky, buildMountains, buildLights, updateSun } from '../render/environment.js';
import { softDot, shaftTexture, waterNormals } from '../render/textures.js';
import { GameCamera, sampleCameraZone } from '../render/camera.js';
import { PostFX, QUALITY } from '../render/post.js';
import { GameAudio } from '../audio/audio.js';
import { HUD } from '../ui/hud.js';
import { Screens } from '../ui/screens.js';
import { buildLevel01, SPAWN, LIGHT_ZONES, CAMERA_ZONES, AREAS, MAP_ROOMS, MAP_BOUNDS } from '../world/level01.js';

// Bucle de juego (biblia §20.3): simulación de paso fijo a 60 Hz desacoplada del dibujo, con
// pausa de impacto y cámara lenta como escalas de tiempo explícitas. La física decide; el
// animador explica; el render solo lee el estado.

const DT = 1 / 60;

class Events {
  constructor() { this.map = new Map(); }
  on(n, fn) { if (!this.map.has(n)) this.map.set(n, []); this.map.get(n).push(fn); }
  emit(n, d) { const l = this.map.get(n); if (l) for (const fn of l) fn(d); }
}

function flareTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const h = size / 2;
  // núcleo pequeño y halo corto: marca el punto de contacto sin tapar a los personajes
  const g = ctx.createRadialGradient(h, h, 0, h, h, h * 0.55);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.12, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'lighter';
  // rayos afilados que se desvanecen hacia las puntas
  for (const [len, wid, rot] of [[h, 2.2, 0], [h * 0.62, 1.8, Math.PI / 2]]) {
    ctx.save(); ctx.translate(h, h); ctx.rotate(rot);
    const lg = ctx.createLinearGradient(-len, 0, len, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,0.9)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.moveTo(-len, 0); ctx.lineTo(0, -wid); ctx.lineTo(len, 0); ctx.lineTo(0, wid); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Game {
  constructor({ canvas, hudRoot, screensRoot, params }) {
    this.canvas = canvas;
    this.params = params;
    this.events = new Events();
    this.rng = mulberry32(params.seed || 1234);
    this.settings = this.loadSettings();
    if (params.q && QUALITY[params.q]) this.settings.quality = params.q;
    this.hud = new HUD(hudRoot);
    this.screens = new Screens(screensRoot, this);
    this.audio = new GameAudio();
    this.input = new Input(canvas);
    this.state = 'loading';
    this.simTime = 0;
    this.acc = 0;
    this.timeScale = 1; this.slowT = 0;
    this.hitstop = 0;
    this.flash = 0; this.fade = 1; this.fadeTarget = 0; this.letterbox = 0; this.letterboxTarget = 0;
    this.mistSources = [];
    this.emberSources = [];
    this.stats = { time: 0, kills: 0, parries: 0, damage: 0, secrets: 0, enemies: 0 };
    this.debugOn = false;
    this.fps = 60; this.frameMs = 16;
    this.checkpoint = { x: SPAWN.x, y: SPAWN.y };
  }

  loadSettings() {
    const def = { quality: 'medio', shake: true, mute: false };
    try { return { ...def, ...JSON.parse(localStorage.getItem('acueducto.settings') || '{}') }; } catch { return def; }
  }
  saveSettings() { try { localStorage.setItem('acueducto.settings', JSON.stringify(this.settings)); } catch { /* sin almacenamiento */ } }

  // ---------------------------------------------------------------------------------
  init() {
    const t0 = performance.now();
    const q = QUALITY[this.settings.quality];
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5) * q.pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;
    scene.fog = new THREE.FogExp2('#b79c8e', 0.011);
    this.sky = buildSky();
    scene.add(this.sky);
    scene.add(buildMountains());
    // Entorno de reflejos a partir del propio cielo (PMREM)
    {
      const pm = new THREE.PMREMGenerator(renderer);
      const envScene = new THREE.Scene();
      const sky2 = buildSky();
      sky2.scale.setScalar(0.1);
      envScene.add(sky2);
      this.envRT = pm.fromScene(envScene, 0.02, 0.1, 200);
      scene.environment = this.envRT.texture;
      pm.dispose();
    }
    this.lights = buildLights(scene, { shadowSize: q.shadowSize });

    this.tex = { dot: softDot(64), shaft: shaftTexture(), waterN: waterNormals(), flare: flareTexture() };
    this.physics = new PhysicsWorld();
    this.level = buildLevel01(this, this.tex);

    // Héroe: mago de sombras (modelo ligero para el juego), abrigo abierto simulado en dos paños
    // (delantero con faldones que dejan ver las piernas y trasero con el forro violeta) y la esfera
    // del eclipse que crece sobre la palma activa.
    const model = buildShadowMage({ hiDetail: false });
    this.heroModel = model;
    scene.add(model.root);
    this.hero = new Hero(this, SPAWN.x, SPAWN.y);
    this.heroAnim = new Animator(model, { carry: MAGE_CARRY });
    const coatFront = new Cape(model, scene, model.coatCloth.front);
    const coatBack = new Cape(model, scene, model.coatCloth.back);
    this.heroCape = {
      parts: [coatFront, coatBack], panels: [...coatFront.panels, ...coatBack.panels],
      step(dt, w) { coatFront.step(dt, w * 0.55); coatBack.step(dt, w * 0.55); },
      reset() { coatFront.reset(); coatBack.reset(); },
    };
    for (const F of Object.values(model.foci)) { F.flare.material.map = this.tex.dot; F.flare.material.needsUpdate = true; }
    this.heroOrb = new EclipseOrb(scene, { dot: this.tex.dot, light: true });
    this.trail = new SwordTrail(scene, { color: new THREE.Color(1.1, 0.55, 2.4) });
    this.projectiles = new Projectiles(this);
    this.hero.grounded = true;
    // mira láser del apuntado libre
    {
      const g = new THREE.PlaneGeometry(1, 1);
      g.translate(0.5, 0, 0);
      this.laser = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 0.6, 2.8), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      this.laser.renderOrder = 9;
      this.laser.visible = false;
      scene.add(this.laser);
    }

    // Enemigos
    const tpl = buildMarauder();
    this.marauderTris = tpl.triangles;
    this.enemies = this.level.enemySpawns.map((s, i) => new Marauder(this, i === 0 ? tpl : cloneMarauder(tpl), s));
    // contorno rojizo y apagado: amenaza legible sin parecer un efecto de interfaz
    for (const e of this.enemies) for (const m of e.model.materials) m.userData.edgeTint.value.setRGB(1.25, 0.62, 0.48);
    // personajes por encima de las secciones negras del primer plano (ver sections.js)
    const front = (o) => o.traverse((q) => { q.renderOrder = Math.max(q.renderOrder, 3); });
    front(model.root);
    for (const p of this.heroCape.panels) front(p.mesh);
    for (const e of this.enemies) { front(e.model.root); for (const p of e.cape.panels) front(p.mesh); }
    // vigías voladores: comparten con los saqueadores la interfaz de daño (hurtbox/takeHit)
    this.sentinels = (this.level.sentinelSpawns || []).map((s) => new Sentinel(this, s));
    this.hostiles = [...this.enemies, ...this.sentinels];
    this.stats.enemies = this.hostiles.length;

    // Efectos
    this.fx = {
      dust: new Particles(700, this.tex.dot, { additive: false }),
      sparks: new Particles(300, this.tex.dot, { additive: true }),
      motes: new Particles(420, this.tex.dot, { additive: true }),
      mist: new Particles(260, this.tex.dot, { additive: false }),
      embers: new Particles(160, this.tex.dot, { additive: true }),
      arcane: new Particles(1200, this.tex.dot, { additive: true, fogged: false }),
    };
    for (const k in this.fx) scene.add(this.fx[k].points);
    this.debris = new Debris(scene, this.level.mats.stone);
    this.glints = [];
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.flare, color: '#fff2d8', transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
      s.visible = false; s.renderOrder = 20;
      scene.add(s);
      this.glints.push({ s, t: 0, dur: 0.5, size: 1 });
    }

    // Cámara y posproceso
    this.camera = new GameCamera(window.innerWidth / window.innerHeight);
    this.camera.shakeScale = this.settings.shake ? 1 : 0.25;
    this.camera.snap({ x: this.hero.x, y: this.hero.y, facing: 1 }, sampleCameraZone(CAMERA_ZONES, this.hero.x));
    this.post = new PostFX(renderer, scene, this.camera.cam, this.settings.quality);
    this.post.setSize(window.innerWidth, window.innerHeight);

    // mapa local: sólidos, salas y puntos de interés
    {
      const M = this.level.mechanisms;
      const marks = [];
      for (const m of M) {
        if (m instanceof RestFountain) marks.push({ x: m.x, y: m.y, color: '#7df0b0' });
      }
      const frag = M.find((m) => m instanceof CaudalFragment);
      if (frag) marks.push({ x: frag.x, y: frag.y, color: '#ffd27a', hidden: () => frag.taken });
      const ped = M.find((m) => m instanceof ClavijaPedestal);
      if (ped) marks.push({ x: ped.x, y: ped.y, color: '#ffb35c', hidden: () => this.hero.hasClavija });
      this.hud.initMap(this.physics.solids, MAP_ROOMS, marks, MAP_BOUNDS);
    }
    this.bindEvents();
    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'play') this.pause(); });
    this.input.onPress((a) => this.onUIPress(a));
    this.applyZone(this.hero.x, true);
    this.buildMs = performance.now() - t0;
    // Primer fotograma: compilar materiales sin tirones posteriores
    this.renderer.compile(scene, this.camera.cam);
    this.state = 'title';
  }

  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.setAspect(w / h);
    this.post.setSize(w, h);
  }

  setQuality(name) {
    this.settings.quality = name;
    this.saveSettings();
    const q = QUALITY[name];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5) * q.pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    const sun = this.lights.sun;
    if (sun.shadow.mapSize.x !== q.shadowSize) {
      sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
    this.post.build(name);
    this.post.setSize(window.innerWidth, window.innerHeight);
  }

  applySettings() {
    this.saveSettings();
    this.camera.shakeScale = this.settings.shake ? 1 : 0.25;
    this.audio.setMuted(this.settings.mute);
  }

  cameraShake(a) { this.camera.addTrauma(a * (this.settings.shake ? 1 : 0.3)); }
  setCheckpoint(f) { this.checkpoint = { x: f.x + 0.9, y: f.y }; }

  // ---------------------------------------------------------------------------------
  start() {
    this.state = 'play';
    if (this.params.test !== '1') this.audio.unlock();
    this.audio.setMuted(this.settings.mute);
    this.fadeTarget = 0;
    this.hud.setVisible(true);
    this.hud.updateHP(this.hero.hp, this.hero.maxHp);
    this.hud.setTool(false);
    if (this.params.cine !== '0') this.introCine();
    this.hud.areaTitle(AREAS[0].name, AREAS[0].sub);
  }

  pause() { if (this.state !== 'play') return; this.state = 'pause'; this.input.clear(); this.screens.pause(); }
  resume() { this.state = 'play'; this.input.clear(); this.lastNow = performance.now(); }

  restart() {
    const h = this.hero;
    // reinicio completo de la partida en curso: recargar es la forma más fiable de restablecerlo todo
    void h;
    const url = new URL(window.location.href);
    url.searchParams.set('autostart', '1');
    window.location.href = url.toString();
  }

  onUIPress(a) {
    if (a === 'debug') { this.debugOn = !this.debugOn; if (!this.debugOn) this.hud.debug(''); return; }
    if (a === 'mute') { this.settings.mute = !this.settings.mute; this.applySettings(); this.hud.toast(this.settings.mute ? 'Sonido silenciado' : 'Sonido activado'); return; }
    if (this.screens.current) { this.audio.unlock(); this.screens.nav(a); return; }
    if (a === 'pause' && this.state === 'play') this.pause();
  }

  // ---------------------------------------------------------------------------------
  introCine() {
    const h = this.hero;
    this.camera.cine = {
      pos: new THREE.Vector3(h.x + 1.55, h.y + 1.72, 2.3),
      look: new THREE.Vector3(h.x + 0.05, h.y + 1.6, 0),
      fov: 30, blend: 0.05,
    };
    this.camera.cineW = 1;
    this.cineTimer = 2.4;
    this.cineKind = 'intro';
  }

  finishLevel() {
    if (this.state !== 'play' || this.finishing) return;
    this.finishing = true;
    this.hero.locked = true;
    const h = this.hero;
    this.camera.cine = { pos: new THREE.Vector3(h.x + 1.5, h.y + 1.75, 2.2), look: new THREE.Vector3(h.x, h.y + 1.6, 0), fov: 30, blend: 0.8 };
    this.letterboxTarget = 1;
    this.hud.setVisible(false);
    this.endTimer = 4.2;
  }

  // ---------------------------------------------------------------------------------
  bindEvents() {
    const E = this.events, A = this.audio;
    const panX = (x) => clamp((x - this.camera.x) / 8, -1, 1);
    E.on('jump', (d) => { A.play('jump', { pan: panX(d.x) }); this.puff(d.x, d.y, 6, 0.6); });
    E.on('land', (d) => {
      A.play('land', { impact: d.impact, pan: panX(d.x) });
      this.puff(d.x, d.y, Math.round(4 + d.impact * 0.8), 0.4 + d.impact * 0.06);
      if (d.impact > 14) this.cameraShake(0.22);
    });
    E.on('dodge', (d) => {
      A.play('dash', { pan: panX(d.x) });
      this.puff(d.x, d.y, 6, 0.6);
      this.dashFx = 0.24;
    });
    E.on('shoot', (d) => {
      A.play(d.kind, { pan: panX(d.x) });
      this.muzzleT = d.kind === 'bolt' ? 0.07 : 0.16;
      this.muzzleKind = d.kind;
      if (d.kind === 'counter') {
        this.cameraShake(0.35);
        this.burst(this.fx.arcane, d.x, d.y, 26, [2.4, 1.7, 0.6], 3.2, 0.35);
      } else if (d.kind !== 'bolt') {
        // lanzamiento del eclipse: retroceso de cámara y estallido de sombra según la fase
        const k = d.kind === 'eclipse' ? 1 : d.kind === 'condense' ? 0.55 : 0.25;
        this.cameraShake(0.08 + k * 0.3);
        if (d.kind === 'eclipse') this.hitstop = Math.max(this.hitstop, 0.05);
        this.burst(this.fx.arcane, d.x, d.y, Math.round(10 + k * 30), [1.1, 0.5, 2.3], 2 + k * 2.5, 0.3 + k * 0.2);
        this.burst(this.fx.arcane, d.x, d.y, Math.round(6 + k * 18), [0.25, 0.1, 0.45], 1.5 + k * 2, 0.4);
      }
    });
    E.on('chargePhase', (d) => {
      A.play('chargePhase', { phase: d.phase });
      if (d.phase >= 2) this.cameraShake(d.phase === 3 ? 0.12 : 0.05);
    });
    E.on('chargeFull', () => { this.flash = 0.06; this.post.final.uniforms.flashColor.value.set('#9a6cff'); });
    E.on('counter', () => {
      this.slow(0.35, 0.35);
      this.flash = 0.16; this.post.final.uniforms.flashColor.value.set('#ffe6a8');
    });
    E.on('reflect', (d) => { A.play('parry', { pan: panX(d.x) }); this.hitstop = Math.max(this.hitstop, 0.06); this.burst(this.fx.arcane, d.x, d.y, 24, [2.4, 1.7, 0.6], 4, 0.4); });
    E.on('boltImpact', (d) => {
      A.play('impact', { heavy: d.heavy, pan: panX(d.x) });
      if (d.heavy) this.cameraShake(0.16);
    });
    E.on('slide', () => A.play('slide'));
    E.on('ledge', () => A.play('ledge'));
    E.on('mantle', () => A.play('ledge'));
    E.on('attack', (d) => A.play(d.id === 'strike' ? 'strike' : 'swing', { heavy: d.id === 'cut3' || d.id === 'riposte' }));
    E.on('heroHit', (d) => {
      A.play('heroHit');
      this.hitstop = Math.max(this.hitstop, 0.06);
      this.flash = 0.28; this.post.final.uniforms.flashColor.value.set('#ff5a3c');
      this.cameraShake(0.4);
      this.stats.damage += d.dmg;
      this.burst(this.fx.dust, d.x, d.y, 10, [0.6, 0.5, 0.42], 2.2);
    });
    E.on('heroDead', () => { this.deathTimer = 2.2; this.letterboxTarget = 0; });
    E.on('enemyAlert', (d) => A.play('alert', { pan: panX(d.who.x) }));
    E.on('enemyWindup', (d) => A.play('windup', { pan: panX(d.who.x) }));
    E.on('enemyTell', (d) => { A.play('tell', { pan: panX(d.who.x) }); this.glint(d.tip, 0.45, 0.8); });
    E.on('enemyDead', (d) => {
      A.play('enemyDead', { pan: panX(d.x) });
      this.slow(0.4, 0.35);
      this.stats.kills++;
      this.puff(d.x, d.y, 14, 1.2);
    });
    E.on('parry', (d) => {
      A.play('parry', { pan: panX(d.x) });
      this.hitstop = Math.max(this.hitstop, 0.09);
      this.slow(0.45, 0.3);
      this.flash = 0.22; this.post.final.uniforms.flashColor.value.set('#fff1d6');
      this.cameraShake(0.32);
      this.burst(this.fx.sparks, d.x, d.y, 34, [1.0, 0.78, 0.45], 6, 0.5);
      this.glint(new THREE.Vector3(d.x, d.y, 0.3), 0.3, 1.05);
      this.hud.toast('¡Desvío! Lanza el contraconjuro (J)', 1.6);
    });
    E.on('runeBreak', (d) => {
      A.play('impact', { heavy: true, pan: panX(d.x) });
      A.play('stone', { pan: panX(d.x) });
      this.debris.burst(d.box.x0, d.box.y0, d.box.x1 - d.box.x0, d.box.y1 - d.box.y0, 8, (x) => this.groundBelow(x, d.box.y1));
      this.burst(this.fx.arcane, d.x, d.y, 22, [d.color.r, d.color.g, d.color.b], 3.4, 0.45);
      this.glint(new THREE.Vector3(d.x, d.y, 1.5), 0.2, 1.1);
      this.cameraShake(0.14);
    });
    E.on('runeResist', (d) => { A.play('armor', { pan: panX(d.x) }); this.burst(this.fx.sparks, d.x, d.y, 8, [0.6, 1.6, 2.0], 2.5, 0.25); this.hud.toast('El sello solo cede al éter: dispara (J)', 1.8); });
    E.on('wallHit', (d) => { A.play('stone'); this.burst(this.fx.dust, d.x, d.y, 12, [0.7, 0.64, 0.55], 2); this.cameraShake(0.12); });
    E.on('wallBreak', (d) => {
      A.play('wallBreak');
      this.debris.burst(d.box.x0, d.box.y0, d.box.x1 - d.box.x0, d.box.y1 - d.box.y0, 26, (x) => this.groundBelow(x, d.box.y1));
      for (let i = 0; i < 40; i++) this.fx.dust.emit({ x: d.box.x0 + Math.random() * 1.2, y: d.box.y0 + Math.random() * 3, z: Math.random() * 1.5 - 0.5, vx: (Math.random() - 0.3) * 2, vy: Math.random() * 1.2, life: 2 + Math.random() * 2, size: 0.25, grow: 0.5, drag: 0.4, color: [0.66, 0.6, 0.52], alpha: 0.45 });
      this.cameraShake(0.45);
      this.hud.toast('Un paso oculto en el muro', 2.6);
    });
    E.on('secret', (d) => {
      A.play('secret');
      this.stats.secrets++;
      this.hud.banner('Fragmento de caudal', 'Tu reserva aumenta en un vaso de vida.');
      this.burst(this.fx.sparks, d.x, d.y, 30, [0.55, 0.95, 0.88], 2.5, 0.8);
    });
    E.on('checkpoint', (d) => {
      if (d.first) { A.play('checkpoint'); this.hud.toast('Fuente de descanso: punto de control y vida restaurada', 3); }
      this.burst(this.fx.sparks, d.x, d.y, 16, [0.6, 0.95, 0.9], 1.4, 0.8);
    });
    E.on('pickupStart', () => {
      const h = this.hero;
      this.hero.locked = true;
      this.camera.cine = { pos: new THREE.Vector3(h.x + 1.0, h.y + 1.45, 3.4), look: new THREE.Vector3(h.x + 0.6, h.y + 1.05, 0), fov: 30, blend: 0.35 };
      this.letterboxTarget = 1;
      this.cineKind = 'pickup';
    });
    E.on('acquire', (d) => {
      A.play('acquire');
      this.heroModel.clavija.group.visible = true;
      this.hud.setTool(true);
      this.hud.banner('Clavija de forja', 'Encaja en los mecanismos de bronce. Úsala con Q junto a un encaje.', 5);
      this.burst(this.fx.sparks, d.x, d.y, 40, [1.0, 0.8, 0.5], 1.8, 0.9);
      this.cineTimer = 2.2;
    });
    E.on('socketInsert', () => A.play('socket'));
    E.on('gateOpening', (d) => {
      A.play('gate', { pan: panX(d.x) });
      this.hero.locked = true;
      this.camera.cine = { pos: new THREE.Vector3(d.x - 2.6, d.y + 3.0, 10.5), look: new THREE.Vector3(d.x - 1.6, d.y + 2.6, 0), fov: 32, blend: 0.4 };
      this.letterboxTarget = 1;
      for (let i = 0; i < 30; i++) this.fx.dust.emit({ x: d.x + (Math.random() - 0.5) * 1.2, y: d.y + 4.4, z: (Math.random() - 0.5) * 0.8, vx: (Math.random() - 0.5) * 0.4, vy: -0.6 - Math.random(), life: 2.5, size: 0.08, grow: 0.15, drag: 0.7, gravity: 1, color: [0.6, 0.55, 0.47], alpha: 0.6 });
    });
    E.on('gateOpen', () => { this.camera.cine = null; this.hero.locked = false; this.letterboxTarget = 0; this.hud.toast('La compuerta está abierta', 2.4); });
  }

  // ---------------------------------------------------------------------------------
  groundBelow(x, y) { const g = this.physics.groundBelow(x, y + 0.5, 30); return g ? g.y1 : -3; }

  puff(x, y, n, spread) {
    for (let i = 0; i < n; i++) {
      const a = (Math.random() - 0.5) * Math.PI;
      this.fx.dust.emit({ x: x + (Math.random() - 0.5) * 0.3, y: y + 0.05, z: (Math.random() - 0.5) * 0.6, vx: Math.sin(a) * spread * (0.5 + Math.random()), vy: 0.2 + Math.random() * 0.4, vz: (Math.random() - 0.5) * spread * 0.5, life: 0.6 + Math.random() * 0.7, size: 0.14 + Math.random() * 0.1, grow: 0.35, drag: 0.08, color: [0.64, 0.57, 0.48], alpha: 0.35 });
    }
  }

  burst(sys, x, y, n, color, speed, life = 0.45) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random());
      const spark = sys === this.fx.sparks || sys === this.fx.arcane;
      sys.emit({ x, y, z: 0.2, vx: Math.cos(a) * s, vy: Math.sin(a) * s + 1, vz: (Math.random() - 0.5) * s, life: life * (0.5 + Math.random()), size: spark ? 0.04 + Math.random() * 0.03 : 0.12, grow: spark ? -0.05 : 0.3, drag: sys === this.fx.arcane ? 0.25 : 0.05, gravity: sys === this.fx.sparks ? 9 : sys === this.fx.arcane ? 1.2 : 0.5, color, alpha: 1 });
    }
  }

  glint(pos, dur, size) {
    const g = this.glints.find((q) => q.t <= 0) || this.glints[0];
    g.s.position.copy(pos);
    g.t = dur; g.dur = dur; g.size = size;
    g.s.visible = true;
  }

  slow(dur, scale) { this.slowT = Math.max(this.slowT, dur); this.slowScale = scale; }

  // ---------------------------------------------------------------------------------
  // Un paso fijo de simulación.
  step() {
    const input = this.input;
    if (this.hitstop > 0) {
      this.hitstop -= DT;
      input.beginTick(this.simTime);
      input.endTick();
      return;
    }
    this.simTime += DT;
    input.beginTick(this.simTime);
    const hero = this.hero;
    if (this.state === 'play' && !this.finishing) this.stats.time += DT;

    // Interacciones (E y Q)
    if (!hero.locked && this.state === 'play') {
      if (input.pressed('interact', 0.12)) {
        for (const m of this.level.mechanisms) if (m.onInteract && m.onInteract(hero)) { input.consume('interact'); break; }
      }
      if (input.pressed('tool', 0.12)) {
        let used = false;
        for (const m of this.level.mechanisms) if (m.onTool && m.onTool(hero)) { used = true; break; }
        if (!used && !hero.hasClavija) { /* sin herramienta todavía */ }
        input.consume('tool');
      }
    }

    hero.update(DT, input);
    // separar cuerpos (los enemigos no se atraviesan salvo esquivando)
    for (const e of this.enemies) {
      if (!e.alive || hero.mode === 'dead') continue;
      const dx = hero.x - e.x;
      const minD = 0.5;
      if (Math.abs(dx) < minD && Math.abs(hero.y - e.y) < 1.2 && !['roll', 'slide', 'airdash', 'hang', 'mantle'].includes(hero.mode)) {
        moveBody(this.physics, hero.body, (Math.sign(dx) || 1) * (minD - Math.abs(dx)) * 0.6, 0, {});
      }
    }

    // Animación del héroe (dentro del paso: el combate usa la hoja animada)
    const anim = this.heroAnim;
    anim.update(DT, hero.animState());
    for (const ev of anim.events) {
      if (ev.type === 'step') {
        const surf = hero.groundSolid ? hero.groundSolid.surface : 'stone';
        this.audio.play('step', { surface: surf, speed: ev.speed, armor: true });
        if (ev.speed > 5) this.puff(hero.x - hero.facing * 0.1, hero.y, 2, 0.3);
      }
    }
    const sweep = hero.bladeSweep(anim);
    this.heroCape.step(DT, -hero.vx * 0.6 + 1.2 - hero.facing * ORB_PHASES.auraAt(hero.cast));
    const swinging = hero.attack && ATTACKS[hero.attack.id].damage > 0 && hero.attack.t > ATTACKS[hero.attack.id].active[0] - 0.05 && hero.attack.t < ATTACKS[hero.attack.id].active[1] + 0.06;
    this.trail.push(anim.bladeBase, anim.bladeTip, swinging);
    this.heroModel.clavija.group.visible = hero.hasClavija;
    this.projectiles.update(DT);
    this.arcaneFx(DT);

    // Enemigos (duermen lejos de la cámara)
    for (const e of this.enemies) {
      const near = Math.abs(e.x - hero.x) < 22;
      if (near || e.state === 'attack') e.update(DT);
      if (Math.abs(e.x - this.camera.x) < 20) e.animate(DT, 0.8);
    }
    for (const s of this.sentinels) {
      if (Math.abs(s.x - hero.x) < 22) s.update(DT);
      if (Math.abs(s.x - this.camera.x) < 20) s.animate(DT);
    }

    this.resolveCombat(sweep);

    // Mecanismos y disparadores
    for (const m of this.level.mechanisms) m.update(DT);
    if (this.state === 'play') for (const t of this.level.triggers) t.update(this);

    // Agua y caídas: retorno al último suelo seguro sin daño (huecos de aprendizaje, §17.2)
    if (!this.respawnT && hero.mode !== 'dead') {
      const b = hero.body;
      const vols = this.physics.volumesAt(b.x - 0.2, b.y, b.x + 0.2, b.y + 0.6);
      const v = vols.find((q) => q.type === 'water' || q.type === 'kill');
      if (v) {
        this.respawnT = 0.75;
        hero.locked = true;
        this.audio.play('splash');
        for (let i = 0; i < 26; i++) this.fx.mist.emit({ x: b.x + (Math.random() - 0.5) * 0.6, y: -0.25, z: (Math.random() - 0.5) * 0.8, vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3, life: 0.9, size: 0.12, grow: 0.3, drag: 0.4, gravity: 7, color: [0.85, 0.9, 0.9], alpha: 0.7 });
        this.fadeTarget = 1;
      }
    }
    if (this.respawnT) {
      this.respawnT -= DT;
      if (this.respawnT <= 0) {
        this.respawnT = 0;
        const s = hero.lastSafe;
        hero.respawn(s.x, s.y + 0.05);
        anim.reset(); this.heroCape.reset(); this.trail.clear();
        hero.locked = false;
        this.fadeTarget = 0;
        this.camera.snap({ x: hero.x, y: hero.y, facing: hero.facing }, sampleCameraZone(CAMERA_ZONES, hero.x));
      }
    }
    if (this.deathTimer) {
      this.deathTimer -= DT;
      if (this.deathTimer < 0.8) this.fadeTarget = 1;
      if (this.deathTimer <= 0) {
        this.deathTimer = 0;
        const c = this.checkpoint;
        hero.respawn(c.x, c.y, true);
        anim.reset(); this.heroCape.reset(); this.trail.clear();
        for (const e of this.enemies) if (e.alive) this.resetEnemy(e);
        for (const s of this.sentinels) if (s.alive) s.reset();
        this.fadeTarget = 0;
        this.camera.snap({ x: hero.x, y: hero.y, facing: hero.facing }, sampleCameraZone(CAMERA_ZONES, hero.x));
        this.hud.toast('Vuelves a la fuente de descanso', 2.4);
      }
    }

    // Partículas ambientales
    this.ambientParticles();
    for (const k in this.fx) this.fx[k].update(DT, 0.4);
    this.debris.update(DT);

    // Fin de cinemáticas temporizadas
    if (this.cineTimer > 0) {
      this.cineTimer -= DT;
      const moving = this.cineKind === 'intro' && (input.axisX() !== 0 || input.isDown('jump') || input.isDown('attack'));
      if (this.cineTimer <= 0 || moving) {
        this.cineTimer = 0;
        this.camera.cine = null;
        if (this.cineKind === 'pickup') { this.hero.locked = false; this.letterboxTarget = 0; }
        this.cineKind = null;
      }
    }
    if (this.endTimer > 0) {
      this.endTimer -= DT;
      if (this.endTimer < 1.0) this.fadeTarget = 0.85;
      if (this.endTimer <= 0) { this.state = 'end'; this.screens.end({ ...this.stats, parries: hero.stats.parries }); }
    }
    input.endTick();
  }

  resetEnemy(e) {
    e.body.x = e.home.x; e.body.y = e.home.y;
    e.hp = 100; e.attack = null; e.vx = 0; e.alerted = false; e.mode = 'ground';
    e.setState('patrol');
    e.anim.reset(); e.cape.reset();
  }

  spawnBolt(spec) {
    // los orbes del eclipse parten de la esfera que el mago sostenía en la palma
    if (spec.owner === 'hero' && (spec.kind === 'seed' || spec.kind === 'condense' || spec.kind === 'eclipse') && this.heroOrb.visible) {
      spec = { ...spec, x: this.heroOrb.center.x, y: this.heroOrb.center.y };
    }
    return this.projectiles.fire(spec);
  }

  onBoltHitEnemy(p, e, res) {
    this.hero.stats.hits++;
    if (res === 'dead') return;
    if (res === 'stagger') { this.hitstop = Math.max(this.hitstop, 0.05); this.cameraShake(0.14); }
    else if (res === 'armor') this.audio.play('armor');
  }

  // Partículas del poder: motas de sombra que la esfera atrae en espiral durante la carga (cada fase
  // atrae desde más lejos) y estela del paso etéreo.
  arcaneFx(dt) {
    const hero = this.hero, orb = this.heroOrb;
    if (hero.charging && orb.visible && !orb.flying) {
      const f = orb.center, ph = hero.phase;
      const n = ph >= 3 ? 3 : ph >= 2 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, r = 0.3 + Math.random() * (0.25 + ph * 0.18);
        const ox = Math.cos(a) * r, oy = Math.sin(a) * r * 0.8, oz = (Math.random() - 0.5) * 0.3;
        // velocidad hacia el núcleo con giro tangencial: espiral
        const life = 0.3 + Math.random() * 0.12, k = 1 / life;
        const dark = Math.random() < 0.55;
        this.fx.arcane.emit({ x: f.x + ox, y: f.y + oy, z: f.z + oz, vx: (-ox - oy * 0.6) * k, vy: (-oy + ox * 0.6) * k, vz: -oz * k, life, size: 0.025 + ph * 0.01, grow: -0.07, drag: 0, gravity: 0, color: dark ? [0.32, 0.14, 0.62] : [1.1, 0.5, 2.2], alpha: dark ? 0.6 : 0.85 });
      }
    }
    if (this.dashFx > 0) {
      this.dashFx -= dt;
      // silueta de motas a lo largo del cuerpo: imagen residual del paso etéreo
      for (let i = 0; i < 9; i++) {
        const h = Math.random();
        this.fx.arcane.emit({ x: hero.x + (Math.random() - 0.5) * 0.4, y: hero.y + h * 1.75, z: (Math.random() - 0.5) * 0.3, vx: -hero.vx * 0.06, vy: 0.1, life: 0.3 + Math.random() * 0.15, size: 0.05 + (1 - Math.abs(h - 0.55)) * 0.03, grow: -0.08, drag: 2, gravity: 0, color: [0.75, 0.38, 1.6], alpha: 0.7 });
      }
    }
  }

  resolveCombat(sweep) {
    const hero = this.hero;
    // Golpes de Aren: barrido real de la hoja contra cajas de daño (§14.3)
    if (hero.activeWindow()) {
      const atk = ATTACKS[hero.attack.id];
      const heavy = !!atk.heavy || hero.attack.id === 'riposte';
      for (const e of this.hostiles) {
        if (!e.alive || hero.attack.hits.has(e)) continue;
        const box = expand(e.hurtbox(), 0.06);
        if (!sweepHits(sweep.prev, sweep.cur, box)) continue;
        hero.attack.hits.add(e);
        const res = e.takeHit(atk.damage, hero.x, { heavy });
        hero.stats.hits++;
        const px = clamp(sweep.cur.b.x, box.x0, box.x1), py = clamp(sweep.cur.b.y, box.y0 + 0.3, box.y1 - 0.2);
        if (res === 'armor') {
          this.audio.play('armor');
          this.burst(this.fx.sparks, px, py, 12, [1, 0.75, 0.4], 3.5, 0.35);
          this.hitstop = Math.max(this.hitstop, 0.03);
        } else {
          this.audio.play('hitFlesh');
          this.burst(this.fx.dust, px, py, 8, [0.45, 0.36, 0.28], 2.4, 0.5);
          this.burst(this.fx.sparks, px, py, 5, [1, 0.85, 0.6], 2.2, 0.25);
          this.hitstop = Math.max(this.hitstop, heavy ? 0.075 : 0.035);
          this.cameraShake(heavy ? 0.26 : 0.12);
        }
      }
      for (const m of this.level.mechanisms) {
        if (!m.hurtbox || hero.attack.hits.has(m)) continue;
        const box = m.hurtbox();
        if (!box || !sweepHits(sweep.prev, sweep.cur, expand(box, 0.05))) continue;
        hero.attack.hits.add(m);
        m.hit(atk.damage, heavy);
        this.hitstop = Math.max(this.hitstop, 0.04);
      }
    }
    // Estocadas de los saqueadores
    for (const e of this.enemies) {
      if (!e.attackActive()) continue;
      const seg = e.spearSegment();
      const hb = hero.hurtbox();
      if (!segAABB(seg.a.x, seg.a.y, seg.b.x, seg.b.y, hb)) continue;
      const facingEnemy = Math.sign(e.x - hero.x) === hero.facing;
      if (hero.parryActive() && facingEnemy) {
        e.onParried();
        hero.attack.parried = true;
        hero.riposteWindow = 1.1;
        hero.riposteTarget = e;
        hero.stats.parries++;
        this.events.emit('parry', { x: seg.b.x, y: seg.b.y });
      } else if (!hero.isInvulnerable()) {
        e.hitThisAttack = true;
        hero.takeHit(e.attack ? 1 : 1, e.x, { knock: 5.5 });
      }
    }
  }

  ambientParticles() {
    const cx = this.camera.x;
    // motas de polvo en los haces de luz
    for (const s of this.level.shafts) {
      if (Math.abs(s.x - cx) > 12 || this.rng() > 0.18) continue;
      const t = this.rng() * 6;
      this.fx.motes.emit({ x: s.x + (this.rng() - 0.5) * 1.4 - 0.62 * t * 0.6, y: s.y - t * 0.42 * 0.6 + (this.rng() - 0.5), z: s.z + 0.66 * t * 0.6, vx: (this.rng() - 0.5) * 0.05, vy: (this.rng() - 0.3) * 0.04, life: 3 + this.rng() * 3, size: 0.018 + this.rng() * 0.02, drag: 0.9, color: [1.0, 0.85, 0.62], alpha: 0.7 });
    }
    for (const m of this.mistSources) {
      if (Math.abs(m.x - cx) > 16 || this.rng() > 0.5) continue;
      this.fx.mist.emit({ x: m.x + (this.rng() - 0.5) * m.w, y: m.y, z: m.z + this.rng() * 0.6, vx: (this.rng() - 0.5) * 0.3, vy: 0.4 + this.rng() * 0.5, vz: 0.3, life: 2.5, size: 0.5, grow: 0.8, drag: 0.6, color: [0.82, 0.84, 0.83], alpha: 0.12 });
    }
    for (const m of this.emberSources) {
      if (Math.abs(m.x - cx) > 14 || this.rng() > 0.12) continue;
      this.fx.embers.emit({ x: m.x + (this.rng() - 0.5) * m.w, y: m.y, z: m.z, vx: (this.rng() - 0.5) * 0.2, vy: 0.5 + this.rng() * 0.6, life: 1.6, size: 0.025, drag: 0.8, gravity: -0.2, color: [1, 0.45, 0.15], alpha: 1 });
    }
    // polen y briznas en el aire exterior
    const z = LIGHT_ZONES.sample(cx);
    if (z.hemi > 0.7 && this.rng() < 0.25) {
      this.fx.motes.emit({ x: cx + (this.rng() - 0.5) * 18, y: this.camera.y + (this.rng() - 0.5) * 6, z: (this.rng() - 0.3) * 4, vx: 0.25 + this.rng() * 0.3, vy: (this.rng() - 0.5) * 0.1, life: 5, size: 0.02, drag: 1, color: [1, 0.88, 0.7], alpha: 0.5 });
    }
  }

  applyZone(x, snap = false) {
    // media a lo ancho del encuadre: la exposición se adapta a lo que se ve (una puerta abierta al
    // exterior ya no se quema con la exposición del interior)
    const c = this.camera.cam;
    const hw = this.camera.dist * Math.tan(THREE.MathUtils.degToRad(c.fov / 2)) * c.aspect;
    const z = LIGHT_ZONES.sampleView(x, hw);
    const k = snap ? 1 : 0.06;
    const L = this.lights;
    const r = this.renderer;
    r.toneMappingExposure = lerp(r.toneMappingExposure, z.exposure, k);
    L.sun.intensity = lerp(L.sun.intensity, z.sun, k);
    L.hemi.intensity = lerp(L.hemi.intensity, z.hemi, k);
    this.fillBase = lerp(this.fillBase ?? z.fill, z.fill, k);
    L.fill.intensity = this.fillBase;
    this.scene.fog.density = lerp(this.scene.fog.density, z.fogD, k);
    this.scene.fog.color.lerp(z.fog, k);
    this.scene.environmentIntensity = lerp(this.scene.environmentIntensity ?? 1, z.env, k);
    this.zoneBloom = lerp(this.zoneBloom ?? z.bloom, z.bloom, k);
    const G = this.grade || (this.grade = { ...z });
    for (const q of ['shR', 'shG', 'shB', 'hiR', 'hiG', 'hiB', 'con', 'bp', 'sat']) G[q] = lerp(G[q], z[q], k);
    this.interior = clamp(1 - (z.hemi - 0.28) / 0.72, 0, 1);
    // contorno de personajes: tono solar en exteriores, cálido de antorcha en interiores
    const e = CHAR_EDGE.color.value;
    this._edgeT = lerp(this._edgeT ?? z.rim, z.rim, k);
    const w = clamp((this.interior - 0.3) / 0.5, 0, 1);
    e.setRGB(lerp(1.0, 1.0, w), lerp(0.86, 0.66, w), lerp(0.72, 0.42, w)).multiplyScalar(this._edgeT);
  }

  // ---------------------------------------------------------------------------------
  frame(now) {
    const realDt = Math.min(0.1, Math.max(0, (now - (this.lastNow || now)) / 1000));
    this.lastNow = now;
    this.fps = lerp(this.fps, realDt > 0 ? 1 / realDt : 60, 0.05);
    if (this.state === 'play' || this.state === 'title' || this.state === 'end') {
      let scale = 1;
      if (this.slowT > 0) { this.slowT -= realDt; scale = this.slowScale; }
      if (this.state === 'title') scale = 1;
      this.acc += realDt * scale;
      let n = 0;
      while (this.acc >= DT && n < 5) {
        if (this.state === 'play') this.step();
        else this.idleStep();
        this.acc -= DT; n++;
      }
      if (n === 5) this.acc = 0; // no recuperar segundos perdidos de golpe (§18.5)
    }
    this.render(realDt);
  }

  // En la pantalla de título el mundo sigue vivo (agua, tela, respiración) sin control.
  idleStep() {
    this.simTime += DT;
    this.input.beginTick(this.simTime);
    const v = this.input.virtual;
    this.input.virtual = {};
    this.hero.update(DT, this.input);
    this.input.virtual = v;
    this.heroAnim.update(DT, this.hero.animState());
    this.heroCape.step(DT, 1.2);
    for (const e of this.enemies) if (Math.abs(e.x - this.camera.x) < 20) e.animate(DT, 0.8);
    for (const s of this.sentinels) s.animate(DT);
    for (const m of this.level.mechanisms) m.update(DT);
    this.ambientParticles();
    for (const k in this.fx) this.fx[k].update(DT, 0.4);
    this.input.endTick();
  }

  render(dt) {
    const hero = this.hero;
    const zone = sampleCameraZone(CAMERA_ZONES, hero.x);
    const focus = { x: hero.x, y: hero.y, vx: hero.vx, facing: hero.facing, grounded: hero.grounded, hang: hero.mode === 'hang' || hero.mode === 'mantle' };
    const cam = this.camera.update(dt, focus, zone);
    this.applyZone(this.camera.x);
    updateSun(this.lights, { x: this.camera.x, y: this.camera.y - 1 });
    // relleno cálido desde el lado de cámara para leer rostro y siluetas; en los planos cortos se
    // convierte en luz principal de retrato (lateral, alta, por delante del rostro)
    const cw = this.camera.cineW;
    this.heroModel.setDetail(cw > 0.2);
    const L = this.lights.fill;
    L.position.set(hero.x + hero.facing * lerp(1.4, 0.75, cw), hero.y + lerp(2.3, 2.05, cw), lerp(2.6, 1.25, cw));
    L.intensity = this.fillBase * (1 + cw * 0.6);
    const t = this.simTime;
    this.level.update(dt, t);
    this.sky.material.uniforms.time.value = t;
    // destellos de aviso
    for (const g of this.glints) {
      if (g.t <= 0) { g.s.visible = false; continue; }
      g.t -= dt;
      const k = 1 - g.t / g.dur;
      const sz = g.size * Math.sin(Math.min(1, k * 1.4) * Math.PI) + 0.05;
      g.s.scale.set(sz, sz, 1);
      g.s.material.rotation = k * 1.2;
      g.s.material.opacity = 1 - k * 0.6;
    }
    this.projectiles.render(dt, t);
    this.updatePowerVisuals(dt, t);
    // primer plano: transparente si tapa a Aren (§8.7)
    this.fadeForeground(cam);
    // brillo de invulnerabilidad sin parpadeo
    const inv = hero.invuln > 0 && hero.mode !== 'dead' ? 0.15 + 0.1 * Math.sin(t * 20) : 0;
    const dashRim = hero.mode === 'dash' ? 1.2 * (1 - hero.modeT / hero.modeDur) : 0;
    for (const m of this.heroModel.materials) m.userData.rimColor.value.setRGB(inv + dashRim * 0.25, inv * 0.8 + dashRim * 1.1, inv * 0.6 + dashRim * 1.4);

    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.fade = damp(this.fade, this.fadeTarget, 0.12, dt);
    this.letterbox = damp(this.letterbox, this.letterboxTarget, 0.25, dt);
    this.post.render(dt, { letterbox: this.letterbox, flash: this.flash, fade: this.fade, bloom: this.zoneBloom, vignette: 0.34, grade: this.grade });

    // Interfaz
    if (this.state === 'play') {
      this.hud.updateHP(hero.hp, hero.maxHp);
      this.hud.setCharge(hero.charge, hero.phase);
      this.hud.updateMap(hero.x, hero.y, t);
      let p = null;
      if (!hero.locked) for (const m of this.level.mechanisms) { if (m.prompt) { p = m.prompt(hero); if (p) break; } }
      this.hud.prompt(p, cam, window.innerWidth, window.innerHeight);
      this.audio.update(dt, { water: this.waterNear(), fall: this.fallNear(), interior: this.interior, combat: this.combatLevel(), charge: hero.charge, phase: hero.phase });
    } else { this.hud.prompt(null); this.audio.silenceCharge(); }
    this.hud.update(dt);
    if (this.debugOn) {
      const info = this.renderer.info;
      this.hud.debug(`FPS ${this.fps.toFixed(0)}  calidad ${QUALITY[this.settings.quality].label}\nllamadas ${info.render.calls}  triángulos ${(info.render.triangles / 1000).toFixed(0)}k\nAren ${hero.x.toFixed(2)}, ${hero.y.toFixed(2)}  ${hero.mode}\nconstrucción ${this.buildMs.toFixed(0)} ms`);
    }
  }

  // Mano activa: destello del dardo, esfera del eclipse sobre la palma (con su luz violeta sobre mano
  // y rostro), hoja de éter del golpe, bordados que laten con la carga y mira láser.
  updatePowerVisuals(dt, t) {
    const hero = this.hero, anim = this.heroAnim, model = this.heroModel;
    const active = anim.activeFocus;
    this.muzzleT = Math.max(0, (this.muzzleT || 0) - dt);
    const st = hero.animState();
    const holding = st.cast && st.cast.launch == null && active && hero.mode !== 'dead';
    if (holding) this.heroOrb.follow(anim, st, dt, active);
    else this.heroOrb.hide();
    this.heroOrb.render(this.camera.cam, dt);
    for (const side in model.foci) {
      const F = model.foci[side];
      const on = F === active;
      let s = 0, a = 0;
      if (on && this.muzzleT > 0) { const k = this.muzzleT / (this.muzzleKind === 'bolt' ? 0.07 : 0.16); s = (this.muzzleKind === 'bolt' ? 0.4 : 0.85) * k; a = 1; }
      F.flare.scale.setScalar(Math.max(0.001, s));
      F.flare.material.opacity = a;
      F.flare.material.color.copy(MAGE_GLOW).multiplyScalar(0.8);
      if (this.muzzleKind === 'counter' && this.muzzleT > 0) F.flare.material.color.setRGB(2.6, 1.9, 0.7);
      // hoja de éter durante el golpe
      let bw = 0;
      if (on && hero.attack && hero.attack.id === 'strike') {
        const at = hero.attack.t;
        bw = Math.min(1, at / 0.04) * (1 - Math.max(0, (at - 0.2) / 0.12));
      }
      F.blade.visible = bw > 0.01;
      F.blade.material.opacity = Math.max(0, bw) * 0.9;
    }
    // bordados y broche: laten con la carga (más fuerte en el eclipse)
    const rm = model.materials[1];
    const pulse = hero.phase >= 3 ? 0.5 * Math.max(0, Math.sin(t * 5.7)) ** 4 : 0;
    rm.userData.glow.value = 1 + hero.charge * 1.4 + pulse + (this.muzzleT > 0 ? 0.6 : 0);
    // mira láser en apuntado libre
    const L = this.laser;
    if (hero.aimLock && this.state === 'play') {
      const m = hero.muzzle();
      const dist = this.rayDistance(m.x, m.y, hero.aim.x, hero.aim.y, 16);
      L.visible = true;
      L.position.set(m.x, m.y, 0.3);
      L.rotation.z = Math.atan2(hero.aim.y, hero.aim.x);
      L.scale.set(dist, 0.018, 1);
      L.material.opacity = 0.55 + 0.2 * Math.sin(t * 9);
    } else L.visible = false;
  }

  rayDistance(x, y, dx, dy, max) {
    const step = 0.08;
    for (let d = 0.2; d < max; d += step) {
      const px = x + dx * d, py = y + dy * d;
      if (this.physics.segmentBlocked(px - dx * step, py - dy * step, px, py)) return d;
    }
    return max;
  }

  fadeForeground(cam) {
    const hero = this.hero, cx = cam.position.x, cy = cam.position.y, D = cam.position.z;
    for (const f of this.level.foreground) {
      const k = D / (D - f.z);
      const px0 = cx + (f.x0 - cx) * k, px1 = cx + (f.x1 - cx) * k;
      const py0 = cy + (f.y0 - cy) * k, py1 = cy + (f.y1 - cy) * k;
      const hit = hero.x + 0.35 > px0 && hero.x - 0.35 < px1 && hero.y + 1.8 > py0 && hero.y < py1;
      for (const m of f.mats) m.opacity = damp(m.opacity, hit ? 0.1 : 1, 0.08, 1 / 60);
    }
  }

  waterNear() { const x = this.camera.x; return x > 44 && x < 90 ? 1 : x > 40 && x < 94 ? 0.4 : 0.05; }
  fallNear() { let v = 0; for (const m of this.mistSources) v = Math.max(v, 1 - Math.abs(m.x - this.camera.x) / 14); return clamp(v, 0, 1); }
  combatLevel() {
    let c = 0;
    for (const e of this.hostiles) if (e.alive && e.alerted && Math.abs(e.x - this.hero.x) < 12) c = 1;
    return c;
  }

  // ---------------------------------------------------------------------------------
  // Ganchos de prueba deterministas (pruebas funcionales y juez de calidad)
  testAPI() {
    const g = this;
    return {
      game: g,
      start() { g.screens.hide(); g.start(); g.camera.cine = null; g.camera.cineW = 0; g.cineTimer = 0; g.fade = 0; g.fadeTarget = 0; },
      setInput(v) { g.input.virtual = v || {}; },
      step(n = 1) { for (let i = 0; i < n; i++) { g.step(); g.hud.update(1 / 60); } },
      render(dt = 1 / 60) { g.render(dt); },
      // Métricas para el juez de calidad: luminancia de la imagen final y separación del héroe
      // y de los enemigos respecto al fondo, mediante una máscara renderizada aparte.
      measure(W = 320, H = 180) {
        const r = g.renderer, cam = g.camera.cam, scene = g.scene;
        g.render(1 / 60);
        const c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
        const ctx = c2.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(r.domElement, 0, 0, W, H);
        const img = ctx.getImageData(0, 0, W, H).data;
        const mask = (objs) => {
          const LAYER = 7;
          for (const o of objs) o.traverse((q) => q.layers.enable(LAYER));
          const rt = new THREE.WebGLRenderTarget(W, H);
          const prev = { bg: scene.background, fog: scene.fog, ov: scene.overrideMaterial, mask: cam.layers.mask, cc: r.getClearColor(new THREE.Color()), ca: r.getClearAlpha() };
          const white = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
          scene.background = new THREE.Color(0); scene.fog = null; scene.overrideMaterial = white;
          cam.layers.set(LAYER);
          r.setRenderTarget(rt); r.setClearColor(0, 1); r.clear(); r.render(scene, cam); r.setRenderTarget(null);
          const px = new Uint8Array(W * H * 4);
          r.readRenderTargetPixels(rt, 0, 0, W, H, px);
          scene.background = prev.bg; scene.fog = prev.fog; scene.overrideMaterial = prev.ov; cam.layers.mask = prev.mask; r.setClearColor(prev.cc, prev.ca);
          for (const o of objs) o.traverse((q) => q.layers.disable(LAYER));
          rt.dispose(); white.dispose();
          const m = new Uint8Array(W * H);
          for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) m[(H - 1 - y) * W + x] = px[(y * W + x) * 4] > 127 ? 1 : 0;
          return m;
        };
        const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        const Lstar = (i) => { const Y = 0.2126 * lin(img[i]) + 0.7152 * lin(img[i + 1]) + 0.0722 * lin(img[i + 2]); return Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y; };
        const L = new Float32Array(W * H);
        let clip = 0, crush = 0, sat = 0;
        for (let k = 0; k < W * H; k++) {
          const i = k * 4; L[k] = Lstar(i);
          if (img[i] >= 250 || img[i + 1] >= 250 || img[i + 2] >= 250) clip++;
          if (L[k] < 3) crush++;
          const mx = Math.max(img[i], img[i + 1], img[i + 2]), mn = Math.min(img[i], img[i + 1], img[i + 2]);
          sat += mx > 0 ? (mx - mn) / mx : 0;
        }
        const sorted = Array.from(L).sort((a, b) => a - b);
        const pct = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
        const sep = (m) => {
          // contraste local en el borde: para cada píxel del contorno interior, diferencia absoluta
          // de L* frente a la media de los píxeles de fondo de su vecindario 5×5
          let area = 0, bodyS = 0, edgeS = 0, edgeN = 0, inS = 0, outS = 0, yMin = H, yMax = -1;
          for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
            const k = y * W + x;
            if (!m[k]) continue;
            area++; bodyS += L[k];
            if (y < yMin) yMin = y;
            if (y > yMax) yMax = y;
            let o = 0, on = 0;
            for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const q = k + dy * W + dx; if (!m[q]) { o += L[q]; on++; } }
            if (on) { const om = o / on; edgeS += Math.abs(L[k] - om); inS += L[k]; outS += om; edgeN++; }
          }
          if (!area) return null;
          const n = Math.max(1, edgeN);
          return { area: area / (W * H), heightPct: +(((yMax - yMin + 1) / H) * 100).toFixed(1), edgeIn: +(inS / n).toFixed(1), edgeOut: +(outS / n).toFixed(1), edgeDelta: +(edgeS / n).toFixed(1), body: +(bodyS / area).toFixed(1) };
        };
        const heroObjs = [g.heroModel.root, ...g.heroCape.panels.map((p) => p.mesh)];
        const hero = sep(mask(heroObjs));
        const enemies = g.enemies.filter((e) => e.alive && Math.abs(e.x - g.camera.x) < 9).map((e) => sep(mask([e.model.root, ...e.cape.panels.map((p) => p.mesh)]))).filter(Boolean);
        // llamadas de dibujo de la escena (sin pases de posproceso) y del cuadro completo
        r.info.autoReset = false;
        r.info.reset();
        const rt2 = new THREE.WebGLRenderTarget(64, 36); r.setRenderTarget(rt2); r.render(scene, cam); r.setRenderTarget(null); rt2.dispose();
        const sceneCalls = r.info.render.calls, sceneTris = r.info.render.triangles;
        // solo el pase principal (sin mapa de sombras)
        r.info.reset();
        const au = r.shadowMap.autoUpdate; r.shadowMap.autoUpdate = false; r.shadowMap.needsUpdate = false;
        const rt3 = new THREE.WebGLRenderTarget(64, 36); r.setRenderTarget(rt3); r.render(scene, cam); r.setRenderTarget(null); rt3.dispose();
        r.shadowMap.autoUpdate = au;
        const mainCalls = r.info.render.calls, mainTris = r.info.render.triangles;
        r.info.reset();
        g.render(1 / 60);
        const frameCalls = r.info.render.calls;
        r.info.autoReset = true;
        return {
          luma: { mean: +(L.reduce((a, b) => a + b, 0) / L.length).toFixed(1), p5: +pct(0.05).toFixed(1), p50: +pct(0.5).toFixed(1), p95: +pct(0.95).toFixed(1), clipPct: +(100 * clip / (W * H)).toFixed(2), crushPct: +(100 * crush / (W * H)).toFixed(2), sat: +(sat / (W * H)).toFixed(3) },
          hero, enemies, sceneCalls, sceneTris, mainCalls, mainTris, frameCalls,
        };
      },
      simCost(n = 120) { const t0 = performance.now(); for (let i = 0; i < n; i++) g.step(); return (performance.now() - t0) / n; },
      settle() {
        const h = g.hero;
        const zone = sampleCameraZone(CAMERA_ZONES, h.x);
        g.camera.snap({ x: h.x + h.facing * 1.5, y: h.grounded ? h.y : g.camera.groundY, facing: h.facing }, zone);
        g.camera.lead = h.facing * 1.5;
        g.camera.x = clamp(h.x + g.camera.lead, zone.minX, zone.maxX);
        g.applyZone(g.camera.x, true);
        g.fade = g.fadeTarget; g.letterbox = g.letterboxTarget;
        g.camera.update(0, h, zone);
        for (let i = 0; i < 90; i++) g.fadeForeground(g.camera.cam);
      },
      cine(on) { if (!on) { g.camera.cine = null; g.camera.cineW = 0; } else g.camera.cineW = 1; },
      teleport(x, y, facing = 1) {
        const h = g.hero;
        h.respawn(x, y); h.invuln = 0; h.facing = facing; h.grounded = false;
        g.heroAnim.reset(); g.heroCape.reset(); g.trail.clear();
        for (let i = 0; i < 20; i++) g.step();
        g.camera.snap({ x: h.x, y: h.y, facing }, sampleCameraZone(CAMERA_ZONES, h.x));
        g.applyZone(h.x, true);
        // un salto de prueba no es una llegada: sin cartel de sala inicial en las capturas
        g.hud.areaT = 0; g.hud.areaEl.classList.remove('on');
      },
      state() {
        const h = g.hero;
        return {
          x: h.x, y: h.y, vx: h.vx, vy: h.vy, mode: h.mode, grounded: h.grounded, hp: h.hp, maxHp: h.maxHp, hasClavija: h.hasClavija,
          attack: h.attack && h.attack.id, enemies: g.enemies.map((e) => ({ x: e.x, y: e.y, hp: e.hp, state: e.state })),
          sentinels: g.sentinels.map((e) => ({ x: e.x, y: e.y, hp: e.hp, state: e.state })),
          seals: g.level.mechanisms.filter((m) => m.seal).map((m) => ({ seal: m.seal, x: m.box.x0, y: m.box.y0, broken: m.broken })),
          gate: g.level.mechanisms.find((m) => m.gate)?.state, wallBroken: g.level.mechanisms.find((m) => m.cracks)?.broken,
          stats: { ...g.stats, parries: h.stats.parries, hits: h.stats.hits, shots: h.shots }, simTime: g.simTime, state: g.state,
          charge: h.charge, aim: { ...h.aim }, bolts: g.projectiles.list.length,
          orbs: g.projectiles.list.filter((p) => p.alive && p.owner === 'enemy').map((p) => ({ x: p.x, y: p.y, vx: p.vx, vy: p.vy })),
        };
      },
      info() { const i = g.renderer.info; return { calls: i.render.calls, triangles: i.render.triangles, buildMs: g.buildMs, heroTris: g.heroModel.triangles, heroTrisHi: g.heroModel.trianglesHi, heroBreakdown: g.heroModel.breakdown, marauderTris: g.marauderTris }; },
      TUNING,
    };
  }
}
