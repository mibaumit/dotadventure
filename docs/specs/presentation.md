# Presentation (HUD, UI, Audio, Visuals)

## HUD ✅

- **Top-left:** title, a controls hint line, and a status line
  (`Depth · HP · Weapon · Enemies remaining`).
- **Top-right:** `Level N` + amber **XP bar**.
- **Bottom-left:** clickable **sound icon** (speaker with waves / red-✕ when
  muted) — click cycles master volume full → half → mute.
- **Bottom-center:** the 9-slot **action bar** (see [items.md](items.md)).
- **Bottom-right:** **▶/⏸ time-freeze indicator** + **mm:ss game timer** above
  it.
- **World-space:** per-entity health bars, `Lv N` labels, faces, floating
  damage/heal numbers, click markers (blue = move, red = attack), pickup names.

## Pause menu ✅ (`PauseScene.js`, opened with Esc)

- Dims the game (which is paused underneath) and shows a panel with:
  - **Music** volume slider (draggable) — default **50%**
  - **Sound** volume slider (draggable) — default **100%**
  - **Continue game** / **Restart game** buttons
  - "Esc to resume"

## Audio ✅ (`sound.js`, Web Audio API — fully procedural, no files)

- Starts on the first user gesture (browser autoplay policy). Routed through a
  **master** bus → **music** bus + **sfx** bus (the two pause-menu sliders); the
  bottom-left icon controls master.
- **Music:** an evolving dark **drone pad** (detuned saws + sub, breathing
  low-pass filter) plus a **distorted string ensemble** playing a looping
  minor-key **melody** through a waveshaper, with a shared feedback **echo** —
  a Diablo-ish dungeon score.
- **SFX:**
  - **Footsteps** — soft low thud on a ~300 ms cadence while moving.
  - **Punch** — noise smack + low thump, on the player's own hits.
  - **Aggro growl** — short distorted downward snarl when an enemy notices you.

## Visual details ✅

- **Runtime-baked textures** (no assets): the dot & fists (circles), enemy
  shapes (`shapes.js`), the chest, arrows, item icons, and the multi-colour
  Scroll of Frozen Orb.
- **Colours** are centralized in `config.js → COLORS`.
- **Theme-aware / responsive:** the canvas fills the window (Phaser RESIZE
  scale mode).

> Note: `render.preserveDrawingBuffer` is intentionally **off**; external
> screenshot tools capture via the compositor, and a black `drawImage`/`readPixels`
> result does NOT mean the game is black (see the render-verify memory).
