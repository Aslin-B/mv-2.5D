// Vista previa rápida: abre el juego una vez y captura posiciones concretas.
// Uso: GAME_URL=... node tests/judge/preview.mjs <carpeta> x,y[,pasos][,etiqueta] ...
import fs from 'node:fs';
import { openGame } from '../harness.mjs';

const [outDir, ...specs] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const g = await openGame({ query: 'test=1&q=alto' });
for (const s of specs) {
  const [x, y, steps = '20', name] = s.split(',');
  await g.teleport(+x, +y, 1);
  await g.run({}, +steps);
  const file = `${outDir}/${name || `x${x}`}.png`;
  await g.shot(file);
  console.log(file);
}
if (g.logs.length) console.log(g.logs.join('\n'));
await g.close();
