// ---------------------------------------------------------------------------
// audio.js — Wyrmway sound: dawn wind, serpent rush, lantern chimes.
// All synthesized, no assets.
// ---------------------------------------------------------------------------
'use strict';

class WindAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.windGain = null;
    this.rushGain = null;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(this.ctx.destination);

    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;

    const lowp = this.ctx.createBiquadFilter();
    lowp.type = 'lowpass'; lowp.frequency.value = 320;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.035;
    src.connect(lowp).connect(this.windGain).connect(this.master);

    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass'; band.frequency.value = 900; band.Q.value = 0.7;
    this.rushGain = this.ctx.createGain();
    this.rushGain.gain.value = 0;
    src.connect(band).connect(this.rushGain).connect(this.master);

    src.start();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.8;
  }

  // continuous: serpent speed 0..1, gust strength 0..1
  updateLoop(rush, gust) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.rushGain.gain.setTargetAtTime(rush * 0.06, t, 0.08);
    this.windGain.gain.setTargetAtTime(0.035 + gust * 0.12, t, 0.15);
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
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  deliver(streak) {
    const base = [523.3, 587.3, 659.3, 784, 880][Math.min(streak, 4)];
    this._tone(base, 0.5, 'sine', 0.11);
    this._tone(base * 1.5, 0.62, 'sine', 0.07, 0.07);
  }
  caught() { this._tone(440, 0.12, 'triangle', 0.09, 0, 880); this._tone(1174, 0.3, 'sine', 0.06, 0.1); }
  cry() { this._tone(640, 0.5, 'sine', 0.05, 0, 240); }
  poof() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    const len = this.ctx.sampleRate * 0.4;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 500;
    const g = this.ctx.createGain();
    g.gain.value = 0.22;
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
  }
  gust() { this._tone(220, 1.4, 'sine', 0.05, 0, 420); }
  waveHorn() { this._tone(392, 0.5, 'triangle', 0.09); this._tone(523.3, 0.7, 'triangle', 0.09, 0.22); }
  gameOver() {
    this._tone(196, 1.6, 'sine', 0.14);
    [392, 330, 262].forEach((f, i) => this._tone(f, 0.6, 'triangle', 0.07, 0.3 + i * 0.25));
  }
}
