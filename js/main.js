// ---------------------------------------------------------------------------
// main.js — game bootstrap: renderer, camera, particles, HUD, input and the
// state machine (menu → play → pause/over).
// ---------------------------------------------------------------------------
'use strict';

(function () {

  // --- tiny radial sprite used by both particle systems ---------------------
  function makeDotTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  // --- snow spray kicked up by the board ------------------------------------
  class Spray {
    constructor(scene, tex, count) {
      this.count = count;
      this.pos = new Float32Array(count * 3).fill(-9999);
      this.vel = new Float32Array(count * 3);
      this.life = new Float32Array(count);
      this.next = 0;
      this.geo = new THREE.BufferGeometry();
      this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      this.points = new THREE.Points(this.geo, new THREE.PointsMaterial({
        size: 0.5, map: tex, transparent: true, opacity: 0.9,
        depthWrite: false, color: 0xffffff,
      }));
      this.points.frustumCulled = false;
      scene.add(this.points);
    }
    emit(x, y, z, vx, vz, n, kick) {
      for (let k = 0; k < n; k++) {
        const i = this.next; this.next = (this.next + 1) % this.count;
        this.pos[i * 3] = x + (Math.random() - 0.5) * 0.5;
        this.pos[i * 3 + 1] = y + 0.15;
        this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.5;
        this.vel[i * 3] = vx * 0.25 + (Math.random() - 0.5) * 2.4;
        this.vel[i * 3 + 1] = 1.2 + Math.random() * kick;
        this.vel[i * 3 + 2] = vz * 0.25 + (Math.random() - 0.5) * 2.4;
        this.life[i] = 0.45 + Math.random() * 0.35;
      }
    }
    update(dt) {
      for (let i = 0; i < this.count; i++) {
        if (this.life[i] <= 0) continue;
        this.life[i] -= dt;
        if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -9999; continue; }
        this.pos[i * 3] += this.vel[i * 3] * dt;
        this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
        this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
        this.vel[i * 3 + 1] -= 9 * dt;
      }
      this.geo.attributes.position.needsUpdate = true;
    }
  }

  // --- ambient snowfall around the camera -----------------------------------
  class Snowfall {
    constructor(scene, tex, count) {
      this.count = count;
      this.box = { x: 90, y: 50, z: 100 };
      this.pos = new Float32Array(count * 3);
      this.seed = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        this.pos[i * 3] = (Math.random() - 0.5) * this.box.x;
        this.pos[i * 3 + 1] = (Math.random() - 0.5) * this.box.y;
        this.pos[i * 3 + 2] = (Math.random() - 0.5) * this.box.z;
        this.seed[i] = Math.random() * 10;
      }
      this.geo = new THREE.BufferGeometry();
      this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      this.points = new THREE.Points(this.geo, new THREE.PointsMaterial({
        size: 0.24, map: tex, transparent: true, opacity: 0.75,
        depthWrite: false, color: 0xffffff,
      }));
      this.points.frustumCulled = false;
      scene.add(this.points);
      this.center = new THREE.Vector3();
    }
    update(dt, cam, time) {
      // particles live in a box that travels with the camera
      this.points.position.copy(cam.position);
      const { x: bx, y: by, z: bz } = this.box;
      for (let i = 0; i < this.count; i++) {
        this.pos[i * 3 + 1] -= (3.2 + Math.sin(this.seed[i]) * 1.2) * dt;
        this.pos[i * 3] += Math.sin(time * 0.9 + this.seed[i]) * 0.7 * dt;
        // wrap into the box
        if (this.pos[i * 3 + 1] < -by / 2) this.pos[i * 3 + 1] += by;
        if (this.pos[i * 3] < -bx / 2) this.pos[i * 3] += bx;
        if (this.pos[i * 3] > bx / 2) this.pos[i * 3] -= bx;
        if (this.pos[i * 3 + 2] < -bz / 2) this.pos[i * 3 + 2] += bz;
        if (this.pos[i * 3 + 2] > bz / 2) this.pos[i * 3 + 2] -= bz;
      }
      this.geo.attributes.position.needsUpdate = true;
    }
  }

  // --- setup ----------------------------------------------------------------
  const canvas = document.getElementById('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xcfe0f2, 40, 300);

  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 700);

  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0xf2f4f8, 1.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d9, 1.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
  sun.shadow.camera.near = 5; sun.shadow.camera.far = 200;
  sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);

  // distant mountain backdrop (unfogged, pre-hazed color)
  const backdrop = new THREE.Group();
  {
    const mat = new THREE.MeshBasicMaterial({ color: 0xb9cfe9, fog: false });
    const defs = [
      [-260, 150, 90], [-150, 200, 120], [-40, 170, 100],
      [70, 210, 130], [190, 160, 95], [290, 190, 110], [0, 240, 150],
    ];
    for (const [x, h, r] of defs) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 5), mat);
      m.position.set(x, h * 0.18, -80 - Math.abs(x) * 0.3);
      backdrop.add(m);
    }
  }
  scene.add(backdrop);

  const world = new World(scene);
  const player = new Player(scene);
  const sfx = new SFX();
  const dotTex = makeDotTexture();
  const spray = new Spray(scene, dotTex, 260);
  const snowfall = new Snowfall(scene, dotTex, 850);

  world.ensure(player.pos.z);

  // --- HUD ------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const hud = {
    score: $('hud-score'), dist: $('hud-dist'), speed: $('hud-speed'),
    hearts: $('hud-hearts'), best: $('hud-best'), popup: $('popup'),
    menu: $('menu'), over: $('over'), paused: $('paused'),
    finalScore: $('final-score'), finalDist: $('final-dist'), finalBest: $('final-best'),
    newBest: $('new-best'), touch: $('touch-controls'), muteBtn: $('btn-mute'),
  };

  const BEST_KEY = 'powder-peak-best';
  function loadBest() { try { return parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch (e) { return 0; } }
  function saveBest(v) { try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) { /* private mode */ } }

  // --- game state -----------------------------------------------------------
  let state = 'menu';           // menu | play | pause | over
  let trickScore = 0, coinCount = 0, distance = 0, best = loadBest();
  let popupTimer = null, deadTimer = 0, sprayBudget = 0;

  function totalScore() { return Math.floor(distance) + coinCount * 25 + trickScore; }

  function showPopup(text, cls) {
    hud.popup.textContent = text;
    hud.popup.className = 'show' + (cls ? ' ' + cls : '');
    if (popupTimer) clearTimeout(popupTimer);
    popupTimer = setTimeout(() => { hud.popup.className = ''; }, 1400);
  }

  function updateHud() {
    hud.score.textContent = totalScore().toLocaleString();
    hud.dist.textContent = Math.floor(distance) + ' m';
    hud.speed.textContent = state === 'menu' ? '0' : Math.round(player.speed * 3.6);
    hud.best.textContent = 'BEST ' + best.toLocaleString();
    let h = '';
    for (let i = 0; i < 3; i++) h += `<span class="${i < player.hearts ? 'on' : 'off'}">♥</span>`;
    hud.hearts.innerHTML = h;
  }

  function setState(s) {
    state = s;
    hud.menu.classList.toggle('hidden', s !== 'menu');
    hud.over.classList.toggle('hidden', s !== 'over');
    hud.paused.classList.toggle('hidden', s !== 'pause');
  }

  function startRun() {
    world.reset();
    player.reset();
    world.ensure(player.pos.z);
    trickScore = 0; coinCount = 0; distance = 0; deadTimer = 0;
    followX = 0; followZ = -1;
    updateHud();
    setState('play');
  }

  function endRun() {
    const score = totalScore();
    const isBest = score > best;
    if (isBest) { best = score; saveBest(best); }
    hud.finalScore.textContent = score.toLocaleString();
    hud.finalDist.textContent = Math.floor(distance) + ' m';
    hud.finalBest.textContent = best.toLocaleString();
    hud.newBest.classList.toggle('hidden', !isBest);
    sfx.gameOver();
    setState('over');
  }

  // --- input ----------------------------------------------------------------
  const keys = {};
  let jumpQueued = false;
  const touch = { left: false, right: false, jump: false };

  function firstGesture() { sfx.init(); }
  window.addEventListener('keydown', (e) => {
    firstGesture();
    if (e.repeat) { keys[e.code] = true; return; }
    keys[e.code] = true;
    if (e.code === 'Space') { jumpQueued = true; e.preventDefault(); }
    if (e.code === 'Enter') {
      if (state === 'menu' || state === 'over') startRun();
    }
    if (e.code === 'KeyR' && (state === 'play' || state === 'over' || state === 'pause')) startRun();
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (state === 'play') setState('pause');
      else if (state === 'pause') setState('play');
    }
    if (e.code === 'KeyM') {
      sfx.setMuted(!sfx.muted);
      hud.muteBtn.textContent = sfx.muted ? '🔇' : '🔊';
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });

  hud.muteBtn.addEventListener('click', () => {
    firstGesture();
    sfx.setMuted(!sfx.muted);
    hud.muteBtn.textContent = sfx.muted ? '🔇' : '🔊';
  });
  $('btn-start').addEventListener('click', () => { firstGesture(); startRun(); });
  $('btn-again').addEventListener('click', () => { firstGesture(); startRun(); });
  $('btn-resume').addEventListener('click', () => setState('play'));

  // touch controls
  function bindTouch(id, prop) {
    const el = $(id);
    const on = (e) => { e.preventDefault(); firstGesture(); touch[prop] = true; if (prop === 'jump') jumpQueued = true; };
    const off = (e) => { e.preventDefault(); touch[prop] = false; };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('pointerleave', off);
  }
  if ('ontouchstart' in window) {
    hud.touch.classList.remove('hidden');
    bindTouch('btn-left', 'left');
    bindTouch('btn-right', 'right');
    bindTouch('btn-jump', 'jump');
  }

  const input = { steer: 0, jump: false, tuck: false, grab: false };
  function readInput(dt) {
    const left = keys.ArrowLeft || keys.KeyA || touch.left;
    const right = keys.ArrowRight || keys.KeyD || touch.right;
    const target = (right ? 1 : 0) - (left ? 1 : 0);
    input.steer = U.damp(input.steer, target, 12, dt);
    input.tuck = !!(keys.ArrowUp || keys.KeyW);
    input.grab = !!(keys.ShiftLeft || keys.ShiftRight || keys.ArrowDown || keys.KeyS || (touch.jump && !player.grounded));
    input.jump = jumpQueued && player.grounded;
    jumpQueued = false;
  }

  window.addEventListener('blur', () => { if (state === 'play') setState('pause'); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'play') setState('pause');
  });

  // --- events from the player ----------------------------------------------
  function handleEvents(events) {
    for (const ev of events) {
      switch (ev.t) {
        case 'coin':
          coinCount++;
          sfx.coin();
          spray.emit(ev.x, ev.y - 0.5, ev.z, 0, 0, 6, 2.5);
          break;
        case 'jump': sfx.jump(); break;
        case 'launch': sfx.launch(); showPopup('BIG AIR!', 'air'); break;
        case 'land':
          sfx.land(ev.hard);
          spray.emit(player.pos.x, player.pos.y, player.pos.z,
            Math.sin(player.heading) * player.speed, -Math.cos(player.heading) * player.speed,
            ev.hard ? 26 : 14, ev.hard ? 4 : 2.5);
          break;
        case 'trick':
          trickScore += ev.pts;
          sfx.trick(ev.clean);
          showPopup(`${ev.label}  +${ev.pts}`, ev.clean ? 'trick' : 'sketchy');
          break;
        case 'crash':
          sfx.crash();
          showPopup('WIPEOUT!', 'crash');
          spray.emit(player.pos.x, player.pos.y, player.pos.z, 0, 0, 30, 4.5);
          break;
        case 'dead':
          sfx.crash();
          showPopup('WIPEOUT!', 'crash');
          spray.emit(player.pos.x, player.pos.y, player.pos.z, 0, 0, 40, 5);
          deadTimer = 1.4;
          break;
      }
    }
  }

  // --- camera ---------------------------------------------------------------
  let followX = 0, followZ = -1;    // smoothed follow direction
  const camPos = new THREE.Vector3(0, 8, 8);
  const lookPos = new THREE.Vector3();
  let fov = 70;

  function updateCamera(dt, time) {
    let tx, ty, tz, lx, ly, lz;
    if (state === 'menu') {
      const a = time * 0.25;
      tx = player.pos.x + Math.sin(a) * 9;
      ty = player.pos.y + 3.4;
      tz = player.pos.z + Math.cos(a) * 9;
      lx = player.pos.x; ly = player.pos.y + 1.2; lz = player.pos.z;
    } else {
      if (player.grounded) {
        const fx = Math.sin(player.heading), fz = -Math.cos(player.heading);
        followX = U.damp(followX, fx, 3.5, dt);
        followZ = U.damp(followZ, fz, 3.5, dt);
      }
      const fl = Math.hypot(followX, followZ) || 1;
      const nx = followX / fl, nz = followZ / fl;
      const dist = 7.4, height = 3.1;
      tx = player.pos.x - nx * dist;
      tz = player.pos.z - nz * dist;
      ty = player.pos.y + height;
      lx = player.pos.x + nx * 6.5;
      ly = player.pos.y + 1.3;
      lz = player.pos.z + nz * 6.5;
    }
    const l = 1 - Math.exp(-5 * dt);
    camPos.x += (tx - camPos.x) * l;
    camPos.y += (ty - camPos.y) * l;
    camPos.z += (tz - camPos.z) * l;
    // never sink the camera into the snow
    const minY = groundHeight(camPos.x, camPos.z) + 1.1;
    if (camPos.y < minY) camPos.y = minY;
    camera.position.copy(camPos);
    const ll = 1 - Math.exp(-8 * dt);
    lookPos.x += (lx - lookPos.x) * ll;
    lookPos.y += (ly - lookPos.y) * ll;
    lookPos.z += (lz - lookPos.z) * ll;
    camera.lookAt(lookPos);

    const targetFov = 70 + U.clamp(player.speed / PHYS.MAX_SPEED, 0, 1) * 12;
    fov = U.damp(fov, targetFov, 3, dt);
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }

  // --- main loop ------------------------------------------------------------
  let last = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const time = now / 1000;

    if (state === 'play') {
      readInput(dt);
      const events = player.update(dt, input, world, time);
      handleEvents(events);
      world.ensure(player.pos.z);
      world.update(dt, time, player.pos.z);
      distance = Math.max(distance, -(player.pos.z) - 5);

      // continuous carve spray
      if (player.grounded && player.crashTimer <= 0 && player.speed > 8) {
        const rate = Math.abs(input.steer) * player.speed * 1.6 + (player.speed > 22 ? 5 : 0);
        sprayBudget += rate * dt;
        const n = Math.floor(sprayBudget);
        if (n > 0) {
          sprayBudget -= n;
          spray.emit(player.pos.x, player.pos.y, player.pos.z,
            Math.sin(player.heading) * player.speed * 0.4,
            -Math.cos(player.heading) * player.speed * 0.4, n, 2.2);
        }
      }

      sfx.updateWind(player.speed, input.steer, player.grounded, dt);
      updateHud();

      if (!player.alive && deadTimer > 0) {
        deadTimer -= dt;
        if (deadTimer <= 0) endRun();
      }
    } else {
      sfx.updateWind(0, 0, true, dt);
      if (state === 'menu') world.update(dt, time, player.pos.z);
    }

    spray.update(dt);
    snowfall.update(dt, camera, time);
    updateCamera(dt, time);

    // sun and backdrop follow the player down the mountain
    sun.position.set(player.pos.x + 40, player.pos.y + 65, player.pos.z + 35);
    sun.target.position.copy(player.pos);
    backdrop.position.set(player.pos.x * 0.9, WORLD.SLOPE * (player.pos.z - 240), player.pos.z - 300);

    renderer.render(scene, camera);
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  updateHud();
  setState('menu');
  requestAnimationFrame(frame);

  // debug/tinkering handle
  window.PP = {
    world, player, camera,
    get state() { return state; },
    get trickScore() { return trickScore; },
    get coinCount() { return coinCount; },
  };
})();
