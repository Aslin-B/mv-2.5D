// Entrada: teclado, ratón y mando genérico. Registra acciones y su momento (biblia §20.2),
// con memoria de pulsaciones para búfer de salto/ataque (§12.2, §14.4).

const KEYMAP = {
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  Space: 'jump',
  ShiftLeft: 'run', ShiftRight: 'run',
  KeyJ: 'attack',
  KeyK: 'dodge',
  KeyL: 'parry',
  KeyE: 'interact',
  KeyQ: 'tool',
  Escape: 'pause', KeyP: 'pause',
  Enter: 'confirm',
  KeyM: 'mute',
  F3: 'debug',
};

export const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'run', 'attack', 'dodge', 'parry', 'interact', 'tool', 'pause', 'confirm', 'mute', 'debug'];

export class Input {
  constructor(target) {
    this.held = new Set();
    this.pending = [];          // pulsaciones llegadas entre pasos de simulación
    this.lastPress = {};        // acción -> tiempo de simulación de la última pulsación
    this.consumed = {};
    this.releasedFlag = {};     // acción -> soltada desde el último paso
    this.virtual = null;        // entrada programada (pruebas automáticas)
    this.padPrev = {};
    this.time = 0;
    this.listeners = [];
    for (const a of ACTIONS) { this.lastPress[a] = -1e9; this.consumed[a] = true; }

    const down = (e) => {
      const a = KEYMAP[e.code];
      if (!a) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F3'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this._press(a);
    };
    const up = (e) => {
      const a = KEYMAP[e.code];
      if (!a) return;
      this._release(a);
    };
    const mdown = (e) => {
      if (e.button === 0) this._press('attack');
      if (e.button === 2) this._press('parry');
    };
    const mup = (e) => {
      if (e.button === 0) this._release('attack');
      if (e.button === 2) this._release('parry');
    };
    const blur = () => this.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    target.addEventListener('mousedown', mdown);
    window.addEventListener('mouseup', mup);
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', () => { if (document.hidden) blur(); });
  }

  _press(a) {
    if (!this.held.has(a)) this.pending.push(a);
    this.held.add(a);
    for (const fn of this.listeners) fn(a);
  }

  _release(a) {
    this.held.delete(a);
    this.releasedFlag[a] = true;
  }

  onPress(fn) { this.listeners.push(fn); }

  clear() {
    for (const a of [...this.held]) this._release(a);
    this.held.clear();
    this.pending.length = 0;
  }

  _pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads && [...pads].find((p) => p && p.connected);
    if (!pad) return;
    const b = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
    const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
    const state = {
      left: ax < -0.35 || b(14), right: ax > 0.35 || b(15),
      up: ay < -0.5 || b(12), down: ay > 0.5 || b(13),
      jump: b(0), dodge: b(1), attack: b(2), interact: b(3),
      parry: b(4), tool: b(5), run: b(7) || b(6), pause: b(9), confirm: b(0) || b(9),
    };
    for (const [a, on] of Object.entries(state)) {
      const was = !!this.padPrev[a];
      if (on && !was) this._press(a);
      if (!on && was) this._release(a);
      this.padPrev[a] = on;
    }
  }

  // Llamar una vez por paso fijo de simulación.
  beginTick(simTime) {
    this.time = simTime;
    if (this.virtual) this._applyVirtual();
    else this._pollPad();
    for (const a of this.pending) { this.lastPress[a] = simTime; this.consumed[a] = false; }
    this.pending.length = 0;
  }

  endTick() { for (const k in this.releasedFlag) this.releasedFlag[k] = false; }

  _applyVirtual() {
    const v = this.virtual;
    for (const a of ACTIONS) {
      const on = !!v[a];
      const was = this.held.has(a);
      if (on && !was) this._press(a);
      if (!on && was) this._release(a);
    }
  }

  isDown(a) { return this.held.has(a); }
  released(a) { return !!this.releasedFlag[a]; }
  axisX() { return (this.held.has('right') ? 1 : 0) - (this.held.has('left') ? 1 : 0); }

  // ¿Se pulsó `a` dentro de la ventana (s) y no se ha consumido?
  pressed(a, window = 0) {
    return !this.consumed[a] && this.time - this.lastPress[a] <= window + 1e-6;
  }

  consume(a) { this.consumed[a] = true; }
}
