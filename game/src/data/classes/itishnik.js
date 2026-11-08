// Айтишник (аналог Изобретателя). Канон: rules/classes.md, rules/class-paths.md, rules/class-roadmap.md, rules/spells.md,
// extra/specialties.md (Изобретатель: «Экстренный ремонт», «Энергетический сердечник»).
// Своего списка заклинаний в rules/spellcasting.md у класса нет — способности собраны из дорожной карты и специальностей.
// Расширения схемы: path.role, passives[].level / passives[].path.
// Компактный конструктор способностей уровней 6+ (поля схемы — как у ручных записей ниже).
const ab = (id, name, level, path, o) => ({
  id, name, level, path, cost: 0, action: 'action', trigger: null, range: 0, target: 'self', area: null,
  roll: 'auto', save: null, onSave: 'none', usesPerBattle: null, effects: [], canon: 'rules/class-roadmap.md', ...o,
});
const zone = (size) => ({ shape: 'radius', size });
const AOE = { target: 'tile', roll: 'save' };

// Улучшения (docs/specs/levels-20.md): `dice` заменяет кости главного эффекта, `bonus` — значение метки/баффа.
const UPGRADES = [
  { level: 2, ability: 'field-repair', changes: { dice: '2d6' } },
  { level: 4, ability: 'weakpoint-scan', changes: { bonus: 2 } },
  { level: 8, ability: 'junk-grenade', changes: { dice: '3d8' } },
  { level: 12, ability: 'power-core', changes: { usesPerBattle: 2 } },
  { level: 16, ability: 'field-repair', changes: { dice: '3d6' } },
];

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
    // ---------- Уровни 7–20 ----------
    { id: 'garage-tech', name: 'Гаражные технологии', level: 7, path: 'inventor',
      desc: '+2 ИНТ, +1 к атаке, +10 ЗДР.', op: { statBonus: { int: 2 }, hit: 1, maxHp: 10 } },
    { id: 'inventor-grit', name: 'Закалка мастерской', level: 11, path: 'inventor',
      desc: '+15 ЗДР.', op: { maxHp: 15 } },
    { id: 'techno-god', name: 'ТехноБог', level: 15, path: 'inventor',
      desc: '+2 ИНТ, +2 к урону способностей, +10 ЗДР.', op: { statBonus: { int: 2 }, dmg: { spell: 2 }, maxHp: 10 } },
    { id: 'sabotage-master', name: 'Мастер диверсий', level: 7, path: 'sapper',
      desc: '+2 ИНТ, +2 к урону способностей.', op: { statBonus: { int: 2 }, dmg: { spell: 2 } } },
    { id: 'sapper-grit', name: 'Закалка сапёра', level: 11, path: 'sapper',
      desc: '+15 ЗДР.', op: { maxHp: 15 } },
    { id: 'king-of-sabotage', name: 'Король диверсий', level: 15, path: 'sapper',
      desc: '+2 ЛВК, +3 к урону способностей, +10 ЗДР.', op: { statBonus: { dex: 2 }, dmg: { spell: 3 }, maxHp: 10 } },
    { id: 'adv-upgrades', name: 'Продвинутые апгрейды', level: 7, path: 'mechanic',
      desc: '+2 ИНТ, +1 КБ, +10 ЗДР.', op: { statBonus: { int: 2 }, kb: 1, maxHp: 10 } },
    { id: 'em-heart', name: 'ЭМ-сердце', level: 11, path: 'mechanic',
      desc: '+15 ЗДР, иммунитет к оглушению.', op: { maxHp: 15, immuneStatus: ['stun'] } },
    { id: 'cyber-titan-core', name: 'Кибер-титан', level: 15, path: 'mechanic',
      desc: '+1 КБ, +10 ЗДР, +2 к урону способностей.', op: { kb: 1, maxHp: 10, dmg: { spell: 2 } } },
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
      effects: [{ op: 'summon', unit: 'turret', turns: 4 }],
      desc: 'Ставит турель на соседнюю клетку: стреляет по врагам 4 хода. До 2 раз за бой.',
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
      effects: [{ op: 'buff', stat: 'dmg', value: 2, turns: 5 }],
      desc: 'Подкручивает оружие себе или соседнему союзнику: +2 к урону на 5 ходов.',
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

    // ---------- Общие, уровни 6–18 ----------
    ab('nano-repair', 'Наноботы', 6, null, { cost: 5, action: 'bonus', range: 6, target: 'ally',
      effects: [{ op: 'heal', dice: '3d6', bonus: 'castMod', resource: 'hp' }, { op: 'status', id: 'regen', turns: 3 }],
      desc: 'Облако наноботов: лечит 3d6 + ИНТ ЗДР и даёт регенерацию на 3 хода.' }),
    ab('emp-pulse', 'ЭМ-импульс', 10, null, { ...AOE, cost: 7, range: 10, area: zone(2), save: 'con', onSave: 'half',
      effects: [{ op: 'damage', dice: '4d6', dmgType: 'electric' }, { op: 'status', id: 'stun', turns: 1 }],
      desc: '4d6 электроурона в радиусе 2; спасбросок ТЕЛ — половина; провалившие оглушены на 1 ход.' }),
    ab('mass-repair', 'Массовый ремонт', 14, null, { cost: 10, area: zone(5), usesPerBattle: 2,
      effects: [{ op: 'heal', dice: '5d8', resource: 'hp' }, { op: 'cleanse', count: 1, kind: 'debuff' }],
      desc: 'Ты и союзники в радиусе 5 клеток: лечение 5d8 ЗДР и снятие 1 дебаффа. Дважды за бой.' }),
    ab('black-box', 'Чёрный ящик', 18, null, { cost: 12, range: 6, target: 'ally', usesPerBattle: 1,
      effects: [{ op: 'stabilize' }, { op: 'heal', dice: '8d8', resource: 'hp' }, { op: 'shield', dice: '4d6' }],
      desc: 'Аварийный протокол: поднимает упавшего, лечит 8d8 ЗДР и даёт 4d6 врем. ЗДР. Раз за бой.' }),

    // ---------- Путь Изобретателя, 9–20 ----------
    ab('quantum-destabilizer', 'Квантовый дестабилизатор', 9, 'inventor', { ...AOE, cost: 7, range: 12, area: zone(3), save: 'int',
      effects: [{ op: 'buff', stat: 'hit', value: -3, turns: 3 }],
      desc: 'Сбой прицелов: враги в радиусе 3 после провала спасброска ИНТ получают −3 к атаке на 3 хода.' }),
    ab('drone-turret-combo', 'Дрон + Турель', 11, 'inventor', { cost: 10, range: 6, target: 'tile', usesPerBattle: 2,
      effects: [{ op: 'summon', unit: 'turret', turns: 5 }, { op: 'summon', unit: 'drone', turns: 5 }],
      desc: 'Автономная боевая платформа: турель и дрон на 5 ходов.' }),
    ab('black-hole', 'Генератор чёрной дыры', 13, 'inventor', { ...AOE, cost: 12, range: 12, area: zone(3), save: 'str', onSave: 'half', usesPerBattle: 1,
      effects: [{ op: 'damage', dice: '6d8', dmgType: 'energy' }, { op: 'status', id: 'root', turns: 2 }],
      desc: '6d8 энергоурона в радиусе 3; провалившие спасбросок СИЛ обездвижены на 2 хода. Раз за бой.' }),
    ab('tech-avatar', 'Аватар технологии', 17, 'inventor', { cost: 12, action: 'bonus', usesPerBattle: 1,
      effects: [{ op: 'buff', stat: 'dmg', value: 5, turns: 3 }, { op: 'buff', stat: 'kb', value: 3, turns: 3 }, { op: 'shield', dice: '6d6' }],
      desc: 'Превращение в киборга: +5 к урону, +3 КБ на 3 хода и 6d6 врем. ЗДР. Раз за бой.' }),
    ab('creator', 'Создатель', 20, 'inventor', { cost: 15, range: 3, target: 'tile', usesPerBattle: 1,
      effects: [{ op: 'summon', unit: 'junk-mech', turns: 6 }, { op: 'summon', unit: 'turret', turns: 6 }, { op: 'summon', unit: 'drone', turns: 6 }],
      desc: 'Капстоун: за один ход строит боевой мех, турель и дрона на 6 ходов. Раз за бой.' }),

    // ---------- Путь Сапёра, 9–20 ----------
    ab('nuke-charge', 'Ядерная закладка', 9, 'sapper', { ...AOE, cost: 11, range: 10, area: zone(3), save: 'dex', onSave: 'half', usesPerBattle: 1,
      effects: [{ op: 'damage', dice: '7d6', dmgType: 'fire' }],
      desc: '7d6 огненного урона в радиусе 3, спасбросок ЛВК — половина. Раз за бой.' }),
    ab('illusory-labyrinth', 'Иллюзорный лабиринт', 11, 'sapper', { ...AOE, cost: 8, range: 10, area: zone(3), save: 'wil', usesPerBattle: 2,
      effects: [{ op: 'status', id: 'hallucination', turns: 2 }, { op: 'status', id: 'slow', turns: 2 }],
      desc: 'Враги в радиусе 3 теряют ориентацию: галлюцинации и замедление на 2 хода (спасбросок ТВД). Дважды за бой.' }),
    ab('time-loop', 'Временная петля', 13, 'sapper', { cost: 9, range: 10, target: 'enemy', roll: 'save', save: 'wil', usesPerBattle: 2,
      effects: [{ op: 'status', id: 'stun', turns: 1 }, { op: 'status', id: 'slow', turns: 2 }],
      desc: 'Ловушка сбрасывает ход врага: оглушение на 1 ход и замедление на 2 (спасбросок ТВД). Дважды за бой.' }),
    ab('minefield', 'Минное поле', 15, 'sapper', { ...AOE, cost: 12, range: 12, area: zone(4), save: 'dex', onSave: 'half', usesPerBattle: 2,
      effects: [{ op: 'damage', dice: '6d6', dmgType: 'fire' }, { op: 'status', id: 'root', turns: 1 }],
      desc: '6d6 огненного урона в радиусе 4; провалившие спасбросок ЛВК обездвижены на 1 ход. Дважды за бой.' }),
    ab('antimatter-charge', 'Антиматериальный заряд', 17, 'sapper', { ...AOE, cost: 14, range: 12, area: zone(4), save: 'dex', onSave: 'half', usesPerBattle: 1,
      effects: [{ op: 'damage', dice: '9d8', dmgType: 'energy' }],
      desc: '9d8 энергоурона в радиусе 4, спасбросок ЛВК — половина. Раз за бой.' }),
    ab('sapper-apocalypse', 'Апокалипсис', 20, 'sapper', { ...AOE, cost: 18, range: 14, area: zone(5), save: 'dex', onSave: 'half', usesPerBattle: 1,
      effects: [{ op: 'damage', dice: '12d6', dmgType: 'fire' }, { op: 'status', id: 'burn', turns: 3 }],
      desc: 'Капстоун: 12d6 огненного урона в радиусе 5; провалившие спасбросок ЛВК ещё и горят 3 хода. Раз за бой.' }),

    // ---------- Путь Механика, 9–20 ----------
    ab('guillotine-prosthesis', 'Протез-гильотина', 9, 'mechanic', { cost: 6, range: 1, target: 'enemy', roll: 'attack',
      effects: [{ op: 'damage', dice: '4d8', dmgType: 'slash', bonus: 'castMod' }],
      desc: 'Замена руки на клинок: 4d8 + ИНТ рубящего урона в ближнем бою.' }),
    ab('nano-killers', 'Наноботы-убийцы', 11, 'mechanic', { ...AOE, cost: 9, range: 10, area: zone(3), save: 'con', onSave: 'half', usesPerBattle: 2,
      effects: [{ op: 'damage', dice: '5d6', dmgType: 'electric' }, { op: 'status', id: 'corrosion', turns: 3 }],
      desc: '5d6 электроурона в радиусе 3; провалившие спасбросок ТЕЛ ещё и теряют КБ (коррозия 3 хода). Дважды за бой.' }),
    ab('anti-grav-belt', 'Антигравитационный пояс', 13, 'mechanic', { cost: 6, action: 'bonus', range: 6, target: 'ally',
      effects: [{ op: 'buff', stat: 'speed', value: 3, turns: 4 }, { op: 'buff', stat: 'kb', value: 2, turns: 4 }],
      desc: 'Союзник скользит над землёй: +3 к скорости и +2 КБ на 4 хода.' }),
    ab('cyber-titan', 'Кибер-титан', 15, 'mechanic', { cost: 10, action: 'bonus', usesPerBattle: 1,
      effects: [{ op: 'buff', stat: 'dmg', value: 4, turns: 4 }, { op: 'buff', stat: 'hit', value: 2, turns: 4 }, { op: 'buff', stat: 'kb', value: 3, turns: 4 }],
      desc: 'Импланты на 200%: +4 к урону, +2 к атаке и +3 КБ на 4 хода. Раз за бой.' }),
    ab('mass-overclock', 'Массовый разгон', 17, 'mechanic', { cost: 10, action: 'bonus', area: zone(6), usesPerBattle: 1,
      effects: [{ op: 'buff', stat: 'dmg', value: 4, turns: 4 }, { op: 'buff', stat: 'hit', value: 2, turns: 4 }, { op: 'status', id: 'haste', turns: 3 }],
      desc: 'Ты и союзники в радиусе 6: +4 к урону, +2 к атаке на 4 хода и ускорение на 3. Раз за бой.' }),
    ab('absolute-mechanic', 'Абсолютный механик', 20, 'mechanic', { cost: 16, area: zone(8), usesPerBattle: 1,
      effects: [{ op: 'heal', dice: '8d8', resource: 'hp' }, { op: 'shield', dice: '5d6' }, { op: 'cleanse', count: 3, kind: 'any' }, { op: 'status', id: 'regen', turns: 4 }],
      desc: 'Капстоун: ты и союзники в радиусе 8: лечение 8d8 ЗДР, 5d6 врем. ЗДР, снятие 3 статусов и регенерация на 4 хода. Раз за бой.' }),
  ],
  upgrades: UPGRADES,
  canon: ['rules/classes.md', 'rules/class-paths.md', 'rules/class-roadmap.md', 'rules/spells.md', 'extra/specialties.md'],
  lore: 'Мастера по созданию и ремонту технологий: оружие, броня, дроны и устройства, которые помогают в бою и исследовании.',
};
