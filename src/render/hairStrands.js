import * as THREE from 'three';

// Cabello por hebras para los planos cortos: cada curva guía (las mismas de las tarjetas) se
// reparte en decenas de hebras finas que llenan el volumen del mechón, se juntan hacia la punta y
// se encrespan un poco. Cada hebra es una cinta de ~0,7 mm que el sombreador de vértices orienta
// hacia la cámara; la normal de iluminación es la de un cilindro (perpendicular a la hebra, hacia el
// observador), mezclada con la normal del volumen del pelo para que la melena tenga luz y sombra.
// Usa el material estándar de three.js: recibe las luces y las sombras de la escena.

export function hairStrandGeometry(guides, origin = [0, 0, 0], { perGuide = 18, seg = 12, seed = 5, halfW = 0.00034 } = {}) {
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  const pos = [], tan = [], out = [], strand = [], col = [], idx = [];
  const P = new THREE.Vector3(), T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3();
  const Q = new THREE.Vector3(), prevQ = new THREE.Vector3(), tq = new THREE.Vector3();
  for (const g of guides) {
    const curve = new THREE.CatmullRomCurve3(g.pts.map((p) => new THREE.Vector3(...p)));
    // marco a lo largo de la guía (normal del volumen y lado del mechón)
    const frames = [];
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      curve.getPointAt(t, P);
      curve.getTangentAt(t, T);
      N.set(...g.nrm([P.x, P.y, P.z]));
      N.addScaledVector(T, -N.dot(T));
      if (N.lengthSq() < 1e-8) N.set(0, 0, 1);
      N.normalize();
      B.crossVectors(T, N).normalize();
      frames.push({ P: P.clone(), N: N.clone(), B: B.clone() });
    }
    const n = Math.max(3, Math.round(perGuide * (g.density ?? 1) * (0.6 + g.w0 / 0.03 * 0.4)));
    for (let k = 0; k < n; k++) {
      // posición de la hebra en la sección del mechón: ancho del mechón por el lado, menos grosor
      const a = (rnd() - 0.5) * g.w0, b = (rnd() - 0.5) * g.w0 * 0.35;
      const clump = 0.35 + rnd() * 0.45;               // cuánto se junta en la punta
      const len = 0.82 + rnd() * 0.18;                 // hebras algo más cortas que la guía
      const fz = rnd() * 6.28, fa = 0.0006 + rnd() * 0.0016;
      // hebras sueltas más claras (reflejos castaños) entre otras más oscuras
      const tone = Math.min(1.25, (g.tone ?? 1) * (0.65 + rnd() * 0.4) * (rnd() < 0.1 ? 1.35 : 1));
      const base = pos.length / 3;
      for (let i = 0; i <= seg; i++) {
        const u = (i / seg) * len;
        const fi = u * seg, i0 = Math.min(seg - 1, Math.floor(fi)), f = fi - i0;
        const F0 = frames[i0], F1 = frames[i0 + 1];
        const sq = 1 - (1 - clump) * Math.pow(u, 1.3);
        const fr = Math.sin(u * 23 + fz) * fa * u;
        Q.copy(F0.P).lerp(F1.P, f);
        tq.copy(F0.B).lerp(F1.B, f);
        Q.addScaledVector(tq, a * sq + fr);
        tq.copy(F0.N).lerp(F1.N, f);
        Q.addScaledVector(tq, b * sq + Math.cos(u * 17 + fz) * fa * 0.6 * u);
        if (i === 0) prevQ.copy(Q);
        // tangente: hacia el siguiente punto (o desde el anterior en la punta)
        const tn = i === 0 ? null : Q.clone().sub(prevQ).normalize();
        const w = halfW * (1 - 0.75 * Math.pow(i / seg, 1.5));
        const ao = 0.3 + 0.7 * Math.min(1, (i / seg) * 2.2);
        for (const sd of [-1, 1]) {
          pos.push(Q.x - origin[0], Q.y - origin[1], Q.z - origin[2]);
          out.push(tq.x, tq.y, tq.z);
          strand.push(sd, w);
          col.push(tone * ao, tone * ao, tone * ao);
          tan.push(0, 0, 0);
        }
        if (tn) {
          // la tangente del vértice anterior y la de este
          const v = (base + i * 2) * 3, vp = (base + (i - 1) * 2) * 3;
          for (const o of [v, v + 3]) { tan[o] = tn.x; tan[o + 1] = tn.y; tan[o + 2] = tn.z; }
          if (i === 1) for (const o of [vp, vp + 3]) { tan[o] = tn.x; tan[o + 1] = tn.y; tan[o + 2] = tn.z; }
        }
        prevQ.copy(Q);
        if (i < seg) {
          const a0 = base + i * 2;
          idx.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3);
        }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(out, 3));
  geo.setAttribute('aTan', new THREE.Float32BufferAttribute(tan, 3));
  geo.setAttribute('aStrand', new THREE.Float32BufferAttribute(strand, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  geo.boundingSphere.radius += 0.01;
  return geo;
}

export function hairStrandMaterial(color = '#2a201a') {
  // brillo especular contenido y teñido: de lejos, miles de hebras de cara a la cámara no deben
  // sumar un velo gris
  const m = new THREE.MeshPhysicalMaterial({ color, vertexColors: true, roughness: 0.46, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.06, specularIntensity: 0.3, specularColor: new THREE.Color('#9c7458') });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec3 aTan;
attribute vec2 aStrand;`)
      .replace('#include <beginnormal_vertex>', `
vec3 hCam = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
vec3 hV = normalize(hCam - position);
vec3 hT = normalize(aTan + vec3(1e-6));
// normal de cilindro hacia el observador, mezclada con la del volumen del mechón
vec3 hN = normalize(hV - hT * dot(hV, hT));
vec3 objectNormal = normalize(mix(hN, normal, 0.5));`)
      .replace('#include <begin_vertex>', `
vec3 transformed = vec3(position) + normalize(cross(hT, hV)) * aStrand.x * aStrand.y;`);
  };
  m.customProgramCacheKey = () => 'hair-strands-v2';
  return m;
}
