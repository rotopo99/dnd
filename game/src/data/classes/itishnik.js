// Айтишник (аналог Изобретателя). Канон: rules/classes.md, rules/class-paths.md, rules/class-roadmap.md, rules/spells.md,
// extra/specialties.md (Изобретатель: «Экстренный ремонт», «Энергетический сердечник»).
// Своего списка заклинаний в rules/spellcasting.md у класса нет — способности собраны из дорожной карты и специальностей.
// Расширения схемы: path.role, passives[].level / passives[].path.
export default {
  id: 'itishnik', name: 'Айтишник', analog: 'Изобретатель', icon: 'class_tech',
  role: 'support',
  castStat: 'int',
  hpPerLevel: 0,
  saves: ['int', 'dex'],
  armor: { name: 'Рабочий комбинезон с пластинами', type: 'light', kb: 2 },
  weapon: { name: 'Гвоздомёт', dice: '1d6', dmgType: 'pierce', stat: 'dex', range: 8, hit: 0 },
  // 0 + 5 + 7 + 9 + 4 + 0 + 2 = 27
  recommended: { str: 8, dex: 13, con: 14, int: 15, wil: 12, cha: 8, per: 10 },
  overcast: null,
  allowedRaces: null,
  paths: [
    {
      id: 'inventor', name: 'Путь Изобретателя', role: 'support',
      desc: 'Уникальные устройства: турели и боевые дроны, которые воюют рядом с хозяином.',
    },
    {
      id: 'sapper', name: 'Путь Сапёра', role: 'control',
      desc: 'Ловушки, мины и взрывные устройства: контроль пространства и урон по площади.',
    },
    {
      id: 'mechanic', name: 'Путь Механика', role: 'support',
      desc: 'Ремонт и улучшение оборудования: чинит, тюнингует оружие, ставит импланты.',
    },
  ],
  passives: [
    { id: 'subdermal-armor', name: 'Подкожная броня', level: 5, path: 'mechanic',
      desc: 'Имплант под кожей: +2 КБ.', op: { kb: 2 } },
  ],
  abilities: [
    // ---------- Общие ----------
    {
      id: 'field-repair', name: 'Экстренный ремонт', level: 1, path: null,
      cost: 3, action: 'bonus', trigger: null, range: 1, target: 'ally', area: null,
      roll: 'auto', save: null, onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'heal', dice: '1d6', bonus: 'castMod', resource: 'hp' }],
      desc: 'Себе или соседнему союзнику: восстанавливает 1d6 + ИНТ ЗДР (живым и технике). Стабилизирует упавшего.',
      canon: 'extra/specialties.md',
    },
    {
      id: 'junk-grenade', name: 'Граната из хлама', level: 1, path: null,
      cost: 4, action: 'action', trigger: null, range: 8, target: 'tile', area: { shape: 'radius', size: 1 },
      roll: 'save', save: 'dex', onSave: 'half', usesPerBattle: null,
      effects: [{ op: 'damage', dice: '1d8', dmgType: 'fire' }],
      desc: 'Самодельная граната: 1d8 огненного урона всем врагам в радиусе 1 клетки, спасбросок ЛВК — половина.',
      canon: 'rules/class-roadmap.md',
    },
    {
      id: 'weakpoint-scan', name: 'Техно-сканирование', level: 1, path: null,
      cost: 2, action: 'bonus', trigger: null, range: 12, target: 'enemy', area: null,
      roll: 'auto', save: null, onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'mark', id: 'marked', turns: 3, value: 1 }],
      desc: 'Сканер находит слабые места: все атаки по цели (твои, союзников, турелей, дронов) наносят +1 урона 3 хода.',
      canon: 'rules/spells.md',
    },
    {
      id: 'shield-generator', name: 'Генератор щита', level: 3, path: null,
      cost: 3, action: 'bonus', trigger: null, range: 6, target: 'ally', area: null,
      roll: 'auto', save: null, onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'buff', stat: 'kb', value: 2, turns: 3 }],
      desc: 'Себе или союзнику: +2 КБ на 3 хода.',
      canon: 'rules/class-roadmap.md',
    },
    {
      id: 'power-core', name: 'Энергетический сердечник', level: 5, path: null,
      cost: 3, action: 'bonus', trigger: null, range: 0, target: 'self', area: null,
      roll: 'auto', save: null, onSave: 'none', usesPerBattle: 1,
      effects: [{ op: 'extraAction', kind: 'action' }],
      desc: 'Перегрузка сердечника: дополнительное действие в этот ход. Раз за бой.',
      canon: 'rules/class-roadmap.md',
    },

    // ---------- Путь Изобретателя ----------
    {
      id: 'deploy-turret', name: 'Мини-турель', level: 1, path: 'inventor',
      cost: 4, action: 'action', trigger: null, range: 1, target: 'tile', area: null,
      roll: 'auto', save: null, onSave: 'none', usesPerBattle: 2,
      effects: [{ op: 'summon', unit: 'turret', turns: 3 }],
      desc: 'Ставит турель на соседнюю клетку: стреляет по врагам 3 хода. До 2 раз за бой.',
      canon: 'rules/class-roadmap.md',
    },
    {
      id: 'combat-drone', name: 'Боевой дрон', level: 3, path: 'inventor',
      cost: 4, action: 'action', trigger: null, range: 1, target: 'tile', area: null,
      roll: 'auto', save: null, onSave: 'none', usesPerBattle: 3,
      effects: [{ op: 'summon', unit: 'drone', turns: 3 }],
      desc: 'Запускает боевого дрона на 3 хода: летает и атакует врагов. До 3 раз за бой.',
      canon: 'rules/class-roadmap.md',
    },
    {
      id: 'overclock', name: 'Разгон устройства', level: 5, path: 'inventor',
      cost: 3, action: 'bonus', trigger: null, range: 8, target: 'ally', area: null,
      roll: 'auto', save: null, onSave: 'none', usesPerBattle: null,
      effects: [
        { op: 'buff', stat: 'hit', value: 2, turns: 3 },
        { op: 'buff', stat: 'dmg', value: 2, turns: 3 },
      ],
      desc: 'Разгоняет турель, дрона, союзника или себя: +2 к атаке и +2 к урону на 3 хода.',
      canon: 'rules/class-paths.md',
    },

    {
      id: 'combat-mech', name: 'Боевой мех из хлама', level: 5, path: 'inventor',
      cost: 6, action: 'action', trigger: null, range: 1, target: 'tile', area: null,
      roll: 'auto', save: null, onSave: 'none', usesPerBattle: 1,
      effects: [{ op: 'summon', unit: 'junk-mech', turns: 4 }],
      desc: 'Собирает из хлама боевого меха на 4 хода: тяжёлый кулак, толстая броня. Раз за бой. Вне канона, не противоречит: мех свалок есть в арте мобов, Изобретатель делает устройства.',
      canon: 'art/MANIFEST.txt',
    },
    // ---------- Путь Сапёра ----------
    {
      id: 'snare-trap', name: 'Капкан', level: 1, path: 'sapper',
      cost: 2, action: 'action', trigger: null, range: 6, target: 'enemy', area: null,
      roll: 'save', save: 'dex', onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'damage', dice: '1d6', dmgType: 'pierce' }, { op: 'status', id: 'root', turns: 1 }],
      desc: 'Метает капкан под ноги: спасбросок ЛВК, иначе 1d6 колющего урона и обездвиживание на 1 ход.',
      canon: 'rules/class-paths.md',
    },
    {
      id: 'proximity-mine', name: 'Мина', level: 3, path: 'sapper',
      cost: 5, action: 'action', trigger: null, range: 6, target: 'tile', area: { shape: 'radius', size: 1 },
      roll: 'save', save: 'dex', onSave: 'half', usesPerBattle: null,
      effects: [{ op: 'damage', dice: '2d6', dmgType: 'fire' }, { op: 'status', id: 'slow', turns: 1 }],
      desc: 'Мина рвётся под врагами: 2d6 огненного урона в радиусе 1 клетки и замедление на 1 ход. Спасбросок ЛВК — половина урона, без замедления.',
      canon: 'rules/class-paths.md',
    },
    {
      id: 'demo-charge', name: 'Взрывное устройство', level: 5, path: 'sapper',
      cost: 8, action: 'action', trigger: null, range: 8, target: 'tile', area: { shape: 'radius', size: 2 },
      roll: 'save', save: 'dex', onSave: 'half', usesPerBattle: 1,
      effects: [{ op: 'damage', dice: '2d8', dmgType: 'fire' }],
      desc: '2d8 огненного урона всем врагам в радиусе 2 клеток, спасбросок ЛВК — половина. Раз за бой.',
      canon: 'rules/class-paths.md',
    },

    // ---------- Путь Механика ----------
    {
      id: 'weapon-tune', name: 'Временный апгрейд', level: 1, path: 'mechanic',
      cost: 2, action: 'bonus', trigger: null, range: 1, target: 'ally', area: null,
      roll: 'auto', save: null, onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'buff', stat: 'dmg', value: 1, turns: 5 }],
      desc: 'Подкручивает оружие себе или соседнему союзнику: +1 к урону на 5 ходов.',
      canon: 'rules/class-roadmap.md',
    },
    {
      id: 'deep-repair', name: 'Улучшенный ремонт', level: 3, path: 'mechanic',
      cost: 4, action: 'action', trigger: null, range: 1, target: 'ally', area: null,
      roll: 'auto', save: null, onSave: 'none', usesPerBattle: null,
      effects: [
        { op: 'heal', dice: '2d6', bonus: 'castMod', resource: 'hp' },
        { op: 'cleanse', count: 1, kind: 'debuff' },
      ],
      desc: 'Себе или соседнему союзнику: 2d6 + ИНТ ЗДР и снятие одного дебаффа.',
      canon: 'rules/class-roadmap.md',
    },
  ],
  canon: ['rules/classes.md', 'rules/class-paths.md', 'rules/class-roadmap.md', 'rules/spells.md', 'extra/specialties.md'],
  lore: 'Мастера по созданию и ремонту технологий: оружие, броня, дроны и устройства, которые помогают в бою и исследовании.',
};
