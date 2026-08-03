# Items & Action Bar

## Action bar ✅

- A **WoW-style bar of 9 slots**, bottom-center. Each slot shows its item icon,
  stack count, and key number (1–9). Press **1–9** to use the item in that slot.
- Items **stack by id**; the bar holds up to 9 distinct items.
- Picking up an item floats its **name** center-screen (e.g. "Scroll of Frozen
  Orb").
- The bar's contents **carry across descents**.

## Item / spell registry ✅ (`items.js`)

Each item is `{ id, name, shape, color, kind, use(scene, slot) }`. `use` returns
`true` only if the item was **consumed** (spends a stack); reusable items return
`false`. An item's `kind` decides how it behaves:

| Kind | Meaning |
|---|---|
| `consumable` | a simple stack; each use spends one (shows a stack count) |
| `reservoir` | never consumed; holds a resource on its slot (`slot.charge`) up to `capacity`, refilled by pixel drops |
| `mana` | never consumed; each use spends the player's shared **mana** (`manaCost`), refilled by blue pixel drops |
| `cooldown` | never consumed; usable again only after `cooldownMs` (per-slot recharge) |
| `weapon` | equipment; on pickup it **becomes the dot's weapon** (bypasses the bar) |
| `shield` | equipment; on pickup it **grants a blocking off-hand** (bypasses the bar) |

Current items:

| Item | Kind | Icon | Effect |
|---|---|---|---|
| **Health Potion** | reservoir | green diamond | Pours its stored HP into the dot (up to full). **Never used up** — it refills from red pixels (see below). Capacity & refill in `config.POTION`. |
| **Bomb** | cooldown | black bomb + fuse | **Drops a timed bomb** where you stand; it pulses for **`BOMB.fuse` (2 s)** then **explodes** (AoE **`BOMB.damage`** within **`BOMB.radius`**, blast ring + boom). **`BOMB.cooldown` (3 s)** cooldown; **you can have several live at once**. **Rollable** — run into a dropped bomb to shove it like a bowling ball: it's a physics body with drag (`BOMB.drag`), a wall/bomb **bounce** (`BOMB.bounce`), and a speed cap (`BOMB.maxSpeed`); the harder you run in, the faster it rolls (`BOMB.push × your closing speed`), then it coasts to a stop. Not consumed. |
| **Scroll of Frozen Orb** | mana | blue parchment scroll | Cast (howling-ice-storm sound) for an AoE **`FROST.damage`** within **`FROST.radius`**, plus a **chill** — hit enemies move at **`FROST.slowMultiplier` (50%)** for **`FROST.slowDuration` (2 s)** and tint frosty. Costs **mana** (`MANA.frostCost`) **+ a 2 s cooldown** (`FROST.cooldown`); does nothing if you can't afford it. |
| **Bow** | weapon | cyan bow | Equips as the dot's weapon; fires arrows (see below). Found in a chest. |
| **Shield** | shield | light-blue shield | Grants a blocking off-hand (see below). Found in a chest. |

Area items show an expanding **blast ring** (`blastEffect`).

### Action-bar feedback (icon opacity + label)

- A **reservoir** item's icon opacity tracks its fill (near-empty faint, full
  solid), **plus a little vertical fill gauge** on the slot's right edge — so the
  **Health Potion** both fades and shows a gauge as you drink it / refill it.
- A **mana** item's icon **dims** while you don't have enough mana to cast it.
- **Any item on cooldown** (the bomb, and the frost scroll's 2 s) **dims and
  shows its seconds-remaining** while recharging.

## Equipment: Bow & Shield ✅

Both are found in chests and **equip on pickup** (they don't take a bar slot);
they **carry across descents** and show on the dot.

- **Bow** (`weapon`) — becomes the dot's weapon (`weapons.bow`). **Unlimited
  arrows**, **damage = fists (1)**, and a **2 s cooldown** shown as a white
  loading bar under the dot. Held in **both hands** with an animated
  **string/hand draw & release** on each shot ("fffft" on loose, the usual
  impact sound on hit). Only auto-targets enemies that are **on-screen and out
  of the fog** (`BOW.` — max range = **line of sight**, `GAME.visionTiles`), and
  a **crosshair reticle** marks the target. Foes closer than `BOW.minRange`
  (90 px) are **punched with fists** instead — and while a foe is inside that
  range, a **translucent red dead-zone ring** is drawn around the dot to show the
  gap you need to keep for the bow to fire.
- **Shield** (`shield`) — **fully blocks one incoming hit**, then recharges over
  `SHIELD.blockCooldown` (3 s) before it can block again. A block plays a
  **"plomp"**, the on-dot shield arc **dims while recharging**, and a **blue
  recharge bar** shows under the dot (like the bow's reload bar). Works alongside
  any weapon (so bow + shield can combine).

## Projectiles ✅ (`entities/Projectile.js`)

Arrows/bolts fly under Arcade velocity; `GameScene.updateProjectiles()` fizzles
them on walls or lifespan (`PROJECTILE.lifespan`) and damages the first target
hit — enemies if the **player** fired, the player if an **enemy** did. Weapons
spawn them via `scene.spawnProjectile(owner, angle, weapon, opts)` (`opts`
carries `speedMult`/`damageMult`/`pierce` for special shots).

## Resource pixels ✅ (kill-loot that refills held items)

Killed enemies can drop little **resource pixels** — but only the kinds you can
actually use, so **holding the item is what "unlocks" its drops**:

- **Red HP pixel** (needs a held Health Potion) — refills the potion by
  `POTION.refillMin..refillMax` HP. Chance `POTION.dropChance` per kill.
- **Blue mana pixel** (needs a held mana item) — refills mana by
  `MANA.restoreMin..restoreMax`. Chance `MANA.dropChance` per kill.

(The bow uses **unlimited arrows**, so there is no arrow pixel.)

Pixels scatter near the corpse, bob, and **magnet toward the dot** within
`PIXEL.magnetRange`; walking over one collects it.

## Mana ✅

- A player resource (`config.MANA.max`) spent by `mana`-kind items. Carries
  across descents. A **blue mana bar** appears **under the avatar's HP bar**
  (top-left) **only while you hold a mana item**, and refills from blue pixels.

## Sources of items ✅

- **Chest** — exactly **one per level**, in a random room that is **neither the
  start room nor the stairs room** (loot and the exit never share a room). It
  drops **exactly one item**, rolled with **`Math.random`** (genuinely random
  per run, not tied to the level seed) from the **item pool for that depth**,
  minus any item **already picked up this run** (each item is unique across a
  run; the found set carries across descents). Empty if the pool is exhausted.
  - **Item pools** are keyed by depth *tier* (`items.js → ITEM_POOLS`, one tier
    per `DEPTHS_PER_TIER` = 5 levels). **Depths 1–5** roll from the **level-1
    pool** (potion / bomb / frost / bow / shield). Deeper tiers slot in as
    content lands; until then deeper chests reuse the last defined pool.
- **Monster drops** — killed enemies drop **resource pixels** (above), not full
  items.

## Pickups & the item dialog ✅

- A pickup is a floating (bobbing) sprite on the ground. Overlapping it collects
  it. If the bar is full it's left on the ground.
- On collect: a `consumable` stacks by count; a `reservoir` (potion) tops up to
  full on a duplicate; a `mana`/`cooldown` item is a one-off (duplicates
  ignored); a `weapon`/`shield` item **equips instead of entering the bar**.
- Picking up a chest item **freezes the game and shows an info dialog** — the
  item's icon, name, and a short "how it works" (`item.desc`). **Space** or a
  **click/tap on the dialog box** dismisses it and resumes play.

---

See [planned.md](planned.md) for what's still requested but not yet built.
