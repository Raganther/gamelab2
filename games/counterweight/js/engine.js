// ---------------------------------------------------------------------------
// engine.js — Counterweight rules. Pure logic, no DOM: runs in the browser
// and in Node (tools/solve.js verifies every level with this exact code).
//
// The one rule: the whole board is a stone plate balanced on a single pivot.
// Gravity is never chosen — it is computed. After every step you take, the
// torque of everything on the plate (stones, gems, and YOU) is summed; if
// one side is too heavy, the plate tilts that way and every loose piece
// slides one cell downhill, over and over, until the plate settles.
//
//  - You (the golem) walk one cell at a time and can push one stone or gem,
//    Sokoban-style. Your granite feet grip: you never slide. Your body
//    blocks sliding pieces — stand downhill to catch things.
//  - Torque: sum of mass × offset from the plate's centre, per axis. If
//    max(|Tx|,|Ty|) > TILT (4), the plate tilts along the heavier axis
//    (ties: x). Stones weigh 3, gems 1, the golem 1. Slotted gems keep
//    their weight; sunk stones are gone from the scales.
//  - A sliding sweep moves each loose piece one cell downhill (downhill-most
//    piece first), then torque is recomputed — cascades can reverse.
//  - Gaps ('_') are holes through the plate. A stone falling in plugs the
//    gap into walkable floor (and its weight leaves the balance forever).
//    A gem falling in is lost — the level is failed until you undo.
//  - A gem that enters its socket (pushed or poured) locks in place.
//    All sockets filled = solved.
// ---------------------------------------------------------------------------
'use strict';

const CW = (function () {

  const FLOOR = 0, WALL = 1, GAP = 2;
  const DIRS = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
  const TILT = 4;          // torque beyond this tips the plate
  const MASS = { golem: 1, stone: 3, gem: 1 };
  const MAX_SWEEPS = 60;

  // characters: # wall, . floor, _ gap, S golem, b stone, g gem, x socket
  function parseLevel(def) {
    const rows = def.map;
    const h = rows.length, w = rows[0].length;
    const cells = new Uint8Array(w * h);
    const stones = [], gems = [], sockets = [];
    let golem = null;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = rows[y][x];
        let base = FLOOR;
        if (ch === '#') base = WALL;
        else if (ch === '_') base = GAP;
        cells[y * w + x] = base;
        if (ch === 'S') golem = [x, y];
        if (ch === 'b') stones.push([x, y]);
        if (ch === 'g') gems.push([x, y]);
        if (ch === 'x') sockets.push({ x, y });
      }
    }
    // the plate's balance point is its exact geometric centre
    const cx = (w - 1) / 2, cy = (h - 1) / 2;
    return {
      w, h, cells, sockets, cx, cy,
      golem0: golem, stones0: stones, gems0: gems,
      name: def.name, par: def.par || 0, hint: def.hint || '',
      tilt: def.tilt || TILT,
    };
  }

  function initialState(lv) {
    return {
      golem: lv.golem0.slice(),
      stones: lv.stones0.map((p) => ({ x: p[0], y: p[1], sunk: false })),
      gems: lv.gems0.map((p) => ({ x: p[0], y: p[1], slotted: false, lost: false })),
      plugged: [],           // "x,y" keys of gaps filled by sunk stones
      steps: 0,
      failed: false,
    };
  }

  function cloneState(st) {
    return {
      golem: st.golem.slice(),
      stones: st.stones.map((s) => ({ ...s })),
      gems: st.gems.map((g) => ({ ...g })),
      plugged: st.plugged.slice(),
      steps: st.steps,
      failed: st.failed,
    };
  }

  function serialize(st) {
    let s = st.golem[0] + ',' + st.golem[1];
    for (const b of st.stones) s += '|' + (b.sunk ? 'X' : b.x + '.' + b.y);
    for (const g of st.gems) s += '|' + (g.lost ? 'L' : (g.slotted ? '!' : '') + g.x + '.' + g.y);
    s += '|' + st.plugged.join(';');
    return s;
  }

  function cellAt(lv, st, x, y) {
    if (x < 0 || y < 0 || x >= lv.w || y >= lv.h) return WALL;
    const c = lv.cells[y * lv.w + x];
    if (c === GAP && st.plugged.indexOf(x + ',' + y) >= 0) return FLOOR;
    return c;
  }

  function stoneAt(st, x, y) {
    for (const b of st.stones) if (!b.sunk && b.x === x && b.y === y) return b;
    return null;
  }

  function gemAt(st, x, y) {
    for (const g of st.gems) if (!g.lost && g.x === x && g.y === y) return g;
    return null;
  }

  function socketAt(lv, x, y) {
    for (const s of lv.sockets) if (s.x === x && s.y === y) return s;
    return null;
  }

  // torque of everything on the plate
  function torque(lv, st) {
    let tx = 0, ty = 0;
    const add = (x, y, m) => { tx += m * (x - lv.cx); ty += m * (y - lv.cy); };
    add(st.golem[0], st.golem[1], MASS.golem);
    for (const b of st.stones) if (!b.sunk) add(b.x, b.y, MASS.stone);
    for (const g of st.gems) if (!g.lost) add(g.x, g.y, MASS.gem);
    return { tx, ty };
  }

  function tiltDir(lv, st) {
    const { tx, ty } = torque(lv, st);
    const ax = Math.abs(tx), ay = Math.abs(ty);
    if (Math.max(ax, ay) <= lv.tilt) return null;
    return ax >= ay ? [Math.sign(tx), 0] : [0, Math.sign(ty)];
  }

  // one sliding sweep in `dir`; returns events, mutates st
  function sweep(lv, st, dir, events) {
    // loose pieces: unslotted gems and unsunk stones, downhill-most first
    const movers = [];
    for (const b of st.stones) if (!b.sunk) movers.push({ p: b, stone: true });
    for (const g of st.gems) if (!g.lost && !g.slotted) movers.push({ p: g, stone: false });
    movers.sort((A, B) => {
      const da = A.p.x * dir[0] + A.p.y * dir[1];
      const db = B.p.x * dir[0] + B.p.y * dir[1];
      if (db !== da) return db - da;
      return (A.p.y - B.p.y) || (A.p.x - B.p.x);
    });
    let moved = false;
    for (const m of movers) {
      const nx = m.p.x + dir[0], ny = m.p.y + dir[1];
      const cell = cellAt(lv, st, nx, ny);
      if (cell === WALL) continue;
      if (nx === st.golem[0] && ny === st.golem[1]) continue;   // body-block
      if (stoneAt(st, nx, ny) || gemAt(st, nx, ny)) continue;
      if (cell === GAP) {
        if (m.stone) {
          m.p.sunk = true;
          st.plugged.push(nx + ',' + ny);
          events.push({ t: 'plug', x: nx, y: ny });
        } else {
          m.p.lost = true;
          st.failed = true;
          events.push({ t: 'gemLost', x: nx, y: ny });
        }
        moved = true;
        continue;
      }
      m.p.x = nx; m.p.y = ny;
      events.push({ t: 'slide', x: nx, y: ny, stone: m.stone });
      if (!m.stone) {
        const so = socketAt(lv, nx, ny);
        if (so) { m.p.slotted = true; events.push({ t: 'lock', x: nx, y: ny }); }
      }
      moved = true;
    }
    return moved;
  }

  // settle the plate: sweeps until balanced, stuck, or a cycle appears
  function resolve(lv, st, events) {
    const seen = new Set();
    for (let i = 0; i < MAX_SWEEPS; i++) {
      const dir = tiltDir(lv, st);
      if (!dir) break;
      events.push({ t: 'tilt', dx: dir[0], dy: dir[1] });
      if (!sweep(lv, st, dir, events)) break;
      const key = serialize(st);
      if (seen.has(key)) break;
      seen.add(key);
    }
  }

  function isWon(lv, st) {
    return lv.sockets.every((s) => {
      const g = gemAt(st, s.x, s.y);
      return g && g.slotted;
    });
  }

  // action: 'U' | 'D' | 'L' | 'R'
  // returns { state, events, won } or null if the move is illegal
  function step(lv, st, action) {
    const d = DIRS[action];
    if (!d) return null;
    const next = cloneState(st);
    const nx = st.golem[0] + d[0], ny = st.golem[1] + d[1];
    const cell = cellAt(lv, next, nx, ny);
    if (cell === WALL || cell === GAP) return null;
    const events = [];

    const b = stoneAt(next, nx, ny);
    const g = gemAt(next, nx, ny);
    if (b || (g && !g.slotted)) {
      // push one piece
      const px = nx + d[0], py = ny + d[1];
      const pcell = cellAt(lv, next, px, py);
      if (pcell === WALL) return null;
      if (px === next.golem[0] && py === next.golem[1]) return null;
      if (stoneAt(next, px, py) || gemAt(next, px, py)) return null;
      if (pcell === GAP) {
        if (b) {
          b.sunk = true;
          next.plugged.push(px + ',' + py);
          events.push({ t: 'plug', x: px, y: py });
        } else {
          g.lost = true;
          next.failed = true;
          events.push({ t: 'gemLost', x: px, y: py });
        }
      } else if (b) {
        b.x = px; b.y = py;
        events.push({ t: 'push', x: px, y: py, stone: true });
      } else {
        g.x = px; g.y = py;
        events.push({ t: 'push', x: px, y: py, stone: false });
        const so = socketAt(lv, px, py);
        if (so) { g.slotted = true; events.push({ t: 'lock', x: px, y: py }); }
      }
    } else if (g && g.slotted) {
      return null;   // a slotted gem is part of the plate now
    }

    next.golem = [nx, ny];
    next.steps++;
    resolve(lv, next, events);
    return { state: next, events, won: isWon(lv, next) };
  }

  return {
    FLOOR, WALL, GAP, DIRS, TILT, MASS,
    parseLevel, initialState, cloneState, serialize,
    cellAt, stoneAt, gemAt, socketAt, torque, tiltDir, step, isWon,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CW;
