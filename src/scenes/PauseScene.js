// ============================================================================
// PauseScene.js — the Esc overlay menu.
//
// Launches ON TOP of GameScene (paused underneath): dims the view, offers two
// volume sliders (music + game sounds) and Continue / Restart.
// ============================================================================

import { COLORS } from '../config.js';
import {
  getMusicVolume,
  setMusicVolume,
  getSfxVolume,
  setSfxVolume,
} from '../sound.js';
import { attachSliderDrag, makeVolumeSlider } from '../ui.js';

export class PauseScene extends Phaser.Scene {
  constructor() {
    super('PauseScene');
  }

  create() {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;
    const panelW = 340;
    const panelH = 380;

    // Dim the game behind the menu.
    this.add.rectangle(0, 0, width, height, 0x000000, 0.55).setOrigin(0, 0);

    // Menu panel.
    this.add
      .rectangle(cx, cy, panelW, panelH, 0x141a2b, 0.98)
      .setStrokeStyle(2, COLORS.player);

    this.add
      .text(cx, cy - panelH / 2 + 28, 'Paused', {
        fontFamily: 'monospace',
        fontSize: '30px',
        color: '#3ad0ff',
      })
      .setOrigin(0.5);

    // Volume sliders (shared with the title screen's Options overlay).
    this.dragState = { fn: null };
    attachSliderDrag(this, this.dragState);
    makeVolumeSlider(this, cx, cy - 70, 'Music', getMusicVolume, setMusicVolume, this.dragState);
    makeVolumeSlider(this, cx, cy - 34, 'Sound', getSfxVolume, setSfxVolume, this.dragState);

    this.makeButton(cx, cy + 16, 'Continue game', () => this.resumeGame());
    this.makeButton(cx, cy + 58, 'Restart game', () => this.restartGame());
    this.makeButton(cx, cy + 100, 'Main menu', () => this.mainMenu());

    this.add
      .text(cx, cy + panelH / 2 - 20, 'Esc / ☰ to resume', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#7f92b3',
      })
      .setOrigin(0.5);

    // Run status + controls (moved off the gameplay HUD to keep it clean/mobile).
    const gs = this.scene.get('GameScene');
    const lines = gs && gs.hudLines ? gs.hudLines() : [];
    let ty = cy + panelH / 2 + 22;
    for (const line of lines) {
      this.add
        .text(cx, ty, line, { fontFamily: 'monospace', fontSize: '13px', color: '#9fb4e0' })
        .setOrigin(0.5, 0);
      ty += 19;
    }

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

  /** Restart the whole run from depth 1 with a fresh random dungeon. */
  restartGame() {
    this.scene.stop();
    const seed = Math.floor(Math.random() * 0x7fffffff);
    this.scene.start('GameScene', { depth: 1, seed });
  }

  /** Abandon the run and return to the title screen. */
  mainMenu() {
    this.scene.stop('GameScene');
    this.scene.stop();
    this.scene.start('StartScene');
  }
}
