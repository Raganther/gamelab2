// ---------------------------------------------------------------------------
// world.js — endless procedural terrain, parameterized by the active level
// (levels.js). Alpine: wide slope, forests, kickers. Caverns: a meandering
// canyon that periodically dives through crystal caves with rock ceilings.
// The analytic height field is shared by the render mesh and the physics,
// so collision with the ground is exact.
// ---------------------------------------------------------------------------
'use strict';

const WORLD = {
  CHUNK_LEN: 60,        // z-length of one terrain chunk
  WIDTH: 150,           // full x-width of the terrain mesh
  HALF_W: 75,
  PLAY_HALF: 46,        // alpine: obstacles/coins spawn inside this half-width
  AHEAD: 320,           // how far ahead of the player chunks must exist
  BEHIND: 90,           // how far behind chunks are kept
  SEG_X: 60,
  SEG_Z: 26,
};

// --- analytic height fields --------------------------------------------------

// the canyon floor meanders — carving is mandatory
function canyonCenter(z) {
  return noise2(3.7, z * 0.006, 21) * 26;
}

// 0 = open sky, 1 = deep inside a cavern (caverns level only)
function cavernFactor(z) {
  if (!LVL.hasCaverns) return 0;
  const SPAN = 220;
  const u = -z / SPAN;
  const si = Math.floor(u);
  if (si < 2) return 0;                        // open intro
  if (hash2(si, 17, 4242) > 0.55) return 0;    // not every span has a cave
  const t = u - si;
  const up = U.smoothstep(U.clamp((t - 0.26) / 0.14, 0, 1));
  const down = U.smoothstep(U.clamp((t - 0.72) / 0.14, 0, 1));
  return up * (1 - down);
}

function groundHeight(x, z) {
  if (LVL.hasCaverns) {
    const dx = Math.abs(x - canyonCenter(z));
    let y = LVL.slope * z;
    y += Math.min(Math.pow(dx / 30, 3) * 60, 110);   // steep half-pipe walls
    y += noise2(x * 0.035, z * 0.035, 7) * 2.8;
    y += noise2(x * 0.1, z * 0.1, 13) * 1.1;
    return y;
  }
  let y = LVL.slope * z;
  // valley walls funnel the rider back toward the course
  const e = Math.abs(x) / WORLD.HALF_W;
  y += Math.pow(e, 2.6) * 36;
  // rolling terrain + small moguls
  y += noise2(x * 0.016, z * 0.016, 7) * 5.5;
  y += noise2(x * 0.065, z * 0.065, 13) * 1.15;
  return y;
}

// cave ceiling surface (only meaningful where cavernFactor > 0)
function ceilingHeight(x, z) {
  const cf = cavernFactor(z);
  const dx = x - canyonCenter(z);
  let y = LVL.slope * z + U.lerp(48, 11.5, cf);
  y -= Math.pow(dx / 22, 2) * 7;               // arch: highest over the middle
  y += noise2(x * 0.06, z * 0.06, 99) * 2.2;
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
    if (this.ready) return;
    this.ready = true;

    // procedural textures — no image assets
    this.snowTex = makeGrainTexture({
      base: [246, 248, 253], vary: 9, seed: 11,
      speckle: { chance: 0.012, color: [214, 228, 255], vary: 18 },
    });
    this.snowTex.repeat.set(15, 6);
    this.iceTex = makeGrainTexture({
      base: [222, 236, 250], vary: 9, seed: 23,
      speckle: { chance: 0.02, color: [170, 210, 255], vary: 30 },
    });
    this.iceTex.repeat.set(15, 6);
    this.rockTex = makeGrainTexture({
      base: [116, 112, 118], vary: 22, seed: 37,
      bands: { amp: 14, freq: 9 },
      speckle: { chance: 0.006, color: [70, 66, 74], vary: 16 },
    });
    this.rockTex.repeat.set(10, 4);

    this.trunkGeo = new THREE.CylinderGeometry(0.12, 0.2, 1.1, 6);
    this.folGeo1 = new THREE.ConeGeometry(1.2, 2.4, 8);
    this.folGeo2 = new THREE.ConeGeometry(0.8, 1.7, 8);
    this.capGeo = new THREE.ConeGeometry(0.52, 0.85, 8);
    this.rockGeo = new THREE.IcosahedronGeometry(1, 0);
    this.spireGeo = new THREE.ConeGeometry(0.62, 3.1, 7);
    this.stalGeo = new THREE.ConeGeometry(0.4, 2.4, 6);
    this.crystalGeo = new THREE.OctahedronGeometry(0.5, 0);
    this.coinGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.1, 18);
    this.wedgeGeo = makeWedgeGeometry(5.6, 7, 2.0);

    this.trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a34 });
    this.folMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.capMat = new THREE.MeshLambertMaterial({ color: 0xf4f8ff });
    this.rockMat = new THREE.MeshStandardMaterial({
      color: 0x8a929e, flatShading: true, roughness: 0.85, metalness: 0.05,
    });
    this.spireMat = new THREE.MeshStandardMaterial({
      color: 0xb9dcf2, flatShading: true, roughness: 0.32, metalness: 0.1,
    });
    this.stalMat = new THREE.MeshStandardMaterial({
      color: 0x6d6a74, flatShading: true, roughness: 0.9,
    });
    this.crystalMatCyan = new THREE.MeshStandardMaterial({
      color: 0x59e8ff, emissive: 0x1fc8ef, emissiveIntensity: 1.6,
      flatShading: true, roughness: 0.25, metalness: 0.1,
    });
    this.crystalMatViolet = new THREE.MeshStandardMaterial({
      color: 0xc490ff, emissive: 0x7a2fe8, emissiveIntensity: 1.4,
      flatShading: true, roughness: 0.25, metalness: 0.1,
    });
    this.coinMat = new THREE.MeshStandardMaterial({
      color: 0xffc93c, emissive: 0x8a5c00, emissiveIntensity: 0.55,
      roughness: 0.28, metalness: 0.75,
    });
    this.wedgeMat = new THREE.MeshStandardMaterial({
      color: 0xe2593b, emissive: 0x53150a, emissiveIntensity: 0.5,
      flatShading: true, roughness: 0.6,
    });
    this.terrainMatSnow = new THREE.MeshStandardMaterial({
      map: this.snowTex, vertexColors: true, roughness: 0.92, metalness: 0,
    });
    this.terrainMatIce = new THREE.MeshStandardMaterial({
      map: this.iceTex, vertexColors: true, roughness: 0.5, metalness: 0.04,
    });
    this.ceilMat = new THREE.MeshStandardMaterial({
      map: this.rockTex, vertexColors: true, roughness: 0.95,
      side: THREE.DoubleSide,
    });
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
    this.coins = [];       // {group, x, y, z, taken}
    this.instanced = [];
    this.geos = [];
    this.zc = -(index + 0.5) * WORLD.CHUNK_LEN;

    const rand = mulberry32((index * 2654435761) ^ 987654321);
    this._buildTerrain();
    if (LVL.hasCaverns) {
      this._buildCeiling(rand);
      this._buildRampsCanyon(rand);
      this._buildSpires(rand);
      this._buildRocksCanyon(rand);
      this._buildCrystals(rand);
      this._buildPinesCanyon(rand);
      this._buildCoinsCanyon(rand);
    } else {
      this._buildRamps(rand);
      this._buildForest(rand);
      this._buildRocks(rand);
      this._buildCoins(rand);
    }
    scene.add(this.group);
  }

  _zIn(t) { return -this.index * WORLD.CHUNK_LEN - t * WORLD.CHUNK_LEN; }

  _cfAvg() {
    let m = 0;
    for (let t = 0; t <= 8; t++) m = Math.max(m, cavernFactor(this._zIn(t / 8)));
    return m;
  }

  // --- terrain ---------------------------------------------------------------

  _buildTerrain() {
    const geo = new THREE.PlaneGeometry(WORLD.WIDTH, WORLD.CHUNK_LEN, WORLD.SEG_X, WORLD.SEG_Z);
    const pos = geo.attributes.position;
    const count = pos.count;
    const normals = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const n = new THREE.Vector3();
    const cavernLevel = LVL.hasCaverns;
    for (let i = 0; i < count; i++) {
      const wx = pos.getX(i);
      const wz = this.zc - pos.getY(i);      // plane local +y maps to world -z after rotation
      const h = groundHeight(wx, wz);
      pos.setZ(i, h);                        // plane local +z maps to world +y
      groundNormal(wx, wz, n);
      normals[i * 3] = n.x; normals[i * 3 + 1] = -n.z; normals[i * 3 + 2] = n.y;
      const sparkle = noise2(wx * 0.9, wz * 0.9, 51) * 0.02;
      let r, g, b;
      if (cavernLevel) {
        // icy floor shading to bare rock on the steep canyon walls
        const tilt = U.clamp((1 - n.y) * 2.1, 0, 1);
        r = U.lerp(0.93, 0.44, tilt);
        g = U.lerp(0.96, 0.40, tilt);
        b = U.lerp(1.0, 0.37, tilt);
        const dim = 1 - cavernFactor(wz) * 0.38;   // baked gloom inside caves
        r *= dim; g *= dim; b *= Math.min(1, dim * 1.08);
      } else {
        // snow picks up a cool blue tint on slopes
        const tilt = U.clamp((1 - n.y) * 3.2, 0, 1);
        r = U.lerp(0.985, 0.72, tilt);
        g = U.lerp(0.985, 0.80, tilt);
        b = U.lerp(1.0, 0.92, tilt);
      }
      colors[i * 3] = r + sparkle;
      colors[i * 3 + 1] = g + sparkle;
      colors[i * 3 + 2] = b + sparkle;
    }
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geo, cavernLevel ? SHARED.terrainMatIce : SHARED.terrainMatSnow);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.z = this.zc;
    mesh.receiveShadow = true;
    this.geos.push(geo);
    this.group.add(mesh);
  }

  _buildCeiling(rand) {
    const maxCf = this._cfAvg();
    if (maxCf < 0.03) return;
    const geo = new THREE.PlaneGeometry(WORLD.WIDTH, WORLD.CHUNK_LEN, 44, 20);
    const pos = geo.attributes.position;
    const count = pos.count;
    const normals = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const e = 0.6;
    for (let i = 0; i < count; i++) {
      const wx = pos.getX(i);
      const wz = this.zc - pos.getY(i);
      const h = ceilingHeight(wx, wz);
      pos.setZ(i, h);
      // downward-facing analytic normal
      const gx = (ceilingHeight(wx + e, wz) - ceilingHeight(wx - e, wz)) / (2 * e);
      const gz = (ceilingHeight(wx, wz + e) - ceilingHeight(wx, wz - e)) / (2 * e);
      const il = 1 / Math.hypot(gx, 1, gz);
      const nx = gx * il, ny = -il, nz = gz * il;
      normals[i * 3] = nx; normals[i * 3 + 1] = -nz; normals[i * 3 + 2] = ny;
      const cf = cavernFactor(wz);
      const grain = noise2(wx * 0.4, wz * 0.4, 61) * 0.06;
      const v = U.lerp(0.72, 0.4, cf) + grain;
      colors[i * 3] = v; colors[i * 3 + 1] = v * 0.97; colors[i * 3 + 2] = v * 1.05;
    }
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geo, SHARED.ceilMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.z = this.zc;
    this.geos.push(geo);
    this.group.add(mesh);

    // stalactites hanging where the cave is deep
    const spots = [];
    for (let k = 0; k < Math.round(20 * maxCf); k++) {
      const z = this._zIn(rand());
      const cf = cavernFactor(z);
      if (cf < 0.35) continue;
      const x = canyonCenter(z) + (rand() * 2 - 1) * 13;
      spots.push({ x, z, s: 0.6 + rand() * 1.1 });
    }
    if (spots.length) {
      const mesh2 = new THREE.InstancedMesh(SHARED.stalGeo, SHARED.stalMat, spots.length);
      const dummy = new THREE.Object3D();
      spots.forEach((s, i) => {
        dummy.position.set(s.x, ceilingHeight(s.x, s.z) - 1.0 * s.s + 0.4, s.z);
        dummy.rotation.set(Math.PI, rand() * Math.PI, 0);
        dummy.scale.setScalar(s.s);
        dummy.updateMatrix();
        mesh2.setMatrixAt(i, dummy.matrix);
      });
      this.group.add(mesh2);
      this.instanced.push(mesh2);
    }
  }

  // --- shared tree builder -----------------------------------------------------

  _instTrees(trees, rand, snowCaps) {
    const nT = trees.length;
    if (!nT) return;
    const trunks = new THREE.InstancedMesh(SHARED.trunkGeo, SHARED.trunkMat, nT);
    const fol1 = new THREE.InstancedMesh(SHARED.folGeo1, SHARED.folMat, nT);
    const fol2 = new THREE.InstancedMesh(SHARED.folGeo2, SHARED.folMat, nT);
    const caps = snowCaps ? new THREE.InstancedMesh(SHARED.capGeo, SHARED.capMat, nT) : null;
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
      if (caps) {
        dummy.position.set(t.x, y + 4.05 * t.s, t.z);
        dummy.updateMatrix();
        caps.setMatrixAt(i, dummy.matrix);
      }
      const snow = rand() * 0.5;
      col.setRGB(U.lerp(0.16, 0.75, snow), U.lerp(0.42, 0.82, snow), U.lerp(0.25, 0.85, snow));
      fol1.setColorAt(i, col);
      fol2.setColorAt(i, col);
      if (t.collide) this.colliders.push({ x: t.x, z: t.z, r: 0.7 * t.s, top: y + 4.0 * t.s });
    });
    trunks.castShadow = fol1.castShadow = fol2.castShadow = true;
    this.group.add(trunks, fol1, fol2);
    this.instanced.push(trunks, fol1, fol2);
    if (caps) { this.group.add(caps); this.instanced.push(caps); }
  }

  // --- alpine content ----------------------------------------------------------

  _buildRamps(rand) {
    if (this.index < 3) return;
    if (rand() > 0.68) return;
    const x = (rand() * 2 - 1) * 30;
    const z = this._zIn(0.25 + rand() * 0.5);
    this._placeRamp(x, z);
  }

  _placeRamp(x, z) {
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
    this._instTrees(trees, rand, true);
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
    this._instRocks(rocks, rand);
  }

  _instRocks(rocks, rand) {
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
    this.instanced.push(mesh);
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

  // --- caverns content -----------------------------------------------------------

  _buildRampsCanyon(rand) {
    if (this.index < 3) return;
    if (rand() > 0.75) return;
    const z = this._zIn(0.25 + rand() * 0.5);
    if (cavernFactor(z) > 0.3) return;   // no kickers deep inside caves
    const x = canyonCenter(z) + (rand() * 2 - 1) * 7;
    this._placeRamp(x, z);
  }

  _buildSpires(rand) {
    if (this.index < 2) return;
    const n = Math.round(U.clamp(3 + this.index * 0.5, 0, 12));
    const spires = [];
    for (let k = 0; k < n; k++) {
      const z = this._zIn(rand());
      const x = canyonCenter(z) + (rand() * 2 - 1) * 12;
      if (!this._clearOfRamps(x, z)) continue;
      if (this.index < 5 && Math.abs(x - canyonCenter(z)) < 4) continue;
      spires.push({ x, z, s: 0.7 + rand() * 0.9 });
    }
    if (!spires.length) return;
    const mesh = new THREE.InstancedMesh(SHARED.spireGeo, SHARED.spireMat, spires.length);
    const dummy = new THREE.Object3D();
    spires.forEach((s, i) => {
      const y = groundHeight(s.x, s.z);
      dummy.position.set(s.x, y + 1.35 * s.s, s.z);
      dummy.rotation.set((rand() - 0.5) * 0.16, rand() * Math.PI, (rand() - 0.5) * 0.16);
      dummy.scale.setScalar(s.s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      this.colliders.push({ x: s.x, z: s.z, r: 0.55 * s.s, top: y + 2.8 * s.s });
    });
    mesh.castShadow = true;
    this.group.add(mesh);
    this.instanced.push(mesh);
  }

  _buildRocksCanyon(rand) {
    if (this.index < 3) return;
    const n = Math.round(U.clamp(2 + this.index * 0.3, 0, 7));
    const rocks = [];
    for (let k = 0; k < n; k++) {
      const z = this._zIn(rand());
      const x = canyonCenter(z) + (rand() * 2 - 1) * 13;
      if (!this._clearOfRamps(x, z)) continue;
      rocks.push({ x, z, s: 0.6 + rand() * 0.9 });
    }
    this._instRocks(rocks, rand);
  }

  _buildCrystals(rand) {
    const cyan = [], violet = [];
    for (let k = 0; k < 13; k++) {
      const z = this._zIn(rand());
      const side = rand() < 0.5 ? -1 : 1;
      const x = canyonCenter(z) + side * (10 + rand() * 7);
      const item = { x, z, s: 0.5 + rand() * 1.0, y: groundHeight(x, z) - 0.15, tilt: true };
      (rand() < 0.65 ? cyan : violet).push(item);
    }
    // hanging crystals inside deep cave sections
    for (let k = 0; k < 5; k++) {
      const z = this._zIn(rand());
      if (cavernFactor(z) < 0.4) continue;
      const x = canyonCenter(z) + (rand() * 2 - 1) * 10;
      const item = { x, z, s: 0.4 + rand() * 0.7, y: ceilingHeight(x, z) - 0.3, tilt: true };
      (rand() < 0.5 ? cyan : violet).push(item);
    }
    const build = (list, mat) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(SHARED.crystalGeo, mat, list.length);
      const dummy = new THREE.Object3D();
      list.forEach((c, i) => {
        dummy.position.set(c.x, c.y, c.z);
        dummy.rotation.set((rand() - 0.5) * 0.9, rand() * Math.PI, (rand() - 0.5) * 0.9);
        dummy.scale.set(c.s * 1.1, c.s * 2.3, c.s * 1.1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      this.group.add(mesh);
      this.instanced.push(mesh);
    };
    build(cyan, SHARED.crystalMatCyan);
    build(violet, SHARED.crystalMatViolet);
  }

  _buildPinesCanyon(rand) {
    // hardy pines on the banks, only under open sky
    const trees = [];
    for (let k = 0; k < 8; k++) {
      const z = this._zIn(rand());
      if (cavernFactor(z) > 0.12) continue;
      const side = rand() < 0.5 ? -1 : 1;
      const x = canyonCenter(z) + side * (15 + rand() * 8);
      trees.push({ x, z, s: 0.6 + rand() * 0.5, collide: true });
    }
    this._instTrees(trees, rand, true);
  }

  _buildCoinsCanyon(rand) {
    if (this.index < 1) return;
    if (this.ramps.length) {
      const r = this.ramps[0];
      const heights = [2.6, 4.0, 4.4, 3.6, 2.2];
      heights.forEach((h, i) => {
        const z = r.z - 5 - i * 4;
        this._addCoin(r.x, groundHeight(r.x, z) + h, z);
      });
    }
    if (rand() < 0.9) {
      // coins hug the canyon centerline
      const z0 = this._zIn(0.1 + rand() * 0.3);
      const wave = (rand() * 2 - 1) * 6;
      for (let i = 0; i < 6; i++) {
        const z = z0 - i * 3.4;
        const x = canyonCenter(z) + Math.sin(i * 0.9) * wave;
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
    this.geos.forEach((g) => g.dispose());
    this.instanced.forEach((m) => m.dispose());
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

  // cave ceiling above this point, or Infinity under open sky
  ceilingAt(x, z) {
    if (!LVL.hasCaverns) return Infinity;
    if (cavernFactor(z) < 0.12) return Infinity;
    return ceilingHeight(x, z);
  }

  cavernFactorAt(z) { return cavernFactor(z); }

  reset() {
    for (const [, chunk] of this.chunks) chunk.dispose();
    this.chunks.clear();
  }
}
