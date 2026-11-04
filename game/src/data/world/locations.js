// Узлы карты мира v1.0. Спека: docs/specs/world.md, п. 1, 2, 8 (контракт полей для UI — там же, «Контракт UI»).
// id узлов, у которых есть NPC, — из LOCATIONS в game/src/data/npcs.js. Новые id (только здесь) помечены // new.
// npcs — кто стоит на узле в мире. Если задано, оно главнее npcs.js[].location (там места крупнее, по регионам).
//
// Поля узла:
//   id, name, region, kind ('hub'|'town'|'camp'|'wild'|'dungeon'|'terminal'|'boss'), pos {x,y} 0..1000 — черновик карты,
//   art (путь в docs/canon/art или null), desc,
//   services: 'rest'|'heal'|'trade'|'train'|'implant'|'rumors'|'recruit'|'terminal'|'revive',
//   npcs: [id], hidden: null | { check: { skill, dc }, flags: [worldFlag], reveal: [quest flag] },
//   requires: null | { flag } | { rep: { faction, min } } | { quest, stage },
//   entry: null | { faction, check?: { skills, dc }, toll?, battle? } — проверка на входе по репутации,
//   terminal: null | { id, state }, battles: [{ id, encounter, map?, once, when? }],
//   battleMap: id карты (game/src/data/maps/) для боёв на узле и встреч рядом; null — makeArena,
//   caches: [{ id, check: { skill, dc } | null, loot: [{ item, n } | { credits }] }],
//   hazard: null | 'fire' | 'cringe', quests: [quest id] — кто/что выдаёт квесты на узле (кроме NPC).

const L = (o) => ({
  art: null, services: [], npcs: [], hidden: null, requires: null, entry: null,
  terminal: null, battles: [], caches: [], hazard: null, quests: [], battleMap: null,
  ...o,
});

const LIST = [
  // ================================================ Альфа-Гармония (хаб)
  L({ id: 'alpha-harmony', name: 'Альфа-Гармония: жилые палубы', region: 'harmony', kind: 'hub', pos: { x: 500, y: 140 },
    art: '03_локации/Альфа_Гармония_утёс.jpg',
    services: ['rest', 'heal', 'trade', 'recruit', 'revive'],
    npcs: ['sera', 'paracetamol', 'amanda', 'aynura', 'cook-kasha', 'lox', 'bosun-sukhar'],
    quests: ['mq-exodus', 'mq-agro-fire', 'sq-terminals', 'sq-aynura'],
    desc: 'Палубы беженцев и медпункт Парацетамола. Пахнет протезами и пайками.' }),
  L({ id: 'harmony-workshop', name: 'Мастерская Николы', region: 'harmony', kind: 'town', pos: { x: 470, y: 80 }, // new
    services: ['trade', 'train', 'implant'], npcs: ['nikola', 'pip-junior'],
    desc: 'Протезы на стенах, протезы на полу, один протез на потолке — сам залез.' }),
  L({ id: 'harmony-post', name: 'Пост караула № 2', region: 'harmony', kind: 'camp', pos: { x: 530, y: 180 }, // new
    services: ['train'], npcs: ['victor-sundown', 'gans'],
    quests: ['sq-cult-mines'],
    desc: 'Пост технической части. Новый замок, которого Сандаун боится.' }),
  L({ id: 'harmony-reactor', name: 'Реактор Гармонии', region: 'harmony', kind: 'terminal', pos: { x: 560, y: 110 },
    art: '03_локации/Реактор_Гармонии.jpg', services: ['terminal', 'revive'],
    terminal: { id: 'term-harmony', state: 'ours' },
    desc: 'Тут аколит хотел ритуал. Теперь терминал перепрошит Серой — точка возвращения души.' }),
  L({ id: 'harmony-sector-d', name: 'Сектор D', region: 'harmony', kind: 'camp', pos: { x: 440, y: 110 },
    npcs: ['riot-boss', 'brother-povestka'],
    battles: [{ id: 'sector-d-riot', encounter: 'w-harmony-riot', once: true, when: 'quest' },
      { id: 'sector-d-cell', encounter: 'w-harmony-cult-cell', once: true, when: 'quest' }],
    quests: ['sq-sector-d', 'sq-povestka'],
    desc: 'Бунты из-за еды. Пустой котёл громче любого митинга.' }),
  L({ id: 'funicular', name: 'Фуникулёр: нижняя станция', region: 'harmony', kind: 'camp', pos: { x: 500, y: 260 },
    art: '03_локации/Фуникулёр.jpg', services: ['trade', 'rumors'],
    npcs: ['seer', 'courier-lapsha'],
    desc: 'Развилка у подножия утёса. «Три дороги: к мёртвым, к маякам и к огню. Все плохие».' }),

  // ================================================ Нейтральные селения
  L({ id: 'galina-dacha', name: 'Дача Галины', region: 'villages', kind: 'camp', pos: { x: 330, y: 400 },
    art: '03_локации/Дача_Галины.jpg', services: ['rest', 'trade'], npcs: ['galina'],
    quests: ['sq-galina-hatch'],
    desc: 'Огород, теплица, табурет. И люк, о котором хозяйка молчит.' }),
  L({ id: 'dacha-hatch', name: 'Люк под дачей', region: 'villages', kind: 'dungeon', pos: { x: 300, y: 430 },
    art: '03_локации/Люк_под_дачей.jpg',
    hidden: { check: { skill: 'perception', dc: 13 }, flags: ['find-cache', 'hidden-routes'], reveal: ['galina-told'] },
    battles: [{ id: 'hatch-nest', encounter: 'w-villages-hatch', map: 'hatch-1', once: true }],
    caches: [{ id: 'hatch-stash', check: { skill: 'perception', dc: 14 }, loot: [{ item: 'medkit', n: 2 }, { item: 'servo-parts', n: 1 }, { credits: 60 }] }],
    desc: 'Довоенный бункер. Из люка пахнет, и что-то скребётся.' }),
  L({ id: 'neutral-villages', name: 'Село совета', region: 'villages', kind: 'town', pos: { x: 250, y: 520 },
    services: ['rest', 'trade', 'rumors', 'recruit'],
    npcs: ['elder-ulyana', 'innkeeper-pelmen', 'shepherd-timokha', 'prisoner-khikhik'],
    entry: { faction: 'neutralVillages' },
    quests: ['mq-beacons', 'sq-khikhik', 'sq-timokha'],
    desc: 'Совет старейшин, трактир Пельменя, пленный кринжгон в сарае.' }),
  L({ id: 'cringe-border', name: 'Граница кринж-маяков', region: 'villages', kind: 'wild', pos: { x: 140, y: 600 },
    npcs: ['beacon-keeper', 'defender-rubezh'], hazard: 'cringe',
    desc: 'Третью ночь горят маяки. Воздух неловкий, как пауза после плохой шутки.' }),
  L({ id: 'beacon-1', name: 'Северный маяк', region: 'villages', kind: 'wild', pos: { x: 110, y: 540 }, hazard: 'cringe', // new
    battles: [{ id: 'beacon-1', encounter: 'w-villages-beacon', once: true, when: 'quest' }],
    desc: 'Мачта из костей и антенн. Гудит анекдотами.' }),
  L({ id: 'beacon-2', name: 'Восточный маяк', region: 'villages', kind: 'wild', pos: { x: 200, y: 650 }, hazard: 'cringe', // new
    battles: [{ id: 'beacon-2', encounter: 'w-villages-beacon', once: true, when: 'quest' }],
    desc: 'Стоит у колодца. Вода в колодце краснеет. (Здесь же ивент Артёма, events.js.)' }),
  L({ id: 'beacon-3', name: 'Болотный маяк', region: 'villages', kind: 'wild', pos: { x: 70, y: 660 }, hazard: 'cringe', // new
    hidden: { check: { skill: 'survival', dc: 14 }, flags: ['hidden-routes', 'squeeze'], reveal: ['khikhik-talked'] },
    battles: [{ id: 'beacon-3', encounter: 'w-villages-beacon', once: true, when: 'quest' }],
    desc: 'Маяк, о котором знает только пленный Хихик.' }),
  L({ id: 'villages-tower', name: 'Заброшенная вышка', region: 'villages', kind: 'terminal', pos: { x: 380, y: 560 }, // new
    terminal: { id: 'term-villages', state: 'ritual' },
    battles: [{ id: 'tower-guard', encounter: 'w-villages-terminal', once: true, when: 'terminal' }],
    desc: 'Ретранслятор связи. Культ повесил на него ритуальный терминал.' }),

  // ================================================ Агрозона
  L({ id: 'agrozone', name: 'Агрозона: горящие поля', region: 'agrozone', kind: 'wild', pos: { x: 720, y: 430 },
    npcs: ['grandpa-kolos', 'zarya', 'forger-lyova'], hazard: 'fire', battleMap: 'burning-field-1',
    caches: [{ id: 'fields-seed', check: { skill: 'survival', dc: 13 }, loot: [{ item: 'seed-bank', n: 1 }] }],
    quests: ['sq-zarya', 'sq-lyova-chips', 'sq-kolos-fields'],
    desc: 'Дым до горизонта. Сорок процентов полей — в пепел.' }),
  L({ id: 'burg-svoboda', name: 'Бург «Свобода»', region: 'agrozone', kind: 'town', pos: { x: 800, y: 380 }, // new
    services: ['rest', 'trade', 'recruit'], npcs: ['marta'],
    entry: { faction: 'renegades' },
    desc: 'Лагерь восставших рабов Марты: «Отмена ID-чипов! Равные пайки!»' }),
  L({ id: 'burg-beton', name: 'Бург «Бетон»', region: 'agrozone', kind: 'town', pos: { x: 660, y: 500 }, // new
    services: ['rest', 'trade'], npcs: ['overseer-norma'],
    entry: { faction: 'agrozone', check: { skills: ['deception', 'persuasion'], dc: 13 }, toll: 20 },
    desc: 'Бетонный город лоялистов АИ. Склад пайков, камеры, лозунги.' }),
  L({ id: 'cleaner-checkpoint', name: 'Блокпост Чистильщиков', region: 'agrozone', kind: 'camp', pos: { x: 760, y: 500 }, // new
    npcs: ['cleaner-protokol'],
    entry: { faction: 'agrozone', check: { skills: ['deception'], dc: 15 }, battle: 'w-agro-cleaners' },
    battles: [{ id: 'checkpoint-assault', encounter: 'w-agro-checkpoint', once: true, when: 'quest' }],
    desc: '«Это не бунт — это чистка». Шлагбаум и огнемёты.' }),
  L({ id: 'agro-terminal', name: 'Элеватор', region: 'agrozone', kind: 'terminal', pos: { x: 840, y: 470 }, // new
    terminal: { id: 'term-agrozone', state: 'ritual' },
    battles: [{ id: 'elevator-guard', encounter: 'w-agro-terminal', once: true, when: 'terminal' }],
    desc: 'Пустое зернохранилище. Внутри молятся на мигающий экран.' }),

  // ================================================ Коррупция-Сити
  L({ id: 'cc-gate', name: 'Ворота Коррупция-Сити', region: 'corruption', kind: 'camp', pos: { x: 760, y: 200 }, // new
    entry: { faction: 'aiParty', check: { skills: ['deception', 'persuasion', 'hacking'], dc: 15 }, toll: 50, battle: 'w-cc-gate' },
    desc: 'Сканеры ID, очередь, Чистильщики. Мёртвым вход свободный.' }),
  L({ id: 'corruption-city', name: 'Коррупция-Сити: рынок', region: 'corruption', kind: 'town', pos: { x: 850, y: 160 },
    services: ['rest', 'trade', 'train', 'rumors', 'recruit'],
    npcs: ['announcer-rovnya', 'archivist-nine', 'telifon', 'dymka', 'boomerang'],
    terminal: { id: 'cc-terminal-1', state: 'ritual' },
    battles: [{ id: 'market-terminal', encounter: 'w-cc-terminal', once: true, when: 'terminal' }],
    desc: 'Торгуют всем, включая досье на вас. На площади мигает ритуальный терминал.' }),
  L({ id: 'cc-dead-streets', name: 'Улицы мёртвых', region: 'corruption', kind: 'wild', pos: { x: 900, y: 230 }, // new
    npcs: ['archon'],
    terminal: { id: 'cc-terminal-2', state: 'ritual' },
    battles: [{ id: 'dead-streets', encounter: 'w-cc-dead', once: false },
      { id: 'streets-terminal', encounter: 'w-cc-terminal', once: true, when: 'terminal' }],
    quests: ['sq-archon'],
    desc: 'Материализованные души бродят и вежливо здороваются. Некоторые — зубами.' }),
  L({ id: 'cc-carwash', name: 'Автомойка Алика', region: 'corruption', kind: 'town', pos: { x: 820, y: 90 }, // new
    services: ['trade'], npcs: ['alik'],
    quests: ['sq-alik'],
    desc: 'Сеть автомоек. Под ней — сеть кое-чего ещё.' }),
  L({ id: 'cc-duel-club', name: 'Подпольный дуэльный клуб', region: 'corruption', kind: 'town', pos: { x: 920, y: 120 }, // new
    services: ['train'], npcs: ['duel-master'],
    battles: [{ id: 'duel', encounter: 'w-cc-duel', once: false, when: 'quest' }],
    quests: ['sq-duel'],
    desc: 'Ставки, кровь, «Танец клинка» для тех, кто выжил.' }),
  L({ id: 'cc-temple', name: 'Храм Приговора', region: 'corruption', kind: 'terminal', pos: { x: 960, y: 200 }, // new
    terminal: { id: 'cc-terminal-3', state: 'ritual' },
    battles: [{ id: 'temple-terminal', encounter: 'w-cc-terminal', once: true, when: 'terminal' }],
    desc: 'Бывший суд. Культ оставил вывеску и поменял обвиняемого.' }),
  L({ id: 'cc-node', name: 'Главный узел', region: 'corruption', kind: 'boss', pos: { x: 950, y: 60 }, // new
    npcs: ['cyber-priest'],
    requires: { flag: 'cc-node-found' },
    battles: [{ id: 'finale', encounter: 'w-cc-finale', once: true, when: 'quest' }],
    desc: 'Сердце «Третьего исхода»: сюда стекаются души со всей сети.' }),
];

export const LOCATIONS = Object.fromEntries(LIST.map((l) => [l.id, l]));

/** Узел старта после пролога и узлы, открытые сразу. */
export const START_LOCATION = 'alpha-harmony';
export const START_DISCOVERED = ['alpha-harmony', 'harmony-reactor', 'harmony-sector-d', 'harmony-workshop', 'harmony-post', 'funicular'];

/** Точка возвращения души по умолчанию. */
export const DEFAULT_RESPAWN = 'harmony-reactor';

/**
 * Терминалы Киберспейса (world.md, п. 1). Действия на узле с terminal.state === 'ritual' после боя охраны:
 * break — сломать (state 'dead'); reflash — перепрошить (state 'ours'); leave — уйти.
 * advFlags — флаги, дающие преимущество; cultRep — изменение репутации культа.
 */
export const TERMINAL_ACTIONS = {
  break:   { name: 'Сломать', check: { skills: ['tech', 'athletics'], dc: 13 }, result: 'dead', cultRep: -5, xp: 100 },
  reflash: { name: 'Перепрошить', check: { skills: ['hacking', 'judge'], dc: 15 }, advFlags: ['terminal-touch', 'judge-code'],
    result: 'ours', cultRep: -10, xp: 150 },
  leave:   { name: 'Оставить', check: null, result: null, cultRep: 0, xp: 0 },
};

/** Терминалы, которые облегчают финал (ENCOUNTERS['w-cc-finale'].reduce): каждый не-ritual убирает одного врага. */
export const FINALE_TERMINALS = ['term-villages', 'term-agrozone', 'cc-terminal-1', 'cc-terminal-2', 'cc-terminal-3'];

/** Цены услуг (креды). level — уровень героя. */
export const SERVICE_PRICES = {
  rest: (level) => 10 * level,          // бесплатно при «дружелюбны» с фракцией узла
  revive: (level) => 50 * level,        // вернуть компаньона из Киберспейса; на Гармонии бесплатно при «дружелюбны» с техникумами
  toll: (base) => base,                 // пошлина на входе при «подозрительны»
};

/** Предметы v1.0 (минимум). price — базовая цена. */
export const ITEMS = {
  medkit: { id: 'medkit', name: 'Аптечка', price: 25, use: { heal: { dice: '2d4', bonus: 2, resource: 'hp' } }, desc: 'Вне боя: 2d4 + 2 ЗДР.' },
  calmers: { id: 'calmers', name: 'Успокоительное', price: 25, use: { heal: { dice: '2d4', bonus: 2, resource: 'mrl' } }, desc: 'Вне боя: 2d4 + 2 МРЛ.' },
  grenade: { id: 'grenade', name: 'Самодельная граната', price: 40, desc: 'На один бой: способность «Граната» (2d6 огня, радиус 1, спас ЛВК СЛ 12).' },
  rations: { id: 'rations', name: 'Ящик пайков', price: 50, desc: 'Квестовый предмет: еда для сектора D.' },
  'servo-parts': { id: 'servo-parts', name: 'Сервоприводы', price: 80, desc: 'Довоенные детали. Айнура и Никола обрадуются.' },
  'rare-parts': { id: 'rare-parts', name: 'Редкие детали', price: 120, desc: 'Нужны для «Оружейного тюнинга».' },
  'seed-bank': { id: 'seed-bank', name: 'Банка семян', price: 0, desc: 'Последние семена Агрозоны.' },
  'blank-chips': { id: 'blank-chips', name: 'Пустые ID-чипы', price: 0, desc: 'Квестовый предмет Лёвы.' },
  'alik-package': { id: 'alik-package', name: 'Посылка Алика', price: 0, contraband: true, desc: 'Не открывать. Не трясти. Не спрашивать.' },
  'soul-shard': { id: 'soul-shard', name: 'Осколок памяти', price: 0, desc: 'Чужая память, тёплая на ощупь.' },
  'oak-amulet': { id: 'oak-amulet', name: 'Дубовый амулет', price: 30, desc: 'Пиратская защита от Судьи. Эффективность не подтверждена. Совсем.' },
  // --- предметы ивентов партии (world/events.js)
  'dawn-schematic': { id: 'dawn-schematic', name: 'Схема проекта «Рассвет»', price: 0, key: true,
    world: [{ check: 'tech', bonus: 2 }],
    desc: 'Чертёж Куксиуса. Пока в рюкзаке — Технологии +2. Никола отдал бы за неё полмастерской.' },
  'lockpick-set': { id: 'lockpick-set', name: 'Набор отмычек Лизы', price: 60,
    world: [{ check: 'lockpicking', bonus: 2 }],
    desc: 'Чужие отмычки. Пока в рюкзаке — Взлом +2. Совесть −1 (не считается).' },
  'artyom-scope': { id: 'artyom-scope', name: 'Прицел Артёма', price: 100,
    passives: [{ id: 'item-artyom-scope', name: 'Прицел Артёма', desc: '+1 к атаке дальним оружием.', op: { hit: 1 } }],
    req: { weapon: 'ranged' },
    desc: 'Снайперский прицел. Стрелку (оружие с range > 1) — +1 к атаке; ближникам бесполезен.' },
};
// Предметы с world / passives работают, пока лежат в инвентаре героя (экипировки в v1 нет).
// passives предмета считаются как пассивки таланта, но НЕ занимают лимит боевых талантов (как примочки).
