// Качество предметов и моды v3. Спека — docs/specs/items.md («Качество», «Моды»).
// Канон: «закалка оружия +1» (rules/core-rules.md, пример атаки), таланты «Оружейный тюнинг», «Временный апгрейд» (rules/talents.md).

// Экземпляр предмета в инвентаре: { item: 'id', q: 'junk' | 'working' | 'masterwork' | 'relic', mods: ['mod-id', ...] }.
// Модификаторы качества складываются с полями оружия/брони.
export const QUALITY = {
  junk: { id: 'junk', name: 'Хлам', hit: -1, dmg: 0, kb: -1, slots: -1, price: 0.4, jamOn1: true,
    desc: 'Натуральная 1 на атаке — оружие клинит: «разоружение» на 1 ход. Броня: −1 КБ.' },
  working: { id: 'working', name: 'Рабочее', hit: 0, dmg: 0, kb: 0, slots: 0, price: 1, jamOn1: false, desc: 'Как задумано.' },
  masterwork: { id: 'masterwork', name: 'Мастеровое', hit: 1, dmg: 1, kb: 1, slots: 1, price: 2.5, jamOn1: false,
    desc: '«Закалка» канона: +1 к атаке и +1 к урону; броня +1 КБ; +1 слот мода.' },
  relic: { id: 'relic', name: 'Реликт', hit: 0, dmg: 0, kb: 0, slots: 0, price: 0, jamOn1: false,
    desc: 'Уникальный предмет мира. Числа — в самом предмете. Не продаётся торговцам (только квестовым NPC).' },
};

// Слоты модов. У оружия: optic, muzzle, mag (огнестрел), edge, grip (холодное), core (энерго/прокси/кринж с ЭНР).
// У брони: plate, lining, sole.
export const MOD_SLOTS = {
  optic: 'Прицел', muzzle: 'Ствол', mag: 'Магазин', edge: 'Кромка', grip: 'Рукоять', core: 'Ячейка',
  plate: 'Пластины', lining: 'Подкладка', sole: 'Подошва',
};

// Поля мода: slot, fits (ограничения: group / wtype / atype / rofMin / quality), add — что прибавляет
//   add: { hit, dmg, range, rof, recoil, noise, kb, enr, resist, extra: { dice, dmgType }, vs: { tag: dmg },
//          onCrit, onHit, immuneStatus, removeJam, magnetic }
// Схема движка (game/src/rules/equipment.js): { slot: 'mod', target: 'weapon'|'armor', hit?, dmg?, ap?, rof?, recoil?,
// range?, noise?, onHit?, kb?, resist?, stealthDis? } — поля плоские. Построитель m() раскладывает `add` наверх;
// `modSlot` — наш слот (optic, muzzle…), `extra`, `vs`, `enr`, `removeJam`, `magnetic`, `immuneStatus`, `onCrit` — needs.
const ARMOR_MOD_SLOTS = ['plate', 'lining', 'sole'];
const m = (o) => {
  const it = { cat: 'mod', fits: {}, add: {}, tier: 1, price: 0, factions: [], desc: '', ...o };
  const { onCrit, ...rest } = it.add;
  Object.assign(it, rest);
  if (onCrit) it.onHit = onCrit.map((op) => ({ ...op, chance: 0.15, fromCrit: true }));
  it.modSlot = it.slot;
  it.slot = 'mod';
  it.target = ARMOR_MOD_SLOTS.includes(it.modSlot) ? 'armor' : 'weapon';
  return it;
};

const LIST = [
  // --- Прицелы
  m({ id: 'loupe-sight', name: 'Коллиматор из лупы', slot: 'optic', fits: { group: ['ranged', 'special'] }, add: { hit: 1 },
    tier: 1, price: 80, factions: ['scavengers', 'tekhonki'], desc: '+1 к атаке дальним оружием.' }),
  m({ id: 'pso-scope', name: 'Оптика ПСО', slot: 'optic', fits: { wtype: ['rifle', 'assault', 'crossbow', 'laser', 'plasma'] }, add: { hit: 1, range: 4 },
    tier: 3, price: 240, factions: ['warprom', 'renegades'], desc: '+1 к атаке, +4 клетки дальности.' }),
  // --- Ствол
  m({ id: 'bottle-silencer', name: 'Глушитель из бутылки', slot: 'muzzle', fits: { group: ['ranged'] }, add: { noise: -2, dmg: -1 },
    tier: 1, price: 25, factions: ['scavengers', 'renegades'], desc: 'Шум −2, урон −1. Бутылка из-под кваса.' }),
  m({ id: 'factory-silencer', name: 'Заводской глушитель', slot: 'muzzle', fits: { wtype: ['pistol', 'smg', 'rifle', 'assault'] }, add: { noise: -2 },
    tier: 3, price: 220, factions: ['warprom', 'pirates'], desc: 'Шум −2.' }),
  m({ id: 'compensator', name: 'Дульный компенсатор', slot: 'muzzle', fits: { rofMin: 2 }, add: { recoil: -1 },
    tier: 2, price: 150, factions: ['warprom', 'renegades', 'mechanids'], desc: 'Отдача −1 (не ниже 0).' }),
  // --- Магазин
  m({ id: 'extended-mag', name: 'Удлинённый магазин', slot: 'mag', fits: { rofMin: 2 }, add: { rof: 1 },
    tier: 2, price: 180, factions: ['warprom', 'pirates', 'scavengers'], desc: 'Скорострельность +1.' }),
  m({ id: 'drum-mag', name: 'Барабанный магазин', slot: 'mag', fits: { rofMin: 3 }, add: { rof: 2, recoil: 1 },
    tier: 3, price: 300, factions: ['warprom', 'scavengers'], desc: 'Скорострельность +2, отдача +1.' }),
  // --- Кромка
  m({ id: 'proxy-sharpening', name: 'Прокси-заточка', slot: 'edge', fits: { group: ['melee'] }, add: { extra: { dice: '1d4', dmgType: 'proxy' } },
    tier: 2, price: 250, factions: ['tekhonki'], desc: '+1d4 прокси к каждому попаданию (по машинам ×1.5). Техоньки точат молитвой.' }),
  m({ id: 'serrated-edge', name: 'Зазубренная кромка', slot: 'edge', fits: { group: ['melee'] }, add: { onCrit: [{ op: 'status', id: 'bleed', turns: 2 }] },
    tier: 1, price: 60, factions: ['scavengers', 'mutantsBeast'], desc: 'Крит — кровотечение на 2 хода.' }),
  m({ id: 'shock-winding', name: 'Шоковая обмотка', slot: 'edge', fits: { group: ['melee'] }, add: { extra: { dice: '1d4', dmgType: 'electric' }, enr: 1 },
    tier: 3, price: 220, factions: ['aiParty', 'mechanids'], desc: '+1d4 электро к попаданию, 1 ЭНР за удар.' }),
  // --- Рукоять
  m({ id: 'blessed-nut', name: 'Освящённая гайка на темляке', slot: 'grip', fits: {}, add: { vs: { digital: 1 } },
    tier: 1, price: 50, factions: ['tekhonki', 'tinBrotherhood'], desc: '+1 к урону по духам Киберспейса (талант «Зов стали»).' }),
  m({ id: 'electrical-tape', name: 'Изолента на рукояти', slot: 'grip', fits: { quality: ['junk'] }, add: { removeJam: true },
    tier: 1, price: 10, factions: ['scavengers', 'neutralVillages', 'tekhonki'], desc: 'Хлам больше не клинит. Изолента решает всё.' }),
  // --- Ячейка
  m({ id: 'focus-lens', name: 'Фокусирующая линза', slot: 'core', fits: { wtype: ['laser', 'plasma', 'energy'] }, add: { dmg: 1 },
    tier: 3, price: 350, factions: ['aiParty', 'pirates'], desc: '+1 к урону энергооружия.' }),
  m({ id: 'overcharge-cell', name: 'Форсированная ячейка', slot: 'core', fits: {}, add: { extra: { dice: '1d4', dmgType: 'energy' }, enr: 1 },
    tier: 4, price: 320, factions: ['aiParty', 'tekhonki'], desc: '+1d4 энерго, но +1 ЭНР за атаку.' }),
  // --- Броня
  m({ id: 'ceramic-insert', name: 'Керамическая вставка', slot: 'plate', fits: { atype: ['light', 'medium'] }, add: { kb: 1 },
    tier: 3, price: 260, factions: ['aiParty', 'warprom'], desc: '+1 КБ лёгкой или средней броне.' }),
  // --- Проект «Лис» и «Волк» (предложено, вне канона)
  m({ id: 'lis-4-sniffer', name: 'Лис-4 «Нюх» (дрон-наводчик)', slot: 'optic', fits: { group: ['ranged'] }, add: { hit: 1, range: 4 },
    tier: 4, price: 520, factions: [], desc: 'Крошечный дрон подсвечивает цель: +1 к атаке, дальность +4. Не продаётся.' }),
  m({ id: 'lis-6-core', name: 'Лис-6 «Хитрец» (ИИ-ядро)', slot: 'lining', fits: { atype: ['heavy', 'mech'] }, add: { kb: 1, resist: { electric: 'resist' } },
    tier: 5, price: 900, factions: [], desc: 'ИИ-ядро берёт на себя уклонение: +1 КБ, сопротивление электро. Ворчит на неудачные манёвры. Не продаётся.' }),
  m({ id: 'wolf-link', name: 'Волк-4 «Вой» (модуль стайной связи)', slot: 'optic', fits: { group: ['ranged'] }, add: { hit: 1 },
    tier: 4, price: 360, factions: ['warprom'], desc: 'Стайный целеуказатель: +1 к атаке. Постоянно воет на частоте, которую слышат только свои.' }),
  m({ id: 'scrap-plates', name: 'Наваренные листы', slot: 'plate', fits: { atype: ['heavy', 'mech'] }, add: { kb: 1, noise: 1 },
    tier: 2, price: 160, factions: ['scavengers', 'mechanids'], desc: '+1 КБ, шум +1.' }),
  m({ id: 'rubber-lining', name: 'Прорезиненная подкладка', slot: 'lining', fits: {}, add: { resist: { electric: 'resist' } },
    tier: 2, price: 180, factions: ['tekhonki', 'mechanids'], desc: 'Сопротивление электро.' }),
  m({ id: 'foil-lining', name: 'Фольговая подкладка', slot: 'lining', fits: {}, add: { resist: { cyber: 'resist' } },
    tier: 3, price: 220, factions: ['tinBrotherhood', 'tekhonki'], desc: 'Сопротивление киберу. В отличие от дубового амулета — работает.' }),
  m({ id: 'asbestos-lining', name: 'Асбестовая подкладка', slot: 'lining', fits: {}, add: { resist: { fire: 'resist' } },
    tier: 2, price: 160, factions: ['renegades', 'scavengers'], desc: 'Сопротивление огню. О здоровье лёгких не спрашивать.' }),
  m({ id: 'felt-soles', name: 'Войлочные подмётки', slot: 'sole', fits: {}, add: { noise: -1 },
    tier: 1, price: 30, factions: ['neutralVillages', 'tinBrotherhood'], desc: 'Шум шагов −1. Канон: металлическая подошва шумная — эта нет.' }),
  m({ id: 'magnet-anchors', name: 'Магнитные якоря', slot: 'sole', fits: {}, add: { immuneStatus: ['prone', 'push'], magnetic: true },
    tier: 3, price: 150, factions: ['mechanids'], desc: 'Не роняют и не отталкивают. Но мусорщицкий магнит тянет вдвое сильнее.' }),
];

export const MODS = Object.fromEntries(LIST.map((it) => [it.id, it]));
