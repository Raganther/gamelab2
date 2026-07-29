// ---------------------------------------------------------------------------
// main.js — Chimework controller: pin roll UI, play loop, levels, progress.
// ---------------------------------------------------------------------------
'use strict';

(function () {
  const $ = (id) => document.getElementById(id);
  const scene = new MusicBoxScene($('view'));
  const audio = new BoxAudio();

  const PROG_KEY = 'chimework-progress';
  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(PROG_KEY)) || { solved: {}, current: 0 }; }
    catch (e) { return { solved: {}, current: 0 }; }
  }
  function saveProgress() {
    try { localStorage.setItem(PROG_KEY, JSON.stringify(progress)); } catch (e) { /* ok */ }
  }
  const progress = loadProgress();

  let levelIndex = Math.min(progress.current || 0, LEVELS_CHIME.length - 1);
  let lv = null;
  let pins = [];              // [[row, beat], ...]
  let playing = false;
  let watched = false;        // current playthrough came from the Solve button
  let playTimer = null;
  let trace = null, traceIdx = 0;
  const BEAT_MS = 460;

  function maxUnlocked() {
    let n = 0;
    while (n < LEVELS_CHIME.length && progress.solved[LEVELS_CHIME[n].name] !== undefined) n++;
    return Math.min(n, LEVELS_CHIME.length - 1);
  }

  function loadLevel(i) {
    stopPlay();
    levelIndex = Math.max(0, Math.min(i, LEVELS_CHIME.length - 1));
    progress.current = levelIndex;
    saveProgress();
    lv = CHIME.parseLevel(LEVELS_CHIME[levelIndex]);
    pins = [];
    watched = false;
    scene.setLevel(lv);
    scene.setPins(pins);
    $('level-name').textContent = (levelIndex + 1) + '. ' + lv.name;
    $('hint').textContent = lv.hint;
    $('win').classList.add('hidden');
    $('toast').classList.add('hidden');
    buildGrid();
    updateHud();
    updateNav();
  }

  // --- pin roll UI -------------------------------------------------------------

  function buildGrid() {
    const grid = $('roll');
    grid.innerHTML = '';
    grid.style.gridTemplateColumns = `auto repeat(${lv.beats}, 1fr)`;
    lv.rows.forEach((row, ri) => {
      const label = document.createElement('div');
      label.className = 'row-label';
      label.innerHTML = `<span class="swatch" style="background:${row.color}"></span>${row.label}`;
      grid.appendChild(label);
      for (let b = 0; b < lv.beats; b++) {
        const cell = document.createElement('button');
        cell.className = 'socket';
        cell.dataset.row = ri;
        cell.dataset.beat = b;
        cell.style.setProperty('--row-color', row.color);
        cell.addEventListener('click', () => togglePin(ri, b));
        grid.appendChild(cell);
      }
    });
    refreshGrid();
  }

  function pinIndex(ri, b) {
    return pins.findIndex(([r, bb]) => r === ri && bb === b);
  }

  function togglePin(ri, b) {
    audio.init();
    if (playing) stopPlay();
    const idx = pinIndex(ri, b);
    if (idx >= 0) {
      pins.splice(idx, 1);
      audio.remove();
    } else {
      if (pins.length >= lv.budget) {
        $('pins-left').classList.add('flash');
        setTimeout(() => $('pins-left').classList.remove('flash'), 400);
        return;
      }
      pins.push([ri, b]);
      audio.place();
      audio.tine(lv.rows[ri].note, 0.06);
    }
    watched = false;
    scene.setPins(pins);
    refreshGrid();
    updateHud();
  }

  function refreshGrid() {
    document.querySelectorAll('#roll .socket').forEach((cell) => {
      const ri = +cell.dataset.row, b = +cell.dataset.beat;
      cell.classList.toggle('pinned', pinIndex(ri, b) >= 0);
      cell.classList.remove('now');
    });
  }

  function markBeat(col) {
    document.querySelectorAll('#roll .socket').forEach((cell) => {
      cell.classList.toggle('now', +cell.dataset.beat === col);
    });
  }

  function updateHud() {
    $('pins-left').textContent = (lv.budget - pins.length);
    $('par').textContent = 'best possible ' + lv.par;
    const best = progress.solved[lv.name];
    $('best').textContent = best !== undefined ? 'your best ' + best : '';
  }

  function updateNav() {
    $('btn-prev').disabled = levelIndex === 0;
    $('btn-next').disabled = levelIndex >= maxUnlocked();
    const dots = $('dots');
    dots.innerHTML = '';
    LEVELS_CHIME.forEach((def, i) => {
      const d = document.createElement('button');
      d.className = 'dot' +
        (i === levelIndex ? ' cur' : '') +
        (progress.solved[def.name] !== undefined ? ' done' : '') +
        (i > maxUnlocked() ? ' locked' : '');
      d.title = (i + 1) + '. ' + def.name;
      if (i <= maxUnlocked()) d.addEventListener('click', () => loadLevel(i));
      dots.appendChild(d);
    });
  }

  // --- play loop -----------------------------------------------------------------

  function startPlay(fromSolve) {
    if (playing) { stopPlay(); return; }
    audio.init();
    watched = !!fromSolve;
    const result = CHIME.simulate(lv, pins);
    trace = result.trace;
    traceIdx = 0;
    playing = true;
    $('btn-play').textContent = '■ Stop';
    $('btn-play').classList.add('busy');
    $('toast').classList.add('hidden');
    scene.resetVisual(lv);
    playTimer = setInterval(stepOnce, BEAT_MS);
  }

  function stepOnce() {
    if (traceIdx >= trace.length) {
      // song over without reaching the cup
      finishLost(true);
      return;
    }
    const step = trace[traceIdx++];
    markBeat(step.t % lv.beats);
    scene.playStep(step, lv, BEAT_MS / 1000);
    audio.tick();
    if (step.to) audio.roll();
    for (const ri of step.fired) audio.tine(lv.rows[ri].note, 0.12);
    if (step.launch) audio.launch();
    if (step.star) audio.star();
    if (step.lost) { finishLost(false); return; }
    if (step.won) { finishWon(); return; }
  }

  function finishLost(wound) {
    clearInterval(playTimer);
    playing = false;
    $('btn-play').textContent = '▶ Play';
    $('btn-play').classList.remove('busy');
    setTimeout(() => {
      if (wound) audio.windDown(); else audio.lostThunk();
      $('toast-text').textContent = wound
        ? 'The song ended with the marble still rolling. Adjust your pins.'
        : 'The marble fell into the works. Adjust your pins.';
      $('toast').classList.remove('hidden');
    }, BEAT_MS * 0.6);
  }

  function finishWon() {
    clearInterval(playTimer);
    playing = false;
    $('btn-play').textContent = '▶ Play';
    $('btn-play').classList.remove('busy');
    const used = pins.length;
    const wasWatched = watched;
    if (!wasWatched) {
      const prev = progress.solved[lv.name];
      if (prev === undefined || used < prev) progress.solved[lv.name] = used;
      saveProgress();
    }
    setTimeout(() => {
      audio.win();
      $('win-title').textContent = wasWatched ? 'So that is the tune.'
        : (levelIndex === LEVELS_CHIME.length - 1 ? 'The whole box sings.' : 'The box sings.');
      $('win-sub').classList.toggle('hidden', !wasWatched);
      $('win-pins').textContent = used;
      $('win-par').textContent = lv.par;
      $('win-perfect').classList.toggle('hidden', wasWatched || used > lv.par);
      $('btn-win-next').classList.toggle('hidden', levelIndex === LEVELS_CHIME.length - 1);
      $('win').classList.remove('hidden');
      updateNav();
      updateHud();
    }, BEAT_MS);
  }

  function stopPlay() {
    if (playTimer) clearInterval(playTimer);
    playing = false;
    $('btn-play').textContent = '▶ Play';
    $('btn-play').classList.remove('busy');
    if (lv) {
      scene.resetVisual(lv);
      refreshGrid();
    }
  }

  function solveDemo() {
    if (!lv.solution) return;
    stopPlay();
    pins = lv.solution.map((p) => p.slice());
    scene.setPins(pins);
    refreshGrid();
    updateHud();
    startPlay(true);
  }

  // --- wiring --------------------------------------------------------------------

  $('btn-play').addEventListener('click', () => startPlay(false));
  $('btn-solve').addEventListener('click', () => { audio.init(); solveDemo(); });
  $('btn-clear').addEventListener('click', () => {
    audio.init();
    stopPlay();
    pins = [];
    watched = false;
    scene.setPins(pins);
    refreshGrid();
    updateHud();
  });
  $('btn-prev').addEventListener('click', () => loadLevel(levelIndex - 1));
  $('btn-next').addEventListener('click', () => loadLevel(levelIndex + 1));
  $('btn-mute').addEventListener('click', () => {
    audio.init();
    audio.setMuted(!audio.muted);
    $('btn-mute').textContent = audio.muted ? '🔇' : '🔊';
  });
  $('btn-help').addEventListener('click', () => $('intro').classList.remove('hidden'));
  $('btn-start').addEventListener('click', () => {
    audio.init();
    $('intro').classList.add('hidden');
  });
  $('btn-win-next').addEventListener('click', () => { audio.init(); loadLevel(levelIndex + 1); });
  $('btn-win-replay').addEventListener('click', () => {
    audio.init();
    $('win').classList.add('hidden');
    stopPlay();
  });
  $('toast-close').addEventListener('click', () => $('toast').classList.add('hidden'));

  window.addEventListener('keydown', (e) => {
    if (!$('intro').classList.contains('hidden')) {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        audio.init();
        $('intro').classList.add('hidden');
      }
      return;
    }
    if (e.code === 'Space') { e.preventDefault(); startPlay(false); }
    if (e.code === 'KeyR') { pins = []; scene.setPins(pins); refreshGrid(); updateHud(); stopPlay(); }
    if (e.code === 'KeyM') {
      audio.setMuted(!audio.muted);
      $('btn-mute').textContent = audio.muted ? '🔇' : '🔊';
    }
  });

  window.addEventListener('resize', () => scene.resize());

  // --- boot ------------------------------------------------------------------------

  loadLevel(levelIndex);

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    scene.frame(dt);
  }
  requestAnimationFrame(frame);

  // debug/test handle
  window.CB = {
    loadLevel, startPlay, togglePin, solveDemo,
    get pins() { return pins; },
    get playing() { return playing; },
    get level() { return lv; },
    get levelIndex() { return levelIndex; },
  };
})();
