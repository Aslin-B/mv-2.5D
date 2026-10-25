import * as THREE from 'three';

// Material PBR estándar de Three.js ampliado con parámetros por vértice:
// surf = (rugosidad, metalicidad, patrón, desgaste). El patrón genera relieve procedural
// (acolchado, cuero, tejido, cabello, metal martillado) en espacio de objeto, estable al deformarse.
// No es dispersión subsuperficial ni un sombreador de piel especializado.

// Luz de contorno compartida por los personajes (dirección en espacio de vista y color/intensidad
// por zona). Imita la luz de recorte de escena para separar las siluetas del fondo (biblia §4.2).
export const CHAR_EDGE = { color: { value: new THREE.Color(0, 0, 0) }, dir: { value: new THREE.Vector3(0.45, 0.9, 0).normalize() } };

export const PATTERN = { skin: 0, quilt: 1, leather: 2, cloth: 3, hair: 4, metal: 5, plain: 6, wood: 7, glow: 8, enamel: 9, ornate: 10, brocade: 11, embossed: 12 };

const NOISE = /* glsl */ `
float h3(vec3 p){ p = fract(p*0.3183099+vec3(0.71,0.113,0.419)); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h3(i+vec3(0,0,0)),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm3(vec3 p){ float s=0.0, a=0.5; for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.03; a*=0.5; } return s; }
// Filigrana de volutas (Truchet de cuartos de círculo) proyectada en los tres planos del objeto.
float h2f(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float filig2(vec2 p, float w){
  vec2 i = floor(p); vec2 f = fract(p);
  if (h2f(i) > 0.5) f.x = 1.0 - f.x;
  float d = min(abs(length(f) - 0.5), abs(length(f - 1.0) - 0.5));
  float aa = max(fwidth(p.x) + fwidth(p.y), 1e-4) * 0.7;
  return 1.0 - smoothstep(w - aa, w + aa, d);
}
float filig3(vec3 p, vec3 n, float w){
  vec3 b = pow(abs(n), vec3(4.0)); b /= (b.x + b.y + b.z);
  return filig2(p.yz, w) * b.x + filig2(p.xz + 7.3, w) * b.y + filig2(p.xy + 3.1, w) * b.z;
}
`;

const PERTURB = /* glsl */ `
vec3 cmPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
  vec3 vSigmaX = normalize(dFdx(surf_pos.xyz));
  vec3 vSigmaY = normalize(dFdy(surf_pos.xyz));
  vec3 vN = surf_norm;
  vec3 R1 = cross(vSigmaY, vN);
  vec3 R2 = cross(vN, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDirection;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}
float cmHeight(vec3 p, float pat, float wear){
  float h = 0.0;
  if (pat < 0.5) {               // piel: variación muy suave
    h = fbm3(p*160.0)*0.25;
  } else if (pat < 1.5) {        // gambesón acolchado: canales verticales + puntadas
    float ang = atan(p.x, p.z + 0.02) * 9.0;
    float ch = abs(fract(ang) - 0.5);
    float st = abs(fract(p.y * 13.0) - 0.5);
    h = smoothstep(0.0, 0.22, ch) * 0.9 + smoothstep(0.0, 0.12, st) * 0.25 + fbm3(p*220.0)*0.15;
  } else if (pat < 2.5) {        // cuero: grano + arrugas
    h = fbm3(p*260.0)*0.5 + smoothstep(0.55,0.8,fbm3(p*vec3(30.0,90.0,30.0)))*0.5;
  } else if (pat < 3.5) {        // tejido de lino/lana: trama
    h = (sin(p.x*900.0)*sin(p.y*900.0+p.z*900.0))*0.12 + fbm3(p*80.0)*0.5;
  } else if (pat < 4.5) {        // cabello: mechones
    h = sin((p.x*0.6 + p.z*1.0)*620.0 + fbm3(p*40.0)*12.0)*0.35 + fbm3(p*vec3(300.0,60.0,300.0))*0.4;
  } else if (pat < 5.5) {        // metal martillado + arañazos
    h = fbm3(p*90.0)*0.35 + smoothstep(0.92,1.0,vnoise(p*vec3(800.0,40.0,800.0)))*-0.3*wear;
  } else if (pat < 6.5) {
    h = 0.0;
  } else if (pat < 7.5) {         // madera
    h = sin(p.y*400.0 + fbm3(p*30.0)*20.0)*0.3;
  } else if (pat < 8.5) {         // runa luminosa: lisa
    h = 0.0;
  } else if (pat < 9.5) {         // esmalte de placa: lisura con micro-ondulación de forja
    h = fbm3(p*60.0)*0.12;
  } else if (pat < 10.5) {        // metal grabado
    h = fbm3(p*90.0)*0.25;
  } else if (pat < 11.5) {        // brocado
    h = (sin(p.x*900.0)*sin(p.y*900.0+p.z*900.0))*0.1 + fbm3(p*80.0)*0.3;
  } else {                        // cuero repujado
    h = fbm3(p*260.0)*0.45;
  }
  return h;
}
`;

export function makeCharMaterial({ bumpScale = 1.0, skinned = true, envIntensity = 1.0, side = THREE.FrontSide } = {}) {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1, metalness: 1, side, envMapIntensity: envIntensity,
  });
  mat.userData.bumpScale = { value: bumpScale };
  mat.userData.rimColor = { value: new THREE.Color(0, 0, 0) };
  mat.userData.edgeTint = { value: new THREE.Color(1, 1, 1) };
  mat.userData.glow = { value: 1.0 };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.cmBump = mat.userData.bumpScale;
    shader.uniforms.cmRim = mat.userData.rimColor;
    shader.uniforms.cmEdge = CHAR_EDGE.color;
    shader.uniforms.cmEdgeDir = CHAR_EDGE.dir;
    shader.uniforms.cmEdgeTint = mat.userData.edgeTint;
    shader.uniforms.cmGlow = mat.userData.glow;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 surf;
varying vec4 vSurf;
varying vec3 vObjPos;
varying vec3 vObjN;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vSurf = surf;
vObjPos = position;
vObjN = normal;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float cmBump;
uniform vec3 cmRim;
uniform vec3 cmEdge;
uniform vec3 cmEdgeDir;
uniform vec3 cmEdgeTint;
uniform float cmGlow;
varying vec4 vSurf;
varying vec3 vObjPos;
varying vec3 vObjN;
float cmOrn = 0.0;
${NOISE}
${PERTURB}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
// esmalte de placa: moteado de forja a baja frecuencia (rompe el aspecto de plástico liso)
if (vSurf.z > 8.5 && vSurf.z < 9.5) diffuseColor.rgb *= 0.88 + 0.2 * fbm3(vObjPos * 22.0);
// metal grabado con hilo de plata (10), brocado con hilo de plata (11), cuero repujado (12).
// La escala va en el canal de desgaste (w = celdas por metro / 1000).
if (vSurf.z > 9.5) {
  float sc = max(vSurf.w, 0.01) * 1000.0;
  vec3 on = normalize(vObjN);
  vec3 q = vObjPos * sc;
  // motivos dispersos (no un papel pintado continuo) y, de lejos, cobertura media en lugar de
  // líneas que parpadean
  float motif = smoothstep(0.4, 0.56, fbm3(q * 0.23 + 3.7));
  float far = smoothstep(0.16, 0.42, length(fwidth(q)));
  if (vSurf.z < 10.5) {
    float f = filig3(q, on, 0.07);
    float groove = filig3(q, on, 0.14) - f;
    f = mix(f, 0.08, far) * motif; groove = mix(groove, 0.08, far) * motif;
    cmOrn = f;
    diffuseColor.rgb = mix(diffuseColor.rgb * (1.0 - groove * 0.5), vec3(0.42, 0.405, 0.44), f);
  } else if (vSurf.z < 11.5) {
    float f = mix(filig3(q, on, 0.065), 0.06, far) * motif;
    cmOrn = f;
    diffuseColor.rgb = mix(diffuseColor.rgb * (0.85 + 0.3 * fbm3(vObjPos * 400.0)), vec3(0.34, 0.32, 0.38), f);
  } else {
    float f = mix(filig3(q, on, 0.09), 0.16, far) * (0.4 + 0.6 * motif);
    cmOrn = f;
    diffuseColor.rgb *= 1.0 - f * 0.35;
  }
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = clamp(vSurf.x + (fbm3(vObjPos*70.0)-0.5)*0.12, 0.04, 1.0);
if (vSurf.z > 9.5 && vSurf.z < 11.5) roughnessFactor = mix(roughnessFactor, 0.32, cmOrn);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor = vSurf.y;
if (vSurf.z > 9.5 && vSurf.z < 11.5) metalnessFactor = mix(metalnessFactor, 1.0, cmOrn);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  float hgt = cmHeight(vObjPos, vSurf.z, vSurf.w);
  vec2 dH = vec2(dFdx(hgt), dFdy(hgt));
  float fw = length(fwidth(vObjPos)) * 300.0;
  float fade = 1.0 - smoothstep(0.6, 2.4, fw * (vSurf.z > 3.5 && vSurf.z < 4.5 ? 0.5 : 1.0));
  float pk = (vSurf.z > 0.5 && vSurf.z < 1.5) ? 2.2 : 1.0;   // el acolchado se lee más marcado
  // relieve del adorno (grabado en el metal, hilo en alto en el brocado y el repujado)
  if (vSurf.z > 9.5) dH += vec2(dFdx(cmOrn), dFdy(cmOrn)) * (vSurf.z < 10.5 ? -0.5 : 0.6);
  normal = cmPerturb(-vViewPosition, normal, dH * 0.018 * cmBump * fade * pk, faceDirection);
}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  // Destello de impacto / contorno (feedback de golpe), no una luz de escena.
  float nv = clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0);
  float fres = pow(1.0 - nv, 2.0);
  // casi todo en el borde: el interior conserva el color y el material (no un maniquí blanco)
  totalEmissiveRadiance += cmRim * 1.1 * fres * fres;
  // contorno direccional: más fuerte en los bordes orientados hacia la luz de recorte
  float edge = pow(1.0 - nv, 4.0) * clamp(dot(normal, cmEdgeDir) * 0.9 + 0.2, 0.0, 1.0);
  totalEmissiveRadiance += cmEdge * cmEdgeTint * edge;
  // runas y ranuras pintadas con el patrón «glow»: emiten su propio color (alimentan el bloom)
  if (vSurf.z > 7.5 && vSurf.z < 8.5) totalEmissiveRadiance += vColor.rgb * cmGlow;
}`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
// saneado HDR: una luz puntual muy cercana sobre una placa pulida podía dar valores no finitos en
// el búfer de media precisión, y el bloom los esparcía como un halo magenta alrededor de Aren
gl_FragColor.rgb = (any(isnan(gl_FragColor.rgb)) || any(isinf(gl_FragColor.rgb))) ? vec3(0.0) : min(gl_FragColor.rgb, vec3(48.0));`);
  };
  mat.customProgramCacheKey = () => 'charmat-v9';
  return mat;
}

// Copia independiente (mismos parámetros, uniformes propios: destello de impacto por instancia).
export function cloneCharMaterial(m) {
  const c = makeCharMaterial({ bumpScale: m.userData.bumpScale.value, envIntensity: m.envMapIntensity, side: m.side });
  c.userData.glow.value = m.userData.glow.value;
  return c;
}
