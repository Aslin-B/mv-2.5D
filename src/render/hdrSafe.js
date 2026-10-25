// Saneado HDR. En GPU de Apple (Safari) una operación indefinida en un sombreador (potencia de base
// negativa, normalizar un vector nulo) devuelve NaN, y el desenfoque del bloom lo esparcía hasta
// dejar la pantalla en negro y parpadeando. La prueba mira los bits del exponente para que la
// optimización matemática del compilador no pueda eliminarla. El tope (512) queda muy por encima
// de lo que da la escena (el disco del sol ronda 30) y evita que un valor desbocado pero finito
// convierta el bloom en un fogonazo blanco.
export const HDR_SAFE = /* glsl */ `
bool hdrBad(float x){ return (floatBitsToUint(x) & 0x7f800000u) == 0x7f800000u; }
vec3 hdrSafe(vec3 c){
  if (hdrBad(c.r) || hdrBad(c.g) || hdrBad(c.b)) return vec3(0.0);
  return clamp(c, vec3(0.0), vec3(512.0));
}
`;
