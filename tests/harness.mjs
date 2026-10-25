// Arnés común: abre el juego en Chromium sin cabeza (WebGL2 por software, SwiftShader) en modo
// de prueba (?test=1): la simulación solo avanza cuando el guion lo pide, de forma determinista.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

// Matemática de las GPU de Apple (Safari): pow() con base negativa devuelve NaN. SwiftShader
// devuelve |x|^y, así que sin esta emulación las pruebas no ven los NaN que en un Mac dejaban la
// pantalla en negro. Se inserta tras las declaraciones de precisión de cada sombreador GLSL 3.
function emulateAppleMath() {
  const LIB = `
float apPow(float x, float y){ return x < 0.0 ? uintBitsToFloat(0x7fc00000u) : pow(x, y); }
vec2 apPow(vec2 x, vec2 y){ return vec2(apPow(x.x, y.x), apPow(x.y, y.y)); }
vec3 apPow(vec3 x, vec3 y){ return vec3(apPow(x.x, y.x), apPow(x.y, y.y), apPow(x.z, y.z)); }
vec4 apPow(vec4 x, vec4 y){ return vec4(apPow(x.x, y.x), apPow(x.y, y.y), apPow(x.z, y.z), apPow(x.w, y.w)); }
#define pow apPow
`;
  const orig = WebGL2RenderingContext.prototype.shaderSource;
  WebGL2RenderingContext.prototype.shaderSource = function (sh, src) {
    if (src.startsWith('#version 300 es')) {
      const lines = src.split('\n');
      let at = -1;
      for (let i = 0; i < Math.min(lines.length, 60); i++) if (/^precision\s/.test(lines[i])) at = i;
      if (at >= 0) { lines.splice(at + 1, 0, LIB); src = lines.join('\n'); }
    }
    return orig.call(this, sh, src);
  };
}

export async function openGame({ url = process.env.GAME_URL || 'http://localhost:5173/', query = 'test=1&q=medio', width = 1280, height = 720, appleMath = false } = {}) {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width, height } });
  if (appleMath) await page.addInitScript(emulateAppleMath);
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
