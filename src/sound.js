// ============================================================================
// sound.js — procedural audio via the Web Audio API. No asset files: every
// sound is synthesized in code, so the game stays fully self-contained.
//
// Browsers block audio until a user gesture, so call ensureStarted() from the
// first click/keypress. Everything is a no-op until then.
// ============================================================================

let ctx = null;
let master = null;
let musicBus = null; // background music routes here
let sfxBus = null; // game sounds (footsteps, punches, growls) route here
let noise = null;
let currentTrack = null; // handle { stop() } for the playing music track
let musicTrackIndex = 0; // which track in MUSIC_TRACKS is playing
let musicSuppressed = false; // true while music is intentionally off (e.g. time-freeze),
// so an incidental ensureStarted() (fired on every click/keypress) won't restart it

// Master volume, cycled by the on-screen sound icon (full → half → mute).
const VOLUME_LEVELS = [0.6, 0.3, 0];
let volIndex = 0;

// Independent bus volumes (0..1), set by the two sliders in the pause menu.
let musicVolume = 0.5; // music quieter by default
let sfxVolume = 1.0; // game sounds at full

/** Create the AudioContext + master/music/sfx buses (on first user gesture). */
function init() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = VOLUME_LEVELS[volIndex];
  master.connect(ctx.destination);

  musicBus = ctx.createGain();
  musicBus.gain.value = musicVolume;
  musicBus.connect(master);

  sfxBus = ctx.createGain();
  sfxBus.gain.value = sfxVolume;
  sfxBus.connect(master);
}

/** Background-music volume (0..1). */
export function getMusicVolume() {
  return musicVolume;
}
export function setMusicVolume(v) {
  musicVolume = Math.max(0, Math.min(1, v));
  if (musicBus) musicBus.gain.value = musicVolume;
}

/** Game-sounds (SFX) volume (0..1). */
export function getSfxVolume() {
  return sfxVolume;
}
export function setSfxVolume(v) {
  sfxVolume = Math.max(0, Math.min(1, v));
  if (sfxBus) sfxBus.gain.value = sfxVolume;
}

/** Current volume state, for the UI icon. */
export function getVolume() {
  const v = VOLUME_LEVELS[volIndex];
  return { volume: v, muted: v === 0, index: volIndex, count: VOLUME_LEVELS.length };
}

/** Step to the next volume level (wraps). Returns the new state. */
export function cycleVolume() {
  volIndex = (volIndex + 1) % VOLUME_LEVELS.length;
  if (master) master.gain.value = VOLUME_LEVELS[volIndex];
  return getVolume();
}

/** Start audio (must run inside a user-gesture handler) and kick off music. */
export function ensureStarted() {
  init();
  if (ctx.state === 'suspended') ctx.resume();
  suspendedByBlur = false; // an explicit user start clears any blur-pause
  if (!musicSuppressed) startMusic(); // don't revive music that was deliberately silenced
}

/**
 * Mark music as intentionally on/off. While suppressed, the incidental
 * ensureStarted() calls fired on every click/keypress won't restart the track —
 * so a time-freeze (or any deliberate stop) stays quiet until explicitly resumed.
 */
export function suppressMusic(on) {
  musicSuppressed = !!on;
}

// --- Auto-pause when the tab/window loses focus, resume when it returns ------
// Suspending the AudioContext freezes the whole graph (music + any tails), so
// the game goes silent in the background instead of playing on unheard. We only
// auto-resume what WE paused (suspendedByBlur), so a user mute isn't undone.
let suspendedByBlur = false;
function suspendForBlur() {
  if (ctx && ctx.state === 'running') {
    ctx.suspend();
    suspendedByBlur = true;
  }
}
function resumeFromBlur() {
  if (ctx && suspendedByBlur) {
    ctx.resume();
    suspendedByBlur = false;
  }
}
if (typeof window !== 'undefined') {
  window.addEventListener('blur', suspendForBlur);
  window.addEventListener('focus', resumeFromBlur);
  window.addEventListener('pagehide', suspendForBlur);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) suspendForBlur();
    else resumeFromBlur();
  });
}

/** A short reusable white-noise buffer (for punches/footsteps). */
function getNoise() {
  if (noise) return noise;
  const len = Math.floor(ctx.sampleRate * 0.3);
  noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return noise;
}

/** A soft low "thud" footstep. Call it on a cadence while moving. */
export function playFootstep() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(95, t);
  osc.frequency.exponentialRampToValueAtTime(55, t + 0.08);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.18, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  osc.connect(g).connect(sfxBus);
  osc.start(t);
  osc.stop(t + 0.14);
}

/** A punchy noise burst + low thump for a fist hit. */
export function playPunch() {
  if (!ctx) return;
  const t = ctx.currentTime;

  // Noise "smack".
  const src = ctx.createBufferSource();
  src.buffer = getNoise();
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 900;
  bp.Q.value = 0.8;
  const gn = ctx.createGain();
  gn.gain.setValueAtTime(0.35, t);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
  src.connect(bp).connect(gn).connect(sfxBus);
  src.start(t);
  src.stop(t + 0.12);

  // Low thump body.
  const osc = ctx.createOscillator();
  const gt = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(170, t);
  osc.frequency.exponentialRampToValueAtTime(60, t + 0.1);
  gt.gain.setValueAtTime(0.3, t);
  gt.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  osc.connect(gt).connect(sfxBus);
  osc.start(t);
  osc.stop(t + 0.16);
}

/** A howling ice-storm — the Frozen Orb's ~0.5s channel. */
export function playFrostCast() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const dur = 0.6;

  // Howling wind: looping noise through a sweeping bandpass.
  const src = ctx.createBufferSource();
  src.buffer = getNoise();
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 6;
  bp.frequency.setValueAtTime(500, t);
  bp.frequency.exponentialRampToValueAtTime(2400, t + dur * 0.6);
  bp.frequency.exponentialRampToValueAtTime(900, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.28, t + 0.08);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp).connect(g).connect(sfxBus);
  src.start(t);
  src.stop(t + dur + 0.05);

  // Whistling overtone for the "howl".
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1200, t);
  osc.frequency.exponentialRampToValueAtTime(2600, t + dur * 0.5);
  osc.frequency.exponentialRampToValueAtTime(1500, t + dur);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.0001, t);
  og.gain.exponentialRampToValueAtTime(0.1, t + 0.1);
  og.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(og).connect(sfxBus);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

/** A deep boom for a bomb detonation. */
export function playExplosion() {
  if (!ctx) return;
  const t = ctx.currentTime;

  // Low sub "boom".
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, t);
  osc.frequency.exponentialRampToValueAtTime(34, t + 0.4);
  g.gain.setValueAtTime(0.5, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  osc.connect(g).connect(sfxBus);
  osc.start(t);
  osc.stop(t + 0.55);

  // Broad noise blast, filtered downward.
  const src = ctx.createBufferSource();
  src.buffer = getNoise();
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(2200, t);
  lp.frequency.exponentialRampToValueAtTime(180, t + 0.3);
  const gn = ctx.createGain();
  gn.gain.setValueAtTime(0.5, t);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
  src.connect(lp).connect(gn).connect(sfxBus);
  src.start(t);
  src.stop(t + 0.4);
}

/** A bright ascending chime for a character level-up. */
export function playLevelUp() {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 · E5 · G5 · C6
  notes.forEach((f, i) => {
    const t = t0 + i * 0.09;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    osc.connect(g).connect(sfxBus);
    osc.start(t);
    osc.stop(t + 0.3);
  });
}

/** A short rising hiss — "fffft" — for loosing an arrow. */
export function playArrow() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = getNoise();
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(1600, t);
  bp.frequency.exponentialRampToValueAtTime(3600, t + 0.12); // rising = a fletched whoosh
  bp.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.15, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  src.connect(bp).connect(g).connect(sfxBus);
  src.start(t);
  src.stop(t + 0.18);
}

/** A short, round "plomp" — the shield absorbing a hit. */
export function playBlock() {
  if (!ctx) return;
  const t = ctx.currentTime;

  // Low, quickly-decaying sine "plomp".
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(300, t);
  osc.frequency.exponentialRampToValueAtTime(120, t + 0.09);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.32, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  osc.connect(g).connect(sfxBus);
  osc.start(t);
  osc.stop(t + 0.18);

  // A tiny noise "tick" for the metallic edge.
  const src = ctx.createBufferSource();
  src.buffer = getNoise();
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2200;
  const gn = ctx.createGain();
  gn.gain.setValueAtTime(0.12, t);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  src.connect(bp).connect(gn).connect(sfxBus);
  src.start(t);
  src.stop(t + 0.07);
}

// A soft-clip distortion curve for the string instrument (built once).
let distCurve = null;
function getDistCurve() {
  if (distCurve) return distCurve;
  const n = 2048;
  const k = 15; // drive amount
  const deg = Math.PI / 180;
  distCurve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    distCurve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return distCurve;
}

/** A short distorted growl for when an enemy notices the player. */
export function playAggro() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(70, t + 0.22); // snarl downward
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.28, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  const shaper = ctx.createWaveShaper();
  shaper.curve = getDistCurve();
  shaper.oversample = '2x';
  osc.connect(g).connect(lp).connect(shaper).connect(sfxBus);
  osc.start(t);
  osc.stop(t + 0.3);
}

// Selectable background music tracks (each builder returns a { stop() } handle).
const MUSIC_TRACKS = [startDungeonScore, startPulseScore, startCrystalScore];

let bossTrack = null; // handle for the boss battle theme while it plays
let inBoss = false; // true during a boss fight → music routes to the boss theme

/**
 * Start the current music track (idempotent). During a boss fight it (re)starts
 * the boss theme instead of the regular track.
 */
export function startMusic() {
  if (!ctx) return;
  if (inBoss) {
    if (!bossTrack) bossTrack = startBossScore();
    return;
  }
  if (currentTrack) return;
  currentTrack = MUSIC_TRACKS[musicTrackIndex]();
}

/** Stop all background music (regular AND boss theme), e.g. while paused. */
export function stopMusic() {
  if (currentTrack) {
    currentTrack.stop();
    currentTrack = null;
  }
  if (bossTrack) {
    bossTrack.stop();
    bossTrack = null;
  }
}

/** Switch to the driving boss battle theme (silences the regular track). */
export function startBossMusic() {
  if (!ctx || inBoss) return;
  inBoss = true;
  if (currentTrack) {
    currentTrack.stop();
    currentTrack = null;
  }
  bossTrack = startBossScore();
}

/** End the boss theme and resume the regular background track. */
export function stopBossMusic() {
  if (!inBoss) return;
  inBoss = false;
  if (bossTrack) {
    bossTrack.stop();
    bossTrack = null;
  }
  startMusic();
}

/** A soft descending two-tone "blip" — played when the game is paused. */
export function playPause() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const notes = [
    [523.25, 0], // C5
    [349.23, 0.1], // F4 — a gentle step down
  ];
  for (const [freq, dt] of notes) {
    const s = t + dt;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(0.25, s + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, s + 0.16);
    osc.connect(g).connect(sfxBus);
    osc.start(s);
    osc.stop(s + 0.18);
  }
}

/** Stop the current track and start the next one (wraps). Returns the new index. */
export function cycleMusic() {
  if (!ctx) return musicTrackIndex;
  if (currentTrack) {
    currentTrack.stop();
    currentTrack = null;
  }
  musicTrackIndex = (musicTrackIndex + 1) % MUSIC_TRACKS.length;
  currentTrack = MUSIC_TRACKS[musicTrackIndex]();
  return musicTrackIndex;
}

/** Current music track index + how many tracks exist (for the UI). */
export function getMusicTrack() {
  return { index: musicTrackIndex, count: MUSIC_TRACKS.length };
}

/**
 * Track 0 — ambient dungeon score: a dark drone pad plus a distorted string
 * ensemble playing a looping minor-key melody (Diablo-ish).
 */
function startDungeonScore() {
  const out = ctx.createGain();
  out.gain.value = 0.0001;
  out.gain.linearRampToValueAtTime(0.45, ctx.currentTime + 4); // fade in
  out.connect(musicBus);

  // Shared feedback delay → cavernous echo.
  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 0.38;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.33;
  delay.connect(feedback).connect(delay);
  delay.connect(out);

  // --- Dark drone pad (kept low so the melody sits on top) ---
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.5;
  droneGain.connect(out);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 420;
  filter.connect(droneGain);

  const o1 = ctx.createOscillator();
  o1.type = 'sawtooth';
  o1.frequency.value = 55; // A1
  const o2 = ctx.createOscillator();
  o2.type = 'sawtooth';
  o2.frequency.value = 82.4; // E2
  o2.detune.value = 7;
  const o3 = ctx.createOscillator();
  o3.type = 'sine';
  o3.frequency.value = 110;
  o1.connect(filter);
  o2.connect(filter);
  o3.connect(filter);

  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.045;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 220;
  lfo.connect(lfoGain).connect(filter.frequency);
  const oscs = [o1, o2, o3, lfo];
  oscs.forEach((o) => o.start());

  // --- Distorted string melody (A-minor), self-looping ---
  // A longer four-phrase theme (A · A' · B · B') so the loop takes ~25s instead
  // of ~11s — the extra melodic movement keeps it from feeling repetitive.
  const beat = 520; // ms per beat (slow, mournful)
  const MELODY = [
    // Phrase A — the mournful main statement
    [220.0, 2], [261.63, 1], [293.66, 1],
    [329.63, 2], [293.66, 1], [261.63, 1],
    [246.94, 3], [null, 1],
    // Phrase A' — answer that dips low then eases back up
    [196.0, 2], [220.0, 1], [246.94, 1],
    [261.63, 2], [220.0, 2], [null, 2],
    // Phrase B — a lift into the upper register for contrast
    [329.63, 2], [349.23, 1], [392.0, 1],
    [440.0, 3], [392.0, 1],
    [349.23, 2], [329.63, 2], [null, 1],
    // Phrase B' — descent that resolves back home to A
    [392.0, 1], [349.23, 1], [329.63, 1], [293.66, 1],
    [261.63, 2], [246.94, 2],
    [220.0, 4], [null, 2],
  ];
  let step = 0;
  let timer = null;
  const playStep = () => {
    const [freq, beats] = MELODY[step];
    if (freq) playStringNote(freq, (beats * beat) / 1000 * 0.92, out, delay);
    step = (step + 1) % MELODY.length;
    timer = setTimeout(playStep, beats * beat);
  };
  timer = setTimeout(playStep, 1800);

  return { stop: () => stopTrack(out, oscs, timer) };
}

/**
 * Track 1 — "deep pulse": a plucked minor arpeggio over a slow two-beat bass
 * pulse, brighter and more rhythmic than the drone score.
 */
function startPulseScore() {
  const out = ctx.createGain();
  out.gain.value = 0.0001;
  out.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 3);
  out.connect(musicBus);

  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 0.28;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.34;
  delay.connect(feedback).connect(delay);
  delay.connect(out);

  const beat = 460; // ms
  const BASS = [110.0, 110.0, 130.81, 98.0]; // A2 · A2 · C3 · G2
  const ARP = [220.0, 261.63, 329.63, 392.0, 329.63, 261.63]; // A C E G E C
  let bStep = 0;
  let aStep = 0;
  let bTimer = null;
  let aTimer = null;

  const bassTick = () => {
    playPluck(BASS[bStep % BASS.length], 0.55, 'sawtooth', 640, 0.26, out, delay);
    bStep++;
    bTimer = setTimeout(bassTick, beat * 2);
  };
  const arpTick = () => {
    playPluck(ARP[aStep % ARP.length], 0.32, 'triangle', 2600, 0.15, out, delay);
    aStep++;
    aTimer = setTimeout(arpTick, beat / 2);
  };
  bTimer = setTimeout(bassTick, 400);
  aTimer = setTimeout(arpTick, 900);

  return {
    stop: () => {
      clearTimeout(bTimer);
      clearTimeout(aTimer);
      fadeOutGain(out);
    },
  };
}

/** A plucked note (sharp attack → decay) through a closing low-pass; dry + echo. */
function playPluck(freq, dur, type, cutoff, level, out, delay) {
  if (!ctx || ctx.state !== 'running') return; // don't queue notes while paused
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(level, t + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(cutoff, t);
  lp.frequency.exponentialRampToValueAtTime(cutoff * 0.4, t + dur);
  osc.connect(env).connect(lp);
  lp.connect(out); // dry
  lp.connect(delay); // echo send
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

/**
 * Track 2 — "crystal caverns": an evolving four-chord pad (Am · F · Dm · E) with
 * a soft tolling bell on each chord change and a sparse high pentatonic melody.
 * Brighter and more harmonically-moving than the two darker scores.
 */
function startCrystalScore() {
  const out = ctx.createGain();
  out.gain.value = 0.0001;
  out.gain.linearRampToValueAtTime(0.42, ctx.currentTime + 3.5); // fade in
  out.connect(musicBus);

  // Shared echo.
  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 0.33;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.3;
  delay.connect(feedback).connect(delay);
  delay.connect(out);

  // --- Evolving pad: three detuned voices whose pitches follow a progression ---
  const padGain = ctx.createGain();
  padGain.gain.value = 0.26;
  padGain.connect(out);
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = 'lowpass';
  padFilter.frequency.value = 700;
  padFilter.connect(padGain);
  padFilter.connect(delay);

  const CHORDS = [
    [110.0, 130.81, 164.81], // Am (A2 C3 E3)
    [87.31, 110.0, 130.81], // F  (F2 A2 C3)
    [73.42, 87.31, 110.0], // Dm (D2 F2 A2)
    [82.41, 103.83, 123.47], // E  (E2 G#2 B2)
  ];
  const padOscs = CHORDS[0].map((f, i) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.detune.value = (i - 1) * 6; // slight spread for width
    o.connect(padFilter);
    o.start();
    return o;
  });

  // Slow filter shimmer over the pad.
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 260;
  lfo.connect(lfoGain).connect(padFilter.frequency);
  lfo.start();

  const beat = 500; // ms
  const barBeats = 4; // one chord per bar
  let chordStep = 0;
  let chordTimer = null;
  const changeChord = () => {
    const chord = CHORDS[chordStep % CHORDS.length];
    const t = ctx.currentTime;
    padOscs.forEach((o, i) => o.frequency.linearRampToValueAtTime(chord[i], t + 0.6));
    playBell(chord[0] * 4, 1.6, out, delay); // toll two octaves above the root
    chordStep++;
    chordTimer = setTimeout(changeChord, beat * barBeats);
  };

  // Sparse A-minor pentatonic melody (A C D E G across two octaves).
  const MEL = [
    [659.25, 1], [587.33, 1], [523.25, 2],
    [440.0, 1], [523.25, 1], [587.33, 2],
    [null, 1], [783.99, 1], [659.25, 2],
    [587.33, 1], [523.25, 1], [440.0, 2],
    [392.0, 2], [440.0, 2], [null, 4],
  ];
  let mStep = 0;
  let mTimer = null;
  const melTick = () => {
    const [f, b] = MEL[mStep % MEL.length];
    if (f) playPluck(f, ((b * beat) / 1000) * 0.9, 'triangle', 3000, 0.12, out, delay);
    mStep++;
    mTimer = setTimeout(melTick, b * beat);
  };

  chordTimer = setTimeout(changeChord, 200);
  mTimer = setTimeout(melTick, beat * barBeats + 200); // let the pad establish first

  return {
    stop: () => {
      clearTimeout(chordTimer);
      clearTimeout(mTimer);
      stopTrack(out, [...padOscs, lfo], null);
    },
  };
}

/**
 * Boss battle theme — urgent and menacing: a dissonant low drone, a fast driving
 * bass ostinato, and dramatic distorted-string stabs with a half-step "dread"
 * motif. Faster and heavier than the exploration tracks.
 */
function startBossScore() {
  const out = ctx.createGain();
  out.gain.value = 0.0001;
  out.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 1.2); // quick, urgent fade-in
  out.connect(musicBus);

  // Tight echo.
  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 0.24;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.3;
  delay.connect(feedback).connect(delay);
  delay.connect(out);

  // Menacing low drone with a beating dissonance.
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.3;
  droneGain.connect(out);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 300;
  filter.connect(droneGain);
  const d1 = ctx.createOscillator();
  d1.type = 'sawtooth';
  d1.frequency.value = 55; // A1
  const d2 = ctx.createOscillator();
  d2.type = 'sawtooth';
  d2.frequency.value = 58.27; // A#1 — a grinding half-step against the root
  d2.detune.value = 5;
  d1.connect(filter);
  d2.connect(filter);
  const oscs = [d1, d2];
  oscs.forEach((o) => o.start());

  const beat = 340; // fast, urgent

  // Driving bass ostinato (eighth notes) that leans on tension tones.
  const BASS = [110.0, 110.0, 110.0, 130.81, 110.0, 110.0, 98.0, 103.83];
  let bStep = 0;
  let bTimer = null;
  const bassTick = () => {
    playPluck(BASS[bStep % BASS.length], 0.28, 'sawtooth', 700, 0.3, out, delay);
    bStep++;
    bTimer = setTimeout(bassTick, beat / 2);
  };

  // Dramatic distorted-string stabs — the boss motif (A minor with a Bb menace).
  const MEL = [
    [220.0, 2], [233.08, 1], [220.0, 1],
    [174.61, 2], [196.0, 2],
    [220.0, 2], [261.63, 1], [233.08, 1],
    [220.0, 4], [null, 2],
  ];
  let mStep = 0;
  let mTimer = null;
  const melTick = () => {
    const [f, b] = MEL[mStep % MEL.length];
    if (f) playStringNote(f, ((b * beat) / 1000) * 0.9, out, delay);
    mStep++;
    mTimer = setTimeout(melTick, b * beat);
  };

  bTimer = setTimeout(bassTick, 200);
  mTimer = setTimeout(melTick, beat * 4);

  return {
    stop: () => {
      clearTimeout(bTimer);
      clearTimeout(mTimer);
      stopTrack(out, oscs, null);
    },
  };
}

/** A soft struck bell: a few inharmonic sine partials with a long decay. */
function playBell(freq, dur, out, delay) {
  if (!ctx || ctx.state !== 'running') return; // don't queue notes while paused
  const t = ctx.currentTime;
  const partials = [
    [1.0, 0.5],
    [2.01, 0.22],
    [3.01, 0.09],
  ];
  for (const [mult, lvl] of partials) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq * mult;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(lvl, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(out); // dry
    g.connect(delay); // echo send
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

/** Fade a track's output out over 0.4 s (leaves any short tails to ring off). */
function fadeOutGain(out) {
  const t = ctx.currentTime;
  out.gain.cancelScheduledValues(t);
  out.gain.setValueAtTime(out.gain.value, t);
  out.gain.linearRampToValueAtTime(0.0001, t + 0.4);
}

/** Stop a sustained track: fade its output, clear its loop timer, stop its oscs. */
function stopTrack(out, oscs, timer) {
  clearTimeout(timer);
  fadeOutGain(out);
  const stopAt = ctx.currentTime + 0.5;
  oscs.forEach((o) => {
    try {
      o.stop(stopAt);
    } catch (e) {
      /* already stopped */
    }
  });
}

/** A bowed, distorted string note: two detuned saws + vibrato → waveshaper. */
function playStringNote(freq, dur, out, delay) {
  if (!ctx || ctx.state !== 'running') return; // don't queue notes while paused
  const t = ctx.currentTime;
  const s1 = ctx.createOscillator();
  s1.type = 'sawtooth';
  s1.frequency.value = freq;
  s1.detune.value = -7;
  const s2 = ctx.createOscillator();
  s2.type = 'sawtooth';
  s2.frequency.value = freq;
  s2.detune.value = 7;

  // Vibrato on both voices.
  const vib = ctx.createOscillator();
  vib.frequency.value = 5.2;
  const vibAmt = ctx.createGain();
  vibAmt.gain.value = 5;
  vib.connect(vibAmt);
  vibAmt.connect(s1.detune);
  vibAmt.connect(s2.detune);

  // Bowed envelope: soft attack, sustain, release.
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(0.5, t + 0.09);
  env.gain.setValueAtTime(0.5, t + Math.max(0.12, dur - 0.25));
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2000;

  const shaper = ctx.createWaveShaper();
  shaper.curve = getDistCurve();
  shaper.oversample = '2x';

  const lvl = ctx.createGain();
  lvl.gain.value = 0.5;

  s1.connect(env);
  s2.connect(env);
  env.connect(lp).connect(shaper).connect(lvl);
  lvl.connect(out); // dry
  lvl.connect(delay); // echo send

  [s1, s2, vib].forEach((o) => o.start(t));
  [s1, s2, vib].forEach((o) => o.stop(t + dur + 0.05));
}
