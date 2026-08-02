# DotAdventure — Feature Specs

Living specification of the game as built. Numbers are the current tunables in
[`src/config.js`](../../src/config.js); change them there, not here.

> Status legend: ✅ implemented · 🟡 partial · ⬜ planned (see [planned.md](planned.md))

## What the game is

A top-down 2D dungeon crawler. You control a **dot** (a circle in your colour)
that fights through procedurally generated, fog-shrouded levels, descending ever
deeper. Combat is largely automatic (you position; the dot punches what it
faces); items and spells come from chests and go on a WoW-style action bar.

Long-term vision: control **1..N dots as a squad** with formations and orders
(only 1 dot exists today — see [planned.md](planned.md)). Ship target: **Steam**
(prototype in browser now, wrap later).

## Tech stack

| | |
|---|---|
| Engine | **Phaser 4.1.0**, loaded from CDN — no build step |
| Language | plain JavaScript, ES modules |
| Physics | Phaser Arcade (circle/rect bodies, static wall colliders) |
| Audio | **procedural** via Web Audio API (`src/sound.js`) — no asset files |
| Dev server | `python serve.py` — a no-cache threading static server on :8080 |
| Repo | https://github.com/mibaumit/dotadventure |

## Spec index

- [gameplay.md](gameplay.md) — controls, movement, combat, progression, run rules, time-freeze
- [world.md](world.md) — level generation, fog of war, stairs / descent
- [entities.md](entities.md) — the player dot, enemies (AI, sight cones, corpses)
- [items.md](items.md) — action bar, items/spells, chests, pickups & drops
- [presentation.md](presentation.md) — HUD, pause menu, audio, visual details
- [planned.md](planned.md) — features requested but not yet built

## Source map

```
src/
├─ main.js          Phaser config + boot
├─ config.js        all tunables (numbers/colours)
├─ util.js          vectors, seeded RNG, math
├─ weapons.js       weapon registry (fists, sword, bow, …)
├─ items.js         item/spell registry (potion, bomb, frost-scroll)
├─ shapes.js        runtime shape→texture baking
├─ levelgen.js      procedural dungeon generator
├─ sound.js         procedural audio (music + SFX)
├─ entities/
│  ├─ Enemy.js      enemy dot (AI-driven by the scene)
│  └─ … (Unit/Projectile planned)
└─ scenes/
   ├─ GameScene.js  gameplay: input, combat, fog, items, rendering
   └─ PauseScene.js Esc overlay (volume sliders, continue/restart)
```
