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

export class PauseScene extends Phaser.Scene {
  constructor() {
    super('PauseScene');
  }

  create() {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;
    const panelW = 340;
    const panelH = 320;

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

    // Volume sliders.
    this.dragging = null;
    this.makeSlider(cy - 70, 'Music', getMusicVolume, setMusicVolume);
    this.makeSlider(cy - 34, 'Sound', getSfxVolume, setSfxVolume);
    this.input.on('pointermove', (pointer) => {
      if (this.dragging && pointer.isDown) this.dragging(pointer.x);
    });
    this.input.on('pointerup', () => {
      this.dragging = null;
    });

    this.makeButton(cx, cy + 24, 'Continue game', () => this.resumeGame());
    this.makeButton(cx, cy + 72, 'Restart game', () => this.restartGame());

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

  /** A labelled, draggable volume slider bound to get/set functions. */
  makeSlider(y, label, getVal, setVal) {
    const cx = this.scale.width / 2;
    const trackX = cx - 30;
    const trackW = 150;
    const trackH = 8;

    this.add
      .text(cx - 140, y, label, { fontFamily: 'monospace', fontSize: '16px', color: '#cfe6ff' })
      .setOrigin(0, 0.5);

    this.add.rectangle(trackX, y, trackW, trackH, 0x2a3350).setOrigin(0, 0.5);
    const fill = this.add
      .rectangle(trackX, y, trackW, trackH, COLORS.player)
      .setOrigin(0, 0.5);
    fill.scaleX = getVal();
    const pct = this.add
      .text(trackX + trackW + 12, y, `${Math.round(getVal() * 100)}%`, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#9fb4e0',
      })
      .setOrigin(0, 0.5);

    const setFromX = (px) => {
      const v = Phaser.Math.Clamp((px - trackX) / trackW, 0, 1);
      setVal(v);
      fill.scaleX = v;
      pct.setText(`${Math.round(v * 100)}%`);
    };

    // A hit area taller than the track for easy grabbing.
    this.add
      .zone(trackX, y - 14, trackW, 28)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', (pointer) => {
        this.dragging = setFromX;
        setFromX(pointer.x);
      });
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
