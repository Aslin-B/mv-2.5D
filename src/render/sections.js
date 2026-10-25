import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Sección del plano de juego: todo lo que es colisión (suelos, muros, techos) se dibuja como una
// masa negra delante de la escena, con un bisel iluminado en los bordes superiores expuestos.
// Separa con claridad «dónde se puede estar» del decorado iluminado del fondo y enmarca cada sala
// (principio de lectura del género: el terreno de juego es una silueta, el fondo cuenta la historia).

export const SECTION_Z = 1.92;

function quad(x0, y0, x1, y1, z) {
  const g = new THREE.PlaneGeometry(x1 - x0, y1 - y0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, z);
  return g;
}

// Tramos de [a, b] no cubiertos por los intervalos dados.
function uncovered(a, b, covers) {
  let segs = [[a, b]];
  for (const [c0, c1] of covers) {
    const next = [];
    for (const [s0, s1] of segs) {
      if (c1 <= s0 || c0 >= s1) { next.push([s0, s1]); continue; }
      if (c0 > s0) next.push([s0, c0]);
      if (c1 < s1) next.push([c1, s1]);
    }
    segs = next;
  }
  return segs.filter(([s0, s1]) => s1 - s0 > 0.05);
}

export function buildSections(solids, { bevelMat, z = SECTION_Z, bottom = -40 } = {}) {
  const list = solids.filter((s) => s.section !== false);
  const fill = [];
  const bevel = [];
  const top = (s) => s.sectionTop ?? s.y1;
  for (const s of list) {
    const y0 = s.y0 <= -5.9 ? bottom : s.y0; // los suelos se prolongan hasta el fondo del encuadre
    fill.push(quad(s.x0, y0, s.x1, top(s), z));
    // sectionTop: la masa negra se corta por debajo para dejar ver el modelado iluminado de encima
    if (s.sectionTop !== undefined) continue;
    // bisel en el borde superior donde no lo tapa otra masa
    const covers = list.filter((o) => o !== s && o.y0 <= s.y1 + 1e-3 && top(o) > s.y1 + 1e-3).map((o) => [o.x0, o.x1]);
    for (const [a, b] of uncovered(s.x0, s.x1, covers)) {
      const g = new THREE.BufferGeometry();
      const t = s.kind === 'oneway' ? 0.035 : 0.055;
      // chaflán inclinado hacia arriba y hacia la cámara: recoge la luz cenital
      const p = [a, s.y1 - t, z + 0.004, b, s.y1 - t, z + 0.004, b, s.y1, z - 0.05, a, s.y1, z - 0.05];
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      g.setIndex([0, 1, 2, 0, 2, 3]);
      g.computeVertexNormals();
      bevel.push(g);
    }
  }
  const group = new THREE.Group();
  // Se dibuja después del decorado opaco y sin prueba de profundidad (tapa siempre el decorado),
  // pero antes que los personajes (orden 3): la perspectiva nunca deja a Aren tapado por el negro.
  const black = new THREE.Mesh(mergeGeometries(fill), new THREE.MeshBasicMaterial({ color: '#030304', fog: false, depthTest: false, depthWrite: false }));
  black.renderOrder = 1;
  black.userData.noAO = true;
  group.add(black);
  if (bevel.length) {
    const m = new THREE.Mesh(mergeGeometries(bevel), bevelMat || new THREE.MeshStandardMaterial({ color: '#b9ab98', roughness: 0.45, depthTest: false, depthWrite: false }));
    m.renderOrder = 2;
    m.userData.noAO = true;
    group.add(m);
  }
  return group;
}
