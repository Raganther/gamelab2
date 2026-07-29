// ---------------------------------------------------------------------------
// serpent.js — the cloud-serpent. The body follows the TRAIL the head has
// travelled (a dragon streamer): drag the head across a gap and your body
// draws the bridge behind it, then holds the line. A soft physics layer
// (gravity sag, wind, island rest) perturbs the body around that path.
// Pilgrims stand on the topmost arc of any segment.
// ---------------------------------------------------------------------------
'use strict';

class Serpent {
  constructor(n, spacing, x0, y0) {
    this.n = n;
    this.spacing = spacing;
    this.points = [];
    this.trail = [];          // head travel history, resampled every `spacing`
    this.head = { x: x0, y: y0 };   // smoothed head position; leads the trail
    this.headTarget = { x: x0, y: y0 };
    for (let i = 0; i < n; i++) {
      const x = x0 - i * spacing, y = y0 + Math.sin(i * 0.4) * 18;
      this.points.push({ x, y, px: x, py: y });
    }
    for (let i = 1; i <= n + 2; i++) {
      this.trail.push({ x: x0 - i * spacing, y: y0 + Math.sin(i * 0.4) * 18 });
    }
  }

  radius(i) {
    const t = i / (this.n - 1);
    // thick behind the head, tapering to the tail tip
    return 15 * (1 - t * 0.72) * (i < 2 ? 1.12 : 1);
  }

  update(dt, wind, islands, time) {
    const pts = this.points;

    // 1. the head glides toward the pointer — this IS the control
    const k = 1 - Math.exp(-14 * dt);
    this.head.x += (this.headTarget.x - this.head.x) * k;
    this.head.y += (this.headTarget.y - this.head.y) * k;

    // 2. lay fresh trail behind the head, one sample per `spacing` travelled
    let hd = Math.hypot(this.head.x - this.trail[0].x, this.head.y - this.trail[0].y);
    while (hd >= this.spacing) {
      const t0 = this.trail[0];
      const ux = (this.head.x - t0.x) / hd, uy = (this.head.y - t0.y) / hd;
      this.trail.unshift({ x: t0.x + ux * this.spacing, y: t0.y + uy * this.spacing });
      hd -= this.spacing;
      if (this.trail.length > this.n + 2) this.trail.pop();
    }

    // 3. each segment's home is i*spacing back along the travelled path
    const targets = [];
    for (let i = 0; i < this.n; i++) {
      const s = i * this.spacing;
      if (s <= hd || hd < 0.001 && i === 0) {
        const f = hd < 0.001 ? 0 : s / hd;
        targets.push({
          x: this.head.x + (this.trail[0].x - this.head.x) * f,
          y: this.head.y + (this.trail[0].y - this.head.y) * f,
        });
      } else {
        const s2 = s - hd;
        const j = Math.min(Math.floor(s2 / this.spacing), this.trail.length - 2);
        const f = s2 / this.spacing - j;
        const a = this.trail[j], b = this.trail[j + 1];
        targets.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
      }
    }

    // 4. soft physics around the path: weak gravity, wind, spring home
    const GRAV = 30;                          // px/s² — a faint, living sag
    const SPRING = 1 - Math.exp(-11 * dt);
    for (let i = 0; i < this.n; i++) {
      const p = pts[i];
      const vx = (p.x - p.px) * 0.94 + wind.x * dt * 1.2;
      const vy = (p.y - p.py) * 0.94 + (GRAV + wind.y) * dt * dt * 60;
      p.px = p.x; p.py = p.y;
      p.x += vx; p.y += vy;
      p.x += (targets[i].x - p.x) * SPRING;
      p.y += (targets[i].y - p.y) * SPRING;
    }

    // 5. cohesion: neighbours stay a body-length apart despite perturbation
    for (let iter = 0; iter < 2; iter++) {
      for (let i = 0; i < this.n - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.001;
        const diff = (d - this.spacing) / d * 0.5;
        a.x += dx * diff * 0.5; a.y += dy * diff * 0.5;
        b.x -= dx * diff * 0.5; b.y -= dy * diff * 0.5;
      }
    }

    // 6. the body can rest on the floating islands
    if (islands) {
      for (let i = 0; i < this.n; i++) {
        const p = pts[i];
        const r = this.radius(i);
        for (const isl of islands) {
          if (p.x < isl.left - 4 || p.x > isl.right + 4) continue;
          const ty = isl.top(time || 0);
          if (p.y > ty - r && p.y < ty + 70) {
            p.y = ty - r;
            p.py = p.y;                                  // settle, don't bounce
          }
        }
      }
    }

    // soft world bounds
    for (const p of this.points) {
      if (p.x < 10) p.x = 10;
      if (p.x > 1270) p.x = 1270;
      if (p.y < 14) p.y = 14;
      if (p.y > 900) p.y = 900;
    }
  }

  // velocity of segment i this frame (for carrying passengers)
  velocity(i, dt) {
    const p = this.points[i];
    return { x: (p.x - p.px) / dt, y: (p.y - p.py) / dt };
  }

  // local tangent direction at segment i
  tangent(i) {
    const a = this.points[Math.max(0, i - 1)];
    const b = this.points[Math.min(this.n - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 0.001;
    return { x: dx / d, y: dy / d };
  }

  // find the top surface of the serpent at horizontal position x, near y.
  // returns { y, seg } or null
  surfaceAt(x, y, stepUp, stepDown) {
    let best = null;
    for (let i = 0; i < this.n; i++) {
      const p = this.points[i];
      const r = this.radius(i);
      const dx = x - p.x;
      if (Math.abs(dx) > r + 2) continue;
      const lift = Math.sqrt(Math.max(r * r - dx * dx, 0.5));
      const sy = p.y - lift;
      if (sy < y - stepUp || sy > y + stepDown) continue;
      if (!best || sy < best.y) best = { y: sy, seg: i };
    }
    return best;
  }
}
