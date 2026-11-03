// Техномант (аналог Волшебника). Канон: rules/classes.md, rules/class-paths.md, rules/class-roadmap.md,
// rules/spellcasting.md, rules/spells.md, characters/party.md (Куксиус — Путь Кодера).
// Расширения схемы: path.role, passives[].level / passives[].path.
export default {
  id: 'technomant', name: 'Техномант', analog: 'Волшебник', icon: 'class_tech',
  role: 'caster',
  castStat: 'int',
  hpPerLevel: 2,
  saves: ['int', 'wil'],
  armor: { name: 'Куртка с экранирующей подкладкой', type: 'cloth', kb: 1 },
  weapon: { name: 'Самопальный пистолет', dice: '1d4', dmgType: 'pierce', stat: 'dex', range: 8, hit: 0 },
  // 0 + 7 + 5 + 9 + 4 + 0 + 2 = 27
  recommended: { str: 8, dex: 14, con: 13, int: 15, wil: 12, cha: 8, per: 10 },
  overcast: null,
  allowedRaces: null,
  paths: [
    {
      id: 'coder', name: 'Путь Кодера', role: 'control',
      desc: 'Взлом систем: отключает вражеские устройства, сбивает прицелы, запускает вирусы.',
    },
    {
      id: 'illusionist', name: 'Путь Иллюзиониста', role: 'control',
      desc: 'Голограммы и иллюзии: ложные цели, фантомные взрывы по рассудку, запутывание врагов.',
    },
    {
      id: 'energetic', name: 'Путь Энергетика', role: 'caster',
      desc: 'Управление энергией: лучи, импульсы и взрывы по площади.',
    },
  ],
  passives: [],
  abilities: [
    // ---------- Общие ----------
    {
      id: 'energy-beam', name: 'Энергетический луч', level: 1, path: null,
      cost: 2, action: 'action', trigger: null, range: 20, target: 'enemy', area: null,
      roll: 'attack', save: null, onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'damage', dice: '1d8', dmgType: 'energy', bonus: 'castMod' }],
      desc: 'Луч энергии: 1d8 + ИНТ энергоурона, дальность 20 клеток.',
      canon: 'rules/spells.md',
    },
    {
      id: 'proxy-shield', name: 'Прокси-щит', level: 1, path: null,
      cost: 2, action: 'bonus', trigger: null, range: 6, target: 'ally', area: null,
      roll: 'auto', save: null, onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'shield', dice: '1d6', turns: 5 }],
      desc: 'Щит на себя или союзника: поглощает 1d6 урона, держится до 5 ходов.',
      canon: 'rules/spells.md',
    },
    {
      id: 'impulse-shock', name: 'Импульсный шок', level: 1, path: null,
      cost: 3, action: 'action', trigger: null, range: 8, target: 'enemy', area: null,
      roll: 'save', save: 'con', onSave: 'none', usesPerBattle: 2,
      effects: [{ op: 'status', id: 'stun', turns: 1 }],
      desc: 'Разряд в нервную систему или схемы: спасбросок ТЕЛ, иначе оглушение на 1 ход.',
      canon: 'rules/spellcasting.md',
    },
    {
      id: 'adaptive-armor', name: 'Адаптивная броня', level: 3, path: null,
      cost: 4, action: 'bonus', trigger: null, range: 0, target: 'self', area: null,
      roll: 'auto', save: null, onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'buff', stat: 'kb', value: 2, turns: 3 }],
      desc: '+2 КБ на 3 хода.',
      canon: 'rules/spellcasting.md',
    },
    {
      id: 'cyber-storm', name: 'Кибер-буря', level: 5, path: null,
      cost: 7, action: 'action', trigger: null, range: 20, target: 'tile', area: { shape: 'radius', size: 3 },
      roll: 'save', save: 'dex', onSave: 'half', usesPerBattle: null,
      effects: [{ op: 'damage', dice: '2d8', dmgType: 'electric' }],
      desc: 'Буря разрядов: 2d8 электроурона всем врагам в радиусе 3 клеток, спасбросок ЛВК — половина.',
      canon: 'rules/spells.md',
    },

    // ---------- Путь Кодера ----------
    {
      id: 'cyber-hack', name: 'Кибер-взлом', level: 1, path: 'coder',
      cost: 3, action: 'action', trigger: null, range: 12, target: 'enemy', area: null,
      roll: 'attack', save: null, onSave: 'none', usesPerBattle: null,
      effects: [
        { op: 'damage', dice: '1d8', dmgType: 'electric' },
        { op: 'status', id: 'disarm', turns: 1 },
      ],
      desc: 'Взлом вражеской системы: 1d8 электроурона и отключение оружия на 1 ход.',
      canon: 'rules/spells.md',
    },
    {
      id: 'noise-generator', name: 'Шумовой генератор', level: 3, path: 'coder',
      cost: 3, action: 'bonus', trigger: null, range: 12, target: 'tile', area: { shape: 'radius', size: 2 },
      roll: 'save', save: 'int', onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'buff', stat: 'hit', value: -2, turns: 2 }],
      desc: 'Сброс прицелов: враги в радиусе 2 клеток делают спасбросок ИНТ, иначе −2 к атаке на 2 хода.',
      canon: 'rules/class-roadmap.md',
    },
    {
      id: 'terminal-virus', name: 'Терминальный вирус', level: 5, path: 'coder',
      cost: 5, action: 'action', trigger: null, range: 20, target: 'enemy', area: null,
      roll: 'attack', save: null, onSave: 'none', usesPerBattle: null,
      effects: [
        { op: 'damage', dice: '2d8', dmgType: 'electric', bonus: 'castMod' },
        { op: 'status', id: 'slow', turns: 2 },
      ],
      desc: '2d8 + ИНТ электроурона и замедление цели на 2 хода.',
      canon: 'rules/class-roadmap.md',
    },

    // ---------- Путь Иллюзиониста ----------
    {
      id: 'hologram', name: 'Голограмма', level: 1, path: 'illusionist',
      cost: 2, action: 'bonus', trigger: null, range: 1, target: 'tile', area: null,
      roll: 'auto', save: null, onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'summon', unit: 'hologram', turns: 3 }],
      desc: 'Ложная цель рядом с тобой на 3 хода. Не атакует, гибнет от 1 урона.',
      canon: 'rules/spells.md',
    },
    {
      id: 'phantom-blast', name: 'Фантомный взрыв', level: 3, path: 'illusionist',
      cost: 3, action: 'action', trigger: null, range: 12, target: 'tile', area: { shape: 'radius', size: 2 },
      roll: 'save', save: 'wil', onSave: 'half', usesPerBattle: null,
      effects: [{ op: 'damage', dice: '1d6', dmgType: 'psychic', bonus: 'castMod' }],
      desc: 'Иллюзорный взрыв бьёт по рассудку: 1d6 + ИНТ пси-урона по МРЛ в радиусе 2 клеток, спасбросок ТВД — половина.',
      canon: 'rules/class-roadmap.md',
    },
    {
      id: 'hypno-pulse', name: 'Гипнотический импульс', level: 5, path: 'illusionist',
      cost: 5, action: 'action', trigger: null, range: 12, target: 'tile', area: { shape: 'radius', size: 2 },
      roll: 'save', save: 'wil', onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'status', id: 'hallucination', turns: 2 }],
      desc: 'Враги в радиусе 2 клеток делают спасбросок ТВД, иначе галлюцинации на 2 хода (бьют случайные цели).',
      canon: 'rules/class-roadmap.md',
    },

    // ---------- Путь Энергетика ----------
    {
      id: 'energy-pulse', name: 'Энергетический импульс', level: 1, path: 'energetic',
      cost: 3, action: 'action', trigger: null, range: 0, target: 'tile', area: { shape: 'radius', size: 3 },
      roll: 'save', save: 'dex', onSave: 'half', usesPerBattle: null,
      effects: [{ op: 'damage', dice: '1d6', dmgType: 'energy' }],
      desc: 'Волна энергии вокруг тебя: 1d6 энергоурона всем врагам в радиусе 3 клеток, спасбросок ЛВК — половина.',
      canon: 'rules/spells.md',
    },
    {
      id: 'overcharged-beam', name: 'Улучшенный луч', level: 3, path: 'energetic',
      cost: 4, action: 'action', trigger: null, range: 20, target: 'enemy', area: null,
      roll: 'attack', save: null, onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'damage', dice: '2d8', dmgType: 'energy', bonus: 'castMod' }],
      desc: 'Перегруженный луч: 2d8 + ИНТ энергоурона.',
      canon: 'rules/class-paths.md',
    },
    {
      id: 'energy-blast', name: 'Энергетический взрыв', level: 5, path: 'energetic',
      cost: 10, action: 'action', trigger: null, range: 20, target: 'tile', area: { shape: 'radius', size: 3 },
      roll: 'save', save: 'dex', onSave: 'half', usesPerBattle: 2,
      effects: [{ op: 'damage', dice: '3d8', dmgType: 'energy' }],
      desc: '3d8 энергоурона всем врагам в радиусе 3 клеток, спасбросок ЛВК — половина.',
      canon: 'rules/class-roadmap.md',
    },
  ],
  canon: ['rules/classes.md', 'rules/class-paths.md', 'rules/class-roadmap.md', 'rules/spellcasting.md', 'rules/spells.md', 'characters/party.md'],
  lore: 'Специалисты по манипуляции технологиями и энергией: взлом, иллюзии, энергия. Куксиус из партии — Техномант, Путь Кодера.',
};
