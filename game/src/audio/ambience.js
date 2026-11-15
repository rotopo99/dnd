// ambience.js — procedural environmental layers (no files). Bus: 'amb'.
//
// API:
//   import { setBiome, stopAmbience } from './audio/ambience.js';
//   setBiome('swamp', { night: true, weather: 'rain' });   // crossfades from the previous layer set
//   stopAmbience(2);                                       // fade out over 2 s
// Biomes: wasteland | swamp | snow | ruins | bunker | factory | port | mutantForest | cyberspace.
// Unknown biome → wasteland. night: beds quieter + crickets (except snow/bunker/cyberspace).
// weather: 'rain' | 'snow' (wind gusts) | null.
// Calling setBiome with the same arguments again does nothing. Silent before initCore().

import { getAudioContext, getBus, noiseBed, tone, noise, rand, pick, withBus, isReady } from './core.js';

const FADE = 3; // crossfade seconds

// Beds: continuous noise. events: scheduled one-shots, every = [minSec, maxSec].
const BIOMES = {
  wasteland: {
    beds: [
      { type: 'lowpass', f: 600, q: 0.5, peak: 0.1, lfo: { rate: 0.07, depth: 0.05, target: 'gain' } },
      { type: 'bandpass', f: 900, q: 2, peak: 0.03, lfo: { rate: 0.2, depth: 300, target: 'freq' } },
    ],
    events: [{ kind: 'metalFar', every: [6, 14] }],
  },
  swamp: {
    beds: [{ type: 'lowpass', f: 900, q: 0.6, peak: 0.05 }],
    events: [{ kind: 'frogs', every: [2.5, 6] }, { kind: 'drip', every: [1.5, 4] }],
    night: { kind: 'frogs', every: [1.5, 3] },
  },
  snow: {
    beds: [
      { type: 'bandpass', f: 1800, q: 0.5, peak: 0.12, lfo: { rate: 0.11, depth: 0.08, target: 'gain' } },
      { type: 'lowpass', f: 500, q: 0.7, peak: 0.1, lfo: { rate: 0.05, depth: 200, target: 'freq' } },
    ],
    events: [],
  },
  ruins: {
    beds: [{ type: 'lowpass', f: 400, q: 0.6, peak: 0.05 }],
    events: [{ kind: 'siren', every: [15, 35] }, { kind: 'crow', every: [5, 12] }],
  },
  bunker: {
    beds: [
      { type: 'lowpass', f: 250, q: 0.7, peak: 0.12 },
      { type: 'bandpass', f: 1200, q: 3, peak: 0.02 },
    ],
    events: [{ kind: 'drip', every: [4, 9] }],
  },
  factory: {
    beds: [{ type: 'lowpass', f: 500, q: 0.7, peak: 0.1, lfo: { rate: 1.3, depth: 0.03, target: 'gain' } }],
    events: [{ kind: 'clank', every: [3, 8] }, { kind: 'hum', every: [10, 20] }],
  },
  port: {
    beds: [{ type: 'lowpass', f: 700, q: 0.6, peak: 0.12, lfo: { rate: 0.12, depth: 0.06, target: 'gain' } }],
    events: [{ kind: 'gull', every: [5, 12] }, { kind: 'creak', every: [6, 14] }],
  },
  mutantForest: {
    beds: [{ type: 'bandpass', f: 1500, q: 0.7, peak: 0.06, lfo: { rate: 0.3, depth: 0.03, target: 'gain' } }],
    events: [{ kind: 'eerie', every: [6, 16] }, { kind: 'rustle', every: [2, 5] }],
  },
  cyberspace: {
    beds: [
      { type: 'lowpass', f: 1200, q: 1.5, peak: 0.07, lfo: { rate: 0.5, depth: 300, target: 'freq' } },
      { type: 'highpass', f: 4000, q: 0.7, peak: 0.015 },
    ],
    events: [{ kind: 'glitch', every: [1.5, 5] }],
  },
};

const WEATHER_BEDS = {
  rain: { type: 'highpass', f: 2500, q: 0.5, peak: 0.08, lfo: { rate: 0.4, depth: 0.02, target: 'gain' } },
  snow: { type: 'lowpass', f: 700, q: 0.7, peak: 0.1, lfo: { rate: 0.09, depth: 300, target: 'freq' } },
};

// Biomes with crickets/night insects at night (not snow, bunker, cyberspace).
const NIGHT_OK = new Set(['wasteland', 'swamp', 'ruins', 'port', 'mutantForest', 'factory']);

// ---------- one-shot events (run inside bus 'amb') ----------

const EVENTS = {
  drip() {
    const f = rand(1400, 2400);
    tone({ type: 'sine', f, f1: f * 0.6, dur: 0.09, peak: 0.06 });
  },
  frogs() {
    const n = 3 + ((Math.random() * 3) | 0);
    const f = rand(150, 260);
    for (let i = 0; i < n; i++) {
      tone({ type: 'square', f: f * rand(0.9, 1.1), f1: f * 0.8, at: i * 0.08, dur: 0.05, peak: 0.035, filter: { type: 'lowpass', f: 800 } });
    }
  },
  metalFar() {
    tone({ type: 'sine', f: rand(600, 900), dur: 0.6, peak: 0.025 });
    noise({ type: 'bandpass', f: 1200, q: 2, at: 0.05, dur: 0.3, peak: 0.02 });
  },
  siren() {
    tone({ type: 'sine', f: 450, f1: 700, dur: 2.2, peak: 0.025, vib: { rate: 5, depth: 20 } });
    tone({ type: 'sine', f: 700, f1: 450, at: 2.2, dur: 2.2, peak: 0.02, vib: { rate: 5, depth: 20 } });
  },
  crow() {
    const n = 2 + ((Math.random() * 2) | 0);
    for (let i = 0; i < n; i++) {
      tone({ type: 'sawtooth', f: rand(380, 460), f1: rand(260, 320), at: i * 0.3, dur: 0.25, peak: 0.045, vib: { rate: 12, depth: 20 }, filter: { type: 'bandpass', f: 900, q: 4 } });
    }
  },
  clank() {
    noise({ type: 'bandpass', f: rand(1500, 2400), q: 6, dur: 0.05, peak: 0.08 });
    tone({ type: 'sine', f: rand(280, 360), dur: 0.15, peak: 0.05 });
  },
  hum() {
    tone({ type: 'sine', f: 60, dur: 3, peak: 0.03 });
    noise({ type: 'lowpass', f: 200, dur: 3, peak: 0.03, attack: 0.3 });
  },
  gull() {
    tone({ type: 'sine', f: rand(1300, 1500), f1: rand(2200, 2500), dur: 0.6, peak: 0.03, vib: { rate: 25, depth: 80 } });
    tone({ type: 'sine', f: 2000, f1: 1300, at: 0.7, dur: 0.5, peak: 0.025, vib: { rate: 20, depth: 60 } });
  },
  creak() {
    tone({ type: 'sawtooth', f: rand(110, 130), f1: rand(170, 190), dur: 1.2, peak: 0.02, filter: { type: 'bandpass', f: 400, q: 6 } });
  },
  eerie() {
    tone({ type: 'sine', f: rand(480, 520), f1: rand(850, 950), dur: 1.4, peak: 0.018, vib: { rate: 4, depth: 60 } });
    noise({ type: 'bandpass', f: 2000, dur: 1.2, peak: 0.01, attack: 0.4 });
  },
  rustle() {
    noise({ type: 'bandpass', f: rand(2000, 3000), q: 0.6, dur: 0.6, peak: 0.03, attack: 0.2 });
  },
  glitch() {
    const n = 2 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) {
      tone({ type: 'square', f: rand(2000, 6000), at: i * 0.02, dur: 0.02, peak: 0.02 });
    }
    noise({ type: 'highpass', f: 6000, dur: 0.02, peak: 0.01 });
  },
  crickets() {
    for (let i = 0; i < 8; i++) tone({ type: 'square', f: rand(4300, 4700), at: i * 0.07, dur: 0.02, peak: 0.01 });
  },
};

// ---------- layer groups ----------

let cur = null; // { key, g, beds, timers, alive }

function scaleBed(b, k) {
  return { ...b, peak: b.peak * k };
}

function buildGroup(biome, opts) {
  const ctx = getAudioContext();
  const amb = getBus('amb');
  const spec = BIOMES[biome] || BIOMES.wasteland;
  const night = !!opts.night;
  const k = night ? 0.6 : 1;
  const now = ctx.currentTime;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(1, now + (opts.fade ?? FADE));
  g.connect(amb);

  const beds = spec.beds.map((b) => noiseBed(scaleBed(b, k), g));
  if (opts.weather && WEATHER_BEDS[opts.weather]) beds.push(noiseBed(scaleBed(WEATHER_BEDS[opts.weather], k), g));

  const grp = { key: '', g, beds, timers: [], alive: true, fade: opts.fade ?? FADE };
  const events = [...spec.events];
  if (night && spec.night) events.push(spec.night);
  if (night && NIGHT_OK.has(biome)) events.push({ kind: 'crickets', every: [1.2, 2.5] });
  events.forEach((ev) => scheduleEvent(grp, ev));
  return grp;
}

function scheduleEvent(grp, ev) {
  const fire = () => {
    if (!grp.alive) return;
    const fn = EVENTS[ev.kind];
    if (fn) {
      try {
        withBus('amb', fn);
      } catch {
        /* never throw from audio */
      }
    }
    grp.timers.push(setTimeout(fire, rand(ev.every[0], ev.every[1]) * 1000));
  };
  grp.timers.push(setTimeout(fire, rand(0, ev.every[1]) * 1000));
}

function stopGroup(grp, fade) {
  grp.alive = false;
  grp.timers.forEach((id) => clearTimeout(id));
  grp.timers = [];
  try {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    grp.g.gain.cancelScheduledValues(t);
    grp.g.gain.setValueAtTime(grp.g.gain.value, t);
    grp.g.gain.linearRampToValueAtTime(0.0001, t + fade);
    setTimeout(() => {
      grp.beds.forEach((b) => b.stop(0.05));
      try {
        grp.g.disconnect();
      } catch {
        /* ignore */
      }
    }, fade * 1000 + 150);
  } catch {
    /* ignore */
  }
}

/**
 * Switch ambience layers. Crossfades over FADE seconds.
 * opts: { night?: boolean, weather?: 'rain'|'snow'|null, fade?: seconds }
 */
export function setBiome(biome, opts = {}) {
  try {
    if (!isReady() || !getAudioContext()) return;
    const key = `${biome}|${opts.night ? 1 : 0}|${opts.weather || ''}`;
    if (cur && cur.key === key) return;
    const next = buildGroup(biome, opts);
    next.key = key;
    if (cur) stopGroup(cur, opts.fade ?? FADE);
    cur = next;
  } catch {
    /* never throw from audio */
  }
}

/** Fade out all ambience. */
export function stopAmbience(fade = 1.5) {
  try {
    if (cur) stopGroup(cur, fade);
    cur = null;
  } catch {
    /* never throw from audio */
  }
}

export const AMBIENCE_BIOMES = Object.freeze(Object.keys(BIOMES));

/*
 * Подключение (одна строка на место; логика выбора биома — в месте вызова):
 *  - game/src/scenes/roam.js (вход на свободную карту и смена узла): setBiome(node.biome, { night: isNight(time), weather: save.weather })
 *  - game/src/scenes/battle.js (старт боя на поле): setBiome(S.map.biome, { night: S.map.tod === 'night', weather: S.map.weather })
 *  - game/src/scenes/world-map.js (карта мира, нейтральный фон): setBiome('wasteland')
 *  - game/src/scenes/cyberspace.js (вход в киберпространство): setBiome('cyberspace'); выход — stopAmbience(1)
 *  - game/src/scenes/menu.js или main.js при уходе в меню: stopAmbience(2)
 * Пока не подключено: сейчас в проекте нет вызовов, звук ambience не слышен.
 */
