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
    this.slowTimer = 0; // ms of remaining slow (Frozen Orb chill or a fists jab)
    this.slowMult = 1; // speed multiplier while slowed (set by whatever slowed it)
    this.attackTarget = null; // the player while punching (fists face it)
    this.alerted = false; // has it seen the player yet? (sight cone)
    this.announcedAggro = false; // has the aggro growl played for this alert?
    this.punchToggle = false; // alternates which side-fist punches
    this.facing = ((x * 7 + y * 13) % 628) / 100; // varied initial look direction
    this.lookSpeed = ENEMY.lookSpeed * ((x + y) % 2 ? 1 : -1); // sweep dir varies
    this.wigPhase = (x + y) % 7; // desync the fist wiggle between enemies
    // Punch by thrusting one of its own side-fists (same as the player).
    this.startSwing = (angle, scale = 1) => scene.punchSideFist(this, angle, scale);

    this.setTint(color);
    this.setDepth(1);
    this.setCollideWorldBounds(true);

    // Physics body ~95% of the sprite so wall/player/enemy collision stays snug
    // while still allowing a hair of visual overlap before bodies touch.
    this.body.setSize(this.width * 0.95, this.height * 0.95, true);

    // Two little fist-dots on the enemy's sides, in a darker shade of its colour.
    const fistColor = Phaser.Display.Color.IntegerToColor(color).darken(40).color;
    this.fistL = scene.add.image(x, y, 'fist').setTint(fistColor).setDepth(0);
    this.fistR = scene.add.image(x, y, 'fist').setTint(fistColor).setDepth(0);

    // Level number shown on the enemy's body (kept in sync by GameScene).
    this.label = scene.add
      .text(x, y, `${level}`, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#0d1019',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(50);
  }

  /** Apply damage; turn into a corpse when depleted. Returns true if it died. */
  takeDamage(amount) {
    this.alerted = true; // being hit always wakes it up (even from behind)
    this.hp -= amount;
    if (this.hp <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  /**
   * Death → corpse: the body stays on the ground, but the enemy stops counting
   * as active (no AI, combat, collision, HUD, or fists). setActive(false) makes
   * every gameplay loop skip it while leaving the sprite visible.
   */
  die() {
    this.isDead = true;
    this.setActive(false);
    this.body.enable = false; // no more collisions or movement
    this.setTint(0x555a66); // greyed-out corpse
    this.setAlpha(0.6);
    this.setDepth(-1); // lie beneath the living
    if (this.label) {
      this.label.destroy();
      this.label = null;
    }
    if (this.fistL) {
      this.fistL.destroy();
      this.fistL = null;
    }
    if (this.fistR) {
      this.fistR.destroy();
      this.fistR = null;
    }
  }

  /** Also tear down the level label and side-fists when destroyed. */
  destroy(fromScene) {
    if (this.label) {
      this.label.destroy();
      this.label = null;
    }
    if (this.fistL) {
      this.fistL.destroy();
      this.fistL = null;
    }
    if (this.fistR) {
      this.fistR.destroy();
      this.fistR = null;
    }
    super.destroy(fromScene);
  }
}
