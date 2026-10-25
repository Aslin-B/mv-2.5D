import * as THREE from 'three';

// Cabello con tarjetas de mechón (la técnica habitual del pelo en tiempo real): cintas finas que
// siguen curvas guía sobre el cuero cabelludo, con una textura de hebras generada por código y
// recorte alfa con cobertura por muestreo (bordes suaves con MSAA).

// Textura de hebras: RGB = variación de tono por hebra; A = cobertura (las puntas se afinan).
export function strandTexture(w = 128, h = 512, seed = 1) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  // núcleo del mechón: cobertura media en el centro de la tarjeta (el mechón se lee con cuerpo,
  // no como hebras sueltas) que se desvanece hacia los bordes y la punta
  const core = ctx.createLinearGradient(0, 0, w, 0);
  core.addColorStop(0, 'rgba(110,110,110,0)');
  core.addColorStop(0.3, 'rgba(110,110,110,0.18)');
  core.addColorStop(0.5, 'rgba(120,120,120,0.26)');
  core.addColorStop(0.7, 'rgba(110,110,110,0.18)');
  core.addColorStop(1, 'rgba(110,110,110,0)');
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, w, h * 0.8);
  const fade = ctx.createLinearGradient(0, h * 0.6, 0, h);
  ctx.globalCompositeOperation = 'destination-out';
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, h * 0.6, w, h * 0.4);
  ctx.globalCompositeOperation = 'source-over';
  // hebras agrupadas en mechones que se juntan hacia la punta: entre mechones queda hueco (la
  // tarjeta no se lee como una cinta maciza)
  const clumps = 9;
  for (let q = 0; q < clumps; q++) {
    const cu = 0.1 + 0.8 * ((q + 0.2 + rnd() * 0.6) / clumps);
    const cw = 0.05 + rnd() * 0.07;
    const clen = 0.7 + rnd() * 0.3;
    const cph = rnd() * 6.28;
    const ns = 18 + Math.floor(rnd() * 16);
    for (let i = 0; i < ns; i++) {
      const off = (rnd() - 0.5) * 2 * cw;
      const len = clen * (0.75 + rnd() * 0.25);
      const width = 0.5 + rnd() * 1.0;
      const tone = 0.45 + rnd() * 0.65;
      const ph = rnd() * 6.28, amp = 0.4 + rnd() * 1.2;
      ctx.beginPath();
      const steps = 40;
      for (let k = 0; k <= steps; k++) {
        const v = (k / steps) * len;
        // el mechón se estrecha hacia la punta y ondula como un todo
        const squeeze = 1 - 0.75 * Math.pow(v / clen, 1.5);
        const x = (cu + off * squeeze) * w + Math.sin(v * 5 + cph) * 2.5 + Math.sin(v * 9 + ph) * amp;
        const y = v * h;
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      const g = ctx.createLinearGradient(0, 0, 0, len * h);
      const t = Math.round(Math.min(1, tone) * 255);
      g.addColorStop(0, `rgba(${t},${t},${t},1)`);
      g.addColorStop(0.8, `rgba(${t},${t},${t},0.95)`);
      g.addColorStop(1, `rgba(${t},${t},${t},0)`);
      ctx.strokeStyle = g;
      ctx.lineWidth = width;
      ctx.stroke();
    }
  }
  // algunas hebras sueltas entre mechones
  for (let i = 0; i < 24; i++) {
    const u = 0.08 + rnd() * 0.84, len = 0.4 + rnd() * 0.5, tone = 0.5 + rnd() * 0.6, ph = rnd() * 6.28;
    ctx.beginPath();
    for (let k = 0; k <= 30; k++) {
      const v = (k / 30) * len;
      const x = u * w + Math.sin(v * 7 + ph) * 2, y = v * h;
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    const t = Math.round(Math.min(1, tone) * 255);
    ctx.strokeStyle = `rgba(${t},${t},${t},0.9)`;
    ctx.lineWidth = 0.6 + rnd() * 0.6;
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// guides: [{ pts: [[x,y,z]...] raíz→punta, w0, w1, nrm: (p) => [nx,ny,nz] normal del volumen }]
// origin: punto que se resta (espacio local del hueso). Devuelve la geometría de todas las cintas.
export function hairCardGeometry(guides, origin = [0, 0, 0], seg = 10) {
  const pos = [], nor = [], uv = [], col = [], idx = [];
  const P = new THREE.Vector3(), T = new THREE.Vector3(), N = new THREE.Vector3(), S = new THREE.Vector3(), B = new THREE.Vector3();
  let gi = 0;
  for (const g of guides) {
    const curve = new THREE.CatmullRomCurve3(g.pts.map((p) => new THREE.Vector3(...p)));
    const base = pos.length / 3;
    const tone = g.tone ?? 1;
    // cada mechón se inclina un poco sobre su eje (no todas las tarjetas planas sobre el volumen):
    // rompe el brillo en hebras en lugar de una lámina uniforme
    const h = Math.sin(++gi * 12.9898) * 43758.5453;
    const r1 = h - Math.floor(h), r2 = (h * 7.13) - Math.floor(h * 7.13);
    const tk = g.tilt ?? 1;
    const tilt0 = (r1 - 0.5) * 1.1 * tk, tiltA = (0.25 + r2 * 0.35) * tk, tiltP = r2 * 6.28;
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      curve.getPointAt(t, P);
      curve.getTangentAt(t, T);
      N.set(...g.nrm([P.x, P.y, P.z]));
      N.addScaledVector(T, -N.dot(T));
      if (N.lengthSq() < 1e-8) N.set(0, 0, 1);
      N.normalize();
      B.crossVectors(T, N);
      const a = tilt0 + Math.sin(t * 5 + tiltP) * tiltA;
      // normal y anchura giradas alrededor de la tangente
      N.multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a));
      S.crossVectors(T, N).normalize();
      const w = (g.w0 + (g.w1 - g.w0) * Math.pow(t, 0.8)) * 0.5;
      for (const k of [-1, 1]) {
        pos.push(P.x + S.x * w * k - origin[0], P.y + S.y * w * k - origin[1], P.z + S.z * w * k - origin[2]);
        // normal de tubo: se curva hacia los bordes del mechón (sombreado redondo, no una cinta)
        const ck = Math.cos(0.75), sk = Math.sin(0.75) * k;
        nor.push(N.x * ck + S.x * sk, N.y * ck + S.y * sk, N.z * ck + S.z * sk);
        uv.push((k + 1) * 0.5 * (g.uw ?? 1) + (g.u0 ?? 0), 1 - t);
        // raíces más oscuras (oclusión dentro del volumen del pelo)
        const ao = 0.55 + 0.45 * Math.min(1, t * 2.5);
        col.push(tone * ao, tone * ao, tone * ao);
      }
      if (i < seg) {
        const a0 = base + i * 2;
        idx.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  // tangentes explícitas (eje u, a través del mechón) para el brillo anisótropo
  geo.computeTangents();
  geo.computeBoundingSphere();
  return geo;
}

export function hairMaterial(tex, color = '#2a211b') {
  // especular teñido del propio pelo (castaño) y poco reflejo del entorno: en los bordes rasantes
  // las tarjetas no se vuelven grises
  // brillo anisótropo: la banda de luz se alarga a través de las hebras (eje u de la tarjeta)
  const m = new THREE.MeshPhysicalMaterial({
    map: tex, color, vertexColors: true, roughness: 0.48, metalness: 0, side: THREE.DoubleSide,
    alphaTest: 0.3, alphaToCoverage: true, envMapIntensity: 0.25,
    specularIntensity: 0.34, specularColor: new THREE.Color('#b08a6a'),
    anisotropy: 0.75, anisotropyRotation: 0,
    sheen: 0.25, sheenColor: new THREE.Color('#3a2a20'), sheenRoughness: 0.4,
  });
  m.customProgramCacheKey = () => 'hair-v3';
  return m;
}
