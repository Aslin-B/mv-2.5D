import * as THREE from 'three';
import { buildHero } from '../src/render/heroModel.js';
import { Animator } from '../src/animation/animator.js';
const hero = buildHero();
const scene = new THREE.Scene(); scene.add(hero.root);
const anim = new Animator(hero);
const st = { x: 0, y: 0, vx: 0, vy: 0, facing: 1, mode: 'ground', modeT: 0, modeDur: 1, groundY: 0, attack: null };
const out = [];
for (let i = 0; i < 90; i++) {
  if (i >= 60) st.attack = { id: 'cut1', t: (i - 60) / 60 };
  anim.update(1 / 60, st);
  if (i >= 60 && i % 3 === 0) {
    const d = anim.bladeTip.clone().sub(anim.bladeBase).normalize();
    out.push({ t: ((i - 60) / 60).toFixed(3), dir: d.toArray().map((v) => v.toFixed(2)).join(','), edge: anim.edge.toArray().map((v) => v.toFixed(2)).join(',') });
  }
}
// dirección solicitada en el mundo para comparar
const req = new THREE.Vector3(0.08, -0.12, 0.99).normalize().applyQuaternion(hero.root.quaternion);
window.__info = { out, req: req.toArray().map((v) => v.toFixed(2)).join(','), axisL: anim.swordAxisL.toArray(), edgeL: anim.swordEdgeL.toArray() };
document.title = 'ready';
