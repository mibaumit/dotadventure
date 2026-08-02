# Presentation (HUD, UI, Audio, Visuals)

The HUD is kept **minimal and mobile-friendly** — no debug/status text on the
play screen (it lives on the pause menu instead, see below).

- **Top-left:** a **☰ menu button** (tap/click opens the pause menu).
- **Top-right:** `Stage N` (the dungeon depth, cyan) above the character
  `Level N` + amber **XP bar**, with a blue **mana bar** below it (only visible
  while you hold a mana item — see [items.md](items.md)). *Stage* = how deep you
  are; *Level* = character progression/XP.
- **Bottom-left:** clickable **sound icon** (speaker with waves / red-✕ when
  muted) — cycles master volume full → half → mute; next to it a **♪ music
  button** that cycles the background track (shows `n/total`).
- **Bottom-center:** the **5-slot action bar** (`HOTBAR.slots`), sized to fit the
  screen width (down to a phone).
- **Bottom-right:** tappable **▶/⏸ time-freeze button** + **mm:ss game timer**.
  (The sound + freeze buttons sit just above the bar so they never overlap it on
  narrow screens.)
- **On stage start:** a big **"Stage N" headline** fades out over the play field.
- **World-space:** per-entity health bars, the **level number drawn on each
  character's body** (toward the back, behind the face), faces, floating
  damage/heal numbers, click markers (blue = move, red = attack), little
  **resource pixels** (red = HP, blue = mana) dropped by kills, **arrow
  projectiles**, a two-handed **bow** (animated string) / **shield arc** on the
  dot, a **crosshair reticle** on the bow's target, small recharge bars under the
  dot (white **bow reload**, blue **shield**), a thin **blue ring** around
  chilled (Frozen-Orb-slowed) enemies, and **dropped bombs with a burning fuse**
  (a flickering flame that descends the fuse as it counts down).

## Controls & mobile ✅

- Everything is **touch-operable**: tap the ground to move, tap an enemy to
  attack it, tap an action-bar slot to use it, tap the ☰ / ⏸ / sound buttons.
  Keyboard still works too (WASD, 1–`HOTBAR.slots`, Space, Esc).
- The page is locked for touch (no zoom/scroll/tap-highlight) and the canvas
  fills the window at integer size to avoid sub-pixel scaling artifacts.

## Item dialog ✅

- Picking up a chest item **freezes the game** and shows a centered panel with
  the item icon, name, and how it works. **Space** or a **tap on the box**
  resumes. See [items.md](items.md).

## Pause menu ✅ (`PauseScene.js`, opened with Esc or the ☰ button)

- Also shows the **run status + controls** (Depth / HP / Weapon / Enemies and
  the control hints) that used to sit on the play HUD.
- Dims the game (which is paused underneath) and shows a panel with:
  - **Music** volume slider (draggable) — default **50%**
  - **Sound** volume slider (draggable) — default **100%**
  - **Continue game** / **Restart game** buttons
  - "Esc to resume"

## Audio ✅ (`sound.js`, Web Audio API — fully procedural, no files)

- Starts on the first user gesture (browser autoplay policy). Routed through a
  **master** bus → **music** bus + **sfx** bus (the two pause-menu sliders); the
  bottom-left icon controls master.
- **Music:** two selectable **background tracks** (cycle with the ♪ button —
  see HUD), each fully synthesized:
  - *Dungeon score* — dark **drone pad** + a **distorted string** minor-key
    melody through a shared echo (Diablo-ish).
  - *Deep pulse* — a plucked minor **arpeggio** over a slow two-beat **bass
    pulse**, brighter and more rhythmic.
- **SFX:**
  - **Footsteps** — soft low thud on a ~300 ms cadence while moving.
  - **Punch** — noise smack + low thump, on the player's own hits.
  - **Aggro growl** — short distorted downward snarl when an enemy notices you.
  - **Block "plomp"** — round low thump when the shield absorbs a hit.
  - **Arrow "fffft"** — rising hiss when the bow looses; the punch sound plays on
    arrow impact.
  - **Level-up chime** — a bright ascending arpeggio on a character level-up.
  - **Explosion boom** — deep sub + noise blast when a dropped bomb detonates.
  - **Frost cast howl** — a howling ice-storm when the Frozen Orb is cast.

## Visual details ✅

- **Runtime-baked textures** (no assets): the dot & fists (circles), enemy
  shapes (`shapes.js`), the chest, arrows, item icons (incl. bow & shield),
  resource pixels, and the multi-colour Scroll of Frozen Orb.
- **Action-bar icon opacity** conveys state: a reservoir item (potion) fades as
  it empties; a mana item dims when unaffordable; a cooldown item (bomb) dims
  and shows its seconds-remaining while recharging.
- **Colours** are centralized in `config.js → COLORS`.
- **Theme-aware / responsive:** the canvas fills the window (Phaser RESIZE
  scale mode).

> Note: `render.preserveDrawingBuffer` is intentionally **off**; external
> screenshot tools capture via the compositor, and a black `drawImage`/`readPixels`
> result does NOT mean the game is black (see the render-verify memory).
