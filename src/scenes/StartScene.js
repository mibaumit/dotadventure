// ============================================================================
// StartScene.js — the title / main-menu screen shown before a run begins.
//
// Boots first (see main.js). Presents the game title over a field of drifting
// dots, a big Play button, and a How-to-Play panel. Pressing Play fades out and
// launches GameScene at depth 1 with a fresh random seed.
// ============================================================================

import { COLORS } from '../config.js';
import {
  ensureStarted,
  cycleMusic,
  cycleVolume,
  getMusicVolume,
  setMusicVolume,
  getSfxVolume,
  setSfxVolume,
} from '../sound.js';
import {
  drawSoundIcon as renderSoundIcon,
  drawMusicIcon as renderMusicIcon,
  pointInRect,
} from '../hudIcons.js';
import { attachSliderDrag, makeVolumeSlider } from '../ui.js';

export class StartScene extends Phaser.Scene {
  constructor() {
    super('StartScene');
  }

  create() {
    // Any interaction on the menu is a user gesture — safe to start the audio
    // context so the ambient music plays while the player browses the menu. Also
    // route taps on the corner sound/music icons (same controls as the game HUD).
    this.input.on('pointerdown', (p) => {
      ensureStarted();
      if (this.optionsOpen) return; // the Options overlay owns clicks while open
      if (pointInRect(p, this.soundRect)) {
        cycleVolume();
        this.refreshAudioIcons();
      } else if (pointInRect(p, this.musicRect)) {
        cycleMusic();
        this.refreshAudioIcons();
      }
    });

    this.buildBackground();
    this.buildEmblem();
    this.buildTitle();
    this.buildButtons();
    this.buildAudioControls();
    this.buildFooter();
    this.buildHelpPanel();
    this.setupOptions();

    // Re-center everything when the window is resized (RESIZE scale mode).
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));
    this.layout();

    // Fade the whole screen in on first show.
    this.cameras.main.fadeIn(400, 13, 16, 25);
  }

  // --------------------------------------------------------------------------
  // Drifting-dot background: a slow field of translucent player/enemy-coloured
  // dots that wrap around the screen — gives the title some life.
  // --------------------------------------------------------------------------
  buildBackground() {
    const { width, height } = this.scale;

    // Solid backdrop + a faint radial vignette toward the edges.
    this.bg = this.add.rectangle(0, 0, width, height, COLORS.background).setOrigin(0, 0).setDepth(-20);

    const palette = [COLORS.player, COLORS.enemyMelee, COLORS.enemyArcher, COLORS.playerSelected];
    this.floaters = [];
    for (let i = 0; i < 42; i++) {
      const r = 3 + Math.random() * 12;
      const color = palette[Math.floor(Math.random() * palette.length)];
      const dot = this.add
        .circle(Math.random() * width, Math.random() * height, r, color)
        .setAlpha(0.06 + Math.random() * 0.18)
        .setDepth(-15);
      const speed = 8 + Math.random() * 22;
      const ang = Math.random() * Math.PI * 2;
      this.floaters.push({ dot, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed });
    }
  }

  // --------------------------------------------------------------------------
  // The emblem: a big player-coloured dot with two little side "fists" and a
  // soft pulsing glow ring behind it — echoes how a player unit looks in-game.
  // --------------------------------------------------------------------------
  buildEmblem() {
    this.emblem = this.add.container(0, 0).setDepth(5);

    const glow = this.add.circle(0, 0, 64, COLORS.player, 0.14);
    const ring = this.add.circle(0, 0, 40).setStrokeStyle(3, COLORS.selectionRing, 0.9);
    const fistL = this.add.circle(-30, 0, 8, COLORS.playerFist);
    const fistR = this.add.circle(30, 0, 8, COLORS.playerFist);
    const body = this.add.circle(0, 0, 30, COLORS.player);
    this.emblem.add([glow, fistL, fistR, body, ring]);

    // Gentle "breathing" pulse of the glow.
    this.tweens.add({
      targets: glow,
      scale: { from: 0.9, to: 1.25 },
      alpha: { from: 0.18, to: 0.06 },
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
    // Slow bob of the whole emblem.
    this.tweens.add({
      targets: this.emblem,
      y: '+=10',
      duration: 2200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
  }

  buildTitle() {
    this.title = this.add
      .text(0, 0, 'DOT DUNGEON', {
        fontFamily: 'monospace',
        fontSize: '58px',
        color: '#3ad0ff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(5)
      .setShadow(0, 0, '#0a3a4d', 18, false, true);

    this.tagline = this.add
      .text(0, 0, 'Lead your dot into the depths.', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#9fb4e0',
      })
      .setOrigin(0.5)
      .setDepth(5);
  }

  buildButtons() {
    this.playBtn = this.makeButton(240, 62, '▶  Play', 26, true, () => this.startGame());
    this.trainingBtn = this.makeButton(240, 44, 'Training Room', 16, false, () => this.startGame(true));
    this.optionsBtn = this.makeButton(240, 46, 'Options', 18, false, () => this.toggleOptions(true));
    this.helpBtn = this.makeButton(240, 46, 'How to Play', 18, false, () => this.toggleHelp(true));
    this.menuButtons = [this.playBtn, this.trainingBtn, this.optionsBtn, this.helpBtn];
    this.selectedIndex = -1;
    this.selectButton(0); // Play is highlighted by default
    this.setupMenuKeys();
  }

  // --------------------------------------------------------------------------
  // Corner audio controls — the SAME sound (volume) icon and music switcher the
  // in-game HUD uses (see GameScene.drawSoundIcon / drawMusicIcon). Click-driven
  // like the game; positioned bottom-left by layout().
  // --------------------------------------------------------------------------
  buildAudioControls() {
    this.soundIcon = this.add.graphics().setDepth(6);
    this.soundRect = { x: 0, y: 0, w: 0, h: 0 };
    this.musicIcon = this.add.graphics().setDepth(6);
    this.musicRect = { x: 0, y: 0, w: 0, h: 0 };
    this.musicText = this.add
      .text(0, 0, '', { fontFamily: 'monospace', fontSize: '13px', color: '#cfe6ff' })
      .setOrigin(0, 0.5)
      .setDepth(6);
  }

  /** Redraw the speaker + music-switcher icons for the current audio state. */
  refreshAudioIcons() {
    this.soundRect = renderSoundIcon(this.soundIcon, this.audioX, this.audioY);
    this.musicRect = renderMusicIcon(this.musicIcon, this.musicText, this.audioX, this.audioY);
  }

  buildFooter() {
    this.footer = this.add
      .text(0, 0, 'A squad-tactics roguelike  ·  WASD + mouse  ·  v0.1', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#5b6b8c',
      })
      .setOrigin(0.5)
      .setDepth(5);
  }

  /**
   * A pill button (rounded-ish rect + centred label). Exposes focus()/blur()/
   * activate() so the same highlight is driven by mouse hover AND keyboard
   * (arrow/WASD) selection.
   */
  makeButton(w, h, label, fontSize, primary, onClick) {
    const c = this.add.container(0, 0).setDepth(6);
    const fill = primary ? 0x143a52 : 0x141a2b;
    const baseStrokeAlpha = primary ? 1 : 0.7;
    const baseColor = primary ? '#eaf7ff' : '#cfe6ff';
    const bg = this.add
      .rectangle(0, 0, w, h, fill, primary ? 1 : 0.92)
      .setStrokeStyle(2, COLORS.player, baseStrokeAlpha);
    const txt = this.add
      .text(0, 0, label, {
        fontFamily: 'monospace',
        fontSize: `${fontSize}px`,
        color: baseColor,
        fontStyle: primary ? 'bold' : 'normal',
      })
      .setOrigin(0.5);
    c.add([bg, txt]);
    c.label = txt; // exposed so callers can update the caption (e.g. music track)

    c.setSize(w, h);
    c.setInteractive(new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h), Phaser.Geom.Rectangle.Contains);
    c.input.cursor = 'pointer';

    c.activate = onClick;
    c.focus = () => {
      bg.setStrokeStyle(2, 0xffffff, 1);
      txt.setColor('#ffffff');
      this.tweens.add({ targets: c, scale: 1.06, duration: 110, ease: 'Sine.out' });
    };
    c.blur = () => {
      bg.setStrokeStyle(2, COLORS.player, baseStrokeAlpha);
      txt.setColor(baseColor);
      this.tweens.add({ targets: c, scale: 1, duration: 110, ease: 'Sine.out' });
    };

    // Mouse hover selects the button (keeping mouse + keyboard in sync).
    c.on('pointerover', () => this.selectButton(this.menuButtons.indexOf(c)));
    c.on('pointerdown', () => this.tweens.add({ targets: c, scale: 0.97, duration: 60, yoyo: true }));
    c.on('pointerup', onClick);
    return c;
  }

  /** Highlight button `i` (and un-highlight the previous one). */
  selectButton(i) {
    if (i < 0 || i >= this.menuButtons.length || i === this.selectedIndex) return;
    if (this.selectedIndex >= 0) this.menuButtons[this.selectedIndex].blur();
    this.selectedIndex = i;
    this.menuButtons[i].focus();
  }

  /** Move the keyboard selection up (-1) or down (+1), wrapping. */
  moveSelection(dir) {
    if (this.help.visible || this.optionsOpen) return; // a modal owns the keys
    const n = this.menuButtons.length;
    const from = this.selectedIndex < 0 ? 0 : this.selectedIndex;
    this.selectButton((from + dir + n) % n);
  }

  /** Enter/Space: activate the selected button (or close an open overlay). */
  activateSelection() {
    if (this.help.visible) return void this.toggleHelp(false);
    if (this.optionsOpen) return void this.closeOptions();
    const b = this.menuButtons[this.selectedIndex];
    if (b) b.activate();
  }

  /** Keyboard menu navigation: arrows + WASD to move, Enter/Space to click. */
  setupMenuKeys() {
    const kb = this.input.keyboard;
    // Capture so the page doesn't scroll on arrows/space.
    kb.addCapture(['UP', 'DOWN', 'LEFT', 'RIGHT', 'SPACE', 'ENTER', 'W', 'A', 'S', 'D']);
    const prev = () => this.moveSelection(-1);
    const next = () => this.moveSelection(1);
    kb.on('keydown-UP', prev);
    kb.on('keydown-W', prev);
    kb.on('keydown-LEFT', prev);
    kb.on('keydown-A', prev);
    kb.on('keydown-DOWN', next);
    kb.on('keydown-S', next);
    kb.on('keydown-RIGHT', next);
    kb.on('keydown-D', next);
    kb.on('keydown-ENTER', () => this.activateSelection());
    kb.on('keydown-SPACE', () => this.activateSelection());
  }

  // --------------------------------------------------------------------------
  // How-to-Play overlay: a dimmed backdrop + panel listing the controls. Hidden
  // until the button is pressed; any click (or Esc) closes it.
  // --------------------------------------------------------------------------
  buildHelpPanel() {
    this.help = this.add.container(0, 0).setDepth(20).setVisible(false);

    this.helpBackdrop = this.add.rectangle(0, 0, 10, 10, 0x000000, 0.6).setOrigin(0, 0);
    this.helpBackdrop.setInteractive();
    this.helpBackdrop.on('pointerdown', () => this.toggleHelp(false));

    const panelW = 420;
    const panelH = 300;
    const panel = this.add.rectangle(0, 0, panelW, panelH, 0x141a2b, 0.98).setStrokeStyle(2, COLORS.player);
    const heading = this.add
      .text(0, -panelH / 2 + 26, 'How to Play', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#3ad0ff',
      })
      .setOrigin(0.5);

    const rows = [
      ['WASD', 'move the selected dot'],
      ['Tap ground', 'order a move there'],
      ['Tap enemy', 'attack that enemy'],
      ['1–5', 'use an action-bar item'],
      ['Space', 'freeze time to give orders'],
      ['Esc / ☰', 'pause & options'],
      ['▼ stairs', 'descend to the next depth'],
    ];
    const rowNodes = [];
    let y = -panelH / 2 + 66;
    for (const [key, desc] of rows) {
      rowNodes.push(
        this.add
          .text(-panelW / 2 + 28, y, key, {
            fontFamily: 'monospace',
            fontSize: '15px',
            color: '#fff2a8',
            fontStyle: 'bold',
          })
          .setOrigin(0, 0.5)
      );
      rowNodes.push(
        this.add
          .text(-panelW / 2 + 150, y, desc, {
            fontFamily: 'monospace',
            fontSize: '15px',
            color: '#cfe6ff',
          })
          .setOrigin(0, 0.5)
      );
      y += 30;
    }

    const hint = this.add
      .text(0, panelH / 2 - 20, 'click anywhere to close', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#7f92b3',
      })
      .setOrigin(0.5);

    // The panel is an interactive no-op catcher so clicks ON it don't fall
    // through to the backdrop (which closes the overlay).
    this.helpPanel = panel;
    panel.setInteractive();

    this.help.add([this.helpBackdrop, panel, heading, ...rowNodes, hint]);
    this.input.keyboard.on('keydown-ESC', () => this.toggleHelp(false));

    // Start hidden AND input-disabled. Phaser input hit-testing does NOT inherit
    // a parent container's visibility, so an invisible-but-enabled full-screen
    // backdrop would otherwise sit on top (depth 20) and swallow every menu
    // click — including Play.
    this.toggleHelp(false);
  }

  toggleHelp(show) {
    this.help.setVisible(show);
    if (this.helpBackdrop && this.helpBackdrop.input) this.helpBackdrop.input.enabled = show;
    if (this.helpPanel && this.helpPanel.input) this.helpPanel.input.enabled = show;
  }

  // --------------------------------------------------------------------------
  // Options overlay: the SAME music + sound volume sliders as the pause menu
  // (see ui.js / PauseScene). Built ONCE and shown/hidden by toggling visibility
  // + input (like the Help panel) — destroying/recreating it per-open proved
  // fragile (the overlay wouldn't reopen). Rebuilt only on resize (see layout).
  // The slider values live in sound.js, so they persist across scenes.
  // --------------------------------------------------------------------------
  setupOptions() {
    this.optionsOpen = false;
    this.optionsObjects = []; // all overlay game objects
    this.optionsInputs = []; // just the interactive ones (gated when hidden)
    this.dragState = { fn: null };
    attachSliderDrag(this, this.dragState); // one drag driver for the sliders
    this.input.keyboard.on('keydown-ESC', () => this.toggleOptions(false));
  }

  /** (Re)build the overlay at the current screen centre, preserving open state. */
  rebuildOptionsOverlay() {
    for (const o of this.optionsObjects) o.destroy();

    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;
    const panelW = 360;
    const panelH = 220;

    // Dim backdrop — clicking outside the panel closes the overlay.
    const backdrop = this.add
      .rectangle(0, 0, width, height, 0x000000, 0.6)
      .setOrigin(0, 0)
      .setDepth(30)
      .setInteractive();
    backdrop.on('pointerdown', () => this.toggleOptions(false));

    // Panel (interactive no-op catcher so clicks on it don't close).
    const panel = this.add
      .rectangle(cx, cy, panelW, panelH, 0x141a2b, 0.98)
      .setStrokeStyle(2, COLORS.player)
      .setDepth(31)
      .setInteractive();

    const title = this.add
      .text(cx, cy - panelH / 2 + 26, 'Options', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#3ad0ff',
      })
      .setOrigin(0.5)
      .setDepth(31);

    // Shared volume sliders (identical to the pause menu).
    const music = makeVolumeSlider(this, cx, cy - 20, 'Music', getMusicVolume, setMusicVolume, this.dragState);
    const sound = makeVolumeSlider(this, cx, cy + 20, 'Sound', getSfxVolume, setSfxVolume, this.dragState);
    const sliders = [...music, ...sound];
    sliders.forEach((o) => o.setDepth(31));

    const hint = this.add
      .text(cx, cy + panelH / 2 - 20, 'Esc / click outside to close', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#7f92b3',
      })
      .setOrigin(0.5)
      .setDepth(31);

    this.optionsObjects = [backdrop, panel, title, ...sliders, hint];
    this.optionsInputs = [backdrop, panel, music[4], sound[4]]; // sliders' hit zones
    this.setOptionsVisible(this.optionsOpen);
  }

  /** Show/hide the overlay's objects and gate their input together. */
  setOptionsVisible(show) {
    for (const o of this.optionsObjects) o.setVisible(show);
    for (const o of this.optionsInputs) if (o.input) o.input.enabled = show;
  }

  toggleOptions(show) {
    this.optionsOpen = show;
    if (show) this.toggleHelp(false); // never both open at once
    else this.dragState.fn = null;
    this.setOptionsVisible(show);
  }

  // --------------------------------------------------------------------------
  // Layout: (re)position everything relative to the current screen size. Called
  // on create and on every resize so the menu stays centred.
  // --------------------------------------------------------------------------
  layout() {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;

    this.bg.setSize(width, height);

    this.emblem.setPosition(cx, cy - 172);
    this.title.setPosition(cx, cy - 84);
    this.tagline.setPosition(cx, cy - 40);
    this.playBtn.setPosition(cx, cy + 34);
    this.trainingBtn.setPosition(cx, cy + 88);
    this.optionsBtn.setPosition(cx, cy + 140);
    this.helpBtn.setPosition(cx, cy + 190);
    this.footer.setPosition(cx, height - 26);

    // Corner audio controls (bottom-left), redrawn for the current size.
    this.audioX = 22;
    this.audioY = height - 40;
    this.refreshAudioIcons();

    this.help.setPosition(cx, cy);
    // The backdrop covers the whole screen; the container is centred, so offset
    // the backdrop back to the top-left corner in container-local space.
    this.helpBackdrop.setSize(width, height).setPosition(-cx, -cy);

    // Rebuild the Options overlay centred for the current size (keeps open state).
    this.rebuildOptionsOverlay();
  }

  /** Fade out and hand off to a fresh run (or the training sandbox). */
  startGame(training = false) {
    if (this.starting) return; // guard against double-clicks during the fade
    this.starting = true;
    ensureStarted();
    this.toggleHelp(false);
    const seed = Math.floor(Math.random() * 0x7fffffff);
    this.cameras.main.fadeOut(300, 13, 16, 25);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('GameScene', { depth: 1, seed, training });
    });
  }

  update(_time, delta) {
    const dt = delta / 1000;
    const { width, height } = this.scale;
    for (const f of this.floaters) {
      const d = f.dot;
      d.x += f.vx * dt;
      d.y += f.vy * dt;
      const r = d.radius;
      if (d.x < -r) d.x = width + r;
      else if (d.x > width + r) d.x = -r;
      if (d.y < -r) d.y = height + r;
      else if (d.y > height + r) d.y = -r;
    }
  }
}
