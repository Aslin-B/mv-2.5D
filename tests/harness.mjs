// Arnés común: abre el juego en Chromium sin cabeza (WebGL2 por software, SwiftShader) en modo
// de prueba (?test=1): la simulación solo avanza cuando el guion lo pide, de forma determinista.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

export async function openGame({ url = 'http://localhost:5173/', query = 'test=1&q=medio', width = 1280, height = 720 } = {}) {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width, height } });
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  const t0 = Date.now();
  await page.goto(`${url}?${query}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 240000 });
  const loadMs = Date.now() - t0;
  const g = {
    page, browser, logs, loadMs,
    eval: (fn, arg) => page.evaluate(fn, arg),
    async input(v) { await page.evaluate((v) => window.__game.setInput(v), v); },
    async step(n) { await page.evaluate((n) => window.__game.step(n), n); },
    async run(v, n) { await g.input(v); await g.step(n); },
    async teleport(x, y, f = 1) { await page.evaluate(([x, y, f]) => { window.__game.setInput({}); window.__game.teleport(x, y, f); }, [x, y, f]); },
    async state() { return page.evaluate(() => window.__game.state()); },
    async shot(path, { settle = true } = {}) { await page.evaluate((st) => { if (st) window.__game.settle(); window.__game.render(); }, settle); await page.screenshot({ path }); },
    async close() { await browser.close(); },
  };
  return g;
}
