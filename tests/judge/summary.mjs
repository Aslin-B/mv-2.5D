// Resume el informe del juez (report.json) en una tabla Markdown con las métricas objetivas.
// Uso: node tests/judge/summary.mjs <iteración>
import fs from 'node:fs';

const iter = process.argv[2] || '0';
const r = JSON.parse(fs.readFileSync(`tests/output/judge/it${iter}/report.json`, 'utf8'));
const shots = Object.entries(r.shots);
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : 0; };
const heroD = shots.map(([, v]) => v.hero ? v.hero.edgeDelta : 0);
const enemyD = shots.flatMap(([, v]) => v.enemies.map((e) => e.edgeDelta));
const calls = shots.map(([, v]) => v.sceneCalls);
const tris = shots.map(([, v]) => v.sceneTris);
const mcalls = shots.map(([, v]) => v.mainCalls).filter(Boolean);
const mtris = shots.map(([, v]) => v.mainTris).filter(Boolean);

const lines = [];
lines.push(`| Captura | L* medio | L* p5–p95 | Recorte % | Negro % | Héroe Δ borde | Enemigos Δ borde | Llamadas (principal / con sombras) | Triángulos (principal / con sombras) |`);
lines.push(`|---|---|---|---|---|---|---|---|---|`);
for (const [k, v] of shots) {
  lines.push(`| ${k} | ${v.luma.mean} | ${v.luma.p5}–${v.luma.p95} | ${v.luma.clipPct} | ${v.luma.crushPct} | ${v.hero ? v.hero.edgeDelta : '—'} | ${v.enemies.map((e) => e.edgeDelta).join(', ') || '—'} | ${v.mainCalls ?? '—'} / ${v.sceneCalls} | ${v.mainTris ? (v.mainTris / 1000).toFixed(0) + 'k' : '—'} / ${(v.sceneTris / 1000).toFixed(0)}k |`);
}
lines.push('');
lines.push(`- Mediana de separación del héroe (Δ L* en el borde de la silueta): **${med(heroD).toFixed(1)}**; capturas con Δ ≥ 12: **${heroD.filter((d) => d >= 12).length}/${heroD.length}**.`);
const heights = shots.map(([, v]) => v.hero && v.hero.heightPct).filter(Boolean);
if (heights.length) lines.push(`- Altura de Aren en pantalla (mediana): **${med(heights).toFixed(1)} %** del alto del cuadro (objetivo v2: 14–20 %).`);
lines.push(`- Mediana de separación de enemigos: **${enemyD.length ? med(enemyD).toFixed(1) : '—'}** (${enemyD.length} mediciones).`);
if (mcalls.length) lines.push(`- Pase principal de la escena: ${Math.min(...mcalls)}–${Math.max(...mcalls)} llamadas de dibujo, ${(Math.min(...mtris) / 1000).toFixed(0)}k–${(Math.max(...mtris) / 1000).toFixed(0)}k triángulos (presupuesto de la biblia: 80–160 llamadas, 150k–400k triángulos).`);
lines.push(`- Con el pase de sombras: ${Math.min(...calls)}–${Math.max(...calls)} llamadas; ${(Math.min(...tris) / 1000).toFixed(0)}k–${(Math.max(...tris) / 1000).toFixed(0)}k triángulos.`);
lines.push(`- Simulación y animación en CPU: **${r.perf.simMsPerStep.toFixed(2)} ms** por paso de 1/60 s. Carga de la página en el navegador sin cabeza: ${(r.loadMs / 1000).toFixed(1)} s (construcción del mundo ${(r.info.buildMs / 1000).toFixed(1)} s).`);
lines.push(`- Triángulos de personajes: Aren ${(r.info.heroTris / 1000).toFixed(1)}k, saqueador ${(r.info.marauderTris / 1000).toFixed(1)}k. Errores de consola: ${r.logs.length}.`);
const md = lines.join('\n');
fs.writeFileSync(`tests/output/judge/it${iter}/metricas.md`, md + '\n');
console.log(md);
