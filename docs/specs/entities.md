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

- **Shape ≠ dot:** enemies are non-circle silhouettes. Three types today — the
  melee **square** (`COLORS.enemyMelee`), the **dart** (thin yellow triangle) and
  the **caster** (green X), both below. The `shapes.js` registry also has
  triangle/diamond for future types.
- **Level & HP:** each enemy has a `level` (= `randInt(1, depth)`); **HP =
  `level × ENEMY.hpPerLevel` = level × 2**. Every enemy has its own health bar and
  its **level number drawn on its body**. Melee squares also have a face + side-
  fists (darker shade of its colour); the dart and caster carry neither (the
  caster holds a staff instead).
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

### Movement, spacing & death ✅

- **Chase pathfinding:** an alerted enemy with a **clear line of sight** beelines
  the player; otherwise it follows a **flow field** — a BFS distance field flooded
  from the player's tile (rebuilt only when the player changes tiles, so it's
  near-free) — *downhill*, routing **around walls** instead of grinding into them.
- **No enemy-vs-enemy collision:** enemies **ignore each other entirely** — no
  separation, no avoidance steering. They freely **overlap and pass through** one
  another (a converging pack just stacks on the target). This deliberately
  replaced the old separation/steering, which caused packs to jostle, stick, or
  deadlock face-to-face. Enemies still collide with **walls** and the **player**.
- **Corpses:** a killed enemy is **not removed** — it becomes a greyed, faded,
  inert corpse beneath the living (no AI/collision/HUD/fists), but the kill
  still grants XP and can drop loot.

### Dart — charging needle ✅ (`entities/EnemyDart.js`)

A thin **yellow** triangle (one very short base side, long sharp tip) that **only
ever moves along its tip** — the sprite is rotated so the point leads travel. It
carries **no side-fists and no face**; it hurts you by **jabbing with its tip**.
All numbers live in `config.js → DART`. Spawn: any generated enemy has a
`DART.spawnChance = 0.4` chance of being a dart instead of a melee square (darts
skip the room-wall patrol).

**Contact damage:** whenever the dart's **tip** touches the player it deals
`DART.contactDamage` (2), rate-limited to once per `DART.contactCooldown` (1.5 s)
per dart — so a connecting charge lands, and a dart parked against you chips
rather than drains. Measured from the tip point, in every phase.

A small state machine (driven by `GameScene.updateDart`):

- **patrol** (unaware): glides at `DART.patrolSpeed` in **serpentine half-circles**
  — it traces a half-circle of a random radius (`DART.arcRadiusMin..arcRadiusMax`),
  then **flips the curl direction and picks a new radius** for the next one. Curls
  away early if a wall looms. Uses the shared **sight cone** (range/angle from
  `ENEMY`) to spot the player.
- **approach:** on spotting the player, runs in at `DART.approachSpeed`, re-aiming
  its tip toward them (turn capped at `DART.turnRate`). Stops to wind up once within
  `DART.contactRange`.
- **windup:** freezes for `DART.windup` (~1 s), tip trained on the player — a
  readable **telegraph**.
- **charge:** locks the aim onto the player's position at launch and **dashes in a
  straight line** at `DART.chargeSpeed` (very fast) for `DART.chargeDuration`,
  ending on a wall or when the timer runs out (damage is the shared tip contact
  above). Once launched, a charge always commits (it won't de-aggro mid-dash).
- **recover:** a brief `DART.recover` pause, then it runs in and charges again
  (hit-and-run), or returns to patrol if the player has escaped `ENEMY.aggroRange`.

Frozen-Orb chill slows a dart in every phase, same as other enemies.

### Caster — green-X hexer ✅ (`entities/EnemyCaster.js`)

A green **X** that holds a **staff** in both hands and lobs a **green fireball** at
the player from range. Movement/spawn tuning lives in `config.js → CASTER`; its
combat numbers live on its weapon **`weapons.green_staff`** (range 330, ~1.6 s
cooldown, 4 damage, a straight green orb projectile). Spawn: after the dart roll,
a `CASTER.spawnChance = 0.3` slice of enemies are casters (they patrol their room
like the melee square while idle).

- **Very slow mover** (`CASTER.speed = 44`). It only moves — slowly — to regain
  range or line of sight; it never melees and never kites.
- **Holds ground & casts:** once it sees the player, it plants and fires on the
  weapon's cooldown as long as the player is within `green_staff.range` **and** in
  clear line of sight (fireballs still fizzle on walls). If out of range/LOS it
  shuffles toward the player (beeline with sight, else the shared flow field).
- **Staff & telegraph:** two hands grip a shaft aimed at the player; the orb at
  the **staff tip** swells and brightens as the next shot charges (`castCharge`
  0→1), and the fireball spawns from that tip.
- De-aggro past `ENEMY.aggroRange`, growls once on waking, and is chilled by the
  Frozen Orb like any enemy.

## Projectiles ✅ (`entities/Projectile.js`)

- Arrows/bolts/orbs fired by ranged weapons (the player's Bow and the caster's
  Hex Staff today). A projectile is a light Arcade sprite carrying **faction /
  damage / pierce / lifespan**; it flies under velocity while
  `GameScene.updateProjectiles()` handles collision.
- **Look:** a weapon may define `projectileTexture` (e.g. the `fireball` orb vs
  the default `arrow` dash) and `projectileColor`; otherwise the tint is by
  faction (player cyan / enemy red). `spawnProjectile(..., { spawnDist })` lets a
  weapon launch from an offset like a staff tip.
- **Hits:** a player projectile damages the first **enemy** it touches; an enemy
  projectile damages the **player**. It **fizzles on walls** or after
  `PROJECTILE.lifespan`. `pierce` shots pass through (one hit per target).
- Spawned via `scene.spawnProjectile(owner, angle, weapon, opts)`.
