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
  aggroRange: 340, // distance at which an enemy notices the squad
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

export const PROJECTILE = {
  radius: 4,
  lifespan: 1400, // ms before a projectile fizzles out
};

// World size (in tiles) and run/level rules.
export const GAME = {
  tilesW: 48,
  tilesH: 32,
  recruitsPerLevel: 2, // neutral ally dots placed in each level
  healOnDescend: true, // survivors refill HP when you clear a level
};

