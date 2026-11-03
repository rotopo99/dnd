// Small rules-engine fixtures following docs/specs/core-rules.md (independent from game/src/data).

export const RACES = {
  skeleton: {
    id: 'skeleton', name: 'Скелет-робот', tags: ['mechanical'], playable: true,
    statBonus: { dex: 1 }, hpBonus: 0, mrlBonus: 0, enrBonus: 0, speed: 6,
    resist: { electric: 'resist' }, immuneStatus: ['poison'],
    passives: [{ id: 'mech-regen', name: 'Регенерация', op: { regen: { dice: '1d4', resource: 'hp', every: 'battleEnd' } } }],
    abilities: [],
  },
  human: {
    id: 'human', name: 'Человек', tags: ['organic'], playable: true,
    statBonus: { any: 1 }, hpBonus: 0, mrlBonus: 0, enrBonus: 0, speed: 6,
    resist: { toxin: 'vuln' }, immuneStatus: [], passives: [], abilities: [],
  },
};

export const CLASSES = {
  itishnik: {
    id: 'itishnik', name: 'Айтишник', role: 'support', castStat: 'int', hpPerLevel: 0,
    saves: ['int', 'dex'],
    armor: { name: 'Куртка', type: 'light', kb: 1 },
    weapon: { name: 'Шокер', dice: '1d6', dmgType: 'electric', stat: 'dex', range: 1, hit: 0 },
    recommended: { str: 10, dex: 13, con: 14, int: 15, wil: 10, cha: 8, per: 12 },
    overcast: 'veil', allowedRaces: null,
    paths: [{ id: 'mechanic', name: 'Путь Механика' }, { id: 'hacker', name: 'Путь Хакера', weapon: { name: 'Пистолет', dice: '1d6', dmgType: 'pierce', stat: 'dex', range: 10, hit: 0 } }],
    passives: [{ id: 'tinker', name: 'Технарь', level: 1, path: 'mechanic', op: { kb: 1 } }],
    abilities: [
      { id: 'repair', name: 'Базовый ремонт', level: 1, path: null, cost: 2, action: 'action', range: 1, target: 'ally',
        area: null, roll: 'auto', effects: [{ op: 'heal', dice: '1d8', resource: 'hp', only: 'mechanical' }] },
      { id: 'zap', name: 'Разряд', level: 1, path: null, cost: 2, action: 'action', range: 8, target: 'enemy',
        area: null, roll: 'attack', effects: [{ op: 'damage', dice: '1d10', dmgType: 'electric', bonus: 'castMod' }] },
      { id: 'drone', name: 'Дрон', level: 1, path: 'mechanic', cost: 3, action: 'bonus', range: 0, target: 'self',
        area: null, roll: 'auto', usesPerBattle: 1, effects: [{ op: 'summon', unit: 'drone', turns: 3 }] },
      { id: 'emp', name: 'ЭМИ', level: 3, path: null, cost: 4, action: 'action', range: 6, target: 'tile',
        area: { shape: 'radius', size: 1 }, roll: 'save', save: 'dex', onSave: 'half',
        effects: [{ op: 'damage', dice: '2d6', dmgType: 'proxy' }, { op: 'status', id: 'stun', turns: 1 }] },
      { id: 'todo-thing', name: 'Не готово', level: 1, cost: 0, action: 'action', range: 1, target: 'enemy', todo: 'op x', effects: [] },
    ],
  },
  zabivnoy: {
    id: 'zabivnoy', name: 'Забивной', role: 'tank', castStat: 'str', hpPerLevel: 2,
    saves: ['str', 'con'],
    armor: { name: 'Тяжёлая броня', type: 'heavy', kb: 6 },
    weapon: { name: 'Арматура', dice: '1d8', dmgType: 'blunt', stat: 'str', range: 1, hit: 0 },
    recommended: { str: 15, dex: 10, con: 14, int: 10, wil: 12, cha: 8, per: 11 },
    overcast: null, allowedRaces: ['human'],
    paths: [{ id: 'titan', name: 'Титан' }],
    passives: [],
    abilities: [
      { id: 'steel-fist', name: 'Стальной кулак', level: 1, cost: 3, action: 'action', range: 'weapon', target: 'enemy',
        roll: 'attack', effects: [{ op: 'weapon', extraDice: '1d6' }, { op: 'status', id: 'bleed', turns: 2 }] },
      { id: 'rush', name: 'Рывок', level: 1, cost: 3, action: 'action', range: 4, target: 'enemy',
        roll: 'attack', effects: [{ op: 'move', tiles: 3, mode: 'dash' }, { op: 'weapon' }] },
      { id: 'shield-up', name: 'Щит', level: 1, cost: 2, action: 'bonus', range: 0, target: 'self',
        roll: 'auto', effects: [{ op: 'shield', dice: '2d6', turns: 2 }] },
      { id: 'blood', name: 'Кровь', level: 1, cost: 0, action: 'bonus', range: 0, target: 'self', usesPerBattle: 1,
        roll: 'auto', effects: [{ op: 'damage', dice: '1d4', dmgType: 'cyber' }, { op: 'buff', stat: 'dmg', value: 2, turns: 2 }] },
    ],
  },
};

export const STATUSES = {
  stun: { id: 'stun', name: 'Оглушение', kind: 'debuff', skipTurn: true },
  bleed: { id: 'bleed', name: 'Кровотечение', kind: 'debuff', tick: { op: 'damage', dice: '1d4', dmgType: 'slash' }, endOnHeal: true, immuneTags: ['mechanical'] },
  burn: { id: 'burn', name: 'Горение', kind: 'debuff', tick: { op: 'damage', dice: '1d6', dmgType: 'fire' }, endAction: true },
  cringed: { id: 'cringed', name: 'Кринж', kind: 'debuff', tick: { op: 'damage', dice: '1d4', dmgType: 'cringe' } },
  corrosion: { id: 'corrosion', name: 'Коррозия', kind: 'debuff', tick: { op: 'buff', stat: 'kb', value: -1, cumulative: true, cap: -4 } },
  fear: { id: 'fear', name: 'Страх', kind: 'debuff', mods: { attackDisadv: true, noApproachSource: true }, endSave: 'wil' },
  blessed: { id: 'blessed', name: 'Благословение', kind: 'buff', mods: { hit: 1, dmg: 1 } },
  stealth: { id: 'stealth', name: 'Скрытность', kind: 'buff', mods: { firstAttackAdv: true, extraWeaponDice: 1 }, breakOn: 'attack' },
  marked: { id: 'marked', name: 'Метка', kind: 'debuff', mods: { incomingDmg: 2 } },
};

const W = (dice, dmgType, stat, range, attack) => ({ name: 'w', dice, dmgType, stat, range, hit: 0, attack });

export const ENEMIES = {
  thug: {
    id: 'thug', name: 'Громила', level: 1, tags: ['organic'],
    stats: { str: 13, dex: 12, con: 12, int: 8, wil: 10, cha: 8, per: 10 },
    hp: 12, mrl: 10, enr: 4, kb: 12, speed: 6, weapon: W('1d6', 'blunt', 'str', 1, 3),
    abilities: [{ id: 'jeer', name: 'Насмешка', cost: 2, action: 'bonus', range: 4, target: 'enemy', roll: 'save', save: 'wil', onSave: 'none',
      effects: [{ op: 'damage', dice: '1d4', dmgType: 'cringe' }, { op: 'status', id: 'cringed', turns: 2 }] }],
    resist: {}, immuneStatus: [], ai: 'melee', xp: 10,
  },
  gunner: {
    id: 'gunner', name: 'Стрелок', level: 1, tags: ['organic'],
    stats: { str: 10, dex: 14, con: 10, int: 10, wil: 10, cha: 8, per: 12 },
    hp: 9, mrl: 9, enr: 0, kb: 12, speed: 6, weapon: W('1d6', 'pierce', 'dex', 10, 4),
    abilities: [], resist: {}, immuneStatus: [], ai: 'ranged', xp: 10,
  },
  drone: {
    id: 'drone', name: 'Дрон', level: 1, tags: ['mechanical'], summon: true, defaultTurns: 3,
    stats: { str: 6, dex: 14, con: 10, int: 10, wil: 10, cha: 6, per: 12 },
    hp: 5, mrl: 0, enr: 0, kb: 13, speed: 6, weapon: W('1d4', 'energy', 'dex', 8, 4),
    abilities: [], resist: { cringe: 'immune', psychic: 'immune' }, immuneStatus: [], ai: 'ranged', xp: 0,
  },
};

export const VEIL_TABLE = Array.from({ length: 10 }, (_, i) => ({
  roll: i + 1, name: `row${i + 1}`,
  parts: [{ target: 'caster', effects: [{ op: 'damage', dice: '1d2', dmgType: 'cyber' }] }],
}));

export const ENCOUNTERS = { standard1: { id: 'standard1', enemies: ['thug', 'gunner'] } };

export const TALENTS = {
  tanner: { id: 'tanner', name: 'Кожевник', slot: 'job', kind: 'combat', passives: [{ op: { kb: 1 } }], abilities: [], world: [] },
  'dirty-fighter': { id: 'dirty-fighter', name: 'Грязный боец', slot: 'job', kind: 'combat', passives: [],
    abilities: [{ id: 'talent-dirty-fighter', name: 'Песок в глаза', level: 1, cost: 0, action: 'bonus', range: 1, target: 'enemy',
      roll: 'attack', usesPerBattle: 1, effects: [{ op: 'weapon' }, { op: 'status', id: 'blind', turns: 1 }] }], world: [] },
  'iron-will': { id: 'iron-will', name: 'Железная воля', slot: 'stat', kind: 'combat', passives: [{ op: { maxHp: 4 } }], world: [] },
  'prey-game': { id: 'prey-game', name: 'Игра с жертвой', slot: 'alignment', kind: 'combat', passives: [{ op: { hit: 2, cond: 'targetWounded' } }], world: [] },
  'acid-sweat': { id: 'acid-sweat', name: 'Кислотный пот', slot: 'mutation', kind: 'combat', passives: [{ op: { thorns: { dice: '2d1', dmgType: 'toxin' } } }], world: [] },
  'eagle-eye': { id: 'eagle-eye', name: 'Глазомер', slot: 'race', kind: 'world', world: [{ check: 'perception', bonus: 2 }] },
  'lock-master': { id: 'lock-master', name: 'Замок — не преграда', slot: 'job', kind: 'world', world: [{ check: 'athletics', adv: true }] },
  'beast-nose': { id: 'beast-nose', name: 'Звериный нюх', slot: 'race', kind: 'both', passives: [{ op: { init: 2 } }], world: [{ worldFlag: 'no-ambush' }] },
  'deep-pocket': { id: 'deep-pocket', name: 'Скрытый отсек', slot: 'race', kind: 'world', world: [{ worldFlag: 'hide-item' }] },
  implant: { id: 'implant', name: 'Подкожная броня', slot: 'implant', kind: 'combat', req: { level: 3 }, passives: [{ op: { kb: 2 } }], world: [] },
};
export const COMBAT_TALENT_LIMIT = (level) => (level >= 4 ? 3 : 2);
export const TALENT_LEVELS = [2, 4];

export const GADGETS = {
  multitool: { id: 'multitool', name: 'Мультитул из хлама', cls: 'itishnik', passives: [{ op: { init: 1 } }],
    abilities: [{ id: 'gadget-patch', name: 'Заплатка', level: 1, cost: 0, action: 'bonus', range: 1, target: 'ally', roll: 'auto',
      usesPerBattle: 1, effects: [{ op: 'heal', dice: '1d4', resource: 'hp' }] }],
    world: [{ check: 'tech', bonus: 1 }, { worldFlag: 'craft-medkit' }] },
};

export const SPECIALIZATIONS = {
  zabivnoy: { spec: ['athletics', 'intimidation', 'military'], related: ['endurance', 'survival', 'perception'] },
  itishnik: { spec: ['tech', 'lockpicking', 'analysis'], related: ['hacking', 'medicine', 'military'] },
};

export const DATA = { RACES, CLASSES, STATUSES, ENEMIES, VEIL_TABLE, ENCOUNTERS, TALENTS, GADGETS, COMBAT_TALENT_LIMIT, TALENT_LEVELS, SPECIALIZATIONS };
