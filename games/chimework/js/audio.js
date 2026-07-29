// ---------------------------------------------------------------------------
// audio.js — Chimework sound: synthesized music-box tines. Every mechanism
// is a note; placing pins literally composes the song. No assets.
// ---------------------------------------------------------------------------
'use strict';

class BoxAudio {
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

  // a music-box tine: bright attack, long sweet decay, faint octave partial
  tine(freq, vol, delay) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + (delay || 0);
    for (const [mult, v, dur] of [[1, vol, 1.6], [2, vol * 0.35, 0.9], [5.4, vol * 0.12, 0.25]]) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq * mult;
      g.gain.setValueAtTime(v, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(this.master);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    }
  }

  tick() { this.tine(2200, 0.012); }
  roll() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = 180 + Math.random() * 60;
    g.gain.setValueAtTime(0.02, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + 0.1);
  }
  place() { this.tine(1318, 0.05); }
  remove() { this.tine(988, 0.04); }
  launch() { this.tine(1760, 0.07); }
  star() { this.tine(1568, 0.08); this.tine(2093, 0.06, 0.08); }
  lostThunk() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(160, t0);
    o.frequency.exponentialRampToValueAtTime(60, t0 + 0.4);
    g.gain.setValueAtTime(0.16, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + 0.55);
  }
  windDown() {
    [392, 330, 262].forEach((f, i) => this.tine(f, 0.06, i * 0.22));
  }
  win() {
    [523.3, 659.3, 784, 1046.5, 1318.5, 1568].forEach((f, i) => this.tine(f, 0.09, i * 0.09));
  }
}
