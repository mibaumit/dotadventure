# Planned / Missing Features

Requested or intended, not yet built. Ordered roughly by how the user has
prioritized them.

## Item systems — shipped ✅

The item overhaul is built (see [items.md](items.md) for the full detail):

- **Item resource model** — items carry a resource, not a plain stack: the
  **Potion** is an HP **reservoir**, the **Frozen Orb** costs **mana**, the
  **Bomb** is on a 20 s **cooldown** — none are consumed on use.
- **Resource pixels** — kills drop **red (HP) / blue (mana) / green (arrow)**
  pixels that refill the matching held item.
- **Bow** — a chest `weapon` item: equips as the dot's weapon, **10 arrows**,
  crosshair reticle, fires **arrow projectiles** (new `entities/Projectile.js`),
  refills from green pixels, falls back to fists when empty.
- **Shield** — a chest `shield` item: fully **blocks one hit every 3 s** with a
  **"plomp"**; on-dot arc dims while recharging.

### ⬜ More items/spells (still open)
- Additional scrolls/potions/spells beyond potion + bomb + frozen orb + bow +
  shield.
- Idea: a mana **reservoir**-style item, or more mana-cost spells.

## The squad (the signature pillar)

### ⬜ Multiple dots & recruiting
- Start with **1 dot**; recruit **neutral ally dots** found in levels (walk into
  one to add it). Config hooks exist (`GAME.recruitsPerLevel`).
- **Tab / 1–9** to switch the selected dot (note: 1–9 currently used by the
  action bar — will need reconciling).

### ⬜ Formation & orders
- Non-selected dots **hold formation** behind the selected leader and obey
  **Follow / Hold / Move / Attack-my-target** orders (`config.ORDER`,
  `config.FORMATION` scaffolding exists).

## Systems & polish

- ⬜ **Pathfinding** (A*, e.g. `easystar.js`) so click-to-move routes *around*
  walls instead of stopping.
- ⬜ **Up-staircase + depth text** — ascend to the previous level; the current
  depth was to be shown at the stairs (HUD already shows `Depth N`).
- ⬜ **Weapon swap key (X)** to cycle the selected dot's weapon.
- ⬜ **Mouse-aimed special attacks** — weapon `special()` behaviors exist but no
  key is bound (Space became time-freeze).
- ⬜ **More enemy types** (triangles/diamonds — shapes ready), **new tiles**,
  **boss rooms**.
- ⬜ **Steam packaging** (Tauri/Electron wrapper) + Steamworks (achievements,
  cloud saves).

## Known limitations

- Only **1 dot** exists (squad not built).
- Each chest drops **one** item, rolled from the depth's pool; only the level-1
  pool (depths 1–5) is defined so far, so deeper chests reuse it.
- Descending/ascending regenerates a level (enemies respawn); levels aren't
  persistent.
