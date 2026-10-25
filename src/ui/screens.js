import { QUALITY } from '../render/post.js';

// Pantallas: título, pausa (con confirmación para reiniciar, §18.2), muerte y final con estadísticas.
// Navegables con teclado (flechas + Intro) y ratón, con foco visible.

export class Screens {
  constructor(root, game) {
    this.root = root;
    this.game = game;
    this.current = null;
    this.items = [];
    this.sel = 0;
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) { this.activate(b.dataset.act); e.stopPropagation(); }
    });
  }

  render(html) {
    this.root.innerHTML = html;
    this.root.classList.add('on');
    this.items = [...this.root.querySelectorAll('[data-act]')];
    this.sel = 0;
    this.focus();
  }

  focus() {
    this.items.forEach((el, i) => el.classList.toggle('sel', i === this.sel));
    if (this.items[this.sel]) this.items[this.sel].focus({ preventScroll: true });
  }

  hide() { this.current = null; this.root.classList.remove('on'); this.root.innerHTML = ''; }

  nav(a) {
    if (!this.current) return false;
    if (a === 'up' || a === 'left') { this.sel = (this.sel - 1 + this.items.length) % this.items.length; this.focus(); this.game.audio.play('ui'); return true; }
    if (a === 'down' || a === 'right') { this.sel = (this.sel + 1) % this.items.length; this.focus(); this.game.audio.play('ui'); return true; }
    if (a === 'confirm' || a === 'jump') { const it = this.items[this.sel]; if (it) this.activate(it.dataset.act); return true; }
    if (a === 'pause' && this.current === 'pause') { this.activate('resume'); return true; }
    return false;
  }

  activate(act) {
    const g = this.game;
    g.audio.unlock();
    g.audio.play('ui');
    switch (act) {
      case 'start': this.hide(); g.start(); break;
      case 'resume': this.hide(); g.resume(); break;
      case 'quality': {
        const keys = Object.keys(QUALITY);
        const i = (keys.indexOf(g.settings.quality) + 1) % keys.length;
        g.setQuality(keys[i]);
        this.refresh();
        break;
      }
      case 'shake': g.settings.shake = !g.settings.shake; g.applySettings(); this.refresh(); break;
      case 'mute': g.settings.mute = !g.settings.mute; g.applySettings(); this.refresh(); break;
      case 'restart': this.confirmRestart(); break;
      case 'restartYes': this.hide(); g.restart(); break;
      case 'restartNo': this.pause(); break;
      case 'again': this.hide(); g.restart(); break;
      default: break;
    }
  }

  refresh() {
    if (this.current === 'title') this.title(true);
    else if (this.current === 'pause') this.pause(true);
  }

  settingsRows() {
    const s = this.game.settings;
    return `
      <button data-act="quality">Calidad gráfica: <b>${QUALITY[s.quality].label}</b></button>
      <button data-act="shake">Sacudidas de cámara: <b>${s.shake ? 'sí' : 'reducidas'}</b></button>
      <button data-act="mute">Sonido: <b>${s.mute ? 'silenciado' : 'activado'}</b></button>`;
  }

  title(keepSel = false) {
    const sel = this.sel;
    this.current = 'title';
    this.render(`
      <div class="panel title">
        <div class="kicker">Primer nivel de prueba</div>
        <h1>Acueducto del Alba</h1>
        <div class="rule"></div>
        <p class="lead">Aren Valdara, antiguo guardián de pasos y puentes, vuelve al valle al amanecer. Las compuertas del acueducto siguen cerradas.</p>
        <div class="menu">
          <button data-act="start" class="primary">Empezar</button>
          ${this.settingsRows()}
        </div>
        <div class="controls">
          <div><kbd>A</kbd><kbd>D</kbd> mover</div><div><kbd>Espacio</kbd> saltar</div><div><kbd>Shift</kbd> correr</div>
          <div><kbd>J</kbd> atacar</div><div><kbd>K</kbd> esquivar</div><div><kbd>L</kbd> parar</div>
          <div><kbd>S</kbd> deslizar</div><div><kbd>E</kbd> interactuar</div><div><kbd>Q</kbd> herramienta</div>
          <div><kbd>Esc</kbd> pausa</div><div><kbd>M</kbd> silencio</div><div><kbd>F3</kbd> rendimiento</div>
        </div>
        <p class="fine">Diseñado para teclado o mando. Todo el arte, la animación, el sonido y la música se generan por código.</p>
      </div>`);
    if (keepSel) { this.sel = sel; this.focus(); }
  }

  pause(keepSel = false) {
    const sel = this.sel;
    this.current = 'pause';
    this.render(`
      <div class="panel small">
        <h2>Pausa</h2>
        <div class="menu">
          <button data-act="resume" class="primary">Continuar</button>
          ${this.settingsRows()}
          <button data-act="restart">Reiniciar el nivel</button>
        </div>
      </div>`);
    if (keepSel) { this.sel = sel; this.focus(); }
  }

  confirmRestart() {
    this.current = 'confirm';
    this.render(`
      <div class="panel small">
        <h2>¿Reiniciar el nivel?</h2>
        <p class="lead">Se perderá el progreso de esta partida.</p>
        <div class="menu row">
          <button data-act="restartNo" class="primary">No, volver</button>
          <button data-act="restartYes">Sí, reiniciar</button>
        </div>
      </div>`);
  }

  end(stats) {
    this.current = 'end';
    const t = stats.time;
    const mm = Math.floor(t / 60), ss = Math.floor(t % 60).toString().padStart(2, '0');
    this.render(`
      <div class="panel title">
        <div class="kicker">Fin del primer nivel</div>
        <h1>La compuerta cede</h1>
        <div class="rule"></div>
        <p class="lead">El agua vuelve a correr por el acueducto. El valle espera.</p>
        <div class="stats">
          <div><span>Tiempo</span><b>${mm}:${ss}</b></div>
          <div><span>Saqueadores vencidos</span><b>${stats.kills} / ${stats.enemies}</b></div>
          <div><span>Paradas precisas</span><b>${stats.parries}</b></div>
          <div><span>Daño recibido</span><b>${stats.damage}</b></div>
          <div><span>Secretos</span><b>${stats.secrets} / 1</b></div>
        </div>
        <div class="menu"><button data-act="again" class="primary">Jugar de nuevo</button></div>
      </div>`);
  }
}
