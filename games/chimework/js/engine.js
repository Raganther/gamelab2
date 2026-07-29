// ---------------------------------------------------------------------------
// engine.js — Chimework rules. Pure logic, no DOM: runs in the browser and
// in Node (tools/solve.js verifies every level with this exact code).
//
// The machine: a music-box drum turns one column per beat, forever repeating
// its B columns. You place pins on the drum before pressing play. When a
// pin passes the read arm, its ROW's mechanism fires on that beat — and
// fires again every revolution, because the drum comes back around.
//
//  - TOGGLE mechanisms flip a track switch (left/right) each time they fire.
//  - HAMMER mechanisms strike once, on their beat only: if the marble is
//    sitting on the hammer's node at that exact beat, it is launched along
//    the launch rail. Timing is everything.
//  - The marble rolls one node per beat along the track graph. A dead end
//    drops it into the works (lost). Reaching the cup wins.
//  - The song lasts `revs` revolutions of the drum. If the marble is still
//    rolling when the song ends, the box winds down (lost).
//
// A level is solved by choosing WHERE and WHEN — which row, which beat —
// to place a limited number of pins.
// ---------------------------------------------------------------------------
'use strict';

const CHIME = (function () {

  function parseLevel(def) {
    // normalize node table
    const nodes = {};
    for (const [id, n] of Object.entries(def.nodes)) {
      nodes[id] = {
        id,
        x: n.x, y: n.y,
        out: n.out || null,          // plain rail: next node
        sw: n.sw || null,            // switch: [out-when-0, out-when-1]
        launch: n.launch || null,    // hammer launch target
        bell: !!n.bell,
        star: !!n.star,
        cup: !!n.cup,
      };
    }
    return {
      name: def.name,
      hint: def.hint || '',
      beats: def.beats,
      revs: def.revs || 2,
      budget: def.budget,
      par: def.par || 0,
      solution: def.solution || null,   // [[row,beat], ...] baked by solver
      rows: def.rows,                   // [{type:'toggle'|'hammer', node, label, color, note}]
      nodes,
      start: def.start,
    };
  }

  // pins: array of [row, beat]
  // returns { won, lost, endBeat, stars, trace }
  // trace[t] = { fired:[rowIdx], from, to, launch, toggles:[...states], rang, star, won, lost }
  function simulate(lv, pins) {
    const toggles = lv.rows.map(() => 0);
    let marble = lv.start;
    let won = false, lost = false, stars = 0;
    const total = lv.beats * lv.revs;
    const trace = [];
    const pinAt = (row, beat) => pins.some(([r, b]) => r === row && b === beat);

    for (let t = 0; t < total; t++) {
      const col = t % lv.beats;
      const fired = [];
      let launched = false;

      lv.rows.forEach((row, ri) => {
        if (!pinAt(ri, col)) return;
        fired.push(ri);
        if (row.type === 'toggle') {
          toggles[ri] = 1 - toggles[ri];
        } else if (row.type === 'hammer') {
          if (marble === row.node) launched = true;
        }
      });

      const from = marble;
      let to = null;
      const node = lv.nodes[marble];
      if (launched && node.launch) {
        to = node.launch;
      } else if (node.sw) {
        // a toggle row may drive several switches on one axle (row.nodes)
        const ri = lv.rows.findIndex((r) => r.type === 'toggle' &&
          (r.node === node.id || (r.nodes && r.nodes.indexOf(node.id) >= 0)));
        to = node.sw[ri >= 0 ? toggles[ri] : 0];
      } else {
        to = node.out;
      }

      const step = {
        t, fired, from, to,
        launch: launched && node.launch ? true : false,
        toggles: toggles.slice(),
        rang: false, star: false, won: false, lost: false,
      };

      if (!to) {
        lost = true;
        step.lost = true;
        trace.push(step);
        break;
      }
      marble = to;
      const target = lv.nodes[to];
      if (target.bell) step.rang = true;
      if (target.star) { step.star = true; stars++; }
      if (target.cup) {
        won = true;
        step.won = true;
        trace.push(step);
        break;
      }
      trace.push(step);
    }
    if (!won && !lost) lost = true;   // the song ended with the marble still rolling
    return { won, lost, endBeat: trace.length, stars, trace };
  }

  return { parseLevel, simulate };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CHIME;
