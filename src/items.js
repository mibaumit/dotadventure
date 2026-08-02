// ============================================================================
// items.js — the ITEM / SPELL registry (data-driven, extensible).
//
// An item is a plain object with an icon (shape + colour) and a `use(scene)`
// effect. `use` returns true if it was consumed (removed a stack), false if it
// did nothing (e.g. drinking a potion at full HP). To add an item, drop a new
// entry here — pickups and the action bar pick it up automatically.
// ============================================================================

export const ITEMS = {
  potion: {
    id: 'potion',
    name: 'Health Potion',
    shape: 'diamond',
    color: 0x57e389,
    use(scene) {
      const p = scene.player;
      if (p.hp >= p.maxHp) return false; // no waste at full health
      const heal = Math.min(5, p.maxHp - p.hp);
      p.hp += heal;
      scene.showDamageNumber(p.x, p.y, `+${heal}`, '#57e389');
      return true;
    },
  },

  bomb: {
    id: 'bomb',
    name: 'Bomb',
    shape: 'circle',
    color: 0xffab3d,
    use(scene) {
      const p = scene.player;
      scene.blastEffect(p.x, p.y, 120, this.color);
      for (const e of scene.enemies.getChildren()) {
        if (e.active && Math.hypot(e.x - p.x, e.y - p.y) <= 120) scene.dealDamage(e, 3);
      }
      return true;
    },
  },

  frost: {
    id: 'frost',
    name: 'Scroll of Frozen Orb',
    shape: 'scroll',
    color: 0x7fe3ff, // blue
    use(scene) {
      const p = scene.player;
      scene.blastEffect(p.x, p.y, 150, this.color);
      for (const e of scene.enemies.getChildren()) {
        if (e.active && Math.hypot(e.x - p.x, e.y - p.y) <= 150) scene.dealDamage(e, 2);
      }
      return true;
    },
  },
};

export const ITEM_IDS = Object.keys(ITEMS);

export function getItem(id) {
  return ITEMS[id];
}

/** Unique icon shapes used by items (for texture generation). */
export const ITEM_SHAPES = [...new Set(ITEM_IDS.map((id) => ITEMS[id].shape))];
