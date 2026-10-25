import * as THREE from 'three';
import { SdfScene, roundCone, ellipsoid, surfaceNets } from './sdf.js';
import {
  defaultProportions, standardBody, assembleCharacter, buildHand, meshToGeometry, bindPositions,
  lin, mixc, mulc, noise3, paintUniform, shellGeometry, makeCharMaterial, PATTERN, mergeRigidPieces,
} from './humanoid.js';
import { smoothstep } from '../core/math.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { cloneCharMaterial } from './charMaterial.js';

// Saqueador del puente (biblia §15.1): delgado, encorvado, equipo desigual y lanza corta.
// Diseño propio: capucha de lona remendada, máscara de tela, hombrera de hierro oxidado en un solo
// brazo, vendas en el otro y una lanza hecha con el gancho de una compuerta del canal.
// Comparte esqueleto y animador con Aren, pero no su silueta ni su paleta.

const C = {
  skin: lin('#8f6a55'), skinDark: lin('#6e4f3f'),
  // Identidad de amenaza: capucha y capa de rojo sangre de buey sobre cueros casi negros, para que
  // la silueta se separe de la piedra ocre y del azul pizarra de Aren.
  hood: lin('#6b211b'), hoodDark: lin('#3f1310'), patch: lin('#4a3a30'),
  vest: lin('#211e1b'), vestLight: lin('#2f2a25'),
  wrap: lin('#6e5f4c'), wrapDark: lin('#4d4337'),
  trousers: lin('#2a2420'), boot: lin('#1f1915'),
  mask: lin('#2b2622'), rope: lin('#8a7552'),
};

export function buildMarauder() {
  const P = defaultProportions({ bulk: 0.86, waist: 0.86, chestW: 0.88, legBulk: 0.8, armBulk: 0.8, hunch: 0.7 });
  const mat = makeCharMaterial({ bumpScale: 1.1 });
  const rigidMat = makeCharMaterial({ bumpScale: 1.1 });
  const B = bindPositions(P);

  // ---------- Cuerpo ----------
  const body = new SdfScene({ k: 0.016 });
  standardBody(body, P, B, { pelvis: 'pelvis', torso: 'vest', neck: 'neck', arm: 'armBare', forearm: 'wrap', thigh: 'trousers', shin: 'wrapLeg', boot: 'boot' });
  // jubón acolchado más holgado en el vientre y faldón corto
  body.add(ellipsoid([0, 1.0, 0.01], [0.15, 0.1, 0.115], { bone: 'hips', mat: 'vest' }));
  body.relax = 1;
  const bodyPaint = (x, y, z, prim) => {
    const n = noise3(x, y, z, 38);
    const m = prim.mat;
    if (m === 'neck') return { c: mulc(C.mask, 0.9 + n * 0.2), r: 0.9, m: 0, p: PATTERN.cloth };
    if (m === 'vest' || m === 'pelvis') {
      const stitch = Math.abs(Math.sin(y * 70)) < 0.12 ? 0.82 : 1;
      const c = mixc(C.vest, C.vestLight, smoothstep(0.4, 0.8, noise3(x, y, z, 7)) * 0.6);
      // cuerda en la cintura
      if (y > 0.97 && y < 1.01) return { c: mulc(C.rope, 0.85 + n * 0.3), r: 0.85, m: 0, p: PATTERN.cloth };
      return { c: mulc(c, stitch * (0.9 + n * 0.2)), r: 0.9, m: 0, p: PATTERN.quilt };
    }
    if (m === 'armBare') {
      // manga corta remendada y luego vendas
      const d = y;
      if (d > 1.27) return { c: mulc(C.vest, 0.95 + n * 0.1), r: 0.9, m: 0, p: PATTERN.quilt };
      return { c: mixc(C.skin, C.skinDark, n * 0.5), r: 0.55, m: 0, p: PATTERN.skin };
    }
    if (m === 'wrap' || m === 'wrapLeg') {
      const band = Math.sin((y + x * 0.4) * 160) > 0.55 ? 0.78 : 1;
      return { c: mulc(mixc(C.wrap, C.wrapDark, n * 0.6), band), r: 0.92, m: 0, p: PATTERN.cloth };
    }
    if (m === 'boot') return { c: mulc(C.boot, 0.85 + n * 0.25), r: 0.7, m: 0, p: PATTERN.leather, w: 0.8 };
    return { c: mulc(C.trousers, 0.88 + n * 0.22), r: 0.93, m: 0, p: PATTERN.cloth };
  };
  const ch = assembleCharacter({ P, bodyScene: body, bodyPaint, material: mat, bodyCell: 0.0165 });
  const { bones, S } = ch;
  const pos = S.pos;
  let tris = ch.triangles;

  // ---------- Cabeza y máscara ----------
  const head = new SdfScene({ k: 0.007, subK: 0.004 });
  head.add(ellipsoid([0, 1.735, -0.02], [0.074, 0.095, 0.094], { mat: 'skin' }));
  head.add(ellipsoid([0, 1.645, 0.03], [0.058, 0.06, 0.06], { mat: 'mask' }));
  head.add(ellipsoid([0, 1.6, 0.0], [0.07, 0.05, 0.075], { mat: 'mask' }));
  head.add(roundCone([0, 1.7, 0.08], [0, 1.67, 0.1], 0.008, 0.011, { mat: 'mask' }));
  for (const s of [1, -1]) head.carve(ellipsoid([0.03 * s, 1.705, 0.08], [0.019, 0.012, 0.016]));
  head.add(roundCone([-0.05, 1.725, 0.07], [0.05, 1.725, 0.07], 0.012, 0.012, { mat: 'skin' }));
  head.relax = 1;
  const headPaint = (x, y, z, prim) => {
    const n = noise3(x, y, z, 110);
    if (prim.mat === 'mask' || y < 1.69) return { c: mulc(C.mask, 0.85 + n * 0.3), r: 0.92, m: 0, p: PATTERN.cloth };
    return { c: mixc(C.skin, C.skinDark, 0.3 + n * 0.3), r: 0.5, m: 0, p: PATTERN.skin };
  };
  const headMesh = surfaceNets(head, 0.0085);
  const headObj = new THREE.Mesh(meshToGeometry(headMesh, head, headPaint, { origin: pos.head }), rigidMat);
  headObj.castShadow = true;
  bones.head.add(headObj);
  tris += headMesh.indices.length / 3;

  // Ojos: brillo húmedo que se lee dentro de la sombra de la capucha (sin magia: reflejo).
  const eyeMat = new THREE.MeshStandardMaterial({ color: '#d8cbb4', roughness: 0.08, emissive: '#3a2a18', emissiveIntensity: 0.6 });
  const eyes = [];
  for (const s of [1, -1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.0105, 10, 8), eyeMat);
    e.position.set(0.03 * s - pos.head[0], 1.703 - pos.head[1], 0.07 - pos.head[2]);
    bones.head.add(e);
    eyes.push(e);
  }

  // ---------- Capucha de lona con borde deshilachado ----------
  const hood = new SdfScene({ k: 0.012, subK: 0.006 });
  hood.add(ellipsoid([0, 1.745, -0.025], [0.108, 0.125, 0.122], { mat: 'hood' }));
  hood.add(ellipsoid([0, 1.83, -0.08], [0.06, 0.06, 0.07], { mat: 'hood' })); // punta caída de la capucha
  hood.add(roundCone([0, 1.6, -0.06], [0, 1.5, -0.04], 0.12, 0.17, { mat: 'hood' })); // cuello de la esclavina
  hood.carve(ellipsoid([0, 1.73, -0.01], [0.088, 0.108, 0.104]));
  hood.carve(ellipsoid([0, 1.68, 0.11], [0.075, 0.1, 0.09]));
  hood.carve(roundCone([0, 1.62, -0.05], [0, 1.45, -0.03], 0.1, 0.15));
  hood.displace = (x, y, z) => (noise3(x, y, z, 45) - 0.5) * 0.012 + 0.003 * Math.sin(Math.atan2(x, z) * 9 + y * 30);
  hood.relax = 1;
  const hoodPaint = (x, y, z) => {
    const n = noise3(x, y, z, 30), pn = noise3(x + 3, y, z, 9);
    let c = mixc(C.hood, C.hoodDark, n * 0.6);
    if (pn > 0.68) c = mixc(c, C.patch, 0.85); // remiendo
    return { c, r: 0.95, m: 0, p: PATTERN.cloth, w: 0.8 };
  };
  const hoodMesh = surfaceNets(hood, 0.0115);
  const hoodObj = new THREE.Mesh(meshToGeometry(hoodMesh, hood, hoodPaint, { origin: pos.head }), makeCharMaterial({ bumpScale: 1.2, side: THREE.DoubleSide }));
  hoodObj.castShadow = true; hoodObj.receiveShadow = true;
  bones.head.add(hoodObj);
  tris += hoodMesh.indices.length / 3;

  // ---------- Manos (ambas cierran sobre el asta) ----------
  const handPaint = (x, y, z) => {
    const n = noise3(x, y, z, 90);
    return { c: mixc(C.wrap, C.skinDark, n * 0.5), r: 0.85, m: 0, p: PATTERN.cloth };
  };
  const hands = {};
  for (const [side, L] of [[1, 'L'], [-1, 'R']]) {
    const h = buildHand(side, S, { grip: true, curl: 1, mat: 'hand', cell: 0.0085 });
    const m = new THREE.Mesh(meshToGeometry(h.mesh, h.scene, handPaint, { origin: pos['hand' + L] }), rigidMat);
    m.castShadow = true;
    bones['hand' + L].add(m);
    hands[L] = h;
    tris += h.mesh.indices.length / 3;
  }

  // ---------- Equipo desigual ----------
  const add = (bone, geo, material = rigidMat) => {
    const m = new THREE.Mesh(geo, material);
    m.castShadow = true; m.receiveShadow = true;
    bone.add(m);
    tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
    return m;
  };
  // Hombrera de hierro oxidado (solo el brazo izquierdo)
  {
    const g = shellGeometry({ rx: 0.1, ry: 0.075, rz: 0.105, th1: 1.35, thick: 0.006, seg: 20 });
    paintUniform(g, '#5d544b', 0.62, 0.85, PATTERN.metal, 0.95);
    g.rotateZ(-0.5);
    g.translate(0.02, 0.03, 0);
    add(bones.armL, g, makeCharMaterial({ side: THREE.DoubleSide }));
  }
  // Cuerda cruzada con bolsas
  {
    const g = new THREE.TorusGeometry(0.17, 0.008, 6, 40);
    g.scale(1, 1.4, 0.75);
    g.rotateZ(0.7);
    paintUniform(g, '#8a7552', 0.9, 0, PATTERN.cloth);
    g.translate(0, 1.25 - pos.chest[1], 0.005 - pos.chest[2]);
    add(bones.chest, g);
    for (const [x, z, r] of [[0.13, 0.06, 0.4], [-0.12, -0.07, -0.5]]) {
      const p = paintUniform(new THREE.BoxGeometry(0.07, 0.08, 0.04), '#4b3a2a', 0.7, 0, PATTERN.leather);
      p.rotateY(r);
      p.translate(x, 0.95 - pos.hips[1], z);
      add(bones.hips, p);
    }
  }
  // Rodillera improvisada (tabla atada) en la pierna derecha
  {
    const g = paintUniform(new THREE.BoxGeometry(0.075, 0.1, 0.018), '#5b4632', 0.8, 0, PATTERN.wood);
    g.translate(0, -0.02, 0.06);
    add(bones.shinR, g);
  }

  // ---------- Lanza corta ----------
  const spear = buildSpear();
  const hR = hands.R;
  spear.group.position.set(hR.grip[0] - pos.handR[0], hR.grip[1] - pos.handR[1], hR.grip[2] - pos.handR[2]);
  spear.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...hR.axis));
  spear.group.rotateY(Math.PI / 2);
  bones.handR.add(spear.group);
  tris += spear.tris;

  // Anclajes de la esclavina (capa corta) en la espalda.
  const capeAnchors = {
    L: [[0.17, 1.47, -0.06], [0.12, 1.49, -0.1], [0.06, 1.49, -0.12], [0.0, 1.48, -0.125]],
    R: [[0.0, 1.48, -0.125], [-0.06, 1.49, -0.12], [-0.12, 1.49, -0.1], [-0.17, 1.47, -0.06]],
  };
  for (const k of ['L', 'R']) capeAnchors[k] = capeAnchors[k].map((p) => new THREE.Vector3(p[0] - pos.chest[0], p[1] - pos.chest[1], p[2] - pos.chest[2]));

  mergeRigidPieces(ch.root);
  return { root: ch.root, skinned: ch.skinned, bones, S, P, eyes: null, eyeMeshes: eyes, tail: null, sword: spear, capeAnchors, materials: collectMaterials(ch.root), triangles: tris };
}

// Lanza: asta de fresno, moharra de hoja con gancho lateral (pieza reutilizada de una compuerta),
// atadura de cuero y un trapo rojizo. Eje +Y hacia la punta; origen en la mano trasera.
export function buildSpear() {
  const group = new THREE.Group();
  group.name = 'spear';
  const mat = makeCharMaterial({ bumpScale: 0.8, envIntensity: 1.2 });
  const shaftLen = 1.62, back = 0.42;
  const shaft = paintUniform(new THREE.CylinderGeometry(0.0145, 0.0165, shaftLen, 10), '#6b5236', 0.78, 0, PATTERN.wood);
  shaft.translate(0, shaftLen / 2 - back, 0);
  const sm = new THREE.Mesh(shaft, mat); sm.castShadow = true; group.add(sm);
  const top = shaftLen - back;
  // Moharra: hoja de sección romboidal
  const pos = [], idx = [];
  const segs = 10, L = 0.3;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const w = 0.04 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.9) * (1 - t * 0.35) + 0.002;
    const th = 0.006 * (1 - t);
    const y = top + 0.05 + t * L;
    pos.push(w, y, 0, 0, y, th, -w, y, 0, 0, y, -th);
  }
  for (let i = 0; i < segs; i++) for (let k = 0; k < 4; k++) {
    const a = i * 4 + k, b = i * 4 + ((k + 1) % 4);
    idx.push(a, a + 4, b, b, a + 4, b + 4);
  }
  const tipI = pos.length / 3;
  pos.push(0, top + 0.05 + L + 0.03, 0);
  for (let k = 0; k < 4; k++) idx.push(segs * 4 + k, tipI, segs * 4 + ((k + 1) % 4));
  const blade = new THREE.BufferGeometry();
  blade.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  blade.setIndex(idx);
  blade.computeVertexNormals();
  paintUniform(blade, '#7d7a74', 0.42, 1, PATTERN.metal, 0.9);
  const bm = new THREE.Mesh(blade, mat); bm.castShadow = true; group.add(bm);
  // Cubo de hierro y gancho lateral
  const socket = paintUniform(new THREE.CylinderGeometry(0.017, 0.021, 0.09, 10), '#4f4b46', 0.5, 1, PATTERN.metal, 0.9);
  socket.translate(0, top + 0.01, 0);
  group.add(new THREE.Mesh(socket, mat));
  const hookPts = [];
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI * 0.9;
    hookPts.push(new THREE.Vector3(0.02 + Math.sin(a) * 0.05, top + 0.02 + (1 - Math.cos(a)) * 0.035, 0));
  }
  const hook = paintUniform(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hookPts), 12, 0.0065, 6, false), '#57524b', 0.5, 1, PATTERN.metal, 0.9);
  const hm = new THREE.Mesh(hook, mat); hm.castShadow = true; group.add(hm);
  // Atadura de cuero y trapo
  const bind = paintUniform(new THREE.CylinderGeometry(0.019, 0.019, 0.07, 10), '#3d2c1f', 0.7, 0, PATTERN.leather);
  bind.translate(0, top - 0.06, 0);
  group.add(new THREE.Mesh(bind, mat));
  const rag = paintUniform(new THREE.PlaneGeometry(0.06, 0.16, 1, 3), '#7d3b2a', 0.95, 0, PATTERN.cloth);
  rag.translate(0.03, top - 0.15, 0);
  const rm = new THREE.Mesh(rag, makeCharMaterial({ side: THREE.DoubleSide }));
  rm.rotation.y = 0.4;
  group.add(rm);
  // Regatón
  const butt = paintUniform(new THREE.ConeGeometry(0.017, 0.05, 8), '#4f4b46', 0.5, 1, PATTERN.metal);
  butt.rotateX(Math.PI);
  butt.translate(0, -back - 0.02, 0);
  group.add(new THREE.Mesh(butt, mat));
  return {
    group, material: mat, rag: rm,
    base: new THREE.Vector3(0, top - 0.25, 0), tip: new THREE.Vector3(0, top + 0.05 + L + 0.03, 0),
    tris: idx.length / 3 + 420,
  };
}

// Instancia adicional que comparte geometría (el mallado SDF se hace una sola vez) con
// materiales propios para que el destello de impacto sea individual.
export function cloneMarauder(tpl) {
  const root = cloneSkinned(tpl.root);
  const bones = {};
  const remap = new Map();
  let sword = null;
  root.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
    if (o.name === 'spear') sword = { ...tpl.sword, group: o };
    if (o.isMesh && o.material && o.material.userData && o.material.userData.rimColor) {
      if (!remap.has(o.material)) remap.set(o.material, cloneCharMaterial(o.material));
      o.material = remap.get(o.material);
    }
  });
  let skinned = null;
  root.traverse((o) => { if (o.isSkinnedMesh) skinned = o; });
  return { ...tpl, root, skinned, bones, sword, materials: [...remap.values()] };
}

function collectMaterials(root) {
  const set = new Set();
  root.traverse((o) => { if (o.isMesh && o.material && o.material.userData && o.material.userData.rimColor) set.add(o.material); });
  return [...set];
}
