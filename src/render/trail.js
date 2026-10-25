import * as THREE from 'three';

// Estela del filo: cinta entre base y punta de la hoja en los últimos instantes, subdividida con
// Catmull-Rom. Es un efecto visual; el daño se calcula con el barrido real de la hoja (§14.3).

export class SwordTrail {
  constructor(scene, { samples = 12, sub = 4, color = '#ffe6c2' } = {}) {
    this.samples = samples;
    this.sub = sub;
    this.hist = [];
    this.n = (samples - 1) * sub + 1;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.n * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(this.n * 2), 1).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < this.n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { color: { value: new THREE.Color(color) }, intensity: { value: 0 } },
      vertexShader: `attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 color; uniform float intensity; varying float vA; void main(){ gl_FragColor = vec4(color * intensity * 1.6, vA * intensity); }`,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
    this.intensity = 0;
  }

  push(base, tip, active) {
    this.hist.unshift([base.clone(), tip.clone()]);
    if (this.hist.length > this.samples) this.hist.pop();
    const target = active ? 1 : 0;
    this.intensity += (target - this.intensity) * (active ? 0.6 : 0.25);
    this.mat.uniforms.intensity.value = this.intensity;
    this.mesh.visible = this.intensity > 0.02 && this.hist.length > 2;
    if (!this.mesh.visible) return;
    const P = this.geo.attributes.position.array, A = this.geo.attributes.alpha.array;
    const H = this.hist;
    const get = (i, k) => H[Math.max(0, Math.min(H.length - 1, i))][k];
    let w = 0;
    const tmp = new THREE.Vector3();
    for (let i = 0; i < this.samples - 1; i++) {
      for (let s = 0; s < this.sub; s++) {
        if (w >= this.n) break;
        const t = s / this.sub;
        for (let k = 0; k < 2; k++) {
          catmull(get(i - 1, k), get(i, k), get(i + 1, k), get(i + 2, k), t, tmp);
          P[(w * 2 + k) * 3] = tmp.x; P[(w * 2 + k) * 3 + 1] = tmp.y; P[(w * 2 + k) * 3 + 2] = tmp.z;
        }
        const f = 1 - (i + t) / (Math.min(H.length, this.samples) - 1);
        A[w * 2] = Math.max(0, f) * 0.15;
        A[w * 2 + 1] = Math.max(0, f) ** 1.5 * 0.85;
        w++;
      }
    }
    for (; w < this.n; w++) { A[w * 2] = 0; A[w * 2 + 1] = 0; }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
  }

  clear() { this.hist.length = 0; this.intensity = 0; this.mesh.visible = false; }
}

function catmull(p0, p1, p2, p3, t, out) {
  const t2 = t * t, t3 = t2 * t;
  for (const c of ['x', 'y', 'z']) {
    out[c] = 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3);
  }
  return out;
}
