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
- **Dev server:** `serve.py` — a tiny **no-cache** threading static server, so
  edits are never served stale (plain caching can serve an old `config.js`):
  ```
  cd E:\workspace\DotAdventure
  python serve.py            # → http://localhost:8080
  ```
  Any static server works (e.g. `python -m http.server 8080`), but may cache
  modules between edits. A local server is required because ES modules don't
  load over `file://`.
- **Audio:** synthesized at runtime via the Web Audio API (`src/sound.js`) — no
  asset files. Starts on the first click/keypress (browser autoplay policy).

---

## Directory structure

```
DotAdventure/
├─ index.html              # loads Phaser (CDN) + src/main.js
├─ CLAUDE.md               # this file
├─ README.md              # player-facing: how to run + controls
├─ serve.py                # no-cache dev server (python serve.py → :8080)
├─ docs/specs/             # FEATURE SPECS — keep in sync with the code (see below)
├─ .claude/launch.json    # dev-server config for the preview tool
└─ src/
   ├─ items.js            # item/spell registry (potion, bomb, frozen-orb scroll)
   ├─ shapes.js           # runtime shape→texture baking
   ├─ sound.js            # procedural audio (music + SFX)
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

## Starting a new feature — plan & clarify first (IMPORTANT)

Before implementing any new feature, **write a short plan and confirm it with
the user — do NOT auto-decide core functionality.**

1. **Draft a brief plan:** what the feature does, how it fits existing systems,
   the key mechanics/numbers, UI/controls, and edge cases.
2. **Ask the user** about anything unclear or design-defining — especially
   *core* behavior (how it plays, what the numbers are, how it interacts with
   other systems). List concrete options and a recommendation rather than
   silently picking one.
3. **Only start building once the design is clear.** Pick sensible defaults only
   for genuinely minor details, and say which defaults you chose.
4. Then implement incrementally, verify it **renders/plays**, and update the
   spec (below).

Rule of thumb: if a choice would change how the feature *plays* or is hard to
reverse, ask — don't assume.

## Specs — keep them in sync with the code (IMPORTANT)

The feature specification lives in **`docs/specs/`** (see
[`docs/specs/README.md`](docs/specs/README.md)):

- `gameplay.md`, `world.md`, `entities.md`, `items.md`, `presentation.md` —
  what's **built**, with the real numbers.
- `planned.md` — what's **requested but not yet built**.

**Whenever you create or change a feature, update the matching spec in the same
change** — add/adjust the relevant section, move items from `planned.md` to the
implemented docs as they ship, and keep numbers accurate to `config.js`. Treat
the spec as part of "done": a feature isn't finished until its spec reflects it.
The specs describe *behavior*; `config.js` remains the single source of truth
for exact values (specs reference them, don't duplicate the authority).

**Documenting a feature is mandatory, not optional.** Every shipped change must
leave the docs describing the game as it now plays:

- Pick the right file — `gameplay.md` (controls/combat/progression/run rules),
  `world.md` (levels/fog/stairs), `entities.md` (dot/enemies), `items.md`
  (bar/items/equipment), `presentation.md` (HUD/audio/visuals) — and update
  every file the change touches (a HUD tweak to a combat feature usually hits
  two).
- Remove or reword anything the change made false; don't just append.
- Move the entry out of `planned.md` when it ships; add newly-requested-but-
  unbuilt ideas into `planned.md`.
- If you finish code but run low on context, update the specs **before** wrapping
  up — an undocumented feature is unfinished work, and reviewers read the spec.

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
- **WASD** — move the dot directly
- **Left-click** — ground: walk there · an enemy: chase it and auto-attack it
- **Space** — tactical **time-freeze** (simulation halts, but you can still issue
  order-clicks); a play/pause indicator + game timer sit in the bottom-right
- **Esc** — pause menu (Continue game / Restart game)
- Combat is automatic: the dot punches enemies it **faces** and that are in range
  (a landed fist **staggers** the enemy — brief slow + knockback)
- Reach the **▼ staircase** to descend; on levels below the first, the **▲
  staircase** climbs back up (enemies respawn; already-looted chests do not)
- On death: **Enter** (or click the button) to restart the run

Planned (see roadmap): **Tab/1–9** switch dot, order keys for the squad,
mouse-aimed special, **X** swap weapon.

---

## Roadmap / not-yet-done

- Pathfinding for squad movement around walls (A* — `easystar.js`) — currently direct steering.
- More weapons, enemy types, tile types, and orders.
- Level progression, loot/equipment, boss rooms.
- Audio, particles, menus.
- Steam packaging (Tauri/Electron) + Steamworks (achievements, cloud saves).
