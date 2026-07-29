#!/usr/bin/env node
// ---------------------------------------------------------------------------
// solve.js — BFS solver for Counterweight levels. Verifies solvability with
// the real game engine and prints the optimal solution + par for every level.
//   node tools/solve.js            solve all levels
//   node tools/solve.js 3          solve level index 3 (0-based)
// ---------------------------------------------------------------------------
'use strict';

const CW = require('../js/engine.js');
const LEVELS = require('../js/levels.js');

const ACTIONS = ['U', 'D', 'L', 'R'];
const MAX_NODES = 5_000_000;
const MAX_DEPTH = 90;

function solve(def) {
  const lv = CW.parseLevel(def);
  const start = CW.initialState(lv);
  if (CW.isWon(lv, start)) return { solution: '', nodes: 0 };
  const seen = new Set([CW.serialize(start)]);
  let frontier = [{ st: start, path: '' }];
  let nodes = 0;
  for (let depth = 1; depth <= MAX_DEPTH; depth++) {
    const next = [];
    for (const { st, path } of frontier) {
      for (const a of ACTIONS) {
        const r = CW.step(lv, st, a);
        if (!r) continue;
        nodes++;
        if (nodes > MAX_NODES) return { solution: null, nodes, reason: 'node cap' };
        if (r.won) return { solution: path + a, nodes };
        if (r.state.failed) continue;              // a lost gem is a dead branch
        const key = CW.serialize(r.state);
        if (seen.has(key)) continue;
        seen.add(key);
        next.push({ st: r.state, path: path + a });
      }
    }
    if (!next.length) return { solution: null, nodes, reason: 'exhausted' };
    frontier = next;
  }
  return { solution: null, nodes, reason: 'depth cap' };
}

const only = process.argv[2] !== undefined ? parseInt(process.argv[2], 10) : null;
let allOk = true;
LEVELS.forEach((def, i) => {
  if (only !== null && i !== only) return;
  const t0 = Date.now();
  const r = solve(def);
  const ms = Date.now() - t0;
  if (r.solution === null) {
    allOk = false;
    console.log(`${i}. ${def.name}: UNSOLVABLE (${r.reason}, ${r.nodes} nodes, ${ms}ms)`);
  } else {
    console.log(`${i}. ${def.name}: par=${r.solution.length}  [${r.solution}]  (${r.nodes} nodes, ${ms}ms)`);
  }
});
process.exit(allOk ? 0 : 1);
