// ============================================================================
// Projectile.js — a flying arrow / bolt.
//
// Deliberately dumb: it just carries flight + damage data and moves under
// Arcade velocity. GameScene.updateProjectiles() drives collision (walls +
// targets) and lifespan, mirroring how the scene owns the other systems.
// ============================================================================

import { PROJECTILE } from '../config.js';

export class Projectile extends Phaser.Physics.Arcade.Image {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x  spawn world x
   * @param {number} y  spawn world y
   * @param {number} angle  flight direction (radians)
   * @param {object} opts
   * @param {string} [opts.faction='player']  who fired it → what it can hit
   * @param {number} [opts.damage=1]
   * @param {number} [opts.speed=300]  px/sec
   * @param {boolean} [opts.pierce=false]  keep going through enemies
   * @param {number} [opts.color=0xffffff]  tint
   * @param {string} [opts.texture='arrow']  texture key ('arrow' dash, 'fireball' orb, …)
   * @param {number} [opts.lifespan]  ms before it fizzles (defaults to config)
   */
  constructor(scene, x, y, angle, opts = {}) {
    super(scene, x, y, opts.texture ?? 'arrow');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.faction = opts.faction ?? 'player';
    this.damage = opts.damage ?? 1;
    this.pierce = opts.pierce ?? false;
    this.life = opts.lifespan ?? PROJECTILE.lifespan;
    this.hitTargets = new Set(); // pierce: don't damage the same target twice

    this.setTint(opts.color ?? 0xffffff);
    this.setRotation(angle); // point the dash along its travel
    this.setDepth(2);
    this.body.setCircle(PROJECTILE.radius); // small round hitbox regardless of art

    const speed = opts.speed ?? 300;
    this.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
  }
}
