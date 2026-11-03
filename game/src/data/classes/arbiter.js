// Арбитр (аналог Паладина). Канон: rules/classes.md, rules/class-paths.md, rules/class-roadmap.md, rules/spellcasting.md, rules/spells.md.
// Расширения схемы: path.role, passives[].level / passives[].path.
export default {
  id: 'arbiter', name: 'Арбитр', analog: 'Паладин', icon: 'class_face',
  role: 'tank',
  castStat: 'wil',
  hpPerLevel: 2,
  saves: ['wil', 'con'],
  armor: { name: 'Доспех Арбитра', type: 'heavy', kb: 5 },
  weapon: { name: 'Силовой меч', dice: '1d8', dmgType: 'slash', stat: 'str', range: 1, hit: 0 },
  // 9 + 2 + 5 + 2 + 7 + 0 + 2 = 27
  recommended: { str: 15, dex: 10, con: 13, int: 10, wil: 14, cha: 8, per: 10 },
  overcast: null,
  allowedRaces: null,
  paths: [
    {
      id: 'defender', name: 'Путь Защитника', role: 'tank',
      desc: 'Защита союзников: энергетические щиты, контратака, кибер-аура.',
    },
    {
      id: 'avenger', name: 'Путь Мстителя', role: 'melee',
      desc: 'Уничтожение врагов: клятва мести, сбивающие с ног удары, режим берсерка.',
    },
    {
      id: 'judge', name: 'Путь Судьи', role: 'control',
      desc: 'Поддержание порядка: запрет умений, приговор, дезинтеграция.',
    },
  ],
  passives: [
    { id: 'avenger-mastery', name: 'Мастерство оружия', level: 5, path: 'avenger',
      desc: 'Ступень владения «мастерство» (канон): +1 к атаке и +2 к урону в ближнем бою.', op: { hit: 1, dmg: { melee: 2 } } },
    { id: 'guard-stance', name: 'Защита', level: 1, path: 'defender',
      desc: '+1 КБ.', op: { kb: 1 } },
    { id: 'cyber-aura', name: 'Кибер-аура', level: 5, path: 'defender',
      desc: 'Кибер-аура: +1 КБ и сопротивление киберурону. (Аура на союзников — когда движок научится аурам.)', op: { kb: 1, resist: { cyber: 'resist' } } },
    { id: 'judge-mastery', name: 'Печать приговора', level: 5, path: 'judge',
      desc: 'Приговоры Судьи бьют сильнее: +2 к урону способностей.', op: { dmg: { spell: 2 } } },
    { id: 'judges-fury', name: 'Ярость Судьи', level: 1, path: 'avenger',
      desc: 'Критическое попадание на 19–20.', op: { critRange: 19 } },
  ],
  abilities: [
    // ---------- Общие ----------
    {
      id: 'smite', name: 'Карающий удар', level: 1, path: null,
      cost: 4, action: 'action', trigger: null, range: 1, target: 'enemy', area: null,
      roll: 'attack', save: null, onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'weapon', extraDice: '1d8', extraType: 'energy' }],
      desc: 'Удар заряженным клинком: оружие +1d8 энергоурона.',
      canon: 'rules/spellcasting.md',
    },
    {
      id: 'sacred-shield', name: 'Священный щит', level: 1, path: null,
      cost: 3, action: 'bonus', trigger: null, range: 6, target: 'ally', area: null,
      roll: 'auto', save: null, onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'buff', stat: 'kb', value: 2, turns: 3 }],
      desc: 'Себе или союзнику: +2 КБ на 3 хода.',
      canon: 'rules/spellcasting.md',
    },
    {
      id: 'lay-on-hands', name: 'Лечение ран', level: 1, path: null,
      cost: 3, action: 'action', trigger: null, range: 1, target: 'ally', area: null,
      roll: 'auto', save: null, onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'heal', dice: '1d8', bonus: 'castMod', resource: 'hp' }],
      desc: 'Себе или соседнему союзнику: 1d8 + ТВД ЗДР.',
      canon: 'rules/spellcasting.md',
    },
    {
      id: 'blinding-light', name: 'Ослепляющий свет', level: 3, path: null,
      cost: 4, action: 'action', trigger: null, range: 6, target: 'enemy', area: null,
      roll: 'save', save: 'wil', onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'status', id: 'blind', turns: 1 }],
      desc: 'Вспышка прожектора: спасбросок ТВД, иначе ослепление на 1 ход.',
      canon: 'rules/spellcasting.md',
    },
    {
      id: 'healing-light', name: 'Исцеляющий свет', level: 5, path: null,
      cost: 7, action: 'action', trigger: null, range: 0, target: 'self', area: { shape: 'radius', size: 7 },
      roll: 'auto', save: null, onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'heal', dice: '2d6', resource: 'hp' }],
      desc: 'Тебе и всем союзникам в радиусе 7 клеток: 2d6 ЗДР.',
      canon: 'rules/spellcasting.md',
    },

    // ---------- Путь Защитника ----------
    {
      id: 'energy-barrier', name: 'Энергетический щит', level: 1, path: 'defender',
      cost: 3, action: 'bonus', trigger: null, range: 6, target: 'ally', area: null,
      roll: 'auto', save: null, onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'shield', dice: '1d6', turns: 3 }],
      desc: 'Себе или союзнику: щит поглощает 1d6 урона, 3 хода.',
      canon: 'rules/class-paths.md',
    },
    {
      id: 'improved-barrier', name: 'Улучшенный щит', level: 3, path: 'defender',
      cost: 5, action: 'bonus', trigger: null, range: 6, target: 'ally', area: null,
      roll: 'auto', save: null, onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'shield', dice: '2d6', turns: 3 }],
      desc: 'Себе или союзнику: щит поглощает 2d6 урона, 3 хода.',
      canon: 'rules/spells.md',
    },
    {
      id: 'retribution', name: 'Щит возмездия', level: 5, path: 'defender',
      cost: 2, action: 'reaction', trigger: 'selfAttacked', range: 1, target: 'enemy', area: null,
      roll: 'attack', save: null, onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'weapon', extraDice: '1d4', extraType: 'energy' }],
      desc: 'Реакция, когда тебя атакуют в ближнем бою: контратака оружием +1d4 энергоурона.',
      canon: 'rules/class-roadmap.md',
    },

    // ---------- Путь Мстителя ----------
    {
      id: 'vow-of-vengeance', name: 'Клятва мести', level: 1, path: 'avenger',
      cost: 2, action: 'bonus', trigger: null, range: 12, target: 'enemy', area: null,
      roll: 'auto', save: null, onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'mark', id: 'marked', turns: 5, value: 3 }],
      desc: 'Клянётся покарать цель: все атаки по ней наносят +2 урона 5 ходов.',
      canon: 'rules/spellcasting.md',
    },
    {
      id: 'tank-strike', name: 'Танковый удар', level: 3, path: 'avenger',
      cost: 3, action: 'action', trigger: null, range: 1, target: 'enemy', area: null,
      roll: 'attack', save: null, onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'weapon' }, { op: 'status', id: 'prone', turns: 1 }],
      desc: 'Удар сбивает врага с ног: атака оружием, при попадании цель лежит 1 ход.',
      canon: 'rules/class-roadmap.md',
    },
    {
      id: 'berserk-mode', name: 'Режим Берсерка', level: 5, path: 'avenger',
      cost: 3, action: 'bonus', trigger: null, range: 0, target: 'self', area: null,
      roll: 'auto', save: null, onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'status', id: 'berserk', turns: 3 }],
      desc: 'Берсерк на 3 хода: +2 к урону в ближнем бою, −2 КБ.',
      canon: 'rules/class-roadmap.md',
    },

    // ---------- Путь Судьи ----------
    {
      id: 'targeted-ban', name: 'Прицельный запрет', level: 1, path: 'judge',
      cost: 2, action: 'bonus', trigger: null, range: 12, target: 'enemy', area: null,
      roll: 'save', save: 'wil', onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'status', id: 'silence', turns: 1 }],
      desc: 'Блокирует умения врага: спасбросок ТВД, иначе немота на 1 ход.',
      canon: 'rules/class-roadmap.md',
    },
    {
      id: 'verdict', name: 'Приговор', level: 3, path: 'judge',
      cost: 3, action: 'bonus', trigger: null, range: 12, target: 'enemy', area: null,
      roll: 'auto', save: null, onSave: 'none', usesPerBattle: 3,
      effects: [
        { op: 'buff', stat: 'kb', value: -2, turns: 3 },
        { op: 'status', id: 'curse', turns: 3 },
      ],
      desc: 'Приговор цели на 3 хода: −2 КБ и проклятие (−2 к атаке и спасброскам). До 2 раз за бой.',
      canon: 'rules/class-roadmap.md',
    },
    {
      id: 'disintegrate', name: 'Дезинтеграция', level: 5, path: 'judge',
      cost: 4, action: 'action', trigger: null, range: 12, target: 'enemy', area: null,
      roll: 'attack', save: null, onSave: 'none', usesPerBattle: null,
      effects: [
        { op: 'damage', dice: '2d8', dmgType: 'energy', bonus: 'castMod' },
        { op: 'status', id: 'disarm', turns: 1 },
      ],
      desc: 'Луч распада: 2d8 + ТВД энергоурона, оружие цели выведено из строя на 1 ход.',
      canon: 'rules/class-roadmap.md',
    },
  ],
  canon: ['rules/classes.md', 'rules/class-paths.md', 'rules/class-roadmap.md', 'rules/spellcasting.md', 'rules/spells.md'],
  lore: 'Воины, которые используют технологии для защиты слабых и борьбы с несправедливостью: боевые навыки плюс кибернетические улучшения.',
};
