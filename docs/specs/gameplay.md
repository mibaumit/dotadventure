# Gameplay

## Controls ✅

| Input | Action |
|---|---|
| **WASD** | Move the dot directly (normalized; diagonals aren't faster) |
| **Left-click enemy** | **Auto-attack that enemy** — lock it as the target, move into range, keep hitting it until it dies |
| **Left-click ground** | **Move there** (MOBA-style click-to-move) — does **not** cancel the attack target |
| **Left-click sound icon** (bottom-left) | Cycle volume: full → half → mute |
| **Space** | Toggle **time-freeze** (tactical pause) |
| **1–9** | Use the item in that action-bar slot |
| **Esc** | Pause menu (Continue / Restart + volume sliders) |
| **Enter** | Confirm Restart on the death screen |
| Walk onto the **▼ staircase** | Descend to the next level |
| Walk onto the **▲ staircase** | Climb back to the previous level (levels below the first) |
| Walk onto a **chest** | Open it (loot pops out) |

## Movement ✅ (MOBA-style)

- **Click-to-move:** left-click the ground to walk there (`UNIT.speed = 178`
  px/s), easing down within `UNIT.arriveRadius = 30` and stopping within
  `UNIT.stopRadius = 6`. **WASD** also moves directly (overrides a click-move).
- Neither WASD nor a click-move **cancels the attack target** — you keep
  auto-attacking while you reposition / kite.
- **Chasing:** with no move order, the dot walks toward its attack target until
  the target is in weapon range, then holds.
- **Wall behaviour:** the Arcade collider slides the dot along walls (only the
  into-wall component is lost); a glancing hit merely *slows* it, a **90° head-on
  stops it**. With no pathfinding yet, a click-move gives up after ~**1.2 s** of
  no progress.

## Combat ✅ (target the clicked enemy)

- **Click an enemy to attack it.** That enemy becomes the **only** auto-attack
  target — the dot faces it and swings/shoots on cooldown whenever it's in weapon
  range (and visible, for a bow), **even while moving**. It stays the target
  until it dies or you click another enemy.
- **No attacking untargeted enemies** — nothing is hit automatically just for
  being nearby; you must click it.
- Default weapon is **Fists** (`weapons.js`): range 40, cooldown 420 ms,
  **1 damage**. Attacks read on screen as a **side-fist punch** thrust toward
  the target; while boxing, both fists hold toward it.
- **Fist stagger:** a landed fist punch **staggers** the enemy — a brief slow
  (`FISTS.slowMult` for `FISTS.slowDuration`) plus a small **knockback**
  (`FISTS.knockback`, wall-clamped so a cornered enemy is never shoved through
  geometry), with a **white hit-flash and a spark burst** on impact.
- **Attack pace:** every dot's attack cooldown (yours **and** enemies') is scaled
  by **`ATTACK_COOLDOWN_MULT` (1.25 → ~20% slower)** for a calmer, more readable
  combat tempo.
- **Damage numbers:** hitting an enemy shows `N` in the player's colour; taking
  damage shows `-N` in red. On a kill, an amber **`+N XP`** also floats up. All
  float and fade.
- Weapons carry `special()` behaviors (cleaves, power-shots) in the registry,
  but no key is currently bound to them (Space is time-freeze). 🟡

## Progression ✅

- Player starts **Level 1, 10 HP**, weapon Fists.
- **XP:** killing an enemy grants `1 × enemy level` XP.
- **Level-up** at `level × 10` XP (10, 20, 30, …). On level-up: **max HP +2**, a
  **partial refill** of **`LEVELUP.replenishFraction` (20%)** of max HP **and**
  mana (HP heals *only* here), and a **chime**. XP overflow carries.
- Shown as a **`Level N` label above the XP bar** (a full-width tube above the
  action bar); the top-right shows only `Stage N`. See
  [presentation.md](presentation.md).

## Run rules ✅

- **Permadeath.** At 0 HP the dot freezes, greys out, and a **"You died"**
  screen shows a **Restart** button (confirm with Enter/click) → new run at
  depth 1.
- **Descending** carries progression to the next level: level, XP, max HP, **HP
  and mana as-is** (`GAME.healOnDescend` is off — leaving a level does **not**
  refill; only a level-up heals), weapon, shield, the action-bar contents, the
  found-items set, the **set of already-looted chests**, and the run timer.
- **Ascending** (the ▲ up-stairs) carries the same state the other way and drops
  you at that level's **down-stairs**. The level regenerates: **enemies respawn**,
  but a **chest you already opened stays gone** (tracked across the run). See
  [world.md](world.md).

## Time-freeze ✅ (Space)

- Freezes the simulation (movement, enemy AI, combat, physics) but **keeps
  order-input live** — you can click to move/attack, then unfreeze to watch it
  play out.
- **Background music stops while frozen** and resumes on unfreeze (like the pause
  menu), so a time-freeze is quiet.
- Bottom-right shows a large **▶ play / ⏸ pause** indicator reflecting the
  state, with a **mm:ss game timer** above it. The timer only advances during
  un-frozen play and carries across descents.
