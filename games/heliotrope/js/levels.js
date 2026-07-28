// ---------------------------------------------------------------------------
// levels.js — Heliotrope levels. Every level is verified solvable by
// tools/solve.js, which also computes `par` (the minimum number of steps).
//
//   #  wall      .  floor      ~  water      S  sun start
//   g/p/o  vine roots          G/P/O  matching bloom sockets
// ---------------------------------------------------------------------------
'use strict';

const LEVELS_HELIO = [
  {
    name: 'First Light',
    par: 4,
    hint: 'Every step you take, the vine grows one step toward you. Lead it home.',
    map: [
      '#########',
      '#.......#',
      '#.g...G.#',
      '#.......#',
      '#...S...#',
      '#########',
    ],
  },
  {
    name: 'The Turn',
    par: 11,
    hint: 'Vines prefer the longer direction first. Use corners to steer.',
    map: [
      '##########',
      '#....#...#',
      '#.g..#.G.#',
      '#....#...#',
      '#..S.##..#',
      '#........#',
      '##########',
    ],
  },
  {
    name: 'Patience',
    par: 4,
    hint: 'Space waits in place — the garden keeps growing. Sometimes that is all you need.',
    map: [
      '##########',
      '#g...G.#S#',
      '#......#.#',
      '##########',
    ],
  },
  {
    name: 'Around the Pond',
    par: 7,
    hint: 'Vines float across water. Stand beyond the pond and call.',
    map: [
      '############',
      '#..........#',
      '#.g...~~...#',
      '#.....~~G..#',
      '#..S..~~...#',
      '#..........#',
      '############',
    ],
  },
  {
    name: 'Hedgerow',
    par: 6,
    hint: 'On land, a vine is a hedge. One vine can fence in another.',
    map: [
      '###########',
      '#.g.....G.#',
      '#.........#',
      '#.p.....P.#',
      '#....S....#',
      '###########',
    ],
  },
  {
    name: 'Two Ponds',
    par: 10,
    hint: 'Everything at once: bridges, hedges, patience.',
    map: [
      '#############',
      '#g....~~....#',
      '#.....~~..G.#',
      '#..S..~~....#',
      '#...........#',
      '#.p...~~..P.#',
      '#.....~~....#',
      '#############',
    ],
  },
  {
    name: 'Wrong Garden',
    par: 16,
    hint: 'A socket only opens for its own colour — to anyone else it is a wall.',
    map: [
      '############',
      '#.G......P.#',
      '#..........#',
      '#..g....p..#',
      '#..........#',
      '#.....S....#',
      '############',
    ],
  },
  {
    name: 'The Snare',
    par: 12,
    hint: 'The garden loves you too much. Do not let it close around you.',
    map: [
      '#########',
      '#g......#',
      '#.###.#.#',
      '#.#G..#.#',
      '#.###.#.#',
      '#..S....#',
      '#########',
    ],
  },
  {
    name: 'Lily Road',
    par: 23,
    hint: 'A vine lying on water is a lily bridge — you can walk on it.',
    map: [
      '#############',
      '##########..#',
      '#..~~~~~~~G.#',
      '#..~~~~~~~..#',
      '#.g~~~~~~~.S#',
      '#...~~~~~~###',
      '#.P.~~~~~~p##',
      '#############',
    ],
  },
];

if (typeof module !== 'undefined' && module.exports) module.exports = LEVELS_HELIO;
