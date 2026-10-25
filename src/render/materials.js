import * as THREE from 'three';

// Material PBR con proyección triplanar en espacio mundo (sin UV): textura y relieve coherentes en
// arcos, columnas y bloques. Variación por causas (biblia §7.4): humedad cerca del agua (más oscuro
// y brillante), musgo en caras superiores protegidas, suciedad en la base de los muros.

export function triplanarMaterial({
  set, scale = 0.5, color = '#ffffff', normalScale = 1, roughness = 1, metalness = 0,
  wetLevel = -100, wetBand = 0.8, moss = 0, mossColor = '#4b5a2e', grime = 0.25, envMapIntensity = 0.6,
} = {}) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness, envMapIntensity });
  const u = {
    tpAlbedo: { value: set.map },
    tpNormal: { value: set.normalMap },
    tpRough: { value: set.roughnessMap },
    tpScale: { value: scale },
    tpNormalScale: { value: normalScale },
    tpWetLevel: { value: wetLevel },
    tpWetBand: { value: wetBand },
    tpMoss: { value: moss },
    tpMossColor: { value: new THREE.Color(mossColor) },
    tpGrime: { value: grime },
  };
  mat.userData.tp = u;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vTpPos;
varying vec3 vTpNormal;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
{
  vec4 tpP = vec4(transformed, 1.0);
  vec3 tpN = objectNormal;
  #ifdef USE_INSTANCING
    tpP = instanceMatrix * tpP;
    tpN = mat3(instanceMatrix) * tpN;
  #endif
  vTpPos = (modelMatrix * tpP).xyz;
  vTpNormal = normalize(mat3(modelMatrix) * tpN);
}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D tpAlbedo, tpNormal, tpRough;
uniform float tpScale, tpNormalScale, tpWetLevel, tpWetBand, tpMoss, tpGrime;
uniform vec3 tpMossColor;
varying vec3 vTpPos;
varying vec3 vTpNormal;
float tpHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float tpNoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(tpHash(i),tpHash(i+vec2(1,0)),f.x), mix(tpHash(i+vec2(0,1)),tpHash(i+vec2(1,1)),f.x), f.y); }
vec3 tpBlend(vec3 n){ vec3 b = pow(abs(n), vec3(5.0)); return b / (b.x + b.y + b.z); }`)
      .replace('#include <map_fragment>', `
vec3 tpN0 = normalize(vTpNormal);
vec3 tpW = tpBlend(tpN0);
vec3 tpSgn = sign(tpN0 + 1e-4);
vec2 tpUvX = vTpPos.zy * tpScale; tpUvX.x *= tpSgn.x;
vec2 tpUvY = vTpPos.xz * tpScale; tpUvY.x *= tpSgn.y;
vec2 tpUvZ = vTpPos.xy * tpScale; tpUvZ.x *= -tpSgn.z;
vec3 tpCol = texture2D(tpAlbedo, tpUvX).rgb * tpW.x + texture2D(tpAlbedo, tpUvY).rgb * tpW.y + texture2D(tpAlbedo, tpUvZ).rgb * tpW.z;
// Variación a gran escala (evita la repetición evidente)
float tpBig = tpNoise(vTpPos.xy * 0.35 + vTpPos.z * 0.2) * 0.6 + tpNoise(vTpPos.xy * 1.3) * 0.4;
tpCol *= 0.82 + tpBig * 0.36;
// Churretes de suciedad en paredes verticales: vetas alargadas que bajan desde cornisas y juntas
{
  float tpVert = 1.0 - smoothstep(0.35, 0.7, abs(tpN0.y));
  float tpH = vTpPos.x * abs(tpN0.z) + vTpPos.z * abs(tpN0.x);
  float tpSt = tpNoise(vec2(tpH * 5.0, vTpPos.y * 0.32)) * 0.6 + tpNoise(vec2(tpH * 14.0, vTpPos.y * 0.9)) * 0.4;
  tpSt = smoothstep(0.5, 0.85, tpSt) * smoothstep(0.25, 0.7, tpNoise(vec2(tpH * 0.4, vTpPos.y * 0.15) + 3.0));
  tpCol *= 1.0 - tpGrime * tpVert * tpSt * 0.6;
}
// Humedad
float tpWet = (1.0 - smoothstep(tpWetLevel, tpWetLevel + tpWetBand, vTpPos.y)) * (0.7 + 0.3 * tpNoise(vTpPos.xz * 3.0));
tpCol *= 1.0 - tpWet * 0.38;
// Musgo en caras superiores
float tpMs = tpMoss * smoothstep(0.55, 0.95, tpN0.y) * smoothstep(0.35, 0.75, tpNoise(vTpPos.xz * 2.2 + 7.0) * 0.7 + tpNoise(vTpPos.xz * 9.0) * 0.3);
tpCol = mix(tpCol, tpMossColor * (0.7 + 0.5 * tpNoise(vTpPos.xz * 20.0)), tpMs);
diffuseColor.rgb *= tpCol;
`)
      .replace('#include <roughnessmap_fragment>', `
float roughnessFactor = roughness;
{
  float r = texture2D(tpRough, tpUvX).g * tpW.x + texture2D(tpRough, tpUvY).g * tpW.y + texture2D(tpRough, tpUvZ).g * tpW.z;
  roughnessFactor *= r;
  roughnessFactor = mix(roughnessFactor, 0.22, tpWet * 0.8);
  roughnessFactor = mix(roughnessFactor, 0.9, tpMs);
}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec3 tnX = texture2D(tpNormal, tpUvX).xyz * 2.0 - 1.0;
  vec3 tnY = texture2D(tpNormal, tpUvY).xyz * 2.0 - 1.0;
  vec3 tnZ = texture2D(tpNormal, tpUvZ).xyz * 2.0 - 1.0;
  float ns = tpNormalScale * (1.0 - tpMs * 0.6);
  tnX.xy *= ns; tnY.xy *= ns; tnZ.xy *= ns;
  tnX.x *= tpSgn.x; tnY.x *= tpSgn.y; tnZ.x *= -tpSgn.z;
  vec3 nX = vec3(tnX.xy + tpN0.zy, abs(tnX.z) * tpN0.x);
  vec3 nY = vec3(tnY.xy + tpN0.xz, abs(tnY.z) * tpN0.y);
  vec3 nZ = vec3(tnZ.xy + tpN0.xy, abs(tnZ.z) * tpN0.z);
  vec3 wn = normalize(nX.zyx * tpW.x + nY.xzy * tpW.y + nZ.xyz * tpW.z);
  normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
}`);
  };
  mat.customProgramCacheKey = () => 'triplanar-v2';
  return mat;
}

// Bronce envejecido con pátina verdosa en cavidades (procedural, sin textura).
export function bronzeMaterial(color = '#8b6746') {
  const mat = new THREE.MeshStandardMaterial({ color, metalness: 1, roughness: 0.38, envMapIntensity: 1.2 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBzPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBzPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vBzPos;
float bzH(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
float bzN(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(bzH(i),bzH(i+vec3(1,0,0)),f.x),mix(bzH(i+vec3(0,1,0)),bzH(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(bzH(i+vec3(0,0,1)),bzH(i+vec3(1,0,1)),f.x),mix(bzH(i+vec3(0,1,1)),bzH(i+vec3(1,1,1)),f.x),f.y),f.z); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
float bzP = smoothstep(0.55, 0.8, bzN(vBzPos * 9.0) * 0.6 + bzN(vBzPos * 31.0) * 0.4);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.3, 0.24), bzP * 0.75);`)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= 1.0 - bzP * 0.9;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.85, bzP);');
  };
  mat.customProgramCacheKey = () => 'bronze-v1';
  return mat;
}
