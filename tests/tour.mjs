// Recorrido de capturas por sala (diagnóstico visual rápido).
import { openGame } from './harness.mjs';
const q = process.argv[2] || 'medio';
const only = process.argv[3];
const g = await openGame({ query: 'test=1&q=' + q });
const spots = [
  ['atrio', 0.5, 0, 1], ['galeria', 30, 1.6, 1], ['canal', 60.5, 1.6, 1], ['canal2', 77.5, 1.6, 1],
  ['taller', 94, 1.6, 1], ['terraza', 113, 1.6, 1],
];
for (const [name, x, y, f] of spots) {
  if (only && !only.split(',').includes(name)) continue;
  await g.teleport(x, y, f);
  await g.run({}, 30);
  await g.shot(`tests/output/tour_${name}.png`);
}
console.log(g.logs.filter((l) => !l.includes('AudioContext')).slice(0, 20).join('\n'));
await g.close();
