// ---------------------------------------------------------------------------
// audio.js — Heliotrope synthesized sound. Soft garden palette: ticks,
// rustles, water, bell-blooms. No assets, WebAudio only.
// ---------------------------------------------------------------------------
'use strict';

class GardenSFX {
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

  _noise(dur, freq, vol, delay, type) {
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
    f.type = type || 'lowpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  step() { this._tone(660, 0.05, 'sine', 0.05, 0, 520); }
  wait() { this._tone(392, 0.22, 'sine', 0.04, 0, 340); }
  grow() { this._noise(0.09, 2400, 0.05, 0, 'bandpass'); }
  splash() { this._noise(0.22, 900, 0.10); this._tone(220, 0.18, 'sine', 0.05, 0, 130); }
  invalid() { this._tone(140, 0.12, 'triangle', 0.09, 0, 110); }
  undo() { this._tone(520, 0.1, 'sine', 0.05, 0, 700); }

  bloom() {
    const notes = [784, 988, 1175];
    notes.forEach((f, i) => this._tone(f, 0.5, 'triangle', 0.07, i * 0.07));
    this._noise(0.15, 3000, 0.03, 0, 'highpass');
  }

  win() {
    const notes = [523.3, 659.3, 784, 1046.5, 1318.5];
    notes.forEach((f, i) => this._tone(f, 0.7, 'triangle', 0.07, i * 0.11));
  }
}
