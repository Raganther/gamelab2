// ---------------------------------------------------------------------------
// world.js — endless procedural mountain: terrain chunks, trees, rocks,
// kicker ramps and coin lines. The analytic height field is shared by the
// render mesh and the physics, so collision with the snow is exact.
// ---------------------------------------------------------------------------
'use strict';

const WORLD = {
  CHUNK_LEN: 60,        // z-length of one terrain chunk
  WIDTH: 150,           // full x-width of the terrain mesh
  HALF_W: 75,
  PLAY_HALF: 46,        // obstacles/coins spawn inside this half-width
  SLOPE: 0.22,          // base gradient: height rises with +z, so -z is downhill
  AHEAD: 320,           // how far ahead of the player chunks must exist
  BEHIND: 90,           // how far behind chunks are kept
  SEG_X: 60,
  SEG_Z: 26,
};

// --- analytic height field ---------------------------------------------------

function groundHeight(x, z) {
  let y = WORLD.SLOPE * z;
  // valley walls funnel the rider back toward the course
  const e = Math.abs(x) / WORLD.HALF_W;
  y += Math.pow(e, 2.6) * 36;
  // rolling terrain + small moguls
  y += noise2(x * 0.016, z * 0.016, 7) * 5.5;
  y += noise2(x * 0.065, z * 0.065, 13) * 1.15;
  return y;
}

function groundGrad(x, z) {
  const e = 0.55;
  const dx = (groundHeight(x + e, z) - groundHeight(x - e, z)) / (2 * e);
  const dz = (groundHeight(x, z + e) - groundHeight(x, z - e)) / (2 * e);
  return { dx, dz };
}

function groundNormal(x, z, out) {
  const g = groundGrad(x, z);
  out.set(-g.dx, 1, -g.dz).normalize();
  return out;
}

// --- shared geometry / materials --------------------------------------------

function makeWedgeGeometry(w, l, h) {
  // Kicker ramp: entry edge at +z (uphill, height 0) rising to a lip at -z.
  const hw = w / 2, hl = l / 2;
  // prettier-ignore
  const tris = [
    // top (sloped) face
    [-hw, 0,  hl], [ hw, 0,  hl], [ hw, h, -hl],
    [-hw, 0,  hl], [ hw, h, -hl], [-hw, h, -hl],
    // back (vertical) face at the lip
    [ hw, h, -hl], [ hw, 0, -hl], [-hw, 0, -hl],
    [ hw, h, -hl], [-hw, 0, -hl], [-hw, h, -hl],
    // side faces
    [-hw, 0,  hl], [-hw, h, -hl], [-hw, 0, -hl],
    [ hw, 0,  hl], [ hw, 0, -hl], [ hw, h, -hl],
  ];
  const pos = new Float32Array(tris.length * 3);
  tris.forEach((v, i) => { pos[i * 3] = v[0]; pos[i * 3 + 1] = v[1]; pos[i * 3 + 2] = v[2]; });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

const SHARED = {
  init() {
    this.trunkGeo = new THREE.CylinderGeometry(0.12, 0.2, 1.1, 6);
    this.folGeo1 = new THREE.ConeGeometry(1.2, 2.4, 8);
    this.folGeo2 = new THREE.ConeGeometry(0.8, 1.7, 8);
    this.rockGeo = new THREE.IcosahedronGeometry(1, 0);
    this.coinGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.1, 18);
    this.wedgeGeo = makeWedgeGeometry(5.6, 7, 2.0);

    this.trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a34 });
    this.folMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.rockMat = new THREE.MeshLambertMaterial({ color: 0x8a939e, flatShading: true });
    this.coinMat = new THREE.MeshLambertMaterial({ color: 0xffc93c, emissive: 0x7a5500 });
    this.wedgeMat = new THREE.MeshLambertMaterial({ color: 0xe2593b, flatShading: true });
    this.terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  },
};

// --- chunk -------------------------------------------------------------------
// Chunk i covers z in [-(i+1)*LEN, -i*LEN]

class Chunk {
  constructor(index, scene) {
    this.index = index;
    this.scene = scene;
    this.group = new THREE.Group();
    this.colliders = [];   // {x, z, r, top}  (top = absolute y that must be cleared)
    this.ramps = [];       // {x, z, halfW, halfL, lipH}
    this.coins = [];       // {mesh, x, y, z, taken}
    this.zc = -(index + 0.5) * WORLD.CHUNK_LEN;

    const rand = mulberry32((index * 2654435761) ^ 987654321);
    this._buildTerrain();
    this._buildRamps(rand);
    this._buildForest(rand);
    this._buildRocks(rand);
    this._buildCoins(rand);
    scene.add(this.group);
  }

  _buildTerrain() {
    const geo = new THREE.PlaneGeometry(WORLD.WIDTH, WORLD.CHUNK_LEN, WORLD.SEG_X, WORLD.SEG_Z);
    const pos = geo.attributes.position;
    const count = pos.count;
    const normals = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const n = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const wx = pos.getX(i);
      const wz = this.zc - pos.getY(i);      // plane local +y maps to world -z after rotation
      const h = groundHeight(wx, wz);
      pos.setZ(i, h);                        // plane local +z maps to world +y
      groundNormal(wx, wz, n);
      normals[i * 3] = n.x; normals[i * 3 + 1] = -n.z; normals[i * 3 + 2] = n.y;
      // snow shading: slopes pick up a cool blue tint, plus faint sparkle noise
      const tilt = U.clamp((1 - n.y) * 3.2, 0, 1);
      const sparkle = noise2(wx * 0.9, wz * 0.9, 51) * 0.02;
      colors[i * 3]     = U.lerp(0.985, 0.72, tilt) + sparkle;
      colors[i * 3 + 1] = U.lerp(0.985, 0.80, tilt) + sparkle;
      colors[i * 3 + 2] = U.lerp(1.0, 0.92, tilt) + sparkle;
    }
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geo, SHARED.terrainMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.z = this.zc;
    mesh.receiveShadow = true;
    this.terrainGeo = geo;
    this.group.add(mesh);
  }

  _zIn(t) { return -this.index * WORLD.CHUNK_LEN - t * WORLD.CHUNK_LEN; }

  _buildRamps(rand) {
    if (this.index < 3) return;
    if (rand() > 0.68) return;
    const x = (rand() * 2 - 1) * 30;
    const z = this._zIn(0.25 + rand() * 0.5);
    const g = groundGrad(x, z);
    const mesh = new THREE.Mesh(SHARED.wedgeGeo, SHARED.wedgeMat);
    mesh.position.set(x, groundHeight(x, z) - 0.12, z);
    mesh.rotation.x = Math.atan(-g.dz);   // pitch the wedge to match the slope
    mesh.castShadow = true;
    this.group.add(mesh);
    this.ramps.push({ x, z, halfW: 2.8, halfL: 3.5, lipH: 2.0 });
  }

  _clearOfRamps(x, z) {
    // keep take-off and landing corridors clear
    for (const r of this.ramps) {
      if (Math.abs(x - r.x) < 6 && z < r.z + 12 && z > r.z - 30) return false;
    }
    return true;
  }

  _buildForest(rand) {
    const trees = [];
    // sparse trees on the course itself (none in the first chunks)
    if (this.index >= 2) {
      const nCourse = Math.round(U.clamp(2 + this.index * 0.7, 0, 15));
      for (let k = 0; k < nCourse; k++) {
        const x = (rand() * 2 - 1) * WORLD.PLAY_HALF;
        const z = this._zIn(rand());
        if (!this._clearOfRamps(x, z)) continue;
        if (this.index < 5 && Math.abs(x) < 5) continue;  // gentle intro
        trees.push({ x, z, s: 0.85 + rand() * 0.7, collide: true });
      }
    }
    // dense forest framing the course on both sides
    for (let side = -1; side <= 1; side += 2) {
      for (let k = 0; k < 34; k++) {
        const x = side * (49 + rand() * 23);
        const z = this._zIn(rand());
        trees.push({ x, z, s: 0.9 + rand() * 0.9, collide: Math.abs(x) < 67 });
      }
    }

    const nT = trees.length;
    if (!nT) return;
    const trunks = new THREE.InstancedMesh(SHARED.trunkGeo, SHARED.trunkMat, nT);
    const fol1 = new THREE.InstancedMesh(SHARED.folGeo1, SHARED.folMat, nT);
    const fol2 = new THREE.InstancedMesh(SHARED.folGeo2, SHARED.folMat, nT);
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    trees.forEach((t, i) => {
      const y = groundHeight(t.x, t.z);
      const rot = rand() * Math.PI * 2;
      dummy.rotation.set(0, rot, 0);
      dummy.scale.setScalar(t.s);
      dummy.position.set(t.x, y + 0.45 * t.s, t.z);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.set(t.x, y + 2.0 * t.s, t.z);
      dummy.updateMatrix();
      fol1.setMatrixAt(i, dummy.matrix);
      dummy.position.set(t.x, y + 3.4 * t.s, t.z);
      dummy.updateMatrix();
      fol2.setMatrixAt(i, dummy.matrix);
      // snowy pine shades
      const snow = rand() * 0.5;
      col.setRGB(U.lerp(0.16, 0.75, snow), U.lerp(0.42, 0.82, snow), U.lerp(0.25, 0.85, snow));
      fol1.setColorAt(i, col);
      fol2.setColorAt(i, col);
      if (t.collide) this.colliders.push({ x: t.x, z: t.z, r: 0.7 * t.s, top: y + 4.0 * t.s });
    });
    trunks.castShadow = fol1.castShadow = fol2.castShadow = true;
    this.group.add(trunks, fol1, fol2);
    this.instanced = [trunks, fol1, fol2];
  }

  _buildRocks(rand) {
    if (this.index < 3) return;
    const nR = Math.round(U.clamp(1 + this.index * 0.35, 0, 8));
    const rocks = [];
    for (let k = 0; k < nR; k++) {
      const x = (rand() * 2 - 1) * WORLD.PLAY_HALF;
      const z = this._zIn(rand());
      if (!this._clearOfRamps(x, z)) continue;
      rocks.push({ x, z, s: 0.7 + rand() * 1.0 });
    }
    if (!rocks.length) return;
    const mesh = new THREE.InstancedMesh(SHARED.rockGeo, SHARED.rockMat, rocks.length);
    const dummy = new THREE.Object3D();
    rocks.forEach((r, i) => {
      const y = groundHeight(r.x, r.z);
      dummy.position.set(r.x, y + 0.25 * r.s, r.z);
      dummy.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
      dummy.scale.set(r.s * (0.8 + rand() * 0.5), r.s * 0.75, r.s * (0.8 + rand() * 0.5));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      this.colliders.push({ x: r.x, z: r.z, r: 0.95 * r.s, top: y + 1.1 * r.s });
    });
    mesh.castShadow = true;
    this.group.add(mesh);
    (this.instanced = this.instanced || []).push(mesh);
  }

  _addCoin(x, y, z) {
    const mesh = new THREE.Mesh(SHARED.coinGeo, SHARED.coinMat);
    mesh.rotation.x = Math.PI / 2;
    const g = new THREE.Group();
    g.add(mesh);
    g.position.set(x, y, z);
    this.group.add(g);
    this.coins.push({ group: g, x, y, z, taken: false });
  }

  _buildCoins(rand) {
    if (this.index < 1) return;
    if (this.ramps.length) {
      // an arc of coins over the ramp's flight path
      const r = this.ramps[0];
      const heights = [2.6, 4.0, 4.4, 3.6, 2.2];
      heights.forEach((h, i) => {
        const z = r.z - 5 - i * 4;
        this._addCoin(r.x, groundHeight(r.x, z) + h, z);
      });
    }
    if (rand() < 0.85) {
      // a gentle slalom line of coins on the snow
      const x0 = (rand() * 2 - 1) * 34;
      const bend = (rand() * 2 - 1) * 10;
      const z0 = this._zIn(0.15 + rand() * 0.3);
      for (let i = 0; i < 6; i++) {
        const z = z0 - i * 3.4;
        const x = U.clamp(x0 + Math.sin(i * 0.9) * bend, -WORLD.PLAY_HALF, WORLD.PLAY_HALF);
        this._addCoin(x, groundHeight(x, z) + 1.1, z);
      }
    }
  }

  update(dt, time) {
    for (const c of this.coins) {
      if (!c.taken) c.group.rotation.y = time * 2.5 + c.z;
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.terrainGeo.dispose();
    if (this.instanced) this.instanced.forEach((m) => m.dispose());
  }
}

// --- world -------------------------------------------------------------------

class World {
  constructor(scene) {
    this.scene = scene;
    this.chunks = new Map();
    SHARED.init();
  }

  chunkIndexAt(z) { return Math.max(0, Math.floor(-z / WORLD.CHUNK_LEN)); }

  ensure(playerZ) {
    const iMin = this.chunkIndexAt(playerZ + WORLD.BEHIND);
    const iMax = this.chunkIndexAt(playerZ - WORLD.AHEAD);
    for (let i = iMin; i <= iMax; i++) {
      if (!this.chunks.has(i)) this.chunks.set(i, new Chunk(i, this.scene));
    }
    for (const [i, chunk] of this.chunks) {
      if (i < iMin - 1 || i > iMax + 1) {
        chunk.dispose();
        this.chunks.delete(i);
      }
    }
  }

  update(dt, time, playerZ) {
    const pi = this.chunkIndexAt(playerZ);
    for (let i = pi - 1; i <= pi + 1; i++) {
      const c = this.chunks.get(i);
      if (c) c.update(dt, time);
    }
  }

  _near(playerZ, fn) {
    const pi = this.chunkIndexAt(playerZ);
    for (let i = pi - 1; i <= pi + 1; i++) {
      const c = this.chunks.get(i);
      if (c) fn(c);
    }
  }

  collidersNear(playerZ) {
    const out = [];
    this._near(playerZ, (c) => out.push(...c.colliders));
    return out;
  }

  rampsNear(playerZ) {
    const out = [];
    this._near(playerZ, (c) => out.push(...c.ramps));
    return out;
  }

  coinsNear(playerZ) {
    const out = [];
    this._near(playerZ, (c) => { for (const coin of c.coins) if (!coin.taken) out.push(coin); });
    return out;
  }

  // extra height contributed by kicker ramps (rideable surface)
  rampHeightAt(x, z, playerZ) {
    let h = 0;
    this._near(playerZ, (c) => {
      for (const r of c.ramps) {
        if (Math.abs(x - r.x) < r.halfW && z > r.z - r.halfL && z < r.z + r.halfL) {
          h = Math.max(h, r.lipH * (r.z + r.halfL - z) / (2 * r.halfL));
        }
      }
    });
    return h;
  }

  // full physics surface: snow + ramps
  surfaceHeight(x, z, playerZ) {
    return groundHeight(x, z) + this.rampHeightAt(x, z, playerZ);
  }

  onRamp(x, z, playerZ) {
    return this.rampHeightAt(x, z, playerZ) > 0;
  }

  reset() {
    for (const [, chunk] of this.chunks) chunk.dispose();
    this.chunks.clear();
  }
}
