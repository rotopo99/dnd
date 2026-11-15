// vox.js — voice without words: formant-synthesised vocalisations (no samples).
//
// API:
//   import { say, choir } from './audio/vox.js';
//   say('grunt', { gender: 'f', race: 'android' });   // kinds: sigh grunt scream laugh hm battleCry
//   choir([NOTE(0), NOTE(4), NOTE(7)], { at: 0, dur: 1.2, peak: 0.1 });  // sung "ah" pad (level-up)
//
// Gender: sets the fundamental (m ~100-125 Hz, f ~215-245 Hz) and formant shift.
// Race (`race` opt): human (default) | android (vocoder: square carrier, narrow formants, 45 Hz tremolo)
//   | skeleton (dry: no vibrato, breath noise, short tail) | mutant (growl: detuned saw, saturation, 25 Hz AM).
//   Unknown race ids fall back to human.
// Output: bus 'voice'. Silent no-op before initCore().

import { getAudioContext, getBus, envGain, track, rand, satNode, withBus, noise } from './core.js';

// Formant centres (Hz) per vowel.
const VOWELS = {
  a: [800, 1200, 2800],
  e: [450, 2000, 2800],
  i: [300, 2300, 3000],
  o: [450, 800, 2830],
  u: [350, 700, 2500],
  ah: [700, 1100, 2600],
};
const FORMANT_GAIN = [1, 0.6, 0.35];

const RACE_FX = {
  human: { osc: 'sawtooth', q: 6, gains: [1, 0.6, 0.35], breath: 1, sat: 0, tremolo: 0, durK: 1 },
  android: { osc: 'square', q: 14, gains: [1, 0.8, 0.5], breath: 0, sat: 0, tremolo: 45, durK: 1 },
  skeleton: { osc: 'sawtooth', q: 9, gains: [0.7, 0.4, 0.2], breath: 1.6, sat: 0, tremolo: 0, durK: 0.75 },
  mutant: { osc: 'sawtooth', q: 4, gains: [1, 0.7, 0.5], breath: 0.6, sat: 6, tremolo: 25, durK: 1.1 },
};

/**
 * One formant syllable.
 * o: { f0, f1, dur, vowel, at, peak, attack, gender, race, breath }
 */
function formant(o) {
  const ctx = getAudioContext();
  const dest = getBus('voice');
  if (!ctx || !dest) return;
  const fx = RACE_FX[o.race] || RACE_FX.human;
  const dur = Math.max(0.05, o.dur * fx.durK);
  const at = o.at || 0;
  const t = ctx.currentTime + at;
  const k = o.gender === 'f' ? 1.15 : 1;

  const osc = ctx.createOscillator();
  osc.type = fx.osc;
  osc.frequency.setValueAtTime(o.f0, t);
  if (o.f1 && o.f1 !== o.f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + dur);

  const env = envGain(t, o.peak ?? 0.2, o.attack ?? 0.01, dur, dest);
  const sum = ctx.createGain();
  sum.gain.value = 1;
  const nodes = [env, sum];
  if (fx.sat) {
    const sh = satNode(fx.sat);
    sum.connect(sh);
    sh.connect(env);
    nodes.push(sh);
  } else {
    sum.connect(env);
  }

  const fs = VOWELS[o.vowel] || VOWELS.a;
  fs.forEach((f, i) => {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f * k;
    bp.Q.value = fx.q;
    const wg = ctx.createGain();
    wg.gain.value = fx.gains[i] * FORMANT_GAIN[i];
    osc.connect(bp).connect(wg).connect(sum);
    nodes.push(bp, wg);
  });

  if (fx.tremolo) {
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = fx.tremolo;
    lg.gain.value = (o.peak ?? 0.2) * 0.5;
    lfo.connect(lg).connect(env.gain);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
  }

  osc.start(t);
  osc.stop(t + dur + 0.05);
  track(osc, nodes, dur + at);

  const breath = (o.breath ?? 0) * fx.breath;
  if (breath > 0) {
    withBus('voice', () =>
      noise({ type: 'bandpass', f: 2600 * k, q: 1.2, dur: dur * 0.9, at, peak: breath * (o.peak ?? 0.2) * 0.6, attack: Math.min(0.05, dur * 0.3) })
    );
  }
}

const KINDS = {
  // вздох: медленный, тихий, «у»
  sigh(b, g, r) {
    formant({ f0: b * 1.08, f1: b * 0.7, dur: 0.7, vowel: 'u', peak: 0.12, attack: 0.14, gender: g, race: r, breath: 0.25 });
  },
  // кряхтение при ударе: короткий толчок
  grunt(b, g, r) {
    formant({ f0: b * 0.85, f1: b * 0.6, dur: 0.2, vowel: 'a', peak: 0.28, attack: 0.004, gender: g, race: r, breath: 0.35 });
  },
  // вскрик при смерти: вверх, долго, с дыханием
  scream(b, g, r) {
    formant({ f0: b * 1.3, f1: b * 1.7, dur: 0.95, vowel: 'a', peak: 0.3, attack: 0.02, gender: g, race: r, breath: 0.5 });
  },
  // смешок: три коротких «ха»
  laugh(b, g, r) {
    for (let i = 0; i < 3; i++) {
      formant({ f0: b * 1.12, f1: b * 0.92, at: i * 0.13, dur: 0.1, vowel: 'a', peak: 0.22, attack: 0.005, gender: g, race: r, breath: 0.4 });
    }
  },
  // «хм» в диалоге: закрытое «м-у», задумчиво
  hm(b, g, r) {
    formant({ f0: b * 0.92, f1: b * 0.86, dur: 0.38, vowel: 'u', peak: 0.18, attack: 0.04, gender: g, race: r, breath: 0.05 });
  },
  // боевой клич: длинный подъём + низкий хрип
  battleCry(b, g, r) {
    formant({ f0: b * 1.2, f1: b * 1.5, dur: 0.7, vowel: 'ah', peak: 0.32, attack: 0.02, gender: g, race: r, breath: 0.6 });
    formant({ f0: b * 0.5, f1: b * 0.5, dur: 0.7, vowel: 'u', peak: 0.12, attack: 0.02, gender: g, race: r });
  },
};

/**
 * Play a wordless vocalisation.
 * opts: { gender: 'm'|'f', race: 'human'|'android'|'skeleton'|'mutant', pitch?: Hz }
 */
export function say(kind, opts = {}) {
  try {
    const fn = KINDS[kind];
    if (!fn || !getAudioContext() || !getBus('voice')) return;
    const g = opts.gender === 'f' ? 'f' : 'm';
    const r = RACE_FX[opts.race] ? opts.race : 'human';
    const base = opts.pitch || (g === 'f' ? rand(215, 245) : rand(100, 125)) * (r === 'mutant' ? 0.8 : 1);
    fn(base, g, r);
  } catch {
    /* never throw from audio */
  }
}

/** Sung «ah» pad on given frequencies (choir for level-up / fanfare). */
export function choir(freqs, opts = {}) {
  try {
    if (!getAudioContext() || !getBus('voice')) return;
    const at = opts.at || 0;
    const dur = opts.dur || 1.2;
    const peak = opts.peak ?? 0.1;
    freqs.forEach((f, i) => {
      formant({ f0: f, f1: f * 1.01, dur, vowel: i % 2 ? 'o' : 'ah', peak: peak / Math.sqrt(freqs.length), attack: 0.25, gender: 'm', race: 'human', at: at + i * 0.04 });
    });
  } catch {
    /* never throw from audio */
  }
}

export const VOX_KINDS = Object.freeze(Object.keys(KINDS));

/*
 * Подключение: через sfx.js.
 *  - play('hit', { ..., vox: { gender, race } }) → grunt; play('death', { vox }) → scream (опция передаётся, пока никто не передаёт).
 *  - play('vox', { kind: 'hm' | 'laugh' | 'sigh' | 'battleCry', gender, race }) — точки вызова не подключены
 *    (кандидаты: scenes/dialogue.js реплика без эмоции, старт боя в scenes/battle.js).
 *  - choir() вызывается из sfx-ui.js (levelUp).
 */
