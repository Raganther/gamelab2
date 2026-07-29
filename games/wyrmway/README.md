# 🐉 Wyrmway — you are the bridge

A one-control arcade game. The pilgrims of the floating islands walk at dawn —
straight off the edge, without looking, because they believe the sky-serpent
will be there. **You are the serpent.**

## Play

No build step. Open `index.html`, or serve the repo root and visit
`games/wyrmway/`.

## Controls

One. Move the pointer (or your finger) and the serpent's head follows; the
long body follows the path the head has travelled — you *draw* the serpent
across the sky. That's the whole interface.

- **Lay a bridge** — drag the head across the gap and your body spans it.
  Pilgrims clamber onto your back and march over.
- **Catch the fallen** — anyone who slips tumbles toward the cloud sea below.
  Sweep your body under them to catch them mid-air (+5).
- **Mind the wind** — from wave 3, gusts shove your body off its line.
- **Mind the slope** — pilgrims slow on steep scales and slide off anything
  steeper. Momentum is real: whip your body and you'll fling your passengers.

Each pilgrim delivered to the shrine gate is **+10**, growing with a streak
bonus. Three pilgrims lost to the clouds and the flight is over. Waves widen
the gap, quicken the pilgrims, and wake the wind. Best score is kept locally.

## Design notes

The serpent is a **trail-following body** (a dragon streamer): the head lays
down a path as it moves, and each body segment homes to a point a fixed arc
length back along that path. That's what makes bridge-laying feel like
*drawing* — and it means a laid bridge genuinely holds, because the body has
a shape of its own. On top of that sits a soft verlet layer: weak gravity,
wind shove, spring-back, neighbour cohesion, and resting contact with island
tops, so the body still wobbles, sags, and gets shoved like a living thing.

Pilgrims are tiny walkers with one rule — *always toward the shrine* — plus
support detection (island ground or the serpent's topmost arc), slope logic,
and ballistic falls with a mid-air catch window.

## Files

```
index.html     — page shell, HUD, overlays, styles
js/serpent.js  — trail-following body + soft physics + island rest
js/world.js    — islands, pilgrims (walk/fall/catch/deliver), wave layouts
js/audio.js    — synthesized wind loop, chimes, horns (no assets)
js/main.js     — game loop, painterly dawn renderer, waves, scoring, input
```

No dependencies, no assets — every visual is canvas-drawn and every sound is
synthesized live.
