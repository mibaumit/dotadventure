// ============================================================================
// weapons.js — the WEAPON REGISTRY (data-driven, extensible).
//
// A weapon is a plain object describing HOW a dot attacks. To add a weapon,
// copy an entry and tweak the numbers / behaviors — nothing else needs editing.
//
// Behavior hooks (all optional except `attack`):
//   attack(ctx)  — the automatic in-range attack. ctx = { scene, owner, target }
//   special(ctx) — the manual, mouse-aimed special (Space). ctx = { scene, owner, aimAngle }
//
// The `scene` in ctx exposes a small combat API the weapons call:
//   scene.dealDamage(target, amount)
//   scene.meleeSweep(owner, angle, range, halfArc, damage)
//   scene.spawnProjectile(owner, angle, weapon, opts)
// ============================================================================

import { angleBetween } from './util.js';

export const WEAPONS = {
  // Default when a dot has no weapon: bare fists, 1 damage, short reach.
  fists: {
    id: 'fists',
    name: 'Fists',
    kind: 'melee',
    range: 40,
    cooldown: 420,
    damage: 1,
    defense: 0,
    specialCooldown: 1400,
    color: 0xffffff,
    attack({ scene, owner, target }) {
      scene.dealDamage(target, this.damage);
      owner.startSwing(angleBetween(owner.x, owner.y, target.x, target.y));
    },
    // A harder two-fisted jab in front.
    special({ scene, owner, aimAngle }) {
      scene.meleeSweep(owner, aimAngle, this.range + 8, Math.PI * 0.6, this.damage * 2);
      owner.startSwing(aimAngle, 1.3);
    },
  },

  sword: {
    id: 'sword',
    name: 'Sword',
    kind: 'melee',
    range: 50,
    cooldown: 460, // ms between auto-attacks
    damage: 18,
    defense: 0.1, // fraction of incoming damage blocked
    specialCooldown: 2200,
    color: 0xffffff,
    attack({ scene, owner, target }) {
      scene.dealDamage(target, this.damage);
      owner.startSwing(angleBetween(owner.x, owner.y, target.x, target.y));
    },
    // Wide cleave in front of the dot.
    special({ scene, owner, aimAngle }) {
      scene.meleeSweep(owner, aimAngle, this.range + 12, Math.PI * 0.7, this.damage * 1.5);
      owner.startSwing(aimAngle, 1.4);
    },
  },

  sword_shield: {
    id: 'sword_shield',
    name: 'Sword & Shield',
    kind: 'melee',
    range: 46,
    cooldown: 620,
    damage: 12,
    defense: 0.45, // tanky — blocks nearly half of incoming damage
    specialCooldown: 2600,
    color: 0xbfe3ff,
    attack({ scene, owner, target }) {
      scene.dealDamage(target, this.damage);
      owner.startSwing(angleBetween(owner.x, owner.y, target.x, target.y));
    },
    // Shield bash: short, hard cleave.
    special({ scene, owner, aimAngle }) {
      scene.meleeSweep(owner, aimAngle, this.range + 6, Math.PI * 0.6, this.damage * 1.8);
      owner.startSwing(aimAngle, 1.3);
    },
  },

  spear: {
    id: 'spear',
    name: 'Spear',
    kind: 'melee',
    range: 70, // long reach
    cooldown: 560,
    damage: 16,
    defense: 0.1,
    specialCooldown: 2400,
    color: 0xd8c8a0,
    attack({ scene, owner, target }) {
      scene.dealDamage(target, this.damage);
      owner.startSwing(angleBetween(owner.x, owner.y, target.x, target.y));
    },
    // Lunge: narrow but very long thrust.
    special({ scene, owner, aimAngle }) {
      scene.meleeSweep(owner, aimAngle, this.range + 40, Math.PI * 0.22, this.damage * 1.6);
      owner.startSwing(aimAngle, 1.2);
    },
  },

  bow: {
    id: 'bow',
    name: 'Bow',
    kind: 'ranged',
    range: 300,
    cooldown: 900,
    damage: 15,
    defense: 0,
    projectileSpeed: 440,
    specialCooldown: 2000,
    color: 0x7fe3ff,
    attack({ scene, owner, target }) {
      const angle = angleBetween(owner.x, owner.y, target.x, target.y);
      scene.spawnProjectile(owner, angle, this);
    },
    // Power shot: faster, harder, pierces enemies.
    special({ scene, owner, aimAngle }) {
      scene.spawnProjectile(owner, aimAngle, this, {
        speedMult: 1.6,
        damageMult: 2.2,
        pierce: true,
      });
    },
  },

  // --- Enemy weapons (not part of the player's swap cycle) --------------------
  claw: {
    id: 'claw',
    name: 'Claw',
    kind: 'melee',
    range: 36,
    cooldown: 780,
    damage: 8,
    defense: 0,
    color: 0xff8a8a,
    attack({ scene, owner, target }) {
      scene.dealDamage(target, this.damage);
      owner.startSwing(angleBetween(owner.x, owner.y, target.x, target.y));
    },
  },

  dark_bow: {
    id: 'dark_bow',
    name: 'Dark Bow',
    kind: 'ranged',
    range: 250,
    cooldown: 1500,
    damage: 7,
    defense: 0,
    projectileSpeed: 320,
    color: 0xff8080,
    attack({ scene, owner, target }) {
      const angle = angleBetween(owner.x, owner.y, target.x, target.y);
      scene.spawnProjectile(owner, angle, this);
    },
  },
};

// Weapons the player can cycle through with the swap key (X), in order.
export const PLAYER_WEAPON_CYCLE = ['sword', 'sword_shield', 'spear', 'bow'];

/** Look up a weapon definition by id. */
export function getWeapon(id) {
  return WEAPONS[id];
}

/** Next weapon id in the player's cycle after `currentId`. */
export function nextWeaponId(currentId) {
  const i = PLAYER_WEAPON_CYCLE.indexOf(currentId);
  return PLAYER_WEAPON_CYCLE[(i + 1) % PLAYER_WEAPON_CYCLE.length];
}
