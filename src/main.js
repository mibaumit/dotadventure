// ============================================================================
// main.js — entry point. Configures and boots the Phaser game.
// ============================================================================

import { COLORS } from './config.js';
import { GameScene } from './scenes/GameScene.js';

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
  scene: [GameScene],
};

// eslint-disable-next-line no-new
new Phaser.Game(config);
