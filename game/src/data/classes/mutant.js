// Мутант (аналог Варвара). Канон: rules/classes.md, rules/class-paths.md, rules/class-roadmap.md, rules/spellcasting.md.
// Расширения схемы: path.role, passives[].level / passives[].path.
// Ограничений по расам нет: в каноне нет запрета (см. отчёт; расхождение 8 в docs/canon/README.md — Мутант и раса, и класс).
// Компактный конструктор способностей уровней 6+ (поля схемы — как у ручных записей ниже).
const ab = (id, name, level, path, o) => ({
  id, name, level, path, cost: 0, action: 'action', trigger: null, range: 0, target: 'self', area: null,
  roll: 'auto', save: null, onSave: 'none', usesPerBattle: null, effects: [], canon: 'rules/class-roadmap.md', ...o,
});
const W = (extraDice, extraType) => ({ op: 'weapon', ...(extraDice && { extraDice }), ...(extraType && { extraType }) });
const zone = (size) => ({ shape: 'radius', size });

// Улучшения (docs/specs/levels-20.md): `dice` заменяет кости главного эффекта способности.
const UPGRADES = [
  { level: 2, ability: 'beast-claws', changes: { cost: 2 } },
  { level: 4, ability: 'beast-roar', changes: { area: zone(3) } },
  { level: 8, ability: 'acid-spit', changes: { dice: '3d6' } },
  { level: 12, ability: 'rage', changes: { usesPerBattle: 2 } },
  { level: 16, ability: 'beast-claws', changes: { dice: '2d6' } },
  { level: 8, ability: 'claw-cone', changes: { dice: '3d6' } },
  { level: 12, ability: 'tremor', changes: { dice: '4d6' } },
  { level: 16, ability: 'pounce-horde', changes: { dice: '5d6' } },
];

export default {
  id: 'mutant', name: 'Мутант', analog: 'Варвар', icon: null,
  role: 'melee',
  castStat: 'wil',
  hpPerLevel: 3,
  saves: ['str', 'con'],
  armor: { name: 'Хитиновые наросты', type: 'light', kb: 3 },
  weapon: { name: 'Тяжёлый тесак', dice: '1d10', dmgType: 'slash', stat: 'str', range: 1, hit: 0 },
  // 9 + 4 + 7 + 0 + 4 + 0 + 3 = 27
  recommended: { str: 15, dex: 12, con: 14, int: 8, wil: 12, cha: 8, per: 11 },
  overcast: null,
  allowedRaces: ['human', 'mutant-beast', 'mutant-plant'], // лор: вирус «Химера» мутирует только живые организмы
  paths: [
    {
      id: 'beast', name: 'Путь Зверя', role: 'melee',
      desc: 'Сила и скорость: когти, звериные рефлексы, яростный рывок.',
    },
    {
      id: 'titan', name: 'Путь Титана', role: 'tank',
      desc: 'Выживаемость: кожа как броня, несокрушимость, живая регенерация.',
    },
    {
      id: 'predator', name: 'Путь Хищника', role: 'melee',
      desc: 'Скрытность и засады: мимикрия, ядовитые когти, смертельный удар из тени.',
    },
  ],
  passives: [
    { id: 'weapon-mastery', name: 'Мастерство оружия', level: 5, path: null,
      desc: 'Ступень владения «мастерство»: +1 к атаке и +2 к урону оружием.', op: { hit: 1, dmg: { melee: 2 } } },
    { id: 'claws', name: 'Когти', level: 1, path: 'beast',
      desc: 'Когти дополняют каждый удар: +2 к урону в ближнем бою.', op: { dmg: { melee: 2 } } },
    { id: 'predator-reflexes', name: 'Рефлексы хищника', level: 1, path: 'beast',
      desc: '+1 к инициативе.', op: { init: 1 } },
    { id: 'thick-skin', name: 'Толстая кожа', level: 1, path: 'titan',
      desc: '+1 КБ.', op: { kb: 1 } },
    { id: 'feral-might', name: 'Звериная мощь', level: 5, path: 'beast',
      desc: 'Когти крепнут: ещё +2 к урону в ближнем бою.', op: { dmg: { melee: 2 } } },
    { id: 'killer-eye', name: 'Глаз убийцы', level: 5, path: 'predator',
      desc: 'Видит смертельные точки: критическое попадание на 19–20.', op: { critRange: 19 } },
    { id: 'living-armor', name: 'Живая броня', level: 5, path: 'titan',
      desc: 'Плоть зарастает на глазах: восстанавливает 1d4 ЗДР в начале каждого своего хода.',
      op: { regen: { dice: '1d4', resource: 'hp', every: 'turn' } } },
    { id: 'stalker', name: 'Скрытность', level: 1, path: 'predator',
      desc: 'Преимущество на проверки скрытности.', op: { advantage: ['stealth'] } },
    // ---------- Уровни 7–20 ----------
    { id: 'savage-rage', name: 'Улучшенная ярость', level: 7, path: 'beast',
      desc: '+2 СИЛ и +2 к урону в ближнем бою.', op: { statBonus: { str: 2 }, dmg: { melee: 2 } } },
    { id: 'god-beast', name: 'Бог-зверь', level: 15, path: 'beast',
      desc: '+2 СИЛ, крит на 18–20, +2 к урону в ближнем бою.', op: { statBonus: { str: 2 }, critRange: 18, dmg: { melee: 2 } } },
    { id: 'titan-rage', name: 'Титаническая плоть', level: 7, path: 'titan',
      desc: '+10 ЗДР, +1 КБ, +2 к урону в ближнем бою.', op: { maxHp: 10, kb: 1, dmg: { melee: 2 } } },
    { id: 'titan-form', name: 'Титаническая форма', level: 13, path: 'titan',
      desc: '+2 СИЛ, +2 ТЕЛ, +10 ЗДР, +1 КБ.', op: { statBonus: { str: 2, con: 2 }, maxHp: 10, kb: 1 } },
    { id: 'colossus', name: 'Колосс', level: 15, path: 'titan',
      desc: '+10 ЗДР, иммунитет к оглушению и обездвиживанию, +1 КБ.', op: { maxHp: 10, kb: 1, immuneStatus: ['stun', 'root'] } },
    { id: 'shadow-claw', name: 'Теневые когти', level: 7, path: 'predator',
      desc: '+2 к урону в ближнем бою, +1 к атаке, +2 к инициативе.', op: { dmg: { melee: 2 }, hit: 1, init: 2 } },
    { id: 'shadow-of-wastes', name: 'Тень Пустошей', level: 15, path: 'predator',
      desc: '+2 ЛВК, крит на 18–20, +2 к урону в ближнем бою.', op: { statBonus: { dex: 2 }, critRange: 18, dmg: { melee: 2 } } },
  ],
  abilities: [
    // ---------- Общие ----------
    {
      id: 'rage', name: 'Ярость', level: 1, path: null,
      cost: 2, action: 'bonus', trigger: null, range: 0, target: 'self', area: null,
      roll: 'auto', save: null, onSave: 'none', usesPerBattle: 1,
      effects: [
        { op: 'buff', stat: 'dmg', value: 3, turns: 3 },
        { op: 'buff', stat: 'kb', value: -1, turns: 3 },
      ],
      desc: 'Впадает в ярость на 3 хода: +3 к урону, −1 КБ. Раз за бой.',
      canon: 'rules/class-roadmap.md',
    },
    {
      id: 'beast-claws', name: 'Когти зверя', level: 1, path: null,
      cost: 3, action: 'action', trigger: null, range: 1, target: 'enemy', area: null,
      roll: 'attack', save: null, onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'weapon', extraDice: '1d6', extraType: 'slash' }],
      desc: 'Удар оружием и когтями: +1d6 рубящего урона.',
      canon: 'rules/spellcasting.md',
    },
    {
      id: 'beast-roar', name: 'Звериный рык', level: 1, path: null,
      cost: 2, action: 'bonus', trigger: null, range: 0, target: 'tile', area: { shape: 'radius', size: 2 },
      roll: 'save', save: 'wil', onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'status', id: 'fear', turns: 1 }],
      desc: 'Рык пугает врагов в радиусе 2 клеток: спасбросок ТВД, иначе страх на 1 ход.',
      canon: 'rules/spellcasting.md',
    },
    {
      id: 'regeneration', name: 'Регенерация', level: 3, path: null,
      cost: 4, action: 'bonus', trigger: null, range: 0, target: 'self', area: null,
      roll: 'auto', save: null, onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'status', id: 'regen', turns: 3 }],
      desc: 'Ускоренная регенерация: 1d4 ЗДР в ход, 3 хода.',
      canon: 'rules/spellcasting.md',
    },
    {
      id: 'acid-spit', name: 'Кислотный плевок', level: 5, path: null,
      cost: 5, action: 'action', trigger: null, range: 6, target: 'enemy', area: null,
      roll: 'save', save: 'dex', onSave: 'half', usesPerBattle: null,
      effects: [
        { op: 'damage', dice: '2d6', dmgType: 'toxin' },
        { op: 'status', id: 'corrosion', turns: 3 },
      ],
      desc: 'Плевок кислотой на 6 клеток: 2d6 токсичного урона и коррозия брони на 3 хода. Спасбросок ЛВК — половина урона, без коррозии.',
      canon: 'rules/spellcasting.md',
    },

    // ---------- Путь Зверя ----------
    {
      id: 'rending-claws', name: 'Улучшенные когти', level: 3, path: 'beast',
      cost: 3, action: 'action', trigger: null, range: 1, target: 'enemy', area: null,
      roll: 'attack', save: null, onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'weapon', extraDice: '1d6', extraType: 'slash' }, { op: 'status', id: 'bleed', turns: 2 }],
      desc: 'Рвущий удар: +1d6 рубящего урона и кровотечение на 2 хода.',
      canon: 'rules/class-roadmap.md',
    },
    {
      id: 'frenzied-leap', name: 'Яростный рывок', level: 5, path: 'beast',
      cost: 4, action: 'action', trigger: null, range: 8, target: 'enemy', area: null,
      roll: 'attack', save: null, onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'move', tiles: 7, mode: 'dash' }, { op: 'weapon', extraDice: '1d8' }],
      desc: 'Рывок на 7 клеток и удар: оружие +1d8 урона.',
      canon: 'rules/class-roadmap.md',
    },

    // ---------- Путь Титана ----------
    {
      id: 'unbreakable', name: 'Несокрушимость', level: 3, path: 'titan',
      cost: 4, action: 'bonus', trigger: null, range: 0, target: 'self', area: null,
      roll: 'auto', save: null, onSave: 'none', usesPerBattle: 2,
      effects: [{ op: 'status', id: 'fortified', turns: 2 }],
      desc: 'Шкура каменеет: сопротивление физическому урону на 2 хода.',
      canon: 'rules/class-roadmap.md',
    },

    // ---------- Путь Хищника ----------
    {
      id: 'mimicry', name: 'Мимикрия', level: 1, path: 'predator',
      cost: 2, action: 'bonus', trigger: null, range: 0, target: 'self', area: null,
      roll: 'auto', save: null, onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'status', id: 'stealth', turns: 2 }],
      desc: 'Сливается с окружением: скрытность на 2 хода (первая атака с преимуществом и доп. костью крита).',
      canon: 'rules/class-roadmap.md',
    },
    {
      id: 'venom-claws', name: 'Ядовитые когти', level: 3, path: 'predator',
      cost: 3, action: 'action', trigger: null, range: 1, target: 'enemy', area: null,
      roll: 'attack', save: null, onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'weapon' }, { op: 'status', id: 'poison', turns: 3 }],
      desc: 'Удар с ядом: атака оружием и отравление на 3 хода.',
      canon: 'rules/class-roadmap.md',
    },
    {
      id: 'ambush-strike', name: 'Смертельный удар', level: 5, path: 'predator',
      cost: 4, action: 'action', trigger: null, range: 1, target: 'enemy', area: null,
      roll: 'attack', save: null, onSave: 'none', usesPerBattle: 3,
      effects: [{ op: 'weapon', extraDice: '2d8' }],
      desc: 'Удар из засады: оружие +2d8 урона. Лучше всего — из скрытности.',
      canon: 'rules/class-paths.md',
    },

    // ---------- Общие, уровни 6–18 (баланс v4) ----------
    ab('blood-fury', 'Кровавая ярость', 6, null, { cost: 5, range: 1, target: 'enemy', roll: 'attack',
      effects: [W('2d8', 'slash'), { op: 'status', id: 'bleed', turns: 3 }],
      desc: 'Бешеный удар: оружие +2d8 рубящего урона и кровотечение на 3 хода.' }),
    ab('earthshaker', 'Крушитель', 10, null, { cost: 6, range: 1, target: 'enemy', roll: 'attack',
      effects: [W('4d8'), { op: 'push', tiles: 2 }],
      desc: 'Удар всей массой: оружие +4d8 урона и отталкивание на 2 клетки.' }),
    ab('rampage', 'Буйство', 14, null, { cost: 8, range: 1, target: 'enemy', roll: 'attack',
      effects: [W(), W(), W('1d8')],
      desc: 'Три удара подряд, последний с +1d8 урона.' }),
    ab('unkillable', 'Неукротимый', 18, null, { cost: 7, action: 'bonus', usesPerBattle: 1,
      effects: [{ op: 'extraAction', kind: 'action' }, { op: 'heal', dice: '6d8', resource: 'hp' }, { op: 'buff', stat: 'dmg', value: 3, turns: 3 }],
      desc: 'Боль подпитывает: дополнительное действие, лечит 6d8 ЗДР и +3 к урону на 3 хода. Раз за бой.' }),

    // ---------- Ближние площадные навыки (docs/specs/melee-aoe.md) ----------
    ab('claw-cone', 'Рассекающий взмах', 5, 'beast', { cost: 4, range: 3, target: 'tile', area: { shape: 'cone', size: 3 },
      roll: 'save', save: 'dex', castStat: 'str', onSave: 'half', usesPerBattle: 2,
      effects: [{ op: 'damage', dice: '2d6', dmgType: 'slash' }, { op: 'status', id: 'bleed', turns: 2 }],
      desc: 'Когтистый веер в конусе 3 клетки: 2d6 рубящего урона, кровотечение на 2 хода (спасбросок ЛВК — половина и без кровотечения). Дважды за бой.' }),
    ab('tremor', 'Топот титана', 8, 'titan', { cost: 6, range: 0, target: 'tile', area: zone(2),
      roll: 'save', save: 'str', castStat: 'str', onSave: 'half', usesPerBattle: 2,
      effects: [{ op: 'damage', dice: '3d6', dmgType: 'blunt' }, { op: 'push', tiles: 1 }, { op: 'clearSurface', kinds: ['ice'], size: 2 }],
      desc: 'Сотрясение земли: 3d6 дробящего урона врагам в радиусе 2, толчок на 1 клетку (спасбросок СИЛ — половина и без толчка). Разбивает лёд. Дважды за бой.' }),
    ab('pounce-horde', 'Прыжок в стаю', 12, 'predator', { cost: 7, range: 5, target: 'tile', area: zone(1),
      roll: 'save', save: 'dex', castStat: 'str', onSave: 'half', usesPerBattle: 1,
      effects: [{ op: 'damage', dice: '4d6', dmgType: 'slash' }, { op: 'move', tiles: 5, mode: 'teleport' }, { op: 'status', id: 'bleed', turns: 3 }],
      desc: 'Прыжок на 5 клеток и удар по приземлению: 4d6 рубящего урона врагам вокруг точки, кровотечение на 3 хода (спасбросок ЛВК — половина и без него). Раз за бой.' }),
    ab('frenzy-whirl', 'Вихрь ярости', 16, null, { cost: 8, range: 0, target: 'tile', area: zone(1),
      roll: 'save', save: 'dex', castStat: 'str', onSave: 'half', usesPerBattle: 1,
      effects: [{ op: 'damage', dice: '5d6', dmgType: 'slash' }, { op: 'status', id: 'bleed', turns: 3 }],
      desc: 'Бешеное вращение: 5d6 рубящего урона врагам вплотную, кровотечение на 3 хода (спасбросок ЛВК — половина и без него). Раз за бой.' }),
  ],
  canon: ['rules/classes.md', 'rules/class-paths.md', 'rules/class-roadmap.md', 'rules/spellcasting.md'],
  lore: 'Существа, чьи тела изменены мутациями: невероятно сильные и выносливые, впадают в ярость, увеличивая мощь в бою.',
};
