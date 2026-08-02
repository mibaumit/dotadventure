# DotAdventure

A top-down 2D squad-tactics game. You control **1..N dots** (circles in your color).
One dot is *selected* and driven manually with **WASD**; the rest **hold formation**
and follow squad **orders** (follow / defend / move / attack-my-target). Each dot
equips a **weapon** (sword, sword & shield, bow, …) that changes how it attacks.
Levels are **procedurally generated**, and the design is built to grow — new weapons,
enemies, tiles, and orders should slot in without rewrites.

Long-term goal: **ship on Steam** (prototype in the browser now; wrap with
Tauri/Electron later — keep the code wrapper-friendly).

## Design decisions (locked)

- **Start with 1 dot.** Grow the squad by recruiting neutral ally dots found in levels
  (walk into one to add it). A debug key spawns allies for quick testing.
- **Permadeath (roguelike).** A dead dot is gone for the whole run. Lose them all →
  game over → restart from depth 1. Survivors carry to the next level.
- **Hybrid combat.** Dots auto-attack enemies in weapon range; **Space** triggers a
  weapon-specific *special* aimed at the mouse; clicking an enemy force-focuses the squad.
- **Swap weapons anytime.** **X** cycles the selected dot's weapon (for testing/loadout).

---

## Tech stack

- **Engine:** [Phaser 4](https://phaser.io) (v4.1.0), loaded from CDN — **no build step**.
- **Language:** plain JavaScript, **ES modules** (`import`/`export`).
- **Physics:** Phaser Arcade physics (circle bodies, static wall colliders).
- **Dev server:** any static server. Python is preinstalled here:
  ```
  cd E:\workspace\DotAdventure
  python -m http.server 8080
  ```
  Then open http://localhost:8080 . (A local server is required because ES modules
  don't load over `file://`.)

---

## Directory structure

```
DotAdventure/
├─ index.html              # loads Phaser (CDN) + src/main.js
├─ CLAUDE.md               # this file
├─ README.md              # player-facing: how to run + controls
├─ .claude/launch.json    # dev-server config for the preview tool
└─ src/
   ├─ main.js             # Phaser game config + boot (entry point)
   ├─ config.js           # ALL tunable numbers & colors (single source of truth)
   ├─ util.js             # tiny helpers: vectors, math, seeded RNG
   ├─ weapons.js          # WEAPON REGISTRY — data-driven, extensible
   ├─ levelgen.js         # procedural dungeon generator → grid + rooms
   ├─ entities/
   │  ├─ Unit.js          # player dot (selectable, order-driven)
   │  ├─ Enemy.js         # enemy dot (simple AI)
   │  └─ Projectile.js    # arrows / bolts
   └─ scenes/
      └─ GameScene.js     # orchestrates input, squad, combat, rendering
```

---

## Core concepts

- **Unit** — a player dot. Has `hp`, a `weapon`, and an order it obeys when not selected.
- **Squad** — the set of Units. Exactly one is *selected* (moved with WASD, camera-followed).
- **Order** — what non-selected units do: `FOLLOW` (formation behind leader), `HOLD`
  (guard current spot), `MOVE` (go to a clicked point), `ATTACK` (focus a clicked enemy).
  Orders live in `config.js → ORDER`.
- **Weapon** — a plain data object in the **weapon registry** (`weapons.js`) describing
  `range`, `cooldown`, `damage`, `kind` (`melee`/`ranged`), and an `attack()` behavior.
- **Formation** — non-selected units target computed slots behind the leader.
- **Level** — a tile grid (`0` = wall, `1` = floor) plus a list of rooms, from `levelgen.js`.

---

## Coding conventions (keep it clean)

1. **No magic numbers.** Every tunable lives in `config.js`. Reference it, don't inline.
2. **Data-driven extension points.** Adding content = adding a data entry, not editing
   `switch` statements everywhere:
   - New weapon → add one object to the registry in `weapons.js`.
   - New enemy type → a config entry + (if needed) a subclass in `entities/`.
   - New tile → extend the tile table used by `levelgen.js` / rendering.
3. **Small, single-purpose functions.** A function does one thing; name says what.
   Prefer pure helpers (input → output, no side effects) in `util.js`.
4. **Entities are classes** (extend Phaser sprites); **systems are functions/modules**
   that operate on them. Keep rendering, input, and simulation logic separated.
5. **Comment the "why", not the "what".** The code says what; comments explain intent.
6. **One responsibility per file.** If a file grows two jobs, split it.

---

## How to extend (common tasks)

- **Add a weapon:** open `src/weapons.js`, copy an existing entry, tweak `range`,
  `cooldown`, `damage`, `kind`, and (for ranged) `projectileSpeed`. Assign its id to a
  Unit on creation. Done — no other file needs to change.
- **Add an enemy:** add stats to `config.js`, spawn it in the generator/scene, optionally
  subclass `Enemy` for custom AI.
- **Change level shape:** edit `src/levelgen.js` (room count/size, corridors, future:
  BSP, caves, boss rooms).
- **Add an order:** add a constant to `ORDER` in `config.js` and handle it where squad
  targets are computed in `GameScene.js`.

---

## Controls

Implemented now:
- **WASD** — move the dot
- **Esc** — pause menu (Continue game / Restart game)
- Combat is automatic: the dot punches enemies it **faces** and that are in range
- Reach the **▼ staircase** to descend to the next (deeper, harder) level

Planned (see roadmap): **Tab/1–9** switch dot, **left/right-click** orders,
**E/Q** follow/hold, **Space** mouse-aimed special, **X** swap weapon.

---

## Roadmap / not-yet-done

- Pathfinding for squad movement around walls (A* — `easystar.js`) — currently direct steering.
- More weapons, enemy types, tile types, and orders.
- Level progression, loot/equipment, boss rooms.
- Audio, particles, menus.
- Steam packaging (Tauri/Electron) + Steamworks (achievements, cloud saves).
