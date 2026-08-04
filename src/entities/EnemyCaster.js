// ============================================================================
// EnemyCaster.js — a slow green-X hexer that lobs fireballs.
//
// A green X that holds a staff in both hands (drawn by GameScene.drawCasterStaff)
// and casts a green fireball at the player from range. It's a VERY slow mover:
// it holds ground and keeps casting rather than kiting, and never melees. The
// staff-tip orb glows brighter as the next shot charges (`castCharge` 0→1).
//
// Movement/spawn tuning lives in config.js → CASTER; combat numbers (range,
// cooldown, damage, projectile speed/colour) live on weapons.green_staff. The
// ranged AI itself is GameScene.updateCaster.
// ============================================================================

import { COLORS, CASTER } from '../config.js';
import { Enemy } from './Enemy.js';
import { getWeapon } from '../weapons.js';

export class EnemyCaster extends Enemy {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x world pixel x
   * @param {number} y world pixel y
   * @param {object} [opts]
   * @param {number} [opts.level=1] character level → HP
   */
  constructor(scene, x, y, { level = 1 } = {}) {
    super(scene, x, y, {
      shape: 'x',
      color: COLORS.enemyCaster,
      level,
      hasFists: false, // it holds a staff instead of side-fists
      showEyes: false, // a bare X + staff reads better than a face
    });
    this.kind = 'caster';
    this.weapon = getWeapon('green_staff'); // ranged fireball
    this.speed = CASTER.speed; // very slow
    this.castCharge = 0; // 0→1 as the next fireball charges (drives the tip glow)
  }
}
