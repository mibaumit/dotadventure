// ============================================================================
// main.js — entry point. Configures and boots the Phaser game.
// ============================================================================

import { COLORS } from './config.js';
import { GameScene } from './scenes/GameScene.js';
import { PauseScene } from './scenes/PauseScene.js';

const config = {
  type: Phaser.AUTO, // WebGL if available, else Canvas
  parent: 'game',
  backgroundColor: COLORS.background,
  autoRound: true, // integer canvas dimensions — avoids sub-pixel scale ghosting
  scale: {
    mode: Phaser.Scale.RESIZE, // fill the window; resize with it
    // No autoCenter: in RESIZE mode the canvas already fills the parent, and
    // centering a fractional size was leaving a scaled ghost of the UI.
    width: '100%',
    height: '100%',
  },
  physics: {
    default: 'arcade',
    arcade: {
      debug: false, // set true to see physics bodies while developing
      gravity: { x: 0, y: 0 }, // top-down: no gravity
    },
  },
  scene: [GameScene, PauseScene],
};

const game = new Phaser.Game(config);

// Dev handle: lets you poke at the running game from the browser console
// (e.g. `game.scene.keys.GameScene`). Handy while building; harmless to ship.
window.game = game;
