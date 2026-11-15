// sfx-foley.js — body and combat foley: footsteps by surface, weapon swings, armour impacts,
// falls, surface/elemental ambience-on-event, ability sounds. All synthesized (core.js primitives).
//
// Exposed through sfx.js: play('step', {surface, sneak, heavy}), play('swing', {weapon}),
// play('armorHit', {mat}), play('bodyFall', {weight}), play('surface', {kind}), play('ability', {kind}).
// Also imported directly if needed: import { FOLEY } from './sfx-foley.js'.

import { noise, tone, steps, rand, vary, withBus } from './core.js';

const onBus = (fn) => withBus('sfx', fn);

// ---------- footsteps ----------

// Per-surface recipe. `n` = noise {type,f,q,dur,peak}, `t` = thump sine {f,f1,dur,peak}, `x` = extra voice fn.
const SURFACE = {
  concrete: {
    n: { type: 'bandpass', f: 1400, q: 1.2, dur: 0.04, peak: 0.22 },
    t: { f: 150, f1: 70, dur: 0.05, peak: 0.18 },
  },
  metal: {
    n: { type: 'bandpass', f: 3500, q: 4, dur: 0.025, peak: 0.2 },
    t: { f: 1150, f1: 1100, dur: 0.12, peak: 0.05, type: 'sine' },
    ring: 2230,
  },
  mud: {
    n: { type: 'lowpass', f: 420, f1: 180, q: 0.8, dur: 0.12, peak: 0.3 },
    t: { f: 90, f1: 50, dur: 0.08, peak: 0.2 },
    squelch: true,
  },
  snow: {
    n: { type: 'highpass', f: 2500, q: 0.7, dur: 0.08, peak: 0.15 },
    t: { f: 260, f1: 180, dur: 0.05, peak: 0.05 },
    crunch: 1800,
  },
  water: {
    n: { type: 'bandpass', f: 1200, q: 0.6, dur: 0.15, peak: 0.15 },
    t: { f: 400, f1: 900, dur: 0.12, peak: 0.05 },
  },
  wood: {
    n: { type: 'bandpass', f: 2000, q: 8, dur: 0.02, peak: 0.18 },
    t: { f: 300, f1: 200, dur: 0.03, peak: 0.06, type: 'square' },
  },
  grass: {
    n: { type: 'highpass', f: 3500, q: 0.7, dur: 0.1, peak: 0.08 },
    t: { f: 2200, f1: 2000, dur: 0.12, peak: 0.04 },
    rustle: true,
  },
};

/** Footstep. opts: { surface='concrete', sneak=false (тише, темнее), heavy=false (тяжёлый, броня/груз) } */
function step(opts = {}) {
  onBus(() => {
    const s = SURFACE[opts.surface] || SURFACE.concrete;
    const sneak = !!opts.sneak;
    const k = (sneak ? 0.32 : 1) * (opts.heavy ? 1.3 : 1);
    const cut = sneak ? 0.55 : 1; // sneaking: lower filter cut-off, no metal ring
    const n = s.n;
    noise({ type: n.type, f: vary(n.f * cut, 150), f1: n.f1 ? n.f1 * cut : undefined, q: n.q, dur: n.dur, peak: n.peak * k, attack: 0.001, sat: true });
    const t = s.t;
    tone({ type: t.type || 'sine', f: vary(t.f, 80), f1: t.f1, dur: t.dur, peak: t.peak * k, attack: 0.002 });
    if (s.ring && !sneak) {
      tone({ type: 'sine', f: vary(s.ring, 30), dur: 0.14, peak: 0.04 * k, attack: 0.002 });
      tone({ type: 'sine', f: vary(s.ring * 1.5, 30), dur: 0.1, peak: 0.02 * k, attack: 0.002 });
    }
    if (s.squelch) noise({ type: 'bandpass', f: vary(900, 100), q: 1.5, at: 0.03, dur: 0.07, peak: 0.12 * k, attack: 0.01 });
    if (s.crunch) for (let i = 0; i < 2; i++) noise({ type: 'highpass', f: vary(s.crunch, 200), at: rand(0, 0.04), dur: 0.02, peak: 0.1 * k });
    if (s.rustle) noise({ type: 'bandpass', f: 2200, q: 0.8, at: 0.02, dur: 0.12, peak: 0.07 * k, attack: 0.03 });
  });
}

// ---------- weapon swings (hit/miss sounds stay in sfx.js HIT table) ----------

const WEAPON = {
  knife() {
    noise({ type: 'highpass', f: vary(6000, 100), dur: 0.03, peak: 0.16, attack: 0.001 });
    tone({ type: 'sine', f: vary(2000), f1: 800, dur: 0.03, peak: 0.05 });
  },
  club() {
    // дубина/молот: тяжёлый свист и глухой удар следом
    noise({ type: 'bandpass', f: 600, f1: 200, q: 1, dur: 0.15, peak: 0.16, attack: 0.02 });
    tone({ type: 'sine', f: vary(90), f1: 40, at: 0.1, dur: 0.1, peak: 0.12 });
  },
  sword() {
    noise({ type: 'bandpass', f: vary(3000), f1: 1500, q: 3, dur: 0.12, peak: 0.2, attack: 0.02 });
    tone({ type: 'triangle', f: vary(1600), f1: 900, dur: 0.1, peak: 0.03 });
  },
  pistol() {
    noise({ type: 'bandpass', f: vary(1500, 80), q: 1, dur: 0.04, peak: 0.5, attack: 0.001, sat: true });
    tone({ type: 'sine', f: vary(150), f1: 60, dur: 0.06, peak: 0.2 });
    noise({ type: 'highpass', f: 4000, at: 0.02, dur: 0.05, peak: 0.08 });
  },
  auto() {
    // очередь: 5–6 коротких выстрелов с разбросом высоты
    const n = 5 + ((Math.random() * 2) | 0);
    for (let i = 0; i < n; i++) {
      noise({ type: 'bandpass', f: vary(1400, 120), q: 1, at: i * 0.065, dur: 0.035, peak: 0.36, attack: 0.001, sat: true });
      tone({ type: 'sine', f: vary(140, 60), at: i * 0.065, dur: 0.045, peak: 0.12 });
    }
  },
  shotgun() {
    noise({ type: 'lowpass', f: 2000, f1: 300, q: 0.7, dur: 0.25, peak: 0.55, attack: 0.001, sat: true });
    tone({ type: 'sine', f: vary(80), f1: 30, dur: 0.2, peak: 0.3 });
    noise({ type: 'highpass', f: 2500, at: 0.04, dur: 0.1, peak: 0.12 });
  },
  energy() {
    tone({ type: 'square', f: vary(900), f1: 200, dur: 0.15, peak: 0.07, filter: { type: 'lowpass', f: 2000, f1: 400 } });
    noise({ type: 'highpass', f: 5000, dur: 0.05, peak: 0.08 });
  },
  bow() {
    // тетива: свист стрелы и короткий «дзынь»
    noise({ type: 'bandpass', f: 4000, f1: 1500, q: 2, dur: 0.12, peak: 0.15, attack: 0.03 });
    tone({ type: 'sine', f: vary(220), f1: 180, dur: 0.08, peak: 0.1, vib: { rate: 30, depth: 8 } });
  },
  thrown() {
    noise({ type: 'bandpass', f: vary(2500), f1: 1200, q: 1.5, dur: 0.1, peak: 0.1, attack: 0.02 });
  },
};
WEAPON.axe = WEAPON.club;
WEAPON.mace = WEAPON.club;
WEAPON.hammer = WEAPON.club;
WEAPON.sword2h = WEAPON.sword;
WEAPON.rifle = WEAPON.pistol;
WEAPON.smg = WEAPON.auto;

/** Swing / shot before the hit resolves. opts: { weapon: 'knife'|'club'|'sword'|'pistol'|'auto'|'shotgun'|'energy'|'bow'|'thrown' } */
function swing(opts = {}) {
  const fn = WEAPON[opts.weapon] || WEAPON.sword;
  onBus(fn);
}

// ---------- armour impacts ----------

const ARMOR = {
  cloth() {
    noise({ type: 'bandpass', f: vary(1200), q: 0.8, dur: 0.05, peak: 0.2, attack: 0.002 });
  },
  leather() {
    noise({ type: 'bandpass', f: vary(1800), q: 1.5, dur: 0.035, peak: 0.22, attack: 0.001 });
    tone({ type: 'sine', f: vary(160), f1: 90, dur: 0.05, peak: 0.08 });
  },
  metal() {
    // звон металла: два inharmonic-партиала
    tone({ type: 'sine', f: vary(1400, 30), dur: 0.25, peak: 0.12, attack: 0.001 });
    tone({ type: 'sine', f: vary(2100, 30), dur: 0.18, peak: 0.06, attack: 0.001 });
    noise({ type: 'highpass', f: 5000, dur: 0.02, peak: 0.12 });
  },
  fur() {
    noise({ type: 'lowpass', f: 800, q: 0.7, dur: 0.07, peak: 0.25, attack: 0.002 });
    tone({ type: 'sine', f: vary(120), f1: 60, dur: 0.07, peak: 0.12 });
  },
};
ARMOR.kevlar = ARMOR.cloth;
ARMOR.plate = ARMOR.metal;
ARMOR.hide = ARMOR.leather;

/** Hit landing on armour (plays together with the hit timbre). opts: { mat: 'cloth'|'leather'|'metal'|'fur' } */
function armorHit(opts = {}) {
  const fn = ARMOR[opts.mat] || ARMOR.leather;
  onBus(fn);
}

// ---------- falls ----------

/** Body hits the ground. opts: { weight: 'light'|'heavy' } */
function bodyFall(opts = {}) {
  onBus(() => {
    if (opts.weight === 'light') {
      noise({ type: 'lowpass', f: 1200, f1: 200, q: 0.7, dur: 0.15, peak: 0.2, attack: 0.002 });
      tone({ type: 'sine', f: vary(180), f1: 90, dur: 0.1, peak: 0.1 });
    } else {
      noise({ type: 'lowpass', f: 400, f1: 90, q: 0.7, dur: 0.25, peak: 0.4, attack: 0.002, sat: true });
      tone({ type: 'sine', f: vary(70), f1: 35, dur: 0.3, peak: 0.3 });
      noise({ type: 'bandpass', f: 1500, q: 1, at: 0.05, dur: 0.05, peak: 0.12 });
    }
  });
}

// ---------- surfaces (огонь, ток, вода, лёд, кислота, газ) ----------

const SURF = {
  fire() {
    // треск: серия мелких щелчков на фоне гула
    for (let i = 0; i < 6; i++) noise({ type: 'highpass', f: vary(2500, 300), at: rand(0, 0.45), dur: 0.012, peak: rand(0.06, 0.14), sat: true });
    noise({ type: 'bandpass', f: 800, q: 0.6, dur: 0.5, peak: 0.1, attack: 0.05 });
  },
  shock() {
    // ток: жужжание 60 Гц с амплитудной модуляцией и искры
    tone({ type: 'sawtooth', f: vary(100), dur: 0.45, peak: 0.07, filter: { type: 'bandpass', f: 500, q: 2 }, vib: { rate: 60, depth: 4 } });
    for (let i = 0; i < 4; i++) noise({ type: 'highpass', f: 6000, at: rand(0, 0.4), dur: 0.015, peak: 0.14 });
  },
  water() {
    tone({ type: 'sine', f: vary(500), f1: 1400, dur: 0.1, peak: 0.07 });
    noise({ type: 'bandpass', f: 1500, q: 0.8, dur: 0.14, peak: 0.16, attack: 0.01 });
  },
  ice() {
    for (let i = 0; i < 4; i++) {
      noise({ type: 'highpass', f: vary(4000), at: rand(0, 0.08), dur: 0.015, peak: 0.13 });
      tone({ type: 'square', f: vary(1700, 200), at: rand(0, 0.08), dur: 0.02, peak: 0.02 });
    }
  },
  acid() {
    noise({ type: 'highpass', f: 3000, dur: 0.6, peak: 0.08, attack: 0.02 });
    for (let i = 0; i < 4; i++) tone({ type: 'sine', f: vary(300 + i * 80, 100), f1: vary(600 + i * 90, 100), at: i * 0.1, dur: 0.07, peak: 0.07 });
  },
  gas() {
    // шипение-выдох: фильтр уходит вниз
    noise({ type: 'lowpass', f: 900, f1: 200, q: 0.7, dur: 0.9, peak: 0.2, attack: 0.2 });
  },
};

/** Elemental surface event. opts: { kind: 'fire'|'shock'|'water'|'ice'|'acid'|'gas' } */
function surface(opts = {}) {
  const fn = SURF[opts.kind];
  if (fn) onBus(fn);
}

// ---------- ability sounds (кринж, прокси, кибер) ----------

const ABILITY = {
  cringe() {
    // искажённый вой + «скретч» пластинки
    tone({ type: 'sawtooth', f: vary(260, 60), f1: vary(190, 40), dur: 0.5, peak: 0.12, vib: { rate: 7, depth: 30 }, filter: { type: 'bandpass', f: 900, f1: 500, q: 3 } });
    noise({ type: 'bandpass', f: 3000, f1: 500, q: 5, at: 0.1, dur: 0.25, peak: 0.12, sat: true });
  },
  proxy() {
    // глухой гул и фазовый сдвиг: два расстроенных тона «гуляют» друг относительно друга
    tone({ type: 'sine', f: 110, dur: 0.6, peak: 0.12 });
    tone({ type: 'sine', f: 111.8, f1: 117, dur: 0.6, peak: 0.12 });
    noise({ type: 'bandpass', f: 1800, q: 4, at: 0.3, dur: 0.2, peak: 0.05 });
  },
  cyber() {
    // биткраш: пара квантованных ступеней + цифровой писк очень тихо
    const seq = Array.from({ length: 5 }, () => vary(2400 + Math.floor(rand(0, 4)) * 300, 0));
    steps(seq, 0.022, { type: 'square', peak: 0.035, filter: { type: 'lowpass', f: 4000 } });
    noise({ type: 'highpass', f: 7000, dur: 0.03, peak: 0.06 });
  },
};

/** Ability sound. opts: { kind: 'cringe'|'proxy'|'cyber' } */
function ability(opts = {}) {
  const fn = ABILITY[opts.kind];
  if (fn) onBus(fn);
}

export const FOLEY = Object.freeze({ step, swing, armorHit, bodyFall, surface, ability });
export const FOLEY_SURFACES = Object.freeze(Object.keys(SURFACE));
export const FOLEY_WEAPONS = Object.freeze(Object.keys(WEAPON));

/*
 * Подключение: НЕ подключено (кандидаты; вызывать через play() из sfx.js). Старый play('step') работает без опций.
 *  - step: game/src/scenes/roam.js (шаг героя по свободной карте: surface = биом узла, sneak = режим «красться», heavy = тяжёлая броня).
 *    Старый play('step') без опций тоже работает (бетон).
 *  - swing: game/src/scenes/battle.js и battle-log.js eventSound (атака: weapon из предмета `weaponType`).
 *  - armorHit: battle-log.js eventSound (попадание по броне, mat из `armorType`).
 *  - bodyFall: game/src/scenes/battle.js (смерть юнита: weight = 'heavy' для мехов/крупных, иначе 'light').
 *  - surface: battle-log.js eventSound (событие поверхности: kind = тип поверхности).
 *  - ability: battle-log.js eventSound (событие способности кринж/прокси/кибер).
 */
