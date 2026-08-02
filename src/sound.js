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
let music = null;

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
  startMusic();
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

/**
 * Ambient dungeon score (starts once, loops forever): a dark drone pad, plus a
 * distorted string ensemble playing a looping minor-key melody — Diablo-ish.
 */
function startMusic() {
  if (!ctx || music) return;

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
  [o1, o2, o3, lfo].forEach((o) => o.start());

  music = { out, filter, delay, feedback, o1, o2, o3, lfo, melodyTimer: null };

  // --- Distorted string melody (A-minor), self-looping ---
  const beat = 520; // ms per beat (slow, mournful)
  const MELODY = [
    [220.0, 2], [261.63, 1], [293.66, 1],
    [329.63, 2], [293.66, 1], [261.63, 1],
    [220.0, 3], [null, 1],
    [246.94, 2], [220.0, 1], [196.0, 1],
    [220.0, 4], [null, 2],
  ];
  let step = 0;
  const playStep = () => {
    const [freq, beats] = MELODY[step];
    if (freq) playStringNote(freq, (beats * beat) / 1000 * 0.92, out, delay);
    step = (step + 1) % MELODY.length;
    music.melodyTimer = setTimeout(playStep, beats * beat);
  };
  music.melodyTimer = setTimeout(playStep, 1800);
}

/** A bowed, distorted string note: two detuned saws + vibrato → waveshaper. */
function playStringNote(freq, dur, out, delay) {
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
