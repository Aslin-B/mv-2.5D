// Interfaz propia (biblia §18.1): metal envejecido y líneas de cartografía hidráulica.
// Vida en "vasos de caudal", herramienta activa con silueta propia, pistas legibles sin sonido,
// títulos de zona y avisos de interacción anclados al objeto.

const CLAVIJA_SVG = `<svg viewBox="0 0 40 40" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
<circle cx="20" cy="12" r="6.5"/><path d="M20 18.5 V35"/><path d="M15 31 h10"/>
<path d="M20 2.5v3M27.5 5.5l-2 2M30 12h-3M12.5 5.5l2 2M10 12h3"/></g></svg>`;

const VESSEL = (fill) => `<svg viewBox="0 0 22 30" aria-hidden="true">
<path d="M11 2 C11 2 3 13 3 19 a8 8 0 0 0 16 0 C19 13 11 2 11 2Z" fill="${fill ? 'url(#hvg)' : 'rgba(20,24,24,0.55)'}" stroke="#b79b68" stroke-width="1.4"/>
${fill ? '<path d="M7 19 a4 4 0 0 0 4 4" stroke="rgba(255,255,255,0.55)" stroke-width="1.3" fill="none"/>' : ''}
</svg>`;

export class HUD {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <svg width="0" height="0" style="position:absolute"><defs><linearGradient id="hvg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#8fe0d6"/><stop offset="1" stop-color="#2f7f7a"/></linearGradient></defs></svg>
      <div class="hud-top">
        <div class="hp" aria-label="Vida"></div>
        <div class="tool" aria-label="Herramienta"><span class="tool-icon">${CLAVIJA_SVG}</span><span class="tool-key">Q</span></div>
      </div>
      <div class="area-title"><div class="line"></div><div class="name"></div><div class="sub"></div><div class="line"></div></div>
      <div class="hint"><div class="keys"></div><div class="text"></div></div>
      <div class="prompt"><span class="k"></span><span class="t"></span></div>
      <div class="banner"><div class="b-title"></div><div class="b-text"></div></div>
      <div class="toast"></div>
      <div class="debug"></div>`;
    this.hpEl = root.querySelector('.hp');
    this.toolEl = root.querySelector('.tool');
    this.areaEl = root.querySelector('.area-title');
    this.hintEl = root.querySelector('.hint');
    this.promptEl = root.querySelector('.prompt');
    this.bannerEl = root.querySelector('.banner');
    this.toastEl = root.querySelector('.toast');
    this.debugEl = root.querySelector('.debug');
    this.shown = new Set();
    this.hpState = '';
    this.hintT = 0; this.areaT = 0; this.bannerT = 0; this.toastT = 0;
    this.visible = true;
  }

  setVisible(v) { this.visible = v; this.root.classList.toggle('hidden', !v); }

  updateHP(hp, max) {
    const s = `${hp}/${max}`;
    if (s === this.hpState) return;
    const prev = this.hpState ? parseInt(this.hpState, 10) : hp;
    this.hpState = s;
    let html = '';
    for (let i = 0; i < max; i++) html += `<span class="vessel${i < hp ? ' full' : ''}${i === hp && prev > hp ? ' lost' : ''}">${VESSEL(i < hp)}</span>`;
    this.hpEl.innerHTML = html;
  }

  setTool(has) { this.toolEl.classList.toggle('on', !!has); }

  hint(id, text, keys = []) {
    if (this.shown.has(id)) return;
    this.shown.add(id);
    this.hintEl.querySelector('.keys').innerHTML = keys.map((k) => `<kbd>${k}</kbd>`).join('');
    this.hintEl.querySelector('.text').textContent = text;
    this.hintEl.classList.add('on');
    this.hintT = 6.5;
  }

  areaTitle(name, sub = '') {
    this.areaEl.querySelector('.name').textContent = name;
    this.areaEl.querySelector('.sub').textContent = sub;
    this.areaEl.classList.add('on');
    this.areaT = 3.6;
  }

  banner(title, text, dur = 4.5) {
    this.bannerEl.querySelector('.b-title').textContent = title;
    this.bannerEl.querySelector('.b-text').textContent = text;
    this.bannerEl.classList.add('on');
    this.bannerT = dur;
  }

  toast(text, dur = 2.4) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('on');
    this.toastT = dur;
  }

  // Aviso de interacción proyectado sobre el objeto.
  prompt(p, camera, w, h) {
    if (!p) { this.promptEl.classList.remove('on'); return; }
    const v = p.at.clone().project(camera);
    const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
    this.promptEl.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    this.promptEl.querySelector('.k').textContent = p.key || '';
    this.promptEl.querySelector('.k').style.display = p.key ? '' : 'none';
    this.promptEl.querySelector('.t').textContent = p.text;
    this.promptEl.classList.toggle('muted', !!p.muted);
    this.promptEl.classList.add('on');
  }

  debug(text) {
    this.debugEl.style.display = text ? 'block' : 'none';
    if (text) this.debugEl.textContent = text;
  }

  update(dt) {
    const tick = (k, el) => {
      if (this[k] > 0) { this[k] -= dt; if (this[k] <= 0) el.classList.remove('on'); }
    };
    tick('hintT', this.hintEl);
    tick('areaT', this.areaEl);
    tick('bannerT', this.bannerEl);
    tick('toastT', this.toastEl);
  }
}
