// World data access point. Real data goes to game/src/data/world/*.js (designer), gadgets.js, text/npc-dialogue.js
// (writer). Until those files exist, this module holds a TEMPORARY STUB built from docs/specs/world.md (v1.0 regions)
// and docs/specs/talents.md (class gadgets). When a real file lands, import it here and drop the stub part —
// the rest of the code reads only the exports below.
import { NPCS } from '../data/npcs.js';

// ----------------------------------------------------------------------------- regions (stub, world.md §1)
export const REGIONS = {
  harmony: { id: 'harmony', name: 'Альфа-Гармония', faction: null, minorFaction: 'technikums', danger: 0, levels: [1, 1], encounters: [] },
  villages: {
    id: 'villages', name: 'Нейтральные селения', faction: 'neutralVillages', danger: 1, levels: [1, 2],
    encounters: [
      { w: 4, kind: 'battle', faction: 'cringegons', enemies: ['cringe-jester', 'cringe-jester'] },
      { w: 2, kind: 'battle', faction: null, enemies: ['crawler', 'crawler'] },
      { w: 2, kind: 'event', id: 'ev-lost-goat', text: 'На дороге мечется коза старейшины. Поймать?', check: { skill: 'survival', dc: 12 },
        success: { rep: { neutralVillages: 3 }, xp: 50, text: 'Коза поймана. Старейшины запомнят.' }, fail: { text: 'Коза убежала. Вместе с твоим достоинством.' } },
      { w: 1, kind: 'trader' },
      { w: 1, kind: 'rumor' },
    ],
  },
  agrozone: {
    id: 'agrozone', name: 'Агрозона', faction: 'agrozone', danger: 2, levels: [2, 3],
    encounters: [
      { w: 3, kind: 'battle', faction: 'scavengers', enemies: ['scavenger', 'scavenger', 'scavenger'] },
      { w: 3, kind: 'battle', faction: null, enemies: ['crawler', 'crawler', 'crawler'] },
      { w: 2, kind: 'battle', faction: 'cult', enemies: ['cultist', 'cultist-gunner'] },
      { w: 2, kind: 'event', id: 'ev-burning-cart', text: 'Горящая телега с пайками. Вытащить мешки из огня?', check: { skill: 'athletics', dc: 13 },
        success: { credits: 30, xp: 60, text: 'Пара мешков спасена. Продашь в бурге.' }, fail: { text: 'Обжёгся. Мешки — пепел.', damage: 4 } },
      { w: 1, kind: 'cache', loot: { credits: 25, items: { medkit: 1 } } },
    ],
  },
  corruption: {
    id: 'corruption', name: 'Коррупция-Сити', faction: 'aiParty', danger: 3, levels: [3, 5],
    encounters: [
      { w: 4, kind: 'battle', faction: 'cult', enemies: ['cultist', 'cultist', 'cultist-gunner', 'skrilet'] },
      { w: 2, kind: 'battle', faction: null, enemies: ['skrilet', 'skrilet'] },
      { w: 2, kind: 'event', id: 'ev-lost-soul', text: 'Материализованная душа просит вспомнить её имя.', check: { skill: 'meditation', dc: 14 },
        success: { xp: 80, rep: { cult: -3 }, text: 'Душа вспоминает и растворяется. Спокойно.' }, fail: { text: 'Душа плачет и уходит в стену.' } },
      { w: 1, kind: 'rumor' },
    ],
  },
};

// ----------------------------------------------------------------------------- locations (stub)
// npcLoc — location ids used by npcs.js (until locations.js lists `npcs` explicitly).
const L = (o) => ({ services: [], npcs: null, npcLoc: [], terminal: null, battles: [], caches: [], hidden: null, faction: undefined, ...o });
export const LOCATIONS = {
  'harmony-reactor': L({ id: 'harmony-reactor', name: 'Реактор Гармонии', region: 'harmony', pos: { x: 500, y: 40 }, kind: 'terminal',
    terminal: { id: 'term-harmony', state: 'ours' }, npcLoc: ['harmony-reactor'], npcIds: ['sera'], desc: 'Реактор захлёбывается, но держит. Сера сидит у терминала, который теперь «наш».' }),
  'harmony-workshop': L({ id: 'harmony-workshop', name: 'Мастерская Николы', region: 'harmony', pos: { x: 400, y: 80 }, kind: 'city',
    services: ['implant', 'trade'], npcIds: ['nikola'], desc: 'Протезы на стенах смотрят на тебя. Некоторые — с мнением.' }),
  'harmony-medbay': L({ id: 'harmony-medbay', name: 'Медпункт Парацетамола', region: 'harmony', pos: { x: 600, y: 80 }, kind: 'city',
    services: ['heal', 'rest'], npcIds: ['paracetamol'], desc: 'Койки, бинты и робот, который учится шутить.' }),
  'harmony-post': L({ id: 'harmony-post', name: 'Пост караула', region: 'harmony', pos: { x: 440, y: 140 }, kind: 'city',
    services: ['recruit'], npcLoc: ['alpha-harmony'], desc: 'Пост номер два. Журнал, чайник и Виктор.' }),
  'harmony-sector-d': L({ id: 'harmony-sector-d', name: 'Сектор D', region: 'harmony', pos: { x: 560, y: 140 }, kind: 'city',
    npcLoc: ['harmony-sector-d'], desc: 'Очередь за пайками длиннее, чем терпение.' }),
  'harmony-funicular': L({ id: 'harmony-funicular', name: 'Фуникулёр', region: 'harmony', pos: { x: 500, y: 190 }, kind: 'city',
    services: ['rumors'], npcLoc: ['funicular'], desc: 'Вагон скрипит. Внизу — пустоши и три дороги.' }),
  'cliff-foot': L({ id: 'cliff-foot', name: 'Подножие утёса', region: 'harmony', pos: { x: 500, y: 290 }, kind: 'camp',
    services: ['trade'], desc: 'Развилка: «к мёртвым», «к маякам» и «к огню». Придорожный торговец дремлет на ящике.' }),

  'galina-dacha': L({ id: 'galina-dacha', name: 'Дача Галины', region: 'villages', pos: { x: 320, y: 320 }, kind: 'camp',
    services: ['rest'], npcLoc: ['galina-dacha'], desc: 'Грядки, забор и подозрительно чистый люк.' }),
  'dacha-hatch': L({ id: 'dacha-hatch', name: 'Люк под дачей', region: 'villages', pos: { x: 250, y: 360 }, kind: 'cache',
    hidden: { check: { skill: 'perception', dc: 13 }, flags: ['find-cache', 'hidden-routes'] },
    battles: [{ id: 'hatch-nest', enemies: ['crawler', 'crawler', 'crawler'], once: true }],
    caches: [{ id: 'hatch-stash', check: { skill: 'perception', dc: 14 }, loot: { credits: 40, items: { medkit: 2 } } }],
    desc: 'Под дачей Галины — люк. Из люка пахнет.' }),
  'elders-village': L({ id: 'elders-village', name: 'Село совета', region: 'villages', pos: { x: 180, y: 420 }, kind: 'city',
    services: ['trade', 'rest', 'train'], npcLoc: ['neutral-villages'], desc: 'Совет старейшин заседает в бане. Так теплее.' }),
  'beacon-1': L({ id: 'beacon-1', name: 'Кринж-маяк I', region: 'villages', pos: { x: 70, y: 320 }, kind: 'terminal', faction: 'cringegons',
    npcLoc: ['cringe-border'], battles: [{ id: 'beacon-1-fight', enemies: ['cringe-jester', 'cringe-jester'], once: true, quest: 'mq-beacons' }],
    desc: 'Маяк транслирует шутки. Голуби падают замертво.' }),
  'beacon-2': L({ id: 'beacon-2', name: 'Кринж-маяк II', region: 'villages', pos: { x: 60, y: 470 }, kind: 'terminal', faction: 'cringegons',
    battles: [{ id: 'beacon-2-fight', enemies: ['cringe-jester', 'cringe-jester', 'crawler'], once: true, quest: 'mq-beacons' }], desc: 'Второй маяк. Шутки ещё хуже.' }),
  'beacon-3': L({ id: 'beacon-3', name: 'Кринж-маяк III', region: 'villages', pos: { x: 140, y: 560 }, kind: 'terminal', faction: 'cringegons',
    battles: [{ id: 'beacon-3-fight', enemies: ['cringe-jester', 'cringe-jester', 'cringe-jester'], once: true, quest: 'mq-beacons' }], desc: 'Третий маяк. Звучит смех без людей.' }),
  'villages-terminal': L({ id: 'villages-terminal', name: 'Заброшенная вышка', region: 'villages', pos: { x: 280, y: 520 }, kind: 'terminal',
    terminal: { id: 'term-villages', state: 'ritual' }, battles: [{ id: 'tower-cult', enemies: ['cultist', 'cultist-gunner'], once: true }],
    desc: 'На вышке гудит ритуальный терминал культа.' }),

  'burning-fields': L({ id: 'burning-fields', name: 'Горящие поля', region: 'agrozone', pos: { x: 480, y: 400 }, kind: 'camp',
    caches: [{ id: 'fields-stash', check: { skill: 'survival', dc: 13 }, loot: { credits: 30, items: { medkit: 1 } } }], hazard: 'fire',
    desc: 'Сорок процентов полей сгорело. Остальные горят прямо сейчас.' }),
  'burg-svoboda': L({ id: 'burg-svoboda', name: 'Бург «Свобода»', region: 'agrozone', pos: { x: 400, y: 490 }, kind: 'city', faction: 'renegades',
    services: ['trade', 'recruit', 'rest'], npcLoc: ['agrozone'], desc: 'Лагерь восставших. Знамя из мешка из-под зерна.' }),
  'burg-beton': L({ id: 'burg-beton', name: 'Бург «Бетон»', region: 'agrozone', pos: { x: 590, y: 490 }, kind: 'city', faction: 'agrozone',
    services: ['trade'], npcIds: ['overseer-norma', 'cleaner-protokol'], desc: 'Лоялисты. Склад пайков и табличка «Мутантам — блок».' }),
  'cleaner-checkpoint': L({ id: 'cleaner-checkpoint', name: 'Блокпост Чистильщиков', region: 'agrozone', pos: { x: 500, y: 560 }, kind: 'camp', faction: 'agrozone',
    battles: [{ id: 'checkpoint', enemies: ['scavenger', 'scavenger', 'cultist-gunner'], once: true }], desc: 'Шлагбаум и проверка документов.' }),
  'agro-terminal': L({ id: 'agro-terminal', name: 'Элеватор', region: 'agrozone', pos: { x: 650, y: 580 }, kind: 'terminal',
    terminal: { id: 'term-agrozone', state: 'ritual' }, battles: [{ id: 'elevator-cult', enemies: ['cultist', 'cultist', 'skrilet'], once: true }],
    desc: 'В элеваторе вместо зерна — терминал.' }),

  'cc-gate': L({ id: 'cc-gate', name: 'Ворота Коррупция-Сити', region: 'corruption', pos: { x: 720, y: 320 }, kind: 'city',
    services: ['trade'], npcLoc: ['corruption-city'], desc: 'Ворота, рынок и плакат «Подавим бунт 2008!».' }),
  'cc-dead-streets': L({ id: 'cc-dead-streets', name: 'Улицы мёртвых', region: 'corruption', pos: { x: 830, y: 350 }, kind: 'camp',
    battles: [{ id: 'dead-streets', enemies: ['skrilet', 'skrilet', 'cultist'], once: false }], desc: 'Души ходят по улицам, как живые. Почти.' }),
  'cc-carwash': L({ id: 'cc-carwash', name: 'Автомойка Алика', region: 'corruption', pos: { x: 760, y: 430 }, kind: 'city',
    services: ['trade', 'train'], npcIds: ['alik'], desc: 'Отмоем всё. Совсем всё.' }),
  'cc-duel-club': L({ id: 'cc-duel-club', name: 'Дуэльный клуб', region: 'corruption', pos: { x: 890, y: 440 }, kind: 'city',
    services: ['train'], npcIds: ['duel-master'], desc: 'Подпольный клуб. Ставки — на тебя.' }),
  'cc-terminal-1': L({ id: 'cc-terminal-1', name: 'Городской терминал', region: 'corruption', pos: { x: 920, y: 320 }, kind: 'terminal',
    terminal: { id: 'cc-terminal-1', state: 'ritual' }, battles: [{ id: 'cc-term-cult', enemies: ['cultist', 'cultist-gunner', 'skrilet'], once: true }],
    desc: 'Терминал мигает, как глаз.' }),
  'cc-node': L({ id: 'cc-node', name: 'Главный узел', region: 'corruption', pos: { x: 900, y: 560 }, kind: 'terminal',
    npcIds: ['cyber-priest'], battles: [{ id: 'cc-final', enemies: ['acolyte-5', 'cultist-5', 'cultist-gunner-5', 'skrilet-5'], once: true, quest: 'mq-exodus', boss: true }],
    desc: 'Сердце сети терминалов. Здесь готовят «Третий исход».' }),
};

export const ROUTES = [
  ['harmony-reactor', 'harmony-workshop', 0], ['harmony-reactor', 'harmony-medbay', 0], ['harmony-reactor', 'harmony-post', 0],
  ['harmony-reactor', 'harmony-sector-d', 0], ['harmony-post', 'harmony-funicular', 0], ['harmony-sector-d', 'harmony-funicular', 0],
  ['harmony-workshop', 'harmony-post', 0], ['harmony-medbay', 'harmony-sector-d', 0],
  ['harmony-funicular', 'cliff-foot', 1, 0],
  ['cliff-foot', 'galina-dacha', 1, 1], ['galina-dacha', 'dacha-hatch', 0, 0, true], ['galina-dacha', 'elders-village', 1, 1],
  ['elders-village', 'beacon-1', 1, 1], ['elders-village', 'beacon-2', 1, 1], ['beacon-2', 'beacon-3', 1, 1], ['elders-village', 'villages-terminal', 1, 1],
  ['cliff-foot', 'burning-fields', 1, 2], ['burning-fields', 'burg-svoboda', 1, 2], ['burning-fields', 'burg-beton', 1, 2],
  ['burg-svoboda', 'cleaner-checkpoint', 1, 2], ['burg-beton', 'cleaner-checkpoint', 1, 2], ['burg-beton', 'agro-terminal', 1, 2],
  ['cliff-foot', 'cc-gate', 2, 3], ['cc-gate', 'cc-dead-streets', 1, 3], ['cc-gate', 'cc-carwash', 1, 3], ['cc-carwash', 'cc-duel-club', 1, 3],
  ['cc-dead-streets', 'cc-terminal-1', 1, 3], ['cc-duel-club', 'cc-node', 1, 4], ['cc-dead-streets', 'cc-node', 2, 4],
].map(([from, to, days, danger, hidden]) => ({ from, to, days, danger: danger ?? 0, hidden: !!hidden }));

// ----------------------------------------------------------------------------- quests (stub, world.md §5)
export const QUESTS = {
  'mq-exodus': {
    id: 'mq-exodus', name: 'Третий исход', type: 'mixed', key: true, giver: 'sera', region: 'corruption', level: 3,
    desc: 'Найти главный узел культа в Коррупция-Сити и сорвать «Третий исход».',
    stages: [
      { id: 'go', text: 'Дойти до главного узла в Коррупция-Сити.', goal: { kind: 'reach', location: 'cc-node' }, next: 'fight' },
      { id: 'fight', text: 'Сорвать ритуал у главного узла.', goal: { kind: 'battle', location: 'cc-node', battle: 'cc-final' }, next: 'report' },
      { id: 'report', text: 'Вернуться к Сере на Реактор Гармонии.', goal: { kind: 'talk', npc: 'sera' }, end: 'done' },
    ],
    rewards: { xp: 1000, credits: 300, rep: { technikums: 20, cult: -20 }, flags: ['exodus-stopped'] },
  },
  'mq-beacons': {
    id: 'mq-beacons', name: 'Кринж-маяки', type: 'combat', key: true, giver: 'elder-ulyana', region: 'villages', level: 1,
    desc: 'Погасить три кринж-маяка на границе селений.',
    stages: [
      { id: 'b1', text: 'Погасить маяк I (бой или проверка Технологий СЛ 13).', goal: { kind: 'battle', location: 'beacon-1', battle: 'beacon-1-fight', alt: { skill: 'tech', dc: 13 } }, next: 'b2' },
      { id: 'b2', text: 'Погасить маяк II (бой или проверка Хакинга СЛ 14).', goal: { kind: 'battle', location: 'beacon-2', battle: 'beacon-2-fight', alt: { skill: 'hacking', dc: 14 } }, next: 'b3' },
      { id: 'b3', text: 'Погасить маяк III (бой или проверка Религии СЛ 15).', goal: { kind: 'battle', location: 'beacon-3', battle: 'beacon-3-fight', alt: { skill: 'religion', dc: 15 } }, next: 'report' },
      { id: 'report', text: 'Рассказать старейшине Ульяне.', goal: { kind: 'talk', npc: 'elder-ulyana' }, end: 'done' },
    ],
    rewards: { xp: 600, credits: 120, rep: { neutralVillages: 20, pirates: 5 }, flags: ['beacons-off'] },
  },
  'mq-agro-fire': {
    id: 'mq-agro-fire', name: 'Агрозона в огне', type: 'mixed', key: true, giver: 'amanda', region: 'agrozone', level: 2,
    desc: 'Пайки для Гармонии застряли в Агрозоне, где идёт гражданская война.',
    stages: [
      { id: 'go', text: 'Дойти до бурга «Свобода».', goal: { kind: 'reach', location: 'burg-svoboda' }, next: 'choose' },
      { id: 'choose', text: 'Решить судьбу Агрозоны.', goal: { kind: 'choice', location: 'burg-svoboda', options: [
        { id: 'marta', text: 'За Марту: прорвать блокпост Чистильщиков.', battle: { enemies: ['scavenger', 'scavenger', 'cultist-gunner'] },
          deeds: ['free-slaves'], rep: { renegades: 20 }, next: 'rations' },
        { id: 'order', text: 'За порядок: разогнать лагерь восставших.', battle: { enemies: ['scavenger', 'scavenger', 'scavenger'] },
          deeds: ['serve-ai'], rep: { agrozone: 20 }, next: 'rations' },
        { id: 'truce', text: 'Перемирие: переговоры (5 успехов до 3 провалов, СЛ 16).',
          challenge: { skills: ['persuasion', 'intimidation', 'military', 'deception'], dc: 16, successes: 5, failures: 3 },
          deeds: ['mercy'], rep: { neutralVillages: 10 }, onFail: 'marta', next: 'rations' },
      ] }, next: 'rations' },
      { id: 'rations', text: 'Сообщить Аманде, что пайки в пути.', goal: { kind: 'talk', npc: 'amanda' }, end: 'done' },
    ],
    rewards: { xp: 600, credits: 150, rep: { technikums: 10 }, flags: ['rations-delivered'] },
  },
  'sq-rations-riot': {
    id: 'sq-rations-riot', name: 'Очередь за пайками', type: 'talk', key: false, giver: 'riot-boss', region: 'harmony', level: 1,
    desc: 'Бунт в секторе D: уговорить толпу разойтись до драки.',
    stages: [
      { id: 'talk', text: 'Успокоить очередь (3 успеха до 2 провалов, СЛ 12).', goal: { kind: 'challenge', location: 'harmony-sector-d',
        challenge: { skills: ['persuasion', 'intimidation', 'deception'], dc: 12, successes: 3, failures: 2 },
        onFail: { battle: { enemies: ['scavenger', 'scavenger'] }, rep: { technikums: -5 } }, deeds: ['help-weak'] }, end: 'done' },
    ],
    rewards: { xp: 150, credits: 40, rep: { technikums: 5 } },
  },
};

// ----------------------------------------------------------------------------- class specialisations (world.md §5)
export const CLASS_SKILLS = {
  zabivnoy: { spec: ['athletics', 'intimidation', 'military'], related: ['endurance', 'survival', 'perception'] },
  technomant: { spec: ['tech', 'hacking', 'analysis'], related: ['judge', 'religion', 'medicine'] },
  mutant: { spec: ['athletics', 'survival', 'endurance'], related: ['intimidation', 'biology', 'perception'] },
  itishnik: { spec: ['tech', 'lockpicking', 'analysis'], related: ['hacking', 'medicine', 'military'] },
  ranger: { spec: ['survival', 'perception', 'stealth'], related: ['athletics', 'biology', 'military'] },
  arbiter: { spec: ['persuasion', 'intimidation', 'religion'], related: ['medicine', 'military', 'endurance'] },
  ugolovnik: { spec: ['stealth', 'lockpicking', 'deception'], related: ['hacking', 'acrobatics', 'perception'] },
  ecolog: { spec: ['biology', 'survival', 'medicine'], related: ['proxy', 'meditation', 'perception'] },
  reper: { spec: ['persuasion', 'deception', 'intimidation'], related: ['acrobatics', 'analysis', 'meditation'] },
  slavotech: { spec: ['proxy', 'medicine', 'meditation'], related: ['religion', 'tech', 'biology'] },
  cybertech: { spec: ['judge', 'hacking', 'religion'], related: ['analysis', 'meditation', 'deception'] },
};

// ----------------------------------------------------------------------------- class gadgets (talents.md, world effects only)
export const GADGETS = {
  zabivnoy: { name: 'Арматура с изолентой', desc: 'Атлетика: выбить дверь или завал без проверки раз за узел.', world: [{ check: 'athletics', bonus: 1 }] },
  technomant: { name: 'Самопальный дека-браслет', desc: 'Терминалы: Хакинг +2; видит состояние терминала издали.', world: [{ check: 'hacking', bonus: 2 }] },
  mutant: { name: 'Банка с «Химерой»', desc: 'Событие мутации по желанию на отдыхе (риск дебаффа).', world: [] },
  itishnik: { name: 'Мультитул из хлама', desc: 'Крафт аптечки на отдыхе.', world: [{ worldFlag: 'free-medkit' }] },
  ranger: { name: 'Кибер-кошка', desc: 'Разведка соседнего узла: состав боя виден до входа.', world: [{ check: 'perception', bonus: 1 }] },
  arbiter: { name: 'Жетон Арбитра', desc: 'В поселениях «подозрительны» считаются «нейтральны» для входа.', world: [{ worldFlag: 'arbiter-badge' }] },
  ugolovnik: { name: 'Отмычка-глушилка', desc: 'Одна тихая отмычка за отдых (автоуспех Взлома).', world: [{ check: 'lockpicking', bonus: 2 }] },
  ecolog: { name: 'Гербарий', desc: 'Биология +2, лечебные травы на привале.', world: [{ check: 'biology', bonus: 2 }] },
  reper: { name: 'Микрофон', desc: 'Выступление в поселении: креды и +3 репутации раз за визит (Убеждение).', world: [{ worldFlag: 'perform' }] },
  slavotech: { name: 'Оберег Старого бога', desc: 'Партия защищена от прокси-бурь.', world: [] },
  cybertech: { name: 'Флешка с кодом Судьи', desc: 'Перепрошивка терминалов культа с преимуществом; побег из Киберспейса +2.', world: [{ check: 'judge', adv: true }] },
};

// ----------------------------------------------------------------------------- shop stock (stub)
export const ITEMS = {
  medkit: { name: 'Аптечка', price: 20, desc: 'Вне боя: +10 ЗДР одному члену партии.', heal: { hp: 10 } },
  stim: { name: 'Антистресс', price: 20, desc: 'Вне боя: +10 МРЛ одному члену партии.', heal: { mrl: 10 } },
  amulet: { name: 'Дубовый амулет', price: 30, desc: 'Ничего не делает. Зато дубовый.' },
};
export const SHOP_STOCK = ['medkit', 'stim', 'amulet'];

// ----------------------------------------------------------------------------- NPC placement & dialogue (stub)
const NPC_LOC_ALIAS = {};
for (const l of Object.values(LOCATIONS)) for (const a of l.npcLoc) NPC_LOC_ALIAS[a] = NPC_LOC_ALIAS[a] || l.id;
const PINNED = {};
for (const l of Object.values(LOCATIONS)) for (const id of l.npcIds || []) PINNED[id] = l.id;

/** NPC ids present on a world location (explicit `npcs`, else pinned ids + npcs.js `location` aliases). */
export function npcsAt(locId) {
  const loc = LOCATIONS[locId];
  if (!loc) return [];
  if (Array.isArray(loc.npcs)) return loc.npcs.filter((id) => NPCS[id]);
  const out = [];
  for (const n of Object.values(NPCS)) {
    if (n.cameo || n.race === 'deity') continue;
    const where = PINNED[n.id] || NPC_LOC_ALIAS[n.location];
    if (where === locId) out.push(n.id);
  }
  return out;
}

/** Talk lines for an NPC by reputation tier (stub: bark + hook; real lines — text/npc-dialogue.js). */
export function npcLines(npc, tier) {
  const lines = [];
  if (tier === 'hostile') return [{ who: npc.id, name: npc.name, text: '…Проваливай, пока цел.' }];
  if (npc.bark) lines.push({ who: npc.id, name: npc.name, text: npc.bark });
  if (npc.hook && tier !== 'suspicious') lines.push({ who: npc.id, name: npc.name, text: npc.hook });
  if (!lines.length) lines.push({ who: npc.id, name: npc.name, text: '…' });
  return lines;
}

/** Trainer keys → NPC ids (talents.js source.trainer may be a faction, an NPC role or a place). */
export const TRAINER_ALIAS = { 'duel-club': ['duel-master'], underground: ['alik'], radio: ['announcer-rovnya'] };
export const FACTION_ALIAS = { tekhnikumy: 'technikums' };
