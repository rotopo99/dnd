// sfx-ui.js — interface sounds: clicks, windows, tabs, coins, loot by rarity, level-up fanfare,
// quest chimes, errors, card game (play / attack / death). Bus: 'ui'. All synthesized.
//
// Exposed through sfx.js: play('uiClick'), play('uiHover'), play('open'), play('close'), play('tab'),
// play('coin', {sell}), play('loot', {rarity: 'common'|'rare'|'legendary'}), play('levelUp'),
// play('questAccept'), play('questDone'), play('error'), play('cardPlay'), play('cardAttack'), play('cardDeath').

import { noise, tone, rand, vary, NOTE, withBus } from './core.js';
import { choir } from './vox.js';

const onBus = (fn) => withBus('ui', fn);

// Click: short square tick + top noise. Hover: barely audible sine.
const uiClick = () => onBus(() => {
  tone({ type: 'square', f: vary(1800, 30), f1: 1100, dur: 0.03, peak: 0.08, filter: { type: 'lowpass', f: 4000 } });
  noise({ type: 'highpass', f: 5000, dur: 0.012, peak: 0.08 });
});

const uiHover = () => onBus(() => {
  tone({ type: 'sine', f: vary(2400, 30), dur: 0.025, peak: 0.025 });
});

// Window open: rising sweep. Close: falling sweep.
const open = () => onBus(() => {
  tone({ type: 'sine', f: vary(400, 40), f1: 1200, dur: 0.12, peak: 0.08 });
  noise({ type: 'highpass', f: 6000, dur: 0.02, peak: 0.03 });
});

const close = () => onBus(() => {
  tone({ type: 'sine', f: vary(1100, 40), f1: 400, dur: 0.1, peak: 0.07 });
});

// Tab switch: a single dry tick.
const tab = () => onBus(() => {
  tone({ type: 'square', f: vary(1400, 50), dur: 0.02, peak: 0.05, filter: { type: 'lowpass', f: 3000 } });
  noise({ type: 'highpass', f: 4000, dur: 0.01, peak: 0.04 });
});

// Coins: buy = rising three ticks; sell = falling two ticks with ring.
const coin = (opts = {}) => onBus(() => {
  if (opts.sell) {
    tone({ type: 'sine', f: vary(2600, 30), dur: 0.12, peak: 0.12 });
    tone({ type: 'sine', f: vary(2000, 30), at: 0.06, dur: 0.14, peak: 0.1 });
    noise({ type: 'highpass', f: 7000, dur: 0.01, peak: 0.05 });
  } else {
    [0, 0.035, 0.07].forEach((at, i) => {
      tone({ type: 'sine', f: vary(2600 + i * 350, 20), at, dur: 0.1, peak: 0.1 });
    });
    noise({ type: 'highpass', f: 7000, dur: 0.01, peak: 0.05 });
  }
});

// Loot by rarity: common = one blip; rare = rising triad; legendary = arpeggio + shimmer.
const loot = (opts = {}) => onBus(() => {
  const r = opts.rarity || 'common';
  if (r === 'legendary') {
    [3, 7, 10, 15, 19].forEach((s, i) =>
      tone({ type: 'triangle', f: NOTE(s), at: i * 0.07, dur: i === 4 ? 0.7 : 0.18, peak: 0.13 + i * 0.01 })
    );
    noise({ type: 'highpass', f: 7000, f1: 11000, at: 0.2, dur: 0.5, peak: 0.05, attack: 0.1 });
  } else if (r === 'rare') {
    [3, 7, 10].forEach((s, i) => tone({ type: 'triangle', f: NOTE(s), at: i * 0.06, dur: 0.22, peak: 0.13 }));
  } else {
    tone({ type: 'sine', f: vary(1100, 30), dur: 0.08, peak: 0.1 });
  }
});

// Level-up fanfare: industrial impacts (metal clang) + brass-ish stab + sung choir.
const levelUp = () => onBus(() => {
  [0, 0.28, 0.52].forEach((at) => {
    noise({ type: 'bandpass', f: vary(200, 60), q: 2, at, dur: 0.06, peak: 0.4, attack: 0.001, sat: true });
    tone({ type: 'sine', f: vary(900, 30), at, dur: 0.18, peak: 0.07 });
  });
  const stab = [3, 7, 10];
  stab.forEach((s) =>
    tone({ type: 'sawtooth', f: NOTE(s - 12), at: 0.7, dur: 0.9, peak: 0.07, attack: 0.02, filter: { type: 'lowpass', f: 1800, f1: 900, q: 2 } })
  );
  choir([NOTE(3), NOTE(7), NOTE(10), NOTE(15)], { at: 0.7, dur: 1.3, peak: 0.14 });
  tone({ type: 'triangle', f: NOTE(15), at: 0.7, dur: 0.6, peak: 0.1 });
});

// Quest accepted: two rising notes. Quest done: three-note chime.
const questAccept = () => onBus(() => {
  tone({ type: 'triangle', f: NOTE(7), dur: 0.12, peak: 0.14 });
  tone({ type: 'triangle', f: NOTE(10), at: 0.08, dur: 0.16, peak: 0.14 });
});

const questDone = () => onBus(() => {
  [3, 7, 10].forEach((s, i) => tone({ type: 'triangle', f: NOTE(s + 12), at: i * 0.09, dur: i === 2 ? 0.5 : 0.14, peak: 0.13 }));
  tone({ type: 'sine', f: NOTE(10 + 12), at: 0.27, dur: 0.5, peak: 0.06 });
});

// Error / not allowed: two dull low thuds.
const error = () => onBus(() => {
  tone({ type: 'square', f: vary(110, 20), dur: 0.08, peak: 0.1, filter: { type: 'lowpass', f: 400 } });
  tone({ type: 'square', f: vary(92, 20), at: 0.1, dur: 0.09, peak: 0.1, filter: { type: 'lowpass', f: 400 } });
  noise({ type: 'lowpass', f: 300, dur: 0.12, peak: 0.08 });
});

// Card game: play = flick, attack = thwack, death = falling digital tone.
const cardPlay = () => onBus(() => {
  noise({ type: 'bandpass', f: 3000, f1: 8000, q: 1, dur: 0.05, peak: 0.2, attack: 0.002 });
  tone({ type: 'sine', f: vary(1000), f1: 1500, dur: 0.04, peak: 0.06 });
});

const cardAttack = () => onBus(() => {
  noise({ type: 'bandpass', f: vary(1800), q: 2, dur: 0.06, peak: 0.3, attack: 0.001, sat: true });
  tone({ type: 'sine', f: vary(120), f1: 50, dur: 0.15, peak: 0.25 });
});

const cardDeath = () => onBus(() => {
  noise({ type: 'lowpass', f: 1000, f1: 80, dur: 0.5, peak: 0.25, attack: 0.002 });
  tone({ type: 'sawtooth', f: vary(330), f1: 55, dur: 0.6, peak: 0.1, filter: { type: 'lowpass', f: 1500, f1: 200 } });
  tone({ type: 'square', f: rand(1200, 1400), at: 0.1, dur: 0.03, peak: 0.03 });
});

export const UI = Object.freeze({
  uiClick,
  uiHover,
  open,
  close,
  tab,
  coin,
  loot,
  levelUp,
  questAccept,
  questDone,
  error,
  cardPlay,
  cardAttack,
  cardDeath,
});

/*
 * Подключено: scenes/cards.js (cardPlay / cardAttack / cardDeath), scenes/shop.js (coin, coin sell), scenes/base.js (error).
 * Остальное ниже — кандидаты, не подключено:
 *  - uiClick / uiHover: уже вызываются во всех сценах (menu.js, roam.js, world-map.js, panels.js, ...).
 *  - open / close: game/src/ui/modal.js (openModal / closeModal) — одна строка при открытии/закрытии окна.
 *  - tab: game/src/scenes/panels.js select() (переключение вкладки; сейчас там uiClick).
 *  - coin: game/src/scenes/shop.js (покупка: строка play('buff') у sv.hero.credits -= price → заменить на play('coin'); продажа: play('coin', {sell: true})).
 *  - loot: game/src/ui/modal.js или scenes/battle.js result (лут, rarity из предмета) — через battle-log eventSound.
 *  - levelUp: game/src/main.js toast/hero level-up (save.hero.levelNews) и scenes/panels.js при повышении.
 *  - questAccept / questDone: game/src/quests.js startQuest / reward, вызывать из слоя сцены (scenes/location.js, scenes/dialogue.js).
 *  - error: game/src/scenes/base.js, create-build.js, create.js уже звучат play('miss') — при «нельзя» заменить на play('error') (одна строка).
 *  - cardPlay / cardAttack / cardDeath: game/src/scenes/cards.js (event switch: play('summon') = розыгрыш, 'hit' = атака, 'death' = смерть карты → заменить на cardDeath при e.kind === карта).
 */
