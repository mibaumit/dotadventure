// ============================================================================
// main.js — entry point. Configures and boots the Phaser game.
// ============================================================================

import { COLORS } from './config.js';
import { StartScene } from './scenes/StartScene.js';
import { GameScene } from './scenes/GameScene.js';
import { PauseScene } from './scenes/PauseScene.js';

// Render every Text at the display's pixel density. Under Scale.RESIZE the
// canvas backing store is CSS-sized, so on a HiDPI / fractional Windows display
// scaling (devicePixelRatio > 1) text baked at 1× gets upscaled and looks soft.
// Patch the text factory once so ALL labels (menus, HUD, floating numbers) stay
// crisp — this only enlarges each text's texture, it doesn't affect layout.
const TEXT_RESOLUTION = Math.max(2, Math.ceil(window.devicePixelRatio || 1));
const _textFactory = Phaser.GameObjects.GameObjectFactory.prototype.text;
Phaser.GameObjects.GameObjectFactory.prototype.text = function (...args) {
  return _textFactory.apply(this, args).setResolution(TEXT_RESOLUTION);
};

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
  // StartScene boots first (title menu); it launches GameScene on Play.
  scene: [StartScene, GameScene, PauseScene],
};

const game = new Phaser.Game(config);

// Dev handle: lets you poke at the running game from the browser console
// (e.g. `game.scene.keys.GameScene`). Handy while building; harmless to ship.
window.game = game;
