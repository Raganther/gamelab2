// ---------------------------------------------------------------------------
// audio.js — synthesized sound effects via WebAudio (no assets)
// ---------------------------------------------------------------------------
'use strict';

class SFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.windGain = null;
    this.windFilter = null;
    this.carveGain = null;
  }

  // Must be called from a user gesture
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.ctx.destination);
    this._buildWind();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  }

  _noiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _buildWind() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer(2.0);
    src.loop = true;

    // Low rumble of wind, gain follows speed
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 400;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    src.connect(this.windFilter).connect(this.windGain).connect(this.master);

    // Higher hiss for hard carving / snow spray
    const carveFilter = ctx.createBiquadFilter();
    carveFilter.type = 'bandpass';
    carveFilter.frequency.value = 2600;
    carveFilter.Q.value = 0.6;
    this.carveGain = ctx.createGain();
    this.carveGain.gain.value = 0;
    src.connect(carveFilter).connect(this.carveGain).connect(this.master);

    src.start();
  }

  // Called every frame from the game loop
  updateWind(speed, carve, grounded, dt) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const windTarget = U.clamp(speed / 42, 0, 1) * 0.16 * (grounded ? 1 : 0.75);
    const carveTarget = grounded ? U.clamp(Math.abs(carve), 0, 1) * U.clamp(speed / 25, 0, 1) * 0.10 : 0;
    this.windGain.gain.setTargetAtTime(windTarget, t, 0.08);
    this.carveGain.gain.setTargetAtTime(carveTarget, t, 0.05);
    this.windFilter.frequency.setTargetAtTime(300 + speed * 28, t, 0.1);
  }

  _tone(freq, dur, type, vol, delay, slideTo) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + (delay || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  _noiseBurst(dur, freq, vol, delay) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + (delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer(dur + 0.05);
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

  coin() {
    this._tone(1318.5, 0.09, 'square', 0.06);
    this._tone(1975.5, 0.16, 'square', 0.06, 0.07);
  }

  jump() {
    this._tone(300, 0.18, 'sine', 0.12, 0, 700);
    this._noiseBurst(0.12, 1800, 0.08);
  }

  launch() {
    this._tone(220, 0.3, 'sine', 0.14, 0, 880);
    this._noiseBurst(0.25, 2400, 0.10);
  }

  land(hard) {
    this._noiseBurst(hard ? 0.3 : 0.15, hard ? 500 : 900, hard ? 0.3 : 0.16);
    if (hard) this._tone(80, 0.2, 'sine', 0.25);
  }

  trick(clean) {
    if (clean) {
      const notes = [523.3, 659.3, 784.0, 1046.5];
      notes.forEach((f, i) => this._tone(f, 0.14, 'triangle', 0.09, i * 0.06));
    } else {
      this._tone(392, 0.12, 'triangle', 0.09);
      this._tone(370, 0.2, 'triangle', 0.09, 0.1);
    }
  }

  crash() {
    this._noiseBurst(0.5, 400, 0.4);
    this._tone(70, 0.4, 'sine', 0.35, 0, 40);
  }

  gameOver() {
    const notes = [392, 330, 262, 196];
    notes.forEach((f, i) => this._tone(f, 0.3, 'triangle', 0.12, i * 0.18));
  }
}
