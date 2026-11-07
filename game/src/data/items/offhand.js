// Вторая рука v7. Спека — docs/specs/inventory-mods.md §6. Слот 'offhand' уже есть в движке (rules/equipment.js, character.js: kb, passives).
// Поля: id, name, cat: 'offhand', slot: 'offhand', kind: 'shield' | 'side' | 'tool', kb (прибавка к КБ, читает движок),
//   passives (читает движок), size [w, h] (сетка), req {str?}, speed (−клетки, как у брони), noise,
//   offAction (для kind side/tool; движок пока не читает, спека §6.4): { name, action: 'bonus', usesPerBattle?, range, dice?, dmgType?, effects? }.
// Двуручное оружие (weapon.twoHanded) блокирует слот — см. спеку §6.3.
const o = (it) => ({ cat: 'offhand', slot: 'offhand', kb: 0, tier: 1, price: 0, factions: [], desc: '', ...it });

const LIST = [
  o({ id: 'buckler-lid', name: 'Баклер из крышки котла', kind: 'shield', kb: 1, size: [2, 2], tier: 1, price: 30, factions: ['neutralVillages', 'scavengers'],
    desc: '+1 КБ. Звенит, как кастрюля, потому что это кастрюля.' }),
  o({ id: 'door-shield', name: 'Дверца от шкафа', kind: 'shield', kb: 1, size: [2, 3], noise: 1, tier: 1, price: 25, factions: ['scavengers', 'renegades'],
    desc: '+1 КБ, шум +1. На обратной стороне — чужие семейные фото.' }),
  o({ id: 'road-sign-shield', name: 'Щит из дорожного знака', kind: 'shield', kb: 2, size: [2, 3], noise: 1, speed: -1, tier: 2, price: 90, factions: ['scavengers', 'pirates', 'mechanids'],
    desc: '+2 КБ, шум +1, скорость −1. «Уступи дорогу» — рекомендация, не угроза.' }),
  o({ id: 'riot-shield', name: 'Щит ОМОНа', kind: 'shield', kb: 2, size: [2, 3], tier: 2, price: 160, factions: ['aiParty', 'warprom'],
    desc: '+2 КБ. Прозрачный, с надписью «ПОЛИЦИЯ ПАРТИИ». Гармония одобряет.' }),
  o({ id: 'tower-shield', name: 'Башенный щит Братства', kind: 'shield', kb: 3, size: [3, 4], noise: 2, speed: -2, req: { str: 13 }, tier: 3, price: 320, factions: ['tinBrotherhood', 'warprom'],
    passives: [{ id: 'item-tower-shield', name: 'Стена', desc: 'Не отталкивают и не сбивают с ног.', op: { immuneStatus: ['prone', 'push'] } }],
    desc: '+3 КБ, шум +2, скорость −2, нужна СИЛ 13. Иммунитет к толчку и падению. Человек за ним — стена.' }),
  // --- не щиты: оружие и инструменты второй руки
  o({ id: 'side-pistol', name: 'Запасной пистолет', kind: 'side', size: [2, 1], tier: 1, price: 70, factions: ['pirates', 'renegades', 'warprom'],
    offAction: { name: 'Выстрел с левой', action: 'bonus', range: 6, dice: '1d4', dmgType: 'pierce', usesPerBattle: 3 },
    desc: 'Бонусное действие: выстрел 1d4 колющего на 6 клеток, до 3 раз за бой.' }),
  o({ id: 'trench-knife', name: 'Окопный нож', kind: 'side', size: [1, 2], tier: 1, price: 35, factions: ['warprom', 'tinBrotherhood', 'scavengers'],
    offAction: { name: 'Удар ножом', action: 'bonus', range: 1, dice: '1d4', dmgType: 'slash' },
    desc: 'Бонусное действие: удар 1d4 режущего в упор.' }),
  o({ id: 'tac-flashlight', name: 'Тактический фонарь', kind: 'tool', size: [1, 2], tier: 2, price: 60, factions: ['aiParty', 'warprom', 'tekhonki'],
    offAction: { name: 'Ослепить', action: 'bonus', range: 6, usesPerBattle: 2, effects: [{ op: 'status', id: 'blind', turns: 1 }] },
    desc: 'Бонусное действие: слепит цель на 1 ход (2 раза за бой).' }),
];

export const OFFHAND = Object.fromEntries(LIST.map((it) => [it.id, it]));
