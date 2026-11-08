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
  // ===== Расширение v7 (inventory-mods): ещё 51 мод. Спека — docs/specs/inventory-mods.md.
  // Новые поля (движок пока их не читает, см. спеку §3.4): surfaceOnHit, immuneSurface, speed, quick, thorns, ignoreSmoke, regen, req.
  // --- Прицелы
  m({ id: 'red-dot-pawn', name: 'Коллиматор из ломбарда', slot: 'optic', fits: { group: ['ranged'] }, add: { hit: 1, noise: 0 },
    tier: 2, price: 120, factions: ['pirates', 'renegades'], desc: '+1 к атаке дальним оружием. Линза чужая, красная точка своя.' }),
  m({ id: 'thermal-scope', name: 'Тепловизор из танка', slot: 'optic', fits: { wtype: ['rifle', 'assault', 'mg', 'crossbow'] }, add: { hit: 1, ignoreSmoke: true },
    tier: 4, price: 420, factions: ['warprom'], req: { skill: 'tech', dc: 13 }, desc: '+1 к атаке, дым и пар не дают помехи. Требует Технологии 13 для юстировки.' }),
  m({ id: 'laser-pointer', name: 'Лазерная указка', slot: 'optic', fits: { group: ['ranged'] }, add: { onCrit: [{ op: 'status', id: 'blind', turns: 1 }] },
    tier: 2, price: 90, factions: ['aiParty', 'cringegons'], desc: 'Крит слепит цель на 1 ход. Кот в восторге.' }),
  m({ id: 'holo-reticle', name: 'Голо-прицел Партии', slot: 'optic', fits: { group: ['ranged', 'special'] }, add: { hit: 1, range: 2 },
    tier: 3, price: 280, factions: ['aiParty'], desc: '+1 к атаке, +2 клетки. На сетке пишет «Вы прекрасны».' }),
  m({ id: 'proxy-lens', name: 'Прокси-линза', slot: 'optic', fits: { group: ['ranged', 'special'] }, add: { hit: 1, vs: { mechanical: 1 } },
    tier: 3, price: 260, factions: ['tekhonki'], desc: '+1 к атаке и +1 к урону по машинам.' }),
  // --- Ствол
  m({ id: 'flame-hider', name: 'Пламегаситель', slot: 'muzzle', fits: { wtype: ['pistol', 'smg', 'rifle', 'assault', 'mg'] }, add: { noise: -1 },
    tier: 2, price: 90, factions: ['warprom', 'tinBrotherhood'], desc: 'Шум −1, не выдаёт стрелка вспышкой.' }),
  m({ id: 'incendiary-muzzle', name: 'Поджигающая насадка', slot: 'muzzle', fits: { group: ['ranged'] }, add: { noise: 1, onHit: [{ op: 'status', id: 'burn', turns: 2, chance: 0.2, save: 'con' }], surfaceOnHit: { kind: 'fire', size: 1, turns: 3, on: 'crit' } },
    tier: 3, price: 240, factions: ['renegades', 'pirates'], desc: '20% поджечь цель (СП ТЕЛ); крит оставляет огонь на клетке. Шум +1.' }),
  m({ id: 'subsonic-barrel', name: 'Дозвуковой ствол', slot: 'muzzle', fits: { wtype: ['pistol', 'smg', 'rifle', 'assault'] }, add: { noise: -3, dmg: -1 },
    tier: 2, price: 140, factions: ['pirates', 'scavengers'], desc: 'Шум −3, урон −1. Тихо, как в библиотеке Гармонии.' }),
  m({ id: 'bipod', name: 'Сошки', slot: 'muzzle', fits: { rofMin: 2 }, add: { recoil: -2, range: 2 },
    tier: 3, price: 200, factions: ['warprom', 'tinBrotherhood'], desc: 'Отдача −2, +2 клетки. Складные, звенят.' }),
  m({ id: 'cryo-nozzle', name: 'Криосопло', slot: 'muzzle', fits: { group: ['ranged'] }, add: { enr: 1, onHit: [{ op: 'status', id: 'chilled', turns: 2, chance: 0.25, save: 'con' }], surfaceOnHit: { kind: 'ice', size: 1, turns: 3, on: 'crit' } },
    tier: 4, price: 380, factions: ['aiParty'], req: { skill: 'tech', dc: 14 }, desc: '25% охладить цель, крит замораживает клетку. +1 ЭНР за выстрел.' }),
  // --- Магазин
  m({ id: 'incendiary-mag', name: 'Зажигательный магазин', slot: 'mag', fits: { group: ['ranged'] }, add: { dmg: -1, onHit: [{ op: 'status', id: 'burn', turns: 2, chance: 0.3, save: 'con' }], surfaceOnHit: { kind: 'fire', size: 1, turns: 3, on: 'crit' } },
    tier: 3, price: 260, factions: ['renegades', 'warprom'], desc: '30% поджечь цель; крит зажигает клетку (масло и газ вспыхнут). Урон −1.' }),
  m({ id: 'shock-mag', name: 'Электрошоковый магазин', slot: 'mag', fits: { group: ['ranged'] }, add: { extra: { dice: '1d4', dmgType: 'electric' }, onHit: [{ op: 'status', id: 'shocked', turns: 1, chance: 0.2, save: 'con' }], enr: 1 },
    tier: 3, price: 300, factions: ['aiParty', 'tekhonki'], desc: '+1d4 электро, 20% «Под током». +1 ЭНР за выстрел.' }),
  m({ id: 'ap-mag', name: 'Бронебойный магазин', slot: 'mag', fits: { group: ['ranged'] }, add: { ap: 1, recoil: 1 },
    tier: 3, price: 280, factions: ['warprom'], desc: 'Бронебойность +1 (−1 КБ цели), отдача +1.' }),
  m({ id: 'hollow-mag', name: 'Экспансивные пули', slot: 'mag', fits: { group: ['ranged'] }, add: { dmg: 1, onCrit: [{ op: 'status', id: 'bleed', turns: 2 }] },
    tier: 2, price: 170, factions: ['pirates', 'renegades'], desc: '+1 урона, крит — кровотечение.' }),
  m({ id: 'acid-mag', name: 'Кислотные патроны', slot: 'mag', fits: { group: ['ranged'] }, add: { onHit: [{ op: 'status', id: 'acid', turns: 2, chance: 0.25, save: 'con' }], surfaceOnHit: { kind: 'acid', size: 1, turns: 3, on: 'crit' } },
    tier: 3, price: 270, factions: ['agrozone', 'mutantsPlant'], desc: '25% облить кислотой (снижает КБ), крит оставляет лужу.' }),
  m({ id: 'tracer-mag', name: 'Трассирующий магазин', slot: 'mag', fits: { group: ['ranged'] }, add: { hit: 1, noise: 1, onCrit: [{ op: 'status', id: 'marked', turns: 2 }] },
    tier: 2, price: 150, factions: ['warprom', 'neutralVillages'], desc: '+1 к атаке, шум +1, крит метит цель.' }),
  m({ id: 'rubber-mag', name: 'Резиновые пули ОМОНа', slot: 'mag', fits: { wtype: ['pistol', 'smg', 'rifle', 'assault'] }, add: { dmg: -1, onHit: [{ op: 'status', id: 'dazed', turns: 1, chance: 0.25, save: 'con' }] },
    tier: 2, price: 130, factions: ['aiParty'], desc: '25% оглушить («Ошарашен»), урон −1.' }),
  m({ id: 'oil-mag', name: 'Масляные патроны', slot: 'mag', fits: { group: ['ranged'] }, add: { onHit: [{ op: 'status', id: 'oiled', turns: 2, chance: 0.3 }], surfaceOnHit: { kind: 'oil', size: 1, turns: 4, on: 'crit' } },
    tier: 2, price: 110, factions: ['scavengers', 'renegades'], desc: '30% «Облит маслом»; крит — лужа масла. Сам по себе безвреден, пока не появится огонь.' }),
  // --- Кромка
  m({ id: 'thermal-edge', name: 'Раскалённая кромка', slot: 'edge', fits: { group: ['melee'] }, add: { extra: { dice: '1d4', dmgType: 'fire' }, enr: 1, onHit: [{ op: 'status', id: 'burn', turns: 2, chance: 0.2, save: 'con' }], surfaceOnHit: { kind: 'fire', size: 1, turns: 3, on: 'crit' } },
    tier: 3, price: 290, factions: ['tekhonki', 'renegades'], desc: '+1d4 огня, 20% поджог, крит — огонь на клетке. 1 ЭНР за удар.' }),
  m({ id: 'shock-edge', name: 'Шоковая кромка', slot: 'edge', fits: { group: ['melee'] }, add: { onHit: [{ op: 'status', id: 'shocked', turns: 1, chance: 0.25, save: 'con' }], enr: 1 },
    tier: 2, price: 210, factions: ['aiParty', 'mechanids'], desc: '25% «Под током» (мокрого бьёт сильнее). 1 ЭНР за удар.' }),
  m({ id: 'cryo-edge', name: 'Холодная кромка', slot: 'edge', fits: { group: ['melee'] }, add: { onHit: [{ op: 'status', id: 'chilled', turns: 2, chance: 0.25, save: 'con' }], surfaceOnHit: { kind: 'ice', size: 1, turns: 3, on: 'crit' }, enr: 1 },
    tier: 4, price: 340, factions: ['aiParty'], req: { skill: 'tech', dc: 14 }, desc: '25% охладить, крит — лёд на клетке. 1 ЭНР за удар.' }),
  m({ id: 'acid-edge', name: 'Травленая кромка', slot: 'edge', fits: { group: ['melee'] }, add: { onHit: [{ op: 'status', id: 'acid', turns: 2, chance: 0.25, save: 'con' }] },
    tier: 3, price: 230, factions: ['agrozone', 'mutantsPlant'], desc: '25% облить кислотой (снижает КБ цели).' }),
  m({ id: 'poison-edge', name: 'Лезвие со смазкой', slot: 'edge', fits: { wtype: ['knife', 'sabre', 'sword', 'katana', 'axe', 'polearm'] }, add: { onHit: [{ op: 'status', id: 'poison', turns: 3, chance: 0.3, save: 'con' }] },
    tier: 2, price: 140, factions: ['mutantsBeast', 'neutralVillages'], desc: '30% отравить на 3 хода. Смазка из болотной жабы.' }),
  m({ id: 'weighted-edge', name: 'Утяжелитель из гаек', slot: 'edge', fits: { group: ['melee'] }, add: { dmg: 1, hit: -1 },
    tier: 1, price: 40, factions: ['scavengers'], desc: '+1 урона, −1 к атаке. Приварено криво.' }),
  m({ id: 'hooked-edge', name: 'Крюк на обухе', slot: 'edge', fits: { wtype: ['axe', 'polearm', 'hammer', 'twoHanded', 'bastard'] }, add: { onHit: [{ op: 'status', id: 'prone', turns: 1, chance: 0.2, save: 'str' }] },
    tier: 2, price: 120, factions: ['pirates', 'tinBrotherhood'], desc: '20% сбить с ног (СП СИЛ).' }),
  m({ id: 'oiled-edge', name: 'Промасленная кромка', slot: 'edge', fits: { group: ['melee'] }, add: { onHit: [{ op: 'status', id: 'oiled', turns: 2, chance: 0.3 }] },
    tier: 1, price: 45, factions: ['scavengers', 'mechanids'], desc: '30% «Облит маслом». Связка с огнём: молотов и огнемёт довершат.' }),
  // --- Рукоять
  m({ id: 'wrapped-grip', name: 'Обмотка из ремня', slot: 'grip', fits: {}, add: { hit: 1 },
    tier: 1, price: 55, factions: ['neutralVillages', 'scavengers', 'tinBrotherhood'], desc: '+1 к атаке. Не скользит.' }),
  m({ id: 'mutant-tooth', name: 'Зуб мутанта на шнурке', slot: 'grip', fits: {}, add: { vs: { mutant: 1 } },
    tier: 1, price: 50, factions: ['mutantsBeast', 'neutralVillages'], desc: '+1 к урону по мутантам.' }),
  m({ id: 'mech-bolt', name: 'Болт механида', slot: 'grip', fits: {}, add: { vs: { mechanical: 1 } },
    tier: 1, price: 50, factions: ['mechanids', 'tekhonki'], desc: '+1 к урону по машинам. Железо знает железо.' }),
  // --- Ячейка
  m({ id: 'spare-cell', name: 'Запасная ячейка', slot: 'core', fits: { wtype: ['laser', 'plasma', 'energy', 'melta', 'proxy', 'cringe'] }, add: { enr: -1 },
    tier: 2, price: 160, factions: ['aiParty', 'tekhonki'], desc: '−1 ЭНР за атаку (не ниже 0).' }),
  m({ id: 'arc-capacitor', name: 'Дуговой конденсатор', slot: 'core', fits: { wtype: ['laser', 'plasma', 'energy', 'proxy'] }, add: { extra: { dice: '1d4', dmgType: 'electric' }, enr: 1, onHit: [{ op: 'status', id: 'shocked', turns: 1, chance: 0.2, save: 'con' }] },
    tier: 4, price: 400, factions: ['aiParty', 'mechanids'], req: { skill: 'tech', dc: 14 }, desc: '+1d4 электро, 20% «Под током». +1 ЭНР за атаку.' }),
  m({ id: 'proxy-resonator', name: 'Прокси-резонатор', slot: 'core', fits: { group: ['special'] }, add: { extra: { dice: '1d4', dmgType: 'proxy' }, enr: 1, surfaceOnHit: { kind: 'proxy', size: 1, turns: 3, on: 'crit' } },
    tier: 3, price: 310, factions: ['tekhonki'], desc: '+1d4 прокси, крит — прокси-пятно. +1 ЭНР за атаку.' }),
  m({ id: 'cringe-amp', name: 'Усилитель кринжа', slot: 'core', fits: { wtype: ['cringe'] }, add: { extra: { dice: '1d4', dmgType: 'cringe' }, enr: 1, onHit: [{ op: 'status', id: 'cringed', turns: 2, chance: 0.25, save: 'wis' }] },
    tier: 3, price: 290, factions: ['cringegons'], desc: '+1d4 кринжа, 25% «Кринж». +1 ЭНР за атаку.' }),
  // --- Пластины
  m({ id: 'tire-patch', name: 'Шинные накладки', slot: 'plate', fits: { atype: ['cloth', 'light', 'medium'] }, add: { kb: 1, noise: 1 },
    tier: 1, price: 70, factions: ['scavengers', 'neutralVillages'], desc: '+1 КБ, шум +1.' }),
  m({ id: 'kevlar-sheet', name: 'Кевларовая вставка', slot: 'plate', fits: { atype: ['light', 'medium'] }, add: { kb: 1, resist: { pierce: 'resist' } },
    tier: 3, price: 320, factions: ['warprom', 'aiParty'], desc: '+1 КБ, сопротивление колющему.' }),
  m({ id: 'spiked-plates', name: 'Шипастые пластины', slot: 'plate', fits: { atype: ['medium', 'heavy', 'mech'] }, add: { noise: 1, thorns: { dice: '1d4', dmgType: 'pierce' } },
    tier: 2, price: 190, factions: ['renegades', 'pirates'], desc: 'Бьющий в ближнем бою получает 1d4 колющего. Шум +1.' }),
  m({ id: 'mirror-plate', name: 'Зеркальная пластина', slot: 'plate', fits: { atype: ['light', 'medium', 'heavy'] }, add: { resist: { energy: 'resist', fire: 'resist' } },
    tier: 3, price: 330, factions: ['aiParty'], desc: 'Сопротивление энерго и огню. Отражает лазер и собственные комплексы.' }),
  m({ id: 'reactive-plate', name: 'Реактивная броня', slot: 'plate', fits: { atype: ['medium', 'heavy', 'mech'] }, add: { kb: 2, noise: 2 },
    tier: 4, price: 480, factions: ['warprom'], req: { skill: 'tech', dc: 14, tool: 'repair-kit' }, desc: '+2 КБ, шум +2. Монтаж — Технологии 14 и ремнабор.' }),
  // --- Подкладка
  m({ id: 'quilted-lining', name: 'Утеплённая подкладка', slot: 'lining', fits: {}, add: { immuneStatus: ['chilled'] },
    tier: 2, price: 150, factions: ['neutralVillages', 'tinBrotherhood'], desc: 'Иммунитет к «Охлаждён». Ватник — вечная классика.' }),
  m({ id: 'wet-suit', name: 'Гидрокостюм', slot: 'lining', fits: {}, add: { immuneStatus: ['wet'], immuneSurface: ['water'] },
    tier: 2, price: 140, factions: ['pirates', 'neutralVillages'], desc: 'Иммунитет к «Мокрый», вода под ногами не вредит.' }),
  m({ id: 'fire-blanket', name: 'Противопожарная подкладка', slot: 'lining', fits: {}, add: { immuneSurface: ['fire'], resist: { fire: 'resist' } },
    tier: 3, price: 260, factions: ['renegades', 'warprom'], desc: 'Огонь на клетках не жжёт, сопротивление огню.' }),
  m({ id: 'insulator-lining', name: 'Диэлектрическая подкладка', slot: 'lining', fits: {}, add: { immuneStatus: ['shocked'], immuneSurface: ['electric'] },
    tier: 3, price: 270, factions: ['aiParty', 'tekhonki'], desc: 'Иммунитет к «Под током», электролужи безопасны.' }),
  m({ id: 'gas-filter', name: 'Противогазный фильтр', slot: 'lining', fits: {}, add: { immuneStatus: ['choking', 'poison'], immuneSurface: ['toxgas'] },
    tier: 2, price: 200, factions: ['warprom', 'agrozone'], desc: 'Иммунитет к удушью и яду, токсичный газ безвреден.' }),
  m({ id: 'acid-coat', name: 'Кислотостойкое покрытие', slot: 'lining', fits: {}, add: { immuneStatus: ['acid', 'corrosion'], immuneSurface: ['acid'] },
    tier: 3, price: 250, factions: ['agrozone', 'mechanids'], desc: 'Иммунитет к кислоте и коррозии.' }),
  m({ id: 'faraday-cage', name: 'Клетка Фарадея', slot: 'lining', fits: {}, add: { immuneStatus: ['glitch', 'overload'] },
    tier: 4, price: 420, factions: ['tekhonki', 'tinBrotherhood'], req: { skill: 'tech', dc: 13 }, desc: 'Иммунитет к «Глюк» и «Перегрузка». Ходить неудобно, зато прокси-буря нипочём.' }),
  m({ id: 'pocket-lining', name: 'Карманы на липучке', slot: 'lining', fits: {}, add: { quick: 1 },
    tier: 2, price: 130, factions: ['neutralVillages', 'scavengers'], desc: '+1 быстрый слот разгрузки.' }),
  // --- Подошва
  m({ id: 'grip-spikes', name: 'Шипы-кошки', slot: 'sole', fits: {}, add: { immuneStatus: ['slick'], immuneSurface: ['ice'] },
    tier: 2, price: 110, factions: ['neutralVillages', 'tinBrotherhood'], desc: 'Не скользит на льду, иммунитет к «Скользко».' }),
  m({ id: 'swamp-boots', name: 'Болотные бахилы', slot: 'sole', fits: {}, add: { immuneSurface: ['water', 'oil', 'blood'] },
    tier: 2, price: 120, factions: ['pirates', 'mutantsBeast'], desc: 'Вода, масло и кровь на полу не липнут и не дают статусов.' }),
  m({ id: 'sprint-spikes', name: 'Беговые шипы', slot: 'sole', fits: {}, add: { speed: 1, noise: 1 },
    tier: 2, price: 140, factions: ['scavengers', 'renegades'], desc: '+1 к скорости, шум +1.' }),
  m({ id: 'quiet-soles', name: 'Тихая подошва', slot: 'sole', fits: {}, add: { stealthDis: false, noise: -1 },
    tier: 3, price: 210, factions: ['neutralVillages', 'mutantsBeast'], desc: 'Броня не мешает скрытности, шум −1.' }),
  m({ id: 'hover-pads', name: 'Антиграв-подушки', slot: 'sole', fits: {}, add: { immuneSurface: ['fire', 'acid', 'electric', 'toxgas'], immuneStatus: ['prone'] },
    tier: 4, price: 520, factions: ['aiParty'], req: { skill: 'tech', dc: 15 }, desc: 'Над полом: поверхности (огонь, кислота, ток, газ) не действуют, не сбивают с ног.' }),
  // --- Киберспейс v2 (CS_ITEMS, data/world/cyberspace.js): награда зоны «Хор поглощённых»
  m({ id: 'cs-echo-coil', name: 'Эхо-катушка', slot: 'core', fits: {}, add: { extra: { dice: '1d4', dmgType: 'cyber' }, onHit: [{ op: 'status', id: 'glitch', turns: 1, chance: 0.2, save: 'int' }] },
    tier: 4, price: 380, factions: [], desc: 'Кибер-урон +1d4 и 20% «Глитч». Ячейка энерго/прокси-оружия.' }),
];

export const MODS = Object.fromEntries(LIST.map((it) => [it.id, it]));
