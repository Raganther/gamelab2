# 🌻 Heliotrope — a garden puzzle

**You are the sun. Every step you take, every vine in the garden grows one
step toward you.**

You never touch anything — you only shine. Vines are drawn to wherever you
stand: lead each one into its bloom ring and the garden flowers. That single
rule unfolds into everything else:

- **Water** — you cannot cross it, but vines float over it as lily pads,
  and a vine lying on water is a bridge you can walk on.
- **Land** — a vine on land is a hedge that blocks your way. The garden
  loves you enough to trap you.
- **Colour** — a bloom ring only opens for its own vine; to every other
  vine it is a wall (which you can use).
- **Waiting** is a move. The garden keeps growing.
- **Thorn brambles** seek you too — they never bloom, they only block.
  They doze until their target comes within 4 cells.
- **Stone lanterns** outshine you: a vine tip within 3 cells of a lantern
  (and closer to it than to you) grows toward the lantern instead. A vine
  parked at a lantern is parked forever — trap brambles there, or use the
  pull to lead vines where the sun can never stand.

Fifteen hand-built levels, each **machine-verified solvable** — `tools/solve.js`
breadth-first-searches the real game engine and stamps every level's `par`
(and its `solution`, used by the in-game ✨ Solve button) with the true
optimal line.

## Play

Open `index.html` in a browser, or serve the folder statically. No build, no
dependencies.

| Key | Action |
| --- | --- |
| Arrows / WASD | Step (the garden grows) |
| Space | Wait (it still grows) |
| Z | Undo |
| R | Restart level |
| N / P | Next / previous unlocked level |
| M | Mute |

The **✨ Solve** button replays the solver's optimal line so you can watch the
level solve itself — watching earns no progress; the win is yours to earn.

Touch: swipe to step, tap to wait.

## Verify the levels

```sh
node tools/solve.js        # solves all levels, prints optimal solutions
```

## Files

```
index.html     — page shell, HUD, overlays
js/engine.js   — pure rules (runs in browser AND Node — same code the solver uses)
js/levels.js   — level maps with solver-verified pars
js/render.js   — canvas renderer: dusk garden, lily pads, blooms, particles
js/audio.js    — synthesized WebAudio SFX
js/main.js     — controller: input, undo, progress, overlays
tools/solve.js — BFS solver / level verifier
```
