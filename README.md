# 🏂 Powder Peak — 3D Snowboarding

An endless 3D snowboarding game that runs entirely in the browser. Carve down a
procedurally generated mountain, dodge trees and rocks, hit kickers, and land
spins and grabs for a high score.

Two levels:

- **Powder Peak** — classic wide-open alpine cruising: forests, big kickers,
  room to carve.
- **Crystal Caverns** — a steeper, meandering canyon with half-pipe walls that
  periodically dives through glowing crystal caves. Tighter, faster, with cave
  ceilings you can bonk your head on. Best scores are tracked per level.

![Powder Peak](https://img.shields.io/badge/engine-three.js-blue) ![No build](https://img.shields.io/badge/build-none-brightgreen)

## Play

No build step, no dependencies to install — Three.js is vendored in `lib/`.

- **Easiest:** just open `index.html` in a browser, or
- serve the folder (avoids any local-file quirks):

```sh
# either one:
npx serve .
python3 -m http.server 8000
```

then visit `http://localhost:8000`.

## Controls

| Key | Action |
| --- | --- |
| ◀ ▶ or A / D | Carve — and spin while airborne |
| Space | Jump |
| ▲ or W | Tuck (more speed, less grip) |
| ▼ / Shift | Grab while airborne (style points) |
| P / Esc | Pause |
| R | Restart run |
| M | Mute |

On touch devices, on-screen buttons appear automatically.

## Gameplay

- The mountain is **endless and procedural** — terrain, forests, rocks, kicker
  ramps and coin lines are generated deterministically per chunk as you descend.
- **Score** = distance + coins (25 each) + trick points.
- Hit the **orange kickers** for big air; spin with ◀ ▶ and grab with ▼.
  Land within 40° of straight for a **clean** trick, or eat a sketchy landing.
- You have **3 hearts**. Trees and rocks cost one each. Wipe out three times
  and the run is over. Best score is stored locally.

## Tech notes

- Plain JavaScript + [three.js](https://threejs.org) (r147, vendored — works offline and from `file://`).
- The terrain height field is analytic, so physics and rendering share the exact
  same surface: no raycasts needed for ground collision. The Caverns level adds
  an analytic *ceiling* field for the caves (and head-bonk collision).
- Trees, rocks, ice spires, stalactites and crystals are `InstancedMesh`es per
  chunk; chunks are created ahead of the rider and disposed behind.
- Textures (snow, ice, banded rock) are generated procedurally on canvas — no
  image assets. PBR materials + ACES tone mapping; fog and lighting blend
  dynamically as you ride into and out of caves.
- All sound effects are synthesized live with WebAudio — no audio assets.

## Files

```
index.html    — page shell, HUD, overlays, level select, styles
js/util.js    — math helpers, seeded RNG, value noise, texture generator
js/levels.js  — level definitions (terrain, atmosphere, physics params)
js/audio.js   — WebAudio synthesized SFX
js/world.js   — terrain chunks, caverns, obstacles, ramps, coins
js/player.js  — rider model, physics, tricks, collisions
js/main.js    — game loop, camera, particles, input, HUD
lib/three.min.js — vendored three.js r147
```
