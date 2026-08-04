// ============================================================================
// EnemyDart.js — a thin yellow needle that rams the player.
//
// Unlike the melee square, a dart ONLY ever moves along its tip (its sprite is
// rotated so the point leads travel). Its behaviour is a small state machine,
// driven by GameScene.updateDart:
//
//   patrol  → glide in serpentine half-circles (each a random radius, curling
//             the opposite way from the last) while it hasn't seen the player
//   approach→ having spotted the player, run in and re-aim the tip at them
//   windup  → stop dead ~1 s, tip trained on the player (a readable telegraph)
//   charge  → dash in a LOCKED straight line, very fast, ramming on contact
//   recover → brief pause, then approach again (repeating hit-and-run)
//
// It carries no side-fists and no face — a bare arrow reads best. All the tuning
// lives in config.js → DART.
// ============================================================================

import { COLORS, DART } from '../config.js';
import { Enemy } from './Enemy.js';

export class EnemyDart extends Enemy {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x world pixel x
   * @param {number} y world pixel y
   * @param {object} [opts]
   * @param {number} [opts.level=1] character level → HP
   */
  constructor(scene, x, y, { level = 1 } = {}) {
    super(scene, x, y, {
      shape: 'dart',
      color: COLORS.enemyDart,
      level,
      hasFists: false, // it rams instead of punching
      showEyes: false, // a bare needle reads better than a face
    });
    this.kind = 'dart';
    this.rotates = true; // GameScene rotates the sprite so the tip leads

    // Serpentine patrol state: sweep a half-circle of `arcRadius`, then flip the
    // curl direction and pick a fresh radius (see GameScene.dartPatrol).
    this.arcDir = (x + y) % 2 ? 1 : -1; // initial curl direction varies per dart
    this.arcRadius = DART.arcRadiusMin;
    this.arcSwept = 0; // radians turned so far in the current half-circle

    // Charge state machine.
    this.dartPhase = 'patrol'; // patrol | approach | windup | charge | recover
    this.dartTimer = 0; // ms remaining in the current timed phase
    this.chargeVX = 0; // locked-in unit charge direction
    this.chargeVY = 0;
    this.contactTimer = 0; // ms until it can deal contact damage again
  }
}
