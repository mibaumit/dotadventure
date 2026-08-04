# World

## Level generation ✅ (`levelgen.js`)

- Grid of `GAME.tilesW × GAME.tilesH` = **48 × 32** tiles, `TILE = 40` px each
  (world = 1920 × 1280 px). Tiles are `0 = wall`, `1 = floor`.
- **Rooms:** `5 + depth` rooms attempted, non-overlapping (1-tile gap). Deeper
  levels have more rooms. **Mixed sizes:** ~⅓ of rooms are **big halls**
  (**11–16 × 8–12** tiles), the rest are modest boxes (**5–9 × 4–8**), so a level
  has some large open spaces instead of all cramped rooms.
- **Corridors:** consecutive room centers connected by **L-shaped, 2-tile-wide**
  tunnels, so the whole dungeon is traversable.
- **Deterministic:** seeded RNG (`seed + depth × 1013`) → a given depth/seed
  always produces the same layout.
- Walls are rendered + collided as **greedy-merged horizontal strips** (few
  static bodies instead of one per tile).

## Start & exit ✅

- **Start point** = center of room 0. The player spawns here (unless arriving by
  the up-stairs — see below).
- **Exit** = the room whose center is **farthest** from the start. A **▼
  down-staircase** is drawn there; on levels below the first an **▲
  up-staircase** is drawn at the start.
- **Both staircases are safe zones:** enemies are **excluded within
  `aggroRange + 80` (≈420 px)** of *either* the start **and** the exit, so you
  never arrive into an ambush from either direction.

## Descend & ascend ✅

- Walking onto the **▼ down-staircase** **descends** to `depth + 1`, spawning you
  at the new level's up-stairs. Enemy count and level scale with depth.
- On levels below the first, walking onto the **▲ up-staircase** **ascends** to
  `depth − 1`, spawning you at that level's **down-stairs**.
- **Armed trigger:** a staircase only fires once you've clearly stepped **off**
  it (hysteresis: arms past ~`TILE × 1.5`, triggers within ~`TILE × 0.55`), so
  arriving *on* a staircase never instantly bounces you back.
- **Re-entering a level regenerates it** (deterministic per depth+seed), so
  **enemies respawn** — but a **chest already opened stays looted** (the run
  tracks opened-chest depths). Levels are otherwise **not persistent**.

## Fog of war ✅

WarCraft-2 style, computed on a fine sub-tile grid (`GAME.fogCell = 16` px) for
a smooth, round reveal:

- **Three states per fog cell:** *visible* (clear), *explored* (seen before →
  dim, 55% black), *unexplored* (solid black).
- **Vision:** a `GAME.visionTiles = 5`-tile (200 px) radius around the dot,
  **raycast (160 rays)** so walls block sight. A wall the ray hits is revealed
  as a **full 40-px block** (so walls don't look thin at the finer resolution).
- The **entire starting room** is revealed up front.
- Fogged areas hide enemies (the fog layer draws above entities). The fog
  recomputes whenever the dot crosses a fog cell (smooth updates).

## Training Room ✅ (sandbox)

Launched from the **main menu** ("Training Room" button) instead of a normal run
(`GameScene` started with `{ training: true }`). A place to try every enemy and
item without the dungeon in the way:

- **Open arena:** one big room, floor everywhere, walls only on the outer border
  (`makeTrainingLevel`). The **whole map is revealed — no fog**.
- **One of every enemy** (melee square, dart, caster), placed across the room.
  **Killed enemies respawn** after `TRAINING.respawnMs` (5 s) at their spot, so
  you can keep practising.
- **A boss chamber** — a walled-off room (top-right) with a doorway — holds **The
  Warden**. It stays dormant (no bar, no music) until you walk in to fight it, and
  respawns after death like the others. One chamber per boss (just the Warden now).
- **A chest for every item** — a column of chests near the start, each **forced**
  to hold one specific item (`chest.forcedItem`), so you can grab any loadout.
- The player starts with the **same HP as a normal run** (10). A down-staircase in
  a corner still lets you leave.

## Boss rooms ✅ (every 5th depth)

Every depth divisible by 5 (5, 10, 15…) is a **boss room** instead of a normal
dungeon (`GameScene.isBoss`):

- **Open arena** (`makeBossLevel`) — one big room, **no fog**, no regular spawns.
  The player enters at the bottom; **The Warden** (see [entities.md](entities.md))
  waits in the centre and engages immediately, with **boss music**.
- **The down-staircase is sealed** until the boss dies (`bossDefeated`); on the
  kill the boss drops a **reward chest** (from the depth item pool) and the way
  down opens. Boss HP scales with the boss tier.
