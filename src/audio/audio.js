// Sonido sintetizado en tiempo real con Web Audio (sin archivos): pasos ligados al contacto del
// pie según la superficie, capas de tela y metal, impactos diferenciados (carne/cuero, acero,
// piedra), ambiente de agua y viento, y una música original generativa en re dórico que gana
// percusión al entrar en combate (biblia §19). Se inicia tras una interacción del usuario.

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.ready = false;
    this.music = { next: 0, step: 0, combat: 0, combatTarget: 0 };
    this.interior = 0;
    this.water = 0;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
    this.mus = ctx.createGain(); this.mus.gain.value = 0.32; this.mus.connect(this.master);
    this.amb = ctx.createGain(); this.amb.gain.value = 0.5; this.amb.connect(this.master);
    // Reverberación generada (impulso de ruido con caída exponencial) para interiores.
    this.verb = ctx.createConvolver();
    this.verb.buffer = this.impulse(2.4, 2.8);
    this.verbIn = ctx.createGain(); this.verbIn.gain.value = 0.12;
    this.verbIn.connect(this.verb); this.verb.connect(this.master);
    this.noise = this.noiseBuffer(2.5);
    this.pink = this.pinkBuffer(4);
    this.startAmbience();
    this.ready = true;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.05);
  }

  // ---- utilidades -------------------------------------------------------------
  noiseBuffer(sec) {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * sec, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  pinkBuffer(sec) {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * sec, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + w * 0.5362) * 0.11;
    }
    return b;
  }
  impulse(sec, decay) {
    const rate = this.ctx.sampleRate, len = rate * sec;
    const b = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }
  out(gain = 1, pan = 0, verb = true) {
    const g = this.ctx.createGain();
    g.gain.value = gain;
    let node = g;
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p); node = p;
    }
    node.connect(this.sfx);
    if (verb) node.connect(this.verbIn);
    return g;
  }
  noiseHit({ t = 0, dur = 0.1, type = 'bandpass', f = 1000, f2 = null, q = 1, gain = 0.5, pan = 0, attack = 0.002, src = 'white', verb = true }) {
    const ctx = this.ctx, now = ctx.currentTime + t;
    const s = ctx.createBufferSource();
    s.buffer = src === 'pink' ? this.pink : this.noise;
    const flt = ctx.createBiquadFilter();
    flt.type = type; flt.frequency.setValueAtTime(f, now); flt.Q.value = q;
    if (f2) flt.frequency.exponentialRampToValueAtTime(f2, now + dur);
    const g = this.out(0, pan, verb);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(gain, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, now + dur);
    s.connect(flt); flt.connect(g);
    s.start(now, Math.random() * 1.5, dur + 0.05);
  }
  tone({ t = 0, f = 220, f2 = null, dur = 0.2, type = 'sine', gain = 0.3, pan = 0, attack = 0.003, verb = true, dest = null }) {
    const ctx = this.ctx, now = ctx.currentTime + t;
    const o = ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(f, now);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, now + dur);
    const g = dest ? ctx.createGain() : this.out(0, pan, verb);
    if (dest) g.connect(dest);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(gain, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, now + dur);
    o.connect(g);
    o.start(now); o.stop(now + dur + 0.05);
  }
  metal(base, { gain = 0.25, dur = 0.9, pan = 0, t = 0 } = {}) {
    // parciales inarmónicos de una pieza de acero
    const ratios = [1, 2.76, 4.07, 5.4, 6.8];
    ratios.forEach((r, i) => this.tone({ t, f: base * r * (1 + (Math.random() - 0.5) * 0.01), dur: dur / (1 + i * 0.5), gain: gain / (1 + i * 0.8), pan, type: 'sine' }));
    this.noiseHit({ t, dur: 0.05, type: 'highpass', f: 3000, gain: gain * 1.2, pan });
  }

  // ---- eventos de juego -----------------------------------------------------------
  play(name, o = {}) {
    if (!this.ready || this.muted) return;
    const pan = o.pan || 0;
    const v = (a, b) => a + Math.random() * (b - a);
    switch (name) {
      case 'step': {
        const sp = Math.min(1, (o.speed || 1) / 7);
        const g = 0.12 + sp * 0.22;
        if (o.surface === 'wood') {
          this.noiseHit({ dur: 0.08, f: v(700, 950), q: 2.5, gain: g * 0.9, pan });
          this.tone({ f: v(150, 175), f2: 90, dur: 0.12, gain: g * 0.7, pan });
        } else {
          this.noiseHit({ dur: 0.06, f: v(1800, 2600), q: 1.1, gain: g * 0.7, pan });
          this.tone({ f: v(85, 100), f2: 50, dur: 0.08, gain: g * 0.6, pan });
        }
        if (o.armor && Math.random() < 0.6) this.metal(v(1700, 2100), { gain: 0.012 + sp * 0.02, dur: 0.18, pan });
        if (sp > 0.5) this.noiseHit({ dur: 0.12, f: 900, q: 0.6, gain: 0.03 * sp, pan, src: 'pink' }); // roce de tela
        break;
      }
      case 'jump':
        this.noiseHit({ dur: 0.18, f: 600, f2: 1600, q: 0.8, gain: 0.08, pan, src: 'pink' });
        this.noiseHit({ dur: 0.07, f: 450, q: 4, gain: 0.05, pan }); // exhalación breve
        break;
      case 'land': {
        const k = Math.min(1, (o.impact || 6) / 16);
        this.tone({ f: 80, f2: 38, dur: 0.18, gain: 0.25 + k * 0.4, pan });
        this.noiseHit({ dur: 0.12 + k * 0.1, type: 'lowpass', f: 1600, gain: 0.15 + k * 0.25, pan });
        if (k > 0.5) this.metal(1650, { gain: 0.03, dur: 0.25, pan });
        break;
      }
      case 'roll':
        this.noiseHit({ dur: 0.32, f: 500, f2: 1200, q: 0.7, gain: 0.12, pan, src: 'pink' });
        this.tone({ t: 0.16, f: 90, f2: 45, dur: 0.12, gain: 0.18, pan });
        break;
      case 'slide':
        this.noiseHit({ dur: 0.5, type: 'bandpass', f: 1400, f2: 700, q: 0.9, gain: 0.14, pan });
        break;
      case 'swing': {
        const heavy = o.heavy;
        this.noiseHit({ dur: heavy ? 0.28 : 0.18, f: heavy ? 500 : 800, f2: heavy ? 1800 : 2600, q: 1.6, gain: heavy ? 0.2 : 0.14, pan });
        if (heavy) this.noiseHit({ dur: 0.1, f: 420, q: 3.5, gain: 0.05, pan });
        break;
      }
      case 'hitFlesh':
        this.tone({ f: 120, f2: 55, dur: 0.16, gain: 0.45, pan });
        this.noiseHit({ dur: 0.09, f: 1200, q: 0.9, gain: 0.35, pan });
        this.noiseHit({ t: 0.01, dur: 0.06, type: 'highpass', f: 4000, gain: 0.1, pan });
        break;
      case 'armor':
        this.metal(v(380, 420), { gain: 0.16, dur: 0.5, pan });
        this.tone({ f: 110, f2: 60, dur: 0.12, gain: 0.25, pan });
        break;
      case 'parry':
        this.metal(v(620, 660), { gain: 0.32, dur: 1.4, pan });
        this.metal(v(930, 960), { gain: 0.16, dur: 1.0, pan, t: 0.004 });
        this.tone({ f: 70, f2: 40, dur: 0.3, gain: 0.35, pan });
        break;
      case 'stone':
        this.noiseHit({ dur: 0.18, type: 'lowpass', f: 900, gain: 0.4, pan });
        this.tone({ f: 70, f2: 35, dur: 0.2, gain: 0.3, pan });
        for (let i = 0; i < 5; i++) this.noiseHit({ t: 0.03 + i * 0.03, dur: 0.04, f: v(2000, 4000), q: 3, gain: 0.05, pan });
        break;
      case 'wallBreak':
        this.noiseHit({ dur: 1.4, type: 'lowpass', f: 700, f2: 200, gain: 0.6, pan, src: 'pink' });
        this.tone({ f: 55, f2: 30, dur: 0.8, gain: 0.5, pan });
        for (let i = 0; i < 22; i++) this.noiseHit({ t: 0.05 + Math.random() * 1.2, dur: 0.05, f: v(1200, 3800), q: 2.5, gain: v(0.03, 0.09), pan: pan + v(-0.3, 0.3) });
        break;
      case 'heroHit':
        this.tone({ f: 140, f2: 60, dur: 0.2, gain: 0.45, pan });
        this.noiseHit({ dur: 0.14, f: 700, q: 1.2, gain: 0.3, pan });
        this.noiseHit({ t: 0.03, dur: 0.16, f: 380, q: 5, gain: 0.08, pan }); // quejido contenido
        break;
      case 'windup':
        this.noiseHit({ dur: 0.5, f: 300, f2: 900, q: 6, gain: 0.07, pan }); // inspiración ronca
        this.noiseHit({ t: 0.1, dur: 0.45, f: 2500, f2: 6000, q: 8, gain: 0.05, pan }); // roce del asta
        break;
      case 'tell':
        this.tone({ f: 2640, dur: 0.35, gain: 0.07, pan });
        this.tone({ f: 3960, dur: 0.2, gain: 0.03, pan });
        break;
      case 'thrust':
        this.noiseHit({ dur: 0.16, f: 1200, f2: 3000, q: 2, gain: 0.16, pan });
        break;
      case 'enemyDead':
        this.tone({ f: 95, f2: 40, dur: 0.5, gain: 0.35, pan });
        this.noiseHit({ t: 0.35, dur: 0.25, type: 'lowpass', f: 600, gain: 0.3, pan });
        this.metal(300, { t: 0.5, gain: 0.08, dur: 0.6, pan });
        break;
      case 'alert':
        this.noiseHit({ dur: 0.12, f: 520, q: 6, gain: 0.07, pan });
        break;
      case 'ledge':
        this.noiseHit({ dur: 0.05, f: 1600, q: 1, gain: 0.12, pan });
        this.noiseHit({ t: 0.02, dur: 0.1, f: 500, q: 3, gain: 0.04, pan });
        break;
      case 'checkpoint':
        [62, 69, 74, 81].forEach((n, i) => this.tone({ t: i * 0.09, f: NOTE(n), dur: 2.2, gain: 0.07, type: 'triangle' }));
        for (let i = 0; i < 6; i++) this.tone({ t: 0.1 + i * 0.07, f: v(600, 1400), f2: v(1500, 2400), dur: 0.08, gain: 0.03 });
        break;
      case 'acquire':
        [50, 57, 62, 66, 69, 74].forEach((n, i) => this.tone({ t: i * 0.11, f: NOTE(n), dur: 3.2, gain: 0.08, type: i % 2 ? 'sine' : 'triangle' }));
        this.metal(880, { t: 0.7, gain: 0.08, dur: 2.2 });
        break;
      case 'secret':
        [74, 76, 81, 83, 86].forEach((n, i) => this.tone({ t: i * 0.08, f: NOTE(n), dur: 1.6, gain: 0.07, type: 'triangle' }));
        break;
      case 'socket':
        this.metal(1200, { gain: 0.12, dur: 0.25 });
        this.tone({ t: 0.08, f: 300, f2: 180, dur: 0.1, gain: 0.15 });
        break;
      case 'gate': {
        // crujido de madera, cadenas y rumor del contrapeso
        const ctx = this.ctx, now = ctx.currentTime;
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 38;
        const lfo = ctx.createOscillator(); lfo.frequency.value = 7; const lg = ctx.createGain(); lg.gain.value = 9;
        lfo.connect(lg); lg.connect(o.frequency);
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
        const g = this.out(0, pan);
        g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(0.16, now + 0.3); g.gain.setValueAtTime(0.16, now + 2.2); g.gain.exponentialRampToValueAtTime(0.001, now + 2.9);
        o.connect(f); f.connect(g); o.start(now); lfo.start(now); o.stop(now + 3); lfo.stop(now + 3);
        for (let i = 0; i < 26; i++) this.metal(v(1800, 2600), { t: i * 0.1 + Math.random() * 0.05, gain: 0.025, dur: 0.12, pan });
        this.tone({ t: 2.6, f: 60, f2: 35, dur: 0.6, gain: 0.5, pan });
        break;
      }
      // ---- poderes de sombra: graves que respiran hacia dentro, cristal oscuro y aire que implosiona ----
      case 'bolt':
        // dardo de sombra: chasquido seco y un silbido grave que se apaga (no un láser brillante)
        this.noiseHit({ dur: 0.07, type: 'bandpass', f: v(1700, 2100), f2: 500, q: 1.4, gain: 0.11, pan, verb: false });
        this.tone({ f: v(620, 680), f2: 210, dur: 0.1, type: 'triangle', gain: 0.07, pan });
        this.tone({ f: 150, f2: 62, dur: 0.08, gain: 0.14, pan });
        break;
      case 'chargePhase': {
        const ph = o.phase || 1;
        if (ph === 1) {
          // semilla: la sombra prende en la palma (golpe sordo y un destello de cristal oscuro)
          this.tone({ f: 98, f2: 70, dur: 0.22, gain: 0.2, pan });
          this.tone({ f: NOTE(74), dur: 0.5, type: 'sine', gain: 0.025, pan });
          this.noiseHit({ dur: 0.2, f: 700, f2: 260, q: 2, gain: 0.05, pan, src: 'pink' });
        } else if (ph === 2) {
          // condensación: el aire se recoge hacia la esfera (soplo inverso) y un pulso grave
          this.noiseHit({ dur: 0.38, f: 3600, f2: 380, q: 1.6, gain: 0.08, pan, attack: 0.3, src: 'pink' });
          this.tone({ t: 0.3, f: 73, f2: 46, dur: 0.45, type: 'sawtooth', gain: 0.07, pan });
          this.tone({ t: 0.3, f: 55, f2: 40, dur: 0.5, gain: 0.3, pan });
          [62, 69].forEach((n, i) => this.tone({ t: 0.3 + i * 0.03, f: NOTE(n + 12), dur: 0.9, type: 'sine', gain: 0.022, pan }));
        } else {
          // eclipse listo: latido profundo, acorde suspendido de cristal y un brillo que se abre
          this.noiseHit({ dur: 0.32, f: 4200, f2: 300, q: 1.2, gain: 0.09, pan, attack: 0.26, src: 'pink' });
          this.tone({ t: 0.26, f: 62, f2: 31, dur: 0.75, gain: 0.5, pan });
          this.tone({ t: 0.26, f: 124, f2: 62, dur: 0.4, type: 'sawtooth', gain: 0.06, pan });
          [62, 69, 74, 76].forEach((n, i) => this.tone({ t: 0.28 + i * 0.04, f: NOTE(n + 12), dur: 1.6, type: 'triangle', gain: 0.026, pan }));
          this.noiseHit({ t: 0.27, dur: 0.6, type: 'highpass', f: 5200, gain: 0.03, pan });
        }
        break;
      }
      case 'seed':
        this.noiseHit({ dur: 0.18, f: 1300, f2: 420, q: 1.2, gain: 0.12, pan, src: 'pink' });
        this.tone({ f: 260, f2: 90, dur: 0.18, type: 'triangle', gain: 0.08, pan });
        this.tone({ f: 90, f2: 48, dur: 0.16, gain: 0.25, pan });
        break;
      case 'condense':
        // implosión breve y salida: soplo grave con cola
        this.noiseHit({ dur: 0.08, f: 300, f2: 2600, q: 1.3, gain: 0.08, pan, attack: 0.06, src: 'pink' });
        this.noiseHit({ t: 0.06, dur: 0.42, f: 1500, f2: 260, q: 0.9, gain: 0.2, pan, src: 'pink' });
        this.tone({ t: 0.06, f: 180, f2: 55, dur: 0.32, type: 'sawtooth', gain: 0.07, pan });
        this.tone({ t: 0.06, f: 70, f2: 30, dur: 0.4, gain: 0.45, pan });
        break;
      case 'eclipse':
        // el eclipse se suelta: succión, estallido con caída al subgrave y cola de cristal oscuro
        this.noiseHit({ dur: 0.12, f: 260, f2: 3800, q: 1.1, gain: 0.12, pan, attack: 0.1, src: 'pink' });
        this.noiseHit({ t: 0.1, dur: 0.75, f: 2000, f2: 180, q: 0.7, gain: 0.32, pan, src: 'pink' });
        this.tone({ t: 0.1, f: 240, f2: 60, dur: 0.5, type: 'sawtooth', gain: 0.1, pan });
        this.tone({ t: 0.1, f: 64, f2: 24, dur: 0.85, gain: 0.65, pan });
        [50, 57, 62].forEach((n, i) => this.tone({ t: 0.12 + i * 0.02, f: NOTE(n + 24), f2: NOTE(n + 12), dur: 1.3, type: 'triangle', gain: 0.03, pan }));
        break;
      case 'counter':
        this.tone({ f: 330, f2: 90, dur: 0.6, type: 'sawtooth', gain: 0.12, pan });
        [69, 76, 81].forEach((n, i) => this.tone({ t: i * 0.02, f: NOTE(n), dur: 1.1, type: 'triangle', gain: 0.07, pan }));
        this.noiseHit({ dur: 0.6, f: 700, f2: 4200, q: 0.8, gain: 0.26, pan, src: 'pink' });
        this.tone({ f: 60, f2: 28, dur: 0.5, gain: 0.5, pan });
        break;
      case 'impact': {
        const k = o.heavy ? 1 : 0.45;
        this.noiseHit({ dur: 0.09 + k * 0.12, type: 'bandpass', f: v(1800, 2400), f2: 600, q: 0.9, gain: 0.12 + k * 0.18, pan });
        this.tone({ f: 160, f2: 60, dur: 0.1 + k * 0.1, gain: 0.12 + k * 0.25, pan });
        break;
      }
      case 'dash':
        this.noiseHit({ dur: 0.24, f: 2600, f2: 700, q: 0.7, gain: 0.14, pan, src: 'pink' });
        this.tone({ f: 900, f2: 1800, dur: 0.12, type: 'sine', gain: 0.04, pan });
        break;
      case 'strike':
        this.noiseHit({ dur: 0.16, f: 1400, f2: 3800, q: 1.3, gain: 0.14, pan });
        this.tone({ f: 1500, f2: 700, dur: 0.14, type: 'triangle', gain: 0.05, pan });
        break;
      case 'orb':
        this.tone({ f: v(300, 340), f2: 180, dur: 0.25, type: 'triangle', gain: 0.08, pan });
        this.noiseHit({ dur: 0.18, f: 500, q: 5, gain: 0.05, pan });
        break;
      case 'ui':
        this.tone({ f: 880, dur: 0.06, gain: 0.05, verb: false });
        break;
      case 'splash':
        this.noiseHit({ dur: 0.6, type: 'lowpass', f: 2600, f2: 400, gain: 0.45, pan, src: 'pink' });
        this.tone({ f: 200, f2: 60, dur: 0.25, gain: 0.2, pan });
        break;
      default: break;
    }
  }

  // ---- ambiente y música -------------------------------------------------------
  startAmbience() {
    const ctx = this.ctx;
    const loop = (buf, type, f, q, gain) => {
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      const flt = ctx.createBiquadFilter(); flt.type = type; flt.frequency.value = f; flt.Q.value = q;
      const g = ctx.createGain(); g.gain.value = gain;
      s.connect(flt); flt.connect(g); g.connect(this.amb); s.start();
      return { s, flt, g };
    };
    this.ambWater = loop(this.pink, 'lowpass', 1100, 0.5, 0);
    this.ambFall = loop(this.noise, 'bandpass', 700, 0.4, 0);
    this.ambWind = loop(this.pink, 'bandpass', 420, 0.7, 0.18);
    this.ambRoom = loop(this.pink, 'lowpass', 220, 0.5, 0);
    // pedal grave de la música
    this.drone = [];
    for (const [n, det] of [[38, -4], [45, 3], [50, 0]]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NOTE(n); o.detune.value = det;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380; f.Q.value = 0.4;
      const g = ctx.createGain(); g.gain.value = 0.045;
      o.connect(f); f.connect(g); g.connect(this.mus); o.start();
      this.drone.push({ o, f, g });
    }
    this.combatBus = ctx.createGain(); this.combatBus.gain.value = 0; this.combatBus.connect(this.mus);
  }

  // Llamado cada fotograma con el contexto de la escena.
  update(dt, st) {
    if (!this.ready) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const T = (p, v, tc = 0.4) => p.setTargetAtTime(v, now, tc);
    T(this.ambWater.g.gain, 0.06 + st.water * 0.32);
    T(this.ambFall.g.gain, st.fall * 0.22);
    T(this.ambWind.g.gain, 0.16 * (1 - st.interior));
    T(this.ambRoom.g.gain, 0.08 * st.interior);
    T(this.verbIn.gain, 0.06 + st.interior * 0.32, 0.8);
    this.ambWind.flt.frequency.setTargetAtTime(380 + Math.sin(now * 0.23) * 120, now, 0.5);
    this.updateCharge(dt, st, now);
    // capa de combate
    this.music.combat += (st.combat - this.music.combat) * Math.min(1, dt * 0.8);
    T(this.combatBus.gain, this.music.combat * 0.9, 0.6);
    for (const d of this.drone) T(d.f.frequency, 320 + this.music.combat * 380 + st.interior * -80, 1.2);
    // motivo propio en re dórico (punteado), lento y espaciado
    if (now >= this.music.next) {
      const motif = [62, 65, 67, 69, 72, 69, 67, 64, 62, 57, 60, 62, 64, 65, 64, 60];
      const i = this.music.step % motif.length;
      const rest = (i % 4 === 3) ? 1.3 : 0.65;
      const n = motif[i] + (Math.floor(this.music.step / 32) % 2 ? 12 : 0) * 0;
      this.pluck(NOTE(n), 0.07 * (1 - this.music.combat * 0.4));
      if (i % 8 === 0) this.pluck(NOTE(n - 12), 0.05);
      this.music.step++;
      this.music.next = now + rest * (this.music.combat > 0.5 ? 0.62 : 1);
      // percusión de combate (marco de tambor)
      if (this.music.combat > 0.05) {
        for (let k = 0; k < 2; k++) {
          const t = k * rest * 0.5 * (this.music.combat > 0.5 ? 0.62 : 1);
          this.tone({ t, f: 70, f2: 42, dur: 0.22, gain: 0.22, dest: this.combatBus });
          if (k === 1) this.tone({ t: t + 0.02, f: 180, f2: 90, dur: 0.08, gain: 0.08, dest: this.combatBus });
        }
      }
    }
  }

  // Voz de la carga del eclipse (continua mientras se mantiene): un grave oscuro que sube y abre su
  // filtro, aire que se aspira hacia la palma en ciclos (ruido cuyo filtro cae mientras crece), un
  // brillo de cristal desde la condensación, chasquidos de sombra y, en el eclipse, un latido.
  buildChargeVoice() {
    const ctx = this.ctx;
    const bus = this.out(0, 0, true);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 200; lp.Q.value = 5;
    const droneG = ctx.createGain(); droneG.gain.value = 0;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = NOTE(38);
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = NOTE(38); o2.detune.value = 9;
    const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = NOTE(26);
    const subG = ctx.createGain(); subG.gain.value = 0;
    o1.connect(lp); o2.connect(lp); lp.connect(droneG); droneG.connect(bus);
    sub.connect(subG); subG.connect(bus);
    const air = ctx.createBufferSource(); air.buffer = this.pink; air.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2000; bp.Q.value = 3.5;
    const airG = ctx.createGain(); airG.gain.value = 0;
    air.connect(bp); bp.connect(airG); airG.connect(bus);
    const shim = [NOTE(86), NOTE(93) * 1.004, NOTE(98) * 0.997].map((f) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = 0;
      o.connect(g); g.connect(bus); o.start();
      return { o, g };
    });
    for (const n of [o1, o2, sub, air]) n.start();
    bus.gain.value = 1;
    return { bus, lp, droneG, o1, o2, subG, sub, bp, airG, shim, nextBeat: 0, wasOn: false };
  }

  updateCharge(dt, st, now) {
    if (!this.chargeVoice) this.chargeVoice = this.buildChargeVoice();
    const V = this.chargeVoice;
    const T = (p, v, tc) => p.setTargetAtTime(v, now, tc);
    const k = st.charge || 0, ph = st.phase || 0, on = k > 0.02;
    const rel = on ? 0.06 : 0.035;
    // grave: re grave que sube una cuarta a lo largo de la carga y abre el filtro
    const f0 = NOTE(38) * Math.pow(2, (k * 5) / 12);
    T(V.o1.frequency, f0, 0.08); T(V.o2.frequency, f0, 0.08);
    T(V.lp.frequency, 160 + Math.pow(k, 1.3) * 1500 + (ph >= 3 ? 220 * Math.sin(now * 5.7) : 0), 0.06);
    T(V.droneG.gain, on ? 0.028 + k * 0.06 : 0, rel);
    T(V.subG.gain, on ? k * k * 0.22 : 0, rel);
    // aspiración: ciclos que se aceleran con la fase; el filtro cae y el soplo crece hasta cortarse
    const rate = 0.9 + ph * 0.55;
    const cyc = (now * rate) % 1;
    T(V.bp.frequency, 380 + 3400 * (1 - cyc) * (1 - cyc), 0.015);
    T(V.airG.gain, on ? (0.025 + k * 0.07) * Math.pow(cyc, 1.6) : 0, on ? 0.02 : 0.03);
    // brillo de cristal oscuro desde la condensación, con trémolo lento
    const sh = on && ph >= 2 ? (ph >= 3 ? 0.011 : 0.006) * (0.6 + 0.4 * Math.sin(now * 6.3)) : 0;
    V.shim.forEach((q, i) => T(q.g.gain, sh / (1 + i * 0.6), 0.05));
    // chasquidos de sombra: más frecuentes en cada fase
    if (on && ph >= 1 && Math.random() < (3 + ph * 7) * dt) {
      const pan = (Math.random() - 0.5) * 0.5;
      this.noiseHit({ dur: 0.012 + Math.random() * 0.03, type: 'highpass', f: 2800 + Math.random() * 4000, gain: 0.015 + Math.random() * 0.035, pan, verb: false });
    }
    // latido del eclipse sostenido (al ritmo del pulso de la esfera)
    if (on && ph >= 3) {
      if (!V.beatOn) { V.beatOn = true; V.nextBeat = now + 0.9; }
      if (now >= V.nextBeat) {
        this.tone({ f: 64, f2: 36, dur: 0.2, gain: 0.32 });
        this.tone({ t: 0.17, f: 58, f2: 34, dur: 0.22, gain: 0.2 });
        V.nextBeat = now + 1.1;
      }
    } else V.beatOn = false;
  }

  silenceCharge() {
    const V = this.chargeVoice;
    if (!V) return;
    const now = this.ctx.currentTime;
    for (const g of [V.droneG, V.subG, V.airG, ...V.shim.map((q) => q.g)]) g.gain.setTargetAtTime(0, now, 0.03);
    V.beatOn = false;
  }

  pluck(f, gain) {
    const ctx = this.ctx, now = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2.003;
    const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.setValueAtTime(f * 8, now); flt.frequency.exponentialRampToValueAtTime(f * 1.5, now + 0.8);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(gain, now + 0.004); g.gain.exponentialRampToValueAtTime(0.0005, now + 2.4);
    const g2 = ctx.createGain(); g2.gain.value = 0.3;
    o.connect(flt); o2.connect(g2); g2.connect(flt); flt.connect(g); g.connect(this.mus);
    g.connect(this.verbIn);
    o.start(now); o2.start(now); o.stop(now + 2.5); o2.stop(now + 2.5);
  }
}
