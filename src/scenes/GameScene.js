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
import { makeRng, randInt, dist, angleDelta, angleBetween, clamp } from '../util.js';
import { Enemy } from '../entities/Enemy.js';
import { getWeapon } from '../weapons.js';

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
    this.player.punchToggle = false; // alternates which side-fist punches
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
  }

  setupCamera() {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.worldW, this.worldH);
    cam.startFollow(this.player, true, 0.15, 0.15); // smooth lerp follow
  }

  setupInput() {
    this.keys = this.input.keyboard.addKeys('W,A,S,D');
    this.input.mouse.disableContextMenu(); // free up right-click for later

    // Esc opens the pause menu (which pauses this scene underneath).
    this.input.keyboard.on('keydown-ESC', () => {
      if (!this.scene.isPaused()) {
        this.scene.pause();
        this.scene.launch('PauseScene');
      }
    });
  }

  /** Fixed on-screen text (doesn't scroll with the world). */
  buildHud() {
    const style = { fontFamily: 'monospace', fontSize: '16px', color: '#cfe6ff' };
    this.add
      .text(12, 10, 'DotAdventure', { ...style, fontSize: '22px', color: '#3ad0ff' })
      .setScrollFactor(0)
      .setDepth(100);
    this.add
      .text(12, 40, 'WASD move · face a square to punch it · reach the ▼ stairs to descend', style)
      .setScrollFactor(0)
      .setDepth(100);
    this.hudText = this.add
      .text(12, 64, '', style)
      .setScrollFactor(0)
      .setDepth(100);
  }

  /** World-space overlay (health bars, dot level) + fixed top-right XP UI. */
  setupOverlay() {
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
  }

  // --------------------------------------------------------------------------
  // Per-frame update
  // --------------------------------------------------------------------------

  update(time, delta) {
    if (!this.player.dead) {
      this.movePlayer();
      this.updateFists(time);
      this.updatePlayerCombat(delta);
      this.checkDescend();
    }
    this.updateEnemies(delta);
    this.drawOverlays();
    this.updateXpUi();
    this.updateHud();
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
   * Position the two side-fists each frame. While boxing an enemy the fists are
   * held up toward that enemy (they stay on its side between punches); otherwise
   * they ride on the character's left/right and wiggle as it moves.
   * A fist that's mid-punch is driven by its tween, so we leave it alone.
   */
  updateFists(time) {
    const p = this.player;
    const v = p.body.velocity;
    const moving = Math.hypot(v.x, v.y) > 5;
    if (moving) p.facing = Math.atan2(v.y, v.x); // face where we're heading

    const lateral = UNIT.radius + 4;

    if (p.attackTarget && p.attackTarget.active) {
      // Guard: both fists flank the direction of the enemy, on its side.
      const aim = angleBetween(p.x, p.y, p.attackTarget.x, p.attackTarget.y);
      const spread = Math.PI * 0.3; // ~54° either side of the aim
      this.placeFist(p.fistL, p, aim - spread, lateral);
      this.placeFist(p.fistR, p, aim + spread, lateral);
      return;
    }

    // Idle / moving: fists on the character's left & right, bobbing out of phase.
    const side = p.facing + Math.PI / 2;
    const wig = moving ? Math.sin(time * 0.02) * 4 : 0;
    const fx = Math.cos(p.facing);
    const fy = Math.sin(p.facing);
    const sx = Math.cos(side);
    const sy = Math.sin(side);
    if (!p.fistL.punching) {
      p.fistL.setPosition(p.x + sx * lateral + fx * wig, p.y + sy * lateral + fy * wig);
    }
    if (!p.fistR.punching) {
      p.fistR.setPosition(p.x - sx * lateral - fx * wig, p.y - sy * lateral - fy * wig);
    }
  }

  /** Place a fist at `angle`/`dist` from an owner, unless it's mid-punch. */
  placeFist(fist, owner, angle, dist) {
    if (fist.punching) return; // its tween owns the position right now
    fist.setPosition(owner.x + Math.cos(angle) * dist, owner.y + Math.sin(angle) * dist);
  }

  /** Enemy AI: chase the player when in aggro range, punch when adjacent. */
  updateEnemies(delta) {
    const p = this.player;
    for (const e of this.enemies.getChildren()) {
      if (!e.active) continue;
      if (e.attackTimer > 0) e.attackTimer -= delta;

      if (p.dead) {
        e.setVelocity(0, 0);
        continue;
      }

      const d = dist(e.x, e.y, p.x, p.y);
      if (d > ENEMY.aggroRange) {
        e.setVelocity(0, 0); // hasn't noticed you yet
        continue;
      }

      e.facing = angleBetween(e.x, e.y, p.x, p.y); // turn to face the player
      if (d <= e.weapon.range) {
        e.setVelocity(0, 0); // in reach — stop and swing
        if (e.attackTimer <= 0) {
          e.weapon.attack({ scene: this, owner: e, target: p });
          e.attackTimer = e.weapon.cooldown;
        }
      } else {
        e.setVelocity(Math.cos(e.facing) * e.speed, Math.sin(e.facing) * e.speed);
      }
    }
  }

  /** Redraw all world-space bars/labels: player HP+XP+level, and each enemy. */
  drawOverlays() {
    this.fx.clear();

    // Player: HP bar + level label above the dot (XP lives in the top-right UI).
    this.drawHealthBar(this.player, UNIT.radius);
    this.playerLabel
      .setPosition(this.player.x, this.player.y - UNIT.radius - 12)
      .setText(`Lv ${this.player.level}`);

    // Enemies: HP bar + level label each.
    for (const e of this.enemies.getChildren()) {
      if (!e.active) continue;
      this.drawHealthBar(e, ENEMY.radius);
      e.label.setPosition(e.x, e.y - ENEMY.radius - 12).setText(`Lv ${e.level}`);
    }
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

  /**
   * Auto-attack: hit the nearest enemy that is both in weapon range AND within
   * the dot's front-facing arc. Turn away and you stop swinging at it.
   */
  updatePlayerCombat(delta) {
    const p = this.player;
    if (p.attackTimer > 0) p.attackTimer -= delta;

    const target = this.nearestEnemyInArc(p, p.weapon.range, p.facing, UNIT.attackArc);
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
    const killed = target.takeDamage(amount);
    if (killed) {
      if (target.faction === 'enemy') this.grantXp(target.level);
    } else {
      this.flashHit(target);
    }
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
    p.hp -= amount * (1 - defense);
    if (p.hp <= 0) {
      p.hp = 0;
      this.onPlayerDead();
      return true;
    }
    return false;
  }

  /** Permadeath: freeze the player and restart the run after a beat. */
  onPlayerDead() {
    const p = this.player;
    p.dead = true;
    p.setVelocity(0, 0);
    p.setTint(0x556070);

    const { width, height } = this.scale;
    this.add
      .text(width / 2, height / 2, 'You died', {
        fontFamily: 'monospace',
        fontSize: '40px',
        color: '#ff6b6b',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(200);

    this.time.delayedCall(1400, () => this.scene.restart({ depth: 1, seed: this.seed }));
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
   * A little fist jabs out from `owner` toward `angle`, then retracts.
   * Alternates left/right each call so it reads as two fists.
   */
  showPunch(owner, angle, scale = 1, color = COLORS.playerFist) {
    owner.punchSide = owner.punchSide === 1 ? -1 : 1;
    const perp = angle + Math.PI / 2;
    const lateral = 6 * owner.punchSide; // sit the fist off to one side
    const near = UNIT.radius;
    const reach = 15 * scale;

    const ox = Math.cos(perp) * lateral;
    const oy = Math.sin(perp) * lateral;
    const fist = this.add.image(
      owner.x + Math.cos(angle) * near + ox,
      owner.y + Math.sin(angle) * near + oy,
      'fist'
    );
    fist.setTint(color).setDepth(2);

    this.tweens.add({
      targets: fist,
      x: owner.x + Math.cos(angle) * (near + reach) + ox,
      y: owner.y + Math.sin(angle) * (near + reach) + oy,
      duration: 55,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => fist.destroy(),
    });
  }

  /**
   * Punch by thrusting one of the character's OWN side-fists toward the target,
   * then letting it snap back to its side. Alternates left/right each punch.
   * While a fist is punching, updateFists() leaves it to this tween.
   */
  punchSideFist(owner, angle, scale = 1) {
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
