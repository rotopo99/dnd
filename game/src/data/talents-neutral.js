// Нейтральное мировоззрение (alignment: 'neutral'): 3-й вариант рядом с 'good' / 'evil'. Спека: world-consequences.md, часть 4.
// Формат — как talents.js (slot 'alignment', req { alignment: 'neutral' }). Канон: rules/talents.md описывает только светлые/тёмные таланты,
// нейтральные — «вне канона: решение человека 2026-11-07 (п. 18)», по духу «ни вашим, ни нашим» (Нейтральные селения, Предложка).
// Программисту: подмешать NEUTRAL_TALENTS в TALENTS, WORLD_FLAGS_NEUTRAL — в WORLD_FLAGS, добавить кнопку «Нейтральное» в create-talents.js.

const ab = (o) => ({
  level: 1, path: null, cost: 0, action: 'action', trigger: null,
  range: 1, target: 'enemy', area: null, roll: 'auto', save: null, onSave: 'none',
  usesPerBattle: 1, effects: [], desc: '', canon: 'вне канона: решение человека 2026-11-07',
  ...o,
});
const T = (o) => ({
  slot: 'alignment', kind: 'world', req: { alignment: 'neutral' }, source: { kind: 'creation' },
  passives: [], abilities: [], world: [], todo: null, canon: 'вне канона: решение человека 2026-11-07',
  ...o,
});

// Числа нейтральных флагов (их крутит balance-tester)
export const NEUTRAL_RULES = { repDamp: 0.75 };

export const WORLD_FLAGS_NEUTRAL = {
  'rep-damp': 'Любое изменение репутации (и плюс, и минус) ×0.75, округление к нулю; розыск растёт на 1 реже (каждое 2-е преступление — без прироста).',
  'open-market': 'Торговцы враждебной фракции (репутация «подозрительны» и ниже, но не «враждебны») продают как при «нейтральны», без скидок.',
  'double-dealer': 'Квесты двух соперничающих фракций можно держать одновременно: первая сдача не снижает репутацию у соперника (−0 вместо распространения).',
  'cool-head': 'В социальных проверках — преимущество, когда в разговоре участвуют две стороны конфликта.',
};

export const NEUTRAL_TALENTS = [
  T({ id: 'middle-way', name: 'Срединный путь', world: [{ worldFlag: 'rep-damp' }],
    desc: 'Не лезет в чужие войны: любые сдвиги репутации ×0.75 — и приятные, и неприятные. Розыск набирается медленнее.' }),
  T({ id: 'open-hand', name: 'Открытая ладонь', world: [{ worldFlag: 'open-market' }, { check: 'persuasion', bonus: 1 }],
    desc: 'Торговцы, которые вас недолюбливают, всё равно торгуют: пока вы не «враждебны», цены как при «нейтральны». Убеждение +1.' }),
  T({ id: 'two-masters', name: 'Двое хозяев', world: [{ worldFlag: 'double-dealer' }, { check: 'deception', bonus: 1 }],
    desc: 'Можно работать на двух соперничающих фракций сразу: первая сдача квеста не бьёт по репутации у соперника. Обман +1.' }),
  T({ id: 'cool-head', name: 'Холодная голова', kind: 'both', world: [{ worldFlag: 'cool-head' }],
    passives: [{ op: { maxHp: 3 } }],
    desc: '+3 ЗДР; при споре двух сторон социальные проверки — с преимуществом.' }),
  T({ id: 'balance-breath', name: 'Равновесие', kind: 'combat',
    abilities: [ab({ id: 'talent-balance-breath', name: 'Равновесие', action: 'bonus', range: 0, target: 'self',
      effects: [{ op: 'heal', dice: '1d4', resource: 'hp' }, { op: 'heal', dice: '1d4', resource: 'mrl' }],
      desc: 'Бонусное действие: 1d4 ЗДР и 1d4 МРЛ себе. Раз за бой.' })],
    desc: 'Дыхание, считалка и мысль «а может, и не надо». Быстро собирает себя в кучу.' }),
  T({ id: 'not-my-fight', name: 'Не моя драка', kind: 'both', world: [{ worldFlag: 'retreat' }],
    passives: [{ op: { init: 1 } }],
    desc: '+1 к инициативе. Из небоссового боя можно отступить без штрафа (флаг retreat).' }),
];
