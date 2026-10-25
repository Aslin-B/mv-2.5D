import * as THREE from 'three';
import { buildShadowMage, MAGE_GLOW } from '../render/shadowMageModel.js';
import { Animator } from '../animation/animator.js';
import { MAGE_CARRY } from '../animation/poses.js';
import { Cape } from '../render/cloth.js';
import { softDot } from '../render/textures.js';
import { EclipseOrb, ORB_PHASES } from '../render/eclipseOrb.js';
import { renderer, scene, camera, post, portrait } from './stage.js';

// Estudio del personaje: el mismo modelo, animador, tela, poder y posproceso que el juego, en un
// plató neutro con encuadres fijos (cuerpo de 3/4, rostro, espalda y las cuatro fases del poder).
// Sirve al juez para comparar con la lámina de referencia en la misma composición.


const t0 = performance.now();
const model = buildShadowMage();
const buildMs = performance.now() - t0;
scene.add(model.root);
const anim = new Animator(model, { carry: MAGE_CARRY });
const coatFront = new Cape(model, scene, model.coatCloth.front);
const coatBack = new Cape(model, scene, model.coatCloth.back);
const dot = softDot(64);
const orb = new EclipseOrb(scene, { dot, light: true });

const state = () => ({
  mode: 'ground', x: 0, y: 0, vx: 0, vy: 0, facing: 1, grounded: true, groundY: 0, modeT: 0, modeDur: 1,
  attack: null, skid: false, landImpact: 0, ledge: null, interact: null, look: null,
  aim: { x: 1, y: 0 }, aimW: 0, recoil: 0, charge: 0, chargeT: 0, phase: 0, cast: null,
});

// Encuadres. yaw: orientación del personaje (0 = de frente a cámara). target: punto de mira (cuerpo,
// cabeza o palma activa) más un desplazamiento; la cámara mira siempre a lo largo de -Z, como en juego.
const VIEWS = {
  coat: { yaw: -0.9, target: 'body', off: [0, -0.4, 0], dist: 2.6, fov: 30 },
  coatS: { yaw: -1.57, target: 'body', off: [0, -0.4, 0], dist: 2.6, fov: 30 },
  bind: { yaw: -0.55, target: 'body', dist: 4.6, fov: 30, bind: true },
  idle: { yaw: -0.55, target: 'body', dist: 4.6, fov: 30 },
  front: { yaw: -0.45, target: 'body', off: [-0.12, 0.0, 0], dist: 3.9, fov: 29, chargeT: 2.2, cast: 'R', hold: 'offer', look: [-0.3, 1.7, 4] },
  // rostro: como el recuadro de la lámina (ojos a algo más de un cuarto de la altura, cabeza girada
  // hacia la derecha de la imagen, mirada a cámara, hombro y broche abajo)
  face: { yaw: 0.62, target: 'eyes', off: [-0.035, -0.1, 0], dist: 1.75, fov: 15, eyeYaw: -0.5, headTurn: -0.3, portrait: true },
  faceF: { yaw: 0, target: 'head', off: [0, 0.035, 0], dist: 0.62, fov: 24, look: [0, 1.7, 4], noHair: true },
  faceP: { yaw: -1.5, target: 'head', off: [0, 0.035, 0], dist: 0.62, fov: 24, noHair: true },
  faceH: { yaw: -0.5, target: 'head', off: [0, 0.035, 0], dist: 0.62, fov: 24, look: [0, 1.7, 4] },
  back: { yaw: Math.PI - 0.55, target: 'body', dist: 4.7, fov: 29, headTurn: 0.6 },
  hands: { yaw: 0.25, cast: 'R', target: 'palm', off: [0, 0.06, 0], dist: 0.8, fov: 26, chargeT: 1.6, hold: 'present' },
  hand0: { yaw: -0.4, cast: 'R', target: 'palmOff', off: [0, 0.0, 0], dist: 0.6, fov: 26 },
  handB: { yaw: 0.9, cast: 'R', target: 'palmOff', off: [0, 0.0, 0], dist: 0.45, fov: 26 },
  seed: { yaw: 1.3, target: 'body', off: [0.2, -0.05, 0], dist: 4.3, fov: 30, chargeT: 0.45 },
  condense: { yaw: 1.3, target: 'body', off: [0.2, -0.05, 0], dist: 4.3, fov: 30, chargeT: 1.8 },
  eclipse: { yaw: 1.3, target: 'body', off: [0.2, -0.05, 0], dist: 4.3, fov: 30, chargeT: 3.3 },
  launch: { yaw: 1.3, target: 'body', off: [0.4, -0.05, 0], dist: 4.3, fov: 30, chargeT: 3.3, launch: 0.16 },
};

function pose(v, steps = 150) {
  model.setDetail(!!v.detail || true);
  model.root.traverse((o) => { if (o.userData.hair) o.visible = !v.noHair && (o.userData.lod === 'hi'); });
  anim.opts.yawSide = Math.abs(v.yaw);
  anim.yaw = v.yaw;
  anim.reset();
  coatFront.reset(); coatBack.reset();
  const dt = 1 / 60;
  const s = state();
  s.facing = v.yaw >= 0 ? 1 : -1;
  // la carga avanza durante los últimos pasos: la tela y el cuerpo llegan asentados a la fase
  // (y, salvo en el lanzamiento, unos pasos más con la carga sostenida: los pies terminan de asentarse)
  const total = steps + Math.round((v.chargeT || 0) * 60) + (v.chargeT && !v.launch ? 30 : 0);
  for (let i = 0; i < total; i++) {
    const ct = (i - steps) * dt;
    if (v.chargeT && ct >= 0) {
      s.chargeT = Math.min(ct, v.chargeT);
      s.phase = ORB_PHASES.phaseAt(s.chargeT);
      s.charge = Math.min(1, s.chargeT / ORB_PHASES.eclipse);
      s.aimW = 1;
      s.cast = { hold: v.hold || 'side', t: s.chargeT };
    }
    if (v.launch && ct >= v.chargeT - v.launch) {
      s.cast = { hold: v.hold || 'side', t: s.chargeT, launch: ct - (v.chargeT - v.launch) };
    }
    if (v.cast) anim.forceCast = v.cast;
    if (!v.bind) anim.update(dt, s);
    else { model.root.rotation.set(0, v.yaw, 0); model.root.updateMatrixWorld(true); }
    if (v.look) s.look = new THREE.Vector3(...v.look);
    if (v.headTurn) { model.bones.neck.rotation.y += v.headTurn * 0.4; model.bones.head.rotation.y += v.headTurn * 0.6; model.root.updateMatrixWorld(true); }
    const wind = 0.4 - s.facing * ORB_PHASES.auraAt(s.cast);
    coatFront.step(dt, wind); coatBack.step(dt, wind);
    const F = anim.activeFocus;
    if (F && s.cast) orb.follow(anim, s, dt, F);
    else orb.hide();
  }
}

function view(name) {
  const v = VIEWS[name];
  portrait(!!v.portrait);
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  post.setSize(w, h);
  camera.aspect = w / h;
  camera.fov = v.fov;
  pose(v);
  const tg = new THREE.Vector3();
  if (v.target === 'head') model.bones.head.getWorldPosition(tg);
  else if (v.target === 'eyes') { const a = new THREE.Vector3(), b = new THREE.Vector3(); model.eyes[0].group.getWorldPosition(a); model.eyes[1].group.getWorldPosition(b); tg.copy(a).add(b).multiplyScalar(0.5); }
  else if (v.target === 'palm') (anim.activeFocus || model.foci.R).group.getWorldPosition(tg);
  else if (v.target === 'palmOff') model.foci[anim.castSide === 'R' ? 'L' : 'R'].group.getWorldPosition(tg);
  else tg.set(model.root.position.x, 0.95, 0);
  if (v.off) tg.add(new THREE.Vector3(...v.off));
  camera.position.set(tg.x, tg.y + (v.camY || 0), tg.z + v.dist);
  camera.lookAt(tg);
  camera.updateProjectionMatrix();
  // mirada hacia la cámara (los ojos giran dentro de las cuencas)
  for (const e of model.eyes) e.group.rotation.y = -0.05 * Math.sign(e.group.position.x) + (v.eyeYaw || 0);
  model.root.updateMatrixWorld(true);
  orb.render(camera, 1 / 60);
  post.render(1 / 60, { vignette: 0.25, bloom: 0.5 });
  return { name, w, h };
}

window.__studio = {
  view, VIEWS: Object.keys(VIEWS), model, anim, orb, MAGE_GLOW, coatFront, coatBack,
  info: () => ({ buildMs, triangles: model.triangles, trianglesHi: model.trianglesHi, breakdown: model.breakdown }),
};
window.__ready = true;
