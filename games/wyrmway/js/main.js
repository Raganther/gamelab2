// ---------------------------------------------------------------------------
// main.js — Wyrmway: game loop, painterly dawn rendering, waves, UI.
// ---------------------------------------------------------------------------
'use strict';

(function () {
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const audio = new WindAudio();

  // --- viewport: world 1280x800, uniform scale, letterboxed -------------------
  let scale = 1, offX = 0, offY = 0;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    scale = Math.min(canvas.width / WORLD_W, canvas.height / WORLD_H);
    offX = (canvas.width - WORLD_W * scale) / 2;
    offY = (canvas.height - WORLD_H * scale) / 2;
  }
  window.addEventListener('resize', resize);
  resize();

  function toWorld(cx, cy) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    return {
      x: (cx * dpr - offX) / scale,
      y: (cy * dpr - offY) / scale,
    };
  }

  // --- game state --------------------------------------------------------------
  const BEST_KEY = 'wyrmway-best';
  const loadBest = () => { try { return +localStorage.getItem(BEST_KEY) || 0; } catch (e) { return 0; } };
  const saveBest = (v) => { try { localStorage.setItem(BEST_KEY, v); } catch (e) { /* ok */ } };

  const CLOAKS = ['#5d3a6e', '#8a3a55', '#3a5d6e', '#6e5a3a', '#46326e'];

  const game = {
    state: 'menu',        // menu | play | over
    time: 0,
    serpent: new Serpent(34, 16, 800, 300),
    islands: [],
    pilgrims: [],
    wave: 0,
    layout: null,
    toSpawn: 0,
    spawnT: 0,
    waveBanner: 0,
    score: 0,
    best: loadBest(),
    streak: 0,
    lanterns: 3,
    wind: { x: 0, y: 0 },
    gustT: 0, gustActive: 0, gustDir: 1,
    pops: [],             // floating texts
    puffs: [],            // particles
    onCatch(p) {
      // only a real fall earns points — brief slips don't farm the bonus
      if (p.airTime < 0.35) return;
      this.score += 5;
      this.pops.push({ x: p.x, y: p.y - 24, text: 'caught! +5', t: 0, color: '#3fae8c' });
      audio.caught();
    },
    onLost(p) {
      this.lanterns--;
      this.streak = 0;
      this.pops.push({ x: p.x, y: CLOUD_LINE - 20, text: 'lost…', t: 0, color: '#c85a6e' });
      for (let i = 0; i < 10; i++) {
        this.puffs.push({
          x: p.x + (Math.random() - 0.5) * 20, y: CLOUD_LINE + 6,
          vx: (Math.random() - 0.5) * 60, vy: -30 - Math.random() * 50,
          r: 6 + Math.random() * 9, t: 0, life: 0.9, color: '255,255,255',
        });
      }
      audio.cry(); audio.poof();
      updateHud();
      if (this.lanterns <= 0) endRun();
    },
  };

  function startWave(w) {
    game.wave = w;
    game.layout = makeWaveLayout(w);
    game.islands = game.layout.islands;
    game.toSpawn = game.layout.pilgrims;
    game.spawnT = 1.2;
    game.waveBanner = 2.2;
    game.gustT = game.layout.gustEvery;
    $('wave-banner').textContent = 'Wave ' + w + (w === 1 ? ' — be the bridge' : (game.layout.gustEvery ? ' — the wind rises' : ' — the gap widens'));
    $('wave-banner').classList.add('show');
    setTimeout(() => $('wave-banner').classList.remove('show'), 2100);
    audio.waveHorn();
  }

  function startRun() {
    game.state = 'play';
    game.score = 0;
    game.streak = 0;
    game.lanterns = 3;
    game.pilgrims = [];
    game.pops = [];
    game.serpent = new Serpent(34, 16, 700, 320);
    $('menu').classList.add('hidden');
    $('over').classList.add('hidden');
    startWave(1);
    updateHud();
  }

  function endRun() {
    game.state = 'over';
    const isBest = game.score > game.best;
    if (isBest) { game.best = game.score; saveBest(game.best); }
    $('final-score').textContent = game.score;
    $('final-wave').textContent = game.wave;
    $('final-best').textContent = game.best;
    $('new-best').classList.toggle('hidden', !isBest);
    audio.gameOver();
    setTimeout(() => $('over').classList.remove('hidden'), 900);
  }

  function updateHud() {
    $('score').textContent = game.score;
    $('best').textContent = 'BEST ' + game.best;
    let h = '';
    for (let i = 0; i < 3; i++) h += `<span class="${i < game.lanterns ? 'lit' : 'out'}">⬤</span>`;
    $('lanterns').innerHTML = h;
  }

  // --- input -------------------------------------------------------------------
  let pointerActive = false;
  function onPointer(e) {
    const w = toWorld(e.clientX, e.clientY);
    game.serpent.headTarget.x = Math.max(20, Math.min(WORLD_W - 20, w.x));
    game.serpent.headTarget.y = Math.max(24, Math.min(WORLD_H - 40, w.y));
  }
  canvas.addEventListener('pointermove', (e) => { if (!('ontouchstart' in window) || pointerActive) onPointer(e); });
  canvas.addEventListener('pointerdown', (e) => { audio.init(); pointerActive = true; onPointer(e); });
  window.addEventListener('pointerup', () => { pointerActive = false; });

  $('btn-start').addEventListener('click', () => { audio.init(); startRun(); });
  $('btn-again').addEventListener('click', () => { audio.init(); startRun(); });
  $('btn-mute').addEventListener('click', () => {
    audio.init();
    audio.setMuted(!audio.muted);
    $('btn-mute').textContent = audio.muted ? '🔇' : '🔊';
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Enter' && game.state !== 'play') { audio.init(); startRun(); }
    if (e.code === 'KeyM') { audio.setMuted(!audio.muted); $('btn-mute').textContent = audio.muted ? '🔇' : '🔊'; }
  });

  // --- update ------------------------------------------------------------------
  function update(dt) {
    game.time += dt;

    // gusts
    if (game.state === 'play' && game.layout && game.layout.gustEvery) {
      game.gustT -= dt;
      if (game.gustT <= 0 && !game.gustActive) {
        game.gustActive = 1.9;
        game.gustDir = Math.random() < 0.5 ? -1 : 1;
        game.gustT = game.layout.gustEvery;
        audio.gust();
      }
    }
    if (game.gustActive > 0) {
      game.gustActive -= dt;
      const s = Math.sin((1 - game.gustActive / 1.9) * Math.PI);
      game.wind.x = game.gustDir * s * 220;
    } else {
      game.wind.x *= 0.9;
    }

    game.serpent.update(dt, game.wind, game.islands, game.time);

    if (game.state === 'play') {
      // spawning
      if (game.toSpawn > 0) {
        game.spawnT -= dt;
        if (game.spawnT <= 0) {
          const home = game.islands.find((i) => i.kind === 'home');
          game.pilgrims.push(new Pilgrim(home.left + 24, home.top(game.time) - 1,
            CLOAKS[(game.wave + game.toSpawn) % CLOAKS.length]));
          game.toSpawn--;
          game.spawnT = game.layout.spawnEvery;
        }
      }

      for (const p of game.pilgrims) {
        const was = p.state;
        p.update(dt, game);
        if (p.state === PSTATE.DELIVERED && was !== PSTATE.DELIVERED) {
          game.streak++;
          const pts = 10 + Math.min(game.streak - 1, 4) * 2;
          game.score += pts;
          game.pops.push({ x: p.x, y: p.y - 26, text: '+' + pts, t: 0, color: '#e8a03c' });
          audio.deliver(game.streak - 1);
          updateHud();
        }
      }

      // wave complete?
      if (game.toSpawn === 0 &&
          game.pilgrims.every((p) => p.state === PSTATE.DELIVERED || p.state === PSTATE.LOST) &&
          game.pilgrims.length > 0) {
        game.pilgrims = [];
        startWave(game.wave + 1);
      }
    }

    // fx
    for (const pop of game.pops) pop.t += dt;
    game.pops = game.pops.filter((p) => p.t < 1.2);
    for (const puf of game.puffs) {
      puf.t += dt;
      puf.x += puf.vx * dt; puf.y += puf.vy * dt;
      puf.vy += 30 * dt;
    }
    game.puffs = game.puffs.filter((p) => p.t < p.life);

    // continuous audio
    const hv = game.serpent.velocity(0, dt || 0.016);
    audio.updateLoop(Math.min(Math.hypot(hv.x, hv.y) / 900, 1), Math.abs(game.wind.x) / 220);
  }

  // --- render ------------------------------------------------------------------
  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, offX, offY);
    const t = game.time;

    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, WORLD_H);
    sky.addColorStop(0, '#ffe3b8');
    sky.addColorStop(0.42, '#ffb287');
    sky.addColorStop(0.72, '#e08a90');
    sky.addColorStop(1, '#9d6b96');
    ctx.fillStyle = sky;
    ctx.fillRect(-40, -40, WORLD_W + 80, WORLD_H + 80);

    // sun
    const sg = ctx.createRadialGradient(640, 560, 30, 640, 560, 320);
    sg.addColorStop(0, 'rgba(255,240,200,0.95)');
    sg.addColorStop(0.25, 'rgba(255,214,150,0.45)');
    sg.addColorStop(1, 'rgba(255,214,150,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(240, 200, 800, 640);

    // far cloud puffs
    ctx.fillStyle = 'rgba(255,236,220,0.5)';
    for (let i = 0; i < 7; i++) {
      const x = ((i * 233 + t * 6) % (WORLD_W + 300)) - 150;
      const y = 90 + (i % 3) * 70;
      cloudPuff(x, y, 60 + (i % 4) * 18);
    }

    drawIslands();
    drawPilgrims();
    drawSerpent();

    // gust streaks
    if (Math.abs(game.wind.x) > 40) {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 10; i++) {
        const y = 60 + ((i * 173) % 560);
        const x = ((t * Math.abs(game.wind.x) * 2.4 + i * 331) % (WORLD_W + 260)) - 130;
        const dir = Math.sign(game.wind.x);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 60 * dir, y + 3);
        ctx.stroke();
      }
    }

    // cloud sea
    for (let layer = 0; layer < 3; layer++) {
      const y0 = CLOUD_LINE + 14 + layer * 26;
      const amp = 12 - layer * 3;
      ctx.fillStyle = ['rgba(255,244,235,0.92)', 'rgba(255,228,216,0.95)', 'rgba(250,214,205,1)'][layer];
      ctx.beginPath();
      ctx.moveTo(-40, WORLD_H + 40);
      for (let x = -40; x <= WORLD_W + 40; x += 24) {
        ctx.lineTo(x, y0 + Math.sin(x * 0.012 + t * (0.7 + layer * 0.3) + layer * 2) * amp);
      }
      ctx.lineTo(WORLD_W + 40, WORLD_H + 40);
      ctx.closePath();
      ctx.fill();
    }

    // particles + popups
    for (const p of game.puffs) {
      ctx.fillStyle = `rgba(${p.color},${(1 - p.t / p.life) * 0.85})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (1 + p.t), 0, 7);
      ctx.fill();
    }
    ctx.textAlign = 'center';
    ctx.font = '700 22px system-ui, sans-serif';
    for (const p of game.pops) {
      ctx.globalAlpha = 1 - p.t / 1.2;
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y - p.t * 34);
    }
    ctx.globalAlpha = 1;
  }

  function cloudPuff(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r * 0.55, 0, 7);
    ctx.arc(x + r * 0.5, y - r * 0.18, r * 0.42, 0, 7);
    ctx.arc(x - r * 0.5, y - r * 0.1, r * 0.38, 0, 7);
    ctx.fill();
  }

  function drawIslands() {
    for (const isl of game.islands) {
      const top = isl.top(game.time);
      const w = isl.w, l = isl.left, r = isl.right;
      // rock body
      ctx.fillStyle = '#54466b';
      ctx.beginPath();
      ctx.moveTo(l, top);
      ctx.lineTo(r, top);
      ctx.quadraticCurveTo(r - w * 0.06, top + 60, isl.cx + w * 0.18, top + 105);
      ctx.quadraticCurveTo(isl.cx, top + 150, isl.cx - w * 0.12, top + 100);
      ctx.quadraticCurveTo(l + w * 0.04, top + 55, l, top);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.beginPath();
      ctx.moveTo(isl.cx - w * 0.1, top + 40);
      ctx.quadraticCurveTo(isl.cx, top + 120, isl.cx + w * 0.16, top + 96);
      ctx.quadraticCurveTo(isl.cx + w * 0.05, top + 60, isl.cx - w * 0.1, top + 40);
      ctx.fill();
      // grass
      ctx.fillStyle = '#79b08a';
      ctx.beginPath();
      ctx.moveTo(l, top);
      ctx.lineTo(r, top);
      ctx.lineTo(r - 6, top + 10);
      ctx.quadraticCurveTo(isl.cx, top + 16, l + 6, top + 10);
      ctx.closePath();
      ctx.fill();

      if (isl.kind === 'shrine') {
        // little coral gate + bell
        const gx = isl.cx + w * 0.24;
        ctx.strokeStyle = '#e8543c';
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(gx - 26, top); ctx.lineTo(gx - 26, top - 52);
        ctx.moveTo(gx + 26, top); ctx.lineTo(gx + 26, top - 52);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(gx - 40, top - 52);
        ctx.quadraticCurveTo(gx, top - 68, gx + 40, top - 52);
        ctx.stroke();
        ctx.fillStyle = '#ffd98a';
        ctx.beginPath();
        ctx.arc(gx, top - 44, 6, 0, 7);
        ctx.fill();
      } else {
        // lantern post at the launch edge
        const px = isl.right - 16;
        ctx.strokeStyle = '#4a3a58';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(px, top); ctx.lineTo(px, top - 36);
        ctx.stroke();
        const lg = ctx.createRadialGradient(px, top - 42, 2, px, top - 42, 22);
        lg.addColorStop(0, 'rgba(255,214,120,0.9)');
        lg.addColorStop(1, 'rgba(255,214,120,0)');
        ctx.fillStyle = lg;
        ctx.beginPath(); ctx.arc(px, top - 42, 22, 0, 7); ctx.fill();
        ctx.fillStyle = '#ffcf6e';
        ctx.fillRect(px - 5, top - 48, 10, 13);
      }
    }
  }

  function drawSerpent() {
    const s = game.serpent, pts = s.points;
    // body ribbon
    ctx.beginPath();
    for (let i = 0; i < s.n; i++) {
      const tan = s.tangent(i);
      const nx = -tan.y, ny = tan.x;
      const r = s.radius(i);
      const x = pts[i].x + nx * r, y = pts[i].y + ny * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    for (let i = s.n - 1; i >= 0; i--) {
      const tan = s.tangent(i);
      const nx = -tan.y, ny = tan.x;
      const r = s.radius(i);
      ctx.lineTo(pts[i].x - nx * r, pts[i].y - ny * r);
    }
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, WORLD_H);
    grad.addColorStop(0, '#4fae9c');
    grad.addColorStop(1, '#33776e');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,60,55,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // dorsal fins
    ctx.fillStyle = '#ff8f6b';
    for (let i = 3; i < s.n - 2; i += 3) {
      const tan = s.tangent(i);
      const nx = -tan.y, ny = tan.x;
      // fins grow from whichever side is "up"
      const up = ny < 0 ? 1 : -1;
      const r = s.radius(i);
      const bx = pts[i].x + nx * r * up, by = pts[i].y + ny * r * up;
      ctx.beginPath();
      ctx.moveTo(bx - tan.x * 7, by - tan.y * 7);
      ctx.lineTo(bx + nx * up * (9 + r * 0.3) + tan.x * 3, by + ny * up * (9 + r * 0.3) + tan.y * 3);
      ctx.lineTo(bx + tan.x * 8, by + tan.y * 8);
      ctx.closePath();
      ctx.fill();
    }

    // belly glints
    ctx.strokeStyle = 'rgba(242,229,201,0.55)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 1; i < s.n - 1; i++) {
      const p = pts[i];
      if (i === 1) ctx.moveTo(p.x, p.y + s.radius(i) * 0.45);
      else ctx.lineTo(p.x, p.y + s.radius(i) * 0.45);
    }
    ctx.stroke();

    // head
    const h = pts[0], neck = pts[1];
    const hd = { x: h.x - neck.x, y: h.y - neck.y };
    const hl = Math.hypot(hd.x, hd.y) || 1;
    hd.x /= hl; hd.y /= hl;
    const hr = s.radius(0) * 1.25;
    ctx.fillStyle = '#4fae9c';
    ctx.beginPath();
    ctx.arc(h.x, h.y, hr, 0, 7);
    ctx.fill();
    // snout
    ctx.beginPath();
    ctx.ellipse(h.x + hd.x * hr * 0.9, h.y + hd.y * hr * 0.9, hr * 0.72, hr * 0.5,
      Math.atan2(hd.y, hd.x), 0, 7);
    ctx.fill();
    // horns
    ctx.strokeStyle = '#f2e5c9';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      const nx = -hd.y * side, ny = hd.x * side;
      ctx.beginPath();
      ctx.moveTo(h.x + nx * hr * 0.7 - hd.x * hr * 0.3, h.y + ny * hr * 0.7 - hd.y * hr * 0.3);
      ctx.quadraticCurveTo(
        h.x + nx * hr * 1.6 - hd.x * hr * 1.1, h.y + ny * hr * 1.6 - hd.y * hr * 1.1,
        h.x + nx * hr * 1.5 - hd.x * hr * 1.9, h.y + ny * hr * 1.5 - hd.y * hr * 1.9);
      ctx.stroke();
    }
    // whiskers
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(242,229,201,0.8)';
    for (const side of [-1, 1]) {
      const nx = -hd.y * side, ny = hd.x * side;
      const bx = h.x + hd.x * hr * 1.3 + nx * hr * 0.4;
      const by = h.y + hd.y * hr * 1.3 + ny * hr * 0.4;
      const sway = Math.sin(game.time * 2.4 + side) * 10;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx - hd.x * 26 + nx * 16, by - hd.y * 26 + ny * 16 + sway * 0.4,
        bx - hd.x * 46 + nx * 30 + sway * 0.4, by - hd.y * 46 + ny * 30 + sway);
      ctx.stroke();
    }
    // eyes
    for (const side of [-1, 1]) {
      const nx = -hd.y * side, ny = hd.x * side;
      const ex = h.x + nx * hr * 0.52 + hd.x * hr * 0.34;
      const ey = h.y + ny * hr * 0.52 + hd.y * hr * 0.34;
      ctx.fillStyle = '#fff8ea';
      ctx.beginPath(); ctx.arc(ex, ey, 4.6, 0, 7); ctx.fill();
      ctx.fillStyle = '#20323a';
      ctx.beginPath(); ctx.arc(ex + hd.x * 1.6, ey + hd.y * 1.6, 2.4, 0, 7); ctx.fill();
    }
  }

  function drawPilgrims() {
    for (const p of game.pilgrims) {
      if (p.state === PSTATE.LOST) continue;
      if (p.state === PSTATE.DELIVERED && p.doneT > 0.8) continue;
      const bob = p.state === PSTATE.WALK ? Math.sin(game.time * 9 + p.bob) * 1.4 : 0;
      const tilt = p.state === PSTATE.AIR ? Math.sin(p.airTime * 8) * 0.4 : 0;
      const alpha = p.state === PSTATE.DELIVERED ? 1 - p.doneT / 0.8 : 1;
      ctx.save();
      ctx.translate(p.x, p.y + bob);
      ctx.rotate(tilt);
      ctx.globalAlpha = alpha;
      // lantern glow
      const lg = ctx.createRadialGradient(7, -14, 1, 7, -14, 16);
      lg.addColorStop(0, 'rgba(255,214,120,0.85)');
      lg.addColorStop(1, 'rgba(255,214,120,0)');
      ctx.fillStyle = lg;
      ctx.beginPath(); ctx.arc(7, -14, 16, 0, 7); ctx.fill();
      // cloak
      ctx.fillStyle = p.cloak;
      ctx.beginPath();
      ctx.moveTo(-5, 0);
      ctx.lineTo(5, 0);
      ctx.lineTo(3.4, -12);
      ctx.lineTo(-3.4, -12);
      ctx.closePath();
      ctx.fill();
      // head
      ctx.fillStyle = '#f0c8a0';
      ctx.beginPath(); ctx.arc(0, -15, 3.8, 0, 7); ctx.fill();
      // lantern stick + lamp
      ctx.strokeStyle = '#4a3a2a';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(3, -10); ctx.lineTo(8, -18); ctx.stroke();
      ctx.fillStyle = '#ffcf6e';
      ctx.fillRect(5.4, -18, 4.5, 5.5);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  // --- boot --------------------------------------------------------------------
  updateHud();
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.033);
    last = now;
    update(dt);
    render();
  }
  requestAnimationFrame(frame);

  // debug/test handle
  window.WY = {
    game, startRun,
    setHead(x, y) { game.serpent.headTarget.x = x; game.serpent.headTarget.y = y; },
    layBridge() {
      // lay the serpent's trail as a straight span between the islands (tests)
      const home = game.islands.find((i) => i.kind === 'home');
      const shrine = game.islands.find((i) => i.kind === 'shrine');
      const s = game.serpent;
      const hx = shrine.left + 70, hy = shrine.top(game.time) - 4;
      const x1 = home.right - 70, y1 = home.top(game.time) - 4;
      const spanX = Math.max(hx - x1, 1);
      const yAt = (d) => hy + (y1 - hy) * Math.min(d / spanX, 1);
      s.head.x = hx; s.head.y = hy;
      s.headTarget.x = hx; s.headTarget.y = hy;
      s.trail = [];
      for (let i = 1; i <= s.n + 2; i++) {
        s.trail.push({ x: hx - i * s.spacing, y: yAt(i * s.spacing) });
      }
      for (let i = 0; i < s.n; i++) {
        const x = hx - i * s.spacing, y = yAt(i * s.spacing);
        s.points[i].x = x; s.points[i].px = x;
        s.points[i].y = y; s.points[i].py = y;
      }
    },
  };
})();
