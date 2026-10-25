// Capa de juego «adelantada» en profundidad.
//
// Los bloques del nivel tienen cuerpo en profundidad: su cara delantera está a z = 1,3 y el plano de
// juego a z = 0. Al pasar junto a un escalón o una pared, las piernas, los brazos o el abrigo de Aren
// quedaban detrás de esa cara y se cortaban en seco, como si atravesaran la piedra. Es el problema
// clásico del 2.5D, y la solución habitual es la misma: los personajes y sus efectos se prueban contra
// el búfer de profundidad como si estuvieran algo más cerca de la cámara de lo que están.
//
// Solo se toca la profundidad del vértice (gl_Position.z): la posición en pantalla, la luz, las sombras
// y la niebla no cambian. El adelanto es de 2 m en vista (lo justo para pasar la cara delantera de
// escalones y zócalos, que llega a z = 1,75) y nunca más del 16 % de la distancia a la cámara, de
// modo que los primeros planos de verdad (columnas a z ≥ 2,8) siguen tapando al personaje.

export const DEPTH_PULL = { value: 2.0 };

const PULL = /* glsl */ `
  {
    float dpW = gl_Position.w;
    float dpZ = -dpW + min(uDepthPull, dpW * 0.16);
    float dpClip = projectionMatrix[2][2] * dpZ + projectionMatrix[3][2];
    gl_Position.z = dpClip / -dpZ * dpW;
  }
`;

const MAIN = /void\s+main\s*\(\s*(void)?\s*\)/;

export function applyDepthPull(material) {
  if (!material || material.userData.depthPull) return material;
  const prevCompile = material.onBeforeCompile;
  // la clave por defecto es el texto de onBeforeCompile: se fija antes de envolverlo
  const prevKey = material.customProgramCacheKey();
  material.onBeforeCompile = function (shader, renderer) {
    prevCompile.call(this, shader, renderer);
    shader.uniforms.uDepthPull = DEPTH_PULL;
    let vs = shader.vertexShader;
    if (!MAIN.test(vs)) { console.warn('depthPull: sombreador sin main()'); return; }
    vs = vs.replace(MAIN, 'void dpMain()');
    shader.vertexShader = `uniform float uDepthPull;\n${vs}\nvoid main() {\n  dpMain();\n${PULL}}\n`;
  };
  material.customProgramCacheKey = () => prevKey + '|dp1';
  material.userData.depthPull = true;
  material.needsUpdate = true;
  return material;
}

// Copia de un material del escenario para un actor (sin arrastrar al resto del nivel).
function ownCopy(m) {
  const c = m.clone();
  c.onBeforeCompile = m.onBeforeCompile;
  const key = m.customProgramCacheKey();
  c.customProgramCacheKey = () => key;
  return c;
}

// Adelanta todos los materiales de un objeto y sus hijos. `shared` son materiales del escenario
// que el objeto usa prestados: se sustituyen por una copia propia antes de tocarlos.
export function pullTree(root, shared = null) {
  const swap = new Map();
  root.traverse((o) => {
    if (!o.material) return;
    const fix = (m) => {
      if (shared && shared.has(m)) {
        if (!swap.has(m)) swap.set(m, applyDepthPull(ownCopy(m)));
        return swap.get(m);
      }
      return applyDepthPull(m);
    };
    o.material = Array.isArray(o.material) ? o.material.map(fix) : fix(o.material);
  });
  return swap;
}
