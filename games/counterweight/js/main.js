// ---------------------------------------------------------------------------
// main.js — Counterweight controller: levels, input, undo, overlays, progress.
// ---------------------------------------------------------------------------
'use strict';

(function () {
  const $ = (id) => document.getElementById(id);
  const canvas = $('board');
  const renderer = new ScaleRenderer(canvas);
  const sfx = new ScaleSFX();

  const PROG_KEY = 'counterweight-progress';
  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(PROG_KEY)) || { solved: {}, current: 0 }; }
    catch (e) { return { solved: {}, current: 0 }; }
  }
  function saveProgress() {
    try { localStorage.setItem(PROG_KEY, JSON.stringify(progress)); } catch (e) { /* ok */ }
  }
  const progress = loadProgress();

  let levelIndex = Math.min(progress.current || 0, LEVELS_CW.length - 1);
  let lv = null, st = null;
  let undoStack = [];
  let won = false;
  let autoplayTimer = null;
  let autoplaying = false;

  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);

  function maxUnlocked() {
    let n = 0;
    while (n < LEVELS_CW.length && progress.solved[LEVELS_CW[n].name]) n++;
    return Math.min(n, LEVELS_CW.length - 1);
  }

  function loadLevel(i) {
    stopAutoplay();
    levelIndex = clamp(i, 0, LEVELS_CW.length - 1);
    progress.current = levelIndex;
    saveProgress();
    lv = CW.parseLevel(LEVELS_CW[levelIndex]);
    st = CW.initialState(lv);
    undoStack = [];
    won = false;
    renderer.setLevel(lv, st);
    $('level-name').textContent = (levelIndex + 1) + '. ' + lv.name;
    $('hint').textContent = lv.hint;
    $('win').classList.add('hidden');
    $('lost-banner').classList.add('hidden');
    updateHud();
    updateNav();
  }

  function updateHud() {
    $('steps').textContent = st.steps;
    $('par').textContent = 'par ' + lv.par;
    const slotted = st.gems.filter((g) => g.slotted).length;
    $('gems').textContent = slotted + '/' + lv.sockets.length;
    $('lost-banner').classList.toggle('hidden', !st.failed);
  }

  function updateNav() {
    $('btn-prev').disabled = levelIndex === 0;
    $('btn-next').disabled = levelIndex >= maxUnlocked();
    const dots = $('dots');
    dots.innerHTML = '';
    LEVELS_CW.forEach((def, i) => {
      const d = document.createElement('button');
      d.className = 'dot' +
        (i === levelIndex ? ' cur' : '') +
        (progress.solved[def.name] ? ' done' : '') +
        (i > maxUnlocked() ? ' locked' : '');
      d.title = (i + 1) + '. ' + def.name;
      if (i <= maxUnlocked()) d.addEventListener('click', () => { sfx.init(); loadLevel(i); });
      dots.appendChild(d);
    });
  }

  function act(action) {
    if (won || st.failed) return;
    const r = CW.step(lv, st, action);
    if (!r) {
      renderer.onInvalid();
      sfx.invalid();
      return;
    }
    undoStack.push(CW.cloneState(st));
    if (undoStack.length > 400) undoStack.shift();
    st = r.state;
    const now = performance.now() / 1000;
    renderer.onEvents(r.events, now);

    let pushed = false, slid = 0, tilted = false;
    for (const ev of r.events) {
      if (ev.t === 'push') pushed = true;
      if (ev.t === 'slide') slid++;
      if (ev.t === 'tilt') tilted = true;
      if (ev.t === 'lock') sfx.lock();
      if (ev.t === 'plug') sfx.plug();
      if (ev.t === 'gemLost') sfx.gemLost();
    }
    if (tilted) sfx.tilt();
    if (slid) sfx.slide(slid);
    if (pushed) sfx.push();
    else sfx.stepTap();

    updateHud();
    if (r.won) onWin();
  }

  function undo() {
    if (autoplaying) { stopAutoplay(); return; }
    if (!undoStack.length || won) return;
    st = undoStack.pop();
    sfx.undo();
    updateHud();
  }

  function stopAutoplay() {
    if (autoplayTimer) clearInterval(autoplayTimer);
    autoplayTimer = null;
    if (autoplaying) {
      autoplaying = false;
      $('btn-solve').textContent = '✨ Solve';
      $('btn-solve').classList.remove('busy');
    }
  }

  function startAutoplay() {
    if (autoplaying) { stopAutoplay(); return; }
    const sol = LEVELS_CW[levelIndex].solution;
    if (!sol) return;
    loadLevel(levelIndex);
    autoplaying = true;
    $('btn-solve').textContent = '■ Stop';
    $('btn-solve').classList.add('busy');
    let i = 0;
    autoplayTimer = setInterval(() => {
      if (won || i >= sol.length) { stopAutoplay(); return; }
      act(sol[i++]);
    }, 420);
  }

  function onWin() {
    won = true;
    const watched = autoplaying;
    stopAutoplay();
    const def = LEVELS_CW[levelIndex];
    if (!watched) {
      const prevBest = progress.solved[def.name];
      if (!prevBest || st.steps < prevBest) progress.solved[def.name] = st.steps;
      saveProgress();
    }
    sfx.win();
    setTimeout(() => {
      $('win-title').textContent = watched ? 'So the scales settle.'
        : (levelIndex === LEVELS_CW.length - 1 ? 'Perfect equilibrium.' : 'It balances.');
      $('win-sub').classList.toggle('hidden', !watched);
      $('win-steps').textContent = st.steps;
      $('win-par').textContent = lv.par;
      $('win-perfect').classList.toggle('hidden', st.steps > lv.par);
      $('btn-win-next').classList.toggle('hidden', levelIndex === LEVELS_CW.length - 1);
      $('win').classList.remove('hidden');
      updateNav();
    }, 700);
  }

  // --- input -----------------------------------------------------------------

  const KEYMAP = {
    ArrowUp: 'U', KeyW: 'U', ArrowDown: 'D', KeyS: 'D',
    ArrowLeft: 'L', KeyA: 'L', ArrowRight: 'R', KeyD: 'R',
  };

  window.addEventListener('keydown', (e) => {
    if (!$('intro').classList.contains('hidden')) {
      if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); start(); }
      return;
    }
    sfx.init();
    if (KEYMAP[e.code]) {
      e.preventDefault();
      if (autoplaying) { stopAutoplay(); return; }
      if (!$('win').classList.contains('hidden')) return;
      act(KEYMAP[e.code]);
      return;
    }
    if (e.code === 'KeyZ') undo();
    if (e.code === 'KeyR') loadLevel(levelIndex);
    if (e.code === 'Enter' && won) nextOrReplay();
    if (e.code === 'KeyN' && levelIndex < maxUnlocked()) loadLevel(levelIndex + 1);
    if (e.code === 'KeyP' && levelIndex > 0) loadLevel(levelIndex - 1);
    if (e.code === 'KeyM') {
      sfx.setMuted(!sfx.muted);
      $('btn-mute').textContent = sfx.muted ? '🔇' : '🔊';
    }
  });

  function nextOrReplay() {
    if (levelIndex < LEVELS_CW.length - 1) loadLevel(levelIndex + 1);
    else loadLevel(levelIndex);
  }

  // touch: swipe to move
  let touchStart = null;
  canvas.addEventListener('pointerdown', (e) => { touchStart = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!touchStart) return;
    sfx.init();
    if (autoplaying) { stopAutoplay(); touchStart = null; return; }
    const dx = e.clientX - touchStart.x, dy = e.clientY - touchStart.y;
    touchStart = null;
    if (Math.hypot(dx, dy) < 14) return;
    if (!$('win').classList.contains('hidden')) return;
    if (Math.abs(dx) > Math.abs(dy)) act(dx > 0 ? 'R' : 'L');
    else act(dy > 0 ? 'D' : 'U');
  });

  $('btn-undo').addEventListener('click', () => { sfx.init(); undo(); });
  $('btn-solve').addEventListener('click', () => { sfx.init(); startAutoplay(); });
  $('btn-restart').addEventListener('click', () => { sfx.init(); loadLevel(levelIndex); });
  $('btn-prev').addEventListener('click', () => loadLevel(levelIndex - 1));
  $('btn-next').addEventListener('click', () => loadLevel(levelIndex + 1));
  $('btn-mute').addEventListener('click', () => {
    sfx.init();
    sfx.setMuted(!sfx.muted);
    $('btn-mute').textContent = sfx.muted ? '🔇' : '🔊';
  });
  $('btn-win-next').addEventListener('click', () => { sfx.init(); nextOrReplay(); });
  $('btn-win-replay').addEventListener('click', () => { sfx.init(); loadLevel(levelIndex); });
  $('btn-help').addEventListener('click', () => { $('intro').classList.remove('hidden'); });
  $('btn-lost-undo').addEventListener('click', () => { sfx.init(); undo(); });

  function start() {
    sfx.init();
    $('intro').classList.add('hidden');
  }
  $('btn-start').addEventListener('click', start);

  window.addEventListener('resize', () => renderer.resize());

  // --- touch controls ----------------------------------------------------------
  const COARSE = window.matchMedia('(pointer: coarse)').matches ||
    'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (COARSE) document.body.classList.add('touch');

  document.querySelectorAll('#dpad button.dp').forEach((el) => {
    let rep = null;
    const fire = () => {
      if (autoplaying) { stopAutoplay(); return; }
      if (!$('win').classList.contains('hidden')) return;
      act(el.dataset.a);
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      sfx.init();
      fire();
      clearInterval(rep);
      rep = setInterval(fire, 210);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) {
      el.addEventListener(ev, () => clearInterval(rep));
    }
  });

  // --- boot --------------------------------------------------------------------

  loadLevel(levelIndex);

  function frame(nowMs) {
    requestAnimationFrame(frame);
    renderer.draw(nowMs / 1000, st, CW.torque(lv, st));
  }
  requestAnimationFrame(frame);

  // debug/test handle
  window.CWG = {
    act, loadLevel,
    get state() { return st; },
    get level() { return lv; },
    get levelIndex() { return levelIndex; },
    get won() { return won; },
  };
})();
