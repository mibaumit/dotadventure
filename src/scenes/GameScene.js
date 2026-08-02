// ============================================================================
// GameScene.js — the main gameplay scene.
//
// FIRST SLICE ("hello world"): generate a dungeon, render it, and let you walk
// a single player dot around with WASD (with wall collision + a follow camera).
//
// Combat, the squad/orders system, enemies and recruiting are layered on next —
// this file is structured so those systems each become their own small method.
// ============================================================================

import { TILE, COLORS, UNIT, GAME } from '../config.js';
import { generateLevel, WALL, roomCenterTile } from '../levelgen.js';
import { makeShapeTexture, shapeTextureKey } from '../shapes.js';
import { makeRng, randInt } from '../util.js';
import { Enemy } from '../entities/Enemy.js';

export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  /** Scene entry data (carried between levels). */
  init(data) {
    this.depth = data?.depth ?? 1;
    this.seed = data?.seed ?? 12345;
  }

  create() {
    this.buildTextures();
    this.buildLevel();
    this.spawnPlayer();
    this.spawnEnemies();
    this.setupCamera();
    this.setupInput();
    this.buildHud();
  }

  // --------------------------------------------------------------------------
  // Setup
  // --------------------------------------------------------------------------

  /** Bake reusable shape textures at runtime — no external assets needed. */
  buildTextures() {
    const size = UNIT.radius * 2; // enemies match the dot's footprint
    makeShapeTexture(this, 'dot', 'circle', size);
    makeShapeTexture(this, shapeTextureKey('square'), 'square', size);
  }

  /** Generate the dungeon and render floor + collidable walls. */
  buildLevel() {
    this.level = generateLevel({
      width: GAME.tilesW,
      height: GAME.tilesH,
      depth: this.depth,
      seed: this.seed,
    });

    this.worldW = this.level.width * TILE;
    this.worldH = this.level.height * TILE;

    // Floor: one big rectangle behind everything.
    this.add
      .rectangle(0, 0, this.worldW, this.worldH, COLORS.floor)
      .setOrigin(0, 0)
      .setDepth(-10);

    // Walls: greedy-merged into horizontal strips so we have few, clean bodies.
    this.walls = this.physics.add.staticGroup();
    for (const rect of mergeWallStrips(this.level.grid)) {
      const px = rect.tx * TILE;
      const py = rect.ty * TILE;
      const w = rect.tw * TILE;
      const h = rect.th * TILE;
      const wall = this.add
        .rectangle(px + w / 2, py + h / 2, w, h, COLORS.wall)
        .setDepth(-5);
      this.physics.add.existing(wall, true); // true = static body
      this.walls.add(wall);
    }

    // Keep the world bounded to the dungeon.
    this.physics.world.setBounds(0, 0, this.worldW, this.worldH);
  }

  /** Create the single player dot in the first room. */
  spawnPlayer() {
    const start = roomCenterTile(this.level.rooms[0]);
    const x = (start.tx + 0.5) * TILE;
    const y = (start.ty + 0.5) * TILE;

    this.player = this.physics.add.sprite(x, y, 'dot');
    this.player.setTint(COLORS.player);
    this.player.body.setCircle(UNIT.radius);
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(1);

    this.physics.add.collider(this.player, this.walls);
  }

  /**
   * Populate every room EXCEPT the start room with a random set of enemies.
   * Deterministic per level so a given depth/seed always spawns the same fight.
   */
  spawnEnemies() {
    this.enemies = this.physics.add.group();
    const rng = makeRng(this.seed + this.depth * 7919);

    // rooms[0] is the player's start room — leave it clear.
    for (let i = 1; i < this.level.rooms.length; i++) {
      const room = this.level.rooms[i];
      const count = randInt(rng, 1, 2 + this.depth); // more enemies deeper down
      for (let n = 0; n < count; n++) {
        const tx = randInt(rng, room.x, room.x + room.w - 1);
        const ty = randInt(rng, room.y, room.y + room.h - 1);
        const enemy = new Enemy(this, (tx + 0.5) * TILE, (ty + 0.5) * TILE, {
          shape: 'square',
        });
        this.enemies.add(enemy);
      }
    }

    this.physics.add.collider(this.enemies, this.walls);
    this.physics.add.collider(this.player, this.enemies);
  }

  setupCamera() {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.worldW, this.worldH);
    cam.startFollow(this.player, true, 0.15, 0.15); // smooth lerp follow
  }

  setupInput() {
    this.keys = this.input.keyboard.addKeys('W,A,S,D');
    this.input.mouse.disableContextMenu(); // free up right-click for later
  }

  /** Fixed on-screen text (doesn't scroll with the world). */
  buildHud() {
    const style = { fontFamily: 'monospace', fontSize: '16px', color: '#cfe6ff' };
    this.add
      .text(12, 10, 'DotAdventure', { ...style, fontSize: '22px', color: '#3ad0ff' })
      .setScrollFactor(0)
      .setDepth(100);
    this.add
      .text(12, 40, 'Move: WASD   (first slice — enemies & squad next)', style)
      .setScrollFactor(0)
      .setDepth(100);
    this.hudText = this.add
      .text(12, 64, '', style)
      .setScrollFactor(0)
      .setDepth(100);
  }

  // --------------------------------------------------------------------------
  // Per-frame update
  // --------------------------------------------------------------------------

  update() {
    this.movePlayer();
    this.updateHud();
  }

  /** WASD → velocity, normalized so diagonals aren't faster. */
  movePlayer() {
    const k = this.keys;
    let vx = 0;
    let vy = 0;
    if (k.A.isDown) vx -= 1;
    if (k.D.isDown) vx += 1;
    if (k.W.isDown) vy -= 1;
    if (k.S.isDown) vy += 1;

    const len = Math.hypot(vx, vy);
    if (len > 0) {
      vx = (vx / len) * UNIT.speed;
      vy = (vy / len) * UNIT.speed;
    }
    this.player.setVelocity(vx, vy);
  }

  updateHud() {
    this.hudText.setText(
      `Depth ${this.depth}   Rooms ${this.level.rooms.length}   ` +
        `Enemies ${this.enemies.countActive(true)}`
    );
  }
}

// ============================================================================
// Local helpers (module-private)
// ============================================================================

/**
 * Greedy-merge horizontal runs of wall tiles into strips, so we create a
 * handful of wide collider rectangles instead of one per tile.
 * @returns {{tx:number,ty:number,tw:number,th:number}[]}  (tile units)
 */
function mergeWallStrips(grid) {
  const strips = [];
  const height = grid.length;
  const width = grid[0].length;
  for (let y = 0; y < height; y++) {
    let x = 0;
    while (x < width) {
      if (grid[y][x] === WALL) {
        const start = x;
        while (x < width && grid[y][x] === WALL) x++;
        strips.push({ tx: start, ty: y, tw: x - start, th: 1 });
      } else {
        x++;
      }
    }
  }
  return strips;
}
