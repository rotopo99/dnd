// music.js — procedural music on WebAudio (no audio files).
// Shares AudioContext and masterGain with sfx.js. Nothing plays before the first user gesture.
//
//   import { playTrack, stopMusic, setMusicVolume } from './audio/music.js';
//   playTrack('menu');                   // crossfade 1.5 s (clamped to 1–2 s)
//   playTrack('battle', { seed: 42 });   // seed = reproducible variation
//   stopMusic(1500);  setMusicVolume(0.6);
//
// Tracks are endless: a step scheduler generates notes from a seeded PRNG (mulberry32),
// phrases vary every few bars. Budget: at most MAX_VOICES live sources (oscillators, noise, LFO)
// across both crossfading tracks; extra one-shot events are dropped silently. Drones are
// permanent per track and stopped on retire. Every source disconnects itself in onended.
//
// Where to call: see the comment at the end of this file.

import { initAudio, getAudioContext, getNoiseBuffer, masterGain } from './sfx.js';

const MAX_VOICES = 12;
const MUSIC_MAX = 0.5; // music sits under SFX; output = volume * MUSIC_MAX into masterGain
const LOOKAHEAD = 0.12; // s planned ahead
const TICK_MS = 25;
const FADE_MIN = 1000;
const FADE_MAX = 2000;
const FADE_DEFAULT = 1500;
const GESTURES = ['pointerdown', 'keydown', 'touchstart', 'mousedown'];

let ctx = null;
let musicBus = null;
let volume = 0.6;
let voices = 0;
let current = null; // running track
let wanted = null; // requested but not yet started (no context yet)
let hooked = false;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
/** Seconds per step: bpm and subdivision per beat (4 = 16th, 2 = 8th, 8 = 32nd). */
const S = (bpm, div) => 60 / bpm / div;

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (tr, arr) => arr[(tr.rnd() * arr.length) | 0];
const chance = (tr, p) => tr.rnd() < p;
const rr = (tr, a, b) => a + tr.rnd() * (b - a);

// ---------- context / routing ----------

function ensure() {
  if (ctx && musicBus) return true;
  try {
    const c = getAudioContext();
    if (!c || !masterGain) return false;
    ctx = c;
    musicBus = ctx.createGain();
    musicBus.gain.value = volume * MUSIC_MAX;
    const sh = ctx.createWaveShaper(); // gentle saturation on the whole music bus
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(1.5 * x) / Math.tanh(1.5);
    }
    sh.curve = curve;
    sh.oversample = 'none';
    musicBus.connect(sh).connect(masterGain);
    return true;
  } catch {
    ctx = null;
    musicBus = null;
    return false;
  }
}

/** Before the context exists: start the wanted track on the first user gesture. */
function hookGesture() {
  if (hooked || typeof globalThis.addEventListener !== 'function') return;
  hooked = true;
  const handler = () => {
    if (!initAudio()) return;
    GESTURES.forEach((e) => globalThis.removeEventListener(e, handler, true));
    hooked = false;
    if (ensure()) startWanted();
  };
  GESTURES.forEach((e) => globalThis.addEventListener(e, handler, true));
}

// ---------- public API ----------

/** Start a track with crossfade (1–2 s). Same id while playing is a no-op unless a seed is given. */
export function playTrack(id, opts = {}) {
  try {
    if (!TRACKS[id]) return;
    if (!Number.isFinite(opts.seed) && current && current.id === id) return;
    const fade = clamp(Number.isFinite(opts.fade) ? opts.fade : FADE_DEFAULT, FADE_MIN, FADE_MAX);
    const seed = Number.isFinite(opts.seed) ? opts.seed >>> 0 : (Math.random() * 0xffffffff) >>> 0;
    wanted = { id, seed, fade };
    if (!ensure()) {
      hookGesture();
      return;
    }
    startWanted();
  } catch {
    /* never throw from audio */
  }
}

/** Fade out and stop the current track. */
export function stopMusic(fadeMs = FADE_DEFAULT) {
  try {
    wanted = null;
    const old = current;
    current = null;
    if (old && ctx) retire(old, clamp(Number(fadeMs) || 0, 0, 10000) / 1000 || 0.02);
  } catch {
    /* ignore */
  }
}

/** Music volume 0..1 (under the SFX master). */
export function setMusicVolume(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return;
  volume = clamp(n, 0, 1);
  try {
    if (ctx && musicBus) musicBus.gain.setTargetAtTime(volume * MUSIC_MAX, ctx.currentTime, 0.05);
  } catch {
    /* ignore */
  }
}

/** Debug / playtest: current track id and live voice count. */
export function getMusicState() {
  return { track: current ? current.id : null, voices, max: MAX_VOICES };
}

// ---------- track lifecycle ----------

function startWanted() {
  if (!wanted || !ensure()) return;
  const w = wanted;
  wanted = null;
  const t0 = ctx.currentTime;
  const fadeS = w.fade / 1000;
  const old = current;
  current = startTrack(w.id, w.seed, t0, fadeS);
  if (old) retire(old, fadeS);
}

function startTrack(id, seed, t0, fadeS) {
  const def = TRACKS[id];
  const out = ctx.createGain();
  out.gain.setValueAtTime(0, t0);
  out.gain.linearRampToValueAtTime(1, t0 + fadeS);
  out.connect(musicBus);
  const tr = { id, def, out, rnd: mulberry(seed), step: 0, next: t0 + 0.05, timer: 0, dead: false, drones: [], st: {} };
  if (def.init) def.init(tr, t0 + 0.05);
  tr.timer = setInterval(() => pump(tr), TICK_MS);
  pump(tr);
  return tr;
}

function retire(tr, fadeS) {
  tr.dead = true;
  clearInterval(tr.timer);
  const t = ctx.currentTime;
  const g = tr.out.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(0, t + fadeS);
  tr.drones.forEach((n) => {
    try {
      n.stop(t + fadeS + 0.05);
    } catch {
      /* already stopped */
    }
  });
  setTimeout(() => {
    try {
      tr.out.disconnect();
    } catch {
      /* ignore */
    }
  }, (fadeS + 0.2) * 1000);
}

function pump(tr) {
  if (tr.dead || !ctx) return;
  const now = ctx.currentTime;
  if (tr.next < now) tr.next = now + 0.02; // tab was throttled: don't burst
  while (tr.next < now + LOOKAHEAD) {
    const dt = tr.def.gen(tr, tr.next);
    tr.next += dt;
    tr.step++;
  }
}

// ---------- voices ----------

const room = (n = 1) => voices + n <= MAX_VOICES;

/** Count a started source; release it and its nodes when it ends. */
function own(src, nodes = []) {
  voices++;
  src.onended = () => {
    voices--;
    try {
      src.disconnect();
      nodes.forEach((n) => n.disconnect());
    } catch {
      /* ignore */
    }
  };
}

function env(tr, t, peak, attack, dur) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, attack + 0.01));
  g.connect(tr.out);
  return g;
}

/** One-shot oscillator. o: {type, f, f1?, dur, peak, attack?, cut?, cut1?, q?} */
function tone(tr, t, o) {
  if (!room()) return;
  const osc = ctx.createOscillator();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.f, t);
  if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
  const fl = ctx.createBiquadFilter();
  fl.type = 'lowpass';
  fl.frequency.setValueAtTime(o.cut || 6000, t);
  if (o.cut1) fl.frequency.exponentialRampToValueAtTime(o.cut1, t + o.dur);
  fl.Q.value = o.q ?? 0.7;
  const g = env(tr, t, o.peak ?? 0.1, o.attack ?? 0.005, o.dur);
  osc.connect(fl).connect(g);
  own(osc, [fl, g]);
  osc.start(t);
  osc.stop(t + o.dur + 0.05);
}

/** One-shot filtered noise. o: {type, f, f1?, q?, dur, peak, attack?} */
function hiss(tr, t, o) {
  if (!room()) return;
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer();
  src.loop = true;
  const fl = ctx.createBiquadFilter();
  fl.type = o.type || 'bandpass';
  fl.frequency.setValueAtTime(o.f, t);
  if (o.f1) fl.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
  fl.Q.value = o.q ?? 1;
  const g = env(tr, t, o.peak ?? 0.1, o.attack ?? 0.003, o.dur);
  src.connect(fl).connect(g);
  own(src, [fl, g]);
  src.start(t, tr.rnd() * 0.9);
  src.stop(t + o.dur + 0.05);
}

/** Permanent drone: two detuned oscillators through a fixed lowpass. Stopped on retire. */
function drone(tr, t, f, peak, type, cut) {
  const a = ctx.createOscillator();
  a.type = type;
  a.frequency.value = f;
  const b = ctx.createOscillator();
  b.type = 'sawtooth';
  b.frequency.value = f;
  b.detune.value = 9;
  const fl = ctx.createBiquadFilter();
  fl.type = 'lowpass';
  fl.frequency.value = cut;
  fl.Q.value = 2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 2);
  a.connect(fl);
  b.connect(fl);
  fl.connect(g).connect(tr.out);
  own(a, [fl, g]);
  own(b);
  a.start(t);
  b.start(t);
  tr.drones.push(a, b);
}

// ---------- sound building blocks ----------

function kick(tr, t, peak = 0.5, pitch = 110) {
  tone(tr, t, { type: 'sine', f: pitch, f1: 38, dur: 0.28, peak, attack: 0.002, cut: 400 });
}

/** Metal hit: inharmonic ring + bright noise transient. */
function clank(tr, t, f, peak = 0.15) {
  hiss(tr, t, { type: 'bandpass', f: f * 3, q: 6, dur: 0.05, peak, attack: 0.001 });
  tone(tr, t, { type: 'sine', f, f1: f * 0.97, dur: 0.35, peak: peak * 0.5 });
  tone(tr, t, { type: 'sine', f: f * 2.76, dur: 0.12, peak: peak * 0.2 });
}

/** Bell: sine partials with inharmonic ratios, long decay. */
function bell(tr, t, f, peak = 0.12) {
  tone(tr, t, { type: 'sine', f, dur: 6, peak, attack: 0.004 });
  tone(tr, t, { type: 'sine', f: f * 2.76, dur: 3.5, peak: peak * 0.35, attack: 0.004 });
  tone(tr, t, { type: 'sine', f: f * 5.4, dur: 1.6, peak: peak * 0.15, attack: 0.004 });
}

// ---------- tracks ----------

const TRACKS = {
  // Heavy rumble and bell. Half-second grid, very sparse events.
  menu: {
    init(tr, t) {
      drone(tr, t, mtof(26), 0.16, 'sawtooth', 160); // D1
      drone(tr, t, mtof(33), 0.08, 'sine', 300); // A1
    },
    gen(tr, t) {
      const s = tr.step;
      if (s % 24 === 0) hiss(tr, t, { type: 'lowpass', f: 320, f1: 80, q: 0.6, dur: 6, peak: 0.14, attack: 2.5 }); // гул
      if (s % 16 === 8) bell(tr, t, mtof(pick(tr, [62, 62, 57, 65]))); // колокол
      if (chance(tr, 0.08)) clank(tr, t, rr(tr, 140, 260), 0.14);
      return 0.5;
    },
  },

  // Slow drone, rare metal strikes, wind.
  world: {
    init(tr, t) {
      drone(tr, t, mtof(27), 0.14, 'sawtooth', 180); // Eb1
      drone(tr, t, mtof(34), 0.07, 'sine', 400); // Bb1
    },
    gen(tr, t) {
      const s = tr.step;
      if (s % 16 === 0 && chance(tr, 0.5)) hiss(tr, t, { type: 'lowpass', f: 400, f1: 120, q: 0.5, dur: 3, peak: 0.1, attack: 1.2 });
      if (s % 8 === 4 && chance(tr, 0.35)) clank(tr, t, rr(tr, 180, 380), 0.12);
      if (s % 32 === 20 && chance(tr, 0.5)) kick(tr, t, 0.25, 70);
      return 0.5;
    },
  },

  // Warmer, dull low kick on eighths, quiet hats, sparse triangle notes.
  town: {
    init(tr, t) {
      drone(tr, t, mtof(41), 0.08, 'triangle', 500); // F2
      drone(tr, t, mtof(48), 0.05, 'sine', 600); // C3
    },
    gen(tr, t) {
      const s = tr.step % 16;
      if (s === 0 || s === 6 || s === 8 || s === 14) kick(tr, t, s === 0 ? 0.35 : 0.2, 80);
      if (s % 2 === 1 && chance(tr, 0.4)) hiss(tr, t, { type: 'highpass', f: 6000, dur: 0.02, peak: 0.025, attack: 0.001 });
      if (s % 4 === 2 && chance(tr, 0.5)) tone(tr, t, { type: 'triangle', f: mtof(pick(tr, [60, 63, 65, 67, 70])), dur: 0.5, peak: 0.07, attack: 0.02, cut: 1500 });
      return S(84, 2);
    },
  },

  // 100 BPM four-on-the-floor, industrial clank and noise percussion, bass sequence, mood changes every 4 bars.
  battle: {
    init(tr, t) {
      drone(tr, t, mtof(26), 0.09, 'sawtooth', 140); // D1
    },
    gen(tr, t) {
      const sec = S(100, 4);
      const s = tr.step % 16;
      if (tr.step % 64 === 0) tr.st.root = pick(tr, [38, 38, 36, 41]);
      const root = tr.st.root ?? 38;
      if (s === 0) tr.st.bass = Array.from({ length: 8 }, () => pick(tr, [0, 0, 0, 3, 5, 7, 10, 12]));
      if (s % 4 === 0) kick(tr, t, 0.5, 100);
      if (s === 4 || s === 12) {
        hiss(tr, t, { type: 'bandpass', f: 1800, q: 1.5, dur: 0.09, peak: 0.22, attack: 0.001 });
        clank(tr, t, rr(tr, 300, 500), 0.08);
      }
      if (s % 2 === 0 && chance(tr, 0.5)) hiss(tr, t, { type: 'bandpass', f: rr(tr, 2000, 5000), q: 3, dur: 0.03, peak: 0.12, attack: 0.001 });
      if (s % 2 === 0 && chance(tr, 0.85)) {
        tone(tr, t, { type: 'sawtooth', f: mtof(root + tr.st.bass[s / 2]), dur: sec * 1.6, peak: 0.1, attack: 0.003, cut: 500, cut1: 180, q: 4 });
      }
      if (s === 0 && chance(tr, 0.15)) clank(tr, t, rr(tr, 200, 320), 0.1);
      return sec;
    },
  },

  // Denser, double-time kicks, tritone bass, minor-second stabs, riser noise.
  boss: {
    init(tr, t) {
      drone(tr, t, mtof(25), 0.1, 'sawtooth', 160); // Ab0 (clash)
      drone(tr, t, mtof(26), 0.07, 'square', 160); // A0 (minor second)
    },
    gen(tr, t) {
      const sec = S(96, 4);
      const s = tr.step % 32;
      const root = 38;
      if (s % 4 === 0 || s === 6 || s === 26) kick(tr, t, s % 8 === 0 ? 0.55 : 0.35, 90);
      if (s % 8 === 4) clank(tr, t, rr(tr, 260, 340), 0.12);
      if (s === 0 || s === 16) {
        tone(tr, t, { type: 'square', f: mtof(root + 12), dur: 0.9, peak: 0.07, attack: 0.01, cut: 1200 });
        tone(tr, t, { type: 'square', f: mtof(root + 13), dur: 0.9, peak: 0.06, attack: 0.01, cut: 1200 });
      }
      if (s % 2 === 0) tone(tr, t, { type: 'sawtooth', f: mtof(root + (s % 4 === 0 ? 0 : 6)), dur: sec * 1.5, peak: 0.08, attack: 0.003, cut: 300, cut1: 150 });
      if (s === 0) hiss(tr, t, { type: 'highpass', f: 800, f1: 6000, dur: 1.2, peak: 0.05, attack: 0.5 }); // riser
      return sec;
    },
  },

  // 120 BPM 32nd grid: glitch arpeggio over a scale picked per 2 bars, stutters, digital hum.
  cyberspace: {
    init(tr, t) {
      drone(tr, t, mtof(38), 0.035, 'square', 400); // D2 hum
    },
    gen(tr, t) {
      const sec = S(120, 8);
      const s = tr.step % 64;
      if (s === 0) tr.st.scale = pick(tr, [[0, 3, 5, 7, 10], [0, 2, 3, 7, 8], [0, 1, 5, 7, 10]]);
      const sc = tr.st.scale || [0, 3, 5, 7, 10];
      if (s % 2 === 0 && chance(tr, 0.8)) {
        const m = 72 + pick(tr, sc) + 12 * ((tr.rnd() * 2) | 0);
        tone(tr, t, { type: 'square', f: mtof(m), dur: sec * 1.6, peak: 0.05, attack: 0.001, cut: 3000, cut1: 800 });
      }
      if (s % 16 === 15 && chance(tr, 0.5)) {
        for (let k = 0; k < 4; k++) tone(tr, t + k * sec * 0.5, { type: 'square', f: mtof(84 + pick(tr, sc)), dur: sec * 0.4, peak: 0.04, attack: 0.001, cut: 4000 });
      }
      if (s % 8 === 0) kick(tr, t, 0.2, 60);
      if (chance(tr, 0.12)) hiss(tr, t, { type: 'highpass', f: 6000, dur: 0.012, peak: 0.1, attack: 0.001 });
      return sec;
    },
  },

  // Last timer mark: heartbeat (lub-dub), timer ticks that speed up, beating drone (A1 + Bb1).
  tension: {
    init(tr, t) {
      drone(tr, t, mtof(33), 0.06, 'sawtooth', 300); // A1
      drone(tr, t, mtof(34), 0.06, 'sawtooth', 300); // Bb1
    },
    gen(tr, t) {
      const k = Math.min(3, (tr.step / 128) | 0); // tension grows every 32 beats
      const s = tr.step % 4;
      if (s === 0) kick(tr, t, 0.45, 70);
      if (s === 2) kick(tr, t, 0.3, 60);
      if (tr.step % (8 - 2 * k) === 0) tone(tr, t, { type: 'sine', f: mtof(84 + 2 * k), dur: 0.03, peak: 0.05, attack: 0.001 });
      if (k >= 2 && s === 0 && chance(tr, 0.2)) clank(tr, t, rr(tr, 500, 700), 0.08);
      return 0.25;
    },
  },
};

/** Track ids accepted by playTrack(). */
export const TRACK_IDS = Object.freeze(Object.keys(TRACKS));

// ---------- where to call (not wired yet, per brief) ----------
//
// Track -> where to call (playTrack in scene enter(game) or in the place where the state changes):
//   'menu'       game/src/scenes/menu.js          menuScene enter
//   'world'      game/src/scenes/world-map.js     createWorldMapScene enter (map and route)
//   'town'       game/src/scenes/location.js      createLocationScene enter (node and hub)
//   'battle'     game/src/scenes/battle.js        createBattleScene enter (regular fights; world-battle.js uses it too)
//   'boss'       game/src/scenes/battle.js        same scene, when the encounter is a boss or finale
//                                                 (w-cc-finale, ids with '^inc'): choose by encounter id
//   'cyberspace' game/src/scenes/cyberspace.js    createCyberspaceScene enter
//   'tension'    game/src/scenes/world-map.js and location.js, when exodus mark is 5 (last timer mark;
//                                                 see game/src/world/exodus.js exodusMark)
//   stopMusic(1500): game end (cyberspace defeat, exodus-zero finale, save deletion) and the pause
//   menu's "В главное меню" (game/src/ui/save-ui.js, onMenu). setMusicVolume(v): settings screen.
//   Calls before the first user gesture are stored and start on that gesture by themselves.
