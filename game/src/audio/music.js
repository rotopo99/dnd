// music.js — game music: procedural WebAudio tracks, or audio files when they exist.
// Shares AudioContext and masterGain with sfx.js. Nothing plays before the first user gesture.
//
//   import { playTrack, stopMusic, setMusicVolume } from './audio/music.js';
//   playTrack('menu');                   // crossfade 1.5 s (clamped to 1–2 s)
//   playTrack('battle', { seed: 42 });   // seed = reproducible variation (procedural only)
//   stopMusic(1500);  setMusicVolume(0.6);
//
// Style: Rogue Trader (menu, town, boss) = organ and choir pads, FM bell, lead on triangle with light
// detune and chorus, big hall reverb; boss and battle get a driving beat. Quasimorph (world, battle)
// = dry industrial kicks, hats from noise, metal hits into a short echo, saturated drums.
// Cyberspace and tension = digital and pulse textures. No bare square or saw, no continuous sub-bass
// (bass notes sit at 80–200 Hz behind a lowpass), no beating drones, no clicks (every envelope has an
// attack of 3 ms or more).
//
// Form: 48-bar cycle = intro (8) → verse (12) → lift (8) → climax (12) → fall (8). Every new cycle
// picks a seeded variation (transposition of the melody). Melody: 4–8 note motif, 4-bar phrase with
// an inverted bar. Drums are written as 16-step patterns per section.
//
// Audio files: MUSIC_FILES maps a track id to a path relative to game/index.html. If the file loads
// and decodes, it loops through overlapping passes (LOOP_XFADE seam crossfade). Otherwise the
// procedural track plays. A file that appears while a procedural track is playing replaces it.
// Folder game/assets/music is empty for now; missing files cost one HEAD request per track.
//
// Voices: at most MAX_VOICES live oscillators, noise and LFO sources across both crossfading tracks.
// Extra one-shot events are dropped silently (drums are scheduled first, so they win). Pads and drones
// are permanent per track and stopped on retire. Every source disconnects itself in onended.
// File passes do not count as voices.
//
// Where to call: see the comment at the end of this file.

import { initAudio, getAudioContext, getNoiseBuffer, masterGain } from './sfx.js';

const MAX_VOICES = 16;
const MUSIC_MAX = 0.36; // music under SFX: about −13 dB at default volume (0.6 × 0.36 ≈ 0.22)
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
const CYC = 48; // bars per cycle (intro 8, verse 12, lift 8, climax 12, fall 8)
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
  // boss-final: 'assets/music/boss-final.mp3',   // vocals ok (choir/chant)
  // romance: 'assets/music/romance.mp3',         // vocals ok
  // tragic: 'assets/music/tragic.mp3',           // vocals ok
};
// Tracks that exist only as files: until the file is there, play this procedural track instead.
const ALIAS = { 'boss-final': 'boss', romance: 'town', tragic: 'menu' };

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

// Motifs: [offset in semitones from the chord root + 12, start step in the bar (16ths), length in steps].
// Each motif fits one bar (16 steps) and has no overlaps.
const M_MENU = [[0, 0, 6], [3, 6, 2], [5, 8, 4], [7, 12, 4]];
const M_TOWN = [[0, 0, 4], [2, 4, 2], [3, 6, 2], [7, 8, 4], [5, 12, 2], [3, 14, 2]];
const M_WORLD = [[0, 0, 3], [1, 3, 1], [3, 4, 2], [7, 6, 4], [5, 10, 2], [3, 12, 2], [1, 14, 2]];
const M_BATTLE = [[0, 0, 2], [3, 2, 2], [7, 4, 2], [10, 6, 2], [7, 8, 4], [5, 12, 2], [3, 14, 2]];
const M_BOSS = [[0, 0, 4], [1, 4, 2], [7, 6, 2], [6, 8, 4], [3, 12, 2], [1, 14, 2]];

// Bass lines: offsets from the bass root, one row per bar in a 4-bar phrase, one entry per bass hit.
const BASS_B = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 3, 5],
  [0, 0, 5, 0, 3, 0, 7, 0],
  [0, 0, 0, 0, 0, 0, 5, 3],
];

// Drum pattern pieces: 16 characters each. 'X' = accent, 'x' = normal, '.' = none.
const H16 = 'x'.repeat(16);
const H8 = 'x.'.repeat(8);
const KQ = 'X...'.repeat(4); // kick on every beat
const S24 = '....X' + '.'.repeat(7) + 'X...'; // snare on 2 and 4
const FILL = '.'.repeat(8) + 'x'.repeat(8); // snare roll in the second half of the bar
const CL8 = '....x' + '.'.repeat(7) + 'x...'; // metal hits on 2 and 4 (the "and" of 2 and 4 is left empty)

/** Section patterns. Section index: 0 intro, 1 verse, 2 lift, 3 climax, 4 fall. */
const MENU_P = [
  {},
  { lv: 0.045 },
  { lv: 0.045, bell: 0.04, bellNotes: [74, 77, 81] },
  { lv: 0.05, bell: 0.04, bellNotes: [74, 77, 81] },
  { lv: 0.045, once: true, rest: true },
];

const WORLD_P = [
  { k: 'X...x...X...x...', kv: 0.3, h: H8, hv: 0.018 },
  { k: 'X...x...X...x...', kv: 0.4, h: H8, hv: 0.022, hp: 0.9, cl: '......x.......x.', clv: 0.06, cf: [260, 330], lv: 0.05 },
  { k: 'X...x...X...x.x.', kv: 0.42, s: '....x.......x...', sv: 0.05, h: H8, hv: 0.024, cl: '......x.......x.', clv: 0.07, cf: [200, 320], lv: 0.06, bass: 0.07, be: 4 },
  { k: 'X...x..xX...x.x.', kv: 0.45, s: '....x.......x...', fs: FILL, sv: 0.06, h: H8, hv: 0.026, cl: '..x...x...x...x.', clv: 0.08, cf: [200, 320], lv: 0.07, bass: 0.08, be: 4, stab: 0.025 },
  { k: 'X' + '.'.repeat(15), kv: 0.3, h: 'x' + '.'.repeat(7) + 'x' + '.'.repeat(7), hv: 0.02, lv: 0.05, once: true, bass: 0.07, be: 4 },
];

const TOWN_P = [
  { k: 'X' + '.'.repeat(15), kv: 0.22, h: H8, hv: 0.016, sw: 0.25 },
  { k: 'X.......x.x.....', kv: 0.25, s: '....x.......x...', sv: 0.035, h: H16, hv: 0.016, sw: 0.25, lv: 0.05 },
  { k: 'X.......x.x.....', kv: 0.26, s: '....x.......x...', sv: 0.04, h: H16, hv: 0.017, sw: 0.25, lv: 0.055, bass: 0.06, be: 8, bell: 0.04, bellNotes: [74, 81, 86] },
  { k: 'X.......x.x.x...', kv: 0.28, s: '....x.......x...', sv: 0.045, h: H16, hv: 0.018, sw: 0.25, lv: 0.06, bass: 0.065, be: 8, bell: 0.045, bellNotes: [74, 81, 86] },
  { k: 'X' + '.'.repeat(15), kv: 0.2, h: H8, hv: 0.012, sw: 0.25, lv: 0.045, once: true, rest: true, bell: 0.035, bellNotes: [81, 86] },
];

const BATTLE_P = [
  { k: KQ, kv: 0.4, h: H8, hv: 0.02, duck: true },
  { k: KQ, kv: 0.5, s: S24, sv: 0.1, h: H16, hv: 0.024, hp: 0.85, duck: true, bass: 0.085, lv: 0.06 },
  { k: 'X...X...' + 'X..xX...', kv: 0.5, s: S24, fs: FILL, sv: 0.1, h: H16, hv: 0.026, hp: 0.85, duck: true, bass: 0.09, lv: 0.07, stab: 0.03, cl: CL8, clv: 0.08, cf: [260, 420], rise: true },
  { k: 'X..xX...' + 'X..xX.x.', kv: 0.55, s: S24, fs: FILL, sv: 0.11, h: H16, hv: 0.03, hp: 0.9, duck: true, bass: 0.095, lv: 0.08, stab: 0.035, cl: CL8, clv: 0.09, cf: [260, 420] },
  { k: 'X.......X.......', kv: 0.36, h: H8, hv: 0.02, hp: 0.7, duck: true, bass: 0.08, lv: 0.06, once: true, stab: 0.025 },
];

const BOSS_P = [
  { from: 4, k: KQ, kv: 0.35, h: H8, hv: 0.016, duck: true },
  { k: KQ, kv: 0.5, s: S24, sv: 0.1, h: H16, hv: 0.022, hp: 0.9, duck: true, bass: 0.08, lv: 0.06 },
  { k: 'X...X...' + 'X..xX...', kv: 0.5, s: S24, fs: FILL, sv: 0.1, h: H16, hv: 0.025, duck: true, bass: 0.09, lv: 0.07, stab: 0.035, cl: CL8, clv: 0.09, cf: [280, 340], rise: true, bell: 0.045, bellNotes: [76, 79] },
  { k: 'X..xX...' + 'X..xX.x.', kv: 0.55, s: S24, fs: FILL, sv: 0.11, h: H16, hv: 0.03, hp: 0.9, duck: true, bass: 0.095, lv: 0.08, stab: 0.04, cl: CL8, clv: 0.1, cf: [280, 340], bell: 0.05, bellNotes: [76, 79] },
  { k: 'X.......X.......', kv: 0.36, duck: true, bass: 0.07, lv: 0.06, once: true, stab: 0.03, bell: 0.05, bellNotes: [76, 79] },
];

/** Per-track song config. st = seconds per 16th step (the track clock). */
const SONG = {
  menu: { st: 60 / 72 / 4, prog: DORIAN, motif: M_MENU, vowel: true, pats: MENU_P },
  world: { st: 60 / 84 / 4, prog: PHRYGIAN, motif: M_WORLD, pats: WORLD_P },
  town: { st: 60 / 76 / 4, prog: DORIAN, motif: M_TOWN, vowel: true, pats: TOWN_P },
  battle: { st: 60 / 124 / 4, prog: DORIAN, motif: M_BATTLE, pats: BATTLE_P },
  boss: { st: 60 / 136 / 4, prog: BOSS, motif: M_BOSS, vowel: true, pats: BOSS_P },
};

// Drive curve for the drum bus: soft tanh saturation.
const DRUM_CURVE = (() => {
  const c = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) {
    const x = (i / 1023) * 2 - 1;
    c[i] = Math.tanh(2.5 * x) / Math.tanh(2.5);
  }
  return c;
})();

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
    if (!TRACKS[id] && !ALIAS[id]) return;
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
  const def = TRACKS[id] || TRACKS[ALIAS[id]];
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
    sc: null, // pad sidechain gain (pumps on kicks)
    drumIn: null, // drum bus: saturation, then out
    leadIn: null, // lead bus: dry plus chorus, then out
    voiceOsc: null,
    formants: null,
  };
  routing(tr, t0);
  if (def.init) def.init(tr, t0 + 0.05);
  tr.timer = setInterval(() => pump(tr), TICK_MS);
  pump(tr);
  return tr;
}

/** Per-track buses: drum saturation and lead chorus (the chorus LFO counts as one voice). */
function routing(tr, t0) {
  const sat = ctx.createWaveShaper();
  sat.curve = DRUM_CURVE;
  sat.oversample = 'none';
  sat.connect(tr.out);
  tr.drumIn = sat;

  const lead = ctx.createGain();
  lead.connect(tr.out);
  const cd = ctx.createDelay(0.05);
  cd.delayTime.value = 0.018;
  lead.connect(cd);
  const cw = ctx.createGain();
  cw.gain.value = 0.5;
  cd.connect(cw).connect(tr.out);
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.6;
  const depth = ctx.createGain();
  depth.gain.value = 0.003;
  lfo.connect(depth).connect(cd.delayTime);
  hold(tr, lfo, [depth]);
  lfo.start(t0);
  tr.leadIn = lead;
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

/** Envelope gain. Goes to dest (default: the track output), and to the echo when send is set. */
function env(tr, t, peak, attack, dur, send = false, dest = null) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, attack + 0.01));
  g.connect(dest || tr.out);
  if (send) g.connect(sendBus);
  return g;
}

/** One-shot oscillator. o: {type | wave, f, f1?, dur, peak, attack?, cut?, cut1?, q?, send?, drum?} */
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
  const g = env(tr, t, o.peak ?? 0.1, o.attack ?? 0.005, o.dur, o.send, o.drum ? tr.drumIn : tr.out);
  osc.connect(fl).connect(g);
  own(osc, [fl, g]);
  osc.start(t);
  osc.stop(t + o.dur + 0.05);
}

/** One-shot filtered noise. o: {type, f, f1?, q?, dur, peak, attack?, send?, drum?} */
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
  const g = env(tr, t, o.peak ?? 0.1, o.attack ?? 0.005, o.dur, o.send, o.drum ? tr.drumIn : tr.out);
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
 * The pad passes a sidechain gain (tr.sc) that the kicks pump (duck).
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
  const sc = ctx.createGain();
  fl.connect(gain).connect(sc).connect(tr.out);
  tr.sc = sc;

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

/** Change the chord every 8–16 s, walking through the progression (cyberspace, tension). */
function cycle(tr, t, prog) {
  if (tr.st.at !== undefined && t < tr.st.at) return;
  tr.st.i = ((tr.st.i ?? -1) + 1) % prog.length;
  tr.st.chord = prog[tr.st.i];
  padChord(tr, t, tr.st.chord);
  tr.st.at = t + rr(tr, 8, 16);
}

/** Chord change on a bar boundary (songs). Same index = no-op. */
function chordAt(tr, t, prog, idx) {
  if (tr.st.ci === idx) return;
  tr.st.ci = idx;
  tr.st.chord = prog[idx];
  padChord(tr, t, prog[idx]);
}

/** Pad to a quiet level (rest) or back to full. */
function setRest(tr, t, rest) {
  if (!tr.pad || !!tr.st.rest === rest) return;
  tr.st.rest = rest;
  tr.pad.gain.gain.setTargetAtTime(tr.pad.peak * (rest ? 0.35 : 1), t, 1.2);
}

/** Sidechain: the pad dips on a kick and comes back over rel seconds. */
function duck(tr, t, depth = 0.4, rel = 0.14) {
  if (!tr.sc) return;
  const g = tr.sc.gain;
  g.linearRampToValueAtTime(1 - depth, t + 0.006);
  g.linearRampToValueAtTime(1, t + rel);
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

/** Dry industrial kick: short sine with a pitch drop, through the drum bus. */
function kick(tr, t, peak = 0.5, pitch = 110) {
  tone(tr, t, { type: 'sine', f: pitch, f1: 44, dur: 0.2, peak, attack: 0.003, cut: 500, drum: true });
}

/** Snare: bandpass noise snap plus a short triangle body (no bare waveform). */
function snare(tr, t, peak = 0.1) {
  hiss(tr, t, { type: 'bandpass', f: 1800, q: 0.9, dur: 0.16, peak, attack: 0.003, drum: true });
  tone(tr, t, { type: 'triangle', f: 190, f1: 150, dur: 0.09, peak: peak * 0.5, attack: 0.003, cut: 1500, drum: true });
}

/** Hi-hat from highpassed noise. */
function hat(tr, t, peak = 0.025) {
  hiss(tr, t, { type: 'highpass', f: 7500, q: 0.7, dur: 0.04, peak, attack: 0.003, drum: true });
}

/** Metal hit: inharmonic ring plus a short bandpass-noise transient, sent to the echo. */
function clank(tr, t, f, peak = 0.12) {
  hiss(tr, t, { type: 'bandpass', f: f * 4, q: 5, dur: 0.09, peak, attack: 0.004, send: true, drum: true });
  tone(tr, t, { type: 'sine', f, f1: f * 0.98, dur: 0.6, peak: peak * 0.45, attack: 0.004, send: true, drum: true });
  tone(tr, t, { type: 'sine', f: f * 2.76, dur: 0.25, peak: peak * 0.18, attack: 0.004, send: true, drum: true });
}

/** Bass note: triangle through a lowpass that closes, 80–200 Hz range by the caller. */
function bass(tr, t, midi, dur, peak) {
  tone(tr, t, { type: 'triangle', f: mtof(midi), dur, peak, attack: 0.006, cut: 380, cut1: 200, q: 1.5 });
}

/** Lead: two triangles 6 cents apart through a closing lowpass, into the chorus bus. */
function lead(tr, t, midi, dur, peak = 0.07) {
  if (!tr.leadIn || !room(2)) return;
  const f = mtof(midi);
  const a = ctx.createOscillator();
  a.type = 'triangle';
  a.frequency.setValueAtTime(f, t);
  const b = ctx.createOscillator();
  b.type = 'triangle';
  b.frequency.setValueAtTime(f * 1.0035, t);
  const fl = ctx.createBiquadFilter();
  fl.type = 'lowpass';
  fl.frequency.setValueAtTime(3000, t);
  fl.frequency.exponentialRampToValueAtTime(1100, t + dur);
  fl.Q.value = 0.8;
  const g = env(tr, t, peak, 0.012, dur, false, tr.leadIn);
  a.connect(fl);
  b.connect(fl);
  fl.connect(g);
  own(a, [fl, g]);
  own(b);
  a.start(t);
  b.start(t);
  a.stop(t + dur + 0.05);
  b.stop(t + dur + 0.05);
}

/** Organ stab: one organ tone per chord note. */
function organStab(tr, t, midis, dur, peak) {
  midis.forEach((m) => tone(tr, t, { wave: organWave(), f: mtof(m), dur, peak, attack: 0.02, cut: 1600, cut1: 900, q: 0.7 }));
}

/** Noise riser: bandpass sweep up over dur seconds. */
function riser(tr, t, dur) {
  hiss(tr, t, { type: 'bandpass', f: 300, f1: 5000, q: 1.2, dur, peak: 0.03, attack: 0.05 });
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

/** Radio crackle: short bandpass noise, soft attack. */
function crackle(tr, t, peak = 0.04) {
  hiss(tr, t, { type: 'bandpass', f: rr(tr, 1200, 2600), q: 2, dur: 0.18, peak, attack: 0.02 });
}

/** Soft timer tick: sine with a 8 ms attack (no click). */
function tick(tr, t, f, peak = 0.03) {
  tone(tr, t, { type: 'sine', f, dur: 0.06, peak, attack: 0.008, cut: 4000 });
}

// ---------- song engine ----------

const SEC = (b) => (b < 8 ? 0 : b < 20 ? 1 : b < 28 ? 2 : b < 40 ? 3 : 4);
const TICK_EVERY = [8, 4, 2, 2];
const vel = (c) => (c === 'X' ? 1 : 0.7);
const bassOf = (chord) => (chord[0] > 51 ? chord[0] - 12 : chord[0]);

/** Bar index inside the cycle. On a new cycle, pick a seeded transposition for the melody. */
function barOf(tr, s, cyc) {
  const bar = Math.floor(s / 16);
  const c = Math.floor(bar / cyc);
  if (tr.st.cyc !== c) {
    tr.st.cyc = c;
    tr.st.shift = c === 0 ? 0 : pick(tr, [0, 0, 2, -2, 5]);
  }
  return bar % cyc;
}

/** Melody for this bar: the motif on the chord root, inverted in bar 3 of each 4-bar phrase. */
function phrase(tr, b, base, motif) {
  const inv = b % 4 === 2 ? -1 : 1;
  tr.st.notes = motif.map((n) => [base + tr.st.shift + inv * n[0], n[1], n[2]]);
}

function melody(tr, t, pos, st, peak) {
  const ns = tr.st.notes;
  if (!ns) return;
  for (const n of ns) {
    if (n[1] === pos) lead(tr, t, n[0], n[2] * st * 0.92, peak);
  }
}

/** Drums for one 16th: kick, snare (fill in the second half of a bar), hats (swing on odd steps), metal. */
function drumStep(tr, t, pos, st, p, fill) {
  const kc = p.k ? p.k[pos] : '.';
  if (kc !== '.') {
    kick(tr, t, (p.kv ?? 0.4) * vel(kc), p.kf ?? 95);
    if (p.duck) duck(tr, t);
  }
  const sp = fill && p.fs ? p.fs : p.s;
  const sc = sp ? sp[pos] : '.';
  if (sc !== '.') snare(tr, t, (p.sv ?? 0.1) * vel(sc));
  const hc = p.h ? p.h[pos] : '.';
  if (hc !== '.' && (p.hp === undefined || chance(tr, p.hp))) {
    hat(tr, t + (pos % 2 === 1 ? (p.sw ?? 0) * st : 0), (p.hv ?? 0.025) * vel(hc));
  }
  const cc = p.cl ? p.cl[pos] : '.';
  if (cc !== '.' && chance(tr, 0.7)) clank(tr, t, rr(tr, p.cf[0], p.cf[1]), (p.clv ?? 0.08) * vel(cc));
}

/** Melody, bass, organ stabs, bells and risers for one 16th. */
function layers(tr, t, pos, b, p, cfg) {
  const st = cfg.st;
  if (p.lv && tr.st.notes && (!p.once || b % 4 === 0)) melody(tr, t, pos, st, p.lv);
  const be = p.be ?? 2;
  if (p.bass && pos % be === 0) {
    bass(tr, t, bassOf(tr.st.chord) + BASS_B[b % 4][pos / be], st * be * 0.9, p.bass);
  }
  if (p.stab && (pos === 0 || pos === 8)) organStab(tr, t, tr.st.chord.slice(0, 3), st * 6, p.stab);
  if (p.bell && pos === 0 && b % 4 === 2) fmBell(tr, t, mtof(pick(tr, p.bellNotes)), p.bell);
  if (p.rise && pos === 0 && b % 4 === 0) riser(tr, t, st * 32);
}

/** One 16th of a song track. Returns the step length in seconds. */
function songStep(tr, t, cfg) {
  const s = tr.step;
  const pos = s % 16;
  const b = barOf(tr, s, CYC);
  const p = cfg.pats[SEC(b)];
  if (pos === 0) {
    if (b % 4 === 0) chordAt(tr, t, cfg.prog, Math.floor(b / 4) % cfg.prog.length);
    if (cfg.motif) phrase(tr, b, tr.st.chord[0] + 12, cfg.motif);
    if (cfg.vowel && b % 8 === 4) vowel(tr, t, chance(tr, 0.5) ? 'a' : 'o');
    if (chance(tr, 0.04)) crackle(tr, t, 0.03);
  }
  setRest(tr, t, !!p.rest);
  if (b >= (p.from ?? 0)) drumStep(tr, t, pos, cfg.st, p, b % 4 === 3);
  layers(tr, t, pos, b, p, cfg);
  return cfg.st;
}

// ---------- tracks ----------

const TRACKS = {
  // Rogue Trader: organ and choir pad, lead motif on triangle with chorus, FM bells. No drums.
  menu: {
    init(tr, t) {
      pad(tr, t, { wave: 'organ', n: 3, peak: 0.05, cut: 1300, lfo: 0.05, depth: 280, attack: 4, chord: DORIAN[0] });
      choir(tr, t, DORIAN[0], 0.02);
    },
    gen(tr, t) {
      return songStep(tr, t, SONG.menu);
    },
  },

  // Quasimorph map: dark filtered pad, dry kicks on the beat, hats from noise, metal hits, walking bass.
  world: {
    init(tr, t) {
      pad(tr, t, { wave: 'triangle', n: 3, peak: 0.04, cut: 900, lfo: 0.07, depth: 200, attack: 3, chord: PHRYGIAN[0] });
    },
    gen(tr, t) {
      return songStep(tr, t, SONG.world);
    },
  },

  // Rogue Trader city: warm organ and choir, soft swung groove, rim, lead and bells. Quiet fall.
  town: {
    init(tr, t) {
      pad(tr, t, { wave: 'organ', n: 3, peak: 0.045, cut: 1100, lfo: 0.04, depth: 250, attack: 4, chord: DORIAN[0] });
      choir(tr, t, DORIAN[0], 0.018);
    },
    gen(tr, t) {
      return songStep(tr, t, SONG.town);
    },
  },

  // Quasimorph combat: 124 BPM, kick on every beat, snare on 2 and 4, 16th hats, sidechained pad,
  // bass and lead, organ stabs on the strong beats, snare rolls and metal in the lift and climax.
  battle: {
    init(tr, t) {
      pad(tr, t, { wave: 'triangle', n: 2, peak: 0.03, cut: 800, lfo: 0.1, depth: 160, attack: 3, chord: DORIAN[0] });
    },
    gen(tr, t) {
      return songStep(tr, t, SONG.battle);
    },
  },

  // Rogue Trader boss: 136 BPM, choir and organ over a tritone progression, driving kicks, rising
  // riser, FM bell and organ stabs. The intro is choir only.
  boss: {
    init(tr, t) {
      pad(tr, t, { wave: 'organ', n: 3, peak: 0.055, cut: 1000, lfo: 0.08, depth: 300, attack: 2, chord: BOSS[0] });
      choir(tr, t, BOSS[0], 0.022);
    },
    gen(tr, t) {
      return songStep(tr, t, SONG.boss);
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

  // Last timer mark: fifths only (no beating). Stages 0–3 speed the clock up, add kicks, hats and metal.
  tension: {
    init(tr, t) {
      pad(tr, t, { wave: 'sine', n: 2, peak: 0.035, cut: 700, lfo: 0.05, depth: 120, attack: 4, detune: 0, chord: TENSE[0] });
    },
    gen(tr, t) {
      const k = Math.min(3, Math.floor(tr.step / 128));
      const st = S(96 + 8 * k, 4);
      const pos = tr.step % 16;
      cycle(tr, t, TENSE);
      if (pos === 0 || (k >= 1 && pos === 8)) kick(tr, t, 0.4 - 0.05 * k, 70);
      if (k >= 1 && (pos === 4 || pos === 12)) kick(tr, t, 0.2, 60);
      if (k >= 2 && pos % 2 === 0) hat(tr, t, 0.012 + 0.004 * k);
      if (pos % TICK_EVERY[k] === 0) tick(tr, t, mtof(84 + 2 * k), 0.025);
      if (k >= 2 && pos === 0 && chance(tr, 0.25)) clank(tr, t, rr(tr, 500, 700), 0.06);
      return st;
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
