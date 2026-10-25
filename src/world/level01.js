import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { StaticBatch, Kit, buildWheel } from '../render/architecture.js';
import { triplanarMaterial, bronzeMaterial } from '../render/materials.js';
import { stoneAshlar, stoneFlags, woodPlanks, ivyCard, shaftTexture, waterNormals, rockFace, bannerTexture, grassCard } from '../render/textures.js';
import { buildWater, buildWaterfall } from '../render/water.js';
import { SUN_DIR, Zones, buildMistBand } from '../render/environment.js';
import { ClavijaPedestal, CaudalFragment, RestFountain, CrackedWall, SocketGate, Trigger, RuneBlock } from '../world/mechanisms.js';
import { mulberry32, valueNoise3 } from '../core/rng.js';
import { buildSections } from '../render/sections.js';
import { pipeRun, valveWheel, etherTank, runeGauge, wallShelf, toolRack } from './machinery.js';

// Primer nivel: el Acueducto del Alba (biblia §17), versión corta de cinco salas.
// Coordenadas en metros: X a la derecha, Y arriba, Z hacia la cámara (z = 0 plano de juego).
//
//   Atrio de llegada  ─ Galería de servicio ─ Pasarela del canal ─ Taller del maestro ─ Terraza
//   x -10..20 (y 0)     x 20..48 (y 1.6)      x 48..86 (y 1.6)     x 86..106            x 106..128
//   caminar y saltar    combate + secreto     huecos, borde,       clavija y compuerta  duelo y final
//                                             deslizamiento

export const AREAS = [
  { x: -100, name: 'Atrio de llegada', sub: 'Acueducto del Alba' },
  { x: 20.5, name: 'Galería de servicio' },
  { x: 48.5, name: 'Pasarela del canal' },
  { x: 86.5, name: 'Taller del maestro' },
  { x: 106.5, name: 'Terraza de descarga' },
];

export const SPAWN = { x: -6.5, y: 0 };

// Salas para el mapa local (aire transitable de cada estancia).
export const MAP_ROOMS = [
  { x0: -9.5, x1: 20, y0: 0, y1: 9, name: 'Atrio de llegada' },
  { x0: 20, x1: 48, y0: 1.6, y1: 7.6, name: 'Galería de servicio' },
  { x0: 48, x1: 86, y0: -0.6, y1: 9, name: 'Pasarela del canal' },
  { x0: 86, x1: 106, y0: 1.6, y1: 8, name: 'Taller del maestro' },
  { x0: 106, x1: 128, y0: 1.6, y1: 9, name: 'Terraza de descarga' },
];
export const MAP_BOUNDS = { x0: -12, x1: 134, y0: -3, y1: 13 };

// Iluminación por zonas: exposición, sol, cielo, niebla y entorno (interiores más oscuros).
export const LIGHT_ZONES = new Zones([
  // Gradación (sh*/hi*: tinte de sombras y luces; con: curva en S; bp: punto negro; sat): cada sala
  // tiene un tono dominante y los acentos luminosos (runas, braseros, saetas) contrastan con él.
  { x: -100, exposure: 0.8, sun: 4.2, hemi: 0.72, fogD: 0.0095, env: 0.6, fill: 3.2, bloom: 0.32, rim: 0.46, fogColor: '#a3949a',
    shR: 0.84, shG: 0.9, shB: 1.16, hiR: 1.07, hiG: 0.99, hiB: 0.86, con: 0.3, bp: 0.015, sat: 1.08 },
  { x: 21, blend: 3, exposure: 1.85, sun: 4.6, hemi: 0.46, fogD: 0.02, env: 0.4, fill: 4.4, bloom: 0.5, rim: 0.6, fogColor: '#4a3f38',
    shR: 0.78, shG: 0.94, shB: 1.16, hiR: 1.12, hiG: 0.98, hiB: 0.8, con: 0.26, bp: 0.008, sat: 1.1 },
  { x: 49, blend: 3, exposure: 0.8, sun: 4.2, hemi: 0.7, fogD: 0.0105, env: 0.6, fill: 3.0, bloom: 0.32, rim: 0.46, fogColor: '#97949e',
    shR: 0.8, shG: 0.95, shB: 1.16, hiR: 1.05, hiG: 1.0, hiB: 0.9, con: 0.3, bp: 0.015, sat: 1.08 },
  { x: 87, blend: 3, exposure: 1.95, sun: 4.4, hemi: 0.42, fogD: 0.018, env: 0.4, fill: 4.4, bloom: 0.55, rim: 0.65, fogColor: '#3e342e',
    shR: 0.86, shG: 0.9, shB: 1.12, hiR: 1.14, hiG: 0.95, hiB: 0.76, con: 0.28, bp: 0.008, sat: 1.1 },
  { x: 107, blend: 3, exposure: 0.76, sun: 4.4, hemi: 0.72, fogD: 0.008, env: 0.6, fill: 3.2, bloom: 0.34, rim: 0.46, fogColor: '#b0959a',
    shR: 0.84, shG: 0.88, shB: 1.16, hiR: 1.08, hiG: 0.98, hiB: 0.84, con: 0.3, bp: 0.015, sat: 1.08 },
]);

// Encuadre por zona: distancia de cámara y límites horizontales del centro de la vista.
export const CAMERA_ZONES = [
  { x: -100, dist: 18.5, minX: -1.0, maxX: 200 },
  { x: 21, dist: 17.0, minX: -1.0, maxX: 200 },
  { x: 49, dist: 18.0, minX: -1.0, maxX: 200 },
  { x: 87, dist: 17.0, minX: -1.0, maxX: 200 },
  { x: 107, dist: 19.0, minX: -1.0, maxX: 119.5 },
];

export function makeMaterials() {
  const ashlar = stoneAshlar(1024, 1, { rows: 4 });
  const ashlarDark = stoneAshlar(1024, 2, { rows: 5, base: [0.33, 0.32, 0.31], warm: [0.5, 0.44, 0.36] });
  const flags = stoneFlags(1024, 7);
  const wood = woodPlanks(512, 3);
  const rock = rockFace(512, 21);
  const m = {
    stone: triplanarMaterial({ set: ashlar, scale: 0.42, moss: 0.55, grime: 0.55 }),
    stoneInt: triplanarMaterial({ set: ashlarDark, scale: 0.45, moss: 0.15, grime: 0.4, color: '#d8cfc4' }),
    plinth: triplanarMaterial({ set: ashlarDark, scale: 0.4, moss: 0.4, grime: 0.6, color: '#9c8f82' }),
    stoneWet: triplanarMaterial({ set: ashlar, scale: 0.42, moss: 0.8, wetLevel: 0.9, wetBand: 1.4, mossColor: '#3f5129' }),
    floor: triplanarMaterial({ set: flags, scale: 0.32, moss: 0.25 }),
    floorInt: triplanarMaterial({ set: flags, scale: 0.36, moss: 0.0, color: '#cfc6bb' }),
    wood: triplanarMaterial({ set: wood, scale: 0.9, roughness: 1, normalScale: 1.2, grime: 0.1 }),
    rock: triplanarMaterial({ set: rock, scale: 0.17, moss: 0.4, normalScale: 1.4, mossColor: '#4e5a32' }),
    rockFar: triplanarMaterial({ set: rock, scale: 0.05, moss: 0.3, normalScale: 0.8 }),
    bronze: bronzeMaterial('#8b6746'),
    iron: new THREE.MeshStandardMaterial({ color: '#3b3b3d', metalness: 0.85, roughness: 0.55 }),
    woodUV: new THREE.MeshStandardMaterial({ map: wood.map, normalMap: wood.normalMap, roughnessMap: wood.roughnessMap, roughness: 1 }),
    crack: new THREE.LineBasicMaterial({ color: '#16110d' }),
    ivy: new THREE.MeshStandardMaterial({ map: ivyCard(512, 5), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75 }),
    grass: new THREE.MeshStandardMaterial({ map: grassCard(256, 13), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.85 }),
    foliage: new THREE.MeshStandardMaterial({ color: '#33422a', roughness: 0.95 }),
    burlap: new THREE.MeshStandardMaterial({ color: '#7a6347', roughness: 1, flatShading: false }),
    banner: new THREE.MeshStandardMaterial({ map: bannerTexture(256, 640), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9 }),
    ember: new THREE.MeshStandardMaterial({ color: '#1a0f09', emissive: '#ff5a1e', emissiveIntensity: 2.2, roughness: 0.9 }),
    glass: new THREE.MeshStandardMaterial({ color: '#ffd9a3', emissive: '#ffb066', emissiveIntensity: 3.0 }),
  };
  m.woodUV.map.wrapS = m.woodUV.map.wrapT = THREE.RepeatWrapping;
  return m;
}

export function buildLevel01(game, tex) {
  const { scene, physics } = game;
  const mats = makeMaterials();
  const batch = new StaticBatch();
  const kit = new Kit(batch, mats, 11);
  const rnd = mulberry32(77);
  const R = (a = 0, b = 1) => a + (b - a) * rnd();
  const solid = (x0, y0, x1, y1, o = {}) => physics.addSolid({ x0, y0, x1, y1, ...o });

  const updaters = [];
  const foreground = [];
  const lights = [];
  const shafts = [];
  const mechanisms = [];
  const triggers = [];

  // =====================================================================================
  // Colisiones (superficie simplificada, separada de la malla, §7.5)
  // =====================================================================================
  solid(-13, -6, -9.5, 18, { grab: false });                 // roca del extremo izquierdo
  solid(-9.5, -6, 7.0, 0, { surface: 'stone' });             // atrio
  solid(7.0, -6, 11.5, 0.55, { surface: 'stone' });          // escalón
  solid(11.5, -6, 55, 1.6, { surface: 'stone' });            // rampa al nivel de la galería + C1
  solid(20, 5.6, 21.2, 14, { grab: false });                 // dintel de entrada de la galería
  solid(20, 7.6, 48, 14, { grab: false });                   // techo galería
  solid(46.8, 5.6, 48, 14, { grab: false });                 // dintel de salida
  solid(32.4, 1.6, 33.6, 2.6, { surface: 'wood', grab: false, section: false }); // cajas
  solid(34, 4.2, 41, 4.4, { kind: 'oneway', surface: 'wood', section: false });  // altillo de madera
  solid(41, 4.0, 46.8, 4.4, { grab: false });                // suelo del nicho secreto
  solid(46.0, 4.4, 46.8, 7.6, { grab: false });              // cierre del nicho
  solid(58.2, -6, 63, 1.6, { surface: 'stone' });            // C2
  solid(63, -6, 67.5, 4.4, { surface: 'stone', sectionTop: 1.05 }); // pilar arruinado (agarre): se ve su sillería
  solid(67.5, -6, 80, 1.6, { surface: 'stone' });            // C3
  solid(71, 2.65, 75.5, 7.5, { grab: false, section: false }); // muro derrumbado: paso bajo
  solid(83, -6, 131, 1.6, { surface: 'stone' });             // taller + terraza
  solid(86, 5.4, 87.2, 14, { grab: false });                 // dintel del taller
  solid(86, 8.0, 106, 14, { grab: false });                  // techo del taller
  solid(92.5, 3.6, 97.5, 3.9, { surface: 'wood', section: false }); // altillo del pedestal
  solid(104, 6.0, 106, 14, { grab: false });                 // muro sobre la compuerta
  solid(128, -6, 132, 18, { grab: false });                  // torre del extremo derecho
  physics.addVolume({ type: 'water', x0: 55, y0: -8, x1: 58.2, y1: 0.1 });
  physics.addVolume({ type: 'water', x0: 80, y0: -8, x1: 83, y1: 0.1 });
  physics.addVolume({ type: 'kill', x0: -20, y0: -40, x1: 200, y1: -7 });
  // sección negra del plano de juego (solo colisiones estáticas; los mecanismos dibujan las suyas)
  scene.add(buildSections(physics.solids.slice()));

  // =====================================================================================
  // Fondo lejano: valle, acueducto monumental y acantilados
  // =====================================================================================
  {
    // suelo del valle (bajo la niebla)
    const g = new THREE.PlaneGeometry(900, 500, 1, 1);
    g.rotateX(-Math.PI / 2);
    g.translate(60, -34, -260);
    const valley = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#4a4a3a', roughness: 1 }));
    valley.receiveShadow = false;
    scene.add(valley);
    // acantilado bajo las terrazas
    kit.box(-16, -36, 136, -0.6, -12, -3.7, mats.rock, { radius: 0.3, cast: false });
    // acueducto de dos órdenes al otro lado del valle (z = -36)
    const Z = -36;
    for (let x = -66; x <= 190; x += 12) {
      kit.box(x - 1.6, -34, x + 1.6, -4, Z - 1.6, Z + 1.6, mats.stone, { radius: 0.12, cast: false });
      kit.box(x - 1.1, -4, x + 1.1, 7, Z - 1.1, Z + 1.1, mats.stone, { radius: 0.1, cast: false });
      if (x < 190) {
        kit.arch(x + 6, -12, 8.8, Z, 2.6, 1.0, mats.stone, { voussoirs: 11, cast: false });
        kit.box(x + 1.6, -6.2, x + 10.4, -4, Z - 1.4, Z + 1.4, mats.stone, { radius: 0.1, cast: false });
        kit.arch(x + 6, 2.2, 9.6, Z, 1.8, 0.7, mats.stone, { voussoirs: 11, cast: false });
      }
    }
    kit.box(-68, 7, 192, 8.6, Z - 1.4, Z + 1.4, mats.stone, { radius: 0.1, cast: false }); // canal superior
    // cascada lejana en un tramo roto del acueducto
    const fall = buildWaterfall({ x: 3, y0: -34, y1: 7.6, z: Z + 1.5, width: 3.2 });
    scene.add(fall.mesh); updaters.push((dt, t) => { fall.mat.uniforms.time.value = t * 0.6; });
    // cipreses y masas de vegetación en las laderas
    for (let i = 0; i < 30; i++) {
      const s = R(0.7, 1.4);
      cypress(batch, mats, R(-30, 170), -33 + R(-1, 5), R(-62, -24), s * 1.3, 9 * s * R(0.9, 1.3), i, 8, false);
    }
    // neblina del valle en dos capas: delante del acueducto lejano y entre este y las cordilleras
    for (const b of [
      { x0: -120, x1: 260, y0: -22, y1: 3, z: -28, color: '#cdb4a6', alpha: 0.6, seed: 1 },
      { x0: -260, x1: 420, y0: -30, y1: 14, z: -78, color: '#d6b9a7', alpha: 0.5, seed: 7 },
    ]) {
      const m = buildMistBand(b);
      scene.add(m.mesh);
      updaters.push((dt, t) => { m.mat.uniforms.time.value = t; });
    }
  }

  // =====================================================================================
  // ATRIO DE LLEGADA (x -10..20)
  // =====================================================================================
  {
    kit.box(-9.5, -3.2, 7.0, -0.05, -3.8, 1.7, mats.plinth, { radius: 0.05 });
    kit.box(-9.5, -0.05, 7.0, 0.0, -3.8, 1.75, mats.floor, { radius: 0.0 });
    kit.box(7.0, -3.2, 11.5, 0.5, -3.8, 1.7, mats.plinth, { radius: 0.05 });
    kit.box(7.0, 0.5, 11.5, 0.55, -3.8, 1.75, mats.floor, { radius: 0.0 });
    kit.box(11.5, -3.2, 21, 1.55, -3.8, 1.7, mats.plinth, { radius: 0.05 });
    kit.box(11.5, 1.55, 21, 1.6, -3.8, 1.75, mats.floor, { radius: 0.0 });
    // peldaños visibles en los cambios de nivel
    kit.box(6.6, 0, 7.0, 0.27, -3.6, 1.7, mats.stone, { radius: 0.03 });
    kit.box(11.1, 0.55, 11.5, 1.08, -3.6, 1.7, mats.stone, { radius: 0.03 });
    // roca del extremo izquierdo
    kit.box(-16, -6, -9.5, 18, -14, 4, mats.rock, { radius: 0.4 });
    for (let i = 0; i < 7; i++) {
      const cy = R(-1, 14), hh = R(1.2, 3.5), cz = R(-3, 2.5), dd = R(1, 2.2);
      kit.box(-11.2, cy - hh, -9.15 + R(-0.25, 0.35), cy + hh, cz - dd, cz + dd, mats.rock, { radius: 0.35 });
    }
    // parapeto trasero con albardilla (el valle queda detrás)
    for (const [x0, x1, y] of [[-9.5, 7, 0], [7, 11.5, 0.55], [11.5, 20, 1.6]]) {
      kit.box(x0, y, x1, y + 0.85, -3.8, -3.2, mats.stone, { radius: 0.04 });
      kit.box(x0 - 0.05, y + 0.85, x1 + 0.05, y + 1.02, -3.9, -3.1, mats.stone, { radius: 0.05 });
    }
    // arco roto que enmarca la vista del acueducto
    kit.pier(-0.5, 0, 6.2, -2.4, 1.1, 1.1, mats.stone);
    kit.pier(9.0, 0.55, 6.2, -2.4, 1.1, 1.1, mats.stone);
    kit.arch(4.25, 6.2, 8.4, -2.4, 1.0, 0.55, mats.stone, { voussoirs: 13 });
    // columna caída y capitel
    {
      const g = new THREE.CylinderGeometry(0.42, 0.44, 3.4, 18);
      g.rotateZ(Math.PI / 2 + 0.08); g.rotateY(0.5);
      g.translate(2.4, 0.43, -1.6);
      batch.push(mats.stone, g);
      kit.box(-4.4, 0, -3.3, 0.5, -2.3, -1.2, mats.stone, { radius: 0.06 });
    }
    // hiedra y hierba
    hangIvy(batch, mats, -0.5, 6.0, -1.8, 2.4, 1.0);
    hangIvy(batch, mats, 9.0, 6.0, -1.8, 2.8, 1.0);
    hangIvy(batch, mats, -9.6, 7, 1.2, 4, 2.2, true);
    grassRow(batch, mats, -9, 6.5, 0, -3.1, rnd, 22);
    grassRow(batch, mats, 7.2, 11.2, 0.55, -3.1, rnd, 8);
    grassRow(batch, mats, 11.8, 20, 1.6, -3.1, rnd, 12);
    // primer plano: columna rota y tallos (se desvanecen si tapan a Aren, §8.7)
    foreground.push(fgColumn(scene, mats, -1.2, 0, 3.6, 3.1));
    foreground.push(fgColumn(scene, mats, 15.5, 1.6, 3.4, 4.8));
    // portada del sello rúnico (los bloques son un mecanismo; esto es su marco de piedra)
    // (todo por detrás del plano de juego: Aren nunca atraviesa la piedra decorativa)
    kit.pier(13.2, 1.6, 4.75, -1.0, 0.55, 0.9, mats.stone);
    kit.pier(15.0, 1.6, 4.75, -1.0, 0.55, 0.9, mats.stone);
    kit.box(12.85, 4.75, 15.35, 5.15, -1.5, -0.42, mats.stone, { radius: 0.05 });
    kit.box(13.0, 5.15, 15.2, 5.3, -1.4, -0.55, mats.stone, { radius: 0.04 });
    runeStrip(scene, 13.0, 15.2, 4.95, -0.4, { glyphs: 1.1 });
    // braseros apagados y linterna
    lantern(scene, mats, lights, -8.2, 0, -2.6, 0.9);
    // lámparas de éter en los pilares del arco
    etherLamp(scene, mats, tex, -0.5, 3.4, -1.66, { size: 1.35 });
    etherLamp(scene, mats, tex, 9.0, 3.9, -1.66, { size: 1.35 });
  }

  // =====================================================================================
  // GALERÍA DE SERVICIO (x 20..48)
  // =====================================================================================
  {
    const y = 1.6;
    kit.box(21, -3.2, 48, y - 0.05, -3.8, 1.7, mats.plinth, { radius: 0.05 });
    kit.box(21, y - 0.05, 48, y, -3.4, 1.75, mats.floorInt, { radius: 0 });
    // fachada de entrada con dintel
    kit.wall(20, 21.2, 5.6, 9.2, -3.4, 1.4, mats.stone);
    kit.pier(20.6, y, 5.6, 0.8, 1.2, 1.2, mats.stone);
    kit.wall(46.8, 48, 5.6, 9.2, -3.4, 1.4, mats.stone);
    kit.pier(47.4, y, 5.6, 0.8, 1.2, 1.2, mats.stone);
    // muro trasero con ventanales (dejan pasar haces de sol)
    const winX = [24.5, 29.5, 36.0, 43.5];
    const winW = 1.6, wy0 = 2.7, wy1 = 6.1;
    let cx = 21.2;
    for (const wx of winX) {
      kit.wall(cx, wx - winW / 2, y, 7.6, -3.5, -2.6, mats.stoneInt);
      kit.wall(wx - winW / 2, wx + winW / 2, y, wy0, -3.5, -2.6, mats.stoneInt);
      kit.wall(wx - winW / 2, wx + winW / 2, wy1 + 0.6, 7.6, -3.5, -2.6, mats.stoneInt);
      kit.arch(wx, wy1, winW, -3.05, 0.9, 0.22, mats.stone, { voussoirs: 7 });
      kit.box(wx - winW / 2 - 0.15, wy0 - 0.12, wx + winW / 2 + 0.15, wy0, -3.7, -2.4, mats.stone, { radius: 0.03 }); // alféizar
      cx = wx + winW / 2;
      addShaft(scene, shafts, tex, wx, wy0 + 0.1, wy1 + 0.4, winW * 0.9, -2.7);
    }
    kit.wall(cx, 46.8, y, 7.6, -3.5, -2.6, mats.stoneInt);
    // techo con vigas
    kit.box(20, 7.6, 48, 8.6, -3.6, 1.2, mats.stoneInt, { radius: 0.05, cast: true });
    for (let x = 22; x < 47; x += 2.6) kit.beam(x - 0.16, x + 0.16, 7.4, -1.1, 0.4, 4.8, mats.wood);
    // pilastras del muro trasero
    for (const x of [27, 33, 40.2]) kit.pier(x, y, 7.6, -2.3, 0.7, 0.5, mats.stoneInt);
    // cajas y barriles
    crate(kit, mats, 32.4, y, 33.6, 1.0);
    crate(kit, mats, 31.3, y, 32.3, 0.7, -1.2);
    barrel(batch, mats, 26.2, y, -1.6);
    barrel(batch, mats, 27.0, y, -2.0);
    // altillo de madera con pies derechos y baranda
    kit.walkway(34, 41, 4.4, -2.4, 0.9, y);
    kit.railing(34, 41, 4.4, -2.2, mats.wood);
    // nicho secreto (cerrado por el muro agrietado)
    kit.box(41, 3.95, 46.8, 4.4, -2.6, 1.2, mats.stone, { radius: 0.04 });
    kit.wall(46.0, 46.8, 4.4, 7.6, -2.6, 1.2, mats.stoneInt);
    kit.box(41, 4.4, 46.0, 7.6, -3.4, -2.6, mats.stoneInt);
    // estandartes entre ventanas
    banner(scene, mats, 27, 7.2, -2.25, 3.4, updaters);
    banner(scene, mats, 40.2, 7.2, -2.25, 3.4, updaters);
    // antorchas de muro
    torch(scene, mats, lights, 22.6, 4.4, -2.45, updaters);
    torch(scene, mats, lights, 33.0, 4.6, -2.0, updaters);
    // canal rúnico al pie del muro y lámparas de éter entre ventanales
    runeStrip(scene, 21.3, 46.7, y + 0.42, -2.57);
    etherLamp(scene, mats, tex, 30.6, 5.1, -2.42);
    etherLamp(scene, mats, tex, 38.6, 5.1, -2.42);
    etherLamp(scene, mats, tex, 45.2, 5.1, -2.42);
    // maquinaria del acueducto: colector bajo el techo, bajantes a dos depósitos de éter y manómetros
    pipeRun(batch, mats.bronze, [[21.4, 6.95, -2.42], [46.6, 6.95, -2.42]], { r: 0.11, flange: 2.1, flangeMat: mats.iron });
    pipeRun(batch, mats.bronze, [[30.95, 6.95, -2.42], [30.95, 3.75, -2.42], [30.95, 3.6, -2.2]], { r: 0.075, flangeMat: mats.iron });
    pipeRun(batch, mats.bronze, [[37.9, 6.95, -2.42], [37.9, 3.95, -2.42]], { r: 0.075, flangeMat: mats.iron });
    pipeRun(batch, mats.bronze, [[21.4, 2.25, -2.44], [25.6, 2.25, -2.44], [25.6, 2.9, -2.44], [28.5, 2.9, -2.44]], { r: 0.06, flangeMat: mats.iron });
    etherTank(scene, batch, mats, tex, updaters, 30.95, y, -2.2, { h: 2.0, r: 0.3, seed: 1 });
    etherTank(scene, batch, mats, tex, updaters, 37.9, y, -2.15, { h: 2.35, r: 0.36, seed: 2 });
    valveWheel(batch, mats, 30.95, 5.3, -2.3, 0.2);
    valveWheel(batch, mats, 37.9, 5.75, -2.3, 0.24);
    runeGauge(scene, batch, mats, 31.6, 4.55, -2.5, { r: 0.14 });
    runeGauge(scene, batch, mats, 38.75, 3.15, -2.5, { r: 0.17, color: [0.35, 1.9, 2.4] });
    runeGauge(scene, batch, mats, 25.6, 3.35, -2.5, { r: 0.12 });
    wallShelf(batch, mats, rnd, 44.4, 46.6, 3.0, -2.6);
    wallShelf(batch, mats, rnd, 21.5, 23.4, 3.1, -2.6);
    // pilares delanteros del pórtico (primer plano, translúcidos al tapar)
    foreground.push(fgPier(scene, mats, 28.5, y, 7.6, 2.6));
    foreground.push(fgPier(scene, mats, 41.5, y, 7.6, 2.6));
    // fachada que oculta el nicho secreto hasta que Aren entra (se desvanece como el primer plano)
    foreground.push(fgFacade(scene, mats, 41.8, 46.8, 3.95, 7.6, 1.05, 1.6));
    hangIvy(batch, mats, 20.6, 9.2, 1.45, 1.6, 1.3);
    hangIvy(batch, mats, 47.4, 9.2, 1.45, 2.2, 1.3);
  }

  // =====================================================================================
  // PASARELA DEL CANAL (x 48..86)
  // =====================================================================================
  {
    const y = 1.6, wl = -0.3;
    const decks = [[48, 55], [58.2, 63], [67.5, 80], [83, 86.2]];
    for (const [x0, x1] of decks) {
      kit.box(x0, y - 0.55, x1, y - 0.05, -2.2, 1.6, mats.stoneWet, { radius: 0.05 });
      kit.box(x0, y - 0.05, x1, y, -2.2, 1.65, mats.floor, { radius: 0 });
      for (let x = x0 + 0.6; x < x1 - 0.3; x += 3.6) kit.pier(x, -3, y - 0.55, -0.3, 0.9, 3.4, mats.stoneWet);
      kit.pier(x1 - 0.45, -3, y - 0.55, -0.3, 0.9, 3.4, mats.stoneWet);
    }
    // pilar arruinado que obliga a agarrarse
    kit.box(63, -3, 67.5, 4.0, -2.0, 1.4, mats.stoneWet, { radius: 0.06 });
    kit.platform(63, 67.5, 4.4, 3.9, -2.0, 1.45, mats.stone);
    // pilastras, imposta y arco ciego: el pilar se lee como resto del acueducto, no como un bloque
    // (todo dentro del ancho de colisión 63–67,5; solo sobresale hacia la cámara)
    kit.box(63.0, -3, 63.5, 3.9, -2.05, 1.55, mats.stoneWet, { radius: 0.04 });
    kit.box(67.0, -3, 67.5, 3.9, -2.05, 1.55, mats.stoneWet, { radius: 0.04 });
    kit.box(63.0, 2.6, 67.5, 2.85, -2.1, 1.62, mats.stone, { radius: 0.03 });
    kit.box(63.5, 0.25, 67.0, 0.45, -2.05, 1.5, mats.stone, { radius: 0.03 });
    kit.arch(65.25, 1.2, 2.2, 1.42, 0.12, 0.22, mats.stone, { voussoirs: 9 });
    kit.box(64.0, 0.45, 64.18, 1.2, 1.36, 1.5, mats.stone, { radius: 0.01 });
    kit.box(66.32, 0.45, 66.5, 1.2, 1.36, 1.5, mats.stone, { radius: 0.01 });
    kit.box(61.9, 1.6, 62.6, 1.95, -1.7, -0.9, mats.stone, { radius: 0.06 });   // sillar caído al pie
    hangIvy(batch, mats, 63.4, 4.3, 1.5, 2.2, 1.0);
    hangIvy(batch, mats, 67.0, 4.3, 1.5, 1.6, 0.8);
    // muro derrumbado (paso bajo para deslizarse): un tramo del canal superior caído y encajado
    // sobre la viga; se apoya atrás en dos tocones, la coronación queda rota y gotea agua
    kit.box(71, 2.65, 75.5, 6.95, -2.2, 1.3, mats.stone, { radius: 0.08 });
    {
      const course = 0.46;
      for (let r = 0; r < 2; r++) {
        let x = 71 + (r ? 0.35 : 0);
        while (x < 75.4) {
          const w = R(0.75, 1.25);
          const x1 = Math.min(75.5, x + w);
          if (rnd() > (r ? 0.45 : 0.15) && x1 - x > 0.3) {
            const y0 = 6.95 + r * course, top = y0 + course - 0.03 - R(0, r ? 0.18 : 0.04);
            kit.box(x + 0.02, y0, x1 - 0.02, top, -2.2 + R(0, 0.25), 1.3 - R(0, 0.25), mats.stone, { radius: 0.05 });
          }
          x = x1;
        }
      }
      // labios del cauce (el tramo era parte de la conducción) y tocones de apoyo detrás del plano
      kit.box(71, 6.95, 75.5, 7.3, 1.0, 1.42, mats.stoneWet, { radius: 0.04 });
      kit.box(70.9, 1.6, 71.7, 2.65, -2.1, -0.75, mats.stoneWet, { radius: 0.06 });
      kit.box(74.8, 1.6, 75.6, 2.65, -2.1, -0.75, mats.stoneWet, { radius: 0.06 });
      const drip = buildWaterfall({ x: 75.3, y0: 1.6, y1: 6.95, z: -1.0, width: 0.45 });
      scene.add(drip.mesh);
      updaters.push((dt, t) => { drip.mat.uniforms.time.value = t * 1.3; });
    }
    for (let i = 0; i < 9; i++) {
      const cx = R(71.2, 75.3), cy = R(3.4, 6.7), w = R(0.35, 0.8), hh = R(0.2, 0.32);
      kit.box(cx - w, cy - hh, cx + w, cy + hh, R(-2.2, -1.2), R(1.0, 1.55), mats.stone, { radius: 0.05 });
    }
    kit.box(70.7, 2.65, 75.8, 3.05, -2.3, 1.45, mats.wood, { radius: 0.03 }); // viga caída que marca el hueco
    // coronación del pilar arruinado: sillares sueltos y un fuste roto (detrás del plano de juego)
    kit.box(63.3, 4.4, 64.4, 4.78, -1.9, -0.7, mats.stone, { radius: 0.05 });
    kit.box(66.2, 4.4, 67.3, 4.62, -1.8, -0.9, mats.stone, { radius: 0.05 });
    {
      const g = new THREE.CylinderGeometry(0.3, 0.33, 1.25, 14);
      g.translate(64.9, 4.4 + 0.62, -1.35);
      batch.push(mats.stone, g);
      kit.box(64.5, 5.6, 65.3, 5.75, -1.75, -0.95, mats.stone, { radius: 0.03 });
    }
    hangIvy(batch, mats, 73, 2.65, 1.4, 1.2, 3.8);
    // muro del canal al fondo con arcos y caños
    for (let x = 47; x < 87; x += 6.5) {
      kit.pier(x, -3, 5.4, -9.2, 1.2, 1.2, mats.stoneWet);
      if (x + 6.5 < 88) kit.arch(x + 3.25, 2.2, 5.3, -9.2, 1.1, 0.5, mats.stoneWet, { voussoirs: 11 });
    }
    kit.box(46.4, -3, 87.6, 0.3, -9.8, -8.6, mats.stoneWet, { radius: 0.05 });
    kit.box(46.4, 5.4, 87.6, 6.4, -9.9, -8.5, mats.stone, { radius: 0.05 });
    // agua del canal, cascadas y rueda hidráulica
    // el agua acaba en el plano de sección; delante solo asoma en los huecos abiertos (bajo las
    // pasarelas el corte negro manda y no se ve una lámina de agua por delante del terreno)
    const water = buildWater({ x0: 46, x1: 88, z0: -9, z1: 1.9, y: wl, normalTex: tex.waterN, foamXs: [55, 58.2, 60.5, 76.6, 80, 83, 48.6, 62.4, 69.9] });
    scene.add(water.mesh);
    for (const [gx0, gx1] of [[55, 58.2], [80, 83]]) {
      const g = new THREE.PlaneGeometry(gx1 - gx0, 2.1, 1, 1);
      g.rotateX(-Math.PI / 2);
      g.translate((gx0 + gx1) / 2, wl, 1.9 + 1.05);
      scene.add(new THREE.Mesh(g, water.mat));
    }
    updaters.push((dt, t) => { water.mat.uniforms.time.value = t; });
    for (const fx of [60.5, 76.6]) {
      const f = buildWaterfall({ x: fx, y0: wl, y1: 2.8, z: -8.55, width: 2.2 });
      scene.add(f.mesh);
      updaters.push((dt, t) => { f.mat.uniforms.time.value = t; });
      game.mistSources.push({ x: fx, y: wl + 0.1, z: -8.2, w: 2 });
    }
    const wheel = buildWheel(2.4, 0.9, { woodUV: mats.woodUV, bronze: mats.bronze }, 12);
    wheel.position.set(69.9, 0.4, -5.2);
    scene.add(wheel);
    updaters.push((dt) => { wheel.rotation.z -= dt * 0.35; });
    kit.box(69.6, -3, 70.2, 0.6, -6.4, -6.0, mats.stoneWet);
    // postes de amarre y cuerda en primer plano
    foreground.push(fgPost(scene, mats, 57, 4.2));
    foreground.push(fgPost(scene, mats, 81.5, 3.8));
    grassRow(batch, mats, 58.4, 62.8, y, -2.0, rnd, 6);
    grassRow(batch, mats, 76, 79.8, y, -2.0, rnd, 6);
    // faroles de éter en el muro del canal (se reflejan en el agua)
    for (const lx of [53.5, 66.5, 79.5]) etherLamp(scene, mats, tex, lx, 5.0, -8.3, { color: 'teal', size: 1.75 });
    runeStrip(scene, 63.4, 67.1, 3.3, 1.64, { glyphs: 1.8 });
    // conducción maestra sobre el muro del canal y tomas que bajan a los caños
    pipeRun(batch, mats.bronze, [[46.6, 6.75, -9.15], [87.4, 6.75, -9.15]], { r: 0.2, flange: 3.25, flangeMat: mats.iron });
    for (const px of [53.5, 66.5, 79.5]) {
      pipeRun(batch, mats.bronze, [[px + 1.2, 6.75, -9.15], [px + 1.2, 6.75, -8.55], [px + 1.2, 4.2, -8.55]], { r: 0.09, flangeMat: mats.iron });
      valveWheel(batch, mats, px + 1.2, 5.3, -8.45, 0.22);
    }
  }

  // =====================================================================================
  // TALLER DEL MAESTRO (x 86..106)
  // =====================================================================================
  {
    const y = 1.6;
    kit.box(87.2, y - 0.05, 106, y, -3.4, 1.75, mats.floorInt, { radius: 0 });
    kit.box(86.2, -3.2, 131, y - 0.05, -3.8, 1.7, mats.plinth, { radius: 0.05 });
    kit.wall(86, 87.2, 5.4, 9.6, -3.4, 1.4, mats.stone);
    kit.pier(86.6, y, 5.4, 0.8, 1.2, 1.2, mats.stone);
    kit.wall(87.2, 104, y, 8.0, -3.5, -2.6, mats.stoneInt);
    kit.box(86, 8.0, 106, 9.0, -3.6, 1.2, mats.stoneInt, { radius: 0.05 });
    for (let x = 88; x < 105; x += 2.4) kit.beam(x - 0.16, x + 0.16, 7.8, -1.1, 0.4, 4.8, mats.wood);
    // ventana alta (un único haz)
    kit.wall(98.8, 100.6, 5.2, 6.8, -3.6, -2.5, mats.stone);
    addShaft(scene, shafts, tex, 99.7, 5.3, 6.7, 1.2, -2.6, 0.6);
    // forja apagada con brasas débiles y campana de humos
    kit.box(88.0, y, 90.6, y + 1.1, -2.6, -1.0, mats.stoneInt, { radius: 0.05 });
    kit.box(88.2, y + 1.1, 90.4, y + 1.3, -2.5, -1.1, mats.iron, { radius: 0.02 });
    {
      const hood = new THREE.CylinderGeometry(0.35, 1.25, 1.6, 4, 1, true);
      hood.rotateY(Math.PI / 4);
      hood.translate(89.3, y + 2.8, -1.8);
      batch.push(mats.stoneInt, hood);
      kit.box(88.95, y + 3.6, 89.65, 8, -2.2, -1.5, mats.stoneInt, { radius: 0.03 });
      const em = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.9), mats.ember);
      em.position.set(89.3, y + 1.33, -1.8);
      scene.add(em);
      const L = new THREE.PointLight('#ff6a2a', 2.2, 6, 2);
      L.position.set(89.3, y + 1.8, -0.9);
      scene.add(L); lights.push(L);
      updaters.push((dt, t) => { L.intensity = 2.0 + Math.sin(t * 7.3) * 0.25 + Math.sin(t * 13.1) * 0.15; mats.ember.emissiveIntensity = 2.0 + Math.sin(t * 5.1) * 0.4; });
      game.emberSources.push({ x: 89.3, y: y + 1.4, z: -1.8, w: 1.4 });
    }
    // banco de trabajo, herramientas y engranajes de pared
    kit.box(90.8, y + 0.85, 92.2, y + 0.95, -2.4, -1.4, mats.wood, { radius: 0.02 });
    for (const lx of [90.9, 92.1]) kit.post(lx, y, y + 0.85, -1.5, 0.12, mats.wood);
    for (const lx of [90.9, 92.1]) kit.post(lx, y, y + 0.85, -2.3, 0.12, mats.wood);
    for (let i = 0; i < 4; i++) {
      const g = new THREE.TorusGeometry(0.35 + i * 0.12, 0.05, 6, 18);
      g.translate(98 + i * 0.3, 5.0 - i * 0.6, -2.5);
      batch.push(mats.bronze, g);
    }
    // altillo con pedestal
    kit.box(92.5, 3.6, 97.5, 3.9, -2.4, 0.9, mats.wood, { radius: 0.02 });
    for (const px of [92.8, 97.2]) { kit.post(px, y, 3.6, 0.7, 0.24, mats.wood); kit.post(px, y, 3.6, -2.2, 0.24, mats.wood); }
    kit.railing(92.6, 97.4, 3.9, -2.2, mats.wood);
    lantern(scene, mats, lights, 93.2, 3.9, -1.9, 1.2);
    // escaleras de mano apoyadas (decoración)
    // compuerta, rueda y encaje
    kit.wall(104, 106, 6.0, 9.6, -3.4, 1.4, mats.stone);
    kit.box(103.7, y, 104.1, 6.0, -3.4, 1.4, mats.stone, { radius: 0.03 });
    kit.box(104.9, y, 105.3, 6.0, -3.4, 1.4, mats.stone, { radius: 0.03 });
    lantern(scene, mats, lights, 101.0, y + 2.6, -2.3, 1.0);
    // marco rúnico de la compuerta y lámpara del altillo
    runeStrip(scene, y, 103.68, 6.0, 1.45, { vertical: true, h: 0.04 });
    runeStrip(scene, y, 105.32, 6.0, 1.45, { vertical: true, h: 0.04 });
    runeStrip(scene, 103.7, 105.3, 6.06, 1.45, { glyphs: 9 });
    etherLamp(scene, mats, tex, 95.0, 6.3, -2.42);
    foreground.push(fgChain(scene, mats, 98.6, 8, 4.4, 2.8));
    sacks(batch, mats, 102.6, y, -1.8);
    // condensador de éter del maestro bajo la ventana alta, colector bajo las vigas y bajante al altillo
    etherTank(scene, batch, mats, tex, updaters, 100.2, y, -2.2, { h: 3.0, r: 0.4, seed: 3 });
    pipeRun(batch, mats.bronze, [[100.2, y + 3.0, -2.2], [100.2, 4.85, -2.32], [101.75, 4.85, -2.42], [101.75, 7.25, -2.42], [90.4, 7.25, -2.42]], { r: 0.1, flange: 2.4, flangeMat: mats.iron });
    pipeRun(batch, mats.bronze, [[96.7, 7.25, -2.42], [96.7, 3.95, -2.42]], { r: 0.07, flangeMat: mats.iron });
    pipeRun(batch, mats.bronze, [[97.6, 2.3, -2.45], [99.75, 2.3, -2.45], [99.8, 2.3, -2.25]], { r: 0.065, flangeMat: mats.iron });
    valveWheel(batch, mats, 96.7, 5.4, -2.3, 0.22);
    valveWheel(batch, mats, 101.75, 6.2, -2.3, 0.2);
    runeGauge(scene, batch, mats, 97.95, 6.05, -2.5, { r: 0.16, color: [0.35, 1.9, 2.4] });
    runeGauge(scene, batch, mats, 101.55, 3.25, -2.5, { r: 0.12 });
    // estantes del maestro, panoplia y estandarte sobre el altillo
    wallShelf(batch, mats, rnd, 90.6, 92.5, 3.55, -2.6);
    wallShelf(batch, mats, rnd, 90.6, 92.5, 4.35, -2.6);
    toolRack(batch, mats, rnd, 90.7, 92.4, 5.45, -2.6);
    wallShelf(batch, mats, rnd, 87.4, 88.0, 4.6, -2.6, { depth: 0.26 });
    banner(scene, mats, 93.7, 7.4, -2.5, 2.4, updaters);
    crate(kit, mats, 97.8, y, 98.6, 0.75, -1.9);
    barrel(batch, mats, 99.15, y, -1.6);
  }

  // =====================================================================================
  // TERRAZA DE DESCARGA (x 106..128)
  // =====================================================================================
  {
    const y = 1.6;
    kit.box(106, y - 0.05, 128, y, -3.8, 1.75, mats.floor, { radius: 0 });
    // balaustrada
    kit.box(106, y, 128, y + 0.18, -3.4, -2.8, mats.stone, { radius: 0.03 });
    for (let x = 106.3; x < 128; x += 0.45) {
      const g = new THREE.CylinderGeometry(0.09, 0.12, 0.72, 8);
      g.translate(x, y + 0.54, -3.1);
      batch.push(mats.stone, g);
    }
    kit.box(105.9, y + 0.9, 128.1, y + 1.06, -3.5, -2.7, mats.stone, { radius: 0.04 });
    // torre del extremo y Puerta del valle
    kit.box(128, -3, 136, 18, -6, 4, mats.stone, { radius: 0.1 });
    kit.pier(124.4, y, 8.0, -1.4, 1.3, 1.3, mats.stone);
    kit.arch(126.2, 8.0, 2.4, -1.4, 1.3, 0.5, mats.stone, { voussoirs: 9 });
    // bancos y cipreses cercanos
    kit.box(110, y, 112.2, y + 0.45, -2.4, -1.8, mats.stone, { radius: 0.04 });
    for (const [x, z, s] of [[114, -6.5, 1.0], [118.5, -7.5, 1.25], [109.5, -9, 1.1], [123, -8.5, 0.9]]) {
      cypress(batch, mats, x, -0.8, z, 1.0 * s, 7.5 * s, x, 14, true);
    }
    kit.box(106, -6, 128, -0.6, -12, -3.8, mats.rock, { radius: 0.3, cast: false });
    grassRow(batch, mats, 106.5, 127, y, -2.6, rnd, 24);
    hangIvy(batch, mats, 124.4, 8, 0.8, 3.2, 1.4);
    foreground.push(fgColumn(scene, mats, 113.5, y, 3.4, 3.6));
    etherLamp(scene, mats, tex, 124.4, 5.4, -0.68, { color: 'amber' });
    etherLamp(scene, mats, tex, 108.0, 3.4, -2.6, { color: 'teal', size: 1.3 });
    etherLamp(scene, mats, tex, 119.0, 3.4, -2.6, { color: 'teal', size: 1.3 });
  }

  // Sombreado de sección: el frente cortado del terreno se funde hacia la oscuridad (lectura del plano).
  for (const [x0, x1, top] of [[-9.5, 7, 0], [7, 11.5, 0.55], [11.5, 48, 1.6], [86.2, 128, 1.6]]) sectionShade(scene, tex, x0, x1, top);

  batch.build(scene);

  // =====================================================================================
  // Mecanismos, secretos y puntos de control
  // =====================================================================================
  const fountain1 = new RestFountain(game, { x: -3.0, y: 0, mats, tex, id: 'atrio' });
  const fountain2 = new RestFountain(game, { x: 88.9, y: 1.6, mats, tex, id: 'taller' });
  const wall = new CrackedWall(game, { x0: 41, x1: 41.8, y0: 4.4, y1: 7.6, mats });
  const fragment = new CaudalFragment(game, { x: 44.2, y: 4.4, tex });
  const pedestal = new ClavijaPedestal(game, { x: 95.6, y: 3.9, mats, tex });
  const gate = new SocketGate(game, { gateX0: 104.05, gateX1: 104.85, y0: 1.6, y1: 6.0, socketX: 102.6, socketY: 2.95, mats, tex });
  mechanisms.push(fountain1, fountain2, wall, fragment, pedestal, gate);
  // sello rúnico que cierra el paso del atrio: primera lección de la saeta (tres bloques de 1 m,
  // más altos que el salto; se deshacen en cascada al acertar a cualquiera)
  for (let k = 0; k < 3; k++) mechanisms.push(new RuneBlock(game, { x0: 13.6, y0: 1.6 + k, size: 1, depth: 2.4, mats, seal: 'atrio' }));

  // Pistas contextuales (una vez, legibles sin sonido, §18.3)
  const hint = (x0, x1, id, text, keys, cond, y0, y1) => triggers.push(new Trigger({ x0, x1, y0, y1, cond, fire: (g) => g.hud.hint(id, text, keys) }));
  hint(-8, -5, 'move', 'Moverse', ['A', 'D']);
  hint(3.5, 6.5, 'jump', 'Saltar · mantén para llegar más alto', ['Espacio']);
  hint(9.5, 12.5, 'shoot', 'Saeta de éter · mantén para cargar · W apunta arriba', ['J']);
  hint(14.5, 17.5, 'aim', 'Apuntado libre: mantén y elige dirección', ['Shift']);
  hint(22, 25, 'dash', 'Paso etéreo: impulso invulnerable, también en el aire', ['K']);
  hint(25.5, 29, 'defend', 'Golpe de éter justo antes del impacto: desvía y abre el contraconjuro', ['L', 'J']);
  hint(60.5, 63, 'ledge', 'Salta hacia un borde para agarrarte · ↑ para subir', ['Espacio', 'W']);
  hint(67.6, 70.6, 'slide', 'Corre y desliza por debajo', ['S']);
  hint(91.0, 92.5, 'loft', 'El altillo guarda algo: agárrate al borde', [], (g) => !g.hero.hasClavija);
  // títulos de zona
  for (const a of AREAS.slice(1)) triggers.push(new Trigger({ x0: a.x, x1: a.x + 3, fire: (g) => g.hud.areaTitle(a.name) }));
  // final del nivel
  triggers.push(new Trigger({ x0: 121.2, x1: 128, fire: (g) => g.finishLevel() }));

  // Enemigos: zonas de patrulla acotadas (no persiguen por todo el mapa)
  const enemySpawns = [
    { x: 38.5, y: 1.6, x0: 23.2, x1: 46.4, facing: -1, name: 'galeria' },
    { x: 117.5, y: 1.6, x0: 107.0, x1: 124.0, facing: -1, name: 'terraza' },
  ];

  // Vigías: tramo de vuelo acotado sobre la salida del paso bajo del canal
  const sentinelSpawns = [
    { x: 79.0, y: 5.3, x0: 76.2, x1: 85.4, name: 'canal' },
  ];

  const groundAt = (x) => { const g = physics.groundBelow(x, 20, 60); return g ? g.y1 : -3; };

  return {
    mats, updaters, foreground, lights, shafts, mechanisms, triggers, enemySpawns, sentinelSpawns, groundAt,
    update(dt, t) { for (const u of updaters) u(dt, t); },
  };
}

// ---------------------------------------------------------------------------------------
// Piezas auxiliares
// ---------------------------------------------------------------------------------------

function hangIvy(batch, mats, x, top, z, len, width, side = false) {
  const g = new THREE.PlaneGeometry(width, len, 1, 4);
  // ligera curvatura hacia fuera para que no sea una tarjeta plana
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, (1 - (p.getY(i) / len + 0.5)) * 0.15);
  if (side) g.rotateY(Math.PI / 2);
  g.translate(x, top - len / 2, z);
  batch.push(mats.ivy, g, { cast: true });
}

function grassRow(batch, mats, x0, x1, y, z, rnd, n) {
  for (let i = 0; i < n; i++) {
    const x = x0 + rnd() * (x1 - x0);
    const s = 0.35 + rnd() * 0.35;
    for (let k = 0; k < 2; k++) {
      const g = new THREE.PlaneGeometry(s * 1.4, s, 1, 1);
      g.rotateY(k * Math.PI / 2 + rnd());
      g.translate(x, y + s / 2 - 0.02, z + rnd() * 0.5);
      batch.push(mats.grass, g, { cast: false });
    }
  }
}

function crate(kit, mats, x0, y, x1, h, z = -0.6) {
  const d = (x1 - x0);
  kit.box(x0, y, x1, y + h, z - d / 2, z + d / 2, mats.wood, { radius: 0.03 });
  kit.box(x0 - 0.02, y + h * 0.45, x1 + 0.02, y + h * 0.55, z - d / 2 - 0.02, z + d / 2 + 0.02, mats.wood, { radius: 0.01 });
}

function barrel(batch, mats, x, y, z) {
  const pts = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector2(0.32 + Math.sin(t * Math.PI) * 0.06, t * 0.95)); }
  const g = new THREE.LatheGeometry(pts, 14);
  g.translate(x, y, z);
  batch.push(mats.wood, g);
  for (const hy of [0.15, 0.8]) {
    const r = new THREE.TorusGeometry(0.35, 0.018, 4, 18);
    r.rotateX(Math.PI / 2);
    r.translate(x, y + hy, z);
    batch.push(mats.iron, r);
  }
}

function sacks(batch, mats, x, y, z) {
  for (let i = 0; i < 3; i++) {
    const g = new THREE.SphereGeometry(0.32, 14, 10);
    // saco de arpillera: base aplastada, cuello atado y bultos irregulares
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      let px = p.getX(k), py = p.getY(k), pz = p.getZ(k);
      const bump = 1 + 0.07 * Math.sin(px * 17 + i * 3) * Math.cos(pz * 13 + py * 9);
      if (py < -0.12) py = -0.12 - (py + 0.12) * 0.25;
      const neck = py > 0.2 ? 1 - (py - 0.2) * 2.2 : 1;
      p.setXYZ(k, px * bump * neck, py, pz * bump * neck);
    }
    g.computeVertexNormals();
    g.scale(1, 0.85, 0.8);
    g.rotateZ((i - 1) * 0.25);
    g.translate(x + i * 0.45 - (i === 2 ? 0.7 : 0), y + 0.13 + (i === 2 ? 0.42 : 0), z);
    batch.push(mats.burlap, g);
  }
}

function addShaft(scene, shafts, tex, x, y0, y1, width, z, strength = 1) {
  // Tarjeta aditiva alineada con la luz solar entrante (no es luz volumétrica real, §9.8).
  const dir = SUN_DIR.clone().negate();
  const len = 9;
  const g = new THREE.PlaneGeometry(width, len, 1, 1);
  g.translate(0, -len / 2, 0);
  const mat = new THREE.MeshBasicMaterial({ map: tex.shaft, color: new THREE.Color('#ffcf98').multiplyScalar(0.22 * strength), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  // El haz se atenúa al cruzar por delante del plano de juego: ilumina el aire tras Aren sin velarlo.
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vWz;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWz = (modelMatrix * vec4(transformed, 1.0)).z;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWz;')
      .replace('#include <opaque_fragment>', 'diffuseColor.a *= 1.0 - 0.8 * smoothstep(-1.2, 0.6, vWz);\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => 'shaft-v1';
  for (let k = 0; k < 2; k++) {
    const m = new THREE.Mesh(g, mat);
    const yy = y0 + (y1 - y0) * (0.3 + k * 0.4);
    m.position.set(x, yy, z);
    // eje local -Y a lo largo de la luz; la cara mira a la cámara lo posible
    const axis = dir.clone();
    const n = new THREE.Vector3(0, 0, 1).addScaledVector(axis, -axis.z).normalize();
    const xAxis = new THREE.Vector3().crossVectors(axis.clone().negate(), n).normalize();
    const basis = new THREE.Matrix4().makeBasis(xAxis, axis.clone().negate(), n);
    m.quaternion.setFromRotationMatrix(basis);
    m.renderOrder = 4;
    scene.add(m);
    shafts.push({ mesh: m, x, y: (y0 + y1) / 2, z, base: 0.22 * strength });
  }
}

function lantern(scene, mats, lights, x, y, z, intensity) {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.28, 6, 1, true), mats.iron);
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.22, 6), mats.glass);
  const capm = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.12, 6), mats.iron);
  capm.position.y = 0.2;
  g.add(frame, glow, capm);
  g.position.set(x, y + 0.14, z);
  scene.add(g);
  const L = new THREE.PointLight('#ffb36b', intensity * 1.6, 6, 2);
  L.position.set(x, y + 0.35, z + 0.6);
  scene.add(L);
  lights.push(L);
}

function torch(scene, mats, lights, x, y, z, updaters) {
  const g = new THREE.Group();
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.3), mats.iron);
  bracket.position.set(0, -0.1, -0.1);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.5, 6), mats.wood);
  stick.rotation.x = 0.4;
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffb35c' }));
  flame.position.set(0, 0.28, 0.1);
  flame.scale.set(1, 1.6, 1);
  g.add(bracket, stick, flame);
  g.position.set(x, y, z);
  scene.add(g);
  const L = new THREE.PointLight('#ff9a4a', 3.2, 9, 2);
  L.position.set(x, y + 0.4, z + 0.5);
  scene.add(L); lights.push(L);
  const seed = x * 3.1;
  updaters.push((dt, t) => {
    const f = Math.sin(t * 9 + seed) * 0.5 + Math.sin(t * 17.3 + seed * 2) * 0.3 + Math.sin(t * 4.1) * 0.2;
    L.intensity = 3.0 + f * 0.45;
    flame.scale.set(1 + f * 0.08, 1.6 + f * 0.25, 1);
  });
}

function banner(scene, mats, x, top, z, len, updaters) {
  const g = new THREE.PlaneGeometry(1.0, len, 1, 10);
  g.translate(0, -len / 2, 0);
  const m = new THREE.Mesh(g, mats.banner);
  m.position.set(x, top, z);
  m.castShadow = true; m.receiveShadow = true;
  scene.add(m);
  const base = Float32Array.from(g.attributes.position.array);
  const pos = g.attributes.position;
  updaters.push((dt, t) => {
    for (let i = 0; i < pos.count; i++) {
      const yy = base[i * 3 + 1];
      const k = -yy / len;
      pos.array[i * 3 + 2] = base[i * 3 + 2] + Math.sin(t * 1.3 + yy * 1.7 + x) * 0.05 * k;
      pos.array[i * 3] = base[i * 3] + Math.sin(t * 0.9 + yy + x) * 0.02 * k;
    }
    pos.needsUpdate = true;
  });
  g.computeVertexNormals();
}

// Objetos de primer plano con material propio para poder desvanecerlos.
function fgMat(mat) {
  const m = mat.clone();
  m.onBeforeCompile = mat.onBeforeCompile;
  m.customProgramCacheKey = mat.customProgramCacheKey;
  if (mat.userData.tp) m.userData.tp = mat.userData.tp;
  m.transparent = true;
  m.opacity = 1;
  return m;
}

function fgColumn(scene, mats, x, y, z, h) {
  const mat = fgMat(mats.stone);
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.48, h, 18), mat);
  shaft.position.set(x, y + h / 2, z);
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.32, 1.25), mat);
  base.position.set(x, y + 0.16, z);
  g.add(shaft, base);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(g);
  return { group: g, mats: [mat], x0: x - 0.6, x1: x + 0.6, y0: y, y1: y + h, z };
}

function fgFacade(scene, mats, x0, x1, y0, y1, z0, z1) {
  const mat = fgMat(mats.stoneInt);
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  g.add(m);
  // imposta y sillares sueltos para que no sea una caja lisa
  const band = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 0.1, 0.22, z1 - z0 + 0.12), mat);
  band.position.set((x0 + x1) / 2, y0 + 0.11, (z0 + z1) / 2);
  g.add(band);
  scene.add(g);
  return { group: g, mats: [mat], x0, x1, y0, y1, z: z1 };
}

function fgPier(scene, mats, x, y0, y1, z) {
  const mat = fgMat(mats.stoneInt);
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, y1 - y0 + 1.2, 0.9), mat);
  m.position.set(x, (y0 + y1 + 1.2) / 2, z);
  m.castShadow = true;
  g.add(m);
  scene.add(g);
  return { group: g, mats: [mat], x0: x - 0.45, x1: x + 0.45, y0, y1: y1 + 1.2, z };
}

function fgPost(scene, mats, x, h) {
  const mat = fgMat(mats.wood);
  const g = new THREE.Group();
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, h, 8), mat);
  p.position.set(x, 1.6 - 1.2 + h / 2, 2.9);
  p.castShadow = true;
  const rope = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 6, 14), mat);
  rope.position.set(x, 1.6 + h * 0.45, 2.9);
  rope.rotation.x = Math.PI / 2;
  g.add(p, rope);
  scene.add(g);
  return { group: g, mats: [mat], x0: x - 0.3, x1: x + 0.3, y0: 0.4, y1: 0.4 + h, z: 2.9 };
}

function fgChain(scene, mats, x, top, len, z) {
  const mat = mats.iron.clone();
  mat.transparent = true;
  const g = new THREE.Group();
  const n = Math.floor(len / 0.11);
  for (let i = 0; i < n; i++) {
    const l = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.018, 5, 10), mat);
    l.position.set(x, top - i * 0.11, z);
    if (i % 2) l.rotation.y = Math.PI / 2;
    g.add(l);
  }
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 6, 12, Math.PI * 1.4), mat);
  hook.position.set(x, top - len - 0.12, z);
  g.add(hook);
  scene.add(g);
  return { group: g, mats: [mat], x0: x - 0.2, x1: x + 0.2, y0: top - len - 0.3, y1: top, z };
}

function sectionShade(scene, tex, x0, x1, top) {
  if (!tex.section) {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(10,9,8,0)'); g.addColorStop(0.12, 'rgba(10,9,8,0.25)'); g.addColorStop(0.55, 'rgba(10,9,8,0.82)'); g.addColorStop(1, 'rgba(10,9,8,0.97)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 256);
    tex.section = new THREE.CanvasTexture(c);
    tex.section.colorSpace = THREE.SRGBColorSpace;
  }
  const h = 4.6;
  const g = new THREE.PlaneGeometry(x1 - x0, h);
  g.translate((x0 + x1) / 2, top - 0.12 - h / 2, 1.79);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex.section, transparent: true, depthWrite: false, fog: false }));
  m.renderOrder = 2;
  scene.add(m);
}

// Ciprés: perfil de llama con masas de follaje desplazadas por ruido (no un cono liso).
function cypress(batch, mats, x, baseY, z, r, h, seed, seg, cast) {
  const pts = [];
  const n = seg + 4;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const rr = r * Math.pow(Math.sin(Math.PI * Math.min(1, Math.pow(t, 0.62))), 0.9) * (1 - t * 0.25) + 0.001;
    pts.push(new THREE.Vector2(rr, t * h));
  }
  const g = new THREE.LatheGeometry(pts, seg);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
    const k = 1 + (valueNoise3(vx * 2.2 + seed, vy * 1.4, vz * 2.2, 3) - 0.5) * 0.55 + (valueNoise3(vx * 6 + seed, vy * 5, vz * 6, 5) - 0.5) * 0.2;
    p.setXYZ(i, vx * k, vy, vz * k);
  }
  g.computeVertexNormals();
  g.translate(x, baseY, z);
  batch.push(mats.foliage, g, { cast });
}

// ---- Acentos de éter (iteración 4) ---------------------------------------------------------
// Puntos y líneas luminosas saturadas sobre la piedra: dan escala y ritmo a cada sala y contrastan
// con su tono dominante (principio del género: fondo rico y oscuro, acentos pequeños y vivos).
const ETHER = { cyan: [0.35, 1.9, 2.4], teal: [0.25, 1.5, 1.2], amber: [2.4, 1.2, 0.35] };
function etherLamp(scene, mats, tex, x, y, z, { color = 'cyan', size = 1 } = {}) {
  const c = ETHER[color];
  const g = new THREE.Group();
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.075 * size, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(...c), fog: false }));
  crystal.scale.set(1, 1.9, 1);
  g.add(crystal);
  // jaula de hierro y ménsula
  for (let i = 0; i < 4; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.34 * size, 0.018), mats.iron);
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    bar.position.set(Math.cos(a) * 0.09 * size, 0, Math.sin(a) * 0.09 * size);
    g.add(bar);
  }
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.13 * size, 0.08, 8), mats.iron);
  cap.position.y = 0.2 * size;
  g.add(cap);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.34), mats.iron);
  arm.position.set(0, 0.22 * size, -0.2);
  g.add(arm);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.dot, color: new THREE.Color(c[0] * 0.28, c[1] * 0.28, c[2] * 0.28), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  halo.scale.setScalar(1.1 * size);
  g.add(halo);
  g.position.set(x, y, z);
  scene.add(g);
  return { group: g, crystal, halo };
}
function runeStrip(scene, x0, x1, y, z, { color = 'cyan', h = 0.035, glyphs = 2.6, vertical = false } = {}) {
  const c = ETHER[color];
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(c[0] * 0.75, c[1] * 0.75, c[2] * 0.75), fog: false });
  const geos = [];
  if (vertical) {
    const g = new THREE.BoxGeometry(h, y - x0, 0.02); g.translate(x1, (x0 + y) / 2, z); geos.push(g);
  } else {
    const g = new THREE.BoxGeometry(x1 - x0, h, 0.02); g.translate((x0 + x1) / 2, y, z); geos.push(g);
    // glifos: trazos cortos sobre la línea (patrón propio, no texto)
    for (let x = x0 + glyphs / 2; x < x1 - 0.3; x += glyphs) {
      for (const [dx, dy, w, hh] of [[-0.09, 0.09, 0.025, 0.12], [0.0, 0.16, 0.16, 0.022], [0.09, 0.09, 0.025, 0.12], [0, 0.04, 0.025, 0.06]]) {
        const q = new THREE.BoxGeometry(w, hh, 0.02); q.translate(x + dx, y + dy, z); geos.push(q);
      }
    }
  }
  const m = new THREE.Mesh(mergeGeometries(geos), mat);
  scene.add(m);
  return m;
}
