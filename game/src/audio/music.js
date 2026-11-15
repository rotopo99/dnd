// music.js — game music: procedural WebAudio orchestration (no samples, no files).
// Shares AudioContext and masterGain with sfx.js. Nothing plays before the first user gesture.
//
//   import { playTrack, stopMusic, setMusicVolume, setIntensity } from './audio/music.js';
//   playTrack('menu');                            // crossfade 1.5 s (clamped to 1–2 s)
//   playTrack('battle', { seed: 42 });            // seed = reproducible variation
//   playTrack('town', { leit: [0, 3, 7, 10] });   // faction leitmotif: 4 semitone offsets from the chord root
//   setIntensity(0.8);                            // dynamic tracks (battle, boss, boss-final): 0..1, from the next bar
//   stopMusic(1500);  setMusicVolume(0.6);
//
// Orchestra: string section (detuned saws, lowpass that opens on a slow bow attack), brass (saw pair through
// a resonant lowpass with an envelope: "брр"), FM keys, celesta and bells, organ, formant choir,
// Karplus–Strong plucks (balalaika, guitar), reed (garmon: square through a swept bandpass), bass (sub plus
// lowpass saw), drums (kick, taiko, snare, hats, cymbal, industrial anvil, glitch). Reverb: procedural IR.
// Delay: one feedback line into the music bus. Drums: saturation and compressor. Music bus: light tanh.
//
// Form: a track is a list of sections (bars, pads, drum pattern, bass pattern, melody style, layer flags).
// The melody is a 4-bar question; bars 4–7 are the answer made from it, ending on the tonic. Each new cycle
// picks a seeded transposition. Bars are scheduled one bar ahead (lookahead 0.15 s, timer 25 ms).
//
// Layers (dynamic tracks): 1 drums always, 2 bass at intensity ≥ 0.25, 3 melody and reed at ≥ 0.5,
// 4 choir, brass stabs and strings at full level at ≥ 0.75.
//
// Voices: MAX_VOICES = 32 sources across both crossfading tracks. Priority: melody 4 > bass 3 > drums 2 >
// pads 1. A full bus lets a note steal the lowest-priority non-permanent voice below its own priority; when
// nothing can be stolen the note is dropped. Pads are permanent and cannot be stolen. Every source disconnects
// itself when it ends, and the track disconnects its own nodes on retire.
//
// Where to call: see the comment at the end of this file.

import { initAudio, getAudioContext, getNoiseBuffer, masterGain } from './sfx.js';
import { getBusVolume, setBusVolume } from './core.js';

const MAX_VOICES = 32;
const PRIO = { pad: 1, drum: 2, bass: 3, mel: 4 };
const MUSIC_MAX = 0.36; // music under SFX: about −13 dB at default volume (0.6 × 0.36 ≈ 0.22)
const LOOKAHEAD = 0.15; // s planned ahead
const TICK_MS = 25;
const FADE_MIN = 1000;
const FADE_MAX = 2000;
const FADE_DEFAULT = 1500;
const HALL_S = 3.6; // s, reverb impulse length
const HALL_WET = 0.4;
const GESTURES = ['pointerdown', 'keydown', 'touchstart', 'mousedown'];
const LAYER_I = [0.25, 0.5, 0.75]; // intensity needed for layers 2, 3, 4
const SHIFTS = [0, 0, 2, -2, 5]; // seeded transposition per cycle
const REV = { drum: 0.15, mel: 0.35, pad: 0.5, bass: 0, fx: 0.6 }; // reverb send per kind
const VOWEL = { a: [800, 1150, 2900], o: [450, 800, 2830], u: [325, 700, 2530], e: [500, 1700, 2500] };
const VSEQ = ['a', 'o', 'u', 'o']; // choir vowel per two bars
const BI = { R: 0, F: 7, O: 12, S: 10, D: 5 }; // bass steps: root, fifth, octave, minor 7th, fourth
const NOOP = () => {};

// ---------- chords (MIDI) ----------
const DM7 = [50, 57, 60, 65];
const BB7 = [46, 53, 57, 60];
const GM7 = [43, 50, 55, 58];
const AM7 = [45, 52, 57, 60];
const EM = [52, 59, 64, 67];
const EMF = [52, 59, 64, 65]; // Em with F: phrygian pull
const FM = [53, 57, 60, 64];
const BBD = [46, 53, 58, 61]; // Bb with Db
const CM = [48, 55, 59, 64];
const FINAL = [
  [50, 57, 62, 65],
  [46, 53, 58, 62],
  [48, 53, 57, 60],
  [48, 55, 60, 64],
];
const ROM = [FM, [52, 55, 59, 62], [50, 53, 57, 60], [55, 59, 62, 65]];
const TRAG = [[57, 60, 64, 69], FM, [50, 57, 62, 65], [52, 56, 59, 62]];
const CYBER = [[50, 57, 60, 64], [48, 55, 58, 62]];
const TENSE = [[50, 57], [48, 55]];
const LOCRIAN = [[50, 56, 59, 62], [48, 54, 57, 60], [49, 56, 59, 62], [50, 56, 59, 62]];

// ---------- drum patterns: 16 chars per step, X accent, x normal, o open hat, '.' none ----------
const DR = {
  drive: { k: 'X..xX...X..xX.x.', s: '....X.......X...', f: '........xxxxxxxx', h: 'x.x.x.x.x.x.x.x.', a: '....x.......x...' },
  taiko: { t: 'X.......X.......', k: '..x.....x.......', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.' },
  anvil: { k: 'X..xX...X..xX.x.', s: '....X.......X...', f: '........xxxxxxxx', a: 'X.x.x.x.x.x.x.x.', t: 'X.......' },
  trek: { k: 'X...x...X...x...', s: '....x.......x...', h: '..x...x...x...x.', c: 'x.......' },
  grove: { k: 'X.......x.x.....', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', c: 'X.......', a: '......x.......x.' },
  base: { k: 'X.......X.......', s: '....x.......x...', h: 'x...x...x...x...' },
  pulse: { k: 'X...X...X...X...', h: 'x.x.x.x.x.x.x.x.', g: 'x.......x.......' },
  tense: { k: 'X.x.....X.x.....', g: 'x.......x.......' },
  cyber: { k: 'X...X...X...X...', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', g: 'x..x.x..x.x..x.x' },
  lounge: { k: '....X.......x...', s: '..x...x...x...x.', h: '..x...x...x...x.', c: 'X...X...X...X...' },
  cult: { t: 'X.......X.......' },
};

// ---------- track configs ----------
// m: 4-bar question melody, notes [offset from chord root + 12, start 16th, length 16ths].
// secs: sections [{ n: bars, d: drum pattern, b: bass steps (16 chars: R F O S D), str/org/cho: pad levels 0..1,
// m: melody on, ms: melody style override, pw: pluck buffer, pl: plucked arpeggio, rd: reed chord,
// bl: bell, br: brass stabs, fill: snare roll on bar 4 of each group }].
// Styles: str, brass, reed, pluck, key, bell.
const CFG = {};

function expandMel(m4) {
  const out = m4.slice();
  for (let i = 0; i < 4; i++) out.push(m4[i].map(([d, s, l]) => [d + (i % 2 ? -4 : 5), s, l]));
  const last = out[7];
  if (last.length) last[last.length - 1] = [0, last[last.length - 1][1], last[last.length - 1][2]];
  return out;
}

function mk(id, c) {
  const map = [];
  c.secs.forEach((s) => {
    for (let i = 0; i < s.n; i++) map.push(s);
  });
  CFG[id] = { ...c, cyc: map.length, map, st: 60 / c.bpm / 4, mel8: expandMel(c.m) };
}

const S = (n, o = {}) => ({ n, ...o });

mk('menu', {
  bpm: 72, prog: [DM7, BB7, GM7, AM7], ms: 'str', mv: 0.075, pads: { str: 0.06, org: 0.04, cho: 0.035 },
  m: [
    [[7, 0, 4], [10, 4, 4], [12, 8, 8]],
    [[7, 0, 4], [5, 4, 4], [4, 8, 8]],
    [[3, 0, 4], [2, 4, 4], [0, 8, 8]],
    [[4, 0, 4], [7, 4, 4], [9, 8, 4], [4, 12, 4]],
  ],
  secs: [
    S(8, { str: 0.4, org: 0.6 }),
    S(12, { str: 0.6, org: 0.4, cho: 0.3, m: 1 }),
    S(8, { str: 0.8, org: 0.5, cho: 0.6, m: 1, bl: 1 }),
    S(12, { str: 1, org: 0.6, cho: 1, m: 1, ms: 'brass', bl: 1, br: 1 }),
    S(8, { str: 0.4, org: 0.5, cho: 0.2, m: 1, ms: 'str' }),
  ],
});

mk('world', {
  bpm: 84, prog: [EM, FM, EM, FM], ms: 'pluck', pw: 'bal', mv: 0.06, pads: { str: 0.05, org: 0.02 }, dv: 0.8,
  m: [
    [[0, 0, 3], [1, 3, 1], [3, 4, 2], [7, 6, 4]],
    [[5, 0, 2], [3, 2, 2], [1, 4, 4], [0, 8, 8]],
    [[0, 0, 3], [1, 3, 1], [3, 4, 2], [5, 6, 4]],
    [[7, 0, 4], [5, 4, 4], [3, 8, 4], [1, 12, 4]],
  ],
  secs: [
    S(8, { str: 0.5, d: 'trek', b: 'R.......R.......', pl: 1 }),
    S(12, { str: 0.6, d: 'trek', b: 'R...R...F...R...', pl: 1, m: 1, rd: 1 }),
    S(8, { str: 0.5, d: 'trek', b: 'R...R...F...R...', pl: 1, m: 1, rd: 1 }),
    S(12, { str: 0.7, d: 'trek', b: 'R.R.F.R.R.R.F.R.', m: 1, rd: 1, fill: 1, ms: 'reed' }),
    S(8, { str: 0.3, pl: 1, m: 1 }),
  ],
});

mk('town', {
  bpm: 76, prog: [DM7, BB7, GM7, AM7], ms: 'key', mv: 0.055, pads: { str: 0.045, org: 0.03 }, dv: 0.9, pw: 'guit',
  m: [
    [[0, 0, 4], [2, 4, 2], [3, 6, 2], [7, 8, 4]],
    [[5, 0, 4], [3, 4, 2], [2, 6, 2], [0, 8, 8]],
    [[0, 0, 4], [2, 4, 2], [3, 6, 2], [7, 8, 4]],
    [[5, 0, 2], [3, 2, 2], [2, 4, 2], [0, 6, 10]],
  ],
  secs: [
    S(8, { str: 0.4, d: 'grove', b: 'R.......F.......', pl: 1 }),
    S(12, { str: 0.5, d: 'grove', b: 'R...F...R...F...', pl: 1, m: 1 }),
    S(12, { str: 0.5, d: 'grove', b: 'R...F...R...F...', m: 1, bl: 1 }),
    S(8, { str: 0.5, d: 'grove', b: 'R.R.F.R.R.R.F.R.', m: 1, bl: 1 }),
    S(8, { str: 0.3, m: 1, ms: 'str' }),
  ],
});

mk('battle', {
  bpm: 124, prog: [EM, BBD, DM7, CM], ms: 'brass', mv: 0.07, pads: { str: 0.05, cho: 0.035 }, dv: 1.1, dyn: true,
  m: [
    [[0, 0, 2], [3, 2, 2], [7, 4, 2], [10, 6, 2], [7, 8, 4]],
    [[5, 0, 2], [7, 2, 2], [10, 4, 2], [12, 6, 2], [10, 8, 4]],
    [[0, 0, 2], [3, 2, 2], [7, 4, 2], [10, 6, 2], [7, 8, 4]],
    [[5, 0, 4], [3, 4, 4], [0, 8, 8]],
  ],
  secs: [
    S(4, { d: 'drive' }),
    S(8, { d: 'drive', b: 'R.R.F.R.R.R.F.R.', m: 1, str: 0.3 }),
    S(8, { d: 'drive', fill: 1, b: 'R.R.F.R.R.R.F.R.', m: 1, str: 0.5, cho: 0.5, br: 1 }),
    S(8, { d: 'drive', b: 'R.R.R.R.R.R.R.R.', m: 1, br: 1, fill: 1, cho: 0.7 }),
    S(4, { d: 'drive', m: 1, str: 0.3 }),
  ],
});

mk('boss', {
  bpm: 136, prog: [EMF, BBD, DM7, EMF], ms: 'brass', mv: 0.075, pads: { str: 0.06, org: 0.05, cho: 0.05 }, dv: 1.1, dyn: true,
  m: [
    [[0, 0, 4], [1, 4, 2], [7, 6, 2], [6, 8, 4]],
    [[3, 0, 4], [1, 4, 2], [0, 6, 2], [-1, 8, 8]],
    [[0, 0, 4], [1, 4, 2], [7, 6, 2], [6, 8, 4]],
    [[3, 0, 2], [1, 2, 2], [0, 4, 4], [-2, 8, 8]],
  ],
  secs: [
    S(8, { d: 'taiko', org: 0.5, cho: 0.3, str: 0.2 }),
    S(8, { d: 'taiko', b: 'R...R...R...R...', org: 0.5, m: 1, cho: 0.5, str: 0.4 }),
    S(8, { d: 'drive', b: 'R.R.R.R.F.R.R.R.', m: 1, br: 1, cho: 0.8, org: 0.4, fill: 1, str: 0.6 }),
    S(8, { d: 'taiko', b: 'R.R.R.R.R.R.R.R.', m: 1, br: 1, cho: 1, org: 0.6, fill: 1, str: 0.8, bl: 1 }),
    S(4, { org: 0.4, cho: 0.4 }),
  ],
});

mk('boss-final', {
  bpm: 138, prog: FINAL, ms: 'brass', mv: 0.08, pads: { str: 0.06, org: 0.06, cho: 0.09 }, dv: 1.2, dyn: true,
  m: [
    [[0, 0, 4], [3, 4, 2], [5, 6, 2], [7, 8, 8]],
    [[7, 0, 4], [5, 4, 2], [3, 6, 2], [2, 8, 8]],
    [[0, 0, 2], [3, 2, 2], [5, 4, 2], [7, 6, 2], [12, 8, 8]],
    [[10, 0, 4], [7, 4, 4], [5, 8, 8]],
  ],
  secs: [
    S(8, { org: 0.6, cho: 0.6, str: 0.3 }),
    S(8, { d: 'taiko', b: 'R...R...R...R...', org: 0.5, cho: 0.7, m: 1, str: 0.5 }),
    S(8, { d: 'anvil', b: 'R.R.F.R.R.R.F.R.', m: 1, br: 1, cho: 1, org: 0.7, str: 0.7, fill: 1, bl: 1 }),
    S(8, { d: 'anvil', b: 'R.R.R.R.R.R.R.R.', m: 1, ms: 'brass', br: 1, cho: 1, org: 0.8, str: 0.9, fill: 1, bl: 1 }),
    S(8, { d: 'taiko', m: 1, cho: 1, org: 0.8, str: 0.5, ms: 'str' }),
  ],
});

mk('cyberspace', {
  bpm: 110, prog: [CYBER[0], CYBER[1], CYBER[0], CYBER[1]], ms: 'key', mv: 0.06, pads: { str: 0.05 }, dv: 0.9,
  m: [
    [[0, 0, 2], [4, 2, 2], [7, 4, 4], [12, 8, 8]],
    [[7, 0, 2], [5, 2, 2], [4, 4, 4], [0, 8, 8]],
    [[0, 0, 2], [4, 2, 2], [7, 4, 4], [11, 8, 8]],
    [[12, 0, 4], [7, 4, 4], [4, 8, 8]],
  ],
  secs: [
    S(8, { d: 'cyber', str: 0.6 }),
    S(12, { d: 'cyber', b: 'R.....R...R.R...', str: 0.5, m: 1 }),
    S(12, { d: 'cyber', b: 'R.R.R.R.R.R.R.R.', str: 0.7, m: 1, fill: 1 }),
    S(8, { d: 'cyber', str: 0.4, m: 1, ms: 'bell' }),
  ],
});

mk('tension', {
  bpm: 96, prog: TENSE, ms: 'bell', mv: 0.05, pads: { str: 0.03, org: 0.03 }, dv: 0.9,
  m: [[[0, 4, 2]], [[0, 4, 2], [-2, 12, 2]], [[7, 0, 2]], [[3, 6, 2]]],
  secs: [
    S(8, { d: 'tense', str: 0.3, org: 0.3 }),
    S(12, { d: 'tense', str: 0.4, org: 0.4, m: 1 }),
    S(12, { d: 'tense', str: 0.5, org: 0.4, m: 1, ms: 'bell' }),
    S(8, { d: 'tense', str: 0.3, org: 0.2, m: 1 }),
  ],
});

mk('romance', {
  bpm: 70, prog: ROM, ms: 'key', mv: 0.055, pads: { str: 0.05, org: 0.02 },
  m: [
    [[4, 0, 6], [2, 8, 4], [0, 12, 4]],
    [[7, 0, 6], [3, 8, 4], [0, 12, 4]],
    [[7, 0, 4], [10, 4, 4], [7, 8, 4], [3, 12, 4]],
    [[4, 0, 4], [7, 4, 4], [10, 8, 4], [7, 12, 4]],
  ],
  secs: [
    S(8, { str: 0.6, org: 0.2 }),
    S(12, { str: 0.7, org: 0.2, m: 1, ms: 'key' }),
    S(12, { str: 0.8, org: 0.3, m: 1, ms: 'str' }),
    S(8, { str: 0.6, org: 0.2, m: 1, ms: 'key' }),
  ],
});

mk('tragic', {
  bpm: 60, prog: TRAG, ms: 'reed', mv: 0.05, pads: { str: 0.045, cho: 0.02 },
  m: [
    [[0, 0, 8], [-2, 8, 8]],
    [[0, 0, 4], [2, 4, 4], [0, 8, 8]],
    [[4, 0, 8], [2, 8, 8]],
    [[0, 0, 8], [-2, 8, 8]],
  ],
  secs: [
    S(8, { str: 0.5 }),
    S(16, { str: 0.6, m: 1, cho: 0.3, ms: 'reed' }),
    S(16, { str: 0.4, m: 1, ms: 'bell' }),
  ],
});

mk('card-game', {
  bpm: 104, prog: [[50, 57, 60, 64], [43, 50, 53, 57], [48, 55, 58, 62], [45, 52, 55, 59]], ms: 'key', mv: 0.055,
  pads: { str: 0.03, org: 0.02 }, dv: 0.8, pw: 'guit',
  m: [
    [[0, 0, 2], [4, 2, 2], [7, 4, 2], [10, 6, 2], [12, 8, 4], [10, 12, 4]],
    [[3, 0, 2], [7, 2, 2], [10, 4, 2], [12, 6, 2], [14, 8, 8]],
    [[0, 0, 4], [2, 4, 4], [4, 8, 4], [0, 12, 4]],
    [[-3, 0, 4], [0, 4, 4], [4, 8, 8]],
  ],
  secs: [
    S(8, { d: 'lounge', b: 'R...F...R...F...', str: 0.2 }),
    S(12, { d: 'lounge', b: 'R.F.R.F.R.F.R.F.', m: 1, ms: 'key', str: 0.3, br: 1 }),
    S(8, { d: 'lounge', b: 'R.F.R.F.S.F.R.F.', m: 1, ms: 'brass', br: 1, bl: 1, fill: 1 }),
  ],
});

mk('casino', {
  bpm: 112, prog: [CM, [45, 52, 55, 60], [41, 48, 52, 57], [43, 50, 55, 59]], ms: 'brass', mv: 0.055,
  pads: { str: 0.04 }, dv: 0.9,
  m: [
    [[0, 0, 2], [4, 2, 2], [7, 4, 4], [4, 8, 2], [2, 10, 2], [0, 12, 4]],
    [[0, 0, 4], [4, 4, 2], [7, 6, 2], [9, 8, 8]],
    [[4, 0, 2], [5, 2, 2], [7, 4, 4], [9, 8, 8]],
    [[7, 0, 4], [4, 4, 2], [2, 6, 2], [0, 8, 8]],
  ],
  secs: [
    S(8, { d: 'lounge', b: 'R...F...R...F...', str: 0.3 }),
    S(12, { d: 'lounge', b: 'R.F.R.F.R.F.R.F.', m: 1, br: 1, str: 0.3, bl: 1 }),
    S(8, { d: 'lounge', b: 'R.F.R.F.S.F.R.F.', m: 1, br: 1, fill: 1, ms: 'key' }),
  ],
});

mk('base', {
  bpm: 92, prog: [DM7, FM, BB7, AM7], ms: 'pluck', pw: 'guit', mv: 0.06, pads: { str: 0.035, org: 0.02 }, dv: 0.7,
  m: [
    [[0, 0, 4], [4, 4, 4], [7, 8, 8]],
    [[5, 0, 4], [7, 4, 4], [9, 8, 8]],
    [[7, 0, 4], [4, 4, 4], [0, 8, 8]],
    [[0, 0, 4], [2, 4, 4], [4, 8, 8]],
  ],
  secs: [
    S(8, { str: 0.5, org: 0.3, d: 'base', pl: 1 }),
    S(16, { str: 0.4, d: 'base', b: 'R.......F.......', pl: 1, m: 1 }),
    S(8, { str: 0.5, org: 0.3, d: 'base', b: 'R...R...F...R...', m: 1, bl: 1 }),
  ],
});

mk('cult', {
  bpm: 60, prog: LOCRIAN, ms: 'bell', mv: 0.05, pads: { org: 0.05, cho: 0.06, str: 0.02 }, dv: 1.1,
  m: [
    [[0, 0, 8], [-2, 8, 8]],
    [[3, 0, 8], [-1, 8, 8]],
    [[0, 0, 4], [-2, 4, 4], [-4, 8, 8]],
    [[6, 0, 8], [0, 8, 8]],
  ],
  secs: [
    S(8, { d: 'cult', org: 0.8, cho: 0.6 }),
    S(16, { d: 'cult', org: 0.7, cho: 0.8, bl: 1, m: 1 }),
    S(8, { d: 'cult', org: 0.6, cho: 1, m: 1, ms: 'bell', b: 'R...............' }),
  ],
});

mk('roguelike-map', {
  bpm: 100, prog: [[50, 57, 60, 64], [46, 53, 57, 60]], ms: 'pluck', pw: 'bal', mv: 0.05, pads: { str: 0.03 }, dv: 0.7,
  m: [
    [[0, 0, 2], [7, 4, 2], [12, 8, 2], [7, 12, 2]],
    [[0, 0, 2], [7, 4, 2], [12, 8, 2], [7, 12, 2]],
    [[5, 0, 2], [9, 4, 2], [12, 8, 2], [9, 12, 2]],
    [[3, 0, 2], [7, 4, 2], [10, 8, 2], [7, 12, 2]],
  ],
  secs: [
    S(16, { d: 'pulse', str: 0.4, pl: 1, m: 1 }),
    S(16, { d: 'pulse', str: 0.5, pl: 1, m: 1, b: 'R...R...R...R...' }),
    S(16, { d: 'pulse', str: 0.3, pl: 1, m: 1, bl: 1 }),
  ],
});

const TRACK_IDS_LIST = Object.keys(CFG);

// Drive curves: drum bus (tanh 2.5) and light music bus saturation (tanh 1.3).
function curve(k) {
  const c = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) {
    const x = (i / 1023) * 2 - 1;
    c[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return c;
}
const DRUM_CURVE = curve(2.5);
const BUS_CURVE = curve(1.3);

let ctx = null;
let musicBus = null;
let revIn = null; // reverb input (sends from every track)
let dlyIn = null; // delay input (sends from melody and fx)
let KS = null; // Karplus–Strong buffers: { bal, guit } = { buf, f0 }
let volume = getBusVolume('music'); // saved in localStorage via core.js (default 0.6)
let count = 0; // live sources (both tracks)
const live = []; // { prio, end, n, perm, kill }
let current = null; // running track
let wanted = null; // requested but not yet started (no context yet)
let hooked = false;
let ORG = null; // PeriodicWave for the organ timbre
let ORG_CTX = null;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

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
const rr = (tr, a, b) => a + tr.rnd() * (b - a);

// ---------- context, impulse responses, Karplus–Strong tables ----------

/** Synthetic hall: decaying noise, darker as it goes, 18 ms pre-delay. */
function makeIR(c, seconds) {
  const sr = c.sampleRate;
  const len = Math.floor(sr * seconds);
  const pre = Math.floor(sr * 0.018);
  const buf = c.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const x = (i - pre) / (len - pre);
      lp += (Math.random() * 2 - 1 - lp) * (0.6 - 0.45 * x);
      d[i] = lp * Math.exp(-6.9 * x); // about −60 dB at the end
    }
  }
  return buf;
}

/** Karplus–Strong string rendered once: noise in a loop with a lowpass average. f0 = pitch of the loop. */
function makeKS(c, f, seconds, damp) {
  const sr = c.sampleRate;
  const n = Math.max(2, Math.round(sr / f));
  const len = Math.floor(sr * seconds);
  const buf = c.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  const line = new Float32Array(n);
  for (let i = 0; i < n; i++) line[i] = Math.random() * 2 - 1;
  let p = 0;
  let prev = 0;
  for (let i = 0; i < len; i++) {
    const cur = line[p];
    d[i] = cur;
    line[p] = damp * 0.5 * (cur + prev);
    prev = cur;
    p = p + 1 === n ? 0 : p + 1;
  }
  return { buf, f0: sr / n };
}

function ensure() {
  if (ctx && musicBus) return true;
  try {
    const c = getAudioContext();
    if (!c || !masterGain) return false;
    ctx = c;
    musicBus = ctx.createGain();
    musicBus.gain.value = volume * MUSIC_MAX;
    const sh = ctx.createWaveShaper();
    sh.curve = BUS_CURVE;
    sh.oversample = 'none';
    musicBus.connect(sh);
    sh.connect(masterGain);

    // space: one hall for every track; its output goes through the music bus volume
    revIn = ctx.createGain();
    const conv = ctx.createConvolver();
    conv.buffer = makeIR(ctx, HALL_S);
    const rw = ctx.createGain();
    rw.gain.value = HALL_WET;
    revIn.connect(conv);
    conv.connect(rw);
    rw.connect(musicBus);

    // delay: one low-passed feedback line, 375 ms
    dlyIn = ctx.createGain();
    const dl = ctx.createDelay(1);
    dl.delayTime.value = 0.375;
    const dlp = ctx.createBiquadFilter();
    dlp.type = 'lowpass';
    dlp.frequency.value = 3200;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const dout = ctx.createGain();
    dout.gain.value = 0.3;
    dlyIn.connect(dl);
    dl.connect(dlp);
    dlp.connect(fb);
    fb.connect(dl);
    dl.connect(dout);
    dout.connect(musicBus);

    KS = { bal: makeKS(ctx, 220, 1.8, 0.994), guit: makeKS(ctx, 196, 2.6, 0.997) };
    return true;
  } catch {
    ctx = null;
    musicBus = null;
    revIn = null;
    dlyIn = null;
    KS = null;
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
    if (!CFG[id]) return;
    if (!Number.isFinite(opts.seed) && current && current.id === id) return;
    const fade = clamp(Number.isFinite(opts.fade) ? opts.fade : FADE_DEFAULT, FADE_MIN, FADE_MAX);
    const seed = Number.isFinite(opts.seed) ? opts.seed >>> 0 : (Math.random() * 0xffffffff) >>> 0;
    const leit = Array.isArray(opts.leit) && opts.leit.length >= 4 ? opts.leit.slice(0, 4).map(Number) : null;
    wanted = { id, seed, fade, leit };
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
  setBusVolume('music', volume); // persist the level (core.js mix)
  try {
    if (ctx && musicBus) musicBus.gain.setTargetAtTime(volume * MUSIC_MAX, ctx.currentTime, 0.05);
  } catch {
    /* ignore */
  }
}

/** Layer intensity 0..1 for dynamic tracks (battle, boss, boss-final). Applies from the next bar. */
export function setIntensity(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || !current || current.dead) return;
  current.intensity = clamp(n, 0, 1);
}

/** Debug / playtest: current track, live source count, intensity. */
export function getMusicState() {
  return { track: current ? current.id : null, voices: count, max: MAX_VOICES, intensity: current ? current.intensity : null };
}

// ---------- track lifecycle ----------

function startWanted() {
  if (!wanted || !ensure()) return;
  const w = wanted;
  wanted = null;
  const t0 = ctx.currentTime;
  const fadeS = w.fade / 1000;
  const old = current;
  current = startTrack(w.id, w.seed, t0, fadeS, w.leit);
  if (old) retire(old, fadeS);
}

function startTrack(id, seed, t0, fadeS, leit) {
  const cfg = CFG[id];
  const out = ctx.createGain();
  out.gain.setValueAtTime(0, t0);
  out.gain.linearRampToValueAtTime(1, t0 + fadeS);
  out.connect(musicBus);
  const tr = {
    id,
    cfg,
    out,
    nodes: [out],
    in: {},
    pads: {},
    perm: [],
    sc: null,
    lv: {},
    rnd: mulberry(seed),
    bar: 0,
    cy: -1,
    shift: 0,
    chord: null,
    intensity: cfg.dyn ? 0.5 : 1,
    leit,
    nextT: t0 + 0.05,
    timer: 0,
    dead: false,
  };
  routing(tr);
  makePads(tr, t0 + 0.05, cfg.prog[0]);
  tr.timer = setInterval(() => pump(tr), TICK_MS);
  pump(tr);
  return tr;
}

/** Per-kind inputs: drums go through saturation and a compressor; each kind has a reverb send. */
function routing(tr) {
  for (const k of Object.keys(REV)) {
    let head;
    let outN;
    if (k === 'drum') {
      const sat = ctx.createWaveShaper();
      sat.curve = DRUM_CURVE;
      sat.oversample = 'none';
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -20;
      comp.knee.value = 6;
      comp.ratio.value = 4;
      comp.attack.value = 0.004;
      comp.release.value = 0.12;
      outN = ctx.createGain();
      outN.gain.value = 0.9;
      sat.connect(comp);
      comp.connect(outN);
      head = sat;
      tr.nodes.push(sat, comp, outN);
    } else {
      head = ctx.createGain();
      outN = head;
      tr.nodes.push(head);
    }
    tr.in[k] = head;
    outN.connect(tr.out);
    if (REV[k] > 0) {
      const s = ctx.createGain();
      s.gain.value = REV[k];
      outN.connect(s);
      s.connect(revIn);
      tr.nodes.push(s);
    }
    if (k === 'mel' || k === 'fx') {
      const d = ctx.createGain();
      d.gain.value = k === 'mel' ? 0.25 : 0.35;
      outN.connect(d);
      d.connect(dlyIn);
      tr.nodes.push(d);
    }
  }
  tr.sc = tr.in.pad; // pad input: kicks duck it
}

function dest(tr, kind) {
  return tr.in[kind] || tr.in.mel;
}

function retire(tr, fadeS) {
  tr.dead = true;
  clearInterval(tr.timer);
  const t = ctx.currentTime;
  const g = tr.out.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(0, t + fadeS);
  tr.perm.forEach(({ e, srcs }) => {
    e.end = t + fadeS + 0.1; // prune() frees the count
    srcs.forEach((s) => {
      try {
        s.stop(t + fadeS + 0.1);
      } catch {
        /* already stopped */
      }
    });
  });
  setTimeout(() => {
    tr.nodes.forEach((n) => {
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    });
  }, (fadeS + 0.5) * 1000);
}

function pump(tr) {
  if (tr.dead || !ctx) return;
  const now = ctx.currentTime;
  if (tr.nextT < now) tr.nextT = now + 0.02; // tab was throttled: don't burst
  const barLen = 16 * tr.cfg.st;
  while (tr.nextT < now + LOOKAHEAD) {
    scheduleBar(tr, tr.bar, tr.nextT);
    tr.nextT += barLen;
    tr.bar++;
  }
}

// ---------- voices ----------

function prune() {
  const now = ctx.currentTime;
  for (let i = live.length - 1; i >= 0; i--) {
    if (live[i].end < now) {
      count -= live[i].n;
      live.splice(i, 1);
    }
  }
}

/** Claim n sources for a note. Steals the lowest lower-priority voice when full; null = dropped. */
function take(prio, end, n) {
  prune();
  while (count + n > MAX_VOICES) {
    let vi = -1;
    for (let i = 0; i < live.length; i++) {
      const v = live[i];
      if (v.perm || v.prio >= prio) continue;
      if (vi < 0 || v.prio < live[vi].prio || (v.prio === live[vi].prio && v.end < live[vi].end)) vi = i;
    }
    if (vi < 0) return null;
    const v = live.splice(vi, 1)[0];
    count -= v.n;
    v.kill();
  }
  const e = { prio, end, n, perm: false, kill: NOOP };
  live.push(e);
  count += n;
  return e;
}

/** Permanent claim (pads): never stolen, freed on retire. */
function perm(n) {
  prune();
  if (count + n > MAX_VOICES) return null;
  const e = { prio: PRIO.pad, end: Infinity, n, perm: true, kill: NOOP };
  live.push(e);
  count += n;
  return e;
}

/** Start sources and wire their end: each source disconnects itself; the last one frees the nodes. */
function arm(e, srcs, out, extra, t, stopAt) {
  e.kill = () => {
    const now = ctx.currentTime;
    try {
      out.gain.cancelScheduledValues(now);
      out.gain.setTargetAtTime(0, now, 0.004);
    } catch {
      /* ignore */
    }
    srcs.forEach((s) => {
      try {
        s.stop(now + 0.03);
      } catch {
        /* ignore */
      }
    });
  };
  let left = srcs.length;
  srcs.forEach((s) => {
    s.onended = () => {
      try {
        s.disconnect();
      } catch {
        /* ignore */
      }
      left--;
      if (left === 0) {
        [out, ...extra].forEach((n) => {
          try {
            n.disconnect();
          } catch {
            /* ignore */
          }
        });
      }
    };
    s.start(t);
    s.stop(stopAt);
  });
}

/** Started permanent sources (pads), kept in the track for retire. */
function startPerm(tr, e, t, srcs, nodes) {
  srcs.forEach((s) => s.start(t));
  tr.perm.push({ e, srcs });
  nodes.forEach((n) => tr.nodes.push(n));
}

/** Gain envelope: linear attack to peak, exponential release to dur. Attack is at least 4 ms (no click). */
function shape(g, t, peak, attack, dur) {
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, attack + 0.02));
}

/** Sidechain: the pad input dips on a kick and comes back over rel seconds. */
function duck(tr, t, depth = 0.4, rel = 0.14) {
  const g = tr.sc && tr.sc.gain;
  if (!g) return;
  g.linearRampToValueAtTime(1 - depth, t + 0.006);
  g.linearRampToValueAtTime(1, t + rel);
}

function organWave() {
  if (ORG_CTX !== ctx) {
    const re = new Float32Array(9);
    const im = new Float32Array(9);
    re[1] = 1;
    re[2] = 0.5;
    re[3] = 0.33;
    re[4] = 0.25;
    re[6] = 0.16;
    re[8] = 0.1;
    ORG = ctx.createPeriodicWave(re, im);
    ORG_CTX = ctx;
  }
  return ORG;
}

// ---------- permanent pads: strings, organ, choir ----------

function makePads(tr, t, chord) {
  const P = tr.cfg.pads || {};
  if (P.str) {
    const e = perm(7);
    if (e) {
      const out = ctx.createGain();
      out.gain.setValueAtTime(0, t);
      const fl = ctx.createBiquadFilter();
      fl.type = 'lowpass';
      fl.frequency.value = 1500;
      fl.Q.value = 0.4;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rr(tr, 0.05, 0.09);
      const ld = ctx.createGain();
      ld.gain.value = 320;
      lfo.connect(ld);
      ld.connect(fl.frequency);
      const oscs = [];
      for (let i = 0; i < 3; i++) {
        for (const det of [-8, 8]) {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.detune.value = det;
          o.frequency.value = mtof(chord[i % chord.length]);
          o.connect(fl);
          oscs.push(o);
        }
      }
      fl.connect(out);
      out.connect(tr.in.pad);
      startPerm(tr, e, t, [...oscs, lfo], [out, fl, ld]);
      tr.pads.str = { out, oscs, peak: P.str };
    }
  }
  if (P.org) {
    const e = perm(3);
    if (e) {
      const out = ctx.createGain();
      out.gain.setValueAtTime(0, t);
      const fl = ctx.createBiquadFilter();
      fl.type = 'lowpass';
      fl.frequency.value = 1100;
      fl.Q.value = 0.5;
      const oscs = [0, 1, 2].map((i) => {
        const o = ctx.createOscillator();
        o.setPeriodicWave(organWave());
        o.frequency.value = mtof(chord[i % chord.length]);
        o.connect(fl);
        return o;
      });
      fl.connect(out);
      out.connect(tr.in.pad);
      startPerm(tr, e, t, oscs, [out, fl]);
      tr.pads.org = { out, oscs, peak: P.org };
    }
  }
  if (P.cho) {
    const e = perm(3);
    if (e) {
      const out = ctx.createGain();
      out.gain.setValueAtTime(0, t);
      const nodes = [out];
      const bank = VOWEL.a.map((f, k) => {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = f;
        bp.Q.value = 8;
        const g = ctx.createGain();
        g.gain.value = [1, 0.6, 0.35][k];
        bp.connect(g);
        g.connect(out);
        nodes.push(bp, g);
        return bp;
      });
      const oscs = [0, 2].map((i) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(chord[i % chord.length] + 12);
        bank.forEach((bp) => o.connect(bp));
        return o;
      });
      const nz = ctx.createBufferSource();
      nz.buffer = getNoiseBuffer();
      nz.loop = true;
      const br = ctx.createGain();
      br.gain.value = 0.1;
      nz.connect(br);
      bank.forEach((bp) => br.connect(bp));
      nodes.push(br);
      out.connect(tr.in.pad);
      startPerm(tr, e, t, [...oscs, nz], nodes);
      tr.pads.cho = { out, oscs, peak: P.cho, bank };
    }
  }
}

/** Glide the pads to a chord (1.2 s time constant). */
function padChord(tr, t, chord) {
  const p = tr.pads;
  if (p.str) p.str.oscs.forEach((o, i) => o.frequency.setTargetAtTime(mtof(chord[(i >> 1) % chord.length]), t, 1.2));
  if (p.org) p.org.oscs.forEach((o, i) => o.frequency.setTargetAtTime(mtof(chord[i % chord.length]), t, 1.2));
  if (p.cho) p.cho.oscs.forEach((o, i) => o.frequency.setTargetAtTime(mtof(chord[(i * 2) % chord.length] + 12), t, 1.2));
}

/** Pad level 0..1 of its peak, approached over about 1 s. */
function level(tr, t, key, v) {
  const p = tr.pads[key];
  if (!p || tr.lv[key] === v) return;
  tr.lv[key] = v;
  p.out.gain.setTargetAtTime(p.peak * v, t, 0.9);
}

function choirVowel(tr, t, v) {
  const p = tr.pads.cho;
  if (p) p.bank.forEach((bp, k) => bp.frequency.setTargetAtTime(VOWEL[v][k], t, 0.3));
}

// ---------- melodic instruments (priority: melody) ----------

/** Legato string: two detuned saws through a lowpass that opens on a slow bow attack. */
function strNote(tr, t, m, dur, pk, kind = 'mel') {
  const e = take(PRIO.mel, t + dur, 2);
  if (!e) return;
  const fl = ctx.createBiquadFilter();
  fl.type = 'lowpass';
  fl.Q.value = 0.6;
  fl.frequency.setValueAtTime(700, t);
  fl.frequency.linearRampToValueAtTime(2400, t + 0.25);
  fl.frequency.exponentialRampToValueAtTime(900, t + dur);
  const out = ctx.createGain();
  shape(out, t, pk, 0.14, dur);
  fl.connect(out);
  out.connect(dest(tr, kind));
  const srcs = [-7, 7].map((det) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = mtof(m);
    o.detune.value = det;
    o.connect(fl);
    return o;
  });
  arm(e, srcs, out, [fl], t, t + dur + 0.1);
}

/** Brass: saw pair through a resonant lowpass with an envelope ("брр"). */
function brassNote(tr, t, m, dur, pk, kind = 'mel') {
  const e = take(PRIO.mel, t + dur, 2);
  if (!e) return;
  const fl = ctx.createBiquadFilter();
  fl.type = 'lowpass';
  fl.Q.value = 7;
  fl.frequency.setValueAtTime(320, t);
  fl.frequency.exponentialRampToValueAtTime(1900, t + 0.07);
  fl.frequency.exponentialRampToValueAtTime(800, t + Math.max(dur, 0.2));
  const out = ctx.createGain();
  shape(out, t, pk, 0.05, dur);
  fl.connect(out);
  out.connect(dest(tr, kind));
  const srcs = [0, 6].map((det) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = mtof(m);
    o.detune.value = det;
    o.connect(fl);
    return o;
  });
  arm(e, srcs, out, [fl], t, t + dur + 0.1);
}

/** Garmon (reed): square through a bandpass swept by a 5 Hz LFO (pulse-width feel). */
function reedNote(tr, t, m, dur, pk, kind = 'mel') {
  const e = take(PRIO.mel, t + dur, 2);
  if (!e) return;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1100;
  bp.Q.value = 2.5;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 5.2;
  const depth = ctx.createGain();
  depth.gain.value = 260;
  lfo.connect(depth);
  depth.connect(bp.frequency);
  const o = ctx.createOscillator();
  o.type = 'square';
  o.frequency.value = mtof(m);
  o.connect(bp);
  const out = ctx.createGain();
  shape(out, t, pk, 0.04, dur);
  bp.connect(out);
  out.connect(dest(tr, kind));
  arm(e, [o, lfo], out, [bp, depth], t, t + dur + 0.1);
}

/** Karplus–Strong pluck: precomputed string, played back at the note's pitch. which: 'bal' | 'guit'. */
function pluckNote(tr, t, m, dur, pk, kind = 'mel', which = 'bal') {
  const K = KS && KS[which];
  const e = K ? take(PRIO.mel, t + dur, 1) : null;
  if (!e) return;
  const src = ctx.createBufferSource();
  src.buffer = K.buf;
  src.playbackRate.value = mtof(m) / K.f0;
  const out = ctx.createGain();
  shape(out, t, pk, 0.004, dur);
  src.connect(out);
  out.connect(dest(tr, kind));
  arm(e, [src], out, [], t, t + dur + 0.1);
}

/** FM voice: sine carrier, modulator at ratio, modulation index decays over tau seconds. */
function fmNote(tr, t, m, ratio, index, tau, dur, pk, kind) {
  const e = take(PRIO.mel, t + dur, 2);
  if (!e) return;
  const f = mtof(m);
  const car = ctx.createOscillator();
  car.frequency.value = f;
  const mod = ctx.createOscillator();
  mod.frequency.value = f * ratio;
  const mg = ctx.createGain();
  mg.gain.setValueAtTime(f * index, t);
  mg.gain.exponentialRampToValueAtTime(1, t + tau);
  mod.connect(mg);
  mg.connect(car.frequency);
  const out = ctx.createGain();
  shape(out, t, pk, 0.004, dur);
  car.connect(out);
  out.connect(dest(tr, kind));
  arm(e, [car, mod], out, [mg], t, t + dur + 0.1);
}

/** FM piano / celesta: ratio 2, hammer index dies in 0.35 s. */
function keyNote(tr, t, m, dur, pk, kind = 'mel') {
  fmNote(tr, t, m, 2, 1.2, 0.35, dur, pk, kind);
}

/** FM bell: inharmonic ratio 3.5, long tail (at least 3.5 s). */
function bellNote(tr, t, m, dur, pk, kind = 'fx') {
  fmNote(tr, t, m, 3.5, 2.5, 2.2, Math.max(dur, 3.5), pk, kind);
}

// ---------- bass (priority: bass) ----------

/** Bass: sine sub plus a saw through a closing lowpass, kept at 80–200 Hz by the caller. */
function bassNote(tr, t, m, dur, pk) {
  const e = take(PRIO.bass, t + dur, 2);
  if (!e) return;
  const f = mtof(m);
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = f;
  const saw = ctx.createOscillator();
  saw.type = 'sawtooth';
  saw.frequency.value = f;
  const fl = ctx.createBiquadFilter();
  fl.type = 'lowpass';
  fl.Q.value = 1.2;
  fl.frequency.setValueAtTime(260, t);
  fl.frequency.exponentialRampToValueAtTime(130, t + dur);
  const out = ctx.createGain();
  shape(out, t, pk, 0.006, dur);
  saw.connect(fl);
  fl.connect(out);
  sub.connect(out);
  out.connect(dest(tr, 'bass'));
  arm(e, [sub, saw], out, [fl], t, t + dur + 0.1);
}

// ---------- drums (priority: drums) ----------

/** Tone hit: sine (or type) with a pitch glide, one source. */
function toneHit(tr, t, prio, kind, f, f1, dur, pk, type = 'sine') {
  const e = take(prio, t + dur, 1);
  if (!e) return;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const out = ctx.createGain();
  shape(out, t, pk, 0.004, dur);
  o.connect(out);
  out.connect(dest(tr, kind));
  arm(e, [o], out, [], t, t + dur + 0.05);
}

/** Noise hit through a filter, one source (shared noise buffer). */
function noiseHit(tr, t, prio, kind, type, f, q, dur, pk) {
  const e = take(prio, t + dur, 1);
  if (!e) return;
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer();
  src.loop = true;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.value = f;
  fl.Q.value = q;
  const out = ctx.createGain();
  shape(out, t, pk, 0.003, dur);
  src.connect(fl);
  fl.connect(out);
  out.connect(dest(tr, kind));
  arm(e, [src], out, [fl], t, t + dur + 0.05);
}

/** Industrial kick: sine pitch drop, sidechains the pads. */
function kick(tr, t, pk) {
  toneHit(tr, t, PRIO.drum, 'drum', 130, 42, 0.22, pk);
  duck(tr, t, 0.3, 0.15);
}

/** Taiko for bosses: long low drum with a short noise thump, sidechains the pads. */
function taiko(tr, t, pk) {
  toneHit(tr, t, PRIO.drum, 'drum', 96, 52, 0.9, pk);
  noiseHit(tr, t, PRIO.drum, 'drum', 'lowpass', 500, 0.7, 0.12, pk * 0.6);
  duck(tr, t, 0.2, 0.3);
}

function snare(tr, t, pk) {
  noiseHit(tr, t, PRIO.drum, 'drum', 'bandpass', 1800, 0.9, 0.16, pk);
  toneHit(tr, t, PRIO.drum, 'drum', 190, 150, 0.09, pk * 0.5, 'triangle');
}

function hat(tr, t, pk, open = false) {
  noiseHit(tr, t, PRIO.drum, 'drum', 'highpass', 7500, 0.7, open ? 0.25 : 0.04, pk);
}

function cym(tr, t, pk) {
  noiseHit(tr, t, PRIO.drum, 'drum', 'highpass', 5200, 0.5, 1.3, pk);
}

/** Industrial anvil: bandpass-noise transient plus two inharmonic ring tones. */
function anvil(tr, t, pk) {
  noiseHit(tr, t, PRIO.drum, 'drum', 'bandpass', 1400, 4, 0.16, pk);
  toneHit(tr, t, PRIO.drum, 'drum', 180, 168, 0.5, pk * 0.5);
  toneHit(tr, t, PRIO.drum, 'drum', 497, 480, 0.2, pk * 0.25);
}

function glitch(tr, t, pk) {
  noiseHit(tr, t, PRIO.drum, 'drum', 'bandpass', 2000 + Math.random() * 4000, 9, 0.03, pk);
}

const hitAt = (s, p) => (s && s[p] && s[p] !== '.' ? s[p] : '');
const vel = (c) => (c === 'X' ? 1 : 0.7);

function drumStep(tr, t, p, dp, fill, dv) {
  const k = hitAt(dp.k, p);
  if (k) kick(tr, t, 0.42 * dv * vel(k));
  const tm = hitAt(dp.t, p);
  if (tm) taiko(tr, t, 0.5 * dv * vel(tm));
  const sn = hitAt(fill && dp.f ? dp.f : dp.s, p);
  if (sn) snare(tr, t, 0.1 * dv * vel(sn));
  const h = hitAt(dp.h, p);
  if (h) hat(tr, t, 0.022 * dv * vel(h), h === 'o');
  const c = hitAt(dp.c, p);
  if (c) cym(tr, t, 0.035 * dv * vel(c));
  const a = hitAt(dp.a, p);
  if (a) anvil(tr, t, 0.1 * dv * vel(a));
  const g = hitAt(dp.g, p);
  if (g && tr.rnd() < 0.8) glitch(tr, t, 0.035 * dv * vel(g));
}

// ---------- song engine ----------

const bassRoot = (chord) => {
  let r = chord[0];
  while (r > 50) r -= 12;
  while (r < 38) r += 12;
  return r;
};

function playMel(tr, t, m, dur, style, pk, pw) {
  if (style === 'str') strNote(tr, t, m, dur, pk);
  else if (style === 'brass') brassNote(tr, t, m, dur, pk);
  else if (style === 'reed') reedNote(tr, t, m, dur, pk);
  else if (style === 'pluck') pluckNote(tr, t, m, dur, pk, 'mel', pw || 'bal');
  else if (style === 'bell') bellNote(tr, t, m, dur, pk);
  else keyNote(tr, t, m, dur, pk);
}

/** Schedule one bar (16 sixteenths) starting at t0. Everything in it is planned now. */
function scheduleBar(tr, b, t0) {
  const cfg = tr.cfg;
  const st = cfg.st;
  const L = 16 * st;
  const sec = cfg.map[b % cfg.cyc];
  const cy = Math.floor(b / cfg.cyc);
  if (tr.cy !== cy) {
    tr.cy = cy;
    tr.shift = cy === 0 ? 0 : pick(tr, SHIFTS);
  }
  const chord = cfg.prog[b % cfg.prog.length];
  if (tr.chord !== chord) {
    tr.chord = chord;
    padChord(tr, t0, chord);
  }
  const I = tr.intensity;
  const L2 = I >= LAYER_I[0];
  const L3 = I >= LAYER_I[1];
  const L4 = I >= LAYER_I[2];
  const dv = cfg.dv ?? 1;
  const root = bassRoot(chord);

  // pads
  level(tr, t0, 'str', (sec.str || 0) * (L3 ? 1 : 0.45));
  level(tr, t0, 'org', sec.org || 0);
  level(tr, t0, 'cho', L4 ? sec.cho || 0 : 0);
  if (sec.cho && b % 2 === 0) choirVowel(tr, t0, VSEQ[(b >> 1) & 3]);

  // drums (layer 1)
  const dp = DR[sec.d];
  if (dp) {
    const fill = !!sec.fill && b % 4 === 3;
    for (let p = 0; p < 16; p++) drumStep(tr, t0 + p * st, p, dp, fill, dv);
  }

  // bass (layer 2)
  if (sec.b && L2) {
    for (let p = 0; p < 16; p++) {
      const iv = BI[sec.b[p]];
      if (iv === undefined) continue;
      bassNote(tr, t0 + p * st, root + iv, 2 * st * 0.9, 0.08 * dv);
    }
  }

  // melody (layer 3): question and answer from the 8-bar expansion, transposed per cycle
  const style = sec.ms || cfg.ms;
  const pw = sec.pw || cfg.pw;
  if (sec.m && L3) {
    const base = chord[0] + 12 + tr.shift;
    for (const n of cfg.mel8[b % 8]) {
      playMel(tr, t0 + n[1] * st, base + n[0], n[2] * st * 0.92, style, cfg.mv ?? 0.07, pw);
    }
    if (tr.leit && b % 8 === 7) {
      tr.leit.forEach((d, i) => keyNote(tr, t0 + i * 4 * st, chord[0] + 24 + tr.shift + d, 3 * st, 0.05 * dv, 'fx'));
    }
  }

  // layer 3 colour: reed chord, bells
  if (sec.rd && L3) {
    reedNote(tr, t0, chord[0] + 12, L * 0.95, 0.04 * dv, 'fx');
    reedNote(tr, t0, chord[1 % chord.length] + 12, L * 0.95, 0.035 * dv, 'fx');
  }
  if (sec.bl && L3 && b % 4 === 0) bellNote(tr, t0, chord[0] + 24, 4, 0.05 * dv, 'fx');

  // layer 4: brass stabs on the beat and the offbeat of the bar
  if (sec.br && L4) {
    for (const p of [0, 8]) {
      chord.slice(0, 3).forEach((m) => brassNote(tr, t0 + p * st, m + 12, 6 * st, 0.03 * dv));
    }
  }

  // plucked arpeggio (balalaika, guitar)
  if (sec.pl) {
    for (let p = 0; p < 16; p += 2) {
      pluckNote(tr, t0 + p * st, chord[(p >> 1) % chord.length] + 12, 2.5 * st, 0.05 * dv, 'fx', pw || 'guit');
    }
  }
}

// ---------- tracks (see CFG above) ----------

export const TRACK_IDS = Object.freeze(TRACK_IDS_LIST);

// ---------- where to call (per brief: calls are added by the scene owners) ----------
//
// Track -> where to call (playTrack in scene enter(game), or where the state changes):
//   'menu'          game/src/scenes/menu.js            menu enter (main theme)
//   'world'         game/src/scenes/world-map.js       world map and route
//   'town'          game/src/scenes/location.js        node and hub; { leit: [4 offsets] } for a faction region
//   'battle'        game/src/scenes/battle.js          regular fights; then setIntensity(v) on HP or phase changes
//   'boss'          game/src/scenes/battle.js          boss encounters (ids with '^inc'): choose by encounter id
//   'boss-final'    game/src/scenes/battle.js          finale fight (w-cc-finale) only
//   'cyberspace'    game/src/scenes/cyberspace.js      createCyberspaceScene enter
//   'tension'       world-map.js, location.js          exodus mark 5 (see game/src/world/exodus.js exodusMark)
//   'card-game'     game/src/scenes/cards.js           cards enter (cards.js line ~316 still plays 'town'/'cyberspace')
//   'casino'        game/src/scenes/casino.js          casino enter (casino.js line ~163 still plays 'town')
//   'base'          not wired yet (camp / base scene not located)
//   'cult'          not wired yet (cult encounter not located)
//   'roguelike-map' not wired yet (roguelike map scene not located)
//   'romance'       game/src/data/romance.js           date scene (romance.date)
//   'tragic'        romance.js farewell, breakup, death (romance.death) and tragic epilogue
//   stopMusic(1500): game end and the pause menu's "В главное меню" (game/src/ui/save-ui.js).
//   setMusicVolume(v): settings screen. setIntensity(v): battle and boss scenes, 0..1.
//   Calls before the first user gesture are stored and start on that gesture by themselves.
//   Audio files are no longer used: all tracks are procedural.
