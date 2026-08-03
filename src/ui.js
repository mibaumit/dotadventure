// ============================================================================
// ui.js — shared menu UI widgets used by both the pause menu (PauseScene) and
// the title screen's Options overlay (StartScene), so the volume settings look
// and behave identically in both. The actual values live in sound.js module
// state, so they persist automatically across scene switches.
// ============================================================================

import { COLORS } from './config.js';

/**
 * Wire a scene so its volume sliders can be dragged: a single shared
 * pointermove/pointerup pair drives whichever slider last set `dragState.fn`.
 * Call once per scene, passing a plain `{ fn: null }` holder.
 */
export function attachSliderDrag(scene, dragState) {
  scene.input.on('pointermove', (pointer) => {
    if (dragState.fn && pointer.isDown) dragState.fn(pointer.x);
  });
  scene.input.on('pointerup', () => {
    dragState.fn = null;
  });
}

/**
 * A labelled, draggable volume slider centred on `cx` at height `y`, bound to
 * getVal/setVal (values in [0, 1]). Returns the array of created game objects so
 * the caller can set depth, toggle visibility, or destroy them together.
 * Dragging is coordinated through the shared `dragState` (see attachSliderDrag).
 */
export function makeVolumeSlider(scene, cx, y, label, getVal, setVal, dragState) {
  const trackX = cx - 30;
  const trackW = 150;
  const trackH = 8;

  const labelText = scene.add
    .text(cx - 140, y, label, { fontFamily: 'monospace', fontSize: '16px', color: '#cfe6ff' })
    .setOrigin(0, 0.5);

  const trackBg = scene.add.rectangle(trackX, y, trackW, trackH, 0x2a3350).setOrigin(0, 0.5);
  const fill = scene.add.rectangle(trackX, y, trackW, trackH, COLORS.player).setOrigin(0, 0.5);
  fill.scaleX = getVal();

  const pct = scene.add
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
  const zone = scene.add
    .zone(trackX, y - 14, trackW, 28)
    .setOrigin(0, 0)
    .setInteractive({ useHandCursor: true })
    .on('pointerdown', (pointer) => {
      dragState.fn = setFromX;
      setFromX(pointer.x);
    });

  return [labelText, trackBg, fill, pct, zone];
}
