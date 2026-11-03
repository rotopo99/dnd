// sfx.js — all game sounds synthesized with WebAudio (no audio files).
//
// Usage:
//   import { initAudio, unlockAudioOnFirstGesture, play, setVolume } from './audio/sfx.js';
//   unlockAudioOnFirstGesture();          // or call initAudio() inside any user-gesture handler
//   play('hit', { dmgType: 'fire' });
//
// Safety: if AudioContext is unavailable (Node, headless) or not yet created,
// every function is a silent no-op and never throws.
//
// Loudness: voices -> compressor -> masterGain (<= 0.5 ~ -6 dBFS).

// -6 dBFS ceiling = 0.5; 0.45 leaves headroom for the compressor's built-in makeup gain.
const MAX_MASTER = 0.45;
const MIN_REPEAT_MS = 30; // same sound retriggered faster than this is dropped

let ctx = null;
export let masterGain = null;
let bus = null; // voices connect here (pre-compressor)
let noiseBuf = null;
let volume = 1;
const lastPlayed = new Map();

function getCtor() {
  try {
    return globalThis.AudioContext || globalThis.webkitAudioContext || null;
  } catch {
    return null;
  }
}

/** Create (or resume) the AudioContext. Call from a user gesture. Returns true if audio is ready. */
export function initAudio() {
  try {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    const Ctor = getCtor();
    if (!Ctor) return false;
    ctx = new Ctor({ latencyHint: 'interactive' });

    masterGain = ctx.createGain();
    masterGain.gain.value = MAX_MASTER * volume;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 0;
    comp.ratio.value = 12;
    comp.attack.value = 0.002;
    comp.release.value = 0.1;

    bus = ctx.createGain();
    bus.gain.value = 1;
    bus.connect(comp);
    comp.connect(masterGain);
    masterGain.connect(ctx.destination);

    const len = Math.floor(ctx.sampleRate * 1);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return true;
  } catch {
    ctx = null;
    masterGain = null;
    bus = null;
    return false;
  }
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
  const n = Number(v);
  volume = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : volume;
  try {
    if (ctx && masterGain) masterGain.gain.setTargetAtTime(MAX_MASTER * volume, ctx.currentTime, 0.01);
  } catch {
    /* no-op */
  }
}

export function getVolume() {
  return volume;
}

// ---------- helpers ----------

const rand = (a, b) => a + Math.random() * (b - a);
/** Randomize frequency by +-cents. */
const vary = (f, cents = 40) => f * Math.pow(2, rand(-cents, cents) / 1200);
const NOTE = (semisFromA4) => 440 * Math.pow(2, semisFromA4 / 12);

function envGain(t, peak, attack, dur, dest) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, attack + 0.005));
  g.connect(dest || bus);
  return g;
}

function cleanup(src, nodes) {
  src.onended = () => {
    try {
      src.disconnect();
      nodes.forEach((n) => n.disconnect());
    } catch {
      /* ignore */
    }
  };
}

/**
 * Oscillator voice.
 * o: { type, f, f1, glide:'exp'|'lin', at (delay s), dur, peak, attack, filter:{type,f,f1,q}, vib:{rate,depth}, detune }
 */
function tone(o) {
  const t = ctx.currentTime + (o.at || 0);
  const dur = o.dur || 0.1;
  const osc = ctx.createOscillator();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.f, t);
  if (o.f1) {
    if (o.glide === 'lin') osc.frequency.linearRampToValueAtTime(o.f1, t + dur);
    else osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + dur);
  }
  if (o.detune) osc.detune.value = o.detune;
  const nodes = [];
  const g = envGain(t, o.peak ?? 0.2, o.attack ?? 0.003, dur, o.dest);
  nodes.push(g);
  let head = g;
  if (o.filter) {
    const fl = ctx.createBiquadFilter();
    fl.type = o.filter.type || 'lowpass';
    fl.frequency.setValueAtTime(o.filter.f, t);
    if (o.filter.f1) fl.frequency.exponentialRampToValueAtTime(o.filter.f1, t + dur);
    fl.Q.value = o.filter.q ?? 1;
    fl.connect(g);
    head = fl;
    nodes.push(fl);
  }
  if (o.vib) {
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = o.vib.rate;
    lg.gain.value = o.vib.depth;
    lfo.connect(lg).connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
    cleanup(lfo, [lg]);
  }
  osc.connect(head);
  osc.start(t);
  osc.stop(t + dur + 0.05);
  cleanup(osc, nodes);
  return osc;
}

/** Filtered noise burst. o: { at, dur, peak, attack, type, f, f1, q, offset } */
function noise(o) {
  const t = ctx.currentTime + (o.at || 0);
  const dur = o.dur || 0.1;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const fl = ctx.createBiquadFilter();
  fl.type = o.type || 'bandpass';
  fl.frequency.setValueAtTime(o.f || 1000, t);
  if (o.f1) fl.frequency.exponentialRampToValueAtTime(o.f1, t + dur);
  fl.Q.value = o.q ?? 1;
  const g = envGain(t, o.peak ?? 0.2, o.attack ?? 0.002, dur, o.dest);
  src.connect(fl).connect(g);
  src.start(t, o.offset ?? Math.random() * 0.9);
  src.stop(t + dur + 0.05);
  cleanup(src, [fl, g]);
  return src;
}

/** Stepped-pitch square (chiptune/digital). */
function steps(freqs, stepDur, o = {}) {
  freqs.forEach((f, i) =>
    tone({
      type: o.type || 'square',
      f,
      at: (o.at || 0) + i * stepDur,
      dur: stepDur * (o.overlap || 1.2),
      peak: o.peak ?? 0.08,
      attack: 0.002,
      filter: o.filter,
    })
  );
}

// ---------- hit timbres by dmgType ----------

const HIT = {
  slash() {
    noise({ type: 'bandpass', f: vary(2500), f1: vary(6500), q: 2, dur: 0.11, peak: 0.35 });
    tone({ type: 'sawtooth', f: vary(900), f1: 300, dur: 0.08, peak: 0.08, filter: { type: 'highpass', f: 600 } });
  },
  pierce() {
    noise({ type: 'bandpass', f: vary(4500), q: 4, dur: 0.045, peak: 0.35 });
    tone({ type: 'sine', f: vary(1600), f1: 350, dur: 0.07, peak: 0.25 });
  },
  blunt() {
    tone({ type: 'sine', f: vary(160, 60), f1: 45, dur: 0.18, peak: 0.55 });
    noise({ type: 'lowpass', f: 700, f1: 200, dur: 0.12, peak: 0.35 });
  },
  energy() {
    tone({ type: 'square', f: vary(1100), f1: 180, dur: 0.16, peak: 0.12, filter: { type: 'lowpass', f: 3000, f1: 600 } });
    tone({ type: 'sine', f: vary(2200), f1: 900, dur: 0.12, peak: 0.12 });
  },
  fire() {
    noise({ type: 'bandpass', f: vary(900), f1: 400, q: 0.8, dur: 0.32, peak: 0.35, attack: 0.004 });
    for (let i = 0; i < 5; i++) noise({ type: 'highpass', f: 3000, at: rand(0, 0.25), dur: 0.015, peak: rand(0.08, 0.18) });
    tone({ type: 'sine', f: vary(90), f1: 50, dur: 0.25, peak: 0.25 });
  },
  electric() {
    const t = ctx.currentTime;
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
    const t = ctx.currentTime;
    const carrier = tone({ type: 'sine', f: vary(320), f1: 160, dur: 0.24, peak: 0.2 });
    const mod = ctx.createOscillator();
    const mg = ctx.createGain();
    mod.type = 'square';
    mod.frequency.value = vary(47, 100);
    mg.gain.value = 220;
    mod.connect(mg).connect(carrier.frequency);
    mod.start(t);
    mod.stop(t + 0.3);
    cleanup(mod, [mg]);
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

// ---------- sound table ----------

const SOUNDS = {
  uiClick() {
    tone({ type: 'square', f: vary(1800, 30), f1: 1100, dur: 0.03, peak: 0.08, filter: { type: 'lowpass', f: 4000 } });
    noise({ type: 'highpass', f: 5000, dur: 0.012, peak: 0.08 });
  },
  uiHover() {
    tone({ type: 'sine', f: vary(2400, 30), dur: 0.025, peak: 0.04 });
  },
  step() {
    noise({ type: 'lowpass', f: vary(350, 150), f1: 150, dur: 0.07, peak: 0.25 });
    tone({ type: 'sine', f: vary(110, 80), f1: 70, dur: 0.06, peak: 0.15 });
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
  hit(opts = {}) {
    (HIT[opts.dmgType] || HIT.blunt)();
  },
  crit(opts = {}) {
    (HIT[opts.dmgType] || HIT.blunt)();
    tone({ type: 'sine', f: vary(2093, 20), dur: 0.25, peak: 0.15 }); // ping C7
    tone({ type: 'sine', f: vary(3136, 20), dur: 0.2, peak: 0.08 });
    tone({ type: 'sine', f: 120, f1: 35, dur: 0.3, peak: 0.4 }); // boom
    noise({ type: 'lowpass', f: 1200, f1: 150, dur: 0.25, peak: 0.25 });
  },
  miss() {
    noise({ type: 'bandpass', f: vary(500), f1: vary(1800), q: 3, dur: 0.16, peak: 0.18, attack: 0.01 });
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
    // "bvamp": a flubbed trombone-ish blat with wah filter, like a joke that died
    const f = vary(200, 60);
    const t = ctx.currentTime;
    const o1 = tone({ type: 'sawtooth', f, dur: 0.42, peak: 0.22, attack: 0.008, filter: { type: 'lowpass', f: 300, q: 6 } });
    o1.frequency.linearRampToValueAtTime(f * 1.08, t + 0.08);
    o1.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.42);
    const o2 = tone({ type: 'square', f: f * 0.5, dur: 0.4, peak: 0.08, filter: { type: 'lowpass', f: 500 }, detune: 25 });
    o2.frequency.exponentialRampToValueAtTime(f * 0.27, t + 0.4);
    // wah: separate bandpass sweep on noise-free voice for "bw-" onset
    tone({ type: 'sawtooth', f: f * 2, f1: f * 1.1, dur: 0.12, peak: 0.07, filter: { type: 'bandpass', f: 400, f1: 1400, q: 4 } });
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
  death() {
    noise({ type: 'lowpass', f: 900, f1: 80, dur: 0.9, peak: 0.3, attack: 0.005 });
    tone({ type: 'sawtooth', f: vary(220, 40), f1: 38, dur: 1.0, peak: 0.18, filter: { type: 'lowpass', f: 1500, f1: 120 } });
    tone({ type: 'sine', f: 80, f1: 30, dur: 0.6, peak: 0.3 });
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
};

/** Names accepted by play(). */
export const SOUND_NAMES = Object.freeze(Object.keys(SOUNDS));
export const DMG_TYPES = Object.freeze(Object.keys(HIT));

/**
 * Single entry point. play('hit', { dmgType: 'fire' }).
 * Silent no-op if audio is not initialized/unavailable or name is unknown.
 */
export function play(name, opts = {}) {
  try {
    if (!ctx || !bus || volume <= 0) return;
    const fn = SOUNDS[name];
    if (!fn) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const key = name === 'hit' || name === 'crit' ? `${name}:${opts && opts.dmgType}` : name;
    if (now - (lastPlayed.get(key) || -1e9) < MIN_REPEAT_MS) return;
    lastPlayed.set(key, now);
    fn(opts || {});
  } catch {
    /* never throw from audio */
  }
}
