// ============================================================================
// hudIcons.js — shared drawing for the bottom-left audio controls: the speaker
// (volume) icon and the "♪ Music N / M" switcher pill. Used by both the in-game
// HUD (GameScene) and the title menu (StartScene) so they stay pixel-identical.
//
// Each function draws into a provided Phaser.Graphics at (x, y) and returns the
// clickable screen-space hit rect {x, y, w, h}. `x` is the speaker icon's left
// edge; the music pill always sits 40px to its right.
// ============================================================================

import { COLORS } from './config.js';
import { getVolume, getMusicTrack } from './sound.js';

const ICON_COLOR = 0xcfe6ff; // shared cyan-white for the speaker + note glyphs
const MUSIC_GAP = 40; // px from the speaker's left edge to the music pill

/**
 * Point-in-rect hit test for a screen-space hit area {x, y, w, h}. `p` is any
 * object with x/y (e.g. a Phaser pointer). Safe against a null/undefined rect.
 */
export function pointInRect(p, r) {
  return !!r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

/**
 * Draw the speaker/volume icon (full → half → mute) at (x, y). Returns its hit
 * rect. Reads the live volume state from sound.js.
 */
export function drawSoundIcon(g, x, y) {
  g.clear();

  // Speaker body (small box) + cone (triangle).
  g.fillStyle(ICON_COLOR, 0.9);
  g.fillRect(x, y - 4, 6, 12);
  g.fillTriangle(x + 6, y - 8, x + 6, y + 12, x + 16, y + 2);

  const st = getVolume();
  if (st.muted) {
    // Red X to the right of the speaker.
    g.lineStyle(2, 0xff6b6b, 0.95);
    g.beginPath();
    g.moveTo(x + 21, y - 5);
    g.lineTo(x + 31, y + 9);
    g.moveTo(x + 31, y - 5);
    g.lineTo(x + 21, y + 9);
    g.strokePath();
  } else {
    // One or two "sound waves" depending on level.
    const waves = st.volume > 0.4 ? 2 : 1;
    g.lineStyle(2, ICON_COLOR, 0.9);
    for (let i = 0; i < waves; i++) {
      g.beginPath();
      g.arc(x + 16, y + 2, 6 + i * 5, -Math.PI / 4, Math.PI / 4);
      g.strokePath();
    }
  }

  return { x: x - 6, y: y - 12, w: 44, h: 30 };
}

/**
 * Draw the "♪ Music N / M" switcher pill 40px right of the speaker at (x, y),
 * captioning it with `label` (a Text with origin 0, 0.5). Returns its hit rect.
 */
export function drawMusicIcon(g, label, x, y) {
  g.clear();

  const { index, count } = getMusicTrack();
  label.setText(`♪ Music ${index + 1} / ${count}`);

  const gap = x + MUSIC_GAP;
  const padX = 9;
  const ph = 24;
  const pw = Math.ceil(label.width) + padX * 2;
  const py = y - ph / 2;

  // Pill background + cyan border (matches the menu buttons).
  g.fillStyle(0x141a2b, 0.92);
  g.fillRoundedRect(gap, py, pw, ph, 6);
  g.lineStyle(2, COLORS.player, 0.7);
  g.strokeRoundedRect(gap, py, pw, ph, 6);

  label.setPosition(gap + padX, y); // origin (0, 0.5) → vertically centred
  return { x: gap, y: py, w: pw, h: ph };
}
