// ============================================================================
// Enemy.js — a hostile entity.
//
// Enemies are deliberately NOT circles (dots are the player). Each enemy has a
// `shape` (square, triangle, …) so types read at a glance. For now enemies are
// idle/immovable; movement + AI + combat get layered on in the next steps.
// ============================================================================

import { COLORS, ENEMY } from '../config.js';
import { shapeTextureKey } from '../shapes.js';
import { getWeapon } from '../weapons.js';

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x  world pixel x
   * @param {number} y  world pixel y
   * @param {object} [opts]
   * @param {string} [opts.shape='square']  visual silhouette (see shapes.js)
   * @param {number} [opts.color]           tint
   * @param {number} [opts.level=1]         character level → HP = level * hpPerLevel
   */
  constructor(scene, x, y, { shape = 'square', color = COLORS.enemyMelee, level = 1 } = {}) {
    super(scene, x, y, shapeTextureKey(shape));
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.shape = shape;
    this.faction = 'enemy';
    this.level = level;
    this.maxHp = level * ENEMY.hpPerLevel;
    this.hp = this.maxHp;
    this.baseColor = color; // remembered so hit-flashes can restore it

    // Combat / AI state (driven by GameScene.updateEnemies).
    this.weapon = getWeapon('fists'); // enemies punch with fists too
    this.speed = ENEMY.speedMelee;
    this.attackTimer = 0;
    this.punchSide = 1;
    this.facing = 0;
    this.startSwing = (angle, scale = 1) => scene.showPunch(this, angle, scale, color);

    this.setTint(color);
    this.setDepth(1);
    this.setCollideWorldBounds(true);

    // Shrink the physics body to 95% of the sprite so enemies may overlap by
    // ~5% but can't share the same space (see enemy-vs-enemy collider).
    this.body.setSize(this.width * 0.95, this.height * 0.95, true);

    // Floating level label above the enemy (kept in sync by GameScene).
    this.label = scene.add
      .text(x, y, `Lv ${level}`, { fontFamily: 'monospace', fontSize: '11px', color: '#ffd7d7' })
      .setOrigin(0.5, 1)
      .setDepth(50);
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

  /** Also tear down the level label when the enemy is destroyed. */
  destroy(fromScene) {
    if (this.label) {
      this.label.destroy();
      this.label = null;
    }
    super.destroy(fromScene);
  }
}
