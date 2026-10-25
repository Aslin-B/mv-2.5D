import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PostFX } from '../render/post.js';
import { stoneFlags } from '../render/textures.js';
import { CHAR_EDGE } from '../render/charMaterial.js';

// Plató compartido por el estudio del personaje y el de la cabeza: fondo de bruma, luz principal
// cálida con sombras, contra violácea, losas y el mismo posproceso que el juego en calidad alta.
const canvas = document.getElementById('view');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

export const scene = new THREE.Scene();
{
  // fondo: bruma gris violácea, más clara a media altura (como el cielo nublado de la lámina)
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#1d1b22'); gr.addColorStop(0.45, '#4a4650'); gr.addColorStop(0.7, '#5a5560'); gr.addColorStop(1, '#2a272c');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  scene.background = t;
}
scene.fog = new THREE.FogExp2('#47434c', 0.035);
const pm = new THREE.PMREMGenerator(renderer);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.3;

// luz como la de la lámina: principal cálida desde arriba a la izquierda, relleno bajo y contraluz frío
const hemi = new THREE.HemisphereLight('#9a96a8', '#2b2624', 0.55);
scene.add(hemi);
const key = new THREE.DirectionalLight('#ffe2c8', 3.2);
key.position.set(-2.2, 4.2, 3.2);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2.5, bottom: -0.5, near: 0.5, far: 12 });
key.shadow.bias = -0.0002; key.shadow.normalBias = 0.01;
scene.add(key);
const rim = new THREE.DirectionalLight('#c3ccff', 2.2);
rim.position.set(2.6, 3.0, -3.0);
scene.add(rim);
CHAR_EDGE.color.value.setRGB(0.25, 0.24, 0.32);

// Luz de retrato para los primeros planos (como el recuadro del rostro de la lámina): relleno bajo,
// principal más intensa y lateral, contraluz frío marcado. Las sombras del rostro quedan profundas.
export function portrait(on) {
  hemi.intensity = on ? 0.2 : 0.55;
  scene.environmentIntensity = on ? 0.14 : 0.3;
  key.intensity = on ? 4.4 : 3.2;
  key.position.set(on ? -2.8 : -2.2, on ? 3.2 : 4.2, on ? 2.4 : 3.2);
  rim.intensity = on ? 3.2 : 2.2;
}

// suelo de losas
{
  const set = stoneFlags(512, 7);
  for (const k of ['map', 'normalMap', 'roughnessMap']) { set[k].wrapS = set[k].wrapT = THREE.RepeatWrapping; set[k].repeat.set(4, 4); }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardMaterial({ map: set.map, normalMap: set.normalMap, roughnessMap: set.roughnessMap, color: '#8c8590' }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
}

export const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.05, 60);
export const post = new PostFX(renderer, scene, camera, 'alto');
post.setSize(window.innerWidth, window.innerHeight);