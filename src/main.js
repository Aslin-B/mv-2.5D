import './ui/style.css';
import { Game } from './app/game.js';

// Punto de entrada: muestra un aviso mientras se genera el mundo (mallas SDF y texturas
// procedurales) y arranca el bucle. Parámetros de URL: ?q=alto|medio|bajo, ?autostart=1,
// ?test=1 (paso controlado por pruebas), ?cine=0, ?x=&y= (aparición de depuración).

const params = Object.fromEntries(new URLSearchParams(window.location.search));
const canvas = document.getElementById('view');
const hudRoot = document.getElementById('hud');
const screensRoot = document.getElementById('screens');

const loading = document.createElement('div');
loading.className = 'loading';
loading.innerHTML = '<div class="l-title">Acueducto del Alba</div><div class="l-sub">Generando piedra, agua y acero…</div>';
document.body.appendChild(loading);

function boot() {
  let game;
  try {
    game = new Game({ canvas, hudRoot, screensRoot, params });
    game.init();
  } catch (err) {
    loading.innerHTML = `<div class="l-title">No se pudo iniciar</div><div class="l-sub">${String(err && err.message || err)}</div><div class="l-sub">Se necesita un navegador de escritorio con WebGL2.</div>`;
    console.error(err);
    return;
  }
  loading.remove();
  window.__game = game.testAPI();
  if (params.x !== undefined) game.hero.respawn(parseFloat(params.x), parseFloat(params.y || '2'));
  if (params.test === '1') {
    window.__game.start();
  } else if (params.autostart === '1') {
    game.screens.hide();
    game.start();
  } else {
    game.screens.title();
  }
  window.__ready = true;
  if (params.test !== '1') {
    const loop = (now) => { game.frame(now); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  } else game.render(1 / 60);
  canvas.focus();
}

requestAnimationFrame(() => setTimeout(boot, 30));
