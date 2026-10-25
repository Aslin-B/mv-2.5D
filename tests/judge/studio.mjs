// Capturas del estudio del personaje (studio.html): mismos modelo, animador, tela y poder que el
// juego, en encuadres fijos. Uso: node tests/judge/studio.mjs <carpeta> vista[:ancho×alto] ...
// Vistas: bind idle front face back hands seed condense eclipse launch.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const [outDir, ...specs] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const url = process.env.STUDIO_URL || 'http://localhost:5173/studio.html';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 800 } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const t0 = Date.now();
await page.goto(url, { timeout: 300000, waitUntil: 'commit' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
console.log('carga', ((Date.now() - t0) / 1000).toFixed(1), 's', JSON.stringify(await page.evaluate(() => window.__studio.info())));
for (const spec of specs) {
  const [name, size = '800x800'] = spec.split(':');
  const [w, h] = size.split('x').map(Number);
  await page.setViewportSize({ width: w, height: h });
  await page.evaluate((n) => window.__studio.view(n), name);
  const file = `${outDir}/${name.replace(/-$/, '_')}.png`;
  await page.screenshot({ path: file });
  console.log(file);
}
if (logs.length) console.log(logs.slice(0, 30).join('\n'));
await browser.close();
