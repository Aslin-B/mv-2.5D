import * as THREE from 'three';

// Material PBR estándar de Three.js ampliado con parámetros por vértice:
// surf = (rugosidad, metalicidad, patrón, desgaste). El patrón genera relieve procedural
// (acolchado, cuero, tejido, cabello, metal martillado) en espacio de objeto, estable al deformarse.
// No es dispersión subsuperficial ni un sombreador de piel especializado.

// Luz de contorno compartida por los personajes (dirección en espacio de vista y color/intensidad
// por zona). Imita la luz de recorte de escena para separar las siluetas del fondo (biblia §4.2).
export const CHAR_EDGE = { color: { value: new THREE.Color(0, 0, 0) }, dir: { value: new THREE.Vector3(0.45, 0.9, 0).normalize() } };

export const PATTERN = { skin: 0, quilt: 1, leather: 2, cloth: 3, hair: 4, metal: 5, plain: 6, wood: 7, glow: 8, enamel: 9 };

const NOISE = /* glsl */ `
float h3(vec3 p){ p = fract(p*0.3183099+vec3(0.71,0.113,0.419)); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h3(i+vec3(0,0,0)),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm3(vec3 p){ float s=0.0, a=0.5; for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.03; a*=0.5; } return s; }
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
  } else {                        // esmalte de placa: lisura con micro-ondulación de forja
    h = fbm3(p*60.0)*0.12;
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
varying vec3 vObjPos;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vSurf = surf;
vObjPos = position;`);
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
${NOISE}
${PERTURB}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = clamp(vSurf.x + (fbm3(vObjPos*70.0)-0.5)*0.12, 0.04, 1.0);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor = vSurf.y;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  float hgt = cmHeight(vObjPos, vSurf.z, vSurf.w);
  vec2 dH = vec2(dFdx(hgt), dFdy(hgt));
  float fw = length(fwidth(vObjPos)) * 300.0;
  float fade = 1.0 - smoothstep(0.6, 2.4, fw * (vSurf.z > 3.5 && vSurf.z < 4.5 ? 0.5 : 1.0));
  float pk = (vSurf.z > 0.5 && vSurf.z < 1.5) ? 2.2 : 1.0;   // el acolchado se lee más marcado
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
}`);
  };
  mat.customProgramCacheKey = () => 'charmat-v5';
  return mat;
}

// Copia independiente (mismos parámetros, uniformes propios: destello de impacto por instancia).
export function cloneCharMaterial(m) {
  const c = makeCharMaterial({ bumpScale: m.userData.bumpScale.value, envIntensity: m.envMapIntensity, side: m.side });
  c.userData.glow.value = m.userData.glow.value;
  return c;
}
