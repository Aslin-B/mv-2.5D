import * as THREE from 'three';

// Capa corta dividida (dos paneles) simulada con Verlet: gravedad, viento, amortiguación,
// restricciones de distancia y colisión con cápsulas del cuerpo. Se actualiza en el paso fijo
// y la sombra usa la misma geometría que el pase principal (§9.4).

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _p = new THREE.Vector3();

function capeTexture({ base = '#365456', hem = '#3d2c1f', line = '#9a7a4e', ragged = false } = {}) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 512);
  const img = ctx.getImageData(0, 0, 256, 512);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 256; x++) {
    const i = (y * 256 + x) * 4;
    const weave = ((x + y) % 4 < 2 ? 1 : 0.94) * (0.9 + Math.random() * 0.1);
    const wear = y > 440 ? 0.8 + Math.random() * 0.15 : 1;
    img.data[i] *= weave * wear; img.data[i + 1] *= weave * wear; img.data[i + 2] *= weave * wear;
  }
  ctx.putImageData(img, 0, 0);
  // ribete de cuero y línea de ondas bordada (motivo propio del agua)
  ctx.fillStyle = hem;
  ctx.fillRect(0, 0, 256, 18);
  if (ragged) {
    // borde deshilachado y remiendos (lona del saqueador)
    ctx.globalCompositeOperation = 'destination-out';
    for (let x = 0; x < 256; x += 6) ctx.fillRect(x, 470 + Math.random() * 30, 4 + Math.random() * 4, 60);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(84,92,74,0.85)';
    ctx.fillRect(40, 180, 60, 70);
    ctx.fillRect(150, 320, 50, 56);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  ctx.strokeStyle = line;
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = 0; x <= 256; x += 4) ctx.lineTo(x, 470 + Math.sin(x / 12) * 6);
  ctx.stroke();
  ctx.beginPath();
  for (let x = 0; x <= 256; x += 4) ctx.lineTo(x, 486 + Math.sin(x / 12 + Math.PI) * 4);
  ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class Cape {
  constructor(model, scene, { cols = 5, rows = 10, length = 0.74, palette = null } = {}) {
    this.model = model;
    this.cols = cols; this.rows = rows; this.length = length;
    this.panels = [];
    const ragged = palette && palette.ragged;
    const mat = new THREE.MeshStandardMaterial({ map: capeTexture(palette || {}), roughness: 0.92, side: THREE.DoubleSide, envMapIntensity: 0.5, alphaTest: ragged ? 0.5 : 0 });
    this.material = mat;
    for (const side of ['L', 'R']) {
      const n = cols * rows;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
      const uv = new Float32Array(n * 2);
      const idx = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        uv[i * 2] = (side === 'L' ? c : cols - 1 - c) / (cols - 1) * 0.5 + (side === 'L' ? 0 : 0.5);
        uv[i * 2 + 1] = 1 - r / (rows - 1);
        if (r < rows - 1 && c < cols - 1) idx.push(i, i + cols, i + 1, i + 1, i + cols, i + cols + 1);
      }
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(idx);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      scene.add(mesh);
      const pos = Array.from({ length: n }, () => new THREE.Vector3());
      const prev = Array.from({ length: n }, () => new THREE.Vector3());
      this.panels.push({ side, geo, mesh, pos, prev, anchors: model.capeAnchors[side], init: false });
    }
    this.colliders = [];
    this.wind = 0;
  }

  anchorWorld(panel, c, out) {
    // interpolar entre los 4 anclajes del pecho
    const A = panel.anchors;
    const t = (c / (this.cols - 1)) * (A.length - 1);
    const i = Math.min(Math.floor(t), A.length - 2);
    out.copy(A[i]).lerp(A[i + 1], t - i);
    return this.model.bones.chest.localToWorld(out);
  }

  updateColliders() {
    const b = this.model.bones;
    const cap = (a, bb, r, ea = 0, eb = 0) => {
      const p0 = a.getWorldPosition(new THREE.Vector3());
      const p1 = bb.getWorldPosition(new THREE.Vector3());
      if (ea) p0.y += ea;
      if (eb) p1.y += eb;
      return { a: p0, b: p1, r };
    };
    this.colliders = [
      cap(b.hips, b.chest, 0.19, -0.05, 0.12),
      cap(b.hips, b.spine, 0.2, -0.1, 0),
      cap(b.thighL, b.shinL, 0.1), cap(b.thighR, b.shinR, 0.1),
      cap(b.shinL, b.footL, 0.07), cap(b.shinR, b.footR, 0.07),
    ];
  }

  reset() { for (const p of this.panels) p.init = false; }

  step(dt, windX = 0) {
    this.clock = (this.clock || 0) + dt;
    this.updateColliders();
    const segV = this.length / (this.rows - 1);
    const g = -9.8 * dt * dt;
    for (const P of this.panels) {
      const { pos, prev } = P;
      const C = this.cols, R = this.rows;
      if (!P.init) {
        for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
          const i = r * C + c;
          this.anchorWorld(P, c, pos[i]);
          pos[i].y -= r * segV;
          pos[i].z -= 0.02 * r;
          prev[i].copy(pos[i]);
        }
        P.init = true;
      }
      // Integración
      const t = this.clock;
      for (let r = 1; r < R; r++) for (let c = 0; c < C; c++) {
        const i = r * C + c;
        const p = pos[i];
        _a.subVectors(p, prev[i]).multiplyScalar(0.965);
        prev[i].copy(p);
        p.add(_a);
        p.y += g;
        const gust = windX * (0.6 + 0.4 * Math.sin(t * 2.3 + r * 0.7 + c)) * dt * dt * (r / R);
        p.x += gust;
        p.z += Math.sin(t * 1.7 + c * 1.3) * 0.15 * dt * dt * (r / R);
      }
      // Restricciones
      const segH = [];
      for (let c = 0; c < C - 1; c++) {
        this.anchorWorld(P, c, _a); this.anchorWorld(P, c + 1, _b);
        segH.push(_a.distanceTo(_b) * (1 + 0.04));
      }
      for (let it = 0; it < 6; it++) {
        for (let c = 0; c < C; c++) this.anchorWorld(P, c, pos[c]);
        for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
          const i = r * C + c;
          if (r < R - 1) this.constrain(pos, i, i + C, segV, r === 0);
          if (c < C - 1) this.constrain(pos, i, i + 1, segH[c] * (1 + r * 0.012), r === 0);
          if (r < R - 1 && c < C - 1) this.constrain(pos, i, i + C + 1, Math.hypot(segV, segH[c]), r === 0);
          if (r < R - 2) this.constrain(pos, i, i + 2 * C, segV * 2, r === 0, 0.5);
        }
        // Colisión con cápsulas
        for (let i = C; i < pos.length; i++) this.collide(pos[i]);
      }
      // Volcar a la geometría
      const arr = P.geo.attributes.position.array;
      for (let i = 0; i < pos.length; i++) { arr[i * 3] = pos[i].x; arr[i * 3 + 1] = pos[i].y; arr[i * 3 + 2] = pos[i].z; }
      P.geo.attributes.position.needsUpdate = true;
      P.geo.computeVertexNormals();
      P.geo.computeBoundingSphere();
    }
  }

  constrain(pos, i, j, rest, pinI, stiff = 1) {
    const a = pos[i], b = pos[j];
    _p.subVectors(b, a);
    const d = _p.length() || 1e-6;
    const diff = ((d - rest) / d) * stiff;
    if (pinI) { b.addScaledVector(_p, -diff); }
    else { a.addScaledVector(_p, diff * 0.5); b.addScaledVector(_p, -diff * 0.5); }
  }

  collide(p) {
    for (const c of this.colliders) {
      _a.subVectors(c.b, c.a);
      const l2 = _a.lengthSq() || 1e-6;
      const t = Math.max(0, Math.min(1, _p.subVectors(p, c.a).dot(_a) / l2));
      _b.copy(c.a).addScaledVector(_a, t);
      _p.subVectors(p, _b);
      const d = _p.length();
      const r = c.r + 0.025;
      if (d < r && d > 1e-5) p.addScaledVector(_p, (r - d) / d);
    }
  }

  setVisible(v) { for (const p of this.panels) p.mesh.visible = v; }
}
