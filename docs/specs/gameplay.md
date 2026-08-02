# Gameplay

## Controls ✅

| Input | Action |
|---|---|
| **WASD** | Move the dot directly (normalized; diagonals aren't faster) |
| **Left-click ground** | Walk there (click-to-move) |
| **Left-click enemy** | Chase that enemy and auto-attack it |
| **Left-click sound icon** (bottom-left) | Cycle volume: full → half → mute |
| **Space** | Toggle **time-freeze** (tactical pause; clicks still issue orders) |
| **1–9** | Use the item in that action-bar slot |
| **Esc** | Pause menu (Continue / Restart + volume sliders) |
| **Enter** | Confirm Restart on the death screen |
| Walk onto the **▼ staircase** | Descend to the next level |
| Walk onto a **chest** | Open it (loot pops out) |

## Movement ✅

- **WASD** sets velocity directly; the Arcade collider slides the dot along
  walls (only the into-wall component is lost).
- **Click-to-move** steers toward the target each frame (`UNIT.speed = 178`
  px/s), easing down within `UNIT.arriveRadius = 30` and stopping within
  `UNIT.stopRadius = 6`.
- **Wall behaviour:** a glancing wall hit merely *slows* the dot (by the hit
  angle); a **90° head-on stops it**. With no pathfinding yet, a click-move is
  cancelled only after ~**1.2 s of no progress** toward the target.
- **Attack-move to an enemy:** clicking an enemy chases it and stops once it's
  in weapon range.

## Combat ✅ (hybrid, mostly automatic)

- The dot **auto-attacks** the nearest enemy that is both within weapon range
  **and** inside its front-facing arc (`UNIT.attackArc ≈ ±75°`). Turn away and
  it stops swinging.
- A **clicked (focus) enemy** takes priority — the dot faces and attacks it
  regardless of the arc, once in range.
- Default weapon is **Fists** (`weapons.js`): range 40, cooldown 420 ms,
  **1 damage**. Attacks read on screen as a **side-fist punch** thrust toward
  the target; while boxing, both fists hold toward the enemy.
- **Damage numbers:** hitting an enemy shows `N` in the player's colour; taking
  damage shows `-N` in red. Both float up and fade.
- Weapons carry `special()` behaviors (cleaves, power-shots) in the registry,
  but no key is currently bound to them (Space is time-freeze). 🟡

## Progression ✅

- Player starts **Level 1, 10 HP**, weapon Fists.
- **XP:** killing an enemy grants `1 × enemy level` XP.
- **Level-up** at `level × 10` XP (10, 20, 30, …). On level-up: **max HP +2**, a
  **partial refill** of **`LEVELUP.replenishFraction` (20%)** of max HP **and**
  mana (HP heals *only* here), and a **chime**. XP overflow carries.
- Shown top-right: `Level N` + an amber XP bar.

## Run rules ✅

- **Permadeath.** At 0 HP the dot freezes, greys out, and a **"You died"**
  screen shows a **Restart** button (confirm with Enter/click) → new run at
  depth 1.
- **Descending** carries progression to the next level: level, XP, max HP, **HP
  and mana as-is** (`GAME.healOnDescend` is off — leaving a level does **not**
  refill; only a level-up heals), weapon, shield, the action-bar contents, the
  found-items set, and the run timer.

## Time-freeze ✅ (Space)

- Freezes the simulation (movement, enemy AI, combat, physics) but **keeps
  order-input live** — you can click to move/attack, then unfreeze to watch it
  play out.
- Bottom-right shows a large **▶ play / ⏸ pause** indicator reflecting the
  state, with a **mm:ss game timer** above it. The timer only advances during
  un-frozen play and carries across descents.
