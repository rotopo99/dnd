// sfx.js — facade for all game sounds (synthesized with WebAudio, no audio files).
//
// Usage:
//   import { initAudio, unlockAudioOnFirstGesture, play, setVolume, setBusVolume } from './audio/sfx.js';
//   unlockAudioOnFirstGesture();          // or call initAudio() inside any user-gesture handler
//   play('hit', { dmgType: 'fire', weapon: 'sword', armor: 'metal' });
//
// Modules:
//   core.js        — AudioContext, mixer buses (sfx/ui/voice/amb), limiter, synth primitives
//   sfx-foley.js   — footsteps by surface, weapon swings, armour, falls, surfaces, abilities
//   sfx-ui.js      — clicks, windows, coins, loot, level-up, quests, errors, card game
//   vox.js         — wordless vocalisations (formants; gender/race)
//   ambience.js    — biome/night/weather layers (setBiome) — separate API, not via play()
//
// Safety: if AudioContext is unavailable (Node, headless) or not yet created,
// every function is a silent no-op and never throws.
//
// Loudness: voices -> bus -> compressor -> masterGain -> limiter (<= -6 dBFS).

import { initCore, isReady, getAudioContext, getNoiseBuffer, getVoiceCount, setMasterVolume, getMasterVolume, setBusVolume, getBusVolume, tone, noise, steps, rand, vary, NOTE } from './core.js';
import { FOLEY, FOLEY_SURFACES, FOLEY_WEAPONS } from './sfx-foley.js';
import { UI } from './sfx-ui.js';
import { say, VOX_KINDS } from './vox.js';

export { masterGain } from './core.js';
export { setBusVolume, getBusVolume } from './core.js';
export { setBiome, stopAmbience, AMBIENCE_BIOMES } from './ambience.js';

const MIN_REPEAT_MS = 30; // same sound retriggered faster than this is dropped
const MAX_VOICES = 56; // mirrors core.js; above it only CRITICAL sounds play
const CRITICAL = new Set(['death', 'defeat', 'victory', 'levelUp', 'questDone']);

const lastPlayed = new Map();

const audioNow = () => {
  const c = getAudioContext();
  return c ? c.currentTime : 0;
};

/** Create (or resume) the AudioContext. Call from a user gesture. Returns true if audio is ready. */
export function initAudio() {
  return initCore();
}

/** Attach one-shot listeners that call initAudio() on the first pointer/key/touch action. */
export function unlockAudioOnFirstGesture(target = globalThis) {
  try {
    if (!target || typeof target.addEventListener !== 'function') return;
    const events = ['pointerdown', 'keydown', 'touchstart', 'mousedown'];
    const handler = () => {
      if (initAudio()) events.forEach((e) => target.removeEventListener(e, handler, true));
    };
    events.forEach((e) => target.addEventListener(e, handler, true));
  } catch {
    /* no-op */
  }
}

/** Master volume 0..1 (mapped to 0..-6 dBFS ceiling). */
export function setVolume(v) {
  setMasterVolume(v);
}

export function getVolume() {
  return getMasterVolume();
}

/** Shared AudioContext (null until initAudio). Used by music.js. */
export { getAudioContext, getNoiseBuffer };

// ---------- hit timbres by dmgType ----------

const HIT = {
  // Quasimorph-style: dry, heavy, mechanical. Noise -> short filter -> saturation, tails cut short.
  slash() {
    noise({ type: 'bandpass', f: vary(3200), f1: vary(1600), q: 2.5, dur: 0.06, peak: 0.4, attack: 0.001, sat: true });
    tone({ type: 'square', f: vary(700), f1: 260, dur: 0.04, peak: 0.07, filter: { type: 'lowpass', f: 1500 } });
  },
  pierce() {
    noise({ type: 'bandpass', f: vary(4500), q: 5, dur: 0.03, peak: 0.35, attack: 0.001, sat: true });
    tone({ type: 'sine', f: vary(1400), f1: 600, dur: 0.03, peak: 0.1 });
  },
  blunt() {
    noise({ type: 'lowpass', f: vary(600, 80), f1: 150, q: 0.7, dur: 0.09, peak: 0.5, attack: 0.001, sat: true });
    tone({ type: 'sine', f: vary(120, 60), f1: 45, dur: 0.08, peak: 0.35 });
  },
  energy() {
    noise({ type: 'highpass', f: vary(3000), q: 1, dur: 0.05, peak: 0.25, attack: 0.001, sat: true });
    tone({ type: 'square', f: vary(1100), f1: 180, dur: 0.07, peak: 0.1, filter: { type: 'lowpass', f: 2500, f1: 500 } });
  },
  fire() {
    noise({ type: 'bandpass', f: vary(900), f1: 400, q: 0.8, dur: 0.2, peak: 0.4, attack: 0.002, sat: true });
    for (let i = 0; i < 4; i++) noise({ type: 'highpass', f: 3000, at: rand(0, 0.15), dur: 0.012, peak: rand(0.08, 0.16), sat: true });
    tone({ type: 'sine', f: vary(90), f1: 50, dur: 0.15, peak: 0.2 });
  },
  electric() {
    const t = audioNow();
    const osc = tone({ type: 'sawtooth', f: vary(110), dur: 0.22, peak: 0.14, filter: { type: 'highpass', f: 400 } });
    for (let i = 1; i < 8; i++) osc.frequency.setValueAtTime(rand(60, 900), t + i * 0.025);
    noise({ type: 'highpass', f: 5000, dur: 0.03, peak: 0.25 });
    noise({ type: 'highpass', f: 4000, at: 0.08, dur: 0.03, peak: 0.18 });
    noise({ type: 'highpass', f: 4500, at: 0.15, dur: 0.025, peak: 0.12 });
  },
  toxin() {
    for (let i = 0; i < 3; i++) {
      tone({ type: 'sine', f: vary(300 + i * 90, 80), f1: vary(700 + i * 120, 80), at: i * 0.07, dur: 0.06, peak: 0.22, filter: { type: 'lowpass', f: 1400 } });
    }
    noise({ type: 'lowpass', f: 500, dur: 0.06, peak: 0.15 });
  },
  proxy() {
    // warbling FM + static: unstable network interference
    const ctx = getAudioContext();
    const t = audioNow();
    const carrier = tone({ type: 'sine', f: vary(320), f1: 160, dur: 0.24, peak: 0.2 });
    const mod = ctx.createOscillator();
    const mg = ctx.createGain();
    mod.type = 'square';
    mod.frequency.value = vary(47, 100);
    mg.gain.value = 220;
    mod.connect(mg).connect(carrier.frequency);
    mod.start(t);
    mod.stop(t + 0.3);
    noise({ type: 'bandpass', f: vary(2200), q: 6, dur: 0.2, peak: 0.18 });
  },
  cyber() {
    const scale = [0, 3, 5, 7, 10, 12, 15];
    const base = vary(660, 30);
    const seq = Array.from({ length: 6 }, () => base * Math.pow(2, scale[(Math.random() * scale.length) | 0] / 12));
    steps(seq, 0.018, { peak: 0.09, filter: { type: 'lowpass', f: 5000 } });
    noise({ type: 'highpass', f: 6000, dur: 0.02, peak: 0.15 });
  },
  psychic() {
    tone({ type: 'sine', f: vary(900), f1: 350, dur: 0.3, peak: 0.2, vib: { rate: 18, depth: 60 } });
    tone({ type: 'triangle', f: vary(1350), f1: 520, dur: 0.25, peak: 0.08, vib: { rate: 13, depth: 40 } });
  },
  cringe() {
    SOUNDS.cringe();
  },
};

// ---------- sound table (legacy names kept; new ones come from modules) ----------

const SOUNDS = {
  ...UI,
  ...Object.fromEntries(Object.entries(FOLEY).filter(([k]) => k !== 'step')),
  step(opts = {}) {
    FOLEY.step(opts);
  },
  turnStart() {
    tone({ type: 'triangle', f: NOTE(3), dur: 0.09, peak: 0.2 }); // C5
    tone({ type: 'triangle', f: NOTE(10), at: 0.07, dur: 0.14, peak: 0.2 }); // G5
    tone({ type: 'sine', f: NOTE(15), at: 0.07, dur: 0.14, peak: 0.06 });
  },
  enemyTurn() {
    const f = { type: 'lowpass', f: 1200, q: 2 };
    tone({ type: 'sawtooth', f: NOTE(-12), dur: 0.12, peak: 0.14, filter: f }); // A3
    tone({ type: 'sawtooth', f: NOTE(-18), at: 0.1, dur: 0.22, peak: 0.14, filter: f }); // Eb3 (tritone)
    tone({ type: 'sine', f: NOTE(-30), at: 0.1, dur: 0.25, peak: 0.15 });
  },
  // opts: { dmgType, weapon?: swing type, armor?: 'cloth'|'leather'|'metal'|'fur', vox?: {gender, race} (grunt) }
  hit(opts = {}) {
    if (opts.weapon) FOLEY.swing({ weapon: opts.weapon });
    if (opts.armor) FOLEY.armorHit({ mat: opts.armor });
    (HIT[opts.dmgType] || HIT.blunt)();
    if (opts.vox) say('grunt', opts.vox);
  },
  crit(opts = {}) {
    if (opts.weapon) FOLEY.swing({ weapon: opts.weapon });
    if (opts.armor) FOLEY.armorHit({ mat: opts.armor });
    (HIT[opts.dmgType] || HIT.blunt)();
    tone({ type: 'sine', f: 120, f1: 35, dur: 0.2, peak: 0.35 }); // heavy mechanical thump
    noise({ type: 'lowpass', f: 900, f1: 150, q: 0.7, dur: 0.14, peak: 0.25, attack: 0.001, sat: true });
    tone({ type: 'sine', f: vary(1300, 30), at: 0.02, dur: 0.35, peak: 0.05 }); // ring
  },
  miss() {
    noise({ type: 'bandpass', f: vary(900), f1: vary(2200), q: 4, dur: 0.07, peak: 0.22, attack: 0.002, sat: true });
  },
  shieldBlock() {
    const f0 = vary(620, 50);
    [1, 2.76, 5.4, 8.93].forEach((r, i) => tone({ type: 'sine', f: f0 * r, dur: 0.35 / (1 + i * 0.5), peak: 0.16 / (1 + i) }));
    noise({ type: 'bandpass', f: 3000, q: 1.5, dur: 0.03, peak: 0.3 });
  },
  heal() {
    const k = vary(1, 25);
    [3, 7, 10, 15].forEach((s, i) => tone({ type: 'sine', f: NOTE(s) * k, at: i * 0.05, dur: 0.3, peak: 0.13, attack: 0.004 }));
    noise({ type: 'highpass', f: 7000, dur: 0.3, peak: 0.03, attack: 0.05 });
  },
  buff() {
    const f = vary(400, 40);
    tone({ type: 'triangle', f, f1: f * 2.2, dur: 0.22, peak: 0.16 });
    tone({ type: 'sine', f: f * 1.5, f1: f * 3.3, dur: 0.22, peak: 0.07 });
  },
  debuff() {
    const f = vary(520, 40);
    const fl = { type: 'lowpass', f: 1500, f1: 400 };
    tone({ type: 'sawtooth', f, f1: f * 0.45, dur: 0.28, peak: 0.12, filter: fl });
    tone({ type: 'sawtooth', f: f * 1.06, f1: f * 0.47, dur: 0.28, peak: 0.08, filter: fl }); // minor 2nd rub
  },
  cringe() {
    // кринж: искажённый вой + скретч (ability), плюс «bwamp» духовой блеск
    const f = vary(200, 60);
    const t = audioNow();
    const o1 = tone({ type: 'sawtooth', f, dur: 0.42, peak: 0.22, attack: 0.008, filter: { type: 'lowpass', f: 300, q: 6 } });
    o1.frequency.linearRampToValueAtTime(f * 1.08, t + 0.08);
    o1.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.42);
    const o2 = tone({ type: 'square', f: f * 0.5, dur: 0.4, peak: 0.08, filter: { type: 'lowpass', f: 500 }, detune: 25 });
    o2.frequency.exponentialRampToValueAtTime(f * 0.27, t + 0.4);
    tone({ type: 'sawtooth', f: f * 2, f1: f * 1.1, dur: 0.12, peak: 0.07, filter: { type: 'bandpass', f: 400, f1: 1400, q: 4 } });
    FOLEY.ability({ kind: 'cringe' });
  },
  breakdown() {
    // Срыв: descending sad-trombone + glitchy breakup
    const base = vary(NOTE(-14), 20);
    [0, -1, -2].forEach((s, i) =>
      tone({ type: 'sawtooth', f: base * Math.pow(2, s / 12), at: i * 0.22, dur: 0.2, peak: 0.18, attack: 0.01, filter: { type: 'lowpass', f: 900, q: 3 } })
    );
    tone({ type: 'sawtooth', f: base * Math.pow(2, -3 / 12), f1: base * 0.4, at: 0.66, dur: 0.7, peak: 0.2, attack: 0.01, vib: { rate: 6, depth: 6 }, filter: { type: 'lowpass', f: 900, f1: 200, q: 3 } });
    for (let i = 0; i < 6; i++) noise({ type: 'bandpass', f: rand(800, 4000), q: 5, at: 0.7 + i * 0.09, dur: 0.04, peak: 0.12 });
    noise({ type: 'highpass', f: 3000, dur: 0.04, peak: 0.15 }); // immediate onset
  },
  knockout() {
    HIT.blunt();
    tone({ type: 'triangle', f: vary(700, 30), f1: 110, at: 0.05, dur: 0.45, peak: 0.16 });
  },
  // opts: { weight?: 'light'|'heavy' (падение тела), vox?: {gender, race} (вскрик)}
  death(opts = {}) {
    noise({ type: 'lowpass', f: 900, f1: 80, dur: 0.9, peak: 0.3, attack: 0.005 });
    tone({ type: 'sawtooth', f: vary(220, 40), f1: 38, dur: 1.0, peak: 0.18, filter: { type: 'lowpass', f: 1500, f1: 120 } });
    tone({ type: 'sine', f: 80, f1: 30, dur: 0.6, peak: 0.3 });
    if (opts.weight) FOLEY.bodyFall({ weight: opts.weight });
    if (opts.vox) say('scream', opts.vox);
  },
  summon() {
    noise({ type: 'bandpass', f: 300, f1: 5000, q: 3, dur: 0.55, peak: 0.16, attack: 0.01 });
    const f = vary(800, 30);
    [0, 7, 12].forEach((s, i) =>
      tone({ type: 'sine', f: f * Math.pow(2, s / 12), f1: f * Math.pow(2, (s + 12) / 12), at: 0.05 + i * 0.06, dur: 0.5, peak: 0.08, detune: rand(-12, 12) })
    );
  },
  overcast() {
    // Завеса Судьи / прокси-буря: dissonant swelling drone + static; click onset for instant feedback
    noise({ type: 'bandpass', f: 2500, q: 2, dur: 0.05, peak: 0.2 });
    const lp = { type: 'lowpass', f: 300, f1: 1400, q: 4 };
    [55, 58.3, 77.8].forEach((f) => tone({ type: 'sawtooth', f: vary(f, 15), dur: 1.8, peak: 0.12, attack: 0.35, filter: lp, vib: { rate: rand(3, 6), depth: 1.5 } }));
    noise({ type: 'bandpass', f: 1800, f1: 600, q: 8, dur: 1.6, peak: 0.1, attack: 0.3 });
    for (let i = 0; i < 5; i++) noise({ type: 'highpass', f: 4000, at: rand(0.2, 1.4), dur: 0.03, peak: 0.08 });
  },
  victory() {
    const seq = [3, 7, 10, 15]; // C5 E5 G5 C6
    seq.forEach((s, i) => {
      const last = i === seq.length - 1;
      tone({ type: 'square', f: NOTE(s), at: i * 0.12, dur: last ? 0.6 : 0.12, peak: 0.07, filter: { type: 'lowpass', f: 3500 } });
      tone({ type: 'triangle', f: NOTE(s), at: i * 0.12, dur: last ? 0.6 : 0.12, peak: 0.15 });
    });
    tone({ type: 'triangle', f: NOTE(-9), at: 0.36, dur: 0.6, peak: 0.15 }); // C4 bass
  },
  defeat() {
    const seq = [-2, -6, -9, -21]; // G4 Eb4 C4 C3
    const fl = { type: 'lowpass', f: 1000, q: 1 };
    seq.forEach((s, i) => {
      const last = i === seq.length - 1;
      tone({ type: 'sawtooth', f: NOTE(s), at: i * 0.3, dur: last ? 1.2 : 0.32, peak: 0.13, attack: 0.008, filter: fl, vib: last ? { rate: 5, depth: 2 } : undefined });
    });
  },
  // Голос без слов: play('vox', { kind: 'sigh'|'grunt'|'scream'|'laugh'|'hm'|'battleCry', gender, race })
  vox(opts = {}) {
    say(opts.kind, opts);
  },
};

/** Names accepted by play(). */
export const SOUND_NAMES = Object.freeze(Object.keys(SOUNDS));
export const DMG_TYPES = Object.freeze(Object.keys(HIT));
export const WEAPON_TYPES = FOLEY_WEAPONS;
export const SURFACE_TYPES = FOLEY_SURFACES;
export const VOX_TYPES = VOX_KINDS;

/**
 * Single entry point. play('hit', { dmgType: 'fire' }).
 * Silent no-op if audio is not initialized/unavailable, name is unknown, or the voice limit is reached.
 */
export function play(name, opts = {}) {
  try {
    if (!isReady()) return;
    if (getVoiceCount() >= MAX_VOICES && !CRITICAL.has(name)) return; // voice limit: drop non-critical
    if (getMasterVolume() <= 0) return;
    const fn = SOUNDS[name];
    if (!fn) return;
    const c = getAudioContext();
    if (c.state === 'suspended') c.resume().catch(() => {});
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const key = name === 'hit' || name === 'crit' ? `${name}:${opts && opts.dmgType}` : name;
    if (now - (lastPlayed.get(key) || -1e9) < MIN_REPEAT_MS) return;
    lastPlayed.set(key, now);
    fn(opts || {});
  } catch {
    /* never throw from audio */
  }
}
