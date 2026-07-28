// ---------------------------------------------------------------------------
// render.js — Heliotrope canvas renderer. Dusk-garden palette: dark loam,
// warm sun-gold, living greens. Static board is pre-rendered per level;
// water shimmer, vines, sun and particles are drawn each frame.
// ---------------------------------------------------------------------------
'use strict';

// tiny deterministic PRNG for the static board decoration
function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VINE_COLORS = {
  g: { body: '#5cab6d', dark: '#2c5e3d', pad: '#4f8f5f', petal: '#f2e9d8', core: '#ffd27f' },
  p: { body: '#e58fb1', dark: '#96496b', pad: '#c9748f', petal: '#ffd9e8', core: '#ffd27f' },
  o: { body: '#e8a95c', dark: '#94622a', pad: '#c98f4d', petal: '#ffe9c9', core: '#ff9d5c' },
  t: { body: '#6e5d85', dark: '#372e4c', pad: '#584a6e', petal: '#6e5d85', core: '#372e4c' },
};

class GardenRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.static = document.createElement('canvas');
    this.cell = 40;
    this.ox = 0; this.oy = 0;
    this.sunVis = null;
    this.growBirth = new Map();   // "x,y" -> time born
    this.bloomBirth = new Map();  // vine char -> time
    this.particles = [];
    this.shake = 0;
    this.waitPulse = 0;
    this.lastTime = 0;
  }

  key(x, y) { return x + ',' + y; }

  setLevel(lv, st) {
    this.lv = lv;
    this.sunVis = { x: st.sun[0], y: st.sun[1] };
    this.growBirth.clear();
    this.bloomBirth.clear();
    this.particles = [];
    this.shake = 0;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = this.canvas.clientWidth, cssH = this.canvas.clientHeight;
    this.canvas.width = cssW * dpr;
    this.canvas.height = cssH * dpr;
    this.dpr = dpr;
    if (!this.lv) return;
    this.cell = Math.floor(Math.min(cssW / this.lv.w, cssH / this.lv.h, 64));
    this.ox = Math.floor((cssW - this.cell * this.lv.w) / 2);
    this.oy = Math.floor((cssH - this.cell * this.lv.h) / 2);
    this._renderStatic();
  }

  cx(x) { return this.ox + x * this.cell + this.cell / 2; }
  cy(y) { return this.oy + y * this.cell + this.cell / 2; }

  _rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  _renderStatic() {
    const lv = this.lv, c = this.cell;
    this.static.width = this.canvas.width;
    this.static.height = this.canvas.height;
    const ctx = this.static.getContext('2d');
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const rnd = mulberry32(1234);
    for (let y = 0; y < lv.h; y++) {
      for (let x = 0; x < lv.w; x++) {
        const t = HELIO.cellAt(lv, x, y);
        const px = this.ox + x * c, py = this.oy + y * c;
        if (t === HELIO.WALL) {
          // only draw stones that border open ground — outer fill stays dark
          let edge = false;
          for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]) {
            if (HELIO.cellAt(lv, x + dx, y + dy) !== HELIO.WALL) { edge = true; break; }
          }
          if (edge) {
            ctx.fillStyle = '#3a3f47';
            this._rr(ctx, px + 2, py + 2, c - 4, c - 4, 7);
            ctx.fill();
            ctx.fillStyle = '#4c525c';
            this._rr(ctx, px + 2, py + 2, c - 4, c - 8, 7);
            ctx.fill();
            // mossy fleck
            if (rnd() < 0.4) {
              ctx.fillStyle = 'rgba(110,150,110,0.25)';
              ctx.beginPath();
              ctx.arc(px + 6 + rnd() * (c - 12), py + 5 + rnd() * (c - 14), 2.2, 0, 7);
              ctx.fill();
            }
          }
        } else if (t === HELIO.WATER) {
          ctx.fillStyle = '#25476b';
          ctx.fillRect(px, py, c, c);
          ctx.fillStyle = 'rgba(120,170,215,0.10)';
          for (let k = 0; k < 3; k++) {
            ctx.beginPath();
            ctx.arc(px + rnd() * c, py + rnd() * c, 1.5 + rnd() * 2, 0, 7);
            ctx.fill();
          }
        } else {
          // loamy grass, soft checker
          ctx.fillStyle = (x + y) % 2 ? '#2b4132' : '#273c2d';
          ctx.fillRect(px, py, c, c);
          ctx.fillStyle = 'rgba(255,255,240,0.03)';
          this._rr(ctx, px + 1, py + 1, c - 2, c - 2, 5);
          ctx.fill();
          for (let k = 0; k < 2; k++) {
            if (rnd() < 0.35) {
              ctx.strokeStyle = 'rgba(140,190,140,0.18)';
              ctx.lineWidth = 1;
              const gx = px + 4 + rnd() * (c - 8), gy = py + 4 + rnd() * (c - 8);
              ctx.beginPath();
              ctx.moveTo(gx, gy + 3);
              ctx.quadraticCurveTo(gx + 1, gy, gx + 2 + rnd() * 2 - 1, gy - 2);
              ctx.stroke();
            }
          }
        }
      }
    }
  }

  // --- event hooks from main -------------------------------------------------

  onGrow(g, time, isWater) {
    this.growBirth.set(this.key(g.x, g.y), time);
    if (isWater) {
      this.spawnBurst(this.cx(g.x), this.cy(g.y), '#9cc4e8', 6, 1.6, time);
    }
  }

  onBloom(b, time) {
    this.bloomBirth.set(b.c + this.key(b.x, b.y), time);
    const col = VINE_COLORS[b.c] || VINE_COLORS.g;
    this.spawnBurst(this.cx(b.x), this.cy(b.y), col.petal, 14, 2.6, time);
    this.spawnBurst(this.cx(b.x), this.cy(b.y), '#ffd27f', 8, 2.0, time);
  }

  onInvalid() { this.shake = 0.5; }
  onWait(time) { this.waitPulse = time; }

  spawnBurst(x, y, color, n, speed, time) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (0.4 + Math.random() * 0.6) * speed * this.cell;
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - this.cell * 0.8,
        life: 0.5 + Math.random() * 0.45, t0: time, color,
        size: 2 + Math.random() * 3,
      });
    }
  }

  // --- frame -------------------------------------------------------------------

  draw(time, st) {
    const ctx = this.ctx, lv = this.lv, c = this.cell;
    if (!lv) return;
    const dt = Math.min(time - this.lastTime, 0.05);
    this.lastTime = time;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // gentle shake on invalid input
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const s = this.shake * 5;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }

    ctx.drawImage(this.static, 0, 0, this.canvas.width / this.dpr, this.canvas.height / this.dpr);

    // water shimmer
    ctx.save();
    for (let y = 0; y < lv.h; y++) {
      for (let x = 0; x < lv.w; x++) {
        if (HELIO.cellAt(lv, x, y) !== HELIO.WATER) continue;
        const px = this.ox + x * c, py = this.oy + y * c;
        const ph = Math.sin(time * 1.6 + x * 1.1 + y * 2.3);
        ctx.fillStyle = `rgba(140,190,235,${0.06 + 0.05 * ph})`;
        ctx.fillRect(px, py + c * (0.3 + 0.18 * ph), c, c * 0.13);
      }
    }
    ctx.restore();

    // bloom sockets (rings) — skip ones already bloomed
    for (const s of lv.sockets) {
      if (HELIO.bloomAt(st, s.x, s.y)) continue;
      const col = VINE_COLORS[s.c] || VINE_COLORS.g;
      const pulse = 0.75 + 0.25 * Math.sin(time * 2.4 + s.x);
      ctx.save();
      ctx.translate(this.cx(s.x), this.cy(s.y));
      ctx.rotate(time * 0.5);
      ctx.strokeStyle = col.body;
      ctx.globalAlpha = 0.5 + 0.4 * pulse;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([c * 0.14, c * 0.11]);
      ctx.beginPath();
      ctx.arc(0, 0, c * 0.34 * pulse + c * 0.02, 0, 7);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = col.body;
      ctx.beginPath();
      ctx.arc(0, 0, c * 0.06, 0, 7);
      ctx.fill();
      ctx.restore();
    }

    // stone lanterns: pillar, warm glass, gentle pull-radius ring
    for (const l of lv.lanterns) {
      const px = this.cx(l.x), py = this.cy(l.y);
      const R = HELIO.LANTERN_RANGE * c;
      ctx.strokeStyle = `rgba(255,210,127,${0.10 + 0.04 * Math.sin(time * 1.8 + l.x)})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([c * 0.16, c * 0.14]);
      ctx.beginPath();
      ctx.arc(px, py, R, 0, 7);
      ctx.stroke();
      ctx.setLineDash([]);
      const flick = 0.85 + 0.15 * Math.sin(time * 6.3 + l.y * 5);
      const glow = ctx.createRadialGradient(px, py - c * 0.08, c * 0.05, px, py - c * 0.08, c * 1.05);
      glow.addColorStop(0, `rgba(255,205,120,${0.4 * flick})`);
      glow.addColorStop(1, 'rgba(255,205,120,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(px, py - c * 0.08, c * 1.05, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#4c525c';
      this._rr(ctx, px - c * 0.17, py + c * 0.18, c * 0.34, c * 0.16, c * 0.05);
      ctx.fill();
      ctx.fillStyle = '#3a3f47';
      this._rr(ctx, px - c * 0.10, py - c * 0.26, c * 0.20, c * 0.46, c * 0.045);
      ctx.fill();
      ctx.fillStyle = `rgba(255,214,140,${0.75 + 0.25 * flick})`;
      this._rr(ctx, px - c * 0.065, py - c * 0.21, c * 0.13, c * 0.20, c * 0.03);
      ctx.fill();
      ctx.fillStyle = '#4c525c';
      this._rr(ctx, px - c * 0.14, py - c * 0.36, c * 0.28, c * 0.10, c * 0.04);
      ctx.fill();
    }

    // vines
    for (const vine of st.vines) this._drawVine(ctx, vine, st, time);

    // sun
    this._drawSun(ctx, st, time, dt);

    // particles
    this.particles = this.particles.filter((p) => time - p.t0 < p.life);
    for (const p of this.particles) {
      const a = 1 - (time - p.t0) / p.life;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += this.cell * 4.5 * dt;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * a + 0.5, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _drawVine(ctx, vine, st, time) {
    const c = this.cell, lv = this.lv;
    const col = VINE_COLORS[vine.c] || VINE_COLORS.g;
    const cells = vine.cells;
    const tipK = this.key(cells[cells.length - 1][0], cells[cells.length - 1][1]);
    const birth = this.growBirth.get(tipK);
    const tipScale = birth !== undefined ? Math.min(1, (time - birth) / 0.16) : 1;

    // lily pads under any vine cell on water
    for (const [x, y] of cells) {
      if (HELIO.cellAt(lv, x, y) !== HELIO.WATER) continue;
      const k = this.key(x, y);
      const b = this.growBirth.get(k);
      const s = b !== undefined ? Math.min(1, (time - b) / 0.2) : 1;
      ctx.save();
      ctx.translate(this.cx(x), this.cy(y));
      ctx.rotate((x * 7 + y * 13) % 7);
      ctx.scale(s, s);
      ctx.fillStyle = col.pad;
      ctx.beginPath();
      ctx.arc(0, 0, c * 0.40, 0.35, Math.PI * 2 - 0.05);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.arc(-c * 0.08, -c * 0.1, c * 0.2, 0.4, Math.PI * 1.4);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // body path (last segment scales in)
    const pts = cells.map(([x, y]) => [this.cx(x), this.cy(y)]);
    if (pts.length >= 2 && tipScale < 1) {
      const n = pts.length;
      const [ax, ay] = pts[n - 2], [bx, by] = pts[n - 1];
      pts[n - 1] = [ax + (bx - ax) * tipScale, ay + (by - ay) * tipScale];
    }
    const sway = Math.sin(time * 1.7 + cells[0][0] * 3) * c * 0.02;

    // leaves (or thorns) peeking out from under the body
    const thorny = vine.c === 't';
    for (let i = 1; i < cells.length - 1; i++) {
      const [x, y] = cells[i];
      const side = i % 2 ? 1 : -1;
      const px = this.cx(x), py = this.cy(y);
      const ang = Math.atan2(this.cy(cells[i + 1][1]) - py, this.cx(cells[i + 1][0]) - px) + side * 1.9;
      ctx.save();
      ctx.translate(px, py + sway);
      ctx.rotate(ang + (thorny ? 0 : Math.sin(time * 2 + i) * 0.08));
      ctx.fillStyle = thorny ? col.dark : col.body;
      ctx.beginPath();
      if (thorny) {
        ctx.moveTo(c * 0.08, -c * 0.06);
        ctx.lineTo(c * 0.34, 0);
        ctx.lineTo(c * 0.08, c * 0.06);
        ctx.closePath();
      } else {
        ctx.ellipse(c * 0.24, 0, c * 0.16, c * 0.075, 0, 0, 7);
      }
      ctx.fill();
      ctx.restore();
    }
    for (const pass of [
      { w: 0.44, color: col.dark },
      { w: 0.30, color: col.body },
    ]) {
      ctx.strokeStyle = pass.color;
      ctx.lineWidth = c * pass.w;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1] + sway);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1] + (i === pts.length - 1 ? 0 : sway));
      if (pts.length === 1) ctx.lineTo(pts[0][0] + 0.01, pts[0][1]);
      ctx.stroke();
    }

    // root mound
    const [rx, ry] = cells[0];
    ctx.fillStyle = col.dark;
    ctx.beginPath();
    ctx.arc(this.cx(rx), this.cy(ry) + c * 0.1, c * 0.22, Math.PI, 0);
    ctx.fill();

    // tip: bud or bloom
    const [tx, ty] = cells[cells.length - 1];
    const tpx = pts[pts.length - 1][0], tpy = pts[pts.length - 1][1];
    if (vine.bloomed) {
      const bb = this.bloomBirth.get(vine.c + this.key(tx, ty));
      const bs = bb !== undefined ? Math.min(1, (time - bb) / 0.35) : 1;
      const pop = bs < 1 ? 1 + Math.sin(bs * Math.PI) * 0.35 : 1;
      ctx.save();
      ctx.translate(this.cx(tx), this.cy(ty));
      ctx.rotate(Math.sin(time * 0.8) * 0.06);
      ctx.scale(bs * pop, bs * pop);
      for (let k = 0; k < 6; k++) {
        ctx.rotate(Math.PI / 3);
        ctx.fillStyle = col.petal;
        ctx.beginPath();
        ctx.ellipse(c * 0.2, 0, c * 0.17, c * 0.10, 0, 0, 7);
        ctx.fill();
      }
      ctx.fillStyle = col.core;
      ctx.beginPath();
      ctx.arc(0, 0, c * 0.13, 0, 7);
      ctx.fill();
      ctx.restore();
    } else if (vine.c === 't') {
      const s2 = Math.max(tipScale, 0.4);
      ctx.save();
      ctx.translate(tpx, tpy);
      ctx.rotate(time * 0.9);
      ctx.fillStyle = col.dark;
      for (let k = 0; k < 5; k++) {
        ctx.rotate(Math.PI * 2 / 5);
        ctx.beginPath();
        ctx.moveTo(0, -c * 0.06 * s2);
        ctx.lineTo(c * 0.26 * s2, 0);
        ctx.lineTo(0, c * 0.06 * s2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = col.body;
      ctx.beginPath();
      ctx.arc(0, 0, c * 0.12 * s2, 0, 7);
      ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle = col.dark;
      ctx.beginPath();
      ctx.arc(tpx, tpy, c * 0.19 * Math.max(tipScale, 0.4), 0, 7);
      ctx.fill();
      ctx.fillStyle = col.body;
      ctx.beginPath();
      ctx.arc(tpx, tpy, c * 0.13 * Math.max(tipScale, 0.4), 0, 7);
      ctx.fill();
    }
  }

  _drawSun(ctx, st, time, dt) {
    const c = this.cell;
    const tx = st.sun[0], ty = st.sun[1];
    const l = 1 - Math.exp(-14 * dt);
    this.sunVis.x += (tx - this.sunVis.x) * l;
    this.sunVis.y += (ty - this.sunVis.y) * l;
    const px = this.cx(this.sunVis.x) + (this.cx(tx) - this.cx(this.sunVis.x)) * 0;
    const py = this.cy(this.sunVis.y) + Math.sin(time * 2.2) * c * 0.05;

    // glow
    const glow = ctx.createRadialGradient(px, py, c * 0.1, px, py, c * 1.5);
    glow.addColorStop(0, 'rgba(255,210,127,0.5)');
    glow.addColorStop(0.5, 'rgba(255,190,100,0.14)');
    glow.addColorStop(1, 'rgba(255,190,100,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(px, py, c * 1.5, 0, 7);
    ctx.fill();

    // wait pulse ring
    if (this.waitPulse && time - this.waitPulse < 0.5) {
      const t = (time - this.waitPulse) / 0.5;
      ctx.strokeStyle = `rgba(255,210,127,${0.6 * (1 - t)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(px, py, c * (0.3 + t * 0.8), 0, 7);
      ctx.stroke();
    }

    // rays
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(time * 0.4);
    ctx.fillStyle = 'rgba(255,205,120,0.85)';
    for (let k = 0; k < 8; k++) {
      ctx.rotate(Math.PI / 4);
      this._rr(ctx, c * 0.3, -c * 0.035, c * 0.17, c * 0.07, c * 0.035);
      ctx.fill();
    }
    ctx.restore();

    // core
    const core = ctx.createRadialGradient(px - c * 0.07, py - c * 0.09, c * 0.02, px, py, c * 0.30);
    core.addColorStop(0, '#fff3d6');
    core.addColorStop(0.7, '#ffd27f');
    core.addColorStop(1, '#f2a75c');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(px, py, c * 0.28, 0, 7);
    ctx.fill();

    // sleepy face
    ctx.strokeStyle = 'rgba(120,70,20,0.75)';
    ctx.lineWidth = Math.max(1.4, c * 0.035);
    ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(px + s * c * 0.09, py - c * 0.03, c * 0.045, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(px, py + c * 0.09, c * 0.055, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();
  }
}
