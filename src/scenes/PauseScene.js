// ============================================================================
// PauseScene.js — a small overlay menu shown when you press Esc.
//
// It launches ON TOP of GameScene (which is paused underneath), dims the view,
// and offers Resume / Restart. Kept intentionally tiny; add buttons as needed.
// ============================================================================

import { COLORS } from '../config.js';

export class PauseScene extends Phaser.Scene {
  constructor() {
    super('PauseScene');
  }

  create() {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;
    const panelW = 320;
    const panelH = 220;

    // Dim the game behind the menu.
    this.add.rectangle(0, 0, width, height, 0x000000, 0.55).setOrigin(0, 0);

    // Menu panel.
    this.add
      .rectangle(cx, cy, panelW, panelH, 0x141a2b, 0.98)
      .setStrokeStyle(2, COLORS.player);

    this.add
      .text(cx, cy - panelH / 2 + 30, 'Paused', {
        fontFamily: 'monospace',
        fontSize: '30px',
        color: '#3ad0ff',
      })
      .setOrigin(0.5);

    this.makeButton(cx, cy - 14, 'Continue game', () => this.resumeGame());
    this.makeButton(cx, cy + 40, 'Restart game', () => this.restartGame());

    this.add
      .text(cx, cy + panelH / 2 - 22, 'Esc to resume', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#7f92b3',
      })
      .setOrigin(0.5);

    // Esc closes the menu again.
    this.input.keyboard.on('keydown-ESC', () => this.resumeGame());
  }

  /** A clickable text button with hover feedback. */
  makeButton(x, y, label, onClick) {
    const btn = this.add
      .text(x, y, label, { fontFamily: 'monospace', fontSize: '20px', color: '#cfe6ff' })
      .setOrigin(0.5)
      .setPadding(10)
      .setInteractive({ useHandCursor: true });

    btn.on('pointerover', () => btn.setColor('#ffffff'));
    btn.on('pointerout', () => btn.setColor('#cfe6ff'));
    btn.on('pointerdown', onClick);
    return btn;
  }

  /** Close the menu and un-pause the game underneath. */
  resumeGame() {
    this.scene.resume('GameScene');
    this.scene.stop();
  }

  /** Restart the whole run from depth 1. */
  restartGame() {
    this.scene.stop();
    this.scene.start('GameScene', { depth: 1, seed: 12345 });
  }
}
