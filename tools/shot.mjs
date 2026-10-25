// Captura una URL del servidor de desarrollo en headless (uso: node tools/shot.mjs <ruta> <salida.png> [ancho alto])
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [,, path, out, w = '1280', h = '720'] = process.argv;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(`http://localhost:5173/${path}`);
await page.waitForFunction(() => document.title === 'ready' || window.__error, null, { timeout: 120000 }).catch(() => {});
const info = await page.evaluate(() => window.__info || window.__error || null);
await page.screenshot({ path: out });
console.log(JSON.stringify(info));
if (logs.length) console.log(logs.slice(0, 20).join('\n'));
await browser.close();
