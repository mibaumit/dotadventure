# World

## Level generation ✅ (`levelgen.js`)

- Grid of `GAME.tilesW × GAME.tilesH` = **48 × 32** tiles, `TILE = 40` px each
  (world = 1920 × 1280 px). Tiles are `0 = wall`, `1 = floor`.
- **Rooms:** `5 + depth` rooms attempted, random size **5–9 × 4–8** tiles,
  non-overlapping (1-tile gap). Deeper levels have more rooms.
- **Corridors:** consecutive room centers connected by **L-shaped, 2-tile-wide**
  tunnels, so the whole dungeon is traversable.
- **Deterministic:** seeded RNG (`seed + depth × 1013`) → a given depth/seed
  always produces the same layout.
- Walls are rendered + collided as **greedy-merged horizontal strips** (few
  static bodies instead of one per tile).

## Start & exit ✅

- **Start point** = center of room 0. The player spawns here, and enemies are
  **excluded within `aggroRange + 80` (≈420 px)** of it, so the spawn is always
  safe.
- **Exit** = the room whose center is **farthest** from the start. A **▼
  down-staircase** is drawn there.
- Walking onto the staircase **descends** to `depth + 1` (see run rules in
  [gameplay.md](gameplay.md)). Enemy count and level scale with depth.

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
