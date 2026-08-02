# Planned / Missing Features

Requested or intended, not yet built. Ordered roughly by how the user has
prioritized them.

## Item systems (next up)

### ⬜ Bow (level-1 chest item)
- Found in the depth-1 chest. On pickup it **equips** as the player's weapon
  (replaces fists) and starts with **10 arrows** (ammo).
- The bow is **shown on the dot** when equipped.
- A **target cross / reticle** is drawn on the **closest enemy in range** — the
  one it will fire at.
- Fires **arrow projectiles** (needs a `Projectile` entity + `spawnProjectile`;
  an `arrow` texture already exists). Arrow lands damage on the first enemy hit;
  blocked/destroyed by walls.
- **Arrows refill** from kill-drops (see red-square loot below).
- Registry entry `weapons.bow` already exists (range 300, cooldown 900, dmg 15,
  projectileSpeed 440) — not yet wired to the player or ammo.

### ⬜ Shield (level-1 chest item)
- Found in the depth-1 chest. **Blocks one enemy attack every 3 seconds.**
- Blocking plays a **"plomp"** sound.
- Needs a per-player cooldown timer + a block check in `damagePlayer`, plus a
  small shield visual.

### ⬜ Item charges / ammo model
- Items hold a resource instead of a simple stack count:
  - **Health Potion** → stored HP; drinking pours stored HP into the player.
  - **Spells (Bomb, Frozen Orb)** → ammo; a use spends 1.
  - **Bow** → arrows.
- (Current build uses a simple `count` stack; this is the intended richer model.)

### ⬜ Red-square kill-loot that refills items
- On kill, enemies drop **little red squares** on the ground that the player
  **collects** to refill held items:
  - if holding the **Health Potion** → **+0–5 HP** to it,
  - if holding a **spell/bow** → **ammo / arrows**.
- (Today only the Scroll of Frozen Orb drops, as a full pickup — not a
  refill-square.)

### ⬜ More items/spells
- Additional scrolls/potions/spells beyond potion + bomb + frozen orb.

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
- Chest loot beyond depth 1 is a single random existing item.
- Descending/ascending regenerates a level (enemies respawn); levels aren't
  persistent.
