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
  await g.run({ right: true }, 16);
  await g.run({ right: true, down: true }, 2);
  await g.run({ right: true }, 70);
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
// T9 combate a distancia: saetas de éter (J) y saeta cargada (mantener J)
{
  // el saqueador vuelve a su puesto (las pruebas del canal lo despiertan a distancia)
  await g.eval(() => { const G = window.__game.game; G.resetEnemy(G.enemies[0]); });
  await g.teleport(33.0, 1.6, 1);
  // carga: mantener ~1 s y soltar (antes de que el saqueador se acerque)
  const hp0 = (await S()).enemies[0].hp;
  let maxCharge = 0;
  await g.input({ attack: true });
  for (let i = 0; i < 64; i++) { await g.step(1); maxCharge = Math.max(maxCharge, (await S()).charge); }
  await g.run({}, 24);
  let s = await S();
  check('Saeta cargada: carga completa y daño pesado', maxCharge >= 0.99 && hp0 - s.enemies[0].hp >= 35, `carga máx=${maxCharge.toFixed(2)} vida ${hp0}→${s.enemies[0].hp}`);
  const hpA = s.enemies[0].hp;
  const shots0 = s.stats.shots || 0;
  for (let k = 0; k < 4; k++) { await g.run({ attack: true }, 1); await g.run({}, 10); }
  s = await S();
  check('Las saetas dañan al saqueador a distancia', s.enemies[0].hp < hpA && (s.stats.shots || 0) >= shots0 + 4, `vida enemigo ${hpA}→${s.enemies[0].hp}, disparos=${s.stats.shots}`);
  for (let k = 0; k < 30 && s.enemies[0].state !== 'dead'; k++) {
    const dx = s.enemies[0].x - s.x;
    if (Math.abs(dx) < 2.2) await g.run({ left: dx > 0, right: dx < 0 }, 10);
    await g.run({ attack: true, right: dx > 0 && Math.abs(dx) < 0.01 }, 1); await g.run({}, 10);
    if (s.hp <= 2) await g.eval(() => { window.__game.game.hero.hp = 6; });
    s = await S();
  }
  check('El saqueador puede ser derrotado', s.enemies[0].hp <= 0 || s.enemies[0].state === 'dead', `estado=${s.enemies[0].state}`);
}
// T10 desvío con el golpe de éter (L) contra la estocada y contraconjuro (J)
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
  check('El golpe de éter desvía la estocada', parried, `intentos=${tries} estado enemigo=${est}`);
  if (parried) {
    await g.run({ attack: true }, 1); await g.run({}, 30);
    const s = await S();
    check('Contraconjuro tras el desvío (≥70 de daño)', s.enemies[1].hp <= 30, `vida enemigo=${s.enemies[1].hp}`);
  }
}
// T11 secreto: romper el muro agrietado con saetas y recoger el fragmento
{
  await g.teleport(40.2, 4.6, 1);
  await g.run({}, 20);
  for (let k = 0; k < 6; k++) { await g.run({ attack: true }, 1); await g.run({}, 26); }
  let s = await S();
  check('El muro agrietado se rompe con saetas', s.wallBroken === true, `roto=${s.wallBroken}`);
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
// T15 sello rúnico del atrio: el filo no lo rompe; una saeta lo deshace en cascada
{
  await g.teleport(12.6, 1.6, 1);
  await g.run({}, 10);
  await g.run({ right: true }, 20);
  let s = await S();
  check('El sello rúnico bloquea el paso', s.x < 13.6 && s.seals.every((b) => !b.broken), `x=${s.x.toFixed(2)}`);
  await g.run({ parry: true }, 1); await g.run({}, 30);
  s = await S();
  check('El golpe de éter no rompe el sello', s.seals.every((b) => !b.broken), `rotos=${s.seals.filter((b) => b.broken).length}`);
  await g.run({ attack: true }, 1); await g.run({}, 50);
  s = await S();
  check('Una saeta deshace el sello entero en cascada', s.seals.length === 3 && s.seals.every((b) => b.broken), `rotos=${s.seals.filter((b) => b.broken).length}/${s.seals.length}`);
  await g.run({ right: true }, 40);
  s = await S();
  check('Paso abierto tras el sello', s.x > 15, `x=${s.x.toFixed(2)}`);
}
// T16 paso etéreo: impulso rápido con invulnerabilidad
{
  await g.teleport(0, 0, 1);
  await g.run({}, 10);
  const x0 = (await S()).x;
  await g.run({ dodge: true }, 1);
  const inv = await g.eval(() => window.__game.game.hero.isInvulnerable());
  await g.run({}, 14);
  const s = await S();
  check('Paso etéreo: ~2 m en 0,2 s e invulnerable', s.x - x0 > 1.8 && inv, `Δx=${(s.x - x0).toFixed(2)} invulnerable=${inv}`);
}
// T17 vigía: dispara orbes; el golpe de éter los devuelve y el orbe devuelto lo destruye
{
  await g.eval(() => { const G = window.__game.game; for (const v of G.sentinels) v.reset(); G.hero.hp = G.hero.maxHp; });
  await g.teleport(77.2, 1.6, 1);
  let sawOrb = false, reflected = false;
  for (let i = 0; i < 900 && !reflected; i++) {
    const s = await S();
    const o = s.orbs[0];
    if (o) sawOrb = true;
    if (o && Math.hypot(o.x - s.x, o.y - (s.y + 1.0)) < 0.9) {
      await g.run({ parry: true }, 1);
      await g.run({}, 4);
      const s2 = await S();
      if (!s2.orbs.length) reflected = true;
    } else await g.run({}, 1);
    if (s.hp <= 2) await g.eval(() => { window.__game.game.hero.hp = 6; });
  }
  await g.run({}, 90);
  const s = await S();
  check('El vigía dispara orbes', sawOrb, `orbes vistos=${sawOrb}`);
  check('Orbe devuelto con el golpe de éter destruye al vigía', reflected && s.sentinels[0].state === 'dead', `devuelto=${reflected} vigía=${s.sentinels[0].state} vida=${s.sentinels[0].hp}`);
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
