import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../core/math.js';

// «Eclipse de sombras»: núcleo negro sobre la palma, corona violeta y plateada, filamentos de sombra
// que el núcleo atrae en espiral, motas oscuras y chispas, y una luz violeta que alumbra mano y rostro.
// Fases (tiempo de carga): semilla 0,3 s · condensación 1,5 s · eclipse 3 s; al soltar, lanzamiento
// con estela de sombras. Las mismas piezas sirven para la esfera en la mano y para el proyectil.

const ease = (t) => t * t * (3 - 2 * t);
export const ORB_PHASES = {
  seed: 0.3, condense: 1.5, eclipse: 3.0,
  R: { seed: 0.022, condense: 0.066, eclipse: 0.15 },
  phaseAt(t) { return t >= 3.0 ? 3 : t >= 1.5 ? 2 : t >= 0.3 ? 1 : 0; },
  radiusAt(t) {
    const R = this.R;
    if (t < 0.3) return lerp(0.004, R.seed, ease(clamp(t / 0.3, 0, 1)));
    if (t < 1.5) return lerp(R.seed, R.condense, ease((t - 0.3) / 1.2));
    if (t < 3.0) return lerp(R.condense, R.eclipse, ease((t - 1.5) / 1.5));
    return R.eclipse;
  },
  // potencia visual 0..1 (corona, filamentos, luz)
  powerAt(t) { return clamp(t < 0.3 ? t / 0.3 * 0.25 : t < 1.5 ? 0.25 + (t - 0.3) / 1.2 * 0.35 : 0.6 + Math.min(1, (t - 1.5) / 1.5) * 0.4, 0, 1); },
};

const VIOLET = new THREE.Color(0.62, 0.22, 1.25);
const SILVER = new THREE.Color(0.95, 0.9, 1.1);

const NOISE = /* glsl */ `
float oh(vec3 p){ p = fract(p*0.3183099+vec3(0.71,0.113,0.419)); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float on3(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(oh(i),oh(i+vec3(1,0,0)),f.x),mix(oh(i+vec3(0,1,0)),oh(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(oh(i+vec3(0,0,1)),oh(i+vec3(1,0,1)),f.x),mix(oh(i+vec3(0,1,1)),oh(i+vec3(1,1,1)),f.x),f.y),f.z); }
float ofbm(vec3 p){ float s=0.0,a=0.5; for(int i=0;i<4;i++){ s+=a*on3(p); p*=2.07; a*=0.5; } return s; }`;

function coreMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPower: { value: 0 }, uPulse: { value: 0 }, uViolet: { value: VIOLET }, uSilver: { value: SILVER } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = -mv.xyz; vP = position; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uPower, uPulse; uniform vec3 uViolet, uSilver;
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      ${NOISE}
      void main(){
        vec3 N = normalize(vN), V = normalize(vV);
        float ndv = clamp(dot(N,V), 0.0, 1.0);
        float rim = pow(1.0 - ndv, 3.2);
        // obsidiana: negro profundo con un reflejo nítido y otro difuso (se lee como esfera, no disco)
        vec3 L1 = normalize(vec3(-0.5, 0.75, 0.45)), L2 = normalize(vec3(0.7, 0.2, -0.3));
        vec3 H1 = normalize(L1 + V), H2 = normalize(L2 + V);
        float spec = pow(max(dot(N, H1), 0.0), 90.0) * 0.9 + pow(max(dot(N, H2), 0.0), 18.0) * 0.12;
        // remolinos de sombra que giran hacia el interior y vetas violetas que se encienden con la carga
        float a = atan(vP.z, vP.x);
        float sw = ofbm(vec3(a * 2.0 + uTime * 1.3 + vP.y * 3.0, vP.y * 4.0 - uTime * 0.7, ndv * 3.0));
        float vein = 1.0 - abs(ofbm(vP * 3.2 + vec3(0.0, uTime * 0.35, uTime * 0.2)) * 2.0 - 1.0);
        vein = pow(vein, 14.0) * smoothstep(0.35, 0.9, uPower);
        vec3 col = vec3(0.004, 0.002, 0.008) + uViolet * 0.05 * smoothstep(0.55, 0.85, sw) * (1.0 - ndv);
        float k = uPower * (1.0 + uPulse * 1.6);
        col += uViolet * vein * 0.9 * (0.5 + 0.5 * k);
        col += vec3(0.75, 0.72, 0.85) * spec;
        col += uViolet * rim * 1.1 * k;
        col += uSilver * pow(1.0 - ndv, 10.0) * 1.2 * k;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

function coronaMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPower: { value: 0 }, uPulse: { value: 0 }, uScale: { value: 5 }, uViolet: { value: VIOLET }, uSilver: { value: SILVER } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uPower, uPulse, uScale; uniform vec3 uViolet, uSilver;
      varying vec2 vUv;
      ${NOISE}
      void main(){
        vec2 q = (vUv - 0.5) * uScale;           // en radios del núcleo
        float r = length(q);
        float a = atan(q.y, q.x);
        float k = uPower * (1.0 + uPulse * 2.0);
        // anillo fino y brillante en el borde del disco, halo violeta y rayos irregulares
        float ring = exp(-pow((r - 1.02) / 0.045, 2.0));
        float halo = exp(-max(r - 1.0, 0.0) * 2.4) * smoothstep(0.92, 1.02, r);
        float rays = ofbm(vec3(a * 5.0, r * 1.5 - uTime * 0.8, uTime * 0.3));
        rays = smoothstep(0.45, 0.9, rays) * exp(-max(r - 1.0, 0.0) * 1.3) * smoothstep(0.95, 1.1, r);
        vec3 col = uSilver * ring * 0.55 + uViolet * (halo * 0.32 + rays * 0.7);
        col *= k;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

function wispMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPower: { value: 0 }, uViolet: { value: VIOLET } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    vertexShader: /* glsl */ `
      attribute vec3 aInfo; varying vec3 vInfo;
      void main(){ vInfo = aInfo; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uPower; uniform vec3 uViolet;
      varying vec3 vInfo;   // x: s a lo largo (1 = junto al núcleo), y: -1..1 a lo ancho, z: índice
      ${NOISE}
      void main(){
        float s = vInfo.x, w = vInfo.y;
        // humo que fluye hacia el núcleo, deshilachado en los bordes
        float flow = ofbm(vec3(s * 5.0 - uTime * 2.2 + vInfo.z * 3.1, w * 1.6, vInfo.z));
        float edge = 1.0 - smoothstep(0.25 + flow * 0.5, 1.0, abs(w));
        float ends = smoothstep(0.0, 0.3, s) * (1.0 - smoothstep(0.86, 1.0, s));
        float a = edge * ends * smoothstep(0.25, 0.65, flow + 0.25) * uPower;
        // humo casi negro; solo un filo violeta tenue junto al núcleo
        vec3 col = mix(vec3(0.008, 0.006, 0.014), uViolet * 0.35, smoothstep(0.7, 0.98, s) * 0.45 * (1.0 - abs(w)));
        gl_FragColor = vec4(col, clamp(a * 0.95, 0.0, 0.95));
      }`,
  });
}

const RIBBONS = 16, SEG = 18;

export class EclipseOrb {
  constructor(scene, { dot, light = true } = {}) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.renderOrder = 9;
    scene.add(this.group);
    this.core = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), coreMaterial());
    this.core.renderOrder = 9;
    this.core.userData.noAO = true;
    this.corona = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), coronaMaterial());
    this.corona.renderOrder = 10;
    // filamentos: tiras orientadas a cámara recalculadas en cada cuadro
    const n = RIBBONS * (SEG + 1) * 2;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const info = new Float32Array(n * 3);
    const idx = [];
    for (let k = 0; k < RIBBONS; k++) for (let i = 0; i <= SEG; i++) {
      const v = (k * (SEG + 1) + i) * 2;
      info.set([i / SEG, -1, k], v * 3); info.set([i / SEG, 1, k], v * 3 + 3);
      if (i < SEG) idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
    g.setAttribute('aInfo', new THREE.BufferAttribute(info, 3));
    g.setIndex(idx);
    this.wisps = new THREE.Mesh(g, wispMaterial());
    this.wisps.frustumCulled = false;
    this.wisps.renderOrder = 11;
    // motas: oscuras (normales) y chispas violetas (aditivas)
    const mkPts = (count, additive, color, size) => {
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
      const m = new THREE.PointsMaterial({ map: dot, color, size, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true, fog: false });
      const p = new THREE.Points(pg, m);
      p.frustumCulled = false;
      p.renderOrder = 12;
      return p;
    };
    this.flecks = mkPts(36, false, new THREE.Color(0.02, 0.015, 0.03), 0.03);
    this.sparks = mkPts(28, true, new THREE.Color(1.1, 0.55, 2.2), 0.022);
    this.motes = Array.from({ length: 64 }, (_, i) => ({ a: Math.random() * 6.28, b: Math.random() * 6.28, r: Math.random(), sp: 0.4 + Math.random() * 0.8, i }));
    // relámpagos breves sobre la superficie
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 10 * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.bolts = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: new THREE.Color(1.6, 1.1, 2.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.bolts.frustumCulled = false;
    this.bolts.renderOrder = 12;
    this.boltT = 0;
    this.group.add(this.core, this.corona);
    scene.add(this.wisps, this.flecks, this.sparks, this.bolts);
    this.light = light ? new THREE.PointLight('#b298ff', 0, 3.2, 2) : null;
    if (this.light) scene.add(this.light);
    this.ribbons = Array.from({ length: RIBBONS }, (_, k) => {
      const tilt = (k / RIBBONS - 0.5) * 2.2 + Math.sin(k * 7.3) * 0.4;
      const yaw = k * 2.39996;
      const ax = new THREE.Vector3(Math.sin(tilt) * Math.cos(yaw), Math.cos(tilt), Math.sin(tilt) * Math.sin(yaw)).normalize();
      const u = new THREE.Vector3(1, 0, 0).cross(ax);
      if (u.lengthSq() < 0.01) u.set(0, 0, 1).cross(ax);
      u.normalize();
      const v = new THREE.Vector3().crossVectors(ax, u);
      return { u, v, ph: k * 1.7, sp: 0.9 + (k % 3) * 0.35, len: 0.75 + ((k * 37) % 10) / 20, w: 0.5 + ((k * 13) % 7) / 10 };
    });
    this.center = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.radius = 0.02; this.power = 0; this.pulse = 0; this.time = 0;
    this.flying = false;
    this.visible = false;
    this.history = [];
    this.setVisible(false);
  }

  setVisible(v) {
    this.visible = v;
    this.group.visible = v; this.wisps.visible = v; this.flecks.visible = v; this.sparks.visible = v; this.bolts.visible = v;
    if (this.light && !v) this.light.intensity = 0;
  }
  hide() { if (this.visible) this.setVisible(false); this.history.length = 0; }

  // Esfera sobre la palma activa. s.chargeT: tiempo de carga; s.cast.launch: segundos desde que se soltó.
  follow(anim, s, dt, F) {
    const t = s.chargeT || 0;
    F.group.updateMatrixWorld(true);
    const m = F.group.matrixWorld;
    const palm = new THREE.Vector3().setFromMatrixPosition(m);
    const nrm = new THREE.Vector3().setFromMatrixColumn(m, 0).normalize();
    const r = ORB_PHASES.radiusAt(t);
    const bob = Math.sin(this.time * 3.1) * 0.006 * (1 + r * 6);
    const target = palm.addScaledVector(nrm, r * 1.05 + 0.022 + bob);
    if (s.cast && s.cast.launch != null) {
      const L = s.cast.launch;
      const dir = new THREE.Vector3(s.aim.x, s.aim.y, 0).normalize();
      this.fly(target.addScaledVector(dir, L * 9), dir.multiplyScalar(9), r * 0.85, 1, dt, Math.min(1, L / 0.3));
      return;
    }
    this.flying = false;
    this.center.copy(target);
    this.radius = r;
    this.power = ORB_PHASES.powerAt(t);
    // pulso de «lista» al llegar al eclipse y latido lento después
    this.pulse = t >= 3.0 ? Math.exp(-(t - 3.0) * 5) + 0.25 * Math.max(0, Math.sin((t - 3.0) * 5.7)) ** 6 : 0;
    this.phase = ORB_PHASES.phaseAt(t);
    if (!this.visible && t > 0.02) this.setVisible(true);
    this.time += dt;
  }

  // trail 0..1: la estela crece en los primeros instantes del vuelo (no atraviesa al lanzador)
  fly(pos, vel, radius, power, dt, trail = 1) {
    this.flying = true;
    this.trail = trail;
    this.center.copy(pos);
    this.vel.copy(vel);
    this.radius = radius; this.power = power; this.pulse = 0.2;
    this.time += dt;
    this.history.unshift(pos.clone());
    if (this.history.length > 24) this.history.length = 24;
    if (!this.visible) this.setVisible(true);
  }

  render(camera, dt) {
    if (!this.visible) return;
    const c = this.center, r = this.radius, T = this.time;
    this.core.position.copy(c);
    this.core.scale.setScalar(r);
    this.core.rotation.y = T * 0.7;
    const sc = 5.2;
    this.corona.position.copy(c);
    this.corona.quaternion.copy(camera.quaternion);
    this.corona.scale.setScalar(r * sc);
    for (const mat of [this.core.material, this.corona.material, this.wisps.material]) {
      mat.uniforms.uTime.value = T;
      mat.uniforms.uPower.value = this.power;
      if (mat.uniforms.uPulse) mat.uniforms.uPulse.value = this.pulse;
    }
    this.corona.material.uniforms.uScale.value = sc;
    // filamentos
    const cam = camera.position;
    const P = this.wisps.geometry.attributes.position.array;
    const tmp = new THREE.Vector3(), prev = new THREE.Vector3(), side = new THREE.Vector3(), tan = new THREE.Vector3(), view = new THREE.Vector3();
    const reach = this.flying ? 0 : lerp(2.2, 4.2, this.power);
    const dirF = this.flying ? this.vel.clone().normalize() : null;
    for (let k = 0; k < RIBBONS; k++) {
      const R = this.ribbons[k];
      const pts = [];
      for (let i = 0; i <= SEG; i++) {
        const s = i / SEG;
        let p;
        if (!this.flying) {
          const rho = r * (1.04 + (reach * R.len - 1.04) * Math.pow(1 - s, 1.25));
          const th = R.ph + T * R.sp * (1.2 + this.power) + (1 - s) * 2.6;
          p = tmp.copy(c).addScaledVector(R.u, Math.cos(th) * rho).addScaledVector(R.v, Math.sin(th) * rho);
          p.y += Math.sin(T * 1.7 + k + s * 4) * r * 0.25 * (1 - s);
        } else {
          // estela: hilos que se enroscan detrás del proyectil
          const back = (1 - s) * (0.55 + r * 7) * R.len * (this.trail ?? 1);
          const th = R.ph + T * 9 + (1 - s) * 5;
          const rho = r * (0.75 + 1.1 * (1 - s));
          const ax = dirF;
          const u = side.set(-ax.y, ax.x, 0).normalize();
          p = tmp.copy(c).addScaledVector(ax, -back).addScaledVector(u, Math.cos(th) * rho);
          p.z += Math.sin(th) * rho;
        }
        pts.push(p.clone());
      }
      for (let i = 0; i <= SEG; i++) {
        const p = pts[i];
        prev.copy(pts[Math.max(i - 1, 0)]);
        tan.copy(pts[Math.min(i + 1, SEG)]).sub(prev).normalize();
        view.copy(cam).sub(p).normalize();
        side.crossVectors(tan, view).normalize();
        const s = i / SEG;
        const w = r * R.w * (this.flying ? 1.2 : 0.95) * (0.25 + 0.75 * Math.sin(Math.PI * Math.pow(s, 0.75))) * (1 - 0.45 * s);
        const v = (k * (SEG + 1) + i) * 2;
        P[v * 3] = p.x - side.x * w; P[v * 3 + 1] = p.y - side.y * w; P[v * 3 + 2] = p.z - side.z * w;
        P[v * 3 + 3] = p.x + side.x * w; P[v * 3 + 4] = p.y + side.y * w; P[v * 3 + 5] = p.z + side.z * w;
      }
    }
    this.wisps.geometry.attributes.position.needsUpdate = true;
    // motas oscuras y chispas que caen hacia el núcleo
    const F = this.flecks.geometry.attributes.position.array, S = this.sparks.geometry.attributes.position.array;
    for (const m of this.motes) {
      m.r -= dt * m.sp * (0.6 + this.power);
      if (m.r <= 0) { m.r = 1; m.a = Math.random() * 6.28; m.b = Math.random() * 6.28; }
      const rr = r * (1.1 + m.r * (this.flying ? 2.5 : 3.2 + this.power * 2));
      const a = m.a + (1 - m.r) * 3, b = m.b;
      let x = Math.cos(a) * Math.sin(b) * rr, y = Math.cos(b) * rr * 0.8, z = Math.sin(a) * Math.sin(b) * rr;
      if (this.flying) { const back = m.r * 0.6; x -= this.vel.x / 9 * back; y -= this.vel.y / 9 * back; }
      if (m.i < 36) { F[m.i * 3] = c.x + x; F[m.i * 3 + 1] = c.y + y; F[m.i * 3 + 2] = c.z + z; }
      else { const j = m.i - 36; S[j * 3] = c.x + x * 0.8; S[j * 3 + 1] = c.y + y * 0.8; S[j * 3 + 2] = c.z + z * 0.8; }
    }
    this.flecks.geometry.attributes.position.needsUpdate = true;
    this.sparks.geometry.attributes.position.needsUpdate = true;
    this.flecks.material.size = clamp(r * 0.7, 0.014, 0.07);
    this.sparks.material.size = clamp(r * 0.35, 0.01, 0.04);
    this.sparks.material.opacity = 0.4 + this.power * 0.6;
    // relámpagos: se regeneran cada pocas centésimas desde la condensación
    this.boltT -= dt;
    const L = this.bolts.geometry.attributes.position.array;
    if (this.boltT <= 0) {
      this.boltT = 0.05 + Math.random() * 0.06;
      L.fill(0);
      const nb = this.power > 0.55 ? 3 : this.power > 0.3 ? 1 : 0;
      for (let b = 0; b < nb; b++) {
        let a = Math.random() * 6.28, e = (Math.random() - 0.5) * 2.4;
        let px = 0, py = 0, pz = 0;
        for (let i = 0; i < 10; i++) {
          const rr = r * (1.05 + Math.random() * 0.35 + i * 0.03);
          const nx = Math.cos(a) * Math.cos(e) * rr, ny = Math.sin(e) * rr, nz = Math.sin(a) * Math.cos(e) * rr;
          if (i > 0) L.set([px, py, pz, nx, ny, nz], (b * 10 + i) * 6);
          px = nx; py = ny; pz = nz;
          a += 0.12 + Math.random() * 0.12; e += (Math.random() - 0.5) * 0.35;
        }
      }
      this.bolts.geometry.attributes.position.needsUpdate = true;
    }
    this.bolts.position.copy(c);
    this.bolts.material.opacity = clamp(this.power * 1.3 - 0.3, 0, 1) * (0.6 + 0.4 * Math.random());
    if (this.light) {
      this.light.position.copy(c);
      this.light.intensity = (0.25 + this.power * 1.0) * (1 + this.pulse * 1.2) * (this.flying ? 0.6 : 1);
    }
  }
}
