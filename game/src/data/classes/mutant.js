// Мутант (аналог Варвара). Канон: rules/classes.md, rules/class-paths.md, rules/class-roadmap.md, rules/spellcasting.md.
// Расширения схемы: path.role, passives[].level / passives[].path.
// Ограничений по расам нет: в каноне нет запрета (см. отчёт; расхождение 8 в docs/canon/README.md — Мутант и раса, и класс).
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
      desc: 'Когти крепнут: ещё +1 к урону в ближнем бою.', op: { dmg: { melee: 1 } } },
    { id: 'killer-eye', name: 'Глаз убийцы', level: 5, path: 'predator',
      desc: 'Видит смертельные точки: критическое попадание на 19–20.', op: { critRange: 19 } },
    { id: 'titan-hide', name: 'Каменная шкура', level: 5, path: 'titan',
      desc: 'Шкура титана грубеет: ещё +1 КБ.', op: { kb: 1 } },
    { id: 'living-armor', name: 'Живая броня', level: 5, path: 'titan',
      desc: 'Плоть зарастает на глазах: восстанавливает 1d4 ЗДР в начале каждого своего хода.',
      op: { regen: { dice: '1d4', resource: 'hp', every: 'turn' } } },
    { id: 'stalker', name: 'Скрытность', level: 1, path: 'predator',
      desc: 'Преимущество на проверки скрытности.', op: { advantage: ['stealth'] } },
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
      cost: 5, action: 'action', trigger: null, range: 1, target: 'enemy', area: null,
      roll: 'attack', save: null, onSave: 'none', usesPerBattle: 2,
      effects: [{ op: 'weapon', extraDice: '2d8' }],
      desc: 'Удар из засады: оружие +2d8 урона. Лучше всего — из скрытности.',
      canon: 'rules/class-paths.md',
    },
  ],
  canon: ['rules/classes.md', 'rules/class-paths.md', 'rules/class-roadmap.md', 'rules/spellcasting.md'],
  lore: 'Существа, чьи тела изменены мутациями: невероятно сильные и выносливые, впадают в ярость, увеличивая мощь в бою.',
};
