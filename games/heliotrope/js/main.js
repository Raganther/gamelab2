// ---------------------------------------------------------------------------
// main.js — Heliotrope controller: levels, input, undo, overlays, progress.
// ---------------------------------------------------------------------------
'use strict';

(function () {
  const $ = (id) => document.getElementById(id);
  const canvas = $('board');
  const renderer = new GardenRenderer(canvas);
  const sfx = new GardenSFX();

  const PROG_KEY = 'heliotrope-progress';
  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(PROG_KEY)) || { solved: {}, current: 0 }; }
    catch (e) { return { solved: {}, current: 0 }; }
  }
  function saveProgress() {
    try { localStorage.setItem(PROG_KEY, JSON.stringify(progress)); } catch (e) { /* ok */ }
  }
  const progress = loadProgress();

  let levelIndex = Math.min(progress.current || 0, LEVELS_HELIO.length - 1);
  let lv = null, st = null;
  let undoStack = [];
  let won = false;
  let autoplayTimer = null;
  let autoplaying = false;

  function maxUnlocked() {
    let n = 0;
    while (n < LEVELS_HELIO.length && progress.solved[LEVELS_HELIO[n].name]) n++;
    return Math.min(n, LEVELS_HELIO.length - 1);
  }

  function loadLevel(i) {
    stopAutoplay();
    levelIndex = U2.clamp(i, 0, LEVELS_HELIO.length - 1);
    progress.current = levelIndex;
    saveProgress();
    lv = HELIO.parseLevel(LEVELS_HELIO[levelIndex]);
    st = HELIO.initialState(lv);
    undoStack = [];
    won = false;
    renderer.setLevel(lv, st);
    $('level-name').textContent = (levelIndex + 1) + '. ' + lv.name;
    $('hint').textContent = lv.hint;
    $('win').classList.add('hidden');
    updateHud();
    updateNav();
  }

  const U2 = { clamp: (v, a, b) => v < a ? a : (v > b ? b : v) };

  function updateHud() {
    $('steps').textContent = st.steps;
    $('par').textContent = 'par ' + lv.par;
    const bloomed = st.vines.filter((v) => v.bloomed).length;
    $('blooms').textContent = bloomed + '/' + lv.sockets.length;
  }

  function updateNav() {
    $('btn-prev').disabled = levelIndex === 0;
    $('btn-next').disabled = levelIndex >= maxUnlocked();
    const dots = $('dots');
    dots.innerHTML = '';
    LEVELS_HELIO.forEach((def, i) => {
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
    if (won) return;
    const r = HELIO.step(lv, st, action);
    if (!r) {
      renderer.onInvalid();
      sfx.invalid();
      return;
    }
    undoStack.push(HELIO.cloneState(st));
    if (undoStack.length > 400) undoStack.shift();
    st = r.state;
    const now = performance.now() / 1000;
    if (action === 'W') { renderer.onWait(now); sfx.wait(); }
    else sfx.step();
    let grew = false, splashed = false;
    for (const g of r.grows) {
      const isWater = HELIO.cellAt(lv, g.x, g.y) === HELIO.WATER;
      renderer.onGrow(g, now, isWater);
      grew = true;
      if (isWater) splashed = true;
    }
    if (grew) sfx.grow();
    if (splashed) sfx.splash();
    for (const b of r.blooms) {
      renderer.onBloom(b, now);
      sfx.bloom();
    }
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

  // watch the sun solve it: reset, then replay the solver's optimal line
  function startAutoplay() {
    if (autoplaying) { stopAutoplay(); return; }
    const sol = LEVELS_HELIO[levelIndex].solution;
    if (!sol) return;
    loadLevel(levelIndex);
    autoplaying = true;
    $('btn-solve').textContent = '■ Stop';
    $('btn-solve').classList.add('busy');
    let i = 0;
    autoplayTimer = setInterval(() => {
      if (won || i >= sol.length) { stopAutoplay(); return; }
      act(sol[i++]);
    }, 320);
  }

  function onWin() {
    won = true;
    const watched = autoplaying;
    stopAutoplay();
    const def = LEVELS_HELIO[levelIndex];
    if (!watched) {
      // watching the sun solve it earns nothing — doing it yourself does
      const prevBest = progress.solved[def.name];
      if (!prevBest || st.steps < prevBest) progress.solved[def.name] = st.steps;
      saveProgress();
    }
    sfx.win();
    setTimeout(() => {
      $('win-title').textContent = watched ? 'And that is how it is done.'
        : (levelIndex === LEVELS_HELIO.length - 1 ? 'The whole garden blooms.' : 'It blooms!');
      $('win-sub').classList.toggle('hidden', !watched);
      $('win-steps').textContent = st.steps;
      $('win-par').textContent = lv.par;
      $('win-perfect').classList.toggle('hidden', st.steps > lv.par);
      $('btn-win-next').classList.toggle('hidden', levelIndex === LEVELS_HELIO.length - 1);
      $('win').classList.remove('hidden');
      updateNav();
    }, 650);
  }

  // --- input -----------------------------------------------------------------

  const KEYMAP = {
    ArrowUp: 'U', KeyW: 'U', ArrowDown: 'D', KeyS: 'D',
    ArrowLeft: 'L', KeyA: 'L', ArrowRight: 'R', KeyD: 'R',
    Space: 'W',
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
    if (levelIndex < LEVELS_HELIO.length - 1) loadLevel(levelIndex + 1);
    else loadLevel(levelIndex);
  }

  // touch: swipe to move, tap to wait
  let touchStart = null;
  canvas.addEventListener('pointerdown', (e) => { touchStart = { x: e.clientX, y: e.clientY, t: Date.now() }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!touchStart) return;
    sfx.init();
    if (autoplaying) { stopAutoplay(); touchStart = null; return; }
    const dx = e.clientX - touchStart.x, dy = e.clientY - touchStart.y;
    const dist = Math.hypot(dx, dy);
    touchStart = null;
    if ($('win').classList.contains('hidden') === false) return;
    if (dist < 12) { act('W'); return; }
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

  document.querySelectorAll('#dpad .dp').forEach((el) => {
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
    renderer.draw(nowMs / 1000, st);
  }
  requestAnimationFrame(frame);

  // debug/test handle
  window.HP = {
    act, loadLevel,
    get state() { return st; },
    get level() { return lv; },
    get levelIndex() { return levelIndex; },
    get won() { return won; },
  };
})();
