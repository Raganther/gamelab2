// ---------------------------------------------------------------------------
// engine.js — Heliotrope rules. Pure logic, no DOM: runs in the browser and
// in Node (tools/solve.js verifies every level with this exact code).
//
// The one rule: after every step the sun takes (or a deliberate wait),
// every unbloomed vine grows exactly one cell toward the sun.
//
//  - Growth is greedy and deterministic: the vine moves along the axis with
//    the larger distance to the sun first (ties: horizontal), falling back
//    to the other axis if blocked. If both are blocked it stays dormant.
//  - Vines are blocked by walls, all vine bodies, blooms, the sun itself,
//    and sockets of the wrong colour. They grow freely across water.
//  - The sun walks on land but never water — unless a vine cell lies on it
//    (a lily pad). On land, vine cells are tall hedges the sun cannot pass.
//  - A vine reaching a socket of its own colour blooms there and stops
//    forever; the bloom is solid. All sockets bloomed = level solved.
// ---------------------------------------------------------------------------
'use strict';

const HELIO = (function () {

  const FLOOR = 0, WALL = 1, WATER = 2;
  const DIRS = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };

  // characters: # wall, . floor, ~ water, S sun,
  // vine roots: g p o (green/pink/orange), sockets: G P O
  function parseLevel(def) {
    const rows = def.map;
    const h = rows.length, w = rows[0].length;
    const cells = new Uint8Array(w * h);
    const sockets = [];
    const vines = [];
    let sun = null;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = rows[y][x];
        let base = FLOOR;
        if (ch === '#') base = WALL;
        else if (ch === '~') base = WATER;
        cells[y * w + x] = base;
        if (ch === 'S') sun = [x, y];
        if (ch >= 'a' && ch <= 'z' && ch !== 's') vines.push({ c: ch, cells: [[x, y]], bloomed: false });
        if (ch >= 'A' && ch <= 'Z' && ch !== 'S') sockets.push({ x, y, c: ch.toLowerCase() });
      }
    }
    vines.sort((a, b) => a.c < b.c ? -1 : 1);   // deterministic growth order
    return { w, h, cells, sockets, vines0: vines, sun0: sun, name: def.name, par: def.par || 0, hint: def.hint || '' };
  }

  function initialState(lv) {
    return {
      sun: lv.sun0.slice(),
      vines: lv.vines0.map((v) => ({ c: v.c, cells: v.cells.map((p) => p.slice()), bloomed: false })),
      steps: 0,
    };
  }

  function cloneState(st) {
    return {
      sun: st.sun.slice(),
      vines: st.vines.map((v) => ({ c: v.c, cells: v.cells.map((p) => p.slice()), bloomed: v.bloomed })),
      steps: st.steps,
    };
  }

  function serialize(st) {
    let s = st.sun[0] + ',' + st.sun[1];
    for (const v of st.vines) {
      s += '|' + (v.bloomed ? '!' : '') + v.cells.map((p) => p[0] + '.' + p[1]).join(';');
    }
    return s;
  }

  function cellAt(lv, x, y) {
    if (x < 0 || y < 0 || x >= lv.w || y >= lv.h) return WALL;
    return lv.cells[y * lv.w + x];
  }

  function vineAt(st, x, y) {
    for (const v of st.vines) {
      for (const p of v.cells) if (p[0] === x && p[1] === y) return v;
    }
    return null;
  }

  function bloomAt(st, x, y) {
    for (const v of st.vines) {
      if (!v.bloomed) continue;
      const tip = v.cells[v.cells.length - 1];
      if (tip[0] === x && tip[1] === y) return v;
    }
    return null;
  }

  function socketAt(lv, x, y) {
    for (const s of lv.sockets) if (s.x === x && s.y === y) return s;
    return null;
  }

  function canSunEnter(lv, st, x, y) {
    const c = cellAt(lv, x, y);
    if (c === WALL) return false;
    const v = vineAt(st, x, y);
    if (c === WATER) return !!v;            // lily pad
    if (v) return false;                     // hedge on land (blooms included)
    return true;
  }

  // where would this vine grow right now? returns {x, y, bloom} or null
  function growthTarget(lv, st, vine) {
    if (vine.bloomed) return null;
    const tip = vine.cells[vine.cells.length - 1];
    const dx = st.sun[0] - tip[0], dy = st.sun[1] - tip[1];
    const cand = [];
    const hx = [tip[0] + Math.sign(dx), tip[1]];
    const vy = [tip[0], tip[1] + Math.sign(dy)];
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx !== 0) cand.push(hx);
      if (dy !== 0) cand.push(vy);
    } else {
      if (dy !== 0) cand.push(vy);
      if (dx !== 0) cand.push(hx);
    }
    for (const [x, y] of cand) {
      if (cellAt(lv, x, y) === WALL) continue;
      if (x === st.sun[0] && y === st.sun[1]) continue;
      if (vineAt(st, x, y)) continue;
      const so = socketAt(lv, x, y);
      if (so && so.c !== vine.c) continue;
      return { x, y, bloom: !!so };
    }
    return null;
  }

  function isWon(lv, st) {
    return lv.sockets.every((s) => bloomAt(st, s.x, s.y));
  }

  // action: 'U' | 'D' | 'L' | 'R' | 'W' (wait)
  // returns { state, moved, grows, blooms, won } or null if the move is illegal
  function step(lv, st, action) {
    const next = cloneState(st);
    let moved = false;
    if (action !== 'W') {
      const d = DIRS[action];
      if (!d) return null;
      const nx = st.sun[0] + d[0], ny = st.sun[1] + d[1];
      if (!canSunEnter(lv, st, nx, ny)) return null;
      next.sun = [nx, ny];
      moved = true;
    }
    next.steps++;
    const grows = [], blooms = [];
    for (const vine of next.vines) {
      const t = growthTarget(lv, next, vine);
      if (!t) continue;
      vine.cells.push([t.x, t.y]);
      grows.push({ c: vine.c, x: t.x, y: t.y });
      if (t.bloom) {
        vine.bloomed = true;
        blooms.push({ c: vine.c, x: t.x, y: t.y });
      }
    }
    return { state: next, moved, grows, blooms, won: isWon(lv, next) };
  }

  return {
    FLOOR, WALL, WATER, DIRS,
    parseLevel, initialState, cloneState, serialize,
    cellAt, vineAt, bloomAt, socketAt, canSunEnter, growthTarget, step, isWon,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = HELIO;
