// Utilidades numéricas compartidas por simulación, animación y render.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
export const smoothstep = (a, b, v) => {
  const t = invLerp(a, b, v);
  return t * t * (3 - 2 * t);
};
export const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
export const DEG = Math.PI / 180;

// Amortiguación independiente de la tasa de cuadros: acerca `a` a `b` con semivida `half` (s).
export const damp = (a, b, half, dt) => b + (a - b) * Math.pow(2, -dt / Math.max(half, 1e-5));

// Aproxima un valor hacia otro con velocidad máxima.
export const approach = (v, target, maxDelta) =>
  v < target ? Math.min(v + maxDelta, target) : Math.max(v - maxDelta, target);

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
export const easeInCubic = (t) => t * t * t;
export const easeOutBack = (t, s = 1.4) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);

// Ángulo más corto entre dos ángulos (rad).
export const angleDelta = (a, b) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

// Muelle crítico/semicrítico para movimiento secundario (estado: {x, v}).
export function springStep(state, target, freq, zeta, dt) {
  const w = 2 * Math.PI * freq;
  const f = 1 + 2 * dt * zeta * w;
  const oo = w * w;
  const hoo = dt * oo;
  const hhoo = dt * hoo;
  const detInv = 1 / (f + hhoo);
  const detX = f * state.x + dt * state.v + hhoo * target;
  const detV = state.v + hoo * (target - state.x);
  state.x = detX * detInv;
  state.v = detV * detInv;
  return state.x;
}
