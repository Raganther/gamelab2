// ---------------------------------------------------------------------------
// levels.js — level definitions. LVL is the active level; world generation,
// physics and atmosphere all read from it.
// ---------------------------------------------------------------------------
'use strict';

const LEVELS = {
  alpine: {
    id: 'alpine',
    name: 'Powder Peak',
    slope: 0.22,
    maxSpeed: 44,
    steerMul: 1,
    bodyClass: 'sky-alpine',
    fogColor: 0xcfe0f2, fogNear: 40, fogFar: 300,
    backdropColor: 0xb9cfe9,
    hemiIntensity: 1.0, sunIntensity: 1.2,
    groundRoughness: 0.92,
    hasCaverns: false,
  },
  caverns: {
    id: 'caverns',
    name: 'Crystal Caverns',
    slope: 0.30,               // steeper — faster baseline
    maxSpeed: 52,
    steerMul: 1.15,            // tighter course needs sharper carving
    bodyClass: 'sky-caverns',
    fogColor: 0xa9bdd8, fogNear: 34, fogFar: 250,
    caveFogColor: 0x0d1a2f, caveFogNear: 10, caveFogFar: 130,
    backdropColor: 0x8ba3c4,
    hemiIntensity: 0.95, sunIntensity: 1.05,
    caveHemiIntensity: 0.26, caveSunIntensity: 0.12,
    groundRoughness: 0.5,      // icier, shinier snow
    hasCaverns: true,
  },
};

let LVL = LEVELS.alpine;
function setLevel(id) { LVL = LEVELS[id] || LEVELS.alpine; }
