// Рейнджер (аналог Следопыта). Канон: rules/classes.md, rules/class-paths.md, rules/class-roadmap.md, rules/spellcasting.md,
// characters/party.md (Артём — Путь Охотника).
// castStat: null — все способности завязаны на выстрел (op 'weapon'), спасбросков от Рейнджера нет.
// Расширения схемы: path.role, passives[].level / passives[].path.
// Компактный конструктор способностей уровней 6+ (поля схемы — как у ручных записей ниже).
const ab = (id, name, level, path, o) => ({
  id, name, level, path, cost: 0, action: 'action', trigger: null, range: 0, target: 'self', area: null,
  roll: 'auto', save: null, onSave: 'none', usesPerBattle: null, effects: [], canon: 'rules/class-roadmap.md', ...o,
});
const W = (extraDice, extraType, hit) => ({ op: 'weapon', ...(extraDice && { extraDice }), ...(extraType && { extraType }), ...(hit && { hit }) });
const zone = (size) => ({ shape: 'radius', size });
const SHOT = { range: 'weapon', target: 'enemy', roll: 'attack' };
// castStat: null у класса — у способностей со спасброском СЛ задаётся полем castStat.
const AOE = { target: 'tile', roll: 'save', castStat: 'dex' };

// Улучшения (docs/specs/levels-20.md): `dice` заменяет кости главного эффекта способности.
const UPGRADES = [
  { level: 2, ability: 'aimed-fire', changes: { cost: 2 } },
  { level: 4, ability: 'rapid-reload', changes: { usesPerBattle: 4 } },
  { level: 8, ability: 'double-shot', changes: { cost: 3 } },
  { level: 12, ability: 'camouflage', changes: { cost: 1 } },
  { level: 16, ability: 'aimed-fire', changes: { dice: '2d6' } },
];

export default {
  id: 'ranger', name: 'Рейнджер', analog: 'Следопыт', icon: 'class_rogue',
  role: 'ranged',
  castStat: null,
  hpPerLevel: 3,
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
    // ---------- Уровни 7–20 ----------
    { id: 'upgraded-sensors', name: 'Улучшенные сенсоры', level: 7, path: 'hunter',
      desc: '+2 ЛВК, +1 к атаке, +2 к урону дальнего боя.', op: { statBonus: { dex: 2 }, hit: 1, dmg: { ranged: 2 } } },
    { id: 'one-shot-mastery', name: 'Мастер одного выстрела', level: 15, path: 'hunter',
      desc: 'Крит на 18–20, +1 к атаке, +3 к урону дальнего боя.', op: { critRange: 18, hit: 1, dmg: { ranged: 3 } } },
    { id: 'invincible-hide', name: 'Неуязвимый', level: 7, path: 'survivor',
      desc: '+10 ЗДР, +1 КБ, +2 к урону дальнего боя.', op: { maxHp: 10, kb: 1, dmg: { ranged: 2 } } },
    { id: 'eternal-wanderer', name: 'Бессмертный странник', level: 15, path: 'survivor',
      desc: '+15 ЗДР, +1 КБ, регенерация 1d4 ЗДР в начале хода.', op: { maxHp: 15, kb: 1, regen: { dice: '1d4', resource: 'hp', every: 'turn' } } },
    { id: 'terror-ghost', name: 'Террорист-призрак', level: 7, path: 'saboteur',
      desc: '+1 к атаке, +2 к урону дальнего боя, +2 к инициативе.', op: { hit: 1, dmg: { ranged: 2 }, init: 2 } },
    { id: 'legend-of-terror', name: 'Легенда ужаса', level: 15, path: 'saboteur',
      desc: 'Крит на 18–20, +1 к атаке, +2 к урону дальнего боя.', op: { critRange: 18, hit: 1, dmg: { ranged: 2 } } },
  ],
  abilities: [
    // ---------- Общие ----------
    {
      id: 'aimed-fire', name: 'Прицельный огонь', level: 1, path: null,
      cost: 3, action: 'action', trigger: null, range: 16, target: 'enemy', area: null,
      roll: 'attack', save: null, onSave: 'none', usesPerBattle: null,
      effects: [{ op: 'weapon', hit: 2, extraDice: '1d6' }],
      desc: 'Выстрел с упреждением: +2 к атаке (сводит на нет укрытие) и +1d6 урона.',
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

    // ---------- Общие, уровни 6–18 ----------
    ab('hunters-mark', 'Метка охотника', 6, null, { cost: 3, action: 'bonus', range: 'weapon', target: 'enemy',
      effects: [{ op: 'mark', id: 'marked', turns: 4, value: 3 }],
      desc: 'Цель помечена: все атаки по ней наносят +3 урона 4 хода.' }),
    ab('volley', 'Залп', 10, null, { cost: 8, ...SHOT,
      effects: [W('1d6'), W('1d6')],
      desc: 'Два отдельных выстрела, каждый с +1d6 урона.' }),
    ab('survival-instinct', 'Инстинкт выживания', 14, null, { cost: 5, action: 'bonus', usesPerBattle: 1,
      effects: [{ op: 'heal', dice: '4d8', resource: 'hp' }, { op: 'cleanse', count: 2, kind: 'debuff' }, { op: 'buff', stat: 'speed', value: 2, turns: 3 }],
      desc: 'Лечит 4d8 ЗДР, снимает 2 дебаффа и даёт +2 к скорости на 3 хода. Раз за бой.' }),
    ab('deadeye', 'Орлиный глаз', 18, null, { cost: 6, action: 'bonus', usesPerBattle: 1,
      effects: [{ op: 'buff', stat: 'hit', value: 3, turns: 3 }, { op: 'buff', stat: 'dmg', value: 4, turns: 3 }],
      desc: '+3 к атаке и +4 к урону на 3 хода. Раз за бой.' }),

    // ---------- Путь Охотника, 9–20 ----------
    ab('piercing-shot', 'Кинжальный выстрел', 9, 'hunter', { cost: 6, ...SHOT,
      effects: [W('3d8', null, 3)],
      desc: 'Выстрел в стык брони: +3 к атаке и +3d8 урона.' }),
    ab('triple-shot', 'Тройная атака', 11, 'hunter', { cost: 9, ...SHOT,
      effects: [W(), W(), W()],
      desc: 'Три отдельных выстрела подряд.' }),
    ab('gravity-arrow', 'Гравитационная стрела', 13, 'hunter', { cost: 8, ...SHOT,
      effects: [W('3d8'), { op: 'status', id: 'root', turns: 2 }],
      desc: 'Выстрел +3d8 урона; при попадании цель прикована к месту на 2 хода.' }),
    ab('quantum-barrage', 'Квантовый расстрел', 15, 'hunter', { cost: 12, ...SHOT, usesPerBattle: 2,
      effects: [W('1d8', null, 4), W('1d8', null, 4), W('1d8', null, 4)],
      desc: 'Три выстрела с +4 к атаке, каждый +1d8 урона. Дважды за бой.' }),
    ab('ballistics-god', 'Бог баллистики', 17, 'hunter', { cost: 8, action: 'bonus', usesPerBattle: 1,
      effects: [{ op: 'buff', stat: 'hit', value: 3, turns: 4 }, { op: 'buff', stat: 'dmg', value: 5, turns: 4 }],
      desc: '+3 к атаке и +5 к урону на 4 хода. Раз за бой.' }),
    ab('one-shot-kill', 'Смерть с одного выстрела', 20, 'hunter', { cost: 12, ...SHOT, usesPerBattle: 1,
      effects: [W('8d10', null, 4)],
      desc: 'Капстоун: +4 к атаке и +8d10 урона одним выстрелом. Раз за бой.' }),

    // ---------- Путь Выживальщика, 9–20 ----------
    ab('rooted', 'Корни', 9, 'survivor', { cost: 4, action: 'bonus',
      effects: [{ op: 'buff', stat: 'kb', value: 4, turns: 3 }, { op: 'status', id: 'regen', turns: 3 }],
      desc: 'Врастаешь в землю: +4 КБ и регенерация на 3 хода.' }),
    ab('field-hospital', 'Полевой госпиталь', 11, 'survivor', { cost: 9, area: zone(4), usesPerBattle: 2,
      effects: [{ op: 'heal', dice: '4d8', resource: 'hp' }, { op: 'status', id: 'regen', turns: 3 }],
      desc: 'Ты и союзники в радиусе 4: лечение 4d8 ЗДР и регенерация на 3 хода. Дважды за бой.' }),
    ab('golem-form', 'Каменный голем', 13, 'survivor', { cost: 7, action: 'bonus', usesPerBattle: 1,
      effects: [{ op: 'shield', dice: '8d6' }, { op: 'buff', stat: 'kb', value: 3, turns: 4 }, { op: 'status', id: 'fortified', turns: 3 }],
      desc: 'Шкура каменеет: 8d6 врем. ЗДР, +3 КБ на 4 хода и сопротивление физическому урону на 3. Раз за бой.' }),
    ab('earth-lord', 'Хозяин земли', 17, 'survivor', { ...AOE, cost: 11, range: 12, area: zone(4), save: 'dex', onSave: 'half', usesPerBattle: 2,
      effects: [{ op: 'damage', dice: '4d8', dmgType: 'blunt' }, { op: 'status', id: 'root', turns: 2 }],
      desc: 'Земля встаёт на дыбы: 4d8 дробящего урона в радиусе 4; провалившие спасбросок ЛВК обездвижены на 2 хода.' }),
    ab('nature-avatar', 'Аватар природы', 20, 'survivor', { cost: 12, action: 'bonus', usesPerBattle: 1,
      effects: [{ op: 'heal', dice: '8d8', resource: 'hp' }, { op: 'shield', dice: '6d6' }, { op: 'buff', stat: 'dmg', value: 4, turns: 4 }, { op: 'buff', stat: 'kb', value: 3, turns: 4 }, { op: 'status', id: 'regen', turns: 4 }],
      desc: 'Капстоун: лечение 8d8 ЗДР, 6d6 врем. ЗДР, +4 к урону и +3 КБ на 4 хода, регенерация. Раз за бой.' }),

    // ---------- Путь Саботажника, 7–20 ----------
    ab('planted-bomb', 'Бомба в рюкзаке', 7, 'saboteur', { cost: 6, ...SHOT,
      effects: [W(), { op: 'damage', dice: '3d6', dmgType: 'psychic' }],
      desc: 'Выстрел и подброшенная бомба: оружие и ещё 3d6 пси-урона по МРЛ цели при попадании.' }),
    ab('cyber-sabotage', 'Кибер-диверсия', 9, 'saboteur', { cost: 6, range: 12, target: 'enemy', roll: 'save', save: 'int', castStat: 'dex', onSave: 'half',
      effects: [{ op: 'damage', dice: '4d8', dmgType: 'electric' }, { op: 'status', id: 'disarm', turns: 2 }],
      desc: 'Перегрузка механизма касанием: 4d8 электроурона и разоружение на 2 хода; спасбросок ИНТ — половина, без разоружения.' }),
    ab('scorched-earth', 'Выжженная земля', 11, 'saboteur', { ...AOE, cost: 9, range: 12, area: zone(3), save: 'dex', onSave: 'half', usesPerBattle: 2,
      effects: [{ op: 'damage', dice: '4d8', dmgType: 'fire' }, { op: 'status', id: 'slow', turns: 2 }],
      desc: '4d8 огненного урона в радиусе 3; провалившие спасбросок ЛВК замедлены на 2 хода.' }),
    ab('absolute-chaos', 'Абсолютный хаос', 13, 'saboteur', { ...AOE, cost: 11, range: 14, area: zone(4), save: 'wil', castStat: 'per', usesPerBattle: 1,
      effects: [{ op: 'status', id: 'hallucination', turns: 3 }, { op: 'status', id: 'fear', turns: 2 }],
      desc: 'Ловушки и паника: враги в радиусе 4 после провала спасброска ТВД галлюцинируют 3 хода и в страхе 2. Раз за бой.' }),
    ab('mine-king', 'Король мин', 15, 'saboteur', { ...AOE, cost: 12, range: 14, area: zone(4), save: 'dex', onSave: 'half', usesPerBattle: 2,
      effects: [{ op: 'damage', dice: '6d6', dmgType: 'fire' }, { op: 'status', id: 'root', turns: 1 }],
      desc: '6d6 огненного урона в радиусе 4; провалившие спасбросок ЛВК обездвижены на 1 ход.' }),
    ab('shadow-of-revolution', 'Тень революции', 17, 'saboteur', { ...AOE, cost: 8, action: 'bonus', range: 14, area: zone(5), save: 'wil', castStat: 'per', usesPerBattle: 1,
      effects: [{ op: 'buff', stat: 'hit', value: -3, turns: 3 }],
      desc: 'Враги в радиусе 5 после провала спасброска ТВД получают −3 к атаке на 3 хода. Раз за бой.' }),
    ab('sabotage-apotheosis', 'Апофеоз диверсии', 20, 'saboteur', { ...AOE, cost: 18, range: 16, area: zone(6), save: 'dex', onSave: 'half', usesPerBattle: 1,
      effects: [{ op: 'damage', dice: '10d6', dmgType: 'fire' }, { op: 'status', id: 'stun', turns: 1 }, { op: 'status', id: 'burn', turns: 3 }],
      desc: 'Капстоун: 10d6 огненного урона в радиусе 6; провалившие спасбросок ЛВК оглушены на 1 ход и горят 3. Раз за бой.' }),
  ],
  upgrades: UPGRADES,
  canon: ['rules/classes.md', 'rules/class-paths.md', 'rules/class-roadmap.md', 'rules/spellcasting.md', 'characters/party.md'],
  lore: 'Специалисты по выживанию в диких и техногенных условиях: выслеживают врагов и ведут через опасные зоны. Артём из партии — Рейнджер, Путь Охотника.',
};
