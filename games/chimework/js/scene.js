// ---------------------------------------------------------------------------
// scene.js — Chimework's 3D music box, built with three.js. A rosewood
// backboard carries brass rails; below it the pinned drum turns against a
// read arm. Warm key light, velvet dark behind. Drag to orbit a little.
// ---------------------------------------------------------------------------
'use strict';

const CHIME_COLORS = {
  wood: 0x331d15,
  woodLight: 0x452a1c,
  brass: 0xb08540,
  brassDark: 0x6e5226,
  steel: 0xaab2c0,
  velvet: 0x171020,
  marble: 0xdfe6ee,
  cup: 0xe8c168,
};

function makeWoodTexture(base, streak) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 90; i++) {
    const y = rnd() * 256;
    ctx.strokeStyle = streak;
    ctx.globalAlpha = 0.05 + rnd() * 0.1;
    ctx.lineWidth = 0.6 + rnd() * 2.2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(85, y + (rnd() - 0.5) * 14, 170, y + (rnd() - 0.5) * 14, 256, y + (rnd() - 0.5) * 8);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

class MusicBoxScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);

    const amb = new THREE.AmbientLight(0xffe7c9, 0.22);
    this.scene.add(amb);
    const key = new THREE.DirectionalLight(0xffe0b0, 0.85);
    key.position.set(8, 14, 18);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -18; key.shadow.camera.right = 18;
    key.shadow.camera.top = 14; key.shadow.camera.bottom = -14;
    key.shadow.camera.near = 4; key.shadow.camera.far = 60;
    this.scene.add(key);
    this.key = key;
    const rim = new THREE.DirectionalLight(0x8ea0ff, 0.2);
    rim.position.set(-10, 6, -8);
    this.scene.add(rim);
    const glow = new THREE.PointLight(0xffb066, 0.2, 22);
    this.scene.add(glow);
    this.drumGlow = glow;

    // orbit state (drag to look around, gently clamped)
    this.orbit = { az: 0, el: 0, tAz: 0, tEl: 0 };
    this._bindOrbit();

    this.levelGroup = null;
    this.tweens = [];
    this.pulses = [];
    this.time = 0;
  }

  _bindOrbit() {
    let drag = null;
    this.canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; });
    window.addEventListener('pointermove', (e) => {
      if (!drag) return;
      this.orbit.tAz = Math.max(-0.45, Math.min(0.45, this.orbit.tAz + (e.clientX - drag.x) * 0.004));
      this.orbit.tEl = Math.max(-0.2, Math.min(0.3, this.orbit.tEl + (e.clientY - drag.y) * 0.003));
      drag = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointerup', () => { drag = null; });
  }

  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // --- level construction ------------------------------------------------------

  setLevel(lv) {
    if (this.levelGroup) {
      this.scene.remove(this.levelGroup);
      this.levelGroup.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
      });
    }
    const g = new THREE.Group();
    this.levelGroup = g;
    this.lv = lv;
    this.switchParts = {};   // rowIndex -> [{paddle, node}]
    this.hammerParts = {};   // rowIndex -> mallet group
    this.branchMeshes = [];  // {mesh, node, branch} for dimming inactive routes
    this.starMeshes = {};    // nodeId -> mesh
    this.pinMeshes = [];
    this.tweens = [];
    this.pulses = [];

    // bounds of the track
    const xs = Object.values(lv.nodes).map((n) => n.x);
    const ys = Object.values(lv.nodes).map((n) => n.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    this.center = new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2 - 1.2, 0);

    if (!this.woodTex) this.woodTex = makeWoodTexture('#3a2318', '#1d0f08');
    if (!this.woodTexL) this.woodTexL = makeWoodTexture('#4a2d1d', '#2a170c');
    const matWood = new THREE.MeshStandardMaterial({ map: this.woodTex, roughness: 0.85, metalness: 0.05 });
    const matWoodL = new THREE.MeshStandardMaterial({ map: this.woodTexL, roughness: 0.9 });
    const matBrass = new THREE.MeshStandardMaterial({ color: CHIME_COLORS.brass, roughness: 0.35, metalness: 0.85 });
    const matBrassDim = new THREE.MeshStandardMaterial({
      color: CHIME_COLORS.brass, roughness: 0.5, metalness: 0.6, transparent: true, opacity: 0.28,
    });
    this.matBrass = matBrass;
    this.matBrassDim = matBrassDim;

    // backboard
    const bw = maxX - minX + 5, bh = maxY - minY + 3.6;
    const back = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.5), matWood);
    back.position.set((minX + maxX) / 2, (minY + maxY) / 2, -1.1);
    back.receiveShadow = true;
    g.add(back);
    // backboard trim
    const trim = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.6, bh + 0.6, 0.3), matWoodL);
    trim.position.copy(back.position);
    trim.position.z -= 0.15;
    g.add(trim);

    // base
    const base = new THREE.Mesh(new THREE.BoxGeometry(bw + 2, 0.8, 8), matWoodL);
    base.position.set((minX + maxX) / 2, minY - 5.0, 1.4);
    base.receiveShadow = true;
    g.add(base);

    // rails
    const P = (id) => {
      const n = lv.nodes[id];
      return new THREE.Vector3(n.x, n.y, 0);
    };
    const tube = (a, b, arcUp, mat) => {
      // twin rails, like a real marble run
      const group = new THREE.Group();
      for (const dz of [-0.16, 0.16]) {
        const a2 = a.clone(); a2.z += dz;
        const b2 = b.clone(); b2.z += dz;
        const mid = a2.clone().lerp(b2, 0.5);
        mid.y += arcUp;
        const curve = new THREE.CatmullRomCurve3([a2, mid, b2]);
        const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.075, 8), mat);
        mesh.castShadow = true;
        group.add(mesh);
      }
      g.add(group);
      return group;
    };

    for (const node of Object.values(lv.nodes)) {
      const a = P(node.id);
      // node post: small standoff to the backboard
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 6), matBrass);
      post.rotation.x = Math.PI / 2;
      post.position.set(a.x, a.y - 0.12, -0.55);
      g.add(post);

      if (node.out) tube(a, P(node.out), lv.nodes[node.out].y < node.y - 1 ? -0.4 : 0.06, matBrass);
      if (node.sw) {
        node.sw.forEach((tid, si) => {
          const mat = matBrass.clone();
          tube(a, P(tid), lv.nodes[tid].y < node.y - 1 ? -0.4 : 0.06, mat);
          this.branchMeshes.push({ mat, node: node.id, branch: si });
        });
        // paddle
        const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.14, 0.22), new THREE.MeshStandardMaterial({
          color: 0x7fb6a4, roughness: 0.4, metalness: 0.5,
        }));
        paddle.geometry.translate(0.45, 0, 0);
        paddle.position.set(a.x, a.y + 0.12, 0.12);
        paddle.castShadow = true;
        g.add(paddle);
        const ri = lv.rows.findIndex((r) => r.type === 'toggle' &&
          (r.node === node.id || (r.nodes && r.nodes.indexOf(node.id) >= 0)));
        if (ri >= 0) {
          paddle.material.color.set(lv.rows[ri].color);
          (this.switchParts[ri] = this.switchParts[ri] || []).push({ paddle, node });
        }
      }
      if (node.launch) {
        // ghost arc showing the hammer's jump
        const to = P(node.launch);
        const curve = new THREE.CatmullRomCurve3([a, a.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 1.6, 0)), to]);
        for (let i = 1; i < 8; i++) {
          const p = curve.getPoint(i / 8);
          const dot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), new THREE.MeshBasicMaterial({
            color: 0xffcf8a, transparent: true, opacity: 0.35,
          }));
          dot.position.copy(p);
          g.add(dot);
        }
        // the mallet
        const ri = lv.rows.findIndex((r) => r.type === 'hammer' && r.node === node.id);
        const mallet = new THREE.Group();
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.1), matBrass);
        arm.position.y = 0.55;
        const head = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.62, 10), new THREE.MeshStandardMaterial({
          color: ri >= 0 ? lv.rows[ri].color : 0xe0885c, roughness: 0.5, metalness: 0.3,
        }));
        head.rotation.z = Math.PI / 2;
        head.position.y = 1.1;
        mallet.add(arm, head);
        mallet.position.set(a.x - 0.7, a.y - 0.4, 0.25);
        mallet.rotation.z = -0.9;
        mallet.castShadow = true;
        g.add(mallet);
        if (ri >= 0) this.hammerParts[ri] = mallet;
      }
      if (!node.out && !node.sw && !node.cup) {
        // dead drop: a dark hole in the works
        const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.12, 16), new THREE.MeshBasicMaterial({ color: 0x0a0710 }));
        hole.position.set(a.x, a.y - 0.4, 0);
        g.add(hole);
      }
      if (node.cup) {
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.3, 0.8, 14), new THREE.MeshStandardMaterial({
          color: CHIME_COLORS.cup, roughness: 0.3, metalness: 0.8, emissive: 0x3a2a08, emissiveIntensity: 0.6,
        }));
        cup.position.set(a.x, a.y - 0.35, 0);
        cup.castShadow = true;
        g.add(cup);
        this.cupPos = a.clone();
      }
      if (node.star) {
        const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), new THREE.MeshStandardMaterial({
          color: 0xffd23c, emissive: 0xa07708, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.4,
        }));
        star.position.set(a.x, a.y + 0.55, 0);
        g.add(star);
        this.starMeshes[node.id] = star;
      }
      if (node.bell) {
        const bell = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), matBrass);
        bell.position.set(a.x, a.y + 0.7, 0);
        g.add(bell);
      }
    }

    // the drum
    const drumLen = Math.max(5, Math.min(lv.beats * 1.0, bw - 3));
    this.drum = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, drumLen, 28), matBrass);
    barrel.rotation.z = Math.PI / 2;
    barrel.castShadow = true;
    this.drum.add(barrel);
    for (const side of [-1, 1]) {
      const flange = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 0.16, 28),
        new THREE.MeshStandardMaterial({ color: CHIME_COLORS.brassDark, roughness: 0.45, metalness: 0.8 }));
      flange.rotation.z = Math.PI / 2;
      flange.position.x = side * (drumLen / 2 + 0.08);
      this.drum.add(flange);
    }
    const crank = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.0, 8), matBrass);
    stem.rotation.z = Math.PI / 2;
    stem.position.x = drumLen / 2 + 0.6;
    const handleArm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), matBrass);
    handleArm.position.set(drumLen / 2 + 1.1, 0.38, 0);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8),
      new THREE.MeshStandardMaterial({ color: CHIME_COLORS.woodLight, roughness: 0.6 }));
    knob.position.set(drumLen / 2 + 1.1, 0.85, 0);
    crank.add(stem, handleArm, knob);
    this.drum.add(crank);
    // row bands
    lv.rows.forEach((row, ri) => {
      const band = new THREE.Mesh(new THREE.TorusGeometry(1.27, 0.05, 8, 36), new THREE.MeshStandardMaterial({
        color: row.color, roughness: 0.4, metalness: 0.4,
      }));
      band.rotation.y = Math.PI / 2;
      band.position.x = this._rowX(ri, drumLen);
      this.drum.add(band);
    });
    // beat ticks on the rim
    for (let b = 0; b < lv.beats; b++) {
      const phi = (b / lv.beats) * Math.PI * 2;
      const tick = new THREE.Mesh(new THREE.BoxGeometry(drumLen + 0.15, 0.03, 0.03), new THREE.MeshBasicMaterial({
        color: 0x3a2c1a,
      }));
      tick.position.set(0, Math.cos(phi) * 1.26, Math.sin(phi) * 1.26);
      tick.rotation.x = -phi;
      this.drum.add(tick);
    }
    this.drumLen = drumLen;
    this.drum.position.set((minX + maxX) / 2, minY - 3.4, 1.4);
    g.add(this.drum);
    this.drumGlow.position.copy(this.drum.position).add(new THREE.Vector3(0, 2.2, 2));

    // read arm: brass bar resting over the top of the drum
    const armBar = new THREE.Mesh(new THREE.BoxGeometry(drumLen + 1.4, 0.12, 0.12), matBrass);
    armBar.position.set(this.drum.position.x, this.drum.position.y + 1.68, this.drum.position.z);
    g.add(armBar);

    // marble
    this.marble = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 16), new THREE.MeshStandardMaterial({
      color: CHIME_COLORS.marble, roughness: 0.15, metalness: 0.9,
    }));
    this.marble.castShadow = true;
    g.add(this.marble);

    this.scene.add(g);
    this.resetVisual(lv);
    this.resize();
  }

  _rowX(ri, drumLen) {
    const n = this.lv.rows.length;
    return -drumLen / 2 + (drumLen / (n + 1)) * (ri + 1);
  }

  // pins: array of [row, beat]
  setPins(pins) {
    for (const m of this.pinMeshes) {
      this.drum.remove(m);
      m.geometry.dispose();
    }
    this.pinMeshes = [];
    for (const [ri, b] of pins) {
      const phi = (b / this.lv.beats) * Math.PI * 2;
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.5, 8), new THREE.MeshStandardMaterial({
        color: this.lv.rows[ri].color, roughness: 0.3, metalness: 0.7,
        emissive: new THREE.Color(this.lv.rows[ri].color).multiplyScalar(0.25),
      }));
      // stick out radially at angle phi (rotating with the drum)
      pin.position.set(this._rowX(ri, this.drumLen), Math.cos(phi) * 1.45, Math.sin(phi) * 1.45);
      pin.rotation.x = -phi;
      this.drum.add(pin);
      this.pinMeshes.push(pin);
    }
  }

  resetVisual(lv) {
    this.drumAngle = 0;
    this.drumTarget = 0;
    this.drum.rotation.x = 0;
    const s = lv.nodes[lv.start];
    this.marble.position.set(s.x, s.y + 0.42, 0);
    this.marble.visible = true;
    this.marbleTween = null;
    this.setToggleVisual(lv.rows.map(() => 0), true);
    for (const bm of Object.values(this.starMeshes)) bm.visible = true;
  }

  setToggleVisual(toggles, snap) {
    for (const [ri, parts] of Object.entries(this.switchParts)) {
      for (const { paddle, node } of parts) {
        const target = this.lv.nodes[node.sw[toggles[ri]]];
        const ang = Math.atan2(target.y - node.y, target.x - node.x);
        if (snap) paddle.rotation.z = ang;
        else this.tweens.push({ obj: paddle.rotation, key: 'z', from: paddle.rotation.z, to: ang, t: 0, dur: 0.18 });
      }
    }
    for (const bm of this.branchMeshes) {
      const ri = this.lv.rows.findIndex((r) => r.type === 'toggle' &&
        (r.node === bm.node || (r.nodes && r.nodes.indexOf(bm.node) >= 0)));
      const active = ri >= 0 ? toggles[ri] === bm.branch : bm.branch === 0;
      bm.mat.transparent = true;
      bm.mat.opacity = active ? 1 : 0.25;
    }
  }

  // one simulation step, animated over `dur` seconds
  playStep(step, lv, dur) {
    // drum advances one beat
    this.drumTarget = -((step.t + 1) / lv.beats) * Math.PI * 2;

    // fired rows: hammer swings, pulse flies up
    for (const ri of step.fired) {
      const row = lv.rows[ri];
      if (row.type === 'hammer' && this.hammerParts[ri]) {
        const m = this.hammerParts[ri];
        this.tweens.push({ obj: m.rotation, key: 'z', from: -0.15, to: -0.9, t: 0, dur: dur * 0.5, back: true });
        m.rotation.z = -0.15;
      }
      const targetNode = row.node || (row.nodes && row.nodes[0]);
      if (targetNode) {
        const n = lv.nodes[targetNode];
        this.pulses.push({
          from: this.drum.position.clone().add(new THREE.Vector3(this._rowX(ri, this.drumLen), 1.9, 0)),
          to: new THREE.Vector3(n.x, n.y, 0.2),
          color: new THREE.Color(row.color),
          t: 0, dur: dur * 0.7,
        });
      }
    }
    this.setToggleVisual(step.toggles, false);

    // marble motion
    const from = lv.nodes[step.from];
    if (step.to) {
      const to = lv.nodes[step.to];
      this.marbleTween = {
        from: new THREE.Vector3(from.x, from.y + 0.42, 0),
        to: new THREE.Vector3(to.x, to.y + 0.42, 0),
        arc: step.launch ? 1.7 : (to.y < from.y - 1 ? -0.2 : 0.12),
        t: 0, dur,
      };
    } else {
      // dead end: fall into the works
      this.marbleTween = {
        from: new THREE.Vector3(from.x, from.y + 0.42, 0),
        to: new THREE.Vector3(from.x, from.y - 1.6, 0),
        arc: 0, t: 0, dur, sink: true,
      };
    }
    if (step.star && this.starMeshes[step.to]) this.starMeshes[step.to].visible = false;
  }

  frame(dt) {
    this.time += dt;
    // drum easing
    this.drumAngle += (this.drumTarget - this.drumAngle) * (1 - Math.exp(-10 * dt));
    this.drum.rotation.x = this.drumAngle;

    // tweens
    this.tweens = this.tweens.filter((tw) => {
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      let v;
      if (tw.back) {
        v = k < 0.5 ? tw.from + (tw.to - tw.from) * (k * 2) : tw.to + (tw.from - tw.to) * ((k - 0.5) * 2);
      } else {
        v = tw.from + (tw.to - tw.from) * (1 - Math.pow(1 - k, 3));
      }
      tw.obj[tw.key] = v;
      return k < 1;
    });

    // marble
    if (this.marbleTween) {
      const tw = this.marbleTween;
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      const e = 1 - Math.pow(1 - k, 2);
      const p = tw.from.clone().lerp(tw.to, e);
      p.y += Math.sin(e * Math.PI) * tw.arc;
      this.marble.position.copy(p);
      if (tw.sink && k >= 1) this.marble.visible = false;
      if (k >= 1) this.marbleTween = null;
    }

    // pulses (fired-row signals flying from drum to mechanism)
    this.pulses = this.pulses.filter((p) => {
      p.t += dt;
      return p.t < p.dur;
    });

    // stars spin
    for (const s of Object.values(this.starMeshes)) s.rotation.y += dt * 2.2;
    this.drawPulses();

    // camera
    this.orbit.az += (this.orbit.tAz - this.orbit.az) * (1 - Math.exp(-8 * dt));
    this.orbit.el += (this.orbit.tEl - this.orbit.el) * (1 - Math.exp(-8 * dt));
    const sway = Math.sin(this.time * 0.3) * 0.03;
    const az = this.orbit.az + sway;
    const el = this.orbit.el + 0.1;
    const dist = 21;
    const cx = this.center.x, cy = this.center.y;
    this.camera.position.set(
      cx + Math.sin(az) * dist * Math.cos(el),
      cy + Math.sin(el) * dist * 0.6 + 1.5,
      Math.cos(az) * dist * Math.cos(el)
    );
    this.camera.lookAt(cx, cy, 0);
    this.key.position.set(cx + 8, cy + 12, 18);

    this.renderer.render(this.scene, this.camera);
  }

  // draw pulse sprites via a shared pool of meshes (lazy)
  ensurePulseMeshes() {
    if (this.pulseMeshes) return;
    this.pulseMeshes = [];
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.9,
      }));
      m.visible = false;
      this.scene.add(m);
      this.pulseMeshes.push(m);
    }
  }

  drawPulses() {
    this.ensurePulseMeshes();
    this.pulseMeshes.forEach((m, i) => {
      const p = this.pulses[i];
      if (!p) { m.visible = false; return; }
      const k = Math.min(1, p.t / p.dur);
      m.visible = true;
      m.position.copy(p.from).lerp(p.to, k);
      m.material.color.copy(p.color);
      m.material.opacity = 0.9 * (1 - k * 0.5);
    });
  }
}
