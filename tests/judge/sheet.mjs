// Juez v3 · lámina del motor: captura en el estudio del personaje los mismos siete encuadres que la
// lámina de referencia (cuerpo de 3/4 con la esfera, rostro, espalda y las cuatro fases del poder),
// cada uno con el tamaño de su recuadro, y los compone con tests/judge/sheet.py.
// Uso: node tests/judge/sheet.mjs <carpeta> [--ref <lámina de referencia>]
// La lámina de referencia nunca se copia al repositorio: solo se lee para la comparación lado a lado
// (que se guarda fuera del repositorio) y para las cifras de tests/judge/referencia_mago.json.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const outDir = args[0];
const refIdx = args.indexOf('--ref');
const ref = refIdx > 0 ? args[refIdx + 1] : null;
fs.mkdirSync(outDir, { recursive: true });

// Recuadros de la lámina (1536×1024): fila superior a 665 px de alto y fila de fases a 320 px.
export const PANELS = [
  { view: 'front', w: 630, h: 665 },
  { view: 'face', w: 570, h: 665 },
  { view: 'back', w: 336, h: 665 },
  { view: 'seed', w: 384, h: 320 },
  { view: 'condense', w: 384, h: 320 },
  { view: 'eclipse', w: 384, h: 320 },
  { view: 'launch', w: 384, h: 320 },
];

const url = process.env.STUDIO_URL || 'http://localhost:5173/studio.html';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 800 } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const t0 = Date.now();
await page.goto(url, { timeout: 300000, waitUntil: 'commit' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
const info = await page.evaluate(() => window.__studio.info());
console.log('carga', ((Date.now() - t0) / 1000).toFixed(1), 's', JSON.stringify({ buildMs: Math.round(info.buildMs), triangles: info.triangles, trianglesHi: info.trianglesHi }));
// supermuestreo ×2 en los recuadros pequeños: la lámina de referencia es una imagen pintada a
// alta resolución y el motor se compara al mismo tamaño final
for (const p of PANELS) {
  const ss = p.h < 400 ? 2 : 1;
  await page.setViewportSize({ width: p.w * ss, height: p.h * ss });
  await page.evaluate((n) => window.__studio.view(n), p.view);
  await page.screenshot({ path: `${outDir}/${p.view}.png` });
}
if (logs.length) console.log(logs.slice(0, 30).join('\n'));
await browser.close();
const py = ['tests/judge/sheet.py', outDir];
if (ref) py.push('--ref', ref);
console.log(execFileSync('python3', py, { encoding: 'utf8' }));
