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
  scale: {
    mode: Phaser.Scale.RESIZE, // fill the window; resize with it
    autoCenter: Phaser.Scale.CENTER_BOTH,
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
