import * as THREE from 'three';
import { SdfScene, roundCone, ellipsoid, surfaceNets } from './sdf.js';
import {
  defaultProportions, standardBody, assembleCharacter, buildHand, meshToGeometry, attachRigid,
  lin, mixc, mulc, noise3, paintUniform, shellGeometry, makeCharMaterial, PATTERN, vec,
} from './humanoid.js';
import { smoothstep, clamp } from '../core/math.js';

// Aren Valdara: diseño original (biblia §5). Todo generado por código.
// Paleta: gambesón de lino cálido, capa verde azulada (#365456), cuero oscuro (#40332A),
// acero oscuro con remaches de latón (#8B6746).

const C = {
  skin: lin('#b98468'), skinRed: lin('#b36a58'), skinDark: lin('#8f6250'),
  lip: lin('#98594d'), beard: lin('#2b2018'), brow: lin('#2a1f17'),
  hair: lin('#2a1c13'), hairLight: lin('#4b3424'),
  gambeson: lin('#6e5d48'), gambesonDark: lin('#54473a'),
  trousers: lin('#3b352f'), boot: lin('#40332a'), bootDark: lin('#2e251f'),
  glove: lin('#4a392b'), leather: lin('#5a412b'), teal: lin('#365456'),
  steel: '#4c5258', brass: '#8b6746', blade: '#9aa1a8',
};

export function buildHero() {
  const P = defaultProportions();
  const mat = makeCharMaterial({ bumpScale: 1.0 });
  const rigidMat = makeCharMaterial({ bumpScale: 1.0 });
  const mats = { pelvis: 'pelvis', torso: 'torso', neck: 'neck', arm: 'sleeve', forearm: 'sleeve', thigh: 'trousers', shin: 'trousers', boot: 'boot' };

  // ---------- Cuerpo deformable ----------
  const body = new SdfScene({ k: 0.016 });
  const B = (() => {
    // posiciones de enlace necesarias antes de construir la escena
    const tmp = assembleCharacterSpecOnly(P);
    return tmp;
  })();
  standardBody(body, P, B, mats);
  body.relax = 1;

  const bodyPaint = (x, y, z, prim) => {
    const n = noise3(x, y, z, 40);
    const m = prim.mat;
    if (m === 'neck') {
      if (y > 1.49) return { c: mixc(C.skin, C.skinDark, 0.25 + n * 0.2), r: 0.5, m: 0, p: PATTERN.skin };
      return { c: mulc(C.gambeson, 0.9 + n * 0.15), r: 0.85, m: 0, p: PATTERN.quilt };
    }
    if (m === 'torso' || m === 'sleeve' || (m === 'pelvis' && y > 0.93)) {
      const c = mixc(C.gambeson, C.gambesonDark, smoothstep(0.35, 0.75, noise3(x, y, z, 9)) * 0.6 + (y < 1.05 ? 0.2 : 0));
      return { c: mulc(c, 0.92 + n * 0.16), r: 0.88, m: 0, p: m === 'sleeve' ? PATTERN.cloth : PATTERN.quilt };
    }
    if (m === 'boot') {
      const scuff = smoothstep(0.72, 0.9, noise3(x, y, z, 30)) * 0.5;
      return { c: mixc(C.boot, lin('#6a5444'), scuff * 0.5), r: 0.62 - scuff * 0.1, m: 0, p: PATTERN.leather, w: 0.7 };
    }
    // pantalón de lana
    return { c: mulc(C.trousers, 0.9 + n * 0.2), r: 0.92, m: 0, p: PATTERN.cloth };
  };

  const ch = assembleCharacter({ P, bodyScene: body, bodyPaint, material: mat });
  const { bones, S } = ch;
  const pos = S.pos;
  let tris = ch.triangles;
  const breakdown = { body: ch.triangles };

  // ---------- Cabeza ----------
  const head = new SdfScene({ k: 0.006, subK: 0.004 });
  const hp = (p) => p;
  head.add(ellipsoid([0, 1.738, -0.018], [0.079, 0.1, 0.1], { mat: 'skin' }));
  head.add(ellipsoid([0, 1.71, -0.055], [0.07, 0.075, 0.06], { mat: 'skin' }));
  head.add(ellipsoid([0, 1.735, 0.04], [0.068, 0.055, 0.05], { mat: 'skin' }));
  head.add(ellipsoid([0, 1.67, 0.04], [0.058, 0.055, 0.058], { mat: 'skin' }));
  for (const s of [1, -1]) {
    head.add(ellipsoid([0.046 * s, 1.684, 0.058], [0.024, 0.016, 0.022], { mat: 'cheek' }));
    head.add(roundCone([0.054 * s, 1.629, -0.004], [0.018 * s, 1.592, 0.069], 0.021, 0.019, { mat: 'jaw' }));
    head.add(roundCone([0.057 * s, 1.632, 0.0], [0.02 * s, 1.588, 0.073], 0.025, 0.023, { mat: 'beard', priority: 0.002 }));
    head.add(ellipsoid([0.079 * s, 1.688, -0.008], [0.011, 0.029, 0.019], { mat: 'ear' }));
    head.add(ellipsoid([0.0118 * s, 1.657, 0.095], [0.0085, 0.0075, 0.0085], { mat: 'nose' }));
    head.carve(ellipsoid([0.031 * s, 1.69, 0.083], [0.0175, 0.0145, 0.016]));
    head.add(roundCone([0.022 * s, 1.6395, 0.093], [0.026 * s, 1.627, 0.088], 0.0045, 0.0038, { mat: 'beard' }));
  }
  head.add(ellipsoid([0, 1.592, 0.072], [0.026, 0.021, 0.02], { mat: 'jaw' }));
  head.add(ellipsoid([0, 1.587, 0.077], [0.029, 0.026, 0.023], { mat: 'beard', priority: 0.002 }));
  head.add(ellipsoid([0, 1.632, 0.072], [0.035, 0.03, 0.03], { mat: 'skin' }));
  head.add(roundCone([0, 1.708, 0.086], [0, 1.664, 0.111], 0.0072, 0.0095, { mat: 'nose' }));
  head.add(ellipsoid([0, 1.661, 0.104], [0.0115, 0.0105, 0.011], { mat: 'nose' }));
  head.add(roundCone([-0.052, 1.713, 0.072], [0.052, 1.713, 0.072], 0.0105, 0.0105, { mat: 'brow' }));
  head.add(ellipsoid([0, 1.632, 0.0925], [0.02, 0.0062, 0.0095], { mat: 'lip' }));
  head.add(ellipsoid([0, 1.6215, 0.0895], [0.018, 0.0068, 0.0095], { mat: 'lip' }));
  head.add(roundCone([-0.022, 1.6405, 0.0945], [0.022, 1.6405, 0.0945], 0.0048, 0.0048, { mat: 'beard' }));
  head.carve(ellipsoid([0, 1.627, 0.099], [0.019, 0.0016, 0.006]));
  head.add(roundCone([0, 1.55, -0.022], [0, 1.66, -0.02], 0.053, 0.05, { mat: 'skin' }));
  head.relax = 1;
  void hp;

  const headPaint = (x, y, z, prim) => {
    const n = noise3(x, y, z, 120);
    let c = mixc(C.skin, C.skinDark, 0.15 + n * 0.25);
    // rubor natural en pómulos, nariz y orejas
    const red = Math.max(
      Math.exp(-((Math.abs(x) - 0.045) ** 2 + (y - 1.668) ** 2 + (z - 0.06) ** 2) / 0.0006),
      prim.mat === 'nose' ? 0.6 : 0, prim.mat === 'ear' ? 0.7 : 0);
    c = mixc(c, C.skinRed, red * 0.35);
    let r = 0.48, p = PATTERN.skin;
    if (prim.mat === 'lip') { c = mixc(C.lip, C.skinDark, n * 0.2); r = 0.38; }
    const ax = Math.abs(x);
    const jawLine = 1.636 + smoothstep(0.02, 0.06, ax) * 0.03;   // sube hacia las patillas
    const below = jawLine - y;
    let beard = prim.mat === 'beard' ? 1 : smoothstep(-0.004, 0.006, below) * (z > -0.015 ? 1 : 0);
    if (ax > 0.064 && y > 1.62 && y < 1.715 && z > -0.028 && z < 0.03) beard = Math.max(beard, smoothstep(1.715, 1.69, y));
    if (prim.mat === 'lip') beard = 0;
    if (beard > 0.01) {
      c = mixc(c, mulc(C.beard, 0.85 + n * 0.35), clamp(beard, 0, 1) * 0.95);
      r = 0.5 + 0.32 * beard; p = beard > 0.5 ? PATTERN.hair : PATTERN.skin;
    } else if (y < 1.665 && z > 0.02 && ax > 0.02) {
      c = mixc(c, C.beard, 0.18); // sombra de barba recortada
    }
    if (prim.mat === 'brow' && z > 0.058) {
      const bw = smoothstep(1.704, 1.712, y) * smoothstep(0.008, 0.016, Math.abs(x)) * smoothstep(0.062, 0.05, Math.abs(x));
      c = mixc(c, C.brow, bw * 0.9); if (bw > 0.5) { r = 0.8; p = PATTERN.hair; }
    }
    // Sombra suave bajo los ojos
    if (y > 1.672 && y < 1.684 && Math.abs(Math.abs(x) - 0.031) < 0.017 && z > 0.07) c = mulc(c, 0.86);
    return { c, r, m: 0, p };
  };
  const headMesh = surfaceNets(head, 0.0048);
  const headGeo = meshToGeometry(headMesh, head, headPaint, { origin: pos.head });
  const headMeshObj = new THREE.Mesh(headGeo, rigidMat);
  headMeshObj.castShadow = true; headMeshObj.receiveShadow = true;
  bones.head.add(headMeshObj);
  tris += headMesh.indices.length / 3;
  breakdown.head = headMesh.indices.length / 3;

  // Ojos (esclerótica, iris avellana, pupila) y párpados para parpadear.
  const eyes = [];
  const eyeWhite = new THREE.MeshStandardMaterial({ color: '#ddd3c8', roughness: 0.12 });
  const irisMat = new THREE.MeshStandardMaterial({ color: '#6e5a33', roughness: 0.2 });
  const pupilMat = new THREE.MeshStandardMaterial({ color: '#0d0a08', roughness: 0.1 });
  const lidMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(...C.skin), roughness: 0.55 });
  for (const s of [1, -1]) {
    const g = new THREE.Group();
    g.position.set(0.031 * s - pos.head[0], 1.69 - pos.head[1], 0.071 - pos.head[2]);
    const r = 0.0118;
    const white = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), eyeWhite);
    const irisG = new THREE.SphereGeometry(r * 1.004, 18, 6, 0, Math.PI * 2, 0, 0.5);
    irisG.rotateX(Math.PI / 2);
    const iris = new THREE.Mesh(irisG, irisMat);
    const pupG = new THREE.SphereGeometry(r * 1.008, 12, 4, 0, Math.PI * 2, 0, 0.2);
    pupG.rotateX(Math.PI / 2);
    const pupil = new THREE.Mesh(pupG, pupilMat);
    const lidG = new THREE.SphereGeometry(r * 1.12, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const lid = new THREE.Mesh(lidG, lidMat);
    lid.rotation.x = -0.35;
    g.add(white, iris, pupil, lid);
    bones.head.add(g);
    eyes.push({ group: g, lid, iris, pupil });
  }

  // ---------- Cabello (semirrecogido, longitud media) ----------
  const hair = new SdfScene({ k: 0.008 });
  hair.add(ellipsoid([0, 1.744, -0.02], [0.088, 0.107, 0.107], { mat: 'hair' }));
  hair.add(ellipsoid([0, 1.815, -0.012], [0.074, 0.038, 0.092], { mat: 'hair' }));
  hair.add(ellipsoid([0, 1.785, -0.113], [0.032, 0.028, 0.03], { mat: 'knot' }));
  hair.add(ellipsoid([0, 1.665, -0.082], [0.069, 0.07, 0.036], { mat: 'hair' }));
  for (const s of [1, -1]) {
    hair.add(roundCone([0.075 * s, 1.742, -0.004], [0.082 * s, 1.645, -0.035], 0.021, 0.011, { mat: 'hair' }));
    hair.add(roundCone([0.061 * s, 1.768, 0.042], [0.077 * s, 1.676, 0.036], 0.015, 0.007, { mat: 'strand' }));
  }
  hair.clip = (x, y, z) => {
    const ax = Math.abs(x);
    let hl = 1.774 - 0.135 * smoothstep(0.05, -0.09, z) - 0.028 * smoothstep(0.035, 0.075, ax);
    hl += 0.006 * Math.cos(x * 60); // ligera irregularidad de la línea de nacimiento
    let d = hl - y;
    // Dejar libres las orejas
    const ear = Math.hypot((ax - 0.08) / 0.028, (y - 1.688) / 0.045, (z + 0.008) / 0.032) - 1;
    d = Math.max(d, -ear * 0.02);
    // Mechones laterales no se recortan por la línea
    if (ax > 0.058 && z > -0.05 && z < 0.06 && y < 1.78 && y > 1.63) d = Math.min(d, -0.001 + (ear < 0 ? 0.03 : 0));
    return d;
  };
  hair.displace = (x, y, z) => {
    const a = Math.atan2(x, z);
    return 0.0035 * Math.sin(a * 14 + y * 40) + (noise3(x, y, z, 55) - 0.5) * 0.008;
  };
  hair.relax = 1;
  const hairPaint = (x, y, z) => {
    const n = noise3(x * 0.6, y * 3, z * 0.6, 160);
    return { c: mixc(C.hair, C.hairLight, smoothstep(0.55, 0.9, n) * 0.7), r: 0.52, m: 0, p: PATTERN.hair };
  };
  const hairMesh = surfaceNets(hair, 0.0064);
  const hairGeo = meshToGeometry(hairMesh, hair, hairPaint, { origin: pos.head });
  const hairObj = new THREE.Mesh(hairGeo, rigidMat);
  hairObj.castShadow = true;
  bones.head.add(hairObj);
  tris += hairMesh.indices.length / 3;
  breakdown.hair = hairMesh.indices.length / 3;

  // Coleta corta con muelles (movimiento secundario, §12.10)
  const tailMat = rigidMat;
  const tail = [];
  for (let i = 0; i < 3; i++) {
    const g = paintUniform(new THREE.CapsuleGeometry(0.016 - i * 0.004, 0.035, 4, 8), '#2a1c13', 0.55, 0, PATTERN.hair);
    g.translate(0, -0.03, 0);
    const m = new THREE.Mesh(g, tailMat);
    m.castShadow = true;
    tail.push(m);
  }

  // ---------- Manos con guantes ----------
  const glovePaint = (x, y, z) => {
    const n = noise3(x, y, z, 90);
    return { c: mixc(C.glove, lin('#6b5443'), n * 0.35), r: 0.6, m: 0, p: PATTERN.leather, w: 0.6 };
  };
  const hands = {};
  for (const [side, L] of [[1, 'L'], [-1, 'R']]) {
    const h = buildHand(side, S, { grip: side < 0, curl: side < 0 ? 1 : 0.45, mat: 'glove' });
    const geo = meshToGeometry(h.mesh, h.scene, glovePaint, { origin: pos['hand' + L] });
    const m = new THREE.Mesh(geo, rigidMat);
    m.castShadow = true;
    bones['hand' + L].add(m);
    hands[L] = h;
    tris += h.mesh.indices.length / 3;
    breakdown['hand' + L] = h.mesh.indices.length / 3;
  }

  // ---------- Armadura parcial y correajes ----------
  const steel = (g, wear = 0.6) => paintUniform(g, C.steel, 0.36, 1, PATTERN.metal, wear);
  const brass = (g) => paintUniform(g, C.brass, 0.34, 1, PATTERN.metal, 0.4);
  const leather = (g, hex = '#5a412b') => paintUniform(g, hex, 0.62, 0, PATTERN.leather, 0.6);
  const add = (bone, geo, cast = true) => {
    const m = new THREE.Mesh(geo, rigidMat);
    m.castShadow = cast; m.receiveShadow = true;
    bone.add(m);
    tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
    return m;
  };

  // Hombrera izquierda: cúpula + dos láminas articuladas que siguen el brazo
  {
    const dome = shellGeometry({ rx: 0.094, ry: 0.07, rz: 0.1, th1: 1.32, thick: 0.005, seg: 28 });
    steel(dome);
    dome.rotateZ(-0.42);
    dome.translate(0.016, 0.026, -0.004);
    add(bones.armL, dome);
    const d = S.dirL;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-d[0], -d[1], -d[2]));
    for (let i = 0; i < 2; i++) {
      const g = new THREE.CylinderGeometry(0.074 - i * 0.004, 0.066 - i * 0.004, 0.05, 20, 1, true, Math.PI / 2 - 1.25, 2.5);
      steel(g, 0.7);
      g.applyQuaternion(q);
      const c = vec.scl(d, 0.045 + i * 0.04);
      g.translate(c[0] + 0.008, c[1], c[2]);
      const m = add(bones.armL, g);
      m.material = makeCharMaterial({ side: THREE.DoubleSide });
      // Remaches de latón en el borde de cada lámina
      for (const a of [-0.8, 0, 0.8]) {
        const r = brass(new THREE.SphereGeometry(0.005, 8, 6));
        const ang = Math.PI / 2 + a;
        const loc = new THREE.Vector3(Math.sin(ang) * 0.072, -0.018, Math.cos(ang) * 0.072).applyQuaternion(q);
        r.translate(loc.x + c[0] + 0.008, loc.y + c[1], loc.z + c[2]);
        add(bones.armL, r, false);
      }
    }
    for (const a of [-0.7, 0, 0.7]) {
      const r = brass(new THREE.SphereGeometry(0.0055, 8, 6));
      const v = new THREE.Vector3(Math.sin(1.25) * Math.cos(a) * 0.094, Math.cos(1.25) * 0.07, Math.sin(1.25) * Math.sin(a) * 0.1);
      v.applyAxisAngle(new THREE.Vector3(0, 0, 1), -0.42);
      r.translate(v.x + 0.016, v.y + 0.026, v.z - 0.004);
      add(bones.armL, r, false);
    }
  }
  // Hombrera derecha ligera de cuero endurecido
  {
    const g = shellGeometry({ rx: 0.078, ry: 0.06, rz: 0.08, th1: 1.1, thick: 0.005 });
    leather(g, '#4e3a28');
    g.rotateZ(0.55);
    g.translate(-0.02, 0.018, 0);
    add(bones.armR, g);
  }
  // Brazales (cuero con placa de acero)
  for (const L of ['L', 'R']) {
    const s = L === 'L' ? 1 : -1;
    const d = L === 'L' ? S.dirL : S.dirR;
    const E = pos['fore' + L];
    const len = 0.19;
    const g = new THREE.CylinderGeometry(0.039, 0.046, len, 18, 1, true);
    leather(g, '#4f3b2a');
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-d[0], -d[1], -d[2]));
    g.applyQuaternion(q);
    const c = vec.add(E, vec.scl(d, 0.07 + len / 2));
    g.translate(c[0], c[1], c[2]);
    g.translate(-E[0], -E[1], -E[2]);
    add(bones['fore' + L], g);
    const pl = new THREE.CylinderGeometry(0.048, 0.054, len * 0.8, 12, 1, true, Math.PI * 0.25 + (s > 0 ? 0 : Math.PI), Math.PI * 0.75);
    steel(pl);
    pl.applyQuaternion(q);
    pl.translate(c[0] - E[0], c[1] - E[1], c[2] - E[2]);
    add(bones['fore' + L], pl);
  }
  // Codera izquierda
  {
    const E = pos.foreL;
    const g = shellGeometry({ rx: 0.05, ry: 0.05, rz: 0.04, th1: 1.3 });
    steel(g);
    g.rotateZ(Math.PI / 2 + 0.3);
    g.translate(0.03, 0.0, -0.02);
    void E;
    add(bones.foreL, g);
  }
  // Rodilleras
  for (const L of ['L', 'R']) {
    const g = shellGeometry({ rx: 0.052, ry: 0.03, rz: 0.06, th1: 1.25 });
    paintUniform(g, '#6a7178', 0.34, 1, PATTERN.metal, 0.6);
    g.rotateX(Math.PI / 2 - 0.1);
    g.translate(0, 0.0, 0.034);
    add(bones['shin' + L], g);
  }
  // Cinturón con hebilla y bolsa
  {
    const g = new THREE.CylinderGeometry(1, 1, 0.048, 40, 1, true);
    g.scale(0.17, 1, 0.123);
    leather(g, '#4a3524');
    g.translate(0, 1.005 - pos.hips[1], 0.002);
    const m = add(bones.hips, g);
    m.material = rigidMat;
    const bk = brass(new THREE.BoxGeometry(0.05, 0.042, 0.012));
    bk.translate(0, 1.005 - pos.hips[1], 0.126);
    add(bones.hips, bk);
    const pouch = leather(new THREE.BoxGeometry(0.06, 0.075, 0.035), '#5c4330');
    pouch.translate(-0.13, 0.965 - pos.hips[1], -0.07);
    pouch.rotateY(0.6);
    add(bones.hips, pouch);
  }
  // Tahalí cruzado sobre el pecho (sigue la superficie del torso)
  {
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      const y = 1.465 - t * 0.43;
      const x = -0.135 + t * 0.235;
      // proyectar sobre el torso por delante
      let z = 0.2;
      for (let it = 0; it < 60 && z > 0; it++) {
        const d = body.eval(x, y, z);
        if (d < 0.004) break;
        z -= Math.max(d, 0.002);
      }
      z = Math.max(z, 0.02);
      pts.push(new THREE.Vector3(x, y, z + 0.004));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const ribbon = ribbonGeometry(curve, 0.042, 40, (x, y, z) => {
      const n = new THREE.Vector3(body.eval(x + 1e-3, y, z) - body.eval(x - 1e-3, y, z), body.eval(x, y + 1e-3, z) - body.eval(x, y - 1e-3, z), body.eval(x, y, z + 1e-3) - body.eval(x, y, z - 1e-3));
      return n.normalize();
    });
    leather(ribbon, '#3e2d20');
    ribbon.translate(-pos.chest[0], -pos.chest[1], -pos.chest[2]);
    add(bones.chest, ribbon);
  }
  // Cuello alto del gambesón
  {
    const prof = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      prof.push(new THREE.Vector2(0.079 - t * 0.012 + Math.sin(t * Math.PI) * 0.004, 1.425 + t * 0.075));
    }
    const g = new THREE.LatheGeometry(prof, 28);
    g.scale(1, 1, 0.92);
    paintUniform(g, '#5f503f', 0.88, 0, PATTERN.quilt);
    g.translate(0, -pos.chest[1], -0.012 - pos.chest[2]);
    const m = add(bones.chest, g);
    m.material = makeCharMaterial({ side: THREE.DoubleSide });
  }
  // Vaina vacía en la cadera izquierda
  {
    const g = new THREE.CylinderGeometry(0.019, 0.024, 0.92, 10);
    leather(g, '#3b2b1f');
    g.translate(0, -0.46, 0);
    g.rotateX(0.62);
    g.rotateZ(0.1);
    g.translate(0.15, 0.985 - pos.hips[1], -0.03);
    add(bones.hips, g);
    const lk = brass(new THREE.CylinderGeometry(0.026, 0.026, 0.05, 10));
    lk.rotateX(0.62); lk.rotateZ(0.1);
    lk.translate(0.15, 0.97 - pos.hips[1], -0.04);
    add(bones.hips, lk);
  }

  // ---------- Espada de mano y media (diseño propio) ----------
  const sword = buildSword();
  const hR = hands.R;
  const gripLocal = new THREE.Vector3(hR.grip[0] - pos.handR[0], hR.grip[1] - pos.handR[1], hR.grip[2] - pos.handR[2]);
  sword.group.position.copy(gripLocal);
  sword.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...hR.axis));
  // Girar el filo para que quede en el plano del gesto de corte
  sword.group.rotateY(Math.PI / 2);
  bones.handR.add(sword.group);
  tris += sword.tris;

  // ---------- Clavija de forja (oculta hasta adquirirla) ----------
  const clavija = buildClavija();
  clavija.group.position.set(-0.165, 0.985 - pos.hips[1], 0.05);
  clavija.group.rotation.set(0.2, 0, 0.25);
  clavija.group.visible = false;
  bones.hips.add(clavija.group);

  // Anclajes de la capa (espacio local del pecho)
  const capeAnchors = {
    L: [[0.165, 1.452, -0.07], [0.12, 1.462, -0.105], [0.07, 1.455, -0.122], [0.016, 1.44, -0.128]],
    R: [[-0.016, 1.44, -0.128], [-0.07, 1.455, -0.122], [-0.12, 1.462, -0.105], [-0.165, 1.452, -0.07]],
  };
  for (const k of ['L', 'R']) capeAnchors[k] = capeAnchors[k].map((p) => new THREE.Vector3(p[0] - pos.chest[0], p[1] - pos.chest[1], p[2] - pos.chest[2]));

  return {
    root: ch.root, skinned: ch.skinned, bones, S, P, eyes, tail, sword, clavija, capeAnchors,
    materials: [mat, rigidMat], triangles: tris, breakdown,
  };
}

// Solo posiciones de enlace (para construir la escena SDF antes del esqueleto).
import { bindPositions } from './humanoid.js';
function assembleCharacterSpecOnly(P) { return bindPositions(P); }

// Cinta plana que sigue una curva, orientada según la normal de una superficie.
export function ribbonGeometry(curve, width, segs, normalAt) {
  const pos = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const n = normalAt(p.x, p.y, p.z);
    const side = new THREE.Vector3().crossVectors(n, tan).normalize().multiplyScalar(width / 2);
    pos.push(p.x + side.x, p.y + side.y, p.z + side.z, p.x - side.x, p.y - side.y, p.z - side.z);
    if (i < segs) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Espada: hoja con sección de rombo y vaceo central, guarda curvada, puño encordado y pomo de rueda.
// Eje +Y = dirección de la hoja; origen en el centro del puño de la mano derecha.
export function buildSword() {
  const group = new THREE.Group();
  const mat = makeCharMaterial({ bumpScale: 0.6, envIntensity: 1.4 });
  const guardY = 0.058, bladeLen = 0.86;
  // Hoja
  const segs = 22;
  const pos = [], col = [], surf = [], idx = [];
  const steel = lin('#a3aab1'), fuller = lin('#6f767c'), edge = lin('#c9ced2');
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const y = guardY + 0.006 + t * bladeLen;
    let w = 0.025 * (1 - t * 0.62);
    if (t > 0.88) w *= Math.max(0, 1 - (t - 0.88) / 0.12) ** 0.8;
    const th = 0.0042 * (1 - t * 0.5);
    const fw = w * 0.32 * (t < 0.72 ? 1 : Math.max(0, 1 - (t - 0.72) / 0.12));
    const ring = [[w, 0], [fw, th], [-fw, th], [-w, 0], [-fw, -th], [fw, -th]];
    const cols = [edge, fuller, fuller, edge, fuller, fuller];
    for (let k = 0; k < 6; k++) {
      pos.push(ring[k][0], y, ring[k][1]);
      col.push(...(k % 3 === 0 ? edge : (fw > w * 0.1 ? mixc(steel, cols[k], 0.5) : steel)));
      surf.push(0.2, 1, PATTERN.metal, 0.3);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let k = 0; k < 6; k++) {
      const a = i * 6 + k, b = i * 6 + ((k + 1) % 6), c = a + 6, d = b + 6;
      idx.push(a, c, b, b, c, d);
    }
  }
  const tipI = pos.length / 3;
  pos.push(0, guardY + 0.006 + bladeLen + 0.012, 0); col.push(...edge); surf.push(0.2, 1, PATTERN.metal, 0.3);
  for (let k = 0; k < 6; k++) idx.push(segs * 6 + k, tipI, segs * 6 + ((k + 1) % 6));
  const blade = new THREE.BufferGeometry();
  blade.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  blade.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  blade.setAttribute('surf', new THREE.Float32BufferAttribute(surf, 4));
  blade.setIndex(idx);
  blade.computeVertexNormals();
  const bladeMesh = new THREE.Mesh(blade, mat);
  bladeMesh.castShadow = true;
  group.add(bladeMesh);
  // Guarda con curvatura hacia la hoja
  const gp = [];
  for (let i = 0; i <= 10; i++) {
    const x = -0.1 + i * 0.02;
    gp.push(new THREE.Vector3(x, guardY + 0.014 * (x / 0.1) ** 2, 0));
  }
  const guard = paintUniform(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(gp), 20, 0.0085, 8, false), '#5d636a', 0.32, 1, PATTERN.metal, 0.5);
  guard.scale(1, 1, 0.75);
  const guardMesh = new THREE.Mesh(guard, mat);
  guardMesh.castShadow = true;
  group.add(guardMesh);
  for (const s of [-1, 1]) {
    const end = paintUniform(new THREE.SphereGeometry(0.011, 10, 8), '#8b6746', 0.35, 1, PATTERN.metal);
    end.translate(0.1 * s, guardY + 0.014, 0);
    group.add(new THREE.Mesh(end, mat));
  }
  // Puño encordado
  const grip = paintUniform(new THREE.CylinderGeometry(0.0145, 0.0155, 0.2, 12), '#3a2a1e', 0.7, 0, PATTERN.leather);
  grip.translate(0, guardY - 0.1, 0);
  group.add(new THREE.Mesh(grip, mat));
  // Pomo de rueda
  const pom = paintUniform(new THREE.CylinderGeometry(0.026, 0.026, 0.017, 18), '#6c6f72', 0.3, 1, PATTERN.metal, 0.5);
  pom.rotateX(Math.PI / 2);
  pom.translate(0, guardY - 0.215, 0);
  const pomMesh = new THREE.Mesh(pom, mat);
  pomMesh.castShadow = true;
  group.add(pomMesh);
  const cap = paintUniform(new THREE.CylinderGeometry(0.009, 0.009, 0.024, 10), '#8b6746', 0.35, 1, PATTERN.metal);
  cap.rotateX(Math.PI / 2);
  cap.translate(0, guardY - 0.215, 0);
  group.add(new THREE.Mesh(cap, mat));
  return {
    group, material: mat,
    base: new THREE.Vector3(0, guardY + 0.05, 0), tip: new THREE.Vector3(0, guardY + bladeLen, 0),
    tris: idx.length / 3 + 600,
  };
}

// Clavija mecánica plegable: varilla de bronce con cabeza dentada y bisagra.
export function buildClavija() {
  const group = new THREE.Group();
  const mat = makeCharMaterial({ envIntensity: 1.3 });
  const rod = paintUniform(new THREE.CylinderGeometry(0.009, 0.007, 0.16, 10), '#8b6746', 0.32, 1, PATTERN.metal);
  rod.translate(0, -0.06, 0);
  group.add(new THREE.Mesh(rod, mat));
  const head = new THREE.CylinderGeometry(0.024, 0.024, 0.014, 12);
  paintUniform(head, '#a57d52', 0.28, 1, PATTERN.metal);
  head.rotateX(Math.PI / 2);
  head.translate(0, 0.03, 0);
  group.add(new THREE.Mesh(head, mat));
  for (let i = 0; i < 8; i++) {
    const t = paintUniform(new THREE.BoxGeometry(0.009, 0.009, 0.014), '#a57d52', 0.3, 1, PATTERN.metal);
    const a = (i / 8) * Math.PI * 2;
    t.translate(Math.cos(a) * 0.027, 0.03 + Math.sin(a) * 0.027, 0);
    group.add(new THREE.Mesh(t, mat));
  }
  const hinge = paintUniform(new THREE.TorusGeometry(0.011, 0.004, 6, 12), '#4c5258', 0.4, 1, PATTERN.metal);
  hinge.translate(0, 0.005, 0);
  group.add(new THREE.Mesh(hinge, mat));
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffcf8a' }));
  glow.position.set(0, 0.03, 0.008);
  group.add(glow);
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group, glow };
}

void attachRigid;
