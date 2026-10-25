// Interfaz propia (biblia §18.1). Iteración 4: disposición de lectura rápida del género —estado
// arriba a la izquierda (vasos de vida, reserva de éter de la carga, herramienta) y mapa local arriba
// a la derecha— con un lenguaje propio: placas oscuras con filo de oro y runas cian.
// Pistas legibles sin sonido, títulos de zona y avisos de interacción anclados al objeto.

const CLAVIJA_SVG = `<svg viewBox="0 0 40 40" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
<circle cx="20" cy="12" r="6.5"/><path d="M20 18.5 V35"/><path d="M15 31 h10"/>
<path d="M20 2.5v3M27.5 5.5l-2 2M30 12h-3M12.5 5.5l2 2M10 12h3"/></g></svg>`;

const VESSEL = (fill) => `<svg viewBox="0 0 16 20" aria-hidden="true">
<path d="M8 1 L15 10 L8 19 L1 10 Z" fill="${fill ? 'url(#hvg)' : 'rgba(10,16,22,0.7)'}" stroke="${fill ? '#e9d08f' : '#6d5a3a'}" stroke-width="1.2"/>
${fill ? '<path d="M8 4 L11.5 10 L8 8.5 Z" fill="rgba(255,255,255,0.75)"/>' : ''}
</svg>`;

const SIGIL_SVG = `<svg viewBox="0 0 40 40" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round">
<circle cx="20" cy="22" r="7" stroke-width="2.2"/><circle cx="20" cy="22" r="2.2" fill="currentColor" stroke="none"/>
<path d="M20 8v5M30 12l-3.4 3.4M10 12l3.4 3.4M34 22h-5M6 22h5" stroke-width="2"/><path d="M5 32h30" stroke-width="1.4"/></g></svg>`;

export class HUD {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <svg width="0" height="0" style="position:absolute"><defs><linearGradient id="hvg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#d8fdff"/><stop offset="1" stop-color="#22a9cc"/></linearGradient></defs></svg>
      <div class="hud-top">
        <div class="status">
          <div class="st-sigil">${SIGIL_SVG}</div>
          <div class="st-body">
            <div class="st-row"><span class="st-lab">ÉTER</span><div class="st-ether"><i></i></div></div>
            <div class="st-row"><span class="st-lab st-e">VIDA</span><span class="st-num">06</span><div class="hp" aria-label="Vida"></div></div>
          </div>
        </div>
        <div class="tool" aria-label="Herramienta"><span class="tool-icon">${CLAVIJA_SVG}</span><span class="tool-key">Q</span></div>
      </div>
      <div class="minimap"><canvas width="236" height="128"></canvas><div class="mm-name"></div></div>
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
    this.numEl = root.querySelector('.st-num');
    this.etherEl = root.querySelector('.st-ether');
    this.etherBar = root.querySelector('.st-ether i');
    this.mapEl = root.querySelector('.minimap');
    this.mapCv = root.querySelector('.minimap canvas');
    this.mapName = root.querySelector('.mm-name');
    this.charge = -1;
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
    this.numEl.textContent = String(hp).padStart(2, '0');
    this.numEl.classList.toggle('low', hp <= 2);
  }

  // Reserva de éter: se llena al mantener el disparo; late al estar lista.
  setCharge(c) {
    const q = Math.round(c * 50) / 50;
    if (q === this.charge) return;
    this.charge = q;
    this.etherBar.style.transform = `scaleX(${Math.max(0.02, q)})`;
    this.etherEl.classList.toggle('full', q >= 1);
  }

  // Mapa local: el plano del nivel se dibuja una vez (sólidos, salas, puntos de interés) y cada
  // fotograma se copia la ventana alrededor de Aren. Lo no visitado queda en penumbra.
  initMap(solids, areas, marks, bounds) {
    const S = 6; // px por metro en el lienzo maestro
    const W = Math.ceil((bounds.x1 - bounds.x0) * S), H = Math.ceil((bounds.y1 - bounds.y0) * S);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const X = (x) => (x - bounds.x0) * S, Y = (y) => H - (y - bounds.y0) * S;
    // interior de las salas (aire transitable) como fondo azul profundo
    ctx.fillStyle = 'rgba(28,56,86,0.95)';
    for (const a of areas) ctx.fillRect(X(a.x0), Y(a.y1), (a.x1 - a.x0) * S, (a.y1 - a.y0) * S);
    // sólidos
    for (const s of solids) {
      if (s.kind === 'oneway') { ctx.fillStyle = '#c9b27a'; ctx.fillRect(X(s.x0), Y(s.y1), (s.x1 - s.x0) * S, 2); continue; }
      ctx.fillStyle = '#0b0f14';
      ctx.fillRect(X(s.x0), Y(Math.min(s.y1, bounds.y1)), (s.x1 - s.x0) * S, (Math.min(s.y1, bounds.y1) - Math.max(s.y0, bounds.y0)) * S);
      ctx.fillStyle = '#8fd8e6';
      ctx.fillRect(X(s.x0), Y(Math.min(s.y1, bounds.y1)), (s.x1 - s.x0) * S, 1.5);
    }
    // marcos de sala
    ctx.strokeStyle = 'rgba(210,180,110,0.9)'; ctx.lineWidth = 2;
    for (const a of areas) ctx.strokeRect(X(a.x0) + 1, Y(a.y1) + 1, (a.x1 - a.x0) * S - 2, (a.y1 - a.y0) * S - 2);
    this.map = { c, S, bounds, X, Y, marks, seen: new Float32Array(Math.ceil(bounds.x1 - bounds.x0) + 1), areas };
  }

  updateMap(x, y, t) {
    const M = this.map;
    if (!M) return;
    const i0 = Math.max(0, Math.floor(x - M.bounds.x0 - 14)), i1 = Math.min(M.seen.length - 1, Math.ceil(x - M.bounds.x0 + 14));
    for (let i = i0; i <= i1; i++) M.seen[i] = 1;
    const cv = this.mapCv, ctx = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    const zoom = 0.75;          // px del mapa visible por px del maestro
    const sw = w / zoom, sh = h / zoom;
    const sx = M.X(x) - sw / 2, sy = M.Y(y + 3) - sh / 2;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(6,9,13,0.9)'; ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(M.c, sx, sy, sw, sh, 0, 0, w, h);
    // penumbra sobre lo no visitado
    ctx.fillStyle = 'rgba(4,6,9,0.78)';
    for (let px = 0; px < w; px += 2) {
      const wx = M.bounds.x0 + (sx + px / zoom) / M.S;
      const k = M.seen[Math.round(wx - M.bounds.x0)] || 0;
      if (!k) ctx.fillRect(px, 0, 2, h);
    }
    const tx = (wx) => (M.X(wx) - sx) * zoom, ty = (wy) => (M.Y(wy) - sy) * zoom;
    for (const m of M.marks) {
      if (m.hidden && m.hidden()) continue;
      if (!M.seen[Math.round(m.x - M.bounds.x0)]) continue;
      ctx.fillStyle = m.color;
      ctx.beginPath(); ctx.arc(tx(m.x), ty(m.y + 0.6), 3.2, 0, Math.PI * 2); ctx.fill();
    }
    // Aren: punto con pulso
    const r = 3.5 + Math.sin(t * 6) * 1.2;
    ctx.fillStyle = 'rgba(255,214,140,0.35)';
    ctx.beginPath(); ctx.arc(tx(x), ty(y + 0.9), r + 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffe2a6';
    ctx.beginPath(); ctx.arc(tx(x), ty(y + 0.9), 3.2, 0, Math.PI * 2); ctx.fill();
    const a = M.areas.find((q) => x >= q.x0 && x < q.x1);
    const name = a ? a.name : '';
    if (this.mapName.textContent !== name) this.mapName.textContent = name;
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
