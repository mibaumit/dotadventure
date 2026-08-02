// ============================================================================
// sound.js — procedural audio via the Web Audio API. No asset files: every
// sound is synthesized in code, so the game stays fully self-contained.
//
// Browsers block audio until a user gesture, so call ensureStarted() from the
// first click/keypress. Everything is a no-op until then.
// ============================================================================

let ctx = null;
let master = null;
let noise = null;
let music = null;

/** Create the AudioContext + master bus (called on the first user gesture). */
function init() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.6;
  master.connect(ctx.destination);
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
  osc.connect(g).connect(master);
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
  src.connect(bp).connect(gn).connect(master);
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
  osc.connect(gt).connect(master);
  osc.start(t);
  osc.stop(t + 0.16);
}

/** A slow, evolving ambient dungeon drone (starts once, loops forever). */
function startMusic() {
  if (!ctx || music) return;
  const out = ctx.createGain();
  out.gain.value = 0.0001;
  out.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 4); // fade in
  out.connect(master);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 420;
  filter.connect(out);

  // Two detuned low saws + a sub sine → a dark pad.
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

  // Slow LFO sweeps the filter so the drone breathes.
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.045;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 220;
  lfo.connect(lfoGain).connect(filter.frequency);

  [o1, o2, o3, lfo].forEach((o) => o.start());
  music = { out, filter, o1, o2, o3, lfo };
}
