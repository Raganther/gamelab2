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

// Procedural tileable grain texture (snow, ice, rock…) — no image assets.
// opts: base [r,g,b], vary (per-pixel jitter), speckle {chance, color, vary},
// bands {amp, freq} for horizontal rock striations.
function makeGrainTexture(opts) {
  const size = opts.size || 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const rand = mulberry32(opts.seed || 1);
  const [br, bg, bb] = opts.base;
  const vary = opts.vary || 8;
  for (let y = 0; y < size; y++) {
    // low-frequency band value, tileable via sin
    let band = 0;
    if (opts.bands) {
      band = Math.sin((y / size) * Math.PI * 2 * opts.bands.freq) * opts.bands.amp;
    }
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // two octaves of tileable-ish grain (period = size via wrap of hash lattice)
      const n1 = hash2(x & 255, y & 255, opts.seed || 1) - 0.5;
      const n2 = hash2((x >> 2) & 255, (y >> 2) & 255, (opts.seed || 1) + 7) - 0.5;
      let v = (n1 * 0.6 + n2 * 0.9) * 2 * vary + band;
      let r = br + v, g = bg + v, b = bb + v;
      if (opts.speckle && rand() < opts.speckle.chance) {
        const s = opts.speckle.color;
        const sv = (rand() - 0.5) * (opts.speckle.vary || 20);
        r = s[0] + sv; g = s[1] + sv; b = s[2] + sv;
      }
      d[i] = U.clamp(r, 0, 255);
      d[i + 1] = U.clamp(g, 0, 255);
      d[i + 2] = U.clamp(b, 0, 255);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.encoding = THREE.sRGBEncoding;
  return tex;
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
