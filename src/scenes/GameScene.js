// ============================================================================
// GameScene.js — the main gameplay scene.
//
// FIRST SLICE ("hello world"): generate a dungeon, render it, and let you walk
// a single player dot around with WASD (with wall collision + a follow camera).
//
// Combat, the squad/orders system, enemies and recruiting are layered on next —
// this file is structured so those systems each become their own small method.
// ============================================================================

import { TILE, COLORS, UNIT, ENEMY, GAME, HOTBAR, BOW, BOMB, POTION, MANA, PIXEL, PROJECTILE, SHIELD, FROST, FISTS, ATTACK_COOLDOWN_MULT, LEVELUP } from '../config.js';
import { generateLevel, WALL, roomCenterTile } from '../levelgen.js';
import { makeShapeTexture, shapeTextureKey } from '../shapes.js';
import { makeRng, randInt, dist, angleDelta, angleBetween, clamp, TAU, pick } from '../util.js';
import { Enemy } from '../entities/Enemy.js';
import { Projectile } from '../entities/Projectile.js';
import { getWeapon } from '../weapons.js';
import { getItem, itemPoolForDepth, ITEM_SHAPES } from '../items.js';
import {
  ensureStarted,
  playFootstep,
  playPunch,
  playAggro,
  playBlock,
  playArrow,
  playLevelUp,
  playExplosion,
  cycleVolume,
  cycleMusic,
  startMusic,
  stopMusic,
  suppressMusic,
  playPause,
} from '../sound.js';
import {
  drawSoundIcon as renderSoundIcon,
  drawMusicIcon as renderMusicIcon,
  pointInRect,
} from '../hudIcons.js';

export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  /** Scene entry data (carried between levels). */
  init(data) {
    this.depth = data?.depth ?? 1;
    this.seed = data?.seed ?? 12345;
    this.arriveAt = data?.arriveAt ?? 'start'; // 'start' (came down) or 'exit' (came back up)
    this.carryPlayer = data?.player ?? null; // progression carried from above
    this.transitioning = false; // guards the stairs trigger during a level change
    this.exitArmed = false; // must step OFF a staircase before it can fire — set once
    this.entranceArmed = false; //   the player has walked clear of that staircase
    this.gameTime = data?.gameTime ?? 0; // ms of un-frozen play time this run
    this.frozen = false; // tactical time-freeze (Space)
    this.stepTimer = 0; // footstep-sound cadence
    this.carryHotbar = data?.hotbar ?? null; // action-bar items carried down
    this.foundItems = new Set(data?.foundItems ?? []); // items already looted this run
    this.lootedChests = new Set(data?.lootedChests ?? []); // depths whose chest is opened
  }

  create() {
    this.modalOpen = false; // true while the chest-item info dialog is up
    this.bombs = []; // live dropped bombs (ticking fuses)
    this.buildTextures();
    this.buildLevel();
    this.buildExit();
    this.buildEntranceStairs();
    this.spawnPlayer();
    this.setupBombPhysics();
    this.spawnEnemies();
    this.hotbar = this.carryHotbar ?? []; // up to 9 {id, count} slots
    this.spawnChest();
    this.setupCamera();
    this.setupInput();
    this.buildHud();
    this.setupOverlay();
    this.setupHotbarUI();
    this.setupFog();
    this.showLevelHeadline();
  }

  /** Big "Stage N" title that fades out at the start of each level. */
  showLevelHeadline() {
    const label = this.add
      .text(this.scale.width / 2, this.scale.height * 0.4, `Stage ${this.depth}`, {
        fontFamily: 'monospace',
        fontSize: '52px',
        color: '#3ad0ff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(220);
    this.tweens.add({
      targets: label,
      alpha: { from: 1, to: 0 },
      y: label.y - 30,
      delay: 800,
      duration: 1500,
      ease: 'Quad.easeIn',
      onComplete: () => label.destroy(),
    });
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

    // Scroll of Frozen Orb: parchment scroll with a blue orb (multi-colour, so
    // baked here before the shape loop — which then skips it since it exists).
    if (!this.textures.exists('item_scroll')) {
      const S = 20;
      const roll = 3;
      const inset = 3;
      const sg = this.make.graphics({ x: 0, y: 0, add: false });
      sg.fillStyle(0xe6d6a8, 1); // parchment body
      sg.fillRect(inset, roll, S - inset * 2, S - roll * 2);
      sg.fillStyle(0xc9b06e, 1); // rolls top & bottom
      sg.fillRect(0, 0, S, roll);
      sg.fillRect(0, S - roll, S, roll);
      sg.fillStyle(0x4db8ff, 1); // blue orb
      sg.fillCircle(S / 2, S / 2, 4);
      sg.generateTexture('item_scroll', S, S);
      sg.destroy();
    }

    // Bow pickup icon: a white arc + bowstring (baked before the shape loop so
    // it isn't routed through makeShapeTexture, which only knows basic shapes).
    if (!this.textures.exists('item_bow')) {
      const bg = this.make.graphics({ x: 0, y: 0, add: false });
      bg.lineStyle(3, 0xffffff, 1);
      bg.beginPath();
      bg.arc(6, 10, 8, -Math.PI * 0.5, Math.PI * 0.5); // right-bowing limb
      bg.strokePath();
      bg.lineStyle(1, 0xffffff, 1);
      bg.beginPath();
      bg.moveTo(6, 2);
      bg.lineTo(6, 18); // bowstring
      bg.strokePath();
      bg.generateTexture('item_bow', 20, 20);
      bg.destroy();
    }
    // Bomb pickup icon: a black round bomb with a little fuse + spark.
    if (!this.textures.exists('item_bomb')) {
      const bg = this.make.graphics({ x: 0, y: 0, add: false });
      bg.fillStyle(0x111318, 1); // black body
      bg.fillCircle(10, 12, 7);
      bg.fillStyle(0x33383f, 1); // subtle highlight
      bg.fillCircle(8, 10, 2);
      bg.fillStyle(0x8a6a3a, 1); // brown fuse
      bg.fillRect(9, 2, 2, 5);
      bg.fillStyle(0xffb020, 1); // lit spark
      bg.fillCircle(10, 2, 2);
      bg.generateTexture('item_bomb', 20, 20);
      bg.destroy();
    }
    // Dropped-bomb body (no fuse — the burning fuse is drawn dynamically).
    if (!this.textures.exists('bomb_body')) {
      const bb = this.make.graphics({ x: 0, y: 0, add: false });
      bb.fillStyle(0x111318, 1);
      bb.fillCircle(10, 12, 7);
      bb.fillStyle(0x33383f, 1);
      bb.fillCircle(8, 10, 2);
      bb.generateTexture('bomb_body', 20, 20);
      bb.destroy();
    }
    // Shield pickup icon: a white shield silhouette.
    if (!this.textures.exists('item_shield')) {
      const dg = this.make.graphics({ x: 0, y: 0, add: false });
      dg.fillStyle(0xffffff, 1);
      dg.fillPoints(
        [
          { x: 10, y: 1 },
          { x: 18, y: 5 },
          { x: 18, y: 11 },
          { x: 10, y: 19 },
          { x: 2, y: 11 },
          { x: 2, y: 5 },
        ],
        true
      );
      dg.generateTexture('item_shield', 20, 20);
      dg.destroy();
    }

    for (const shape of ITEM_SHAPES) {
      makeShapeTexture(this, `item_${shape}`, shape, 20); // item pickup icons
    }
    makeShapeTexture(this, 'loot', 'square', 10); // little dropped loot square
    makeShapeTexture(this, 'pixel', 'square', PIXEL.size); // resource pixels (tinted red/blue)

    // Arrow projectile (a short dash).
    if (!this.textures.exists('arrow')) {
      const ag = this.make.graphics({ x: 0, y: 0, add: false });
      ag.fillStyle(0xffffff, 1);
      ag.fillRect(0, 0, 12, 3);
      ag.generateTexture('arrow', 12, 3);
      ag.destroy();
    }
    // Treasure chest.
    if (!this.textures.exists('chest')) {
      const cg = this.make.graphics({ x: 0, y: 0, add: false });
      cg.fillStyle(0x8a5a2b, 1);
      cg.fillRect(0, 5, 26, 17); // body
      cg.fillStyle(0x6b4420, 1);
      cg.fillRect(0, 0, 26, 8); // lid
      cg.fillStyle(0xf2c14e, 1);
      cg.fillRect(11, 7, 4, 6); // lock
      cg.generateTexture('chest', 26, 22);
      cg.destroy();
    }
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
    this.flowField = null; // new grid → discard any chase field from the last level

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

  /**
   * Create the player dot. Normally at the level's start (the up-stairs you came
   * down); when climbing BACK up from below, emerge at this level's down-stairs.
   */
  spawnPlayer() {
    const at = this.arriveAt === 'exit' ? this.level.exit : this.level.start;
    const x = (at.tx + 0.5) * TILE;
    const y = (at.ty + 0.5) * TILE;

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
    this.player.maxMana = MANA.max;
    this.player.mana = MANA.max; // starts full; only spent/shown once a mana item is held
    this.player.weapon = getWeapon('fists');
    this.player.hasShield = false;
    this.player.shieldTimer = 0; // ms until the shield can block again (0 = ready)
    this.player.usingBow = false; // shooting (vs point-blank fists) this frame
    this.player.bowDraw = 0; // 0..1 bowstring/hand "release" animation phase
    this.player.attackTimer = 0; // ms until the next auto-attack is ready
    this.player.attackCooldownMax = 0; // the cooldown that timer counts down from
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
      this.player.maxMana = c.maxMana ?? MANA.max;
      this.player.mana = c.mana ?? this.player.maxMana;
      this.player.weapon = getWeapon(c.weaponId);
      this.player.hasShield = c.hasShield ?? false;
    }

    // Two little fist-dots that ride on the character's sides (darker shade).
    this.player.fistL = this.makeFist();
    this.player.fistR = this.makeFist();

    this.physics.add.collider(this.player, this.walls);
    this.player.setVelocity(0, 0); // arrive at rest, squarely on the staircase
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

  /**
   * Draw an "up" staircase at the spawn point on stages below the first — the
   * stairs you came down. Stepping onto it climbs back one level (see checkStairs).
   */
  buildEntranceStairs() {
    this.entrance = null; // stage 1 has no way up
    if (this.depth <= 1) return;
    const sx = (this.level.start.tx + 0.5) * TILE;
    const sy = (this.level.start.ty + 0.5) * TILE;
    this.entrance = { x: sx, y: sy };

    const s = TILE * 0.72;
    const g = this.add.graphics().setDepth(-3);
    g.fillStyle(0x243049, 1); // recessed base tile
    g.fillRect(sx - s / 2 - 3, sy - s / 2 - 3, s + 6, s + 6);

    // Ascending steps (widening toward the bottom) to read as "up".
    const steps = 4;
    const stepH = s / steps;
    g.fillStyle(0x9fb4e0, 1);
    for (let i = 0; i < steps; i++) {
      const w = s * (1 - (steps - 1 - i) / (steps + 1));
      g.fillRect(sx - w / 2, sy - s / 2 + i * stepH, w, stepH - 2);
    }

    this.add
      .text(sx, sy - s / 2 - 6, '▲ up', {
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
    // Plain (non-physics) container: each projectile still gets its own Arcade
    // body in its constructor. Using a *physics* group here zeroes a child's
    // velocity on add() — which left arrows spawned-but-stationary.
    this.projectiles = this.add.group();
    const rng = makeRng(this.seed + this.depth * 7919);

    // Keep a buffer around BOTH staircases so nothing can aggro the player the
    // instant they arrive — whether they came down to the up-stairs (start) or
    // climbed back up to the down-stairs (exit). Both are safe landing zones.
    const startX = (this.level.start.tx + 0.5) * TILE;
    const startY = (this.level.start.ty + 0.5) * TILE;
    const exitX = (this.level.exit.tx + 0.5) * TILE;
    const exitY = (this.level.exit.ty + 0.5) * TILE;
    const safeRadius = ENEMY.aggroRange + 80;

    // rooms[0] is the player's start room — leave it clear.
    for (let i = 1; i < this.level.rooms.length; i++) {
      const room = this.level.rooms[i];
      const count = randInt(rng, 1, 2 + this.depth); // more enemies deeper down
      for (let n = 0; n < count; n++) {
        const tx = randInt(rng, room.x, room.x + room.w - 1);
        const ty = randInt(rng, room.y, room.y + room.h - 1);
        if (this.level.grid[ty]?.[tx] === WALL) continue; // never spawn inside a wall
        const px = (tx + 0.5) * TILE;
        const py = (ty + 0.5) * TILE;
        if (dist(px, py, startX, startY) < safeRadius) continue; // too near the up-stairs
        if (dist(px, py, exitX, exitY) < safeRadius) continue; // too near the down-stairs

        const level = randInt(rng, 1, this.depth); // tougher enemies deeper down
        const enemy = new Enemy(this, px, py, { shape: 'square', level });
        enemy.patrol = this.roomPatrolPath(room); // walk the room's walls while idle
        enemy.patrolIdx = 0;
        this.enemies.add(enemy);
      }
    }

    this.physics.add.collider(this.enemies, this.walls);
    this.physics.add.collider(this.player, this.enemies);
    // NB: no enemies-vs-enemies physics collider. Arcade won't reliably push
    // apart bodies that are already co-located/stationary, so overlap is instead
    // guaranteed by the position-based separateEnemies() each frame, while the
    // boids steering in updateEnemies() keeps a chasing pack from ever piling
    // into that state (which is what used to make them feel stuck).
  }

  /**
   * Place one treasure chest in a random room that is NOT the start room and NOT
   * the stairs room (so loot and the exit never share a room). Items come ONLY
   * from chests (and monster drops) — no scattered floor loot.
   */
  spawnChest() {
    this.pickups = this.physics.add.group();
    this.physics.add.overlap(this.player, this.pickups, (_p, pickup) => this.collectItem(pickup));

    // Resource pixels (red = HP for the potion, blue = mana) dropped by kills.
    this.pixels = this.physics.add.group();
    this.physics.add.overlap(this.player, this.pixels, (_p, px) => this.collectPixel(px));

    // A chest opened on a previous visit stays looted — don't respawn it when
    // the player climbs back down to this depth (enemies do respawn; chests don't).
    if (this.lootedChests.has(this.depth)) return;

    this.chestRng = makeRng(this.seed + this.depth * 6151);
    const rooms = this.level.rooms;
    const ex = this.level.exit;
    // Candidates: skip the start room (0) and whichever room holds the stairs.
    const candidates = rooms.filter((r, i) => i !== 0 && !tileInRoom(ex.tx, ex.ty, r));
    if (candidates.length === 0) return; // no valid room — no chest this level

    const room = candidates[randInt(this.chestRng, 0, candidates.length - 1)];
    const c = roomCenterTile(room);
    const chest = this.physics.add
      .sprite((c.tx + 0.5) * TILE, (c.ty + 0.5) * TILE, 'chest')
      .setDepth(0);
    chest.setImmovable(true);
    chest.opened = false;
    this.chest = chest;
    this.physics.add.overlap(this.player, chest, () => this.openChest());
  }

  /** Open the chest on touch: pop its items out as pickups the player grabs. */
  openChest() {
    const chest = this.chest;
    if (!chest || chest.opened) return;
    chest.opened = true;
    this.lootedChests.add(this.depth); // never respawn this chest on a return visit
    chest.setTint(0x6b7280); // greyed = looted

    // One item, from this depth's pool minus anything already picked up this run
    // (every item is unique across chests). Empty if the pool is exhausted. Uses
    // Math.random so loot is genuinely random per run, not tied to the level seed.
    const pool = itemPoolForDepth(this.depth).filter((id) => !this.foundItems.has(id));
    if (pool.length === 0) return;
    const id = pick(Math.random, pool);
    this.createPickup(chest.x, chest.y - 6, id);
  }

  /** Create a floating item pickup on the ground (from a room or a monster drop). */
  createPickup(x, y, id) {
    const item = getItem(id);
    const pickup = this.physics.add.sprite(x, y, `item_${item.shape}`).setDepth(0);
    if (item.shape !== 'scroll' && item.shape !== 'bomb') pickup.setTint(item.color); // these have their own colours
    pickup.itemId = id;
    this.tweens.add({
      targets: pickup,
      y: y - 4,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.pickups.add(pickup);
    return pickup;
  }

  /**
   * Add a picked-up item to the action bar and announce it. Behaviour depends on
   * the item's `kind`: consumables stack by count; a reservoir (potion) tops up
   * to full on a duplicate and tracks stored HP on the slot; a mana item is a
   * one-off (duplicates ignored).
   */
  collectItem(pickup) {
    const id = pickup.itemId;
    const item = getItem(id);

    // Equipment (Bow, Shield) equips on pickup instead of taking a bar slot.
    if (item.kind === 'weapon') {
      this.equipWeaponItem(item);
      pickup.destroy();
      this.showItemDialog(item);
      return;
    }
    if (item.kind === 'shield') {
      this.player.hasShield = true;
      this.player.shieldTimer = 0; // ready to block immediately
      pickup.destroy();
      this.showItemDialog(item);
      return;
    }

    const existing = this.hotbar.find((s) => s.id === id);
    if (existing) {
      if (item.kind === 'consumable') existing.count += 1;
      else if (item.kind === 'reservoir') existing.charge = item.capacity; // duplicate refills it
      // mana / cooldown items: nothing to stack — already held.
    } else if (this.hotbar.length < 9) {
      if (item.kind === 'reservoir') this.hotbar.push({ id, charge: item.initialCharge });
      else if (item.kind === 'mana') this.hotbar.push({ id });
      else if (item.kind === 'cooldown') this.hotbar.push({ id, cd: 0 });
      else this.hotbar.push({ id, count: 1 });
    } else {
      return; // bar full — leave it on the ground
    }

    pickup.destroy();
    this.showItemDialog(item);
  }

  /**
   * Freeze the game and show an info panel for a just-collected chest item
   * (icon + name + how it works). Any key or tap dismisses it and resumes play.
   */
  showItemDialog(item) {
    this.foundItems.add(item.id); // picked up → never rolled by another chest
    if (this.itemDialogObjs) for (const o of this.itemDialogObjs) o.destroy(); // never stack
    this.modalOpen = true;
    this.physics.pause();

    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;
    const panelW = Math.min(360, width - 40);
    const panelH = 240;
    const D = 260;
    const objs = [];

    objs.push(
      this.add.rectangle(0, 0, width, height, 0x000000, 0.6).setOrigin(0, 0).setScrollFactor(0).setDepth(D)
    );
    const panel = this.add
      .rectangle(cx, cy, panelW, panelH, 0x141a2b, 0.98)
      .setStrokeStyle(2, item.color)
      .setScrollFactor(0)
      .setDepth(D + 1)
      .setInteractive({ useHandCursor: true }); // hand cursor; dismissal handled scene-side
    objs.push(panel);
    objs.push(
      this.add
        .text(cx, cy - panelH / 2 + 18, 'Item found', {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#7f92b3',
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(D + 2)
    );

    const icon = this.add
      .image(cx, cy - 52, `item_${item.shape}`)
      .setScale(2.6)
      .setScrollFactor(0)
      .setDepth(D + 2);
    if (item.shape !== 'scroll' && item.shape !== 'bomb') icon.setTint(item.color); // these have their own colours
    objs.push(icon);

    objs.push(
      this.add
        .text(cx, cy - 14, item.name, {
          fontFamily: 'monospace',
          fontSize: '22px',
          color: hexColor(item.color),
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(D + 2)
    );
    objs.push(
      this.add
        .text(cx, cy + 16, item.desc ?? '', {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#cfe6ff',
          align: 'center',
          wordWrap: { width: panelW - 34 },
        })
        .setOrigin(0.5, 0)
        .setScrollFactor(0)
        .setDepth(D + 2)
    );
    objs.push(
      this.add
        .text(cx, cy + panelH / 2 - 16, 'Press Space or tap this box to continue', {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#9fb4e0',
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(D + 2)
    );

    this.itemDialogObjs = objs;

    // Dismiss only on Space, or a click/tap on the panel (handled above).
    this.input.keyboard.once('keydown-SPACE', () => this.dismissItemDialog());
  }

  /** Close the item dialog and resume the game. */
  dismissItemDialog() {
    if (!this.modalOpen) return;
    this.modalOpen = false;
    for (const o of this.itemDialogObjs || []) o.destroy();
    this.itemDialogObjs = null;
    if (!this.frozen) this.physics.resume(); // don't override a player time-freeze
  }

  /** Equip a weapon item (Bow): swap the dot's weapon. */
  equipWeaponItem(item) {
    this.player.weapon = getWeapon(item.weaponId);
  }

  /** A big item name that floats up and fades, center-screen, on pickup. */
  showPickupText(name, color) {
    const label = this.add
      .text(this.scale.width / 2, this.scale.height * 0.34, name, {
        fontFamily: 'monospace',
        fontSize: '22px',
        color,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(200);
    this.tweens.add({
      targets: label,
      y: label.y - 26,
      alpha: 0,
      duration: 1600,
      ease: 'Quad.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  /** Use the item in action-bar slot `i` (0-based), if any. */
  useHotbarSlot(i) {
    if (this.player.dead) return;
    const slot = this.hotbar[i];
    if (!slot) return;
    const item = getItem(slot.id);

    // Cooldown gate — any item with a cooldown can't be used while recharging.
    if (item.cooldownMs && (slot.cd ?? 0) > 0) return;

    // `use` returns whether it actually ACTED.
    const acted = item.use(this, slot);
    if (!acted) return;

    if (item.kind === 'consumable') {
      slot.count -= 1;
      if (slot.count <= 0) this.hotbar.splice(i, 1); // compact the bar
    }
    if (item.cooldownMs) slot.cd = item.cooldownMs; // start the recharge
  }

  /** Advance action-bar cooldowns (e.g. the Bomb's recharge). */
  tickHotbarCooldowns(delta) {
    for (const slot of this.hotbar) {
      if (slot.cd > 0) slot.cd = Math.max(0, slot.cd - delta);
    }
  }

  /** The held Health Potion slot (a reservoir), or null. */
  heldPotionSlot() {
    return this.hotbar.find((s) => getItem(s.id).kind === 'reservoir' && s.id === 'potion') ?? null;
  }

  /** Does the player hold any mana-cost item? (Controls the mana bar + blue drops.) */
  hasManaItem() {
    return this.hotbar.some((s) => getItem(s.id).kind === 'mana');
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

    // Action bar: number keys 1..slots use the item in that slot.
    this.input.keyboard.on('keydown', (event) => {
      if (this.modalOpen) return; // dialog swallows the keypress (it dismisses)
      const k = Number(event.key);
      if (k >= 1 && k <= HOTBAR.slots) this.useHotbarSlot(k - 1);
    });

    // A tap/click: on-screen UI first (so touch can drive everything), then a
    // world order — tap an enemy to attack it, the ground to walk there.
    this.input.on('pointerdown', (pointer) => {
      if (this.modalOpen) return void this.dismissItemDialog(); // tap anywhere closes the dialog; nothing else acts on this tap
      // On-screen buttons consume the tap (menu / freeze / sound / music / bar).
      if (pointInRect(pointer, this.soundRect)) return void cycleVolume();
      if (pointInRect(pointer, this.musicRect)) return void cycleMusic();
      if (pointInRect(pointer, this.menuRect)) return void this.openPause();
      if (pointInRect(pointer, this.freezeRect)) return void this.toggleFreeze();
      const slot = this.hotbarSlotAt(pointer.x, pointer.y);
      if (slot >= 0 && this.hotbar[slot]) return void this.useHotbarSlot(slot);

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
    this.input.keyboard.on('keydown-SPACE', () => {
      if (!this.modalOpen) this.toggleFreeze();
    });

    // Esc (or the ☰ button) opens the pause menu.
    this.input.keyboard.on('keydown-ESC', () => this.openPause());
  }

  /** Open the pause menu (pausing this scene underneath), if not already open. */
  openPause() {
    if (this.player.dead || this.modalOpen || this.scene.isPaused()) return;
    stopMusic(); // silence the background track while paused…
    playPause(); // …with a soft blip to mark the pause
    this.scene.pause();
    this.scene.launch('PauseScene');
  }

  /** Index of the action-bar slot under a screen point, or -1. */
  hotbarSlotAt(sx, sy) {
    const rects = this.hotbarRects;
    if (!rects) return -1;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h) return i;
    }
    return -1;
  }

  /** Space: freeze/unfreeze the simulation while leaving order-input live. */
  toggleFreeze() {
    if (this.player.dead) return;
    this.frozen = !this.frozen;
    if (this.frozen) {
      this.physics.pause();
      suppressMusic(true); // keep clicks-during-freeze from reviving the track
      stopMusic(); // silence the background track while time is frozen…
    } else {
      this.physics.resume();
      suppressMusic(false);
      startMusic(); // …and bring it back when play resumes
    }
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

  /**
   * On-screen HUD chrome. The old top-left title/controls/status text is gone
   * (that info now lives on the pause screen — see hudLines()); all that's left
   * up top is a touch-friendly ☰ menu button that opens the pause menu.
   */
  buildHud() {
    this.menuIcon = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.menuRect = { x: 0, y: 0, w: 0, h: 0 };

    // Top-left player avatar (portrait + HP/mana bars) — see drawAvatar.
    this.avatarFx = this.add.graphics().setScrollFactor(0).setDepth(100);
  }

  /** Draw the top-left ☰ menu button (opens the pause menu) + its tap area. */
  drawMenuButton() {
    const g = this.menuIcon;
    g.clear();
    const x = 12;
    const y = 12;
    const w = 36;
    const h = 32;
    this.menuRect = { x, y, w, h };
    g.fillStyle(0x0d1420, 0.72);
    g.fillRect(x, y, w, h);
    g.lineStyle(1, 0x2a3350, 1);
    g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    g.fillStyle(0xcfe6ff, 0.9);
    for (let i = 0; i < 3; i++) g.fillRect(x + 9, y + 9 + i * 6, w - 18, 2); // ☰
  }

  /**
   * Top-left player unit frame, tucked beneath the ☰ button: a portrait of the
   * dot with a level badge, and the player's HP bar directly below it. This is
   * where the character's level and health live now (they're off the dot body).
   */
  drawAvatar() {
    const g = this.avatarFx;
    g.clear();
    const p = this.player;
    const size = 46;
    const x = 12;
    const y = 52; // just under the menu button (which ends at y≈44)

    // Portrait frame.
    g.fillStyle(0x0d1420, 0.72);
    g.fillRect(x, y, size, size);
    g.lineStyle(1, 0x2a3350, 1);
    g.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);

    // Character portrait: the player dot with two dark eyes.
    const cx = x + size / 2;
    const cy = y + size / 2 - 1;
    const r = size * 0.3;
    g.fillStyle(COLORS.player, 1);
    g.fillCircle(cx, cy, r);
    const eo = r * 0.42;
    g.fillStyle(0x0d1019, 1);
    g.fillCircle(cx - eo, cy + r * 0.12, Math.max(2, r * 0.17));
    g.fillCircle(cx + eo, cy + r * 0.12, Math.max(2, r * 0.17));

    // HP bar directly below the portrait, same width.
    const hbY = y + size + 3;
    const hbH = 9;
    const pct = clamp(p.hp / p.maxHp, 0, 1);
    g.fillStyle(COLORS.hpBack, 0.6);
    g.fillRect(x - 1, hbY - 1, size + 2, hbH + 2);
    g.fillStyle(pct > 0.3 ? COLORS.hpGood : COLORS.hpLow, 1);
    g.fillRect(x, hbY, size * pct, hbH);

    // Anchor for the mana bar, which stacks directly beneath the HP bar. (The
    // bars read by colour/fill; exact HP/MP numbers live on the pause screen.)
    this.avatarBox = { x, w: size, manaY: hbY + hbH + 3 };
  }

  /** Status + controls lines shown on the pause screen (see PauseScene). */
  hudLines() {
    const p = this.player;
    let weapon = p.weapon.name;
    if (p.hasShield) weapon += p.shieldTimer <= 0 ? ' + Shield' : ' + Shield (recharging)';
    return [
      `Depth ${this.depth}    HP ${Math.ceil(p.hp)}/${p.maxHp}    Enemies ${this.enemies.countActive(true)}`,
      `Weapon: ${weapon}`,
      '',
      'Move: tap the ground / WASD     Attack: tap an enemy',
      'Freeze: ⏯ button / Space     Descend: reach the ▼ stairs',
    ];
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
      .text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#0d1019',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0.5) // sit on the body, not floating above
      .setDepth(50);

    // Fixed top-right corner: Level + XP bar (screen-space, doesn't scroll).
    // Top-right: dungeon Stage (depth) above the character Level + XP.
    this.stageText = this.add
      .text(0, 0, '', { fontFamily: 'monospace', fontSize: '22px', color: '#3ad0ff' })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(100);
    this.levelText = this.add
      .text(0, 0, '', { fontFamily: 'monospace', fontSize: '16px', color: '#ffcf5c' })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(100);
    // Empty "tube": a dark translucent track with an amber outline so the bar is
    // always visible even at 0 XP; the amber fill grows inside it.
    this.xpBarBg = this.add
      .rectangle(0, 0, 170, 10, 0x000000, 0.45)
      .setStrokeStyle(1, COLORS.xp, 0.6)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(100);
    this.xpBarFill = this.add
      .rectangle(0, 0, 170, 10, COLORS.xp)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(101);
    this.xpText = this.add
      .text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#ffffff',
        stroke: '#0d1019',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(102);

    // Mana bar (blue) sits just under the XP bar — only shown while a mana item
    // is held (see updateManaUi). Starts hidden.
    this.manaBarBg = this.add
      .rectangle(0, 0, 170, 8, COLORS.hpBack, 0.5)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(100)
      .setVisible(false);
    this.manaBarFill = this.add
      .rectangle(0, 0, 170, 8, COLORS.mana)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(101)
      .setVisible(false);
    this.manaText = this.add
      .text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#ffffff',
        stroke: '#0d1019',
        strokeThickness: 2,
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(102)
      .setVisible(false);

    // Bottom-left: clickable sound icon (cycles volume: full → half → mute).
    this.soundIcon = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.soundRect = { x: 0, y: 0, w: 0, h: 0 };

    // Bottom-left: a music-cycle button (♪) next to the sound icon.
    this.musicIcon = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.musicRect = { x: 0, y: 0, w: 0, h: 0 };
    this.musicLabel = this.add
      .text(0, 0, '', { fontFamily: 'monospace', fontSize: '11px', color: '#cfe6ff' })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(100);

    // Bottom-right: game timer above a big play/pause (time-freeze) indicator.
    this.timeIcon = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.freezeRect = { x: 0, y: 0, w: 0, h: 0 }; // tap area, set each frame
    this.timerText = this.add
      .text(0, 0, '', { fontFamily: 'monospace', fontSize: '18px', color: '#cfe6ff' })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(100);
  }

  /** Bottom-center WoW-style action bar (9 slots, keys 1-9). */
  setupHotbarUI() {
    this.hotbarFx = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.hotbarRects = []; // per-slot screen rects for tap/click hit-testing
    this.hotbarKeyLabels = [];
    this.hotbarCountLabels = [];
    for (let i = 0; i < HOTBAR.slots; i++) {
      this.hotbarKeyLabels.push(
        this.add
          .text(0, 0, `${i + 1}`, { fontFamily: 'monospace', fontSize: '10px', color: '#7f92b3' })
          .setScrollFactor(0)
          .setDepth(101)
      );
      this.hotbarCountLabels.push(
        this.add
          .text(0, 0, '', { fontFamily: 'monospace', fontSize: '12px', color: '#ffffff' })
          .setOrigin(1, 1)
          .setScrollFactor(0)
          .setDepth(101)
      );
    }
  }

  /** Redraw the action bar each frame (slot frames, icons, stack counts). */
  /**
   * Action-bar slot size — fit 9 slots to the screen width (so it works on a
   * narrow phone), clamped to a comfortable touch-target size. Shared so the
   * corner buttons can sit clear above the bar.
   */
  hotbarSlotSize() {
    const n = HOTBAR.slots;
    const gap = 5;
    const margin = 8;
    return clamp(Math.floor((this.scale.width - margin * 2 - (n - 1) * gap) / n), 34, 54);
  }

  /** Y of the top of the bottom action-bar strip (corner buttons sit above it). */
  bottomStripTop() {
    return this.scale.height - this.hotbarSlotSize() - 16;
  }

  drawHotbar() {
    const g = this.hotbarFx;
    g.clear();
    const n = HOTBAR.slots;
    const gap = 5;
    const slot = this.hotbarSlotSize();
    const totalW = n * slot + (n - 1) * gap;
    const x0 = Math.round(this.scale.width / 2 - totalW / 2);
    const y = this.scale.height - slot - 8;
    const iconSize = Math.round(slot * 0.52);

    for (let i = 0; i < n; i++) {
      const x = x0 + i * (slot + gap);
      this.hotbarRects[i] = { x, y, w: slot, h: slot };
      g.fillStyle(0x0d1420, 0.72);
      g.fillRect(x, y, slot, slot);
      g.lineStyle(1, 0x2a3350, 1);
      g.strokeRect(x + 0.5, y + 0.5, slot - 1, slot - 1);
      this.hotbarKeyLabels[i].setPosition(x + 4, y + 3);

      const s = this.hotbar[i];
      if (s) {
        const item = getItem(s.id);

        // The icon's opacity encodes state: a reservoir (potion) shows its fill
        // level; a mana spell dims when unaffordable; a cooldown item dims while
        // recharging. The corner label shows a stack count or seconds-remaining.
        let alpha = 1;
        let label = '';
        if (item.kind === 'reservoir') {
          alpha = 0.25 + 0.75 * clamp((s.charge ?? 0) / item.capacity, 0, 1);
        } else if (item.kind === 'consumable' && s.count > 1) {
          label = `${s.count}`;
        }
        // Any item on cooldown → dim + seconds remaining; a mana item you can't
        // afford also dims.
        if ((s.cd ?? 0) > 0) {
          alpha = 0.35;
          label = `${Math.ceil(s.cd / 1000)}`;
        } else if (item.kind === 'mana' && this.player.mana < item.manaCost) {
          alpha = 0.35;
        }

        this.drawIcon(g, item.shape, x + slot / 2, y + slot / 2, iconSize, item.color, alpha);

        // Reservoir (potion): a little vertical fill gauge on the slot's right edge.
        if (item.kind === 'reservoir') {
          const frac = clamp((s.charge ?? 0) / item.capacity, 0, 1);
          const bw = 3;
          const bh = slot - 12;
          const bx = x + slot - 6;
          const byTop = y + 6;
          g.fillStyle(0x000000, 0.55); // track
          g.fillRect(bx - 1, byTop - 1, bw + 2, bh + 2);
          g.fillStyle(item.color, 0.95); // fill from the bottom up
          g.fillRect(bx, byTop + bh * (1 - frac), bw, bh * frac);
        }

        this.hotbarCountLabels[i].setPosition(x + slot - 4, y + slot - 2).setText(label);
      } else {
        this.hotbarCountLabels[i].setText('');
      }
    }
  }

  /**
   * Draw an item's icon shape, filled with `color`, centered at (cx,cy). `alpha`
   * (0..1) lets the bar convey state — a potion's fill level, or a mana spell
   * dimmed when unaffordable.
   */
  drawIcon(g, shape, cx, cy, size, color, alpha = 1) {
    const h = size / 2;
    g.fillStyle(color, alpha);
    if (shape === 'circle') g.fillCircle(cx, cy, h);
    else if (shape === 'square') g.fillRect(cx - h, cy - h, size, size);
    else if (shape === 'triangle') g.fillTriangle(cx, cy - h, cx + h, cy + h, cx - h, cy + h);
    else if (shape === 'diamond') {
      g.fillPoints(
        [
          { x: cx, y: cy - h },
          { x: cx + h, y: cy },
          { x: cx, y: cy + h },
          { x: cx - h, y: cy },
        ],
        true
      );
    } else if (shape === 'bomb') {
      // Black round bomb with a fuse + spark (ignores `color`; honours alpha).
      const r = size * 0.34;
      g.fillStyle(0x111318, alpha);
      g.fillCircle(cx, cy + size * 0.08, r);
      g.fillStyle(0x8a6a3a, alpha);
      g.fillRect(cx - 1, cy - size * 0.42, 2, size * 0.24);
      g.fillStyle(0xffb020, alpha);
      g.fillCircle(cx, cy - size * 0.42, size * 0.09);
    } else if (shape === 'scroll') {
      // Parchment scroll with a blue orb (ignores `color`).
      const roll = size * 0.16;
      const inset = size * 0.14;
      const x0 = cx - h;
      const y0 = cy - h;
      g.fillStyle(0xe6d6a8, alpha);
      g.fillRect(x0 + inset, y0 + roll, size - inset * 2, size - roll * 2);
      g.fillStyle(0xc9b06e, alpha);
      g.fillRect(x0, y0, size, roll);
      g.fillRect(x0, y0 + size - roll, size, roll);
      g.fillStyle(0x4db8ff, alpha);
      g.fillCircle(cx, cy, size * 0.2);
    }
  }

  // --------------------------------------------------------------------------
  // Per-frame update
  // --------------------------------------------------------------------------

  update(time, delta) {
    if (this.modalOpen) return; // item info dialog up — game is frozen behind it

    // When frozen, the simulation halts but order-input (clicks) stays live.
    if (!this.frozen && !this.player.dead) {
      this.gameTime += delta; // timer only advances during un-frozen play
      if (this.player.shieldTimer > 0) this.player.shieldTimer -= delta;
      if (this.player.bowDraw > 0) this.player.bowDraw = Math.max(0, this.player.bowDraw - delta / BOW.drawTime);
      this.tickHotbarCooldowns(delta);
      this.movePlayer(delta);
      this.updateFistsFor(this.player, time, UNIT.radius);
      this.updatePlayerCombat(delta);
      this.checkStairs();
      this.updateFootsteps(delta);
    }
    if (!this.frozen && !this.player.dead) this.updateEnemies(delta);
    if (!this.frozen && !this.player.dead) this.updatePixels();
    if (!this.frozen) this.updateProjectiles(delta);
    if (!this.frozen) this.updateBombs(delta);
    if (!this.frozen) {
      this.separateEnemies(); // hard no-overlap guarantee (see method comment)
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
    this.updateManaUi();
    this.drawMenuButton();
    this.drawAvatar();
    this.updateTimeIndicator();
    this.drawSoundIcon();
    this.drawMusicIcon();
    this.drawHotbar();
  }

  /**
   * Draw the bottom-left music-cycle button — a bordered pill reading
   * "♪ Music N / M", styled to match the start-screen menu button. Sits just to
   * the right of the speaker icon, above the action bar.
   */
  drawMusicIcon() {
    const x = 18; // speaker's left edge; the pill sits 40px to its right
    const y = this.bottomStripTop() - 20; // same baseline as the speaker icon
    this.musicRect = renderMusicIcon(this.musicIcon, this.musicLabel, x, y);
  }

  /** Draw the bottom-left speaker icon reflecting the current volume state. */
  drawSoundIcon() {
    const x = 18;
    const y = this.bottomStripTop() - 20; // sit above the action bar (mobile-safe)
    this.soundRect = renderSoundIcon(this.soundIcon, x, y);
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
    const cy = this.bottomStripTop() - 24; // sit above the action bar (mobile-safe)
    const size = 40;
    this.freezeRect = { x: cx - 22, y: cy - size / 2 - 6, w: 56, h: size + 12 }; // tap area

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

  /**
   * Ride the stairs. Either staircase only fires once the player has first
   * stepped OFF it (so arriving on a staircase doesn't instantly re-trigger):
   * reaching the down-stairs descends a level, the up-stairs climbs back one.
   */
  checkStairs() {
    if (this.transitioning) return;
    const p = this.player;
    const reach = TILE * 0.55; // step onto a staircase to use it…
    const armDist = TILE * 1.5; // …but it only arms once you've clearly walked off it

    // Down-stairs (always present).
    const dExit = dist(p.x, p.y, this.exit.x, this.exit.y);
    if (dExit > armDist) this.exitArmed = true;
    else if (dExit < reach && this.exitArmed) return void this.goToLevel(this.depth + 1, 'start');

    // Up-stairs (stages below the first only).
    if (this.entrance) {
      const dEnt = dist(p.x, p.y, this.entrance.x, this.entrance.y);
      if (dEnt > armDist) this.entranceArmed = true;
      else if (dEnt < reach && this.entranceArmed) return void this.goToLevel(this.depth - 1, 'exit');
    }
  }

  /**
   * Rebuild the scene at `newDepth`, carrying the run's progression. `arriveAt`
   * is where the player emerges: 'start' (the up-stairs) when descending, 'exit'
   * (the down-stairs) when climbing back up. Enemies regenerate every visit;
   * chests already opened (lootedChests) stay gone.
   */
  goToLevel(newDepth, arriveAt) {
    this.transitioning = true;
    cycleMusic(); // fresh background track for the new stage
    const p = this.player;
    this.scene.restart({
      depth: newDepth,
      seed: this.seed,
      arriveAt,
      gameTime: this.gameTime, // keep the run timer going
      hotbar: this.hotbar, // carry collected items between levels
      foundItems: [...this.foundItems], // items already looted stay out of future chests
      lootedChests: [...this.lootedChests], // opened chests never respawn
      player: {
        level: p.level,
        xp: p.xp,
        xpToNext: p.xpToNext,
        maxHp: p.maxHp,
        hp: GAME.healOnDescend ? p.maxHp : p.hp,
        maxMana: p.maxMana,
        mana: GAME.healOnDescend ? p.maxMana : p.mana,
        weaponId: p.weapon.id,
        hasShield: p.hasShield,
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

    // While actually shooting, the bow is held in BOTH hands out front. Up close
    // (usingBow false) it's stowed on the back and the hands punch normally.
    if (owner === this.player && owner.weapon.id === 'bow' && owner.usingBow) {
      this.placeBowHands(owner, radius);
      return;
    }

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
   * Both hands hold the bow out front: one on the riser, one on the string. The
   * string hand draws back (p.bowDraw → 1) then releases (→ 0) on each shot.
   */
  placeBowHands(p, radius) {
    const f = p.facing ?? 0;
    const reach = radius + 7;
    const bx = p.x + Math.cos(f) * reach; // bow riser — front hand
    const by = p.y + Math.sin(f) * reach;
    const pull = (p.bowDraw ?? 0) * 9; // string hand pulls back toward the dot
    if (!p.fistL.punching) p.fistL.setPosition(bx, by);
    if (!p.fistR.punching) p.fistR.setPosition(bx - Math.cos(f) * pull, by - Math.sin(f) * pull);
  }

  /**
   * Push apart any enemies that overlap by more than ~5% of their size, so they
   * never occupy the same space (deterministic — doesn't rely on Arcade's
   * collision separation, which is unreliable for lockstep-moving bodies).
   */
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

  /**
   * Is enemy `e` currently visible to the player — lit by the fog of war (its
   * tile is revealed *now*, not just explored) AND within the camera view? The
   * bow only shoots enemies you can actually see.
   */
  enemyVisible(e) {
    const cx = Math.floor(e.x / this.fogCell);
    const cy = Math.floor(e.y / this.fogCell);
    if (!this.visibleCells.has(cy * this.fogW + cx)) return false; // in the fog
    const cam = this.cameras.main;
    const m = ENEMY.radius;
    return (
      e.x >= cam.scrollX - m &&
      e.x <= cam.scrollX + cam.width + m &&
      e.y >= cam.scrollY - m &&
      e.y <= cam.scrollY + cam.height + m
    );
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

  /** A loop of waypoints just inside a room's walls (clockwise), for patrolling. */
  roomPatrolPath(room) {
    const inset = 1; // one tile in from the walls
    const minX = room.x + inset;
    const minY = room.y + inset;
    const maxX = room.x + room.w - 1 - inset;
    const maxY = room.y + room.h - 1 - inset;
    const c = (t) => (t + 0.5) * TILE;
    if (maxX <= minX || maxY <= minY) {
      const cc = roomCenterTile(room); // room too small → sit in the middle
      return [{ x: c(cc.tx), y: c(cc.ty) }];
    }
    return [
      { x: c(minX), y: c(minY) },
      { x: c(maxX), y: c(minY) },
      { x: c(maxX), y: c(maxY) },
      { x: c(minX), y: c(maxY) },
    ];
  }

  /** Move an idle enemy along its room-wall patrol, facing its heading. */
  patrolEnemy(e, delta) {
    const path = e.patrol;
    if (!path || path.length < 2) {
      e.facing += e.lookSpeed * (delta / 1000); // nowhere to go → sweep the cone
      e.setVelocity(0, 0);
      return;
    }
    const wp = path[e.patrolIdx % path.length];
    const dx = wp.x - e.x;
    const dy = wp.y - e.y;
    const d = Math.hypot(dx, dy);
    if (d < 8) {
      e.patrolIdx = (e.patrolIdx + 1) % path.length; // reached a corner → next
      e.setVelocity(0, 0);
      return;
    }
    const speed = e.speed * 0.5; // amble slower than a chase
    let dirX = dx / d;
    let dirY = dy / d;
    // Sidestep any patrol-mate in the way. This is PERPENDICULAR steering (go
    // around), not repulsion (back off): pushing straight apart deadlocks two
    // enemies walking toward each other — separateEnemies() shoves them back as
    // fast as they step forward, so they freeze face-to-face. A perpendicular
    // nudge preserves forward speed and lets them flow past instead.
    const av = this.patrolAvoid(e, dirX, dirY);
    dirX += av.x;
    dirY += av.y;
    const len = Math.hypot(dirX, dirY) || 1;
    dirX /= len;
    dirY /= len;
    e.facing = Math.atan2(dirY, dirX); // look where you're actually heading
    e.setVelocity(dirX * speed, dirY * speed);
  }

  /**
   * Sidestep steering for a patrolling enemy: for each other enemy that's close
   * and roughly AHEAD of `e`'s heading (dirX,dirY), return a vector perpendicular
   * to the heading, pointing to whichever side clears the blocker. Perpendicular
   * (not repulsive) so it curves the path around a bump without killing forward
   * motion — the fix for the head-on patrol deadlock. O(n²) over the handful of
   * live enemies.
   */
  patrolAvoid(e, dirX, dirY) {
    const R = UNIT.radius * 3; // start easing around within ~3 radii
    let ax = 0;
    let ay = 0;
    for (const o of this.enemies.getChildren()) {
      if (o === e || !o.active) continue;
      const ox = o.x - e.x;
      const oy = o.y - e.y;
      const dist = Math.hypot(ox, oy);
      if (dist < 0.01 || dist > R) continue;
      const ahead = (ox * dirX + oy * dirY) / dist; // 1 = dead ahead, ≤0 = beside/behind
      if (ahead <= 0.15) continue; // only dodge things in front of us
      const w = ((R - dist) / R) * ahead; // closer & more head-on → stronger
      // Which side is the blocker on? cross>0 → to our left, so veer right.
      const cross = dirX * oy - dirY * ox;
      const side = cross > 0 ? -1 : 1;
      ax += -dirY * side * w; // left-perpendicular of the heading, signed to the open side
      ay += dirX * side * w;
    }
    const AVOID = 1.6; // > 1 so a close blocker can dominate and clearly steer around
    return { x: ax * AVOID, y: ay * AVOID };
  }

  /** Enemy AI: chase the player when seen & in range, punch when adjacent. */
  updateEnemies(delta) {
    const p = this.player;
    this.ensureFlowField(); // refresh the chase gradient if the player changed tiles
    for (const e of this.enemies.getChildren()) {
      if (!e.active) continue;
      if (e.attackTimer > 0) e.attackTimer -= delta;
      if (e.slowTimer > 0) {
        e.slowTimer -= delta;
        if (e.slowTimer <= 0) e.setTint(e.baseColor); // Frozen Orb chill wore off
      }

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
          this.patrolEnemy(e, delta); // walk the room walls, looking where it goes
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
      const sp = e.slowTimer > 0 ? e.speed * e.slowMult : e.speed; // slowed?
      const sep = this.enemySeparation(e); // push away from crowding neighbours
      if (d <= e.weapon.range) {
        // In reach: swing at the player. Don't hard-stop into a pile — if others
        // are stacking on the same spot, keep drifting apart (gently) so a mob
        // spreads AROUND the player instead of overlapping into one blob.
        const sl = Math.hypot(sep.x, sep.y);
        if (sl > 0.001) e.setVelocity((sep.x / sl) * sp * 0.6, (sep.y / sl) * sp * 0.6);
        else e.setVelocity(0, 0);
        e.attackTarget = p; // fists box the player
        if (e.attackTimer <= 0) {
          e.weapon.attack({ scene: this, owner: e, target: p });
          e.attackTimer = e.weapon.cooldown * ATTACK_COOLDOWN_MULT;
        }
      } else {
        // Head toward the player. With a clear line of sight, beeline straight
        // (smooth across open rooms); otherwise follow the flow field downhill
        // so we route AROUND walls instead of grinding into a corner. Still FACE
        // the player so fists/aim stay right; blend the separation push so a
        // converging pack flows around itself instead of jamming onto one tile.
        let dx;
        let dy;
        if (this.hasLineOfSight(e.x, e.y, p.x, p.y)) {
          dx = Math.cos(e.facing);
          dy = Math.sin(e.facing);
        } else {
          const step = this.flowStep(e); // path direction around the walls
          if (step) {
            dx = step.x;
            dy = step.y;
          } else {
            dx = Math.cos(e.facing); // no path known — fall back to a beeline
            dy = Math.sin(e.facing);
          }
        }
        let vx = dx + sep.x;
        let vy = dy + sep.y;
        const len = Math.hypot(vx, vy) || 1;
        e.setVelocity((vx / len) * sp, (vy / len) * sp);
        e.attackTarget = null; // fists ride on the sides while chasing
      }
    }
  }

  /**
   * Refresh the chase flow field if the player has walked onto a new tile (it's
   * a gradient measured from the player, so only their tile matters). Cheap BFS —
   * recomputing only on a tile change keeps it near-free. Every alerted enemy
   * then just walks downhill on this field, so pathing cost is O(1) per enemy
   * regardless of how many are chasing.
   */
  ensureFlowField() {
    const W = this.level.width;
    const H = this.level.height;
    const grid = this.level.grid;
    const ptx = Math.floor(this.player.x / TILE);
    const pty = Math.floor(this.player.y / TILE);
    if (this.flowField && this.flowTX === ptx && this.flowTY === pty) return; // still current

    // (Re)allocate the distance buffer once per level, then reuse it each frame.
    if (!this.flowField || this.flowField.length !== W * H) {
      this.flowField = new Int32Array(W * H);
    }
    const distField = this.flowField;
    distField.fill(-1); // -1 = wall / not yet reached
    this.flowTX = ptx;
    this.flowTY = pty;

    // Guard: a player tile off-grid or in a wall yields no field (enemies then
    // fall back to a beeline). Shouldn't happen, but keeps the BFS well-formed.
    if (ptx < 0 || pty < 0 || ptx >= W || pty >= H || grid[pty][ptx] === WALL) {
      this.flowField = null; // mark unusable this frame
      return;
    }

    // Breadth-first flood from the player over floor tiles: distField holds the
    // step-count back to the player, so a lower neighbour is always "toward" them.
    const queue = new Int32Array(W * H);
    let head = 0;
    let tail = 0;
    const start = pty * W + ptx;
    distField[start] = 0;
    queue[tail++] = start;
    while (head < tail) {
      const cell = queue[head++];
      const cx = cell % W;
      const cy = (cell - cx) / W;
      const nd = distField[cell] + 1;
      // 4-connected flood (corridors are axis-aligned; diagonals are handled at
      // read time in flowStep with a corner-cut guard).
      if (cx > 0 && grid[cy][cx - 1] !== WALL && distField[cell - 1] < 0) {
        distField[cell - 1] = nd;
        queue[tail++] = cell - 1;
      }
      if (cx < W - 1 && grid[cy][cx + 1] !== WALL && distField[cell + 1] < 0) {
        distField[cell + 1] = nd;
        queue[tail++] = cell + 1;
      }
      if (cy > 0 && grid[cy - 1][cx] !== WALL && distField[cell - W] < 0) {
        distField[cell - W] = nd;
        queue[tail++] = cell - W;
      }
      if (cy < H - 1 && grid[cy + 1][cx] !== WALL && distField[cell + W] < 0) {
        distField[cell + W] = nd;
        queue[tail++] = cell + W;
      }
    }
  }

  /**
   * Direction (unit vector) enemy `e` should move to follow the flow field toward
   * the player, routing around walls. Picks the neighbouring tile with the lowest
   * step-count (diagonals only when not cutting a wall corner) and aims at its
   * centre. Returns null if no field / no downhill neighbour (caller beelines).
   */
  flowStep(e) {
    const field = this.flowField;
    if (!field) return null;
    const W = this.level.width;
    const H = this.level.height;
    const grid = this.level.grid;
    const tx = Math.floor(e.x / TILE);
    const ty = Math.floor(e.y / TILE);
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return null;
    const here = field[ty * W + tx];
    if (here < 0) return null; // enemy sits on an unreachable/wall tile

    let best = here;
    let bx = tx;
    let by = ty;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = tx + dx;
        const ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (grid[ny][nx] === WALL) continue;
        const nd = field[ny * W + nx];
        if (nd < 0) continue;
        // Don't cut a diagonal through a wall corner (would clip geometry).
        if (dx !== 0 && dy !== 0 && (grid[ty][nx] === WALL || grid[ny][tx] === WALL)) continue;
        if (nd < best) {
          best = nd;
          bx = nx;
          by = ny;
        }
      }
    }
    if (bx === tx && by === ty) return null; // already at/adjacent to the target tile

    const cxp = (bx + 0.5) * TILE;
    const cyp = (by + 0.5) * TILE;
    const vx = cxp - e.x;
    const vy = cyp - e.y;
    const l = Math.hypot(vx, vy) || 1;
    return { x: vx / l, y: vy / l };
  }

  /**
   * Boids-style separation for enemy `e`: a steering vector pointing away from
   * other enemies within a couple of body-widths, weighted by how close each one
   * is (0 at the edge of range, strongest when touching). Blended into the chase
   * direction in updateEnemies() so a converging pack spreads and slides past
   * each other rather than wedging into one spot. O(n²) over enemies — trivial
   * for the handful alive per level.
   */
  enemySeparation(e) {
    const R = UNIT.radius * 2.4; // start easing apart at ~2.4 radii
    const STRENGTH = 1.6; // > 1 so a tight cluster can briefly override the chase
    const kids = this.enemies.getChildren();
    const myIdx = kids.indexOf(e);
    let sx = 0;
    let sy = 0;
    for (let k = 0; k < kids.length; k++) {
      const o = kids[k];
      if (o === e || !o.active) continue;
      const dx = e.x - o.x;
      const dy = e.y - o.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.01) {
        // (Near-)exactly stacked: a symmetric push would send both the SAME way
        // and they'd never part (the lockstep trap). Break it deterministically
        // by index so the pair escapes along OPPOSITE directions.
        sx += myIdx < k ? -1 : 1;
      } else if (d < R) {
        const w = (R - d) / R; // 0 at edge → 1 at contact
        sx += (dx / d) * w;
        sy += (dy / d) * w;
      }
    }
    return { x: sx * STRENGTH, y: sy * STRENGTH };
  }

  /**
   * Hard guarantee that no two enemies visually overlap. The boids steering in
   * updateEnemies() keeps a pack flowing apart, but steering is a soft force —
   * this resolves any residual overlap directly by position (Arcade's collider
   * won't reliably separate co-located bodies). Each overlapping pair is pushed
   * apart to a full body-width, but a push is only applied on an axis if it
   * doesn't shove the enemy into a wall tile — so nothing ever wedges into
   * geometry (the old version's failure mode). O(n²), trivial for a few enemies.
   */
  separateEnemies() {
    const minDist = UNIT.radius * 2; // touching, not overlapping
    const es = this.enemies.getChildren();
    for (let i = 0; i < es.length; i++) {
      const a = es[i];
      // Only push apart enemies that are AGGROED. Idle patrollers get no backward
      // separation push — that push is what deadlocks a bumping pair (they'd be
      // shoved back as fast as they walk forward). Their sidestep steering keeps
      // them from overlapping in the first place; if it can't, they just pass
      // through instead of freezing.
      if (!a.active || !a.alerted) continue;
      for (let j = i + 1; j < es.length; j++) {
        const b = es[j];
        if (!b.active || !b.alerted) continue;

        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= minDist) continue;
        if (d < 0.01) {
          // Perfectly stacked: pick a deterministic axis by index so the pair
          // parts instead of being nudged the same way.
          dx = i < j ? -1 : 1;
          dy = 0;
          d = 1;
        }
        const push = (minDist - d) / 2;
        const nx = (dx / d) * push;
        const ny = (dy / d) * push;
        this.nudgeEnemy(a, -nx, -ny);
        this.nudgeEnemy(b, nx, ny);
      }
    }
  }

  /** Move enemy `e` by (mx,my), per-axis, skipping any step into a wall tile. */
  nudgeEnemy(e, mx, my) {
    if (!this.isWallAt(e.x + mx, e.y)) e.x += mx;
    if (!this.isWallAt(e.x, e.y + my)) e.y += my;
    e.body.updateFromGameObject(); // keep the physics body in sync with the move
  }

  /** True if world-point (x,y) lies in a wall tile. */
  isWallAt(x, y) {
    const row = this.level.grid[Math.floor(y / TILE)];
    return !row || row[Math.floor(x / TILE)] === WALL;
  }

  /** Redraw all world-space bars/labels: player HP+XP+level, and each enemy. */
  drawOverlays() {
    this.fx.clear();

    // Player: HP bar floats above the dot (mirrored on the avatar frame too);
    // the level number is gone from the body — it lives on the avatar now.
    this.drawBowDeadzone(this.player); // red no-shoot ring when a foe is point-blank
    this.drawHealthBar(this.player, UNIT.radius);
    this.drawFace(this.player, UNIT.radius);
    this.drawEquipment(this.player);
    this.drawBowCooldown(this.player);
    this.drawShieldCooldown(this.player);

    // Enemies: HP bar + level number + face each.
    for (const e of this.enemies.getChildren()) {
      if (!e.active) continue;
      this.drawHealthBar(e, ENEMY.radius);
      this.drawFace(e, ENEMY.radius);
      if (e.slowTimer > 0 && e.slowMult <= 0.6) {
        // Thin blue ring marks a Frozen-Orb-chilled enemy (not brief fist jabs).
        this.fx.lineStyle(1.5, FROST.tint, 0.9);
        this.fx.strokeCircle(e.x, e.y, ENEMY.radius + 4);
      }
      this.placeLevelNumber(e.label, e, ENEMY.radius);
    }

    this.drawBowReticle(this.player); // marks the enemy the bow will shoot
    this.drawBombs(); // burning fuses on dropped bombs
  }

  /** Draw the equipped bow (arc in front) and/or shield (arc, dim on cooldown). */
  drawEquipment(p) {
    const g = this.fx;
    const f = p.facing ?? 0;

    if (p.weapon.id === 'bow' && !p.usingBow) {
      // Stowed on the back while punching a point-blank enemy.
      const back = f + Math.PI;
      const bx = p.x + Math.cos(back) * (UNIT.radius + 3);
      const by = p.y + Math.sin(back) * (UNIT.radius + 3);
      const perp = back + Math.PI / 2;
      g.lineStyle(2, 0xd8c8a0, 0.75); // wooden limb on the back
      g.beginPath();
      g.arc(bx, by, 8, back - Math.PI * 0.5, back + Math.PI * 0.5);
      g.strokePath();
      g.lineStyle(1, 0xffffff, 0.5); // slack string across the tips
      g.beginPath();
      g.moveTo(bx + Math.cos(perp) * 8, by + Math.sin(perp) * 8);
      g.lineTo(bx - Math.cos(perp) * 8, by - Math.sin(perp) * 8);
      g.strokePath();
    } else if (p.weapon.id === 'bow') {
      // Bow held out front in both hands, with an animated string.
      const reach = UNIT.radius + 7;
      const bx = p.x + Math.cos(f) * reach;
      const by = p.y + Math.sin(f) * reach;
      const perp = f + Math.PI / 2;
      const limb = 10;
      const tipLx = bx + Math.cos(perp) * limb;
      const tipLy = by + Math.sin(perp) * limb;
      const tipRx = bx - Math.cos(perp) * limb;
      const tipRy = by - Math.sin(perp) * limb;
      const pull = (p.bowDraw ?? 0) * 9;
      const nx = bx - Math.cos(f) * pull; // string nock (pulled back while drawn)
      const ny = by - Math.sin(f) * pull;

      g.lineStyle(2.5, 0xd8c8a0, 0.95); // wooden limbs (arc bulging forward)
      g.beginPath();
      g.arc(bx, by, limb, f - Math.PI * 0.5, f + Math.PI * 0.5);
      g.strokePath();

      g.lineStyle(1, 0xffffff, 0.85); // string: straight at rest, a V when drawn
      g.beginPath();
      g.moveTo(tipLx, tipLy);
      g.lineTo(nx, ny);
      g.lineTo(tipRx, tipRy);
      g.strokePath();

      if (p.bowDraw > 0.05) {
        // A nocked arrow, fading as the string releases.
        g.lineStyle(2, COLORS.player, 0.9 * p.bowDraw);
        g.beginPath();
        g.moveTo(nx, ny);
        g.lineTo(nx + Math.cos(f) * (limb + 6), ny + Math.sin(f) * (limb + 6));
        g.strokePath();
      }
    }

    if (p.hasShield) {
      // A shield arc on the dot's left side; dims while recharging.
      const side = f + Math.PI * 0.5;
      const sx = p.x + Math.cos(side) * (UNIT.radius + 1);
      const sy = p.y + Math.sin(side) * (UNIT.radius + 1);
      const ready = p.shieldTimer <= 0;
      g.lineStyle(3, 0xbfe3ff, ready ? 0.95 : 0.3);
      g.beginPath();
      g.arc(sx, sy, 7, side - Math.PI * 0.6, side + Math.PI * 0.6);
      g.strokePath();
    }
  }

  /** A white "reloading" bar under the dot while the bow's shot recharges. */
  drawBowCooldown(p) {
    if (p.weapon.id !== 'bow' || p.attackTimer <= 0) return;
    const max = p.attackCooldownMax || p.weapon.cooldown;
    const prog = clamp(1 - p.attackTimer / max, 0, 1); // 0 just-fired → 1 ready
    this.drawCooldownBar(p, prog, 0xffffff, 6);
  }

  /** A blue recharge bar under the dot while the shield is on its block cooldown. */
  drawShieldCooldown(p) {
    if (!p.hasShield || p.shieldTimer <= 0) return;
    const prog = clamp(1 - p.shieldTimer / SHIELD.blockCooldown, 0, 1);
    // Sit below the bow bar if both are showing.
    const offset = p.weapon.id === 'bow' ? 12 : 6;
    this.drawCooldownBar(p, prog, 0xbfe3ff, offset);
  }

  /** A small progress bar under the dot (`prog` 0..1) at vertical `offset`. */
  drawCooldownBar(p, prog, color, offset) {
    const w = UNIT.radius * 2;
    const h = 3;
    const x = p.x - w / 2;
    const y = p.y + UNIT.radius + offset;
    const g = this.fx;
    g.fillStyle(0x000000, 0.5);
    g.fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle(color, 0.95);
    g.fillRect(x, y, w * prog, h);
  }

  /** Draw a crosshair reticle on the enemy the equipped bow will fire at. */
  drawBowReticle(p) {
    if (!p.usingBow) return; // only while actually shooting (not point-blank fists)
    const t = p.attackTarget;
    if (!t || !t.active) return;
    const g = this.fx;
    const r = ENEMY.radius + 7;
    g.lineStyle(1.5, COLORS.player, 0.9);
    g.strokeCircle(t.x, t.y, r);
    g.beginPath();
    for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      g.moveTo(t.x + Math.cos(a) * (r - 4), t.y + Math.sin(a) * (r - 4));
      g.lineTo(t.x + Math.cos(a) * (r + 4), t.y + Math.sin(a) * (r + 4));
    }
    g.strokePath();
  }

  /** Put a character's level number on its body, toward the back (behind the face). */
  placeLevelNumber(label, entity, radius) {
    const f = entity.facing ?? 0;
    const back = radius * 0.38;
    label
      .setPosition(entity.x - Math.cos(f) * back, entity.y - Math.sin(f) * back)
      .setText(`${entity.level}`);
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

  /**
   * When a bow is equipped and a foe has slipped inside BOW.minRange — the range
   * where the bow can't fire and the dot falls back to fists — ring that dead
   * zone in translucent red so the player sees the gap they need to keep.
   */
  drawBowDeadzone(p) {
    if (p.weapon.id !== 'bow') return;
    const r = BOW.minRange;
    let foeClose = false;
    for (const e of this.enemies.getChildren()) {
      if (e.active && dist(p.x, p.y, e.x, e.y) < r) {
        foeClose = true;
        break;
      }
    }
    if (!foeClose) return;
    const g = this.fx;
    g.fillStyle(0xff3b3b, 0.1);
    g.fillCircle(p.x, p.y, r);
    g.lineStyle(1.5, 0xff5a5a, 0.5);
    g.strokeCircle(p.x, p.y, r);
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

  /**
   * Top-right Stage/Level readouts, plus a WoW-style XP bar spanning the full
   * width of the action bar and sitting just above it. The bar shares the
   * hotbar's geometry (see drawHotbar) so the two always line up.
   */
  updateXpUi() {
    const p = this.player;
    const right = this.scale.width - 14;
    this.stageText.setPosition(right, 10).setText(`Stage ${this.depth}`); // dungeon depth

    // Match the action bar's span exactly.
    const n = HOTBAR.slots;
    const gap = 5;
    const slot = this.hotbarSlotSize();
    const totalW = n * slot + (n - 1) * gap;
    const x = Math.round(this.scale.width / 2 - totalW / 2);
    const barH = 13;
    const hotbarTop = this.scale.height - slot - 8;
    const yBar = hotbarTop - barH - 5; // rest just above the slots

    // "Level X" sits just above the XP bar (centered on it).
    this.levelText
      .setOrigin(0.5, 1)
      .setPosition(x + totalW / 2, yBar - 3)
      .setText(`Level ${p.level}`);

    this.xpBarBg.setPosition(x, yBar).setDisplaySize(totalW, barH);
    this.xpBarFill.setPosition(x, yBar).setDisplaySize(totalW * clamp(p.xp / p.xpToNext, 0, 1), barH);
    this.xpText
      .setOrigin(0.5, 0.5)
      .setPosition(x + totalW / 2, yBar + barH / 2)
      .setText(`${p.xp} / ${p.xpToNext} XP`);
    this.xpBarY = yBar;
  }

  /**
   * Position + fill the blue mana bar, tucked into the avatar frame directly
   * below the player's HP bar (same width). Hidden entirely unless the player
   * holds a mana-cost item (it's the item that "reveals" it).
   */
  updateManaUi() {
    const show = this.hasManaItem();
    this.manaBarBg.setVisible(show);
    this.manaBarFill.setVisible(show);
    this.manaText.setVisible(show);
    if (!show) return;

    const p = this.player;
    // Falls in step with drawAvatar's geometry (x=12, size=46, HP bar bottom).
    const box = this.avatarBox ?? { x: 12, w: 46, manaY: 113 };
    const barH = 7;
    this.manaBarBg.setPosition(box.x, box.manaY).setDisplaySize(box.w, barH);
    this.manaBarFill
      .setPosition(box.x, box.manaY)
      .setDisplaySize(box.w * clamp(p.mana / p.maxMana, 0, 1), barH);
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

    // Choose the weapon to actually use this frame. A bow only shoots enemies
    // that are on-screen and out of the fog; it can't fire point-blank, so when
    // the nearest visible foe is closer than BOW.minRange the dot punches instead.
    let weapon = p.weapon;
    if (p.weapon.id === 'bow') {
      const nearest = this.nearestEnemyInArc(p, p.weapon.range, p.facing, Math.PI, true);
      if (nearest && dist(p.x, p.y, nearest.x, nearest.y) < BOW.minRange) weapon = getWeapon('fists');
    }
    const ranged = weapon.kind === 'ranged';
    p.usingBow = ranged; // true only while actually shooting (drives reticle)

    // A clicked (focus) enemy in range takes priority; otherwise auto-target the
    // nearest enemy (all-around + visible for the bow, front-arc for melee).
    let target = null;
    const f = p.focusEnemy;
    const focusVisible = ranged ? f && this.enemyVisible(f) : true;
    if (f && f.active && dist(p.x, p.y, f.x, f.y) <= weapon.range && focusVisible) {
      target = f;
    } else {
      const arc = ranged ? Math.PI : UNIT.attackArc; // PI = any direction
      target = this.nearestEnemyInArc(p, weapon.range, p.facing, arc, ranged);
    }

    // Turn to aim at the target (so fists box it / the bow + arrow point at it).
    if (target && (ranged || target === f)) {
      p.facing = angleBetween(p.x, p.y, target.x, target.y);
    }

    p.attackTarget = target || null; // drives fist orientation + bow reticle
    if (target && p.attackTimer <= 0) {
      weapon.attack({ scene: this, owner: p, target });
      p.attackTimer = weapon.cooldown * ATTACK_COOLDOWN_MULT;
      p.attackCooldownMax = p.attackTimer;
      if (ranged) p.bowDraw = 1; // kick off the string/hand release animation
    }
  }

  /**
   * Nearest active enemy within `range` and within `halfArc` of `facing`
   * (center-to-center), or null. A halfArc of PI means "any direction".
   */
  nearestEnemyInArc(from, range, facing, halfArc, requireVisible = false) {
    let best = null;
    let bestDist = range;
    for (const e of this.enemies.getChildren()) {
      if (!e.active) continue;
      const d = dist(from.x, from.y, e.x, e.y);
      if (d > bestDist) continue;
      const toEnemy = angleBetween(from.x, from.y, e.x, e.y);
      if (Math.abs(angleDelta(facing, toEnemy)) > halfArc) continue; // not facing it
      if (requireVisible && !this.enemyVisible(e)) continue; // fogged / off-screen
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
      if (target.faction === 'enemy') {
        // Floating "+N XP" reward (amber), offset from the white damage number.
        this.showDamageNumber(tx + 16, ty + 6, `+${target.level} XP`, '#ffcf5c');
        this.grantXp(target.level);
        this.dropPixels(tx, ty);
      }
    } else {
      this.flashHit(target);
    }
  }

  /**
   * On a kill, maybe drop resource pixels — but only the kinds the player can
   * actually use: a red HP pixel needs a held potion, a blue mana pixel needs a
   * held mana item. This is how holding the item "unlocks" collecting them.
   */
  dropPixels(x, y) {
    if (this.heldPotionSlot() && Math.random() < POTION.dropChance) this.createPixel(x, y, 'hp');
    if (this.hasManaItem() && Math.random() < MANA.dropChance) this.createPixel(x, y, 'mana');
  }

  /** Spawn a little resource pixel that scatters near (x,y) and bobs in place. */
  createPixel(x, y, type) {
    const color = type === 'mana' ? COLORS.manaPixel : COLORS.hpPixel;
    const ox = (Math.random() - 0.5) * 2 * PIXEL.scatter;
    const oy = (Math.random() - 0.5) * 2 * PIXEL.scatter;
    const px = this.physics.add.sprite(x + ox, y + oy, 'pixel').setTint(color).setDepth(0);
    px.pixelType = type;
    // (No bob tween — it fought the magnet's velocity and cancelled the vertical
    // pull. Idle pixels sit still; updatePixels() floats them to the dot when near.)
    this.pixels.add(px);
    return px;
  }

  /** Collect a pixel: red refills the held potion, blue refills mana. */
  collectPixel(px) {
    const p = this.player;
    if (px.pixelType === 'mana') {
      p.mana = Math.min(p.maxMana, p.mana + randInt(Math.random, MANA.restoreMin, MANA.restoreMax));
    } else {
      const slot = this.heldPotionSlot();
      if (slot) {
        const cap = getItem(slot.id).capacity;
        slot.charge = Math.min(cap, slot.charge + randInt(Math.random, POTION.refillMin, POTION.refillMax));
      }
    }
    this.tweens.killTweensOf(px);
    px.destroy();
  }

  /**
   * Magnet nearby pixels toward the dot each frame so collection feels good
   * (physics overlap still does the actual pickup on contact).
   */
  updatePixels() {
    const p = this.player;
    for (const px of this.pixels.getChildren()) {
      if (!px.active) continue;
      const dx = p.x - px.x;
      const dy = p.y - px.y;
      const d = Math.hypot(dx, dy);
      if (d > 0 && d < PIXEL.magnetRange) {
        px.setVelocity((dx / d) * PIXEL.magnetSpeed, (dy / d) * PIXEL.magnetSpeed);
      } else {
        px.setVelocity(0, 0);
      }
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

  /** An expanding ring — visual for bombs / area spells. */
  blastEffect(x, y, radius, color) {
    const ring = this.add.circle(x, y, radius, color, 0).setStrokeStyle(3, color, 0.85).setDepth(2);
    ring.setScale(0.2);
    this.tweens.add({
      targets: ring,
      scale: 1,
      alpha: 0,
      duration: 320,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
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
    // Partial refill on level-up — 20% of max HP and mana (the ONLY time HP heals).
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * LEVELUP.replenishFraction);
    p.mana = Math.min(p.maxMana, p.mana + p.maxMana * LEVELUP.replenishFraction);
    playLevelUp();
    this.showSwingPulse(p); // quick visual pop
    // Floating "Level up!" over the dot — same style as the shield-block text.
    this.showDamageNumber(p.x, p.y, 'Level up!', '#ffcf5c');
  }

  /** Damage the player (respecting weapon defense); trigger death at 0 HP. */
  damagePlayer(amount) {
    const p = this.player;
    if (p.dead) return true;

    // Shield: fully absorb one hit, then recharge before it can block again.
    if (p.hasShield && p.shieldTimer <= 0) {
      p.shieldTimer = SHIELD.blockCooldown;
      playBlock();
      this.showDamageNumber(p.x, p.y, 'block', '#bfe3ff');
      return false;
    }

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

  /**
   * Fire a projectile (weapons.js calls this). Hits enemies if the player fired
   * it, the player if an enemy did. `opts.speedMult`/`damageMult`/`pierce` come
   * from a weapon's special shot.
   */
  spawnProjectile(owner, angle, weapon, opts = {}) {
    const speed = (weapon.projectileSpeed ?? 300) * (opts.speedMult ?? 1);
    const damage = weapon.damage * (opts.damageMult ?? 1);
    const color = owner.faction === 'player' ? COLORS.player : COLORS.enemyMelee;
    const d0 = UNIT.radius + 6; // spawn just outside the shooter
    const proj = new Projectile(
      this,
      owner.x + Math.cos(angle) * d0,
      owner.y + Math.sin(angle) * d0,
      angle,
      { faction: owner.faction, damage, pierce: !!opts.pierce, speed, color }
    );
    this.projectiles.add(proj);
    // Set velocity AFTER adding so nothing can zero it — the arrow flies along
    // its aim vector toward the target.
    proj.body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    if (owner.faction === 'player') playArrow(); // "fffft"
    return proj;
  }

  /** Fly projectiles: fizzle on walls/lifespan, damage the first target hit. */
  updateProjectiles(delta) {
    for (const pr of this.projectiles.getChildren().slice()) {
      if (!pr.active) continue;
      pr.life -= delta;

      // Fizzle on lifespan or when it enters a wall tile.
      const tx = Math.floor(pr.x / TILE);
      const ty = Math.floor(pr.y / TILE);
      const row = this.level.grid[ty];
      if (pr.life <= 0 || !row || row[tx] === WALL) {
        pr.destroy();
        continue;
      }

      if (pr.faction === 'player') {
        for (const e of this.enemies.getChildren()) {
          if (!e.active || pr.hitTargets.has(e)) continue;
          if (dist(pr.x, pr.y, e.x, e.y) <= ENEMY.radius + PROJECTILE.radius) {
            this.dealDamage(e, pr.damage);
            pr.hitTargets.add(e);
            if (pr.faction === 'player') playPunch(); // the usual impact sound
            if (!pr.pierce) {
              pr.destroy();
              break;
            }
          }
        }
      } else {
        const p = this.player;
        if (!p.dead && dist(pr.x, pr.y, p.x, p.y) <= UNIT.radius + PROJECTILE.radius) {
          p.takeDamage(pr.damage);
          if (!pr.pierce) pr.destroy();
        }
      }
    }
  }

  /**
   * Bombs are physics bodies you can shove around. One-time world colliders so
   * a rolling bomb stops at walls and clacks off other bombs.
   */
  setupBombPhysics() {
    this.bombGroup = this.physics.add.group();
    this.physics.add.collider(this.bombGroup, this.walls);
    this.physics.add.collider(this.bombGroup, this.bombGroup);
  }

  /** Drop a ticking, rollable bomb at (x,y). Multiple bombs can be live at once. */
  placeBomb(x, y) {
    const sprite = this.bombGroup.create(x, y, 'bomb_body').setScale(1.6).setDepth(1);
    sprite.body.setCircle(7, 3, 5); // ball is drawn at (10,12) r=7 in the 20×20 frame
    sprite.setDrag(BOMB.drag);
    sprite.setMaxVelocity(BOMB.maxSpeed);
    sprite.setBounce(BOMB.bounce);
    this.bombs.push({ sprite, fuse: BOMB.fuse });
  }

  /**
   * Tick dropped-bomb fuses (detonate at 0) and let the player bowl them: when
   * you're touching a bomb and moving toward it, it rolls off in that direction
   * at a speed set by how hard you ran in. Drag then coasts it to a stop.
   */
  updateBombs(delta) {
    const p = this.player;
    const pv = p.body.velocity;
    const pSpeed = Math.hypot(pv.x, pv.y);
    const contact = UNIT.radius + 11 + 2; // dot radius + bomb ball radius + slack
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      if (pSpeed > 5) {
        const dx = b.sprite.x - p.x;
        const dy = b.sprite.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < contact) {
          const closing = (pv.x * dx + pv.y * dy) / d; // run speed toward the bomb
          if (closing > 0) {
            const roll = closing * BOMB.push;
            b.sprite.setVelocity((dx / d) * roll, (dy / d) * roll);
          }
        }
      }
      b.fuse -= delta;
      if (b.fuse <= 0) {
        this.explodeBomb(b);
        this.bombs.splice(i, 1);
      }
    }
  }

  /** Draw each dropped bomb's shrinking fuse with a flickering flame at the tip. */
  drawBombs() {
    const g = this.fx;
    const now = this.time.now;
    for (const b of this.bombs) {
      const bx = b.sprite.x;
      const by = b.sprite.y;
      const S = 1.6; // bomb sprite scale
      const bodyTop = by - 5 * S; // fuse enters the body here
      const fuseTop = by - 13 * S; // lit end at drop time
      const t = clamp(1 - b.fuse / BOMB.fuse, 0, 1); // 0 fresh → 1 boom
      const flameY = fuseTop + t * (bodyTop - fuseTop); // burn point descends

      // Remaining (unburnt) fuse: flame → body.
      g.lineStyle(2, 0x8a6a3a, 1);
      g.beginPath();
      g.moveTo(bx, flameY);
      g.lineTo(bx, bodyTop);
      g.strokePath();

      // Flickering flame at the burn point.
      const flick = 1 + Math.sin(now * 0.04 + bx * 0.3) * 0.35;
      g.fillStyle(0xff8a2a, 0.9);
      g.fillCircle(bx, flameY, 3.6 * flick);
      g.fillStyle(0xffe08a, 0.95);
      g.fillCircle(bx, flameY - 1, 1.9 * flick);
    }
  }

  /** Detonate a dropped bomb: blast ring, AoE damage, and a boom. */
  explodeBomb(b) {
    const { x, y } = b.sprite;
    b.sprite.destroy();
    this.blastEffect(x, y, BOMB.radius, 0xffab3d);
    for (const e of this.enemies.getChildren()) {
      if (e.active && dist(e.x, e.y, x, y) <= BOMB.radius) this.dealDamage(e, BOMB.damage);
    }
    playExplosion();
  }

  /**
   * Slow an enemy: a stronger slow (lower mult) or a fresh one wins — a weak
   * jab never overrides an active Frozen-Orb chill. Extends the slow timer.
   */
  applySlow(e, mult, duration) {
    if (e.slowTimer <= 0 || mult < e.slowMult) e.slowMult = mult;
    e.slowTimer = Math.max(e.slowTimer, duration);
  }

  /**
   * A landed fists punch staggers an enemy: a brief slow, a visible shove back,
   * a white flash, and a small impact spark. The knockback is wall-clamped so a
   * cornered enemy is never pushed through geometry.
   */
  fistImpact(target, attacker) {
    if (!target || !target.active || target.faction !== 'enemy') return;
    this.applySlow(target, FISTS.slowMult, FISTS.slowDuration);
    const a = angleBetween(attacker.x, attacker.y, target.x, target.y);
    const nx = target.x + Math.cos(a) * FISTS.knockback;
    const ny = target.y + Math.sin(a) * FISTS.knockback;
    // Only move if the destination (a little past the body edge) is clear floor.
    const tx = Math.floor((nx + Math.cos(a) * ENEMY.radius) / TILE);
    const ty = Math.floor((ny + Math.sin(a) * ENEMY.radius) / TILE);
    if (this.level.grid[ty]?.[tx] !== WALL) {
      target.x = nx;
      target.y = ny;
    }
    this.flashHit(target);
    this.hitSpark(target.x, target.y, a);
  }

  /**
   * A quick burst of tiny sparks flying off an impact point, fading as they go.
   * Pure display objects (no physics) so nothing zeroes their motion; each one
   * tweens outward then destroys itself.
   */
  hitSpark(x, y, angle) {
    for (let i = 0; i < 5; i++) {
      const spread = angle + (Math.random() - 0.5) * 1.8;
      const dist = 8 + Math.random() * 10;
      const s = this.add.circle(x, y, 1.5 + Math.random(), 0xffffff).setDepth(5);
      this.tweens.add({
        targets: s,
        x: x + Math.cos(spread) * dist,
        y: y + Math.sin(spread) * dist,
        alpha: 0,
        scale: 0.2,
        duration: 160 + Math.random() * 80,
        ease: 'Quad.easeOut',
        onComplete: () => s.destroy(),
      });
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

}

// ============================================================================
// Local helpers (module-private)
// ============================================================================

/** Format an integer colour as a CSS hex string (e.g. 0x3ad0ff → "#3ad0ff"). */
function hexColor(int) {
  return '#' + int.toString(16).padStart(6, '0');
}

/** Is tile (tx,ty) inside room `r` (tile-space {x,y,w,h})? */
function tileInRoom(tx, ty, r) {
  return tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h;
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
