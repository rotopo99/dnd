// Враги, призывы, NPC-союзники и стандартные бои. Контракт — docs/specs/core-rules.md.
// Канон: lore/history.md, lore/timeline.md, lore/faction-stances.md, rules/races.md,
// rules/effects.md, rules/talents.md (фракционные таланты), art/MANIFEST.txt (Ползун, Мех свалок).
//
// Все числа готовые. Дополнительные поля сверх схемы:
//   level       — уровень (для бонуса владения: 1–4 → +2, 5 → +3);
//   castStat    — характеристика способностей: атака = mod + владение, СЛ = 8 + mod + владение;
//   weapon.attack — итоговый бонус атаки = mod(weapon.stat) + владение + 1 (ступень «владеет») + weapon.hit.
//                 Движок может брать готовое число или считать по формуле — результат один.
//                 Урон оружия = dice + mod(weapon.stat).
//   immuneStatus — id статусов, которые не накладываются;
//   boss, summon, defaultTurns, decoy, noAttack, desc, canon.
// МРЛ врагов задан вручную (а не 10 + 2×ТВД + ур), примерно 0.8–1.2 от ЗДР:
// иначе кринж-путь против врагов был бы бесполезен.
// Машины без психики: immune к cringe/psychic, МРЛ условный.

const ability = (o) => ({
  level: 1, path: null, cost: 0, action: 'action', trigger: null,
  range: 1, target: 'enemy', area: null, roll: 'attack', save: null, onSave: 'none',
  usesPerBattle: null, effects: [], desc: '', canon: null,
  ...o,
});

const NO_MIND = { cringe: 'immune', psychic: 'immune' };

export const ENEMIES = {
  // ----------------------------------------------------------- Культ Судьи
  cultist: {
    id: 'cultist', name: 'Культист-фанатик', level: 1, tags: ['organic'],
    stats: { str: 13, dex: 12, con: 12, int: 8, wil: 10, cha: 8, per: 10 },
    hp: 11, mrl: 9, enr: 0, kb: 12, speed: 6, castStat: 'wil',
    weapon: { name: 'Шоковая дубинка', dice: '1d6', dmgType: 'blunt', stat: 'str', range: 1, hit: -1, attack: 3 },
    abilities: [
      ability({ id: 'shock-baton', name: 'Разряд дубинки', usesPerBattle: 1,
        effects: [{ op: 'weapon', extraDice: '1d4', extraType: 'electric' }],
        desc: 'Удар с разрядом: +1d4 электро.' }),
    ],
    resist: {}, immuneStatus: ['fear'], ai: 'melee', xp: 25,
    desc: 'Рядовой Культа Судьи, участник теракта на Альфа-Гармонии. «Слепая вера» — не знает страха.',
    canon: ['lore/timeline.md', 'rules/talents.md'],
  },
  'cultist-5': {
    id: 'cultist-5', name: 'Культист-каратель', level: 5, tags: ['organic'],
    stats: { str: 16, dex: 12, con: 14, int: 8, wil: 12, cha: 8, per: 10 },
    hp: 26, mrl: 20, enr: 0, kb: 14, speed: 6, castStat: 'wil',
    weapon: { name: 'Шоковый тесак', dice: '1d8', dmgType: 'slash', stat: 'str', range: 1, hit: -1, attack: 6 },
    abilities: [
      ability({ id: 'shock-blade', name: 'Разряд тесака', usesPerBattle: 2,
        effects: [{ op: 'weapon', extraDice: '1d6', extraType: 'electric' }],
        desc: 'Удар с разрядом: +1d6 электро.' }),
      ability({ id: 'death-code', name: 'Код смерти', range: 7, roll: 'save', save: 'wil', onSave: 'half', usesPerBattle: 1,
        effects: [{ op: 'damage', dice: '2d6', dmgType: 'cyber' }],
        desc: 'Фраза-вирус Судьи: 2d6 кибер (спас ТВД, СЛ 12 — половина). Страшнее всего для уязвимых к киберу.',
        canon: 'rules/talents.md' }),
    ],
    resist: {}, immuneStatus: ['fear'], ai: 'melee', xp: 100,
    desc: 'Опытный боец культа. Знает «Код смерти» — фразу, отключающую машины.',
    canon: ['lore/timeline.md', 'rules/talents.md'],
  },
  'cultist-gunner': {
    id: 'cultist-gunner', name: 'Культист-стрелок', level: 1, tags: ['organic'],
    stats: { str: 8, dex: 12, con: 10, int: 10, wil: 10, cha: 8, per: 12 },
    hp: 8, mrl: 8, enr: 0, kb: 12, speed: 6, castStat: 'dex',
    weapon: { name: 'Самопал', dice: '1d6', dmgType: 'pierce', stat: 'dex', range: 10, hit: -1, attack: 3 },
    abilities: [
      ability({ id: 'incendiary', name: 'Зажигательный заряд', range: 8, target: 'tile',
        area: { shape: 'radius', size: 1 }, roll: 'save', save: 'dex', onSave: 'half', usesPerBattle: 1,
        effects: [{ op: 'damage', dice: '1d6', dmgType: 'fire' }, { op: 'status', id: 'burn', turns: 1 }],
        desc: 'Бросок самодельной зажигалки: 1d6 огня в радиусе 1 и горение на 1 ход (спас ЛВК, СЛ 11 — половина урона).' }),
    ],
    resist: {}, immuneStatus: ['fear'], ai: 'ranged', xp: 25,
    desc: 'Стрелок теракта: самопал и зажигательные заряды.',
    canon: ['lore/history.md'],
  },
  'cultist-gunner-5': {
    id: 'cultist-gunner-5', name: 'Культист-снайпер', level: 5, tags: ['organic'],
    stats: { str: 8, dex: 16, con: 12, int: 10, wil: 12, cha: 8, per: 14 },
    hp: 20, mrl: 17, enr: 0, kb: 14, speed: 6, castStat: 'dex',
    weapon: { name: 'Винтовка', dice: '1d10', dmgType: 'pierce', stat: 'dex', range: 13, hit: -1, attack: 6 },
    abilities: [
      ability({ id: 'incendiary-5', name: 'Зажигательный заряд', range: 8, target: 'tile',
        area: { shape: 'radius', size: 1 }, roll: 'save', save: 'dex', onSave: 'half', usesPerBattle: 1,
        effects: [{ op: 'damage', dice: '2d6', dmgType: 'fire' }, { op: 'status', id: 'burn', turns: 2 }],
        desc: '2d6 огня в радиусе 1 и горение на 2 хода (спас ЛВК, СЛ 14 — половина урона).' }),
    ],
    resist: {}, immuneStatus: ['fear'], ai: 'ranged', xp: 100,
    canon: ['lore/history.md'],
  },
  acolyte: {
    id: 'acolyte', name: 'Аколит Судьи', level: 1, tags: ['organic'], boss: true,
    stats: { str: 8, dex: 12, con: 12, int: 12, wil: 15, cha: 13, per: 10 },
    hp: 26, mrl: 24, enr: 12, kb: 12, speed: 6, castStat: 'wil',
    weapon: { name: 'Ритуальный кинжал', dice: '1d4', dmgType: 'pierce', stat: 'dex', range: 1, hit: -1, attack: 3 },
    abilities: [
      ability({ id: 'judge-whisper', name: 'Шёпот Судьи', range: 10, roll: 'save', save: 'wil', onSave: 'half',
        effects: [{ op: 'damage', dice: '2d6', dmgType: 'psychic' }],
        desc: 'Голос из статических помех: 2d6 пси-урона по МРЛ (спас ТВД, СЛ 12 — половина). При «Надломе» спас с помехой.',
        canon: 'rules/effects.md' }),
      ability({ id: 'judge-curse', name: 'Проклятие Судьи', cost: 3, range: 8, roll: 'save', save: 'wil', onSave: 'none',
        effects: [{ op: 'status', id: 'curse', turns: 2 }],
        desc: '−2 к атаке и спасброскам на 2 хода (спас ТВД, СЛ 12).', canon: 'rules/effects.md' }),
      ability({ id: 'judge-voice', name: 'Голос Судьи', cost: 2, action: 'bonus', range: 0, target: 'ally',
        area: { shape: 'radius', size: 4 }, roll: 'auto', usesPerBattle: 2,
        effects: [{ op: 'buff', stat: 'hit', value: 1, turns: 2 }],
        desc: 'Культисты в радиусе 4 слышат шёпот: +1 к атаке на 2 хода.', canon: 'rules/effects.md' }),
      ability({ id: 'cyberspace-vision', name: 'Видение Киберспейса', cost: 4, range: 8, roll: 'save', save: 'wil', onSave: 'none', usesPerBattle: 1,
        effects: [{ op: 'status', id: 'hallucination', turns: 1 }, { op: 'damage', dice: '1d6', dmgType: 'psychic' }],
        desc: 'Галлюцинации на 1 ход и 1d6 пси (спас ТВД, СЛ 12 — ничего).', canon: 'rules/effects.md' }),
    ],
    resist: {}, immuneStatus: ['fear'], ai: 'caster', xp: 100,
    desc: 'Босс пролога. Аколит Кибер-Жреца, руководит терактом на Альфа-Гармонии. Бьёт по рассудку.',
    canon: ['lore/faction-stances.md', 'rules/effects.md'],
  },
  'acolyte-5': {
    id: 'acolyte-5', name: 'Старший аколит Судьи', level: 5, tags: ['organic'], boss: true,
    stats: { str: 8, dex: 12, con: 14, int: 12, wil: 18, cha: 14, per: 12 },
    hp: 50, mrl: 40, enr: 24, kb: 14, speed: 6, castStat: 'wil',
    weapon: { name: 'Ритуальный кинжал', dice: '1d4', dmgType: 'pierce', stat: 'dex', range: 1, hit: -1, attack: 4 },
    abilities: [
      ability({ id: 'judge-whisper-5', name: 'Шёпот Судьи', range: 10, roll: 'save', save: 'wil', onSave: 'half',
        effects: [{ op: 'damage', dice: '3d6', dmgType: 'psychic' }],
        desc: '3d6 пси-урона по МРЛ (спас ТВД, СЛ 15 — половина).' }),
      ability({ id: 'judge-curse-5', name: 'Проклятие Судьи', cost: 3, range: 8, roll: 'save', save: 'wil', onSave: 'none',
        effects: [{ op: 'status', id: 'curse', turns: 3 }],
        desc: '−2 к атаке и спасброскам на 3 хода (спас ТВД, СЛ 15).' }),
      ability({ id: 'soul-theft', name: 'Похищение души', cost: 4, range: 6, roll: 'attack',
        effects: [{ op: 'drain', dice: '2d6', dmgType: 'cyber', to: 'hp', ratio: 0.5 }],
        desc: '2d6 кибер, аколит лечится на половину нанесённого.', canon: 'rules/spellcasting.md' }),
      ability({ id: 'judge-voice-5', name: 'Голос Судьи', cost: 2, action: 'bonus', range: 0, target: 'ally',
        area: { shape: 'radius', size: 4 }, roll: 'auto', usesPerBattle: 2,
        effects: [{ op: 'buff', stat: 'hit', value: 1, turns: 2 }],
        desc: 'Союзники в радиусе 4: +1 к атаке на 2 хода.' }),
    ],
    resist: {}, immuneStatus: ['fear'], ai: 'caster', xp: 300,
    canon: ['lore/faction-stances.md'],
  },
  skrilet: {
    id: 'skrilet', name: 'Скрилет-убийца', level: 1, tags: ['hybrid'],
    stats: { str: 12, dex: 15, con: 12, int: 12, wil: 10, cha: 3, per: 14 },
    hp: 15, mrl: 12, enr: 0, kb: 14, speed: 7, castStat: 'dex',
    weapon: { name: 'Кибер-клинок', dice: '1d6', dmgType: 'slash', stat: 'dex', range: 1, hit: 0, attack: 5 },
    abilities: [
      ability({ id: 'skrilet-cloak', name: 'Невидимость', action: 'bonus', range: 0, target: 'self', roll: 'auto', usesPerBattle: 1,
        effects: [{ op: 'status', id: 'invisible', turns: 2 }],
        desc: 'Исчезает на 2 хода.', canon: 'rules/races.md' }),
      ability({ id: 'skrilet-strike', name: 'Смертельный удар', usesPerBattle: 1,
        effects: [{ op: 'weapon', extraDice: '2d6', extraType: 'cyber' }],
        desc: '+2d6 кибер-урона.', canon: 'rules/races.md' }),
    ],
    resist: { cringe: 'resist', cyber: 'vuln' }, immuneStatus: ['fear'], ai: 'melee', xp: 50,
    desc: 'Бездушная машина Судьи из поглощённых душ. Лишён эмоций, уязвим к взлому.',
    canon: ['rules/races.md', 'lore/faction-stances.md'],
  },
  'skrilet-5': {
    id: 'skrilet-5', name: 'Скрилет-палач', level: 5, tags: ['hybrid'],
    stats: { str: 14, dex: 18, con: 14, int: 12, wil: 10, cha: 3, per: 16 },
    hp: 34, mrl: 24, enr: 0, kb: 16, speed: 7, castStat: 'dex',
    weapon: { name: 'Кибер-клинок', dice: '1d8', dmgType: 'slash', stat: 'dex', range: 1, hit: -1, attack: 7 },
    abilities: [
      ability({ id: 'skrilet-cloak-5', name: 'Невидимость', action: 'bonus', range: 0, target: 'self', roll: 'auto', usesPerBattle: 1,
        effects: [{ op: 'status', id: 'invisible', turns: 2 }], desc: 'Исчезает на 2 хода.' }),
      ability({ id: 'skrilet-strike-5', name: 'Смертельный удар', usesPerBattle: 1,
        effects: [{ op: 'weapon', extraDice: '3d6', extraType: 'cyber' }], desc: '+3d6 кибер-урона.' }),
    ],
    resist: { cringe: 'resist', cyber: 'vuln' }, immuneStatus: ['fear'], ai: 'melee', xp: 150,
    canon: ['rules/races.md'],
  },

  // ------------------------------------------------------------ Мусорщики
  scavenger: {
    id: 'scavenger', name: 'Мусорщик', level: 1, tags: ['organic'],
    stats: { str: 12, dex: 13, con: 12, int: 9, wil: 9, cha: 8, per: 12 },
    hp: 10, mrl: 8, enr: 0, kb: 12, speed: 6, castStat: 'dex',
    weapon: { name: 'Заточка', dice: '1d6', dmgType: 'slash', stat: 'dex', range: 1, hit: -1, attack: 3 },
    abilities: [
      ability({ id: 'junk-throw', name: 'Бросок мусором', range: 6,
        effects: [{ op: 'damage', dice: '1d4', dmgType: 'blunt', bonus: 1 }],
        desc: 'Метает что под руку попало: 1d4+1 дробящего.', canon: 'rules/talents.md' }),
      ability({ id: 'dirty-trick', name: 'Грязный приём', action: 'bonus', roll: 'save', save: 'dex', usesPerBattle: 1,
        effects: [{ op: 'status', id: 'blind', turns: 1 }],
        desc: 'Песок в глаза: ослепление на 1 ход (спас ЛВК, СЛ 11).', canon: 'rules/talents.md' }),
    ],
    resist: {}, immuneStatus: [], ai: 'melee', xp: 20,
    desc: 'Мародёр со свалок, вассал пиратов. «Сильнейший выживает»; скелеты для них — добыча.',
    canon: ['lore/history.md', 'lore/timeline.md'],
  },
  'scavenger-5': {
    id: 'scavenger-5', name: 'Бандит мусорщиков', level: 5, tags: ['organic'],
    stats: { str: 12, dex: 16, con: 14, int: 9, wil: 10, cha: 8, per: 12 },
    hp: 24, mrl: 16, enr: 0, kb: 14, speed: 6, castStat: 'dex',
    weapon: { name: 'Тесак из рессоры', dice: '1d8', dmgType: 'slash', stat: 'dex', range: 1, hit: -1, attack: 6 },
    abilities: [
      ability({ id: 'junk-throw-5', name: 'Бросок мусором', range: 6,
        effects: [{ op: 'damage', dice: '1d8', dmgType: 'blunt', bonus: 1 }], desc: '1d8+1 дробящего.' }),
      ability({ id: 'dirty-trick-5', name: 'Грязный приём', action: 'bonus', roll: 'save', save: 'dex', usesPerBattle: 1,
        effects: [{ op: 'status', id: 'blind', turns: 1 }], desc: 'Ослепление на 1 ход (спас ЛВК, СЛ 14).' }),
    ],
    resist: {}, immuneStatus: [], ai: 'melee', xp: 90,
    canon: ['lore/history.md'],
  },
  'junk-mech': {
    id: 'junk-mech', name: 'Мех свалок', level: 1, tags: ['mechanical'],
    stats: { str: 16, dex: 8, con: 16, int: 3, wil: 10, cha: 1, per: 8 },
    hp: 24, mrl: 20, enr: 0, kb: 15, speed: 4, castStat: 'con',
    weapon: { name: 'Гидрокулак', dice: '1d10', dmgType: 'blunt', stat: 'str', range: 1, hit: -1, attack: 5 },
    abilities: [
      ability({ id: 'discharge', name: 'Разряд', range: 0, target: 'tile', area: { shape: 'radius', size: 1 },
        roll: 'save', save: 'dex', onSave: 'half', usesPerBattle: 1,
        effects: [{ op: 'damage', dice: '1d6', dmgType: 'electric' }],
        desc: 'Сброс заряда вокруг себя: 1d6 электро в радиусе 1 (спас ЛВК, СЛ 13 — половина).' }),
    ],
    resist: { pierce: 'resist', ...NO_MIND }, immuneStatus: ['fear', 'cringed', 'hallucination'], ai: 'melee', xp: 60,
    desc: 'Тяжёлый мех, собранный из хлама Свалок Короля. Медленный, держит пули. Мини-босс для 1-го уровня.',
    canon: ['art/MANIFEST.txt'],
  },
  'junk-mech-5': {
    id: 'junk-mech-5', name: 'Мех свалок (бронированный)', level: 5, tags: ['mechanical'],
    stats: { str: 18, dex: 8, con: 18, int: 3, wil: 10, cha: 1, per: 8 },
    hp: 48, mrl: 30, enr: 0, kb: 16, speed: 4, castStat: 'con',
    weapon: { name: 'Гидрокулак', dice: '2d8', dmgType: 'blunt', stat: 'str', range: 1, hit: -1, attack: 7 },
    abilities: [
      ability({ id: 'discharge-5', name: 'Разряд', range: 0, target: 'tile', area: { shape: 'radius', size: 1 },
        roll: 'save', save: 'dex', onSave: 'half', usesPerBattle: 1,
        effects: [{ op: 'damage', dice: '3d6', dmgType: 'electric' }],
        desc: '3d6 электро в радиусе 1 (спас ЛВК, СЛ 15 — половина).' }),
    ],
    resist: { pierce: 'resist', ...NO_MIND }, immuneStatus: ['fear', 'cringed', 'hallucination'], ai: 'melee', xp: 200,
    canon: ['art/MANIFEST.txt'],
  },

  // ------------------------------------------------------------- Пустоши
  crawler: {
    id: 'crawler', name: 'Ползун', level: 1, tags: ['organic'],
    stats: { str: 12, dex: 13, con: 12, int: 2, wil: 8, cha: 3, per: 14 },
    hp: 9, mrl: 6, enr: 0, kb: 13, speed: 8, castStat: 'con',
    weapon: { name: 'Жвалы', dice: '1d6', dmgType: 'slash', stat: 'dex', range: 1, hit: 0, attack: 4 },
    abilities: [
      ability({ id: 'venom-bite', name: 'Ядовитый укус', usesPerBattle: 1,
        effects: [{ op: 'weapon', extraDice: '1d4', extraType: 'toxin' }, { op: 'status', id: 'poison', turns: 2 }],
        desc: '+1d4 яда и отравление на 2 хода.' }),
    ],
    resist: { toxin: 'resist' }, immuneStatus: ['poison'], ai: 'melee', xp: 25,
    desc: 'Мутант-хищник пустошей (вирус «Химера»). Быстрый, ядовитый.',
    canon: ['art/MANIFEST.txt', 'lore/timeline.md'],
  },
  'crawler-5': {
    id: 'crawler-5', name: 'Матёрый ползун', level: 5, tags: ['organic'],
    stats: { str: 14, dex: 16, con: 14, int: 2, wil: 8, cha: 3, per: 14 },
    hp: 24, mrl: 14, enr: 0, kb: 15, speed: 8, castStat: 'con',
    weapon: { name: 'Жвалы', dice: '1d10', dmgType: 'slash', stat: 'dex', range: 1, hit: -1, attack: 6 },
    abilities: [
      ability({ id: 'venom-bite-5', name: 'Ядовитый укус', usesPerBattle: 2,
        effects: [{ op: 'weapon', extraDice: '2d4', extraType: 'toxin' }, { op: 'status', id: 'poison', turns: 3 }],
        desc: '+2d4 яда и отравление на 3 хода.' }),
    ],
    resist: { toxin: 'resist' }, immuneStatus: ['poison'], ai: 'melee', xp: 100,
    canon: ['art/MANIFEST.txt'],
  },

  // ------------------------------------------------------------ Кринжгоны
  'cringe-jester': {
    id: 'cringe-jester', name: 'Кринж-шут', level: 1, tags: ['organic'],
    stats: { str: 8, dex: 14, con: 10, int: 10, wil: 12, cha: 15, per: 10 },
    hp: 10, mrl: 16, enr: 0, kb: 11, speed: 6, castStat: 'cha',
    weapon: { name: 'Кринж-шутка', dice: '1d6', dmgType: 'cringe', stat: 'cha', range: 6, hit: -1, attack: 4 },
    abilities: [
      ability({ id: 'cringe-wave', name: 'Кринж-волна', range: 6, target: 'tile', area: { shape: 'radius', size: 2 },
        roll: 'save', save: 'wil', onSave: 'half', usesPerBattle: 1,
        effects: [{ op: 'damage', dice: '1d6', dmgType: 'cringe' }, { op: 'status', id: 'cringed', turns: 2 }],
        desc: 'Шутка, от которой хочется провалиться: 1d6 кринжа по МРЛ в радиусе 2 и кринж-эффект на 2 хода (спас ТВД, СЛ 12 — половина урона).' }),
    ],
    resist: { cringe: 'resist', psychic: 'resist', proxy: 'immune' }, immuneStatus: [], ai: 'caster', xp: 30,
    desc: 'Шут Кринж-Вождя: «использует кринж как оружие». Хрупкий (−1 к защите), бьёт по рассудку.',
    canon: ['lore/history.md', 'rules/races.md'],
  },
  'cringe-jester-5': {
    id: 'cringe-jester-5', name: 'Кринж-шут (ветеран)', level: 5, tags: ['organic'],
    stats: { str: 8, dex: 14, con: 12, int: 10, wil: 14, cha: 17, per: 10 },
    hp: 22, mrl: 30, enr: 0, kb: 13, speed: 6, castStat: 'cha',
    weapon: { name: 'Кринж-шутка', dice: '1d8', dmgType: 'cringe', stat: 'cha', range: 6, hit: -1, attack: 6 },
    abilities: [
      ability({ id: 'cringe-wave-5', name: 'Кринж-волна', range: 6, target: 'tile', area: { shape: 'radius', size: 2 },
        roll: 'save', save: 'wil', onSave: 'half', usesPerBattle: 1,
        effects: [{ op: 'damage', dice: '2d6', dmgType: 'cringe' }, { op: 'status', id: 'cringed', turns: 2 }],
        desc: '2d6 кринжа по МРЛ в радиусе 2 и кринж-эффект на 2 хода (спас ТВД, СЛ 14 — половина урона).' }),
    ],
    resist: { cringe: 'resist', psychic: 'resist', proxy: 'immune' }, immuneStatus: [], ai: 'caster', xp: 100,
    canon: ['lore/history.md'],
  },

  // -------------------------------------------------------- NPC-союзники
  'npc-gans': {
    id: 'npc-gans', name: 'Ганс', level: 1, tags: ['organic'],
    stats: { str: 11, dex: 13, con: 12, int: 11, wil: 13, cha: 10, per: 13 },
    hp: 11, mrl: 14, enr: 0, kb: 13, speed: 6, castStat: 'per',
    weapon: { name: 'Автомат ГО', dice: '1d6', dmgType: 'pierce', stat: 'dex', range: 13, hit: -1, attack: 3 },
    abilities: [
      ability({ id: 'auto-camo', name: 'Автокамуфляж', action: 'bonus', range: 0, target: 'self', roll: 'auto', usesPerBattle: 1,
        effects: [{ op: 'status', id: 'stealth', turns: 2 }],
        desc: 'Камуфляж сливается с фоном: скрытность на 2 хода.', canon: 'lore/history.md' }),
      ability({ id: 'no-casualties', name: 'Без жертв', range: 1, target: 'ally', roll: 'auto', usesPerBattle: 1,
        effects: [{ op: 'stabilize' }, { op: 'heal', dice: '1d4', resource: 'hp' }],
        desc: 'Бывший боец ГО и ЧС не бросает своих: поднимает союзника из «Без сознания» и лечит 1d4.', canon: 'lore/history.md' }),
    ],
    resist: {}, immuneStatus: [], ai: 'ranged', xp: 0,
    desc: 'Техник-милитарист, без аугментаций, в автокамуфляже. Бывший боец ГО и ЧС, всегда обходился без жертв — до теракта LOX. Союзник героя в prologue-3; по силе — как культист-стрелок.',
    canon: ['lore/history.md'],
  },

  // -------------------------------------------------------------- Призывы
  // Слабее героя, живут defaultTurns ходов (если summon не задаёт turns), уровень 1.
  drone: {
    id: 'drone', name: 'Боевой дрон', level: 1, tags: ['mechanical'], summon: true, defaultTurns: 3,
    stats: { str: 6, dex: 14, con: 10, int: 6, wil: 10, cha: 1, per: 12 },
    hp: 6, mrl: 10, enr: 0, kb: 13, speed: 8, castStat: null,
    weapon: { name: 'Лазер', dice: '1d4', dmgType: 'energy', stat: 'dex', range: 8, hit: -1, attack: 4 },
    abilities: [], resist: { ...NO_MIND }, immuneStatus: ['fear', 'cringed', 'hallucination'], ai: 'ranged', xp: 0,
    canon: ['rules/class-roadmap.md'],
  },
  turret: {
    id: 'turret', name: 'Мини-турель', level: 1, tags: ['mechanical'], summon: true, defaultTurns: 3,
    stats: { str: 10, dex: 12, con: 12, int: 3, wil: 10, cha: 1, per: 12 },
    hp: 10, mrl: 10, enr: 0, kb: 14, speed: 0, castStat: null,
    weapon: { name: 'Спаренный ствол', dice: '1d6', dmgType: 'pierce', stat: 'dex', range: 10, hit: 0, attack: 4 },
    abilities: [], resist: { ...NO_MIND }, immuneStatus: ['fear', 'cringed', 'hallucination', 'prone'], ai: 'ranged', xp: 0,
    desc: 'Канон: «Мини-турель (1d6 урона, 2 заряда)» — в Лайт ограничена сроком.',
    canon: ['rules/class-roadmap.md'],
  },
  'beast-wolf': {
    id: 'beast-wolf', name: 'Волк-мутант', level: 1, tags: ['organic'], summon: true, defaultTurns: 3,
    stats: { str: 12, dex: 14, con: 12, int: 3, wil: 10, cha: 6, per: 14 },
    hp: 10, mrl: 8, enr: 0, kb: 13, speed: 8, castStat: null,
    weapon: { name: 'Клыки', dice: '1d6', dmgType: 'slash', stat: 'dex', range: 1, hit: -1, attack: 4 },
    abilities: [], resist: {}, immuneStatus: [], ai: 'melee', xp: 0,
    canon: ['rules/classes.md'],
  },
  'cyber-demon': {
    id: 'cyber-demon', name: 'Кибер-демон', level: 1, tags: ['digital'], summon: true, defaultTurns: 2,
    stats: { str: 14, dex: 12, con: 12, int: 8, wil: 12, cha: 6, per: 10 },
    hp: 12, mrl: 12, enr: 0, kb: 12, speed: 6, castStat: null,
    weapon: { name: 'Когти из кода', dice: '1d10', dmgType: 'cyber', stat: 'str', range: 1, hit: -1, attack: 4 },
    abilities: [], resist: { cyber: 'resist', toxin: 'immune', proxy: 'vuln' }, immuneStatus: ['fear', 'poison', 'bleed'], ai: 'melee', xp: 0,
    desc: 'Канон: «Призыв демона — 1d10 урона/ход (2 хода)».',
    canon: ['rules/spellcasting.md', 'rules/feats.md'],
  },
  'gang-thug': {
    id: 'gang-thug', name: 'Братан с района', level: 1, tags: ['organic'], summon: true, defaultTurns: 3,
    stats: { str: 13, dex: 10, con: 12, int: 8, wil: 9, cha: 8, per: 10 },
    hp: 9, mrl: 7, enr: 0, kb: 11, speed: 6, castStat: null,
    weapon: { name: 'Бита', dice: '1d6', dmgType: 'blunt', stat: 'str', range: 1, hit: -1, attack: 3 },
    abilities: [], resist: {}, immuneStatus: [], ai: 'melee', xp: 0,
    canon: ['rules/classes.md'],
  },
  biomass: {
    id: 'biomass', name: 'Биомасса', level: 1, tags: ['organic'], summon: true, defaultTurns: 3,
    stats: { str: 12, dex: 6, con: 14, int: 1, wil: 10, cha: 1, per: 8 },
    hp: 12, mrl: 10, enr: 0, kb: 10, speed: 3, castStat: 'con',
    weapon: { name: 'Щупальца', dice: '1d4', dmgType: 'blunt', stat: 'str', range: 1, hit: -1, attack: 3 },
    abilities: [
      ability({ id: 'entangle', name: 'Опутывание', roll: 'save', save: 'str',
        effects: [{ op: 'status', id: 'root', turns: 1 }],
        desc: 'Обездвиживание на 1 ход (спас СИЛ, СЛ 12).' }),
    ],
    resist: { fire: 'vuln', ...NO_MIND }, immuneStatus: ['fear', 'cringed', 'hallucination', 'prone'], ai: 'melee', xp: 0,
    canon: ['rules/class-roadmap.md'],
  },
  spirit: {
    id: 'spirit', name: 'Дух предков', level: 1, tags: ['digital'], summon: true, defaultTurns: 3,
    stats: { str: 6, dex: 12, con: 10, int: 10, wil: 12, cha: 10, per: 12 },
    hp: 8, mrl: 12, enr: 0, kb: 12, speed: 6, castStat: null,
    weapon: { name: 'Касание духа', dice: '1d6', dmgType: 'psychic', stat: 'dex', range: 1, hit: -1, attack: 3 },
    abilities: [],
    resist: { slash: 'resist', pierce: 'resist', blunt: 'resist', toxin: 'immune', proxy: 'vuln' },
    immuneStatus: ['poison', 'bleed', 'prone'], ai: 'melee', xp: 0,
    desc: 'Бьёт по рассудку (МРЛ), физический урон проходит наполовину.',
    canon: ['rules/class-roadmap.md'],
  },
  hologram: {
    id: 'hologram', name: 'Голограмма', level: 1, tags: ['digital'], summon: true, defaultTurns: 2,
    decoy: true, noAttack: true,
    stats: { str: 1, dex: 10, con: 1, int: 1, wil: 10, cha: 10, per: 1 },
    hp: 1, mrl: 1, enr: 0, kb: 10, speed: 0, castStat: null,
    weapon: null,
    abilities: [], resist: { ...NO_MIND, toxin: 'immune' },
    immuneStatus: ['poison', 'bleed', 'fear', 'cringed', 'hallucination', 'stun', 'prone'],
    ai: 'support', xp: 0,
    desc: 'Ложная цель: 1 ЗДР, не атакует. ИИ врагов считает её существом и тратит на неё атаки.',
    canon: ['rules/races.md', 'rules/effects.md'],
  },
};

// Стандартные бои для баланс-сима: группа против ОДНОГО героя своего уровня.
// Цель — победа героя около 55% (точно подгоняет balance-tester через состав и hp).
// Типы урона в группах подобраны так, чтобы работали расовые плюсы и слабости:
// standard1 — дробящий/колющий/рубящий + электро, огонь, яд;
// standard5 — физический + электро, огонь, кибер, кринж (МРЛ).
export const ENCOUNTERS = {
  standard1: {
    id: 'standard1', name: 'Стандартный бой (ур. 1)', level: 1, targetWinRate: 0.55,
    enemies: ['cultist', 'cultist-gunner', 'crawler'],
  },
  standard5: {
    id: 'standard5', name: 'Стандартный бой (ур. 5)', level: 5, targetWinRate: 0.55,
    enemies: ['cultist-5', 'cultist-gunner-5', 'cringe-jester-5'],
  },
  party1: {
    id: 'party1', name: 'Партийный бой (ур. 1)', level: 1, targetWinRate: 0.6,
    enemies: ['cultist', 'cultist', 'cultist', 'cultist-gunner', 'cultist-gunner', 'skrilet', 'scavenger', 'scavenger', 'crawler', 'junk-mech'],
  },
  party5: {
    id: 'party5', name: 'Партийный бой (ур. 5)', level: 5, targetWinRate: 0.6,
    enemies: ['cultist-5', 'cultist-5', 'cultist-gunner-5', 'cultist-gunner-5', 'skrilet-5', 'cringe-jester-5', 'crawler-5', 'junk-mech-5'],
  },
  prologue1: {
    id: 'prologue1', name: 'Альфа-Гармония: теракт', level: 1,
    enemies: ['cultist', 'cultist-gunner'], allies: [],
  },
  prologue2: {
    id: 'prologue2', name: 'Альфа-Гармония: тень в коридоре', level: 1,
    enemies: ['cultist', 'skrilet'], allies: [],
  },
  prologue3: {
    id: 'prologue3', name: 'Альфа-Гармония: аколит', level: 1,
    enemies: ['acolyte', 'cultist'], allies: ['npc-gans'],
  },
};
