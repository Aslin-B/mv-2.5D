import * as THREE from 'three';
import { renderer, scene, camera, post } from './stage.js';
import { buildMageHead } from '../render/shadowMageModel.js';

// Estudio de la cabeza (head.html): solo el rostro y el cabello, para iterar en segundos.
const t1 = performance.now();
const H = buildMageHead();
const ms = performance.now() - t1;
scene.add(H.group);
const hp = new THREE.Vector3(...H.headPos);
window.__studio = {
  view(spec) {
    // «-» al final: sin las tarjetas de pelo (para juzgar la escultura del rostro)
    const name = spec.replace(/-$/, '');
    H.group.traverse((o) => { if (o.userData.hair) o.visible = !spec.endsWith('-'); });
    const v = { faceF: { yaw: 0 }, faceP: { yaw: -1.57 }, faceH: { yaw: -0.5 }, faceB: { yaw: Math.PI - 0.6 }, faceL: { yaw: 0.45, pitch: 0.12 }, faceT: { yaw: -0.5, pitch: 1.2 }, face34: { yaw: -0.55 } }[name] || { yaw: 0 };
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false); post.setSize(w, h);
    H.group.rotation.set(v.pitch || 0, v.yaw, 0);
    H.group.updateMatrixWorld(true);
    camera.aspect = w / h; camera.fov = 24;
    const tg = hp.clone().add(new THREE.Vector3(0, (1.705 - hp.y) * 0.93, 0));
    camera.position.set(tg.x, tg.y, tg.z + 0.72);
    camera.lookAt(tg); camera.updateProjectionMatrix();
    post.render(1 / 60, { vignette: 0.2, bloom: 0.5 });
    return { name };
  },
  info: () => ({ buildMs: ms, triangles: H.tris }),
};
window.__ready = true;

