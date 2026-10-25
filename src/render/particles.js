import * as THREE from 'three';

// Sistema de partículas por CPU con sprites suaves (polvo, vapor, chispas, brasas, hojas).
// Cantidades limitadas: se reducen antes que la tasa de simulación (biblia §9.8).

export class Particles {
  constructor(max, texture, { additive = false, fogged = true } = {}) {
    this.max = max;
    this.count = 0;
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.col = new Float32Array(max * 3);
    this.alpha = new Float32Array(max);
    this.geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.aPos);
    this.geo.setAttribute('pcolor', this.aCol);
    this.geo.setAttribute('psize', this.aSize);
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: fogged,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: texture }, scale: { value: 600 } }]),
      vertexShader: /* glsl */ `
        attribute vec4 pcolor; attribute float psize; uniform float scale;
        varying vec4 vC;
        #include <fog_pars_vertex>
        void main(){ vC = pcolor; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = psize * scale / -mvPosition.z; gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; varying vec4 vC;
        #include <fog_pars_fragment>
        void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC.rgb, vC.a * t.a);
          #include <fog_fragment>
        }`,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
  }

  emit(o) {
    if (this.count >= this.max) return;
    const i = this.count++;
    this.p[i * 3] = o.x; this.p[i * 3 + 1] = o.y; this.p[i * 3 + 2] = o.z ?? 0;
    this.v[i * 3] = o.vx || 0; this.v[i * 3 + 1] = o.vy || 0; this.v[i * 3 + 2] = o.vz || 0;
    this.life[i] = this.maxLife[i] = o.life || 1;
    this.size[i] = o.size || 0.05;
    this.grow[i] = o.grow || 0;
    this.drag[i] = o.drag ?? 1;
    this.grav[i] = o.gravity || 0;
    const c = o.color || [1, 1, 1];
    this.col[i * 3] = c[0]; this.col[i * 3 + 1] = c[1]; this.col[i * 3 + 2] = c[2];
    this.alpha[i] = o.alpha ?? 1;
  }

  update(dt, wind = 0) {
    let n = this.count;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        n--;
        this.copy(n, i);
        i--;
        continue;
      }
      const d = Math.pow(this.drag[i], dt);
      this.v[i * 3] = (this.v[i * 3] + wind * dt * 0.2) * d;
      this.v[i * 3 + 1] = (this.v[i * 3 + 1] - this.grav[i] * dt) * d;
      this.v[i * 3 + 2] *= d;
      this.p[i * 3] += this.v[i * 3] * dt;
      this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt;
      this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      this.size[i] += this.grow[i] * dt;
    }
    this.count = n;
    const P = this.aPos.array, C = this.aCol.array, S = this.aSize.array;
    for (let i = 0; i < n; i++) {
      P[i * 3] = this.p[i * 3]; P[i * 3 + 1] = this.p[i * 3 + 1]; P[i * 3 + 2] = this.p[i * 3 + 2];
      const t = this.life[i] / this.maxLife[i];
      const fade = Math.min(1, t * 3) * Math.min(1, (1 - t) * 8 + 0.2);
      C[i * 4] = this.col[i * 3]; C[i * 4 + 1] = this.col[i * 3 + 1]; C[i * 4 + 2] = this.col[i * 3 + 2];
      C[i * 4 + 3] = this.alpha[i] * fade;
      S[i] = this.size[i];
    }
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = true;
    this.geo.setDrawRange(0, n);
  }

  copy(from, to) {
    for (let k = 0; k < 3; k++) { this.p[to * 3 + k] = this.p[from * 3 + k]; this.v[to * 3 + k] = this.v[from * 3 + k]; this.col[to * 3 + k] = this.col[from * 3 + k]; }
    this.life[to] = this.life[from]; this.maxLife[to] = this.maxLife[from]; this.size[to] = this.size[from];
    this.grow[to] = this.grow[from]; this.drag[to] = this.drag[from]; this.grav[to] = this.grav[from]; this.alpha[to] = this.alpha[from];
  }

  clear() { this.count = 0; this.geo.setDrawRange(0, 0); }
}

// Fragmentos sólidos (escombros del muro agrietado) con física simple y suelo.
export class Debris {
  constructor(scene, material) {
    this.scene = scene;
    this.mat = material;
    this.items = [];
  }
  burst(x, y, w, h, count, groundAt) {
    for (let i = 0; i < count; i++) {
      const s = 0.08 + Math.random() * 0.18;
      const g = new THREE.DodecahedronGeometry(s, 0);
      g.scale(1, 0.7 + Math.random() * 0.5, 0.8 + Math.random() * 0.4);
      const m = new THREE.Mesh(g, this.mat);
      m.castShadow = true;
      m.position.set(x + (Math.random() - 0.5) * w, y + Math.random() * h, (Math.random() - 0.5) * 0.8);
      this.scene.add(m);
      this.items.push({
        m, vx: (Math.random() - 0.2) * 5, vy: Math.random() * 4, vz: (Math.random() - 0.5) * 3,
        rx: Math.random() * 10, ry: Math.random() * 10, life: 6 + Math.random() * 2, groundAt, r: s,
      });
    }
  }
  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const d = this.items[i];
      d.life -= dt;
      d.vy -= 24 * dt;
      d.m.position.x += d.vx * dt; d.m.position.y += d.vy * dt; d.m.position.z += d.vz * dt;
      const gy = d.groundAt(d.m.position.x) + d.r * 0.6;
      if (d.m.position.y < gy) { d.m.position.y = gy; d.vy *= -0.3; d.vx *= 0.6; d.vz *= 0.6; d.rx *= 0.5; d.ry *= 0.5; }
      d.m.rotation.x += d.rx * dt; d.m.rotation.y += d.ry * dt;
      if (d.life < 1) d.m.scale.setScalar(Math.max(d.life, 0.001));
      if (d.life <= 0) { this.scene.remove(d.m); d.m.geometry.dispose(); this.items.splice(i, 1); }
    }
  }
}
