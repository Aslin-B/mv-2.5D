import * as THREE from 'three';
import { SUN_DIR } from './environment.js';

// Agua del canal: normales animadas en dos escalas, Fresnel, reflejo aproximado del cielo y
// brillo del sol, espuma junto a pilares. Es una aproximación (no reflexión planar ni SSR, §9.9).

export function buildWater({ x0, x1, z0, z1, y, normalTex, foamXs = [] }) {
  const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 1, 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  const foam = new Float32Array(16).fill(-9999);
  foamXs.slice(0, 16).forEach((v, i) => { foam[i] = v; });
  const mat = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        tNormal: { value: normalTex }, time: { value: 0 }, sunDir: { value: SUN_DIR.clone() },
        foamX: { value: foam }, deep: { value: new THREE.Color('#13201f') }, shallow: { value: new THREE.Color('#2f4a44') },
      },
    ]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec3 vW;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform sampler2D tNormal; uniform float time; uniform vec3 sunDir; uniform float foamX[16];
      uniform vec3 deep, shallow;
      varying vec3 vW;
      float hh(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
      float nn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hh(i),hh(i+vec2(1,0)),f.x),mix(hh(i+vec2(0,1)),hh(i+vec2(1,1)),f.x),f.y); }
      void main(){
        vec2 uv = vW.xz;
        vec3 n1 = texture2D(tNormal, uv * 0.18 + vec2(time * 0.09, time * 0.01)).xzy * 2.0 - 1.0;
        vec3 n2 = texture2D(tNormal, uv * 0.47 + vec2(time * 0.16, -time * 0.03)).xzy * 2.0 - 1.0;
        vec3 N = normalize(vec3(n1.x + n2.x, 3.2, n1.z + n2.z));
        vec3 V = normalize(cameraPosition - vW);
        float fres = 0.03 + 0.97 * pow(clamp(1.0 - dot(N, V), 0.0, 1.0), 5.0);
        vec3 R = reflect(-V, N);
        vec3 sky = mix(vec3(1.1, 0.68, 0.42), vec3(0.3, 0.36, 0.5), smoothstep(0.0, 0.5, R.y));
        float sun = pow(max(dot(R, sunDir), 0.0), 350.0) * 12.0 + pow(max(dot(R, sunDir), 0.0), 40.0) * 0.22;
        float depth = smoothstep(-6.0, 1.5, vW.z);
        vec3 body = mix(deep, shallow, depth * 0.5 + 0.15 * nn(uv * 0.7 + time * 0.05));
        vec3 col = mix(body, sky, fres * 0.85) + vec3(1.0, 0.75, 0.5) * sun;
        // espuma junto a pilares y salidas de agua
        float fo = 0.0;
        for (int i = 0; i < 16; i++) {
          float d = abs(vW.x - foamX[i]);
          fo = max(fo, smoothstep(1.2, 0.0, d));
        }
        float fn = nn(uv * vec2(3.0, 6.0) + vec2(time * 0.6, 0.0)) * 0.6 + nn(uv * 11.0 + time) * 0.4;
        fo *= smoothstep(0.45, 0.75, fn);
        col = mix(col, vec3(0.85, 0.82, 0.76), fo * 0.7);
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = false;
  return { mesh, mat };
}

// Cascada: lámina curvada en el labio superior, vetas finas a varias velocidades, huecos
// translúcidos, espuma en la base y brillo especular en el borde del caño.
export function buildWaterfall({ x, y0, y1, z, width }) {
  const h = y1 - y0;
  const geo = new THREE.PlaneGeometry(width, h, 6, 28);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const v = (pos.getY(i) + h / 2) / h;           // 0 abajo, 1 arriba
    const lip = Math.max(0, (v - 0.86) / 0.14);     // el agua sale hacia delante en el labio
    const belly = Math.sin(v * Math.PI) * 0.12;
    pos.setZ(i, lip * lip * 0.55 + belly);
    pos.setX(i, pos.getX(i) * (1 + (1 - v) * 0.12)); // se abre al caer
  }
  geo.computeVertexNormals();
  geo.translate(x, (y0 + y1) / 2, z);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { time: { value: 0 }, height: { value: h }, width: { value: width } }]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec2 vUv;
      void main(){ vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform float time, height, width; varying vec2 vUv;
      float hh(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
      float nn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hh(i),hh(i+vec2(1,0)),f.x),mix(hh(i+vec2(0,1)),hh(i+vec2(1,1)),f.x),f.y); }
      void main(){
        // coordenadas en metros: vetas de ~6 cm de ancho alargadas en la caída
        vec2 m = vec2(vUv.x * width, vUv.y * height);
        float fall = time * 3.4;
        float s1 = nn(vec2(m.x * 16.0, m.y * 0.55 + fall));
        float s2 = nn(vec2(m.x * 31.0 + 7.0, m.y * 0.9 + fall * 1.35));
        float s3 = nn(vec2(m.x * 6.0 + 3.0, m.y * 0.25 + fall * 0.7));
        float streak = s1 * 0.45 + s2 * 0.35 + s3 * 0.2;
        float edge = smoothstep(0.0, 0.16, vUv.x) * smoothstep(1.0, 0.84, vUv.x);
        float sheet = smoothstep(0.32, 0.72, streak);
        float a = edge * mix(0.12, 0.78, sheet);
        // espuma en la base y labio brillante arriba
        float foamH = clamp(1.6 / height, 0.02, 0.4);
        float foam = smoothstep(foamH, 0.0, vUv.y) * (0.55 + 0.45 * nn(vec2(m.x * 9.0, m.y * 6.0 - fall * 0.4)));
        float lip = smoothstep(0.9, 0.985, vUv.y) * edge;
        a = max(a, edge * foam * 0.9);
        a *= smoothstep(0.0, 0.015, vUv.y) * (1.0 - smoothstep(0.985, 1.0, vUv.y));
        vec3 deep = vec3(0.32, 0.4, 0.42);
        vec3 lit = vec3(0.92, 0.9, 0.84);
        vec3 col = mix(deep, lit, sheet * 0.75 + foam * 0.6);
        col += vec3(0.25, 0.23, 0.2) * lip;
        gl_FragColor = vec4(col, a);
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  return { mesh, mat };
}
