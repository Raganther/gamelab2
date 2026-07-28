// ---------------------------------------------------------------------------
// util.js — math helpers, seeded RNG, value noise
// ---------------------------------------------------------------------------
'use strict';

const U = {
  clamp(v, a, b) { return v < a ? a : (v > b ? b : v); },
  lerp(a, b, t) { return a + (b - a) * t; },
  smoothstep(t) { return t * t * (3 - 2 * t); },
  // move `cur` toward `target` by at most `rate*dt`
  approach(cur, target, rate, dt) {
    const d = target - cur;
    const step = rate * dt;
    if (Math.abs(d) <= step) return target;
    return cur + Math.sign(d) * step;
  },
  // exponential smoothing that is stable across framerates
  damp(cur, target, lambda, dt) {
    return U.lerp(cur, target, 1 - Math.exp(-lambda * dt));
  },
};

// Deterministic PRNG (mulberry32)
function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Integer lattice hash → [0,1)
function hash2(ix, iz, seed) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Smooth 2D value noise in [-1, 1]
function noise2(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = U.smoothstep(fx), sz = U.smoothstep(fz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  const v = U.lerp(U.lerp(a, b, sx), U.lerp(c, d, sx), sz);
  return v * 2 - 1;
}
