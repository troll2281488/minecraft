/**
 * Procedural sound effects, synthesised with the Web Audio API.
 *
 * Every sound here is generated in code: noise bursts, filtered for material
 * (stone is hard and bright, wood is hollow, dirt is soft), and short pitch
 * sweeps. No audio files are shipped. Minecraft's own sounds belong to Mojang
 * and are not used.
 *
 * The AudioContext is created on the first user gesture, because browsers
 * refuse to start audio before one. Until then every call is a silent no-op.
 */

let ctx = null;
let master = null;
let muted = false;

function ensure() {
  if (ctx) return ctx;
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = 0.6;
  master.connect(ctx.destination);
  return ctx;
}

/** Call from a click or key handler so the browser allows audio. */
export function unlockAudio() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume();
}

export function setMuted(value) {
  muted = !!value;
}

function noiseBuffer(c, duration) {
  const length = Math.max(1, Math.floor(c.sampleRate * duration));
  const buffer = c.createBuffer(1, length, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** A filtered noise burst with an exponential decay. */
function burst({ duration = 0.15, freq = 1200, q = 1, type = 'bandpass', gain = 0.6, when = 0 }) {
  const c = ensure();
  if (!c || muted) return;
  const t = c.currentTime + when;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, duration);
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const env = c.createGain();
  env.gain.setValueAtTime(gain, t);
  env.gain.exponentialRampToValueAtTime(0.0008, t + duration);
  src.connect(filter).connect(env).connect(master);
  src.start(t);
  src.stop(t + duration + 0.02);
}

/** A tone that slides from one pitch to another. */
function sweep({ from = 400, to = 200, duration = 0.12, type = 'square', gain = 0.25, when = 0 }) {
  const c = ensure();
  if (!c || muted) return;
  const t = c.currentTime + when;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + duration);
  const env = c.createGain();
  env.gain.setValueAtTime(gain, t);
  env.gain.exponentialRampToValueAtTime(0.0008, t + duration);
  osc.connect(env).connect(master);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

// Material profiles: how a block sounds when broken or placed.
const MATERIALS = {
  stone: { freq: 2400, q: 2.5, dur: 0.12, tone: [520, 380] },
  wood: { freq: 900, q: 4, dur: 0.14, tone: [260, 200] },
  dirt: { freq: 600, q: 1, dur: 0.16, tone: [180, 120] },
  sand: { freq: 3200, q: 0.8, dur: 0.18, tone: null },
  glass: { freq: 5200, q: 6, dur: 0.22, tone: [1400, 1200] },
  wool: { freq: 500, q: 0.7, dur: 0.2, tone: null },
  metal: { freq: 3000, q: 8, dur: 0.1, tone: [880, 860] },
};

/** Material name from a block id like 'minecraft:oak_planks' or 'stone'. */
export function materialOf(blockId = '') {
  const id = blockId.replace(/^.*:/, '');
  if (/glass|ice/.test(id)) return 'glass';
  if (/wool|carpet|leaves|wheat|grass|fern|flower|poppy|dandelion/.test(id)) return 'wool';
  if (/sand/.test(id)) return 'sand';
  if (/wood|log|plank|chest|crafting|bookshelf|sapling|fence|door|sign/.test(id)) return 'wood';
  if (/dirt|grass_block|farmland|gravel|clay|podzol|mud/.test(id)) return 'dirt';
  if (/iron|gold|diamond|emerald|netherite/.test(id)) return 'metal';
  return 'stone';
}

export function playBreak(blockId) {
  const m = MATERIALS[materialOf(blockId)];
  burst({ duration: m.dur, freq: m.freq, q: m.q, gain: 0.7 });
  if (m.tone) sweep({ from: m.tone[0], to: m.tone[1], duration: m.dur, type: 'triangle', gain: 0.12 });
}

export function playPlace(blockId) {
  const m = MATERIALS[materialOf(blockId)];
  burst({ duration: m.dur * 0.7, freq: m.freq * 0.8, q: m.q, gain: 0.45 });
}

/** Footstep on a material; quieter and softer than break. */
function playStep(blockId) {
  const m = MATERIALS[materialOf(blockId)];
  burst({ duration: 0.08, freq: m.freq * 0.6, q: 1.2, gain: 0.18 });
}

export function playHurt() {
  sweep({ from: 620, to: 180, duration: 0.22, type: 'sawtooth', gain: 0.22 });
  burst({ duration: 0.12, freq: 1500, q: 1, gain: 0.25 });
}

export function playPickup() {
  sweep({ from: 740, to: 1180, duration: 0.09, type: 'sine', gain: 0.2 });
  sweep({ from: 1180, to: 1480, duration: 0.09, type: 'sine', gain: 0.18, when: 0.07 });
}

export function playClick() {
  sweep({ from: 1400, to: 900, duration: 0.04, type: 'square', gain: 0.08 });
}
