# ⚖️ Counterweight — a balance puzzle

**The whole board is a stone plate balanced on a single point. Gravity is
never chosen — it is computed.**

Every stone (weight 3), every gem (weight 1), and *you* (weight 1) are on the
scales. After every step, the torque of everything on the plate is summed;
lean a side too heavily and the plate tilts — and everything loose pours
downhill, sweep after sweep, until it settles. Sokoban pushes, global
consequences.

- **Pour** — overload a side on purpose and let the cascade carry a gem
  across the board into its socket.
- **Catch** — your granite feet never slide, and your body blocks sliding
  pieces. Stand downhill and be the wall.
- **Stance tax** — pushing a piece means standing behind it, and standing
  there is weight too. Every plan must budget for where *you* are.
- **Jettison** — a stone dropped through a gap leaves the scales forever,
  and plugs the hole into walkable floor. A gem dropped into the void is
  simply lost.
- The **spirit level** in the corner shows the live torque; the bubble
  drifts to the high side and turns red near the tipping point.

Eight hand-built levels, each **machine-verified solvable** — `tools/solve.js`
breadth-first-searches the real game engine and stamps every level's `par`
(and its `solution`, used by the in-game ✨ Solve button) with the true
optimal line.

## Play

Open `index.html` in a browser, or serve the folder statically. No build, no
dependencies.

| Key | Action |
| --- | --- |
| Arrows / WASD | Step or push (then the plate settles) |
| Z | Undo |
| R | Restart level |
| N / P | Next / previous unlocked level |
| M | Mute |

Touch: swipe to step. The **✨ Solve** button replays the optimal line —
watching earns no progress.

## Verify the levels

```sh
node tools/solve.js        # solves all levels, prints optimal solutions
```

## Files

```
index.html     — page shell, HUD, overlays
js/engine.js   — pure rules: torque, tilt cascades, plugs (browser AND Node)
js/levels.js   — level maps with solver-verified pars and solutions
js/render.js   — canvas renderer: starfield, leaning plate, spirit level
js/audio.js    — synthesized WebAudio SFX (stone, brass, void)
js/main.js     — controller: input, undo, progress, Solve autoplay
tools/solve.js — BFS solver / level verifier
```
