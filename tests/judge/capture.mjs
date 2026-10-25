// Juez de calidad: capturas REALES del juego (motor completo, perfil alto, 1280×720) en momentos
// clave, tiras de animación recortadas alrededor de Aren, métricas objetivas de imagen y de coste,
// y opcionalmente un vídeo del motor. Uso: node tests/judge/capture.mjs <iteración> [--video] [--solo=a,b]
// La puntuación final la emite el revisor siguiendo docs/CALIDAD.md con estas evidencias.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { openGame } from '../harness.mjs';

const iter = process.argv[2] || '0';
const withVideo = process.argv.includes('--video');
const soloArg = process.argv.find((a) => a.startsWith('--solo='));
const solo = soloArg ? soloArg.slice(7).split(',') : null;
const out = `tests/output/judge/it${iter}`;
fs.mkdirSync(out, { recursive: true });
const W = 1280, H = 720;

const g = await openGame({ query: 'test=1&q=alto', width: W, height: H });
const report = { iteration: iter, date: new Date().toISOString(), viewport: `${W}x${H}`, profile: 'alto', loadMs: g.loadMs, shots: {}, strips: {}, perf: {} };
report.info = await g.eval(() => window.__game.info());
const G = (fn, arg) => g.eval(fn, arg);
const hero = () => G(() => { const h = window.__game.game.hero; return { x: h.x, y: h.y, mode: h.mode, facing: h.facing, attack: h.attack && h.attack.id, at: h.attack ? h.attack.t : 0, rip: h.riposteWindow }; });
const enemy = (i) => G((i) => { const e = window.__game.game.enemies[i]; return { x: e.x, state: e.state, t: e.attack ? e.attack.t : 0, hp: e.hp, alive: e.alive }; }, i);
const want = (name) => !solo || solo.includes(name);

async function shot(name, note, { settle = true } = {}) {
  if (settle) await G(() => window.__game.settle());
  const m = await G(() => window.__game.measure());
  await g.page.screenshot({ path: `${out}/${name}.png`, timeout: 120000 });
  report.shots[name] = { note, hero: await hero(), ...m };
  console.log(`captura ${name}: héroe Δborde=${m.hero ? m.hero.edgeDelta : '-'} L*medio=${m.luma.mean} llamadas=${m.sceneCalls}`);
}

// Recorte centrado en el héroe para tiras de animación.
async function heroClip(w = 280, h = 300) {
  const p = await G(() => {
    const G = window.__game.game, h = G.hero, v = new (G.camera.cam.position.constructor)(h.x, h.y + 0.9, 0);
    v.project(G.camera.cam);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
  });
  const x = Math.max(0, Math.min(W - w, Math.round(p.x - w / 2)));
  const y = Math.max(0, Math.min(H - h, Math.round(p.y - h * 0.52)));
  return { x, y, width: w, height: h };
}

async function strip(name, note, frames, every, before) {
  const dir = `${out}/_tmp_${name}`;
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < frames; i++) {
    if (before) await before(i);
    await G(() => { window.__game.settle(); window.__game.render(); });
    await g.page.screenshot({ path: `${dir}/f${String(i).padStart(2, '0')}.png`, clip: await heroClip() });
    await g.step(every);
  }
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${dir}/f%02d.png`, '-filter_complex', `tile=${frames}x1:padding=4:color=0x0c0d0e`, `${out}/${name}.png`]);
  fs.rmSync(dir, { recursive: true, force: true });
  report.strips[name] = { note, frames, everySteps: every };
  console.log(`tira ${name}`);
}

// ---------------------------------------------------------------- capturas clave
if (want('01_retrato')) {
  await g.teleport(-6.5, 0, 1); await g.run({}, 90);
  await G(() => { const G = window.__game.game; G.introCine(); G.camera.cineW = 1; });
  await shot('01_retrato', 'Plano de presentación: rostro, materiales de piel, tela y metal (V01, V09)', { settle: false });
  await G(() => window.__game.cine(false));
}
if (want('02_carrera')) {
  await g.teleport(-5, 0, 1); await g.run({ right: true }, 45);
  await shot('02_carrera', 'Carrera en el atrio con luz exterior (V03)');
}
if (want('03_salto')) {
  await g.teleport(1.5, 0, 1); await g.run({ right: true }, 10); await g.run({ right: true, jump: true }, 20);
  await shot('03_salto', 'Salto cerca del vértice: silueta y lectura de altura');
}
if (want('04_galeria')) {
  await g.teleport(24, 1.6, 1); await g.run({ right: true }, 30); await g.run({}, 6);
  await shot('04_galeria', 'Galería interior con haces de luz y antorchas');
}
if (want('05_telegrafia')) {
  await G(() => { const G = window.__game.game; G.resetEnemy(G.enemies[0]); });
  await g.teleport(35.2, 1.6, 1); await g.run({}, 1);
  let ok = false;
  for (let i = 0; i < 900; i++) {
    const e = await enemy(0);
    if (e.state === 'attack' && e.t >= 0.42) { ok = true; break; }
    await g.step(1);
    await G(() => { const h = window.__game.game.hero; if (h.hp < 3) h.hp = 6; });
  }
  await shot('05_telegrafia', `Telegrafía de la estocada del saqueador (destello en la punta) ${ok ? '' : '[no se alcanzó]'}`);
  // parada precisa
  for (let i = 0; i < 40; i++) { const e = await enemy(0); if (e.t >= 0.56) break; await g.step(1); }
  await g.run({ parry: true }, 2); await g.run({}, 1);
  for (let i = 0; i < 30; i++) { const s = await g.state(); if (s.stats.parries > 0) break; await g.step(1); }
  await g.step(3);
  await shot('06_parada', 'Parada precisa: chispas, destello y retroceso del rival');
  // contraataque
  await g.run({ attack: true }, 1); await g.input({});
  for (let i = 0; i < 40; i++) { const h = await hero(); if (h.attack === 'riposte' && h.at >= 0.12) break; await g.step(1); }
  await shot('07_contraataque', 'Contraataque a dos manos tras la parada: estela e impacto');
  await g.run({}, 60);
}
if (want('08_borde')) {
  await g.teleport(61.3, 1.6, 1); await g.run({ right: true }, 8); await g.run({ right: true, jump: true }, 22);
  for (let i = 0; i < 60; i++) { const h = await hero(); if (h.mode === 'hang') break; await g.step(1); }
  await g.input({});
  await shot('08_borde', 'Agarre de borde en el pilar alto del canal');
  await g.run({ right: true, up: true }, 50); await g.input({});
}
if (want('09_desliz')) {
  await g.teleport(68.0, 1.6, 1); await g.run({ right: true, run: true }, 16); await g.run({ right: true, run: true, down: true }, 2);
  await g.run({ right: true, run: true }, 18);
  await shot('09_desliz', 'Deslizamiento bajo el muro derrumbado');
  await g.run({ right: true }, 60); await g.input({});
}
if (want('10_canal')) {
  await g.teleport(76.0, 1.6, 1); await g.run({ right: true }, 14); await g.run({}, 10);
  await shot('10_canal', 'Canal exterior: agua, cascada, rueda y profundidad atmosférica');
}
if (want('11_taller')) {
  await g.teleport(88.5, 1.6, 1); await g.run({ right: true }, 22); await g.run({}, 6);
  await shot('11_taller', 'Taller de la forja: luz cálida local, brasas y altillo');
}
if (want('12_clavija')) {
  await g.teleport(95.0, 3.9, 1); await g.run({}, 20);
  await g.run({ interact: true }, 2); await g.run({}, 52);
  await G(() => window.__game.cine(true));
  await shot('12_clavija', 'Plano corto al recoger la clavija de forja', { settle: false });
  await g.run({}, 120); await G(() => window.__game.cine(false));
}
if (want('13_compuerta')) {
  await g.teleport(101.8, 1.8, 1); await g.run({}, 20);
  const has = (await g.state()).hasClavija;
  if (!has) await G(() => { const G = window.__game.game; G.hero.hasClavija = true; });
  await g.run({ tool: true }, 2); await g.run({}, 130);
  await G(() => window.__game.cine(true));
  await shot('13_compuerta', 'La compuerta se eleva al encajar la clavija', { settle: false });
  await g.run({}, 200); await G(() => window.__game.cine(false));
}
if (want('14_terraza')) {
  await g.teleport(109.5, 1.6, 1); await g.run({ right: true }, 26); await g.run({}, 4);
  await shot('14_terraza', 'Terraza final: vista del valle y segundo saqueador');
}

// ---------------------------------------------------------------- tiras de animación
if (want('A1_carrera')) {
  await g.teleport(-6, 0, 1); await g.run({ right: true }, 40);
  await strip('A1_carrera', 'Ciclo de carrera: contacto, paso, impulso (cada 4 pasos de 1/60 s)', 8, 4);
  await g.input({});
}
if (want('A2_combo')) {
  await g.teleport(26, 1.6, 1); await g.run({}, 20);
  await strip('A2_combo', 'Cadena de tres cortes (cada 5 pasos)', 10, 5, async (i) => { await g.input(i === 0 || i === 3 || i === 6 ? { attack: true } : {}); });
  await g.input({});
}
if (want('A3_voltereta')) {
  await g.teleport(26, 1.6, 1); await g.run({}, 20);
  await strip('A3_voltereta', 'Voltereta de esquiva (cada 3 pasos)', 8, 3, async (i) => { await g.input(i === 0 ? { dodge: true, right: true } : { right: false }); });
  await g.input({});
}
if (want('A4_subida')) {
  await g.teleport(61.3, 1.6, 1); await g.run({ right: true }, 8); await g.run({ right: true, jump: true }, 22);
  for (let i = 0; i < 60; i++) { const h = await hero(); if (h.mode === 'hang') break; await g.step(1); }
  await g.input({}); await g.step(6);
  await strip('A4_subida', 'Colgado y subida al borde (cada 4 pasos)', 8, 4, async (i) => { await g.input(i >= 1 ? { up: true } : {}); });
  await g.input({});
}
if (want('A5_giro')) {
  await g.teleport(26, 1.6, 1); await g.run({ right: true }, 40);
  await strip('A5_giro', 'Giro de 180° en carrera: frenada y cambio de lado (cada 3 pasos)', 8, 3, async () => { await g.input({ left: true }); });
  await g.input({});
}

// ---------------------------------------------------------------- coste (indicativo)
report.perf.simMsPerStep = await G(() => { window.__game.setInput({ right: true }); return window.__game.simCost(180); });
await g.input({});
report.perf.note = 'Simulación y animación medidas en CPU dentro de Chromium sin cabeza; el renderizado usa SwiftShader (software), por lo que no se informa tiempo de GPU.';
report.logs = g.logs.filter((l) => !l.includes('AudioContext'));

// ---------------------------------------------------------------- vídeo del motor
if (withVideo) {
  const dir = `${out}/_frames`;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  let n = 0;
  const frame = async () => {
    await G(() => window.__game.render(1 / 30));
    await g.page.screenshot({ path: `${dir}/v${String(n++).padStart(4, '0')}.png` });
  };
  // Tramo 1: travesía del canal (salto de hueco, agarre, subida, deslizamiento, salto sobre el agua)
  await g.teleport(58.6, 1.6, 1);
  await G(() => window.__game.settle());
  const plan = [
    [{ right: true }, 24], [{ right: true, jump: true }, 26], [{ right: true }, 30], [{ right: true, up: true }, 40],
    [{ right: true }, 50], [{ right: true, run: true }, 26], [{ right: true, run: true, down: true }, 2],
    [{ right: true, run: true }, 70], [{ right: true, run: true, jump: true }, 26], [{ right: true }, 30], [{}, 24],
  ];
  for (const [inp, steps] of plan) {
    await g.input(inp);
    for (let k = 0; k < steps; k += 2) { await g.step(2); await frame(); }
  }
  // Tramo 2: duelo contra el saqueador de la galería
  await G(() => { const G = window.__game.game; G.resetEnemy(G.enemies[0]); G.hero.hp = G.hero.maxHp; });
  await g.teleport(34.4, 1.6, 1);
  await G(() => window.__game.settle());
  let after = 0;
  for (let k = 0; k < 520 && after < 50; k++) {
    const e = await enemy(0), h = await hero();
    const dx = e.x - h.x;
    let inp = {};
    if (!e.alive) { inp = { right: true }; after++; }
    else if (e.state === 'attack' && e.t >= 0.54 && e.t < 0.62) inp = { parry: true };
    else if (h.rip > 0) inp = { attack: true };
    else if (e.state === 'attack' && e.t < 0.54) inp = {};
    else if (Math.abs(dx) > 1.9) inp = { right: dx > 0, left: dx < 0 };
    else if (k % 9 === 0) inp = { attack: true };
    await g.input(inp);
    await g.step(2);
    await frame();
  }
  await g.input({});
  const mp4 = `${out}/motor.mp4`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', `${dir}/v%04d.png`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '21', '-preset', 'slow', '-movflags', '+faststart', mp4]);
  fs.rmSync(dir, { recursive: true, force: true });
  report.video = { file: 'motor.mp4', frames: n, fps: 30, note: 'Cada cuadro avanza 2 pasos de simulación (tiempo real de juego); grabado en software, no en tiempo real.' };
  console.log(`vídeo ${mp4} (${n} cuadros)`);
}

fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
console.log(`informe ${out}/report.json`);
await g.close();
