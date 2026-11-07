// music.js — game music: procedural WebAudio tracks, or audio files when they exist.
// Shares AudioContext and masterGain with sfx.js. Nothing plays before the first user gesture.
//
//   import { playTrack, stopMusic, setMusicVolume } from './audio/music.js';
//   playTrack('menu');                   // crossfade 1.5 s (clamped to 1–2 s)
//   playTrack('battle', { seed: 42 });   // seed = reproducible variation (procedural only)
//   stopMusic(1500);  setMusicVolume(0.6);
//
// Style: Rogue Trader (menu, town, boss) = organ and choir pads, FM bell, big hall reverb.
// Quasimorph (world, battle) = dry industrial kicks, metal hits into a short echo, filtered synths,
// rests. Cyberspace and tension = digital and pulse textures. No bare square or saw, no continuous
// sub-bass (kicks only), no beating drones, no clicks (every envelope has an attack of 3 ms or more).
//
// Audio files: MUSIC_FILES maps a track id to a path relative to game/index.html. If the file loads
// and decodes, it loops through overlapping passes (LOOP_XFADE seam crossfade). Otherwise the
// procedural track plays. A file that appears while a procedural track is playing replaces it.
// Folder game/assets/music is empty for now; missing files cost one HEAD request per track.
//
// Voices: at most MAX_VOICES live oscillators, noise and LFO sources across both crossfading tracks.
// Extra one-shot events are dropped silently. Pads and drones are permanent per track and stopped
// on retire. Every source disconnects itself in onended. File passes do not count as voices.
//
// Where to call: see the comment at the end of this file.

import { initAudio, getAudioContext, getNoiseBuffer, masterGain } from './sfx.js';

const MAX_VOICES = 12;
const MUSIC_MAX = 0.32; // music under SFX: about −14 dB at default volume (0.6 × 0.32 ≈ 0.19)
const LOOKAHEAD = 0.12; // s planned ahead
const TICK_MS = 25;
const FADE_MIN = 1000;
const FADE_MAX = 2000;
const FADE_DEFAULT = 1500;
const LOOP_XFADE = 1.5; // s, overlap at the loop seam of an audio file
const HALL_S = 4.2; // s, impulse response length of the hall
const HALL_WET = 0.45;
const ECHO_S = 0.32; // s, percussion echo time
const ECHO_FB = 0.35; // echo feedback
const GESTURES = ['pointerdown', 'keydown', 'touchstart', 'mousedown'];

/** Audio files, path relative to game/index.html. A missing file means a procedural track. */
// Enable a track by uncommenting its line once the file is in game/assets/music (avoids 404 requests).
const MUSIC_FILES = {
  // menu: 'assets/music/menu.mp3',
  // world: 'assets/music/world.mp3',
  // town: 'assets/music/town.mp3',
  // battle: 'assets/music/battle.mp3',
  // boss: 'assets/music/boss.mp3',
  // cyberspace: 'assets/music/cyberspace.mp3',
  // tension: 'assets/music/tension.mp3',
};

// Chords as MIDI notes, kept above ~110 Hz (no sub drone). Each chord lasts 8–16 s.
const DORIAN = [
  [50, 57, 60, 65], // Dm7
  [46, 53, 57, 60], // Bbmaj7
  [43, 50, 55, 58], // Gm7
  [45, 52, 57, 60], // Am7
];
const PHRYGIAN = [
  [52, 59, 64, 67], // Em
  [53, 57, 60, 64], // F (bII against E)
];
const BOSS = [
  [52, 59, 64, 65], // Em, phrygian
  [46, 53, 58, 61], // Bb with Db (tritone against E)
  [50, 57, 62, 65], // Dm
];
const CYBER = [
  [50, 57, 60, 64],
  [48, 55, 58, 62],
];
const TENSE = [
  [50, 57], // fifths only: no beating
  [48, 55],
];
const VOWELS = {
  a: [800, 1150, 2800],
  o: [500, 900, 2500],
};

let ctx = null;
let musicBus = null;
let sendBus = null; // percussion send into the echo
let volume = 0.6;
let voices = 0;
let current = null; // running track
let wanted = null; // requested but not yet started (no context yet)
let hooked = false;
let organ = null; // PeriodicWave for the organ timbre
let organCtx = null;
const fileState = new Map(); // id -> 'none' | 'loading' | 'missing' | AudioBuffer

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

/** Synthetic hall: decaying, slightly dark noise with a 20 ms pre-delay. */
function makeHall(c, seconds) {
  const sr = c.sampleRate;
  const len = Math.floor(sr * seconds);
  const pre = Math.floor(sr * 0.02);
  const buf = c.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const x = (i - pre) / (len - pre);
      lp += (Math.random() * 2 - 1 - lp) * 0.35;
      d[i] = lp * Math.exp(-6.5 * x); // about −56 dB at the end
    }
  }
  return buf;
}

function ensure() {
  if (ctx && musicBus) return true;
  try {
    const c = getAudioContext();
    if (!c || !masterGain) return false;
    ctx = c;
    musicBus = ctx.createGain();
    musicBus.gain.value = volume * MUSIC_MAX;

    // dry path: gentle saturation, then master
    const sh = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(1.5 * x) / Math.tanh(1.5);
    }
    sh.curve = curve;
    sh.oversample = 'none';
    musicBus.connect(sh).connect(masterGain);

    // space: one hall for the whole music bus
    const conv = ctx.createConvolver();
    conv.buffer = makeHall(ctx, HALL_S);
    const wet = ctx.createGain();
    wet.gain.value = HALL_WET;
    musicBus.connect(conv).connect(wet).connect(masterGain);

    // echo for percussion sends: low-passed feedback, no hard repeats
    sendBus = ctx.createGain();
    const dl = ctx.createDelay(1);
    dl.delayTime.value = ECHO_S;
    const fbLp = ctx.createBiquadFilter();
    fbLp.type = 'lowpass';
    fbLp.frequency.value = 2200;
    const fb = ctx.createGain();
    fb.gain.value = ECHO_FB;
    const echoOut = ctx.createGain();
    echoOut.gain.value = 0.35;
    sendBus.connect(dl);
    dl.connect(fbLp).connect(fb).connect(dl);
    dl.connect(echoOut).connect(musicBus);
    return true;
  } catch {
    ctx = null;
    musicBus = null;
    sendBus = null;
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
  current = startAny(w.id, w.seed, t0, fadeS);
  if (old) retire(old, fadeS);
}

/** Audio file if it is decoded, else procedural. Unknown files are probed in the background. */
function startAny(id, seed, t0, fadeS) {
  const f = fileState.get(id);
  if (f && typeof f === 'object') return startFile(id, f, t0, fadeS);
  if (!f) probeFile(id);
  return startTrack(id, seed, t0, fadeS);
}

function startTrack(id, seed, t0, fadeS) {
  const def = TRACKS[id];
  const out = ctx.createGain();
  out.gain.setValueAtTime(0, t0);
  out.gain.linearRampToValueAtTime(1, t0 + fadeS);
  out.connect(musicBus);
  const tr = {
    id,
    kind: 'proc',
    def,
    out,
    rnd: mulberry(seed),
    step: 0,
    next: t0 + 0.05,
    timer: 0,
    dead: false,
    drones: [],
    st: {},
    pad: null,
    voiceOsc: null,
    formants: null,
  };
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

// ---------- audio file playback ----------

function probeFile(id) {
  if (!MUSIC_FILES[id]) {
    fileState.set(id, 'none');
    return;
  }
  fileState.set(id, 'loading');
  loadFile(id, ctx).then((buf) => {
    fileState.set(id, buf || 'missing');
    if (buf) onFileReady(id, buf);
  });
}

async function loadFile(id, c) {
  try {
    const url = MUSIC_FILES[id];
    const head = await fetch(url, { method: 'HEAD' });
    if (!head.ok) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await c.decodeAudioData(await res.arrayBuffer());
    return buf.duration >= 8 ? buf : null; // shorter files would loop too fast
  } catch {
    return null;
  }
}

/** A file arrived while its procedural track is playing: crossfade to the file. */
function onFileReady(id, buf) {
  if (!ctx || !current || current.id !== id || current.kind === 'file') return;
  const old = current;
  const fadeS = FADE_DEFAULT / 1000;
  current = startFile(id, buf, ctx.currentTime, fadeS);
  retire(old, fadeS);
}

function startFile(id, buf, t0, fadeS) {
  const out = ctx.createGain();
  out.gain.setValueAtTime(0, t0);
  out.gain.linearRampToValueAtTime(1, t0 + fadeS);
  out.connect(musicBus);
  const x = Math.min(LOOP_XFADE, buf.duration / 4);
  const tr = {
    id,
    kind: 'file',
    def: null,
    out,
    buf,
    x,
    period: buf.duration - x,
    nextStart: t0,
    timer: 0,
    dead: false,
    drones: [],
    rnd: null,
    step: 0,
    next: 0,
    st: {},
  };
  tr.timer = setInterval(() => filePump(tr), TICK_MS);
  filePump(tr);
  return tr;
}

/** Keeps passes scheduled about one second ahead. Each pass plays the whole file once. */
function filePump(tr) {
  if (tr.dead || !ctx) return;
  const now = ctx.currentTime;
  if (tr.nextStart < now) tr.nextStart = now + 0.02;
  while (tr.nextStart < now + 1.0) {
    playPass(tr, tr.nextStart);
    tr.nextStart += tr.period;
  }
}

/** One pass: fades in over x s, holds, fades out over the last x s. Overlapping passes make a seamless loop. */
function playPass(tr, s) {
  const D = tr.buf.duration;
  const x = tr.x;
  const src = ctx.createBufferSource();
  src.buffer = tr.buf;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, s);
  g.gain.linearRampToValueAtTime(1, s + x);
  g.gain.setValueAtTime(1, s + D - x);
  g.gain.linearRampToValueAtTime(0, s + D);
  src.connect(g).connect(tr.out);
  tr.drones.push(src);
  src.onended = () => {
    tr.drones = tr.drones.filter((n) => n !== src);
    try {
      src.disconnect();
      g.disconnect();
    } catch {
      /* ignore */
    }
  };
  src.start(s);
  src.stop(s + D + 0.05);
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

/** Permanent source (pad, LFO, choir): counted as a voice, stopped on retire. Caller starts it. */
function hold(tr, src, nodes = []) {
  own(src, nodes);
  tr.drones.push(src);
}

function env(tr, t, peak, attack, dur, send = false) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, attack + 0.01));
  g.connect(tr.out);
  if (send) g.connect(sendBus);
  return g;
}

/** One-shot oscillator. o: {type | wave, f, f1?, dur, peak, attack?, cut?, cut1?, q?, send?} */
function tone(tr, t, o) {
  if (!room()) return;
  const osc = ctx.createOscillator();
  if (o.wave) osc.setPeriodicWave(o.wave);
  else osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.f, t);
  if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
  const fl = ctx.createBiquadFilter();
  fl.type = 'lowpass';
  fl.frequency.setValueAtTime(o.cut || 6000, t);
  if (o.cut1) fl.frequency.exponentialRampToValueAtTime(o.cut1, t + o.dur);
  fl.Q.value = o.q ?? 0.7;
  const g = env(tr, t, o.peak ?? 0.1, o.attack ?? 0.005, o.dur, o.send);
  osc.connect(fl).connect(g);
  own(osc, [fl, g]);
  osc.start(t);
  osc.stop(t + o.dur + 0.05);
}

/** One-shot filtered noise. o: {type, f, f1?, q?, dur, peak, attack?, send?} */
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
  const g = env(tr, t, o.peak ?? 0.1, o.attack ?? 0.005, o.dur, o.send);
  src.connect(fl).connect(g);
  own(src, [fl, g]);
  src.start(t, tr.rnd() * 0.9);
  src.stop(t + o.dur + 0.05);
}

/** Organ timbre as one PeriodicWave: partials 1, 2, 3, 4, 6, 8 with falling amplitude. */
function organWave() {
  if (organCtx !== ctx) {
    const real = new Float32Array(9);
    const imag = new Float32Array(9);
    real[1] = 1;
    real[2] = 0.5;
    real[3] = 0.33;
    real[4] = 0.25;
    real[6] = 0.16;
    real[8] = 0.1;
    organ = ctx.createPeriodicWave(real, imag);
    organCtx = ctx;
  }
  return organ;
}

/**
 * Permanent pad: n voices (one oscillator each, detuned by ±o.detune cents) into one lowpass,
 * with a slow LFO on the cutoff. Chords change by glide (padChord). o: {wave, n, peak, cut, lfo, depth, attack, detune, chord}
 */
function pad(tr, t, o) {
  const n = o.n ?? 3;
  if (!room(n + 1)) return;
  const chord = o.chord;
  const fl = ctx.createBiquadFilter();
  fl.type = 'lowpass';
  fl.frequency.value = o.cut ?? 1100;
  fl.Q.value = 0.5;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.setTargetAtTime(o.peak ?? 0.05, t, (o.attack ?? 3) / 3);
  fl.connect(gain).connect(tr.out);

  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = o.lfo ?? 0.06;
  const depth = ctx.createGain();
  depth.gain.value = o.depth ?? 250;
  lfo.connect(depth).connect(fl.frequency);
  hold(tr, lfo, [depth]);
  lfo.start(t);

  const osc = [];
  for (let i = 0; i < n; i++) {
    const v = ctx.createOscillator();
    if (o.wave === 'organ') v.setPeriodicWave(organWave());
    else v.type = o.wave || 'triangle';
    v.frequency.value = mtof(chord[i % chord.length]);
    v.detune.value = n > 1 ? (i / (n - 1) - 0.5) * 2 * (o.detune ?? 5) : 0;
    v.connect(fl);
    hold(tr, v);
    v.start(t);
    osc.push(v);
  }
  tr.pad = { osc, gain, peak: o.peak ?? 0.05 };
}

/** Glide the pad (and the choir, an octave up) to a chord. */
function padChord(tr, t, midis) {
  if (tr.pad) tr.pad.osc.forEach((v, i) => v.frequency.setTargetAtTime(mtof(midis[i % midis.length]), t, 1.2));
  if (tr.voiceOsc) tr.voiceOsc.frequency.setTargetAtTime(mtof(midis[0] + 12), t, 1.2);
}

/** Change the chord every 8–16 s, walking through the progression. */
function cycle(tr, t, prog) {
  if (tr.st.at !== undefined && t < tr.st.at) return;
  tr.st.i = ((tr.st.i ?? -1) + 1) % prog.length;
  tr.st.chord = prog[tr.st.i];
  padChord(tr, t, tr.st.chord);
  tr.st.at = t + rr(tr, 8, 16);
}

/** Pad to a quiet level (rest) or back to full. */
function setRest(tr, t, rest) {
  if (!tr.pad || !!tr.st.rest === rest) return;
  tr.st.rest = rest;
  tr.pad.gain.gain.setTargetAtTime(tr.pad.peak * (rest ? 0.35 : 1), t, 1.2);
}

/** Choir: one sawtooth through three bandpass formants; vowels glide with vowel(). */
function choir(tr, t, chord, peak) {
  if (!room(2)) return;
  const v = ctx.createOscillator();
  v.type = 'sawtooth';
  v.frequency.value = mtof(chord[0] + 12);
  const out = ctx.createGain();
  out.gain.setValueAtTime(0, t);
  out.gain.setTargetAtTime(peak, t, 1.5);
  out.connect(tr.out);
  const levels = [1, 0.6, 0.35];
  tr.formants = VOWELS.a.map((f, k) => {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f;
    bp.Q.value = 8;
    const g = ctx.createGain();
    g.gain.value = levels[k];
    v.connect(bp).connect(g).connect(out);
    return bp;
  });
  hold(tr, v, [out]);
  v.start(t);
  tr.voiceOsc = v;
}

function vowel(tr, t, which) {
  if (!tr.formants) return;
  tr.formants.forEach((bp, k) => bp.frequency.setTargetAtTime(VOWELS[which][k], t, 0.8));
}

// ---------- sound building blocks ----------

/** Dry industrial kick: short sine with a pitch drop. Sub only as a short thud. */
function kick(tr, t, peak = 0.5, pitch = 110) {
  tone(tr, t, { type: 'sine', f: pitch, f1: 44, dur: 0.22, peak, attack: 0.003, cut: 500 });
}

/** Metal hit: inharmonic ring plus a short bandpass-noise transient, sent to the echo. */
function clank(tr, t, f, peak = 0.12) {
  hiss(tr, t, { type: 'bandpass', f: f * 4, q: 5, dur: 0.09, peak, attack: 0.004, send: true });
  tone(tr, t, { type: 'sine', f, f1: f * 0.98, dur: 0.6, peak: peak * 0.45, attack: 0.004, send: true });
  tone(tr, t, { type: 'sine', f: f * 2.76, dur: 0.25, peak: peak * 0.18, attack: 0.004, send: true });
}

/** FM bell: sine carrier, inharmonic modulator (ratio 3.5) with a decaying index, long tail. */
function fmBell(tr, t, f, peak = 0.08) {
  if (!room(2)) return;
  const car = ctx.createOscillator();
  car.type = 'sine';
  car.frequency.value = f;
  const mod = ctx.createOscillator();
  mod.type = 'sine';
  mod.frequency.value = f * 3.5;
  const mg = ctx.createGain();
  mg.gain.setValueAtTime(f * 3, t);
  mg.gain.exponentialRampToValueAtTime(0.01, t + 2);
  mod.connect(mg).connect(car.frequency);
  const g = env(tr, t, peak, 0.004, 7);
  car.connect(g);
  own(car, [g]);
  own(mod, [mg]);
  car.start(t);
  mod.start(t);
  car.stop(t + 7.05);
  mod.stop(t + 2.05);
}

/** Filtered triangle stab (bass or synth), no bare waveform. */
function stab(tr, t, midi, dur, peak = 0.08) {
  tone(tr, t, { type: 'triangle', f: mtof(midi), dur, peak, attack: 0.012, cut: 700, cut1: 220, q: 1.2 });
}

/** Radio crackle: short bandpass noise, soft attack. */
function crackle(tr, t, peak = 0.04) {
  hiss(tr, t, { type: 'bandpass', f: rr(tr, 1200, 2600), q: 2, dur: 0.18, peak, attack: 0.02 });
}

/** Soft timer tick: sine with a 8 ms attack (no click). */
function tick(tr, t, f, peak = 0.03) {
  tone(tr, t, { type: 'sine', f, dur: 0.06, peak, attack: 0.008, cut: 4000 });
}

// ---------- tracks ----------

const TRACKS = {
  // Rogue Trader: organ and choir, sparse FM bell. 1 s grid, most of the time only the pad.
  menu: {
    init(tr, t) {
      pad(tr, t, { wave: 'organ', n: 3, peak: 0.05, cut: 1300, lfo: 0.05, depth: 280, attack: 4, chord: DORIAN[0] });
      choir(tr, t, DORIAN[0], 0.02);
    },
    gen(tr, t) {
      const s = tr.step;
      cycle(tr, t, DORIAN);
      if (s % 20 === 10) vowel(tr, t, chance(tr, 0.5) ? 'a' : 'o');
      if (s % 24 === 12 && chance(tr, 0.5)) fmBell(tr, t, mtof(pick(tr, [74, 77, 81])), 0.05);
      return 1;
    },
  },

  // Quasimorph map: dark filtered pad, dry kicks, rare clank and crackle. 2 of every 8 bars rest.
  world: {
    init(tr, t) {
      pad(tr, t, { wave: 'triangle', n: 3, peak: 0.04, cut: 900, lfo: 0.07, depth: 200, attack: 3, chord: PHRYGIAN[0] });
    },
    gen(tr, t) {
      const s = tr.step;
      const rest = Math.floor(s / 8) % 8 >= 6;
      setRest(tr, t, rest);
      cycle(tr, t, PHRYGIAN);
      if (!rest) {
        if (s % 8 === 0 && chance(tr, 0.8)) kick(tr, t, 0.35, 95);
        if (s % 8 === 5 && chance(tr, 0.3)) kick(tr, t, 0.2, 90);
        if (s % 8 === 3 && chance(tr, 0.35)) stab(tr, t, pick(tr, [52, 55, 59, 62]), 0.5, 0.05);
        if (s % 8 === 4 && chance(tr, 0.12)) clank(tr, t, rr(tr, 200, 320), 0.07);
      }
      if (chance(tr, 0.03)) crackle(tr, t, 0.04);
      return S(72, 2);
    },
  },

  // Rogue Trader city: warm organ and choir, soft pulse, bell. 1 of 5 phrases (about 20%) is quiet.
  town: {
    init(tr, t) {
      pad(tr, t, { wave: 'organ', n: 3, peak: 0.045, cut: 1100, lfo: 0.04, depth: 250, attack: 4, chord: DORIAN[0] });
      choir(tr, t, DORIAN[0], 0.018);
    },
    gen(tr, t) {
      const s = tr.step;
      const rest = Math.floor(s / 16) % 5 === 4;
      setRest(tr, t, rest);
      cycle(tr, t, DORIAN);
      if (!rest && s % 8 === 0 && chance(tr, 0.4)) kick(tr, t, 0.2, 70);
      if (s % 24 === 12) vowel(tr, t, chance(tr, 0.5) ? 'a' : 'o');
      if (!rest && s % 32 === 16 && chance(tr, 0.4)) fmBell(tr, t, mtof(pick(tr, [74, 81, 86])), 0.045);
      return S(66, 2);
    },
  },

  // Quasimorph combat: 96 BPM, dry kick, metal hits into the echo, filtered stabs. Rest bar every 12 bars.
  battle: {
    init(tr, t) {
      pad(tr, t, { wave: 'triangle', n: 2, peak: 0.03, cut: 700, lfo: 0.1, depth: 160, attack: 3, chord: DORIAN[0] });
    },
    gen(tr, t) {
      const s = tr.step;
      const pos = s % 16;
      const rest = Math.floor(s / 16) % 12 === 11;
      setRest(tr, t, rest);
      cycle(tr, t, DORIAN);
      if (s % 64 === 0) tr.st.root = pick(tr, [50, 50, 48, 53]);
      if (!rest) {
        if (pos % 4 === 0) kick(tr, t, pos === 0 ? 0.5 : 0.4, 95);
        if (pos === 14 && chance(tr, 0.35)) kick(tr, t, 0.3, 90);
        if (pos === 4 || pos === 12) clank(tr, t, rr(tr, 260, 420), 0.1);
        if (pos % 2 === 1 && chance(tr, 0.4)) hiss(tr, t, { type: 'bandpass', f: 4200, q: 2, dur: 0.04, peak: 0.03, attack: 0.008 });
        if (pos % 2 === 0 && chance(tr, 0.6)) stab(tr, t, (tr.st.root ?? 50) + pick(tr, [0, 0, 3, 5, 7, 10, 12]), S(96, 2), 0.08);
      }
      if (chance(tr, 0.02)) crackle(tr, t, 0.04);
      return S(96, 4);
    },
  },

  // Rogue Trader boss: organ over a tritone-based progression, double-time kicks, FM bell. Rest every 8 bars.
  boss: {
    init(tr, t) {
      pad(tr, t, { wave: 'organ', n: 3, peak: 0.055, cut: 1000, lfo: 0.08, depth: 300, attack: 2, chord: BOSS[0] });
    },
    gen(tr, t) {
      const s = tr.step;
      const pos = s % 16;
      const bar = Math.floor(s / 16);
      const rest = bar % 8 === 7;
      setRest(tr, t, rest);
      cycle(tr, t, BOSS);
      if (!rest) {
        if (pos % 4 === 0) kick(tr, t, pos === 0 ? 0.55 : 0.4, 90);
        if ((pos === 6 || pos === 14) && chance(tr, 0.7)) kick(tr, t, 0.3, 80);
        if (pos === 8) clank(tr, t, rr(tr, 280, 340), 0.1);
        if (pos === 0 && bar % 2 === 0 && tr.st.chord) {
          tone(tr, t, { wave: organWave(), f: mtof(tr.st.chord[0] + 12), dur: S(92, 4) * 16, peak: 0.05, attack: 0.4, cut: 1000 });
        }
      }
      if (pos === 0 && bar % 4 === 2) fmBell(tr, t, mtof(pick(tr, [76, 79])), 0.05);
      return S(92, 4);
    },
  },

  // Digital: triangle arpeggio on a scale picked per 4 bars, glitch bursts, soft pulse. No square.
  cyberspace: {
    init(tr, t) {
      pad(tr, t, { wave: 'sine', n: 2, peak: 0.03, cut: 1800, lfo: 0.12, depth: 400, attack: 3, chord: CYBER[0] });
    },
    gen(tr, t) {
      const sec = S(120, 4);
      const s = tr.step % 64;
      cycle(tr, t, CYBER);
      if (s === 0) tr.st.scale = pick(tr, [[0, 3, 5, 7, 10], [0, 2, 3, 7, 8], [0, 1, 5, 7, 10]]);
      const sc = tr.st.scale || [0, 3, 5, 7, 10];
      if (s % 2 === 0 && chance(tr, 0.7)) {
        const m = 72 + pick(tr, sc) + 12 * ((tr.rnd() * 2) | 0);
        tone(tr, t, { type: 'triangle', f: mtof(m), dur: sec * 1.6, peak: 0.035, attack: 0.008, cut: 2600, cut1: 900 });
      }
      if (s % 16 === 15 && chance(tr, 0.4)) {
        for (let k = 0; k < 4; k++) {
          tone(tr, t + k * sec * 0.5, { type: 'sine', f: mtof(84 + pick(tr, sc)), dur: sec * 0.4, peak: 0.03, attack: 0.006, cut: 3500 });
        }
      }
      if (s % 8 === 0) kick(tr, t, 0.22, 60);
      if (chance(tr, 0.05)) crackle(tr, t, 0.035);
      return sec;
    },
  },

  // Last timer mark: fifths only (no beating), heartbeat, ticks that speed up with each stage.
  tension: {
    init(tr, t) {
      pad(tr, t, { wave: 'sine', n: 2, peak: 0.035, cut: 700, lfo: 0.05, depth: 120, attack: 4, detune: 0, chord: TENSE[0] });
    },
    gen(tr, t) {
      const k = Math.min(3, (tr.step / 128) | 0);
      const s = tr.step % 4;
      cycle(tr, t, TENSE);
      if (s === 0) kick(tr, t, 0.4, 70);
      if (s === 2) kick(tr, t, 0.25, 60);
      if (tr.step % (8 - 2 * k) === 0) tick(tr, t, mtof(84 + 2 * k), 0.025);
      if (k >= 2 && s === 0 && chance(tr, 0.2)) clank(tr, t, rr(tr, 500, 700), 0.06);
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
//   Audio files: put game/assets/music/<id>.mp3 (paths in MUSIC_FILES); see docs/MUSIC-SUNO.md.
