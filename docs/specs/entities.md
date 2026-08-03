# Entities

## Player dot ✅

- A circle of radius `UNIT.radius = 13`, tinted `COLORS.player` (cyan), moved
  with WASD / clicks.
- **Face:** two little dark eyes that point in the dot's facing direction.
- **Side-fists:** two darker dots (`COLORS.playerFist`) ride on the dot's sides,
  wiggle while moving, and hold toward the enemy while boxing. An attack thrusts
  one fist at the target (alternating).
- **Health bar** floats above the dot. HP starts 10/10. The player's **level and
  HP live on the top-left avatar frame**, not on the body — the level number is
  **not** drawn on the player dot (enemies still show theirs). See
  [presentation.md](presentation.md).
- Stats & combat live on the sprite (weapon, XP, focus target, move target).
  See [gameplay.md](gameplay.md) for combat/progression.
- **Equipment:** a chest **Bow** (weapon + arrows + reticle) and/or **Shield**
  (blocks one hit / 3 s) equip on pickup and draw on the dot — see
  [items.md](items.md).

## Enemies ✅ (`entities/Enemy.js`)

- **Shape ≠ dot:** enemies are non-circle silhouettes (currently **squares**,
  same footprint as the dot). The `shapes.js` registry already supports
  triangle/diamond for future types.
- **Level & HP:** each enemy has a `level` (= `randInt(1, depth)`); **HP =
  `level × ENEMY.hpPerLevel` = level × 2**. Own health bar, its **level number
  drawn on its body**, a face + side-fists (darker shade of its colour).
- **Weapon:** Fists (1 damage), same punch visuals as the player.
- **Staggered by hits:** a landed player fist **slows and knocks the enemy back**
  (see fist stagger in [gameplay.md](gameplay.md)); the slow reuses the same
  `slowTimer`/`slowMult` system as the Frozen Orb's chill.
- **Spawns:** every non-start room gets `randInt(1, 2 + depth)` enemies, minus
  any within the safe radius of the **start or the exit** (both stairs are safe
  zones — see [world.md](world.md)).

### Sight & aggro ✅

- Each un-alerted enemy has a **sight cone**: `ENEMY.sightRange = 200` px long,
  `ENEMY.viewAngle = ±45°` (a 90° cone). Idle enemies slowly **sweep** the cone
  (`ENEMY.lookSpeed = 0.7` rad/s).
- While **un-alerted**, an enemy **patrols its room** — ambling (½ speed) around
  a loop of waypoints just inside the room's walls, facing (and looking) where it
  walks. Tiny rooms fall back to sweeping the cone in place.
- An enemy becomes **alerted** only when the player is inside the cone (range +
  angle) **and** in clear line of sight (no wall between), **or** when it takes
  damage (hit from anywhere wakes it).
- On becoming alerted it plays a **growl** once.
- Alerted: chase the player (`ENEMY.speedMelee = 112`) and punch when adjacent;
  **give up** (de-aggro) once the player escapes `ENEMY.aggroRange = 340` px.
- **Cone display:** the sight cone is drawn (raycast-clipped by walls) only for
  un-alerted enemies the **player can currently see**.

### Spacing & death ✅

- **Spacing:** enemies never overlap more than ~5% of their size — a
  deterministic separation pass (bodies at 95%) pushes them apart (Arcade's own
  collider was unreliable for lockstep movers).
- **Corpses:** a killed enemy is **not removed** — it becomes a greyed, faded,
  inert corpse beneath the living (no AI/collision/HUD/fists), but the kill
  still grants XP and can drop loot.

## Projectiles ✅ (`entities/Projectile.js`)

- Arrows/bolts fired by ranged weapons (the player's Bow today). A projectile is
  a light Arcade sprite carrying **faction / damage / pierce / lifespan**; it
  flies under velocity while `GameScene.updateProjectiles()` handles collision.
- **Hits:** a player projectile damages the first **enemy** it touches; an enemy
  projectile damages the **player**. It **fizzles on walls** or after
  `PROJECTILE.lifespan`. `pierce` shots pass through (one hit per target).
- Spawned via `scene.spawnProjectile(owner, angle, weapon, opts)`.
