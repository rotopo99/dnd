// sfx-radio.js — jingles and stingers of the radio «Голос Пустошей» (1–3 s each, procedural, no files).
// Ids = `track` of RADIO.jingles (data/world/radio.js); scenes/radio.js calls play(track) before the news.
// Plus generic stingers: radio-station-id (DJ Шумок), radio-news-bleep, radio-glitch (not wired yet).
// Each jingle stays at ~16 sources or fewer (voice limit in core.js). Pitch is randomized ±20–30 cents.
// Merged into the sound table in sfx.js.

import { tone, noise, steps, vary, NOTE } from './core.js';

// accordion / garmon-like reed: square through a bandpass
const reed = (f, at, dur, peak) => tone({ type: 'square', f, at, dur, peak, filter: { type: 'bandpass', f: 1100, q: 2.5 } });

export const RADIO_SOUNDS = {
  // Шипение и гудение: шум, сетевой гул 50 Гц и «счёт до семи» тиками
  'radio-static-hum'() {
    noise({ type: 'bandpass', f: 3000, q: 0.5, dur: 1.8, peak: 0.05, attack: 0.15 });
    tone({ type: 'sine', f: vary(50, 20), dur: 1.8, peak: 0.06, attack: 0.15 });
    for (let i = 0; i < 7; i++) {
      tone({ type: 'square', f: vary(1300, 40), at: 0.2 + i * 0.2, dur: 0.035, peak: 0.035, filter: { type: 'lowpass', f: 2000 } });
    }
    noise({ type: 'highpass', f: 5000, at: 0.9, dur: 0.02, peak: 0.12 }); // crackle
  },

  // Аккордеон «поляна»: oom-pah в 2/4, мелодия из четырёх нот
  'radio-polka-accordion'() {
    const B = 0.25;
    const f = vary(NOTE(-12), 30);
    [0, 2, 4].forEach((k) => {
      tone({ type: 'sine', f, at: k * B, dur: 0.18, peak: 0.22 }); // oom
      reed(f * 1.5, (k + 1) * B, 0.16, 0.05); // pah
    });
    [0, 2, 4, 2].forEach((s, i) => {
      tone({ type: 'square', f: vary(NOTE(s), 25), at: i * B * 1.5, dur: 0.25, peak: 0.07, filter: { type: 'lowpass', f: 1800 } });
    });
  },

  // Медленный рок: три power-аккорда с перебором, последний на тон выше
  'radio-rock-slow'() {
    [0, 0.55, 1.1].forEach((at, i) => {
      const f = vary(NOTE(-24), 20) * (i === 2 ? 1.122 : 1);
      const fl = { type: 'lowpass', f: 900, q: 2 };
      tone({ type: 'sawtooth', f, at, dur: 0.5, peak: 0.12, attack: 0.005, filter: fl });
      tone({ type: 'sawtooth', f: f * 1.5, at, dur: 0.5, peak: 0.08, attack: 0.005, filter: fl });
      noise({ type: 'highpass', f: 2500, at, dur: 0.03, peak: 0.12 }); // pick
    });
  },

  // Синтезатор «Ночь в Коррупции»: грустный арпеджио-цикл и широкий пэд
  'radio-synth-cringe'() {
    const base = vary(NOTE(-9), 25);
    const seq = [0, 3, 7, 10, 12, 10, 7, 3].map((s) => base * Math.pow(2, s / 12));
    steps(seq, 0.13, { type: 'sawtooth', peak: 0.06, filter: { type: 'lowpass', f: 1600 } });
    tone({ type: 'triangle', f: base * 0.5, dur: 1.5, peak: 0.14 });
    tone({ type: 'sine', f: base * 0.5 * 1.006, dur: 1.5, peak: 0.1 });
  },

  // Бодрый марш АИ: механический бит с тактовым сбоем, фанфара «сухо»
  'radio-march-aip'() {
    const B = 0.25;
    for (let i = 0; i < 6; i++) tone({ type: 'sine', f: vary(70, 20), f1: 45, at: i * B, dur: 0.12, peak: 0.3 });
    [1, 3, 5].forEach((i) => noise({ type: 'bandpass', f: 1800, q: 1, at: i * B, dur: 0.04, peak: 0.1 }));
    [-2, -2, -2, 3].forEach((s, i) => {
      tone({ type: 'square', f: vary(NOTE(s), 15), at: i * B, dur: 0.22, peak: 0.07, filter: { type: 'lowpass', f: 2200 } });
    });
  },

  // Жестяное братство: четыре ноты с металлическим призвуком и лязгом
  'radio-folk-tin'() {
    [-5, -3, 0, 2].forEach((s, i) => {
      const f = vary(NOTE(s), 15);
      const at = i * 0.3;
      tone({ type: 'triangle', f, at, dur: 0.4, peak: 0.12 });
      tone({ type: 'sine', f: f * 2.76, at, dur: 0.2, peak: 0.03 }); // inharmonic tin ring
      noise({ type: 'highpass', f: 5000, at, dur: 0.03, peak: 0.1 }); // clank
    });
  },

  // Шанти «Йо-хо»: призыв и ответ, хлопок на ответе, низкий дрон
  'radio-shanty-pirate'() {
    const lo = { type: 'lowpass', f: 1200, q: 1.5 };
    [-7, -5, -2].forEach((s, i) => tone({ type: 'sawtooth', f: vary(NOTE(s), 20), at: i * 0.28, dur: 0.25, peak: 0.09, filter: lo }));
    [0, -2, -5].forEach((s, i) => tone({ type: 'sawtooth', f: vary(NOTE(s), 20), at: 1.0 + i * 0.28, dur: 0.3, peak: 0.09, filter: lo }));
    [1.0, 1.28].forEach((at) => noise({ type: 'bandpass', f: 1500, q: 2, at, dur: 0.05, peak: 0.15 })); // clap
    tone({ type: 'sine', f: vary(NOTE(-19), 15), dur: 1.9, peak: 0.1 });
  },

  // Рокочущий бубен и шёпот в помехах: четыре удара, шёпот, гул «старого бога»
  'radio-drone-tekhonki'() {
    [0, 0.45, 0.9, 1.35].forEach((at) => tone({ type: 'sine', f: vary(90, 20), f1: 40, at, dur: 0.3, peak: 0.25 }));
    noise({ type: 'bandpass', f: 1500, f1: 3000, q: 6, dur: 2.0, peak: 0.05, attack: 0.3 });
    tone({ type: 'sawtooth', f: vary(110, 15), dur: 2.0, peak: 0.06, vib: { rate: 5, depth: 8 }, filter: { type: 'lowpass', f: 400 } });
  },

  // Колыбельная: музыкальная шкатулка, нисходящая фраза с обертоном
  'radio-lullaby'() {
    [[0, 7], [0.5, 5], [1.0, 3], [1.5, 0]].forEach(([at, s]) => {
      const f = vary(NOTE(s), 15);
      tone({ type: 'sine', f, at, dur: 0.9, peak: 0.12, attack: 0.003 });
      tone({ type: 'sine', f: f * 2, at, dur: 0.5, peak: 0.03, attack: 0.003 });
    });
  },

  // Бункерные танцы: четыре бочки, офф-бит хэты, сабовый бас
  'radio-dance-bunker'() {
    const B = 0.45;
    for (let i = 0; i < 4; i++) {
      tone({ type: 'sine', f: vary(120, 15), f1: 40, at: i * B, dur: 0.2, peak: 0.3 });
      noise({ type: 'highpass', f: 7000, at: i * B + B / 2, dur: 0.04, peak: 0.08 });
      tone({ type: 'sawtooth', f: vary(NOTE(-24), 10), at: i * B, dur: 0.3, peak: 0.1, filter: { type: 'lowpass', f: 300 } });
    }
  },

  // Танго одинокого дальнобойщика: хабанера-акценты, спад в минор, кастаньеты
  'radio-tango-sad'() {
    const lo = { type: 'lowpass', f: 1400, q: 2 };
    [[0, -2], [0.4, -4], [0.6, -5], [1.0, -7]].forEach(([at, s]) => {
      tone({ type: 'sawtooth', f: vary(NOTE(s), 20), at, dur: 0.3, peak: 0.1, filter: lo });
    });
    tone({ type: 'sine', f: vary(NOTE(-19), 15), dur: 1.6, peak: 0.14 });
    [0, 0.6].forEach((at) => noise({ type: 'bandpass', f: 2000, q: 3, at, dur: 0.03, peak: 0.1 }));
  },

  // Гимн «мы ни при чём»: три органных аккорда, каждый чуть расстроен
  'radio-hymn-neutral'() {
    [[0, [-9, -2, 3]], [0.9, [-7, -2, 2]], [1.8, [-9, -5, 0]]].forEach(([at, chord]) => {
      chord.forEach((s, i) => tone({ type: 'triangle', f: vary(NOTE(s - 12), 10), at, dur: 0.9, peak: 0.1 / (1 + i * 0.5), attack: 0.05 }));
    });
  },

  // DJ Шумок, позывной: «Голос Пустошей» — трёхнотный росчерк и дыхание шипения
  'radio-station-id'() {
    steps([NOTE(3), NOTE(7), NOTE(10)].map((f) => vary(f, 15)), 0.16, { type: 'triangle', peak: 0.16 });
    noise({ type: 'bandpass', f: 2500, q: 1, at: 0.05, dur: 0.6, peak: 0.05, attack: 0.05 });
    tone({ type: 'sine', f: vary(NOTE(-12), 15), at: 0.5, dur: 0.8, peak: 0.1 });
  },

  // Новостной «бип» цензуры: два коротких тона и хвост шипения
  'radio-news-bleep'() {
    const lo = { type: 'lowpass', f: 3000 };
    tone({ type: 'square', f: vary(1000, 10), dur: 0.12, peak: 0.07, filter: lo });
    tone({ type: 'square', f: vary(1500, 10), at: 0.14, dur: 0.12, peak: 0.07, filter: lo });
    noise({ type: 'highpass', f: 4000, at: 0.28, dur: 0.12, peak: 0.03 });
  },

  // Странный сигнал: скачки высоты, треск и короткий уходящий свист
  'radio-glitch'() {
    for (let i = 0; i < 8; i++) {
      tone({ type: 'square', f: vary(200 + Math.random() * 1800, 0), at: i * 0.1 + Math.random() * 0.03, dur: 0.05, peak: 0.05 });
    }
    tone({ type: 'sine', f: 3000, f1: 200, at: 0.5, dur: 0.6, peak: 0.05 });
    noise({ type: 'bandpass', f: 3000, q: 8, dur: 0.8, peak: 0.06 });
  },
};
