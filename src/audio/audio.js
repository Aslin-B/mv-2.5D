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
