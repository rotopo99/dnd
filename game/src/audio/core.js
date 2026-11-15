// core.js — shared WebAudio graph and synth primitives (no game logic).
// Used by sfx.js (facade), sfx-foley.js, sfx-ui.js, ambience.js, vox.js.
//
// Graph:
//   voices -> bus 'sfx' | 'ui' | 'voice' | 'amb' -> sum -> compressor -> masterGain -> limiter -> destination
//   music.js connects straight to masterGain (it is ducked by the limiter as well).
//
// Safety: every function is a silent no-op until initCore() runs (first user gesture).

const MAX_MASTER = 0.45; // -6 dBFS ceiling; limiter below catches peaks
const MAX_VOICES = 56; // concurrent oscillator/noise voices; play() drops non-critical sounds above this
const MIX_KEY = 'dnd.mix';
// 'music' is stored here for the settings screen only; music.js owns its own gain (no bus node).
const MIX_DEFAULT = { sfx: 1, ui: 0.8, voice: 0.9, amb: 0.5, music: 0.6 };

let ctx = null;
export let masterGain = null;
let sum = null; // all buses meet here (pre-compressor)
let noiseBuf = null;
let route = null; // default destination for voices (set by withBus)
let voices = 0;
let volume = 1;
const buses = {};
const mix = { ...MIX_DEFAULT };

export const getAudioContext = () => ctx;
export const getNoiseBuffer = () => noiseBuf;
export const getVoiceCount = () => voices;
export const isReady = () => !!(ctx && sum);
export const getBus = (name) => buses[name] || null;

function getCtor() {
  try {
    return globalThis.AudioContext || globalThis.webkitAudioContext || null;
  } catch {
    return null;
  }
}

function loadMix() {
  try {
    const raw = globalThis.localStorage && globalThis.localStorage.getItem(MIX_KEY);
    if (!raw) return;
    const o = JSON.parse(raw);
    for (const k of Object.keys(MIX_DEFAULT)) if (Number.isFinite(o[k])) mix[k] = clamp01(o[k]);
  } catch {
    /* ignore broken prefs */
  }
}

function saveMix() {
  try {
    globalThis.localStorage && globalThis.localStorage.setItem(MIX_KEY, JSON.stringify(mix));
  } catch {
    /* ignore */
  }
}

export const clamp01 = (v) => Math.min(1, Math.max(0, v));
loadMix(); // prefs are readable before the AudioContext exists (music.js reads its level at import)

/** Create (or resume) the AudioContext and the mixer. Call from a user gesture. */
export function initCore() {
  try {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    const Ctor = getCtor();
    if (!Ctor) return false;
    ctx = new Ctor({ latencyHint: 'interactive' });
    loadMix();

    masterGain = ctx.createGain();
    masterGain.gain.value = MAX_MASTER * volume;

    // Limiter after master: hard ceiling so stacked voices never clip the output.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.05;
    masterGain.connect(limiter).connect(ctx.destination);

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 0;
    comp.ratio.value = 12;
    comp.attack.value = 0.002;
    comp.release.value = 0.1;

    sum = ctx.createGain();
    sum.gain.value = 1;
    sum.connect(comp);
    comp.connect(masterGain);

    for (const name of Object.keys(MIX_DEFAULT)) {
      if (name === 'music') continue;
      const g = ctx.createGain();
      g.gain.value = mix[name];
      g.connect(sum);
      buses[name] = g;
    }
    route = buses.sfx;

    const len = Math.floor(ctx.sampleRate * 1);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return true;
  } catch {
    ctx = null;
    masterGain = null;
    sum = null;
    return false;
  }
}

/** Master volume 0..1 (0..-6 dBFS ceiling). */
export function setMasterVolume(v) {
  const n = Number(v);
  volume = Number.isFinite(n) ? clamp01(n) : volume;
  try {
    if (ctx && masterGain) masterGain.gain.setTargetAtTime(MAX_MASTER * volume, ctx.currentTime, 0.01);
  } catch {
    /* no-op */
  }
}

export const getMasterVolume = () => volume;

/** Per-bus volume 0..1: 'sfx' | 'ui' | 'voice' | 'amb'. Persisted in localStorage. */
export function setBusVolume(name, v) {
  if (!(name in MIX_DEFAULT)) return;
  const n = Number(v);
  if (!Number.isFinite(n)) return;
  mix[name] = clamp01(n);
  saveMix();
  try {
    if (ctx && buses[name]) buses[name].gain.setTargetAtTime(mix[name], ctx.currentTime, 0.02);
  } catch {
    /* no-op */
  }
}

export const getBusVolume = (name) => mix[name] ?? 1;

/** Run fn with default voice destination = bus `name` (synchronous). */
export function withBus(name, fn) {
  const prev = route;
  if (buses[name]) route = buses[name];
  try {
    return fn();
  } finally {
    route = prev;
  }
}

// ---------- helpers ----------

export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
/** Randomize frequency by +-cents. */
export const vary = (f, cents = 40) => f * Math.pow(2, rand(-cents, cents) / 1200);
export const NOTE = (semisFromA4) => 440 * Math.pow(2, semisFromA4 / 12);

export function envGain(t, peak, attack, dur, dest) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, attack + 0.005));
  g.connect(dest || route || sum);
  return g;
}

/** Count a voice; disconnect nodes when the source ends (timer fallback if onended never fires). */
export function track(src, nodes, dur) {
  voices++;
  let done = false;
  const end = () => {
    if (done) return;
    done = true;
    voices = Math.max(0, voices - 1);
    try {
      src.disconnect();
      nodes.forEach((n) => n.disconnect());
    } catch {
      /* ignore */
    }
  };
  src.onended = end;
  setTimeout(end, Math.max(0.2, dur || 0.5) * 1000 + 400);
}

// Saturation (soft clip) for dry mechanical timbres. Shared curve, no oversampling.
let SAT = null;
export function satNode(amount = 3) {
  if (!SAT || SAT.k !== amount) {
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(amount * x) / Math.tanh(amount);
    }
    curve.k = amount;
    SAT = curve;
  }
  const ws = ctx.createWaveShaper();
  ws.curve = SAT;
  ws.oversample = 'none';
  return ws;
}

/**
 * Oscillator voice.
 * o: { type, f, f1, glide:'exp'|'lin', at (delay s), dur, peak, attack, filter:{type,f,f1,q}, vib:{rate,depth}, detune, dest }
 */
export function tone(o) {
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
  }
  osc.connect(head);
  osc.start(t);
  osc.stop(t + dur + 0.05);
  track(osc, nodes, dur + (o.at || 0));
  return osc;
}

/** Filtered noise burst. o: { at, dur, peak, attack, type, f, f1, q, offset, sat, dest } */
export function noise(o) {
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
  const extra = [];
  let head = fl;
  if (o.sat) {
    const sh = satNode();
    extra.push(sh);
    fl.connect(sh);
    head = sh;
  }
  src.connect(fl);
  head.connect(g);
  src.start(t, o.offset ?? Math.random() * 0.9);
  src.stop(t + dur + 0.05);
  track(src, [fl, g, ...extra], dur + (o.at || 0));
  return src;
}

/** Stepped-pitch square (chiptune/digital). */
export function steps(freqs, stepDur, o = {}) {
  freqs.forEach((f, i) =>
    tone({
      type: o.type || 'square',
      f,
      at: (o.at || 0) + i * stepDur,
      dur: stepDur * (o.overlap || 1.2),
      peak: o.peak ?? 0.08,
      attack: 0.002,
      filter: o.filter,
      dest: o.dest,
    })
  );
}

/**
 * Looped noise bed for ambience. Returns { out: GainNode, stop(fadeSec) }.
 * spec: { type, f, f1?, q, peak, lfo?: { rate, depth, target: 'gain'|'freq' } }
 */
export function noiseBed(spec, dest) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  src.loopStart = 0;
  const fl = ctx.createBiquadFilter();
  fl.type = spec.type || 'lowpass';
  fl.frequency.value = spec.f || 800;
  fl.Q.value = spec.q ?? 0.7;
  const g = ctx.createGain();
  g.gain.value = spec.peak ?? 0.1;
  src.connect(fl).connect(g).connect(dest);
  const lfo = [];
  if (spec.lfo) {
    const o = ctx.createOscillator();
    const lg = ctx.createGain();
    o.frequency.value = spec.lfo.rate;
    lg.gain.value = spec.lfo.depth;
    o.connect(lg);
    if (spec.lfo.target === 'freq') lg.connect(fl.frequency);
    else lg.connect(g.gain);
    o.start();
    lfo.push(o, lg);
  }
  src.start(ctx.currentTime, Math.random() * 0.9);
  return {
    out: g,
    stop(fade = 1.5) {
      const t = ctx.currentTime;
      try {
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0.0001, t + fade);
        src.stop(t + fade + 0.1);
        lfo.forEach((n) => { if (n.stop) n.stop(t + fade + 0.1); });
        setTimeout(() => {
          try {
            src.disconnect();
            fl.disconnect();
            g.disconnect();
            lfo.forEach((n) => n.disconnect());
          } catch {
            /* ignore */
          }
        }, (fade + 0.3) * 1000);
      } catch {
        /* ignore */
      }
    },
  };
}
