#!/usr/bin/env node
// ---------------------------------------------------------------------------
// solve.js — exhaustive solver for Chimework. Tries every pin placement of
// increasing size (0, 1, 2 … budget) against the real simulation engine and
// prints the minimum-pin solution for every level.
//   node tools/solve.js            solve all levels
//   node tools/solve.js 3          solve level index 3 (0-based)
// ---------------------------------------------------------------------------
'use strict';

const CHIME = require('../js/engine.js');
const LEVELS = require('../js/levels.js');

function* combinations(arr, k) {
  if (k === 0) { yield []; return; }
  for (let i = 0; i <= arr.length - k; i++) {
    for (const rest of combinations(arr.slice(i + 1), k - 1)) {
      yield [arr[i], ...rest];
    }
  }
}

function solve(def) {
  const lv = CHIME.parseLevel(def);
  const sockets = [];
  for (let r = 0; r < lv.rows.length; r++) {
    for (let b = 0; b < lv.beats; b++) sockets.push([r, b]);
  }
  let tried = 0;
  for (let k = 0; k <= lv.budget; k++) {
    for (const pins of combinations(sockets, k)) {
      tried++;
      const res = CHIME.simulate(lv, pins);
      if (res.won) return { pins, k, tried, stars: res.stars, endBeat: res.endBeat };
    }
  }
  return { pins: null, tried };
}

const only = process.argv[2] !== undefined ? parseInt(process.argv[2], 10) : null;
let allOk = true;
LEVELS.forEach((def, i) => {
  if (only !== null && i !== only) return;
  const t0 = Date.now();
  const r = solve(def);
  const ms = Date.now() - t0;
  if (!r.pins) {
    allOk = false;
    console.log(`${i}. ${def.name}: UNSOLVABLE within budget ${def.budget} (${r.tried} sims, ${ms}ms)`);
  } else {
    const desc = r.pins.map(([row, beat]) => `${row}@${beat}`).join(' ');
    console.log(`${i}. ${def.name}: par=${r.k} pins [${desc}] stars=${r.stars} win@beat ${r.endBeat} (${r.tried} sims, ${ms}ms)`);
  }
});
process.exit(allOk ? 0 : 1);
