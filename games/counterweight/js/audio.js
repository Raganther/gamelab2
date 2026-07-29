// ---------------------------------------------------------------------------
// audio.js — Counterweight synthesized sound. Stone, brass and void:
// grinding slides, deep tilts, bell locks. No assets, WebAudio only.
// ---------------------------------------------------------------------------
'use strict';

class ScaleSFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(this.ctx.destination);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.8;
  }

  _tone(freq, dur, type, vol, delay, slideTo) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + (delay || 0);
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  _noise(dur, freq, vol, delay) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + (delay || 0);
    const len = Math.floor(ctx.sampleRate * (dur + 0.05));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  stepTap() { this._noise(0.06, 1200, 0.05); }
  push() { this._noise(0.16, 500, 0.14); this._tone(90, 0.12, 'sine', 0.1); }
  slide(n) { this._noise(0.2 + Math.min(n, 4) * 0.05, 700, 0.10 + Math.min(n, 5) * 0.02); }
  tilt() { this._tone(70, 0.45, 'sine', 0.13, 0, 55); this._noise(0.3, 300, 0.07); }
  lock() {
    this._tone(1046.5, 0.4, 'triangle', 0.09);
    this._tone(1568, 0.5, 'triangle', 0.07, 0.09);
  }
  plug() { this._noise(0.25, 400, 0.16); this._tone(65, 0.35, 'sine', 0.16, 0.05, 40); }
  gemLost() {
    this._tone(520, 0.5, 'sine', 0.1, 0, 160);
    this._tone(140, 0.6, 'sine', 0.1, 0.15, 60);
  }
  invalid() { this._tone(130, 0.1, 'triangle', 0.08, 0, 110); }
  undo() { this._tone(500, 0.1, 'sine', 0.05, 0, 680); }

  win() {
    const notes = [523.3, 659.3, 784, 1046.5];
    notes.forEach((f, i) => this._tone(f, 0.8, 'triangle', 0.08, i * 0.12));
    this._tone(261.6, 1.2, 'sine', 0.08, 0.1);
  }
}
