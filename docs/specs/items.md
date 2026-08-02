# Items & Action Bar

## Action bar ✅

- A **WoW-style bar of 9 slots**, bottom-center. Each slot shows its item icon,
  stack count, and key number (1–9). Press **1–9** to use the item in that slot.
- Items **stack by id**; the bar holds up to 9 distinct items.
- Picking up an item floats its **name** center-screen (e.g. "Scroll of Frozen
  Orb").
- The bar's contents **carry across descents**.

## Item / spell registry ✅ (`items.js`)

Each item is `{ id, name, shape, color, use(scene) }`. `use` returns whether it
was consumed. Current items:

| Item | Icon | Effect |
|---|---|---|
| **Health Potion** | green diamond | Heal **5 HP** (no effect at full HP → not consumed) |
| **Bomb** | orange circle | AoE **3 damage** to enemies within **120 px**, blast ring |
| **Scroll of Frozen Orb** | blue parchment scroll | AoE **2 damage** to enemies within **150 px**, blast ring |

Area items show an expanding **blast ring** (`blastEffect`).

## Sources of items ✅

- **Chest** — exactly **one per level**, in a random **non-start** room. This is
  the *only* place items are found (no floor scatter). Touching it opens it
  (greys out) and pops its contents out as pickups the dot collects.
  - **Depth 1 chest:** fixed starter loadout — **Health Potion + Scroll of
    Frozen Orb**.
  - **Deeper chests:** one random item.
- **Monster drops** — enemies have an **18% chance** to drop a **Scroll of
  Frozen Orb** on death (a pickup on the ground). 🟡 *only the scroll drops for
  now; general refill-drops are planned.*

## Pickups ✅

- A pickup is a floating (bobbing) sprite on the ground. Overlapping it collects
  it into the action bar and announces the name. If the bar is full it's left on
  the ground.

---

See [planned.md](planned.md) for the **bow**, **shield**, item **charges/ammo**,
and **red-square kill-loot** that refills held items — all requested but not yet
built.
