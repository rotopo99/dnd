// Забивной (аналог Воина). Канон: rules/classes.md, rules/class-paths.md, rules/class-roadmap.md, rules/spellcasting.md.
// Расширения схемы (см. отчёт геймдизайнера): path.role, path.weapon / path.armor / path.recommended (переопределение для пути),
// passives[].level / passives[].path, range: 'weapon' (дальность = дальность текущего оружия).
export default {
  id: 'zabivnoy', name: 'Забивной', analog: 'Воин', icon: 'class_fighter',
  role: 'tank',
  castStat: null,
  hpPerLevel: 2,
  saves: ['str', 'con'],
  armor: { name: 'Тяжёлая броня из листовой стали', type: 'heavy', kb: 6 },
  weapon: { name: 'Арматура', dice: '1d8', dmgType: 'blunt', stat: 'str', range: 1, hit: 0 },
  // 9 + 2 + 7 + 2 + 4 + 0 + 3 = 27
  recommended: { str: 15, dex: 10, con: 14, int: 10, wil: 12, cha: 8, per: 11 },
  overcast: null,
  allowedRaces: null,
  paths: [
    {
      id: 'mech-killer', name: 'Путь Механизированного Убийцы', role: 'melee',
      desc: 'Ближний бой с механическими имплантами: скрытые клинки, усиленные удары, лишняя атака.',
    },
    {
      id: 'wasteland-sniper', name: 'Путь Снайпера Пустошей', role: 'ranged',
      desc: 'Дальний бой из высокотехнологичного оружия, дроны-разведчики подсвечивают цели.',
      weapon: { name: 'Снайперская винтовка', dice: '1d10', dmgType: 'pierce', stat: 'dex', range: 20, hit: 0 },
      armor: { name: 'Разгрузка с пластинами', type: 'medium', kb: 4 },
      // 2 + 9 + 7 + 2 + 4 + 0 + 3 = 27
      recommended: { str: 10, dex: 15, con: 14, int: 10, wil: 12, cha: 8, per: 11 },
    },
    {
      id: 'iron-titan', name: 'Путь Железного Титана', role: 'tank',
      desc: 'Защита и выживаемость: тяжёлая броня и энергощиты, чтобы держать на себе удар.',
    },
  ],
  passives: [
    { id: 'duelist', name: 'Дуэлянт', level: 1, path: 'mech-killer',
      desc: '+2 к урону в ближнем бою.', op: { dmg: { melee: 2 } } },
    { id: 'sniper-scope', name: 'Снайперский прицел', level: 1, path: 'wasteland-sniper',
      desc: '+2 к броску атаки.', op: { hit: 2 } },
    { id: 'heavy-plating', name: 'Тяжёлая броня', level: 1, path: 'iron-titan',
      desc: '+2 КБ.', op: { kb: 2 } },
  ],
  abilities: [
    // ---------- Общие ----------
    {
      id: 'steel-fist', name: 'Стальной кулак', level: 1, path: null,
      cost: 3, action: 'action', trigger: null, range: 'weapon', target: 'enemy', area: null,
      roll: 'attack', save: null, onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'weapon', extraDice: '1d6' }],
      desc: 'Атака оружием с усиленным имплантом ударом: +1d6 урона.',
      canon: 'rules/spellcasting.md',
    },
    {
      id: 'aggressive-rush', name: 'Агрессивный рывок', level: 1, path: null,
      cost: 3, action: 'action', trigger: null, range: 4, target: 'enemy', area: null,
      roll: 'attack', save: null, onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'move', tiles: 3, mode: 'dash' }, { op: 'weapon' }],
      desc: 'Рывок на 3 клетки к цели и атака оружием.',
      canon: 'rules/spellcasting.md',
    },
    {
      id: 'adrenaline', name: 'Адреналин', level: 1, path: null,
      cost: 3, action: 'bonus', trigger: null, range: 0, target: 'self', area: null,
      roll: 'auto', save: null, onSave: 'none', usesPerBattle: 1,
      effects: [{ op: 'extraAction', kind: 'action' }, { op: 'status', id: 'slow', turns: 1 }],
      desc: 'Дополнительное действие в этот ход. Расплата: замедление на 1 ход.',
      canon: 'rules/spellcasting.md',
    },
    {
      id: 'armor-piercing', name: 'Бронебойный приём', level: 3, path: null,
      cost: 2, action: 'action', trigger: null, range: 'weapon', target: 'enemy', area: null,
      roll: 'attack', save: null, onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'weapon', hit: 2 }],
      desc: 'Атака в стык брони: +2 к броску атаки (игнорирует 2 КБ).',
      canon: 'rules/spellcasting.md',
    },
    {
      id: 'crushing-blow', name: 'Сокрушительный удар', level: 5, path: null,
      cost: 6, action: 'action', trigger: null, range: 'weapon', target: 'enemy', area: null,
      roll: 'attack', save: null, onSave: 'none', usesPerBattle: 1,
      effects: [{ op: 'weapon', extraDice: '1d8' }, { op: 'status', id: 'stun', turns: 1 }],
      desc: 'Атака оружием +1d8 урона; при попадании цель оглушена на 1 ход.',
      canon: 'rules/spellcasting.md',
    },

    // ---------- Путь Механизированного Убийцы ----------
    {
      id: 'hidden-blades', name: 'Скрытые клинки', level: 3, path: 'mech-killer',
      cost: 4, action: 'action', trigger: null, range: 1, target: 'enemy', area: null,
      roll: 'attack', save: null, onSave: 'none', usesPerBattle: 2,
      effects: [{ op: 'weapon', extraDice: '2d6', extraType: 'slash' }],
      desc: 'Из предплечья выстреливают клинки: атака оружием +2d6 рубящего урона.',
      canon: 'rules/class-paths.md',
    },
    {
      id: 'adrenal-stim', name: 'Адреналиновый стимул', level: 5, path: 'mech-killer',
      cost: 2, action: 'bonus', trigger: null, range: 1, target: 'enemy', area: null,
      roll: 'attack', save: null, onSave: 'none', usesPerBattle: 1,
      effects: [{ op: 'weapon' }],
      desc: 'Впрыск стимулятора: ещё одна атака оружием бонусным действием.',
      canon: 'rules/class-roadmap.md',
    },

    // ---------- Путь Снайпера Пустошей ----------
    {
      id: 'spotter-drone', name: 'Дрон-разведчик', level: 3, path: 'wasteland-sniper',
      cost: 2, action: 'bonus', trigger: null, range: 20, target: 'enemy', area: null,
      roll: 'auto', save: null, onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'mark', id: 'marked', turns: 3, value: 2 }],
      desc: 'Дрон подсвечивает цель: все атаки по ней наносят +2 урона 3 хода.',
      canon: 'rules/class-roadmap.md',
    },
    {
      id: 'sniper-shot', name: 'Снайперский выстрел', level: 5, path: 'wasteland-sniper',
      cost: 4, action: 'action', trigger: null, range: 20, target: 'enemy', area: null,
      roll: 'attack', save: null, onSave: 'none', usesPerBattle: 1,
      effects: [{ op: 'weapon', extraDice: '2d10' }],
      desc: 'Выверенный выстрел: винтовка 1d10 + 2d10 урона (всего 3d10).',
      canon: 'rules/class-paths.md',
    },

    // ---------- Путь Железного Титана ----------
    {
      id: 'titan-energy-shield', name: 'Энергощит', level: 3, path: 'iron-titan',
      cost: 3, action: 'bonus', trigger: null, range: 0, target: 'self', area: null,
      roll: 'auto', save: null, onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'shield', dice: '2d6', turns: 3 }],
      desc: 'Энергетический щит поглощает 2d6 урона, держится 3 хода.',
      canon: 'rules/class-paths.md',
    },
    {
      id: 'ram', name: 'Таран', level: 5, path: 'iron-titan',
      cost: 4, action: 'action', trigger: null, range: 1, target: 'enemy', area: null,
      roll: 'attack', save: null, onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'weapon', extraDice: '1d8' }, { op: 'push', tiles: 2 }],
      desc: 'Удар всем весом брони: атака оружием +1d8 урона и отталкивание на 2 клетки.',
      canon: 'rules/class-roadmap.md',
    },
  ],
  canon: ['rules/classes.md', 'rules/class-paths.md', 'rules/class-roadmap.md', 'rules/spellcasting.md', 'characters/party.md'],
  lore: 'Бойцы ближнего и дальнего боя: традиционное оружие плюс высокотехнологичные гаджеты. Виктор из партии — Забивной, Путь Железного Титана.',
};
