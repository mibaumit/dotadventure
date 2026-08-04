# Gameplay

## Controls ✅

| Input | Action |
|---|---|
| **WASD** | Move the dot directly (normalized; diagonals aren't faster) |
| **Left-click** | **Attack toward the cursor** (free aim; one shot per weapon cooldown) |
| **Left-click sound icon** (bottom-left) | Cycle volume: full → half → mute |
| **Space** | Toggle **time-freeze** (tactical pause; attacking is disabled while frozen) |
| **1–9** | Use the item in that action-bar slot |
| **Esc** | Pause menu (Continue / Restart + volume sliders) |
| **Enter** | Confirm Restart on the death screen |
| Walk onto the **▼ staircase** | Descend to the next level |
| Walk onto the **▲ staircase** | Climb back to the previous level (levels below the first) |
| Walk onto a **chest** | Open it (loot pops out) |

## Movement ✅

- **WASD-only:** movement sets velocity directly (`UNIT.speed = 178` px/s); the
  Arcade collider slides the dot along walls (only the into-wall component is
  lost). A glancing wall hit merely *slows* the dot; a **90° head-on stops it**.
- **Clicks never move** — a click always attacks (see Combat). There is no
  click-to-move / attack-move.

## Combat ✅ (click to attack, free aim)

- **Every attack is a click.** There is **no auto-attack** — the dot only swings
  or shoots when you left-click, aiming **toward the cursor** (free aim). One
  shot per click, gated by the weapon's cooldown (holding does nothing extra).
- **Melee** sweeps a cone (`±UNIT.attackArc ≈ 75°`) toward the aim, hitting every
  enemy in it; **ranged** fires a projectile straight at the cursor.
- Default weapon is **Fists** (`weapons.js`): range 40, cooldown 420 ms,
  **1 damage**. Attacks read on screen as a **side-fist punch** thrust toward
  the aim; a red marker briefly flags the click point.
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
