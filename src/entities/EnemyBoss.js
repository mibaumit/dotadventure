// ============================================================================
// EnemyBoss.js — "The Warden", the first boss (a big crimson hexagon).
//
// Fought in a boss room every 5th depth (and in the Training Room's boss
// chamber). It's a large, high-HP enemy with three telegraphed phases keyed to
// its HP fraction (see config.BOSS):
//
//   phase 1 (>66% HP) — CHARGER: stalks in, winds up, dashes in a straight line.
//   phase 2 (>33% HP) — CASTER: plants and lobs fan volleys of green fireballs.
//   phase 3 (≤33% HP) — ENRAGE: faster charges AND spawns dart adds.
//
// A wide boss health bar is drawn at the top of the screen (GameScene). The AI
// itself is GameScene.updateBoss.
// ============================================================================

import { COLORS, BOSS } from '../config.js';
import { Enemy } from './Enemy.js';

export class EnemyBoss extends Enemy {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x world pixel x
   * @param {number} y world pixel y
   * @param {object} [opts]
   * @param {number} [opts.level=5] display level (= depth)
   * @param {number} [opts.maxHp=BOSS.hp] total HP (scales with depth)
   */
  constructor(scene, x, y, { level = 5, maxHp = BOSS.hp } = {}) {
    super(scene, x, y, {
      shape: 'hexagon',
      color: COLORS.enemyBoss,
      level,
      hasFists: false, // it charges and casts — no side-fists
      showEyes: true, // a menacing face on the big body
    });
    this.kind = 'boss';
    this.bossName = 'The Warden';
    this.radius = BOSS.radius; // big; used by draws/collision instead of ENEMY.radius
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.setDepth(2);
    // Snug body for the larger sprite.
    this.body.setSize(this.width * 0.9, this.height * 0.9, true);

    // No floating level number on the boss (it has the big top bar instead).
    if (this.label) {
      this.label.destroy();
      this.label = null;
    }

    // Phase / attack state (driven by GameScene.updateBoss).
    this.bossPhase = 1; // 1 charger, 2 caster, 3 enrage
    this.chargeState = 'approach'; // approach | windup | charge | recover
    this.chargeTimer = 0;
    this.chargeVX = 0;
    this.chargeVY = 0;
    this.contactTimer = 0; // ms until body-contact can hurt again
    this.attackTimer = 0; // ms until the next fireball volley
    this.addTimer = BOSS.addInterval; // ms until the next dart add (enrage)
    this.alerted = true; // a boss is always awake in its arena
    this.engaged = false; // true once the fight actually starts → shows the boss bar
  }
}
