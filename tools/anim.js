// Hoja de fotogramas del animador: simula un estado y dibuja N instantes en rejilla (vista lateral).
import * as THREE from 'three';
import { buildHero } from '../src/render/heroModel.js';
import { Animator } from '../src/animation/animator.js';
import { ATTACKS } from '../src/animation/poses.js';

const q = new URLSearchParams(location.search);
const state = q.get('s') || 'run';
const cols = +(q.get('cols') || 6), rows = +(q.get('rows') || 2);
const span = +(q.get('span') || 0.7);   // segundos muestreados
const facing = +(q.get('f') || 1);
const W = innerWidth, H = innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(W, H);
renderer.setScissorTest(true);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight('#bcd2e8', '#4a3e34', 1.3));
const key = new THREE.DirectionalLight('#fff2e0', 3.0); key.position.set(3, 4, 5); scene.add(key);
const rim = new THREE.DirectionalLight('#ffc89a', 1.5); rim.position.set(-3, 2, -3); scene.add(rim);
const grid = new THREE.GridHelper(200, 400, '#6b7075', '#3d4247'); scene.add(grid);
const hero = buildHero();
scene.add(hero.root);
const anim = new Animator(hero);
const dt = 1 / 60;
const st = { x: 0, y: 0, vx: 0, vy: 0, facing, mode: 'ground', modeT: 0, modeDur: 1, groundY: 0, attack: null };
const speeds = { idle: 0, walk: 1.6, run: 5.6, sprint: 7.6 };
let simT = 0;
const frames = cols * rows;
const sampleTimes = [];
const warm = 1.0;
for (let i = 0; i < frames; i++) sampleTimes.push(warm + (span * i) / frames);
const cam = new THREE.PerspectiveCamera(24, (W / cols) / (H / rows), 0.1, 50);
function stepSim() {
  if (state in speeds) { st.vx = speeds[state] * facing; st.x += st.vx * dt; }
  else if (ATTACKS[state]) {
    const a = ATTACKS[state];
    const t0 = warm - 0.02;
    const air = state === 'airCut';
    st.mode = air ? 'air' : 'ground';
    if (air) { st.y = 1.0; }
    if (state === 'runCut') { st.vx = 5.6 * facing; st.x += st.vx * dt; }
    st.attack = simT >= t0 && simT < t0 + a.duration ? { id: state, t: simT - t0 } : null;
  } else if (state === 'jump') {
    if (simT < warm) { st.vx = 5.6 * facing; st.x += st.vx * dt; }
    else {
      if (st.mode !== 'air') { st.mode = 'air'; st.vy = 9.6; }
      st.vy -= 24 * dt; st.y += st.vy * dt; st.x += st.vx * dt;
      if (st.y < 0) { st.y = 0; st.landImpact = -st.vy; st.vy = 0; st.mode = 'ground'; } else st.landImpact = 0;
    }
  } else if (['slide', 'roll', 'backstep', 'hang', 'hit', 'dead', 'airdash'].includes(state)) {
    if (simT >= warm - 0.05) { if (st.mode !== state) { st.mode = state; st.modeT = 0; } st.modeT += dt; st.modeDur = { roll: 0.32, backstep: 0.26, hit: 0.4, dead: 1, slide: 0.5, hang: 1, airdash: 0.2 }[state]; }
    if (state === 'hang') { st.y = 0.3; st.ledge = { x: st.x + facing * 0.3, y: 2.05 }; }
    if (state === 'slide' || state === 'roll') { st.vx = 6 * facing; st.x += st.vx * dt; }
  }
  anim.update(dt, st);
  simT += dt;
}
let fi = 0;
const cw = W / cols, chh = H / rows;
while (fi < frames) {
  stepSim();
  if (simT >= sampleTimes[fi] - 1e-6) {
    const c = fi % cols, r = Math.floor(fi / cols);
    renderer.setViewport(c * cw, (rows - 1 - r) * chh, cw, chh);
    renderer.setScissor(c * cw, (rows - 1 - r) * chh, cw, chh);
    const side = q.get('view') || 'side';
    const cx = st.x;
    if (side === 'side') { cam.position.set(cx, 1.0 + st.y * 0.5, 6.5); cam.lookAt(cx, 0.95 + st.y * 0.5, 0); }
    else { cam.position.set(cx + 4.2 * facing, 1.2, 4.2); cam.lookAt(cx, 0.95, 0); }
    renderer.render(scene, cam);
    fi++;
  }
}
window.__info = { ok: true };
document.title = 'ready';
