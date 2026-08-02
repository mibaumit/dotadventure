// ============================================================================
// GameScene.js — the main gameplay scene.
//
// FIRST SLICE ("hello world"): generate a dungeon, render it, and let you walk
// a single player dot around with WASD (with wall collision + a follow camera).
//
// Combat, the squad/orders system, enemies and recruiting are layered on next —
// this file is structured so those systems each become their own small method.
// ============================================================================

import { TILE, COLORS, UNIT, ENEMY, GAME } from '../config.js';
import { generateLevel, WALL, roomCenterTile } from '../levelgen.js';
import { makeShapeTexture, shapeTextureKey } from '../shapes.js';
import { makeRng, randInt, dist, angleDelta, angleBetween, clamp, TAU } from '../util.js';
import { Enemy } from '../entities/Enemy.js';
import { getWeapon } from '../weapons.js';
import {
  ensureStarted,
  playFootstep,
  playPunch,
  playAggro,
  cycleVolume,
  getVolume,
} from '../sound.js';

export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  /** Scene entry data (carried between levels). */
  init(data) {
    this.depth = data?.depth ?? 1;
    this.seed = data?.seed ?? 12345;
    this.carryPlayer = data?.player ?? null; // progression carried from above
    this.descending = false; // guards the descend trigger
    this.gameTime = data?.gameTime ?? 0; // ms of un-frozen play time this run
    this.frozen = false; // tactical time-freeze (Space)
    this.stepTimer = 0; // footstep-sound cadence
  }

  create() {
    this.buildTextures();
    this.buildLevel();
    this.buildExit();
    this.spawnPlayer();
    this.spawnEnemies();
    this.setupCamera();
    this.setupInput();
    this.buildHud();
    this.setupOverlay();
    this.setupFog();
  }

  // --------------------------------------------------------------------------
  // Setup
  // --------------------------------------------------------------------------

  /** Bake reusable shape textures at runtime — no external assets needed. */
  buildTextures() {
    const size = UNIT.radius * 2; // enemies match the dot's footprint
    makeShapeTexture(this, 'dot', 'circle', size);
    makeShapeTexture(this, shapeTextureKey('square'), 'square', size);
    makeShapeTexture(this, 'fist', 'circle', Math.round(UNIT.radius * 0.8)); // little punch
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

  /** Create the player dot at the level's (safe) start point. */
  spawnPlayer() {
    const x = (this.level.start.tx + 0.5) * TILE;
    const y = (this.level.start.ty + 0.5) * TILE;

    this.player = this.physics.add.sprite(x, y, 'dot');
    this.player.setTint(COLORS.player);
    this.player.body.setCircle(UNIT.radius);
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(1);

    // Combat state. No weapon equipped → fists (1 dmg).
    this.player.faction = 'player';
    this.player.level = 1;
    this.player.maxHp = 10;
    this.player.hp = 10;
    this.player.baseColor = COLORS.player; // for hit-flash restore
    this.player.dead = false;
    this.player.xp = 0;
    this.player.xpToNext = this.player.level * 10; // first level-up needs 10 xp
    this.player.weapon = getWeapon('fists');
    this.player.attackTimer = 0; // ms until the next auto-attack is ready
    this.player.attackTarget = null; // enemy currently being boxed (fists face it)
    this.player.moveTarget = null; // click-to-move destination, or null
    this.player.bestDist = Infinity; // closest we've gotten to moveTarget (stuck check)
    this.player.stuckTime = 0; // ms of no progress toward moveTarget
    this.player.focusEnemy = null; // clicked enemy to chase & auto-attack, or null
    this.player.punchToggle = false; // alternates which side-fist punches
    this.player.wigPhase = 0; // fist-wiggle phase offset (see updateFistsFor)
    this.player.facing = -Math.PI / 2; // last-moved direction (starts facing up)
    this.player.takeDamage = (amount) => this.damagePlayer(amount);
    // On each attack, thrust one of the character's side-fists at the target.
    this.player.startSwing = (angle, scale = 1) => this.punchSideFist(this.player, angle, scale);

    // Carry progression down from the previous level (permadeath run).
    if (this.carryPlayer) {
      const c = this.carryPlayer;
      this.player.level = c.level;
      this.player.xp = c.xp;
      this.player.xpToNext = c.xpToNext;
      this.player.maxHp = c.maxHp;
      this.player.hp = c.hp;
      this.player.weapon = getWeapon(c.weaponId);
    }

    // Two little fist-dots that ride on the character's sides (darker shade).
    this.player.fistL = this.makeFist();
    this.player.fistR = this.makeFist();

    this.physics.add.collider(this.player, this.walls);
  }

  /** Draw the descent staircase at the level's exit and record its position. */
  buildExit() {
    const ex = (this.level.exit.tx + 0.5) * TILE;
    const ey = (this.level.exit.ty + 0.5) * TILE;
    this.exit = { x: ex, y: ey };

    const s = TILE * 0.72;
    const g = this.add.graphics().setDepth(-3);
    g.fillStyle(0x243049, 1); // recessed base tile
    g.fillRect(ex - s / 2 - 3, ey - s / 2 - 3, s + 6, s + 6);

    // Descending steps (narrowing) to read as "down".
    const steps = 4;
    const stepH = s / steps;
    g.fillStyle(0x9fb4e0, 1);
    for (let i = 0; i < steps; i++) {
      const w = s * (1 - i / (steps + 1));
      g.fillRect(ex - w / 2, ey - s / 2 + i * stepH, w, stepH - 2);
    }

    this.add
      .text(ex, ey - s / 2 - 6, '▼ down', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#cfe6ff',
      })
      .setOrigin(0.5, 1)
      .setDepth(-3);
  }

  /** A small, darker "fist" dot that rides beside the character. */
  makeFist() {
    return this.add.image(0, 0, 'fist').setTint(COLORS.playerFist).setDepth(0);
  }

  /**
   * Populate every room EXCEPT the start room with a random set of enemies.
   * Deterministic per level so a given depth/seed always spawns the same fight.
   */
  spawnEnemies() {
    this.enemies = this.physics.add.group();
    const rng = makeRng(this.seed + this.depth * 7919);

    // Keep a buffer around the start so nothing can aggro the player instantly.
    const startX = (this.level.start.tx + 0.5) * TILE;
    const startY = (this.level.start.ty + 0.5) * TILE;
    const safeRadius = ENEMY.aggroRange + 80;

    // rooms[0] is the player's start room — leave it clear.
    for (let i = 1; i < this.level.rooms.length; i++) {
      const room = this.level.rooms[i];
      const count = randInt(rng, 1, 2 + this.depth); // more enemies deeper down
      for (let n = 0; n < count; n++) {
        const tx = randInt(rng, room.x, room.x + room.w - 1);
        const ty = randInt(rng, room.y, room.y + room.h - 1);
        const px = (tx + 0.5) * TILE;
        const py = (ty + 0.5) * TILE;
        if (dist(px, py, startX, startY) < safeRadius) continue; // too near the start

        const level = randInt(rng, 1, this.depth); // tougher enemies deeper down
        const enemy = new Enemy(this, px, py, { shape: 'square', level });
        this.enemies.add(enemy);
      }
    }

    this.physics.add.collider(this.enemies, this.walls);
    this.physics.add.collider(this.player, this.enemies);
    // Enemy-vs-enemy spacing is enforced explicitly in separateEnemies() — the
    // Arcade collider doesn't reliably push apart enemies moving in lockstep.
  }

  setupCamera() {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.worldW, this.worldH);
    cam.startFollow(this.player, true, 0.15, 0.15); // smooth lerp follow
  }

  setupInput() {
    this.keys = this.input.keyboard.addKeys('W,A,S,D');
    this.input.mouse.disableContextMenu(); // free up right-click for later

    // Any input is a user gesture — safe to start audio (idempotent).
    this.input.on('pointerdown', () => ensureStarted());
    this.input.keyboard.on('keydown', () => ensureStarted());

    // Left-click: an enemy → chase & attack it; the ground → walk there.
    // (WASD overrides either.)
    this.input.on('pointerdown', (pointer) => {
      // Clicking the sound icon cycles volume and consumes the click.
      if (this.overSoundIcon(pointer.x, pointer.y)) {
        cycleVolume();
        return;
      }
      if (this.player.dead) return;
      if (!pointer.leftButtonDown()) return;

      const enemy = this.enemyAt(pointer.worldX, pointer.worldY);
      if (enemy) {
        this.player.focusEnemy = enemy; // attack order
        this.player.moveTarget = null;
        this.showAttackMarker(enemy.x, enemy.y);
      } else {
        this.player.focusEnemy = null;
        this.player.moveTarget = { x: pointer.worldX, y: pointer.worldY };
        this.player.bestDist = Infinity; // reset progress tracker for the new order
        this.player.stuckTime = 0;
        this.showMoveMarker(pointer.worldX, pointer.worldY);
      }
    });

    // Space toggles a tactical time-freeze: simulation halts, but you can still
    // click to issue orders. (Capture it so the page doesn't scroll.)
    this.input.keyboard.addCapture('SPACE');
    this.input.keyboard.on('keydown-SPACE', () => this.toggleFreeze());

    // Esc opens the pause menu (which pauses this scene underneath).
    this.input.keyboard.on('keydown-ESC', () => {
      if (!this.scene.isPaused()) {
        this.scene.pause();
        this.scene.launch('PauseScene');
      }
    });
  }

  /** Space: freeze/unfreeze the simulation while leaving order-input live. */
  toggleFreeze() {
    if (this.player.dead) return;
    this.frozen = !this.frozen;
    if (this.frozen) this.physics.pause();
    else this.physics.resume();
  }

  /** A brief expanding ring at a click-to-move destination. */
  showMoveMarker(x, y) {
    const ring = this.add
      .circle(x, y, 6, COLORS.player, 0)
      .setStrokeStyle(2, COLORS.player, 0.9)
      .setDepth(0);
    this.tweens.add({
      targets: ring,
      scale: 2.2,
      alpha: 0,
      duration: 380,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  /** A brief red ring marking an attack order placed on an enemy. */
  showAttackMarker(x, y) {
    const ring = this.add
      .circle(x, y, 11, COLORS.enemyMelee, 0)
      .setStrokeStyle(2, COLORS.enemyMelee, 0.95)
      .setDepth(2);
    this.tweens.add({
      targets: ring,
      scale: 1.8,
      alpha: 0,
      duration: 360,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  /** Nearest active enemy to a world point, within a small click radius, or null. */
  enemyAt(x, y) {
    let best = null;
    let bestDist = ENEMY.radius + 10;
    for (const e of this.enemies.getChildren()) {
      if (!e.active) continue;
      const d = dist(x, y, e.x, e.y);
      if (d <= bestDist) {
        bestDist = d;
        best = e;
      }
    }
    return best;
  }

  /** Fixed on-screen text (doesn't scroll with the world). */
  buildHud() {
    const style = { fontFamily: 'monospace', fontSize: '16px', color: '#cfe6ff' };
    this.add
      .text(12, 10, 'DotAdventure', { ...style, fontSize: '22px', color: '#3ad0ff' })
      .setScrollFactor(0)
      .setDepth(100);
    this.add
      .text(12, 40, 'WASD/click move · click a square to attack · Space freeze · ▼ descend', style)
      .setScrollFactor(0)
      .setDepth(100);
    this.hudText = this.add
      .text(12, 64, '', style)
      .setScrollFactor(0)
      .setDepth(100);
  }

  /**
   * Fog of war on a fine sub-tile grid (GAME.fogCell px) for a smooth, round
   * reveal. A radius around the dot is revealed (raycast so walls block sight);
   * cells seen before stay dimly "explored". Drawn above the world/entities so
   * fogged enemies are hidden.
   */
  setupFog() {
    this.fogCell = GAME.fogCell;
    this.fogW = Math.ceil(this.worldW / this.fogCell);
    this.fogH = Math.ceil(this.worldH / this.fogCell);
    this.explored = Array.from({ length: this.fogH }, () => new Array(this.fogW).fill(false));
    this.visibleCells = new Set();
    this.fog = this.add.graphics().setDepth(60);
    this.lastFogCX = -999;
    this.lastFogCY = -999;
    this.markStartRoomExplored(); // the whole first room is revealed up front
    this.recomputeFog();
  }

  /** Mark every fog cell inside the starting room as explored. */
  markStartRoomExplored() {
    const room = this.level.rooms[0];
    const c = this.fogCell;
    const cx0 = Math.floor((room.x * TILE) / c);
    const cy0 = Math.floor((room.y * TILE) / c);
    const cx1 = Math.ceil(((room.x + room.w) * TILE) / c);
    const cy1 = Math.ceil(((room.y + room.h) * TILE) / c);
    for (let cy = Math.max(0, cy0); cy < Math.min(this.fogH, cy1); cy++) {
      for (let cx = Math.max(0, cx0); cx < Math.min(this.fogW, cx1); cx++) {
        this.explored[cy][cx] = true;
      }
    }
  }

  /** Reveal a circular, wall-blocked area around the dot; mark it explored. */
  recomputeFog() {
    const c = this.fogCell;
    const px = this.player.x;
    const py = this.player.y;
    const range = GAME.visionTiles * TILE;
    const RAYS = 160;
    const step = c * 0.5;

    const vis = this.visibleCells;
    vis.clear();
    for (let i = 0; i < RAYS; i++) {
      const a = (i / RAYS) * TAU;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      for (let dist = 0; dist <= range; dist += step) {
        const wx = px + dx * dist;
        const wy = py + dy * dist;
        const cx = Math.floor(wx / c);
        const cy = Math.floor(wy / c);
        if (cx < 0 || cy < 0 || cx >= this.fogW || cy >= this.fogH) break;
        vis.add(cy * this.fogW + cx);
        this.explored[cy][cx] = true;

        const tx = Math.floor(wx / TILE);
        const ty = Math.floor(wy / TILE);
        const row = this.level.grid[ty];
        if (!row || row[tx] === WALL) {
          if (row) this.revealTile(tx, ty); // show the whole 40px wall block
          break;
        }
      }
    }
    this.drawFog();
  }

  /** Reveal every fog cell overlapping tile (tx,ty) — so walls show full-size. */
  revealTile(tx, ty) {
    const c = this.fogCell;
    const cx0 = Math.max(0, Math.floor((tx * TILE) / c));
    const cy0 = Math.max(0, Math.floor((ty * TILE) / c));
    const cx1 = Math.min(this.fogW, Math.ceil(((tx + 1) * TILE) / c));
    const cy1 = Math.min(this.fogH, Math.ceil(((ty + 1) * TILE) / c));
    for (let cy = cy0; cy < cy1; cy++) {
      for (let cx = cx0; cx < cx1; cx++) {
        this.visibleCells.add(cy * this.fogW + cx);
        this.explored[cy][cx] = true;
      }
    }
  }

  /** Paint fog: unexplored = black, explored-but-unseen = dim, visible = clear.
   *  Cells are merged into horizontal runs so we draw few rects. */
  drawFog() {
    const g = this.fog;
    g.clear();
    const { fogW, fogH, fogCell: c, visibleCells: vis, explored } = this;
    const stateAt = (cx, cy) => (vis.has(cy * fogW + cx) ? 0 : explored[cy][cx] ? 1 : 2);
    for (let cy = 0; cy < fogH; cy++) {
      let cx = 0;
      while (cx < fogW) {
        const state = stateAt(cx, cy);
        if (state === 0) {
          cx++;
          continue; // visible → no fog
        }
        const start = cx;
        while (cx < fogW && stateAt(cx, cy) === state) cx++;
        g.fillStyle(0x05070d, state === 1 ? 0.55 : 1);
        g.fillRect(start * c, cy * c, (cx - start) * c, c);
      }
    }
  }

  /** World-space overlay (health bars, dot level) + fixed top-right XP UI. */
  setupOverlay() {
    this.coneFx = this.add.graphics().setDepth(-2); // sight cones, under the entities
    this.fx = this.add.graphics().setDepth(50); // world-space, redrawn every frame
    this.playerLabel = this.add
      .text(0, 0, '', { fontFamily: 'monospace', fontSize: '12px', color: '#ffffff' })
      .setOrigin(0.5, 1)
      .setDepth(50);

    // Fixed top-right corner: Level + XP bar (screen-space, doesn't scroll).
    this.levelText = this.add
      .text(0, 0, '', { fontFamily: 'monospace', fontSize: '20px', color: '#ffcf5c' })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(100);
    this.xpBarBg = this.add
      .rectangle(0, 0, 170, 10, COLORS.hpBack, 0.5)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(100);
    this.xpBarFill = this.add
      .rectangle(0, 0, 170, 10, COLORS.xp)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(101);
    this.xpText = this.add
      .text(0, 0, '', { fontFamily: 'monospace', fontSize: '12px', color: '#cfe6ff' })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(101);

    // Bottom-left: clickable sound icon (cycles volume: full → half → mute).
    this.soundIcon = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.soundRect = { x: 0, y: 0, w: 0, h: 0 };

    // Bottom-right: game timer above a big play/pause (time-freeze) indicator.
    this.timeIcon = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.timerText = this.add
      .text(0, 0, '', { fontFamily: 'monospace', fontSize: '18px', color: '#cfe6ff' })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(100);
  }

  // --------------------------------------------------------------------------
  // Per-frame update
  // --------------------------------------------------------------------------

  update(time, delta) {
    // When frozen, the simulation halts but order-input (clicks) stays live.
    if (!this.frozen && !this.player.dead) {
      this.gameTime += delta; // timer only advances during un-frozen play
      this.movePlayer(delta);
      this.updateFistsFor(this.player, time, UNIT.radius);
      this.updatePlayerCombat(delta);
      this.checkDescend();
      this.updateFootsteps(delta);
    }
    if (!this.frozen && !this.player.dead) this.updateEnemies(delta);
    if (!this.frozen) {
      this.separateEnemies();
      for (const e of this.enemies.getChildren()) {
        if (e.active) this.updateFistsFor(e, time, ENEMY.radius);
      }
    }

    // Fog of war: re-reveal when the dot crosses a fog cell (smooth updates).
    const fcx = Math.floor(this.player.x / this.fogCell);
    const fcy = Math.floor(this.player.y / this.fogCell);
    if (fcx !== this.lastFogCX || fcy !== this.lastFogCY) {
      this.lastFogCX = fcx;
      this.lastFogCY = fcy;
      this.recomputeFog();
    }

    this.drawSightCones();
    this.drawOverlays();
    this.updateXpUi();
    this.updateHud();
    this.updateTimeIndicator();
    this.drawSoundIcon();
  }

  /** Is the given screen point over the bottom-left sound icon? */
  overSoundIcon(sx, sy) {
    const r = this.soundRect;
    return sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h;
  }

  /** Draw the bottom-left speaker icon reflecting the current volume state. */
  drawSoundIcon() {
    const g = this.soundIcon;
    g.clear();

    const x = 18;
    const y = this.scale.height - 34;
    this.soundRect = { x: x - 6, y: y - 12, w: 44, h: 30 }; // clickable hit area

    const col = 0xcfe6ff;
    // Speaker body (small box) + cone (triangle).
    g.fillStyle(col, 0.9);
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
      g.lineStyle(2, col, 0.9);
      for (let i = 0; i < waves; i++) {
        g.beginPath();
        g.arc(x + 16, y + 2, 6 + i * 5, -Math.PI / 4, Math.PI / 4);
        g.strokePath();
      }
    }
  }

  /**
   * Draw the sight cone of each un-alerted enemy that the PLAYER can currently
   * see (line of sight, no wall between). Each cone is raycast against walls so
   * it doesn't bleed through them.
   */
  drawSightCones() {
    const g = this.coneFx;
    g.clear();
    const p = this.player;
    const RAYS = 26;

    for (const e of this.enemies.getChildren()) {
      if (!e.active || e.alerted) continue;
      if (!this.hasLineOfSight(p.x, p.y, e.x, e.y)) continue; // only cones you can see

      const points = [{ x: e.x, y: e.y }]; // fan starts at the enemy
      for (let i = 0; i <= RAYS; i++) {
        const a = e.facing - ENEMY.viewAngle + (2 * ENEMY.viewAngle) * (i / RAYS);
        points.push(this.raycastToWall(e.x, e.y, a, ENEMY.sightRange));
      }

      g.fillStyle(e.baseColor, 0.14);
      g.fillPoints(points, true);
    }
  }

  /** Draw the bottom-right play/pause icon and the mm:ss game timer above it. */
  updateTimeIndicator() {
    const cx = this.scale.width - 42;
    const cy = this.scale.height - 42;
    const size = 40;

    const g = this.timeIcon;
    g.clear();
    if (this.frozen) {
      g.fillStyle(0xffcf5c, 1); // paused → two amber bars
      g.fillRect(cx - 16, cy - size / 2, 12, size);
      g.fillRect(cx + 4, cy - size / 2, 12, size);
    } else {
      g.fillStyle(0x57e389, 1); // running → green play triangle
      g.fillTriangle(cx - 14, cy - size / 2, cx - 14, cy + size / 2, cx + 22, cy);
    }

    const totalSec = Math.floor(this.gameTime / 1000);
    const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const ss = String(totalSec % 60).padStart(2, '0');
    this.timerText.setPosition(cx + 2, cy - size / 2 - 8).setText(`${mm}:${ss}`);
  }

  /** Descend to the next dungeon level when the player reaches the stairs. */
  checkDescend() {
    if (this.descending) return;
    if (dist(this.player.x, this.player.y, this.exit.x, this.exit.y) < TILE * 0.55) {
      this.descend();
    }
  }

  /** Rebuild the scene one level deeper, carrying the player's progression. */
  descend() {
    this.descending = true;
    const p = this.player;
    this.scene.restart({
      depth: this.depth + 1,
      seed: this.seed,
      gameTime: this.gameTime, // keep the run timer going
      player: {
        level: p.level,
        xp: p.xp,
        xpToNext: p.xpToNext,
        maxHp: p.maxHp,
        hp: GAME.healOnDescend ? p.maxHp : p.hp,
        weaponId: p.weapon.id,
      },
    });
  }

  /**
   * Position an owner's two side-fists each frame (works for the player AND
   * enemies). While it has an active attackTarget the fists are held up toward
   * that target (staying on its side between punches); otherwise they ride on
   * the owner's left/right and wiggle as it moves. A fist that's mid-punch is
   * driven by its tween, so we leave it alone.
   */
  updateFistsFor(owner, time, radius) {
    const v = owner.body.velocity;
    const moving = Math.hypot(v.x, v.y) > 5;
    if (moving) owner.facing = Math.atan2(v.y, v.x); // face where we're heading

    const lateral = radius + 4;

    if (owner.attackTarget && owner.attackTarget.active) {
      // Guard: both fists flank the direction of the target, on its side.
      const aim = angleBetween(owner.x, owner.y, owner.attackTarget.x, owner.attackTarget.y);
      const spread = Math.PI * 0.3; // ~54° either side of the aim
      this.placeFist(owner.fistL, owner, aim - spread, lateral);
      this.placeFist(owner.fistR, owner, aim + spread, lateral);
      return;
    }

    // Idle / moving: fists on the owner's left & right, bobbing out of phase.
    const side = owner.facing + Math.PI / 2;
    const wig = moving ? Math.sin(time * 0.02 + owner.wigPhase) * 4 : 0;
    const fx = Math.cos(owner.facing);
    const fy = Math.sin(owner.facing);
    const sx = Math.cos(side);
    const sy = Math.sin(side);
    if (!owner.fistL.punching) {
      owner.fistL.setPosition(owner.x + sx * lateral + fx * wig, owner.y + sy * lateral + fy * wig);
    }
    if (!owner.fistR.punching) {
      owner.fistR.setPosition(owner.x - sx * lateral - fx * wig, owner.y - sy * lateral - fy * wig);
    }
  }

  /** Place a fist at `angle`/`dist` from an owner, unless it's mid-punch. */
  placeFist(fist, owner, angle, dist) {
    if (fist.punching) return; // its tween owns the position right now
    fist.setPosition(owner.x + Math.cos(angle) * dist, owner.y + Math.sin(angle) * dist);
  }

  /**
   * Push apart any enemies that overlap by more than ~5% of their size, so they
   * never occupy the same space (deterministic — doesn't rely on Arcade's
   * collision separation, which is unreliable for lockstep-moving bodies).
   */
  separateEnemies() {
    const minDist = UNIT.radius * 2 * 0.95; // allow up to 5% visual overlap
    const es = this.enemies.getChildren();
    for (let i = 0; i < es.length; i++) {
      const a = es[i];
      if (!a.active) continue;
      for (let j = i + 1; j < es.length; j++) {
        const b = es[j];
        if (!b.active) continue;

        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d === 0) {
          dx = 1; // nudge apart if perfectly stacked
          dy = 0;
          d = 1;
        }
        if (d < minDist) {
          const push = (minDist - d) / 2;
          const nx = dx / d;
          const ny = dy / d;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        }
      }
    }
  }

  /**
   * True if a straight line from (ax,ay) to (bx,by) crosses no wall tiles.
   * Samples the grid a few times per tile — good enough for tile-sized walls.
   */
  hasLineOfSight(ax, ay, bx, by) {
    const d = Math.hypot(bx - ax, by - ay);
    const steps = Math.ceil(d / (TILE * 0.4)); // ~2.5 samples per tile
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const tx = Math.floor((ax + (bx - ax) * t) / TILE);
      const ty = Math.floor((ay + (by - ay) * t) / TILE);
      const row = this.level.grid[ty];
      if (!row || row[tx] === WALL) return false;
    }
    return true;
  }

  /** Can enemy `e` see the player? Inside its cone (range + angle) with clear sight. */
  enemyCanSee(e, p, d) {
    if (d > ENEMY.sightRange) return false;
    const toPlayer = angleBetween(e.x, e.y, p.x, p.y);
    if (Math.abs(angleDelta(e.facing, toPlayer)) > ENEMY.viewAngle) return false;
    return this.hasLineOfSight(e.x, e.y, p.x, p.y);
  }

  /**
   * March a ray from (x,y) at `angle` until it hits a wall tile or reaches
   * `maxDist`; return the stopping point. Used to clip sight cones at walls.
   */
  raycastToWall(x, y, angle, maxDist) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const step = TILE * 0.25;
    for (let dist = step; dist < maxDist; dist += step) {
      const tx = Math.floor((x + dx * dist) / TILE);
      const ty = Math.floor((y + dy * dist) / TILE);
      const row = this.level.grid[ty];
      if (!row || row[tx] === WALL) {
        return { x: x + dx * (dist - step), y: y + dy * (dist - step) };
      }
    }
    return { x: x + dx * maxDist, y: y + dy * maxDist };
  }

  /** Enemy AI: chase the player when seen & in range, punch when adjacent. */
  updateEnemies(delta) {
    const p = this.player;
    for (const e of this.enemies.getChildren()) {
      if (!e.active) continue;
      if (e.attackTimer > 0) e.attackTimer -= delta;

      // Growl once each time it becomes alerted (by sight or by being hit).
      if (e.alerted && !e.announcedAggro) {
        playAggro();
        e.announcedAggro = true;
      } else if (!e.alerted) {
        e.announcedAggro = false;
      }

      if (p.dead) {
        e.setVelocity(0, 0);
        e.attackTarget = null;
        continue;
      }

      const d = dist(e.x, e.y, p.x, p.y);

      // Only wake up when the player is inside the sight cone (range + angle)
      // and not hidden behind a wall. Once alerted, chase until the player
      // escapes aggro range.
      if (!e.alerted) {
        if (this.enemyCanSee(e, p, d)) {
          e.alerted = true;
        } else {
          e.facing += e.lookSpeed * (delta / 1000); // sweep the cone while idle
          e.setVelocity(0, 0);
          e.attackTarget = null;
          continue;
        }
      }

      if (d > ENEMY.aggroRange) {
        e.alerted = false; // player escaped — go back to sleep
        e.setVelocity(0, 0);
        e.attackTarget = null;
        continue;
      }

      e.facing = angleBetween(e.x, e.y, p.x, p.y); // turn to face the player
      if (d <= e.weapon.range) {
        e.setVelocity(0, 0); // in reach — stop and swing
        e.attackTarget = p; // fists box the player
        if (e.attackTimer <= 0) {
          e.weapon.attack({ scene: this, owner: e, target: p });
          e.attackTimer = e.weapon.cooldown;
        }
      } else {
        e.setVelocity(Math.cos(e.facing) * e.speed, Math.sin(e.facing) * e.speed);
        e.attackTarget = null; // fists ride on the sides while chasing
      }
    }
  }

  /** Redraw all world-space bars/labels: player HP+XP+level, and each enemy. */
  drawOverlays() {
    this.fx.clear();

    // Player: HP bar + level label above the dot (XP lives in the top-right UI).
    this.drawHealthBar(this.player, UNIT.radius);
    this.drawFace(this.player, UNIT.radius);
    this.playerLabel
      .setPosition(this.player.x, this.player.y - UNIT.radius - 12)
      .setText(`Lv ${this.player.level}`);

    // Enemies: HP bar + level label + face each.
    for (const e of this.enemies.getChildren()) {
      if (!e.active) continue;
      this.drawHealthBar(e, ENEMY.radius);
      this.drawFace(e, ENEMY.radius);
      e.label.setPosition(e.x, e.y - ENEMY.radius - 12).setText(`Lv ${e.level}`);
    }
  }

  /** Draw two little dark eyes on `entity`, looking in its facing direction. */
  drawFace(entity, radius) {
    const f = entity.facing ?? 0;
    const fwd = radius * 0.42; // eyes sit toward the front
    const spread = radius * 0.4; // sideways gap between eyes
    const ex = entity.x + Math.cos(f) * fwd;
    const ey = entity.y + Math.sin(f) * fwd;
    const px = Math.cos(f + Math.PI / 2) * spread;
    const py = Math.sin(f + Math.PI / 2) * spread;
    const r = Math.max(2, radius * 0.17);

    const g = this.fx;
    g.fillStyle(0x0d1019, 1); // dark eyes
    g.fillCircle(ex + px, ey + py, r);
    g.fillCircle(ex - px, ey - py, r);
  }

  /** Draw a small HP bar centered above an entity. */
  drawHealthBar(entity, radius) {
    const w = radius * 2;
    const h = 4;
    const x = entity.x - w / 2;
    const y = entity.y - radius - 8;
    const pct = clamp(entity.hp / entity.maxHp, 0, 1);

    const g = this.fx;
    g.fillStyle(COLORS.hpBack, 0.6);
    g.fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle(pct > 0.3 ? COLORS.hpGood : COLORS.hpLow, 1);
    g.fillRect(x, y, w * pct, h);
  }

  /** Reposition + refill the fixed top-right XP bar and level readout. */
  updateXpUi() {
    const p = this.player;
    const margin = 14;
    const barW = 170;
    const barH = 10;
    const x = this.scale.width - margin - barW;
    const yBar = 40;

    this.levelText.setPosition(this.scale.width - margin, 12).setText(`Level ${p.level}`);
    this.xpBarBg.setPosition(x, yBar);
    this.xpBarFill.setPosition(x, yBar).setDisplaySize(barW * clamp(p.xp / p.xpToNext, 0, 1), barH);
    this.xpText
      .setPosition(this.scale.width - margin, yBar + barH + 3)
      .setText(`${p.xp} / ${p.xpToNext} XP`);
  }

  /**
   * Move the dot. WASD is direct control and takes priority (and cancels any
   * click-move). Otherwise, if a click-to-move target is set, steer toward it,
   * slowing on approach and stopping when arrived.
   */
  movePlayer(delta) {
    const p = this.player;
    const k = this.keys;

    let vx = 0;
    let vy = 0;
    if (k.A.isDown) vx -= 1;
    if (k.D.isDown) vx += 1;
    if (k.W.isDown) vy -= 1;
    if (k.S.isDown) vy += 1;

    if (vx !== 0 || vy !== 0) {
      p.moveTarget = null; // manual control wins
      p.focusEnemy = null;
      const len = Math.hypot(vx, vy);
      p.setVelocity((vx / len) * UNIT.speed, (vy / len) * UNIT.speed);
      return;
    }

    // Attack order: chase the clicked enemy, stop once it's in weapon range.
    if (p.focusEnemy) {
      if (!p.focusEnemy.active) {
        p.focusEnemy = null;
      } else {
        const ex = p.focusEnemy.x - p.x;
        const ey = p.focusEnemy.y - p.y;
        const d = Math.hypot(ex, ey);
        if (d <= p.weapon.range) {
          p.setVelocity(0, 0); // in reach — hold position and let combat swing
        } else {
          p.setVelocity((ex / d) * UNIT.speed, (ey / d) * UNIT.speed);
        }
        return;
      }
    }

    if (p.moveTarget) {
      const dx = p.moveTarget.x - p.x;
      const dy = p.moveTarget.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d <= UNIT.stopRadius) {
        p.moveTarget = null;
        p.setVelocity(0, 0);
        return;
      }

      // Steer toward the target. The wall collider slides the dot along walls —
      // it loses only the into-wall component, so a glancing touch merely slows
      // it (by the hit angle) rather than stopping it dead.
      const speed = d < UNIT.arriveRadius ? UNIT.speed * (d / UNIT.arriveRadius) : UNIT.speed;
      p.setVelocity((dx / d) * speed, (dy / d) * speed);

      // Only give up if we make no real progress for a while (no pathfinding yet).
      if (d < p.bestDist - 1) {
        p.bestDist = d;
        p.stuckTime = 0;
      } else {
        p.stuckTime += delta;
        if (p.stuckTime > 1200) {
          p.moveTarget = null;
          p.setVelocity(0, 0);
        }
      }
      return;
    }

    p.setVelocity(0, 0);
  }

  /** Play a footstep sound on a steady cadence while the dot is moving. */
  updateFootsteps(delta) {
    this.stepTimer -= delta;
    const v = this.player.body.velocity;
    const moving = Math.hypot(v.x, v.y) > 10;
    if (moving && this.stepTimer <= 0) {
      playFootstep();
      this.stepTimer = 300; // ms between steps
    }
  }

  /**
   * Auto-attack: hit the nearest enemy that is both in weapon range AND within
   * the dot's front-facing arc. Turn away and you stop swinging at it.
   */
  updatePlayerCombat(delta) {
    const p = this.player;
    if (p.attackTimer > 0) p.attackTimer -= delta;

    // A clicked (focus) enemy in range takes priority; otherwise auto-target
    // the nearest enemy in the front-facing arc.
    let target = null;
    const f = p.focusEnemy;
    if (f && f.active && dist(p.x, p.y, f.x, f.y) <= p.weapon.range) {
      target = f;
      p.facing = angleBetween(p.x, p.y, f.x, f.y); // face it so the fists box it
    } else {
      target = this.nearestEnemyInArc(p, p.weapon.range, p.facing, UNIT.attackArc);
    }

    p.attackTarget = target || null; // drives fist orientation while boxing
    if (target && p.attackTimer <= 0) {
      p.weapon.attack({ scene: this, owner: p, target });
      p.attackTimer = p.weapon.cooldown;
    }
  }

  /**
   * Nearest active enemy within `range` and within `halfArc` of `facing`
   * (center-to-center), or null. A halfArc of PI means "any direction".
   */
  nearestEnemyInArc(from, range, facing, halfArc) {
    let best = null;
    let bestDist = range;
    for (const e of this.enemies.getChildren()) {
      if (!e.active) continue;
      const d = dist(from.x, from.y, e.x, e.y);
      if (d > bestDist) continue;
      const toEnemy = angleBetween(from.x, from.y, e.x, e.y);
      if (Math.abs(angleDelta(facing, toEnemy)) > halfArc) continue; // not facing it
      bestDist = d;
      best = e;
    }
    return best;
  }

  // --------------------------------------------------------------------------
  // Combat API — weapons call these (see weapons.js). Kept generic so the same
  // helpers serve player, squad and (later) enemy attacks.
  // --------------------------------------------------------------------------

  /** Apply damage to a target; flash it if it survives, award XP if it dies. */
  dealDamage(target, amount) {
    if (!target || !target.active) return;
    const tx = target.x;
    const ty = target.y;
    const killed = target.takeDamage(amount);
    // Floating number over a hit enemy, in the player's colour.
    if (target.faction === 'enemy') {
      this.showDamageNumber(tx, ty, `${Math.round(amount)}`, hexColor(COLORS.player));
    }
    if (killed) {
      if (target.faction === 'enemy') this.grantXp(target.level);
    } else {
      this.flashHit(target);
    }
  }

  /** A floating combat number that rises and fades. */
  showDamageNumber(x, y, text, color) {
    const label = this.add
      .text(x, y - UNIT.radius - 4, text, {
        fontFamily: 'monospace',
        fontSize: '16px',
        color,
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 1)
      .setDepth(70);
    this.tweens.add({
      targets: label,
      y: label.y - 24,
      alpha: 0,
      duration: 700,
      ease: 'Quad.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  /** Grant XP for a kill (1 per enemy level) and handle level-ups. */
  grantXp(enemyLevel) {
    const p = this.player;
    if (p.dead) return;
    p.xp += 1 * enemyLevel;
    while (p.xp >= p.xpToNext) {
      p.xp -= p.xpToNext;
      this.levelUpPlayer();
    }
  }

  /** Player level-up: raises level, XP requirement, and max HP (full heal). */
  levelUpPlayer() {
    const p = this.player;
    p.level += 1;
    p.xpToNext = p.level * 10; // 10, 20, 30, …
    p.maxHp += 2;
    p.hp = p.maxHp; // reward: refill on level-up
    this.showSwingPulse(p); // quick visual pop
  }

  /** Damage the player (respecting weapon defense); trigger death at 0 HP. */
  damagePlayer(amount) {
    const p = this.player;
    if (p.dead) return true;
    const defense = p.weapon.defense ?? 0;
    const taken = amount * (1 - defense);
    p.hp -= taken;
    this.showDamageNumber(p.x, p.y, `-${Math.round(taken)}`, '#ff5a5a'); // red -N
    if (p.hp <= 0) {
      p.hp = 0;
      this.onPlayerDead();
      return true;
    }
    return false;
  }

  /** Permadeath: freeze the player and wait for a confirmed restart. */
  onPlayerDead() {
    const p = this.player;
    p.dead = true;
    p.setVelocity(0, 0);
    p.setTint(0x556070);
    if (this.frozen) {
      this.frozen = false; // make sure the sim is running for the restart flow
      this.physics.resume();
    }

    const { width, height } = this.scale;
    this.add
      .text(width / 2, height / 2 - 26, 'You died', {
        fontFamily: 'monospace',
        fontSize: '40px',
        color: '#ff6b6b',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(200);

    const btn = this.add
      .text(width / 2, height / 2 + 30, 'Restart (Enter)', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#cfe6ff',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(200)
      .setPadding(10)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => btn.setColor('#ffffff'));
    btn.on('pointerout', () => btn.setColor('#cfe6ff'));

    const restart = () => this.scene.restart({ depth: 1, seed: this.seed });
    btn.on('pointerdown', restart);
    this.input.keyboard.once('keydown-ENTER', restart); // confirm with Enter
  }

  /** Quick scale pop (used on level-up). */
  showSwingPulse(sprite) {
    this.tweens.add({
      targets: sprite,
      scale: 1.35,
      duration: 120,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  /** Damage every enemy inside a cone (range + half-arc) in front of `owner`. */
  meleeSweep(owner, angle, range, halfArc, damage) {
    for (const e of this.enemies.getChildren()) {
      if (!e.active) continue;
      if (dist(owner.x, owner.y, e.x, e.y) > range) continue;
      const toTarget = angleBetween(owner.x, owner.y, e.x, e.y);
      if (Math.abs(angleDelta(angle, toTarget)) <= halfArc) {
        this.dealDamage(e, damage);
      }
    }
  }

  /** Brief white flash on a hit target, then restore its colour. */
  flashHit(target) {
    target.setTint(0xffffff);
    this.time.delayedCall(70, () => {
      if (target.active) target.setTint(target.baseColor ?? COLORS.enemyMelee);
    });
  }

  /**
   * Punch by thrusting one of the character's OWN side-fists toward the target,
   * then letting it snap back to its side. Alternates left/right each punch.
   * While a fist is punching, updateFists() leaves it to this tween.
   */
  punchSideFist(owner, angle, scale = 1) {
    if (owner === this.player) playPunch(); // sound for your own hits only

    owner.punchToggle = !owner.punchToggle;
    const fist = owner.punchToggle ? owner.fistR : owner.fistL;
    fist.punching = true;

    const reach = UNIT.radius + 16 * scale;
    this.tweens.killTweensOf(fist);
    this.tweens.add({
      targets: fist,
      x: owner.x + Math.cos(angle) * reach,
      y: owner.y + Math.sin(angle) * reach,
      duration: 55,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => {
        fist.punching = false;
      },
    });
  }

  updateHud() {
    const p = this.player;
    this.hudText.setText(
      `Depth ${this.depth}   HP ${Math.ceil(p.hp)}/${p.maxHp}   ` +
        `Weapon ${p.weapon.name}   Enemies ${this.enemies.countActive(true)}`
    );
  }
}

// ============================================================================
// Local helpers (module-private)
// ============================================================================

/** Format an integer colour as a CSS hex string (e.g. 0x3ad0ff → "#3ad0ff"). */
function hexColor(int) {
  return '#' + int.toString(16).padStart(6, '0');
}

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
