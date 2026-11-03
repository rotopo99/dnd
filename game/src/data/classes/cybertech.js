// КиберТех (аналог Колдуна). Договор с Судьёй; без ЭНР кастует ценой разрыва завесы кибера.
// Канон: rules/classes.md, rules/class-paths.md, rules/class-roadmap.md, rules/spellcasting.md (список «КиберТех»,
// завеса кибера), rules/spells.md, rules/effects.md («Проклятая метка»), extra/specialties.md («Заклинатель киберспейса»).
// Схема — docs/specs/core-rules.md. Числа крутит balance-tester.

const A = (o) => ({
  path: null, trigger: null, area: null, save: null, onSave: 'none', usesPerBattle: null, ...o,
});

export default {
  id: 'cybertech', name: 'КиберТех', analog: 'Колдун', icon: 'class_tech',
  role: 'caster',
  castStat: 'int',            // контроль киберпространства и код Судьи
  hpPerLevel: 1,
  saves: ['wil', 'int'],
  armor: { name: 'Плащ с вшитой сеткой', type: 'light', kb: 2 },
  weapon: { name: 'Ритуальный клинок', dice: '1d6', dmgType: 'slash', stat: 'dex', range: 1, hit: 0 },
  // 27 очков: ЛВК 13 (5) + ТЕЛ 14 (7) + ИНТ 14 (7) + ТВД 13 (5) + ВОС 11 (3) = 27
  recommended: { str: 8, dex: 13, con: 14, int: 14, wil: 13, cha: 8, per: 11 },
  overcast: 'veil',
  allowedRaces: ['human', 'skeleton', 'mutant-beast', 'mutant-plant', 'tekhonok', 'cringegon', 'skrilet'], // канон: андроиды не могут использовать магию (rules/races.md)
  paths: [
    { id: 'soul-eater', name: 'Путь Пожирателя Душ', desc: 'Поглощение душ: крадёт жизнь, жертвует своей кровью ради силы.' },
    { id: 'cyber-demon', name: 'Путь Кибер-Демона', desc: 'Контроль над киберпространством: призывает кибер-демонов и скрилетов.' },
    { id: 'curses', name: 'Путь Проклятий', desc: 'Проклятия Судьи: ослабляет, глушит и метит врагов на смерть.' },
  ],
  passives: [],
  abilities: [
    // ---------- Общие ----------
    A({ id: 'one-dim-shot', name: 'Одномерный выстрел', level: 1, cost: 0, action: 'action',
      range: 8, target: 'enemy', roll: 'attack',
      effects: [{ op: 'damage', dice: '1d8', dmgType: 'cyber', bonus: 'castMod' }],
      desc: 'Плоский луч из киберспейса: 1d8 + ИНТ кибер. Без затрат ЭНР.',
      canon: 'extra/specialties.md' }),
    A({ id: 'soul-theft', name: 'Похищение души', level: 1, cost: 3, action: 'action',
      range: 8, target: 'enemy', roll: 'attack',
      effects: [{ op: 'drain', dice: '2d8', dmgType: 'cyber', to: 'hp', ratio: 0.5 }],
      desc: 'Вырывает кусок души: 2d8 кибер, половину нанесённого — себе в ЗДР.',
      canon: 'rules/class-roadmap.md' }),
    A({ id: 'judge-whisper', name: 'Шёпот Судьи', level: 1, cost: 2, action: 'action',
      range: 8, target: 'enemy', roll: 'save', save: 'wil', onSave: 'half',
      effects: [{ op: 'damage', dice: '1d8', dmgType: 'psychic', bonus: 'castMod' }],
      desc: 'Голос Судьи в голове цели: 1d8 + ИНТ пси (по МРЛ). Спасбросок ТВД — половина.',
      canon: 'rules/spellcasting.md' }),
    A({ id: 'extra-attack', name: 'Дополнительная атака', level: 2, cost: 0, action: 'bonus',
      range: 1, target: 'enemy', roll: 'attack', usesPerBattle: 1,
      effects: [{ op: 'weapon' }],
      desc: 'Ещё одна атака клинком бонусным действием. 1 раз за бой.',
      canon: 'rules/class-paths.md' }),
    A({ id: 'fear', name: 'Страх', level: 3, cost: 3, action: 'action',
      range: 8, target: 'enemy', roll: 'save', save: 'wil',
      effects: [
        { op: 'damage', dice: '1d6', dmgType: 'psychic' },
        { op: 'status', id: 'fear', turns: 2 },
      ],
      desc: 'Цель видит глаз Судьи: 1d6 пси и страх на 2 хода. Спасбросок ТВД — без эффекта.',
      canon: 'rules/spellcasting.md' }),
    A({ id: 'digital-shield', name: 'Цифровой щит', level: 4, cost: 3, action: 'bonus',
      range: 0, target: 'self', roll: 'auto',
      effects: [{ op: 'shield', dice: '2d6', turns: 3 }],
      desc: 'Щит из проклятого кода: поглощает 2d6 урона, 3 хода.',
      canon: 'extra/specialties.md' }),
    A({ id: 'cyber-storm', name: 'Кибер-буря', level: 5, cost: 5, action: 'action',
      range: 8, target: 'tile', area: { shape: 'radius', size: 2 }, roll: 'save', save: 'dex', onSave: 'half',
      effects: [{ op: 'damage', dice: '2d8', dmgType: 'cyber' }],
      desc: 'Буря кибера в зоне 5×5: 2d8 кибер. Спасбросок ЛВК — половина.',
      canon: 'rules/spells.md' }),

    // ---------- Путь Пожирателя Душ ----------
    A({ id: 'shadow-blade', name: 'Теневой клинок', level: 1, path: 'soul-eater', cost: 2, action: 'action',
      range: 1, target: 'enemy', roll: 'attack',
      effects: [{ op: 'weapon', extraDice: '1d8', extraType: 'cyber' }],
      desc: 'Клинок в тени Судьи: удар оружием +1d8 кибер.',
      canon: 'rules/spellcasting.md' }),
    A({ id: 'blood-ritual', name: 'Кровавый ритуал', level: 3, path: 'soul-eater', cost: 2, action: 'bonus',
      range: 0, target: 'self', roll: 'auto',
      effects: [
        { op: 'damage', dice: '1d6', dmgType: 'cyber' },
        { op: 'buff', stat: 'dmg', value: 2, turns: 3 },
      ],
      desc: 'Режет себе ладонь: теряет 1d6 ЗДР, +2 к урону на 3 хода.',
      canon: 'rules/class-roadmap.md' }),
    A({ id: 'cyber-blast', name: 'Кибер-взрыв', level: 5, path: 'soul-eater', cost: 5, action: 'action',
      range: 8, target: 'tile', area: { shape: 'radius', size: 1 }, roll: 'save', save: 'dex', onSave: 'half',
      effects: [{ op: 'drain', dice: '2d6', dmgType: 'cyber', to: 'hp', ratio: 0.5 }],
      desc: 'Взрыв душ в зоне 3×3: 2d6 кибер каждому, половина нанесённого — себе в ЗДР. Спасбросок ЛВК — половина.',
      canon: 'rules/class-roadmap.md' }),

    // ---------- Путь Кибер-Демона ----------
    A({ id: 'shadow-summon', name: 'Призыв тени', level: 1, path: 'cyber-demon', cost: 4, action: 'action',
      range: 0, target: 'self', roll: 'auto',
      effects: [{ op: 'summon', unit: 'cyber-demon', turns: 2 }],
      desc: 'Из щели в завесе вылезает кибер-демон на 2 хода.',
      canon: 'rules/class-roadmap.md' }),
    A({ id: 'cyber-fangs', name: 'Кибер-клыки', level: 3, path: 'cyber-demon', cost: 3, action: 'bonus',
      range: 6, target: 'ally', roll: 'auto',
      effects: [{ op: 'buff', stat: 'dmg', value: 3, turns: 3 }],
      desc: 'Демону (или себе) — кибер-клыки: +3 к урону на 3 хода.',
      canon: 'rules/class-roadmap.md' }),
    A({ id: 'hell-gate', name: 'Врата ада', level: 5, path: 'cyber-demon', cost: 6, action: 'action',
      range: 0, target: 'self', roll: 'auto',
      effects: [{ op: 'summon', unit: 'skrilet', turns: 3 }],
      desc: 'Открывает врата: скрилет сражается на вашей стороне 3 хода.',
      canon: 'rules/class-roadmap.md' }),

    // ---------- Путь Проклятий ----------
    A({ id: 'weakness-curse', name: 'Проклятие слабости', level: 1, path: 'curses', cost: 2, action: 'action',
      range: 8, target: 'enemy', roll: 'save', save: 'wil',
      effects: [
        { op: 'status', id: 'curse', turns: 3 },
        { op: 'buff', stat: 'dmg', value: -2, turns: 3 },
      ],
      desc: 'Проклятие на 3 хода: −2 к атаке, спасброскам и урону. Спасбросок ТВД — без эффекта.',
      canon: 'rules/spells.md' }),
    A({ id: 'mute-curse', name: 'Проклятие немоты', level: 3, path: 'curses', cost: 4, action: 'action',
      range: 8, target: 'enemy', roll: 'save', save: 'wil',
      effects: [
        { op: 'damage', dice: '1d8', dmgType: 'psychic', bonus: 'castMod' },
        { op: 'status', id: 'silence', turns: 2 },
      ],
      desc: '1d8 + ИНТ пси (по МРЛ) и немота на 2 хода. Спасбросок ТВД — без эффекта.',
      canon: 'rules/class-roadmap.md' }),
    A({ id: 'judge-curse', name: 'Проклятие Судьи', level: 5, path: 'curses', cost: 5, action: 'action',
      range: 8, target: 'enemy', roll: 'save', save: 'wil',
      effects: [
        { op: 'damage', dice: '1d8', dmgType: 'psychic' },
        { op: 'mark', id: 'judge-mark', turns: 3, value: 4 },
      ],
      desc: 'Судья метит жертву: 1d8 пси, 3 хода все атаки по цели +4 к урону. Спасбросок ТВД — без эффекта.',
      canon: 'rules/class-roadmap.md' }),
  ],
  canon: ['rules/classes.md', 'rules/class-paths.md', 'rules/class-roadmap.md', 'rules/spellcasting.md',
    'rules/spells.md', 'rules/effects.md', 'extra/specialties.md'],
};
