# 🎼 Chimework — a music-box machine puzzle

**You never touch the marble. You pin the song.**

A clockwork music box in real 3D: a brass drum turns one beat at a time, and
every pin you place fires its mechanism when it passes the read arm — and
fires **again every revolution**, because the drum always comes back around.
That is the whole game: programming time itself.

- **Hammers** strike only on their exact beat. If the marble is sitting on
  the hammer rail at that moment, it is launched across the gap. A beat
  early or late, and it strikes empty air.
- **Switches** flip and *stay* flipped — until the drum returns and your own
  pin flips them back. A pin that saves the marble on the first pass can
  doom it on the second.
- **Axles** tie two switches to one row. One pin, placed so its two firings
  land a revolution apart, can set both switches correctly — the drum does
  the second flip for you.
- The song lasts a fixed number of revolutions. Cup or nothing.

Each mechanism is a note: placing pins composes a little tune, and a
winning machine literally plays its own song.

Six levels, each **machine-verified** — `tools/solve.js` tries every pin
placement against the real engine and bakes the true minimum pin count
(and the solution the in-game ✨ Solve button replays).

## Play

Open `index.html` in a browser (uses the vendored three.js from `../../lib/`),
or serve the repo statically. Tap sockets on the pin roll, press **Play**,
watch the box run. Drag the scene to look around. Fewer pins, sweeter song.

## Verify the levels

```sh
node tools/solve.js        # exhaustively solves all levels
```

## Files

```
index.html     — page shell, pin roll UI, overlays
js/engine.js   — pure simulation (browser AND Node — same code the solver runs)
js/levels.js   — track graphs with solver-baked pars and solutions
js/scene.js    — three.js music box: drum, twin rails, mallets, marble
js/audio.js    — synthesized music-box tines
js/main.js     — controller: pin roll, play loop, progress
tools/solve.js — exhaustive solver / level verifier
```
