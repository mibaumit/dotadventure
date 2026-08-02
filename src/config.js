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

// On-hit effect of a fists punch landing on an enemy.
export const FISTS = {
  slowMult: 0.8, // brief 20% slow…
  slowDuration: 100, // …for 0.1 s
  knockback: 1, // px the enemy is shoved back
};

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
};

// The Bow: an equipment item found in a chest. On pickup it becomes the dot's
// weapon (see weapons.bow), firing arrow projectiles with unlimited ammo. It
// can't shoot point-blank — foes closer than `minRange` are punched instead.
export const BOW = {
  minRange: 90, // enemies closer than this → fall back to fists
  drawTime: 170, // ms the string/hand "release" animation plays after a shot
};

// The Shield: an equipment item found in a chest. It fully blocks one incoming
// attack, then must recharge before it can block again.
export const SHIELD = {
  blockCooldown: 3000, // ms between blocks
};

// The Bomb: a reusable action-bar item (not consumed). Using it DROPS a bomb
// that ticks for `fuse` ms then explodes. Only one may be down at a time.
export const BOMB = {
  cooldown: 5000, // ms between uses
  fuse: 2000, // ms from drop to detonation
  radius: 120, // blast radius (px)
  damage: 3,
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

