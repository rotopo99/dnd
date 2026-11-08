// Броня v3. Спека — docs/specs/items.md. Канон — docs/canon/rules/core-rules.md (правила 3 и 7).
// КБ = 10 + armor.kb + mod(ЛВК), ограниченный dexCap (канон + core-rules).
//
// Поля:
//   id, name, cat: 'armor', atype: 'cloth' | 'light' | 'medium' | 'heavy' | 'mech'
//   kb — КБ брони; dexCap — потолок mod(ЛВК): null без потолка, 2 у средней, 0 у тяжёлой и мехов
//   stealth: true — помеха на Скрытность (у средней снимается владением ступени 3+, канон)
//   noise: 0..3 — шум шагов (канон, правило 7: «металлическая подошва шумная»); суммируется с расой
//   resist — dmgType → 'resist' | 'vuln' | 'immune', пока надета
//   req — минимум характеристик (ниже — скорость −2 и помеха на ЛВК-спасброски)
//   speed — модификатор скорости (клетки)
//   grants — способности; passives — пассивки (схема core-rules)
//   mech — только у atype 'mech': { shield, weapon, tag } — см. спеку «Мехи»
//   slots — слоты модов брони: 'plate' | 'lining' | 'sole'
//   natural: true — часть тела (снять нельзя), races — для кого

const ability = (o) => ({
  level: 1, path: null, cost: 0, action: 'action', trigger: null,
  range: 0, target: 'self', area: null, roll: 'auto', save: null, onSave: 'none',
  usesPerBattle: null, effects: [], desc: '', canon: null,
  ...o,
});

// Свойства типов (канон, правило 3). Бонусы мастерства (ступень 4) считает движок: тяжёлая/мех +1 КБ,
// лёгкая +1 бонусное действие за ход, средняя — без помехи на Скрытность.
export const ARMOR_TYPES = {
  cloth: { name: 'Ткань', dexCap: null, stealth: false },
  light: { name: 'Лёгкая', dexCap: null, stealth: false },
  medium: { name: 'Средняя', dexCap: 2, stealth: true },
  heavy: { name: 'Тяжёлая', dexCap: 0, stealth: true },
  mech: { name: 'Мехи', dexCap: 0, stealth: true, minTier: 2 },
};

// Дополнительное бонусное действие, на которое можно потратить «лишнее» бонусное действие лёгкой брони.
export const LIGHT_ROLL = ability({
  id: 'armor-light-roll', name: 'Перекат', action: 'bonus', usesPerBattle: 2,
  effects: [{ op: 'move', tiles: 2, mode: 'dash' }],
  desc: 'Перекат на 2 клетки, не вызывает атак при отходе.', canon: 'rules/core-rules.md',
  needs: 'disengage: перемещение move без атак при отходе',
});

// Схема движка (game/src/rules/equipment.js): slot 'armor', type, kb, dexCap?, stealthDis?, resist?, noise?.
// Здесь `atype` → `type`, `stealth` → `stealthDis`; dexCap не задаётся, если у типа нет потолка.
const a = (o) => {
  const t = ARMOR_TYPES[o.atype];
  const it = {
    cat: 'armor', slot: 'armor', stealth: t.stealth, noise: 0, resist: {}, req: {}, speed: 0,
    grants: [], passives: [], slots: ['lining'], tier: 1, price: 0, factions: [], unique: false,
    quality: 'working', natural: false, races: null, mech: null, desc: '', canon: 'rules/core-rules.md',
    ...o,
  };
  it.type = it.atype;
  it.stealthDis = !!it.stealth;
  if (t.dexCap != null && it.dexCap == null) it.dexCap = t.dexCap;
  return it;
};

const LIST = [
  // ---------------------------------------------------------------- Ткань
  a({ id: 'quilted-jacket', name: 'Ватник', atype: 'cloth', kb: 1, tier: 1, price: 10, factions: ['neutralVillages', 'agrozone', 'renegades'],
    desc: 'Греет, держит нож. Иногда.' }),
  a({ id: 'cult-robe', name: 'Ряса культиста', atype: 'cloth', kb: 1, tier: 1, price: 20, factions: ['cult'],
    props: { stigma: { tinBrotherhood: -5 } }, desc: 'На спине — QR-код «Суд идёт». Братство не любит.' }),
  a({ id: 'hazmat-suit', name: 'Химзащита ОЗК', atype: 'cloth', kb: 1, stealth: true, noise: 1, resist: { toxin: 'resist' },
    tier: 2, price: 80, factions: ['agrozone', 'mutantsPlant', 'scavengers'], desc: 'Шуршит на всю пустошь, зато споры мимо.' }),
  a({ id: 'wire-mantle', name: 'Мантия из проводов', atype: 'cloth', kb: 1, resist: { electric: 'resist' },
    tier: 2, price: 90, factions: ['tekhonki'], desc: 'Техоньки плетут её как кольчугу. Заземлена молитвой.' }),
  a({ id: 'host-jacket', name: 'Блестящий пиджак ведущего', atype: 'cloth', kb: 1, resist: { cringe: 'resist' },
    tier: 2, price: 110, factions: ['cringegons', 'neutralVillages'], desc: 'Кто сам кринжовый — того кринж не берёт.' }),

  // ---------------------------------------------------------------- Лёгкая (стартовые — с КБ как в классах)
  a({ id: 'lined-leather', name: 'Кожанка с подкладкой', atype: 'light', kb: 2, tier: 1, price: 40, factions: ['pirates', 'scavengers'],
    desc: 'Стартовая броня Уголовника.' }),
  a({ id: 'duster-coat', name: 'Кожаный плащ-пыльник', atype: 'light', kb: 2, tier: 1, price: 40, factions: ['neutralVillages', 'mutantsBeast'],
    desc: 'Стартовая броня Рейнджера.' }),
  a({ id: 'plated-overall', name: 'Рабочий комбинезон с пластинами', atype: 'light', kb: 2, tier: 1, price: 40, factions: ['mechanids', 'tekhonki', 'scavengers'],
    desc: 'Стартовая броня Айтишника.' }),
  a({ id: 'shielded-jacket', name: 'Куртка с экранирующей подкладкой', atype: 'light', kb: 2, tier: 1, price: 45, factions: ['tekhonki', 'pirates'],
    desc: 'Стартовая броня Техноманта.' }),
  a({ id: 'mesh-cloak', name: 'Плащ с вшитой сеткой', atype: 'light', kb: 2, tier: 1, price: 45, factions: ['cult'],
    desc: 'Стартовая броня КиберТеха.' }),
  a({ id: 'concert-kosuha', name: 'Концертная косуха', atype: 'light', kb: 2, tier: 1, price: 40, factions: ['neutralVillages', 'pirates'],
    desc: 'Стартовая броня Рэпера. Заклёпки — на счастье.' }),
  a({ id: 'chitin-growths', name: 'Хитиновые наросты', atype: 'light', kb: 3, natural: true, races: ['mutant-beast', 'mutant-plant'], slots: [],
    tier: 1, price: 0, desc: 'Стартовая «броня» Мутанта. Не снимается, не продаётся.' }),
  a({ id: 'tire-vest', name: 'Жилет из покрышек', atype: 'light', kb: 3, resist: { blunt: 'resist' }, speed: -1,
    tier: 2, price: 90, factions: ['scavengers'], desc: 'Резина держит дубину. Пахнет гаражом.' }),
  a({ id: 'concealed-vest', name: 'Бронежилет скрытого ношения', atype: 'light', kb: 3,
    slots: ['plate', 'lining'], tier: 3, price: 300, factions: ['aiParty', 'pirates'], desc: 'Партийный стандарт для агентов. Лёгкий, незаметный.' }),
  a({ id: 'go-autocamo', name: 'Автокамуфляж ГО', atype: 'light', kb: 2,
    grants: [ability({ id: 'item-autocamo', name: 'Автокамуфляж', action: 'bonus', usesPerBattle: 1,
      effects: [{ op: 'status', id: 'stealth', turns: 2 }], desc: 'Скрытность на 2 хода.' })],
    tier: 3, price: 380, factions: ['renegades', 'warprom'], desc: 'Как у Ганса. Сливается с фоном, особенно с серым.', canon: 'lore/history.md' }),

  // ---------------------------------------------------------------- Средняя
  a({ id: 'bark-weave', name: 'Плетёная кора', atype: 'medium', kb: 3, stealth: false, tier: 1, price: 60, factions: ['mutantsPlant'],
    desc: 'Стартовая броня Эколога. Живая и тихая — помехи на Скрытность нет.' }),
  a({ id: 'ritual-breastplate', name: 'Ритуальный нагрудник', atype: 'medium', kb: 4, noise: 1, slots: ['plate', 'lining'],
    tier: 1, price: 120, factions: ['tekhonki'], desc: 'Стартовая броня СлавоТеха. Шестерёнки — для красоты и для веры.' }),
  a({ id: 'plate-rig', name: 'Разгрузка с пластинами', atype: 'medium', kb: 4, slots: ['plate', 'lining'],
    tier: 1, price: 120, factions: ['warprom', 'renegades'], desc: 'Стартовая броня Снайпера Пустошей.' }),
  a({ id: 'sign-plate', name: 'Латы из дорожных знаков', atype: 'medium', kb: 4, noise: 2, slots: ['plate', 'lining'],
    tier: 2, price: 120, factions: ['scavengers'], desc: 'На груди — «Осторожно, дети». Работает как предупреждение.' }),
  a({ id: 'mutant-hide', name: 'Броня из шкур мутантов', atype: 'medium', kb: 4, resist: { slash: 'resist' }, slots: ['lining'],
    tier: 3, price: 300, factions: ['mutantsBeast'], desc: 'Шкурник: «Шкуры только с врагов. В основном».' }),
  a({ id: 'captain-coat', name: 'Бронекамзол капитана', atype: 'medium', kb: 4, stealth: false, passives: [{ id: 'item-captain-coat', name: 'Морская походка', desc: 'Иммунитет к «лежачему».', op: { immuneStatus: ['prone'] } }],
    slots: ['plate', 'lining'], tier: 3, price: 380, factions: ['pirates'], desc: 'Кевлар под бархатом. Не падает даже в шторм.' }),
  a({ id: 'riot-gear', name: 'Снаряжение ОМОНа Партии', atype: 'medium', kb: 5, req: { str: 12 }, resist: { blunt: 'resist' }, noise: 1,
    slots: ['plate', 'lining', 'sole'], tier: 4, price: 520, factions: ['aiParty'], desc: 'Щиток, наколенники, номер на спине.' }),

  // ---------------------------------------------------------------- Тяжёлая
  a({ id: 'rusty-plate', name: 'Ржавая броня', atype: 'heavy', kb: 5, noise: 2, req: { str: 12 }, quality: 'junk',
    slots: ['plate', 'sole'], tier: 1, price: 90, factions: ['scavengers', 'tinBrotherhood'], desc: 'Кузнец Окалина учит, как не развалиться в ней.' }),
  a({ id: 'arbiter-armor', name: 'Доспех Арбитра', atype: 'heavy', kb: 5, noise: 2, req: { str: 13 },
    slots: ['plate', 'lining', 'sole'], tier: 1, price: 250, factions: ['warprom'], desc: 'Стартовая броня Арбитра.' }),
  a({ id: 'steel-sheet-plate', name: 'Тяжёлая броня из листовой стали', atype: 'heavy', kb: 6, noise: 3, req: { str: 13 },
    slots: ['plate', 'lining', 'sole'], tier: 1, price: 320, factions: ['scavengers', 'renegades', 'tinBrotherhood'], desc: 'Стартовая броня Забивного. Слышно за квартал.' }),
  a({ id: 'cleaner-carapace', name: 'Панцирь Чистильщика', atype: 'heavy', kb: 6, noise: 2, req: { str: 13 }, resist: { fire: 'resist' },
    slots: ['plate', 'lining', 'sole'], tier: 3, price: 600, factions: ['aiParty', 'agrozone'], desc: 'Огнеупорный: Чистильщики жгут поля в нём.' }),
  a({ id: 'tin-oyoroi', name: 'Доспех Братства «Жесть»', atype: 'heavy', kb: 7, noise: 2, req: { str: 14 }, resist: { slash: 'resist' },
    slots: ['plate', 'lining', 'sole'], tier: 4, price: 800, factions: ['tinBrotherhood'], desc: 'Лакированная жесть внахлёст. Самураи Хана.' }),
  a({ id: 'warprom-assault', name: 'Штурмовая броня Военпрома', atype: 'heavy', kb: 7, noise: 3, req: { str: 14 }, resist: { pierce: 'resist' },
    slots: ['plate', 'lining', 'sole'], tier: 5, price: 1200, factions: ['warprom'], desc: 'Держит автоматную очередь. По стандарту.' }),

  // ---------------------------------------------------------------- Мехи (отдельная категория, владение ступени 2+)
  a({ id: 'loader-exo', name: 'Экзоскелет-погрузчик Агрозоны', atype: 'mech', kb: 6, noise: 2, speed: -1,
    passives: [{ id: 'item-loader-exo', name: 'Гидроусилитель', desc: '+2 СИЛ.', op: { statBonus: { str: 2 } } }],
    mech: { shield: 7, weapon: null, tag: 'hybrid' }, slots: ['plate'], tier: 2, price: 900, factions: ['agrozone', 'aiParty'],
    desc: 'Таскал мешки нормы. Теперь таскает тебя.' }),
  a({ id: 'junk-mech-suit', name: 'Мех-костюм со свалки', atype: 'mech', kb: 7, noise: 3, speed: -2, resist: { pierce: 'resist' },
    mech: { shield: 10, weapon: 'hydro-fist', tag: 'hybrid' }, slots: ['plate'], tier: 3, price: 1500, factions: ['scavengers'],
    desc: 'Король свалок продаёт такие «почти новыми». Почти.' }),
  a({ id: 'proxy-golem-shell', name: 'Прокси-голем', atype: 'mech', kb: 7, noise: 2, speed: -1, resist: { proxy: 'resist', electric: 'resist' },
    mech: { shield: 20, weapon: 'proxy-wrench', tag: 'hybrid' }, slots: ['plate'], tier: 4, price: 2000, factions: ['tekhonki'],
    desc: 'Освящённая оболочка техоньков. Не боится прокси-бурь.' }),
  a({ id: 'kuznechik-walker', name: 'Шагоход Военпрома «Кузнечик»', atype: 'mech', kb: 8, noise: 3, speed: -1, resist: { pierce: 'resist', slash: 'resist' },
    mech: { shield: 15, weapon: 'conveyor-mg', tag: 'hybrid' }, slots: ['plate'], tier: 5, price: 3500, factions: ['warprom'],
    desc: 'Пилот сидит в кабине. Пулемёт — в комплекте.' }),

  // ---------------------------------------------------------------- Проект «Лис» (секретный оружейный проект неизвестной компании; канон автора)
  a({ id: 'lis-1', name: 'Лис-1 (мех-экзокостюм с ИИ)', atype: 'mech', kb: 8, noise: 3, speed: 0, quality: 'relic', unique: true,
    resist: { pierce: 'resist', blunt: 'resist' },
    passives: [{ id: 'item-lis1-ai', name: 'Бортовой ИИ «Лис»', desc: '+2 СИЛ, +1 к инициативе.', op: { statBonus: { str: 2 } } },
      { id: 'item-lis1-init', name: 'Бортовой ИИ «Лис»', desc: '', op: { init: 1 } }],
    grants: [ability({ id: 'item-lis1-core', name: 'Протокол «Лис»', action: 'bonus', usesPerBattle: 1,
      effects: [{ op: 'shield', value: 15 }, { op: 'status', id: 'haste', turns: 2 }], desc: '15 врем. ЗДР и ускорение на 2 хода: ИИ берёт на себя манёвр.' })],
    mech: { shield: 20, weapon: 'lis-2', tag: 'hybrid' }, slots: ['plate'], tier: 5, price: 0, factions: [],
    desc: 'Огромный экзокостюм с собственным ИИ. Требует мастерства мехов (ступень 3+, иначе помеха). Хранился в Бункере Лиса.' }),
  a({ id: 'lis-8-hide', name: 'Лис-8 «Шкура» (накидка-хамелеон)', atype: 'light', kb: 3, noise: 0, quality: 'masterwork', slots: ['lining', 'sole'],
    passives: [{ id: 'item-lis8-per', name: 'Лисья шкура', desc: '+1 ВОС: шкура видит за хозяина.', op: { statBonus: { per: 1 } } }],
    tier: 5, price: 1100, factions: [],
    desc: 'Предложено, вне канона. Накидка проекта «Лис»: камуфляж под местность, рыжая подкладка. В продаже не бывает.' }),
  a({ id: 'wolf-5-frame', name: 'Волк-5 «Матёрый» (каркас штурмового меха)', atype: 'mech', kb: 7, noise: 3, speed: 0, resist: { pierce: 'resist' },
    mech: { shield: 10, weapon: 'conveyor-mg', tag: 'hybrid' }, slots: ['plate'], tier: 5, price: 2800, factions: ['warprom'],
    desc: 'Предложено, вне канона. Серийный мех «Волк»: слабее Лис-1 (щит 10, КБ 7, без ИИ), зато продаётся и ходит стаей. Нужна ступень мехов 3+.' }),

  // ---------------------------------------------------------------- Реликты
  a({ id: 'predlozhka-greatcoat', name: 'Шинель забытого войска', atype: 'medium', kb: 4, stealth: false, quality: 'relic', unique: true,
    resist: { cringe: 'resist' }, passives: [{ id: 'item-greatcoat', name: 'Нас забыли', desc: 'Иммунитет к страху и кринж-эффекту.', op: { immuneStatus: ['fear', 'cringed'] } }],
    slots: ['plate', 'lining'], tier: 4, price: 0, factions: [], desc: 'Шинель Предложки. Кринжгоны не помнят, куда бить.', canon: 'lore/faction-stances.md' }),
  a({ id: 'gans-camo', name: 'Камуфляж Ганса', atype: 'light', kb: 3, quality: 'relic', unique: true,
    grants: [ability({ id: 'item-gans-camo', name: 'Без жертв', action: 'bonus', usesPerBattle: 1,
      effects: [{ op: 'status', id: 'stealth', turns: 2 }, { op: 'shield', value: 5 }], desc: 'Скрытность на 2 хода и 5 врем. ЗДР.' })],
    slots: ['plate', 'lining'], tier: 3, price: 0, factions: [], desc: 'Если Ганс отдал его сам — значит, верит.', canon: 'lore/history.md' }),
];

export const ARMOR = Object.fromEntries(LIST.map((it) => [it.id, it]));
