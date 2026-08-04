// ============================================================================
// config.js — central tunables. Change numbers here to rebalance the game.
// Everything visual/gameplay that you'll want to tweak lives in one place.
// ============================================================================

export const TILE = 40; // pixel size of one grid tile

export const COLORS = {
  background: 0x0d1019,
  floor: 0x171c28,
  floorAlt: 0x1c2233,
  wall: 0x2b3556,
  wallEdge: 0x3a4877,

  player: 0x3ad0ff,
  playerFist: 0x1f86b0, // a bit darker than the dot — the little side fists
  playerSelected: 0xfff2a8,
  selectionRing: 0xffffff,

  enemyMelee: 0xff5a5a,
  enemyArcher: 0xffab3d,
  enemyDart: 0xffe14d, // the charging needle (thin yellow triangle)
  enemyCaster: 0x59d94b, // the green-X hexer that lobs fireballs from a staff
  fireball: 0x8dff5a, // the caster's green fireball projectile (brighter than its body)

  hpBack: 0x000000,
  hpGood: 0x57e389,
  hpLow: 0xff5a5a,
  hpEnemy: 0xff5a5a,
  xp: 0xffcf5c, // experience bar (amber)
  mana: 0x4db8ff, // mana bar (blue)
  hpPixel: 0xff5a5a, // little red HP pixels dropped by dead enemies
  manaPixel: 0x4db8ff, // little blue mana pixels dropped by dead enemies
};

export const UNIT = {
  radius: 13,
  speed: 178,
  hp: 100,
  arriveRadius: 30, // start slowing within this distance of target
  stopRadius: 6, // consider "arrived" within this distance
  attackArc: Math.PI * 0.42, // ~75° half-angle: only auto-attack enemies you face
};

export const ENEMY = {
  radius: 12,
  speedMelee: 112,
  speedArcher: 96,
  hpPerLevel: 2, // an enemy's HP = level * hpPerLevel (level-1 enemy = 2 HP)
  aggroRange: 340, // how far an alerted enemy will keep chasing before giving up
  sightRange: 200, // sight-cone length: how far an enemy can actually see
  viewAngle: Math.PI / 4, // sight-cone half-angle (~45° → a 90° cone)
  lookSpeed: 0.7, // rad/sec an idle enemy sweeps its cone
};

// The Dart: a thin yellow triangle that only ever moves along its tip. While
// unaware it wanders in serpentine half-circles (each a random radius, curling
// the opposite way from the last). On spotting the player it runs in, freezes to
// wind up (~1 s telegraph), then charges in a locked straight line very fast,
// ramming for contact damage — then recovers and repeats the hit-and-run.
export const DART = {
  spawnChance: 0.4, // chance a spawned enemy is a dart instead of a melee square
  patrolSpeed: 74, // glide speed while serpentining (unaware)
  approachSpeed: 138, // run-in speed after spotting the player
  chargeSpeed: 470, // the fast straight-line dash
  turnRate: 3.4, // rad/sec it can re-aim its tip while approaching
  windup: 1000, // ms it stops to telegraph before charging
  chargeDuration: 430, // ms a charge dash lasts before it peters out
  recover: 550, // ms pause after a charge before it runs in again
  contactRange: 62, // distance to the player at which it stops to wind up
  contactDamage: 2, // damage dealt whenever it's touching the player…
  contactCooldown: 1500, // …at most once per this many ms (per dart)
  arcRadiusMin: 55, // patrol half-circle radius range (px) — varied each half-circle
  arcRadiusMax: 145,
};

// The Caster ("Hexer"): a green X that holds a staff in both hands and lobs a
// green fireball at the player from range. A VERY slow mover — it holds ground
// and keeps casting rather than kiting, and never melees. Combat numbers (range,
// cooldown, damage, projectile speed) live on its weapon (weapons.green_staff);
// only its movement/spawn tuning lives here.
export const CASTER = {
  spawnChance: 0.3, // chance a spawned enemy is a caster (see DART.spawnChance)
  speed: 44, // px/s — a slow shuffle, only used to regain range / line of sight
};

// The Training Room: an open sandbox (from the main menu) with one of every
// enemy and a chest per item. Killed enemies respawn so you can keep practising.
export const TRAINING = {
  respawnMs: 5000, // a killed training enemy returns after this delay
};

export const FORMATION = {
  spacing: 36,
  cols: 3,
};

// Orders the squad (non-selected units) can be given.
export const ORDER = {
  FOLLOW: 'follow', // trail the selected leader in formation
  HOLD: 'hold', // stand ground, attack anything in range
  MOVE: 'move', // move to a point, engaging along the way
  ATTACK: 'attack', // focus a specific enemy
};

export const COMBAT = {
  swingDuration: 150, // ms a melee swing arc stays visible
};

// On-hit effect of a fists punch landing on an enemy. Punchy: a real stagger
// (40% slow for a quarter-second) plus a shove you can see. The knockback is
// wall-clamped in fistImpact() so enemies never get pushed through geometry.
export const FISTS = {
  slowMult: 0.6, // 40% slow…
  slowDuration: 250, // …for 0.25 s
  knockback: 8, // px the enemy is shoved back
};

// Global attack-pace scalar. >1 = slower attacks. 1.25 makes every dot (yours
// AND enemies') attack 20% less often, for a calmer, more readable tempo.
export const ATTACK_COOLDOWN_MULT = 1.25;

export const PROJECTILE = {
  radius: 4,
  lifespan: 1400, // ms before a projectile fizzles out
};

// The Health Potion: a refillable HP reservoir (found in a chest). It never
// leaves the action bar — using it pours stored HP into the dot, and killed
// enemies drop red pixels that refill it (only while you're carrying one).
export const POTION = {
  capacity: 20, // max HP the potion can store
  initialCharge: 10, // stored HP when first found in the chest
  refillMin: 1, // HP added per red pixel (inclusive range)
  refillMax: 5,
  dropChance: 0.5, // chance a killed enemy drops a red HP pixel (needs a held potion)
};

// Mana: a player resource that mana-cost spells (e.g. the Frozen Orb scroll)
// spend. The mana bar only appears once you hold a mana item; killed enemies
// drop blue pixels that refill it.
export const MANA = {
  max: 100,
  frostCost: 25, // mana per Scroll of Frozen Orb cast
  restoreMin: 8, // mana added per blue pixel (inclusive range)
  restoreMax: 16,
  dropChance: 0.5, // chance a killed enemy drops a blue mana pixel (needs a held mana item)
  regenPerSec: 3, // slow passive mana regeneration (points per second)
};

// The Bow: an equipment item found in a chest. On pickup it becomes the dot's
// weapon (see weapons.bow), firing arrow projectiles with unlimited ammo. It
// can't shoot point-blank — foes closer than `minRange` are punched instead.
export const BOW = {
  minRange: 90, // enemies closer than this → fall back to fists
  drawTime: 170, // ms the string/hand "release" animation plays after a shot
};

// The Shield: an equipment item found in a chest. It fully blocks one incoming
// attack, then must recharge before it can block again. Picking it up also arms a
// SWORD (see SWORD_SHIELD) — the pair is a "Sword & Shield".
export const SHIELD = {
  blockCooldown: 3000, // ms between blocks
};

// The Sword half of the Sword & Shield: while the Shield is held, your melee
// attack becomes a wide sword swing that CLEAVES every enemy in a frontal arc
// (with a bow, you still shoot at range and cleave only up close). Numbers here;
// the swing itself is `weapons.shield_sword` + `GameScene.swordSwingArc`.
export const SWORD_SHIELD = {
  range: 64, // reach of the cleave (px)
  halfArc: Math.PI * 0.45, // ~81° half → ~162° frontal arc (clearly multi-target)
  damage: 1, // per enemy hit — same as the Bow (it makes up for it by cleaving all)
  cooldown: 560, // ms between swings
};

// The Bomb: a reusable action-bar item (not consumed). Using it DROPS a bomb
// that ticks for `fuse` ms then explodes. You can stack several at once — the
// only limit is the recharge between drops.
export const BOMB = {
  cooldown: 3000, // ms between uses
  fuse: 2000, // ms from drop to detonation
  radius: 120, // blast radius (px)
  damage: 3,
  // Rolling physics — shove a dropped bomb like a bowling ball by running into
  // it. The harder you run in, the faster it rolls; drag coasts it to a stop.
  push: 1.15, // bomb takes this × your closing speed on contact
  drag: 240, // px/s² rolling friction (how quickly it slows)
  maxSpeed: 520, // px/s cap on roll speed
  bounce: 0.45, // liveliness off walls and other bombs
};

// The Scroll of Frozen Orb: an AoE that damages AND chills enemies (slows them).
export const FROST = {
  radius: 150, // blast radius (px)
  damage: 2,
  cooldown: 2000, // ms between casts (on top of the mana cost)
  slowDuration: 2000, // ms an enemy stays chilled
  slowMultiplier: 0.5, // chilled enemies move at 50% speed
  tint: 0xaee0ff, // frosty blue tint while chilled
};

// Character level-up: max HP/mana grow, and this fraction of each max is
// replenished (a partial refill, not a full heal).
export const LEVELUP = {
  replenishFraction: 0.2,
};

// The action bar (bottom-center). `slots` items, used with keys 1..slots or by
// tapping (mobile). Kept small so the bar fits a phone screen comfortably.
export const HOTBAR = {
  slots: 5,
};

// Little resource "pixels" dropped by dead enemies (red = HP, blue = mana).
export const PIXEL = {
  size: 8, // px square
  scatter: 12, // random landing spread around the corpse
  magnetRange: 70, // within this, a pixel drifts toward the dot
  magnetSpeed: 260, // px/sec magnet pull
};

// World size (in tiles) and run/level rules.
export const GAME = {
  tilesW: 48,
  tilesH: 32,
  recruitsPerLevel: 2, // neutral ally dots placed in each level
  healOnDescend: false, // HP/mana carry between levels — they refill only on level-up
  visionTiles: 5, // fog-of-war reveal radius around the dot (in tiles)
  fogCell: 16, // fog resolution in px (smaller = finer, rounder reveal)
};

