// Интерактивные кинематографические сцены (в духе Telltale / Dispatch). Спека: docs/specs/cinematics.md.
// Владелец данных — game-designer. Данные чистые (без DOM); числа ниже крутит balance-tester.
import { C1_ARRIVAL } from './c1-arrival.js';
import { C2_PRIEST } from './c2-priest.js';
import { C3_LOX5 } from './c3-lox5.js';
import { C4_COURT } from './c4-court.js';
import { C5_ZARYA } from './c5-zarya.js';
import { C6_LOX_DOOR } from './c6-lox-door.js';
import { C7_HA_REEL } from './c7-ha-reel.js';
import { C8_LADOV_NAME } from './c8-ladov-name.js';

export const CINE_RULES = {
  subtitle: { cps: 15, minSec: 1.2, gapSec: 0.25, pauseSec: 0.6 },   // длительность реплики = max(minSec, символы / cps)
  choice: {
    defaultSec: 8, minSec: 5, maxSec: 12,
    lockMs: 400,                       // кнопки не принимают ввод первые 0.4 с (чтобы не промазать)
    timerScale: { relaxed: 1.5, normal: 1, short: 0.75, off: null }, // настройка «Таймер выбора»; off — без таймера
    silenceIsChoice: true,             // истечение таймера = вариант `silence` сцены (он обязателен в каждом выборе)
  },
  qte: {
    tap: { sec: 1.2 },                 // одно нажатие в окне
    hold: { sec: 4, need: 2.5 },       // удержать `need` секунд из `sec`; отпустил рано — прогресс падает ×2 скорости
    mash: { sec: 3, rate: 2.5 },       // нажатий/с для успеха = need / sec; need задаёт сцена
    seq: { sec: 3.5, perKey: 0.9 },    // серия клавиш; неверная клавиша = провал серии
    assistMul: 1.5,                    // «Упростить QTE»: время ×1.5, need ×0.7; «Пропускать QTE»: всегда успех
    failIsDeath: false,                // провал QTE всегда ведёт в ветку `fail`, не в game over
  },
  remember: { sec: 2.5 },              // тост «X запомнит это»
  rel: { min: -5, max: 5, companionLoyaltyMul: 2 }, // `rel` NPC; для напарников = addLoyalty(Δ × 2)
  scene: { minSec: 60, maxSec: 240, skipAfterFirstView: true, replayInCodex: true },
  pacing: { maxPerHourPlay: 1.5, hardCap: 12 },      // ≤ 1.5 сцены на час игры; всего в игре ≤ 12
};

// Тон варианта выбора: значок и цвет подсказки (ключи палитры draw.js C).
export const TONES = {
  kind: { icon: 'heart', label: 'Мягко' }, hard: { icon: 'fist', label: 'Жёстко' },
  smart: { icon: 'gear', label: 'Умно' }, funny: { icon: 'mask', label: 'Смешно' },
  silent: { icon: 'dots', label: 'Молчать' },
};

// Кадрирование: `<frame>:<актёр>[:<второй>]` + необязательное `>move[:сек]`. Камера считается от актёров, не от координат.
// dist — расстояние до цели (м), h — высота камеры (м), fov — градусы, roll — крен.
export const SHOT_FRAMES = {
  wide:  { dist: 9,   h: 2.6, fov: 42, target: 'stage' },   // общий план всей сцены (без актёра)
  two:   { dist: 4.2, h: 1.5, fov: 38, target: 'mid' },     // двое в кадре
  med:   { dist: 3.2, h: 1.5, fov: 36 },                    // по пояс
  close: { dist: 1.6, h: 1.6, fov: 30 },                    // крупный план
  xclose:{ dist: 0.7, h: 1.65, fov: 24 },                   // глаза / руки
  ots:   { dist: 2.2, h: 1.6, fov: 32, over: true },        // через плечо второго
  low:   { dist: 3,   h: 0.5, fov: 36 },                    // снизу вверх (угроза)
  high:  { dist: 6,   h: 5,   fov: 40 },                    // сверху (ничтожность)
  dutch: { dist: 2.6, h: 1.5, fov: 34, roll: 12 },          // крен (тревога)
};
// Движения: `>push` и т. д. dur — секунд по умолчанию.
export const SHOT_MOVES = {
  push:  { dist: -0.25, fov: -4, dur: 4 },      // наезд (доля расстояния и градусы за dur)
  pull:  { dist: 0.3, fov: 4, dur: 4 },         // отъезд
  pan:   { from: 'a', to: 'b', dur: 5 },        // панорама между актёрами `pan:<a>:<b>`
  orbit: { deg: 25, dur: 6 },                   // облёт
  crane: { h: 2.5, dur: 6 },                    // подъём камеры
  fig8:  { amp: 0.5, period: 8, dur: 8 },       // «восьмёрка»: камера плывёт по лемнискате вокруг цели
  hand:  { amp: 0.02, dur: 0 },                 // ручная камера (дрожь), пока длится кадр
  whip:  { dur: 0.25 },                         // резкий смаз между кадрами
  shake: { amp: 0.12, dur: 0.6 },               // удар
};

// Сцены-площадки (строит art-director/программист из готовых кусков; `stage` в данных сцены).
export const STAGES = ['dock-riot', 'server-hall', 'reactor-log', 'court-cyber', 'roof-night', 'door-hall', 'collector-hall'];
// Клипы: есть в Blender-пайплайне (idle walk run crouch_walk attack_melee attack_shoot cast hit death)
// и НУЖНЫЕ новые для сцен (нет в tools/blender/anim.py): talk shrug point lean sit nod shake laugh cry hands_up stagger reach.
export const CLIPS = ['idle','walk','run','crouch_walk','attack_melee','attack_shoot','cast','hit','death','talk','shrug','point','lean','sit','nod','shake','laugh','cry','hands_up','stagger','reach'];
export const EMOS = ['neutral','happy','angry','sad','scared','smug','surprised','cringe'];

export const CINEMATICS = {
  [C1_ARRIVAL.id]: C1_ARRIVAL, [C2_PRIEST.id]: C2_PRIEST, [C3_LOX5.id]: C3_LOX5,
  [C4_COURT.id]: C4_COURT, [C5_ZARYA.id]: C5_ZARYA, [C6_LOX_DOOR.id]: C6_LOX_DOOR,
  [C7_HA_REEL.id]: C7_HA_REEL, [C8_LADOV_NAME.id]: C8_LADOV_NAME,
};
export const CINEMATIC_ORDER = Object.keys(CINEMATICS);
