// Pruebas funcionales deterministas (biblia §25.1): se ejecutan en Chromium sin cabeza con el
// juego en modo de prueba. Cada prueba coloca a Aren, simula entradas y comprueba el estado.
import { openGame } from '../harness.mjs';

const g = await openGame({ query: 'test=1&q=bajo&cine=0' });
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? 'OK  ' : 'FALLO'} ${name} — ${detail}`); };
const S = () => g.state();

// T1/T2 salto variable
{
  await g.teleport(0, 0, 1);
  let maxY = 0;
  await g.input({ jump: true });
  for (let i = 0; i < 50; i++) { await g.step(1); const s = await S(); maxY = Math.max(maxY, s.y); }
  await g.input({});
  check('Salto completo ~1,9 m', maxY > 1.75 && maxY < 2.05, `altura ${maxY.toFixed(2)} m`);
  await g.step(60);
  await g.teleport(0, 0, 1);
  await g.run({ jump: true }, 3);
  let maxH = 0;
  await g.input({});
  for (let i = 0; i < 40; i++) { await g.step(1); const s = await S(); maxH = Math.max(maxH, s.y); }
  check('Salto corto al soltar pronto', maxH < 1.1 && maxH > 0.3, `altura ${maxH.toFixed(2)} m`);
}
// T3 margen de borde (coyote): saltar 4 pasos después de dejar el suelo
{
  await g.teleport(53.2, 1.6, 1);
  await g.input({ right: true });
  let left = -1;
  for (let i = 0; i < 80; i++) { await g.step(1); const s = await S(); if (!s.grounded) { left = i; break; } }
  await g.step(4);
  await g.run({ right: true, jump: true }, 1);
  const s = await S();
  check('Margen de borde: salto tras dejar el suelo', left >= 0 && s.vy > 5, `vy=${s.vy.toFixed(2)} tras 5 pasos en el aire`);
  await g.run({ right: true, jump: true }, 30);
  await g.run({ right: true }, 40);
  const s2 = await S();
  check('Cruza el primer hueco del canal', s2.x > 58.2 && s2.y > 1.5, `x=${s2.x.toFixed(2)} y=${s2.y.toFixed(2)}`);
}
// T4 memoria de salto (buffer) al aterrizar
{
  await g.teleport(2, 1.2, 1);
  for (let i = 0; i < 40; i++) { await g.step(1); const s = await S(); if (s.y < 0.25 && s.vy < 0) break; }
  await g.run({ jump: true }, 1);
  await g.input({ jump: true });
  let jumped = false;
  for (let i = 0; i < 20; i++) { await g.step(1); const s = await S(); if (s.vy > 5) { jumped = true; break; } }
  await g.input({});
  check('Memoria de salto antes de aterrizar', jumped, jumped ? 'salta al tocar el suelo' : 'no saltó');
  await g.step(60);
}
// T5 colisión con muro
{
  await g.teleport(-8, 0, -1);
  await g.run({ left: true }, 90);
  const s = await S();
  check('No atraviesa el muro izquierdo', s.x >= -9.5 + 0.23, `x=${s.x.toFixed(3)}`);
  await g.input({});
}
// T6 agarre de borde y subida
{
  await g.teleport(61.3, 1.6, 1);
  await g.run({ right: true }, 8);
  await g.run({ right: true, jump: true }, 22);
  let hang = false;
  for (let i = 0; i < 60; i++) { await g.step(1); const s = await S(); if (s.mode === 'hang' || s.mode === 'mantle') { hang = true; break; } }
  await g.run({ right: true, up: true }, 50);
  const s = await S();
  check('Agarre de borde y subida al pilar', hang && s.y > 4.3, `agarre=${hang} y=${s.y.toFixed(2)}`);
  await g.input({});
}
// T7 deslizamiento bajo el muro derrumbado
{
  await g.teleport(68.0, 1.6, 1);
  await g.run({ right: true, run: true }, 16);
  await g.run({ right: true, run: true, down: true }, 2);
  await g.run({ right: true, run: true }, 70);
  const s = await S();
  check('Deslizamiento bajo el paso bajo', s.x > 75.6, `x=${s.x.toFixed(2)} modo=${s.mode}`);
  await g.run({}, 30);
  const s2 = await S();
  check('Se levanta al salir del paso', s2.mode === 'ground', `modo=${s2.mode}`);
}
// T8 caída al agua: vuelve al último suelo seguro sin daño
{
  await g.teleport(53.5, 1.6, 1);
  await g.run({}, 30);
  await g.run({ right: true }, 40);
  await g.run({}, 90);
  const s = await S();
  check('Caída al agua devuelve a suelo seguro', s.y > 1.5 && s.x < 55 && s.hp === s.maxHp, `x=${s.x.toFixed(2)} y=${s.y.toFixed(2)} vida=${s.hp}`);
}
// T9 combate: el saqueador recibe golpes y ataca
{
  await g.teleport(33.8, 1.6, 1);
  let hits = 0, hp0 = (await S()).enemies[0].hp;
  for (let k = 0; k < 40; k++) {
    const s = await S();
    const e = s.enemies[0];
    const dx = e.x - s.x;
    if (Math.abs(dx) > 1.6) await g.run({ right: dx > 0, left: dx < 0 }, 6);
    else { await g.run({ attack: true }, 1); await g.run({}, 12); }
    if (e.hp <= 0) break;
  }
  const s = await S();
  check('El saqueador recibe daño por barrido de hoja', s.enemies[0].hp < hp0, `vida enemigo ${hp0}→${s.enemies[0].hp}, golpes=${s.stats.hits}`);
  check('El saqueador puede ser derrotado', s.enemies[0].hp <= 0 || s.enemies[0].state === 'dead', `estado=${s.enemies[0].state}`);
  void hits;
}
// T10 parada precisa contra la estocada (segundo saqueador)
{
  await g.eval(() => { const G = window.__game.game; const e = G.enemies[1]; G.resetEnemy(e); });
  await g.teleport(115.4, 1.6, 1);
  let parried = false, tries = 0;
  for (let i = 0; i < 600 && !parried; i++) {
    const st = await g.eval(() => { const G = window.__game.game; const e = G.enemies[1]; return { st: e.state, t: e.attack ? e.attack.t : 0, x: e.x, hx: G.hero.x, hp: G.hero.hp }; });
    if (st.st === 'attack' && st.t > 0.55 && st.t < 0.6) { await g.run({ parry: true }, 2); tries++; }
    else await g.run({ right: st.x > st.hx && Math.abs(st.x - st.hx) > 2.2 }, 1);
    const s = await S();
    if (s.stats.parries > 0) parried = true;
    if (s.hp <= 1) await g.eval(() => { window.__game.game.hero.hp = 6; });
  }
  const est = await g.eval(() => window.__game.game.enemies[1].state);
  check('Parada precisa desvía la estocada', parried, `intentos=${tries} estado enemigo=${est}`);
  if (parried) {
    await g.run({ attack: true }, 1); await g.run({}, 30);
    const s = await S();
    check('Contraataque tras la parada', s.enemies[1].hp <= 30, `vida enemigo=${s.enemies[1].hp}`);
  }
}
// T11 secreto: romper el muro agrietado y recoger el fragmento
{
  await g.teleport(40.2, 4.6, 1);
  await g.run({}, 20);
  for (let k = 0; k < 6; k++) { await g.run({ attack: true }, 1); await g.run({}, 26); }
  let s = await S();
  check('El muro agrietado se rompe con la espada', s.wallBroken === true, `roto=${s.wallBroken}`);
  await g.run({ right: true }, 70);
  s = await S();
  check('Fragmento de caudal: +1 vaso de vida', s.maxHp === 7 && s.stats.secrets === 1, `vida máx=${s.maxHp} secretos=${s.stats.secrets}`);
}
// T12 clavija en el altillo
{
  await g.teleport(95.0, 4.1, 1);
  await g.run({}, 20);
  const pre = await g.eval(() => { const G = window.__game.game, h = G.hero; return `x=${h.x.toFixed(2)} y=${h.y.toFixed(2)} modo=${h.mode} bloqueado=${h.locked} estado=${G.state} cine=${G.cineTimer.toFixed(2)}`; });
  await g.run({ interact: true }, 2);
  await g.run({}, 140);
  const s = await S();
  check('Recoger la clavija de forja', s.hasClavija === true, `clavija=${s.hasClavija} (antes: ${pre})`);
}
// T13 compuerta con encaje
{
  await g.teleport(101.8, 1.8, 1);
  await g.run({}, 20);
  await g.run({ tool: true }, 2);
  await g.run({}, 240);
  let s = await S();
  check('La clavija abre la compuerta', s.gate === 'open', `compuerta=${s.gate}`);
  await g.run({ right: true }, 80);
  s = await S();
  check('Se puede pasar a la terraza', s.x > 105.5, `x=${s.x.toFixed(2)}`);
}
// T14 final del nivel
{
  await g.eval(() => { const G = window.__game.game; for (const e of G.enemies) if (e.alive) e.takeHit(999, e.x - 1); });
  await g.teleport(119.5, 1.6, 1);
  await g.run({ right: true }, 40);
  await g.run({}, 320);
  const s = await S();
  check('Fin del nivel con estadísticas', s.state === 'end', `estado=${s.state}`);
}
const errs = g.logs.filter((l) => !l.includes('AudioContext'));
check('Sin errores en consola', errs.length === 0, errs.slice(0, 3).join(' | ') || 'ninguno');
const okN = results.filter((r) => r.ok).length;
console.log(`\n${okN}/${results.length} pruebas superadas`);
await import('node:fs').then((fs) => fs.writeFileSync('tests/output/functional.json', JSON.stringify(results, null, 2)));
await g.close();
process.exit(okN === results.length ? 0 : 1);
