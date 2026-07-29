// ---------------------------------------------------------------------------
// world.js — islands, pilgrims and waves. World space is 1280 × 800,
// uniformly scaled to the screen. The cloud sea begins at y = CLOUD_LINE.
// ---------------------------------------------------------------------------
'use strict';

const WORLD_W = 1280, WORLD_H = 800;
const CLOUD_LINE = 700;

// --- islands -----------------------------------------------------------------

class Island {
  constructor(cx, topY, w, kind) {
    this.cx = cx;
    this.topY = topY;
    this.w = w;
    this.kind = kind;       // 'home' | 'shrine'
    this.bob = Math.random() * 6.28;
  }
  get left() { return this.cx - this.w / 2; }
  get right() { return this.cx + this.w / 2; }
  top(time) { return this.topY + Math.sin(time * 0.5 + this.bob) * 4; }
  contains(x) { return x >= this.left && x <= this.right; }
}

// --- pilgrims ----------------------------------------------------------------

const PSTATE = { WALK: 0, AIR: 1, DELIVERED: 2, LOST: 3 };

class Pilgrim {
  constructor(x, y, cloak) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.state = PSTATE.WALK;
    this.onSerpent = false;
    this.seg = -1;
    this.cloak = cloak;
    this.bob = Math.random() * 6.28;
    this.airTime = 0;
    this.doneT = 0;         // animation timer after delivered/lost
  }

  update(dt, game) {
    if (this.state === PSTATE.DELIVERED || this.state === PSTATE.LOST) {
      this.doneT += dt;
      return;
    }
    // STEP_UP is generous: pilgrims clamber up onto the serpent's back
    // even when it lies flat on the ground (back sits ~2 radii above).
    const WALK = 46, G = 640, STEP_UP = 34, STEP_DOWN = 18, CATCH = 15;
    const { serpent, islands, time } = game;

    if (this.state === PSTATE.WALK) {
      // find current support: island ground or the serpent's back
      let support = null;
      for (const isl of islands) {
        if (!isl.contains(this.x)) continue;
        const ty = isl.top(time);
        if (ty >= this.y - STEP_UP && ty <= this.y + STEP_DOWN) {
          support = { y: ty, ground: true, vx: 0, vy: 0, tx: 1, ty2: 0 };
        }
      }
      const s = serpent.surfaceAt(this.x, this.y, STEP_UP, STEP_DOWN);
      if (s && (!support || s.y < support.y)) {
        const v = serpent.velocity(s.seg, dt);
        const t = serpent.tangent(s.seg);
        support = { y: s.y, ground: false, vx: v.x, vy: v.y, tx: t.x, ty2: t.y, seg: s.seg };
      }

      if (!support) {
        // ground vanished beneath us — we are falling
        this.state = PSTATE.AIR;
        this.airTime = 0;
        // keep the momentum of whatever was carrying us
        this.vy = Math.min(this.vy, 0) ;
        return;
      }

      this.onSerpent = !support.ground;
      this.seg = support.seg !== undefined ? support.seg : -1;
      this.y = support.y;

      // walk toward the shrine; steep serpent scales are slippery
      let walk = WALK, slide = 0;
      if (!support.ground) {
        const slope = Math.abs(support.ty2) / (Math.abs(support.tx) + 0.001);
        if (slope > 1.5) {
          // too steep to climb — slide downhill instead of freezing in place
          walk = 0;
          slide = support.tx * (support.ty2 > 0 ? 1 : -1) * 85;
        } else if (slope > 0.8) walk *= 0.45;
      }
      const dir = 1;   // pilgrims always press on toward the shrine (rightward)
      this.vx = walk * dir + slide + support.vx * 0.92;
      this.vy = support.vy;
      this.x += this.vx * dt;

      // delivered?
      const shrine = islands.find((i) => i.kind === 'shrine');
      // tolerance covers arriving on foot OR riding in on the serpent's back
      if (shrine && shrine.contains(this.x) && Math.abs(this.y - shrine.top(time)) < 42 &&
          this.x > shrine.cx + shrine.w * 0.18) {
        this.state = PSTATE.DELIVERED;
        return;
      }
    } else if (this.state === PSTATE.AIR) {
      this.airTime += dt;
      this.vy += G * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      // catch: only when falling
      if (this.vy > 0) {
        let landY = null, ground = true, seg;
        for (const isl of islands) {
          if (!isl.contains(this.x)) continue;
          const ty = isl.top(game.time);
          if (this.y >= ty - CATCH && this.y <= ty + CATCH * 1.6) { landY = ty; }
        }
        const s = serpent.surfaceAt(this.x, this.y, CATCH, CATCH * 1.6);
        if (s && (landY === null || s.y < landY)) { landY = s.y; ground = false; seg = s.seg; }
        if (landY !== null) {
          this.y = landY;
          this.state = PSTATE.WALK;
          this.onSerpent = !ground;
          this.seg = seg !== undefined ? seg : -1;
          this.vy = 0;
          game.onCatch(this);
          return;
        }
      }
      if (this.y > CLOUD_LINE + 10) {
        this.state = PSTATE.LOST;
        game.onLost(this);
      }
    }
  }
}

// --- waves -------------------------------------------------------------------

function makeWaveLayout(wave) {
  // the gap widens as waves pass; a mid island appears on some later waves
  const gap = Math.min(150 + wave * 34, 430);
  const homeW = 240, shrineW = 250;
  const homeCx = 150 + homeW / 2;
  const shrineCx = Math.min(homeCx + homeW / 2 + gap + shrineW / 2, WORLD_W - shrineW / 2 - 40);
  const islands = [
    new Island(homeCx, 470, homeW, 'home'),
    new Island(shrineCx, 430 + (wave % 3) * 40, shrineW, 'shrine'),
  ];
  const pilgrims = 3 + Math.min(wave, 6);
  const spawnEvery = Math.max(2.6 - wave * 0.12, 1.4);
  const gustEvery = wave >= 3 ? Math.max(9 - wave * 0.5, 5) : 0;
  return { islands, pilgrims, spawnEvery, gustEvery, gap };
}
