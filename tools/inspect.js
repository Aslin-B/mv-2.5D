// Escena de inspección (biblia §24.1): luz neutra, sin niebla ni efectos, varias vistas.
import * as THREE from 'three';
import { buildHero } from '../src/render/heroModel.js';

const params = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#2a2e33');
const hemi = new THREE.HemisphereLight('#bcd2e8', '#4a3e34', 1.2);
scene.add(hemi);
const key = new THREE.DirectionalLight('#fff2e0', 3.0);
key.position.set(2, 3, 3);
key.castShadow = true;
scene.add(key);
const rim = new THREE.DirectionalLight('#ffc89a', 2.0);
rim.position.set(-2, 2, -3);
scene.add(rim);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ color: '#555b60', roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const t0 = performance.now();
const hero = buildHero();
const buildMs = performance.now() - t0;
scene.add(hero.root);
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
envScene.add(new THREE.HemisphereLight('#9fb6cc', '#5a4a3a', 3));
const envBox = new THREE.Mesh(new THREE.SphereGeometry(5, 16, 8), new THREE.MeshBasicMaterial({ color: '#8899aa', side: THREE.BackSide }));
envScene.add(envBox);
scene.environment = pmrem.fromScene(envScene).texture;
const view = params.get('view') || 'front';
const cam = new THREE.PerspectiveCamera(view === 'face' || view === 'faceside' ? 14 : 28, innerWidth / innerHeight, 0.05, 50);
const views = {
  front: [[0, 1.0, 4.2], [0, 0.95, 0]], side: [[4.2, 1.0, 0], [0, 0.95, 0]], back: [[0, 1.0, -4.2], [0, 0.95, 0]],
  three: [[3.0, 1.3, 3.0], [0, 0.95, 0]], face: [[0.25, 1.72, 1.2], [0, 1.69, 0]], faceside: [[1.2, 1.72, 0.25], [0, 1.69, 0]],
};
const [p, t] = views[view];
cam.position.set(...p); cam.lookAt(...t);
renderer.render(scene, cam);
window.__info = { buildMs: Math.round(buildMs), triangles: Math.round(hero.triangles), breakdown: hero.breakdown };
document.title = 'ready';
