// ---------------------------------------------------------------------------
// render.js — Counterweight canvas renderer. A slate plate adrift in a
// starry void; brass fittings, a spirit-level bubble, and a plate that
// visibly leans under its load.
// ---------------------------------------------------------------------------
'use strict';

function cwRand(seed) {
  let a = seed | 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class ScaleRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.static = document.createElement('canvas');
    this.stars = document.createElement('canvas');
    this.cell = 48;
    this.ox = 0; this.oy = 0;
    this.vis = new Map();     // piece id -> {x, y} visual position
    this.leanX = 0; this.leanY = 0;
    this.particles = [];
    this.shake = 0;
    this.lastTime = 0;
  }

  setLevel(lv, st) {
    this.lv = lv;
    this.vis.clear();
    this._sync(st, true);
    this.particles = [];
    this.shake = 0;
    this.resize();
  }

  _sync(st, snap) {
    const set = (id, x, y) => {
      if (snap || !this.vis.has(id)) this.vis.set(id, { x, y });
    };
    set('golem', st.golem[0], st.golem[1]);
    st.stones.forEach((b, i) => set('b' + i, b.x, b.y));
    st.gems.forEach((g, i) => set('g' + i, g.x, g.y));
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = this.canvas.clientWidth, cssH = this.canvas.clientHeight;
    this.canvas.width = cssW * dpr;
    this.canvas.height = cssH * dpr;
    this.dpr = dpr;
    if (!this.lv) return;
    this.cell = Math.floor(Math.min(cssW / (this.lv.w + 1), (cssH - 30) / (this.lv.h + 1), 62));
    this.ox = Math.floor((cssW - this.cell * this.lv.w) / 2);
    this.oy = Math.floor((cssH - this.cell * this.lv.h) / 2) + 8;
    this._renderStars(cssW, cssH);
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

  _renderStars(w, h) {
    this.stars.width = this.canvas.width;
    this.stars.height = this.canvas.height;
    const ctx = this.stars.getContext('2d');
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const rnd = cwRand(777);
    for (let i = 0; i < 140; i++) {
      const a = 0.25 + rnd() * 0.6;
      ctx.fillStyle = `rgba(210,220,255,${a * 0.5})`;
      ctx.beginPath();
      ctx.arc(rnd() * w, rnd() * h, rnd() * 1.3 + 0.3, 0, 7);
      ctx.fill();
    }
  }

  _renderStatic() {
    const lv = this.lv, c = this.cell;
    this.static.width = this.canvas.width;
    this.static.height = this.canvas.height;
    const ctx = this.static.getContext('2d');
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const rnd = cwRand(4242);

    for (let y = 0; y < lv.h; y++) {
      for (let x = 0; x < lv.w; x++) {
        const t = lv.cells[y * lv.w + x];
        const px = this.ox + x * c, py = this.oy + y * c;
        if (t === CW.WALL) {
          let edge = false;
          for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= lv.w || ny >= lv.h) continue;
            if (lv.cells[ny * lv.w + nx] !== CW.WALL) { edge = true; break; }
          }
          if (edge) {
            // brass rim of the plate
            ctx.fillStyle = '#3d3627';
            this._rr(ctx, px + 1, py + 1, c - 2, c - 2, 6);
            ctx.fill();
            ctx.fillStyle = '#87703f';
            this._rr(ctx, px + 1, py + 1, c - 2, c - 7, 6);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,230,170,0.16)';
            this._rr(ctx, px + 4, py + 4, c - 8, c * 0.24, 4);
            ctx.fill();
          }
        } else if (t === CW.GAP) {
          // hole through to the void (stars show through at draw time)
          ctx.save();
          this._rr(ctx, px + 2, py + 2, c - 4, c - 4, 8);
          ctx.clip();
          ctx.fillStyle = '#0c0e1c';
          ctx.fillRect(px, py, c, c);
          const rg = cwRand(x * 31 + y * 57);
          for (let k = 0; k < 4; k++) {
            ctx.fillStyle = `rgba(210,220,255,${0.2 + rg() * 0.3})`;
            ctx.beginPath();
            ctx.arc(px + 4 + rg() * (c - 8), py + 4 + rg() * (c - 8), rg() + 0.3, 0, 7);
            ctx.fill();
          }
          ctx.restore();
          ctx.strokeStyle = 'rgba(20,22,38,0.9)';
          ctx.lineWidth = 2.5;
          this._rr(ctx, px + 2, py + 2, c - 4, c - 4, 8);
          ctx.stroke();
        } else {
          // slate slab
          const v = 6 + Math.floor(rnd() * 8);
          ctx.fillStyle = `rgb(${104 + v},${109 + v},${126 + v})`;
          ctx.fillRect(px, py, c, c);
          ctx.strokeStyle = 'rgba(30,32,48,0.35)';
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 0.5, py + 0.5, c - 1, c - 1);
          if (rnd() < 0.3) {
            ctx.strokeStyle = 'rgba(60,64,84,0.5)';
            ctx.beginPath();
            const sx = px + rnd() * c * 0.7 + c * 0.15, sy = py + rnd() * c * 0.7 + c * 0.15;
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx + (rnd() - 0.5) * c * 0.4, sy + (rnd() - 0.5) * c * 0.4);
            ctx.stroke();
          }
        }
      }
    }
    // pivot mark at the exact centre of the plate
    const pxc = this.cx(lv.cx), pyc = this.cy(lv.cy);
    ctx.strokeStyle = 'rgba(217,164,65,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(pxc, pyc, c * 0.16, 0, 7);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pxc - c * 0.24, pyc); ctx.lineTo(pxc + c * 0.24, pyc);
    ctx.moveTo(pxc, pyc - c * 0.24); ctx.lineTo(pxc, pyc + c * 0.24);
    ctx.stroke();
  }

  // --- event hooks -------------------------------------------------------------

  onEvents(events, time) {
    for (const ev of events) {
      if (ev.t === 'lock') this.burst(this.cx(ev.x), this.cy(ev.y), '#ffd98a', 14, 2.4, time);
      if (ev.t === 'plug') this.burst(this.cx(ev.x), this.cy(ev.y), '#9aa2b8', 12, 2.0, time);
      if (ev.t === 'gemLost') this.burst(this.cx(ev.x), this.cy(ev.y), '#3fd2c4', 16, 2.6, time);
      if (ev.t === 'tilt') this.shake = Math.min(this.shake + 0.12, 0.35);
    }
  }

  onInvalid() { this.shake = 0.5; }

  burst(x, y, color, n, speed, time) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (0.4 + Math.random() * 0.6) * speed * this.cell;
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - this.cell,
        life: 0.5 + Math.random() * 0.4, t0: time, color, size: 2 + Math.random() * 3,
      });
    }
  }

  // --- frame ---------------------------------------------------------------------

  draw(time, st, torque) {
    const ctx = this.ctx, lv = this.lv, c = this.cell;
    if (!lv) return;
    const dt = Math.min(time - this.lastTime, 0.05);
    this.lastTime = time;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.stars, 0, 0, this.canvas.width / this.dpr, this.canvas.height / this.dpr);

    // the plate leans toward its heavy side
    const LT = lv.tilt;
    const targetLX = Math.max(-1.6, Math.min(1.6, torque.tx / LT)) * 5;
    const targetLY = Math.max(-1.6, Math.min(1.6, torque.ty / LT)) * 5;
    this.leanX += (targetLX - this.leanX) * (1 - Math.exp(-7 * dt));
    this.leanY += (targetLY - this.leanY) * (1 - Math.exp(-7 * dt));

    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 1.6);
    const sh = this.shake * 4;

    ctx.save();
    ctx.translate(this.leanX + (Math.random() - 0.5) * sh, this.leanY + (Math.random() - 0.5) * sh);

    // plate shadow drifts opposite the lean
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    this._rr(ctx, this.ox - this.leanX * 2.2 + 6, this.oy - this.leanY * 2.2 + 10,
      c * lv.w - 2, c * lv.h - 2, 14);
    ctx.fill();

    ctx.drawImage(this.static, 0, 0, this.canvas.width / this.dpr, this.canvas.height / this.dpr);

    // plugged gaps: a sunken stone fills the hole
    for (const key of st.plugged) {
      const [x, y] = key.split(',').map(Number);
      const px = this.ox + x * c, py = this.oy + y * c;
      ctx.fillStyle = '#565d6e';
      this._rr(ctx, px + 3, py + 3, c - 6, c - 6, 8);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      this._rr(ctx, px + 5, py + 5, c - 10, c * 0.3, 6);
      ctx.fill();
    }

    // sockets
    for (const s of lv.sockets) {
      const g = CW.gemAt(st, s.x, s.y);
      const filled = g && g.slotted;
      const px = this.cx(s.x), py = this.cy(s.y);
      ctx.strokeStyle = filled ? '#d9a441' : 'rgba(217,164,65,0.75)';
      ctx.lineWidth = 3;
      if (!filled) ctx.setLineDash([c * 0.1, c * 0.09]);
      ctx.beginPath();
      ctx.arc(px, py, c * 0.32 + (filled ? 0 : Math.sin(time * 2.6 + s.x) * c * 0.02), 0, 7);
      ctx.stroke();
      ctx.setLineDash([]);
      if (!filled) {
        ctx.fillStyle = 'rgba(217,164,65,0.25)';
        ctx.beginPath();
        ctx.arc(px, py, c * 0.09, 0, 7);
        ctx.fill();
      }
    }

    // pieces: damp visual positions toward true positions
    const l = 1 - Math.exp(-13 * dt);
    const move = (id, tx, ty) => {
      const v = this.vis.get(id) || { x: tx, y: ty };
      v.x += (tx - v.x) * l;
      v.y += (ty - v.y) * l;
      this.vis.set(id, v);
      return v;
    };

    st.stones.forEach((b, i) => {
      if (b.sunk) return;
      const v = move('b' + i, b.x, b.y);
      this._drawStone(ctx, this.cx(v.x), this.cy(v.y), c, i);
    });
    st.gems.forEach((g, i) => {
      if (g.lost) return;
      const v = move('g' + i, g.x, g.y);
      this._drawGem(ctx, this.cx(v.x), this.cy(v.y), c, g.slotted, time + i);
    });
    {
      const v = move('golem', st.golem[0], st.golem[1]);
      this._drawGolem(ctx, this.cx(v.x), this.cy(v.y), c, time);
    }

    // particles
    this.particles = this.particles.filter((p) => time - p.t0 < p.life);
    for (const p of this.particles) {
      const a = 1 - (time - p.t0) / p.life;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += this.cell * 4 * dt;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * a + 0.4, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    this._drawGauge(ctx, torque, lv, time);
  }

  _drawStone(ctx, px, py, c, i) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(px, py + c * 0.3, c * 0.36, c * 0.13, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#454b5b';
    this._rr(ctx, px - c * 0.36, py - c * 0.32, c * 0.72, c * 0.64, c * 0.16);
    ctx.fill();
    ctx.fillStyle = '#5c6375';
    this._rr(ctx, px - c * 0.36, py - c * 0.32, c * 0.72, c * 0.5, c * 0.16);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    this._rr(ctx, px - c * 0.28, py - c * 0.26, c * 0.56, c * 0.16, c * 0.08);
    ctx.fill();
    // carved weight mark
    ctx.strokeStyle = 'rgba(20,22,34,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px - c * 0.1, py + c * 0.02);
    ctx.lineTo(px + c * 0.1, py + c * 0.02);
    ctx.moveTo(px - c * 0.06, py - c * 0.06);
    ctx.lineTo(px + c * 0.06, py - c * 0.06);
    ctx.stroke();
  }

  _drawGem(ctx, px, py, c, slotted, t) {
    const bob = slotted ? 0 : Math.sin(t * 2.2) * c * 0.03;
    py += bob;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(px, py + c * 0.26 - bob, c * 0.22, c * 0.09, 0, 0, 7);
    ctx.fill();
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.PI / 4);
    const s = c * 0.21;
    const grad = ctx.createLinearGradient(-s, -s, s, s);
    grad.addColorStop(0, '#7ceadf');
    grad.addColorStop(0.5, '#3fd2c4');
    grad.addColorStop(1, '#1f9d94');
    ctx.fillStyle = grad;
    this._rr(ctx, -s, -s, s * 2, s * 2, s * 0.3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    this._rr(ctx, -s * 0.55, -s * 0.55, s * 0.8, s * 0.5, s * 0.2);
    ctx.fill();
    ctx.restore();
    if (slotted) {
      ctx.strokeStyle = 'rgba(255,217,138,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, c * 0.3, 0, 7);
      ctx.stroke();
    }
  }

  _drawGolem(ctx, px, py, c, time) {
    const bounce = Math.abs(Math.sin(time * 3)) * c * 0.015;
    py -= bounce;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(px, py + c * 0.3 + bounce, c * 0.26, c * 0.1, 0, 0, 7);
    ctx.fill();
    // stubby granite feet
    ctx.fillStyle = '#8a4f33';
    this._rr(ctx, px - c * 0.2, py + c * 0.12, c * 0.16, c * 0.18, c * 0.05);
    ctx.fill();
    this._rr(ctx, px + c * 0.04, py + c * 0.12, c * 0.16, c * 0.18, c * 0.05);
    ctx.fill();
    // terracotta body
    const grad = ctx.createRadialGradient(px - c * 0.08, py - c * 0.12, c * 0.04, px, py, c * 0.34);
    grad.addColorStop(0, '#e0885c');
    grad.addColorStop(1, '#b35f3c');
    ctx.fillStyle = grad;
    this._rr(ctx, px - c * 0.26, py - c * 0.26, c * 0.52, c * 0.44, c * 0.18);
    ctx.fill();
    // brass banding
    ctx.strokeStyle = 'rgba(217,164,65,0.7)';
    ctx.lineWidth = Math.max(1.5, c * 0.03);
    ctx.beginPath();
    ctx.moveTo(px - c * 0.24, py + c * 0.05);
    ctx.lineTo(px + c * 0.24, py + c * 0.05);
    ctx.stroke();
    // glowing rune eyes
    ctx.fillStyle = '#ffe9b8';
    ctx.beginPath();
    ctx.arc(px - c * 0.1, py - c * 0.1, c * 0.045, 0, 7);
    ctx.arc(px + c * 0.1, py - c * 0.1, c * 0.045, 0, 7);
    ctx.fill();
  }

  _drawGauge(ctx, torque, lv, time) {
    // spirit level, top-right: the bubble drifts to the HIGH (light) side
    const R = 34;
    const gx = this.canvas.width / this.dpr - R - 18, gy = R + 16;
    ctx.fillStyle = 'rgba(18,20,36,0.85)';
    ctx.beginPath();
    ctx.arc(gx, gy, R + 6, 0, 7);
    ctx.fill();
    ctx.strokeStyle = '#87703f';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(gx, gy, R + 6, 0, 7);
    ctx.stroke();
    // threshold ring
    ctx.strokeStyle = 'rgba(217,164,65,0.4)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(gx, gy, R * 0.55, 0, 7);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(gx - R, gy); ctx.lineTo(gx + R, gy);
    ctx.moveTo(gx, gy - R); ctx.lineTo(gx, gy + R);
    ctx.stroke();
    // bubble: opposite the heavy side, clamped
    const nx = Math.max(-1.5, Math.min(1.5, torque.tx / lv.tilt));
    const ny = Math.max(-1.5, Math.min(1.5, torque.ty / lv.tilt));
    const strain = Math.max(Math.abs(nx), Math.abs(ny));
    const bx = gx - nx * R * 0.55, by = gy - ny * R * 0.55;
    const col = strain > 1 ? '#ff6b57' : (strain > 0.75 ? '#ffb246' : '#9fe8b0');
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(bx, by, 6 + (strain > 1 ? Math.sin(time * 10) * 1.5 : 0), 0, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.arc(bx - 1.5, by - 1.5, 2, 0, 7);
    ctx.fill();
  }
}
