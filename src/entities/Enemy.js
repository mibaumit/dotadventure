// ============================================================================
// Enemy.js — a hostile entity.
//
// Enemies are deliberately NOT circles (dots are the player). Each enemy has a
// `shape` (square, triangle, …) so types read at a glance. For now enemies are
// idle/immovable; movement + AI + combat get layered on in the next steps.
// ============================================================================

import { COLORS, ENEMY } from '../config.js';
import { shapeTextureKey } from '../shapes.js';

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x  world pixel x
   * @param {number} y  world pixel y
   * @param {object} [opts]
   * @param {string} [opts.shape='square']  visual silhouette (see shapes.js)
   * @param {number} [opts.color]           tint
   * @param {number} [opts.hp]              hit points
   */
  constructor(scene, x, y, { shape = 'square', color = COLORS.enemyMelee, hp = ENEMY.hpMelee } = {}) {
    super(scene, x, y, shapeTextureKey(shape));
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.shape = shape;
    this.faction = 'enemy';
    this.hp = hp;
    this.maxHp = hp;

    this.setTint(color);
    this.setDepth(1);
    this.setCollideWorldBounds(true);
    this.setImmovable(true); // stationary for now — AI arrives next step
  }

  /** Apply damage; destroy when depleted. Returns true if this killed it. */
  takeDamage(amount) {
    this.hp -= amount;
    if (this.hp <= 0) {
      this.destroy();
      return true;
    }
    return false;
  }
}
