// ============================================================================
// items.js — the ITEM / SPELL registry (data-driven, extensible).
//
// An item is a plain object with an icon (shape + colour), a `kind`, and a
// `use(scene, slot)` effect. `use` returns true only if it was CONSUMED (the
// slot loses a stack); reusable items (reservoirs, mana spells) return false so
// they stay on the bar. To add an item, drop a new entry here — pickups and the
// action bar pick it up automatically.
//
// Item kinds:
//   'consumable' — a simple stack; each use spends one.
//   'reservoir'  — never consumed; holds a resource on its slot (`slot.charge`)
//                  up to `capacity`, refilled by pixel drops (e.g. Potion → HP).
//   'mana'       — never consumed; each use spends the player's shared mana
//                  (`manaCost`), refilled by blue pixel drops (e.g. Frost).
//   'cooldown'   — never consumed; usable again only after `cooldownMs` (Bomb).
//   'weapon'     — equipment; on pickup it becomes the dot's weapon (Bow).
//   'shield'     — equipment; on pickup it grants a blocking off-hand (Shield).
// ============================================================================

import { POTION, MANA, BOMB, FROST } from './config.js';
import { playFrostCast } from './sound.js';

export const ITEMS = {
  potion: {
    id: 'potion',
    name: 'Health Potion',
    shape: 'diamond',
    color: 0x57e389,
    kind: 'reservoir',
    desc: 'A refillable flask. Press its number to pour stored HP into you. Killed enemies drop red pixels that top it up.',
    capacity: POTION.capacity, // max HP the potion can hold
    initialCharge: POTION.initialCharge, // stored HP when first found
    // Pour stored HP into the player (up to full). Never consumes the item; the
    // reservoir refills from the red pixels dead enemies drop.
    use(scene, slot) {
      const p = scene.player;
      if (p.hp >= p.maxHp) return false; // no waste at full health
      if (!slot || slot.charge <= 0) return false; // empty reservoir
      const heal = Math.min(slot.charge, p.maxHp - p.hp);
      p.hp += heal;
      slot.charge -= heal;
      scene.showDamageNumber(p.x, p.y, `+${Math.round(heal)}`, '#57e389');
      return true; // acted
    },
  },

  bomb: {
    id: 'bomb',
    name: 'Bomb',
    shape: 'bomb', // custom icon: black circle + fuse (baked in GameScene.buildTextures)
    color: 0x4a4a55, // dark accent (icon art is drawn black, not tinted)
    kind: 'cooldown',
    desc: 'Press its number to drop a bomb where you stand. It detonates after 2s for area damage. Run into it to bowl it across the room. 3s cooldown.',
    cooldownMs: BOMB.cooldown,
    // Reusable; never consumed. Drops a timed bomb rather than blasting instantly.
    use(scene) {
      scene.placeBomb(scene.player.x, scene.player.y);
      return true; // acted → start cooldown
    },
  },

  frost: {
    id: 'frost',
    name: 'Scroll of Frozen Orb',
    shape: 'scroll',
    color: 0x7fe3ff, // blue
    kind: 'mana',
    desc: 'Press its number for a freezing blast: damages enemies and chills them (50% slower for 2s). Costs mana + a 2s cooldown; blue pixels from kills refill mana.',
    manaCost: MANA.frostCost,
    cooldownMs: FROST.cooldown,
    // Cast for mana; never consumed. Does nothing if you can't afford it.
    use(scene) {
      const p = scene.player;
      if (p.mana < this.manaCost) return false;
      p.mana -= this.manaCost;
      playFrostCast(); // howling ice storm
      scene.blastEffect(p.x, p.y, FROST.radius, this.color);
      for (const e of scene.enemies.getChildren()) {
        if (!e.active || Math.hypot(e.x - p.x, e.y - p.y) > FROST.radius) continue;
        scene.dealDamage(e, FROST.damage);
        scene.applySlow(e, FROST.slowMultiplier, FROST.slowDuration); // chill it
        if (e.active) e.setTint(FROST.tint);
      }
      return true; // cast happened → start cooldown
    },
  },

  bow: {
    id: 'bow',
    name: 'Bow',
    shape: 'bow', // custom pickup texture (baked in GameScene.buildTextures)
    color: 0x9fe3ff,
    kind: 'weapon',
    desc: 'Becomes your weapon. Auto-shoots enemies you can see at range (unlimited arrows); punches up close. 2s between shots.',
    weaponId: 'bow', // the weapons.js entry it equips (range, cooldown, projectile…)
    // No `use` — equipment equips on pickup rather than firing from the bar.
    // Ammo is unlimited, so there's no arrow count to track.
  },

  shield: {
    id: 'shield',
    name: 'Shield',
    shape: 'shield', // custom pickup texture (baked in GameScene.buildTextures)
    color: 0xbfe3ff,
    kind: 'shield',
    desc: 'Sword & Shield: your melee attack becomes a wide sword swing that cleaves every enemy in front, and the shield fully blocks one hit (then recharges). A bow still shoots at range.',
    // No `use` — grants the cleaving sword + blocking off-hand on pickup.
  },
};

export const ITEM_IDS = Object.keys(ITEMS);

export function getItem(id) {
  return ITEMS[id];
}

/** Unique icon shapes used by items (for texture generation). */
export const ITEM_SHAPES = [...new Set(ITEM_IDS.map((id) => ITEMS[id].shape))];

// ---------------------------------------------------------------------------
// Item pools by depth tier. A chest rolls one item from the pool for its depth.
// One tier spans DEPTHS_PER_TIER levels (tier 1 = depths 1–5). Add deeper tiers
// here as higher-level content lands; until then deeper chests reuse the last.
// ---------------------------------------------------------------------------
export const DEPTHS_PER_TIER = 5;

export const ITEM_POOLS = {
  1: ['potion', 'bomb', 'frost', 'bow', 'shield'], // depths 1–5
};

/** The item pool for a given dungeon depth (falls back to the deepest defined). */
export function itemPoolForDepth(depth) {
  const maxTier = Math.max(...Object.keys(ITEM_POOLS).map(Number));
  const tier = Math.min(Math.max(1, Math.ceil(depth / DEPTHS_PER_TIER)), maxTier);
  return ITEM_POOLS[tier];
}
