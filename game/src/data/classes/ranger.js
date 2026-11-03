// Рейнджер (аналог Следопыта). Канон: rules/classes.md, rules/class-paths.md, rules/class-roadmap.md, rules/spellcasting.md,
// characters/party.md (Артём — Путь Охотника).
// castStat: null — все способности завязаны на выстрел (op 'weapon'), спасбросков от Рейнджера нет.
// Расширения схемы: path.role, passives[].level / passives[].path.
export default {
  id: 'ranger', name: 'Рейнджер', analog: 'Следопыт', icon: 'class_rogue',
  role: 'ranged',
  castStat: null,
  hpPerLevel: 2,
  saves: ['dex', 'per'],
  armor: { name: 'Кожаный плащ-пыльник', type: 'light', kb: 2 },
  weapon: { name: 'Охотничий карабин', dice: '1d8', dmgType: 'pierce', stat: 'dex', range: 16, hit: 0 },
  // 2 + 9 + 7 + 2 + 2 + 0 + 5 = 27
  recommended: { str: 10, dex: 15, con: 14, int: 10, wil: 10, cha: 8, per: 13 },
  overcast: null,
  allowedRaces: null,
  paths: [
    {
      id: 'hunter', name: 'Путь Охотника', role: 'ranged',
      desc: 'Выслеживание и уничтожение: меткая стрельба, снайперский выстрел, охотничьи дроны.',
    },
    {
      id: 'survivor', name: 'Путь Выживальщика', role: 'tank',
      desc: 'Выживание в экстремальных условиях: укрытия, полевое лечение, кожа пустошей.',
    },
    {
      id: 'saboteur', name: 'Путь Саботажника', role: 'control',
      desc: 'Диверсии и засады: грязные приёмы, кислотные болты, скрытный выстрел.',
    },
  ],
  passives: [
    { id: 'weapon-mastery', name: 'Мастерство оружия', level: 5, path: null,
      desc: 'Ступень владения «мастерство»: +1 к атаке и +2 к урону оружием.', op: { hit: 1, dmg: { ranged: 2 } } },
    { id: 'marksman', name: 'Меткий стрелок', level: 1, path: 'hunter',
      desc: '+1 к броску атаки.', op: { hit: 1 } },
    { id: 'wasteland-skin', name: 'Кожа пустошей', level: 1, path: 'survivor',
      desc: 'Сопротивление токсичному урону.', op: { resist: { toxin: 'resist' } } },
    { id: 'improved-cover', name: 'Улучшенное укрытие', level: 1, path: 'survivor',
      desc: '+1 КБ.', op: { kb: 1 } },
    { id: 'extreme-adaptation', name: 'Адаптация экстремала', level: 5, path: 'survivor',
      desc: 'Иммунитет к отравлению.', op: { immuneStatus: ['poison'] } },
  ],
  abilities: [
    // ---------- Общие ----------
    {
      id: 'aimed-fire', name: 'Прицельный огонь', level: 1, path: null,
      cost: 3, action: 'action', trigger: null, range: 16, target: 'enemy', area: null,
      roll: 'attack', save: null, onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'weapon', hit: 2, extraDice: '1d4' }],
      desc: 'Выстрел с упреждением: +2 к атаке (сводит на нет укрытие) и +1d4 урона.',
      canon: 'rules/spellcasting.md',
    },
    {
      id: 'snare', name: 'Силок', level: 1, path: null,
      cost: 3, action: 'action', trigger: null, range: 16, target: 'enemy', area: null,
      roll: 'attack', save: null, onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'weapon' }, { op: 'status', id: 'root', turns: 1 }],
      desc: 'Выстрел болас-силком: урон оружием и обездвиживание на 1 ход.',
      canon: 'rules/spellcasting.md',
    },
    {
      id: 'rapid-reload', name: 'Быстрая перезарядка', level: 1, path: null,
      cost: 4, action: 'bonus', trigger: null, range: 16, target: 'enemy', area: null,
      roll: 'attack', save: null, onSave: 'none', usesPerBattle: 3,
      effects: [{ op: 'weapon' }],
      desc: 'Дополнительный выстрел бонусным действием. До 3 раз за бой.',
      canon: 'rules/spellcasting.md',
    },
    {
      id: 'camouflage', name: 'Маскировка', level: 3, path: null,
      cost: 2, action: 'bonus', trigger: null, range: 0, target: 'self', area: null,
      roll: 'auto', save: null, onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'status', id: 'stealth', turns: 2 }],
      desc: 'Скрытность на 2 хода: первый выстрел с преимуществом и доп. костью крита.',
      canon: 'rules/spellcasting.md',
    },
    {
      id: 'double-shot', name: 'Двойной выстрел', level: 5, path: null,
      cost: 4, action: 'action', trigger: null, range: 16, target: 'enemy', area: null,
      roll: 'attack', save: null, onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'weapon', hit: -2 }, { op: 'weapon', hit: -2 }],
      desc: 'Два выстрела подряд, каждый с −2 к атаке.',
      canon: 'rules/spellcasting.md',
    },

    // ---------- Путь Охотника ----------
    {
      id: 'hunter-sniper-shot', name: 'Снайперский выстрел', level: 3, path: 'hunter',
      cost: 4, action: 'action', trigger: null, range: 16, target: 'enemy', area: null,
      roll: 'attack', save: null, onSave: 'none', usesPerBattle: 1,
      effects: [{ op: 'weapon', extraDice: '2d10' }],
      desc: 'Выстрел в уязвимое место: оружие +2d10 урона. Раз за бой.',
      canon: 'rules/class-paths.md',
    },
    {
      id: 'hunter-drone', name: 'Улучшенный дрон', level: 5, path: 'hunter',
      cost: 4, action: 'bonus', trigger: null, range: 1, target: 'tile', area: null,
      roll: 'auto', save: null, onSave: 'none', usesPerBattle: 1,
      effects: [{ op: 'summon', unit: 'drone', turns: 4 }],
      desc: 'Выпускает боевого дрона на 4 хода. Раз за бой.',
      canon: 'rules/class-paths.md',
    },

    // ---------- Путь Выживальщика ----------
    {
      id: 'makeshift-cover', name: 'Укрытие', level: 1, path: 'survivor',
      cost: 2, action: 'bonus', trigger: null, range: 0, target: 'self', area: null,
      roll: 'auto', save: null, onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'buff', stat: 'kb', value: 2, turns: 2 }],
      desc: 'Наскоро сооружает укрытие из подручного хлама: +2 КБ на 2 хода.',
      canon: 'rules/class-paths.md',
    },
    {
      id: 'field-medicine', name: 'Полевая медицина', level: 3, path: 'survivor',
      cost: 3, action: 'bonus', trigger: null, range: 1, target: 'ally', area: null,
      roll: 'auto', save: null, onSave: 'none', usesPerBattle: 2,
      effects: [{ op: 'heal', dice: '1d8', bonus: 2, resource: 'hp' }],
      desc: 'Себе или соседнему союзнику: 1d8 + 2 ЗДР из найденных трав и бинтов. До 2 раз за бой.',
      canon: 'rules/class-paths.md',
    },

    // ---------- Путь Саботажника ----------
    {
      id: 'dirty-trick', name: 'Грязный приём', level: 1, path: 'saboteur',
      cost: 3, action: 'action', trigger: null, range: 16, target: 'enemy', area: null,
      roll: 'attack', save: null, onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'weapon', extraDice: '1d6' }, { op: 'status', id: 'slow', turns: 2 }],
      desc: 'Выстрел по ногам: +1d6 урона и замедление на 2 хода.',
      canon: 'rules/class-roadmap.md',
    },
    {
      id: 'acid-bolt', name: 'Кислотная ловушка', level: 3, path: 'saboteur',
      cost: 3, action: 'action', trigger: null, range: 16, target: 'enemy', area: null,
      roll: 'attack', save: null, onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'weapon', extraDice: '1d6', extraType: 'toxin' }, { op: 'status', id: 'corrosion', turns: 3 }],
      desc: 'Заряд с кислотой: +1d6 токсичного урона и коррозия брони на 3 хода.',
      canon: 'rules/class-roadmap.md',
    },
    {
      id: 'sneak-shot', name: 'Скрытный удар', level: 5, path: 'saboteur',
      cost: 4, action: 'action', trigger: null, range: 16, target: 'enemy', area: null,
      roll: 'attack', save: null, onSave: 'none', usesPerBattle: 3,
      effects: [{ op: 'weapon', extraDice: '3d8' }],
      desc: 'Выстрел из засады: оружие +3d8 урона. Лучше всего — из скрытности. До 3 раз за бой.',
      canon: 'rules/class-paths.md',
    },
  ],
  canon: ['rules/classes.md', 'rules/class-paths.md', 'rules/class-roadmap.md', 'rules/spellcasting.md', 'characters/party.md'],
  lore: 'Специалисты по выживанию в диких и техногенных условиях: выслеживают врагов и ведут через опасные зоны. Артём из партии — Рейнджер, Путь Охотника.',
};
